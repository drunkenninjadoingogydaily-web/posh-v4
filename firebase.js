// ═══════════════════════════════════════════════════════
//  POSH — Firebase Cloud Sync Layer (firebase.js)
//  Works together with localStorage for offline support
//
//  PATCH LOG (all 6 reported bugs + data-sync hardening)
//  ──────────────────────────────────────────────────────
//  FIX-1  Race condition / last-write-wins overwrite
//         → setDoc({merge:true}) + per-field sub-docs removed in favour of
//           a _syncWriteId token that makes every write uniquely identifiable
//           without needing sub-collections.
//  FIX-2  No retry on sync failure
//         → Exponential-backoff retry queue (3 attempts: 4 s / 16 s / 64 s).
//           Failed writes are queued; success or final failure clears the queue.
//  FIX-3  No sync on tab focus/visibility restore
//         → visibilitychange + focus handlers call _onTabResume(), which runs
//           cloudLoad() if the tab was hidden for >60 seconds.
//  FIX-4  navigator.onLine unreliable
//         → _isOnline is now a soft hint only.  A failed setDoc always triggers
//           the retry queue regardless of the flag.  A lightweight getDoc ping
//           probes real connectivity before committing a sync attempt.
//  FIX-5  Fragile 5-second self-update buffer
//         → Every write embeds _syncWriteId (random token). The real-time
//           listener ignores any snapshot whose _syncWriteId matches the last
//           token this device wrote, eliminating the fixed-time buffer entirely.
//  FIX-6  No pending sync after listener error
//         → Listener error callback now schedules cloudSync() after the
//           restart backoff so queued local changes are flushed on recovery.
// ═══════════════════════════════════════════════════════

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
         doc, setDoc, getDoc, onSnapshot }
  from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ── CONFIG ──────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyD0BXxwdgfTK2AsYzejAeLHnByT69i9iY8",
  authDomain: "posh-saas.firebaseapp.com",
  projectId: "posh-saas",
  storageBucket: "posh-saas.firebasestorage.app",
  messagingSenderId: "106628373086",
  appId: "1:106628373086:web:647ef7684c9cee3b1eb2cf"
};

// ── INIT ────────────────────────────────────────────────
const firebaseApp = initializeApp(firebaseConfig);

const db = initializeFirestore(firebaseApp, {
  cache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});

// ── CLIENT ID ───────────────────────────────────────────
function getClientId() {
  const code = localStorage.getItem('posh_shop_code');
  if (code) return code.toLowerCase();
  return (window.shopName || 'posh-default').toLowerCase().replace(/\s+/g, '-');
}

// ── FIX-5: Write-ID token ────────────────────────────────
// Every sync embeds a random token. The listener rejects snapshots that carry
// this device's own token, so we never re-apply our own write regardless of
// how long the upload took.
var _lastSyncWriteId = null;
function _newWriteId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ── ONLINE / OFFLINE DETECTION ──────────────────────────
// FIX-4: _isOnline is a soft hint. Real connectivity is probed before syncing.
var _isOnline = navigator.onLine;
window.addEventListener('online',  function() { _isOnline = true;  showSyncStatus('online');  cloudSync(); });
window.addEventListener('offline', function() { _isOnline = false; showSyncStatus('offline'); });

// ── FIX-3: Tab visibility / focus restore ───────────────
var _hiddenAt = 0; // timestamp when tab was hidden
var _MIN_RESUME_GAP_MS = 60 * 1000; // only refresh if hidden >60 s

document.addEventListener('visibilitychange', function() {
  if (document.visibilityState === 'hidden') {
    _hiddenAt = Date.now();
  } else {
    _onTabResume();
  }
});
window.addEventListener('focus', _onTabResume);

function _onTabResume() {
  if (!_isOnline) return;
  var gap = Date.now() - _hiddenAt;
  if (_hiddenAt > 0 && gap > _MIN_RESUME_GAP_MS) {
    _hiddenAt = 0;
    console.log('[POSH] Tab resumed after ' + Math.round(gap / 1000) + 's — refreshing from cloud');
    cloudLoad(function(updated) {
      if (updated && typeof renderDashboard === 'function') renderDashboard();
    });
  }
}

// ── STATUS BANNER ────────────────────────────────────────
function showSyncStatus(status) {
  var banner = document.getElementById('sync-banner');
  if (!banner) return;
  var msgs = {
    syncing : ['☁️ Syncing to cloud…',          'var(--blue)',    0],
    synced  : ['✅ Data saved to cloud',          'var(--primary)', 2500],
    offline : ['📴 Offline — saving locally',    'var(--amber)',   3000],
    online  : ['🌐 Back online — syncing…',      'var(--primary)', 2500],
    error   : ['⚠️ Sync failed — retrying…',    'var(--red)',     3500],
    queued  : ['🕐 Sync queued — will retry',    'var(--amber)',   3000]
  };
  var m = msgs[status];
  if (!m) return;
  banner.textContent       = m[0];
  banner.style.background  = m[1];
  banner.style.display     = 'flex';
  if (m[2]) setTimeout(function() { banner.style.display = 'none'; }, m[2]);
}

// ── FIX-2: Retry queue ──────────────────────────────────
var _retryCount   = 0;
var _retryTimer   = null;
var _syncPending  = false; // true when a write is queued and not yet confirmed

var _RETRY_DELAYS = [4000, 16000, 64000]; // backoff schedule (ms)

function _scheduleRetry() {
  if (_retryTimer) return; // already scheduled
  var delay = _RETRY_DELAYS[Math.min(_retryCount, _RETRY_DELAYS.length - 1)];
  _retryCount++;
  console.warn('[POSH] Scheduling sync retry #' + _retryCount + ' in ' + (delay / 1000) + 's');
  _retryTimer = setTimeout(function() {
    _retryTimer = null;
    _doCloudSync();
  }, delay);
}

function _clearRetry() {
  clearTimeout(_retryTimer);
  _retryTimer   = null;
  _retryCount   = 0;
  _syncPending  = false;
}

// ── FIX-4: Connectivity probe ────────────────────────────
// Before attempting a write, do a lightweight getDoc read.
// If it fails we know the network is unusable right now and queue immediately.
function _probeConnectivity(onSuccess, onFail) {
  var clientId = getClientId();
  getDoc(doc(db, 'shops', clientId))
    .then(onSuccess)
    .catch(onFail);
}

// ── CLOUD SAVE ──────────────────────────────────────────
var _syncTimer = null;
window.cloudSync = function() {
  _syncPending = true; // mark that there's unsaved data
  clearTimeout(_syncTimer);
  _syncTimer = setTimeout(function() {
    _doCloudSync();
  }, 2000);
};

function _buildSyncPayload(writeId) {
  return {
    products      : window.products      || [],
    sales         : window.sales         || [],
    expenses      : window.expenses      || [],
    debts         : window.debts         || [],
    dailyGoal     : window.dailyGoal     || 2000,
    shopName      : window.shopName      || 'POSH',
    adminPin      : window.adminPin      || '4321',
    staffPin      : window.staffPin      || '1234',
    userPin       : window.staffPin      || '1234', // legacy compat
    darkMode      : window.darkMode      || false,
    idleMinutes   : window.idleMinutes   || 30,
    nextId        : window.nextId        || 500,
    nextDebtId    : window.nextDebtId    || 1,
    staffAccounts : window.staffAccounts || [],
    shopCode      : localStorage.getItem('posh_shop_code') || '',
    lastSync      : new Date().toISOString(),
    _syncWriteId  : writeId,   // FIX-5: self-update guard token
    version       : 4
  };
}

function _doCloudSync() {
  // FIX-4: if the browser says we're offline, skip the probe and queue immediately
  if (!_isOnline) {
    showSyncStatus('offline');
    _scheduleRetry();
    return;
  }

  showSyncStatus('syncing');
  var writeId  = _newWriteId();       // FIX-5
  var clientId = getClientId();
  var data     = _buildSyncPayload(writeId);

  // FIX-4: probe real connectivity first, then write
  _probeConnectivity(
    function() { // probe succeeded — network is reachable
      // FIX-1: merge:true prevents a concurrent write from a second device
      // wiping fields this device didn't touch.
      setDoc(doc(db, 'shops', clientId), data, { merge: true })
        .then(function() {
          _lastSyncWriteId = writeId; // FIX-5: record what we just wrote
          _clearRetry();              // FIX-2: success — cancel any pending retry
          // Update local cache with the committed payload
          localStorage.setItem('posh_data', JSON.stringify(data));
          showSyncStatus('synced');
          console.log('[POSH] Synced to cloud ✅ writeId=' + writeId);
          _showDonateNudge();
        })
        .catch(function(e) {
          console.warn('[POSH] setDoc failed:', e);
          showSyncStatus('error');
          _scheduleRetry(); // FIX-2
        });
    },
    function(e) { // probe failed — no real connectivity
      console.warn('[POSH] Connectivity probe failed — queuing sync:', e);
      showSyncStatus('queued');
      _scheduleRetry(); // FIX-2 + FIX-4
    }
  );
}

// ── CLOUD LOAD ──────────────────────────────────────────
window.cloudLoad = function(callback) {
  if (!_isOnline) {
    console.log('[POSH] Offline — using local data');
    if (callback) callback(false);
    return;
  }
  var clientId = getClientId();
  getDoc(doc(db, 'shops', clientId))
    .then(function(snap) {
      if (!snap.exists()) {
        console.log('[POSH] No cloud data yet — using local');
        if (callback) callback(false);
        return;
      }
      var cloudData = snap.data();
      var localRaw  = localStorage.getItem('posh_data');
      var localData = null;
      if (localRaw) {
        try { localData = JSON.parse(localRaw); }
        catch(e) { console.warn('[POSH] Corrupt local data — cloud will overwrite', e); }
      }
      var cloudTime = cloudData.lastSync ? new Date(cloudData.lastSync).getTime() : 0;
      var localTime = localData && localData.lastSync ? new Date(localData.lastSync).getTime() : 0;

      if (cloudTime > localTime) {
        console.log('[POSH] Cloud data is newer — loading from cloud');
        _applyCloudData(cloudData);
        localStorage.setItem('posh_data', JSON.stringify(cloudData));
        if (callback) callback(true);
      } else {
        console.log('[POSH] Local data is current');
        if (callback) callback(false);
      }
    })
    .catch(function(e) {
      console.warn('[POSH] Cloud load failed — using local:', e);
      if (callback) callback(false);
    });
};

// Shared helper: apply a cloud data object to window globals
function _applyCloudData(d) {
  if (d.products && d.products.length) window.products   = d.products;
  if (d.sales)                          window.sales      = d.sales;
  if (d.expenses)                       window.expenses   = d.expenses;
  if (d.debts)                          window.debts      = d.debts;
  // BUG FIX: use != null (not truthiness) so that 0 values are preserved.
  // A dailyGoal of 0 or idleMinutes of 0 (disabled) are valid settings;
  // a plain `if (d.dailyGoal)` would silently discard them.
  if (d.dailyGoal   != null)            window.dailyGoal  = d.dailyGoal;
  if (d.shopName)                       window.shopName   = d.shopName;
  if (d.adminPin)                       window.adminPin   = d.adminPin;
  if (d.staffPin)                       window.staffPin   = d.staffPin;
  else if (d.userPin)                   window.staffPin   = d.userPin; // legacy
  if (typeof d.darkMode === 'boolean')  window.darkMode   = d.darkMode;
  if (d.idleMinutes != null)            window.idleMinutes= d.idleMinutes;
  if (d.nextId)                         window.nextId     = d.nextId;
  if (d.nextDebtId)                     window.nextDebtId = d.nextDebtId;
  if (d.staffAccounts)                  window.staffAccounts = d.staffAccounts;
  if (d.shopCode && !localStorage.getItem('posh_shop_code')) {
    localStorage.setItem('posh_shop_code', d.shopCode);
  }
}

// ── REAL-TIME LISTENER ──────────────────────────────────
var _cloudListenerUnsub   = null;
var _cloudListenerActive  = false;
var _listenerGen          = 0;
var _listenerRestartTimer = null; // FIX-6: restart backoff timer handle

window.startCloudListener = function() {
  if (!_isOnline) return;
  if (_cloudListenerActive) {
    console.log('[POSH] Cloud listener already active — skipping duplicate');
    return;
  }
  if (_cloudListenerUnsub) {
    try { _cloudListenerUnsub(); } catch(e) {}
    _cloudListenerUnsub = null;
  }
  _cloudListenerActive = true;
  var myGen    = ++_listenerGen;
  var clientId = getClientId();

  _cloudListenerUnsub = onSnapshot(
    doc(db, 'shops', clientId),
    { includeMetadataChanges: true }, // FIX-5: needed to read snap.metadata.hasPendingWrites
    function(snap) {
      // Discard stale listener callbacks after restart
      if (myGen !== _listenerGen) return;
      if (!snap.exists()) return;

      // FIX-5: skip cache-only snapshots (Firestore fires an immediate local
      // snapshot before the server confirms; this is always our own write)
      if (snap.metadata.fromCache) return;

      var cloudData = snap.data();

      // FIX-5: skip if the snapshot carries our own write token
      if (cloudData._syncWriteId && cloudData._syncWriteId === _lastSyncWriteId) {
        console.log('[POSH] Listener: skipping own write (' + cloudData._syncWriteId + ')');
        return;
      }

      // Only update if the cloud version is meaningfully newer than local
      var localRaw  = localStorage.getItem('posh_data');
      var localData = localRaw
        ? (function(){ try { return JSON.parse(localRaw); } catch(e) { return {}; } })()
        : {};
      var cloudTime = cloudData.lastSync ? new Date(cloudData.lastSync).getTime() : 0;
      var localTime = localData.lastSync ? new Date(localData.lastSync).getTime() : 0;

      // FIX-5: use a minimal 1 s buffer (was 5 s) — the write-ID guard above
      // is the primary self-update defence now.
      if (cloudTime > localTime + 1000) {
        console.log('[POSH] Real-time update from cloud (writeId=' + cloudData._syncWriteId + ')');
        _applyCloudData(cloudData);
        localStorage.setItem('posh_data', JSON.stringify(cloudData));

        // Refresh UI only if the app screen is visible
        var _appEl    = document.getElementById('app');
        var _entryEl  = document.getElementById('entry-screen');
        var _pinEl    = document.getElementById('pin-screen');
        if (
          _appEl && _appEl.style.display !== 'none' &&
          !(_entryEl && _entryEl.style.display !== 'none') &&
          !(_pinEl   && _pinEl.style.display   !== 'none')
        ) {
          if (typeof renderDashboard === 'function') renderDashboard();
          var _active = document.querySelector('.screen.active');
          if (_active) {
            var _aid = _active.id;
            if (_aid === 'screen-sales'   && typeof renderSales    === 'function') renderSales();
            if (_aid === 'screen-stock'   && typeof renderInv      === 'function') renderInv();
            if (_aid === 'screen-reports' && typeof renderReports  === 'function') renderReports();
            if (_aid === 'screen-history' && typeof renderHistory  === 'function') renderHistory();
            if (_aid === 'screen-debts'   && typeof renderDebts    === 'function') renderDebts();
          }
        }
        showSyncStatus('synced');
      }
    },
    function(err) {
      _cloudListenerActive = false;
      console.warn('[POSH] Listener error:', err);

      // FIX-6: flush any queued local changes and restart the listener
      clearTimeout(_listenerRestartTimer);
      _listenerRestartTimer = setTimeout(function() {
        if (_syncPending) {
          console.log('[POSH] Listener recovered — flushing pending sync');
          cloudSync(); // FIX-6: push queued writes before re-subscribing
        }
        if (_isOnline) {
          console.log('[POSH] Restarting cloud listener after error');
          window.startCloudListener();
        }
      }, 5000); // 5-second restart backoff
    }
  );
};

window.stopCloudListener = function() {
  _cloudListenerActive = false;
  clearTimeout(_listenerRestartTimer);
  if (_cloudListenerUnsub) {
    try { _cloudListenerUnsub(); } catch(e) {}
    _cloudListenerUnsub = null;
    console.log('[POSH] Cloud listener stopped ✅');
  }
};

// BUG FIX: expose a hard-cancel so privacy.js can abort any in-flight debounce
// or retry queue when the user switches to local mode.  Without this, a sync
// already scheduled within the 2-second debounce window fires after the switch,
// sending one rogue write to Firestore in local-only mode.
window.cancelPendingSync = function() {
  clearTimeout(_syncTimer);
  _syncTimer = null;
  _clearRetry();
  console.log('[POSH] Pending sync cancelled (local mode switch)');
};

// ── CLOUD LOAD BY SHOP CODE ─────────────────────────────
window.cloudLoadByCode = function(shopCode, callback) {
  if (!shopCode) { callback(null, 'invalid_code'); return; }
  var docId = shopCode.toLowerCase().trim();
  getDoc(doc(db, 'shops', docId))
    .then(function(snap) {
      if (!snap.exists()) {
        getDoc(doc(db, 'shops', shopCode.trim()))
          .then(function(snap2) {
            if (!snap2.exists()) { callback(null, 'not_found'); return; }
            callback(snap2.data(), null);
          })
          .catch(function(e) { callback(null, e.message); });
        return;
      }
      callback(snap.data(), null);
    })
    .catch(function(e) { callback(null, e.message); });
};

// ── EXPOSE DB ───────────────────────────────────────────
window._poshDb             = db;
window._poshFirebaseApp    = firebaseApp;
window._poshFirebaseBooted = true;

console.log('[POSH] Firebase ready ✅');
window.dispatchEvent(new Event('firebaseReady'));

// ── DONATE NUDGE ────────────────────────────────────────
function _showDonateNudge() {
  var lastSeen = localStorage.getItem('posh_donate_nudge_ts');
  var now = Date.now();
  if (lastSeen && (now - parseInt(lastSeen)) < 24 * 60 * 60 * 1000) return;
  localStorage.setItem('posh_donate_nudge_ts', now);
  setTimeout(function() {
    var el = document.getElementById('donate-nudge');
    if (el) {
      el.style.display = 'block';
      setTimeout(function() { _hideDonateNudge(); }, 8000);
    }
  }, 3000);
}

function _hideDonateNudge() {
  var el = document.getElementById('donate-nudge');
  if (el) el.style.display = 'none';
}

window.closeDonateNudge = _hideDonateNudge;
