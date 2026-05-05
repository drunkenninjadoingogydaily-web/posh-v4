// ═══════════════════════════════════════════════════════
//  POSH — Barcode Scanner  (barcode.js)
//  Add this AFTER app.js and quickwins.js in index.html:
//    <script src="barcode.js"></script>
//
//  Two scan modes:
//    • POS  mode  — scan barcode → find product → add to cart
//    • PRODUCT mode — scan barcode → fill pf-barcode field in product form
//
//  Detection strategy (auto-selected):
//    1. Native BarcodeDetector API  (Chrome 83+, Android, fast)
//    2. ZXing-js library            (iOS Safari, Firefox, fallback)
//    3. Manual text entry            (always available)
//
//  Also patches:
//    • openProductForm()  — restores saved barcode when editing
//    • renderSales()      — auto-match barcode typed into POS search
//    • Inventory screen   — scan button to quickly find a product
// ═══════════════════════════════════════════════════════

(function () {
  'use strict';

  // ─── State ────────────────────────────────────────────
  let _stream      = null;   // MediaStream
  let _scanMode    = 'pos';  // 'pos' | 'product'
  let _detecting   = false;
  let _detInterval = null;   // setInterval handle (BarcodeDetector path)
  let _zxingReader = null;   // ZXing reader (fallback path)
  let _torchOn     = false;
  let _lastCode    = '';
  let _lastCodeAt  = 0;
  const DEBOUNCE   = 2000;   // ms — ignore same barcode re-scanned within 2s

  // ─── Inject CSS ───────────────────────────────────────
  (function injectCSS () {
    if (document.getElementById('posh-scanner-css')) return;
    const style = document.createElement('style');
    style.id = 'posh-scanner-css';
    style.textContent = `
      /* Scan-line sweep animation */
      @keyframes posh-scan-sweep {
        0%,100% { transform:translateY(-50px); opacity:.25; }
        50%      { transform:translateY(50px);  opacity:1;   }
      }
      #scanner-sweep {
        animation: posh-scan-sweep 1.7s ease-in-out infinite;
      }

      /* Corner brackets for viewfinder */
      .sc-vf { position:relative; width:220px; height:130px; }
      .sc-vf::before, .sc-vf::after,
      .sc-vf .sc-vf-br::before, .sc-vf .sc-vf-br::after {
        content:''; position:absolute; width:22px; height:22px;
      }
      .sc-vf::before { top:0; left:0;
        border-top:3px solid var(--acc); border-left:3px solid var(--acc);
        border-radius:5px 0 0 0; }
      .sc-vf::after  { top:0; right:0;
        border-top:3px solid var(--acc); border-right:3px solid var(--acc);
        border-radius:0 5px 0 0; }
      .sc-vf .sc-vf-br::before { bottom:0; left:0;
        border-bottom:3px solid var(--acc); border-left:3px solid var(--acc);
        border-radius:0 0 0 5px; }
      .sc-vf .sc-vf-br::after  { bottom:0; right:0;
        border-bottom:3px solid var(--acc); border-right:3px solid var(--acc);
        border-radius:0 0 5px 0; }

      /* Punched-out viewfinder window using box-shadow */
      .sc-vf-shadow {
        position:absolute; inset:0;
        box-shadow: 0 0 0 9999px rgba(0,0,0,.52);
        border-radius: 8px;
        pointer-events:none;
      }

      /* Scan-result success chip */
      .sc-result-chip {
        background: var(--acc-l, rgba(255,184,0,.12));
        border: 1.5px solid var(--acc);
        border-radius: 12px;
        padding: 10px 14px;
        display: flex; align-items: center; gap: 10px;
      }

      /* Not-found chip */
      .sc-notfound-chip {
        background: var(--red-l, rgba(220,50,50,.1));
        border: 1.5px solid var(--red, #dc3232);
        border-radius: 12px;
        padding: 10px 14px;
        display: flex; align-items: center; gap: 10px;
      }

      #scanner-modal { z-index: 210; }
      #scanner-modal .modal-body { padding: 0; }
    `;
    document.head.appendChild(style);
  })();

  // ─── Scanner modal is defined in index.html ──────────
  //     (see the #scanner-modal element)

  // ─── Keep a list of items scanned in current POS session ──
  let _sessionItems = [];  // [{name, barcode, qty}]

  // ─── Open modal ───────────────────────────────────────
  window.openScannerModal = function (mode) {
    _scanMode = (mode === 'product') ? 'product' : (mode === 'inventory') ? 'inventory' : 'pos';
    _sessionItems = [];
    _lastCode = '';
    _lastCodeAt = 0;

    // Update title
    const titleEl = _$('scanner-modal-title');
    if (titleEl) {
      titleEl.textContent = _scanMode === 'product'
        ? '📷 Scan Product Barcode'
        : '📷 Scan to Add to Cart';
    }

    // Reset UI
    _clearFeedback();
    const manualEl = _$('scanner-manual-input');
    if (manualEl) manualEl.value = '';
    const recentWrap = _$('scanner-recent-wrap');
    if (recentWrap) recentWrap.style.display = 'none';
    const stripEl = _$('scanner-notfound-strip');
    if (stripEl) stripEl.style.display = 'none';
    const statusEl = _$('scanner-status');
    if (statusEl) statusEl.textContent = 'Align barcode within the frame';

    // Open
    _openModal('scanner-modal', 'scanner-ov');

    // Start camera
    _startCamera();
  };

  // ─── Shortcut called from product-form barcode button ─
  window.scanBarcodeForProduct = function () {
    window.openScannerModal('product');
  };

  // ─── Close modal ──────────────────────────────────────
  window.closeScannerModal = function () {
    _stopCamera();
    _closeModal('scanner-modal', 'scanner-ov');
    // Clear any pending state
    _lastCode = '';
    _lastCodeAt = 0;
    _sessionItems = [];
    _clearFeedback();
  };

  // ─── Torch toggle ─────────────────────────────────────
  window.toggleScannerTorch = function () {
    if (!_stream) return;
    const [track] = _stream.getVideoTracks();
    _torchOn = !_torchOn;
    track.applyConstraints({ advanced: [{ torch: _torchOn }] }).catch(() => {});
    const btn = _$('scanner-torch-btn');
    if (btn) btn.textContent = _torchOn ? '💡' : '🔦';
  };

  // ─── Manual barcode submission ─────────────────────────
  window.submitManualBarcode = function () {
    const input = _$('scanner-manual-input');
    const code  = input ? input.value.trim() : '';
    if (!code) {
      if (typeof toast === 'function') toast('⚠️ Enter a barcode first');
      // Focus the input if empty
      if (input) input.focus();
      return;
    }
    if (input) input.value = '';
    _handleBarcode(code);
  };

  // ─── Focus manual input when camera icon is clicked ────
  window.focusManualInput = function () {
    const input = _$('scanner-manual-input');
    if (input) {
      input.focus();
      input.select();
    }
  };

  // ─── Create product from scanner (not-found strip button) ─
  window.scannerCreateProduct = function () {
    const codeEl = _$('scanner-notfound-code');
    const code   = codeEl ? codeEl.textContent : '';
    window.closeScannerModal();
    // Open product form and pre-fill the barcode field
    if (typeof openProductForm === 'function') {
      openProductForm(null);
      setTimeout(() => {
        const bcInput = _$('pf-barcode');
        if (bcInput && code) bcInput.value = code;
      }, 120);
    }
  };

  // ══════════════════════════════════════════════════════
  //  CAMERA
  // ══════════════════════════════════════════════════════

  async function _startCamera () {
    const video   = _$('scanner-video');
    const noCam   = _$('scanner-no-cam');
    const statusEl = _$('scanner-status');
    if (!video) return;

    // Reset
    _detecting = false;
    if (_detInterval) { clearInterval(_detInterval); _detInterval = null; }
    if (_zxingReader) { try { _zxingReader.reset(); } catch (e) {} _zxingReader = null; }
    _torchOn = false;

    try {
      _stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width:  { ideal: 1280 },
          height: { ideal: 720 }
        }
      });
      video.srcObject = _stream;
      video.style.display = 'block';
      if (noCam) { noCam.style.display = 'none'; }
      if (statusEl) statusEl.textContent = 'Align barcode within the frame';

      // Show torch button if hardware supports it
      const [track] = _stream.getVideoTracks();
      if (track.getCapabilities) {
        const caps = track.getCapabilities();
        const torchBtn = _$('scanner-torch-btn');
        if (torchBtn) torchBtn.style.display = caps.torch ? 'flex' : 'none';
      }

      // Start detection once video is ready
      video.addEventListener('loadedmetadata', _startDetection, { once: true });

    } catch (err) {
      console.warn('POSH scanner camera error:', err);
      if (video) video.style.display = 'none';
      if (noCam) {
        noCam.style.display = 'flex';
      }
      if (statusEl) statusEl.textContent = '⚠️ Camera denied — use manual entry';
    }
  }

  function _stopCamera () {
    _detecting = false;
    if (_detInterval) { clearInterval(_detInterval); _detInterval = null; }
    if (_zxingReader) {
      try { _zxingReader.reset(); } catch (e) {}
      _zxingReader = null;
    }
    if (_stream) {
      _stream.getTracks().forEach(t => t.stop());
      _stream = null;
    }
    const video = _$('scanner-video');
    if (video) video.srcObject = null;
  }

  // ══════════════════════════════════════════════════════
  //  DETECTION — BarcodeDetector or ZXing
  // ══════════════════════════════════════════════════════

  async function _startDetection () {
    if (_detecting) return;
    _detecting = true;

    // ── Path A: Native BarcodeDetector (Chrome ≥ 83 / Android) ──
    if ('BarcodeDetector' in window) {
      const ALL_FORMATS = [
        'ean_13','ean_8','upc_a','upc_e',
        'code_128','code_39','code_93',
        'itf','codabar',
        'qr_code','data_matrix','aztec','pdf417'
      ];
      let formats = ALL_FORMATS;
      try {
        const supported = await BarcodeDetector.getSupportedFormats();
        formats = ALL_FORMATS.filter(f => supported.includes(f));
        if (formats.length === 0) formats = ['ean_13','code_128','qr_code'];
      } catch (e) {}

      const detector = new BarcodeDetector({ formats });
      const video    = _$('scanner-video');

      _detInterval = setInterval(async () => {
        if (!_detecting || !video || video.readyState < 2 || video.paused) return;
        try {
          const barcodes = await detector.detect(video);
          if (barcodes && barcodes.length > 0) {
            _handleBarcode(barcodes[0].rawValue);
          }
        } catch (_) { /* ignore per-frame errors */ }
      }, 120); // ~8 fps is enough

      return;
    }

    // ── Path B: ZXing fallback (load library dynamically) ──
    _loadZXing();
  }

  function _loadZXing () {
    if (window.ZXing) { _startZXing(); return; }
    const script  = document.createElement('script');
    script.src    = 'https://unpkg.com/@zxing/library@0.20.0/umd/index.min.js';
    script.onload = _startZXing;
    script.onerror = () => {
      const s = _$('scanner-status');
      if (s) s.textContent = '⚠️ Could not load scanner library — use manual entry';
    };
    document.head.appendChild(script);
  }

  function _startZXing () {
    if (!window.ZXing || !_stream) return;
    const video = _$('scanner-video');
    if (!video) return;

    try {
      _zxingReader = new ZXing.BrowserMultiFormatReader();
      _zxingReader.decodeFromStream(_stream, video, (result, err) => {
        if (result) _handleBarcode(result.getText());
      });
    } catch (e) {
      console.warn('POSH ZXing start error:', e);
    }
  }

  // ══════════════════════════════════════════════════════
  //  BARCODE HANDLING
  // ══════════════════════════════════════════════════════

  function _handleBarcode (code) {
    if (!code) return;
    const now = Date.now();
    // Debounce: skip if same code re-scanned too quickly
    if (code === _lastCode && (now - _lastCodeAt) < DEBOUNCE) return;
    _lastCode   = code;
    _lastCodeAt = now;

    // Haptic feedback
    if (navigator.vibrate) navigator.vibrate([60, 30, 60]);

    if (_scanMode === 'product') {
      _handleProductMode(code);
    } else if (_scanMode === 'inventory') {
      _handleInventoryMode(code);
    } else {
      _handlePosMode(code);
    }
  }

  // ── Product-form mode: fill pf-barcode & close ────────
  function _handleProductMode (code) {
    const bcInput = _$('pf-barcode');
    if (bcInput) bcInput.value = code;

    _showFeedback('success', '📷 Barcode scanned', code);

    const statusEl = _$('scanner-status');
    if (statusEl) statusEl.textContent = '✅ Barcode captured!';

    if (typeof toast === 'function') toast('📷 Barcode: ' + code);

    setTimeout(() => window.closeScannerModal(), 900);
  }

  // ── POS mode: find product → add to cart ──────────────
  function _handlePosMode (code) {
    const prods   = (typeof products !== 'undefined' ? products : []);
    const product = prods.find(
      p => p.barcode && p.barcode.toString().trim() === code.trim()
    );

    const statusEl = _$('scanner-status');
    const stripEl  = _$('scanner-notfound-strip');

    if (product) {
      // Hide not-found strip
      if (stripEl) stripEl.style.display = 'none';

      // Add to cart
      if (typeof addToCart === 'function') {
        addToCart(product.id);
      }

      // Show success feedback
      _showFeedback(
        'success',
        product.emoji ? product.emoji + ' ' + product.name : product.name,
        code
      );
      if (statusEl) statusEl.textContent = '✅ Added — scan another or close';

      // Track in session list
      const existing = _sessionItems.find(i => i.barcode === code);
      if (existing) {
        existing.qty++;
      } else {
        _sessionItems.push({ name: product.name, emoji: product.emoji || '📦', barcode: code, qty: 1 });
      }
      _renderRecentScans();

      if (typeof toast === 'function') toast('🛒 ' + product.name + ' added to cart');

    } else {
      // Product not found
      _showFeedback('notfound', '', code);
      if (statusEl) statusEl.textContent = '❓ Product not found — enter details or scan again';
      if (stripEl) {
        stripEl.style.display = 'block';
        const codeEl = _$('scanner-notfound-code');
        if (codeEl) codeEl.textContent = code;
      }
      if (typeof toast === 'function') toast('⚠️ No product with barcode ' + code);
    }
  }

  // ── Render "just added" session list ──────────────────
  function _renderRecentScans () {
    const wrap = _$('scanner-recent-wrap');
    const list = _$('scanner-recent-list');
    if (!wrap || !list || _sessionItems.length === 0) return;
    wrap.style.display = 'block';
    list.innerHTML = _sessionItems.slice(-4).reverse().map(item => `
      <div style="display:flex;align-items:center;gap:9px;padding:8px 11px;
                  background:var(--surf2);border-radius:10px">
        <span style="font-size:20px">${item.emoji}</span>
        <div style="flex:1">
          <div style="font-size:12px;font-weight:700;color:var(--text)">${item.name}</div>
          <div style="font-size:10px;color:var(--muted)">${item.barcode}</div>
        </div>
        <div style="font-size:12px;font-weight:800;color:var(--acc)">×${item.qty}</div>
      </div>`).join('');
  }

  // ── Feedback chip ─────────────────────────────────────
  function _showFeedback (type, label, sub) {
    const el = _$('scanner-feedback');
    if (!el) return;
    if (type === 'success') {
      el.innerHTML = `
        <div class="sc-result-chip">
          <span style="font-size:22px">✅</span>
          <div>
            <div style="font-size:11px;color:var(--muted);font-weight:700;
                        text-transform:uppercase;letter-spacing:.4px">Scanned</div>
            <div style="font-size:13px;font-weight:800;color:var(--text)">${_esc(label)}</div>
            <div style="font-size:10px;color:var(--muted)">${_esc(sub)}</div>
          </div>
        </div>`;
    } else {
      el.innerHTML = '';
    }
  }

  function _clearFeedback () {
    const el = _$('scanner-feedback');
    if (el) el.innerHTML = '';
  }

  // ══════════════════════════════════════════════════════
  //  PATCHES — integrate with existing app.js functions
  // ══════════════════════════════════════════════════════

  // ── 1. openProductForm — restore barcode when editing ─
  (function patchOpenProductForm () {
    const tryPatch = function () {
      const _orig = window.openProductForm;
      if (typeof _orig !== 'function') { setTimeout(tryPatch, 400); return; }
      window.openProductForm = function (id) {
        _orig.apply(this, arguments);
        // Wait for form to be populated then inject barcode
        setTimeout(() => {
          const input = _$('pf-barcode');
          if (!input) return;
          if (id !== null && id !== undefined) {
            const prods = typeof products !== 'undefined' ? products : [];
            const p = prods.find(x => x.id === id);
            input.value = (p && p.barcode) ? p.barcode : '';
          } else {
            input.value = '';
          }
        }, 60);
      };
    };
    tryPatch();
  })();

  // ── 2. saveProduct — persist barcode field ─────────────
  //    NOTE: app.js most likely already reads pf-barcode when building the
  //    product object (the field is in the HTML). This patch is a safety net
  //    for implementations that do not yet read it.
  (function patchSaveProduct () {
    const tryPatch = function () {
      const _orig = window.saveProduct;
      if (typeof _orig !== 'function') { setTimeout(tryPatch, 400); return; }
      window.saveProduct = function () {
        // Capture barcode BEFORE calling original (it might clear the form)
        const barcodeInput = _$('pf-barcode');
        const barcodeVal   = barcodeInput ? barcodeInput.value.trim() : '';

        _orig.apply(this, arguments);

        // If original saveProduct already wrote barcode to the product, nothing to do.
        // If not, patch the most recently saved/edited product.
        if (!barcodeVal) return;

        setTimeout(() => {
          const prods = typeof products !== 'undefined' ? products : [];
          if (!prods.length) return;

          // Determine which product was just saved
          // app.js usually sets a module-level editing ID; try common names:
          let editId = window._pformEditingId
                    || window._editingProductId
                    || window.pformEditingId
                    || null;

          let target = editId ? prods.find(p => p.id === editId) : null;
          if (!target) target = prods[prods.length - 1]; // last = newly added

          if (target && !target.barcode) {
            target.barcode = barcodeVal;
            if (typeof saveData === 'function') saveData();
          }
        }, 80);
      };
    };
    tryPatch();
  })();

  // ── 3. renderSales search — auto-add if query is a barcode ──
  (function patchRenderSales () {
    const tryPatch = function () {
      const _orig = window.renderSales;
      if (typeof _orig !== 'function') { setTimeout(tryPatch, 400); return; }
      window.renderSales = function () {
        const qInput = _$('sales-q');
        const q      = qInput ? qInput.value.trim() : '';

        // If the query looks like a barcode (6+ digits, no spaces), try auto-match
        if (/^\d{6,}$/.test(q)) {
          const prods = typeof products !== 'undefined' ? products : [];
          const match = prods.find(p => p.barcode && p.barcode.toString().trim() === q);
          if (match) {
            if (typeof addToCart === 'function') addToCart(match.id);
            if (typeof toast    === 'function') toast('🛒 ' + match.name + ' added to cart');
            if (qInput) qInput.value = '';
            // Still call original to re-render the product grid
            _orig.apply(this, arguments);
            return;
          }
        }
        _orig.apply(this, arguments);
      };
    };
    tryPatch();
  })();

  // ── 4. cloudSync — include barcode field in synced data ──
  //    Barcodes are stored ON the product objects, which are already synced.
  //    No extra patching needed — firebase.js syncs window.products as-is.

  // ══════════════════════════════════════════════════════
  //  INVENTORY SCAN BUTTON  (adds a 📷 button next to Inventory search)
  // ══════════════════════════════════════════════════════
  (function addInventoryScanBtn () {
    // Wait for DOM to be ready
    const tryAdd = function () {
      const header = document.querySelector('#screen-stock .screen-sticky-header');
      if (!header) { setTimeout(tryAdd, 600); return; }
      if (header.querySelector('#inv-scan-btn')) return; // already added

      const btn = document.createElement('button');
      btn.id          = 'inv-scan-btn';
      btn.className   = 'btn btn-secondary';
      btn.style.cssText = 'padding:7px 11px;font-size:11px';
      btn.textContent = '📷 Scan';
      btn.onclick     = () => {
        // In inventory, scanner looks up a product and scrolls to it
        _scanMode = 'inventory';
        window.openScannerModal('inventory');
      };

      const btnRow = header.querySelector('div[style*="display:flex"]');
      if (btnRow) btnRow.insertBefore(btn, btnRow.firstChild);
    };
    tryAdd();
  })();

  // ── Handle "inventory" mode (find & highlight product) ──

  function _handleInventoryMode (code) {
    const prods   = typeof products !== 'undefined' ? products : [];
    const product = prods.find(p => p.barcode && p.barcode.toString().trim() === code.trim());
    const statusEl = _$('scanner-status');

    if (product) {
      _showFeedback('success', (product.emoji || '📦') + ' ' + product.name, 'Stock: ' + product.stock);
      if (statusEl) statusEl.textContent = '✅ Found — opening product…';
      setTimeout(() => {
        window.closeScannerModal();
        if (typeof switchTab       === 'function') switchTab('stock');
        if (typeof openProductForm === 'function') openProductForm(product.id);
      }, 700);
    } else {
      _showFeedback('notfound', '', code);
      if (statusEl) statusEl.textContent = '❓ Not in inventory';
      const stripEl = _$('scanner-notfound-strip');
      if (stripEl) {
        stripEl.style.display = 'block';
        const codeEl = _$('scanner-notfound-code');
        if (codeEl) codeEl.textContent = code;
      }
    }
  }

  // ══════════════════════════════════════════════════════
  //  UTILITY HELPERS
  // ══════════════════════════════════════════════════════

  function _$ (id) { return document.getElementById(id); }

  function _esc (str) {
    return String(str || '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // Re-uses the existing _openModal / _closeModal helpers that app.js provides.
  // Falls back to a simple class toggle if they don't exist.
  function _openModal (modalId, ovId) {
    if (typeof _openModalFn === 'function') { _openModalFn(modalId, ovId); return; }
    const m = _$(modalId), o = _$(ovId);
    if (m) m.classList.add('open');
    // Overlay uses .show (not .open) — matches CSS .overlay.show { display:block }
    if (o) o.classList.add('show');
  }
  function _closeModal (modalId, ovId) {
    const m = _$(modalId), o = _$(ovId);
    if (m) m.classList.remove('open');
    if (o) o.classList.remove('show');
  }

  // Detect the helper name app.js uses internally (it's usually _openModal)
  let _openModalFn = null;
  setTimeout(() => {
    // app.js might expose it as window._openModal
    if (typeof window._openModal === 'function') _openModalFn = window._openModal;
  }, 200);

  console.log('POSH Barcode Scanner ready ✅  (BarcodeDetector:', 'BarcodeDetector' in window, ')');

})();
