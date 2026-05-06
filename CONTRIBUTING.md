# Contributing to POSH

Thank you for your interest in contributing to **POSH — Point of Sale Hub**! We welcome contributions of all kinds: bug reports, feature requests, code improvements, documentation, and translations.

---

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How to Contribute](#how-to-contribute)
- [Reporting Bugs](#reporting-bugs)
- [Suggesting Features](#suggesting-features)
- [Submitting Code](#submitting-code)
- [Development Setup](#development-setup)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Commit Messages](#commit-messages)
- [Pull Request Process](#pull-request-process)

---

## 💬 Code of Conduct

By participating in this project, you agree to:

- **Be respectful** — Welcome people of all backgrounds and experience levels
- **Give credit** — Acknowledge others' work and ideas
- **Assume good intent** — Approach disagreements constructively
- **Focus on the work** — Keep discussions about the code, not about people

Violations of this code may result in removal from the project.

---

## 🤝 How to Contribute

### 1. **Report a Bug**
See [Reporting Bugs](#reporting-bugs) below.

### 2. **Suggest a Feature**
See [Suggesting Features](#suggesting-features) below.

### 3. **Fix an Issue**
- Look for issues labeled `good first issue` or `help wanted`
- Comment on the issue: "I'd like to work on this"
- Wait for approval, then submit a PR

### 4. **Improve Documentation**
- Fix typos in README.md, CHANGELOG.md, or code comments
- Add examples for existing features
- Translate docs to other languages
- Improve clarity or accuracy

### 5. **Optimize Performance**
- Profile the app (look for slow functions)
- Submit improvements to rendering, storage, or sync logic
- Include before/after metrics

---

## 🐛 Reporting Bugs

### Use the Bug Report Template

1. Go to [GitHub Issues](https://github.com/yourusername/posh/issues) → **New Issue**
2. Select **Bug Report**
3. Fill in:

```markdown
## Description
Brief description of the bug.

## Steps to Reproduce
1. Go to '...'
2. Tap on '...'
3. See error

## Expected Behavior
What should happen.

## Actual Behavior
What actually happened.

## Screenshots
[If applicable]

## Device & Browser
- Device: [e.g., iPhone 12, Samsung Galaxy A10]
- Browser: [e.g., Safari 14, Chrome 90]
- OS: [e.g., iOS 14.5, Android 11]
- App Version: [e.g., 3.0.0]

## Logs
[If available, paste console errors (F12 → Console)]

## Additional Context
Any other context.
```

### Bug Report Tips

- **Be specific:** "Can't add product" is vague; "Adding product with price 0 crashes app" is clear
- **Include steps:** We need to reproduce the bug
- **One bug per issue:** Don't combine multiple issues
- **Search first:** Check if the bug is already reported
- **Screenshot help:** Show what you see (text in screenshot is helpful)

---

## 💡 Suggesting Features

### Use the Feature Request Template

1. Go to [GitHub Issues](https://github.com/yourusername/posh/issues) → **New Issue**
2. Select **Feature Request**
3. Fill in:

```markdown
## Problem
What problem would this solve?

## Proposed Solution
Describe your idea.

## Examples
Show how it would work in practice.

## Alternatives
Any other approaches you considered?

## Additional Context
Why is this important?
```

### Feature Request Tips

- **Explain the problem first:** Why do we need this?
- **Show use cases:** How would real shops use this?
- **Keep it focused:** One feature per request
- **Research first:** Has this been suggested before?
- **Be open to feedback:** We may refine your idea together

---

## 💻 Submitting Code

### Fork & Clone

```bash
# 1. Fork on GitHub (click "Fork" button)
# 2. Clone your fork
git clone https://github.com/YOUR-USERNAME/posh.git
cd posh

# 3. Add upstream remote
git remote add upstream https://github.com/ORIGINAL-OWNER/posh.git
```

### Create a Branch

```bash
# Update from latest upstream
git fetch upstream

# Create a feature branch
git checkout -b feature/my-feature upstream/main
# or for a bug fix
git checkout -b bugfix/issue-123 upstream/main
```

### Make Your Changes

- Edit code
- Test thoroughly (see [Testing](#testing))
- Update documentation if needed
- Commit with clear messages (see [Commit Messages](#commit-messages))

### Push & Open a PR

```bash
# Push your branch
git push origin feature/my-feature

# Go to GitHub, click "Compare & Pull Request"
```

---

## 🛠 Development Setup

### Prerequisites

- **Browser:** Chrome, Safari, or Firefox (latest)
- **Code editor:** VS Code (or your preference)
- **Git:** Installed and configured
- **Node.js:** (optional, for linting/bundling)

### Local Development

#### 1. **Clone & Setup**
```bash
git clone https://github.com/yourusername/posh.git
cd posh
```

#### 2. **Start a Local Server**

**Python 3:**
```bash
python3 -m http.server 8000
# Open http://localhost:8000
```

**Node.js:**
```bash
npx http-server
# Open http://localhost:8080
```

#### 3. **Firebase Setup** (for cloud sync testing)

- Create a Firebase project (or use existing)
- Copy your config to `firebase.js`
- Create Firestore database in test mode
- Test with real cloud sync

#### 4. **Open Developer Tools**
- Press `F12` (or `Cmd+Option+I` on Mac)
- **Console tab:** Check for JavaScript errors
- **Application tab:** View localStorage and IndexedDB
- **Network tab:** Monitor API calls and offline behavior

---

## 📝 Coding Standards

### JavaScript Style

We follow **vanilla JavaScript** conventions:

```javascript
// ✅ DO: Clear, descriptive names
function calculateTotalRevenue(sales) {
  return sales.reduce((sum, s) => sum + s.total, 0);
}

// ❌ DON'T: Unclear abbreviations
function calc(s) {
  return s.reduce((t, x) => t + x.total, 0);
}
```

### Variable Naming

```javascript
// ✅ DO
const isOnline = navigator.onLine;
const products = [];
const MAX_PIN_ATTEMPTS = 3;

// ❌ DON'T
const online = navigator.onLine;
const p = [];
const max = 3;  // max what?
```

### Comments & Documentation

```javascript
// ✅ DO: Explain WHY, not WHAT
// BUG FIX: cost saved on sale item prevents profit inflation if product deleted
function calculateProfit(sale) {
  const cost = sale.item.cost || 0;
  return sale.item.price - cost;
}

// ❌ DON'T: State the obvious
// Get the cost
const cost = sale.item.cost;
```

### Functions

```javascript
// ✅ DO: Small, focused functions with clear intent
function validateProductName(name) {
  return name && name.trim().length > 0;
}

// ❌ DON'T: Large functions doing multiple things
function saveProduct() {
  // ...50 lines of validation, saving, syncing...
}
```

### Error Handling

```javascript
// ✅ DO: Always handle errors in try-catch
function safeParseLS(key, fallback) {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : fallback;
  } catch (e) {
    console.warn('Failed to parse', key);
    return fallback;
  }
}

// ❌ DON'T: Assume success
function parse(key) {
  return JSON.parse(localStorage.getItem(key));
}
```

### Global Variables

POSH uses top-level `var` declarations for Firebase to access (not `let`/`const`):

```javascript
// ✅ DO: Use var for globals accessed by Firebase
var products = [];
var sales = [];

// ❌ DON'T: Hide data in local scopes
const setupProducts = () => {
  const products = [];
  // Firebase can't access this
};
```

### Comments for Complex Logic

```javascript
// ✅ DO: Explain the why behind complex logic
function confirmSale() {
  // BUG FIX: skip stock deduction for service products (no stock tracking)
  // and handle decimal bulk stock correctly (e.g., 2.5kg - 1.5kg = 1kg)
  items.forEach(ci => {
    const p = products.find(x => x.id === ci.id);
    if (!p) return;
    if (getProdType(p) === 'service') return;
    p.stock = Math.max(0, Math.round((p.stock - ci.qty) * 100) / 100);
  });
}
```

---

## 🧪 Testing

### Manual Testing Checklist

Before submitting a PR, test on:

- [ ] **Chrome** on desktop
- [ ] **Safari** on iPhone/iPad (if possible)
- [ ] **Offline mode** (DevTools → Network → Offline)
- [ ] **Back online** (verify sync works)
- [ ] **Dark mode toggle**
- [ ] **Different product types** (standard, bulk, service)
- [ ] **Cart operations** (add, edit, remove, clear)
- [ ] **Checkout** with different payment methods
- [ ] **Stock deduction** (check numbers are correct)
- [ ] **Reports** (verify calculations)

### Testing Product Types

#### Standard Product
```
1. Create product: "Water 500ml", KSh 30, stock 100
2. Sell 2 units → stock drops to 98 ✅
3. Check profit = (2 × 30) - (2 × cost) ✅
```

#### Bulk Product
```
1. Create product: "Oil 50kg @ KSh 180/kg"
2. Sell 2.5 kg → price shown as 450, stock drops to 47.5 ✅
3. Sell 0.3 kg → price shown as 54, stock drops to 47.2 ✅
4. Verify no rounding errors in stock
```

#### Service Product
```
1. Create product: "Airtime KSh 500"
2. Sell 5 times → stock badge shows "Service", no error ✅
3. Stock never decreases ✅
```

### Testing Bug Fixes

- Test the specific scenario from the bug report
- Test edge cases (empty data, null values, negative numbers)
- Test on different devices/browsers
- Verify the fix doesn't break other features

### Browser DevTools Tips

```javascript
// Test localStorage corruption
localStorage.setItem('posh_data', 'invalid json');
location.reload(); // Should not crash

// Check if listeners are cleaned up
// Open DevTools → Application → Service Workers
// Should only be 1 active worker

// Test offline
DevTools → Network → Offline
Make a sale, go back online, verify sync
```

---

## 📬 Commit Messages

### Commit Message Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- **feat**: New feature (e.g., `feat(product-types): add bulk product support`)
- **fix**: Bug fix (e.g., `fix(sync): prevent duplicate firestore listeners`)
- **docs**: Documentation (e.g., `docs(readme): clarify bulk product setup`)
- **style**: Code style (e.g., `style: fix indentation in saveProduct`)
- **refactor**: Restructure code (e.g., `refactor(cart): extract qty validation`)
- **perf**: Performance (e.g., `perf(reports): optimize sale filtering`)
- **test**: Add tests (e.g., `test(cart): add product type edge cases`)

### Examples

```
✅ feat(products): add service product type with no-stock support

✅ fix(profit): use saved cost from sale item, not product cost

✅ docs(readme): add bulk product examples and workflows

✅ fix(sync): unsubscribe old listener before creating new one

❌ fixed stuff
❌ Updated code
❌ asdf
```

### Commit Tips

- **One feature per commit** (easy to revert if needed)
- **Write in imperative mood:** "add feature" not "added feature"
- **Keep it short:** 50 chars in subject line
- **Reference issues:** "Fixes #123" automatically closes the issue

---

## 🔄 Pull Request Process

### Before You Submit

1. **Update from upstream:**
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

2. **Test thoroughly** (see [Testing](#testing))

3. **Update docs** if you changed features

4. **Sign off:** Add your name/email to commits
   ```bash
   git commit -m "message" --signoff
   ```

### Create a Pull Request

1. **Push your branch:**
   ```bash
   git push origin feature/my-feature
   ```

2. **Open PR on GitHub:**
   - Go to the repo → **Pull Requests** → **New PR**
   - Select your branch
   - Fill in the PR template:

```markdown
## Description
What does this PR do?

## Related Issue
Closes #123

## Changes Made
- Bullet point 1
- Bullet point 2

## Testing
How did you test this?

## Screenshots
[If UI changes]

## Checklist
- [ ] Code follows style guide
- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] No new warnings
```

### During Review

- **Address feedback respectfully:** We're improving code together
- **Re-test after changes:** Push new commits as you make fixes
- **Don't resolve conversations:** Let reviewers do that
- **Ask questions:** If feedback is unclear, ask for clarification
- **Be patient:** Reviews take time; we're all volunteers

### Merging

- A maintainer will merge your PR after approval
- Your changes go to `main` branch
- You'll be mentioned in the next release notes 🎉

---

## 📚 Additional Resources

- [JavaScript Style Guide](https://google.github.io/styleguide/javascriptguide.html)
- [Git Workflow](https://git-scm.com/book/en/v2/Git-Branching-Branching-Workflows)
- [How to Write Good Commit Messages](https://chris.beams.io/posts/git-commit/)
- [Firebase Docs](https://firebase.google.com/docs)
- [Service Workers & PWA](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps)

---

## 🙏 Thank You!

Every contribution — no matter how small — helps make POSH better for shops across Kenya and beyond. Thank you for being part of the community!

**Questions?** Open an issue or ask in discussions.

**Happy coding!** 🚀
