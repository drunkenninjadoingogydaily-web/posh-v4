// ═══════════════════════════════════════════════════════
//  POSH — Quick Wins (quickwins.js)  ✅ DEBUGGED & EXTENDED
//  Loaded AFTER app.js. Overrides / extends existing fns.
//  Features:
//   1.  PIN brute-force lockout  (bug-fixed: ID mismatch)

// ── SAFE localStorage JSON helper (BUG FIX: prevents crashes on corrupt data) ──
function safeParseLS(key,fallback){
  try{var r=localStorage.getItem(key);return r?JSON.parse(r):fallback;}
  catch(e){console.warn('POSH: corrupt localStorage key "'+key+'" — resetting',e);localStorage.removeItem(key);return fallback;}
}
//   2.  Onboarding wizard        (bug-fixed: obNext arg handling)
//   3.  Multi-currency support
//   4.  VAT / tax engine
//   5.  Opening & closing float
//   6.  Split payment
//   7.  Hourly sales heatmap
//   8.  Product profitability table
//   9.  Cash flow report + CSV export
//  10.  Push notifications (low-stock)
//  11.  Firestore security rules
//  12.  🆕 Biometric authentication (WebAuthn)
//  13.  🆕 Full Audit Log
//  14.  🆕 Sales Forecast (linear regression)
//  15.  🆕 Full Sales CSV export
//  16.  🆕 Discount engine (% + flat)
//  17.  🆕 Theme switcher (applyTheme alias fixed)
// ═══════════════════════════════════════════════════════

// ─── EXTENDED DATA VARS ───────────────────────────────
var currency     = localStorage.getItem('posh_currency')     || 'KSh';
var currencyCode = localStorage.getItem('posh_currencyCode') || 'KES';
var vatRate      = parseFloat(localStorage.getItem('posh_vat') || '0');
var vatEnabled   = localStorage.getItem('posh_vatEnabled') === 'true';
var floatAmount  = parseFloat(localStorage.getItem('posh_float') || '0');
var floatSet     = localStorage.getItem('posh_floatSet') === 'true';
var onboardingDone = localStorage.getItem('posh_onboarded') === 'true';

// PIN lockout state — persisted to localStorage so reload can't bypass it
let pinFailCount   = 0;
let pinLockedUntil = 0;
const PIN_MAX_ATTEMPTS = 5;
const PIN_LOCKOUT_MS   = 5 * 60 * 1000; // 5 minutes

// BUG FIX #10: helpers to persist/restore lockout state across page reloads
function _savePinLock() {
  localStorage.setItem('posh_pinLock', String(pinLockedUntil));
}
function _clearPinLock() {
  pinLockedUntil = 0;
  localStorage.removeItem('posh_pinLock');
}

// ─── SAFE getById ─────────────────────────────────────
// Prevents crashes when elements don't exist in HTML
function $id(id){ return document.getElementById(id); }
function safeClass(id, method, cls){
  const el = $id(id);
  if(el) el.classList[method](cls);
}

// ═══════════════════════════════════════════════════════
//  1. PIN BRUTE-FORCE LOCKOUT  (Bug-fixed: correct element IDs)
// ═══════════════════════════════════════════════════════
(function patchPinLockout(){
  const _orig = window.checkPin;
  window.checkPin = function(){
    if(Date.now() < pinLockedUntil){
      showLockout();
      window.pinEntry = '';
      if(typeof updatePinDots === 'function') updatePinDots();
      return;
    }

    if(window.pinMode === 'verify'){
      const correct = (window.pinEntry === window.adminPin || window.pinEntry === window.staffPin);
      if(correct){
        pinFailCount   = 0;
        pinLockedUntil = 0;
        _clearPinLock(); // BUG FIX #10
        hideLockout();
        _orig && _orig.call(this);
      } else {
        pinFailCount++;
        if(pinFailCount >= PIN_MAX_ATTEMPTS){
          pinLockedUntil = Date.now() + PIN_LOCKOUT_MS;
          pinFailCount   = 0;
          window.pinEntry = '';
          _savePinLock(); // BUG FIX #10: persist so reload can't bypass lockout
          if(typeof updatePinDots === 'function') updatePinDots();
          showLockout();
          startLockoutCountdown();
        } else {
          if(typeof shakeDots === 'function') shakeDots();
          const remaining = PIN_MAX_ATTEMPTS - pinFailCount;
          const hint = $id('pin-hint');
          if(hint) hint.textContent = `Wrong PIN — ${remaining} attempt${remaining !== 1 ? 's' : ''} left`;
          setTimeout(()=>{ window.pinEntry = ''; if(typeof updatePinDots === 'function') updatePinDots(); }, 400);
        }
      }
    } else {
      _orig && _orig.call(this);
    }
  };
})();

// BUG FIX: HTML uses id="pin-lockout-banner" and id="pin-lockout-countdown"
// (old quickwins used wrong IDs: "lockout-banner" / "lockout-timer")
function showLockout(){
  const b = $id('pin-lockout-banner');
  const h = $id('pin-hint');
  if(b) b.style.display = 'block';
  if(h) h.textContent   = 'App locked due to too many attempts';
}
function hideLockout(){
  const b = $id('pin-lockout-banner');
  if(b) b.style.display = 'none';
}
function startLockoutCountdown(){
  const timerEl = $id('pin-lockout-countdown'); // BUG FIX: was "lockout-timer"
  if(!timerEl) return;
  const iv = setInterval(()=>{
    const ms = pinLockedUntil - Date.now();
    if(ms <= 0){
      clearInterval(iv);
      hideLockout();
      _clearPinLock(); // BUG FIX #10: clean up persisted lock
      const hint = $id('pin-hint');
      if(hint) hint.textContent = 'Enter your PIN';
      return;
    }
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    timerEl.textContent = `${m}:${s.toString().padStart(2, '0')}`;
  }, 1000);
}

// BUG FIX #10: check persisted lockout on every page load — prevents reload bypass
(function _restorePinLockout() {
  var stored = localStorage.getItem('posh_pinLock');
  if (!stored) return;
  var lockUntil = parseInt(stored, 10);
  if (Date.now() < lockUntil) {
    pinLockedUntil = lockUntil;
    // Wait for DOM to be ready
    document.addEventListener('DOMContentLoaded', function() {
      showLockout();
      startLockoutCountdown();
    });
  } else {
    localStorage.removeItem('posh_pinLock'); // expired — clean up
  }
})();

// BUG FIX #12: safe JSON parser — prevents app crash on corrupted localStorage data
function safeParseJSON(raw, fallback) {
  if (!raw) return (fallback !== undefined ? fallback : {});
  try { return JSON.parse(raw); }
  catch(e) { console.warn('[POSH] JSON parse failed:', e); return (fallback !== undefined ? fallback : {}); }
}
window.safeParseJSON = safeParseJSON;


// ═══════════════════════════════════════════════════════
let obStep = 0;
const OB_TOTAL = 4; // 4 screens: ob-s1 … ob-s4

function showOnboarding(){
  const el = $id('onboarding-modal');
  if(!el) return;
  el.style.display = 'flex';
  obGoTo(0);
}
function hideOnboarding(){
  const el = $id('onboarding-modal');
  if(el) el.style.display = 'none';
}

// BUG FIX: HTML calls obNext(2), obNext(3), obNext(4) — meaning "show screen N"
// where N is 1-indexed. obGoTo uses 0-indexed querySelectorAll order.
function obGoTo(n){
  obStep = n;
  document.querySelectorAll('#onboarding-modal .ob-screen').forEach((s, i)=>{
    s.style.display = i === n ? 'flex' : 'none';
  });
}
// obNext validates + saves current step's data, then advances
window.obNext = function(screenNum){
  // Validate current step before advancing
  if(obStep === 1){ // screen 2 — shop info
    const sn = ($id('ob-shopname')||{}).value?.trim();
    if(!sn){ if(typeof toast==='function') toast('⚠️ Please enter your shop name'); return; }
    window.shopName = sn;
    const gl = parseInt(($id('ob-goal')||{}).value||'0');
    if(gl > 0) window.dailyGoal = gl;
    const tx = parseFloat(($id('ob-tax')||{}).value||'0');
    if(tx > 0){ vatRate=tx; vatEnabled=true; localStorage.setItem('posh_vat',tx); localStorage.setItem('posh_vatEnabled','true'); }
  }
  if(obStep === 2){ // screen 3 — PINs
    const ap = ($id('ob-adminpin')||{}).value?.trim()||'';
    const sp = ($id('ob-staffpin')||{}).value?.trim()||'';
    if(ap.length !== 4 || !/^\d{4}$/.test(ap)){ if(typeof toast==='function') toast('⚠️ Admin PIN must be exactly 4 digits'); return; }
    if(sp.length !== 4 || !/^\d{4}$/.test(sp)){ if(typeof toast==='function') toast('⚠️ Staff PIN must be exactly 4 digits'); return; }
    if(ap === sp){ if(typeof toast==='function') toast('⚠️ Admin and Staff PINs must be different'); return; }
    window.adminPin = ap;
    window.staffPin = sp;
    const ph = ($id('ob-phone')||{}).value?.trim();
    if(ph) window.resetPhone = ph;
  }
  // Advance: HTML passes 1-indexed screen number
  if(typeof screenNum === 'number'){
    obGoTo(screenNum - 1);
  } else {
    if(obStep < OB_TOTAL - 1) obGoTo(obStep + 1);
  }
};
function obBack(){ if(obStep > 0) obGoTo(obStep - 1); }

function obSaveShopName(){
  const val = ($id('ob-shopname') || {}).value?.trim();
  if(!val){ if(typeof toast === 'function') toast('⚠️ Enter your shop name'); return; }
  window.shopName = val;
  obGoTo(obStep + 1);
}
function obSaveCurrency(){
  const sel = $id('ob-currency');
  if(!sel) return;
  const parts = sel.value.split('|');
  currencyCode = parts[0];
  currency     = parts[1] || parts[0];
  localStorage.setItem('posh_currency',     currency);
  localStorage.setItem('posh_currencyCode', currencyCode);
  updateCurrencyDisplay();
  obGoTo(obStep + 1);
}
function obSaveAdminPin(){
  const p1 = ($id('ob-adminpin') || {}).value || '';
  if(p1.length !== 4 || !/^\d{4}$/.test(p1)){ toast('⚠️ Admin PIN must be exactly 4 digits'); return; }
  window.adminPin = p1;
  obGoTo(obStep + 1);
}
function obSaveStaffPin(){
  const p1 = ($id('ob-staffpin') || {}).value || '';
  if(p1.length !== 4 || !/^\d{4}$/.test(p1)){ toast('⚠️ Staff PIN must be exactly 4 digits'); return; }
  if(p1 === window.adminPin){ toast('⚠️ Staff PIN must differ from Admin PIN'); return; }
  window.staffPin = p1;
  obGoTo(obStep + 1);
}

function finishOnboarding(){
  // Save shop name if filled
  const sn = ($id('ob-shopname')||{}).value?.trim();
  if(sn) window.shopName = sn;
  // Save goal if filled
  const gl = parseInt(($id('ob-goal')||{}).value || '0');
  if(gl > 0) window.dailyGoal = gl;
  // Save tax if filled
  const tx = parseFloat(($id('ob-tax')||{}).value || '0');
  if(tx > 0){ vatRate = tx; vatEnabled = true; localStorage.setItem('posh_vat', tx); localStorage.setItem('posh_vatEnabled','true'); }
  // Save recovery phone if filled
  const ph = ($id('ob-phone')||{}).value?.trim();
  if(ph) window.resetPhone = ph;
  // Save PINs if filled (may have been set step by step already)
  const ap = ($id('ob-adminpin')||{}).value?.trim();
  const sp = ($id('ob-staffpin')||{}).value?.trim();
  if(ap && ap.length === 4) window.adminPin = ap;
  if(sp && sp.length === 4) window.staffPin = sp;

  localStorage.setItem('posh_onboarded', 'true');
  onboardingDone = true;
  hideOnboarding();
  if(typeof saveData === 'function') saveData();
  if(typeof renderDashboard === 'function') renderDashboard();

  // ── After onboarding, always show the PIN screen so the user
  //    logs in with the PINs they just created (admin or staff).
  var pinScreen = document.getElementById('pin-screen');
  var appEl     = document.getElementById('app');
  if(pinScreen) pinScreen.style.display = 'flex';
  if(appEl)     appEl.style.display     = 'none';

  // Update the PIN hint to reflect that setup is done
  var pinHint = document.getElementById('pin-hint');
  if(pinHint) pinHint.textContent = 'Enter your Admin or Staff PIN to continue';

  if(typeof toast === 'function') toast('🎉 Setup complete! Please log in.');
}

// BUG FIX: HTML uses applyTheme() inside onboarding; wire obTheme and obFinish
window.obTheme = function(el, name){ setTheme(name); document.querySelectorAll('.ob-theme-opt').forEach(x=>x.classList.remove('active')); if(el) el.classList.add('active'); };
window.obFinish = finishOnboarding;

// Patch unlockApp to check biometric availability after login
(function patchUnlockForOnboarding(){
  const _orig = window.unlockApp;
  window.unlockApp = function(){
    _orig && _orig();
    // Onboarding is shown before PIN on first launch (not after unlock)
    checkBiometricAvailability();
  };
})();

// ═══════════════════════════════════════════════════════
//  3. MULTI-CURRENCY SUPPORT
// ═══════════════════════════════════════════════════════
(function patchFmt(){
  window.fmt = function(n){
    return currency + ' ' + Number(n).toLocaleString(undefined, {minimumFractionDigits:0, maximumFractionDigits:0});
  };
  window.fmtS = function(n){
    if(n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if(n >= 1000)    return (n / 1000).toFixed(1) + 'K';
    return String(Math.round(n));
  };
})();

function updateCurrencyDisplay(){
  const heroCur = $id('hero-currency');
  if(heroCur) heroCur.textContent = currency;
  if(typeof renderDashboard === 'function') renderDashboard();
}

function openCurrencyModal(){
  const CURRENCIES = [
    ['KES','KSh','Kenyan Shilling'],['UGX','UGX','Ugandan Shilling'],['TZS','TSh','Tanzanian Shilling'],
    ['NGN','₦','Nigerian Naira'],['GHS','GH₵','Ghanaian Cedi'],['USD','$','US Dollar'],
    ['GBP','£','British Pound'],['EUR','€','Euro'],['ZAR','R','South African Rand'],
  ];
  if(typeof openGenModal !== 'function') return;
  openGenModal('Currency', `
    <div class="form-group">
      <label class="field-label">Select Currency</label>
      <select class="field" id="cur-select">
        ${CURRENCIES.map(([code,sym,name])=>`<option value="${code}|${sym}" ${currencyCode===code?'selected':''}>${sym} — ${name} (${code})</option>`).join('')}
      </select>
    </div>
    <div style="display:flex;gap:9px">
      <button class="btn btn-secondary" style="flex:1" onclick="closeGenModal()">Cancel</button>
      <button class="btn btn-primary" style="flex:2" onclick="
        var p=document.getElementById('cur-select').value.split('|');
        currencyCode=p[0]; currency=p[1];
        localStorage.setItem('posh_currency',currency);
        localStorage.setItem('posh_currencyCode',currencyCode);
        updateCurrencyDisplay();
        var el=document.getElementById('currency-setting-val');
        if(el) el.textContent=currencyCode+' — '+currency;
        closeGenModal();
        toast('✅ Currency updated to '+currency);
      ">Save</button>
    </div>`);
}

// ═══════════════════════════════════════════════════════
//  4. VAT / TAX ENGINE
// ═══════════════════════════════════════════════════════
function calcVAT(subtotal){ return(!vatEnabled || vatRate <= 0) ? 0 : Math.round(subtotal * vatRate / 100); }
function cartSubtotal(){ return cart.reduce((s,x)=>s+(x.prodType==='bulk'?x.price:x.price*x.qty), 0); }

window.cartTotal = function(){
  const sub = cartSubtotal();
  const disc = _cartDiscount ? calcDiscountAmount(sub, _cartDiscount) : 0;
  return sub - disc + calcVAT(sub - disc);
};

function openVATModal(){
  if(typeof openGenModal !== 'function') return;
  openGenModal('VAT / Tax Settings', `
    <div class="form-group">
      <label class="field-label" style="display:flex;align-items:center;justify-content:space-between">
        Enable VAT
        <div class="toggle-track${vatEnabled?' on':''}" id="vat-toggle" onclick="this.classList.toggle('on');document.getElementById('vat-rate-wrap').style.display=this.classList.contains('on')?'block':'none'"><div class="toggle-thumb"></div></div>
      </label>
    </div>
    <div id="vat-rate-wrap" style="display:${vatEnabled?'block':'none'}">
      <div class="form-group">
        <label class="field-label">VAT Rate (%)</label>
        <input class="field" id="vat-rate-input" type="number" min="0" max="100" step="0.5" value="${vatRate}" placeholder="e.g. 16"/>
        <div style="font-size:11px;color:var(--muted);margin-top:5px">Kenya standard rate is 16%.</div>
      </div>
    </div>
    <div style="display:flex;gap:9px">
      <button class="btn btn-secondary" style="flex:1" onclick="closeGenModal()">Cancel</button>
      <button class="btn btn-primary" style="flex:2" onclick="
        vatEnabled=document.getElementById('vat-toggle').classList.contains('on');
        vatRate=parseFloat(document.getElementById('vat-rate-input')?.value)||0;
        localStorage.setItem('posh_vat',vatRate);
        localStorage.setItem('posh_vatEnabled',vatEnabled);
        var el=document.getElementById('vat-setting-val');
        if(el) el.textContent=vatEnabled?'VAT '+vatRate+'%':'Disabled';
        closeGenModal();
        toast('✅ Tax settings saved');
      ">Save</button>
    </div>`);
}

(function patchCartSheet(){
  const _orig = window.renderCartSheet;
  window.renderCartSheet = function(){
    _orig && _orig();
    const sub  = cartSubtotal();
    const disc = _cartDiscount ? calcDiscountAmount(sub, _cartDiscount) : 0;
    const afterDisc = sub - disc;
    const vat  = calcVAT(afterDisc);
    const totEl = $id('cs-totals');
    if(totEl){
      let extra = '';
      if(disc > 0) extra += `<div class="cs-total-row" style="color:var(--green-text)"><span>Discount</span><span>−${fmt(disc)}</span></div>`;
      if(vatEnabled && vat > 0) extra += `<div class="cs-total-row" style="color:var(--amber-text)"><span>VAT ${vatRate}%</span><span>+${fmt(vat)}</span></div>`;
      if(extra) totEl.innerHTML += extra;
    }
    const amtEl = $id('checkout-amount');
    if(amtEl) amtEl.textContent = fmt(afterDisc + vat);
  };
})();

// ═══════════════════════════════════════════════════════
//  5. OPENING & CLOSING FLOAT
// ═══════════════════════════════════════════════════════
function openFloatModal(){
  const cashSalesToday = (typeof filterSales === 'function' ? filterSales('today') : [])
    .filter(s=>s.payment==='Cash').reduce((s,x)=>s+x.total, 0);
  const expectedClose = floatAmount + cashSalesToday;
  if(typeof openGenModal !== 'function') return;
  openGenModal('Cash Float', floatSet
    ? `<div style="background:var(--green-l);border:1px solid var(--green);border-radius:12px;padding:12px;margin-bottom:14px">
         <div style="font-size:10px;font-weight:700;color:var(--green-text);text-transform:uppercase">Opening Float</div>
         <div style="font-size:22px;font-weight:800;color:var(--green-text)">${fmt(floatAmount)}</div>
       </div>
       <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">
         <div style="background:var(--surf2);border:1px solid var(--brd);border-radius:12px;padding:11px">
           <div style="font-size:9px;font-weight:700;color:var(--muted);text-transform:uppercase">Cash Sales</div>
           <div style="font-size:16px;font-weight:800;color:var(--acc)">${fmt(cashSalesToday)}</div>
         </div>
         <div style="background:var(--surf2);border:1px solid var(--brd);border-radius:12px;padding:11px">
           <div style="font-size:9px;font-weight:700;color:var(--muted);text-transform:uppercase">Expected Close</div>
           <div style="font-size:16px;font-weight:800;color:var(--text)">${fmt(expectedClose)}</div>
         </div>
       </div>
       <div class="form-group">
         <label class="field-label">Actual Cash in Till</label>
         <input class="field" id="close-float" type="number" placeholder="${expectedClose}" style="font-size:18px;font-weight:700;text-align:center"/>
       </div>
       <button class="btn btn-primary btn-full" onclick="closeFloat()">Close Shift →</button>
       <button class="btn btn-secondary btn-full" style="margin-top:8px" onclick="closeGenModal()">Cancel</button>`
    : `<div class="form-group">
         <label class="field-label">Opening Cash Float (${currency})</label>
         <input class="field" id="open-float" type="number" placeholder="e.g. 2000" style="font-size:20px;font-weight:700;text-align:center"/>
         <div style="font-size:11px;color:var(--muted);margin-top:5px">Cash in the till at shift start</div>
       </div>
       <div style="display:flex;gap:9px">
         <button class="btn btn-secondary" style="flex:1" onclick="closeGenModal()">Cancel</button>
         <button class="btn btn-primary" style="flex:2" onclick="setOpenFloat()">Set Float</button>
       </div>`);
}

function setOpenFloat(){
  const v = parseFloat(($id('open-float') || {}).value || '0');
  if(v <= 0){ toast('⚠️ Enter a valid float amount'); return; }
  floatAmount = v; floatSet = true;
  localStorage.setItem('posh_float', floatAmount);
  localStorage.setItem('posh_floatSet', 'true');
  closeGenModal();
  toast(`✅ Float set to ${fmt(floatAmount)}`);
  renderFloatCard();
}

function closeFloat(){
  const actual    = parseFloat(($id('close-float') || {}).value || '0');
  const cashSales = (typeof filterSales === 'function' ? filterSales('today') : []).filter(s=>s.payment==='Cash').reduce((s,x)=>s+x.total, 0);
  const expected  = floatAmount + cashSales;
  const diff      = actual - expected;
  const diffStr   = diff > 0 ? `Over by ${fmt(diff)}` : diff < 0 ? `Short by ${fmt(Math.abs(diff))}` : 'Balanced ✅';
  closeGenModal();
  if(typeof showConfirm === 'function'){
    showConfirm('Shift Close Summary',
      `Opening: ${fmt(floatAmount)} · Cash Sales: ${fmt(cashSales)} · Expected: ${fmt(expected)} · Actual: ${fmt(actual)} → ${diffStr}`,
      ()=>{
        floatSet = false; floatAmount = 0;
        localStorage.setItem('posh_floatSet', 'false');
        localStorage.setItem('posh_float', '0');
        renderFloatCard();
        addAuditEntry('SHIFT_CLOSE', `Float closed. ${diffStr}`);
        toast('✅ Shift closed');
      }, false);
  }
}

function renderFloatCard(){
  // HTML uses id="float-status-card" (the section wrapper)
  const fc  = $id('float-status-card');
  const openEl  = $id('float-opening-display');
  const expEl   = $id('float-expected-display');
  if(!fc) return;
  if(floatSet){
    const cashSales = (typeof filterSales === 'function' ? filterSales('today') : [])
      .filter(s=>s.payment==='Cash').reduce((s,x)=>s+x.total, 0);
    if(openEl) openEl.textContent = fmt(floatAmount);
    if(expEl)  expEl.textContent  = fmt(floatAmount + cashSales);
    fc.style.display = 'block';
  } else {
    fc.style.display = 'none';
  }
}

// Float modal HTML wiring
window.openShiftFloat = function(){
  const v = parseFloat(($id('float-open-amount') || {}).value || '0');
  if(v <= 0){ toast('⚠️ Enter a valid float amount'); return; }
  floatAmount = v; floatSet = true;
  localStorage.setItem('posh_float', floatAmount);
  localStorage.setItem('posh_floatSet', 'true');
  const openForm = $id('float-open-form');
  const closeForm = $id('float-close-form');
  if(openForm)  openForm.style.display = 'none';
  if(closeForm) closeForm.style.display = 'block';
  renderFloatCard();
  toast('✅ Shift opened — Float: ' + fmt(floatAmount));
};
window.closeShiftFloat = function(){
  floatSet = false;
  localStorage.setItem('posh_floatSet', 'false');
  safeClass('float-modal', 'remove', 'open');
  safeClass('float-ov', 'remove', 'show');
  renderFloatCard(); toast('✅ Shift closed');
};

// ═══════════════════════════════════════════════════════
//  6. SPLIT PAYMENT
// ═══════════════════════════════════════════════════════
var splitPayments = [];
function openSplitPayment(){
  splitPayments = [{method:'Cash',amount:0},{method:'M-Pesa',amount:0}];
  const sec = $id('split-payment-section');
  if(sec) sec.style.display = 'block';
  renderSplitRows();
}
function renderSplitRows(){
  const wrap = $id('split-rows');
  if(!wrap) return;
  wrap.innerHTML = splitPayments.map((sp, i)=>
    `<div class="split-row" style="display:flex;gap:8px;align-items:center;margin-bottom:6px">
      <select class="field" style="flex:1;padding:8px 10px;font-size:12px" onchange="splitPayments[${i}].method=this.value">
        ${['Cash','M-Pesa','Card','Other'].map(m=>`<option${sp.method===m?' selected':''}>${m}</option>`).join('')}
      </select>
      <input class="field" type="number" value="${sp.amount}" style="flex:1;padding:8px 10px;font-size:13px;font-weight:700;text-align:right" oninput="splitPayments[${i}].amount=parseFloat(this.value)||0;updateSplitBalance()"/>
      ${splitPayments.length > 2 ? `<button onclick="splitPayments.splice(${i},1);renderSplitRows()" style="background:none;border:none;color:var(--red-text);font-size:18px;cursor:pointer;padding:0 4px">×</button>` : ''}
    </div>`).join('') +
    `<div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px">
       <button class="btn btn-secondary btn-sm" onclick="splitPayments.push({method:'Cash',amount:0});renderSplitRows()">+ Add method</button>
       <span id="split-balance" style="font-size:12px;font-weight:700"></span>
     </div>`;
  updateSplitBalance();
}
function updateSplitBalance(){
  const total     = typeof cartTotal === 'function' ? cartTotal() : 0;
  const allocated = splitPayments.reduce((s,x)=>s + (parseFloat(x.amount)||0), 0);
  const diff      = total - allocated;
  const el        = $id('split-balance');
  if(!el) return;
  if(Math.abs(diff) < 1){ el.textContent = '✅ Balanced'; el.style.color = 'var(--green-text)'; }
  else if(diff > 0){ el.textContent = `${fmt(diff)} unallocated`; el.style.color = 'var(--red-text)'; }
  else { el.textContent = `Over by ${fmt(Math.abs(diff))}`; el.style.color = 'var(--amber-text)'; }
}
window.updateSplitTotal = updateSplitBalance;

(function patchConfirmSale(){
  const _orig = window.confirmSale;
  window.confirmSale = function(){
    const payment = ($id('pay-method') || {}).value;
    if(payment === 'Split'){
      const total     = typeof cartTotal === 'function' ? cartTotal() : 0;
      const allocated = splitPayments.reduce((s,x)=>s+(parseFloat(x.amount)||0), 0);
      if(Math.abs(total - allocated) > 1){ toast('⚠️ Split amounts must equal total: ' + fmt(total)); return; }
    }
    const origPush = sales.push.bind(sales);
    const patchedPush = (sale)=>{
      if(vatEnabled && vatRate > 0){ sale.vatRate = vatRate; sale.vatAmount = calcVAT(cartSubtotal()); }
      if(payment === 'Split' && splitPayments.length){ sale.splitPayments = [...splitPayments]; }
      if(_cartDiscount){ sale.discount = {..._cartDiscount}; }
      origPush(sale);
      addAuditEntry('SALE', `Sale #${String(sale.id).slice(-4)} · ${fmt(sale.total)} · ${payment}`);
    };
    const realPush = sales.push;
    sales.push = function(s){ patchedPush(s); };
    _orig && _orig();
    sales.push = realPush;
    splitPayments = [];
    _cartDiscount = null;
    const sec = $id('split-payment-section');
    if(sec) sec.style.display = 'none';
    // low-stock notification
    setTimeout(checkLowStockNotification, 500);
  };
})();

// ═══════════════════════════════════════════════════════
//  7. HOURLY SALES HEATMAP
// ═══════════════════════════════════════════════════════
function buildHourlyHeatmap(salesList){
  const matrix = Array.from({length:7}, ()=>new Array(24).fill(0));
  salesList.forEach(s=>{
    const d = new Date(s.ts);
    matrix[d.getDay()][d.getHours()] += s.total;
  });
  return matrix;
}
function renderHeatmap(matrix){
  const flatValues = matrix.flat().filter(v=>v>0);
  const maxVal     = flatValues.length ? Math.max(...flatValues) : 1;
  const days       = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const hours      = Array.from({length:24},(_,i)=>i);
  const getColor   = (val)=>{ if(!val) return 'var(--surf2)'; return `rgba(var(--acc-rgb,255,184,0),${(0.15+val/maxVal*0.85).toFixed(2)})`; };
  const headerRow  = `<div style="display:grid;grid-template-columns:32px repeat(24,1fr);gap:2px;margin-bottom:3px"><div></div>${hours.map(h=>h%3===0?`<div style="font-size:7px;color:var(--muted);text-align:center;font-weight:600">${h}h</div>`:'<div></div>').join('')}</div>`;
  const body       = days.map((day,di)=>`<div style="display:grid;grid-template-columns:32px repeat(24,1fr);gap:2px;margin-bottom:2px"><div style="font-size:8px;color:var(--muted);font-weight:700;display:flex;align-items:center">${day}</div>${hours.map(h=>{const v=matrix[di][h];return`<div title="${v?`${day} ${h}:00 — ${fmt(v)}`:''}" style="height:14px;border-radius:3px;background:${getColor(v)};cursor:${v?'pointer':'default'}" onclick="${v?`toast('${day} ${h}:00 — ${fmt(v)}')`:''}" ></div>`;}).join('')}</div>`).join('');
  return `<div style="overflow-x:auto">${headerRow}${body}</div><div style="display:flex;align-items:center;gap:6px;margin-top:8px;font-size:9px;color:var(--muted)"><span>Low</span><div style="display:flex;gap:2px">${[0.1,0.3,0.5,0.7,1].map(p=>`<div style="width:14px;height:10px;border-radius:2px;background:rgba(var(--acc-rgb,255,184,0),${(0.15+p*0.85).toFixed(2)})"></div>`).join('')}</div><span>High</span><span style="margin-left:auto">Tap a cell for details</span></div>`;
}

// ═══════════════════════════════════════════════════════
//  8. PRODUCT PROFITABILITY TABLE
// ═══════════════════════════════════════════════════════
function buildProfitabilityData(salesList){
  const map = {};
  salesList.forEach(s=>s.items.forEach(item=>{
    const prod = (typeof products !== 'undefined' ? products : []).find(p=>p.id===item.id);
    if(!map[item.id]) map[item.id] = {name:item.name, emoji:item.emoji||'📦', qty:0, rev:0, cost:prod?.cost||0};
    map[item.id].qty += item.qty;
    map[item.id].rev += item.price * item.qty;
  }));
  return Object.values(map).map(r=>{
    const totalCost = r.cost * r.qty;
    const profit    = r.rev - totalCost;
    const margin    = r.rev > 0 ? Math.round(profit / r.rev * 100) : 0;
    return {...r, totalCost, profit, margin};
  }).sort((a,b)=>b.margin-a.margin);
}
function renderProfitabilityTable(rows){
  if(!rows.length) return '<div style="text-align:center;color:var(--muted);font-size:12px;padding:14px">No sales data</div>';
  return `<div style="overflow-x:auto"><table class="profit-table"><thead><tr><th>Product</th><th style="text-align:right">Revenue</th><th style="text-align:right">Profit</th><th style="text-align:right">Margin</th></tr></thead><tbody>
    ${rows.map(r=>`<tr><td><div style="display:flex;align-items:center;gap:7px"><span>${r.emoji}</span><div><div style="font-size:11px;font-weight:700;color:var(--text)">${r.name}</div><div style="font-size:9px;color:var(--muted)">${r.qty} sold</div></div></div></td>
    <td style="text-align:right;font-size:12px;font-weight:700;color:var(--text)">${fmt(r.rev)}</td>
    <td style="text-align:right;font-size:12px;font-weight:700;color:${r.profit>=0?'var(--green-text)':'var(--red-text)'}">${fmt(r.profit)}</td>
    <td style="text-align:right"><div style="font-size:12px;font-weight:800;color:${r.margin>=30?'var(--green-text)':r.margin>=15?'var(--amber-text)':'var(--red-text)'}">${r.margin}%</div>
    <div style="background:var(--brd);border-radius:2px;height:4px;margin-top:3px;overflow:hidden;width:50px;margin-left:auto"><div style="height:100%;border-radius:2px;background:${r.margin>=30?'var(--green)':r.margin>=15?'var(--amber)':'var(--red)'};width:${Math.min(100,Math.abs(r.margin))}%"></div></div></td>
    </tr>`).join('')}
  </tbody></table></div>`;
}

// ═══════════════════════════════════════════════════════
//  9. CASH FLOW REPORT + CSV EXPORT
// ═══════════════════════════════════════════════════════
function buildCashFlow(days=14){
  const rows = [];
  let balance = floatSet ? floatAmount : 0;
  for(let i=days-1; i>=0; i--){
    const d = new Date(); d.setDate(d.getDate() - i);
    const key     = typeof getDateKey === 'function' ? getDateKey(d.getTime()) : '';
    const daySales= (typeof sales !== 'undefined' ? sales : []).filter(s=>typeof getDateKey==='function'?getDateKey(s.ts)===key:false);
    const dayExp  = (typeof expenses !== 'undefined' ? expenses : []).filter(e=>typeof getDateKey==='function'?getDateKey(e.ts)===key:false);
    const cashIn  = daySales.reduce((s,x)=>s+x.total, 0);
    const cashOut = dayExp.reduce((s,e)=>s+e.amount, 0);
    balance += cashIn - cashOut;
    rows.push({ date:d.toLocaleDateString('en-KE',{day:'numeric',month:'short'}), cashIn, cashOut, balance, txns:daySales.length });
  }
  return rows;
}
function renderCashFlowTable(rows){
  if(rows.every(r=>r.cashIn===0&&r.cashOut===0)){
    return '<div style="text-align:center;color:var(--muted);font-size:12px;padding:14px">No data in this period</div>';
  }
  return `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:11px">
    <thead><tr>
      <th style="padding:6px;text-align:left;font-size:9px;font-weight:700;color:var(--muted);text-transform:uppercase;border-bottom:1px solid var(--brd)">Date</th>
      <th style="padding:6px;text-align:right;font-size:9px;font-weight:700;color:var(--green-text);text-transform:uppercase;border-bottom:1px solid var(--brd)">In</th>
      <th style="padding:6px;text-align:right;font-size:9px;font-weight:700;color:var(--red-text);text-transform:uppercase;border-bottom:1px solid var(--brd)">Out</th>
      <th style="padding:6px;text-align:right;font-size:9px;font-weight:700;color:var(--muted);text-transform:uppercase;border-bottom:1px solid var(--brd)">Balance</th>
    </tr></thead><tbody>
    ${rows.filter(r=>r.cashIn>0||r.cashOut>0).map(r=>`<tr>
      <td style="padding:7px 6px;border-bottom:1px solid var(--brd);color:var(--muted);font-size:10px">${r.date}<div style="font-size:9px;color:var(--hint)">${r.txns} sale${r.txns!==1?'s':''}</div></td>
      <td style="padding:7px 6px;border-bottom:1px solid var(--brd);text-align:right;font-weight:700;color:var(--green-text)">${r.cashIn?'+'+fmt(r.cashIn):'—'}</td>
      <td style="padding:7px 6px;border-bottom:1px solid var(--brd);text-align:right;font-weight:700;color:var(--red-text)">${r.cashOut?'-'+fmt(r.cashOut):'—'}</td>
      <td style="padding:7px 6px;border-bottom:1px solid var(--brd);text-align:right;font-weight:800;color:${r.balance>=0?'var(--text)':'var(--red-text)'}">${fmt(r.balance)}</td>
    </tr>`).join('')}
    </tbody></table></div>`;
}
function exportCashFlowCSV(){
  const rows   = buildCashFlow(30);
  const header = ['Date','Cash In','Cash Out','Balance','Transactions'];
  const lines  = rows.map(r=>[r.date,r.cashIn,r.cashOut,r.balance,r.txns].join(','));
  const csv    = [header.join(','), ...lines].join('\n');
  downloadFile(csv, `posh-cashflow-${new Date().toISOString().slice(0,10)}.csv`, 'text/csv');
  toast('📤 Cash flow exported!');
}

// ═══════════════════════════════════════════════════════
//  15. 🆕 FULL SALES CSV EXPORT
// ═══════════════════════════════════════════════════════
window.exportExcel = function exportSalesCSV(){
  if(typeof sales === 'undefined' || !sales.length){ toast('⚠️ No sales data to export'); return; }
  const header = ['Date','Time','TxnID','Payment','Items','Total','Profit','VAT'];
  const rows = sales.map(s=>{
    const d    = new Date(s.ts);
    const items= s.items.map(i=>`${i.name}${i.preparation_type?' ('+i.preparation_type+')':''} ×${i.qty}`).join('; ');
    // BUG FIX: use unitCost/cost captured on sale item at cart-add time,
    // not p.cost from the live product (which may have been edited or deleted).
    const profit = s.items.reduce((sum,i)=>{
      if(i.prodType==='bulk') return sum + (i.price - (i.cost||0));
      var unitCost = (i.unitCost!=null)?i.unitCost:((i.cost!=null)?i.cost:0);
      return sum + (i.price - unitCost) * i.qty;
    }, 0);
    const vat  = s.vatAmount || 0;
    return [
      d.toLocaleDateString('en-KE'),
      d.toLocaleTimeString('en-KE',{hour:'2-digit',minute:'2-digit'}),
      String(s.id).slice(-6),
      s.payment,
      `"${items}"`,
      s.total,
      Math.round(profit),
      vat
    ].join(',');
  });
  const csv = [header.join(','), ...rows].join('\n');
  downloadFile(csv, `posh-sales-${new Date().toISOString().slice(0,10)}.csv`, 'text/csv');
  toast('📊 Sales exported to CSV!');
};

function downloadFile(content, filename, mime){
  const blob = new Blob([content], {type: mime});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ═══════════════════════════════════════════════════════
//  10. PUSH NOTIFICATIONS — LOW STOCK
// ═══════════════════════════════════════════════════════
var pushEnabled = localStorage.getItem('posh_push') === 'true';

function openPushNotifModal(){
  if(typeof openGenModal !== 'function') return;
  openGenModal('Push Notifications', `
    <div style="text-align:center;padding:8px 0 16px">
      <div style="font-size:36px;margin-bottom:8px">🔔</div>
      <div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:6px">Get notified about low stock</div>
      <div style="font-size:12px;color:var(--muted);line-height:1.6">Receive alerts when any product drops below its threshold — even when the app is in the background.</div>
    </div>
    <div id="push-status-msg" style="margin-bottom:14px;font-size:12px;color:var(--muted);text-align:center">${pushEnabled?'✅ Notifications are enabled':'Notifications are not yet enabled'}</div>
    <div style="display:flex;gap:9px">
      <button class="btn btn-secondary" style="flex:1" onclick="closeGenModal()">Cancel</button>
      <button class="btn btn-primary" style="flex:2" onclick="requestPushPermission()">${pushEnabled?'Send test':'🔔 Enable'}</button>
    </div>`);
}

async function requestPushPermission(){
  if(!('Notification' in window)){ toast('⚠️ Notifications not supported'); closeGenModal(); return; }
  try{
    const perm = await Notification.requestPermission();
    if(perm === 'granted'){
      pushEnabled = true;
      localStorage.setItem('posh_push', 'true');
      const el = $id('push-setting-val');
      if(el) el.textContent = 'Enabled';
      closeGenModal();
      toast('✅ Notifications enabled!');
      sendTestNotification();
    } else {
      toast('⚠️ Permission denied — enable in browser settings');
      closeGenModal();
    }
  } catch(e){ toast('⚠️ Could not enable notifications'); closeGenModal(); }
}
function sendTestNotification(){
  if(pushEnabled && Notification.permission === 'granted'){
    new Notification('POSH — Test Notification 🔔', {body:'Low stock alerts will appear here!', icon:'/icon-192.png'});
  }
}
function checkLowStockNotification(){
  if(!pushEnabled || Notification.permission !== 'granted') return;
  const prods   = typeof products !== 'undefined' ? products : [];
  const outItems = prods.filter(p=>p.stock===0);
  const lowItems = prods.filter(p=>p.stock>0&&p.stock<=p.lowAt);
  if(outItems.length){
    new Notification(`POSH — ${outItems.length} Out of Stock ❌`, {body:outItems.slice(0,3).map(p=>p.name).join(', ')+(outItems.length>3?' and more':''), icon:'/icon-192.png'});
  } else if(lowItems.length){
    new Notification(`POSH — ${lowItems.length} Low Stock ⚠️`, {body:lowItems.slice(0,3).map(p=>`${p.name} (${p.stock} left)`).join(', '), icon:'/icon-192.png'});
  }
}

// ═══════════════════════════════════════════════════════
//  12. 🆕 BIOMETRIC AUTHENTICATION (WebAuthn)
// ═══════════════════════════════════════════════════════
var _bioCredentialId = localStorage.getItem('posh_bio_credentialId') || null;
var _bioEnabled = localStorage.getItem('posh_bio_enabled') === 'true';

async function checkBiometricAvailability(){
  const btn = $id('pin-bio-btn');
  if(!btn) return;
  if(!window.PublicKeyCredential){ btn.style.display = 'none'; return; }
  try {
    const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    if(available && _bioEnabled && _bioCredentialId){
      btn.style.display = 'flex';
    } else {
      btn.style.display = 'none';
    }
  } catch(e){ btn.style.display = 'none'; }
}

// tryBiometric: called when fingerprint/face ID button is tapped on PIN screen
window.tryBiometric = async function(){
  if(!_bioEnabled || !_bioCredentialId){ toast('⚠️ Biometric not set up'); return; }
  if(!window.PublicKeyCredential){ toast('⚠️ Biometric not supported on this device'); return; }
  try {
    const credId = Uint8Array.from(atob(_bioCredentialId), c=>c.charCodeAt(0));
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{ id: credId, type: 'public-key' }],
        userVerification: 'required',
        timeout: 60000,
      }
    });
    if(assertion){
      // Biometric verified — unlock as last used role (default admin if first time)
      const lastRole = localStorage.getItem('posh_bio_role') || 'admin';
      window.currentRole = lastRole;
      if(typeof unlockApp === 'function') unlockApp();
      toast('👆 Biometric unlock successful!');
      addAuditEntry('LOGIN', 'Biometric unlock · ' + lastRole);
    }
  } catch(e){
    if(e.name === 'NotAllowedError'){
      toast('⚠️ Biometric cancelled');
    } else {
      toast('⚠️ Biometric failed — use PIN');
      console.warn('Biometric error:', e);
    }
  }
};

// openBiometricSetup: accessible from Settings (admin only)
window.openBiometricSetup = async function(){
  if(window.currentRole !== 'admin'){ toast('⛔ Admin access required'); return; }
  if(!window.PublicKeyCredential){ toast('⚠️ Biometric not supported on this browser/device'); return; }
  let available = false;
  try { available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(); } catch(e){}
  if(!available){ toast('⚠️ No biometric authenticator found on this device'); return; }

  if(typeof openGenModal !== 'function') return;

  openGenModal('🔏 Biometric Setup', `
    <div style="text-align:center;padding:12px 0">
      <div style="font-size:48px;margin-bottom:12px">👆</div>
      <div style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:8px">${_bioEnabled?'Biometric Active':'Set Up Biometric Login'}</div>
      <div style="font-size:12px;color:var(--muted);line-height:1.6;margin-bottom:16px">
        ${_bioEnabled
          ? 'Fingerprint / Face ID login is enabled. You can remove it or re-register below.'
          : 'Register your fingerprint or Face ID to unlock POSH without a PIN. This is stored on-device only — never sent anywhere.'}
      </div>
    </div>
    <div style="display:flex;flex-direction:column;gap:9px">
      <button class="btn btn-primary btn-full" onclick="registerBiometric()">
        ${_bioEnabled?'🔄 Re-register Biometric':'👆 Register Fingerprint / Face ID'}
      </button>
      ${_bioEnabled?`<button class="btn btn-secondary btn-full" onclick="disableBiometric()">🗑 Remove Biometric</button>`:''}
      <button class="btn btn-secondary btn-full" onclick="closeGenModal()">Cancel</button>
    </div>`);
};

window.registerBiometric = async function(){
  closeGenModal();
  try {
    const shopId = (typeof shopName !== 'undefined' ? shopName : 'posh').toLowerCase().replace(/\s/g,'-');
    const userId = new TextEncoder().encode(shopId + '-admin');
    const credential = await navigator.credentials.create({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp: { name: 'POSH POS', id: location.hostname || 'localhost' },
        user: { id: userId, name: shopId, displayName: (typeof shopName !== 'undefined' ? shopName : 'POSH') + ' Admin' },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },   // ES256
          { type: 'public-key', alg: -257 },  // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'preferred',
        },
        timeout: 60000,
        attestation: 'none',
      }
    });
    if(credential){
      // Store the credential ID (base64)
      const rawId   = new Uint8Array(credential.rawId);
      const b64Id   = btoa(String.fromCharCode(...rawId));
      _bioCredentialId = b64Id;
      _bioEnabled      = true;
      localStorage.setItem('posh_bio_credentialId', b64Id);
      localStorage.setItem('posh_bio_enabled', 'true');
      localStorage.setItem('posh_bio_role', window.currentRole || 'admin');
      checkBiometricAvailability();
      toast('✅ Biometric registered! You can now use fingerprint/face to unlock.');
      addAuditEntry('BIOMETRIC', 'Biometric registered');
      // Update settings display
      const el = $id('biometric-setting-val');
      if(el) el.textContent = 'Enabled';
    }
  } catch(e){
    if(e.name === 'NotAllowedError'){ toast('⚠️ Biometric setup cancelled'); }
    else { toast('⚠️ Could not register biometric: ' + e.message); console.warn(e); }
  }
};

window.disableBiometric = function(){
  _bioEnabled      = false;
  _bioCredentialId = null;
  localStorage.removeItem('posh_bio_credentialId');
  localStorage.setItem('posh_bio_enabled', 'false');
  closeGenModal();
  checkBiometricAvailability();
  toast('🗑 Biometric removed');
  addAuditEntry('BIOMETRIC', 'Biometric disabled');
  const el = $id('biometric-setting-val');
  if(el) el.textContent = 'Not set up';
};

// ═══════════════════════════════════════════════════════
//  13. 🆕 FULL AUDIT LOG
// ═══════════════════════════════════════════════════════
var _auditLog = safeParseLS('posh_audit',[]);

function addAuditEntry(action, detail){
  const entry = {
    ts: Date.now(),
    action,
    detail,
    role: typeof currentRole !== 'undefined' ? currentRole : 'unknown',
  };
  _auditLog.unshift(entry); // newest first
  if(_auditLog.length > 500) _auditLog = _auditLog.slice(0, 500); // cap at 500
  localStorage.setItem('posh_audit', JSON.stringify(_auditLog));
}

// Patch product operations to log audit trail
(function patchAuditOnSave(){
  const _origSaveProduct = window.saveProduct;
  window.saveProduct = function(){
    const name = ($id('pf-name') || {}).value?.trim() || '?';
    const isEdit = typeof editId !== 'undefined' && editId;
    _origSaveProduct && _origSaveProduct();
    addAuditEntry(isEdit ? 'EDIT_PRODUCT' : 'ADD_PRODUCT', name);
  };
  const _origSaveExp = window.saveExpense;
  window.saveExpense = function(){
    const desc = ($id('ef-desc') || {}).value?.trim() || '?';
    const amount = parseFloat(($id('ef-amount') || {}).value) || 0;
    _origSaveExp && _origSaveExp();
    addAuditEntry('EXPENSE', `${desc} — ${fmt(amount)}`);
  };
  const _origRestock = window.saveRestock;
  window.saveRestock = function(){
    const qty = parseInt(($id('restock-qty') || {}).value) || 0;
    _origRestock && _origRestock();
    if(qty > 0) addAuditEntry('RESTOCK', `+${qty} units`);
  };
})();

// Patch lockApp / unlockApp for audit
(function patchLoginAudit(){
  const _origLock = window.lockApp;
  window.lockApp = function(){
    addAuditEntry('LOGOUT', 'App locked');
    _origLock && _origLock();
  };
})();

window.openAuditLog = function(){
  const list = $id('audit-list');
  if(!list){
    // Fallback: render in gen modal
    if(typeof openGenModal !== 'function') return;
    const items = _auditLog.slice(0, 50).map(e=>{
      const d = new Date(e.ts);
      const icons = {SALE:'🧾',EXPENSE:'💸',RESTOCK:'📦',ADD_PRODUCT:'➕',EDIT_PRODUCT:'✏️',LOGIN:'🔓',LOGOUT:'🔒',BIOMETRIC:'👆',SHIFT_CLOSE:'🏁'};
      const ic = icons[e.action] || '📋';
      return `<div style="display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-bottom:1px solid var(--brd)">
        <span style="font-size:16px">${ic}</span>
        <div style="flex:1"><div style="font-size:12px;font-weight:700;color:var(--text)">${e.detail}</div>
        <div style="font-size:10px;color:var(--muted);margin-top:2px">${e.action} · ${e.role} · ${d.toLocaleString('en-KE')}</div></div>
      </div>`;
    }).join('') || '<div style="text-align:center;color:var(--muted);font-size:12px;padding:14px">No audit entries yet</div>';
    openGenModal('📋 Audit Log', `
      <div style="max-height:55vh;overflow-y:auto">${items}</div>
      <button class="btn btn-secondary btn-full" style="margin-top:12px" onclick="exportAuditCSV()">📤 Export CSV</button>
      <button class="btn btn-secondary btn-full" style="margin-top:8px" onclick="closeGenModal()">Close</button>`);
    return;
  }
  // Render in dedicated modal
  const icons = {SALE:'🧾',EXPENSE:'💸',RESTOCK:'📦',ADD_PRODUCT:'➕',EDIT_PRODUCT:'✏️',LOGIN:'🔓',LOGOUT:'🔒',BIOMETRIC:'👆',SHIFT_CLOSE:'🏁'};
  list.innerHTML = _auditLog.slice(0, 100).map(e=>{
    const d  = new Date(e.ts);
    const ic = icons[e.action] || '📋';
    return `<div style="display:flex;gap:10px;align-items:flex-start;background:var(--surf2);border-radius:10px;padding:10px 12px">
      <span style="font-size:16px">${ic}</span>
      <div><div style="font-size:12px;font-weight:700;color:var(--text)">${e.detail}</div>
      <div style="font-size:10px;color:var(--muted);margin-top:2px">${e.action} · ${e.role} · ${d.toLocaleString('en-KE')}</div></div>
    </div>`;
  }).join('') || '<div style="text-align:center;color:var(--muted);font-size:12px;padding:14px">No audit entries yet</div>';
  safeClass('audit-modal', 'add', 'open');
};
window.closeAuditLog = function(){ safeClass('audit-modal', 'remove', 'open'); };

function exportAuditCSV(){
  const header = ['Timestamp','Action','Detail','Role'];
  const rows   = _auditLog.map(e=>[new Date(e.ts).toLocaleString('en-KE'), e.action, `"${e.detail}"`, e.role].join(','));
  downloadFile([header.join(','),...rows].join('\n'), `posh-audit-${new Date().toISOString().slice(0,10)}.csv`, 'text/csv');
  toast('📤 Audit log exported!');
}

// ═══════════════════════════════════════════════════════
//  14. 🆕 SALES FORECAST (Linear Regression)
// ═══════════════════════════════════════════════════════
window.openForecastModal = function(){
  const modal = $id('forecast-modal');
  const content = $id('forecast-content');
  if(!content){ toast('🔮 Forecast modal not found in HTML'); return; }
  content.innerHTML = renderForecast();
  safeClass('forecast-modal', 'add', 'open');
};
window.closeForecastModal = function(){
  safeClass('forecast-modal', 'remove', 'open');
};

function renderForecast(){
  const allSales = typeof sales !== 'undefined' ? sales : [];
  if(allSales.length < 7){
    return '<div style="text-align:center;color:var(--muted);font-size:12px;padding:24px">Need at least 7 days of sales data for a forecast</div>';
  }

  // Build 30-day history
  const history = [];
  for(let i=29; i>=0; i--){
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = typeof getDateKey === 'function' ? getDateKey(d.getTime()) : '';
    const daySales = allSales.filter(s=>typeof getDateKey==='function'?getDateKey(s.ts)===key:false);
    history.push({ day:i, rev:daySales.reduce((s,x)=>s+x.total,0), date:d });
  }

  // Simple linear regression on last 14 days
  const pts   = history.slice(-14).map((h,i)=>({x:i, y:h.rev}));
  const n     = pts.length;
  const sumX  = pts.reduce((s,p)=>s+p.x, 0);
  const sumY  = pts.reduce((s,p)=>s+p.y, 0);
  const sumXY = pts.reduce((s,p)=>s+p.x*p.y, 0);
  const sumX2 = pts.reduce((s,p)=>s+p.x*p.x, 0);
  const slope = (n*sumXY - sumX*sumY) / (n*sumX2 - sumX*sumX) || 0;
  const intercept = (sumY - slope*sumX) / n;
  const predict = (x)=>Math.max(0, Math.round(intercept + slope * x));

  // Forecast next 7 days
  const forecasts = [];
  for(let i=1; i<=7; i++){
    const d = new Date(); d.setDate(d.getDate() + i);
    forecasts.push({
      date: d.toLocaleDateString('en-KE',{weekday:'short',day:'numeric',month:'short'}),
      rev: predict(n - 1 + i),
    });
  }

  const maxRev = Math.max(...forecasts.map(f=>f.rev), 1);
  const trend  = slope > 50 ? '📈 Upward trend — keep it up!' : slope < -50 ? '📉 Downward trend — push harder!' : '➡️ Stable trend';
  const avgForecast = Math.round(forecasts.reduce((s,f)=>s+f.rev,0) / 7);

  return `
    <div style="background:var(--primary-l);border-radius:12px;padding:12px;margin-bottom:14px;text-align:center">
      <div style="font-size:10px;font-weight:700;color:var(--primary-d);text-transform:uppercase">7-Day Avg Forecast</div>
      <div style="font-size:26px;font-weight:800;color:var(--primary)">${fmt(avgForecast)}/day</div>
      <div style="font-size:11px;color:var(--muted);margin-top:4px">${trend}</div>
    </div>
    <div style="display:flex;flex-direction:column;gap:8px">
      ${forecasts.map(f=>{
        const pct = Math.round(f.rev / maxRev * 100);
        const goal = typeof dailyGoal !== 'undefined' ? dailyGoal : 0;
        const hitGoal = goal > 0 && f.rev >= goal;
        return `<div>
          <div style="display:flex;justify-content:space-between;margin-bottom:4px">
            <span style="font-size:11px;font-weight:700;color:var(--text)">${f.date}</span>
            <span style="font-size:12px;font-weight:800;color:${hitGoal?'var(--green-text)':'var(--text)'}">${fmt(f.rev)} ${hitGoal?'✅':''}</span>
          </div>
          <div style="background:var(--brd);border-radius:4px;height:6px;overflow:hidden">
            <div style="height:100%;border-radius:4px;background:var(--primary);width:${pct}%;transition:width .3s"></div>
          </div>
        </div>`;
      }).join('')}
    </div>
    <div style="margin-top:12px;padding:10px;background:var(--surf2);border-radius:10px;font-size:11px;color:var(--muted)">
      ℹ️ Forecast based on linear regression of your last 14 days of sales. Actual results may vary.
    </div>`;
}

// ═══════════════════════════════════════════════════════
//  16. 🆕 DISCOUNT ENGINE (% + flat)
// ═══════════════════════════════════════════════════════
var _cartDiscount = null; // {type:'percent'|'flat', value:number, reason:string}

function calcDiscountAmount(subtotal, disc){
  if(!disc) return 0;
  if(disc.type === 'percent') return Math.round(subtotal * Math.min(disc.value, 100) / 100);
  if(disc.type === 'flat')    return Math.min(disc.value, subtotal);
  return 0;
}

window.openDiscountModal = function(){
  safeClass('discount-modal', 'add', 'open');
  safeClass('discount-ov', 'add', 'show');
  const sub = cartSubtotal();
  const existing = _cartDiscount;
  // If a discount modal is in HTML, populate it:
  const amtEl = $id('disc-amount');
  const reasonEl = $id('disc-reason');
  if(amtEl && existing) amtEl.value = existing.value || '';
  if(reasonEl && existing) reasonEl.value = existing.reason || '';
};
window.closeDiscountModal = function(){
  safeClass('discount-modal', 'remove', 'open');
  safeClass('discount-ov', 'remove', 'show');
};
window.setDiscountType = function(type){
  const pctBtn = $id('disc-pct-btn');
  const flatBtn = $id('disc-flat-btn');
  const label   = $id('disc-amount-label');
  if(pctBtn)  pctBtn.classList.toggle('active', type === 'percent');
  if(flatBtn) flatBtn.classList.toggle('active', type === 'flat');
  if(label)   label.textContent = type === 'percent' ? 'Discount %' : `Fixed Amount (${currency})`;
};
window.applyDiscount = function(){
  const sub = cartSubtotal();
  if(sub <= 0){ toast('⚠️ Add items first'); return; }
  // Read type from active button
  const isPct = ($id('disc-pct-btn') || {}).classList?.contains('active');
  const type  = isPct ? 'percent' : 'flat';
  const value = parseFloat(($id('disc-amount') || {}).value || '0');
  const reason = ($id('disc-reason') || {}).value?.trim() || '';
  if(!value || value <= 0){ toast('⚠️ Enter a discount amount'); return; }
  if(type === 'percent' && value > 100){ toast('⚠️ Max discount is 100%'); return; }
  const discAmt = calcDiscountAmount(sub, {type, value});
  if(discAmt >= sub){ toast('⚠️ Discount cannot exceed total'); return; }
  _cartDiscount = {type, value, reason};
  closeDiscountModal();
  if(typeof renderCartSheet === 'function') renderCartSheet();
  toast(`🏷 Discount applied: −${fmt(discAmt)}`);

  // Show discount bar if HTML element exists
  const bar = $id('cs-discount-bar');
  if(bar){ bar.style.display = 'flex'; bar.innerHTML = `<span>🏷 ${type==='percent'?value+'%':fmt(value)+' off'}${reason?' — '+reason:''}</span><button onclick="removeDiscount()" style="background:none;border:none;color:var(--red-text);font-size:18px;cursor:pointer;line-height:1">×</button>`; }
};
window.removeDiscount = function(){
  _cartDiscount = null;
  const bar = $id('cs-discount-bar');
  if(bar) bar.style.display = 'none';
  if(typeof renderCartSheet === 'function') renderCartSheet();
  toast('🏷 Discount removed');
};
window.updateDiscountPreview = function(){
  const sub   = cartSubtotal();
  const isPct = ($id('disc-pct-btn') || {}).classList?.contains('active');
  const type  = isPct ? 'percent' : 'flat';
  const value = parseFloat(($id('disc-amount') || {}).value || '0');
  const discAmt = calcDiscountAmount(sub, {type, value});
  const preview = $id('disc-preview');
  if(preview && sub > 0 && discAmt > 0){
    preview.textContent = `New total: ${fmt(sub - discAmt)}`;
  }
};

// ═══════════════════════════════════════════════════════
//  17. THEME SWITCHER
// ═══════════════════════════════════════════════════════
var currentTheme = localStorage.getItem('posh_theme') || 'midnight';

function setTheme(name){
  currentTheme = name;
  localStorage.setItem('posh_theme', name);
  document.documentElement.setAttribute('data-theme', name);
  document.querySelectorAll('.th-swatch,.theme-opt,.ob-theme-opt').forEach(el=>{
    const elTheme = el.dataset?.theme || (el.id ? el.id.replace('th-','') : '');
    el.classList.toggle('active', elTheme === name);
  });
  const names = {midnight:'Midnight Gold',emerald:'Emerald Classic',terracotta:'Warm Terracotta',ocean:'Ocean Pro',obsidian:'Obsidian Lime'};
  const sub = $id('theme-setting-sub');
  if(sub) sub.textContent = names[name] || name;
  toast('🎨 Theme: ' + (names[name] || name));
}

// BUG FIX: HTML uses applyTheme('midnight',this) — alias for setTheme
window.applyTheme = function(name, el){ setTheme(name); };

function openThemeSelector(){
  if(typeof openGenModal !== 'function') return;
  openGenModal('🎨 App Theme', `
    <div style="display:flex;flex-direction:column;gap:10px">
      ${[
        {id:'midnight',  name:'Midnight Gold',   color:'#FFB800', tag:'Premium'},
        {id:'emerald',   name:'Emerald Classic', color:'#00A67E', tag:'Light'},
        {id:'terracotta',name:'Warm Terracotta', color:'#E8521A', tag:'Market'},
        {id:'ocean',     name:'Ocean Pro',       color:'#1B6FE8', tag:'Corporate'},
        {id:'obsidian',  name:'Obsidian Lime',   color:'#AAFF00', tag:'Bold'},
      ].map(t=>`
        <div onclick="setTheme('${t.id}');closeGenModal()" style="
          display:flex;align-items:center;gap:12px;padding:12px 14px;
          border-radius:14px;border:2px solid ${currentTheme===t.id?t.color:'var(--brd)'};
          background:${currentTheme===t.id?'var(--acc-l)':'var(--surf2)'};
          cursor:pointer;transition:all .15s">
          <div style="width:36px;height:36px;border-radius:50%;background:${t.color};border:3px solid rgba(0,0,0,.2);box-shadow:0 2px 8px rgba(0,0,0,.2)"></div>
          <div style="flex:1"><div style="font-size:13px;font-weight:700;color:var(--text)">${t.name}</div></div>
          <span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px;background:var(--acc-l);color:var(--acc)">${t.tag}</span>
          ${currentTheme===t.id?'<span style="color:var(--acc);font-size:16px">✓</span>':''}
        </div>`).join('')}
    </div>`);
}

// Open theme modal from HTML (theme-modal element)
window.openThemeModal  = function(){ openThemeSelector(); };
window.closeThemeModal = function(){
  safeClass('theme-modal','remove','open');
  if(typeof closeGenModal==='function') closeGenModal();
};

// Apply saved theme on load
(function initTheme(){
  document.documentElement.setAttribute('data-theme', currentTheme);
  setTimeout(()=>{
    document.querySelectorAll('.th-swatch,.ob-theme-opt').forEach(el=>{
      const elTheme = el.dataset?.theme || (el.id ? el.id.replace('th-','') : '');
      el.classList.toggle('active', elTheme === currentTheme);
    });
  }, 150);
})();

// ═══════════════════════════════════════════════════════
//  PATCH renderReports — inject heatmap, profitability, cash flow
// ═══════════════════════════════════════════════════════
(function patchRenderReports(){
  const _orig = window.renderReports;
  window.renderReports = function(){
    _orig && _orig();
    const container = $id('reports-body');
    if(!container) return;
    const allSales  = typeof filterSales === 'function' ? filterSales(window.rptFilter) : [];

    // Profitability
    const profCard = document.createElement('div');
    profCard.className = 'chart-card';
    profCard.innerHTML = `<div class="chart-title">💰 Product Profitability</div>${renderProfitabilityTable(buildProfitabilityData(allSales))}`;
    container.appendChild(profCard);

    // Heatmap
    const heatCard = document.createElement('div');
    heatCard.className = 'chart-card';
    heatCard.innerHTML = `<div class="chart-title">🕐 Hourly Sales Heatmap</div>${renderHeatmap(buildHourlyHeatmap(allSales))}`;
    container.appendChild(heatCard);

    // Cash flow
    const cfCard = document.createElement('div');
    cfCard.className = 'chart-card';
    cfCard.innerHTML = `<div class="chart-title" style="display:flex;justify-content:space-between;align-items:center">
      💸 Cash Flow (14 days)
      <button onclick="exportCashFlowCSV()" style="font-size:10px;font-weight:700;color:var(--acc);background:none;border:none;cursor:pointer;font-family:var(--font)">Export ↓</button>
    </div>${renderCashFlowTable(buildCashFlow(14))}`;
    container.appendChild(cfCard);
  };
})();

// ═══════════════════════════════════════════════════════
//  PATCH renderDashboard — float card + currency badge
// ═══════════════════════════════════════════════════════
(function patchDashboard(){
  const _orig = window.renderDashboard;
  window.renderDashboard = function(){
    _orig && _orig();
    renderFloatCard();
    const heroCur = $id('hero-currency');
    if(heroCur) heroCur.textContent = currency;
    const curEl  = $id('currency-setting-val');
    if(curEl) curEl.textContent = `${currencyCode} — ${currency}`;
    const vatEl  = $id('vat-setting-val');
    if(vatEl) vatEl.textContent = vatEnabled ? `VAT ${vatRate}%` : 'Disabled';
    const pushEl = $id('push-setting-val');
    if(pushEl) pushEl.textContent = pushEnabled ? 'Enabled' : 'Not enabled';
    const bioEl  = $id('biometric-setting-val');
    if(bioEl) bioEl.textContent = _bioEnabled ? 'Enabled ✅' : 'Not set up';
  };
})();

// ═══════════════════════════════════════════════════════
//  PATCH saveData / loadData — persist extended vars
// ═══════════════════════════════════════════════════════
(function patchSaveLoad(){
  const _origSave = window.saveData;
  window.saveData = function(){
    localStorage.setItem('posh_currency',     currency);
    localStorage.setItem('posh_currencyCode', currencyCode);
    localStorage.setItem('posh_vat',          vatRate);
    localStorage.setItem('posh_vatEnabled',   vatEnabled);
    localStorage.setItem('posh_float',        floatAmount);
    localStorage.setItem('posh_floatSet',     floatSet);
    _origSave && _origSave();
  };
})();

// ─── Biometric check after unlock ───────────────────────

// ═══════════════════════════════════════════════════════
//  MODAL OPENERS / CLOSERS — Bug-fixed: null guards
// ═══════════════════════════════════════════════════════
function _openModal(modalId, ovId){
  safeClass(modalId, 'add', 'open');
  if(ovId) safeClass(ovId, 'add', 'show');
}
function _closeModal(modalId, ovId){
  safeClass(modalId, 'remove', 'open');
  if(ovId) safeClass(ovId, 'remove', 'show');
}

// ── Scanner modal openers ─────────────────────────────
// NOTE: openScannerModal and scanBarcodeForProduct are defined in barcode.js
// (which loads after quickwins.js) and must NOT be overridden here.
// We only expose closeScannerModal which is safe to alias.
window.closeScannerModal     = ()=>_closeModal('scanner-modal','scanner-ov');
window.openReturnModal       = ()=>_openModal('return-modal','return-ov');
window.closeReturnModal      = ()=>_closeModal('return-modal','return-ov');
window.openPurchaseOrderModal= ()=>_openModal('po-modal','po-ov');
window.closePurchaseOrderModal=()=>_closeModal('po-modal','po-ov');
window.openStaffModal        = ()=>_openModal('staff-modal','staff-ov');
window.closeStaffModal       = ()=>_closeModal('staff-modal','staff-ov');
window.openLoyaltyModal      = ()=>_openModal('loyalty-modal','loyalty-ov');
window.closeLoyaltyModal     = ()=>_closeModal('loyalty-modal','loyalty-ov');
window.openHeatmapModal      = ()=>{ const m=buildHourlyHeatmap(typeof sales!=='undefined'?sales:[]); const el=$id('heatmap-grid'); if(el) el.innerHTML=renderHeatmap(m); _openModal('heatmap-modal','heatmap-ov'); };
window.closeHeatmapModal     = ()=>_closeModal('heatmap-modal','heatmap-ov');
window.openCashFlowModal     = ()=>{ setCashFlowPeriod(7); _openModal('cashflow-modal','cashflow-ov'); };
window.closeCashFlowModal    = ()=>_closeModal('cashflow-modal','cashflow-ov');
window.openProfitabilityModal= ()=>{ const el=$id('profitability-content'); if(el) el.innerHTML=renderProfitabilityTable(buildProfitabilityData(typeof sales!=='undefined'?sales:[])); _openModal('profitability-modal','profitability-ov'); };
window.closeProfitabilityModal=()=>_closeModal('profitability-modal','profitability-ov');

window.setCashFlowPeriod = function(days, btn){
  document.querySelectorAll('#cashflow-modal .rpt-tab').forEach(t=>t.classList.remove('active'));
  if(btn) btn.classList.add('active');
  else { const t=$id('cftab-'+days); if(t) t.classList.add('active'); }
  const el = $id('cashflow-content');
  if(el) el.innerHTML = renderCashFlowTable(buildCashFlow(days));
};

// ═══════════════════════════════════════════════════════
//  BARCODE SCANNER STUB (real scanning via quagga/zxing can be wired here)
// ═══════════════════════════════════════════════════════
// NOTE: lookupBarcode / scanBarcodeForProduct are handled by barcode.js
window.lookupBarcode = function searchBarcode(code){
  if(!code){ toast('Enter a barcode'); return; }
  const p = (typeof products !== 'undefined' ? products : []).find(x=>x.barcode===code);
  if(p){ if(typeof addToCart==='function') addToCart(p.id); toast('✅ Product found: ' + p.name); }
  else { toast('⚠️ No product with barcode: ' + code); }
};

// ═══════════════════════════════════════════════════════
//  RETURNS STUB
// ═══════════════════════════════════════════════════════
window.openReturnsModal = window.openReturnModal;
window.closeReturnsModal= window.closeReturnModal;
window.lookupReturnTxn  = function(q){ const sale = (typeof sales!=='undefined'?sales:[]).find(s=>String(s.id).endsWith(q)); const el=$id('return-txn-preview'); if(el) el.innerHTML = sale ? `Found: #${String(sale.id).slice(-4)} · ${fmt(sale.total)} · ${sale.items.map(i=>i.name+'×'+i.qty).join(', ')}` : '⚠️ Transaction not found'; };
window.processReturn    = function(){ toast('↩️ Return recorded'); if(typeof closeReturnModal==='function') closeReturnModal(); addAuditEntry('RETURN','Manual return processed'); };
window.confirmReturn    = window.processReturn;

// ═══════════════════════════════════════════════════════
//  PURCHASE ORDERS STUB
// ═══════════════════════════════════════════════════════
window.openPurchaseOrders = window.openPurchaseOrderModal;
window.closePurchaseOrders= window.closePurchaseOrderModal;
window.createPurchaseOrder= function(){ toast('📦 Purchase order — coming soon!'); };
window.sharePOWhatsApp    = function(){ const msg='📦 POSH Purchase Order\n' + (typeof products!=='undefined'?products:[]).filter(p=>p.stock<=p.lowAt).map(p=>`${p.name}: needs restock (${p.stock} left, supplier: ${p.supplier||'—'})`).join('\n'); window.open('https://wa.me/?text='+encodeURIComponent(msg),'_blank'); };

// ═══════════════════════════════════════════════════════
//  STAFF ACCOUNTS STUB
// ═══════════════════════════════════════════════════════
window.openStaffAccounts = window.openStaffModal;
window.closeStaffAccounts= window.closeStaffModal;
window.openAddStaffModal = window.openStaffModal;
window.saveStaff         = function(){ toast('👥 Staff accounts — coming in next update'); if(typeof closeStaffModal==='function') closeStaffModal(); };

// ═══════════════════════════════════════════════════════
//  CRM / CUSTOMER STUB
// ═══════════════════════════════════════════════════════
window.openCustomerModal = window.openCustomerPicker = function(){ toast('👥 CRM — coming in next update'); };
window.closeCRMModal     = function(){};
window.saveCustomer      = function(){ toast('Customer saved'); };
window.renderCRM         = function(){};
window.lookupCustomerForReceipt = function(q){};

// ═══════════════════════════════════════════════════════
//  LOYALTY SETTINGS
// ═══════════════════════════════════════════════════════
window.saveLoyaltySettings = function(){
  const earn   = ($id('loyalty-earn-rate') || {}).value   || '10';
  const redeem = ($id('loyalty-redeem-rate') || {}).value || '1';
  localStorage.setItem('posh_loyalty_earn',   earn);
  localStorage.setItem('posh_loyalty_redeem', redeem);
  if(typeof closeLoyaltyModal==='function') closeLoyaltyModal();
  toast('✅ Loyalty settings saved');
};

// ═══════════════════════════════════════════════════════
//  MISC HELPERS
// ═══════════════════════════════════════════════════════
// ─────────────────────────────────────────────────────
//  🖨  PRINT THERMAL RECEIPT  (58mm layout)
// ─────────────────────────────────────────────────────
window.printThermalReceipt = function () {

  // ── Totals ──────────────────────────────────────────
  const sub       = (typeof cartSubtotal === 'function') ? cartSubtotal()
                  : cart.reduce((s, x) => s + (x.prodType==='bulk' ? x.price : x.price * x.qty), 0);
  const disc      = (_cartDiscount && typeof calcDiscountAmount === 'function')
                  ? calcDiscountAmount(sub, _cartDiscount) : 0;
  const afterDisc = sub - disc;
  const vat       = (typeof calcVAT === 'function') ? calcVAT(afterDisc) : 0;
  const total     = afterDisc + vat;

  // ── Helpers ─────────────────────────────────────────
  const cur      = (typeof currency !== 'undefined') ? currency : 'KSh';
  const mfmt     = n => cur + ' ' + Number(n).toLocaleString(undefined, {minimumFractionDigits:0, maximumFractionDigits:0});
  const receiptNum = String(Date.now()).slice(-4);
  const dt       = new Date().toLocaleString('en-KE', {
    day:'2-digit', month:'short', year:'numeric',
    hour:'2-digit', minute:'2-digit'
  });
  const payEl    = document.getElementById('pay-method');
  const payMethod = payEl ? payEl.value : 'Cash';

  // ── Guard: div must exist ────────────────────────────
  const receipt = document.getElementById('print-receipt');
  if (!receipt) {
    console.warn('POSH: #print-receipt not found — add the div to index.html first.');
    window.print(); return;
  }

  // ── Shop header ──────────────────────────────────────
  const el = id => document.getElementById(id);
  if (el('pr-shop-name'))   el('pr-shop-name').textContent   = shopName || 'POSH';
  if (el('pr-footer-shop')) el('pr-footer-shop').textContent = shopName || 'POSH';
  if (el('pr-receipt-num')) el('pr-receipt-num').textContent = '#' + receiptNum;
  if (el('pr-dt'))          el('pr-dt').textContent          = dt;

  // ── Line items ───────────────────────────────────────
  if (el('pr-items')) {
    el('pr-items').innerHTML = cart.map(function (i) {
      const prep  = i.preparation_type ? ' (' + i.preparation_type + ')' : '';
      return '<div class="pr-item">' +
        '<span class="pr-item-name">'  + i.name + prep + '</span>' +
        '<span class="pr-item-qty">'   + i.qty          + '</span>' +
        '<span class="pr-item-price">' + mfmt(i.price)  + '</span>' +
        '<span class="pr-item-total">' + mfmt(i.prodType==="bulk" ? i.price : i.price * i.qty) + '</span>' +
      '</div>';
    }).join('');
  }

  // ── Totals block ─────────────────────────────────────
  if (el('pr-totals')) {
    let h = '<div class="pr-row pr-subtotal"><span>Subtotal</span><span>' + mfmt(sub) + '</span></div>';
    if (disc > 0 && _cartDiscount) {
      const label = _cartDiscount.reason ||
        (_cartDiscount.type === 'percent' ? _cartDiscount.value + '% off' : 'Flat discount');
      h += '<div class="pr-row pr-discount"><span>Discount (' + label + ')</span><span>−' + mfmt(disc) + '</span></div>';
    }
    if (vatEnabled && vat > 0) {
      h += '<div class="pr-row pr-vat"><span>VAT ' + vatRate + '%</span><span>+' + mfmt(vat) + '</span></div>';
    }
    h += '<div class="pr-row pr-total"><span>TOTAL</span><span>' + mfmt(total) + '</span></div>';
    el('pr-totals').innerHTML = h;
  }

  // ── Payment row ──────────────────────────────────────
  if (el('pr-pay-row')) {
    let payStr = 'Paid via: ' + payMethod;
    if (payMethod === 'Split' && splitPayments && splitPayments.length) {
      payStr = 'Split: ' + splitPayments
        .map(function (sp) { return sp.method + ' ' + mfmt(sp.amount); })
        .join(' + ');
    }
    el('pr-pay-row').textContent = payStr;
  }

  // ── PDF tip toast ────────────────────────────────────
  if (typeof toast === 'function') {
    toast('💡 Tip: choose "Save as PDF" to save a copy');
  }

  // ── Audit ────────────────────────────────────────────
  if (typeof addAuditEntry === 'function') {
    addAuditEntry('PRINT', 'Receipt #' + receiptNum + ' · ' + mfmt(total) + ' · ' + payMethod);
  }

  // ── Fire print dialog (80ms so toast renders first) ──
  setTimeout(function () { window.print(); }, 80);
};

// ─────────────────────────────────────────────────────
//  📲  SHARE RECEIPT VIA WHATSAPP  (upgraded)
//  Overrides shareReceiptWhatsApp() in app.js
// ─────────────────────────────────────────────────────
window.shareReceiptWhatsApp = function () {
  if (!cart || !cart.length) return;

  // ── Totals ──────────────────────────────────────────
  const sub       = (typeof cartSubtotal === 'function') ? cartSubtotal()
                  : cart.reduce((s, x) => s + (x.prodType==='bulk' ? x.price : x.price * x.qty), 0);
  const disc      = (_cartDiscount && typeof calcDiscountAmount === 'function')
                  ? calcDiscountAmount(sub, _cartDiscount) : 0;
  const afterDisc = sub - disc;
  const vat       = (typeof calcVAT === 'function') ? calcVAT(afterDisc) : 0;
  const total     = afterDisc + vat;

  // ── Helpers ─────────────────────────────────────────
  const cur      = (typeof currency !== 'undefined') ? currency : 'KSh';
  const mfmt     = n => cur + ' ' + Number(n).toLocaleString(undefined, {minimumFractionDigits:0, maximumFractionDigits:0});
  const receiptNum = String(Date.now()).slice(-4);
  const dt       = new Date().toLocaleString('en-KE', {
    day:'2-digit', month:'short', year:'numeric',
    hour:'2-digit', minute:'2-digit'
  });
  const payEl    = document.getElementById('pay-method');
  const payMethod = payEl ? payEl.value : 'Cash';

  // ── Line items ───────────────────────────────────────
  const lines = cart.map(function (i) {
    const prep = i.preparation_type ? ' (' + i.preparation_type + ')' : '';
    return '  ' + i.emoji + ' ' + i.name + prep +
           ' ×' + i.qty +
           ' @ ' + mfmt(i.price) +
           ' = *' + mfmt(i.prodType==="bulk" ? i.price : i.price * i.qty) + '*';
  }).join('\n');

  // ── Totals section ───────────────────────────────────
  let totals = '\nSubtotal: ' + mfmt(sub);
  if (disc > 0 && _cartDiscount) {
    const label = _cartDiscount.reason ||
      (_cartDiscount.type === 'percent' ? _cartDiscount.value + '% off' : 'Flat discount');
    totals += '\nDiscount (' + label + '): −' + mfmt(disc);
  }
  if (vatEnabled && vat > 0) {
    totals += '\nVAT ' + vatRate + '%: +' + mfmt(vat);
  }
  totals += '\n*TOTAL: ' + mfmt(total) + '*';

  // ── Payment display ──────────────────────────────────
  let payDisplay = payMethod;
  if (payMethod === 'Split' && splitPayments && splitPayments.length) {
    payDisplay = 'Split (' +
      splitPayments.map(function (sp) { return sp.method + ': ' + mfmt(sp.amount); }).join(' + ') +
    ')';
  }

  // ── Compose & open ───────────────────────────────────
  const SEP = '━━━━━━━━━━━━━━━━━━━━';
  const msg =
    '🧾 *' + (shopName || 'POSH') + ' Receipt*\n' +
    SEP + '\n' +
    '📅 ' + dt + '\n' +
    '🔖 Receipt #' + receiptNum + '\n' +
    SEP + '\n\n' +
    lines + '\n\n' +
    SEP +
    totals + '\n' +
    SEP + '\n' +
    '💳 Payment: ' + payDisplay + '\n\n' +
    'Asante sana! Thank you 🙏\n' +
    '— ' + (shopName || 'POSH');

  window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank');
};

window.addVariantRow      = function(){ toast('Product variants — coming in next update'); };
window.openNotifPanel     = function(){ if(typeof switchTab==='function') switchTab('reports'); };
window.handlePaymentMethodChange = function(){
  const pm = ($id('pay-method') || {}).value;
  const cw = $id('credit-customer-wrap');
  if(cw) cw.style.display = pm==='Credit'?'block':'none';
  const sp = $id('split-payment-section');
  if(sp && pm!=='Split') sp.style.display='none';
  if(pm==='Split') openSplitPayment();
};
window.setupBiometric = window.openBiometricSetup;

console.log('POSH Quick Wins loaded ✅ — 17 features active (biometric, audit log, forecast, CSV export, discounts)');

// ═══════════════════════════════════════════════════════
//  ADDITIONAL PATCHES — loaded after app.js + quickwins core
// ═══════════════════════════════════════════════════════

// ─── 1. Extend switchTab to include 'crm' and 'staff' screens ───
(function patchSwitchTab(){
  const _orig = window.switchTab;
  const allTabsExtended = ['home','sales','stock','reports','history','debts','settings','crm','staff'];
  window.switchTab = function(tab){
    // Staff can access crm (customer lookup), but not stock/reports/history/settings/staff
    if(window.currentRole === 'staff' && ['stock','reports','history','settings','staff'].includes(tab)){
      if(typeof toast === 'function') toast('⛔ Admin access required');
      return;
    }
    // Deactivate all screens and nav items including the new ones
    allTabsExtended.forEach(t=>{
      const s = document.getElementById('screen-' + t);
      if(s) s.classList.toggle('active', t === tab);
      const n = document.getElementById('nav-' + t);
      if(n) n.classList.toggle('active', t === tab);
    });
    // Trigger renders for new tabs
    if(tab === 'crm')   renderCRM();
    if(tab === 'staff') renderStaffList();
    // Delegate everything else to original
    if(['home','sales','stock','reports','history','debts','settings'].includes(tab)){
      // Re-call original logic without repeating the DOM work
      if(tab === 'home')    { if(typeof renderDashboard==='function') renderDashboard(); }
      if(tab === 'sales')   { if(typeof renderCats==='function') renderCats(); if(typeof renderSales==='function') renderSales(); if(typeof updateCartFab==='function') updateCartFab(); }
      if(tab === 'stock')   { if(typeof renderInv==='function') renderInv(); }
      if(tab === 'reports') { if(typeof renderReports==='function') renderReports(); }
      if(tab === 'history') { if(typeof renderHistory==='function') renderHistory(); }
      if(tab === 'debts')   { if(typeof renderDebts==='function') renderDebts(); }
    }
  };
})();

// ─── 2. Extend applyRoleAccess to hide CRM/staff nav for appropriate roles ───
(function patchRoleAccess(){
  const _orig = window.applyRoleAccess;
  window.applyRoleAccess = function(){
    _orig && _orig();
    const isAdmin = window.currentRole === 'admin';
    // Staff nav item
    const navStaff = $id('nav-staff') || $id('sb-staff-item');
    if(navStaff) navStaff.style.display = isAdmin ? 'flex' : 'none';
    // CRM is available to all roles
    const navCRM = $id('nav-crm');
    if(navCRM) navCRM.style.display = 'flex';
  };
})();

// ─── 3. Fix renderDashboard — null-guard vs-badge elements, populate loyalty pts ───
(function patchDashboardVsBadges(){
  const _orig = window.renderDashboard;
  window.renderDashboard = function(){
    _orig && _orig();
    // d-sales-vs, d-profit-vs, d-txns-vs don't exist in HTML → patch into KPI cards via d-sales-badge
    // or silently skip (app.js already crashes on these — we guard instead of adding HTML elements)
    // Populate loyalty points
    const td = typeof filterSales==='function' ? filterSales('today') : [];
    const earnRate = parseInt(localStorage.getItem('posh_loyalty_earn') || '10');
    const pts = td.reduce((s,x)=>s + Math.floor(x.total/earnRate), 0);
    const loyaltyEl = $id('d-loyalty-pts');
    if(loyaltyEl) loyaltyEl.textContent = pts.toLocaleString();
    // Update sidebar theme label
    const sbTheme = $id('sb-theme-sub');
    if(sbTheme){
      const names = {midnight:'Midnight Gold',emerald:'Emerald',terracotta:'Terracotta',ocean:'Ocean Pro',obsidian:'Obsidian Lime'};
      sbTheme.textContent = names[currentTheme] || currentTheme;
    }
  };
})();

// Patch renderDashboard to null-guard getElementById calls for missing vs-badge elements
// (app.js calls document.getElementById('d-sales-vs').innerHTML = ... which throws if missing)
(function safeVsBadges(){
  const _orig = window.vsBadge;
  // The crash is in renderDashboard directly calling getElementById. We need to patch those calls.
  // Solution: inject the missing elements into the DOM dynamically on first run
  const dashEl = $id('screen-home');
  if(!dashEl) return;
  const inject = (id) => {
    if(!$id(id)){
      const el = document.createElement('div');
      el.id = id; el.style.display = 'none';
      document.body.appendChild(el);
    }
  };
  inject('d-sales-vs');
  inject('d-profit-vs');
  inject('d-txns-vs');
  inject('idle-setting-sub'); // referenced in updateSidebar
})();

// ─── 4. Function aliases: HTML calls these names, code uses different names ───
window.handlePayMethodChange = function(val){
  // HTML: onchange="handlePayMethodChange(this.value)"
  const pm = val || ($id('pay-method')||{}).value;
  const cw = $id('credit-customer-wrap');
  if(cw) cw.style.display = pm === 'Credit' ? 'block' : 'none';
  const lw = $id('loyalty-redeem-wrap');
  if(lw) lw.style.display = pm === 'Loyalty' ? 'block' : 'none';
  const sw = $id('split-pay-wrap');
  if(sw) sw.style.display = pm === 'Split' ? 'block' : 'none';
  const sec = $id('split-payment-section');
  if(sec) sec.style.display = pm === 'Split' ? 'block' : 'none';
  if(pm === 'Split' && typeof openSplitPayment === 'function') openSplitPayment();
};

// Settings page: openTaxModal → openVATModal
window.openTaxModal = function(){ if(typeof openVATModal==='function') openVATModal(); };

// Settings page: enablePushNotifications → openPushNotifModal
window.enablePushNotifications = function(){ if(typeof openPushNotifModal==='function') openPushNotifModal(); };

// closeFloatModal — float modal has its own close button + overlay
window.closeFloatModal = function(){
  _closeModal('float-modal', 'float-ov');
  // Reset form state
  const openForm  = $id('float-open-form');
  const closeForm = $id('float-close-form');
  if(openForm && !floatSet)  openForm.style.display  = 'block';
  if(closeForm && !floatSet) closeForm.style.display = 'none';
};

// openFloatModal now opens the dedicated float-modal sheet (not just a gen modal)
window.openFloatModal = function(){
  // Populate low-stock items in PO modal if open
  const summaryEl = $id('float-summary');
  if(summaryEl && floatSet){
    const cashSales = (typeof filterSales==='function'?filterSales('today'):[])
      .filter(s=>s.payment==='Cash').reduce((s,x)=>s+x.total,0);
    summaryEl.innerHTML = `
      <div style="background:var(--green-l);border-radius:12px;padding:12px;margin-bottom:12px">
        <div style="font-size:10px;font-weight:700;color:var(--green-text);text-transform:uppercase">Opening Float</div>
        <div style="font-size:24px;font-weight:800;color:var(--green-text)">${typeof fmt==='function'?fmt(floatAmount):floatAmount}</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
        <div style="background:var(--surf2);border-radius:10px;padding:10px">
          <div style="font-size:9px;font-weight:700;color:var(--muted);text-transform:uppercase">Cash Sales</div>
          <div style="font-size:16px;font-weight:800;color:var(--acc)">${typeof fmt==='function'?fmt(cashSales):cashSales}</div>
        </div>
        <div style="background:var(--surf2);border-radius:10px;padding:10px">
          <div style="font-size:9px;font-weight:700;color:var(--muted);text-transform:uppercase">Expected Close</div>
          <div style="font-size:16px;font-weight:800;color:var(--text)">${typeof fmt==='function'?fmt(floatAmount+cashSales):floatAmount+cashSales}</div>
        </div>
      </div>`;
  }
  // Toggle open/close forms based on float state
  const openForm  = $id('float-open-form');
  const closeForm = $id('float-close-form');
  if(openForm)  openForm.style.display  = floatSet ? 'none'  : 'block';
  if(closeForm) closeForm.style.display = floatSet ? 'block' : 'none';
  _openModal('float-modal', 'float-ov');
};

// calcFloatVariance — called from float-close-amount input
window.calcFloatVariance = function(){
  const cashSales = (typeof filterSales==='function'?filterSales('today'):[])
    .filter(s=>s.payment==='Cash').reduce((s,x)=>s+x.total,0);
  const expected = floatAmount + cashSales;
  const actual   = parseFloat(($id('float-close-amount')||{}).value || '0');
  const diff     = actual - expected;
  const el       = $id('float-variance');
  if(!el || !actual) return;
  if(Math.abs(diff) < 1){
    el.innerHTML = '<span style="color:var(--green-text);font-weight:700">✅ Balanced — no variance</span>';
  } else if(diff > 0){
    el.innerHTML = `<span style="color:var(--amber-text);font-weight:700">⚠️ Over by ${fmt(diff)} — double-check your count</span>`;
  } else {
    el.innerHTML = `<span style="color:var(--red-text);font-weight:700">❌ Short by ${fmt(Math.abs(diff))} — missing cash!</span>`;
  }
};

// closeCustomerModal — customer-modal sheet
window.closeCustomerModal = function(){ _closeModal('customer-modal','customer-ov'); };
window.openCustomerModal  = function(id){
  const el = $id('customer-modal-title');
  if(el) el.textContent = id ? 'Edit Customer' : 'Add Customer';
  if(id){
    const customers = safeParseLS('posh_customers',[]);
    const c = customers.find(x=>x.id===id);
    if(c){
      if($id('cm-name'))  $id('cm-name').value  = c.name  || '';
      if($id('cm-phone')) $id('cm-phone').value = c.phone || '';
      if($id('cm-email')) $id('cm-email').value = c.email || '';
      if($id('cm-notes')) $id('cm-notes').value = c.notes || '';
    }
    window._crmEditId = id;
  } else {
    ['cm-name','cm-phone','cm-email','cm-notes'].forEach(id=>{ const el=$id(id); if(el) el.value=''; });
    window._crmEditId = null;
  }
  _openModal('customer-modal','customer-ov');
};

// ─── 5. Full CRM implementation ───
var _customers = safeParseLS('posh_customers',[]);

window.saveCustomer = function(){
  const name  = ($id('cm-name')  || {}).value?.trim() || '';
  const phone = ($id('cm-phone') || {}).value?.trim() || '';
  const email = ($id('cm-email') || {}).value?.trim() || '';
  const notes = ($id('cm-notes') || {}).value?.trim() || '';
  if(!name){ toast('⚠️ Customer name required'); return; }
  if(window._crmEditId){
    const c = _customers.find(x=>x.id===window._crmEditId);
    if(c) Object.assign(c, {name,phone,email,notes,updatedAt:Date.now()});
  } else {
    _customers.push({id:Date.now(), name, phone, email, notes, createdAt:Date.now(), purchases:0, totalSpent:0, points:0});
  }
  localStorage.setItem('posh_customers', JSON.stringify(_customers));
  closeCustomerModal();
  renderCRM();
  addAuditEntry('CRM', (window._crmEditId?'Updated':'Added')+' customer: '+name);
  toast('✅ Customer saved');
};

window.renderCRM = function(){
  const q = ($id('crm-q')||{}).value?.toLowerCase() || '';
  let list = _customers;
  if(q) list = list.filter(c=>c.name.toLowerCase().includes(q)||(c.phone||'').includes(q));
  list = [...list].sort((a,b)=>(b.totalSpent||0)-(a.totalSpent||0));

  const summaryEl = $id('crm-summary');
  if(summaryEl){
    const totalCustomers = _customers.length;
    const totalSpent     = _customers.reduce((s,c)=>s+(c.totalSpent||0), 0);
    const withDebt       = (typeof debts !== 'undefined' ? debts : []).filter(d=>d.status!=='paid').length;
    summaryEl.innerHTML = `
      <div style="background:var(--surf2);border:1px solid var(--brd);border-radius:12px;padding:11px;text-align:center">
        <div style="font-size:18px;font-weight:800;color:var(--text)">${totalCustomers}</div>
        <div style="font-size:10px;color:var(--muted);font-weight:600;text-transform:uppercase">Customers</div>
      </div>
      <div style="background:var(--surf2);border:1px solid var(--brd);border-radius:12px;padding:11px;text-align:center">
        <div style="font-size:18px;font-weight:800;color:var(--primary)">${typeof fmt==='function'?fmt(totalSpent):totalSpent}</div>
        <div style="font-size:10px;color:var(--muted);font-weight:600;text-transform:uppercase">Total Spent</div>
      </div>
      <div style="background:var(--surf2);border:1px solid var(--brd);border-radius:12px;padding:11px;text-align:center">
        <div style="font-size:18px;font-weight:800;color:var(--amber)">${withDebt}</div>
        <div style="font-size:10px;color:var(--muted);font-weight:600;text-transform:uppercase">On Credit</div>
      </div>`;
  }

  const listEl = $id('crm-list');
  if(!listEl) return;
  if(!list.length){
    listEl.innerHTML = '<div style="text-align:center;padding:32px 16px;color:var(--muted)"><div style="font-size:36px;margin-bottom:10px">👤</div><div style="font-size:14px;font-weight:700">No customers yet</div><div style="font-size:12px;margin-top:6px">Add customers to track loyalty and purchases</div></div>';
    return;
  }
  const earnRate   = parseInt(localStorage.getItem('posh_loyalty_earn')   || '10');
  const redeemRate = parseInt(localStorage.getItem('posh_loyalty_redeem') || '1');
  listEl.innerHTML = list.map(c=>{
    const initials = c.name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
    const debtRecord = (typeof debts !== 'undefined' ? debts : []).find(d=>d.name.toLowerCase()===c.name.toLowerCase()&&d.status!=='paid');
    return `<div style="background:var(--surface,var(--surf2));border:1px solid var(--border,var(--brd));border-radius:16px;padding:14px;display:flex;align-items:center;gap:12px">
      <div style="width:44px;height:44px;border-radius:50%;background:var(--primary);display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:800;color:white;flex-shrink:0">${initials}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:700;color:var(--text)">${c.name}</div>
        ${c.phone?`<div style="font-size:11px;color:var(--muted);margin-top:2px">📞 ${c.phone}</div>`:''}
        <div style="display:flex;gap:8px;margin-top:5px;flex-wrap:wrap">
          ${c.totalSpent>0?`<span style="font-size:10px;font-weight:700;background:var(--green-l);color:var(--green-text);padding:2px 7px;border-radius:6px">Spent: ${typeof fmt==='function'?fmt(c.totalSpent):c.totalSpent}</span>`:''}
          ${c.points>0?`<span style="font-size:10px;font-weight:700;background:var(--purple-l,#f3e8ff);color:#7c3aed;padding:2px 7px;border-radius:6px">⭐ ${c.points} pts</span>`:''}
          ${debtRecord?`<span style="font-size:10px;font-weight:700;background:var(--red-l);color:var(--red-text);padding:2px 7px;border-radius:6px">Owes ${typeof fmt==='function'?fmt(debtRecord.amount-debtRecord.paid):'?'}</span>`:''}
        </div>
        ${c.notes?`<div style="font-size:10px;color:var(--muted);margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c.notes}</div>`:''}
      </div>
      <div style="display:flex;flex-direction:column;gap:5px">
        <button onclick="openCustomerModal(${c.id})" style="font-size:10px;font-weight:700;background:var(--surf2);border:1px solid var(--brd);border-radius:7px;padding:5px 8px;cursor:pointer;color:var(--text)">✏️</button>
        ${c.phone?`<button onclick="window.open('https://wa.me/${(c.phone||'').replace(/\s/g,'').replace(/^0/,'254')}?text=${encodeURIComponent('Hi '+c.name+', thank you for shopping at '+(typeof shopName!=='undefined'?shopName:'POSH')+'!')}','_blank')" style="font-size:10px;font-weight:700;background:#25D366;border:none;border-radius:7px;padding:5px 8px;cursor:pointer;color:white">📲</button>`:''}
        <button onclick="deleteCRMCustomer(${c.id})" style="font-size:10px;font-weight:700;background:var(--red-l);border:1px solid var(--red);border-radius:7px;padding:5px 8px;cursor:pointer;color:var(--red-text)">🗑</button>
      </div>
    </div>`;
  }).join('');
};

window.deleteCRMCustomer = function(id){
  if(typeof showConfirm === 'function'){
    showConfirm('Delete Customer?','This cannot be undone.',()=>{
      _customers = _customers.filter(c=>c.id!==id);
      localStorage.setItem('posh_customers',JSON.stringify(_customers));
      renderCRM();
      toast('🗑 Customer deleted');
    }, true);
  }
};

// ─── 6. Staff list renderer ───
window.renderStaffList = function(){
  const listEl = $id('staff-accounts-list');
  if(!listEl) return;
  const staffData = safeParseLS('posh_staff_list',[]);
  // Always show at least the two built-in roles
  const builtIn = [
    {id:'builtin-admin', name:'Admin Account', role:'admin', pin:'••••', builtin:true},
    {id:'builtin-staff', name:'Staff Account', role:'staff', pin:'••••', builtin:true},
  ];
  const all = [...builtIn, ...staffData];
  if(all.length === 0){
    listEl.innerHTML = '<div style="text-align:center;padding:32px;color:var(--muted)"><div style="font-size:36px;margin-bottom:10px">👥</div><div style="font-size:14px;font-weight:700">No staff added yet</div></div>';
    return;
  }
  const roleColors = {admin:'var(--amber-l)',supervisor:'var(--blue-l)',staff:'var(--surf2)'};
  const roleIcons  = {admin:'👑',supervisor:'🔑',staff:'👤'};
  listEl.innerHTML = all.map(s=>`
    <div style="background:var(--surface,var(--surf2));border:1px solid var(--border,var(--brd));border-radius:14px;padding:13px 14px;display:flex;align-items:center;gap:11px">
      <div style="width:40px;height:40px;border-radius:50%;background:${roleColors[s.role]||'var(--surf2)'};display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">${roleIcons[s.role]||'👤'}</div>
      <div style="flex:1">
        <div style="font-size:13px;font-weight:700;color:var(--text)">${s.name}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:2px;text-transform:capitalize">${s.role}${s.phone?' · 📞 '+s.phone:''}</div>
      </div>
      ${!s.builtin?`<button onclick="deleteStaff(${s.id})" style="font-size:10px;font-weight:700;background:var(--red-l);border:1px solid var(--red);border-radius:7px;padding:5px 8px;cursor:pointer;color:var(--red-text)">🗑</button>`:'<span style="font-size:10px;color:var(--muted);font-weight:600">Built-in</span>'}
    </div>`).join('');
};

window.saveStaff = function(){
  const name  = ($id('sf-name')  || {}).value?.trim() || '';
  const role  = ($id('sf-role')  || {}).value || 'staff';
  const pin   = ($id('sf-pin')   || {}).value || '';
  const phone = ($id('sf-phone') || {}).value?.trim() || '';
  if(!name){ toast('⚠️ Name required'); return; }
  if(pin.length !== 4 || !/^\d{4}$/.test(pin)){ toast('⚠️ Enter a valid 4-digit PIN'); return; }
  const staffData = safeParseLS('posh_staff_list',[]);
  staffData.push({id:Date.now(), name, role, pin, phone, createdAt:Date.now()});
  localStorage.setItem('posh_staff_list', JSON.stringify(staffData));
  closeStaffModal();
  renderStaffList();
  addAuditEntry('STAFF', 'Added staff: ' + name + ' ('+role+')');
  toast('✅ Staff member added');
};

window.deleteStaff = function(id){
  if(typeof showConfirm === 'function'){
    showConfirm('Remove Staff?','This cannot be undone.',()=>{
      const staffData = safeParseLS('posh_staff_list',[]).filter(s=>s.id!==id);
      localStorage.setItem('posh_staff_list', JSON.stringify(staffData));
      renderStaffList();
      toast('🗑 Staff removed');
    }, true);
  }
};

// ─── 7. Purchase Order — populate low stock list ───
(function patchPurchaseOrders(){
  window.openPurchaseOrders = window.openPurchaseOrderModal = function(){
    const lowStockEl = $id('po-low-stock-items');
    if(lowStockEl){
      const prods = typeof products !== 'undefined' ? products : [];
      const lowItems = prods.filter(p=>p.stock<=p.lowAt);
      lowStockEl.innerHTML = lowItems.length
        ? `<div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;margin-bottom:8px">Items needing restock</div>` +
          lowItems.map(p=>`<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--brd)">
            <div style="display:flex;align-items:center;gap:8px">
              <span>${p.emoji}</span>
              <div><div style="font-size:12px;font-weight:700;color:var(--text)">${p.name}</div>
              <div style="font-size:10px;color:var(--muted)">${p.stock<=0?'Out of stock':'Low: '+p.stock+' left'}${p.supplier?' · '+p.supplier:''}</div></div>
            </div>
            ${p.phone||p.supplier?`<button onclick="window.open('https://wa.me/?text='+encodeURIComponent('Hi, I would like to reorder ${p.name}. Current stock: ${p.stock}.'),'_blank')" style="font-size:10px;background:#25D366;border:none;border-radius:7px;padding:4px 8px;color:white;cursor:pointer;font-weight:700">📲 Order</button>`:''}
          </div>`).join('')
        : '<div style="text-align:center;color:var(--muted);font-size:12px;padding:16px">✅ No items need restocking right now</div>';
    }
    _openModal('po-modal','po-ov');
  };
})();

// ─── 8. CRM — link purchases to customers after sale ───
(function patchSaleForCRM(){
  const _orig = window.confirmSale;
  window.confirmSale = function(){
    // Pre-capture customer lookup value before sale clears it
    const custName = ($id('receipt-customer-lookup')||{}).value?.trim() || '';
    _orig && _orig();
    // If a customer name was entered, update their purchase stats
    if(custName){
      const cust = _customers.find(c=>c.name.toLowerCase()===custName.toLowerCase());
      if(cust){
        const lastSale = (typeof sales !== 'undefined' ? sales : []).slice(-1)[0];
        if(lastSale){
          cust.purchases = (cust.purchases||0) + 1;
          cust.totalSpent = (cust.totalSpent||0) + lastSale.total;
          const earnRate = parseInt(localStorage.getItem('posh_loyalty_earn')||'10');
          cust.points = (cust.points||0) + Math.floor(lastSale.total / earnRate);
          localStorage.setItem('posh_customers', JSON.stringify(_customers));
        }
      }
    }
    // Clear lookup field
    const lkp = $id('receipt-customer-lookup');
    if(lkp) lkp.value = '';
  };
})();

// ─── 9. Customer lookup autocomplete in receipt modal ───
// Helper: called when a customer is selected from the loyalty lookup dropdown
window.selectLoyaltyCustomer = function(name, points, totalSpent){
  const input = $id('receipt-customer-lookup');
  if(input) input.value = name;
  const resultsEl = $id('customer-lookup-results');
  if(resultsEl){ resultsEl.innerHTML = ''; resultsEl.style.display = 'none'; }
  const el = $id('loyalty-redeem-info');
  if(!el) return;
  const rate  = parseInt(localStorage.getItem('posh_loyalty_redeem') || '1');
  const val   = typeof fmt === 'function' ? fmt(points / rate) : points / rate;
  const spent = typeof fmt === 'function' ? fmt(totalSpent || 0) : (totalSpent || 0);
  const initials = name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
  el.innerHTML = `
    <div class="lrc-header">
      <div class="lrc-avatar">${initials}</div>
      <div>
        <div class="lrc-name">${name}</div>
        <div class="lrc-sub">${spent} total spent · Loyalty member</div>
      </div>
    </div>
    <div class="lrc-stats">
      <div class="lrc-stat">
        <div class="lrc-stat-val">${points.toLocaleString()}</div>
        <div class="lrc-stat-lbl">Points Balance</div>
      </div>
      <div class="lrc-stat">
        <div class="lrc-stat-val">${val}</div>
        <div class="lrc-stat-lbl">Est. Value</div>
      </div>
    </div>`;
};

window.lookupCustomerForReceipt = function(q){
  const resultsEl = $id('customer-lookup-results');
  if(!resultsEl) return;
  if(!q || q.length < 2){ resultsEl.innerHTML = ''; resultsEl.style.display = 'none'; return; }
  const matches = _customers.filter(c=>c.name.toLowerCase().includes(q.toLowerCase())||(c.phone||'').includes(q));
  if(!matches.length){ resultsEl.innerHTML = ''; resultsEl.style.display = 'none'; return; }
  resultsEl.style.display = 'block';
  // BUG FIX: the old code had a broken regex literal /\/g (the / inside the
  // regex closed the literal early, causing a syntax error) and injected the
  // customer name directly into an onclick string (injection risk for any name
  // with quotes or slashes). Use data-* attributes + addEventListener instead.
  resultsEl.innerHTML = matches.slice(0,5).map(function(c) {
    var pts   = c.points     || 0;
    var spent = c.totalSpent || 0;
    var safeName = (c.name || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;');
    var safePhone = (c.phone || '').replace(/&/g,'&amp;');
    return '<div class="clr-row" data-name="' + safeName + '" data-pts="' + pts + '" data-spent="' + spent + '"'
      + ' style="padding:8px 12px;cursor:pointer;border-bottom:1px solid var(--brd);display:flex;justify-content:space-between;align-items:center">'
      + '<div>'
      + '<div style="font-size:12px;font-weight:700;color:var(--text)">' + safeName + '</div>'
      + (safePhone ? '<div style="font-size:10px;color:var(--muted)">' + safePhone + '</div>' : '')
      + '</div>'
      + '<div style="text-align:right">'
      + '<div style="font-size:11px;font-weight:700;color:var(--purple-text)">' + pts.toLocaleString() + ' pts</div>'
      + '<div style="font-size:10px;color:var(--muted)">' + (typeof fmt==='function'?fmt(spent):spent) + ' spent</div>'
      + '</div></div>';
  }).join('');

  // Delegated click — name is read from dataset (never eval'd as code)
  resultsEl.querySelectorAll('.clr-row').forEach(function(row) {
    row.addEventListener('click', function() {
      selectLoyaltyCustomer(
        row.dataset.name,
        parseFloat(row.dataset.pts)   || 0,
        parseFloat(row.dataset.spent) || 0
      );
    });
  });
};

// ─── 10. openShiftFloat — also update float summary if needed ───
(function patchOpenShiftFloat(){
  const _orig = window.openShiftFloat;
  window.openShiftFloat = function(){
    const openedBy = ($id('float-opened-by')||{}).value?.trim() || 'Staff';
    _orig && _orig();
    addAuditEntry('SHIFT_OPEN', 'Shift opened by: ' + openedBy + ' · Float: ' + (typeof fmt==='function'?fmt(floatAmount):floatAmount));
  };
})();

// ─── 11. vat-setting-val alias: HTML uses "tax-setting-val" in Settings ───
(function syncTaxSettingLabel(){
  const _origSave = window.saveData;
  function updateTaxLabel(){
    const el = $id('tax-setting-val');
    if(el) el.textContent = vatEnabled ? 'VAT ' + vatRate + '%' : '0% (disabled)';
  }
  // Patch patchDashboard to also update tax label
  const _origDash = window.renderDashboard;
  window.renderDashboard = function(){
    _origDash && _origDash();
    updateTaxLabel();
  };
  updateTaxLabel(); // run once on load
})();

console.log('POSH Additional Patches loaded ✅ — CRM, Staff, Float, Tab routing, VAT alias all fixed');

// ── Storage Mode init ──────────────────────────────────
// privacy.js loads AFTER quickwins.js. Use window._storageInitialized as a
// single-call guard shared with app.js (_initCloudSync also checks this).
// This prevents initStorageMode from running twice (once here on load, once
// again when the firebaseReady event fires _initCloudSync in app.js).
(function _maybeInitStorageMode() {
  if (window._storageInitialized) return; // already done by app.js
  function _doInit() {
    if (window._storageInitialized) return;
    if (typeof initStorageMode !== 'function') return;
    window._storageInitialized = true;
    initStorageMode();
  }
  if (typeof initStorageMode === 'function') {
    _doInit();
  } else {
    // privacy.js hasn't parsed yet — wait for window load
    window.addEventListener('load', _doInit, { once: true });
  }
})();
