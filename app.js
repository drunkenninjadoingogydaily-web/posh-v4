// ═══════════════════════════════════════════════════════
//  POSH — App Logic (app.js)
//  All business logic, UI rendering and state management
// ═══════════════════════════════════════════════════════

// ═════════════════════════════════════
//  DONATE CONFIG  — single source of truth
//  To update the number: change POSH_DONATE.number below,
//  OR set it in Firestore at config/donate → { pochiNumber: '07XXXXXXXX' }
//  and it will be loaded remotely without redeploying.
// ═════════════════════════════════════
var POSH_DONATE = (function(){
  var _default = '0717385810';  // ← only change the number HERE
  var _loaded   = false;

  // Try to load override from Firestore config doc
  function _fetchRemote(){
    if(_loaded) return;
    // Wait for Firebase to be ready, then check config/donate document
    window.addEventListener('firebaseReady', function(){
      try{
        var app = window._poshFirebaseApp || (typeof getApp==='function' && getApp());
        if(!app) return;
        // Use dynamic import so this works even if firebase.js hasn't exposed db yet
        import('https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js').then(function(m){
          var db = m.initializeFirestore
            ? null  // db is owned by firebase.js; read via exposed helper
            : null;
          // Prefer the already-initialised db from firebase.js via window._poshDb
          var firestoreDb = window._poshDb;
          if(!firestoreDb) return;
          m.getDoc(m.doc(firestoreDb,'config','donate')).then(function(snap){
            if(snap.exists()){
              var d = snap.data();
              if(d && d.pochiNumber && /^0[17]\d{8}$/.test(d.pochiNumber)){
                _default = d.pochiNumber;
                // Refresh displayed number if modal is in the DOM
                var el = document.getElementById('donate-number');
                if(el) el.textContent = _fmt(_default);
              }
            }
            _loaded = true;
          }).catch(function(){});
        }).catch(function(){});
      }catch(e){}
    },{once:true});
  }

  function _fmt(n){ return n.replace(/(\d{4})(\d{3})(\d{3})/,'$1 $2 $3'); }
  function _raw(){ return _default; }
  function _display(){ return _fmt(_default); }

  _fetchRemote();
  return { raw: _raw, display: _display, fmt: _fmt };
})();

// ═════════════════════════════════════
//  DATA
// ═════════════════════════════════════
const EMOJIS=['🐟','🐠','🍚','🌽','🥜','🫙','🧴','🍞','🥚','🧅','🧄','🍅','🥬','🍋','🍊','🫚','🧂','🍵','☕','🥤','🧃','🫒','🌿','🫛','🥩','🐓','🥦','🍯','🧇','🫙'];
const EXP_ICONS={Transport:'🚗',Rent:'🏠',Stock:'📦',Utilities:'💡',Other:'💸'};

// Fish: Fresh price = size × 50, Fried price = size × 50 + 50
const FRESH_SIZES=[1,1.5,2,2.5,3,3.5,4,4.5,5,5.5,6,6.5,7,7.5,8,8.5,9,9.5,10];
const FRESH_PRICES=[50,75,100,125,150,175,200,225,250,275,300,325,350,375,400,425,450,475,500];
const FRIED_PRICES=[100,125,150,175,200,225,250,275,300,325,350,375,400,425,450,475,500,525,550];
// Categories: Fish (was Fresh Fish + Fried Fish), Omena (was Dried Omena + Fried Omena)
// prices{fresh,fried} on each product distinguishes pricing; preparation_type is set per cart item only
// Legacy category name map for backward-compat migration
const LEGACY_CAT_MAP={'Fresh Fish':'Fish','Fried Fish':'Fish','Dried Omena':'Omena','Fried Omena':'Omena'};
const LEGACY_PREP_MAP={'Fresh Fish':'fresh','Fried Fish':'fried','Dried Omena':'fresh','Fried Omena':'fried'};
// Fish and Omena share one fresh-stock product each; prep choice happens at cart time
const PREP_CATS=new Set(['Fish','Omena']);

// ── PRODUCT TYPES ──────────────────────────────────────────────
// standard : normal unit-based product (default, backward-compat)
// bulk     : sold by weight/volume — qty is decimal, price = qty × pricePerUnit
// service  : no stock tracking (airtime, M-Pesa, printing, labour)
const PRODUCT_TYPES={
  standard:{label:'Standard',icon:'📦',hint:'Regular packaged goods — bottles, cans, packets'},
  bulk    :{label:'Bulk / Loose',icon:'⚖️',hint:'Sold by weight or volume — oil, grains, sugar'},
  service :{label:'Service',icon:'🛎️',hint:'No stock needed — airtime, M-Pesa, printing'},
};
const BULK_UNITS=['kg','g','litre','ml','piece'];

function getProdType(p){return(p&&p.prodType)||'standard';}

function getDisplayCat(cat){return LEGACY_CAT_MAP[cat]||cat;}
function getSubLabel(p){
  // accepts a product object; falls back to legacy cat-name parsing
  if(p&&p.preparation_type){return p.preparation_type==='fresh'?'Fresh':'Fried';}
  if(p&&p.cat){const c=p.cat;if(c==='Fresh Fish')return'Fresh';if(c==='Fried Fish')return'Fried';if(c==='Dried Omena')return'Fresh';if(c==='Fried Omena')return'Fried';}
  return'';
}

var products=[];
// Products are added by the shop owner via Stock → + Add Product.
// The old default fish/omena catalogue has been removed so new shops
// start clean. Existing shops that already saved data will load their
// own products from localStorage / Firestore as normal.
// NOTE: top-level data variables must be var (not let/const) so firebase.js
// can access and update them via window.* for cloud sync to work.
var sales=[];
var expenses=[];
var debts=[];
var cart=[];
var selEmoji='🐟';
var editId=null;
var debtEditId=null;
var activeCat='All';
var rptFilter='today';
var histFilter='today';
var dailyGoal=2000;
var shopName='POSH';
var userPin='1234'; // kept for legacy load compat
var adminPin='4321';
var staffPin='1234';
var nextId=500;
var nextDebtId=1;
var darkMode=false;
var idleMinutes=30;
let idleTimer=null;
let lastSaleTime=Date.now();

// Role: 'admin' or 'staff'
let currentRole='staff';
window.currentRole = 'staff';

// PIN state
let pinEntry='';
let pinMode='verify'; // 'verify' | 'change_admin' | 'change_staff'
let newPinStep=0;
let newPinTemp='';
let changePinTarget=''; // 'admin' | 'staff'

// Shift tracking
let shiftStartTime=null;
let shiftSalesAtStart=0;

// ═════════════════════════════════════
//  CONFIRM MODAL
// ═════════════════════════════════════
var _confirmCallback=null;
function showConfirm(title,sub,cb,isDanger){
  _confirmCallback=cb;
  // pick icon from title
  var icon='⚠️';
  if(title.includes('🗑')||title.includes('Delete')||title.includes('Clear'))icon='🗑️';
  if(title.includes('Credit')||title.includes('debt'))icon='📒';
  document.getElementById('confirm-icon').textContent=icon;
  document.getElementById('confirm-title').textContent=title;
  document.getElementById('confirm-sub').textContent=sub||'This cannot be undone.';
  var okBtn=document.getElementById('confirm-ok');
  okBtn.className=isDanger?'confirm-ok danger':'confirm-ok';
  okBtn.textContent=isDanger?'Yes, delete':'Confirm';
  document.getElementById('confirm-modal').classList.add('open');
}
function closeConfirm(){
  document.getElementById('confirm-modal').classList.remove('open');
  _confirmCallback=null;
}
function doConfirm(){
  closeConfirm();
  if(_confirmCallback)_confirmCallback();
}

// ═════════════════════════════════════
//  LOCAL STORAGE PERSISTENCE
// ═════════════════════════════════════
function saveData(){
  var now = new Date().toISOString();
  try{
    localStorage.setItem('posh_data',JSON.stringify({
      products,sales,expenses,debts,
      dailyGoal,shopName,adminPin,staffPin,darkMode,idleMinutes,
      nextId,nextDebtId,
      staffAccounts: window.staffAccounts || [],
      shopCode: localStorage.getItem('posh_shop_code') || '',
      lastSync:now
    }));
  }catch(e){
    // BUG FIX #9: detect storage quota exceeded and warn the user instead of silently failing
    if(e.name === 'QuotaExceededError' || e.code === 22) {
      const msg = '⚠️ Storage full! Export a CSV backup then delete old sales.';
      if(typeof toast === 'function') toast(msg);
      console.error('[POSH] localStorage quota exceeded — data not saved', e);
      // Offer CSV export to prevent data loss
      setTimeout(function() {
        if(confirm('Storage is full. Export CSV backup now?')) {
          if(typeof exportCSV === 'function') exportCSV();
        }
      }, 500);
      return; // don't attempt cloud sync if local save failed
    }
    console.warn('Save failed',e);
  }
  if(typeof cloudSync==='function') cloudSync();
}
function loadData(){
  try{
    const raw=localStorage.getItem('posh_data');
    if(!raw)return;
    const d=JSON.parse(raw);
    if(d.products&&d.products.length){
      // ── Step 1: Migrate legacy category names ──
      products=d.products.map(p=>{
        let {cat,preparation_type}=p;
        if(LEGACY_CAT_MAP[cat]){
          preparation_type=preparation_type||LEGACY_PREP_MAP[cat];
          cat=LEGACY_CAT_MAP[cat];
        }
        let name=p.name;
        if(name&&(name.startsWith('Fresh Fish ')||name.startsWith('Fried Fish ')))name=name.replace(/^(Fresh|Fried) Fish /,'Fish ');
        if(name&&(name.startsWith('Dried Omena ')||name.startsWith('Fried Omena ')))name=name.replace(/^(Dried|Fried) Omena /,'Omena ');
        return{...p,name,cat,preparation_type};
      });
      // ── Step 2: Drop separate fried stock items (inventory is fresh-only now) ──
      products=products.filter(p=>p.preparation_type!=='fried');
      // ── Step 3: Ensure PREP_CATS items have prices{} and no preparation_type ──
      const DEF_PRICES=[
        ...FRESH_SIZES.map((sz,i)=>({cat:'Fish',unit:'Size '+sz,prices:{fresh:FRESH_PRICES[i],fried:FRIED_PRICES[i]}})),
        {cat:'Omena',unit:'300g',prices:{fresh:70,fried:100}},
        {cat:'Omena',unit:'500g',prices:{fresh:100,fried:150}},
        {cat:'Omena',unit:'1kg',prices:{fresh:250,fried:350}},
        {cat:'Omena',unit:'2kg',prices:{fresh:550,fried:800}},
      ];
      products=products.map(p=>{
        if(!PREP_CATS.has(getDisplayCat(p.cat)))return p;
        let prices=p.prices;
        if(!prices){
          const def=DEF_PRICES.find(d=>d.cat===getDisplayCat(p.cat)&&d.unit===p.unit);
          prices=def?def.prices:{fresh:p.price,fried:p.price};
        }
        const {preparation_type,...rest}=p;
        return{...rest,price:prices.fresh,prices,emoji:p.emoji||'\u{1F420}'};
      });
      // ── Step 4: Ensure all products have a prodType (backward-compat) ──
      products=products.map(p=>({prodType:'standard',...p}));
    }
    if(d.sales)sales=d.sales;
    if(d.expenses)expenses=d.expenses;
    if(d.debts)debts=d.debts;
    if(d.dailyGoal)dailyGoal=d.dailyGoal;
    if(d.shopName)shopName=d.shopName;
    // Dual-pin support with legacy fallback
    if(d.adminPin)adminPin=d.adminPin;
    if(d.staffPin)staffPin=d.staffPin;
    else if(d.userPin)staffPin=d.userPin; // migrate old single pin
    if(typeof d.darkMode==='boolean'){darkMode=d.darkMode;}
    if(typeof d.idleMinutes==='number')idleMinutes=d.idleMinutes;
    if(d.nextId)nextId=d.nextId;
    if(d.nextDebtId)nextDebtId=d.nextDebtId;
    if(d.staffAccounts)window.staffAccounts=d.staffAccounts;
    if(d.shopCode&&!localStorage.getItem('posh_shop_code'))localStorage.setItem('posh_shop_code',d.shopCode);
    if(darkMode){
      document.documentElement.setAttribute('data-theme','dark');
      const btn=document.getElementById('dark-toggle-btn');
      if(btn)btn.textContent='☀️';
      const track=document.getElementById('dm-track');
      if(track)track.classList.add('on');
    }
  }catch(e){console.warn('Load failed',e);}
}

// ═════════════════════════════════════
//  UTILS
// ═════════════════════════════════════
const fmt=n=>'KSh '+Number(n).toLocaleString();
const fmtS=n=>n>=1000?(n/1000).toFixed(1)+'K':String(n);
const nowDate=()=>new Date().toLocaleDateString('en-KE',{day:'numeric',month:'short',year:'2-digit'});
function toast(msg){var t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2200);}
function getDateKey(ts){var d=new Date(ts);return`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;}
function todayKey(){return getDateKey(Date.now());}
function yesterdayKey(){var d=new Date();d.setDate(d.getDate()-1);return getDateKey(d.getTime());}
function filterSales(period){
  const now=new Date();
  if(period==='today')return sales.filter(s=>getDateKey(s.ts)===todayKey());
  if(period==='week'){var w=new Date(now);w.setDate(w.getDate()-7);return sales.filter(s=>new Date(s.ts)>=w);}
  if(period==='month')return sales.filter(s=>{var d=new Date(s.ts);return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();});
  return sales;
}
function calcProfit(s){return s.items.reduce((sum,i)=>{
  var p=products.find(x=>x.id===i.id);
  // BUG FIX: use cost saved on the sale item if product was later deleted
  // so we never fall back to cost=0 which inflates profit numbers.
  // BUG FIX (bulk): for bulk items i.price and i.cost are both already totals
  // (qty × unit rate), so profit = i.price - i.cost with no further qty multiply.
  // For standard items, i.price is per-unit so profit = (i.price - unitCost) × qty.
  if(i.prodType==='bulk'){
    var totalCost=i.cost||0;
    return sum+(i.price-totalCost);
  }
  // BUG FIX: prioritise the cost stored on the sale item (captured at cart-add
  // time) over the live product cost.  Using p.cost when the product still
  // exists meant that editing a product's cost retroactively changed every
  // historical profit figure — exactly the same problem as deleted products.
  var unitCost=(i.unitCost!=null)?i.unitCost:((i.cost!=null)?i.cost:(p?p.cost:0));
  return sum+(i.price-unitCost)*i.qty;
},0);}
// BUG FIX: bulk items store price as a pre-computed total (qty × pricePerUnit),
// so we must NOT multiply by qty again. Standard/service items use price per unit.
function cartTotal(){return cart.reduce((s,x)=>s+(x.prodType==='bulk'?x.price:x.price*x.qty),0);}
function cartCount(){return cart.reduce((s,x)=>s+x.qty,0);}
function vsBadge(today,yest,prefix=''){
  if(!yest)return '';
  const diff=today-yest;const pct=yest>0?Math.round(Math.abs(diff)/yest*100):0;
  if(diff>0)return`<div class="vs-badge vs-up">▲ ${pct}% vs yesterday</div>`;
  if(diff<0)return`<div class="vs-badge vs-down">▼ ${pct}% vs yesterday</div>`;
  return`<div class="vs-badge vs-flat">= Same as yesterday</div>`;
}

// ═════════════════════════════════════
//  SIDEBAR
// ═════════════════════════════════════
function openSidebar(){
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sb-overlay').classList.add('open');
  updateSidebar();
}
function closeSidebar(){
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sb-overlay').classList.remove('open');
}
function updateSidebar(){
  // shop name
  document.getElementById('sb-shop-name').textContent='🏪 '+shopName;
  // role badge
  var roleBadge=document.getElementById('sb-role-badge');
  if(roleBadge){
    roleBadge.textContent=currentRole==='admin'?'👑 Admin — Full Access':'👤 Staff — POS Mode';
    roleBadge.style.background=currentRole==='admin'?'var(--amber-l)':'var(--primary-l)';
    roleBadge.style.color=currentRole==='admin'?'#92400E':'var(--primary-d)';
  }
  // dark mode toggle
  const track=document.getElementById('sb-dm-track');
  if(track)track.classList.toggle('on',darkMode);
  document.getElementById('sb-dark-sub').textContent='Currently '+(darkMode?'Dark':'Light');
  // idle
  var sbIdleEl=document.getElementById('sb-idle-sub');
  if(sbIdleEl)sbIdleEl.textContent=idleMinutes===0?'Disabled':'After '+idleMinutes+' mins no sales';
  // shop code in sidebar
  var codeSubEl=document.getElementById('sb-code-sub');
  if(codeSubEl&&typeof window.getShopCode==='function')codeSubEl.textContent='Code: '+window.getShopCode();
  // alerts
  const low=products.filter(p=>p.stock>0&&p.stock<=p.lowAt).length;
  const out=products.filter(p=>p.stock===0).length;
  const unpaid=debts.filter(d=>d.status!=='paid').length;
  const total=low+out+unpaid;
  const badgeWrap=document.getElementById('sb-notif-badge-wrap');
  const alertSub=document.getElementById('sb-alerts-sub');
  if(total>0){
    badgeWrap.innerHTML='<span class=\"sb-notif-badge\">'+total+'</span>';
    const parts=[];
    if(out>0)parts.push(out+' out of stock');
    if(low>0)parts.push(low+' low stock');
    if(unpaid>0)parts.push(unpaid+' credit pending');
    alertSub.textContent=parts.join(' · ');
  }else{
    badgeWrap.innerHTML='';
    alertSub.textContent='No active alerts';
  }
}


// ═════════════════════════════════════
//  DARK MODE
// ═════════════════════════════════════
function toggleDark(){
  darkMode=!darkMode;saveData();
  document.documentElement.setAttribute('data-theme',darkMode?'dark':'light');
  const btn=document.getElementById('dark-toggle-btn');if(btn)btn.textContent=darkMode?'☀️':'🌙';
  const dmSub=document.getElementById('dark-mode-sub');if(dmSub)dmSub.textContent='Currently: '+(darkMode?'Dark':'Light');
  const track=document.getElementById('dm-track');if(track)track.classList.toggle('on',darkMode);
  const sbTrack=document.getElementById('sb-dm-track');if(sbTrack)sbTrack.classList.toggle('on',darkMode);
  const sbSub=document.getElementById('sb-dark-sub');if(sbSub)sbSub.textContent='Currently '+(darkMode?'Dark':'Light');
}

// ═════════════════════════════════════
//  IDLE ALERT
// ═════════════════════════════════════
function resetIdleTimer(){
  lastSaleTime=Date.now();
  document.getElementById('idle-banner').classList.remove('show');
  // BUG FIX: use clearInterval consistently — idleTimer is a setInterval handle.
  // Previously the variable was typed as `let` but comments implied setTimeout;
  // the repeated 30-second check requires setInterval, so we keep it and name it clearly.
  clearInterval(idleTimer);
  if(idleMinutes===0)return; // disabled
  idleTimer=setInterval(()=>{
    const mins=Math.floor((Date.now()-lastSaleTime)/60000);
    if(mins>=idleMinutes){
      document.getElementById('idle-msg').textContent=`No sales in ${mins} minute${mins>1?'s':''}. Are you still selling? 👀`;
      document.getElementById('idle-banner').classList.add('show');
    }
  },30000); // check every 30 seconds
}
function dismissIdle(){document.getElementById('idle-banner').classList.remove('show');}
function openIdleModal(){
  openGenModal('Idle Alert Timer',`
    <div class="form-group"><label class="field-label">Alert after how many minutes with no sale?</label>
      <select class="field" id="idle-input">
        <option value="15" ${idleMinutes===15?'selected':''}>15 minutes</option>
        <option value="30" ${idleMinutes===30?'selected':''}>30 minutes</option>
        <option value="60" ${idleMinutes===60?'selected':''}>60 minutes</option>
        <option value="0">Disabled</option>
      </select>
    </div>
    <div style="display:flex;gap:9px">
      <button class="btn btn-secondary" style="flex:1" onclick="closeGenModal()">Cancel</button>
      <button class="btn btn-primary" style="flex:2" onclick="var _iv=parseInt(document.getElementById('idle-input').value,10);idleMinutes=isNaN(_iv)?30:_iv;document.getElementById('idle-setting-sub').textContent=idleMinutes===0?'Disabled':'Alert after '+idleMinutes+' mins no sales';saveData();resetIdleTimer();closeGenModal();toast('✅ Idle timer updated');">Save</button>
    </div>`);
}

// ═════════════════════════════════════
//  PIN — DUAL ROLE (Admin 4321 / Staff 1234)
// ═════════════════════════════════════
function updatePinDots(){for(let i=0;i<4;i++){var d=document.getElementById('pd'+i);d.classList.toggle('filled',i<pinEntry.length);d.classList.remove('shake');}}
function pinPress(n){if(pinEntry.length>=4)return;pinEntry+=n;updatePinDots();if(pinEntry.length===4)setTimeout(checkPin,120);}
function pinDel(){pinEntry=pinEntry.slice(0,-1);updatePinDots();}

function checkPin(){
  if(pinMode==='verify'){
    if(pinEntry===adminPin){
      currentRole = 'admin'; window.currentRole = 'admin';
      unlockApp();
    } else if(pinEntry===staffPin){
      currentRole = 'staff'; window.currentRole = 'staff';
      unlockApp();
    } else {
      shakeDots();
      setTimeout(()=>{pinEntry='';updatePinDots();},400);
    }
  } else {
    // Change PIN flow (admin only)
    if(newPinStep===0){
      newPinTemp=pinEntry;newPinStep=1;pinEntry='';updatePinDots();
      document.getElementById('pin-hint').textContent='Confirm your new '+changePinTarget+' PIN';
    } else if(newPinStep===1){
      if(pinEntry===newPinTemp){
        // BUG FIX: capture target BEFORE clearing state — changePinTarget is
        // reset to '' below, so reading it after the reset always gave 'Staff'.
        var _pinTargetLabel=changePinTarget==='admin'?'Admin':'Staff';
        if(changePinTarget==='admin')adminPin=pinEntry;
        else staffPin=pinEntry;
        saveData();
        // Return to verify mode
        pinMode='verify';newPinStep=0;changePinTarget='';pinEntry='';
        updatePinDots();
        document.getElementById('pin-screen').style.display='none';
        document.getElementById('app').style.display='flex';
        document.getElementById('app').style.flexDirection='column';
        document.getElementById('app').style.minHeight='100vh';
        toast('✅ '+_pinTargetLabel+' PIN updated!');
        applyRoleAccess();
      } else {
        shakeDots();
        setTimeout(()=>{
          pinEntry='';updatePinDots();
          document.getElementById('pin-hint').textContent='PINs did not match. Try again';
          newPinStep=0;
        },400);
      }
    }
  }
}

function shakeDots(){for(let i=0;i<4;i++){var d=document.getElementById('pd'+i);d.classList.add('shake');setTimeout(()=>d.classList.remove('shake'),300);}}

function unlockApp(){
  document.getElementById('pin-screen').style.display='none';
  document.getElementById('app').style.display='flex';
  document.getElementById('app').style.flexDirection='column';
  document.getElementById('app').style.minHeight='100vh';
  pinMode='verify';newPinStep=0;pinEntry='';updatePinDots();
  resetIdleTimer();
  applyRoleAccess();
  // Shift start
  shiftStartTime=Date.now();
  shiftSalesAtStart=sales.length;
  // Show role badge on PIN screen for next lock
  var badge=document.getElementById('pin-role-badge');
  if(badge){badge.textContent='';badge.style.display='none';}
}

function lockApp(){
  document.getElementById('app').style.display='none';
  document.getElementById('pin-screen').style.display='flex';
  pinEntry='';updatePinDots();
  document.getElementById('pin-hint').textContent='Enter your PIN';
  // BUG FIX: stop the idle interval while the screen is locked — no need to
  // keep checking for inactivity when the user is already on the PIN screen.
  clearInterval(idleTimer);
  // Show shift summary toast
  if(shiftStartTime){
    var shiftMins=Math.round((Date.now()-shiftStartTime)/60000);
    var shiftSales=sales.length-shiftSalesAtStart;
    var badge=document.getElementById('pin-role-badge');
    if(badge&&shiftSales>0){
      badge.textContent='Last: '+currentRole+' · '+shiftSales+' sales · '+shiftMins+'min';
      badge.style.display='inline-block';
    }
    shiftStartTime=null;
  }
}

// Open change-PIN flow (admin must be logged in)
function openChangePinModal(target){
  if(currentRole!=='admin'){toast('⛔ Admin access required');return;}
  changePinTarget=target;
  pinMode='change_'+target;
  newPinStep=0;pinEntry='';updatePinDots();
  lockApp();
  document.getElementById('pin-hint').textContent='Enter NEW '+target+' PIN (4 digits)';
  var badge=document.getElementById('pin-role-badge');
  if(badge){badge.textContent='Changing '+target+' PIN…';badge.style.display='inline-block';}
}

// Legacy alias (called from old code paths)
function startPinChange(){openChangePinModal('staff');}

// ═════════════════════════════════════
//  PIN RESET VIA PHONE NUMBER
// ═════════════════════════════════════
var _resetTarget=''; // 'admin' | 'staff'
// Registered reset phone — editable from Settings in a future update
var resetPhone='0702655836';

function openPinReset(){
  var modal=document.getElementById('pin-reset-modal');
  if(!modal)return;
  // Reset to step 1
  document.getElementById('pin-reset-step1').style.display='block';
  document.getElementById('pin-reset-step2').style.display='none';
  document.getElementById('pin-reset-step3').style.display='none';
  document.getElementById('pin-reset-phone').value='';
  document.getElementById('pin-reset-sub').textContent='Enter your registered phone number to reset your PIN';
  modal.style.display='flex';
}
function closePinReset(){
  var modal=document.getElementById('pin-reset-modal');
  if(modal)modal.style.display='none';
  _resetTarget='';
}
function verifyResetPhone(){
  var input=document.getElementById('pin-reset-phone').value.replace(/\s+/g,'').trim();
  // Normalise: strip leading +254 or 254, keep as 07xxxxxxxx
  var normalised=input.replace(/^\+?254/,'0');
  var stored=resetPhone.replace(/^\+?254/,'0');
  if(normalised===stored){
    document.getElementById('pin-reset-step1').style.display='none';
    document.getElementById('pin-reset-step2').style.display='block';
  } else {
    document.getElementById('pin-reset-phone').style.borderColor='var(--red)';
    document.getElementById('pin-reset-sub').textContent='❌ Phone number not recognised. Try again.';
    setTimeout(function(){
      document.getElementById('pin-reset-phone').style.borderColor='';
    },1500);
  }
}
function startPhoneReset(target){
  _resetTarget=target;
  document.getElementById('pin-reset-step2').style.display='none';
  document.getElementById('pin-reset-step3').style.display='block';
  document.getElementById('pin-reset-step3-label').textContent=
    'Enter new '+(target==='admin'?'Admin 👑':'Staff 👤')+' PIN (4 digits)';
  document.getElementById('pin-reset-newpin').value='';
  document.getElementById('pin-reset-newpin').focus();
}
function confirmPhoneReset(){
  var newPin=document.getElementById('pin-reset-newpin').value.trim();
  if(newPin.length!==4||!/^\d{4}$/.test(newPin)){
    document.getElementById('pin-reset-newpin').style.borderColor='var(--red)';
    document.getElementById('pin-reset-step3-label').textContent='⚠️ Must be exactly 4 digits';
    setTimeout(function(){
      document.getElementById('pin-reset-newpin').style.borderColor='';
    },1500);
    return;
  }
  if(_resetTarget==='admin') adminPin=newPin;
  else staffPin=newPin;
  saveData();
  closePinReset();
  toast('✅ '+(  _resetTarget==='admin'?'Admin':'Staff')+' PIN has been reset!');
}

// ═════════════════════════════════════
//  ROLE-BASED ACCESS CONTROL
// ═════════════════════════════════════
function applyRoleAccess(){
  var isAdmin=currentRole==='admin';
  // Update role badge in sidebar
  var roleBadge=document.getElementById('sb-role-badge');
  if(roleBadge){
    roleBadge.textContent=isAdmin?'👑 Admin':'👤 Staff';
    roleBadge.style.background=isAdmin?'var(--amber-l)':'var(--primary-l)';
    roleBadge.style.color=isAdmin?'#92400E':'var(--primary-d)';
  }
  // Nav: staff see Home, POS, Credits, CRM; Admin = all
  var staffOnlyTabs=['reports','history'];
  var adminOnlyTabs=['stock'];
  // Actually: staff = Home + POS + Credits + CRM; Admin = all
  ['nav-stock','nav-reports','nav-history'].forEach(id=>{
    var el=document.getElementById(id);
    if(el)el.style.display=isAdmin?'flex':'none';
  });
  // CRM nav — available to everyone
  var navCRM=document.getElementById('nav-crm');
  if(navCRM)navCRM.style.display='flex';
  // Staff management — admin only
  var navStaff=document.getElementById('nav-staff');
  if(navStaff)navStaff.style.display=isAdmin?'flex':'none';
  // Sidebar admin-only items
  ['sb-settings-item','sb-backup-item','sb-report-item','sb-adminpin-item','sb-staffpin-item'].forEach(id=>{
    var el=document.getElementById(id);
    if(el)el.style.display=isAdmin?'flex':'none';
  });
  // Settings security rows
  var adminPinRow=document.getElementById('setting-change-admin-pin');
  var staffPinRow=document.getElementById('setting-change-staff-pin');
  if(adminPinRow)adminPinRow.style.display=isAdmin?'flex':'none';
  if(staffPinRow)staffPinRow.style.display=isAdmin?'flex':'none';
  // Staff: redirect away from restricted tabs
  if(!isAdmin){
    var current=document.querySelector('.screen.active');
    if(current){
      var id=current.id;
      if(id==='screen-stock'||id==='screen-reports'||id==='screen-history'||id==='screen-settings'){
        switchTab('home');
      }
    }
  }
  // Dashboard greeting shows role
  var greetSub=document.getElementById('greeting-sub');
  if(greetSub&&isAdmin){
    greetSub.textContent='Welcome back, Admin 👑';
  }
}

// ═════════════════════════════════════
//  TABS
// ═════════════════════════════════════
const allTabs=['home','sales','stock','reports','history','debts','settings','crm','staff'];
function switchTab(tab){
  // Role check: staff cannot access admin-only tabs (crm is accessible to all)
  if(currentRole==='staff'&&['stock','reports','history','settings','staff'].includes(tab)){
    toast('⛔ Admin access required');return;
  }
  allTabs.forEach(t=>{
    const s=document.getElementById('screen-'+t);if(s)s.classList.toggle('active',t===tab);
    const n=document.getElementById('nav-'+t);if(n)n.classList.toggle('active',t===tab);
  });
  if(tab==='home')renderDashboard();
  if(tab==='sales'){renderCats();renderSales();updateCartFab();}
  if(tab==='stock')renderInv();
  if(tab==='reports')renderReports();
  if(tab==='history')renderHistory();
  if(tab==='debts')renderDebts();
  if(tab==='crm'&&typeof renderCRM==='function')renderCRM();
  if(tab==='staff'&&typeof renderStaffList==='function')renderStaffList();
}

// ═════════════════════════════════════
//  DASHBOARD
// ═════════════════════════════════════
function renderDashboard(){
  const h=new Date().getHours();
  var greetTime=h<12?'Good morning':h<17?'Good afternoon':'Good evening';
  var greetEmoji=h<12?'☀️':h<17?'☀️':'🌙';
  // new greeting elements
  var _ey=document.getElementById('dash-eyebrow');
  if(_ey)_ey.textContent='● '+greetTime;
  var _gr=document.getElementById('greeting');if(_gr)_gr.textContent=greetTime+', '+shopName+'! '+greetEmoji;
  var _grs=document.getElementById('greeting-sub');if(_grs)_grs.textContent=h<12?'Ready to make sales today!':h<17?'Keep pushing, you got this!':'Great work today. Here is your summary.';
  // sales-time doubles as shop name in new layout
  var _st=document.getElementById('sales-time');
  if(_st)_st.textContent=shopName+' '+greetEmoji;
  var _dh=document.getElementById('dash-hint');
  if(_dh)_dh.textContent=h<12?'Ready to make some sales today?':h<17?'Keep pushing — you got this!':'Great work today. Here is your summary.';
  document.getElementById('header-date').textContent=nowDate();
  const td=filterSales('today');
  const yd=sales.filter(s=>getDateKey(s.ts)===yesterdayKey());
  const rev=td.reduce((s,x)=>s+x.total,0);
  const yRev=yd.reduce((s,x)=>s+x.total,0);
  const grossP=td.reduce((s,x)=>s+calcProfit(x),0);
  const yGrossP=yd.reduce((s,x)=>s+calcProfit(x),0);
  const todayExp=expenses.filter(e=>getDateKey(e.ts)===todayKey()).reduce((s,e)=>s+e.amount,0);
  const yExp=expenses.filter(e=>getDateKey(e.ts)===yesterdayKey()).reduce((s,e)=>s+e.amount,0);
  const netP=grossP-todayExp;
  const yNetP=yGrossP-yExp;
  const txns=td.length;
  const yTxns=yd.length;
  const avg=txns>0?Math.round(rev/txns):0;
  const low=products.filter(p=>p.stock>0&&p.stock<=p.lowAt).length;
  const out=products.filter(p=>p.stock===0).length;

  document.getElementById('d-sales').textContent=fmt(rev);
  document.getElementById('d-sales-change').textContent=txns>0?txns+' transaction'+(txns>1?'s':''):'No sales yet';
  var _dvs=document.getElementById('d-sales-vs');if(_dvs)_dvs.innerHTML=vsBadge(rev,yRev);
  var _dsb=document.getElementById('d-sales-badge');if(_dsb)_dsb.innerHTML=vsBadge(rev,yRev);
  document.getElementById('d-profit').textContent=fmt(netP);
  document.getElementById('d-margin').textContent=rev>0?Math.round(netP/rev*100)+'% margin':'—';
  var _dpv=document.getElementById('d-profit-vs');if(_dpv)_dpv.innerHTML=vsBadge(netP,yNetP);
  document.getElementById('d-txns').textContent=txns;
  document.getElementById('d-avg').textContent='Avg: '+fmt(avg);
  var _dtv=document.getElementById('d-txns-vs');if(_dtv)_dtv.innerHTML=vsBadge(txns,yTxns);
  document.getElementById('d-low').textContent=out;
  document.getElementById('d-low-sub').textContent=out===0?(low>0?low+' low stock':'✓ All good'):out+' need restock';

  const pct=Math.min(100,Math.round(rev/dailyGoal*100));
  var _gp=document.getElementById('goal-pct');if(_gp)_gp.textContent=pct+'%';
  // Drive new goal bar
  var _gb=document.getElementById('goal-bar');if(_gb)_gb.style.width=pct+'%';
  // Drive SVG ring (circumference = 2π×24 ≈ 150.8)
  var _ring=document.getElementById('goal-ring');
  if(_ring)_ring.style.strokeDashoffset=(150.8*(1-pct/100)).toFixed(1);
  document.getElementById('goal-sub').textContent=fmt(rev)+' of '+fmt(dailyGoal)+' · '+fmt(Math.max(0,dailyGoal-rev))+' to go';
  if(rev>=dailyGoal&&rev>0)fireConfetti();
  renderSparklines();
  var _gsv=document.getElementById('goal-setting-val');if(_gsv)_gsv.textContent=fmt(dailyGoal);
  var _snv=document.getElementById('shopname-setting-val');if(_snv)_snv.textContent=shopName;
  const _nd=document.getElementById('notif-dot');if(_nd)_nd.style.display=low+out>0?'block':'none';

  // Shift summary card
  if(shiftStartTime){
    var shiftMins=Math.round((Date.now()-shiftStartTime)/60000);
    var shiftSalesList=sales.slice(shiftSalesAtStart);
    var shiftRev=shiftSalesList.reduce((s,x)=>s+x.total,0);
    var shiftCount=shiftSalesList.length;
    var shiftEl=document.getElementById('shift-card');
    if(!shiftEl){
      var sc=document.createElement('div');sc.id='shift-card';
      sc.style.cssText='margin:0 14px 10px;background:linear-gradient(135deg,var(--acc),var(--acc2));border-radius:16px;padding:13px 15px;color:var(--acc-text);display:flex;justify-content:space-between;align-items:center';
      sc.innerHTML='<div><div style="font-size:9px;font-weight:700;opacity:.8;text-transform:uppercase;letter-spacing:.8px">Shift '+(currentRole==='admin'?'👑':'👤')+'</div><div style="font-size:20px;font-weight:800;margin-top:2px" id="shift-rev">'+fmt(shiftRev)+'</div><div style="font-size:10px;opacity:.8;margin-top:1px">'+shiftCount+' sales</div></div><div style="text-align:right"><div style="font-size:9px;font-weight:700;opacity:.8;text-transform:uppercase">Duration</div><div style="font-size:18px;font-weight:800;margin-top:2px">'+Math.floor(shiftMins/60)+'h '+(shiftMins%60)+'m</div><button onclick="lockApp()" style="margin-top:4px;background:rgba(0,0,0,.2);border:none;color:inherit;font-size:10px;font-weight:700;padding:3px 9px;border-radius:20px;cursor:pointer;font-family:inherit">🔒 End Shift</button></div>';
      var dashHero=document.querySelector('.dash-hero');
      if(dashHero)dashHero.parentNode.insertBefore(sc,dashHero.nextSibling);
    } else {
      var _sr=document.getElementById('shift-rev');if(_sr)_sr.textContent=fmt(shiftRev);
    }
  } else {
    var sc2=document.getElementById('shift-card');if(sc2)sc2.remove();
  }

  const unpaid=debts.filter(d=>d.status!=='paid');
  renderInsights(td,low,out,rev,yRev,unpaid);
  renderRecentList(td);
}
function renderInsights(td,low,out,rev,yRev,unpaid){
  const insights=[];
  if(out>0)insights.push({t:'red',i:'❌',msg:`${out} product${out>1?'s':''} out of stock!`});
  if(low>0)insights.push({t:'amber',i:'⚠️',msg:`${low} item${low>1?'s':''} running low on stock.`});
  // restock reminders
  const needRestock=products.filter(p=>p.stock<=p.lowAt&&p.supplier);
  needRestock.forEach(p=>insights.push({t:'orange',i:'🔔',msg:`Restock alert: ${p.name} (${p.stock} left) — Supplier: ${p.supplier}`}));
  // today vs yesterday
  if(yRev>0){
    var diff=rev-yRev;var pct=Math.round(Math.abs(diff)/yRev*100);
    if(diff>0)insights.push({t:'green',i:'📈',msg:'Sales up '+pct+'% vs yesterday! Great job.'});
    else if(diff<0)insights.push({t:'amber',i:'📉',msg:'Sales down '+pct+'% vs yesterday. Push harder!'});
  }
  if(unpaid&&unpaid.length>0){var total=unpaid.reduce((s,d)=>s+d.amount-d.paid,0);insights.push({t:'blue',i:'📒',msg:unpaid.length+' customer'+(unpaid.length>1?'s':'')+' owe '+fmt(total)+' in credit.'});}
  if(td.length===0)insights.push({t:'blue',i:'💡',msg:'No sales yet today. Start selling!'});
  else{
    const topMap={};td.forEach(s=>s.items.forEach(i=>{topMap[i.name]=(topMap[i.name]||0)+i.qty;}));
    const top=Object.entries(topMap).sort((a,b)=>b[1]-a[1])[0];
    if(top)insights.push({t:'green',i:'🔥',msg:`Top seller today: ${top[0]} (${top[1]} sold)`});
  }
  document.getElementById('insights-list').innerHTML=insights.length===0?
    '<div class="alert alert-green"><span class="alert-icon">✅</span><span>Everything looks great!</span></div>':
    insights.map(x=>`<div class="alert alert-${x.t}"><span class="alert-icon">${x.i}</span><span>${x.msg}</span></div>`).join('');
}
function renderRecentList(td){
  const recent=[...td].reverse().slice(0,3);
  if(!recent.length){document.getElementById('recent-list').innerHTML='<div style="text-align:center;padding:16px;color:var(--muted);font-size:12px">No transactions yet</div>';return;}
  document.getElementById('recent-list').innerHTML=recent.map(s=>`
    <div class="txn-item" style="margin-bottom:7px"><div class="txn-row">
      <div class="txn-icon">🧾</div>
      <div class="txn-info"><div class="txn-id">#${String(s.id).slice(-4)} · ${s.payment}</div><div class="txn-time">${new Date(s.ts).toLocaleTimeString('en-KE',{hour:'2-digit',minute:'2-digit'})}</div><div class="txn-preview">${s.items.map(i=>i.name+(i.preparation_type?' ('+i.preparation_type+')':'')).join(', ')}</div></div>
      <div class="txn-right"><div class="txn-total">${fmt(s.total)}</div><div class="txn-profit">+${fmt(calcProfit(s))}</div></div>
    </div></div>`).join('');
}

// ═════════════════════════════════════
//  SALES
// ═════════════════════════════════════
function getCats(){const raw=[...new Set(products.map(p=>p.cat))];return['All',...new Set(raw.map(c=>getDisplayCat(c)))];}
function renderCats(){
  document.getElementById('cat-scroll').innerHTML=getCats().map(c=>`<div class="cat-chip${c===activeCat?' active':''}" onclick="activeCat='${c}';renderCats();renderSales()">${c}</div>`).join('');
}
function renderSales(){
  const q=(document.getElementById('sales-q').value||'').toLowerCase();
  let list=products;
  if(activeCat!=='All')list=list.filter(p=>getDisplayCat(p.cat)===activeCat);
  if(q)list=list.filter(p=>p.name.toLowerCase().includes(q)||p.cat.toLowerCase().includes(q)||getDisplayCat(p.cat).toLowerCase().includes(q));
  const favs=products.filter(p=>p.fav);
  const favArea=document.getElementById('fav-area');
  if(favs.length&&!q){
    favArea.innerHTML=`<div class="fav-strip"><div class="fav-label">⭐ Favourites</div><div class="fav-row">${favs.map(p=>{const isPrepCat=PREP_CATS.has(getDisplayCat(p.cat));const click=isPrepCat?`openTypeModal(${p.id})`:`addToCart(${p.id})`;const minP=isPrepCat&&p.prices?Math.min(p.prices.fresh,p.prices.fried):p.price;return`<div class="fav-pill" onclick="${click}"><span>${p.name}</span><em>${fmt(minP)}</em></div>`;}).join('')}</div></div>`;
  }else favArea.innerHTML='';
  if(!list.length){document.getElementById('products-grid').innerHTML='<div style="grid-column:1/-1"><div class="empty-state"><div class="empty-icon">🔍</div><div class="empty-title">No products found</div></div></div>';return;}
  document.getElementById('products-grid').innerHTML=list.map(p=>{
    const dcat=getDisplayCat(p.cat);
    const isPrepCat=PREP_CATS.has(dcat);
    if(isPrepCat){
      // Single card; click opens fresh/fried selection modal
      const inCartQty=cart.filter(x=>x.id===p.id).reduce((s,x)=>s+x.qty,0);
      const sb=p.stock===0?'badge-red':p.stock<=p.lowAt?'badge-amber':'badge-green';
      const stxt=p.stock===0?'Out':p.stock<=p.lowAt?p.stock+' left':p.stock;
      const minPrice=p.prices?Math.min(p.prices.fresh,p.prices.fried):p.price;
      return`<div class="prod-card${p.stock===0?' disabled':''}${inCartQty?' in-cart':''}" data-id="${p.id}" onclick="${p.stock>0?`openTypeModal(${p.id})`:''}">
        <span class="prod-fav${p.fav?' on':''}" onclick="event.stopPropagation();toggleFav(${p.id})">${p.fav?'★':'☆'}</span>
        <div class="prod-stock-b"><span class="badge ${sb}">${stxt}</span></div>
        <div class="prod-emoji-wrap"></div>
        <div class="prod-name">${p.name}</div>
        <div class="prod-unit">${p.unit}</div>
        <div class="prod-bottom"><span class="prod-price">from ${fmt(minPrice)}</span>${p.stock>0?`<div class="prod-add">${inCartQty||'+'}</div>`:''}</div>
      </div>`;
    }else{
      const pt=getProdType(p);
      const isService=pt==='service';
      const isBulk=pt==='bulk';
      const inCart=cart.find(x=>x.cid===String(p.id));
      // Service products never show as out of stock
      const outOfStock=!isService&&p.stock<=0;
      const sb=outOfStock?'badge-red':(!isService&&p.stock<=p.lowAt)?'badge-amber':'badge-green';
      const stxt=isService?'Service':outOfStock?'Out':p.stock<=p.lowAt?p.stock+(isBulk?' '+p.bulkUnit:'')+' left':p.stock+(isBulk?' '+p.bulkUnit:'');
      const clickFn=isService?`addToCartService(${p.id})`:(isBulk?`openBulkQtyModal(${p.id})`:`addToCart(${p.id})`);
      const priceLabel=isBulk?`${fmt(p.pricePerUnit)}/${p.bulkUnit||'kg'}`:fmt(p.price);
      return`<div class="prod-card${outOfStock?' disabled':''}${inCart?' in-cart':''}" data-id="${p.id}" onclick="${outOfStock?'':clickFn}">
        <span class="prod-fav${p.fav?' on':''}" onclick="event.stopPropagation();toggleFav(${p.id})">${p.fav?'★':'☆'}</span>
        <div class="prod-stock-b"><span class="badge ${sb}">${stxt}</span></div>
        <div class="prod-emoji-wrap"></div>
        <div class="prod-name">${p.name}</div>
        <div class="prod-unit">${isBulk?('per '+p.bulkUnit):p.unit}</div>
        <div class="prod-bottom"><span class="prod-price">${priceLabel}</span>${!outOfStock?`<div class="prod-add">${inCart?inCart.qty:'+'}</div>`:''}</div>
      </div>`;
    }
  }).join('');
}
// ── TYPE SELECTION MODAL (Fresh vs Fried) — single product, shared stock ──
function openTypeModal(id){
  const p=products.find(x=>x.id===id);if(!p)return;
  const dcat=getDisplayCat(p.cat);
  document.getElementById('typemodal-title').textContent=p.name;
  const inStock=p.stock>0;
  const stockTxt=p.stock<=0?'Out of stock':p.stock+' in stock';
  const freshPrice=p.prices?p.prices.fresh:p.price;
  const friedPrice=p.prices?p.prices.fried:p.price;
  const freshEmoji=dcat==='Fish'?'🐟':'🐠';
  const freshLabel=dcat==='Fish'?'🐟 Fresh':'🐠 Fresh (Dried)';
  function optBtn(label,emoji,prepType,price){
    const dis=!inStock;
    return`<button class="type-opt-btn${dis?' type-opt-disabled':''}"${dis?' disabled':''} onclick="addToCartWithPrep(${id},'${prepType}');closeTypeModal();renderSales()">
      <span class="type-opt-emoji">${emoji}</span>
      <div class="type-opt-info">
        <div class="type-opt-name">${label}</div>
        <div class="type-opt-price">${fmt(price)}</div>
        <div class="type-opt-stock">${stockTxt}</div>
      </div>
      ${!dis?'<div class="type-opt-arrow">›</div>':''}
    </button>`;
  }
  let html='';
  html+=optBtn(freshLabel,freshEmoji,'fresh',freshPrice);
  html+=optBtn('🍳 Fried','🍳','fried',friedPrice);
  document.getElementById('typemodal-opts').innerHTML=html;
  document.getElementById('typemodal').classList.add('open');
  document.getElementById('typemodal-ov').classList.add('show');
}
function closeTypeModal(){
  document.getElementById('typemodal').classList.remove('open');
  document.getElementById('typemodal-ov').classList.remove('show');
}
function toggleFav(id){var p=products.find(x=>x.id===id);if(p){p.fav=!p.fav;saveData();renderSales();toast(p.fav?'⭐ Favourited':'Removed');}}

// ═════════════════════════════════════
//  CART
// ═════════════════════════════════════
function addToCart(id){
  const p=products.find(x=>x.id===id);if(!p)return;
  // Route by product type
  const pt=getProdType(p);
  if(pt==='service'){addToCartService(id);return;}
  if(pt==='bulk'){openBulkQtyModal(id);return;}
  if(pt==='standard'&&p.stock<=0){toast('⚠️ Out of stock');return;}
  // PREP_CATS always require preparation selection via modal
  if(PREP_CATS.has(getDisplayCat(p.cat))){openTypeModal(id);return;}
  const cid=String(id);
  const ex=cart.find(x=>x.cid===cid);
  if(ex){if(ex.qty>=p.stock){toast('⚠️ Max stock!');return;}ex.qty++;}
  else cart.push({cid,id,name:p.name,price:p.price,cost:p.cost||0,emoji:p.emoji,qty:1,preparation_type:null,cat:getDisplayCat(p.cat)});
  updateCartFab();renderSales();toast(`✅ Added!`);
}

// ── SERVICE: always qty=1, no stock deduction ──────────────────
function addToCartService(id){
  const p=products.find(x=>x.id===id);if(!p)return;
  const cid=String(id);
  const ex=cart.find(x=>x.cid===cid);
  if(ex){ex.qty++;}
  else cart.push({cid,id,name:p.name,price:p.price,cost:0,emoji:p.emoji,qty:1,cat:getDisplayCat(p.cat),prodType:'service'});
  updateCartFab();renderSales();toast(`✅ ${p.name} added!`);
}

// ── BULK: open a qty input modal before adding to cart ─────────
function openBulkQtyModal(id){
  const p=products.find(x=>x.id===id);if(!p)return;
  const unit=p.bulkUnit||'kg';
  const existing=cart.find(x=>x.cid===String(id));
  const curQty=existing?existing.qty:0;
  // Build a simple inline modal using the existing genModal system
  openGenModal(p.name,`
    <div style="text-align:center;margin-bottom:14px">
      <div style="font-size:12px;color:var(--muted);margin-bottom:4px">Price: ${fmt(p.pricePerUnit)} per ${unit}</div>
      <div style="font-size:12px;color:var(--muted)">In stock: ${p.stock} ${unit}</div>
    </div>
    <div class="form-group">
      <label class="field-label">Quantity (${unit})</label>
      <input class="field" id="bulk-qty-input" type="number" step="0.1" min="0.1"
        max="${p.stock}" placeholder="e.g. 2.5" value="${curQty||''}"
        style="font-size:22px;font-weight:800;text-align:center"/>
    </div>
    <div id="bulk-qty-preview" style="text-align:center;font-size:14px;font-weight:700;color:var(--primary);margin:10px 0 16px">
      Total: ${fmt(0)}
    </div>
    <div style="display:flex;gap:9px">
      <button class="btn btn-secondary" style="flex:1" onclick="closeGenModal()">Cancel</button>
      <button class="btn btn-primary" style="flex:2" onclick="confirmBulkAdd(${id})">Add to Cart</button>
    </div>`);
  // Live preview
  setTimeout(()=>{
    const inp=document.getElementById('bulk-qty-input');
    const prev=document.getElementById('bulk-qty-preview');
    if(inp&&prev){
      inp.focus();
      inp.addEventListener('input',()=>{
        const q=parseFloat(inp.value)||0;
        prev.textContent='Total: '+fmt(Math.round(q*p.pricePerUnit));
      });
      if(curQty) prev.textContent='Total: '+fmt(Math.round(curQty*p.pricePerUnit));
    }
  },50);
}
function confirmBulkAdd(id){
  const p=products.find(x=>x.id===id);if(!p)return;
  const inp=document.getElementById('bulk-qty-input');
  const qty=parseFloat(inp?inp.value:0);
  if(!qty||qty<=0){toast('⚠️ Enter a valid quantity');return;}
  if(qty>p.stock){toast(`⚠️ Only ${p.stock} ${p.bulkUnit||'kg'} in stock`);return;}
  const unit=p.bulkUnit||'kg';
  const price=Math.round(qty*p.pricePerUnit); // total price for this qty
  const cid=String(id);
  const ex=cart.find(x=>x.cid===cid);
  if(ex){ex.qty=qty;ex.price=price;}
  // BUG FIX: store unitCost separately so calcProfit can compute per-unit margin
  // without double-multiplying qty (i.cost here is already a total: qty × unit cost)
  else cart.push({cid,id,name:p.name,price,cost:Math.round(qty*(p.cost||0)),unitCost:p.cost||0,emoji:p.emoji,qty,prodType:'bulk',bulkUnit:unit,bulkQty:qty,cat:getDisplayCat(p.cat)});
  closeGenModal();updateCartFab();renderSales();toast(`✅ ${qty}${unit} ${p.name} added!`);
}
function addToCartWithPrep(id,prepType){
  // Looks up fresh product by id; uses prices[prepType] for the price
  // Stock is always deducted from the fresh (base) product
  const p=products.find(x=>x.id===id);if(!p||p.stock<=0)return;
  const price=(p.prices&&prepType)?p.prices[prepType]:p.price;
  const cid=id+'_'+prepType;
  const ex=cart.find(x=>x.cid===cid);
  if(ex){if(ex.qty>=p.stock){toast('⚠️ Max stock!');return;}ex.qty++;}
  else cart.push({cid,id,name:p.name,price,cost:p.cost||0,emoji:p.emoji,qty:1,preparation_type:prepType||null,cat:getDisplayCat(p.cat)});
  updateCartFab();renderSales();toast(`✅ ${prepType?prepType.charAt(0).toUpperCase()+prepType.slice(1)+' ':''} Added!`);
}
function removeFromCart(cid){cart=cart.filter(x=>x.cid!==cid);updateCartFab();renderSales();if(!cart.length)closeCart();}
function changeQty(cid,d){
  const item=cart.find(x=>x.cid===cid);if(!item)return;
  const prod=products.find(x=>x.id===item.id);
  item.qty+=d;
  if(item.qty<=0){removeFromCart(cid);return;}
  // Max qty is the shared fresh stock (regardless of prep type)
  const totalInCart=cart.filter(x=>x.id===item.id&&x.cid!==cid).reduce((s,x)=>s+x.qty,0);
  if(prod&&item.qty+totalInCart>prod.stock){item.qty=Math.max(1,prod.stock-totalInCart);toast('Max stock!');}
  renderCartSheet();updateCartFab();renderSales();
}
function clearCart(){cart=[];updateCartFab();renderSales();closeCart();}
function updateCartFab(){
  document.getElementById('cart-fab').style.display=cart.length?'flex':'none';
  document.getElementById('cart-badge').textContent=cartCount();
}
function openCart(){renderCartSheet();document.getElementById('cart-sheet').classList.add('open');document.getElementById('cart-ov').classList.add('show');}
function closeCart(){document.getElementById('cart-sheet').classList.remove('open');document.getElementById('cart-ov').classList.remove('show');}
function renderCartSheet(){
  document.getElementById('cs-items').innerHTML=cart.map(function(item){
    const prepBadge=item.preparation_type?`<span style="font-size:9px;font-weight:700;padding:1px 6px;border-radius:4px;margin-left:4px;background:${item.preparation_type==='fried'?'var(--amber-l,#fff3cd)':'#e6f4f1'};color:${item.preparation_type==='fried'?'#b45309':'#065f46'}">${item.preparation_type==='fried'?'🍳 Fried':'🌿 Fresh'}</span>`:'';
    const cid=item.cid||String(item.id);
    const safeId=cid.replace(/[^a-zA-Z0-9_-]/g,'_');
    // BUG FIX: bulk items store price as total (qty × pricePerUnit) so we must NOT
    // multiply by qty again. Also show "X per kg" instead of "total each".
    const isBulkItem=item.prodType==='bulk';
    const upriceLabel=isBulkItem
      ? fmt(item.price/item.qty)+' per '+(item.bulkUnit||'kg')
      : fmt(item.price)+' each';
    const rowTotal=isBulkItem?fmt(item.price):fmt(item.price*item.qty);
    return '<div class="ci-row-wrap" id="ci-wrap-'+safeId+'">'
      +'<div class="ci-row-delete-bg">🗑</div>'
      +'<div class="ci-row" id="ci-row-'+safeId+'">'
      +'<span class="ci-emoji"></span>'
      +'<div class="ci-info"><div class="ci-name">'+item.name+prepBadge+'</div><div class="ci-uprice">'+upriceLabel+'</div></div>'
      +'<div class="ci-qty">'
      +'<button class="cq-btn" onclick="changeQty(this.dataset.cid,-1)" data-cid="'+cid+'">−</button>'
      +'<span class="cq-n">'+item.qty+'</span>'
      +'<button class="cq-btn" onclick="changeQty(this.dataset.cid,1)" data-cid="'+cid+'">+</button>'
      +'</div>'
      +'<span class="ci-total">'+rowTotal+'</span>'
      +'<button class="ci-del" onclick="removeFromCart(this.dataset.cid)" data-cid="'+cid+'">×</button>'
      +'</div></div>';
  }).join('');
  // Attach swipe handlers after render
  cart.forEach(function(item){
    const cid=item.cid||String(item.id);
    attachSwipe(cid);
  });
  const total=cartTotal();
  document.getElementById('cs-totals').innerHTML=`
    <div class="cs-total-row"><span>${cartCount()} items</span><span>${fmt(total)}</span></div>
    <div class="cs-total-row grand"><span>Total</span><span>${fmt(total)}</span></div>`;
  document.getElementById('checkout-amount').textContent=fmt(total);
}

// ═════════════════════════════════════
//  CHANGE CALCULATOR
// ═════════════════════════════════════
function setupQuickAmounts(){
  const total=cartTotal();
  const rounds=[50,100,200,500,1000,2000].filter(a=>a>=total);
  const shown=rounds.slice(0,4);
  document.getElementById('quick-amounts').innerHTML=shown.map(a=>`<div class="qa-amount" onclick="document.getElementById('cash-tendered').value=${a};calcChange()">KSh ${a}</div>`).join('');
}
function calcChange(){
  const total=cartTotal();
  const tendered=parseFloat(document.getElementById('cash-tendered').value)||0;
  const changeEl=document.getElementById('change-due');
  if(tendered<=0){changeEl.textContent='—';changeEl.className='change-value';return;}
  const change=tendered-total;
  if(change>=0){changeEl.textContent=fmt(change);changeEl.className='change-value ok';}
  else{changeEl.textContent='Short '+fmt(Math.abs(change));changeEl.className='change-value short';}
}
function openCheckout(){
  if(!cart.length)return;
  document.getElementById('receipt-dt').textContent=new Date().toLocaleString('en-KE');
  document.getElementById('receipt-shop-name').innerHTML=shopName;
  const total=cartTotal();
  document.getElementById('receipt-items').innerHTML=`
    ${cart.map(i=>{const prepLabel=i.preparation_type?` (${i.preparation_type})`:``;const iB=i.prodType==='bulk';const qLabel=iB?`${i.qty}${i.bulkUnit||'kg'} x ${fmt(i.price/i.qty)}`:`${i.qty} x ${fmt(i.price)}`;const lineTotal=iB?fmt(i.price):fmt(i.price*i.qty);return`<div class="ri-line"><span>${i.name}${prepLabel}</span><span style="color:var(--muted);margin:0 10px;white-space:nowrap">${qLabel}</span><span style="font-weight:700;white-space:nowrap">${lineTotal}</span></div>`;}).join('')}
    <hr class="ri-divider"/>
    <div class="ri-grand"><span>TOTAL</span><span>${fmt(total)}</span></div>`;
  document.getElementById('cash-tendered').value='';
  document.getElementById('change-due').textContent='—';
  document.getElementById('change-due').className='change-value';
  setupQuickAmounts();
  // wire payment method change — HTML uses handlePayMethodChange
  var payEl=document.getElementById('pay-method');
  if(payEl){
    payEl.onchange=function(){
      if(typeof handlePayMethodChange==='function') handlePayMethodChange(this.value);
      else {
        document.getElementById('credit-customer-wrap').style.display=this.value==='Credit'?'block':'none';
      }
    };
  }
  closeCart();
  document.getElementById('receipt-modal').classList.add('open');
  document.getElementById('receipt-ov').classList.add('show');
}
function closeReceipt(){document.getElementById('receipt-modal').classList.remove('open');document.getElementById('receipt-ov').classList.remove('show');}
function confirmSale(){
  const total=cartTotal();
  const payment=document.getElementById('pay-method').value;
  const note=document.getElementById('cust-note').value;
  const items=cart.map(i=>({...i,preparation_type:i.preparation_type||null}));
  items.forEach(ci=>{
    var p=products.find(x=>x.id===ci.id);if(!p)return;
    // Services have no stock to deduct
    if(getProdType(p)==='service')return;
    // Bulk: qty is in units (kg/litres), deduct directly
    p.stock=Math.max(0,Math.round((p.stock-ci.qty)*100)/100);
  });
  var saleTs=Date.now();
  sales.push({id:saleTs,ts:saleTs,total,payment,note,items});
  // auto-add to credit book if paid by Credit
  var custName='';
  if(payment==='Credit'){
    custName=document.getElementById('credit-customer').value.trim()||'Unknown Customer';
    debts.push({id:nextDebtId++,name:custName,phone:'',amount:total,paid:0,items:items.map(i=>i.name+(i.preparation_type?' ('+i.preparation_type+')':'')+'×'+i.qty).join(', '),status:'pending',ts:Date.now(),due:''});
  }
  lastSaleTime=Date.now();
  cart=[];saveData();closeReceipt();updateCartFab();renderSales();playChaChingSound();toast('✅ Sale recorded!');
  const low=products.filter(p=>p.stock<=p.lowAt).length;
  const _nd2=document.getElementById('notif-dot');if(_nd2&&low>0)_nd2.style.display='block';
}
function shareReceiptWhatsApp(){
  if(!cart.length)return;
  const total=cartTotal();
  const dt=new Date().toLocaleString('en-KE');
  const lines=cart.map(i=>`  ${i.emoji} ${i.name}${i.preparation_type?' ('+i.preparation_type+')':''} ×${i.qty} — ${fmt(i.prodType==='bulk'?i.price:i.price*i.qty)}`).join('\n');
  const msg=`🧾 *${shopName} Receipt*\n📅 ${dt}\n\n${lines}\n\n*TOTAL: ${fmt(total)}*\n\nAsante sana! Thank you 🙏`;
  window.open('https://wa.me/?text='+encodeURIComponent(msg),'_blank');
}
function repeatLastSale(){if(!sales.length){toast('No previous sale!');return;}const last=sales[sales.length-1];last.items.forEach(i=>{var p=products.find(x=>x.id===i.id);if(p&&p.stock>0)addToCart(i.id);});toast('🔁 Last sale added!');switchTab('sales');}

// ═════════════════════════════════════
//  INVENTORY
// ═════════════════════════════════════
function renderInv(){
  const q=(document.getElementById('inv-q').value||'').toLowerCase();
  const low=products.filter(p=>p.stock>0&&p.stock<=p.lowAt);
  const out=products.filter(p=>p.stock===0);
  let alerts='';
  if(out.length)alerts+=`<div class="alert alert-red"><span class="alert-icon">❌</span><span>${out.length} out of stock: ${out.map(p=>p.name).join(', ')}</span></div>`;
  if(low.length)alerts+=`<div class="alert alert-amber"><span class="alert-icon">⚠️</span><span>${low.length} low: ${low.map(p=>p.name).join(', ')}</span></div>`;
  document.getElementById('inv-alerts').innerHTML=alerts;
  let list=products;
  if(q)list=list.filter(p=>p.name.toLowerCase().includes(q)||p.cat.toLowerCase().includes(q)||(p.supplier&&p.supplier.toLowerCase().includes(q)));
  const margin=p=>p.cost>0?Math.round((p.price-p.cost)/p.price*100):null;

  if(currentRole==='admin'){
    // ── ADMIN: grouped by category with full backend details ──
    const cats=[...new Set(list.map(p=>getDisplayCat(p.cat)))];
    document.getElementById('inv-list').innerHTML=cats.map(dcat=>{
      const catProds=list.filter(p=>getDisplayCat(p.cat)===dcat);
      const catStock=catProds.reduce((s,p)=>s+p.stock,0);
      const catVal=catProds.reduce((s,p)=>s+p.stock*p.cost,0);
      return`<div class="inv-category-group">
        <div class="inv-cat-header">
          <div>
            <span class="inv-cat-name">${dcat}</span>
            <span style="font-size:10px;color:var(--muted);margin-left:7px">${catProds.length} items · Stock: ${catStock} · Value: ${fmt(catVal)}</span>
          </div>
          <button class="btn btn-secondary" style="padding:4px 9px;font-size:10px;font-weight:700" onclick="openProductForm(null)">+ Add</button>
        </div>
        ${catProds.map(p=>{
          const isPrepCat=PREP_CATS.has(dcat);
          const m=isPrepCat?null:margin(p);
          const sc=p.stock===0?'out':p.stock<=p.lowAt?'low':'';
          const sb=p.stock===0?'badge-red':p.stock<=p.lowAt?'badge-amber':'badge-green';
          const restockChip=p.stock<=p.lowAt&&p.supplier?`<div class="restock-chip" onclick="toast('📲 Contact: ${p.supplier}')">🔔 Restock from ${p.supplier}</div>`:'';
          // Price display: show fresh/fried for PREP_CATS, single price otherwise
          const priceDisplay=isPrepCat&&p.prices
            ?`<div class="ii-price" style="font-size:11px">${fmt(p.prices.fresh)} / ${fmt(p.prices.fried)}</div>`
            :`<div class="ii-price">${fmt(p.price)}</div>`;
          return`<div class="inv-item ${sc}" data-id="${p.id}">
            <span class="ii-emoji"></span>
            <div class="ii-info">
              <div class="ii-name">${p.name}</div>
              <div class="ii-meta">${p.unit} · <span class="badge ${sb}">Stock: ${p.stock}</span>${!isPrepCat?' · Cost: '+fmt(p.cost):''}</div>
              ${p.supplier?`<div class="ii-supplier">🏪 ${p.supplier}</div>`:''}
              ${restockChip}
            </div>
            <div class="ii-right">
              ${priceDisplay}
              ${m!==null?`<div class="ii-margin">${m}% margin</div>`:''}
              <div class="ii-actions">
                <div class="ii-btn" title="Add Stock" onclick="openRestockModal(${p.id})" style="background:var(--primary-l);border-color:var(--primary);color:var(--primary-d);font-weight:800">+📦</div>
                <div class="ii-btn" onclick="openProductForm(${p.id})">✏️</div>
                <div class="ii-btn" id="del-btn-${p.id}" onclick="deleteProduct(${p.id})">🗑</div>
              </div>
            </div>
          </div>`;
        }).join('')}
      </div>`;
    }).join('')||'<div class="empty-state"><div class="empty-icon">📦</div><div class="empty-title">No products</div><div class="empty-sub">Tap + Add Item</div></div>';
  } else {
    // ── STAFF: clean point-of-sale card grid, no costs/margins ──
    document.getElementById('inv-list').innerHTML=list.length===0?
      '<div class="empty-state"><div class="empty-icon">📦</div><div class="empty-title">No products</div></div>':
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'+list.map(p=>{
        const sc=p.stock===0?'badge-red':p.stock<=p.lowAt?'badge-amber':'badge-green';
        const isPrepCat=PREP_CATS.has(getDisplayCat(p.cat));
        const clickAction=isPrepCat?`openTypeModal(${p.id});`:`addToCart(${p.id});switchTab('sales');`;
        const priceLabel=isPrepCat&&p.prices?`from ${fmt(Math.min(p.prices.fresh,p.prices.fried))}`:fmt(p.price);
        return`<div style="background:var(--surface);border-radius:14px;border:1px solid var(--border);padding:12px;box-shadow:var(--shadow);display:flex;flex-direction:column;align-items:center;gap:6px;cursor:pointer;text-align:center" onclick="${clickAction}">
          <div style="font-size:11px;font-weight:700;color:var(--text);line-height:1.3">${p.name}</div>
          <div style="font-size:13px;font-weight:800;color:var(--primary)">${priceLabel}</div>
          <span class="badge ${sc}" style="font-size:9px">Stock: ${p.stock}</span>
        </div>`;
      }).join('')+'</div>';
  }
}
function deleteProduct(id){
  const p=products.find(x=>x.id===id);if(!p)return;
  const btn=document.getElementById('del-btn-'+id);
  if(!btn)return;
  if(btn.dataset.confirm==='1'){
    products=products.filter(function(x){return x.id!==id;});
    cart=cart.filter(function(ci){return ci.id!==id;});  // remove all prep variants
    saveData();renderInv();
    toast('🗑 '+p.name+' deleted');
  } else {
    btn.dataset.confirm='1';
    btn.textContent='Sure?';
    btn.style.background='var(--red-l)';
    btn.style.borderColor='var(--red)';
    btn.style.color='var(--red)';
    btn.style.width='auto';
    btn.style.padding='0 8px';
    setTimeout(()=>{
      if(btn&&btn.dataset.confirm==='1'){
        btn.dataset.confirm='';
        btn.textContent='🗑';
        btn.style.background='';btn.style.borderColor='';btn.style.color='';btn.style.width='';btn.style.padding='';
      }
    },3000);
  }
}

// ── RESTOCK / ADD STOCK ──
let restockId=null;
function openRestockModal(id){
  restockId=id;
  const p=products.find(x=>x.id===id);if(!p)return;
  document.getElementById('restock-title').textContent='Add Stock — '+p.name;
  document.getElementById('restock-emoji').textContent=p.emoji;
  document.getElementById('restock-current').textContent=p.stock;
  document.getElementById('restock-after').textContent=p.stock;
  document.getElementById('restock-qty').value='';
  document.getElementById('restock-cost').value='';
  document.getElementById('restock-modal').classList.add('open');
  document.getElementById('restock-ov').classList.add('show');
  setTimeout(()=>document.getElementById('restock-qty').focus(),300);
}
function closeRestockModal(){
  document.getElementById('restock-modal').classList.remove('open');
  document.getElementById('restock-ov').classList.remove('show');
  restockId=null;
}
function previewRestock(){
  const p=products.find(x=>x.id===restockId);if(!p)return;
  const qty=parseInt(document.getElementById('restock-qty').value)||0;
  document.getElementById('restock-after').textContent=p.stock+qty;
}
function setRestockQty(n){
  document.getElementById('restock-qty').value=n;
  previewRestock();
}
function saveRestock(){
  const p=products.find(x=>x.id===restockId);if(!p)return;
  const qty=parseInt(document.getElementById('restock-qty').value)||0;
  if(qty<=0){toast('⚠️ Enter a valid quantity');return;}
  const cost=parseFloat(document.getElementById('restock-cost').value)||0;
  p.stock+=qty;
  // auto-log restock cost as expense if provided
  if(cost>0)expenses.push({id:Date.now(),ts:Date.now(),desc:`Restock: ${p.name} ×${qty}`,amount:cost,cat:'Stock'});
  closeRestockModal();saveData();renderInv();
  toast(`✅ +${qty} added to ${p.name} — Stock now: ${p.stock}`);
}
function openProductForm(id){
  editId=id;const p=id?products.find(x=>x.id===id):null;selEmoji=p?p.emoji:'';
  document.getElementById('pform-title').textContent=id?'Edit Product':'Add Product';
  ['name','cost','stock','unit','cat','low','supplier'].forEach(f=>{
    document.getElementById('pf-'+f).value=p?({name:p.name,cost:p.cost,stock:p.stock,unit:p.unit,cat:p.cat,low:p.lowAt,supplier:p.supplier}[f]||''):'';
  });
  // Product type
  const typeEl=document.getElementById('pf-prodtype');
  if(typeEl)typeEl.value=getProdType(p);
  // Bulk fields
  const bulkUnitEl=document.getElementById('pf-bulk-unit');
  const bulkPriceEl=document.getElementById('pf-bulk-price');
  if(bulkUnitEl)bulkUnitEl.value=p&&p.bulkUnit?p.bulkUnit:'kg';
  if(bulkPriceEl)bulkPriceEl.value=p&&p.pricePerUnit?p.pricePerUnit:'';
  // Single price field (non-PREP_CATS products)
  const singlePriceEl=document.getElementById('pf-price');
  if(singlePriceEl)singlePriceEl.value=p&&!PREP_CATS.has(getDisplayCat(p.cat))?p.price||'':'';
  // Dual price fields (PREP_CATS products)
  const freshEl=document.getElementById('pf-price-fresh');
  const friedEl=document.getElementById('pf-price-fried');
  if(freshEl)freshEl.value=p&&p.prices?p.prices.fresh||'':'';
  if(friedEl)friedEl.value=p&&p.prices?p.prices.fried||'':'';
  updatePrepFieldVisibility();
  updateProdTypeVisibility();
  renderEmojiPicker();
  document.getElementById('pform-modal').classList.add('open');document.getElementById('pform-ov').classList.add('show');
}
function updatePrepFieldVisibility(){
  const catVal=(document.getElementById('pf-cat').value||'').trim();
  const isPrepCat=PREP_CATS.has(catVal);
  const singleWrap=document.getElementById('pf-price-wrap');
  const dualWrap=document.getElementById('pf-price-dual-wrap');
  const prepWrap=document.getElementById('pf-prep-wrap');
  if(singleWrap)singleWrap.style.display=isPrepCat?'none':'block';
  if(dualWrap)dualWrap.style.display=isPrepCat?'block':'none';
  if(prepWrap)prepWrap.style.display='none'; // prep type no longer needed in form
}
function updateProdTypeVisibility(){
  const typeEl=document.getElementById('pf-prodtype');
  if(!typeEl)return;
  const pt=typeEl.value||'standard';
  const isBulk=pt==='bulk';
  const isService=pt==='service';
  // stock/unit row
  const stockRow=document.getElementById('pf-stock-row');
  if(stockRow)stockRow.style.display=isService?'none':'flex';
  // price row — hide for bulk (uses pricePerUnit instead)
  const priceWrap=document.getElementById('pf-price-wrap');
  if(priceWrap)priceWrap.style.display=(isBulk||PREP_CATS.has((document.getElementById('pf-cat').value||'').trim()))?'none':'block';
  // bulk-specific fields
  const bulkWrap=document.getElementById('pf-bulk-wrap');
  if(bulkWrap)bulkWrap.style.display=isBulk?'block':'none';
  // hint text
  const hint=document.getElementById('pf-type-hint');
  if(hint)hint.textContent=PRODUCT_TYPES[pt]?PRODUCT_TYPES[pt].hint:'';
}
function closeProductForm(){document.getElementById('pform-modal').classList.remove('open');document.getElementById('pform-ov').classList.remove('show');}
function renderEmojiPicker(){document.getElementById('emoji-picker').innerHTML=EMOJIS.map(e=>`<div class="ep-item${e===selEmoji?' sel':''}" onclick="selEmoji='${e}';renderEmojiPicker()">${e}</div>`).join('');}
function saveProduct(){
  const name=document.getElementById('pf-name').value.trim();
  const cost=parseFloat(document.getElementById('pf-cost').value)||0;
  const cat=document.getElementById('pf-cat').value.trim()||'General';
  const lowAt=parseInt(document.getElementById('pf-low').value)||5;
  const supplier=document.getElementById('pf-supplier').value.trim();
  const prodType=(document.getElementById('pf-prodtype')?document.getElementById('pf-prodtype').value:'') || 'standard';
  if(!name){toast('⚠️ Name required');return;}

  // ── SERVICE ───────────────────────────────────────────────────
  if(prodType==='service'){
    const price=parseFloat(document.getElementById('pf-price').value)||0;
    if(!price){toast('⚠️ Price required');return;}
    const base={name,price,cost:0,stock:0,unit:'service',cat,lowAt,supplier,emoji:selEmoji,fav:false,prodType:'service'};
    if(editId)Object.assign(products.find(x=>x.id===editId),base);
    else products.push({id:nextId++,...base});
    closeProductForm();saveData();renderInv();toast(editId?'✅ Updated':'✅ Added');
    return;
  }

  // ── BULK ──────────────────────────────────────────────────────
  if(prodType==='bulk'){
    const pricePerUnit=parseFloat(document.getElementById('pf-bulk-price')?document.getElementById('pf-bulk-price').value:0)||0;
    const bulkUnit=(document.getElementById('pf-bulk-unit')?document.getElementById('pf-bulk-unit').value:'')||'kg';
    const stock=parseFloat(document.getElementById('pf-stock').value)||0;
    const unit=document.getElementById('pf-unit').value.trim()||bulkUnit;
    if(!pricePerUnit){toast('⚠️ Price per unit required');return;}
    const base={name,pricePerUnit,price:pricePerUnit,cost,stock,unit,bulkUnit,cat,lowAt,supplier,emoji:selEmoji,fav:false,prodType:'bulk'};
    if(editId)Object.assign(products.find(x=>x.id===editId),base);
    else products.push({id:nextId++,...base});
    closeProductForm();saveData();renderInv();toast(editId?'✅ Updated':'✅ Added');
    return;
  }

  // ── STANDARD (default) ────────────────────────────────────────
  const stock=parseInt(document.getElementById('pf-stock').value)||0;
  const unit=document.getElementById('pf-unit').value.trim()||'unit';
  if(PREP_CATS.has(cat)){
    const freshPrice=parseFloat(document.getElementById('pf-price-fresh').value)||0;
    const friedPrice=parseFloat(document.getElementById('pf-price-fried').value)||0;
    if(!freshPrice||!friedPrice){toast('⚠️ Enter both Fresh and Fried prices');return;}
    const prices={fresh:freshPrice,fried:friedPrice};
    const base={name,prices,price:freshPrice,cost,stock,unit,cat,lowAt,supplier,emoji:selEmoji,prodType:'standard'};
    if(editId){Object.assign(products.find(x=>x.id===editId),base);}
    else{products.push({id:nextId++,...base,fav:false});}
  }else{
    const price=parseFloat(document.getElementById('pf-price').value)||0;
    if(!price){toast('⚠️ Price required');return;}
    const base={name,price,cost,stock,unit,cat,lowAt,supplier,emoji:selEmoji,prodType:'standard'};
    if(editId)Object.assign(products.find(x=>x.id===editId),base);
    else products.push({id:nextId++,...base,fav:false});
  }
  closeProductForm();saveData();renderInv();toast(editId?'✅ Updated':'✅ Added');
}

// ═════════════════════════════════════
//  EXPENSES
// ═════════════════════════════════════
function openExpenseModal(){document.getElementById('ef-desc').value='';document.getElementById('ef-amount').value='';document.getElementById('exp-modal').classList.add('open');document.getElementById('exp-ov').classList.add('show');}
function closeExpenseModal(){document.getElementById('exp-modal').classList.remove('open');document.getElementById('exp-ov').classList.remove('show');}
function saveExpense(){
  const desc=document.getElementById('ef-desc').value.trim();
  const amount=parseFloat(document.getElementById('ef-amount').value)||0;
  const cat=document.getElementById('ef-cat').value;
  if(!desc){toast('⚠️ Description required');return;}
  if(amount<=0){toast('⚠️ Enter valid amount');return;}
  expenses.push({id:Date.now(),ts:Date.now(),desc,amount,cat});
  closeExpenseModal();saveData();renderDashboard();toast('💸 Expense added');
}

// ═════════════════════════════════════
//  DEBT / CREDIT
// ═════════════════════════════════════
function openDebtModal(id){
  debtEditId=id;const d=id?debts.find(x=>x.id===id):null;
  document.getElementById('debt-modal-title').textContent=id?'Edit Credit':'Add Credit Sale';
  document.getElementById('df-name').value=d?d.name:'';
  document.getElementById('df-phone').value=d?d.phone:'';
  document.getElementById('df-amount').value=d?d.amount:'';
  document.getElementById('df-paid').value=d?d.paid:'';
  document.getElementById('df-paymethod').value=d&&d.payMethod?d.payMethod:'';
  document.getElementById('df-items').value=d?d.items:'';
  document.getElementById('df-due').value=d?d.due:'';
  document.getElementById('debt-modal').classList.add('open');document.getElementById('debt-ov').classList.add('show');
}
function closeDebtModal(){document.getElementById('debt-modal').classList.remove('open');document.getElementById('debt-ov').classList.remove('show');}
function saveDebt(){
  const name=document.getElementById('df-name').value.trim();
  const phone=document.getElementById('df-phone').value.trim();
  const amount=parseFloat(document.getElementById('df-amount').value)||0;
  const paid=parseFloat(document.getElementById('df-paid').value)||0;
  const payMethod=document.getElementById('df-paymethod').value||'';
  const items=document.getElementById('df-items').value.trim();
  const due=document.getElementById('df-due').value;
  if(!name){toast('⚠️ Customer name required');return;}
  if(amount<=0){toast('⚠️ Enter valid amount');return;}
  const status=paid>=amount?'paid':paid>0?'partial':'pending';
  if(debtEditId){Object.assign(debts.find(x=>x.id===debtEditId),{name,phone,amount,paid,payMethod,items,due,status});}
  else debts.push({id:nextDebtId++,name,phone,amount,paid,payMethod,items,status,ts:Date.now(),due});
  closeDebtModal();saveData();renderDebts();toast(debtEditId?'✅ Updated':'✅ Credit recorded');
}
function markDebtPaid(id){
  const d=debts.find(x=>x.id===id);if(!d)return;
  openGenModal('Mark as Paid — '+d.name,`
    <div style="font-size:13px;color:var(--muted);margin-bottom:14px">How did <strong>${d.name}</strong> pay?</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
      <button class="btn btn-secondary" style="font-size:13px;padding:14px;flex-direction:column;gap:4px;display:flex;align-items:center;justify-content:center" onclick="confirmDebtPaid(${id},'Cash')">💵<br><span style='font-size:11px;font-weight:700'>Cash</span></button>
      <button class="btn btn-secondary" style="font-size:13px;padding:14px;flex-direction:column;gap:4px;display:flex;align-items:center;justify-content:center" onclick="confirmDebtPaid(${id},'M-Pesa')">📱<br><span style='font-size:11px;font-weight:700'>M-Pesa</span></button>
      <button class="btn btn-secondary" style="font-size:13px;padding:14px;flex-direction:column;gap:4px;display:flex;align-items:center;justify-content:center" onclick="confirmDebtPaid(${id},'Card')">💳<br><span style='font-size:11px;font-weight:700'>Card</span></button>
      <button class="btn btn-secondary" style="font-size:13px;padding:14px;flex-direction:column;gap:4px;display:flex;align-items:center;justify-content:center" onclick="confirmDebtPaid(${id},'Other')">🤝<br><span style='font-size:11px;font-weight:700'>Other</span></button>
    </div>
    <button class="btn btn-secondary btn-full" onclick="closeGenModal()">Cancel</button>`);
}
function confirmDebtPaid(id,method){
  const d=debts.find(x=>x.id===id);if(!d)return;
  d.paid=d.amount;d.status='paid';d.payMethod=method;d.paidAt=Date.now();
  saveData();closeGenModal();renderDebts();
  toast('✅ Paid via '+method+' — '+d.name);
}
function deleteDebt(id){showConfirm('Delete this credit record?','This cannot be undone.',function(){debts=debts.filter(function(d){return d.id!==id;});saveData();renderDebts();toast('🗑 Record deleted');});}

// WhatsApp debt reminder
function remindDebtWhatsApp(id){
  const d=debts.find(x=>x.id===id);if(!d)return;
  const msg='Hello '+d.name+', this is a friendly reminder from '+shopName+'. You have an outstanding balance of '+fmt(d.amount-d.paid)+(d.due?' due '+new Date(d.due).toLocaleDateString('en-KE',{day:'numeric',month:'short'}):'')+'. '+(d.items?'Items: '+d.items+'. ':'')+'Kindly settle at your earliest convenience. Thank you 🙏';
  const phone=d.phone.replace(/\s+/g,'').replace(/^0/,'254');
  window.open('https://wa.me/'+phone+'?text='+encodeURIComponent(msg),'_blank');
}

function renderDebts(){
  const q=(document.getElementById('debt-q').value||'').toLowerCase();
  const pending=debts.filter(d=>d.status==='pending');
  const partial=debts.filter(d=>d.status==='partial');
  const paid=debts.filter(d=>d.status==='paid');
  const totalOwed=debts.filter(d=>d.status!=='paid').reduce((s,d)=>s+(d.amount-d.paid),0);
  const totalPaid=debts.reduce((s,d)=>s+d.paid,0);
  document.getElementById('debt-summary-wrap').innerHTML=`
    <div class="debt-summary">
      <div class="ds-card"><div class="ds-val" style="color:var(--red)">${fmt(totalOwed)}</div><div class="ds-lbl">Owed</div></div>
      <div class="ds-card"><div class="ds-val" style="color:var(--amber)">${pending.length+partial.length}</div><div class="ds-lbl">Pending</div></div>
      <div class="ds-card"><div class="ds-val" style="color:var(--primary)">${fmt(totalPaid)}</div><div class="ds-lbl">Collected</div></div>
    </div>`;
  let list=debts;
  if(q)list=list.filter(d=>d.name.toLowerCase().includes(q)||(d.items&&d.items.toLowerCase().includes(q)));
  list=[...list].sort((a,b)=>b.ts-a.ts);
  if(!list.length){document.getElementById('debt-list').innerHTML='<div class="empty-state"><div class="empty-icon">📒</div><div class="empty-title">No credit records</div><div class="empty-sub">Add customers who bought on credit</div></div>';return;}
  const statusLabel={pending:'Unpaid',partial:'Partial',paid:'Paid'};
  const statusBadge={pending:'badge-red',partial:'badge-amber',paid:'badge-green'};
  const overdue=d=>d.due&&new Date(d.due)<new Date()&&d.status!=='paid';
  const payIcon={'Cash':'💵','M-Pesa':'📱','Card':'💳','Other':'🤝'};
  document.getElementById('debt-list').innerHTML=list.map(d=>`
    <div class="debt-item ${d.status}">
      <div class="di-avatar">${d.name.charAt(0).toUpperCase()}</div>
      <div class="di-info">
        <div class="di-name">${d.name} ${overdue(d)?'<span class="badge badge-red" style="font-size:9px">OVERDUE</span>':''}</div>
        <div class="di-meta">
          <span class="badge ${statusBadge[d.status]}">${statusLabel[d.status]}</span>
          ${d.status==='paid'&&d.payMethod?` <span class="badge badge-green" style="font-size:9px">${payIcon[d.payMethod]||'✅'} ${d.payMethod}</span>`:''}
          ${d.phone?` · 📞 ${d.phone}`:''}
          ${d.due?` · Due: ${new Date(d.due).toLocaleDateString('en-KE',{day:'numeric',month:'short'})}`:''}
        </div>
        ${d.items?`<div class="di-items">${d.items}</div>`:''}
        ${d.paidAt&&d.status==='paid'?`<div style="font-size:10px;color:var(--primary);margin-top:3px">✅ Settled ${new Date(d.paidAt).toLocaleDateString('en-KE',{day:'numeric',month:'short'})}</div>`:''}
        <div class="di-actions">
          ${d.status!=='paid'?`<button class="btn btn-primary" style="padding:5px 10px;font-size:10px" onclick="markDebtPaid(${d.id})">💵 Mark Paid</button>`:''}
          ${d.phone&&d.status!=='paid'?`<button class="btn btn-secondary" style="padding:5px 10px;font-size:10px;color:var(--primary);border-color:var(--primary)" onclick="remindDebtWhatsApp(${d.id})">📲 Remind</button>`:''}
          <button class="btn btn-secondary" style="padding:5px 10px;font-size:10px" onclick="openDebtModal(${d.id})">✏️</button>
          <button class="btn btn-danger" style="padding:5px 10px;font-size:10px" onclick="deleteDebt(${d.id})">🗑</button>
        </div>
      </div>
      <div class="di-right">
        <div class="di-amount ${d.status==='paid'?'paid':''}">${fmt(d.amount-d.paid)}</div>
        ${d.paid>0&&d.status!=='paid'?`<div style="font-size:10px;color:var(--muted)">Paid: ${fmt(d.paid)}</div>`:''}
        <div style="font-size:10px;color:var(--muted);margin-top:2px">Total: ${fmt(d.amount)}</div>
      </div>
    </div>`).join('');
}

// ═════════════════════════════════════
//  REPORTS
// ═════════════════════════════════════
function setRptPeriod(p){
  rptFilter=p;
  ['today','week','month','all'].forEach(t=>document.getElementById('rtab-'+t).classList.toggle('active',t===p));
  renderReports();
}
function renderReports(){
  const list=filterSales(rptFilter);
  const rev=list.reduce((s,x)=>s+x.total,0);
  const grossP=list.reduce((s,x)=>s+calcProfit(x),0);
  const now=new Date();
  const expList=expenses.filter(e=>{
    if(rptFilter==='today')return getDateKey(e.ts)===todayKey();
    if(rptFilter==='week'){var w=new Date(now);w.setDate(w.getDate()-7);return new Date(e.ts)>=w;}
    if(rptFilter==='month'){var d=new Date(e.ts);return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();}
    return true;
  });
  const totalExp=expList.reduce((s,e)=>s+e.amount,0);
  const netP=grossP-totalExp;
  const txns=list.length;const avg=txns>0?Math.round(rev/txns):0;
  // Yesterday comparison (only for today filter)
  const yd=sales.filter(s=>getDateKey(s.ts)===yesterdayKey());
  const yRev=yd.reduce((s,x)=>s+x.total,0);
  const yProfit=yd.reduce((s,x)=>s+calcProfit(x),0);
  const yTxns=yd.length;
  const yExp=expenses.filter(e=>getDateKey(e.ts)===yesterdayKey()).reduce((s,e)=>s+e.amount,0);
  const yNet=yProfit-yExp;
  // Top products
  const prodMap={};
  list.forEach(s=>s.items.forEach(i=>{
    if(!prodMap[i.id])prodMap[i.id]={name:i.name,emoji:i.emoji,qty:0,rev:0};
    prodMap[i.id].qty+=i.qty;prodMap[i.id].rev+=(i.prodType==='bulk'?i.price:i.price*i.qty);
  }));
  const topProds=Object.values(prodMap).sort((a,b)=>b.rev-a.rev).slice(0,5);
  const maxRev=topProds[0]?topProds[0].rev:1;
  // 7-day trend
  const days=[];
  for(let i=6;i>=0;i--){var d=new Date();d.setDate(d.getDate()-i);const key=getDateKey(d.getTime());const dayRev=sales.filter(s=>getDateKey(s.ts)===key).reduce((s,x)=>s+x.total,0);days.push({label:d.toLocaleDateString('en-KE',{weekday:'narrow'}),rev:dayRev});}
  const maxDay=Math.max(...days.map(d=>d.rev))||1;
  // Payment breakdown
  const payMap={};list.forEach(s=>{payMap[s.payment]=(payMap[s.payment]||0)+s.total;});

  document.getElementById('reports-body').innerHTML=`
    <div class="net-profit-banner">
      <div class="npb-label">Net Profit</div>
      <div class="npb-value">${fmt(netP)}</div>
      <div class="npb-sub">Revenue ${fmt(rev)} · Expenses ${fmt(totalExp)}</div>
    </div>

    ${rptFilter==='today'&&(yRev>0||yTxns>0)?`
    <div class="vs-card">
      <div class="vs-title">📊 Today vs Yesterday</div>
      <div class="vs-row"><span class="vs-metric">Revenue</span><div class="vs-vals"><span class="vs-today">${fmt(rev)}</span><span class="vs-yest">↑ ${fmt(yRev)}</span><span class="vs-change ${rev>=yRev?'up':'down'}">${yRev>0?Math.round(Math.abs(rev-yRev)/yRev*100)+'%':'—'} ${rev>=yRev?'▲':'▼'}</span></div></div>
      <div class="vs-row"><span class="vs-metric">Net Profit</span><div class="vs-vals"><span class="vs-today">${fmt(netP)}</span><span class="vs-yest">↑ ${fmt(yNet)}</span><span class="vs-change ${netP>=yNet?'up':'down'}">${yNet>0?Math.round(Math.abs(netP-yNet)/Math.abs(yNet)*100)+'%':'—'} ${netP>=yNet?'▲':'▼'}</span></div></div>
      <div class="vs-row"><span class="vs-metric">Transactions</span><div class="vs-vals"><span class="vs-today">${txns}</span><span class="vs-yest">↑ ${yTxns}</span><span class="vs-change ${txns>=yTxns?'up':'down'}">${yTxns>0?Math.round(Math.abs(txns-yTxns)/yTxns*100)+'%':'—'} ${txns>=yTxns?'▲':'▼'}</span></div></div>
    </div>`:''}

    <div class="kpi-row">
      <div class="kpi-card"><div class="kpi-val" style="color:var(--primary)">${fmtS(rev)}</div><div class="kpi-lbl">Revenue</div></div>
      <div class="kpi-card"><div class="kpi-val" style="color:var(--amber)">${fmtS(grossP)}</div><div class="kpi-lbl">Gross Profit</div></div>
      <div class="kpi-card"><div class="kpi-val">${txns}</div><div class="kpi-lbl">Sales</div></div>
      <div class="kpi-card"><div class="kpi-val">${fmt(avg)}</div><div class="kpi-lbl">Avg Sale</div></div>
      <div class="kpi-card"><div class="kpi-val" style="color:var(--red)">${fmtS(totalExp)}</div><div class="kpi-lbl">Expenses</div></div>
      <div class="kpi-card"><div class="kpi-val" style="color:var(--primary)">${rev>0?Math.round(netP/rev*100):0}%</div><div class="kpi-lbl">Net Margin</div></div>
    </div>

    <div class="chart-card">
      <div class="chart-title">Sales Trend (7 days)</div>
      <div class="bar-chart">
        ${days.map(d=>`<div class="bar-col"><span class="bar-val">${d.rev>0?fmtS(d.rev):''}</span><div class="bar-fill" style="height:${Math.round((d.rev/maxDay)*100)}%"></div><span class="bar-label">${d.label}</span></div>`).join('')}
      </div>
    </div>

    <div class="chart-card">
      <div class="chart-title">Top Products</div>
      ${topProds.length===0?'<div style="text-align:center;color:var(--muted);font-size:12px;padding:16px">No sales yet</div>':
        `<div class="top-prod-list">${topProds.map((p,i)=>`<div class="tp-item"><span class="tp-rank">#${i+1}</span><span class="tp-name">${p.name}</span><div class="tp-bar-wrap"><div class="tp-bar" style="width:${Math.round(p.rev/maxRev*100)}%"></div></div><div><div class="tp-rev">${fmt(p.rev)}</div><div class="tp-qty">${p.qty} sold</div></div></div>`).join('')}</div>`}
    </div>

    ${Object.keys(payMap).length?`<div class="chart-card"><div class="chart-title">Payment Methods</div>${Object.entries(payMap).map(([k,v])=>`<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--border);font-size:13px;color:var(--text)"><span style="font-weight:600">${k}</span><div style="text-align:right"><div style="font-weight:800">${fmt(v)}</div><div style="font-size:10px;color:var(--muted)">${Math.round(v/rev*100)}%</div></div></div>`).join('')}</div>`:''}

    <div class="chart-card">
      <div class="chart-title" style="display:flex;justify-content:space-between;align-items:center">Expenses <button onclick="openExpenseModal()" style="font-size:11px;font-weight:700;color:var(--primary);background:none;border:none;cursor:pointer;font-family:'Outfit',sans-serif">+ Add</button></div>
      ${expList.length===0?'<div style="text-align:center;color:var(--muted);font-size:12px;padding:14px">No expenses</div>':
        expList.map(e=>`<div style="display:flex;align-items:center;gap:9px;padding:9px 0;border-bottom:1px solid var(--border)"><div class="exp-icon-wrap">${EXP_ICONS[e.cat]||'💸'}</div><div style="flex:1"><div style="font-size:12px;font-weight:700;color:var(--text)">${e.desc}</div><div style="font-size:10px;color:var(--muted)">${e.cat} · ${new Date(e.ts).toLocaleDateString('en-KE',{day:'numeric',month:'short'})}</div></div><div><div class="exp-amount">${fmt(e.amount)}</div><button onclick="expenses=expenses.filter(x=>x.id!==${e.id});saveData();renderReports();toast('Deleted');" style="font-size:10px;color:var(--red);background:none;border:none;cursor:pointer;font-family:'Outfit',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:block;margin-top:2px">Remove</button></div></div>`).join('')}
    </div>`;
}

// ═════════════════════════════════════
//  HISTORY
// ═════════════════════════════════════
function setHistFilter(f){
  histFilter=f;
  ['today','week','month'].forEach(t=>{var el=document.getElementById('htab-'+t);if(el)el.classList.toggle('active',t===f);});
  renderHistory();
}
function renderHistory(){
  var q=(document.getElementById('hist-q').value||'').toLowerCase();
  var list;
  if(histDateFilter){
    list=sales.filter(function(s){
      var d=new Date(s.ts);
      var iso=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
      return iso===histDateFilter;
    });
  } else {
    list=filterSales(histFilter);
  }
  if(q)list=list.filter(function(s){return s.items.some(function(i){return i.name.toLowerCase().includes(q);})||String(s.id).includes(q)||(s.note&&s.note.toLowerCase().includes(q));});
  list=list.slice().reverse();
  const rev=list.reduce((s,x)=>s+x.total,0);const profit=list.reduce((s,x)=>s+calcProfit(x),0);
  document.getElementById('hist-summary').innerHTML=`
    <div class="kpi-card"><div class="kpi-val" style="color:var(--primary);font-size:14px">${fmtS(rev)}</div><div class="kpi-lbl">Revenue</div></div>
    <div class="kpi-card"><div class="kpi-val" style="color:var(--amber);font-size:14px">${fmtS(profit)}</div><div class="kpi-lbl">Profit</div></div>
    <div class="kpi-card"><div class="kpi-val" style="font-size:14px">${list.length}</div><div class="kpi-lbl">Sales</div></div>`;
  if(!list.length){document.getElementById('hist-list').innerHTML='<div class="empty-state"><div class="empty-icon">🧾</div><div class="empty-title">No transactions</div><div class="empty-sub">Complete a sale to see it here</div></div>';return;}
  document.getElementById('hist-list').innerHTML=list.map(s=>`
    <div class="txn-item"><div class="txn-row" onclick="toggleTxn(${s.id})">
      <div class="txn-icon">🧾</div>
      <div class="txn-info">
        <div class="txn-id">#${String(s.id).slice(-4)} · ${s.payment}</div>
        <div class="txn-time">${new Date(s.ts).toLocaleDateString('en-KE',{day:'numeric',month:'short'})} ${new Date(s.ts).toLocaleTimeString('en-KE',{hour:'2-digit',minute:'2-digit'})}</div>
        <div class="txn-preview">${s.items.map(i=>i.name+(i.preparation_type?' ('+i.preparation_type+')':'')).join(', ')}</div>
      </div>
      <div class="txn-right"><div class="txn-total">${fmt(s.total)}</div><div class="txn-profit">+${fmt(calcProfit(s))}</div></div>
      <span class="txn-chevron" id="txc-${s.id}">▼</span>
    </div>
    <div class="txn-detail" id="txd-${s.id}">
      ${s.items.map(i=>`<div class="txd-row"><span>${i.name}${i.preparation_type?' <em style="font-size:10px;opacity:.7">('+i.preparation_type+')</em>':''} ×${i.qty}</span><span>${fmt(i.prodType==='bulk'?i.price:i.price*i.qty)}</span></div>`).join('')}
      <div class="txd-row b"><span>Total</span><span>${fmt(s.total)}</span></div>
      <div class="txd-row b"><span>Profit</span><span style="color:var(--primary)">${fmt(calcProfit(s))}</span></div>
      ${s.note?`<div class="txd-row"><span>Note</span><span>${s.note}</span></div>`:''}
    </div></div>`).join('');
}
function toggleTxn(id){document.getElementById('txd-'+id).classList.toggle('open');document.getElementById('txc-'+id).classList.toggle('open');}

// ═════════════════════════════════════
//  SETTINGS MODALS
// ═════════════════════════════════════
function openGenModal(title,body){document.getElementById('gen-title').textContent=title;document.getElementById('gen-body').innerHTML=body;document.getElementById('gen-modal').classList.add('open');document.getElementById('gen-ov').classList.add('show');}
function closeGenModal(){document.getElementById('gen-modal').classList.remove('open');document.getElementById('gen-ov').classList.remove('show');}
function openGoalModal(){openGenModal('Daily Sales Goal',`<div class="form-group"><label class="field-label">Goal Amount (KSh)</label><input class="field" id="goal-input" type="number" value="${dailyGoal}"/></div><div style="display:flex;gap:9px"><button class="btn btn-secondary" style="flex:1" onclick="closeGenModal()">Cancel</button><button class="btn btn-primary" style="flex:2" onclick="dailyGoal=parseInt(document.getElementById('goal-input').value)||2000;saveData();closeGenModal();renderDashboard();toast('✅ Goal updated');">Save</button></div>`);}
function openShopNameModal(){openGenModal('Shop Name',`<div class="form-group"><label class="field-label">Shop Name</label><input class="field" id="shopname-input" type="text" value="${shopName}" maxlength="20"/></div><div style="display:flex;gap:9px"><button class="btn btn-secondary" style="flex:1" onclick="closeGenModal()">Cancel</button><button class="btn btn-primary" style="flex:2" onclick="shopName=document.getElementById('shopname-input').value.trim()||'POSH';saveData();closeGenModal();renderDashboard();toast('✅ Shop name updated');">Save</button></div>`);}

// ═════════════════════════════════════
//  BACKUP / EXPORT
// ═════════════════════════════════════
function backupData(){
  const data=JSON.stringify({products,sales,expenses,debts,dailyGoal,shopName,v:3},null,2);
  const blob=new Blob([data],{type:'application/json'});
  const url=URL.createObjectURL(blob);const a=document.createElement('a');
  a.href=url;a.download=`posh-backup-${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a);a.click();document.body.removeChild(a);toast('💾 Backup downloaded!');
}
function restoreData(event){
  const file=event.target.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=e=>{
    try{
      const data=JSON.parse(e.target.result);
      if(data.products)products=data.products;if(data.sales)sales=data.sales;
      if(data.expenses)expenses=data.expenses;if(data.debts)debts=data.debts;
      if(data.dailyGoal)dailyGoal=data.dailyGoal;if(data.shopName)shopName=data.shopName;
      renderDashboard();saveData();toast('✅ Data restored!');
    }catch{toast('❌ Invalid backup file');}
  };reader.readAsText(file);
}
function exportCSV(){
  if(!sales.length){toast('No sales to export');return;}
  const rows=[['ID','Date','Time','Items','Total','Payment','Profit','Note']];
  sales.forEach(s=>{var d=new Date(s.ts);rows.push(['#'+String(s.id).slice(-4),d.toLocaleDateString('en-KE'),d.toLocaleTimeString('en-KE',{hour:'2-digit',minute:'2-digit'}),'"'+s.items.map(i=>i.name+(i.preparation_type?' ('+i.preparation_type+')':'')+'x'+i.qty).join(', ')+'"',s.total,s.payment,calcProfit(s),s.note||'']);});
  const csv=rows.map(r=>r.join(',')).join('\n');
  const blob=new Blob([csv],{type:'text/csv'});const url=URL.createObjectURL(blob);const a=document.createElement('a');
  a.href=url;a.download=`posh-sales-${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);a.click();document.body.removeChild(a);toast('📤 CSV exported!');
}

function exportPDF(){
  const list=filterSales(rptFilter);
  if(!list.length){toast('No sales to export');return;}
  toast('📄 Generating PDF report...');
  const now2=new Date();
  const periodLabel={today:"Today's Report",week:'Weekly Report',month:'Monthly Report',all:'All-Time Report'}[rptFilter]||'Sales Report';
  const rev=list.reduce((s,x)=>s+x.total,0);
  const grossP=list.reduce((s,x)=>s+calcProfit(x),0);
  const expList=expenses.filter(e=>{
    if(rptFilter==='today')return getDateKey(e.ts)===todayKey();
    if(rptFilter==='week'){var w=new Date(now2);w.setDate(w.getDate()-7);return new Date(e.ts)>=w;}
    if(rptFilter==='month'){var d=new Date(e.ts);return d.getMonth()===now2.getMonth()&&d.getFullYear()===now2.getFullYear();}
    return true;
  });
  const totalExp=expList.reduce((s,e)=>s+e.amount,0);
  const netP=grossP-totalExp;
  const txns=list.length;
  const avg=txns>0?Math.round(rev/txns):0;
  const prodMap={};
  list.forEach(s=>s.items.forEach(i=>{
    if(!prodMap[i.id])prodMap[i.id]={name:i.name,qty:0,rev:0};
    prodMap[i.id].qty+=i.qty;prodMap[i.id].rev+=(i.prodType==='bulk'?i.price:i.price*i.qty);
  }));
  const topProds=Object.values(prodMap).sort((a,b)=>b.rev-a.rev).slice(0,10);
  const txnRows=[...list].reverse().map(s=>{
    const d=new Date(s.ts);
    const profit=calcProfit(s);
    return`<tr>
      <td>#${String(s.id).slice(-4)}</td>
      <td>${d.toLocaleDateString('en-KE',{day:'numeric',month:'short'})} ${d.toLocaleTimeString('en-KE',{hour:'2-digit',minute:'2-digit'})}</td>
      <td>${s.items.map(i=>i.name+(i.preparation_type?' ('+i.preparation_type+')':'')+'×'+i.qty).join(', ')}</td>
      <td>${s.payment}</td>
      <td style="color:#00A67E;font-weight:700">KSh ${profit.toLocaleString()}</td>
      <td style="font-weight:700">KSh ${s.total.toLocaleString()}</td>
    </tr>`;
  }).join('');
  const expRows=expList.map(e=>`<tr>
    <td>${e.desc}</td><td>${e.cat}</td>
    <td>${new Date(e.ts).toLocaleDateString('en-KE',{day:'numeric',month:'short'})}</td>
    <td style="color:#EF4444;font-weight:700">KSh ${e.amount.toLocaleString()}</td>
  </tr>`).join('');
  const topRows=topProds.map((p,i)=>`<tr>
    <td>${i+1}</td><td>${p.name}</td><td>${p.qty}</td>
    <td style="color:#00A67E;font-weight:700">KSh ${p.rev.toLocaleString()}</td>
    <td>${rev>0?Math.round(p.rev/rev*100):0}%</td>
  </tr>`).join('');

  const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"/>
  <title>POSH Report</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;color:#0D1B2A;background:#fff;font-size:13px}
    .header{background:#00A67E;color:white;padding:24px 32px;display:flex;justify-content:space-between;align-items:center}
    .header-left h1{font-size:28px;font-weight:900;letter-spacing:-1px}
    .header-left h1 span{color:#FFD700}
    .header-left p{font-size:11px;opacity:0.8;margin-top:2px}
    .header-right{text-align:right;font-size:11px;opacity:0.85;line-height:1.7}
    .kpi-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;padding:24px 32px}
    .kpi{background:#F0F4F8;border-radius:10px;padding:14px;border-left:4px solid #00A67E}
    .kpi.amber{border-color:#F59E0B}.kpi.blue{border-color:#3B82F6}.kpi.red{border-color:#EF4444}
    .kpi label{font-size:10px;font-weight:700;color:#5A7184;text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:5px}
    .kpi value{font-size:20px;font-weight:800;color:#0D1B2A}
    .section{padding:0 32px 24px}
    .section h2{font-size:13px;font-weight:700;color:white;background:#00A67E;padding:8px 14px;border-radius:6px 6px 0 0;margin-bottom:0;text-transform:uppercase;letter-spacing:0.5px}
    table{width:100%;border-collapse:collapse;font-size:12px}
    th{background:#E0F7F1;color:#007F61;font-size:10px;font-weight:700;text-transform:uppercase;padding:8px 10px;text-align:left;letter-spacing:0.3px}
    td{padding:8px 10px;border-bottom:1px solid #E8EDF2;vertical-align:top}
    tr:nth-child(even) td{background:#F8FBFD}
    tr:last-child td{border-bottom:none}
    .footer{background:#F0F4F8;padding:14px 32px;text-align:center;font-size:10px;color:#9DB4C8;margin-top:20px;border-top:1px solid #E8EDF2}
    .net-banner{background:#00A67E;color:white;padding:16px 32px;display:flex;justify-content:space-between;align-items:center}
    .net-banner .nb-label{font-size:11px;font-weight:700;opacity:0.8;text-transform:uppercase;letter-spacing:0.5px}
    .net-banner .nb-value{font-size:26px;font-weight:900;letter-spacing:-0.5px}
    .net-banner .nb-sub{font-size:11px;opacity:0.75;margin-top:2px}
    @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
  </style>
  </head><body>
  <div class="header">
    <div class="header-left">
      <h1>PO<span>S</span>H</h1>
      <p>Point of Sale Hub · ${periodLabel}</p>
    </div>
    <div class="header-right">
      <div><strong>${shopName}</strong></div>
      <div>Generated: ${now2.toLocaleString('en-KE')}</div>
      <div>Period: ${periodLabel}</div>
    </div>
  </div>
  <div class="net-banner">
    <div>
      <div class="nb-label">Net Profit (after expenses)</div>
      <div class="nb-value">KSh ${netP.toLocaleString()}</div>
      <div class="nb-sub">Revenue KSh ${rev.toLocaleString()} · Expenses KSh ${totalExp.toLocaleString()}</div>
    </div>
    <div style="text-align:right">
      <div class="nb-label">Net Margin</div>
      <div class="nb-value">${rev>0?Math.round(netP/rev*100):0}%</div>
    </div>
  </div>
  <div class="kpi-grid">
    <div class="kpi"><label>Total Revenue</label><value>KSh ${rev.toLocaleString()}</value></div>
    <div class="kpi amber"><label>Gross Profit</label><value>KSh ${grossP.toLocaleString()}</value></div>
    <div class="kpi blue"><label>Transactions</label><value>${txns}</value></div>
    <div class="kpi blue"><label>Average Sale</label><value>KSh ${avg.toLocaleString()}</value></div>
    <div class="kpi red"><label>Total Expenses</label><value>KSh ${totalExp.toLocaleString()}</value></div>
    <div class="kpi"><label>Net Profit</label><value style="color:${netP>=0?'#00A67E':'#EF4444'}">KSh ${netP.toLocaleString()}</value></div>
  </div>
  ${topProds.length?`<div class="section"><h2>🏆 Top Selling Products</h2>
  <table><thead><tr><th>#</th><th>Product</th><th>Qty Sold</th><th>Revenue</th><th>Share</th></tr></thead>
  <tbody>${topRows}</tbody></table></div>`:''}
  <div class="section"><h2>🧾 Transaction History</h2>
  <table><thead><tr><th>ID</th><th>Date & Time</th><th>Items</th><th>Payment</th><th>Profit</th><th>Total</th></tr></thead>
  <tbody>${txnRows}</tbody></table></div>
  ${expList.length?`<div class="section"><h2>Expenses</h2>
  <table><thead><tr><th>Description</th><th>Category</th><th>Date</th><th>Amount</th></tr></thead>
  <tbody>${expRows}</tbody></table></div>`:''}
  <div class="footer">POSH v3.0 · Point of Sale Hub · Confidential Business Report · Generated ${now2.toLocaleString('en-KE')}</div>
  <script>window.onload=function(){setTimeout(function(){window.print();window.onfocus=function(){setTimeout(function(){window.close();},500);}},400);}<\/script>
  </body></html>`;

  // Open in new tab — print dialog fires automatically via window.onload in the HTML
  // User just clicks "Save as PDF" — no HTML file, no extra steps
  var blob=new Blob([html],{type:'text/html'});
  var url=URL.createObjectURL(blob);
  var win=window.open(url,'_blank');
  if(!win){
    // Popup blocked fallback
    var a=document.createElement('a');
    a.href=url;
    a.download='POSH-Report-'+new Date().toISOString().slice(0,10)+'.html';
    document.body.appendChild(a);a.click();document.body.removeChild(a);
    toast('Allow popups for direct PDF export. HTML downloaded as fallback.');
  } else {
    toast('Report ready — select Save as PDF in the print dialog!');
  }
  setTimeout(function(){URL.revokeObjectURL(url);},30000);
}


// ═════════════════════════════════════
//  🎉 CONFETTI
// ═════════════════════════════════════
// BUG FIX: _confettiFired was reset to false when the animation ended, so
// renderDashboard() (called on every tab switch) would re-fire confetti
// whenever today's revenue exceeded the goal.  Use a date key instead so
// confetti fires at most once per calendar day.
var _confettiDate=null;
function fireConfetti(){
  var today=todayKey();
  if(_confettiDate===today)return;
  _confettiDate=today;
  var canvas=document.createElement('canvas');
  canvas.style.cssText='position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:700';
  document.body.appendChild(canvas);
  var ctx=canvas.getContext('2d');
  canvas.width=window.innerWidth;canvas.height=window.innerHeight;
  var pieces=[];
  var colors=['#00A67E','#FFD700','#3B82F6','#EF4444','#8B5CF6','#F59E0B','#EC4899'];
  for(var i=0;i<120;i++){
    pieces.push({
      x:Math.random()*canvas.width,y:-10-Math.random()*200,
      w:6+Math.random()*8,h:8+Math.random()*12,
      color:colors[Math.floor(Math.random()*colors.length)],
      rot:Math.random()*360,rotV:(Math.random()-0.5)*8,
      vx:(Math.random()-0.5)*4,vy:2+Math.random()*4,
      opacity:1
    });
  }
  var frames=0;
  function draw(){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    pieces.forEach(function(p){
      ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.rot*Math.PI/180);
      ctx.globalAlpha=p.opacity;ctx.fillStyle=p.color;
      ctx.fillRect(-p.w/2,-p.h/2,p.w,p.h);ctx.restore();
      p.x+=p.vx;p.y+=p.vy;p.rot+=p.rotV;p.vy+=0.08;
      if(frames>80)p.opacity-=0.015;
    });
    frames++;
    if(frames<160)requestAnimationFrame(draw);
    else{canvas.remove();}
  }
  draw();
  toast('🎉 Daily goal reached! Amazing!');
}

// ═════════════════════════════════════
//  🔊 CHA-CHING SOUND
// ═════════════════════════════════════
function playChaChingSound(){
  try{
    var ctx=new(window.AudioContext||window.webkitAudioContext)();
    function beep(freq,start,dur,vol,type){
      var o=ctx.createOscillator();var g=ctx.createGain();
      o.connect(g);g.connect(ctx.destination);
      o.type=type||'sine';o.frequency.value=freq;
      g.gain.setValueAtTime(vol||0.3,ctx.currentTime+start);
      g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+start+dur);
      o.start(ctx.currentTime+start);o.stop(ctx.currentTime+start+dur+0.01);
    }
    // cha-ching: quick high notes then a ring
    beep(1200,0,0.06,0.3,'square');
    beep(1600,0.05,0.06,0.25,'square');
    beep(2000,0.1,0.04,0.2,'square');
    beep(880,0.15,0.35,0.15,'sine');
    beep(1100,0.15,0.3,0.1,'sine');
  }catch(e){}
}

// ═════════════════════════════════════
//  📈 SPARKLINES
// ═════════════════════════════════════
function drawSparkline(canvasId,data,color){
  var canvas=document.getElementById(canvasId);
  if(!canvas)return;
  var ctx=canvas.getContext('2d');
  var W=canvas.offsetWidth||80;var H=canvas.offsetHeight||24;
  canvas.width=W;canvas.height=H;
  ctx.clearRect(0,0,W,H);
  if(!data||data.length<2)return;
  var max=Math.max.apply(null,data)||1;
  var min=Math.min.apply(null,data);
  var range=max-min||1;
  var pts=data.map(function(v,i){
    return{x:(i/(data.length-1))*W,y:H-((v-min)/range)*(H-4)-2};
  });
  // fill
  ctx.beginPath();ctx.moveTo(pts[0].x,H);
  pts.forEach(function(p){ctx.lineTo(p.x,p.y);});
  ctx.lineTo(pts[pts.length-1].x,H);ctx.closePath();
  var grad=ctx.createLinearGradient(0,0,0,H);
  grad.addColorStop(0,color+'55');grad.addColorStop(1,color+'00');
  ctx.fillStyle=grad;ctx.fill();
  // line
  ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);
  pts.forEach(function(p){ctx.lineTo(p.x,p.y);});
  ctx.strokeStyle=color;ctx.lineWidth=1.5;
  ctx.lineJoin='round';ctx.lineCap='round';ctx.stroke();
  // dot at end
  ctx.beginPath();ctx.arc(pts[pts.length-1].x,pts[pts.length-1].y,2.5,0,Math.PI*2);
  ctx.fillStyle=color;ctx.fill();
}
function renderSparklines(){
  // Build 7-day history arrays
  var revData=[],profData=[],txnData=[],stockData=[];
  for(var i=6;i>=0;i--){
    var d=new Date();d.setDate(d.getDate()-i);
    var key=getDateKey(d.getTime());
    var daySales=sales.filter(function(s){return getDateKey(s.ts)===key;});
    revData.push(daySales.reduce(function(s,x){return s+x.total;},0));
    profData.push(daySales.reduce(function(s,x){return s+calcProfit(x);},0));
    txnData.push(daySales.length);
  }
  // BUG FIX: j*0 is always 0, making every point identical (flat line).
  // Estimate historical stock for each day by starting from current total
  // stock and adding back the quantity of items sold after that day.
  var currentTotalStock=products.reduce(function(s,p){return s+(p.stock||0);},0);
  for(var j=0;j<7;j++){
    var dayDate=new Date();dayDate.setDate(dayDate.getDate()-(6-j));
    var dayStart=new Date(dayDate.getFullYear(),dayDate.getMonth(),dayDate.getDate()).getTime();
    var soldAfter=sales.filter(function(s){return s.ts>dayStart;})
      .reduce(function(total,s){return total+s.items.reduce(function(t,i){return t+(getProdType({prodType:i.prodType})==='service'?0:(i.qty||0));},0);},0);
    stockData.push(Math.max(0,currentTotalStock+soldAfter));
  }
  drawSparkline('spark-sales',revData,'#00A67E');
  drawSparkline('spark-profit',profData,'#F59E0B');
  drawSparkline('spark-txns',txnData,'#3B82F6');
  drawSparkline('spark-stock',stockData,'#EF4444');
}

// ═════════════════════════════════════
//  ⚡ SWIPE TO DELETE CART
// ═════════════════════════════════════
function attachSwipe(cid){
  var safeId=(cid||'').replace(/[^a-zA-Z0-9_-]/g,'_');
  var row=document.getElementById('ci-row-'+safeId);
  if(!row)return;
  var startX=0,curX=0,swiping=false;
  row.addEventListener('touchstart',function(e){
    startX=e.touches[0].clientX;swiping=true;curX=0;
  },{passive:true});
  row.addEventListener('touchmove',function(e){
    if(!swiping)return;
    curX=e.touches[0].clientX-startX;
    if(curX<0){row.style.transform='translateX('+Math.max(curX,-80)+'px)';}
    else{row.style.transform='translateX(0)';}
  },{passive:true});
  row.addEventListener('touchend',function(){
    if(curX<-60){
      row.style.transform='translateX(-80px)';
      setTimeout(function(){removeFromCart(cid);},200);
    }else{
      row.style.transform='translateX(0)';
    }
    swiping=false;
  });
}

// ═════════════════════════════════════
//  📅 HISTORY DATE PICKER
// ═════════════════════════════════════
var histDateFilter=null;
function setHistDate(val){
  if(!val){histDateFilter=null;}
  else{histDateFilter=val;}
  renderHistory();
}

// PWA Manifest served as static file (manifest.json)

// ═════════════════════════════════════
//  PWA — SERVICE WORKER (static file)
// ═════════════════════════════════════
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('/sw.js',{scope:'/'})
    .then(function(reg){ console.log('POSH SW registered ✅'); })
    .catch(function(e){ console.log('SW registration skipped:', e.message); });
}

// ═════════════════════════════════════
//  PWA — INSTALL PROMPT
// ═════════════════════════════════════
var _deferredInstall=null;
window.addEventListener('beforeinstallprompt',function(e){
  e.preventDefault();
  _deferredInstall=e;
  // Show banner after 3 seconds
  setTimeout(function(){
    var banner=document.getElementById('pwa-banner');
    if(banner&&!localStorage.getItem('posh_pwa_dismissed')){
      banner.classList.add('show');
    }
  },3000);
});
window.addEventListener('appinstalled',function(){
  toast('🎉 POSH installed successfully!');
  var banner=document.getElementById('pwa-banner');
  if(banner) banner.classList.remove('show');
  _deferredInstall=null;
});
function installPWA(){
  var banner=document.getElementById('pwa-banner');
  if(_deferredInstall){
    _deferredInstall.prompt();
    _deferredInstall.userChoice.then(function(result){
      if(result.outcome==='accepted'){
        toast('🎉 POSH is being installed!');
      }
      _deferredInstall=null;
    });
  } else {
    // iOS instructions
    showConfirm(
      'Install on iPhone',
      'Tap the Share button (□↑) at the bottom of Safari, then tap "Add to Home Screen" and tap Add.',
      function(){},
      false
    );
    document.getElementById('confirm-ok').textContent='Got it!';
  }
  if(banner) banner.classList.remove('show');
}
function dismissPWA(){
  var banner=document.getElementById('pwa-banner');
  if(banner) banner.classList.remove('show');
  localStorage.setItem('posh_pwa_dismissed','1');
}

// Re-trigger install prompt (callable from Settings)
function showInstallPrompt(){
  localStorage.removeItem('posh_pwa_dismissed');
  var banner=document.getElementById('pwa-banner');
  if(_deferredInstall){
    if(banner) banner.classList.add('show');
  } else {
    // iOS or already installed
    installPWA();
  }
}

// iOS "Add to Home Screen" hint — show once for Safari users
(function(){
  var isIOS=/iphone|ipad|ipod/i.test(navigator.userAgent);
  var isInStandalone=window.navigator.standalone===true;
  var dismissed=localStorage.getItem('posh_ios_hint');
  if(isIOS&&!isInStandalone&&!dismissed){
    setTimeout(function(){
      var banner=document.getElementById('pwa-banner');
      if(banner){
        banner.querySelector('.pwa-banner-title').textContent='Install on iPhone';
        banner.querySelector('.pwa-banner-sub').textContent='Add to Home Screen for app experience';
        banner.classList.add('show');
      }
    },4000);
  }
})();

// ═════════════════════════════════════
//  INIT
// ═════════════════════════════════════
loadData(); // Load from localStorage first (instant)
// firebase.js is type="module" (async) — wait for it to signal ready
// before attempting cloud load
function _initCloudSync(){
  // BUG FIX #2: ensure privacy.js has had a chance to initialize storage mode
  // before we read it — a small setTimeout guarantees DOM-order scripts have run.
  if(typeof initStorageMode === 'function' && !window._storageInitialized) {
    window._storageInitialized = true;
    initStorageMode();
  }
  // BUG FIX #4: default must match privacy.js ('local', not 'cloud').
  // Conflicting defaults caused cloud sync to fire unexpectedly on fresh installs.
  // ── Storage Mode check ──────────────────────────────
  // privacy.js sets posh_storage_mode = 'local' | 'cloud' (default: 'local').
  // In local mode we skip ALL Firebase calls — no upload, no download, no listener.
  var _storageMode = localStorage.getItem('posh_storage_mode') || 'local';
  if(_storageMode === 'local'){
    console.log('[POSH] Local mode — skipping cloud sync');
    return; // loadData() was already called above; localStorage is the only source
  }
  // ── Cloud mode: proceed as normal ───────────────────
  if(typeof cloudLoad==='function'){
    cloudLoad(function(updated){
      if(updated){
        // Cloud had newer data - refresh UI
        renderDashboard();
        if(typeof renderCats==='function') renderCats();
        if(typeof renderSales==='function') renderSales();
        toast('☁️ Data synced from cloud!');
      }
      // Start real-time listener so changes from other devices come through
      if(typeof startCloudListener==='function') startCloudListener();
    });
  }
}
// BUG FIX: firebase.js is type="module" so it always resolves asynchronously.
// cloudLoad can never be defined at this parse-time point — the synchronous
// branch was dead code and misleading. Always listen for firebaseReady.
window.addEventListener('firebaseReady', _initCloudSync, {once:true});
document.getElementById('header-date').textContent=nowDate();
document.getElementById('sales-time').textContent=nowDate();
renderDashboard();
// Apply role access on init (default role = staff until PIN entered)
applyRoleAccess();

// Splash screen — dismiss after 2.5s, then hand off to staff.js entry screen logic
setTimeout(()=>{
  const splash=document.getElementById('splash');
  if(splash){
    splash.classList.add('hide');
    setTimeout(()=>{
      splash.style.display='none';
      // staff.js owns the start-screen decision (entry vs PIN vs onboarding)
      if(typeof window._poshShowStartScreen==='function'){
        window._poshShowStartScreen();
      } else {
        // Fallback if staff.js not loaded
        const onboarded = localStorage.getItem('posh_onboarded') === 'true';
        if(!onboarded && typeof showOnboarding === 'function'){
          var pinScreen = document.getElementById('pin-screen');
          if(pinScreen) pinScreen.style.display = 'none';
          showOnboarding();
        }
      }
    },600);
  }
},2500);
// ── Donate modal ──────────────────────────────────────────────
function openDonateModal(){
  // Always pull from single config source — never hardcoded in HTML
  var el = document.getElementById('donate-number');
  if(el) el.textContent = POSH_DONATE.display();
  document.getElementById('donate-modal').classList.add('open');
  document.getElementById('donate-ov').classList.add('show');
}
function closeDonateModal(){
  document.getElementById('donate-modal').classList.remove('open');
  document.getElementById('donate-ov').classList.remove('show');
}
function copyDonateNumber(){
  var num = POSH_DONATE.raw();
  var btn = document.getElementById('donate-copy-btn');
  if(navigator.clipboard){
    navigator.clipboard.writeText(num).then(function(){
      if(btn){btn.textContent='Copied! ✓';setTimeout(function(){btn.textContent='Copy';},2000);}
    }).catch(function(){
      _fallbackCopy(num, btn);
    });
  } else {
    _fallbackCopy(num, btn);
  }
}
function _fallbackCopy(num, btn){
  var el=document.createElement('textarea');
  el.value=num;el.style.position='fixed';el.style.opacity='0';
  document.body.appendChild(el);el.select();
  try{document.execCommand('copy');}catch(e){}
  document.body.removeChild(el);
  if(btn){btn.textContent='Copied! ✓';setTimeout(function(){btn.textContent='Copy';},2000);}
}
