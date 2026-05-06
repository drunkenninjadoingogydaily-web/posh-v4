# Changelog

All notable changes to POSH — Point of Sale Hub are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [3.0.0] — 2025-05-06

### ✨ Added

#### Product Types System
- **Three product types** for flexible selling:
  - **Standard**: Traditional packaged goods (default, backward-compatible)
  - **Bulk**: Weight/volume-based items (oil, grains, sugar, flour)
  - **Service**: No-stock items (airtime, M-Pesa, printing, labour)
- **Type-specific UI:**
  - Standard: qty stepper, single/dual prices
  - Bulk: decimal qty input modal, price-per-unit display, live preview
  - Service: no stock tracking, qty defaults to 1
- **Type visibility controls:** Product forms show/hide fields based on selected type

#### Bulk Product Support
- Sell by **weight or volume** (kg, g, litre, ml, piece)
- **Decimal quantities** (e.g., 2.5 kg, 0.75 L)
- **Price per unit calculation** displayed live during checkout
- **Accurate stock deduction** respecting decimal values
- **Stock display** shows remaining units with label (e.g., "12.5 kg left")
- **Low-stock alerts** work with bulk units correctly

#### Service Products
- Products with **no stock tracking**
- Never shows "Out of Stock" — service badge shows instead
- Perfect for **airtime, M-Pesa, printing, labour, repairs**
- Stock row hidden in product form when type = service
- **No cost deduction on sale**

### 🐛 Fixed

#### Critical Bug Fixes
- **Unsafe JSON parsing crashes:** All 14+ `JSON.parse(localStorage)` calls now wrapped in try-catch
  - Prevents app crash if localStorage is corrupted
  - Corrupted entries are automatically removed
  - Added `safeParseLS()` helper function
  - Affects: `quickwins.js` (6 fixes), `features.js` (1 fix), `firebase.js` (1 fix)

- **Firestore listener memory leak:** Real-time sync listeners now properly unsubscribed
  - Prevents duplicate listeners accumulating
  - Reduced memory usage on long sessions
  - `_cloudListenerUnsub` variable stores unsubscribe function
  - Old listener unsubscribed before creating new one

- **Profit calculation inflated for deleted products:**
  - Previously: if product deleted, cost defaulted to 0, inflating profit
  - Now: cost is read from the **sale item** (saved at time of transaction)
  - Historical sales always calculate correctly even if products later deleted
  - Affects all reports and analytics

- **Cost not saved on cart items:** Cost is now captured when item is added to cart
  - Ensures accurate profit even if product cost changes between sale and report
  - Improves financial accuracy for multi-user shops

- **Missing null checks in product lookups:** Inconsistent null checking fixed
  - `addToCartWithPrep` now checks product exists before using
  - All cart modifications validated before execution

#### Data Integrity
- **Migration step in loadData():** All existing products auto-get `prodType: 'standard'`
  - Zero data loss
  - Existing shops unaffected
  - Backward compatible

### 🎨 Improved

#### UI/UX Enhancements
- **Product card updates:**
  - Service products show "🛎️ Service" badge instead of "Out of stock"
  - Bulk products show unit label (e.g., "per kg") and price-per-unit
  - Standard products work exactly as before
  - All types show stock badge (green/amber/red)

- **Product form enhancements:**
  - **Type dropdown** with description hints
  - **Conditional fields** appear/hide based on product type
  - Bulk section shows: Price per unit + Unit selector (kg/g/litre/ml/piece)
  - Stock row hides for service products (no stock to track)
  - Better field organization

- **Stock display:**
  - Bulk shows remaining in units (e.g., "12.5 kg left")
  - Service shows "Service" instead of stock number
  - Standard shows unit count as before

### 📝 Documentation

- **User Manual:** Comprehensive 50-section guide covering:
  - Quick start for owners and staff
  - Step-by-step product type setup
  - Bulk product examples (oil, grains)
  - Service product examples (airtime, M-Pesa)
  - Sales workflows for each product type
  - Technical setup and deployment

---

## [2.5.0] — 2025-04-20

### ✨ Added

- **Real-time multi-device sync** via Firestore onSnapshot listeners
- **Staff activity logging** (sales per staff, revenue attributed)
- **Shift tracking** with start time and sales count
- **Product variants** UI framework for future expansion
- **Barcode scanning** preview modal

### 🐛 Fixed

- Barcode scanner timeout issues
- Staff role access control inconsistencies
- Cart item deletion on slow networks

### 📈 Performance

- Reduced Firestore read operations by 40%
- Optimized renderSales() for large product lists
- Improved emoji picker load time

---

## [2.0.0] — 2025-03-10

### ✨ Added

- **Cloud backup with Firebase Firestore**
- **Automatic sync** on every sale (debounced 2 seconds)
- **Multi-device support** (multiple shop devices sync in real-time)
- **Order History** with detailed transaction view
- **Product search** by name and category
- **Expense tracking** by category (Transport, Rent, Stock, Utilities, Other)

### 🐛 Fixed

- localStorage quota warnings
- Shop code uniqueness on multi-shop setups
- Sync timestamp comparison logic

### 🎨 Improved

- Dashboard insights now include cloud sync status
- Toast notifications for sync success/failure
- Offline banner shows when cloud sync is unavailable

---

## [1.0.0] — 2025-02-01

### ✨ Added

- **Core POS functionality:**
  - Add products with price, cost, stock, category, emoji
  - Quick add to cart with qty stepper
  - Multi-payment support (Cash, M-Pesa, Card, Credit)
  - Receipt with WhatsApp sharing

- **Offline-first PWA:**
  - Service worker for offline access
  - localStorage for data persistence
  - Install as app on iOS and Android
  - Works with zero internet connection

- **Multi-user support:**
  - Owner authentication (email/password)
  - Staff PIN-based access
  - Role-based access control (owner vs staff)
  - Idle timeout security

- **Inventory management:**
  - Stock tracking with low-stock alerts
  - Restock modal with cost logging
  - Product categories for filtering

- **Financial reports:**
  - Daily revenue and profit
  - Expense summary
  - Top products by revenue
  - Payment method breakdown
  - PDF export

- **Credit tracking:**
  - Sell on credit with auto-logging
  - Customer debt ledger
  - WhatsApp payment reminders
  - Partial payment support

- **UI/UX:**
  - Dark mode toggle
  - Favourite products (⭐)
  - Category filtering
  - Toast notifications
  - Responsive mobile design

---

## [Unreleased]

### 🔜 Planned

- [ ] Inventory forecasting
- [ ] Customer profiles with purchase history
- [ ] Email receipt sending
- [ ] Multi-location support (head office + branches)
- [ ] POS hardware integrations (scales, card readers)
- [ ] SMS credit reminders
- [ ] Advanced permission granularity
- [ ] Supplier management
- [ ] Purchase order system
- [ ] Product cost history & trending

---

## Notes on Versions

### Breaking Changes
- **v3.0:** Product type field added to products. Existing products auto-migrate to `prodType: 'standard'` — **zero breakage**.

### Backward Compatibility
- All versions maintain localStorage format
- Firebase Firestore schema is additive (new fields don't break old data)
- Staff PIN and shop code formats unchanged

### Migration Path
- v1.0 → v2.0: Automatic on first cloud sync
- v2.0 → v2.5: No migration needed
- v2.5 → v3.0: Automatic on app load (prodType assignment)

---

## Security & Data Privacy

- **v3.0:** Fixed JSON parsing vulnerabilities that could crash app on corrupt data
- **v2.0:** Introduced Firebase Firestore with Realtime Database security rules
- **v1.0:** localStorage only (single device, no cloud)

---

For detailed information on each release, see [GitHub Releases](https://github.com/yourusername/posh/releases).
