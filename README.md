# 🧾 POSH — Point of Sale Hub

A **mobile-first PWA** point-of-sale system built for small retailers in Kenya. Sell standard products, bulk items (oil, grains), and services (airtime, M-Pesa) with offline support, cloud sync, and detailed analytics.

![POSH](https://img.shields.io/badge/POSH-v3.0-00A67E?style=flat-square) ![PWA](https://img.shields.io/badge/PWA-Offline%20Ready-0099FF?style=flat-square) ![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)

---

## 📋 Table of Contents

- [Features](#features)
- [Quick Start](#quick-start)
- [Product Types](#product-types)
- [Technical Setup](#technical-setup)
- [Project Structure](#project-structure)
- [Data Persistence](#data-persistence)
- [Bug Fixes & Improvements](#bug-fixes--improvements)
- [API Overview](#api-overview)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)

---

## ✨ Features

### 🛍️ Sales & Checkout
- **Fast checkout** with one-tap add-to-cart
- **Three product types:** Standard, Bulk, Service
- **Multiple payment methods:** Cash, M-Pesa, Card, Credit
- **Receipt printing & WhatsApp sharing**
- **Fresh/Fried split pricing** for fish and omena

### 📦 Inventory
- **Real-time stock tracking** with low-stock alerts
- **Bulk product support** with decimal quantities (2.5kg, 0.75L)
- **Service products** that never run out
- **Barcode scanning** for faster lookup
- **Product restock modal** with cost logging

### 💰 Reports
- **Daily/weekly/monthly** revenue, profit, expense summaries
- **Net profit calculation** with cost-of-goods tracking
- **Payment method breakdown**
- **Top-selling products** chart
- **PDF export** for management

### 👥 Multi-User
- **Owner:** Email/Password or Google Sign-In
- **Staff:** PIN-based, shop-code entry (no account needed)
- **Role-based restrictions** (cashiers can't view reports)
- **Shift tracking** per user

### 💳 Credit Management
- **Sell on credit** with auto-logging
- **Track customer balances** with partial payments
- **WhatsApp reminders** for overdue balances
- **Payment method recording**

### ☁️ Cloud & Offline
- **Firebase Firestore** cloud backup
- **Auto-sync** every 2 seconds (debounced)
- **Offline-first design** — works with no internet
- **Real-time multi-device sync**
- **localStorage** cache for instant load

### 🎨 UX
- **Dark mode** toggle
- **Favourites** (⭐) for fast products
- **Category filtering**
- **Idle timeout** with PIN re-entry
- **Confetti celebration** on daily goal reached
- **Toast notifications** for actions

### 📱 PWA
- **Works offline** — full functionality
- **Install as app** on iOS & Android
- **Service worker caching** for fast load
- **Responsive** on all screen sizes

---

## 🚀 Quick Start

### For Owners

```bash
1. Open the app → "I'm the owner"
2. Sign in with Google or Email/Password
3. Go to Stock → Add Product
4. Fill: name, price, cost, stock qty, type (Standard/Bulk/Service)
5. Go to Sales → tap product → checkout
```

### For Staff

```bash
1. Ask owner for: shop code (e.g., ABC123) & staff PIN (e.g., 1234)
2. Open app → "I'm staff"
3. Enter: shop code → staff name → PIN
4. Start selling (same as owner, no inventory access)
```

---

## 🏷️ Product Types

POSH supports three product types for flexibility:

### 1. **Standard Products** (Default)
Traditional packaged goods — bottles, cans, packets, units.

```javascript
{
  id: 501,
  name: "Water 500ml",
  price: 30,
  cost: 15,
  stock: 100,
  unit: "bottle",
  prodType: "standard"
}
```

**Workflow:**
- Stock is **whole numbers** (you can't sell 0.5 packets)
- Qty shown as stepper on checkout
- Stock decreases by qty sold

---

### 2. **Bulk Products**
Items sold by weight or volume — oil, grains, sugar, flour.

```javascript
{
  id: 502,
  name: "Cooking Oil",
  pricePerUnit: 180,
  price: 180,
  cost: 140,
  stock: 50,
  bulkUnit: "kg",
  unit: "kg",
  prodType: "bulk"
}
```

**Workflow:**
- Stock is **decimal** (2.5 kg, 0.75 L, etc.)
- Tapping product opens **qty input modal**
- Price calculated live: `qty × pricePerUnit`
- Stock decreases accurately (e.g., sell 2.5 kg → stock drops by 2.5 kg)

---

### 3. **Service Products**
No-stock items — airtime, M-Pesa, printing, labour, repairs.

```javascript
{
  id: 503,
  name: "Airtime KSh 500",
  price: 500,
  cost: 0,
  stock: 0,
  prodType: "service"
}
```

**Workflow:**
- **No stock tracking** — system never complains about stock
- Qty defaults to **1**
- Tapping adds to cart immediately
- Badge shows **"Service"** (not "Out of stock")
- No stock deduction on sale

---

## 🔧 Technical Setup

### Prerequisites
- **Web browser** (Chrome, Safari, Firefox)
- **Node.js** (optional, for local dev)
- **Firebase project** (for cloud sync)

### Installation

#### **1. Clone the repo**
```bash
git clone https://github.com/yourusername/posh.git
cd posh
```

#### **2. Set up Firebase**

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Create project (or use existing)
3. Enable:
   - **Authentication** → Email/Password & Google Sign-In
   - **Firestore Database** → Start in test mode
4. Copy config from **Project Settings**
5. Update `firebase.js`:

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

#### **3. Deploy**

**Netlify:**
```bash
npm install -g netlify-cli
netlify deploy --prod
```

**Vercel:**
```bash
npm install -g vercel
vercel --prod
```

**GitHub Pages:**
- Enable in repo settings
- Push to `main` → auto-deploys

#### **4. Local Development**

**Python:**
```bash
python3 -m http.server 8000
# Open http://localhost:8000
```

**Node:**
```bash
npx http-server
# Open http://localhost:8080
```

---

## 📁 Project Structure

```
posh/
├── index.html              # Main HTML (modals, layout)
├── app.js                  # Core logic (2,000+ lines)
│   ├── Product management
│   ├── Cart & checkout
│   ├── Sales recording
│   ├── Reports & analytics
│   └── Settings & config
├── firebase.js             # Cloud sync & Firestore
├── firebase-auth.js        # Owner authentication
├── staff.js                # Staff sign-in & PIN
├── features.js             # Extended features (POs, CRM, etc.)
├── quickwins.js            # Quick wins, reports, reports UI
├── barcode.js              # Barcode scanning
├── product-images.js       # Emoji picker
├── styles.css              # All styling
├── manifest.json           # PWA manifest
├── sw.js                   # Service worker (offline cache)
└── README.md               # This file
```

---

## 💾 Data Persistence

### localStorage
- **Instant load** from cached data
- **Survives offline** — changes saved locally
- **Size:** ~5-10 MB per browser
- **Key:** `posh_data` (JSON)

### Cloud (Firebase Firestore)
- **2-second debounce** before sync
- **Automatic sync** on every change
- **Multi-device updates** in real-time
- **Data structure:**

```
shops/{shop-code}/
  products: [ {...}, ... ]
  sales: [ {...}, ... ]
  expenses: [ {...}, ... ]
  debts: [ {...}, ... ]
  lastSync: "2025-05-06T12:34:56Z"
  version: 4
```

---

## 🐛 Bug Fixes & Improvements (v3.0)

### Critical Fixes

**✅ Unsafe JSON parsing crashes**
- All 14+ `JSON.parse(localStorage)` calls wrapped in try-catch
- Corrupted data won't crash app
- Added `safeParseLS()` helper
- Affects: `quickwins.js`, `features.js`, `firebase.js`

**✅ Firestore listener memory leak**
- Real-time listeners properly unsubscribed
- `_cloudListenerUnsub` variable tracks unsubscribe
- Prevents duplicate listeners accumulating

**✅ Profit calculation inflated for deleted products**
- Previously: deleted product cost → 0 → inflated profit
- Now: cost read from **sale item** (saved at transaction time)
- Historical sales always correct

**✅ Cost not saved on cart items**
- Cost now captured when item added to cart
- Ensures accurate profit even if product cost changes

**✅ Missing null checks**
- All product lookups validated before use
- Inconsistent null checking fixed

### Backward Compatibility

- **Migration step** in `loadData()`: all existing products auto-get `prodType: 'standard'`
- Zero data loss
- Existing shops unaffected

---

## 🔌 API Overview

### Core Functions

#### **Product Management**

```javascript
openProductForm(id)        // Open add/edit modal
saveProduct()              // Save product to array
deleteProduct(id)          // Remove product

// Getters
getProdType(product)       // Returns 'standard', 'bulk', or 'service'
getDisplayCat(category)    // Legacy category name mapping
```

#### **Cart & Checkout**

```javascript
addToCart(id)              // Add standard product
addToCartService(id)       // Add service product
openBulkQtyModal(id)       // Open qty input for bulk
confirmBulkAdd(id)         // Add bulk item with qty

removeFromCart(cid)        // Remove cart item
changeQty(cid, delta)      // Change qty (+/-)
clearCart()                // Empty cart

cartTotal()                // Return total price
cartCount()                // Return item qty count
confirmSale()              // Record sale, deduct stock
```

#### **Stock & Inventory**

```javascript
renderInv()                // Render stock screen
openRestockModal(id)       // Open restock modal
addStock(id, qty, cost)    // Increase stock
```

#### **Reports & Analytics**

```javascript
renderReports()            // Render analytics dashboard
filterSales(period)        // Filter by today/week/month/all
calcProfit(sale)           // Calculate sale profit
```

#### **Cloud Sync**

```javascript
cloudSync()                // Debounced cloud save
cloudLoad(callback)        // Load from cloud on startup
startCloudListener()       // Real-time multi-device sync
cloudLoadByCode(code)      // Load shop by code (staff)
```

#### **UI Utilities**

```javascript
fmt(number)                // Format as KSh 1,234
toast(message)             // Show notification
showConfirm(title, sub, cb) // Confirmation modal
```

---

## ❓ Troubleshooting

### App won't load
```
→ Clear cache (Settings → Clear Data)
→ Try incognito mode
→ Check Firebase config in firebase.js
→ Check browser console (F12)
```

### Data not syncing
```
→ Check internet (look for sync banner)
→ Refresh page (Ctrl+R)
→ Check Firestore permissions (test mode OK)
→ Check console for errors (F12 → Console)
```

### Offline sales not syncing
```
→ Offline sales saved locally ✅
→ Auto-sync when back online
→ If app closed: re-open to trigger sync
```

### Stock showing decimal in standard products
```
→ Change product type from standard → bulk
→ Bulk products support decimals
```

### Lost internet during sale
```
→ Sale saved locally ✅
→ Checkout normally
→ Auto-syncs when online
```

---

## 🤝 Contributing

1. **Fork the repo**
2. **Create feature branch:** `git checkout -b feature/my-feature`
3. **Commit changes:** `git commit -m "feat: describe what you added"`
4. **Push:** `git push origin feature/my-feature`
5. **Open Pull Request**

See `CONTRIBUTING.md` for detailed guidelines.

---

## 📄 License

MIT License — free to use, modify, and distribute.

---

## 📞 Support

- **Issues:** [GitHub Issues](https://github.com/yourusername/posh/issues)
- **Discussions:** [GitHub Discussions](https://github.com/yourusername/posh/discussions)
- **Email:** support@posh.local

---

**Made with ❤️ for small retailers in Kenya.**

*POSH — simple POS, powerful analytics, always online (or offline).*

---

## ✨ Features

### 🛍️ Sales & Checkout
- **Fast checkout** with one-tap add-to-cart for standard products
- **Flexible product types:**
  - **Standard**: Traditional packaged goods (bottles, packets, units)
  - **Bulk**: Weight/volume-based items (oil, grains, sugar, flour)
  - **Service**: No-stock items (airtime, M-Pesa, printing, labour)
- **Fresh/Fried split pricing** for fish and omena with shared stock
- **Multiple payment methods:** Cash, M-Pesa, Card, Credit
- **Receipt printing & WhatsApp sharing**

### 📦 Inventory & Stock
- **Real-time stock tracking** with low-stock alerts
- **Bulk product support** with decimal quantities (2.5kg, 0.75L)
- **Service products** that never run out
- **Restock modal** to add inventory and log costs as expenses
- **Product variants** (size, weight) with individual pricing
- **Barcode scanning** for faster lookup

### 💰 Financial Reports
- **Daily/weekly/month**ly revenue, profit, and expense summaries
- **Net profit calculation** with cost-of-goods tracking
- **Payment method breakdown** (cash vs M-Pesa vs credit)
- **Top-selling products** by revenue and quantity
- **PDF export** for management reviews
- **7-day sales trend** chart

### 👥 Multi-User & Roles
- **Owner (Admin):** Full access via email/password or Google Sign-In
- **Staff:** PIN-based access, shop-code entry (no account needed)
- **Role-based restrictions:** Cashiers can sell; managers can view reports
- **Shift tracking** and sales attribution per user

### 💳 Credit & Debt Tracking
- **Sell on credit** with automatic ledger entry
- **Track customer balances** with partial payment support
- **WhatsApp reminders** for overdue balances
- **Payment method recording** (cash/M-Pesa/card)
- **Overdue alerts** with color-coded status badges

### ☁️ Cloud Sync & Offline
- **Firebase Firestore** cloud backup — syncs every 2 seconds when online
- **Offline-first design** — shop works with no internet
- **Auto-sync on reconnect** — no manual refresh needed
- **Real-time multi-device updates** from other staff members
- **Persistent localStorage** cache for instant app load

### 🎨 User Experience
- **Dark mode** toggle for eye comfort in dim shops
- **Favourites** for fast-moving products
- **Category filtering** for quick product lookup
- **Idle timeout** with PIN re-entry for security
- **Confetti celebration** when daily goal is reached
- **Toast notifications** for all actions

### 📱 PWA & Installation
- **Works offline** — full functionality without internet
- **Install as app** on iOS (Add to Home Screen) and Android
- **No app store needed** — just bookmark or install
- **Fast, responsive design** on all screen sizes
- **Service worker caching** for instant load times

---

## 🚀 Quick Start

### For Owners

1. **Open the app:**
   - Visit `https://your-posh-url.com` (or run locally)
   - Tap **"I'm the owner"**

2. **Sign in:**
   - **Google Sign-In** (fastest) — uses your Google account
   - **Email & Password** — create a new account
   - Choose a shop name (e.g., "Green Mart")

3. **Add your first product:**
   - Tap **📦 Stock** → **Add Product**
   - Fill name, price, cost, stock qty, and category
   - Choose type: Standard, Bulk, or Service
   - Save

4. **Make your first sale:**
   - Tap **🧾 Sales** → tap a product → enter qty → **Checkout**
   - Choose payment method → **Record Sale**

### For Staff

1. **Ask the owner for:**
   - The **shop code** (6-character code, e.g., `ABC123`)
   - The **staff PIN** (e.g., `1234`)

2. **Open the app:**
   - Visit same URL
   - Tap **"I'm staff"**
   - Enter shop code → staff name → PIN → tap in

3. **Start selling:**
   - Same checkout flow as owner
   - No inventory access (staff cannot add products)

---

## 📖 User Manual

### Role-Based Access

#### **Owner (Admin)**
| Feature | Access |
|---------|--------|
| Sales | ✅ Full |
| Stock Management | ✅ Full |
| Reports & Analytics | ✅ Full |
| Financial Settings | ✅ Change PINs, daily goal |
| Staff Management | ✅ Create, view, remove staff |
| Cloud Sync Settings | ✅ View, manage |

**Sign in with:** Google or Email/Password

---

#### **Staff (Cashier)**
| Feature | Access |
|---------|--------|
| Sales | ✅ Full |
| Stock Viewing | ✅ Read-only (see quantities) |
| Reports | ❌ No access |
| Staff Management | ❌ No access |
| Settings | ❌ No access |

**Sign in with:** Shop code + Name + PIN

---

### Adding & Managing Products

#### **Add a New Product**

1. Tap **📦 Stock** → **Add Product**
2. Fill in the form:
   - **Product Photo:** Tap emoji picker to select an icon
   - **Product Name:** e.g., "Cooking Oil 1L"
   - **Barcode:** (optional) Scan or paste barcode
   - **Product Type:** Choose one:
     - **📦 Standard** — regular packaged goods
     - **⚖️ Bulk** — sold by weight/volume
     - **🛎️ Service** — airtime, M-Pesa, labour (no stock)

3. **For Standard products:**
   - **Selling Price:** What you charge customers
   - **Cost Price:** What you paid (used for profit calculation)
   - **Stock Qty:** How many you have
   - **Unit:** (e.g., "packet", "bottle", "piece")

4. **For Bulk products:**
   - **Price per unit:** e.g., `180` (KSh per kg)
   - **Unit:** kg, g, litre, ml, or piece
   - **Stock:** e.g., `50` kg
   - **Unit name:** Display label (e.g., "per kg")

5. **For Service products:**
   - **Selling Price:** Fixed price (e.g., `500` for airtime topup)
   - **No stock needed** — system never complains about stock
   - **Cost Price:** Optional (if you track commission)

6. Tap **Save Product**

#### **Edit a Product**

1. Tap **📦 Stock**
2. Find the product → swipe left or tap the three dots
3. Tap **✏️ Edit**
4. Update any field
5. Tap **Save Product**

#### **Delete a Product**

1. Tap **📦 Stock**
2. Find the product → swipe left
3. Tap **🗑 Delete**
4. Confirm

#### **Restock a Product**

1. Tap **📦 Stock**
2. Find the product with low stock (amber badge)
3. Tap **↑ Restock** or the product card
4. Enter qty to add and cost (optional)
5. Tap **Add Stock**
   - Stock increases automatically
   - Cost is logged as an expense (optional)

---

### Making a Sale

#### **Sell Standard or Bulk Items**

1. Tap **🧾 Sales**
2. Find the product by:
   - **Tapping the grid** to browse categories
   - **Searching** by name or category
   - **Starring** favourite products for quick access

3. **For Standard products:**
   - Tap the product → select Fresh or Fried (if applicable) → tap again to increase qty
   - Or tap **+** button to add

4. **For Bulk products:**
   - Tap the product → enter decimal qty (e.g., `2.5` kg) → **Add to Cart**
   - Price updates live

5. **For Service products:**
   - Tap the product → qty auto-set to 1
   - Total price shows on cart

#### **Checkout**

1. Tap **🛒 Cart** (shows qty badge)
2. Review items:
   - Adjust quantities with **−** and **+**
   - Swipe left to remove items
3. Enter optional **Customer Note** (e.g., "Called ahead")
4. Choose **Payment Method:**
   - 💵 **Cash**
   - 📱 **M-Pesa**
   - 💳 **Card**
   - 📒 **Credit** (customer owes money)
5. **Record Sale** → see receipt
6. Optional: **Share on WhatsApp** or **Print**

#### **Credit Sales**

When you tap **Record Sale** with **Credit** selected:
- A new entry is added to **💳 Debts**
- Customer name is recorded
- Balance is tracked automatically
- You can send **WhatsApp reminders** anytime

---

### Reports & Analytics

#### **View Sales Reports**

1. Tap **📊 Reports**
2. Filter by period:
   - **Today** — compare to yesterday
   - **Week** — last 7 days
   - **Month** — current month
   - **All Time** — total since start

3. **KPIs shown:**
   - **Revenue** — total sales
   - **Gross Profit** — after cost of goods
   - **Net Profit** — after expenses
   - **Transactions** — number of sales
   - **Avg Sale** — average transaction value
   - **Total Expenses** — shop expenses

4. **Charts:**
   - **7-day Sales Trend** — bar chart showing daily revenue
   - **Top Products** — which items made the most money
   - **Payment Methods** — cash vs M-Pesa split
   - **Expenses** — breakdown by category

#### **Export Reports**

1. Tap **📤 Export**
2. Choose format:
   - **📄 PDF** — printable report with all details
   - **📊 CSV** — spreadsheet-ready data

3. PDF opens in print dialog — save as PDF or print directly

---

### Stock Management

#### **View Inventory**

1. Tap **📦 Stock**
2. See all products with:
   - **Stock status badges:**
     - 🟢 Green — healthy stock
     - 🟡 Amber — running low
     - 🔴 Red — out of stock
   - **Qty in stock** and unit (e.g., "50 packets" or "12.5 kg")
   - **⭐ Star** to mark as favourite (appears in Sales for quick access)

#### **Low Stock Alerts**

- Products below the low-stock threshold (default: 5 units) show an **amber badge**
- A notification dot appears on the **📦 Stock** tab
- Tap to quickly restock

#### **Dashboard Insights**

On the home screen (**Home**):
- **Stock Status** — "3 out of stock, 5 running low"
- **Top Movers** — best-selling items this week
- **Restock Alerts** — items needing inventory

---

### Credit & Debt Tracking

#### **Sell on Credit**

1. During checkout, select **📒 Credit** as payment method
2. Enter **Customer Name** (required)
3. Tap **Record Sale**
4. The debt is auto-logged

#### **View Debts**

1. Tap **💳 Debts**
2. See all customers with amounts owed:
   - **Pending** — not paid yet (red badge)
   - **Partial** — part paid (amber badge)
   - **Paid** — settled (green badge)

3. Click on a customer to:
   - **View details** — amount, items bought
   - **Mark Paid** — choose payment method
   - **Send WhatsApp reminder** — auto-formatted message
   - **Edit** — change due date or amount
   - **Delete** — remove the record

#### **Record a Payment**

1. Tap **💳 Debts**
2. Find the customer → tap **💵 Mark Paid**
3. Choose payment method:
   - 💵 Cash
   - 📱 M-Pesa
   - 💳 Card
   - 🤝 Other
4. Amount defaults to full balance (edit if partial)
5. Tap **Confirm**

---

### Staff Management

**Owner only**

#### **Add a Staff Member**

1. Tap **👥 Staff**
2. Tap **Add Staff**
3. Enter:
   - **Full Name** (e.g., "James Kipchoge")
   - **PIN** (4 digits, e.g., "5678")
   - **Role** (optional: notes on their job)
4. Tap **Save**
   - A **Shop Code** is auto-generated (share with staff)
   - Staff uses: Shop Code + Name + PIN to sign in

#### **View Staff Activity**

1. Tap **👥 Staff**
2. See all staff members and their stats:
   - Number of sales made today
   - Total revenue attributed to them
3. Tap a staff member to see detailed activity log

#### **Remove Staff**

1. Tap **👥 Staff**
2. Find the staff member → tap **🗑 Remove**
3. Confirm

---

## 🏷️ Product Types

POSH supports three product types, each with unique handling:

### 1. **Standard Products** (Default)
**What it is:** Traditional packaged goods — bottles, cans, packets, units.

**Examples:**
- Water bottle 500ml → 20 units → KSh 30 each
- Soda case (24 bottles) → 5 units → KSh 1,000 each
- Bread loaf → 12 units → KSh 50 each

**How it works:**
- Stock is **whole numbers** (you can't sell 0.5 packets)
- Qty shown on checkout as `+` button or qty badge
- Stock decreases by qty sold (e.g., sell 2 → stock drops by 2)
- Out-of-stock products are **disabled** on the sell screen

**Pricing:**
- Single price per unit (or Fresh/Fried for fish/omena)
- Cost price is saved (used for profit calculation)

---

### 2. **Bulk / Loose Products**
**What it is:** Items sold by weight or volume — oil, grains, sugar, flour, scoops.

**Examples:**
- Cooking oil → 50 kg in stock → KSh 180 per kg
- Wheat flour → 100 kg → KSh 45 per kg
- Sugar → 40 litres → KSh 120 per litre (if liquid measurement)

**How it works:**
- Stock is **decimal** (you can sell 0.5 kg, 2.75 litres, etc.)
- Tapping the product opens a **qty input modal**
- Price is **calculated live:** qty × price per unit
- Stock decreases accurately (e.g., sell 2.5 kg → stock drops by 2.5 kg)

**Pricing:**
- **Price per unit:** KSh per kg / litre / etc.
- Cost price saved (for profit tracking)
- Unit displayed on card (e.g., "per kg")

**Stock Display:**
- Shows remaining stock with unit (e.g., "12.5 kg left")
- Alerts fire when stock < low-stock threshold in the chosen unit

---

### 3. **Service Products**
**What it is:** No-stock items — airtime, M-Pesa, printing, labour, repairs.

**Examples:**
- Airtime KSh 500
- M-Pesa withdrawal fee — KSh 50
- Photo printing — KSh 10 per page
- Labour (repair work) — KSh 2,000/hour

**How it works:**
- **No stock tracking** — system never complains about stock running out
- Qty defaults to **1**
- Tapping the product adds it to cart immediately
- Stock badge shows **"Service"** instead of "Out of stock"
- No stock deduction on sale

**Pricing:**
- Fixed price per service
- Cost price optional (e.g., if you track commission)

---

## 🔧 Technical Setup

### Prerequisites
- **Web browser** (Chrome, Safari, Firefox)
- **Internet connection** (for cloud sync; optional for offline mode)
- **Firebase project** (for cloud backup)

### Installation (Self-Hosted)

#### **1. Clone the repository**
```bash
git clone https://github.com/yourusername/posh.git
cd posh
```

#### **2. Set up Firebase**

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Create a new project (or use existing)
3. Enable:
   - **Authentication** → Email/Password & Google Sign-In
   - **Firestore Database** → Start in test mode
4. Copy your Firebase config from Project Settings
5. Update `firebase.js` with your config:
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

#### **3. Deploy**

**Option A: Netlify (Recommended)**
```bash
# Install Netlify CLI
npm install -g netlify-cli

# Deploy
netlify deploy --prod
```

**Option B: Vercel**
```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel --prod
```

**Option C: GitHub Pages**
- Enable GitHub Pages in repo settings
- Push to `main` branch → auto-deploys

#### **4. Local Development**
```bash
# Start a local server (Python)
python3 -m http.server 8000

# Open http://localhost:8000 in browser
```

### File Structure
```
posh/
├── index.html          # Main HTML (modals, layout)
├── app.js              # Core logic, sales, inventory
├── firebase.js         # Cloud sync & auth
├── firebase-auth.js    # Owner sign-in flow
├── staff.js            # Staff sign-in & PIN entry
├── features.js         # Extended features (POs, CRM, etc.)
├── quickwins.js        # Quick wins, reports, shortcuts
├── barcode.js          # Barcode scanning
├── product-images.js   # Product emoji picker
├── styles.css          # Styling
├── manifest.json       # PWA manifest
└── sw.js               # Service worker (offline cache)
```

---

## 💾 Data Persistence

### Local Storage
- **Instant load** — app starts immediately from cached data
- **Survives offline** — changes saved locally even with no internet
- **Size limit** — ~5-10 MB per browser

### Cloud Sync (Firebase Firestore)
- **2-second debounce** — changes sync to cloud after 2 seconds of inactivity
- **Automatic** — no manual "sync" button needed
- **Multi-device** — changes from other devices appear in real-time
- **Backup** — your data is safely stored on Google's servers

### Data Structure in Cloud
```
Firestore:
  shops/
    {shop-code}/
      products: [ {id, name, price, stock, ...}, ... ]
      sales: [ {id, ts, total, items, payment, ...}, ... ]
      expenses: [ {id, ts, desc, amount, category}, ... ]
      debts: [ {id, name, amount, paid, status, ...}, ... ]
      lastSync: "2025-05-06T12:34:56Z"
```

---

## 🐛 Bug Fixes & Improvements (v3.0)

### Critical Fixes
✅ **Unsafe JSON parsing** — all `localStorage.getItem` calls now wrapped in try-catch; corrupted data won't crash the app  
✅ **Firestore listener memory leak** — listeners properly unsubscribed; no duplicate syncs  
✅ **Profit calculation bug** — cost now read from sale item (not product), so deleted products don't inflate profit  
✅ **Cart item tracking** — cost saved on every cart item for accurate profit reporting  

### Feature Additions
✅ **Product types system** — standard, bulk, service products with unique handling  
✅ **Bulk product support** — sell by weight/volume with decimal quantities  
✅ **Service products** — no-stock items like airtime and M-Pesa  
✅ **Enhanced validation** — all form inputs checked before save  

---

## ❓ Troubleshooting

### **App won't load**
- Clear browser cache (Settings → Clear Data)
- Try incognito/private mode
- Check that Firebase config is correct in `firebase.js`

### **Data not syncing to cloud**
- Check internet connection (look for sync banner at top)
- Refresh the page (`Ctrl+R`)
- Check Firebase Firestore permissions (test mode should work)
- Check browser console for errors (`F12` → Console)

### **Offline sales not syncing**
- Offline sales are saved locally ✅
- When back online, app syncs automatically
- If app is closed, re-open to trigger sync

### **Stock showing decimal in standard products**
- Products default to `standard` type
- If you need decimal stock, change product type to `bulk`
- Edit the product → change type → save

### **Staff can't sign in**
- Verify **Shop Code** is correct (ask owner)
- Verify staff **name** matches exactly
- Verify **PIN** is numeric and correct length
- Owner must create the staff member first in **👥 Staff**

### **Out of localStorage space**
- Export and archive old reports (reduces data)
- Delete old expenses and completed debts
- Consider using smaller emoji set

### **Lost internet during sale**
- Sale is saved locally ✅
- Checkout normally, accept receipt
- When online again, sale syncs to cloud automatically

---

## 🤝 Support & Contributing

### Report a Bug
1. Open an issue on [GitHub Issues](https://github.com/yourusername/posh/issues)
2. Include:
   - What happened (steps to reproduce)
   - What you expected
   - Screenshots (if relevant)
   - Your device & browser version

### Suggest a Feature
- Open a GitHub Discussion or Issue with label `enhancement`
- Describe the use case
- Explain how it solves a problem

### Contribute Code
1. Fork the repo
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit changes: `git commit -m "Add my feature"`
4. Push: `git push origin feature/my-feature`
5. Open a Pull Request

### Contact
- **Email:** support@posh.local
- **WhatsApp:** [Link to WhatsApp]
- **Issues:** GitHub Issues (fastest response)

---

## 📄 License

POSH is released under the **MIT License** — free to use, modify, and distribute.

See `LICENSE` file for details.

---

## 🎯 Roadmap

- [ ] Inventory forecasting (predict stock-outs)
- [ ] Customer profiles & purchase history
- [ ] Receipt email sending
- [ ] Multi-location (head office + branches)
- [ ] Advanced POS integrations (scales, card readers)
- [ ] SMS reminders for credit customers
- [ ] Role-based permission granularity

---

## 💡 Tips for Best Results

1. **Set realistic low-stock alerts** (e.g., 5 packets, not 100)
2. **Add cost prices** for accurate profit reporting
3. **Use favorites** ⭐ for your top 5 products
4. **Export weekly reports** for business review
5. **Train staff on PINs** — don't share across staff
6. **Backup data** — export monthly PDF reports
7. **Check Daily Goal** — set a realistic target (e.g., KSh 2,000)
8. **Update product prices** regularly to reflect supplier changes

---

## 📞 Version Info

- **Current Version:** 3.0
- **Release Date:** May 2025
- **Last Updated:** 2025-05-06

**Changelog:**
- v3.0 — Product types (standard, bulk, service), bug fixes
- v2.5 — Multi-device sync, real-time updates
- v2.0 — Cloud backup with Firestore
- v1.0 — Offline-first PWA for single device

---

**Made with ❤️ for small retailers in Kenya.**

*POSH — keeping your point of sale simple, fast, and always online (or offline).*
