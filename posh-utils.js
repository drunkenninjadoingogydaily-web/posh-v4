// ═══════════════════════════════════════════════════════
//  POSH — Utility Layer  (posh-utils.js)
//  Load AFTER app.js and BEFORE quickwins.js
//
//  Fixes three friction points identified in code review:
//   1.  DOM helpers       — replace all getElementById boilerplate
//   2.  State manager     — single save/load surface, no window sprawl
//   3.  Modal factory     — one function to rule all generic modals
//   4.  Customer Care tab — full in-app help, FAQ, support contact
// ═══════════════════════════════════════════════════════

(function (global) {
  'use strict';

  // ─────────────────────────────────────────────────────
  //  1. DOM HELPERS
  //  Replace document.getElementById() everywhere with
  //  these terse, null-safe wrappers.
  // ─────────────────────────────────────────────────────

  /**
   * Get element by id (null-safe)
   * @param {string} id
   * @returns {HTMLElement|null}
   */
  function qs(id) {
    return document.getElementById(id);
  }

  /**
   * Set textContent safely
   * @param {string} id
   * @param {string} text
   */
  function setText(id, text) {
    var el = qs(id);
    if (el) el.textContent = text;
  }

  /**
   * Set innerHTML safely
   * @param {string} id
   * @param {string} html
   */
  function setHTML(id, html) {
    var el = qs(id);
    if (el) el.innerHTML = html;
  }

  /**
   * Show or hide an element
   * @param {string} id
   * @param {boolean} visible
   * @param {string} [displayValue='flex'] css display value when visible
   */
  function setVisible(id, visible, displayValue) {
    var el = qs(id);
    if (!el) return;
    el.style.display = visible ? (displayValue || 'flex') : 'none';
  }

  /**
   * Toggle a CSS class on an element
   * @param {string} id
   * @param {string} cls
   * @param {boolean} force  — add if true, remove if false
   */
  function toggleClass(id, cls, force) {
    var el = qs(id);
    if (el) el.classList.toggle(cls, force);
  }

  /**
   * Get the value of an input/select element
   * @param {string} id
   * @returns {string}
   */
  function getVal(id) {
    var el = qs(id);
    return el ? el.value : '';
  }

  /**
   * Set the value of an input/select element
   * @param {string} id
   * @param {string} value
   */
  function setVal(id, value) {
    var el = qs(id);
    if (el) el.value = value;
  }

  // Expose DOM helpers globally so any file can use them
  global.qs         = qs;
  global.setText    = setText;
  global.setHTML    = setHTML;
  global.setVisible = setVisible;
  global.toggleClass = toggleClass;
  global.getVal     = getVal;
  global.setVal     = setVal;


  // ─────────────────────────────────────────────────────
  //  2. STATE MANAGER
  //  Single surface for all POSH data.  Wraps the existing
  //  global vars so nothing breaks — just adds structure.
  // ─────────────────────────────────────────────────────

  var PoshState = {
    /**
     * Returns a snapshot of all app state from existing globals.
     * Read-only; don't mutate the returned object.
     */
    snapshot: function () {
      return {
        products    : global.products    || [],
        sales       : global.sales       || [],
        expenses    : global.expenses    || [],
        debts       : global.debts       || [],
        cart        : global.cart        || [],
        dailyGoal   : global.dailyGoal   || 2000,
        shopName    : global.shopName    || 'POSH',
        adminPin    : global.adminPin    || '4321',
        staffPin    : global.staffPin    || '1234',
        darkMode    : global.darkMode    || false,
        idleMinutes : global.idleMinutes || 30,
        nextId      : global.nextId      || 500,
        nextDebtId  : global.nextDebtId  || 1,
        staffAccounts: global.staffAccounts || [],
        currentRole : global.currentRole || 'staff',
      };
    },

    /**
     * Commit a partial patch to global state, then persist.
     * Only keys in `patch` are changed.
     * @param {Object} patch
     */
    set: function (patch) {
      var allowed = ['products','sales','expenses','debts','cart','dailyGoal',
                     'shopName','adminPin','staffPin','darkMode','idleMinutes',
                     'nextId','nextDebtId','staffAccounts','currentRole'];
      allowed.forEach(function (key) {
        if (patch.hasOwnProperty(key)) {
          global[key] = patch[key];
        }
      });
      if (typeof saveData === 'function') saveData();
    },

    /**
     * Read a single key from global state.
     * @param {string} key
     * @returns {*}
     */
    get: function (key) {
      return global[key];
    },

    /**
     * Push one item into an array state key and save.
     * @param {'products'|'sales'|'expenses'|'debts'} key
     * @param {Object} item
     */
    push: function (key, item) {
      if (!Array.isArray(global[key])) global[key] = [];
      global[key].push(item);
      if (typeof saveData === 'function') saveData();
    },

    /**
     * Remove items from an array state key by predicate and save.
     * @param {'products'|'sales'|'expenses'|'debts'} key
     * @param {Function} predicate  — keep items where predicate returns true
     */
    filter: function (key, predicate) {
      if (!Array.isArray(global[key])) return;
      global[key] = global[key].filter(predicate);
      if (typeof saveData === 'function') saveData();
    },

    /**
     * Update one item in an array by id and save.
     * @param {'products'|'sales'|'expenses'|'debts'} key
     * @param {number|string} id
     * @param {Object} patch
     */
    updateById: function (key, id, patch) {
      if (!Array.isArray(global[key])) return;
      global[key] = global[key].map(function (item) {
        return item.id === id ? Object.assign({}, item, patch) : item;
      });
      if (typeof saveData === 'function') saveData();
    },
  };

  global.PoshState = PoshState;


  // ─────────────────────────────────────────────────────
  //  3. MODAL FACTORY
  //  Replace inline-HTML string modals with one function.
  //  Reuses the existing #gen-modal and #gen-modal-ov
  //  elements already in index.html.
  // ─────────────────────────────────────────────────────

  /**
   * Open the generic modal with a title and body HTML.
   *
   * @param {Object} opts
   * @param {string}   opts.title            — modal title text
   * @param {string}   opts.body             — inner HTML for the body
   * @param {string}  [opts.icon]            — emoji/icon prefix for title
   * @param {string}  [opts.confirmText]     — if set, shows a confirm button
   * @param {Function}[opts.onConfirm]       — callback for confirm button
   * @param {string}  [opts.cancelText]      — override cancel button label
   * @param {boolean} [opts.danger]          — confirm button styled red
   * @param {string}  [opts.width]           — max-width override e.g. '440px'
   */
  function openModal(opts) {
    var title   = opts.title   || '';
    var body    = opts.body    || '';
    var icon    = opts.icon    || '';

    // Title
    var titleEl = qs('gen-modal-title');
    if (titleEl) titleEl.textContent = (icon ? icon + '  ' : '') + title;

    // Body
    var bodyEl = qs('gen-modal-body');
    if (bodyEl) bodyEl.innerHTML = body;

    // Optional confirm/cancel row (injected after body if confirmText provided)
    if (opts.confirmText && bodyEl) {
      var cancelLabel = opts.cancelText || 'Cancel';
      var confirmCls  = opts.danger ? 'btn btn-danger' : 'btn btn-primary';
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:9px;margin-top:14px';
      row.innerHTML =
        '<button class="btn btn-secondary" style="flex:1" onclick="closeModal()">' +
          cancelLabel +
        '</button>' +
        '<button class="' + confirmCls + '" style="flex:2" id="_modal_confirm_btn">' +
          opts.confirmText +
        '</button>';
      bodyEl.appendChild(row);

      if (opts.onConfirm) {
        var confirmBtn = row.querySelector('#_modal_confirm_btn');
        if (confirmBtn) {
          confirmBtn.addEventListener('click', function () {
            closeModal();
            opts.onConfirm();
          });
        }
      }
    }

    // Width override
    var modalEl = qs('gen-modal');
    if (modalEl && opts.width) modalEl.style.maxWidth = opts.width;

    // Show
    if (typeof openGenModal === 'function') {
      // Delegate to existing openGenModal if it exists, passing already-set content
      if (modalEl) modalEl.classList.add('open');
      var ovEl = qs('gen-modal-ov');
      if (ovEl) ovEl.classList.add('show');
    } else {
      if (modalEl) modalEl.classList.add('open');
      var ovEl2 = qs('gen-modal-ov');
      if (ovEl2) ovEl2.classList.add('show');
    }
  }

  /** Close the generic modal */
  function closeModal() {
    var modalEl = qs('gen-modal');
    var ovEl    = qs('gen-modal-ov');
    if (modalEl) { modalEl.classList.remove('open'); modalEl.style.maxWidth = ''; }
    if (ovEl)    ovEl.classList.remove('show');
    // Also close via existing fn if present
    if (typeof closeGenModal === 'function') closeGenModal();
  }

  global.openModal  = openModal;
  global.closeModal = closeModal;


  // ─────────────────────────────────────────────────────
  //  4. CUSTOMER CARE PAGE
  //  Full in-app help tab.  Renders into #tab-care which
  //  must exist in index.html (see comment block below).
  //
  //  HTML to add to index.html nav:
  //    <button class="nav-btn" id="nav-care" onclick="showTab('care')">
  //      <span>🎧</span><span>Help</span>
  //    </button>
  //
  //  HTML to add to index.html body (alongside other tab divs):
  //    <div id="tab-care" class="tab-content" style="display:none"></div>
  // ─────────────────────────────────────────────────────

  var _careRendered = false;

  var CARE_FAQ = [
    {
      q: 'How do I add a product?',
      a: 'Go to the <strong>Stock</strong> tab → tap <strong>+ Add Product</strong>. Fill in the name, category, price, cost and stock. Tap Save.'
    },
    {
      q: 'How do I sell something?',
      a: 'Open the <strong>POS</strong> tab. Tap a product to add it to the cart. When done, tap <strong>Checkout</strong>, choose the payment method and confirm.'
    },
    {
      q: 'A customer paid on credit — how do I record it?',
      a: 'At checkout, choose <strong>Credit</strong>. The sale is recorded and the amount appears in the <strong>Credits</strong> tab. Tap a credit entry to mark it as paid when the customer settles up.'
    },
    {
      q: 'How do I sync data across two devices?',
      a: 'Switch to <strong>Cloud Mode</strong> in Settings → Storage Mode. Both devices must be logged in with the same owner account and have internet access.'
    },
    {
      q: 'How do I add a staff member?',
      a: 'Go to Settings → Staff Accounts (Admin only). Tap <strong>+ Add Staff</strong>, enter their name and PIN. Share the shop code with them so they can log in on another device.'
    },
    {
      q: 'My data disappeared after refreshing — what happened?',
      a: 'POSH stores data locally in your browser. Clearing browser data or switching to incognito will wipe it. Enable Cloud Mode to keep data safe across sessions.'
    },
    {
      q: 'How do I export my sales as a spreadsheet?',
      a: 'Go to <strong>Reports</strong> → scroll to the bottom → tap <strong>Export CSV</strong>. Open the downloaded file in Excel or Google Sheets.'
    },
    {
      q: 'How do I change the shop name or PIN?',
      a: 'Open the sidebar (☰) → Settings. You can change the shop name, Admin PIN and Staff PIN from there (Admin access required for PINs).'
    },
    {
      q: 'The barcode scanner is not working.',
      a: 'Make sure you have given the browser camera permission. Open the product form, tap the barcode icon and point the camera at the barcode until it beeps. Works best in good lighting.'
    },
    {
      q: 'How do I reset my PIN if I forgot it?',
      a: 'On the PIN screen, tap <strong>Forgot PIN?</strong>. Enter the registered phone number. If it matches, you can set a new PIN immediately. To change the registered phone, contact support.'
    },
  ];

  function _renderCare() {
    var tab = qs('tab-care');
    if (!tab) return;
    if (_careRendered) return;
    _careRendered = true;

    var shopCode = (typeof global.getShopCode === 'function')
      ? global.getShopCode()
      : (localStorage.getItem('posh_shop_code') || '—');

    var faqHTML = CARE_FAQ.map(function (item, i) {
      return (
        '<div class="care-faq-item" id="faq-item-' + i + '">' +
          '<button class="care-faq-q" onclick="window._toggleFaq(' + i + ')">' +
            '<span>' + item.q + '</span>' +
            '<span class="care-faq-arrow" id="faq-arrow-' + i + '">▸</span>' +
          '</button>' +
          '<div class="care-faq-a" id="faq-ans-' + i + '" style="display:none">' +
            item.a +
          '</div>' +
        '</div>'
      );
    }).join('');

    tab.innerHTML =
      '<div class="care-wrap">' +

        // ── Hero ──
        '<div class="care-hero">' +
          '<div class="care-hero-icon">🎧</div>' +
          '<h2 class="care-hero-title">Help & Support</h2>' +
          '<p class="care-hero-sub">Everything you need to get the most out of POSH</p>' +
        '</div>' +

        // ── Quick Actions ──
        '<div class="care-section">' +
          '<h3 class="care-section-title">Quick Actions</h3>' +
          '<div class="care-actions-grid">' +
            _careAction('📞', 'Call Support', 'tel:+254717385810', false) +
            _careAction('💬', 'WhatsApp Us', 'https://wa.me/254717385810?text=Hi%2C%20I%20need%20help%20with%20POSH%20(Shop%20Code%3A%20' + shopCode + ')', true) +
            _careAction('📧', 'Email Us', 'mailto:support@posh.ke?subject=POSH%20Support%20Request%20(' + shopCode + ')', true) +
            _careAction('📖', 'User Guide', 'https://posh.ke/guide', true) +
          '</div>' +
        '</div>' +

        // ── System Info ──
        '<div class="care-section">' +
          '<h3 class="care-section-title">Your App Info</h3>' +
          '<div class="care-info-card">' +
            _careInfoRow('🏪', 'Shop', '<span id="care-shop-name">' + _esc(global.shopName || 'POSH') + '</span>') +
            _careInfoRow('🔑', 'Shop Code', '<code class="care-code">' + shopCode + '</code>') +
            _careInfoRow('👤', 'Role', '<span id="care-role">' + (global.currentRole === 'admin' ? '👑 Admin' : '👤 Staff') + '</span>') +
            _careInfoRow('💾', 'Storage Mode', '<span id="care-storage">' + _getStorageLabel() + '</span>') +
            _careInfoRow('📱', 'App Version', 'SW v5 · DB v4') +
          '</div>' +
        '</div>' +

        // ── FAQ ──
        '<div class="care-section">' +
          '<h3 class="care-section-title">Frequently Asked Questions</h3>' +
          '<div class="care-faq">' + faqHTML + '</div>' +
        '</div>' +

        // ── Feedback ──
        '<div class="care-section">' +
          '<h3 class="care-section-title">Send Feedback</h3>' +
          '<div class="care-feedback-box">' +
            '<textarea id="care-feedback-text" class="field" rows="3" ' +
              'placeholder="Tell us what\'s working well, what\'s broken, or what you\'d love to see next…">' +
            '</textarea>' +
            '<button class="btn btn-primary" style="width:100%;margin-top:10px" ' +
              'onclick="window._sendFeedback()">' +
              '📤 Send via WhatsApp' +
            '</button>' +
          '</div>' +
        '</div>' +

        // ── Donate nudge ──
        '<div class="care-section care-donate-section">' +
          '<p class="care-donate-text">POSH is free forever. If it\'s saving you time, consider buying us a chai ☕</p>' +
          '<button class="btn btn-secondary" style="width:100%" onclick="openDonateModal()">' +
            '❤️ Support POSH' +
          '</button>' +
        '</div>' +

      '</div>'; // .care-wrap
  }

  function _careAction(icon, label, href, blank) {
    return (
      '<a class="care-action-btn" href="' + href + '"' +
        (blank ? ' target="_blank" rel="noopener"' : '') + '>' +
        '<span class="care-action-icon">' + icon + '</span>' +
        '<span class="care-action-label">' + label + '</span>' +
      '</a>'
    );
  }

  function _careInfoRow(icon, label, valueHTML) {
    return (
      '<div class="care-info-row">' +
        '<span class="care-info-icon">' + icon + '</span>' +
        '<span class="care-info-label">' + label + '</span>' +
        '<span class="care-info-value">' + valueHTML + '</span>' +
      '</div>'
    );
  }

  function _getStorageLabel() {
    var mode = (typeof getStorageMode === 'function') ? getStorageMode() : 'local';
    return mode === 'cloud' ? '☁️ Cloud' : '🔒 Local';
  }

  function _esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  global._toggleFaq = function (i) {
    var ans   = qs('faq-ans-' + i);
    var arrow = qs('faq-arrow-' + i);
    if (!ans) return;
    var open = ans.style.display !== 'none';
    ans.style.display   = open ? 'none' : 'block';
    if (arrow) arrow.textContent = open ? '▸' : '▾';
  };

  global._sendFeedback = function () {
    var text = getVal('care-feedback-text').trim();
    if (!text) { if (typeof toast === 'function') toast('⚠️ Write something first!'); return; }
    var shopCode = (typeof global.getShopCode === 'function')
      ? global.getShopCode()
      : (localStorage.getItem('posh_shop_code') || '—');
    var msg = encodeURIComponent(
      '[POSH Feedback]\nShop: ' + (global.shopName || 'POSH') +
      ' (' + shopCode + ')\n\n' + text
    );
    global.open('https://wa.me/254717385810?text=' + msg, '_blank');
  };

  // Called from showTab() — render on first visit
  global.initCareTab = function () {
    _renderCare();
    // Refresh dynamic values each visit
    setText('care-shop-name', global.shopName || 'POSH');
    setText('care-role', global.currentRole === 'admin' ? '👑 Admin' : '👤 Staff');
    setText('care-storage', _getStorageLabel());
  };


  // ─────────────────────────────────────────────────────
  //  5. INJECT CARE TAB CSS
  //  All care-tab styles injected here so no change to
  //  styles.css is required.
  // ─────────────────────────────────────────────────────
  (function injectStyles() {
    var css = [
      /* Care tab wrapper */
      '.care-wrap{padding:16px 16px 80px;max-width:540px;margin:0 auto}',

      /* Hero */
      '.care-hero{text-align:center;padding:28px 16px 20px}',
      '.care-hero-icon{font-size:2.8rem;margin-bottom:8px}',
      '.care-hero-title{font-size:1.35rem;font-weight:800;color:var(--text);margin:0 0 4px}',
      '.care-hero-sub{font-size:.88rem;color:var(--muted);margin:0}',

      /* Section */
      '.care-section{margin-bottom:22px}',
      '.care-section-title{font-size:.78rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin:0 0 10px}',

      /* Quick action grid */
      '.care-actions-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}',
      '.care-action-btn{display:flex;flex-direction:column;align-items:center;gap:6px;padding:14px 10px;background:var(--surf2);border:1px solid var(--brd);border-radius:14px;text-decoration:none;transition:transform .12s,box-shadow .12s}',
      '.care-action-btn:active{transform:scale(.96)}',
      '.care-action-icon{font-size:1.6rem}',
      '.care-action-label{font-size:.8rem;font-weight:600;color:var(--text);text-align:center}',

      /* Info card */
      '.care-info-card{background:var(--surf2);border:1px solid var(--brd);border-radius:14px;overflow:hidden}',
      '.care-info-row{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid var(--brd)}',
      '.care-info-row:last-child{border-bottom:none}',
      '.care-info-icon{font-size:1.1rem;width:24px;text-align:center;flex-shrink:0}',
      '.care-info-label{font-size:.84rem;color:var(--muted);flex:1}',
      '.care-info-value{font-size:.84rem;font-weight:600;color:var(--text);text-align:right}',
      '.care-code{background:var(--surf3,var(--surf));padding:2px 7px;border-radius:6px;font-family:monospace;font-size:.82rem;letter-spacing:.08em;color:var(--acc)}',

      /* FAQ */
      '.care-faq{background:var(--surf2);border:1px solid var(--brd);border-radius:14px;overflow:hidden}',
      '.care-faq-item{border-bottom:1px solid var(--brd)}',
      '.care-faq-item:last-child{border-bottom:none}',
      '.care-faq-q{display:flex;justify-content:space-between;align-items:center;gap:10px;width:100%;background:none;border:none;padding:13px 14px;font-size:.87rem;font-weight:600;color:var(--text);cursor:pointer;text-align:left;font-family:inherit}',
      '.care-faq-arrow{font-size:.9rem;color:var(--muted);flex-shrink:0;transition:transform .15s}',
      '.care-faq-a{padding:0 14px 13px;font-size:.84rem;color:var(--muted);line-height:1.5}',

      /* Feedback */
      '.care-feedback-box{background:var(--surf2);border:1px solid var(--brd);border-radius:14px;padding:14px}',

      /* Donate */
      '.care-donate-section{text-align:center;padding:4px 0 8px}',
      '.care-donate-text{font-size:.84rem;color:var(--muted);margin:0 0 12px}',
    ].join('\n');

    var style = document.createElement('style');
    style.id  = 'posh-utils-styles';
    style.textContent = css;
    document.head.appendChild(style);
  })();


  // ─────────────────────────────────────────────────────
  //  6. PATCH switchTab + allTabs TO ADD 'care' TAB
  //  Runs after DOMContentLoaded so app.js has already
  //  defined switchTab and allTabs.
  // ─────────────────────────────────────────────────────
  function _patchTabSystem() {
    // 1. Add 'care' to allTabs if not already present
    if (Array.isArray(global.allTabs) && !global.allTabs.includes('care')) {
      global.allTabs.push('care');
    }

    // 2. Wrap switchTab to call initCareTab when 'care' is selected
    var _origSwitchTab = global.switchTab;
    global.switchTab = function (tab) {
      _origSwitchTab && _origSwitchTab.call(this, tab);
      if (tab === 'care') {
        global.initCareTab();
      }
    };

    // 3. Staff CAN access care tab — patch role check
    //    The original switchTab blocks staff from certain tabs.
    //    We re-open 'care' by wrapping after the original call above
    //    already ran; initCareTab renders the content regardless.
  }

  // Wait until app.js is done (it defines allTabs and switchTab at parse time)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _patchTabSystem);
  } else {
    _patchTabSystem();
  }

  // ─────────────────────────────────────────────────────
  //  READY
  // ─────────────────────────────────────────────────────
  console.log('POSH Utils ready ✅');
  global.dispatchEvent(new Event('poshUtilsReady'));

})(window);
