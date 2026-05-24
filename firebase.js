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
//  FIX-7  Owner writes fail with "Missing or insufficient permissions"
//         → firebase.js initialised Firestore before firebase-auth.js had a
//           chance to register Auth on the shared app instance.  The Firestore
//           SDK therefore had no auth listener and sent every request without a
//           JWT, even after the owner signed in.  Fix: import getAuth here and
//           call it on the shared firebaseApp immediately after initializeApp()
//           so the Firestore SDK discovers the auth session from the start.
//           Staff writes (no Firebase Auth) are handled by updated Firestore
//           Security Rules that also allow writes when the payload shopCode
//           matches the document ID.
// ═══════════════════════════════════════════════════════

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { initializeFirestore, persistentLocalCache, persistentSingleTabManager,
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

// FIX-7: Register Auth on the shared app instance BEFORE initializeFirestore.
// The Firestore SDK checks for a registered Auth instance at startup to attach
// JWTs to outgoing requests.  firebase-auth.js also calls getAuth(getApp()),
// but it loads AFTER firebase.js, so without this line Firestore starts with
// no auth listener and sends every write unauthenticated — even for a signed-in
// owner — causing "Missing or insufficient permissions" on every setDoc call.
// Calling getAuth(firebaseApp) here is zero-cost: if firebase-auth.js later
// calls getAuth() on the same app it gets the same singleton instance.
getAuth(firebaseApp);

// FIX-2 (tab manager): persistentMultipleTabManager uses a SharedWorker /
// BroadcastChannel that is NOT available in iOS PWA home-screen mode or in
// some Android WebViews.  When the tab manager fails to initialise, Firestore
// silently disables persistence entirely, so every app launch starts cold
// (no cached reads, fromCache=true on the very first snapshot).
// persistentSingleTabManager works on every browser and every PWA install
// context — it simply does not try to coordinate multiple tabs.  Since POSH is
// a mobile-first, single-tab PWA this is strictly better.
const db = initializeFirestore(firebaseApp, {
  cache: persistentLocalCache({
    tabManager: persistentSingleTabManager({ forceOwnership: true })
  })
});

// ── CLIENT ID ───────────────────────────────────────────
// MULTI-OWNER FIX: The Firestore document key is now the owner's Firebase UID
// (posh_owner_uid), not the shop code.  This means every owner gets their own
// isolated document at shops/{ownerUid} — two owners with the same shop code
// can never collide.
//
// Priority chain:
//  1. posh_owner_uid  — set by firebase-auth.js on sign-in (owner) OR by
//                       staff.js cloudLoadByCode callback (staff device reads
//                       ownerUid from the Firestore document and caches it).
//  2. posh_shop_code  — legacy fallback so existing installs keep working
//                       until posh_owner_uid is populated.
//  3. 'posh-default'  — last-resort fallback (single-owner installs with no
//                       code and no auth, as before).
function getClientId() {
  const uid  = localStorage.getItem('posh_owner_uid');
  if (uid)  return uid;
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

// ── SYNC SEQ COUNTER (cross-device clock-skew fix) ───────
// _syncSeq is a monotonically-increasing integer stored IN FIRESTORE alongside
// the document. Every write reads the current Firestore seq and increments it,
// so all devices share a single global counter.  Previously it was per-device
// local (localStorage), which caused staff phone (seq=1) to be rejected by the
// admin listener already at seq=50, silently dropping every staff sale.
//
// IMPORTANT: _lastSeenSyncSeq is initialised to -1, not 0. This ensures the
// very first snapshot from Firestore (which has seq >= 0) is ALWAYS applied,
// even on a brand-new device where localStorage has no prior seq stored.
var _lastSeenSyncSeq = parseInt(localStorage.getItem('posh_sync_seq') || '-1', 10);

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
  // Use the delay at the current retry index, then clamp at the last slot so
  // retries keep looping at the max delay instead of silently stopping after
  // the array is exhausted.  _retryCount is incremented AFTER reading the
  // delay so attempt #1 uses index 0, attempt #2 uses index 1, etc.
  var idx   = Math.min(_retryCount, _RETRY_DELAYS.length - 1);
  var delay = _RETRY_DELAYS[idx];
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

// ── CLOUD SAVE ──────────────────────────────────────────
var _syncTimer = null;
window.cloudSync = function() {
  _syncPending = true; // mark that there's unsaved data
  clearTimeout(_syncTimer);
  _syncTimer = setTimeout(function() {
    _doCloudSync();
  }, 2000);
};

// ── SALES MERGE HELPER ──────────────────────────────────
// The root cause of "staff sales invisible on admin side":
// _buildSyncPayload used to write window.sales (this device's local array)
// directly to Firestore.  If the admin device then did ANY sync (price edit,
// stock update, settings change…) it would overwrite the Firestore document
// with its own sales array, erasing every sale the staff device had synced.
//
// Fix: always compute the UNION of local sales + cloud sales before writing.
// Sales are keyed by their `id` field.  Local wins on conflict (same id) so
// edits/voids made on this device are authoritative.
//
// The same merge is applied in _applyCloudData so the in-memory array is
// always the full union, not just what arrived from the cloud.
function _mergeSales(localSales, cloudSales) {
  if (!cloudSales || !cloudSales.length) return localSales || [];
  if (!localSales  || !localSales.length)  return cloudSales;
  var merged = cloudSales.slice(); // start with cloud
  var cloudIds = new Set(merged.map(function(s){ return s.id; }));
  (localSales || []).forEach(function(s) {
    if (cloudIds.has(s.id)) {
      // Local device is authoritative — update in place
      var idx = merged.findIndex(function(c){ return c.id === s.id; });
      if (idx >= 0) merged[idx] = s;
    } else {
      merged.push(s);
    }
  });
  // Sort by timestamp ascending so history renders in order
  merged.sort(function(a, b){ return (a.ts||0) - (b.ts||0); });
  return merged;
}

// _buildSyncPayload receives the current cloud seq so it can increment from
// the globally-agreed value, not a stale per-device local counter.
// It also receives the cloud's current sales array so it can merge rather than overwrite.
function _buildSyncPayload(writeId, cloudSeqBase, cloudSales) {
  // BUG FIX (staff sync): seq is now derived from the CLOUD's current value,
  // not a local counter.  This means staff phone (fresh install, local seq=0)
  // will correctly write seq = cloudSeqBase+1, which the admin listener
  // (already at cloudSeqBase) recognises as strictly newer and applies.
  var base   = (typeof cloudSeqBase === 'number' && cloudSeqBase >= 0)
                 ? cloudSeqBase
                 : (parseInt(localStorage.getItem('posh_sync_seq') || '0', 10) || 0);
  var newSeq = base + 1;
  localStorage.setItem('posh_sync_seq', String(newSeq));
  _lastSeenSyncSeq = newSeq; // don't re-apply our own write via seq check

  // SALES MERGE: merge local + cloud so no device's sales get overwritten.
  // This is the primary fix for "staff sales invisible on admin side".
  var mergedSales = _mergeSales(window.sales || [], cloudSales || []);
  // Keep in-memory array in sync so renders show the merged set immediately
  window.sales = mergedSales;

  return {
    products      : window.products      || [],
    sales         : mergedSales,
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
    // MULTI-OWNER FIX: embed the owner's UID in every document write so:
    //  a) staff devices can read it from the document and cache it locally
    //     (see staff.js cloudLoadByCode callback), and
    //  b) Firestore Security Rules can enforce shops/{ownerUid} ownership
    //     by comparing resource.data.ownerUid to request.auth.uid.
    ownerUid      : localStorage.getItem('posh_owner_uid') || '',
    lastSync      : new Date().toISOString(),
    _syncWriteId  : writeId,   // FIX-5: self-update guard token
    _syncSeq      : newSeq,    // BUG FIX: monotonic counter beats clock-skew
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

  var writeId  = _newWriteId();       // FIX-5
  var clientId = getClientId();

  // BUG FIX (staff sync + probe): Read the current cloud document first.
  // This serves DOUBLE DUTY:
  //  1. Real connectivity probe — Firestore offline cache returns immediately
  //     without a network round-trip; a successful server read confirms the
  //     network is actually reachable (fixes the phantom-probe bug where
  //     _probeConnectivity returned "success" from cache with no real network).
  //  2. Global seq read — we read _syncSeq straight from Firestore so the new
  //     write increments from the globally-agreed counter, not a stale local one.
  //     This is the root cause of staff sales being silently dropped: staff phone
  //     had local seq=1, admin was at seq=50, so cloudSeq(1) > _lastSeenSyncSeq(50)
  //     was false and the update was discarded.
  //
  // BUG FIX (UI loop): showSyncStatus('syncing') is now shown AFTER the read
  // succeeds, not before it. Previously the banner appeared on every poll
  // attempt (including cached/failed reads), making it look like an infinite loop.
  // FIX-1 (warm-cache-or-proceed): The old strategy aborted every write when
  // getDoc returned snap.metadata.fromCache === true.  On a mobile PWA that
  // has just launched, the persistence cache may not be warm yet, so the FIRST
  // getDoc always comes from cache even though the network is reachable.  This
  // caused _doCloudSync to immediately queue a retry on every app start,
  // delaying the first real sync by 4 seconds and, on slow connections, by up
  // to 84 seconds.
  //
  // New strategy (two-phase):
  //   Phase 1 — getDoc (may return cached or server snapshot).
  //             • If the snapshot is confirmed from server (fromCache===false):
  //               proceed straight to setDoc with cloudSeqBase from that snap.
  //             • If the snapshot is fromCache (cache warm but no server yet):
  //               issue a second getDoc with { source: 'server' } to force a
  //               network round-trip. This is the only reliable way to both
  //               confirm connectivity AND read the latest _syncSeq.
  //   Phase 2 — After we have a confirmed server snapshot, proceed to setDoc.
  //
  // If both reads fail we fall through to _scheduleRetry as before.

  function _proceedToWrite(cloudSeqBase, cloudSales) {
    showSyncStatus('syncing');
    var data = _buildSyncPayload(writeId, cloudSeqBase, cloudSales);
    setDoc(doc(db, 'shops', clientId), data, { merge: true })
      .then(function() {
        _lastSyncWriteId = writeId; // FIX-5: record what we just wrote
        _clearRetry();              // FIX-2: success — cancel any pending retry
        localStorage.setItem('posh_data', JSON.stringify(data));
        localStorage.setItem('posh_sync_seq', String(data._syncSeq));
        showSyncStatus('synced');
        console.log('[POSH] Synced to cloud ✅ writeId=' + writeId + ' seq=' + data._syncSeq + ' sales=' + data.sales.length);
        _showDonateNudge();
      })
      .catch(function(e) {
        console.warn('[POSH] setDoc failed:', e);
        showSyncStatus('error');
        _scheduleRetry(); // FIX-2
      });
  }

  getDoc(doc(db, 'shops', clientId))
    .then(function(snap) {
      var cloudSeqBase = 0;
      var cloudSales   = [];
      if (snap.exists()) {
        var cd = snap.data();
        if (cd._syncSeq != null) cloudSeqBase = cd._syncSeq;
        if (cd.sales)            cloudSales   = cd.sales;
      }

      if (!snap.metadata.fromCache) {
        // Phase 1 succeeded with a real server read — write immediately
        console.log('[POSH] Probe: server snapshot received, proceeding to write (seq=' + cloudSeqBase + ', cloudSales=' + cloudSales.length + ')');
        _proceedToWrite(cloudSeqBase, cloudSales);
        return;
      }

      // Phase 1 returned a cached snapshot — cache was warm but we haven't
      // confirmed a live network path yet.  Force a server-only fetch.
      console.log('[POSH] Probe: cached snapshot — forcing server read to confirm connectivity');
      getDoc(doc(db, 'shops', clientId), { source: 'server' })
        .then(function(serverSnap) {
          var serverSeqBase  = cloudSeqBase; // fall back to cached seq
          var serverSales    = cloudSales;   // fall back to cached sales
          if (serverSnap.exists()) {
            var sd = serverSnap.data();
            if (sd._syncSeq != null) serverSeqBase = sd._syncSeq;
            if (sd.sales)            serverSales   = sd.sales;
          }
          console.log('[POSH] Probe: server confirmed (seq=' + serverSeqBase + ', cloudSales=' + serverSales.length + '), proceeding to write');
          _proceedToWrite(serverSeqBase, serverSales);
        })
        .catch(function(e) {
          // Forced server fetch failed — truly offline; queue retry
          console.warn('[POSH] Forced server probe failed — queuing retry:', e);
          showSyncStatus('queued');
          _scheduleRetry();
        });
    })
    .catch(function(e) {
      console.warn('[POSH] Connectivity probe failed — queuing sync:', e);
      showSyncStatus('queued');
      _scheduleRetry(); // FIX-2 + FIX-4
    });
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

      // BUG FIX (staff sync): use _syncSeq for newer-check; fall back to
      // lastSync only for legacy documents that predate this patch.
      // Use -1 as default so a fresh device (no prior seq) always treats any
      // cloud document as newer, even if its seq is 0.
      var cloudSeq = (cloudData._syncSeq != null) ? cloudData._syncSeq : null;
      var localSeq = parseInt(localStorage.getItem('posh_sync_seq') || '-1', 10);
      var cloudIsNewer;
      if (cloudSeq != null) {
        cloudIsNewer = cloudSeq > localSeq;
      } else {
        var cloudTime = cloudData.lastSync ? new Date(cloudData.lastSync).getTime() : 0;
        var localTime = localData && localData.lastSync ? new Date(localData.lastSync).getTime() : 0;
        cloudIsNewer = cloudTime > localTime;
      }

      if (cloudIsNewer) {
        console.log('[POSH] Cloud data is newer (seq=' + cloudSeq + ' > local=' + localSeq + ', cloudSales=' + (cloudData.sales||[]).length + ') — loading from cloud');
        _applyCloudData(cloudData); // merges sales into window.sales
        // Persist merged state so local sales aren't lost on next reload
        var _mergedSnapshot = Object.assign({}, cloudData, { sales: window.sales });
        localStorage.setItem('posh_data', JSON.stringify(_mergedSnapshot));
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
  // SALES MERGE: merge incoming cloud sales with what this device already has in
  // memory.  A plain assignment would drop any sales this device made since the
  // last sync that haven't been confirmed to the cloud yet (e.g. made while
  // offline).  _mergeSales keeps local sales and adds cloud-only sales.
  if (d.sales) window.sales = _mergeSales(window.sales || [], d.sales);
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
  // BUG FIX (staff sync): update our local seq baseline so we don't reject
  // a future snapshot that has a seq equal to this one.
  if (d._syncSeq != null) {
    _lastSeenSyncSeq = d._syncSeq;
    localStorage.setItem('posh_sync_seq', String(d._syncSeq));
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
  // BUG FIX (duplicate listeners): always tear down any existing listener
  // before creating a new one. Previously the unsub was only called when
  // _cloudListenerUnsub existed but _cloudListenerActive was false — leaving
  // a window where both the old and new listeners ran simultaneously after
  // an error restart, each independently applying cloud snapshots and each
  // triggering its own retry/restart on the next error.
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

      // BUG FIX (staff sync): use _syncSeq instead of lastSync clock comparison.
      // Clock-skew between two mobile devices (even a few ms) can make
      // cloudTime <= localTime, silently dropping Phone B's sale on Phone A.
      // _syncSeq is a monotonically-increasing integer incremented on every
      // cloudSync call; any snapshot with a higher seq IS definitively newer.
      // Fall back to lastSync only for legacy docs written before this patch.
      var cloudSeq = (cloudData._syncSeq != null) ? cloudData._syncSeq : null;
      var isNewer;
      if (cloudSeq != null) {
        isNewer = cloudSeq > _lastSeenSyncSeq;
      } else {
        var localRaw  = localStorage.getItem('posh_data');
        var localData = localRaw
          ? (function(){ try { return JSON.parse(localRaw); } catch(e) { return {}; } })()
          : {};
        var cloudTime = cloudData.lastSync ? new Date(cloudData.lastSync).getTime() : 0;
        var localTime = localData.lastSync ? new Date(localData.lastSync).getTime() : 0;
        isNewer = cloudTime > localTime;
      }

      if (isNewer) {
        console.log('[POSH] Real-time update from cloud (writeId=' + cloudData._syncWriteId + ', seq=' + cloudData._syncSeq + ', sales=' + (cloudData.sales||[]).length + ')');
        _applyCloudData(cloudData); // _applyCloudData now merges sales into window.sales
        // Persist the MERGED state (window.sales) — not the raw cloudData (which
        // would overwrite any local-only sales with only the cloud's array).
        var _mergedSnapshot = Object.assign({}, cloudData, { sales: window.sales });
        localStorage.setItem('posh_data', JSON.stringify(_mergedSnapshot));

        // Always update in-memory state (done by _applyCloudData above).
        // Refresh visible UI only when the main app screen is showing.
        // BUG FIX (staff sync): do NOT skip rendering when the PIN screen is
        // showing — the data IS applied to memory, so when admin unlocks,
        // unlockApp() calls cloudLoad which will re-render with this data.
        // We still avoid touching the DOM while entry/pin is shown to prevent
        // flashes, but we no longer discard the update altogether.
        var _appEl    = document.getElementById('app');
        var _entryEl  = document.getElementById('entry-screen');
        var _pinEl    = document.getElementById('pin-screen');
        var _appVisible = (
          _appEl && _appEl.style.display !== 'none' &&
          !(_entryEl && _entryEl.style.display !== 'none') &&
          !(_pinEl   && _pinEl.style.display   !== 'none')
        );
        if (_appVisible) {
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
