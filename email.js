/* ══════════════════════════════════════════════════
   EMAILJS CONFIGURATION
   ─────────────────────────────────────────────────
   SETUP STEPS:
   1. Go to https://www.emailjs.com and sign up free
   2. Click "Add New Service" → choose Gmail →
      connect ojiambodavid598@gmail.com → copy the Service ID
   3. Click "Email Templates" → "Create New Template"
      Use these exact variable names in your template:
        From:    {{from_name}} <{{reply_to}}>
        Subject: {{subject}}
        Body:    {{message}}
      Copy the Template ID.
   4. Go to "Account" → "Public Key" → copy it
   5. Paste all three values below:
══════════════════════════════════════════════════ */
const EMAILJS_PUBLIC_KEY  = 'Q3gr_rZXQDixBkzuC';
const EMAILJS_SERVICE_ID  = 'service_2n8h6sb';
const EMAILJS_TEMPLATE_ID = 'template_x3blpij';

// Initialize EmailJS with your public key
if (typeof emailjs !== 'undefined') {
    emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });
}

/* ──────────────────────────── FORM VALIDATION ── */
function validateForm() {
    let valid = true;

    const fields = [
        { id: 'from_name', errId: 'err-name',    check: v => v.trim().length >= 2 },
        { id: 'reply_to',  errId: 'err-email',   check: v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) },
        { id: 'subject',   errId: 'err-subject', check: v => v.trim().length >= 3 },
        { id: 'message',   errId: 'err-message', check: v => v.trim().length >= 10 },
    ];

    fields.forEach(({ id, errId, check }) => {
        const input = document.getElementById(id);
        const err   = document.getElementById(errId);
        if (!input) return;

        if (!check(input.value)) {
            input.classList.add('input-error');
            if (err) err.classList.add('visible');
            valid = false;
        } else {
            input.classList.remove('input-error');
            if (err) err.classList.remove('visible');
        }

        // Live clear error on fix — use dataset flag to avoid stacking listeners
        if (!input.dataset.poshLiveValidated) {
            input.dataset.poshLiveValidated = '1';
            input.addEventListener('input', () => {
                if (check(input.value)) {
                    input.classList.remove('input-error');
                    if (err) err.classList.remove('visible');
                }
            });
        }
    });

    return valid;
}

/* ──────────────────────────── SEND EMAIL ── */
async function handleSubmit(e) {
    e.preventDefault();

    // HONEYPOT SPAM CHECK
    const website = document.getElementById('website');

    if (website && website.value.trim() !== '') {
        return;
    }

    // RATE LIMIT (1 minute)
    const lastSent = localStorage.getItem("lastSent");

    if (lastSent && Date.now() - parseInt(lastSent, 10) < 60000) {
        showToast("Wait 1 minute before sending again", "error");
        return;
    }

    if (!validateForm()) return;

    localStorage.setItem("lastSent", Date.now());

    const btn     = document.getElementById('submitBtn');
    const btnText = document.getElementById('btnText');
    const spinner = document.getElementById('btnSpinner');
    const arrow   = document.getElementById('btnArrow');

    // Show loading state
    if (btnText) btnText.textContent = 'Sending…';
    if (spinner) spinner.classList.remove('hidden');
    if (arrow)   arrow.classList.add('hidden');
    if (btn)     btn.disabled = true;

    try {
        await emailjs.sendForm(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, '#contactForm');
        onSuccess(e.target, btn, btnText, spinner, arrow);
        showToast('Message sent! I\'ll reply to you soon.');
    } catch (error) {
        console.error('EmailJS error:', error);
        onError(btn, btnText, spinner, arrow);
        showToast('Something went wrong. Try emailing ojiambodavid598@gmail.com directly.', 'error');
    }
}

function onSuccess(form, btn, btnText, spinner, arrow) {
    if (btnText) btnText.textContent = '✓ Sent!';
    if (spinner) spinner.classList.add('hidden');
    if (arrow)   arrow.classList.remove('hidden');
    if (btn) {
        btn.disabled = false;
        btn.classList.add('btn-success');
    }
    form.reset();
    // Clear all error states
    document.querySelectorAll('.input-error').forEach(el => el.classList.remove('input-error'));
    document.querySelectorAll('.field-error.visible').forEach(el => el.classList.remove('visible'));

    setTimeout(() => {
        if (btnText) btnText.textContent = 'Send Message';
        if (btn) btn.classList.remove('btn-success');
    }, 3500);
}

function onError(btn, btnText, spinner, arrow) {
    if (btnText) btnText.textContent = 'Try Again';
    if (spinner) spinner.classList.add('hidden');
    if (arrow)   arrow.classList.remove('hidden');
    if (btn)     btn.disabled = false;
}

function showToast(message, type = 'success') {
    // BUG FIX: app.js toast() uses textContent directly, wiping child spans.
    // For plain success messages, delegate to app.js toast().
    // For error type, use a separate visual approach via CSS class on the toast.
    const toastEl = document.getElementById('toast');
    if (!toastEl) return;

    if (type === 'success' && typeof window.toast === 'function') {
        window.toast(message);
        return;
    }

    // Error / special type: set textContent (compatible with app.js structure)
    toastEl.textContent = (type === 'error' ? '❌ ' : '') + message;
    toastEl.classList.remove('toast-error');
    if (type === 'error') toastEl.classList.add('toast-error');

    toastEl.classList.add('show');
    clearTimeout(toastEl._hideTimer);
    toastEl._hideTimer = setTimeout(() => toastEl.classList.remove('show'), 5000);
}

window.handleSubmit = handleSubmit;

