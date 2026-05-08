// ═══════════════════════════════════════════════════════
//  POSH — Firebase Cloud Sync Layer (firebase.js)
//  Works together with localStorage for offline support
// ═══════════════════════════════════════════════════════

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
         doc, setDoc, getDoc, onSnapshot }
  from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ── CONFIG ──
// ✅ Firebase project credentials configured
const firebaseConfig = {
  apiKey: "AIzaSyD0BXxwdgfTK2AsYzejAeLHnByT69i9iY8",
  authDomain: "posh-saas.firebaseapp.com",
  projectId: "posh-saas",
  storageBucket: "posh-saas.firebasestorage.app",
  messagingSenderId: "106628373086",
  appId: "1:106628373086:web:647ef7684c9cee3b1eb2cf"
};

// ── INIT ──
const firebaseApp = initializeApp(firebaseConfig);

// Enable offline persistence (replaces deprecated enableIndexedDbPersistence)
const db = initializeFirestore(firebaseApp, {
  cache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});

// ── CLIENT ID (unique per shop) ──
// Uses shopName as document ID so each shop has its own data
function getClientId() {
  const code = localStorage.getItem('posh_shop_code');
  if (code) return code.toLowerCase();
  return (window.shopName || 'posh-default').toLowerCase().replace(/\s+/g, '-');
}

// ── ONLINE/OFFLINE DETECTION ──
var _isOnline = navigator.onLine;
window.addEventListener('online', function() {
  _isOnline = true;
  showSyncStatus('online');
  cloudSync(); // sync when back online
});
window.addEventListener('offline', function() {
  _isOnline = false;
  showSyncStatus('offline');
});

function showSyncStatus(status) {
  var banner = document.getElementById('sync-banner');
  if (!banner) return;
  if (status === 'syncing') {
    banner.textContent = '☁️ Syncing to cloud...';
    banner.style.background = 'var(--blue)';
    banner.style.display = 'flex';
  } else if (status === 'synced') {
    banner.textContent = '✅ Data saved to cloud';
    banner.style.background = 'var(--primary)';
    banner.style.display = 'flex';
    setTimeout(function() { banner.style.display = 'none'; }, 2500);
  } else if (status === 'offline') {
    banner.textContent = '📴 Offline — saving locally only';
    banner.style.background = 'var(--amber)';
    banner.style.display = 'flex';
    setTimeout(function() { banner.style.display = 'none'; }, 3000);
  } else if (status === 'online') {
    banner.textContent = '🌐 Back online — syncing...';
    banner.style.background = 'var(--primary)';
    banner.style.display = 'flex';
    setTimeout(function() { banner.style.display = 'none'; }, 2500);
  } else if (status === 'error') {
    banner.textContent = '⚠️ Sync failed — data saved locally';
    banner.style.background = 'var(--red)';
    banner.style.display = 'flex';
    setTimeout(function() { banner.style.display = 'none'; }, 3000);
  }
}

// ── CLOUD SAVE ──
// Called every time saveData() is called
var _syncTimer = null;
window.cloudSync = function() {
  // Debounce — wait 2 seconds after last save before syncing
  clearTimeout(_syncTimer);
  _syncTimer = setTimeout(function() {
    _doCloudSync();
  }, 2000);
};

function _doCloudSync() {
  if (!_isOnline) {
    showSyncStatus('offline');
    return;
  }
  showSyncStatus('syncing');
  var clientId = getClientId();
  var data = {
    products: window.products || [],
    sales: window.sales || [],
    expenses: window.expenses || [],
    debts: window.debts || [],
    dailyGoal: window.dailyGoal || 2000,
    shopName: window.shopName || 'POSH',
    adminPin: window.adminPin || '4321',
    staffPin: window.staffPin || '1234',
    userPin: window.staffPin || '1234', // legacy compat
    darkMode: window.darkMode || false,
    idleMinutes: window.idleMinutes || 30,
    nextId: window.nextId || 500,
    nextDebtId: window.nextDebtId || 1,
    staffAccounts: window.staffAccounts || [],
    shopCode: (function(){ var c=localStorage.getItem('posh_shop_code'); return c||''; })(),
    lastSync: new Date().toISOString(),
    version: 4
  };
  setDoc(doc(db, 'shops', clientId), data)
    .then(function() {
      showSyncStatus('synced');
      console.log('POSH synced to cloud ✅');
      _showDonateNudge();
    })
    .catch(function(e) {
      showSyncStatus('error');
      console.warn('POSH sync failed:', e);
    });
}

// ── CLOUD LOAD ──
// Called on app start — loads from cloud if newer than local
window.cloudLoad = function(callback) {
  if (!_isOnline) {
    console.log('POSH offline — using local data');
    if (callback) callback(false);
    return;
  }
  var clientId = getClientId();
  getDoc(doc(db, 'shops', clientId))
    .then(function(snap) {
      if (!snap.exists()) {
        console.log('POSH no cloud data yet — using local');
        if (callback) callback(false);
        return;
      }
      var cloudData = snap.data();
      var localRaw = localStorage.getItem('posh_data');
      var localData = localRaw ? JSON.parse(localRaw) : null;
      // Compare last sync times — use whichever is newer
      var cloudTime = cloudData.lastSync ? new Date(cloudData.lastSync).getTime() : 0;
      var localTime = localData && localData.lastSync ? new Date(localData.lastSync).getTime() : 0;
      if (cloudTime > localTime) {
        console.log('POSH cloud data is newer — loading from cloud');
        // Apply cloud data to app
        if (cloudData.products && cloudData.products.length) window.products = cloudData.products;
        if (cloudData.sales) window.sales = cloudData.sales;
        if (cloudData.expenses) window.expenses = cloudData.expenses;
        if (cloudData.debts) window.debts = cloudData.debts;
        if (cloudData.dailyGoal) window.dailyGoal = cloudData.dailyGoal;
        if (cloudData.shopName) window.shopName = cloudData.shopName;
        if (cloudData.adminPin) window.adminPin = cloudData.adminPin;
        if (cloudData.staffPin) window.staffPin = cloudData.staffPin;
        else if (cloudData.userPin) window.staffPin = cloudData.userPin; // legacy fallback
        if (typeof cloudData.darkMode === 'boolean') window.darkMode = cloudData.darkMode;
        if (cloudData.idleMinutes) window.idleMinutes = cloudData.idleMinutes;
        if (cloudData.nextId) window.nextId = cloudData.nextId;
        if (cloudData.nextDebtId) window.nextDebtId = cloudData.nextDebtId;
        if (cloudData.staffAccounts) window.staffAccounts = cloudData.staffAccounts;
        if (cloudData.shopCode && !localStorage.getItem('posh_shop_code')) {
          localStorage.setItem('posh_shop_code', cloudData.shopCode);
        }
        // Also save to localStorage as cache
        localStorage.setItem('posh_data', JSON.stringify(cloudData));
        if (callback) callback(true); // true = data was updated from cloud
      } else {
        console.log('POSH local data is current');
        if (callback) callback(false);
      }
    })
    .catch(function(e) {
      console.warn('POSH cloud load failed — using local:', e);
      if (callback) callback(false);
    });
};

// ── REAL-TIME LISTENER (optional) ──
// Listens for changes from other devices in real time
var _cloudListenerUnsub = null;
var _cloudListenerActive = false; // BUG FIX #5: guard against duplicate concurrent listeners
var _listenerGen = 0; // BUG FIX: generation counter to invalidate stale listeners after restart

window.startCloudListener = function() {
  if (!_isOnline) return;
  // BUG FIX #5: if already active, skip — prevents duplicate listeners & memory leaks
  if (_cloudListenerActive) {
    console.log('[POSH] Cloud listener already active — skipping duplicate');
    return;
  }
  // Unsubscribe any stale listener before creating a new one
  if (_cloudListenerUnsub) { try { _cloudListenerUnsub(); } catch(e) {} _cloudListenerUnsub = null; }
  _cloudListenerActive = true;
  var myGen = ++_listenerGen; // capture generation — stale callbacks will not match
  var clientId = getClientId();
  _cloudListenerUnsub = onSnapshot(doc(db, 'shops', clientId), function(snap) {
    // BUG FIX: if listener was restarted, discard updates from the old instance
    if (myGen !== _listenerGen) return;
    if (!snap.exists()) return;
    var cloudData = snap.data();
    // Only update if the change came from another device
    // (not from this device's own sync)
    var localRaw = localStorage.getItem('posh_data');
    var localData = localRaw ? (function(){try{return JSON.parse(localRaw);}catch(e){return {};}})() : {};
    var cloudTime = cloudData.lastSync ? new Date(cloudData.lastSync).getTime() : 0;
    var localTime = localData.lastSync ? new Date(localData.lastSync).getTime() : 0;
    if (cloudTime > localTime + 5000) { // 5 second buffer to avoid self-updates
      console.log('POSH real-time update from cloud');
      if (cloudData.products && cloudData.products.length) window.products = cloudData.products;
      if (cloudData.sales) window.sales = cloudData.sales;
      if (cloudData.expenses) window.expenses = cloudData.expenses;
      if (cloudData.debts) window.debts = cloudData.debts;
      localStorage.setItem('posh_data', JSON.stringify(cloudData));
      // Refresh the current screen
      if (typeof renderDashboard === 'function') renderDashboard();
      showSyncStatus('synced');
    }
  }, function(err) {
    _cloudListenerActive = false; // BUG FIX #5: allow restart after error
    console.warn('POSH listener error:', err);
  });
};

// BUG FIX #1: expose stopCloudListener so privacy.js can call it when switching to local mode
window.stopCloudListener = function() {
  _cloudListenerActive = false;
  if (_cloudListenerUnsub) {
    try { _cloudListenerUnsub(); } catch(e) {}
    _cloudListenerUnsub = null;
    console.log('POSH cloud listener stopped ✅');
  }
};

// ── CLOUD LOAD BY SHOP CODE ──
// Used by staff login to load a shop's data using the shop's 6-char code
window.cloudLoadByCode = function(shopCode, callback) {
  if (!shopCode) { callback(null, 'invalid_code'); return; }
  var docId = shopCode.toLowerCase().trim();
  getDoc(doc(db, 'shops', docId))
    .then(function(snap) {
      if (!snap.exists()) {
        // Try exact case
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

// ── EXPOSE DB ──
// BUG FIX: expose db and firebaseApp on window so non-module scripts
// (e.g. the POSH_DONATE remote config loader in app.js) can access them.
// Previously only _poshFirebaseBooted was set, leaving window._poshDb undefined.
window._poshDb             = db;
window._poshFirebaseApp    = firebaseApp;
window._poshFirebaseBooted = true;

console.log('POSH Firebase ready ✅');
window.dispatchEvent(new Event('firebaseReady'));

// ── Donate nudge (shows once per day after reconnect + sync) ──
function _showDonateNudge() {
  var lastSeen = localStorage.getItem('posh_donate_nudge_ts');
  var now = Date.now();
  var ONE_DAY = 24 * 60 * 60 * 1000;
  if (lastSeen && (now - parseInt(lastSeen)) < ONE_DAY) return;
  localStorage.setItem('posh_donate_nudge_ts', now);
  // Small delay so sync banner clears first
  setTimeout(function() {
    var el = document.getElementById('donate-nudge');
    if (el) {
      el.style.display = 'block';
      // Auto-dismiss after 8 seconds
      setTimeout(function() { _hideDonateNudge(); }, 8000);
    }
  }, 3000);
}

function _hideDonateNudge() {
  var el = document.getElementById('donate-nudge');
  if (el) el.style.display = 'none';
}

window.closeDonateNudge = _hideDonateNudge;
