// --- js/core/cloud-account.js ---
// CORTEX ACCOUNT: sign in with your email, sync your data across devices.
//
// - Users only type their email. They get a sign-in email (a link today; a 6-digit
//   code once custom email sending is set up). No other account is needed.
// - Backend: Supabase (project "cortex", EU/Frankfurt). Each user has ONE private row
//   in public.cortex_state; Row Level Security makes it readable only by its owner.
// - Writes are conditional on the version that was read (optimistic locking), so two
//   devices writing at the same moment never overwrite each other: the loser re-reads,
//   merges (js/core/sync-merge.js) and retries.
// - The publishable key below is designed to be public; security comes from RLS.

(function () {
    'use strict';

    const SB_URL = 'https://mnymditkuzbjkqrgoyvi.supabase.co';
    const SB_KEY = 'sb_publishable_V746HUncSzldft14-6pN1w_SO7k-l6m';
    const AUTH_KEY = 'cortex_auth';
    const PENDING_KEY = 'cortex_auth_pending_email';
    const APP_URL_FALLBACK = 'https://donatomartinelli.github.io/HabitTracker/';
    const esc = (s) => (typeof escapeHtml === 'function' ? escapeHtml(String(s ?? '')) : String(s ?? ''));

    // ------------------------------------------------------------------
    // Session
    // ------------------------------------------------------------------
    function loadSession() {
        try { return JSON.parse(cortexStore.getItem(AUTH_KEY) || 'null'); } catch (e) { return null; }
    }
    let session = loadSession();

    function saveSession(s) {
        session = s;
        if (s) cortexStore.setItem(AUTH_KEY, JSON.stringify(s));
        else cortexStore.removeItem(AUTH_KEY);
    }

    const isSignedIn = () => Boolean(session && session.refresh_token && session.user && session.user.id);
    const userId = () => (session && session.user ? session.user.id : null);
    const userEmail = () => (session && session.user ? session.user.email : null);

    function appUrl() {
        const isWeb = /^https?:$/.test(location.protocol) && !location.hostname.includes('tauri');
        return isWeb ? location.origin + location.pathname : APP_URL_FALLBACK;
    }

    // ------------------------------------------------------------------
    // HTTP helpers
    // ------------------------------------------------------------------
    async function call(path, { method = 'GET', body, token, headers = {} } = {}) {
        const h = Object.assign({ apikey: SB_KEY, 'Content-Type': 'application/json' }, headers);
        if (token) h.Authorization = `Bearer ${token}`;
        const res = await fetch(SB_URL + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store' });
        const text = await res.text();
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch (e) { json = null; }
        if (!res.ok) {
            const msg = (json && (json.msg || json.error_description || json.message || json.error)) || `HTTP ${res.status}`;
            const err = new Error(msg);
            err.status = res.status;
            err.code = json && (json.error_code || json.code);
            throw err;
        }
        return json;
    }

    function storeAuthResponse(r) {
        if (!r || !r.access_token || !r.refresh_token) throw new Error('Sign-in response incomplete');
        const expiresIn = Number(r.expires_in || 3600);
        saveSession({
            access_token: r.access_token,
            refresh_token: r.refresh_token,
            expires_at: Date.now() + expiresIn * 1000,
            user: r.user ? { id: r.user.id, email: r.user.email } : (session && session.user) || null
        });
    }

    async function ensureUser() {
        if (session && session.user && session.user.id) return;
        const u = await call('/auth/v1/user', { token: session.access_token });
        session.user = { id: u.id, email: u.email };
        saveSession(session);
    }

    // A valid access token, refreshed when it's about to expire
    let refreshing = null;
    async function token() {
        if (!isSignedIn() && !(session && session.refresh_token)) throw new Error('Not signed in');
        if (session.expires_at - Date.now() > 60 * 1000) return session.access_token;
        if (!refreshing) {
            refreshing = call('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: session.refresh_token } })
                .then(storeAuthResponse)
                .catch((err) => {
                    if (err.status === 400 || err.status === 401) {
                        saveSession(null);
                        if (typeof cortexNotify === 'function') cortexNotify('Your session expired. Sign in again to keep syncing.', 'warn');
                    }
                    throw err;
                })
                .finally(() => { refreshing = null; });
        }
        await refreshing;
        return session.access_token;
    }

    // ------------------------------------------------------------------
    // Sign in / out
    // ------------------------------------------------------------------
    async function sendSignInEmail(email) {
        const clean = String(email || '').trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clean)) throw new Error('Enter a valid email address.');
        await call(`/auth/v1/otp?redirect_to=${encodeURIComponent(appUrl())}`, {
            method: 'POST',
            body: { email: clean, create_user: true }
        });
        cortexStore.setItem(PENDING_KEY, clean);
        return clean;
    }

    // Accepts: a 6-digit code, the sign-in link from the email, or the app URL it redirected to
    async function completeSignIn(input) {
        const t = String(input || '').trim();
        if (!t) throw new Error('Paste the link from the email, or type the code.');

        if (/^\d{6,8}$/.test(t)) {
            const email = cortexStore.getItem(PENDING_KEY);
            if (!email) throw new Error('Enter your email first.');
            storeAuthResponse(await call('/auth/v1/verify', { method: 'POST', body: { type: 'email', email, token: t } }));
        } else if (t.includes('access_token=')) {
            const params = new URLSearchParams(t.slice(t.indexOf('#') + 1));
            storeAuthResponse({
                access_token: params.get('access_token'),
                refresh_token: params.get('refresh_token'),
                expires_in: params.get('expires_in')
            });
        } else {
            let url;
            try { url = new URL(t); } catch (e) { throw new Error("That doesn't look like the link from the email."); }
            const tokenHash = url.searchParams.get('token') || url.searchParams.get('token_hash');
            if (!tokenHash) throw new Error("That link doesn't contain a sign-in token.");
            const type = url.searchParams.get('type') || 'magiclink';
            storeAuthResponse(await call('/auth/v1/verify', { method: 'POST', body: { type, token_hash: tokenHash } }));
        }
        await ensureUser();
        cortexStore.removeItem(PENDING_KEY);
        afterSignIn();
        return userEmail();
    }

    function afterSignIn() {
        if (typeof showToast === 'function') showToast(`[☁ ACCOUNT] Signed in as ${userEmail()}`);
        if (typeof refreshSyncIndicatorFromState === 'function') refreshSyncIndicatorFromState();
        if (typeof syncNow === 'function') setTimeout(() => syncNow(true), 200);
        renderAccountPanel();
    }

    async function signOut() {
        try { if (session) await call('/auth/v1/logout', { method: 'POST', token: session.access_token }); } catch (e) { /* already gone */ }
        saveSession(null);
        if (typeof refreshSyncIndicatorFromState === 'function') refreshSyncIndicatorFromState();
        if (typeof showToast === 'function') showToast('[☁ ACCOUNT] Signed out. Your data stays on this device.');
        renderAccountPanel();
    }

    // Permanently deletes the account and its cloud data. Data on this device stays.
    async function deleteAccount() {
        const t = await token();
        await call('/rest/v1/rpc/delete_my_account', { method: 'POST', token: t, body: {} });
        saveSession(null);
        ['cortex_sync_base', 'cortex_sync_base_owner', 'cortex_sync_dirty_since', 'cortex_last_cloud_ts']
            .forEach(k => cortexStore.removeItem(k));
        if (typeof refreshSyncIndicatorFromState === 'function') refreshSyncIndicatorFromState();
        if (typeof showToast === 'function') showToast('[☁ ACCOUNT] Account deleted. Your data is still on this device.');
    }

    // The email link redirects back here with the tokens in the URL hash
    async function handleRedirect() {
        const h = location.hash || '';
        if (h.includes('error_description=')) {
            const p = new URLSearchParams(h.slice(1));
            history.replaceState(null, document.title, location.pathname + location.search);
            if (typeof cortexNotify === 'function') cortexNotify(`Sign-in link problem: ${p.get('error_description')}. Ask for a new link.`, 'warn');
            return;
        }
        if (!h.includes('access_token=')) return;
        try {
            const p = new URLSearchParams(h.slice(1));
            history.replaceState(null, document.title, location.pathname + location.search);
            storeAuthResponse({ access_token: p.get('access_token'), refresh_token: p.get('refresh_token'), expires_in: p.get('expires_in') });
            await ensureUser();
            cortexStore.removeItem(PENDING_KEY);
            afterSignIn();
        } catch (e) {
            if (typeof cortexNotify === 'function') cortexNotify(`Couldn't finish signing in: ${e.message}`);
        }
    }

    // ------------------------------------------------------------------
    // Data: one row per user, version-checked writes
    // ------------------------------------------------------------------
    async function fetchState() {
        const t = await token();
        const rows = await call(`/rest/v1/cortex_state?select=data,version&user_id=eq.${encodeURIComponent(userId())}`, { token: t });
        const row = Array.isArray(rows) && rows[0];
        const payload = row && row.data && typeof row.data === 'object' ? row.data : { version: 3, updatedAt: 0, data: {} };
        Object.defineProperty(payload, '__version', { value: row ? Number(row.version) : null, enumerable: false });
        return payload;
    }

    // Just the version number of the row: a few bytes, cheap enough to ask every few seconds
    async function fetchVersion() {
        const t = await token();
        const rows = await call(`/rest/v1/cortex_state?select=version&user_id=eq.${encodeURIComponent(userId())}`, { token: t });
        const row = Array.isArray(rows) && rows[0];
        return row ? Number(row.version) : null;
    }

    // Returns { ok: true } or { ok: false, latest } when another device wrote first
    async function saveState(payload, versionRead) {
        const t = await token();
        if (versionRead === null || versionRead === undefined) {
            try {
                await call('/rest/v1/cortex_state', {
                    method: 'POST', token: t, headers: { Prefer: 'return=minimal' },
                    body: { user_id: userId(), data: payload, version: 1 }
                });
                return { ok: true };
            } catch (e) {
                if (e.status === 409) return { ok: false, latest: await fetchState() };
                throw e;
            }
        }
        const updated = await call(
            `/rest/v1/cortex_state?user_id=eq.${encodeURIComponent(userId())}&version=eq.${Number(versionRead)}`,
            {
                method: 'PATCH', token: t, headers: { Prefer: 'return=representation' },
                body: { data: payload, version: Number(versionRead) + 1, updated_at: new Date().toISOString() }
            }
        );
        if (Array.isArray(updated) && updated.length) return { ok: true };
        return { ok: false, latest: await fetchState() };
    }

    // ------------------------------------------------------------------
    // Account panel
    // ------------------------------------------------------------------
    let panelStep = 'email';   // email → check-inbox → (signed in) → confirm-delete
    let panelError = '';

    function openAccountPanel() {
        if (typeof closeMoreSheet === 'function') closeMoreSheet();
        if (document.getElementById('account-panel')) { renderAccountPanel(); return; }
        const root = document.getElementById('modals-root');
        if (!root) return;
        const wrap = document.createElement('div');
        wrap.id = 'account-panel';
        wrap.className = 'modules-overlay';
        wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('[data-close]')) wrap.remove(); });
        wrap.addEventListener('keydown', (e) => { if (e.key === 'Escape') wrap.remove(); });
        root.appendChild(wrap);
        panelStep = cortexStore.getItem(PENDING_KEY) ? 'check-inbox' : 'email';
        panelError = '';
        renderAccountPanel();
    }

    function renderAccountPanel() {
        const wrap = document.getElementById('account-panel');
        if (!wrap) return;
        let body = '';
        if (isSignedIn() && panelStep === 'confirm-delete') {
            body = `
                <p class="modules-intro"><strong>Delete your account?</strong> This permanently removes your account and the copy of your data in the cloud. Other devices stop syncing. The data on this device stays here, and you can export it first.</p>
                <div class="account-error" aria-live="polite">${esc(panelError)}</div>
                <div class="account-actions">
                    <button type="button" class="btn btn-danger btn-sm" data-act="delete-confirm">[DELETE MY ACCOUNT]</button>
                    <button type="button" class="btn btn-sm" data-act="export">[EXPORT MY DATA]</button>
                    <button type="button" class="ghost-btn" data-act="delete-cancel">Cancel</button>
                </div>`;
        } else if (isSignedIn()) {
            const status = typeof cloudSyncStatus !== 'undefined' ? cloudSyncStatus : 'idle';
            const last = typeof lastSyncOkMs !== 'undefined' && lastSyncOkMs && typeof formatAgo === 'function' ? formatAgo(lastSyncOkMs) : 'not yet';
            body = `
                <p class="modules-intro">Signed in as <strong>${esc(userEmail())}</strong>. Your data syncs across every device where you sign in with this email. Only you can read it.</p>
                <div class="account-status"><span class="dim">STATUS</span><span>${esc(status)}</span><span class="dim">LAST SYNC</span><span>${esc(last)}</span></div>
                <div class="account-actions">
                    <button type="button" class="btn btn-primary btn-sm" data-act="sync">[⇅ SYNC NOW]</button>
                    <button type="button" class="btn btn-sm" data-act="conflicts">[SAVED CONFLICTS]</button>
                    <button type="button" class="ghost-btn danger" data-act="signout">Sign out</button>
                </div>
                <div class="account-actions account-secondary">
                    <button type="button" class="ghost-btn" data-act="export">Export my data</button>
                    <button type="button" class="ghost-btn" data-act="feedback">Send feedback</button>
                    <button type="button" class="ghost-btn danger" data-act="delete">Delete account</button>
                </div>`;
        } else if (panelStep === 'check-inbox') {
            const email = cortexStore.getItem(PENDING_KEY) || '';
            body = `
                <p class="modules-intro">We sent a 6-digit code to <strong>${esc(email)}</strong>. Type it here. It can take a minute to arrive; check the spam folder too.</p>
                <label class="account-field" for="account-link">Code
                    <input type="text" id="account-link" class="form-control" inputmode="numeric" autocomplete="one-time-code" placeholder="123456">
                </label>
                <div class="account-error" aria-live="polite">${esc(panelError)}</div>
                <div class="account-actions">
                    <button type="button" class="btn btn-primary btn-sm" data-act="verify">[SIGN IN]</button>
                    <button type="button" class="ghost-btn" data-act="restart">Use a different email</button>
                    <button type="button" class="ghost-btn" data-act="resend">Send again</button>
                </div>`;
        } else {
            body = `
                <p class="modules-intro">Sign in with your email to keep Cortex in sync on your laptop, phone and desktop app. No password, no other account: you get a sign-in email each time you add a device.</p>
                <label class="account-field" for="account-email">Email
                    <input type="email" id="account-email" class="form-control" autocomplete="email" placeholder="you@example.com">
                </label>
                <div class="account-error" aria-live="polite">${esc(panelError)}</div>
                <div class="account-actions">
                    <button type="button" class="btn btn-primary btn-sm" data-act="send">[SEND SIGN-IN EMAIL]</button>
                </div>
                <p class="account-note">Data on this device stays here and is merged with your account the first time you sign in. Nothing is deleted.</p>
                <div class="account-actions account-secondary">
                    <button type="button" class="ghost-btn" data-act="export">Export my data</button>
                    <button type="button" class="ghost-btn" data-act="feedback">Send feedback</button>
                    <a class="ghost-btn" href="https://donatomartinelli.github.io/cortex/privacy/" target="_blank" rel="noopener">Privacy</a>
                </div>`;
        }
        wrap.innerHTML = `
            <div class="modules-panel" role="dialog" aria-modal="true" aria-labelledby="account-title">
                <div class="modules-head">
                    <span id="account-title" class="section-label">Account and sync</span>
                    <button type="button" class="hdr-icon" data-close aria-label="Close">×</button>
                </div>
                ${body}
            </div>`;

        const busy = (btn, on, label) => { if (btn) { btn.disabled = on; if (label) btn.textContent = label; } };
        const act = (name) => wrap.querySelector(`[data-act="${name}"]`);

        act('send')?.addEventListener('click', async (e) => {
            const email = wrap.querySelector('#account-email').value;
            busy(e.currentTarget, true, '[SENDING…]');
            try { await sendSignInEmail(email); panelStep = 'check-inbox'; panelError = ''; }
            catch (err) { panelError = friendlyError(err); }
            renderAccountPanel();
        });
        wrap.querySelector('#account-email')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') act('send')?.click(); });
        act('verify')?.addEventListener('click', async (e) => {
            const v = wrap.querySelector('#account-link').value;
            busy(e.currentTarget, true, '[SIGNING IN…]');
            try { await completeSignIn(v); panelError = ''; }
            catch (err) { panelError = friendlyError(err); renderAccountPanel(); }
        });
        wrap.querySelector('#account-link')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') act('verify')?.click(); });
        act('restart')?.addEventListener('click', () => { cortexStore.removeItem(PENDING_KEY); panelStep = 'email'; panelError = ''; renderAccountPanel(); });
        act('resend')?.addEventListener('click', async (e) => {
            busy(e.currentTarget, true, 'Sending…');
            try { await sendSignInEmail(cortexStore.getItem(PENDING_KEY)); panelError = 'Sent again. Check your inbox and spam folder.'; }
            catch (err) { panelError = friendlyError(err); }
            renderAccountPanel();
        });
        act('sync')?.addEventListener('click', async (e) => {
            busy(e.currentTarget, true, '[SYNCING…]');
            if (typeof syncNow === 'function') await syncNow(true);
            renderAccountPanel();
        });
        act('conflicts')?.addEventListener('click', () => { wrap.remove(); if (typeof showSyncConflictsModal === 'function') showSyncConflictsModal(); });
        act('signout')?.addEventListener('click', () => signOut());
        wrap.querySelectorAll('[data-act="feedback"]').forEach(b => b.addEventListener('click', () => {
            wrap.remove();
            if (typeof openFeedback === 'function') openFeedback();
        }));
        wrap.querySelectorAll('[data-act="export"]').forEach(b => b.addEventListener('click', () => {
            if (typeof exportData === 'function') exportData();
        }));
        act('delete')?.addEventListener('click', () => { panelStep = 'confirm-delete'; panelError = ''; renderAccountPanel(); });
        act('delete-cancel')?.addEventListener('click', () => { panelStep = 'email'; panelError = ''; renderAccountPanel(); });
        act('delete-confirm')?.addEventListener('click', async (e) => {
            busy(e.currentTarget, true, '[DELETING…]');
            try { await deleteAccount(); panelStep = 'email'; panelError = ''; }
            catch (err) { panelError = friendlyError(err); }
            renderAccountPanel();
        });
        (wrap.querySelector('#account-email') || wrap.querySelector('#account-link'))?.focus();
    }

    function friendlyError(err) {
        const m = String(err && err.message || err || '');
        if (/rate limit|too many|429/i.test(m) || (err && err.status === 429)) return 'Too many sign-in emails in a short time. Wait a few minutes and try again.';
        if (/expired|invalid/i.test(m)) return 'That link or code has expired or was already used. Ask for a new one.';
        if (/Failed to fetch|NetworkError/i.test(m)) return "Can't reach the server. Check your connection.";
        return m;
    }

    // Calls a database function (Postgres RPC) as the signed-in user
    async function rpc(name, args = {}) {
        const t = await token();
        return call('/rest/v1/rpc/' + name, { method: 'POST', token: t, body: args });
    }

    window.CortexAccount = { isSignedIn, userId, userEmail, sendSignInEmail, completeSignIn, signOut, fetchState, fetchVersion, saveState, deleteAccount, rpc, supabaseUrl: SB_URL };
    window.openAccountPanel = openAccountPanel;

    window.addEventListener('DOMContentLoaded', () => { handleRedirect(); });
})();
