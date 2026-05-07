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

        // Live clear error on fix
        input.addEventListener('input', () => {
            if (check(input.value)) {
                input.classList.remove('input-error');
                if (err) err.classList.remove('visible');
            }
        }, { once: false });
    });

    return valid;
}

/* ──────────────────────────── SEND EMAIL ── */
async function handleSubmit(e) {
    e.preventDefault();

    if (!validateForm()) return;

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
    const toast  = document.getElementById('toast');
    if (!toast) return;

    const msgEl  = toast.querySelector('.toast-msg');
    const iconEl = toast.querySelector('.toast-icon');

    const icons = { success: '✅', error: '❌', konami: '🎉' };
    if (msgEl)  msgEl.textContent  = message;
    if (iconEl) iconEl.textContent = icons[type] || '✅';

    toast.classList.remove('toast-error');
    if (type === 'error') toast.classList.add('toast-error');

    toast.classList.add('show');
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => toast.classList.remove('show'), 5000);
}

window.handleSubmit = handleSubmit;

