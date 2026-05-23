// ═══════════════════════════════════════════════════════
//  POSH — Firebase Auth  (firebase-auth.js)
//  ▸ Shop Owner : Google  or  Email/Password sign-in
//  ▸ Staff      : shop code + name + PIN  (no account needed)
//  Load AFTER firebase.js and BEFORE staff.js
// ═══════════════════════════════════════════════════════

import { getApp } from
  "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut as fbSignOut
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// BUG FIX: _authMode must be initialised here so _authBusy() always has a
// valid value even if firebase-auth.js loads before staff.js sets it.
window._authMode = window._authMode || 'signin';

// ── Wait for firebase.js to signal it has initialised ─────────
function _boot () {
  const auth = getAuth(getApp());
  window._poshAuth = auth;

  // ── Persist auth state across page refreshes ──────────────
  onAuthStateChanged(auth, function (user) {
    window.poshOwnerUser = user || null;

    // If entry screen is open & owner panel is visible → advance
    // BUG FIX: guard with _poshAuthAdvanced to prevent double-firing on page load
    const entryEl = document.getElementById('entry-screen');
    const ownerPanel = document.getElementById('entry-owner-auth');
    if (
      user &&
      !window._poshAuthAdvanced &&
      entryEl  && entryEl.style.display  !== 'none' &&
      ownerPanel && ownerPanel.style.display !== 'none'
    ) {
      window._poshAuthAdvanced = true;
      _handleOwnerSignIn(user);
    }
  });

  // ── Google Sign-In ────────────────────────────────────────
  window.ownerSignInGoogle = async function () {
    _authBusy(true);
    try {
      const res = await signInWithPopup(auth, new GoogleAuthProvider());
      _handleOwnerSignIn(res.user);
    } catch (e) {
      _authBusy(false);
      if (e.code !== 'auth/popup-closed-by-user') {
        _authError(e.code === 'auth/network-request-failed'
          ? 'No internet connection'
          : 'Google sign-in failed — ' + e.message);
      }
    }
  };

  // ── Email sign-up or sign-in ──────────────────────────────
  window.ownerEmailAuth = async function (isSignup) {
    const email = (_gv('auth-email') || '').trim();
    const pass  = (_gv('auth-pass')  || '').trim();
    if (!email || !pass) { _authError('Enter your email and password'); return; }
    if (isSignup && pass.length < 6) { _authError('Password must be at least 6 characters'); return; }
    _authBusy(true);
    try {
      const fn  = isSignup
        ? createUserWithEmailAndPassword
        : signInWithEmailAndPassword;
      const res = await fn(auth, email, pass);
      _handleOwnerSignIn(res.user);
    } catch (e) {
      _authBusy(false);
      const MAP = {
        'auth/email-already-in-use' : 'Email already registered — try Sign In instead',
        'auth/invalid-credential'   : 'Wrong email or password',
        'auth/invalid-email'        : 'Invalid email address',
        'auth/weak-password'        : 'Password too weak — use 6+ characters',
        'auth/user-not-found'       : 'No account with that email',
        'auth/wrong-password'       : 'Wrong password'
      };
      _authError(MAP[e.code] || e.message);
    }
  };

  // ── Sign out ──────────────────────────────────────────────
  window.ownerSignOut = async function () {
    await fbSignOut(auth).catch(() => {});
    window.poshOwnerUser = null;
    window._poshAuthAdvanced = false; // BUG FIX: reset so re-login auto-advance works
    localStorage.removeItem('posh_role_choice');
    // BUG FIX: clear posh_owner_uid so next page load doesn't skip the entry
    // screen and bypass auth — previously any user on the same device could
    // reach the PIN screen without signing in again after a sign-out.
    localStorage.removeItem('posh_owner_uid');
    if (typeof lockApp         === 'function') lockApp();
    if (typeof showEntryScreen === 'function') showEntryScreen();
  };

  window.dispatchEvent(new Event('firebaseAuthReady'));
  console.log('POSH Firebase Auth ready ✅');
}

// Boot after firebase.js is ready
if (typeof window._poshFirebaseBooted !== 'undefined') {
  _boot();
} else {
  window.addEventListener('firebaseReady', _boot, { once: true });
}

// ─── After successful owner sign-in ───────────────────────────
function _handleOwnerSignIn (user) {
  _authBusy(false);
  window.poshOwnerUser = user;
  localStorage.setItem('posh_owner_uid', user.uid);
  // Let staff.js advance the UI
  if (typeof advanceOwnerAfterAuth === 'function') {
    advanceOwnerAfterAuth(user);
  }
}

// ─── UI helpers ───────────────────────────────────────────────
function _authBusy (on) {
  ['auth-google-btn', 'auth-submit-btn'].forEach(function (id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.disabled = on;
    if (id === 'auth-submit-btn' && !on) {
      el.textContent = window._authMode === 'signup' ? 'Create Account' : 'Sign In';
    } else if (id === 'auth-submit-btn' && on) {
      el.textContent = '⏳ Please wait…';
    }
  });
  const sp = document.getElementById('auth-spinner');
  if (sp) sp.style.display = on ? 'flex' : 'none';
}

function _authError (msg) {
  const el = document.getElementById('auth-error');
  if (el) { el.textContent = '⚠️ ' + msg; el.style.display = 'block'; }
}

function _gv (id) {
  const el = document.getElementById(id);
  return el ? el.value : '';
}
