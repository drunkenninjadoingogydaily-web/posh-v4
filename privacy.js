// ═══════════════════════════════════════════════════════
//  POSH — Privacy & Storage Mode (privacy.js)
//  Controls cloud vs local-only data storage.
//  Loaded after app.js and quickwins.js.
// ═══════════════════════════════════════════════════════

// ── CONSTANTS ──────────────────────────────────────────
const STORAGE_MODE_KEY     = 'posh_storage_mode';     // 'cloud' | 'local'
const BANNER_DISMISS_KEY   = 'posh_banner_dismissed'; // timestamp of dismissal
const BANNER_DISMISS_MS    = 7 * 24 * 60 * 60 * 1000; // 7 days in ms

// ── CORE HELPERS ───────────────────────────────────────

/**
 * Returns current storage mode: 'cloud' (default).
 */
function getStorageMode() {
  return localStorage.getItem(STORAGE_MODE_KEY) || 'cloud';
}

/**
 * Persists the chosen storage mode.
 * @param {'cloud'|'local'} mode
 */
function setStorageMode(mode) {
  if (mode !== 'cloud' && mode !== 'local') {
    console.warn('[POSH Privacy] Invalid mode:', mode);
    return;
  }
  localStorage.setItem(STORAGE_MODE_KEY, mode);
  // Clear any pending dismiss so the banner re-appears for the new mode
  localStorage.removeItem(BANNER_DISMISS_KEY);
}

/**
 * Returns true if the banner was dismissed within the last 7 days.
 */
function _isBannerDismissed() {
  const ts = parseInt(localStorage.getItem(BANNER_DISMISS_KEY) || '0', 10);
  return ts > 0 && (Date.now() - ts) < BANNER_DISMISS_MS;
}

// ── BANNER ─────────────────────────────────────────────

/**
 * Renders and shows the top storage-mode banner.
 * @param {boolean} [forceShow] - skip dismiss check (used in Settings)
 */
function showStorageModeBanner(forceShow) {
  const banner = document.getElementById('storage-mode-banner');
  if (!banner) return;

  const mode = getStorageMode();
  const isLocal = mode === 'local';

  // Apply colour class
  banner.classList.toggle('banner-local', isLocal);
  banner.classList.toggle('banner-cloud', !isLocal);

  // Fill text/icon
  const iconEl = document.getElementById('banner-icon');
  const textEl = document.getElementById('banner-text');
  if (iconEl) iconEl.textContent = isLocal ? '🔒' : '☁️';
  if (textEl) textEl.textContent = isLocal
    ? 'Local Mode — Data saved on this device only'
    : 'Cloud Mode — Syncing across devices';

  // Show/hide the switch button (always in local; optional in cloud)
  const switchBtn = document.getElementById('banner-switch-btn');
  if (switchBtn) switchBtn.style.display = isLocal ? 'inline-flex' : 'none';

  // Decide visibility
  if (forceShow) {
    banner.classList.add('show');
    return;
  }

  if (_isBannerDismissed()) {
    banner.classList.remove('show');
    return;
  }

  banner.classList.add('show');

  // Cloud mode: auto-dismiss after 3 seconds
  if (!isLocal) {
    setTimeout(() => dismissStorageModeBanner(), 3000);
  }
}

/**
 * Hides the banner and records a 7-day dismissal timestamp.
 */
function dismissStorageModeBanner() {
  const banner = document.getElementById('storage-mode-banner');
  if (banner) banner.classList.remove('show');
  localStorage.setItem(BANNER_DISMISS_KEY, String(Date.now()));
}

// ── SYNC-BANNER (firebase cloud indicator) ─────────────

/**
 * The #sync-banner is a fixed pill injected/shown by firebase.js when
 * cloud sync is active.  When the user is in Local Mode we must hide it
 * (and keep it hidden) because firebase.js may still run and try to show it.
 */
function _hideSyncBannerIfLocal() {
  if (getStorageMode() !== 'local') return;
  const sb = document.getElementById('sync-banner');
  if (!sb) return;
  sb.style.display = 'none';
  sb.textContent = '';
}

/**
 * Observe future changes to #sync-banner by firebase.js and suppress them
 * whenever storage mode is 'local'.  Called once during init.
 */
var _syncBannerObserver = null; // BUG FIX: track observer to avoid accumulation
function _watchSyncBanner() {
  const sb = document.getElementById('sync-banner');
  if (!sb || typeof MutationObserver === 'undefined') return;

  // BUG FIX: disconnect any previous observer before creating a new one
  if (_syncBannerObserver) { try { _syncBannerObserver.disconnect(); } catch(e) {} }

  _syncBannerObserver = new MutationObserver(function () {
    if (getStorageMode() === 'local') {
      sb.style.display = 'none';
    }
  });
  _syncBannerObserver.observe(sb, { attributes: true, childList: true, subtree: true, characterData: true });
}

// ── SETTINGS RADIO SYNC ────────────────────────────────

/** Reflects the current mode in the Settings radio buttons. */
function _syncSettingsRadios() {
  const mode = getStorageMode();
  const cloudRadio = document.getElementById('mode-cloud');
  const localRadio = document.getElementById('mode-local');
  if (cloudRadio) cloudRadio.checked = (mode === 'cloud');
  if (localRadio) localRadio.checked = (mode === 'local');
  // Also update subtext
  const storageSubEl = document.getElementById('storage-mode-setting-sub');
  if (storageSubEl) {
    storageSubEl.textContent = mode === 'local'
      ? '🔒 Local Only — offline, single device'
      : '☁️ Cloud Backup — syncing in real-time';
  }
}

// ── CONFIRMATION MODAL ─────────────────────────────────

/**
 * Opens the switch-mode confirmation modal.
 * Called from Settings "Switch Mode" button.
 */
function openModeConfirmModal() {
  const currentMode = getStorageMode();
  const targetMode  = currentMode === 'cloud' ? 'local' : 'cloud';
  const modal       = document.getElementById('storage-confirm-modal');
  const ov          = document.getElementById('storage-confirm-ov');
  if (!modal || !ov) return;

  const titleEl   = document.getElementById('scm-title');
  const bodyEl    = document.getElementById('scm-body');
  const confirmEl = document.getElementById('scm-confirm-btn');

  if (targetMode === 'local') {
    // Cloud → Local
    if (titleEl) titleEl.textContent = 'Switch to Local Mode?';
    if (bodyEl) bodyEl.innerHTML = `
      <p class="scm-warning-text">
        ⚠️ Cloud sync will stop immediately. Your data <strong>remains on Firebase</strong> but this device
        will no longer upload or download changes.
      </p>
      <p class="scm-tip-text">Export a backup before switching if you need a local copy.</p>
      <button class="btn btn-secondary btn-full scm-export-btn" onclick="exportCSV();toast('📤 CSV downloaded — now switch when ready.')">
        📥 Export CSV first
      </button>`;
    if (confirmEl) confirmEl.textContent = 'Switch to Local 🔒';
  } else {
    // Local → Cloud
    if (titleEl) titleEl.textContent = 'Switch to Cloud Mode?';
    if (bodyEl) bodyEl.innerHTML = `
      <p class="scm-warning-text">
        ☁️ On your next app load, all local data will sync to Firebase. Other devices will start
        receiving real-time updates.
      </p>
      <p class="scm-tip-text">Make sure you're signed in and have an internet connection.</p>`;
    if (confirmEl) confirmEl.textContent = 'Switch to Cloud ☁️';
  }

  // Wire confirm button
  if (confirmEl) {
    confirmEl.onclick = function () {
      _applyModeSwitch(targetMode);
    };
  }

  modal.classList.add('open');
  ov.classList.add('show');
}

function closeModeConfirmModal() {
  const modal = document.getElementById('storage-confirm-modal');
  const ov    = document.getElementById('storage-confirm-ov');
  if (modal) modal.classList.remove('open');
  if (ov)    ov.classList.remove('show');
}

/**
 * Commits the mode switch: saves, refreshes banner + Settings UI,
 * and starts/stops the cloud listener accordingly.
 */
function _applyModeSwitch(targetMode) {
  closeModeConfirmModal();
  setStorageMode(targetMode);
  _syncSettingsRadios();
  showStorageModeBanner();

  if (targetMode === 'local') {
    // BUG FIX: cancel any debounced or retrying cloudSync BEFORE stopping the
    // listener.  Without this, a sync already queued within its 2-second window
    // fires after the switch and sends a rogue write to Firestore in local mode.
    if (typeof cancelPendingSync === 'function') cancelPendingSync();
    // Stop real-time listener if running
    if (typeof stopCloudListener === 'function') stopCloudListener();
    // Hide the firebase sync indicator immediately
    var sb = document.getElementById('sync-banner');
    if (sb) { sb.style.display = 'none'; sb.textContent = ''; }
    toast('🔒 Switched to Local Mode');
  } else {
    // Restart cloud sync
    if (typeof cloudLoad === 'function') {
      cloudLoad(function (updated) {
        if (updated && typeof renderDashboard === 'function') renderDashboard();
        if (typeof startCloudListener === 'function') startCloudListener();
      });
    }
    toast('☁️ Switched to Cloud Mode');
  }
}

// ── INIT ───────────────────────────────────────────────

/**
 * Entry point — called once on app load (from quickwins.js).
 * Shows the banner and wires up Settings radio listeners.
 */
function initStorageMode() {
  // Show banner (respects 7-day dismiss)
  showStorageModeBanner();

  // If local mode: ensure the firebase #sync-banner is hidden immediately
  // (firebase.js may have already rendered "☁️ Syncing to cloud..." into it)
  _hideSyncBannerIfLocal();

  // Watch for future firebase injections and suppress them in local mode
  _watchSyncBanner();

  // Sync Settings radios to current mode
  _syncSettingsRadios();

  // Wire radio change → open confirm modal
  ['mode-cloud', 'mode-local'].forEach(function (id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', function () {
      // Revert the radio — only actually change via the confirm modal
      _syncSettingsRadios();
      openModeConfirmModal();
    });
  });
}

// ── EXPOSE GLOBALS ─────────────────────────────────────
// All functions used from HTML onclick attrs must be on window.
window.getStorageMode           = getStorageMode;
window.setStorageMode           = setStorageMode;
window.showStorageModeBanner    = showStorageModeBanner;
window.dismissStorageModeBanner = dismissStorageModeBanner;
window.openModeConfirmModal     = openModeConfirmModal;
window.closeModeConfirmModal    = closeModeConfirmModal;
window.initStorageMode          = initStorageMode;
