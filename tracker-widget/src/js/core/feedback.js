// --- js/core/feedback.js ---
// SEND FEEDBACK — for beta testers.
// Opens a small panel: what happened / what would you change. On "Send", it opens the
// person's own email app with the message ready (nothing is sent by Cortex itself).
// Technical details (app version, device, the last errors logged by boot.js) are
// attached only if the box is ticked, and are shown in full before sending.
//
// Open it with: the command bar ("feedback", "segnala un problema"), Account, or the [?] guide.

(function () {
    'use strict';

    // Where feedback goes. Set it to the contact address you publish on the privacy page.
    // While it's empty, the panel only offers "Copy".
    const FEEDBACK_EMAIL = '';
    const esc = (s) => (typeof escapeHtml === 'function' ? escapeHtml(String(s ?? '')) : String(s ?? ''));

    async function appVersion() {
        try {
            const keys = await caches.keys();
            const k = keys.find(x => /cortex-os-cache-v\d+/.test(x));
            if (k) return 'v' + k.match(/v(\d+)/)[1];
        } catch (e) { /* no cache API */ }
        return 'dev';
    }

    function recentErrors() {
        try { return JSON.parse(localStorage.getItem('cortex_error_log') || '[]').slice(0, 8); } catch (e) { return []; }
    }

    async function technicalDetails() {
        const isPhone = typeof isMobileViewMode !== 'undefined' && isMobileViewMode;
        const app = window.__TAURI__ ? 'desktop app' : (window.matchMedia('(display-mode: standalone)').matches ? 'installed web app' : 'browser');
        const errs = recentErrors();
        return [
            `App: ${await appVersion()} · ${app} · ${isPhone ? 'phone layout' : 'desktop layout'}`,
            `Device: ${navigator.userAgent}`,
            `Screen: ${window.innerWidth}×${window.innerHeight}`,
            errs.length ? 'Recent errors:\n' + errs.map(e => `- ${e.at.slice(0, 16).replace('T', ' ')} ${e.msg}`).join('\n') : 'Recent errors: none'
        ].join('\n');
    }

    function close() { document.getElementById('feedback-panel')?.remove(); }

    async function openFeedback(prefill = '') {
        if (typeof closeTerminal === 'function') closeTerminal();
        close();
        const details = await technicalDetails();
        const canEmail = Boolean(FEEDBACK_EMAIL);
        const root = document.getElementById('modals-root') || document.body;
        const wrap = document.createElement('div');
        wrap.id = 'feedback-panel';
        wrap.className = 'ob-overlay';
        wrap.innerHTML = `
            <div class="ob-panel" role="dialog" aria-modal="true" aria-label="Send feedback">
                <div class="ob-top"><span class="ob-brand">FEEDBACK</span><button type="button" class="ghost-btn" data-close>Close</button></div>
                <h2 class="ob-title">What happened, or what would you change?</h2>
                <p class="ob-text">Anything helps: something that broke, something confusing, something you wish it did.${canEmail ? ' Your email app opens with the message ready, so you can read it before it goes.' : ''}</p>
                <textarea class="form-control fb-text" id="fb-text" rows="5" placeholder="e.g. I typed “dentist friday 3pm” and it put it on Thursday">${esc(prefill)}</textarea>
                <label class="fb-check"><input type="checkbox" id="fb-tech" checked> Include technical details</label>
                <pre class="fb-details" id="fb-details">${esc(details)}</pre>
                <div class="ob-actions">
                    ${canEmail ? '<button type="button" class="btn btn-primary" data-send>[OPEN EMAIL]</button>' : ''}
                    <button type="button" class="${canEmail ? 'ghost-btn' : 'btn btn-primary'}" data-copy>${canEmail ? 'Copy instead' : '[COPY MESSAGE]'}</button>
                </div>
            </div>`;
        root.appendChild(wrap);

        const text = wrap.querySelector('#fb-text');
        const tech = wrap.querySelector('#fb-tech');
        const pre = wrap.querySelector('#fb-details');
        const message = () => text.value.trim() + (tech.checked ? '\n\n---\n' + details : '');

        tech.addEventListener('change', () => { pre.style.display = tech.checked ? '' : 'none'; });
        wrap.querySelector('[data-close]').addEventListener('click', close);
        wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
        wrap.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
        wrap.querySelector('[data-send]')?.addEventListener('click', () => {
            if (!text.value.trim()) { text.focus(); return; }
            window.location.href = `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent('Cortex beta feedback')}&body=${encodeURIComponent(message())}`;
            close();
        });
        wrap.querySelector('[data-copy]').addEventListener('click', async () => {
            if (!text.value.trim()) { text.focus(); return; }
            try {
                await navigator.clipboard.writeText(message());
                if (typeof showToast === 'function') showToast('[FEEDBACK] Copied: paste it in a message to the Cortex team');
                close();
            } catch (e) {
                if (typeof showToast === 'function') showToast('[FEEDBACK] Could not copy: select the text and copy it by hand');
            }
        });
        text.focus();
    }

    window.openFeedback = openFeedback;
})();
