// ═══════════════════════════════════════════════════════
//  POSH — Staff Accounts & Entry Screen  (staff.js)
//  ▸ Entry screen: "Shop Owner" vs "Staff Member"
//  ▸ Staff login: shop code + name + 4-digit PIN
//  ▸ Multi-staff accounts management (admin panel)
//  ▸ Shop code generation & sharing
//  Load AFTER app.js, quickwins.js, firebase.js, firebase-auth.js
//  Load BEFORE barcode.js and features.js
// ═══════════════════════════════════════════════════════

;(function (window) {
  'use strict';

  // ─── State ────────────────────────────────────────────
  window.staffAccounts    = window.staffAccounts    || [];
  window.currentStaffName = window.currentStaffName || '';
  window._authMode        = 'signin';
  let _staffEditId        = null;

  // ─── DOM shortcut ─────────────────────────────────────
  const $  = id  => document.getElementById(id);
  const $v = id  => { const e = $(id); return e ? e.value : ''; };
  const esc = s  =>
    String(s || '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  // ═══════════════════════════════════════════════════════
  //  SHOP CODE
  // ═══════════════════════════════════════════════════════
  function _genCode () {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let c = '';
    for (let i = 0; i < 6; i++) c += chars[Math.floor(Math.random() * chars.length)];
    return c;
  }
  window.getShopCode = function () {
    let code = localStorage.getItem('posh_shop_code');
    if (!code) { code = _genCode(); localStorage.setItem('posh_shop_code', code); }
    return code;
  };
  window.copyShopCode = function () {
    const code = window.getShopCode();
    if (navigator.clipboard) {
      navigator.clipboard.writeText(code)
        .then(() => { if (typeof toast === 'function') toast('📋 Shop code copied: ' + code); })
        .catch(() => { if (typeof toast === 'function') toast('Shop code: ' + code); });
    } else {
      if (typeof toast === 'function') toast('Shop code: ' + code);
    }
  };

  // ═══════════════════════════════════════════════════════
  //  ENTRY SCREEN — "Who are you?"
  // ═══════════════════════════════════════════════════════
  window.showEntryScreen = function () {
    const el = $('entry-screen');
    if (el) el.style.display = 'flex';
    ['pin-screen', 'app', 'onboarding-modal'].forEach(function (id) {
      const e = $(id);
      if (e) e.style.display = 'none';
    });
    _showPanel('entry-choice');
  };
  window.hideEntryScreen = function () {
    const el = $('entry-screen');
    if (el) el.style.display = 'none';
  };

  function _showPanel (panelId) {
    ['entry-choice', 'entry-owner-auth', 'entry-staff-login'].forEach(function (id) {
      const el = $(id);
      if (el) el.style.display = (id === panelId) ? 'flex' : 'none';
    });
  }

  // ── "I'm the Shop Owner" ──────────────────────────────
  window.chooseOwner = function () {
    localStorage.setItem('posh_role_choice', 'owner');
    window._entryRoleChoice = 'owner';
    // If already authenticated, skip auth panel
    if (window.poshOwnerUser) {
      advanceOwnerAfterAuth(window.poshOwnerUser);
      return;
    }
    _showPanel('entry-owner-auth');
    window._authMode = 'signin';
    _syncAuthUI();
  };

  // ── "I'm a Staff Member" ──────────────────────────────
  window.chooseStaff = function () {
    window._entryRoleChoice = 'staff';
    _showPanel('entry-staff-login');
    // Pre-fill shop code if previously used on this device
    const cached = localStorage.getItem('posh_staff_shop_code');
    const codeEl = $('sl-shop-code');
    if (codeEl && cached) codeEl.value = cached;
    // Clear errors
    const errEl = $('sl-error');
    if (errEl) errEl.style.display = 'none';
  };

  // Back button (owner auth or staff login → choice)
  window.entryBack = function () { _showPanel('entry-choice'); };

  // ─── Auth tab toggle (sign-in ↔ sign-up) ─────────────
  window.switchAuthTab = function (mode) {
    window._authMode = mode;
    _syncAuthUI();
  };
  function _syncAuthUI () {
    const signup     = window._authMode === 'signup';
    const titleEl    = $('auth-title');
    const submitEl   = $('auth-submit-btn');
    const switchEl   = $('auth-switch-hint');
    const errEl      = $('auth-error');
    const tabSignin  = $('auth-tab-signin');
    const tabSignup  = $('auth-tab-signup');
    if (titleEl)  titleEl.textContent  = signup ? 'Create Owner Account' : 'Welcome Back';
    if (submitEl) submitEl.textContent = signup ? 'Create Account' : 'Sign In';
    if (switchEl) switchEl.innerHTML   = signup
      ? 'Already have an account? <button class="link-btn" onclick="switchAuthTab(\'signin\')">Sign In</button>'
      : 'New shop? <button class="link-btn" onclick="switchAuthTab(\'signup\')">Create Account</button>';
    if (errEl) { errEl.textContent = ''; errEl.style.display = 'none'; }
    if (tabSignin) tabSignin.classList.toggle('active', !signup);
    if (tabSignup) tabSignup.classList.toggle('active',  signup);
  }
  window.submitOwnerAuth = function () {
    if (typeof ownerEmailAuth === 'function')
      ownerEmailAuth(window._authMode === 'signup');
  };

  // ─── After Firebase Auth success: advance to app ──────
  window.advanceOwnerAfterAuth = function (user) {
    hideEntryScreen();
    const onboarded = localStorage.getItem('posh_onboarded') === 'true';
    if (!onboarded && typeof showOnboarding === 'function') {
      const pin = $('pin-screen');
      if (pin) pin.style.display = 'none';
      showOnboarding();
    } else {
      const pin = $('pin-screen');
      if (pin) { pin.style.display = 'flex'; }
      const hint = $('pin-hint');
      if (hint) hint.textContent = 'Enter your Admin PIN';
    }
  };

  // ═══════════════════════════════════════════════════════
  //  STAFF LOGIN
  // ═══════════════════════════════════════════════════════
  window.staffLogin = function () {
    const code = ($v('sl-shop-code') || '').trim().toUpperCase();
    const name = ($v('sl-name')      || '').trim();
    const pin  = ($v('sl-pin')       || '').trim();
    const errEl = $('sl-error');
    const btn   = $('sl-submit-btn');

    const slErr = function (msg) {
      if (errEl) { errEl.textContent = '⚠️ ' + msg; errEl.style.display = 'block'; }
    };
    if (errEl) errEl.style.display = 'none';
    if (!code) { slErr('Enter the 6-letter shop code from your employer'); return; }
    if (!name) { slErr('Enter your name exactly as your employer registered it'); return; }
    if (!pin)  { slErr('Enter your 4-digit PIN'); return; }
    if (!/^\d{4}$/.test(pin)) { slErr('PIN must be 4 digits'); return; }

    // Try local data (offline mode — same shop code already loaded)
    const localCode = (localStorage.getItem('posh_shop_code') || '').toUpperCase();
    if (localCode && localCode === code) {
      _verifyStaffPin(name, pin, code);
      return;
    }

    // Online: fetch shop data from Firebase using the shop code
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Connecting…'; }

    if (typeof cloudLoadByCode === 'function') {
      cloudLoadByCode(code, function (data, err) {
        if (btn) { btn.disabled = false; btn.textContent = 'Login as Staff →'; }
        if (err === 'not_found' || !data) {
          slErr('Shop code "' + code + '" not found. Check with your employer.'); return;
        }
        if (err) { slErr('Connection failed. Check your internet and try again.'); return; }
        // Apply shop data locally
        if (data.staffAccounts) window.staffAccounts = data.staffAccounts;
        if (data.shopName)  window.shopName  = data.shopName;
        if (data.staffPin)  window.staffPin  = data.staffPin;
        if (data.products)  window.products  = data.products;
        if (data.adminPin)  window.adminPin  = data.adminPin;
        if (data.dailyGoal) window.dailyGoal = data.dailyGoal;
        // Cache staff shop code so offline works next time
        localStorage.setItem('posh_staff_shop_code', code);
        localStorage.setItem('posh_onboarded', 'true');
        // Cache the full shop data for offline
        try { localStorage.setItem('posh_data', JSON.stringify(Object.assign({}, data, { shopCode: code }))); } catch (e) {}
        _verifyStaffPin(name, pin, code);
      });
    } else {
      // Firebase not ready — try local anyway
      if (btn) { btn.disabled = false; btn.textContent = 'Login as Staff →'; }
      slErr('Cannot connect right now. If you\'ve logged in before, try again. Otherwise check your internet.');
    }
  };

  function _verifyStaffPin (name, pin, shopCode) {
    const accounts = window.staffAccounts || [];
    // Match against individual staff accounts first
    const match = accounts.find(function (a) {
      return a.active !== false &&
             a.name.trim().toLowerCase() === name.trim().toLowerCase() &&
             a.pin === pin;
    });
    if (match) { _unlockAsStaff(match.name, shopCode); return; }
    // Fallback: global staffPin — only allowed when owner hasn't set up named accounts yet.
    // BUG FIX: previously any name + global PIN was accepted, allowing impersonation.
    if (accounts.length === 0 && pin === window.staffPin) { _unlockAsStaff(name, shopCode); return; }
    // Fail
    const errEl = $('sl-error');
    if (errEl) {
      errEl.textContent = '⚠️ Name or PIN is incorrect. Double-check with your employer.';
      errEl.style.display = 'block';
    }
  }

  function _unlockAsStaff (name, shopCode) {
    window.currentRole      = 'staff';
    window.currentStaffName = name;
    localStorage.setItem('posh_staff_name',      name);
    localStorage.setItem('posh_role_choice',     'staff');
    if (shopCode) localStorage.setItem('posh_staff_shop_code', shopCode);
    hideEntryScreen();
    if (typeof unlockApp        === 'function') unlockApp();
    if (typeof applyRoleAccess  === 'function') applyRoleAccess();
    // Show staff name in sidebar badge
    const badge = $('sb-role-badge');
    if (badge) { badge.textContent = '👤 ' + name + ' — Staff'; }
    if (typeof toast === 'function') toast('👋 Welcome back, ' + name + '!');
  }

  // ═══════════════════════════════════════════════════════
  //  STAFF ACCOUNTS — Management (Admin only)
  // ═══════════════════════════════════════════════════════

  // Override the stub from quickwins.js
  window.openStaffAccounts = window.openStaffModal = function () {
    if (typeof currentRole !== 'undefined' && currentRole !== 'admin') {
      if (typeof toast === 'function') toast('⛔ Admin access required');
      return;
    }
    renderStaffList();
    _showStaffPanel('staff-list-panel');
    const el = $('staff-modal');
    if (el) el.classList.add('open');
    const ov = $('staff-ov');
    if (ov) ov.classList.add('show');
  };
  window.closeStaffAccounts = window.closeStaffModal = function () {
    const el = $('staff-modal');
    if (el) el.classList.remove('open');
    const ov = $('staff-ov');
    if (ov) ov.classList.remove('show');
  };
  window.openAddStaffModal = function () {
    _staffEditId = null;
    const t = $('staff-form-title');
    if (t) t.textContent = '+ Add Staff Member';
    ['staff-form-name','staff-form-pin','staff-form-pin2'].forEach(function (id) {
      const el = $(id); if (el) el.value = '';
    });
    const errEl = $('staff-form-error');
    if (errEl) errEl.style.display = 'none';
    _showStaffPanel('staff-form-panel');
  };
  window.editStaff = function (id) {
    const a = (window.staffAccounts || []).find(function (x) { return x.id === id; });
    if (!a) return;
    _staffEditId = id;
    const t = $('staff-form-title');
    if (t) t.textContent = '✏️ Edit — ' + a.name;
    const nameEl = $('staff-form-name'); if (nameEl) nameEl.value = a.name;
    const pinEl  = $('staff-form-pin');  if (pinEl)  pinEl.value  = a.pin;
    const pin2El = $('staff-form-pin2'); if (pin2El) pin2El.value = a.pin;
    const errEl  = $('staff-form-error');
    if (errEl) errEl.style.display = 'none';
    _showStaffPanel('staff-form-panel');
  };
  window.saveStaff = function () {
    const name = ($v('staff-form-name') || '').trim();
    const pin  = ($v('staff-form-pin')  || '').trim();
    const pin2 = ($v('staff-form-pin2') || '').trim();
    const errEl = $('staff-form-error');
    const sfErr = function (m) {
      if (errEl) { errEl.textContent = '⚠️ ' + m; errEl.style.display = 'block'; }
    };
    if (errEl) errEl.style.display = 'none';
    if (!name) { sfErr('Enter the staff member\'s name'); return; }
    if (!/^\d{4}$/.test(pin)) { sfErr('PIN must be exactly 4 digits'); return; }
    if (pin !== pin2) { sfErr('PINs do not match'); return; }
    if (pin === window.adminPin) { sfErr('Staff PIN cannot be the same as Admin PIN'); return; }

    const accounts = window.staffAccounts || [];
    // Prevent duplicate names (different from edit target)
    const dupe = accounts.find(function (a) {
      return a.id !== _staffEditId &&
             a.name.trim().toLowerCase() === name.toLowerCase();
    });
    if (dupe) { sfErr('A staff member named "' + dupe.name + '" already exists'); return; }

    if (_staffEditId === null) {
      const nextId = accounts.length
        ? Math.max.apply(null, accounts.map(function(a){return a.id;})) + 1
        : 1;
      accounts.push({
        id: nextId, name: name, pin: pin,
        active: true, createdAt: new Date().toISOString()
      });
    } else {
      const idx = accounts.findIndex(function (a) { return a.id === _staffEditId; });
      if (idx >= 0) {
        accounts[idx].name = name;
        accounts[idx].pin  = pin;
      }
    }
    window.staffAccounts = accounts;
    if (typeof saveData === 'function') saveData();
    _showStaffPanel('staff-list-panel');
    renderStaffList();
    if (typeof toast === 'function')
      toast('✅ Staff ' + (_staffEditId === null ? 'added' : 'updated') + ': ' + name);
  };
  window.deleteStaff = function (id) {
    const a = (window.staffAccounts || []).find(function (x) { return x.id === id; });
    if (!a) return;
    if (typeof showConfirm === 'function') {
      showConfirm(
        '🗑 Remove ' + a.name,
        a.name + ' will no longer be able to log in as staff.',
        function () {
          window.staffAccounts = (window.staffAccounts || []).filter(function (x) { return x.id !== id; });
          if (typeof saveData === 'function') saveData();
          renderStaffList();
          if (typeof toast === 'function') toast('Staff member removed');
        },
        true
      );
    }
  };
  window.toggleStaffActive = function (id) {
    const accounts = window.staffAccounts || [];
    const a = accounts.find(function (x) { return x.id === id; });
    if (!a) return;
    a.active = !a.active;
    window.staffAccounts = accounts;
    if (typeof saveData === 'function') saveData();
    renderStaffList();
    if (typeof toast === 'function') toast(a.active ? '✅ ' + a.name + ' activated' : '⏸ ' + a.name + ' deactivated');
  };
  window.cancelStaffForm = function () { _showStaffPanel('staff-list-panel'); };

  window.renderStaffList = function () {
    const listEl   = $('staff-accounts-list');
    const codeDisp = $('staff-shop-code-display');
    if (codeDisp) codeDisp.textContent = window.getShopCode();
    if (!listEl) return;
    const accounts = window.staffAccounts || [];
    if (!accounts.length) {
      listEl.innerHTML = '<div style="text-align:center;padding:28px 16px;color:var(--muted);font-size:13px;line-height:1.6">' +
        '<div style="font-size:36px;margin-bottom:8px">👥</div>' +
        'No staff added yet.<br>Tap <strong>+ Add Staff</strong> to get started.' +
        '</div>';
      return;
    }
    listEl.innerHTML = accounts.map(function (a) {
      const initials = a.name.split(' ').map(function(w){return w[0]||'';}).slice(0,2).join('').toUpperCase();
      const statusDot = a.active !== false
        ? '<span style="color:var(--primary);font-size:10px;font-weight:700">● Active</span>'
        : '<span style="color:var(--muted);font-size:10px;font-weight:700">● Inactive</span>';
      return '<div class="staff-card">' +
        '<div class="staff-card-avatar" style="background:var(--acc);color:var(--surf);width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;flex-shrink:0">' + esc(initials) + '</div>' +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-size:13px;font-weight:800;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(a.name) + '</div>' +
          '<div style="font-size:11px;color:var(--muted);margin-top:2px;display:flex;gap:8px;align-items:center">' +
            'PIN: ••••&nbsp;' + statusDot +
          '</div>' +
        '</div>' +
        '<div style="display:flex;gap:5px;flex-shrink:0">' +
          '<button class="btn btn-secondary" style="padding:5px 9px;font-size:11px;min-width:0" onclick="toggleStaffActive(' + a.id + ')" title="' + (a.active!==false?'Deactivate':'Activate') + '">' + (a.active!==false?'⏸':'✅') + '</button>' +
          '<button class="btn btn-secondary" style="padding:5px 9px;font-size:11px;min-width:0" onclick="editStaff(' + a.id + ')">✏️</button>' +
          '<button style="padding:5px 9px;font-size:11px;border:1.5px solid var(--red,#dc3232);background:rgba(220,50,50,.1);color:var(--red,#dc3232);border-radius:8px;cursor:pointer;min-width:0" onclick="deleteStaff(' + a.id + ')">🗑</button>' +
        '</div>' +
      '</div>';
    }).join('');
  };

  function _showStaffPanel (panel) {
    ['staff-list-panel','staff-form-panel'].forEach(function (id) {
      const el = $(id);
      if (el) el.style.display = (id === panel) ? 'block' : 'none';
    });
  }

  // ═══════════════════════════════════════════════════════
  //  PATCH: saveData / loadData to persist staffAccounts
  // ═══════════════════════════════════════════════════════
  (function patchPersistence () {
    // ── saveData: inject staffAccounts + shopCode ──────
    const _origSave = window.saveData;
    window.saveData = function () {
      // Temporarily store so firebase.js cloudSync picks them up
      window._posh_staffAccounts = window.staffAccounts || [];
      window._posh_shopCode      = window.getShopCode();
      if (typeof _origSave === 'function') _origSave.apply(this, arguments);
      // Patch localStorage after save (app.js writes the blob; re-add our fields)
      // BUG FIX: wrap in try-catch — secondary setItem can also throw QuotaExceededError
      try {
        const raw = localStorage.getItem('posh_data');
        if (raw) {
          const d = JSON.parse(raw);
          d.staffAccounts = window.staffAccounts || [];
          d.shopCode      = window.getShopCode();
          try {
            localStorage.setItem('posh_data', JSON.stringify(d));
          } catch (quotaErr) {
            console.warn('[POSH Staff] localStorage quota exceeded on staff patch write', quotaErr);
          }
        }
      } catch (e) { console.warn('[POSH Staff] saveData patch error', e); }
    };

    // ── loadData: restore staffAccounts + shopCode ─────
    const _origLoad = window.loadData;
    window.loadData = function () {
      if (typeof _origLoad === 'function') _origLoad.apply(this, arguments);
      try {
        const raw = localStorage.getItem('posh_data');
        if (raw) {
          const d = JSON.parse(raw);
          if (d.staffAccounts) window.staffAccounts = d.staffAccounts;
          if (d.shopCode && !localStorage.getItem('posh_shop_code')) {
            localStorage.setItem('posh_shop_code', d.shopCode);
          }
        }
      } catch (e) {}
    };
  })();

  // ═══════════════════════════════════════════════════════
  //  PATCH: cloudSync to include staffAccounts + shopCode
  // ═══════════════════════════════════════════════════════
  // firebase.js picks up window.* properties listed in _doCloudSync.
  // We expose them so they get included automatically on next sync.
  Object.defineProperty(window, 'staffAccountsForCloud', {
    get: function () { return window.staffAccounts || []; },
    configurable: true
  });

  // ═══════════════════════════════════════════════════════
  //  ENTRY SCREEN — Initial display decision (after splash)
  // ═══════════════════════════════════════════════════════
  // This is called by app.js splash timeout (or we patch it here).
  window._poshShowStartScreen = function () {
    const onboarded   = localStorage.getItem('posh_onboarded') === 'true';
    const roleChoice  = localStorage.getItem('posh_role_choice');
    const ownerUid    = localStorage.getItem('posh_owner_uid');

    if (!onboarded) {
      // First ever launch — show entry screen
      showEntryScreen();
      return;
    }

    if (roleChoice === 'staff') {
      // Returning staff: prefill & show staff login (or bypass if same device)
      showEntryScreen();
      chooseStaff();
      return;
    }

    if (roleChoice === 'owner' || ownerUid) {
      // Returning owner: check Firebase Auth then show PIN
      // firebase-auth.js onAuthStateChanged will fire and advance if authenticated
      // We show PIN screen as fallback (owner uses PIN to unlock even after auth)
      const pin = document.getElementById('pin-screen');
      if (pin) { pin.style.display = 'flex'; }
      const hint = document.getElementById('pin-hint');
      if (hint) hint.textContent = 'Enter your Admin PIN';
      return;
    }

    // Unknown state — show entry screen
    showEntryScreen();
  };

  console.log('POSH Staff & Entry Screen ready ✅');

})(window);
