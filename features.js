// ═══════════════════════════════════════════════════════
//  POSH — features.js  (load AFTER quickwins.js + barcode.js)
//
//  Implements everything that was a stub or missing:
//   1.  Returns / Refunds       — full stock reversal + audit
//   2.  Purchase Orders         — real PO with WhatsApp + print
//   3.  Product Variants        — addVariantRow / removeVariantRow
//   4.  Z-Report (End of Day)   — full daily closing report
//   5.  Bulk CSV Product Import — parse & upsert products
//   6.  Float Variance          — calcFloatVariance for HTML form
//   7.  Product Label Printing  — barcode label sheet (thermal)
//   8.  Misc fixes              — openHeatmapModal, openCashFlowModal,
//                                 openLoyaltyModal, openPurchaseOrderModal
// ═══════════════════════════════════════════════════════

(function () {
  'use strict';

  function $id(id) { return document.getElementById(id); }

  function _fmt(n) {
    const cur = typeof currency !== 'undefined' ? currency : 'KSh';
    return cur + ' ' + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  function _toast(msg) { if (typeof toast === 'function') toast(msg); }

  function _audit(action, detail) { if (typeof addAuditEntry === 'function') addAuditEntry(action, detail); }

  function _save() { if (typeof saveData === 'function') saveData(); }

  function _openModal(modalId, ovId) {
    const m = $id(modalId), o = $id(ovId);
    if (m) m.classList.add('open');
    if (o) o.classList.add('show');
  }
  function _closeModal(modalId, ovId) {
    const m = $id(modalId), o = $id(ovId);
    if (m) m.classList.remove('open');
    if (o) o.classList.remove('show');
  }

  function _esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ══════════════════════════════════════════════════════
  //  1. RETURNS / REFUNDS  (full implementation)
  // ══════════════════════════════════════════════════════

  // State for the open return modal
  let _returnTxn = null;

  window.openReturnModal = function () {
    _returnTxn = null;
    const preview = $id('ret-txn-preview');
    const idInput = $id('ret-txn-id');
    const amtInput = $id('ret-amount');
    if (preview)  preview.innerHTML = '';
    if (idInput)  idInput.value = '';
    if (amtInput) amtInput.value = '';
    _openModal('return-modal', 'return-ov');
  };

  window.closeReturnModal = function () {
    _closeModal('return-modal', 'return-ov');
  };

  // Called from HTML oninput on the transaction-ID field
  window.lookupReturnTxn = function (q) {
    const preview = $id('ret-txn-preview');
    if (!preview) return;
    if (!q || q.trim().length < 2) {
      preview.innerHTML = '';
      _returnTxn = null;
      return;
    }

    const allSales = typeof sales !== 'undefined' ? sales : [];
    // Match by last 4+ digits of ID, or by full ID
    const q2 = q.trim().replace(/^#/, '');
    const sale = allSales.find(s =>
      String(s.id) === q2 ||
      String(s.id).endsWith(q2) ||
      String(s.id).slice(-4) === q2.slice(-4)
    );

    if (!sale) {
      preview.innerHTML = `
        <div style="padding:10px 12px;background:var(--red-l);border:1px solid var(--red);
                    border-radius:10px;font-size:12px;color:var(--red-text);font-weight:700">
          ⚠️ Transaction not found — try the last 4 digits of the ID
        </div>`;
      _returnTxn = null;
      return;
    }

    _returnTxn = sale;

    // Pre-fill refund amount with sale total
    const amtInput = $id('ret-amount');
    if (amtInput) amtInput.value = sale.total;

    // Render a mini receipt
    const dt = new Date(sale.ts).toLocaleString('en-KE', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
    const isRefunded = sale.refunded;

    preview.innerHTML = `
      <div style="background:var(--surf2);border:1px solid var(--brd);border-radius:12px;
                  padding:12px;font-size:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <span style="font-weight:800;color:var(--text)">
            #${String(sale.id).slice(-4)}
            ${isRefunded ? '<span style="font-size:10px;color:var(--red-text);background:var(--red-l);padding:2px 7px;border-radius:5px;margin-left:6px">REFUNDED</span>' : ''}
          </span>
          <span style="color:var(--muted)">${dt}</span>
        </div>
        ${(sale.items || []).map(i =>
          `<div style="display:flex;justify-content:space-between;padding:4px 0;
                       border-bottom:1px solid var(--brd)">
            <span>${_esc(i.name)} ×${i.qty}</span>
            <span style="font-weight:700">${_fmt(i.price * i.qty)}</span>
          </div>`
        ).join('')}
        <div style="display:flex;justify-content:space-between;padding:7px 0 0;
                    font-weight:800;color:var(--acc)">
          <span>Total</span><span>${_fmt(sale.total)}</span>
        </div>
        <div style="font-size:10px;color:var(--muted);margin-top:4px">
          Payment: ${sale.payment || 'Cash'}
        </div>
      </div>`;
  };

  // The real processReturn — reverses stock, logs expense, marks sale
  window.processReturn = function () {
    if (!_returnTxn) {
      const idInput = $id('ret-txn-id');
      if (idInput && idInput.value.trim()) {
        lookupReturnTxn(idInput.value);
        if (!_returnTxn) { _toast('⚠️ Look up a valid transaction first'); return; }
      } else {
        _toast('⚠️ Enter a transaction ID first'); return;
      }
    }

    if (_returnTxn.refunded) {
      _toast('⚠️ This transaction has already been refunded'); return;
    }

    const refundAmt   = parseFloat(($id('ret-amount')  || {}).value  || '0');
    const reason      = ($id('ret-reason')  || {}).value || 'Customer changed mind';
    const method      = ($id('ret-method')  || {}).value || 'Cash';

    if (refundAmt <= 0) { _toast('⚠️ Enter a refund amount'); return; }
    if (refundAmt > _returnTxn.total * 1.01) {
      _toast('⚠️ Refund cannot exceed original sale amount'); return;
    }

    const confirmMsg = `Refund ${_fmt(refundAmt)} via ${method} for transaction #${String(_returnTxn.id).slice(-4)}?`;

    if (typeof showConfirm === 'function') {
      showConfirm('Process Refund', confirmMsg, _doReturn, true);
    } else {
      if (confirm(confirmMsg)) _doReturn();
    }

    function _doReturn() {
      const allSales = typeof sales !== 'undefined' ? sales : [];
      const allProds = typeof products !== 'undefined' ? products : [];
      const allExp   = typeof expenses !== 'undefined' ? expenses : [];

      // 1 — Mark the original sale as refunded
      const saleRef = allSales.find(s => s.id === _returnTxn.id);
      if (saleRef) {
        saleRef.refunded = true;
        saleRef.refundAmt = refundAmt;
        saleRef.refundMethod = method;
        saleRef.refundReason = reason;
        saleRef.refundTs = Date.now();
      }

      // 2 — Restore stock for returned items (proportional if partial refund)
      const refundRatio = refundAmt / _returnTxn.total;
      const isFullRefund = refundRatio >= 0.99;

      (_returnTxn.items || []).forEach(item => {
        const prod = allProds.find(p => p.id === item.id);
        if (!prod) return;
        const qtyToReturn = isFullRefund ? item.qty : Math.round(item.qty * refundRatio);
        if (qtyToReturn > 0) prod.stock = (prod.stock || 0) + qtyToReturn;
      });

      // 3 — Log as an expense (cash out)
      allExp.push({
        id:       Date.now(),
        ts:       Date.now(),
        desc:     `Refund #${String(_returnTxn.id).slice(-4)} — ${reason}`,
        amount:   refundAmt,
        category: 'Return',
        method,
      });

      // 4 — Persist & audit
      _save();
      _audit('RETURN', `Refund ${_fmt(refundAmt)} via ${method} · txn #${String(_returnTxn.id).slice(-4)} · ${reason}`);

      // 5 — UI refresh
      if (typeof renderDashboard === 'function') renderDashboard();
      if (typeof renderInv       === 'function') renderInv();

      window.closeReturnModal();
      _toast(`↩️ Refund of ${_fmt(refundAmt)} processed`);

      _returnTxn = null;
    }
  };

  // ══════════════════════════════════════════════════════
  //  2. PURCHASE ORDERS  (full implementation)
  // ══════════════════════════════════════════════════════

  // PO store — persisted in localStorage
  let _poList = JSON.parse(localStorage.getItem('posh_po_list') || '[]');

  function _savePOs() {
    localStorage.setItem('posh_po_list', JSON.stringify(_poList));
  }

  // Build a PO from current low-stock items, grouped by supplier
  window.createPurchaseOrder = function () {
    const allProds = typeof products !== 'undefined' ? products : [];
    const lowItems = allProds.filter(p => (p.stock || 0) <= (p.lowAt || 0) && p.name);

    if (!lowItems.length) {
      _toast('✅ No items need restocking right now');
      return;
    }

    // Group by supplier
    const bySupplier = {};
    lowItems.forEach(p => {
      const sup = p.supplier || 'Unassigned';
      if (!bySupplier[sup]) bySupplier[sup] = [];
      bySupplier[sup].push(p);
    });

    const po = {
      id:        Date.now(),
      ts:        Date.now(),
      status:    'pending',   // pending | sent | received
      suppliers: Object.entries(bySupplier).map(([name, items]) => ({
        name,
        phone: items.find(i => i.phone)?.phone || '',
        items: items.map(p => ({
          id:            p.id,
          name:          p.name,
          emoji:         p.emoji || '📦',
          currentStock:  p.stock,
          orderQty:      Math.max(1, (p.lowAt || 5) * 3), // order 3× the threshold
          unit:          p.unit || '',
          costPrice:     p.cost || 0,
        })),
      })),
    };

    _poList.unshift(po);
    _savePOs();
    _audit('PO_CREATED', `PO #${String(po.id).slice(-4)} — ${lowItems.length} items, ${Object.keys(bySupplier).length} supplier(s)`);

    _renderPOHistory();
    _renderPOPreview(po);
    _toast(`📋 PO #${String(po.id).slice(-4)} created for ${lowItems.length} items`);
  };

  function _renderPOHistory() {
    const el = $id('po-history-list');
    if (!el) return;
    if (!_poList.length) {
      el.innerHTML = '<div style="text-align:center;color:var(--muted);font-size:12px;padding:12px">No purchase orders yet</div>';
      return;
    }
    const statusColors = { pending: 'var(--amber)', sent: 'var(--blue)', received: 'var(--green)' };
    el.innerHTML = `
      <div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;
                  letter-spacing:.5px;margin-bottom:8px">Previous Orders</div>` +
      _poList.slice(0, 15).map(po => {
        const dt = new Date(po.ts).toLocaleDateString('en-KE', { day:'numeric', month:'short', year:'numeric' });
        const totalItems = po.suppliers.reduce((s, sup) => s + sup.items.length, 0);
        return `
        <div style="background:var(--surf2);border:1px solid var(--brd);border-radius:12px;
                    padding:11px 13px;margin-bottom:7px;display:flex;align-items:center;gap:10px"
             onclick="viewPO(${po.id})" style="cursor:pointer">
          <div style="flex:1">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px">
              <span style="font-size:12px;font-weight:800;color:var(--text)">PO #${String(po.id).slice(-4)}</span>
              <span style="font-size:9px;font-weight:700;padding:2px 7px;border-radius:6px;
                           background:${statusColors[po.status]||'var(--muted)'}22;
                           color:${statusColors[po.status]||'var(--muted)'}">
                ${po.status.toUpperCase()}
              </span>
            </div>
            <div style="font-size:10px;color:var(--muted)">${dt} · ${totalItems} item(s) · ${po.suppliers.length} supplier(s)</div>
          </div>
          <div style="display:flex;gap:6px">
            <button onclick="event.stopPropagation();sharePO(${po.id})"
                    style="background:#25D366;border:none;border-radius:8px;
                           padding:6px 10px;color:white;font-size:11px;font-weight:700;cursor:pointer">
              📲
            </button>
            <button onclick="event.stopPropagation();markPOReceived(${po.id})"
                    style="background:var(--surf);border:1px solid var(--brd);border-radius:8px;
                           padding:6px 10px;font-size:11px;font-weight:700;cursor:pointer;color:var(--text)">
              ✅
            </button>
          </div>
        </div>`;
      }).join('');
  }

  function _renderPOPreview(po) {
    if (typeof openGenModal !== 'function') return;

    const lines = po.suppliers.map(sup => {
      const itemLines = sup.items.map(i =>
        `<div style="display:flex;justify-content:space-between;padding:6px 0;
                     border-bottom:1px solid var(--brd)">
          <div>
            <span>${_esc(i.name)}</span>
            <span style="font-size:10px;color:var(--muted)"> · ${i.currentStock} in stock</span>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <input type="number" value="${i.orderQty}" min="1"
                   id="po-qty-${po.id}-${i.id}"
                   style="width:60px;padding:4px 6px;font-size:12px;font-weight:700;
                          text-align:center;border:1.5px solid var(--brd);border-radius:7px;
                          background:var(--surf);color:var(--text)"/>
            <span style="font-size:10px;color:var(--muted)">${i.unit}</span>
          </div>
        </div>`
      ).join('');

      return `
        <div style="margin-bottom:14px">
          <div style="font-size:11px;font-weight:800;color:var(--acc);margin-bottom:6px;
                      text-transform:uppercase;letter-spacing:.4px">
            🏪 ${_esc(sup.name)}${sup.phone ? ' · ' + sup.phone : ''}
          </div>
          ${itemLines}
        </div>`;
    }).join('');

    openGenModal(`📋 PO #${String(po.id).slice(-4)}`, `
      <div style="max-height:50vh;overflow-y:auto;padding-right:4px">
        ${lines}
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;margin-top:14px">
        <button class="btn btn-primary btn-full" onclick="sharePO(${po.id});closeGenModal()">
          📲 Send via WhatsApp
        </button>
        <button class="btn btn-secondary btn-full" onclick="printPO(${po.id});closeGenModal()">
          🖨 Print PO
        </button>
        <button class="btn btn-secondary btn-full" onclick="markPOReceived(${po.id});closeGenModal()">
          ✅ Mark as Received
        </button>
        <button class="btn btn-secondary btn-full" onclick="closeGenModal()">Close</button>
      </div>`);
  }

  window.viewPO = function (id) {
    const po = _poList.find(p => p.id === id);
    if (po) _renderPOPreview(po);
  };

  window.sharePO = function (id) {
    const po = _poList.find(p => p.id === id);
    if (!po) return;
    const dt = new Date(po.ts).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });
    const shopN = typeof shopName !== 'undefined' ? shopName : 'POSH';
    const SEP = '━━━━━━━━━━━━━━━━━━━━';

    let msg = `📋 *Purchase Order — ${shopN}*\n${SEP}\nDate: ${dt} · PO #${String(po.id).slice(-4)}\n\n`;

    po.suppliers.forEach(sup => {
      msg += `🏪 *Supplier: ${sup.name}*\n`;
      sup.items.forEach(i => {
        msg += `  ${i.emoji} ${i.name} — Order: *${i.orderQty} ${i.unit}*  (have: ${i.currentStock})\n`;
      });
      msg += '\n';
    });

    msg += `${SEP}\nKindly deliver at your earliest convenience.\nThank you!`;

    // If a specific supplier has a phone number, open WA to them
    const firstPhone = po.suppliers.find(s => s.phone)?.phone;
    if (firstPhone) {
      const clean = firstPhone.replace(/\D/g, '');
      const intl = clean.startsWith('0') ? '254' + clean.slice(1) : clean;
      window.open(`https://wa.me/${intl}?text=${encodeURIComponent(msg)}`, '_blank');
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
    }

    // Mark as sent
    po.status = 'sent';
    _savePOs();
    _renderPOHistory();
    _audit('PO_SENT', `PO #${String(id).slice(-4)} sent via WhatsApp`);
  };

  window.printPO = function (id) {
    const po = _poList.find(p => p.id === id);
    if (!po) return;
    const shopN = typeof shopName !== 'undefined' ? shopName : 'POSH';
    const dt = new Date(po.ts).toLocaleDateString('en-KE');

    let html = `<html><head><style>
      body{font-family:monospace;font-size:12px;max-width:600px;margin:20px auto;color:#000}
      h2{font-size:16px;font-weight:bold;margin-bottom:4px}
      .sub{color:#666;font-size:11px;margin-bottom:14px}
      table{width:100%;border-collapse:collapse;margin-bottom:14px}
      th{text-align:left;border-bottom:2px solid #000;padding:4px 6px;font-size:11px}
      td{padding:4px 6px;border-bottom:1px solid #ccc;font-size:11px}
      .sup-title{font-weight:bold;padding:8px 0 4px;font-size:12px}
    </style></head><body>
    <h2>📋 PURCHASE ORDER</h2>
    <div class="sub">${shopN} · PO #${String(po.id).slice(-4)} · ${dt}</div>`;

    po.suppliers.forEach(sup => {
      html += `<div class="sup-title">Supplier: ${sup.name}${sup.phone ? ' · ' + sup.phone : ''}</div>
      <table>
        <thead><tr><th>Item</th><th>In Stock</th><th>Order Qty</th><th>Unit</th></tr></thead>
        <tbody>`;
      sup.items.forEach(i => {
        const qty = $id(`po-qty-${po.id}-${i.id}`)?.value || i.orderQty;
        html += `<tr>
          <td>${i.name}</td>
          <td>${i.currentStock}</td>
          <td><strong>${qty}</strong></td>
          <td>${i.unit}</td>
        </tr>`;
      });
      html += '</tbody></table>';
    });

    html += `<div style="margin-top:16px;font-size:10px;color:#888">Generated by POSH POS</div></body></html>`;

    const win = window.open('', '_blank', 'width=700,height=600');
    if (win) {
      win.document.write(html);
      win.document.close();
      setTimeout(() => win.print(), 400);
    }

    po.status = 'sent';
    _savePOs();
    _renderPOHistory();
  };

  window.markPOReceived = function (id) {
    const po = _poList.find(p => p.id === id);
    if (!po) return;

    if (typeof showConfirm === 'function') {
      showConfirm('Mark as Received?',
        'This will add the ordered quantities back into your stock.',
        () => _doReceivePO(po), false);
    } else {
      if (confirm('Mark PO as received and update stock?')) _doReceivePO(po);
    }
  };

  function _doReceivePO(po) {
    const allProds = typeof products !== 'undefined' ? products : [];

    po.suppliers.forEach(sup => {
      sup.items.forEach(item => {
        // Read qty from input if the preview modal is still open
        const qtyInput = $id(`po-qty-${po.id}-${item.id}`);
        const qty = parseInt(qtyInput?.value || item.orderQty) || 0;
        const prod = allProds.find(p => p.id === item.id);
        if (prod && qty > 0) {
          prod.stock = (prod.stock || 0) + qty;
          item.receivedQty = qty;
        }
      });
    });

    po.status = 'received';
    po.receivedTs = Date.now();
    _savePOs();
    _save();

    if (typeof renderInv === 'function') renderInv();
    _renderPOHistory();
    _audit('PO_RECEIVED', `PO #${String(po.id).slice(-4)} received — stock updated`);
    _toast('✅ Stock updated from PO!');
  }

  // Patch openPurchaseOrderModal to also render PO history
  (function patchPOModal() {
    const _orig = window.openPurchaseOrderModal || window.openPurchaseOrders;
    window.openPurchaseOrderModal = window.openPurchaseOrders = function () {
      if (typeof _orig === 'function') _orig();
      _renderPOHistory();
    };
  })();

  // ══════════════════════════════════════════════════════
  //  3. PRODUCT VARIANTS  (addVariantRow / removeVariantRow)
  // ══════════════════════════════════════════════════════

  // Variants are stored as an array on the product: p.variants = [{name, price, stock}]
  let _variantRows = []; // current in-form rows

  window.addVariantRow = function (data) {
    const list = $id('pf-variants-list');
    if (!list) return;

    // Clear placeholder message if present
    if (list.querySelector('.no-variants')) {
      list.innerHTML = '';
      _variantRows = [];
    }

    const idx = _variantRows.length;
    _variantRows.push(data || { name: '', price: '', stock: '' });

    const row = document.createElement('div');
    row.id = `variant-row-${idx}`;
    row.style.cssText = 'display:flex;gap:6px;align-items:center;margin-bottom:7px';
    row.innerHTML = `
      <input class="field" type="text" placeholder="e.g. 500ml"
             id="vr-name-${idx}" value="${_esc(data?.name || '')}"
             style="flex:2;padding:8px 10px;font-size:12px"
             oninput="_variantRows[${idx}].name=this.value"/>
      <input class="field" type="number" placeholder="Price"
             id="vr-price-${idx}" value="${data?.price || ''}"
             style="flex:2;padding:8px 10px;font-size:12px"
             oninput="_variantRows[${idx}].price=parseFloat(this.value)||0"/>
      <input class="field" type="number" placeholder="Stock"
             id="vr-stock-${idx}" value="${data?.stock || ''}"
             style="flex:1;padding:8px 10px;font-size:12px"
             oninput="_variantRows[${idx}].stock=parseInt(this.value)||0"/>
      <button onclick="removeVariantRow(${idx})"
              style="background:var(--red-l);border:1px solid var(--red);border-radius:8px;
                     padding:7px 9px;cursor:pointer;color:var(--red-text);font-size:13px;
                     flex-shrink:0">✕</button>`;
    list.appendChild(row);

    // Show header labels on first row
    const header = $id('pf-variants-header');
    if (!header && list.children.length === 1) {
      const h = document.createElement('div');
      h.id = 'pf-variants-header';
      h.style.cssText = 'display:grid;grid-template-columns:2fr 2fr 1fr 32px;gap:6px;margin-bottom:4px';
      h.innerHTML = `
        <span style="font-size:9px;font-weight:700;color:var(--muted);text-transform:uppercase">Name</span>
        <span style="font-size:9px;font-weight:700;color:var(--muted);text-transform:uppercase">Price</span>
        <span style="font-size:9px;font-weight:700;color:var(--muted);text-transform:uppercase">Stock</span>
        <span></span>`;
      list.insertBefore(h, list.firstChild);
    }
  };

  window.removeVariantRow = function (idx) {
    const row = $id(`variant-row-${idx}`);
    if (row) row.remove();
    _variantRows[idx] = null; // nullify so indices don't shift
    // Remove header if no rows left
    const list = $id('pf-variants-list');
    if (!list) return;
    const remaining = list.querySelectorAll('[id^="variant-row-"]');
    if (remaining.length === 0) {
      const header = $id('pf-variants-header');
      if (header) header.remove();
    }
  };

  // Patch openProductForm to populate variant rows when editing
  (function patchOpenProductFormVariants() {
    const tryPatch = () => {
      const _orig = window.openProductForm;
      if (typeof _orig !== 'function') { setTimeout(tryPatch, 300); return; }
      window.openProductForm = function (id) {
        // Reset variants
        _variantRows = [];
        const list = $id('pf-variants-list');
        if (list) list.innerHTML = '';
        const header = $id('pf-variants-header');
        if (header) header.remove();

        _orig.apply(this, arguments);

        // Populate variants if editing a product that has them
        setTimeout(() => {
          if (id == null) return;
          const prods = typeof products !== 'undefined' ? products : [];
          const p = prods.find(x => x.id === id);
          if (!p || !p.variants || !p.variants.length) return;
          p.variants.forEach(v => window.addVariantRow(v));
        }, 80);
      };
    };
    tryPatch();
  })();

  // Patch saveProduct to capture variant rows
  (function patchSaveProductVariants() {
    const tryPatch = () => {
      const _orig = window.saveProduct;
      if (typeof _orig !== 'function') { setTimeout(tryPatch, 300); return; }
      window.saveProduct = function () {
        // Snapshot variants before _orig clears the form
        const variants = _variantRows
          .filter(v => v && v.name)
          .map(v => ({ name: v.name, price: parseFloat(v.price) || 0, stock: parseInt(v.stock) || 0 }));

        _orig.apply(this, arguments);

        // Write variants to the most recently saved product
        if (!variants.length) return;
        setTimeout(() => {
          const prods = typeof products !== 'undefined' ? products : [];
          if (!prods.length) return;
          const target = prods[prods.length - 1]; // last = newly saved
          if (target) {
            target.variants = variants;
            _save();
          }
        }, 100);
      };
    };
    tryPatch();
  })();

  // ══════════════════════════════════════════════════════
  //  4. Z-REPORT / END-OF-DAY  (new feature)
  // ══════════════════════════════════════════════════════

  // Z-Report = daily cash register closing report
  window.openZReport = function () {
    if (window.currentRole !== 'admin') {
      _toast('⛔ Admin access required for Z-Report');
      return;
    }

    const today    = new Date();
    const dateKey  = typeof getDateKey === 'function'
      ? getDateKey(today.getTime())
      : today.toISOString().slice(0, 10);

    const allSales = typeof sales     !== 'undefined' ? sales     : [];
    const allExp   = typeof expenses  !== 'undefined' ? expenses  : [];
    const allProds = typeof products  !== 'undefined' ? products  : [];

    const daySales = allSales.filter(s =>
      (typeof getDateKey === 'function'
        ? getDateKey(s.ts) === dateKey
        : new Date(s.ts).toISOString().slice(0,10) === dateKey)
    );

    const dayExp = allExp.filter(e =>
      (typeof getDateKey === 'function'
        ? getDateKey(e.ts) === dateKey
        : new Date(e.ts).toISOString().slice(0,10) === dateKey)
    );

    // Totals
    const grossSales   = daySales.filter(s => !s.refunded).reduce((s, x) => s + x.total, 0);
    const refunds      = daySales.filter(s => s.refunded).reduce((s, x) => s + (x.refundAmt || x.total), 0);
    const netSales     = grossSales - refunds;
    const totalExp     = dayExp.filter(e => e.category !== 'Return').reduce((s, e) => s + e.amount, 0);
    const netProfit    = netSales - totalExp;
    const txnCount     = daySales.filter(s => !s.refunded).length;
    const avgTxn       = txnCount > 0 ? Math.round(netSales / txnCount) : 0;
    const vatCollected = daySales.filter(s => !s.refunded).reduce((s, x) => s + (x.vatAmount || 0), 0);

    // Payment method breakdown
    const byMethod = {};
    daySales.filter(s => !s.refunded).forEach(s => {
      const pm = s.payment || 'Cash';
      byMethod[pm] = (byMethod[pm] || 0) + s.total;
    });

    // Top products
    const prodMap = {};
    daySales.filter(s => !s.refunded).forEach(s =>
      (s.items || []).forEach(i => {
        if (!prodMap[i.id]) prodMap[i.id] = { name: i.name, emoji: i.emoji || '📦', qty: 0, rev: 0 };
        prodMap[i.id].qty += i.qty;
        prodMap[i.id].rev += i.price * i.qty;
      })
    );
    const topProds = Object.values(prodMap).sort((a,b) => b.rev - a.rev).slice(0, 5);

    // Out-of-stock count
    const outOfStock = allProds.filter(p => (p.stock || 0) <= 0).length;
    const lowStock   = allProds.filter(p => (p.stock || 0) > 0 && (p.stock || 0) <= (p.lowAt || 0)).length;

    // Float
    const floatAmt = typeof floatAmount !== 'undefined' ? floatAmount : 0;
    const floatSet_ = typeof floatSet !== 'undefined' ? floatSet : false;
    const cashSales = daySales.filter(s => !s.refunded && s.payment === 'Cash').reduce((s,x)=>s+x.total,0);
    const expectedCash = floatAmt + cashSales;

    const dt = today.toLocaleDateString('en-KE', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
    const shopN = typeof shopName !== 'undefined' ? shopName : 'POSH';
    const goal  = typeof dailyGoal !== 'undefined' ? dailyGoal : 0;
    const goalPct = goal > 0 ? Math.round(netSales / goal * 100) : 0;

    // Build HTML for gen modal
    const html = `
      <!-- Header -->
      <div style="text-align:center;padding:6px 0 14px;border-bottom:1px solid var(--brd);margin-bottom:14px">
        <div style="font-size:24px;margin-bottom:4px">📊</div>
        <div style="font-size:15px;font-weight:800;color:var(--text)">${_esc(shopN)} — Z-Report</div>
        <div style="font-size:11px;color:var(--muted)">${dt}</div>
        ${goal > 0 ? `<div style="margin-top:8px;font-size:12px;font-weight:700;
            color:${goalPct>=100?'var(--green-text)':goalPct>=70?'var(--amber-text)':'var(--red-text)'}">
            Goal: ${goalPct}% (${_fmt(netSales)} of ${_fmt(goal)})
          </div>` : ''}
      </div>

      <!-- Sales summary -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
        ${[
          ['Gross Sales', _fmt(grossSales), 'green'],
          ['Refunds', refunds > 0 ? '−' + _fmt(refunds) : '—', 'red'],
          ['Net Sales', _fmt(netSales), 'acc'],
          ['Expenses', totalExp > 0 ? '−' + _fmt(totalExp) : '—', 'amber'],
          ['Net Profit', _fmt(netProfit), netProfit >= 0 ? 'green' : 'red'],
          ['Transactions', txnCount, 'text'],
          ['Avg Sale', _fmt(avgTxn), 'muted'],
          ['VAT Collected', vatCollected > 0 ? _fmt(vatCollected) : '—', 'muted'],
        ].map(([label, val, color]) => `
          <div style="background:var(--surf2);border-radius:10px;padding:10px 11px">
            <div style="font-size:9px;font-weight:700;color:var(--muted);text-transform:uppercase">${label}</div>
            <div style="font-size:16px;font-weight:800;color:var(--${color},var(--text))">${val}</div>
          </div>`
        ).join('')}
      </div>

      <!-- Payment methods -->
      ${Object.keys(byMethod).length ? `
        <div style="margin-bottom:12px">
          <div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;
                      letter-spacing:.5px;margin-bottom:7px">Payment Methods</div>
          ${Object.entries(byMethod).map(([pm, amt]) => `
            <div style="display:flex;justify-content:space-between;padding:6px 0;
                        border-bottom:1px solid var(--brd);font-size:12px">
              <span style="color:var(--muted)">${pm}</span>
              <span style="font-weight:700;color:var(--text)">${_fmt(amt)}</span>
            </div>`).join('')}
        </div>` : ''}

      <!-- Cash float -->
      ${floatSet_ ? `
        <div style="background:var(--green-l);border-radius:10px;padding:10px 12px;margin-bottom:12px">
          <div style="font-size:10px;font-weight:700;color:var(--green-text);
                      text-transform:uppercase;margin-bottom:5px">Cash Drawer</div>
          <div style="display:flex;justify-content:space-between;font-size:12px">
            <span>Opening Float</span><span style="font-weight:700">${_fmt(floatAmt)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:12px;margin-top:3px">
            <span>Cash Sales</span><span style="font-weight:700">${_fmt(cashSales)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:800;
                      color:var(--green-text);border-top:1px solid var(--green);margin-top:6px;padding-top:6px">
            <span>Expected in Drawer</span><span>${_fmt(expectedCash)}</span>
          </div>
        </div>` : ''}

      <!-- Top products -->
      ${topProds.length ? `
        <div style="margin-bottom:12px">
          <div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;
                      letter-spacing:.5px;margin-bottom:7px">Top Products</div>
          ${topProds.map((p, i) => `
            <div style="display:flex;align-items:center;gap:9px;padding:6px 0;
                        border-bottom:1px solid var(--brd)">
              <span style="font-size:11px;font-weight:800;color:var(--muted);
                           min-width:16px;text-align:center">${i + 1}</span>
              <div style="flex:1">
                <div style="font-size:12px;font-weight:700;color:var(--text)">${_esc(p.name)}</div>
                <div style="font-size:10px;color:var(--muted)">${p.qty} sold</div>
              </div>
              <span style="font-size:12px;font-weight:800;color:var(--acc)">${_fmt(p.rev)}</span>
            </div>`).join('')}
        </div>` : ''}

      <!-- Stock alerts -->
      ${(outOfStock + lowStock) > 0 ? `
        <div style="background:var(--red-l);border-radius:10px;padding:9px 12px;margin-bottom:12px;
                    font-size:12px;color:var(--red-text)">
          ⚠️ ${outOfStock} out of stock · ${lowStock} low stock
        </div>` : `
        <div style="background:var(--green-l);border-radius:10px;padding:9px 12px;margin-bottom:12px;
                    font-size:12px;color:var(--green-text)">
          ✅ All items in stock
        </div>`}

      <!-- Actions -->
      <div style="display:flex;flex-direction:column;gap:8px">
        <button class="btn btn-primary btn-full" onclick="printZReport()">🖨 Print Z-Report</button>
        <button class="btn btn-secondary btn-full" onclick="exportZReportCSV()">📊 Export CSV</button>
        <button class="btn btn-secondary btn-full" onclick="closeGenModal()">Close</button>
      </div>`;

    if (typeof openGenModal === 'function') openGenModal('📊 Z-Report', html);
    _audit('Z_REPORT', `Z-Report viewed for ${dt}`);
  };

  window.printZReport = function () {
    closeGenModal && closeGenModal();
    setTimeout(() => window.print(), 120);
  };

  window.exportZReportCSV = function () {
    const today    = new Date();
    const dateKey  = today.toISOString().slice(0, 10);
    const allSales = typeof sales !== 'undefined' ? sales : [];
    const daySales = allSales.filter(s => new Date(s.ts).toISOString().slice(0,10) === dateKey);

    const rows = daySales.map(s => [
      new Date(s.ts).toLocaleTimeString('en-KE', {hour:'2-digit',minute:'2-digit'}),
      '#' + String(s.id).slice(-4),
      s.refunded ? 'REFUNDED' : 'SALE',
      s.payment || 'Cash',
      s.total,
      (s.items||[]).map(i => `${i.name}×${i.qty}`).join('; '),
    ].join(','));

    const header = 'Time,Transaction,Type,Payment,Amount,Items';
    const csv = [header, ...rows].join('\n');

    if (typeof downloadFile === 'function') {
      downloadFile(csv, `z-report-${dateKey}.csv`, 'text/csv');
    } else {
      const blob = new Blob([csv], {type:'text/csv'});
      const url  = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `z-report-${dateKey}.csv`;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
    _toast('📊 Z-Report exported!');
  };

  // ── Wire Z-Report to Settings and Sidebar ────────────
  (function addZReportToSettings() {
    // Wait for DOM
    const tryAdd = () => {
      const secGroup = document.querySelector('#screen-settings .settings-group');
      if (!secGroup) { setTimeout(tryAdd, 600); return; }
      if (document.getElementById('zreport-settings-row')) return;

      // Add to Data section in settings
      const dataSec = [...document.querySelectorAll('.settings-section')]
        .find(s => s.querySelector('[onclick*="backupData"]'));

      if (!dataSec) return;
      const dataGroup = dataSec.querySelector('.settings-group');
      if (!dataGroup) return;

      const row = document.createElement('div');
      row.id = 'zreport-settings-row';
      row.className = 'settings-row';
      row.setAttribute('onclick', 'openZReport()');
      row.innerHTML = `
        <div class="sr-icon" style="background:var(--purple-l)">📊</div>
        <div class="sr-info">
          <div class="sr-label">Z-Report</div>
          <div class="sr-sub">Daily closing report</div>
        </div>
        <span class="sr-arrow">›</span>`;
      dataGroup.insertBefore(row, dataGroup.firstChild);
    };
    tryAdd();

    // Also add to sidebar Data section
    const addToSidebar = () => {
      const backupItem = document.getElementById('sb-backup-item');
      if (!backupItem) { setTimeout(addToSidebar, 800); return; }
      if (document.getElementById('sb-zreport-item')) return;

      const zItem = document.createElement('div');
      zItem.id = 'sb-zreport-item';
      zItem.className = 'sb-item';
      zItem.setAttribute('onclick', "closeSidebar();openZReport()");
      zItem.innerHTML = `
        <div class="sb-item-icon" style="background:var(--purple-l)">📊</div>
        <div class="sb-item-info">
          <div class="sb-item-label">Z-Report</div>
          <div class="sb-item-sub">Daily closing summary</div>
        </div>
        <div class="sb-item-right"><span class="sb-arr">›</span></div>`;
      backupItem.parentNode.insertBefore(zItem, backupItem);
    };
    addToSidebar();
  })();

  // ── Add Z-Report to Dashboard Quick Actions ───────────
  (function addZReportToQuickActions() {
    const tryAdd = () => {
      const qaGrid = document.querySelector('.dash-qa-grid');
      if (!qaGrid) { setTimeout(tryAdd, 700); return; }
      if (document.getElementById('qa-zreport')) return;

      const btn = document.createElement('div');
      btn.id = 'qa-zreport';
      btn.className = 'dash-qa-btn';
      btn.setAttribute('onclick', 'openZReport()');
      btn.innerHTML = '<span class="dash-qa-ico">📊</span><span class="dash-qa-lbl">Z-Report</span>';
      qaGrid.appendChild(btn);
    };
    tryAdd();
  })();

  // ══════════════════════════════════════════════════════
  //  5. BULK CSV PRODUCT IMPORT
  // ══════════════════════════════════════════════════════
  //  CSV format:  name, price, cost, stock, category, unit, lowAt, barcode, emoji
  //  First row = headers (skipped). Extra columns ignored.

  window.openCSVImport = function () {
    if (window.currentRole !== 'admin') {
      _toast('⛔ Admin access required'); return;
    }
    if (typeof openGenModal !== 'function') return;

    openGenModal('📥 Bulk Import Products', `
      <div style="text-align:center;padding:6px 0 12px">
        <div style="font-size:36px;margin-bottom:8px">📥</div>
        <div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:6px">
          Import products from CSV
        </div>
        <div style="font-size:11px;color:var(--muted);line-height:1.6;margin-bottom:12px">
          Headers (first row):<br>
          <code style="font-size:10px;background:var(--surf2);padding:2px 6px;border-radius:4px">
            name, price, cost, stock, category, unit, lowAt, barcode, emoji
          </code>
        </div>
      </div>

      <!-- Download template button -->
      <button class="btn btn-secondary btn-full" style="margin-bottom:10px"
              onclick="downloadCSVTemplate()">
        ⬇️ Download Template
      </button>

      <!-- File picker -->
      <div class="form-group">
        <label class="field-label">Choose CSV file</label>
        <input type="file" id="csv-import-input" accept=".csv,.txt"
               class="field" style="padding:10px;cursor:pointer"
               onchange="previewCSVImport(this)"/>
      </div>

      <!-- Preview area -->
      <div id="csv-import-preview" style="max-height:200px;overflow-y:auto"></div>

      <div style="display:flex;gap:9px;margin-top:10px">
        <button class="btn btn-secondary" style="flex:1" onclick="closeGenModal()">Cancel</button>
        <button class="btn btn-primary" style="flex:2" id="csv-import-btn"
                onclick="confirmCSVImport()" disabled>📥 Import</button>
      </div>`);
  };

  let _csvImportData = [];

  window.downloadCSVTemplate = function () {
    const header = 'name,price,cost,stock,category,unit,lowAt,barcode,emoji';
    const sample = [
      'Omena 250g,150,90,50,Fish,packet,10,4897001234567,🐟',
      'Rice 1kg,120,70,100,Staples,kg,20,,🌾',
      'Chapati ×5,100,50,30,Bakery,pack,5,,🫓',
    ].join('\n');
    const csv = header + '\n' + sample;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'posh-products-template.csv';
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    _toast('⬇️ Template downloaded!');
  };

  window.previewCSVImport = function (input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      const lines = e.target.result.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) { _toast('⚠️ CSV is empty or has only headers'); return; }

      const header = lines[0].toLowerCase().split(',').map(h => h.trim());
      const col = name => header.indexOf(name);

      _csvImportData = lines.slice(1).map(line => {
        // Handle quoted fields
        const parts = _parseCSVLine(line);
        return {
          name:     (parts[col('name')]     || '').trim(),
          price:    parseFloat(parts[col('price')]  || '0') || 0,
          cost:     parseFloat(parts[col('cost')]   || '0') || 0,
          stock:    parseInt(parts[col('stock')]    || '0') || 0,
          category: (parts[col('category')] || 'General').trim(),
          unit:     (parts[col('unit')]     || '').trim(),
          lowAt:    parseInt(parts[col('lowat')]    || '5') || 5,
          barcode:  (parts[col('barcode')]  || '').trim(),
          emoji:    (parts[col('emoji')]    || '📦').trim(),
        };
      }).filter(r => r.name);

      const preview = $id('csv-import-preview');
      if (preview) {
        preview.innerHTML = `
          <div style="font-size:10px;font-weight:700;color:var(--muted);
                      text-transform:uppercase;margin-bottom:6px">
            Preview (${_csvImportData.length} products)
          </div>` +
          _csvImportData.slice(0, 10).map(r => `
            <div style="display:flex;align-items:center;gap:8px;padding:5px 0;
                        border-bottom:1px solid var(--brd)">
              <div style="flex:1">
                <div style="font-size:11px;font-weight:700;color:var(--text)">${_esc(r.name)}</div>
                <div style="font-size:10px;color:var(--muted)">
                  ${_fmt(r.price)} · Stock: ${r.stock} · ${r.category}
                </div>
              </div>
            </div>`).join('') +
          (_csvImportData.length > 10
            ? `<div style="font-size:10px;color:var(--muted);text-align:center;padding:6px">
                 + ${_csvImportData.length - 10} more…
               </div>` : '');
      }

      const btn = $id('csv-import-btn');
      if (btn) { btn.disabled = false; btn.textContent = `📥 Import ${_csvImportData.length} products`; }
    };
    reader.readAsText(file);
  };

  window.confirmCSVImport = function () {
    if (!_csvImportData.length) { _toast('⚠️ No products to import'); return; }
    const allProds = typeof products !== 'undefined' ? products : [];

    let added = 0, updated = 0;
    _csvImportData.forEach(row => {
      // Check if product already exists by name (case-insensitive)
      const existing = allProds.find(p => p.name.toLowerCase() === row.name.toLowerCase());
      if (existing) {
        // Update price + stock if changed
        if (row.price)   existing.price   = row.price;
        if (row.cost)    existing.cost    = row.cost;
        if (row.stock)   existing.stock   = row.stock;
        if (row.barcode) existing.barcode = row.barcode;
        updated++;
      } else {
        // Add new product
        const nextId = typeof window.nextId !== 'undefined' ? ++window.nextId : Date.now();
        allProds.push({
          id:       nextId,
          name:     row.name,
          price:    row.price,
          cost:     row.cost,
          stock:    row.stock,
          category: row.category,
          unit:     row.unit,
          lowAt:    row.lowAt,
          barcode:  row.barcode,
          emoji:    row.emoji,
          fav:      false,
        });
        added++;
      }
    });

    _save();
    if (typeof renderInv   === 'function') renderInv();
    if (typeof renderSales === 'function') renderSales();
    closeGenModal && closeGenModal();

    _audit('CSV_IMPORT', `Imported ${added} new, updated ${updated} products`);
    _toast(`✅ Imported ${added} new · ${updated} updated`);
    _csvImportData = [];
  };

  function _parseCSVLine(line) {
    const result = [];
    let cur = '', inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i+1] === '"') { cur += '"'; i++; }
        else inQuote = !inQuote;
      } else if (ch === ',' && !inQuote) {
        result.push(cur); cur = '';
      } else {
        cur += ch;
      }
    }
    result.push(cur);
    return result;
  }

  // ── Wire CSV Import into settings Data section ─────────
  (function addCSVImportToSettings() {
    const tryAdd = () => {
      const restoreRow = document.querySelector('[onclick*="restore-input"]');
      if (!restoreRow) { setTimeout(tryAdd, 700); return; }
      if (document.getElementById('csv-import-settings-row')) return;

      const row = document.createElement('div');
      row.id = 'csv-import-settings-row';
      row.className = 'settings-row';
      row.setAttribute('onclick', 'openCSVImport()');
      row.innerHTML = `
        <div class="sr-icon" style="background:var(--green-l)">📥</div>
        <div class="sr-info">
          <div class="sr-label">Import Products (CSV)</div>
          <div class="sr-sub">Bulk add from spreadsheet</div>
        </div>
        <span class="sr-arrow">›</span>`;
      restoreRow.parentNode.insertBefore(row, restoreRow.nextSibling);
    };
    tryAdd();
  })();

  // ══════════════════════════════════════════════════════
  //  6. FLOAT VARIANCE  (calcFloatVariance — wired to HTML)
  // ══════════════════════════════════════════════════════

  window.calcFloatVariance = function () {
    const actual   = parseFloat(($id('float-close-amount') || {}).value || '0');
    const varEl    = $id('float-variance');
    if (!varEl) return;

    const floatAmt_ = typeof floatAmount !== 'undefined' ? floatAmount : 0;
    const cashSales = (typeof filterSales === 'function' ? filterSales('today') : [])
      .filter(s => s.payment === 'Cash')
      .reduce((s, x) => s + x.total, 0);
    const expected = floatAmt_ + cashSales;

    if (!actual) { varEl.innerHTML = ''; return; }

    const diff = actual - expected;
    const color = Math.abs(diff) < 50 ? 'var(--green-text)' : diff > 0 ? 'var(--amber-text)' : 'var(--red-text)';
    const label = diff === 0 ? '✅ Balanced'
      : diff > 0 ? `⬆️ Over by ${_fmt(diff)}`
      : `⬇️ Short by ${_fmt(Math.abs(diff))}`;

    varEl.innerHTML = `
      <div style="background:var(--surf2);border-radius:10px;padding:10px 12px;margin-top:8px">
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
          <span style="color:var(--muted)">Expected</span>
          <span style="font-weight:700;color:var(--text)">${_fmt(expected)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
          <span style="color:var(--muted)">Counted</span>
          <span style="font-weight:700;color:var(--text)">${_fmt(actual)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:13px;
                    font-weight:800;color:${color};border-top:1px solid var(--brd);
                    padding-top:7px;margin-top:3px">
          <span>Variance</span>
          <span>${label}</span>
        </div>
      </div>`;
  };

  // ══════════════════════════════════════════════════════
  //  7. PRODUCT LABEL PRINTING
  // ══════════════════════════════════════════════════════
  //  Generates an A4 sheet of product labels (thermal-friendly text format)

  window.openLabelPrinter = function () {
    if (window.currentRole !== 'admin') { _toast('⛔ Admin only'); return; }

    const allProds = typeof products !== 'undefined' ? products : [];
    if (!allProds.length) { _toast('⚠️ No products to print labels for'); return; }

    if (typeof openGenModal !== 'function') return;

    const opts = allProds.map((p, i) => `
      <label style="display:flex;align-items:center;gap:8px;padding:6px 0;
                    border-bottom:1px solid var(--brd);cursor:pointer">
        <input type="checkbox" id="lp-check-${p.id}" checked
               style="width:16px;height:16px;accent-color:var(--acc)"/>
        <div style="flex:1">
          <div style="font-size:12px;font-weight:700;color:var(--text)">${_esc(p.name)}</div>
          <div style="font-size:10px;color:var(--muted)">${_fmt(p.price)}${p.barcode ? ' · ' + p.barcode : ''}</div>
        </div>
        <input type="number" id="lp-copies-${p.id}" value="1" min="1" max="50"
               style="width:48px;padding:4px 6px;font-size:11px;text-align:center;
                      border:1.5px solid var(--brd);border-radius:6px;
                      background:var(--surf);color:var(--text)"
               onclick="event.stopPropagation()"/>
      </label>`).join('');

    openGenModal('🏷 Print Product Labels', `
      <div style="max-height:45vh;overflow-y:auto;margin-bottom:12px">${opts}</div>
      <div style="display:flex;gap:6px;margin-bottom:10px">
        <button class="btn btn-secondary" style="flex:1;padding:8px;font-size:11px"
                onclick="document.querySelectorAll('[id^=lp-check-]').forEach(c=>c.checked=true)">
          All
        </button>
        <button class="btn btn-secondary" style="flex:1;padding:8px;font-size:11px"
                onclick="document.querySelectorAll('[id^=lp-check-]').forEach(c=>c.checked=false)">
          None
        </button>
        <button class="btn btn-secondary" style="flex:1;padding:8px;font-size:11px"
                onclick="document.querySelectorAll('[id^=lp-check-]').forEach((c,i)=>{if((${JSON.stringify(allProds.map(p=>p.stock))}).map(Number)[i]<=5) c.checked=true; else c.checked=false})">
          Low Stock
        </button>
      </div>
      <div style="display:flex;gap:9px">
        <button class="btn btn-secondary" style="flex:1" onclick="closeGenModal()">Cancel</button>
        <button class="btn btn-primary" style="flex:2" onclick="printSelectedLabels()">🖨 Print Labels</button>
      </div>`);
  };

  window.printSelectedLabels = function () {
    const allProds = typeof products !== 'undefined' ? products : [];
    const shopN = typeof shopName !== 'undefined' ? shopName : 'POSH';

    const toPrint = [];
    allProds.forEach(p => {
      const cb  = $id(`lp-check-${p.id}`);
      const cpy = parseInt(($id(`lp-copies-${p.id}`) || {}).value || '1') || 1;
      if (cb && cb.checked) {
        for (let i = 0; i < cpy; i++) toPrint.push(p);
      }
    });

    if (!toPrint.length) { _toast('⚠️ Select at least one product'); return; }

    // Build a printable HTML page with 3-column label grid
    const labelHTML = toPrint.map(p => `
      <div class="label">
        <div class="label-shop">${_esc(shopN)}</div>
        <div class="label-name">${_esc(p.name)}</div>
        <div class="label-price">${_fmt(p.price)}</div>
        ${p.barcode ? `<div class="label-barcode">${p.barcode}</div>` : ''}
        ${p.unit ? `<div class="label-unit">per ${_esc(p.unit)}</div>` : ''}
      </div>`).join('');

    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) { _toast('⚠️ Pop-up blocked — please allow pop-ups'); return; }

    win.document.write(`<!DOCTYPE html><html><head><style>
      @page { margin: 8mm; }
      body { margin:0; font-family: Arial, sans-serif; background:#fff; }
      .grid { display:grid; grid-template-columns:repeat(3,1fr); gap:4mm; }
      .label {
        border: 1px solid #ccc; border-radius: 4mm; padding: 4mm 5mm;
        text-align: center; page-break-inside: avoid;
        display: flex; flex-direction: column; align-items: center; gap: 1mm;
      }
      .label-shop   { font-size:8pt; color:#999; font-weight:bold; text-transform:uppercase; }
      .label-emoji  { font-size:24pt; line-height:1; }
      .label-name   { font-size:11pt; font-weight:bold; color:#000; }
      .label-price  { font-size:14pt; font-weight:900; color:#000; }
      .label-barcode{ font-size:7pt; color:#555; letter-spacing:1px; font-family:monospace; }
      .label-unit   { font-size:7pt; color:#999; }
    </style></head><body>
      <div class="grid">${labelHTML}</div>
    </body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 500);

    _audit('LABELS', `Printed ${toPrint.length} product label(s)`);
    closeGenModal && closeGenModal();
  };

  // ── Wire label printer to Inventory screen ─────────────
  (function addLabelPrintToInventory() {
    const tryAdd = () => {
      const invHeader = document.querySelector('#screen-stock .screen-sticky-header > div');
      if (!invHeader) { setTimeout(tryAdd, 700); return; }
      if (document.getElementById('inv-label-btn')) return;

      const btn = document.createElement('button');
      btn.id = 'inv-label-btn';
      btn.className = 'btn btn-secondary';
      btn.style.cssText = 'padding:7px 11px;font-size:11px';
      btn.textContent = '🏷 Labels';
      btn.onclick = () => window.openLabelPrinter();

      const btnRow = invHeader.querySelector('div[style*="display:flex"]') || invHeader;
      btnRow.insertBefore(btn, btnRow.children[1] || btnRow.firstChild);
    };
    tryAdd();
  })();

  // ══════════════════════════════════════════════════════
  //  8. MISC FIXES — openHeatmapModal, openCashFlowModal,
  //                  openLoyaltyModal, Idle UI
  // ══════════════════════════════════════════════════════

  // Heatmap modal
  window.openHeatmapModal = function () {
    const grid = $id('heatmap-grid');
    const allSales = typeof sales !== 'undefined' ? sales : [];
    if (grid && typeof buildHourlyHeatmap === 'function' && typeof renderHeatmap === 'function') {
      grid.innerHTML = renderHeatmap(buildHourlyHeatmap(allSales));
    }
    const insEl = $id('heatmap-insights');
    if (insEl) {
      // Find busiest hour
      const hourTotals = new Array(24).fill(0);
      allSales.forEach(s => { hourTotals[new Date(s.ts).getHours()] += s.total; });
      const peakHour = hourTotals.indexOf(Math.max(...hourTotals));
      insEl.innerHTML = hourTotals[peakHour] > 0
        ? `<div style="padding:9px 12px;background:var(--acc-l);border-radius:10px;font-size:12px;font-weight:700;color:var(--acc)">
             🕐 Peak hour: ${peakHour}:00–${peakHour+1}:00 (${_fmt(hourTotals[peakHour])})
           </div>`
        : '';
    }
    _openModal('heatmap-modal', 'heatmap-ov');
  };
  window.closeHeatmapModal = function () { _closeModal('heatmap-modal', 'heatmap-ov'); };

  // Cash flow modal
  window.openCashFlowModal = function () {
    const cfEl = $id('cashflow-content');
    if (cfEl && typeof renderCashFlowTable === 'function' && typeof buildCashFlow === 'function') {
      cfEl.innerHTML = renderCashFlowTable(buildCashFlow(14));
    }
    _openModal('cashflow-modal', 'cashflow-ov');
  };
  window.closeCashFlowModal = function () { _closeModal('cashflow-modal', 'cashflow-ov'); };

  // Loyalty modal — open as gen modal if dedicated modal doesn't exist
  window.openLoyaltyModal = function () {
    if ($id('loyalty-modal')) {
      _openModal('loyalty-modal', 'loyalty-ov');
      return;
    }
    const earnRate   = localStorage.getItem('posh_loyalty_earn')   || '10';
    const redeemRate = localStorage.getItem('posh_loyalty_redeem') || '1';

    if (typeof openGenModal !== 'function') return;
    openGenModal('⭐ Loyalty Points', `
      <div style="text-align:center;margin-bottom:16px">
        <div style="font-size:36px">⭐</div>
        <div style="font-size:12px;color:var(--muted);margin-top:6px">
          Customers earn points on every purchase
        </div>
      </div>
      <div class="form-group">
        <label class="field-label">Earn Rate</label>
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:12px;color:var(--muted)">1 point per</span>
          <input class="field" id="loyalty-earn-rate" type="number" min="1"
                 value="${earnRate}" style="width:80px;text-align:center;font-weight:700"/>
          <span style="font-size:12px;color:var(--muted)">${typeof currency !== 'undefined' ? currency : 'KSh'}</span>
        </div>
      </div>
      <div class="form-group">
        <label class="field-label">Redeem Rate</label>
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:12px;color:var(--muted)">1 point =</span>
          <input class="field" id="loyalty-redeem-rate" type="number" min="1"
                 value="${redeemRate}" style="width:80px;text-align:center;font-weight:700"/>
          <span style="font-size:12px;color:var(--muted)">${typeof currency !== 'undefined' ? currency : 'KSh'}</span>
        </div>
      </div>
      <div style="display:flex;gap:9px;margin-top:4px">
        <button class="btn btn-secondary" style="flex:1" onclick="closeGenModal()">Cancel</button>
        <button class="btn btn-primary" style="flex:2" onclick="saveLoyaltySettings();closeGenModal()">Save</button>
      </div>`);
  };
  window.closeLoyaltyModal = function () { _closeModal('loyalty-modal', 'loyalty-ov'); };

  // idle setting display refresh
  (function patchIdleDisplay() {
    const tryPatch = () => {
      const _orig = window.openIdleModal;
      if (typeof _orig !== 'function') { setTimeout(tryPatch, 400); return; }
      window.openIdleModal = function () {
        _orig.apply(this, arguments);
        const mins = parseInt(localStorage.getItem('posh_idle_minutes') || '30');
        const el = $id('sb-idle-sub');
        if (el) el.textContent = `After ${mins} min${mins !== 1 ? 's' : ''}`;
        const el2 = $id('idle-setting-sub');
        if (el2) el2.textContent = `After ${mins} min${mins !== 1 ? 's' : ''}`;
      };
    };
    tryPatch();
  })();

  console.log('POSH features.js loaded ✅ — Returns, POs, Variants, Z-Report, CSV Import, Variance, Labels');

})();
