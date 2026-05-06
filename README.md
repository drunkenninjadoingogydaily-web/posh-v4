# 🧾 POSH — Point of Sale Hub

A **mobile-first PWA** point-of-sale system built for small retailers. Sell standard products, bulk items (oil, grains), and services (airtime, M-Pesa) with offline support, Firebase cloud sync, and detailed analytics.

![POSH](https://img.shields.io/badge/POSH-v3.0-00A67E?style=flat-square) ![PWA](https://img.shields.io/badge/PWA-Offline%20Ready-0099FF?style=flat-square) ![Firebase](https://img.shields.io/badge/Firebase-Firestore-orange?style=flat-square) ![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)

---

## 📋 Table of Contents

- [Features](#features)
- [Quick Start](#quick-start)
- [Product Types](#product-types)
- [Role-Based Access](#role-based-access)
- [Technical Setup](#technical-setup)
- [Project Structure](#project-structure)
- [Data Persistence](#data-persistence)
- [Known Bugs & Fixes](#known-bugs--fixes)
- [API Overview](#api-overview)
- [Troubleshooting](#troubleshooting)
- [Roadmap](#roadmap)

---

## ✨ Features

| Category | Features |
|---|---|
| **Sales** | One-tap checkout, bulk/standard/service products, M-Pesa, cash, card, credit |
| **Inventory** | Real-time stock tracking, low-stock alerts, barcode scanning, restock modal |
| **Reports** | Daily/weekly/monthly revenue, profit, expense charts, PDF export |
| **Multi-User** | Google/email owner login, staff PIN + shop-code auth, role-based access |
| **Credit** | Customer debt ledger, partial payments, WhatsApp reminders |
| **Cloud** | Firebase Firestore sync, offline-first, real-time multi-device updates |
| **UX** | Dark mode, favourites, idle timeout, daily goal confetti, toast notifications |
| **PWA** | Installable on iOS/Android, service worker caching, works fully offline |

---

## 🚀 Quick Start

### For Owners

1. Open the app → tap **"I'm the owner"**
2. Sign in with **Google** or **Email/Password**
3. Go to **📦 Stock → Add Product**
4. Fill: name, price, cost, stock qty, type (Standard / Bulk / Service)
5. Go to **🧾 Sales** → tap a product → **Checkout**

### For Staff

1. Get from the owner: **Shop Code** (e.g. `ABC123`) and **Staff PIN**
2. Open the app → tap **"I'm staff"**
3. Enter: shop code → your name → PIN → **Tap In**

---

## 🏷️ Product Types

### 📦 Standard (Default)
Regular packaged goods — bottles, cans, packets, units.
- Stock in whole numbers
- One-tap add to cart; qty via stepper
- Out-of-stock products disabled on sell screen

### ⚖️ Bulk / Loose
Sold by weight or volume — oil, grains, sugar, flour.
- Stock in decimals (e.g. 2.5 kg, 0.75 L)
- Tapping opens a qty-input modal; price calculates live (`qty × pricePerUnit`)
- Stock decreases accurately (sell 2.5 kg → stock drops by exactly 2.5 kg)

### 🛎️ Service
No-stock items — airtime, M-Pesa, printing, labour.
- Never shows "Out of Stock"
- Badge shows "Service"
- No stock deducted on sale

---

## 👥 Role-Based Access

| Feature | Owner (Admin) | Staff (Cashier) |
|---|---|---|
| Make sales | ✅ | ✅ |
| View stock | ✅ | ✅ Read-only |
| Add / edit products | ✅ | ❌ |
| Reports & analytics | ✅ | ❌ |
| Staff management | ✅ | ❌ |
| Change PINs / settings | ✅ | ❌ |
| Cloud sync settings | ✅ | ❌ |

**Sign in:** Owner → Google or Email/Password. Staff → Shop Code + Name + PIN.

---

## 🔧 Technical Setup

### Prerequisites
- Modern web browser (Chrome recommended)
- Firebase project (for cloud sync)
- Static file server (Netlify, Vercel, or `python3 -m http.server`)

### 1. Clone

```bash
git clone https://github.com/yourusername/posh.git
cd posh
```

### 2. Configure Firebase

Open `firebase.js` and replace the config block:

```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456",
  appId: "1:123456:web:abcdef"
};
```

In the Firebase Console:
- Enable **Authentication** → Email/Password & Google Sign-In
- Enable **Firestore Database** → Start in test mode
- Add your domain to **Authorized Domains**

> ⚠️ **IMPORTANT:** Also expose `window._poshDb` in `firebase.js` after Firestore init so the remote donate-number config loader in `app.js` can find it:
> ```javascript
> window._poshDb = db;  // add this line after `const db = initializeFirestore(...)`
> ```
> Without this, the `POSH_DONATE` remote config silently fails.

### 3. Deploy

```bash
# Netlify
netlify deploy --prod

# Vercel
vercel --prod

# Local dev
python3 -m http.server 8000
```

---

## 📁 Project Structure

```
posh/
├── index.html          # All HTML markup, modals, layout
├── app.js              # Core logic — sales, inventory, cart, reports, settings
├── firebase.js         # Firestore cloud sync (type="module")
├── firebase-auth.js    # Owner authentication — Google + Email/Password
├── staff.js            # Staff sign-in, PIN entry, shop-code lookup
├── features.js         # Extended features — Returns, Purchase Orders, Z-Report, CSV import
├── quickwins.js        # Quick wins, UI shortcuts, analytics helpers
├── barcode.js          # Barcode scanning (BarcodeDetector + ZXing fallback)
├── product-images.js   # Emoji picker for product icons
├── styles.css          # All styling — light + dark mode, CSS variables
├── manifest.json       # PWA manifest — name, icons, display mode
└── sw.js               # Service worker — offline caching strategy
```

> **Load order matters.** `firebase.js` is `type="module"` and dispatches `firebaseReady` event. `app.js`, `staff.js`, and `firebase-auth.js` wait for this event before calling cloud APIs.

---

## 💾 Data Persistence

### localStorage (`posh_data`)
- Instant load — data available before network
- Full offline support — all writes go here first
- Limit ~5–10 MB per browser

### Firebase Firestore (`shops/{shop-code}`)
- 2-second debounced auto-sync after every save
- Offline-to-online auto-sync on reconnect
- Real-time listener (`onSnapshot`) for multi-device updates
- Data shape:
  ```
  shops/{shopCode}/
    products[]   sales[]   expenses[]   debts[]
    staffAccounts[]   adminPin   staffPin
    shopName   dailyGoal   darkMode   idleMinutes
    nextId   nextDebtId   lastSync   version
  ```

### Sync Logic
1. App starts → `loadData()` from localStorage (instant)
2. Firebase ready → `cloudLoad()` compares `lastSync` timestamps
3. Cloud newer → overwrites local; local newer → no change
4. Every save → `saveData()` → `cloudSync()` (debounced 2s)
5. `onSnapshot` listener catches changes from other devices in real-time

---

## 🐛 Known Bugs & Fixes

### 🔴 Critical (Not yet fixed in source)

#### 1. `window._poshDb` never exposed — remote donate config silently broken
**File:** `firebase.js` / `app.js`  
**Issue:** `app.js` reads `window._poshDb` to fetch the remote donate phone number from Firestore, but `firebase.js` never sets `window._poshDb`. The Firestore instance `db` is module-scoped and not exposed.  
**Fix:** Add to `firebase.js` after `const db = initializeFirestore(...)`:
```javascript
window._poshDb = db;
```

#### 2. `idleTimer` uses `clearInterval` but is set with `setInterval` — semantically mismatched
**File:** `app.js`, `resetIdleTimer()` (line ~356)  
**Issue:** `idleTimer` is typed and cleared as `setInterval` / `clearInterval`, which works but is semantically wrong for a repeating idle check. Mixing interval and timeout idioms is confusing for future maintainers.  
**Fix (low risk):** Keep `setInterval` consistently, or switch to a recursive `setTimeout` for more control.

#### 3. `cloudLoad` double-guard fires synchronously for non-module scripts
**File:** `app.js` (lines ~2024–2030)  
**Issue:** The guard `if(typeof cloudLoad==='function') _initCloudSync()` can never be true at parse time — `cloudLoad` is only defined after `firebase.js` (a `type="module"`) resolves asynchronously. The synchronous branch is dead code and misleading.  
**Fix:** Remove the dead synchronous branch, keep only the `firebaseReady` listener path:
```javascript
window.addEventListener('firebaseReady', _initCloudSync, { once: true });
```

### 🟡 Minor

#### 4. `calcProfit()` ignores bulk item cost basis
**File:** `app.js`, `calcProfit()` (line ~272)  
**Issue:** For bulk cart items, `i.cost` is `Math.round(qty × product.cost)` — a total, not a unit cost. `calcProfit` computes `(i.price - cost) × i.qty` which double-multiplies the quantity for bulk items.  
**Fix:** Store `unitCost` separately on bulk cart items and use it in `calcProfit`:
```javascript
// In confirmBulkAdd:
cart.push({ ..., unitCost: p.cost || 0, cost: Math.round(qty * (p.cost||0)) });

// In calcProfit:
var cost = p ? p.cost : (i.unitCost || i.cost || 0);
return sum + (i.price - cost * i.qty) * 1; // price is already total for bulk
```

#### 5. Service worker silently swallows `cache.addAll` failures
**File:** `sw.js`, `install` handler  
**Issue:** `.catch(function() { return; })` silences all asset-caching failures. If a critical file (e.g. `app.js`) 404s, the SW installs successfully with a broken cache and users get a blank screen offline.  
**Fix:** Log the failing asset name:
```javascript
caches.open(CACHE).then(cache =>
  cache.addAll(ASSETS).catch(err => console.warn('SW cache failed:', err))
);
```

#### 6. `_authMode` not initialised before `firebase-auth.js` reads it
**File:** `firebase-auth.js` (line ~`_authBusy`)  
**Issue:** `window._authMode` is referenced in `_authBusy()` but is never initialised in `firebase-auth.js`. If `ownerEmailAuth()` is called before `_authMode` is set by `staff.js`, the button text falls back to `undefined`.  
**Fix:** Add a default at the top of `firebase-auth.js`:
```javascript
window._authMode = window._authMode || 'signin';
```

---

## 🔌 API Overview

### Core State (global `var`)

```javascript
products[]   sales[]   expenses[]   debts[]   cart[]
shopName     adminPin  staffPin     dailyGoal
nextId       nextDebtId  darkMode   idleMinutes
currentRole  // 'admin' | 'staff'
```

### Key Functions

```javascript
// Products
openProductForm(id?)       // Add / edit product modal
saveProduct()              // Validate & save to products[]
deleteProduct(id)          // Remove product

// Cart & Checkout
addToCart(id)              // Standard product → cart
openBulkQtyModal(id)       // Bulk: open qty input
confirmBulkAdd(id)         // Bulk: commit qty to cart
addToCartService(id)       // Service → cart
removeFromCart(cid)        // Remove by cart ID
changeQty(cid, delta)      // Adjust qty
clearCart()                // Empty cart
cartTotal() → number       // Sum of cart
cartCount() → number       // Total item count
confirmSale()              // Record sale, deduct stock

// Persistence
saveData()                 // localStorage + debounced cloudSync()
loadData()                 // Restore from localStorage

// Cloud
cloudSync()                // Debounced Firestore save (2s)
cloudLoad(cb)              // Load from cloud if newer
startCloudListener()       // Real-time onSnapshot listener
cloudLoadByCode(code, cb)  // Staff login — load shop by code

// Reports
filterSales(period)        // 'today' | 'week' | 'month' | 'all'
calcProfit(sale) → number  // Gross profit for one sale
renderDashboard()          // Refresh home screen
renderReports()            // Refresh analytics screen

// UI
fmt(n) → string            // Format as "KSh 1,234"
toast(msg)                 // Bottom notification
showConfirm(title, sub, cb, isDanger)  // Confirmation modal
lockApp()                  // Show PIN screen
unlockApp()                // Dismiss PIN screen
resetIdleTimer()           // Restart idle countdown
```

---

## ❓ Troubleshooting

| Symptom | Fix |
|---|---|
| App won't load | Clear cache, try incognito, check Firebase config |
| Data not syncing | Check internet, check Firestore rules, check console (F12) |
| Staff can't sign in | Verify shop code, name (exact match), and PIN |
| Offline sales lost | Re-open app when online — auto-syncs on reconnect |
| Stock shows decimal on standard product | Change product type to **Bulk** (supports decimals) |
| Blank screen after install | SW cached a broken build — clear service worker in browser settings |
| Donate number wrong | Set `window._poshDb = db` in `firebase.js` (see Known Bugs #1) |

---

## 🗺️ Roadmap

- [ ] Inventory forecasting (predict stock-outs)
- [ ] Customer profiles & purchase history
- [ ] Receipt email delivery
- [ ] Multi-location support (head office + branches)
- [ ] SMS reminders for credit customers
- [ ] Granular role permissions (e.g. cashier can view own shift only)
- [ ] POS hardware integrations (scales, receipt printers, card readers)

---

## 🤝 Contributing

1. Fork the repo
2. Create a branch: `git checkout -b feat/your-feature`
3. Commit: `git commit -m "feat: describe your change"`
4. Push & open a Pull Request

Please include steps to reproduce any bug you fix.

---

## 📄 License

MIT — free to use, modify, and distribute.

---

**Made with ❤️ for small retailers.**  
*POSH — simple POS, powerful analytics, always online (or offline).*
