// ═══════════════════════════════════════════════════════
//  POSH — product-images.js
//  Load LAST — after app.js, quickwins.js, barcode.js, features.js
//
//  What this does:
//   1. Wipes preinstalled demo products on first run
//   2. Replaces the emoji picker with a photo uploader
//      (camera capture + file upload + drag & drop)
//   3. Stores each image in its own localStorage key
//      posh_img_<productId>  →  "data:image/jpeg;base64,…"
//      (kept separate from posh_data so Firestore never touches them)
//   4. Patches every render site (POS grid, favourites strip,
//      cart sheet, inventory list, receipt modal) to show the
//      real photo where available, falling back to the emoji
//   5. Exposes window.POSH_IMAGES API so Firestore / Firebase
//      Storage integration can be wired later without touching
//      this file
// ═══════════════════════════════════════════════════════

(function () {
  'use strict';

  // ── Config ────────────────────────────────────────────
  const IMG_PREFIX   = 'posh_img_';   // localStorage key prefix
  const MAX_W        = 400;           // px — resize before storing
  const MAX_H        = 400;
  const JPEG_QUALITY = 0.82;
  const DEMO_MARKER  = '__posh_demo__'; // set on demo products

  // ── Helpers ───────────────────────────────────────────
  const $  = id => document.getElementById(id);
  const _t = msg => { if (typeof toast === 'function') toast(msg); };

  // ══════════════════════════════════════════════════════
  //  IMAGE STORAGE  (localStorage, Firestore-safe)
  // ══════════════════════════════════════════════════════

  /**
   * Public API — also accessible as window.POSH_IMAGES
   * so future Firestore / Firebase Storage code can call:
   *   POSH_IMAGES.get(id)
   *   POSH_IMAGES.set(id, base64)
   *   POSH_IMAGES.remove(id)
   *   POSH_IMAGES.all()         // {id: base64, …}
   *   POSH_IMAGES.import(map)   // bulk restore from backup
   */
  const IMAGES = {
    get(id) {
      try { return localStorage.getItem(IMG_PREFIX + id) || null; }
      catch { return null; }
    },
    set(id, base64) {
      try { localStorage.setItem(IMG_PREFIX + id, base64); return true; }
      catch (e) {
        // localStorage quota exceeded — try compressing further
        console.warn('POSH image storage full:', e);
        return false;
      }
    },
    remove(id) {
      try { localStorage.removeItem(IMG_PREFIX + id); } catch {}
    },
    all() {
      const out = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(IMG_PREFIX)) {
          const id = k.slice(IMG_PREFIX.length);
          out[id] = localStorage.getItem(k);
        }
      }
      return out;
    },
    import(map) {
      Object.entries(map || {}).forEach(([id, b64]) => {
        if (b64 && b64.startsWith('data:')) IMAGES.set(id, b64);
      });
    },
  };

  window.POSH_IMAGES = IMAGES;

  // ══════════════════════════════════════════════════════
  //  1. CLEAR PREINSTALLED DEMO PRODUCTS
  // ══════════════════════════════════════════════════════

  function clearDemoProducts() {
    const prods = typeof products !== 'undefined' ? products : null;
    if (!prods) return;

    const originalLen = prods.length;

    // Remove any product flagged as demo
    const demoIds = prods
      .filter(p => p[DEMO_MARKER] || p._demo || p.isDemo)
      .map(p => p.id);

    if (demoIds.length) {
      // Splice out demo products
      for (let i = prods.length - 1; i >= 0; i--) {
        if (demoIds.includes(prods[i].id)) prods.splice(i, 1);
      }
      // Remove their images too
      demoIds.forEach(id => IMAGES.remove(id));
    }

    // Also detect "default" demo data by checking for very specific
    // fish-market names that ship with POSH out of the box
    const DEMO_NAMES = [
      'omena', 'tilapia', 'nile perch', 'catfish', 'samaki',
      'sukuma', 'ugali', 'chapati', 'demo product', 'test product',
      'sample product',
    ];
    for (let i = prods.length - 1; i >= 0; i--) {
      const nameLower = (prods[i].name || '').toLowerCase();
      if (DEMO_NAMES.some(d => nameLower.includes(d))) {
        IMAGES.remove(prods[i].id);
        prods.splice(i, 1);
      }
    }

    if (prods.length < originalLen) {
      if (typeof saveData === 'function') saveData();
      if (typeof renderSales === 'function') renderSales();
      if (typeof renderInv   === 'function') renderInv();
      console.log(`POSH: removed ${originalLen - prods.length} demo product(s)`);
    }
  }

  // Run after app has loaded its data
  setTimeout(clearDemoProducts, 600);

  // ══════════════════════════════════════════════════════
  //  2. IMAGE RESIZER  (canvas → JPEG base64)
  // ══════════════════════════════════════════════════════

  function resizeToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = e => {
        const img = new Image();
        img.onerror = reject;
        img.onload = () => {
          // Compute dimensions keeping aspect ratio
          let w = img.naturalWidth;
          let h = img.naturalHeight;
          if (w > MAX_W || h > MAX_H) {
            const ratio = Math.min(MAX_W / w, MAX_H / h);
            w = Math.round(w * ratio);
            h = Math.round(h * ratio);
          }
          const canvas = document.createElement('canvas');
          canvas.width  = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          // White background so transparent PNGs look clean
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // ══════════════════════════════════════════════════════
  //  3. PRODUCT FORM — image uploader UI
  // ══════════════════════════════════════════════════════

  // Pending image for the currently open form
  let _pendingImg   = null;   // base64 string or null
  let _pendingEmoji = '📦';  // fallback emoji
  let _editingId    = null;   // product id being edited (null = new)

  function _buildUploaderUI(existingBase64, existingEmoji) {
    _pendingImg   = existingBase64 || null;
    _pendingEmoji = existingEmoji  || '📦';

    const hasImg  = !!existingBase64;
    const preview = hasImg
      ? `<img src="${existingBase64}"
              style="width:100%;height:100%;object-fit:cover;border-radius:10px;display:block"/>`
      : `<span id="pf-emoji-fallback" style="font-size:36px">${_pendingEmoji}</span>`;

    return `
      <!-- Hidden file input -->
      <input type="file" id="pf-img-file" accept="image/*"
             style="display:none" onchange="POSH_IMG_FORM.onFile(this)"/>
      <!-- Hidden camera capture input -->
      <input type="file" id="pf-img-cam" accept="image/*" capture="environment"
             style="display:none" onchange="POSH_IMG_FORM.onFile(this)"/>

      <div style="display:flex;align-items:flex-start;gap:12px">

        <!-- Preview box -->
        <div id="pf-img-preview"
             onclick="POSH_IMG_FORM.pickFile()"
             style="width:80px;height:80px;flex-shrink:0;border-radius:12px;
                    border:2px dashed var(--brd);background:var(--surf2);
                    display:flex;align-items:center;justify-content:center;
                    overflow:hidden;cursor:pointer;position:relative;
                    transition:border-color .15s"
             ondragover="event.preventDefault();this.style.borderColor='var(--acc)'"
             ondragleave="this.style.borderColor=''"
             ondrop="POSH_IMG_FORM.onDrop(event)">
          ${preview}
          ${hasImg ? `
            <button onclick="event.stopPropagation();POSH_IMG_FORM.removeImg()"
                    title="Remove image"
                    style="position:absolute;top:3px;right:3px;width:20px;height:20px;
                           border-radius:50%;background:rgba(0,0,0,.65);border:none;
                           color:#fff;font-size:12px;cursor:pointer;
                           display:flex;align-items:center;justify-content:center;
                           line-height:1;padding:0">×</button>` : ''}
        </div>

        <!-- Buttons column -->
        <div style="display:flex;flex-direction:column;gap:7px;flex:1">
          <button type="button" class="btn btn-secondary"
                  style="font-size:12px;padding:9px 12px;text-align:left"
                  onclick="POSH_IMG_FORM.openCamera()">
            📷 Take Photo
          </button>
          <button type="button" class="btn btn-secondary"
                  style="font-size:12px;padding:9px 12px;text-align:left"
                  onclick="POSH_IMG_FORM.pickFile()">
            🖼 Choose from Gallery
          </button>
          ${hasImg ? `
          <button type="button" class="btn btn-secondary"
                  style="font-size:12px;padding:9px 12px;text-align:left;color:var(--red-text)"
                  onclick="POSH_IMG_FORM.removeImg()">
            🗑 Remove Photo
          </button>` : ''}
          <div style="font-size:10px;color:var(--muted);margin-top:2px">
            Tap the box or drag & drop an image
          </div>
        </div>
      </div>`;
  }

  function _injectUploaderIntoForm(productId) {
    const picker = $('emoji-picker');
    if (!picker) return;

    _editingId = productId;

    const existing = productId != null ? IMAGES.get(productId) : null;
    let emoji = '📦';
    if (productId != null && typeof products !== 'undefined') {
      const p = products.find(x => x.id === productId);
      if (p) emoji = p.emoji || '📦';
    }

    picker.innerHTML = _buildUploaderUI(existing, emoji);
    picker.style.cssText = 'padding:0;margin:0;'; // reset emoji-picker flex defaults
  }

  // Exposed form helpers (called from inline HTML)
  window.POSH_IMG_FORM = {
    openCamera() {
      const el = $('pf-img-cam');
      if (el) el.click();
    },
    pickFile() {
      const el = $('pf-img-file');
      if (el) el.click();
    },
    async onFile(input) {
      const file = input.files[0];
      if (!file) return;
      await _applyFile(file);
      input.value = ''; // reset so same file can be picked again
    },
    onDrop(event) {
      event.preventDefault();
      const file = event.dataTransfer.files[0];
      if (file && file.type.startsWith('image/')) _applyFile(file);
      event.currentTarget.style.borderColor = '';
    },
    removeImg() {
      _pendingImg = null;
      const picker = $('emoji-picker');
      if (picker) picker.innerHTML = _buildUploaderUI(null, _pendingEmoji);
    },
  };

  async function _applyFile(file) {
    const preview = $('pf-img-preview');
    // Show loading state
    if (preview) {
      preview.innerHTML = `<div style="font-size:10px;color:var(--muted)">Processing…</div>`;
    }
    try {
      const b64 = await resizeToBase64(file);
      _pendingImg = b64;
      // Re-inject the uploader UI with the new image
      const picker = $('emoji-picker');
      if (picker) picker.innerHTML = _buildUploaderUI(b64, _pendingEmoji);
    } catch (err) {
      console.warn('POSH image resize error:', err);
      _t('⚠️ Could not process image — try a different file');
      if (preview) preview.innerHTML = `<span style="font-size:36px">${_pendingEmoji}</span>`;
    }
  }

  // ══════════════════════════════════════════════════════
  //  PATCH openProductForm — inject uploader on open
  // ══════════════════════════════════════════════════════

  (function patchOpenProductForm() {
    const tryPatch = () => {
      const _orig = window.openProductForm;
      if (typeof _orig !== 'function') { setTimeout(tryPatch, 300); return; }
      window.openProductForm = function (id) {
        _pendingImg  = null;
        _editingId   = id != null ? id : null;
        _orig.apply(this, arguments);
        // Inject uploader after app.js has populated the form
        setTimeout(() => _injectUploaderIntoForm(id != null ? id : null), 60);
      };
    };
    tryPatch();
  })();

  // ══════════════════════════════════════════════════════
  //  PATCH saveProduct — persist image on save
  // ══════════════════════════════════════════════════════

  (function patchSaveProduct() {
    const tryPatch = () => {
      const _orig = window.saveProduct;
      if (typeof _orig !== 'function') { setTimeout(tryPatch, 300); return; }
      window.saveProduct = function () {
        // Snapshot pending image BEFORE _orig clears the form
        const imgSnapshot  = _pendingImg;
        const editSnapshot = _editingId;

        _orig.apply(this, arguments);

        setTimeout(() => {
          const prods = typeof products !== 'undefined' ? products : [];

          // Determine which product was just saved / edited
          let target = null;
          if (editSnapshot != null) {
            target = prods.find(p => p.id === editSnapshot);
          }
          if (!target && prods.length) {
            target = prods[prods.length - 1]; // newest = just added
          }

          if (!target) return;

          if (imgSnapshot) {
            // Save image under the product's real ID
            const ok = IMAGES.set(target.id, imgSnapshot);
            if (!ok) _t('⚠️ Image could not be saved — storage may be full');
          } else if (editSnapshot != null && !imgSnapshot) {
            // User removed the photo while editing — delete stored image
            IMAGES.remove(target.id);
          }

          // Refresh renders so the new image shows immediately
          if (typeof renderSales === 'function') renderSales();
          if (typeof renderInv   === 'function') renderInv();

          // Reset pending state
          _pendingImg  = null;
          _editingId   = null;
        }, 80);
      };
    };
    tryPatch();
  })();

  // ══════════════════════════════════════════════════════
  //  PATCH deleteProduct — also remove its image
  // ══════════════════════════════════════════════════════

  (function patchDeleteProduct() {
    const tryPatch = () => {
      const _orig = window.deleteProduct || window.removeProduct;
      if (typeof _orig !== 'function') { setTimeout(tryPatch, 600); return; }
      const name = typeof window.deleteProduct === 'function' ? 'deleteProduct' : 'removeProduct';
      window[name] = function (id) {
        IMAGES.remove(id);
        _orig.apply(this, arguments);
      };
    };
    tryPatch();
  })();

  // ══════════════════════════════════════════════════════
  //  4. IMAGE ELEMENT HELPER
  //     Returns an <img> if the product has a stored photo,
  //     otherwise an emoji <span>.
  // ══════════════════════════════════════════════════════

  /**
   * _imgEl(productId, emoji, sizePx, borderRadius, style)
   * Returns an HTML string for the product visual.
   */
  function _imgEl(id, emoji, sizePx, radius, extraStyle) {
    const b64 = IMAGES.get(id);
    const sz  = sizePx   || 44;
    const rd  = radius   || '12px';
    const st  = extraStyle || '';
    if (b64) {
      return `<img src="${b64}"
                   style="width:${sz}px;height:${sz}px;object-fit:cover;
                          border-radius:${rd};display:block;flex-shrink:0;${st}"
                   loading="lazy" decoding="async"/>`;
    }
    return `<span style="font-size:${Math.round(sz * 0.5)}px;
                          width:${sz}px;height:${sz}px;
                          display:flex;align-items:center;justify-content:center;
                          flex-shrink:0;${st}">${emoji || '📦'}</span>`;
  }

  // Expose for use in other modules
  window._poshImgEl = _imgEl;

  // ══════════════════════════════════════════════════════
  //  5. RENDER PATCHES
  // ══════════════════════════════════════════════════════

  // ── 5a. POS product grid ──────────────────────────────
  (function patchRenderSales() {
    const tryPatch = () => {
      const _orig = window.renderSales;
      if (typeof _orig !== 'function') { setTimeout(tryPatch, 300); return; }
      window.renderSales = function () {
        _orig.apply(this, arguments);
        // After the grid has been rendered, swap every .prod-emoji-wrap
        // that still contains a plain emoji span with a real image if available
        document.querySelectorAll('.prod-card').forEach(card => {
          const pid = card.dataset.id || card.getAttribute('data-id');
          if (!pid) return;
          const b64 = IMAGES.get(pid);
          if (!b64) return;
          const wrap = card.querySelector('.prod-emoji-wrap');
          if (!wrap) return;
          wrap.innerHTML = `<img src="${b64}"
            style="width:100%;height:100%;object-fit:cover;border-radius:10px;display:block"/>`;
          wrap.style.cssText = 'width:44px;height:44px;border-radius:10px;overflow:hidden;margin:6px 0 8px;flex-shrink:0';
        });
      };
    };
    tryPatch();
  })();

  // ── 5b. Favourites strip ─────────────────────────────
  // app.js renders fav pills with emoji — patch after render
  (function patchRenderFavs() {
    const _origSwitch = window.switchTab;
    if (!_origSwitch) return;
    window.switchTab = function (tab) {
      _origSwitch.apply(this, arguments);
      if (tab === 'sales') setTimeout(_patchFavPills, 80);
    };
    // Also patch on initial load
    setTimeout(_patchFavPills, 800);
  })();

  function _patchFavPills() {
    document.querySelectorAll('.fav-pill').forEach(pill => {
      const pid = pill.dataset.id || pill.getAttribute('data-id');
      if (!pid) return;
      const b64 = IMAGES.get(pid);
      if (!b64) return;
      // The fav pill has a leading emoji span — replace it
      const emojiEl = pill.querySelector('span:first-child, em:first-child');
      if (emojiEl && !emojiEl.querySelector('img')) {
        emojiEl.innerHTML = `<img src="${b64}"
          style="width:22px;height:22px;object-fit:cover;border-radius:6px;vertical-align:middle"/>`;
        emojiEl.style.lineHeight = '1';
      }
    });
  }

  // ── 5c. Cart sheet rows ───────────────────────────────
  (function patchRenderCartSheet() {
    const tryPatch = () => {
      const _orig = window.renderCartSheet;
      if (typeof _orig !== 'function') { setTimeout(tryPatch, 300); return; }
      window.renderCartSheet = function () {
        _orig.apply(this, arguments);
        setTimeout(() => {
          document.querySelectorAll('.ci-row').forEach(row => {
            const pid = row.dataset.id || row.getAttribute('data-id');
            if (!pid) return;
            const b64 = IMAGES.get(pid);
            if (!b64) return;
            const emojiEl = row.querySelector('.ci-emoji');
            if (emojiEl && !emojiEl.querySelector('img')) {
              emojiEl.innerHTML = `<img src="${b64}"
                style="width:30px;height:30px;object-fit:cover;border-radius:8px;display:block"/>`;
              emojiEl.style.cssText = 'width:30px;height:30px;flex-shrink:0';
            }
          });
        }, 20);
      };
    };
    tryPatch();
  })();

  // ── 5d. Inventory list ────────────────────────────────
  (function patchRenderInv() {
    const tryPatch = () => {
      const _orig = window.renderInv;
      if (typeof _orig !== 'function') { setTimeout(tryPatch, 300); return; }
      window.renderInv = function () {
        _orig.apply(this, arguments);
        setTimeout(() => {
          document.querySelectorAll('.inv-item').forEach(row => {
            const pid = row.dataset.id || row.getAttribute('data-id');
            if (!pid) return;
            const b64 = IMAGES.get(pid);
            if (!b64) return;
            const emojiEl = row.querySelector('.ii-emoji');
            if (emojiEl && !emojiEl.querySelector('img')) {
              emojiEl.innerHTML = `<img src="${b64}"
                style="width:36px;height:36px;object-fit:cover;border-radius:9px;display:block"/>`;
              emojiEl.style.cssText = 'width:36px;height:36px;flex-shrink:0';
            }
          });
        }, 20);
      };
    };
    tryPatch();
  })();

  // ── 5e. Recent transactions on dashboard ─────────────
  (function patchRenderDashboard() {
    const tryPatch = () => {
      const _orig = window.renderDashboard;
      if (typeof _orig !== 'function') { setTimeout(tryPatch, 300); return; }
      window.renderDashboard = function () {
        _orig.apply(this, arguments);
        setTimeout(_applyImagesToRecent, 60);
      };
    };
    tryPatch();
  })();

  function _applyImagesToRecent() {
    // Recent transactions use product emoji inline; no simple hook —
    // just target any element with data-pid attribute we'll add below
    document.querySelectorAll('[data-pid]').forEach(el => {
      const pid = el.getAttribute('data-pid');
      const b64 = IMAGES.get(pid);
      if (!b64 || el.querySelector('img')) return;
      el.innerHTML = `<img src="${b64}"
        style="width:28px;height:28px;object-fit:cover;border-radius:7px"/>`;
    });
  }

  // ── 5f. Checkout / Receipt modal ─────────────────────
  (function patchOpenCart() {
    const tryPatch = () => {
      const _orig = window.openCart;
      if (typeof _orig !== 'function') { setTimeout(tryPatch, 300); return; }
      window.openCart = function () {
        _orig.apply(this, arguments);
        setTimeout(() => {
          // Patch receipt-items in the receipt-modal as well
          _applyImagesToList('#receipt-items .ri-emoji, #receipt-items .ri-icon');
          _applyImagesToList('.ci-emoji');
        }, 60);
      };
    };
    tryPatch();
  })();

  function _applyImagesToList(selector) {
    document.querySelectorAll(selector).forEach(el => {
      const pid = el.closest('[data-id]')?.dataset?.id;
      if (!pid) return;
      const b64 = IMAGES.get(pid);
      if (!b64 || el.querySelector('img')) return;
      el.innerHTML = `<img src="${b64}"
        style="width:28px;height:28px;object-fit:cover;border-radius:7px;display:block"/>`;
    });
  }

  // ══════════════════════════════════════════════════════
  //  6. CSS ADDITIONS  (image-aware product card styles)
  // ══════════════════════════════════════════════════════

  (function injectCSS() {
    if (document.getElementById('posh-img-css')) return;
    const s = document.createElement('style');
    s.id = 's-id';
    s.textContent = `
      /* Product form image uploader */
      #emoji-picker img { display:block; }

      /* Make prod-emoji-wrap work as an image container */
      .prod-emoji-wrap img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        border-radius: 10px;
        display: block;
      }

      /* Fav pill image */
      .fav-pill img {
        width: 22px;
        height: 22px;
        object-fit: cover;
        border-radius: 6px;
        vertical-align: middle;
      }

      /* Inventory row image */
      .ii-emoji img, .ci-emoji img {
        display: block;
        object-fit: cover;
        border-radius: 8px;
      }

      /* "No photo" placeholder shimmer for empty slots */
      .prod-no-photo {
        background: linear-gradient(
          110deg,
          var(--surf2) 30%,
          var(--surf3) 50%,
          var(--surf2) 70%
        );
        background-size: 200% 100%;
        animation: posh-shimmer 1.6s infinite linear;
        border-radius: 10px;
      }
      @keyframes posh-shimmer {
        0%   { background-position: 200% 0; }
        100% { background-position: -200% 0; }
      }

      /* Product form image upload zone — hover highlight */
      #pf-img-preview:hover {
        border-color: var(--acc) !important;
      }
    `;
    document.head.appendChild(s);
  })();

  // ══════════════════════════════════════════════════════
  //  7. BACKUP / RESTORE  — include images in JSON backup
  // ══════════════════════════════════════════════════════

  (function patchBackupRestore() {
    // Patch backupData() to include images in the download
    const tryPatch = () => {
      const _origBackup = window.backupData;
      if (typeof _origBackup !== 'function') { setTimeout(tryPatch, 400); return; }
      window.backupData = function () {
        // Let original run to get the normal backup going
        // Then also offer an image backup separately
        _origBackup.apply(this, arguments);

        const imgMap = IMAGES.all();
        if (!Object.keys(imgMap).length) return; // no images yet

        // Write a separate images backup file
        const blob = new Blob(
          [JSON.stringify({ version: 1, images: imgMap })],
          { type: 'application/json' }
        );
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `posh-images-${new Date().toISOString().slice(0,10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        if (typeof toast === 'function') toast('🖼 Image backup downloaded too');
      };
    };
    tryPatch();

    // Patch restoreData() to also accept image backup files
    const tryPatchRestore = () => {
      const _origRestore = window.restoreData;
      if (typeof _origRestore !== 'function') { setTimeout(tryPatchRestore, 400); return; }
      window.restoreData = function (event) {
        const file = event?.target?.files?.[0];
        if (!file) return;

        // Peek at file to see if it is an image backup
        const reader = new FileReader();
        reader.onload = e => {
          try {
            const parsed = JSON.parse(e.target.result);
            if (parsed.images) {
              // It's an image backup
              IMAGES.import(parsed.images);
              if (typeof renderSales === 'function') renderSales();
              if (typeof renderInv   === 'function') renderInv();
              if (typeof toast       === 'function') toast(`✅ ${Object.keys(parsed.images).length} product images restored`);
              return;
            }
          } catch {}
          // Not an image backup — pass through to original handler
          // Recreate a synthetic event with the same file
          const dt = new DataTransfer();
          dt.items.add(file);
          const synthEvent = { target: { files: dt.files } };
          _origRestore.call(this, synthEvent);
        };
        reader.readAsText(file);
      };
    };
    tryPatchRestore();
  })();

  // ══════════════════════════════════════════════════════
  //  8. FIRESTORE HOOK  (no-op until Firebase Storage is wired)
  //     When you add Firebase Storage, call:
  //       POSH_IMAGES.cloudUpload(productId, base64)
  //       POSH_IMAGES.cloudDownload(productId)
  //     These are stubs that log clearly so they're easy to find.
  // ══════════════════════════════════════════════════════

  IMAGES.cloudUpload = async function (id, base64) {
    // TODO: wire Firebase Storage here
    // Example (Firebase Storage v9 modular):
    //
    //   import { getStorage, ref, uploadString, getDownloadURL } from 'firebase/storage';
    //   const storage  = getStorage();
    //   const imgRef   = ref(storage, `product-images/${getClientId()}/${id}.jpg`);
    //   await uploadString(imgRef, base64, 'data_url');
    //   const url = await getDownloadURL(imgRef);
    //   return url;  // store this URL on the product object for cross-device access
    //
    console.log('[POSH_IMAGES] cloudUpload stub — wire Firebase Storage here', id);
    return null;
  };

  IMAGES.cloudDownload = async function (id) {
    // TODO: wire Firebase Storage here
    console.log('[POSH_IMAGES] cloudDownload stub — wire Firebase Storage here', id);
    return null;
  };

  // ══════════════════════════════════════════════════════
  //  9. STORAGE USAGE INDICATOR  (shown in Settings)
  // ══════════════════════════════════════════════════════

  function _calcImageStorageKB() {
    let total = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(IMG_PREFIX)) {
        total += (localStorage.getItem(k) || '').length;
      }
    }
    return Math.round(total / 1024); // bytes → KB
  }

  function _refreshStorageDisplay() {
    const el = document.getElementById('posh-img-storage-info');
    if (!el) return;
    const kb    = _calcImageStorageKB();
    const count = Object.keys(IMAGES.all()).length;
    el.textContent = `${count} photo${count !== 1 ? 's' : ''} · ${kb} KB used`;
  }

  // Add a storage-info row to Settings after DOM is ready
  (function addStorageRowToSettings() {
    const tryAdd = () => {
      const backupRow = document.querySelector('[onclick*="backupData"]');
      if (!backupRow) { setTimeout(tryAdd, 800); return; }
      if (document.getElementById('posh-img-storage-row')) return;

      const row = document.createElement('div');
      row.id = 'posh-img-storage-row';
      row.className = 'settings-row';
      row.style.cursor = 'default';
      row.innerHTML = `
        <div class="sr-icon" style="background:var(--blue-l)">🖼</div>
        <div class="sr-info">
          <div class="sr-label">Product Images</div>
          <div class="sr-sub" id="posh-img-storage-info">calculating…</div>
        </div>
        <button onclick="POSH_IMG_FORM && POSH_IMG_FORM._clearAll && POSH_IMG_FORM._clearAll()"
                style="font-size:10px;font-weight:700;padding:5px 9px;border-radius:7px;
                       background:var(--red-l);border:1px solid var(--red);
                       color:var(--red-text);cursor:pointer">
          Clear
        </button>`;
      backupRow.parentNode.insertBefore(row, backupRow);
      setTimeout(_refreshStorageDisplay, 100);
    };
    tryAdd();
  })();

  // Clear-all images (admin only, behind confirm)
  window.POSH_IMG_FORM = window.POSH_IMG_FORM || {};
  window.POSH_IMG_FORM._clearAll = function () {
    if (window.currentRole !== 'admin') { _t('⛔ Admin only'); return; }
    if (typeof showConfirm !== 'function') return;
    showConfirm(
      '🗑 Remove all product photos?',
      'This will delete every product image stored on this device. Product data is kept.',
      () => {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith(IMG_PREFIX)) keys.push(k);
        }
        keys.forEach(k => localStorage.removeItem(k));
        if (typeof renderSales === 'function') renderSales();
        if (typeof renderInv   === 'function') renderInv();
        _refreshStorageDisplay();
        _t('🗑 All product images removed');
      },
      true
    );
  };

  console.log('POSH product-images.js loaded ✅ — photo upload, demo clear, localStorage image store');

})();
