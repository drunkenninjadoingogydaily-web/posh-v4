// ═══════════════════════════════════════════════════════
//  POSH — image-sync.js
//  Cross-device product image sync via Firestore inline storage.
//
//  HOW IT WORKS (no Firebase Storage needed, stays free):
//  ┌─────────────────────────────────────────────────────┐
//  │  Phone A uploads image                              │
//  │    → compress to ≤15 KB (WebP/JPEG, 120×120px)     │
//  │    → save to localStorage (instant local display)   │
//  │    → write base64 into product.imgData              │
//  │    → saveData() → cloudSync() pushes to Firestore   │
//  │                                                     │
//  │  Phone B receives Firestore update                  │
//  │    → product.imgData arrives with product data      │
//  │    → image-sync.js extracts it to localStorage      │
//  │    → renders instantly — no extra round-trip        │
//  └─────────────────────────────────────────────────────┘
//
//  LOAD ORDER:  after app.js, firebase.js, product-images.js
//
//  FIRESTORE COST ANALYSIS (free tier):
//    • 1 product image ≈ 10 KB base64 ≈ 10,000 chars
//    • 50 products with images ≈ 500 KB
//    • Firestore doc limit: 1 MB  ✅
//    • Free storage: 1 GB         ✅
//    • Free writes: 20K/day       ✅ (debounced, same as cloudSync)
// ═══════════════════════════════════════════════════════

(function () {
  'use strict';

  // ── CONFIG ────────────────────────────────────────────
  //  Keep images tiny so they fit inside Firestore documents.
  //  Target: ≤ 15 KB base64 per image (≈ 11 KB binary).
  //  Strategy: shrink canvas → try WebP (better) → JPEG fallback
  //  Passes through multiple quality steps until size is met.

  const TARGET_MAX_CHARS = 15_000;   // ~15 KB base64 — fits Firestore comfortably
  const THUMB_SIZE       = 120;      // px — thumbnail stored on product (cross-device)
  const DISPLAY_SIZE     = 400;      // px — full size kept in localStorage for crisp display
  const QUALITY_STEPS    = [0.80, 0.65, 0.50, 0.35, 0.22]; // tried in order until size met
  const IMG_PREFIX       = 'posh_img_';
  const FIELD_NAME       = 'imgData'; // field on product object that travels via Firestore

  // ── Helpers ───────────────────────────────────────────
  const _log  = (...a) => console.log('[POSH image-sync]', ...a);
  const _warn = (...a) => console.warn('[POSH image-sync]', ...a);
  const _t    = msg => { if (typeof toast === 'function') toast(msg); };

  // ══════════════════════════════════════════════════════
  //  1. COMPRESSOR
  //     Produces TWO outputs from one source file:
  //       • thumb  — tiny base64 for Firestore (≤15 KB)
  //       • display — larger base64 for localStorage (crisp on-device)
  // ══════════════════════════════════════════════════════

  /**
   * Compress a File or Blob.
   * Returns { thumb, display } — both base64 data-URLs.
   * thumb  is ≤ TARGET_MAX_CHARS and safe to embed in Firestore.
   * display is the higher-res version stored only in localStorage.
   */
  async function compressImage(file) {
    const bitmap = await createImageBitmap(file).catch(() => null);
    if (!bitmap) throw new Error('Cannot decode image');

    const display = _drawAndEncode(bitmap, DISPLAY_SIZE, 0.82);
    const thumb   = await _compressToTarget(bitmap);
    bitmap.close?.();

    _log(`Compressed: display=${Math.round(display.length/1024)}KB  thumb=${Math.round(thumb.length/1024)}KB`);
    return { thumb, display };
  }

  /** Draw image into a canvas capped at maxPx × maxPx, return base64. */
  function _drawAndEncode(bitmap, maxPx, quality) {
    let w = bitmap.width;
    let h = bitmap.height;
    if (w > maxPx || h > maxPx) {
      const r = Math.min(maxPx / w, maxPx / h);
      w = Math.round(w * r);
      h = Math.round(h * r);
    }
    const canvas = document.createElement('canvas');
    canvas.width  = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    // Try WebP first (30–40% smaller than JPEG for the same quality)
    const webp = canvas.toDataURL('image/webp', quality);
    if (!webp.startsWith('data:image/webp')) {
      // Browser doesn't support WebP output — fall back to JPEG
      return canvas.toDataURL('image/jpeg', quality);
    }
    return webp;
  }

  /**
   * Iteratively shrink + recompress until thumb fits TARGET_MAX_CHARS.
   * Tries each quality step; if still too large, halves the canvas size
   * and retries. Guarantees a result even for enormous source images.
   */
  async function _compressToTarget(bitmap) {
    let size = THUMB_SIZE;

    for (let sizeStep = 0; sizeStep < 3; sizeStep++) {  // up to 3 size reductions
      for (const q of QUALITY_STEPS) {
        const result = _drawAndEncode(bitmap, size, q);
        if (result.length <= TARGET_MAX_CHARS) {
          _log(`Thumb fit at size=${size}px quality=${q} → ${result.length} chars`);
          return result;
        }
      }
      size = Math.round(size * 0.7);  // shrink canvas and retry
      _log(`Still too large — retrying at size=${size}px`);
    }

    // Last resort: 60×60 JPEG at lowest quality — always tiny
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 60;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, 60, 60);
    ctx.drawImage(bitmap, 0, 0, 60, 60);
    const fallback = canvas.toDataURL('image/jpeg', 0.20);
    _warn('Fallback compression used — very small image:', fallback.length);
    return fallback;
  }

  // Expose compressor for product-images.js to call
  window.POSH_COMPRESS = compressImage;

  // ══════════════════════════════════════════════════════
  //  2. INTERCEPT product-images.js resizeToBase64
  //     Replace the old single-output compressor with our
  //     dual-output one. product-images.js calls this when
  //     a user picks a file from the gallery.
  // ══════════════════════════════════════════════════════

  function _patchResizer() {
    // product-images.js exposes _applyFile indirectly via POSH_IMG_FORM.onFile.
    // We intercept at the POSH_IMG_FORM.onFile level.
    const tryPatch = () => {
      const form = window.POSH_IMG_FORM;
      if (!form || typeof form.onFile !== 'function') {
        setTimeout(tryPatch, 200);
        return;
      }
      const _origOnFile = form.onFile.bind(form);
      form.onFile = async function (input) {
        const file = input?.files?.[0];
        if (!file) return;
        input.value = ''; // reset immediately

        // Show processing state via existing preview box
        const preview = document.getElementById('pf-img-preview');
        if (preview) {
          preview.innerHTML = `<div style="font-size:10px;color:var(--muted);text-align:center">
            ⏳ Compressing…</div>`;
        }

        try {
          const { thumb, display } = await compressImage(file);

          // Store display-res in localStorage for crisp on-device rendering
          // (this mirrors what product-images.js used to do)
          window._poshPendingDisplay = display;
          window._poshPendingThumb   = thumb;

          // Show display-res in the form preview
          const picker = document.getElementById('emoji-picker');
          if (picker && typeof window.POSH_IMG_FORM._buildAndSetUI === 'function') {
            window.POSH_IMG_FORM._buildAndSetUI(display);
          } else if (preview) {
            preview.innerHTML = `<img src="${display}"
              style="width:100%;height:100%;object-fit:cover;border-radius:10px;display:block"/>`;
          }

          // Also update the internal _pendingImg used by product-images.js saveProduct patch
          // We do this by re-triggering its internal state via a synthetic approach:
          // product-images.js reads window._poshPendingImg — we set that alias
          window._poshPendingImg = display; // display version for localStorage
        } catch (err) {
          _warn('Compression failed:', err);
          _t('⚠️ Could not compress image — try a different photo');
          if (preview) {
            preview.innerHTML = `<span style="font-size:36px">📦</span>`;
          }
        }
      };
      _log('Patched POSH_IMG_FORM.onFile ✅');
    };
    tryPatch();
  }

  // ══════════════════════════════════════════════════════
  //  3. PATCH saveProduct — embed thumb in product.imgData
  //     This is what makes the image travel to phone B via Firestore.
  // ══════════════════════════════════════════════════════

  function _patchSaveProduct() {
    const tryPatch = () => {
      if (typeof window.saveProduct !== 'function') {
        setTimeout(tryPatch, 300);
        return;
      }
      const _orig = window.saveProduct;
      window.saveProduct = function () {
        // Capture pending thumb BEFORE _orig clears state
        const thumb   = window._poshPendingThumb   || null;
        const display = window._poshPendingDisplay || null;

        _orig.apply(this, arguments);

        if (!thumb && !display) return; // no new image — nothing to embed

        setTimeout(() => {
          const prods = typeof products !== 'undefined' ? products : [];
          // Find the product that was just saved (newest, or by editing id)
          let target = null;
          const editId = window._poshEditingId; // set by product-images.js patch
          if (editId != null) target = prods.find(p => p.id === editId);
          if (!target && prods.length) target = prods[prods.length - 1];
          if (!target) return;

          // Embed the thumbnail in the product object → travels via Firestore
          if (thumb) {
            target[FIELD_NAME] = thumb;
            _log(`Embedded imgData on product #${target.id} (${thumb.length} chars)`);
          }

          // Store display-res in localStorage for crisp local rendering
          if (display) {
            try {
              localStorage.setItem(IMG_PREFIX + target.id, display);
            } catch (e) {
              // localStorage full — use thumb as fallback
              try { localStorage.setItem(IMG_PREFIX + target.id, thumb || display); } catch {}
              _t('⚠️ Storage almost full — using compressed image');
            }
          }

          // Persist and re-render
          if (typeof saveData    === 'function') saveData();
          if (typeof renderSales === 'function') renderSales();
          if (typeof renderInv   === 'function') renderInv();

          // Clear pending state
          window._poshPendingThumb   = null;
          window._poshPendingDisplay = null;
        }, 120);
      };
      _log('Patched saveProduct for imgData embed ✅');
    };
    tryPatch();
  }

  // ══════════════════════════════════════════════════════
  //  4. PATCH deleteProduct — remove imgData from product
  //     and clear localStorage entry
  // ══════════════════════════════════════════════════════

  function _patchDeleteProduct() {
    const tryPatch = () => {
      const name = typeof window.deleteProduct === 'function' ? 'deleteProduct'
                 : typeof window.removeProduct === 'function' ? 'removeProduct'
                 : null;
      if (!name) { setTimeout(tryPatch, 400); return; }
      const _orig = window[name];
      window[name] = function (id) {
        // Remove imgData from the product before deletion
        const prods = typeof products !== 'undefined' ? products : [];
        const p = prods.find(x => x.id === id);
        if (p) delete p[FIELD_NAME];
        // Remove from localStorage
        try { localStorage.removeItem(IMG_PREFIX + id); } catch {}
        _orig.apply(this, arguments);
      };
      _log(`Patched ${name} for imgData cleanup ✅`);
    };
    tryPatch();
  }

  // ══════════════════════════════════════════════════════
  //  5. INBOUND SYNC — extract imgData when Firestore
  //     delivers products to this device (phone B side)
  //
  //  firebase.js sets window.products from cloud data and
  //  then calls renderDashboard(). We hook into that moment
  //  to extract imgData → localStorage so renders show images.
  // ══════════════════════════════════════════════════════

  function _extractInboundImages(prods) {
    if (!Array.isArray(prods)) return;
    let count = 0;
    prods.forEach(p => {
      if (!p[FIELD_NAME]) return;
      const key     = IMG_PREFIX + p.id;
      const stored  = localStorage.getItem(key);
      // Only write if different (avoids unnecessary writes on phone A)
      if (stored !== p[FIELD_NAME]) {
        try {
          localStorage.setItem(key, p[FIELD_NAME]);
          count++;
        } catch (e) {
          _warn('Could not cache inbound image locally:', p.id, e);
        }
      }
    });
    if (count) _log(`Extracted ${count} inbound image(s) from Firestore data ✅`);
  }

  function _patchCloudLoad() {
    // Hook into window.cloudLoad (defined in firebase.js)
    const tryPatch = () => {
      if (typeof window.cloudLoad !== 'function') {
        setTimeout(tryPatch, 300);
        return;
      }
      const _orig = window.cloudLoad;
      window.cloudLoad = function (callback) {
        _orig.call(this, function (updated) {
          if (updated && typeof products !== 'undefined') {
            _extractInboundImages(products);
          }
          if (callback) callback(updated);
        });
      };
      _log('Patched cloudLoad for inbound image extraction ✅');
    };
    tryPatch();
  }

  function _patchRenderDashboard() {
    // firebase.js real-time listener calls renderDashboard() after updating
    // window.products — intercept to extract images from the new data.
    const tryPatch = () => {
      if (typeof window.renderDashboard !== 'function') {
        setTimeout(tryPatch, 300);
        return;
      }
      const _orig = window.renderDashboard;
      window.renderDashboard = function () {
        if (typeof products !== 'undefined') {
          _extractInboundImages(products);
        }
        _orig.apply(this, arguments);
      };
      _log('Patched renderDashboard for inbound image extraction ✅');
    };
    tryPatch();
  }

  // ══════════════════════════════════════════════════════
  //  6. RENDER PATCH — prefer local localStorage (display-res)
  //     then fall back to product.imgData (thumb, cross-device)
  //     This replaces the _resolveImgSrc from product-images.js.
  // ══════════════════════════════════════════════════════

  function _resolveImgSrc(pid) {
    // 1. localStorage: display-res version on this device (best quality)
    try {
      const local = localStorage.getItem(IMG_PREFIX + pid);
      if (local) return local;
    } catch {}
    // 2. product.imgData: thumbnail synced via Firestore (cross-device fallback)
    if (typeof products !== 'undefined') {
      const p = products.find(x => String(x.id) === String(pid));
      if (p && p[FIELD_NAME]) return p[FIELD_NAME];
    }
    return null;
  }

  // Override the version set by product-images.js
  window._poshResolveImgSrc = _resolveImgSrc;

  // ══════════════════════════════════════════════════════
  //  7. MIGRATION — convert existing localStorage images
  //     to imgData on products (for existing users who
  //     already have images stored from before this update)
  // ══════════════════════════════════════════════════════

  async function _migrateExistingImages() {
    const prods = typeof products !== 'undefined' ? products : [];
    if (!prods.length) return;

    let migrated = 0;
    for (const p of prods) {
      if (p[FIELD_NAME]) continue; // already has cloud-ready thumb
      const local = localStorage.getItem(IMG_PREFIX + p.id);
      if (!local) continue;

      // Re-compress existing image to thumb size
      try {
        const res = await fetch(local);
        const blob = await res.blob();
        const { thumb } = await compressImage(blob);
        p[FIELD_NAME] = thumb;
        migrated++;
      } catch (e) {
        // If fetch fails (e.g. data URL), try directly
        try {
          // data: URLs can be used as image src directly — create blob from it
          const arr  = local.split(',');
          const mime = arr[0].match(/:(.*?);/)[1];
          const bstr = atob(arr[1]);
          const bytes = new Uint8Array(bstr.length);
          for (let i = 0; i < bstr.length; i++) bytes[i] = bstr.charCodeAt(i);
          const blob = new Blob([bytes], { type: mime });
          const { thumb } = await compressImage(blob);
          p[FIELD_NAME] = thumb;
          migrated++;
        } catch (e2) {
          _warn('Could not migrate image for product', p.id, e2);
        }
      }
    }

    if (migrated) {
      _log(`Migrated ${migrated} existing image(s) to imgData ✅`);
      if (typeof saveData === 'function') saveData(); // push to Firestore
    }
  }

  // ══════════════════════════════════════════════════════
  //  8. STORAGE STATS — update Settings display to show
  //     both localStorage KB and Firestore imgData count
  // ══════════════════════════════════════════════════════

  function _updateStorageStats() {
    const el = document.getElementById('posh-img-storage-info');
    if (!el) return;

    let localKB = 0;
    let localCount = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(IMG_PREFIX)) {
        localKB += (localStorage.getItem(k) || '').length;
        localCount++;
      }
    }
    localKB = Math.round(localKB / 1024);

    const prods = typeof products !== 'undefined' ? products : [];
    const cloudCount = prods.filter(p => p[FIELD_NAME]).length;

    el.textContent = `${localCount} local · ${cloudCount} synced · ${localKB} KB`;
  }

  // Refresh stats when Settings is opened
  (function watchSettings() {
    const tryWatch = () => {
      const _origSwitch = window.switchTab;
      if (typeof _origSwitch !== 'function') { setTimeout(tryWatch, 400); return; }
      window.switchTab = function (tab) {
        _origSwitch.apply(this, arguments);
        if (tab === 'settings') setTimeout(_updateStorageStats, 150);
      };
    };
    tryWatch();
  })();

  // ══════════════════════════════════════════════════════
  //  INIT
  // ══════════════════════════════════════════════════════

  function _init() {
    _patchResizer();
    _patchSaveProduct();
    _patchDeleteProduct();
    _patchCloudLoad();
    _patchRenderDashboard();

    // Run migration after app data is loaded (give app.js time to init)
    setTimeout(() => {
      if (typeof getStorageMode === 'function' && getStorageMode() === 'cloud') {
        _migrateExistingImages();
      }
    }, 2000);

    _log('Loaded ✅ — compressor active, Firestore inline image sync ready');
  }

  // Boot after DOM + app.js are ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    // DOMContentLoaded already fired — init after a tick so product-images.js
    // (loaded just before us) has had time to set up its patches
    setTimeout(_init, 100);
  }

})();
