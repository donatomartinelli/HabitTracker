// ============================================================================
// CALENDAR SYNC — Google Calendar, Apple (iCloud), Outlook, without signing in to them.
//
// IN  (their calendars → Cortex): the user pastes the calendar's private/public
//     iCal address once. Cortex reads it (through the "calendar" Edge Function,
//     because browsers can't read those addresses directly), expands repeating
//     events and shows them read-only, refreshed every 30 minutes.
// OUT (Cortex → their calendars): a secret address with Cortex's own events that
//     Google/Apple subscribe to. Needs the Cortex account (it lives in the cloud).
// ============================================================================

let calendarFeeds = (() => {
    try { const v = JSON.parse(cortexStore.getItem('cortex_calendar_feeds') || '[]'); return Array.isArray(v) ? v : []; }
    catch (e) { return []; }
})();

const CAL_FEED_COLORS = ['#4c5b73', '#725b7a', '#5f7a61', '#b08d43', '#6e7073'];
const CAL_REFRESH_MS = 30 * 60 * 1000;
const CAL_WINDOW_PAST_DAYS = 30;
const CAL_WINDOW_FUTURE_DAYS = 180;

function saveCalendarFeeds() {
    cortexStore.setItem('cortex_calendar_feeds', JSON.stringify(calendarFeeds));
    if (typeof saveData === 'function') saveData();
}

// Called by cloud sync when another device changed the list
function applyCalendarFeeds(list) {
    calendarFeeds = list.filter(f => f && f.id && f.url);
    cortexStore.setItem('cortex_calendar_feeds', JSON.stringify(calendarFeeds));
}

function calendarBridgeUrl(params) {
    const base = (window.CortexAccount && window.CortexAccount.supabaseUrl) || 'https://mnymditkuzbjkqrgoyvi.supabase.co';
    return `${base}/functions/v1/calendar?${params}`;
}

// ---------------------------------------------------------------------------
// iCalendar (.ics) reader
// ---------------------------------------------------------------------------
const ICS_DAY = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

function icsUnescape(s) {
    return String(s || '').replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1').trim();
}

function tzOffsetMs(utcMs, tz) {
    const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const p = {};
    f.formatToParts(new Date(utcMs)).forEach(x => { p[x.type] = x.value; });
    const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
    return asUtc - utcMs;
}

// Wall-clock time in a named zone → real moment
function zonedToDate(y, mo, d, h, mi, s, tz) {
    const guess = Date.UTC(y, mo - 1, d, h, mi, s);
    try {
        let ms = guess - tzOffsetMs(guess, tz);
        ms = guess - tzOffsetMs(ms, tz);
        return new Date(ms);
    } catch (e) {
        return new Date(y, mo - 1, d, h, mi, s); // unknown zone name: treat as local
    }
}

function parseIcsDate(value, params) {
    const v = String(value || '').trim();
    let m = v.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (m || /VALUE=DATE(?!-)/i.test(params || '')) {
        m = m || v.match(/^(\d{4})(\d{2})(\d{2})/);
        if (!m) return null;
        return { allDay: true, date: new Date(+m[1], +m[2] - 1, +m[3]) };
    }
    m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);
    if (!m) return null;
    const [y, mo, d, h, mi, s] = [+m[1], +m[2], +m[3], +m[4], +m[5], +(m[6] || 0)];
    if (m[7]) return { allDay: false, date: new Date(Date.UTC(y, mo - 1, d, h, mi, s)) };
    const tz = ((params || '').match(/TZID=("?)([^;:"]+)\1/i) || [])[2];
    if (tz) return { allDay: false, date: zonedToDate(y, mo, d, h, mi, s, tz) };
    return { allDay: false, date: new Date(y, mo - 1, d, h, mi, s) };
}

function parseIcsDuration(v) {
    const m = String(v || '').match(/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
    if (!m) return 0;
    const ms = (((+m[2] || 0) * 7 + (+m[3] || 0)) * 86400 + (+m[4] || 0) * 3600 + (+m[5] || 0) * 60 + (+m[6] || 0)) * 1000;
    return m[1] === '-' ? -ms : ms;
}

function parseIcs(text) {
    const lines = String(text).replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
    const events = [];
    let cur = null;
    for (const line of lines) {
        if (line === 'BEGIN:VEVENT') { cur = { exdates: [] }; continue; }
        if (line === 'END:VEVENT') { if (cur) events.push(cur); cur = null; continue; }
        if (!cur) continue;
        const i = line.indexOf(':');
        if (i < 0) continue;
        const head = line.slice(0, i);
        const value = line.slice(i + 1);
        const semi = head.indexOf(';');
        const name = (semi < 0 ? head : head.slice(0, semi)).toUpperCase();
        const params = semi < 0 ? '' : head.slice(semi + 1);
        if (name === 'UID') cur.uid = value.trim();
        else if (name === 'SUMMARY') cur.summary = icsUnescape(value);
        else if (name === 'DTSTART') cur.start = parseIcsDate(value, params);
        else if (name === 'DTEND') cur.end = parseIcsDate(value, params);
        else if (name === 'DURATION') cur.duration = parseIcsDuration(value);
        else if (name === 'RRULE') cur.rrule = value.trim();
        else if (name === 'STATUS') cur.status = value.trim().toUpperCase();
        else if (name === 'RECURRENCE-ID') cur.recurrenceId = parseIcsDate(value, params);
        else if (name === 'EXDATE') value.split(',').forEach(x => { const d = parseIcsDate(x, params); if (d) cur.exdates.push(d.date.getTime()); });
    }
    return events.filter(e => e.start && e.status !== 'CANCELLED');
}

function parseRrule(s) {
    const r = {};
    String(s || '').split(';').forEach(kv => {
        const [k, v] = kv.split('=');
        if (k && v !== undefined) r[k.toUpperCase()] = v;
    });
    return r;
}

// All start moments of an event inside [from, to]
function expandIcsEvent(ev, from, to) {
    const first = ev.start.date;
    if (!ev.rrule) return first <= to ? [first] : [];
    const r = parseRrule(ev.rrule);
    const freq = r.FREQ;
    const interval = Math.max(1, parseInt(r.INTERVAL || '1', 10));
    const count = r.COUNT ? parseInt(r.COUNT, 10) : Infinity;
    let until = to;
    if (r.UNTIL) {
        const u = parseIcsDate(r.UNTIL, r.UNTIL.length === 8 ? 'VALUE=DATE' : '');
        if (u) until = new Date(Math.min(to.getTime(), u.date.getTime() + (u.allDay ? 86399999 : 0)));
    }
    const byDay = (r.BYDAY || '').split(',').filter(Boolean);
    const byMonthDay = (r.BYMONTHDAY || '').split(',').filter(Boolean).map(Number);
    const out = [];
    let n = 0;
    const push = (d) => {
        if (d < first) return true;
        if (d > until || n >= count) return false;
        n++;
        if (d >= from) out.push(d);
        return true;
    };
    const atTime = (y, mo, day) => new Date(y, mo, day, first.getHours(), first.getMinutes(), first.getSeconds());
    let guard = 0;
    if (freq === 'DAILY') {
        for (let d = new Date(first); guard++ < 3000; d = atTime(d.getFullYear(), d.getMonth(), d.getDate() + interval)) {
            if (!push(d)) break;
        }
    } else if (freq === 'WEEKLY') {
        const days = byDay.length ? byDay.map(x => ICS_DAY[x.slice(-2)]).filter(x => x !== undefined) : [first.getDay()];
        const weekStart = atTime(first.getFullYear(), first.getMonth(), first.getDate() - ((first.getDay() + 6) % 7));
        for (let w = weekStart; guard++ < 1000; w = atTime(w.getFullYear(), w.getMonth(), w.getDate() + 7 * interval)) {
            if (w > until) break;
            let keep = true;
            for (const wd of [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))) {
                const d = atTime(w.getFullYear(), w.getMonth(), w.getDate() + ((wd + 6) % 7));
                if (!push(d)) { keep = false; break; }
            }
            if (!keep) break;
        }
    } else if (freq === 'MONTHLY') {
        for (let k = 0; guard++ < 600; k += interval) {
            const y = first.getFullYear(), mo = first.getMonth() + k;
            const monthStart = new Date(y, mo, 1);
            if (monthStart > until) break;
            const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
            let candidates = [];
            if (byDay.length) {
                byDay.forEach(x => {
                    const m = x.match(/^([+-]?\d+)?([A-Z]{2})$/);
                    if (!m) return;
                    const wd = ICS_DAY[m[2]];
                    const all = [];
                    for (let dd = 1; dd <= daysInMonth; dd++) if (new Date(monthStart.getFullYear(), monthStart.getMonth(), dd).getDay() === wd) all.push(dd);
                    if (!m[1]) candidates.push(...all);
                    else { const idx = parseInt(m[1], 10); const pick = idx > 0 ? all[idx - 1] : all[all.length + idx]; if (pick) candidates.push(pick); }
                });
            } else {
                candidates = (byMonthDay.length ? byMonthDay : [first.getDate()]).map(dd => dd < 0 ? daysInMonth + dd + 1 : dd).filter(dd => dd >= 1 && dd <= daysInMonth);
            }
            let keep = true;
            for (const dd of candidates.sort((a, b) => a - b)) {
                if (!push(atTime(monthStart.getFullYear(), monthStart.getMonth(), dd))) { keep = false; break; }
            }
            if (!keep) break;
        }
    } else if (freq === 'YEARLY') {
        for (let k = 0; guard++ < 200; k += interval) {
            const d = atTime(first.getFullYear() + k, first.getMonth(), first.getDate());
            if (d.getMonth() !== first.getMonth()) continue; // 29 February
            if (!push(d)) break;
        }
    } else {
        push(first);
    }
    const ex = new Set(ev.exdates || []);
    return out.filter(d => !ex.has(d.getTime()));
}

const pad2 = (n) => String(n).padStart(2, '0');
const isoDay = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const hhmm = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

function hashString(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36);
}

// .ics text → Cortex events (one per day, read-only, tagged with the feed id)
function icsToCortexEvents(text, feed, now = new Date()) {
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - CAL_WINDOW_PAST_DAYS);
    const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + CAL_WINDOW_FUTURE_DAYS);
    const parsed = parseIcs(text);
    const overrides = new Map(); // uid → Set of replaced start times
    parsed.filter(e => e.recurrenceId).forEach(e => {
        if (!overrides.has(e.uid)) overrides.set(e.uid, new Set());
        overrides.get(e.uid).add(e.recurrenceId.date.getTime());
    });
    const out = [];
    for (const ev of parsed) {
        const title = ev.summary || '(busy)';
        const durMs = ev.end ? ev.end.date - ev.start.date : (ev.duration || (ev.start.allDay ? 86400000 : 3600000));
        let starts = ev.recurrenceId ? [ev.start.date] : expandIcsEvent(ev, from, to);
        if (!ev.recurrenceId && overrides.has(ev.uid)) starts = starts.filter(d => !overrides.get(ev.uid).has(d.getTime()));
        for (const s of starts) {
            if (s > to) continue;
            const e = new Date(s.getTime() + Math.max(durMs, 0));
            if (ev.start.allDay) {
                const days = Math.max(1, Math.round(durMs / 86400000));
                for (let i = 0; i < Math.min(days, 31); i++) {
                    const d = new Date(s.getFullYear(), s.getMonth(), s.getDate() + i);
                    if (d < from || d > to) continue;
                    out.push({ date: isoDay(d), start: null, end: null, title, key: `${ev.uid}|${isoDay(d)}` });
                }
            } else {
                if (e < from) continue;
                const sameDay = isoDay(s) === isoDay(new Date(e.getTime() - 1));
                out.push({ date: isoDay(s), start: hhmm(s), end: sameDay ? hhmm(e) : '23:59', title, key: `${ev.uid}|${s.getTime()}` });
            }
        }
    }
    return out.map(x => ({
        id: `e_feed_${feed.id}_${hashString(x.key)}`,
        extFeed: feed.id,
        title: x.title,
        date: x.date,
        start: x.start,
        end: x.end,
        color: feed.color || CAL_FEED_COLORS[0]
    }));
}

// ---------------------------------------------------------------------------
// Refresh
// ---------------------------------------------------------------------------
let calendarRefreshRunning = false;

async function fetchFeedText(url) {
    const res = await fetch(calendarBridgeUrl('proxy=' + encodeURIComponent(url)), { cache: 'no-store' });
    const body = await res.text();
    if (!res.ok) throw new Error(body || `HTTP ${res.status}`);
    return body;
}

function replaceFeedEvents(feedId, fresh) {
    const keep = specificEvents.filter(e => e.extFeed !== feedId);
    specificEvents = keep.concat(fresh);
}

async function refreshCalendarFeeds({ manual = false } = {}) {
    if (calendarRefreshRunning || !calendarFeeds.length) return;
    if (!navigator.onLine) { if (manual && typeof showToast === 'function') showToast('[CALENDAR] Offline: try again when connected.'); return; }
    calendarRefreshRunning = true;
    let changed = false;
    const errors = [];
    for (const feed of calendarFeeds) {
        try {
            const text = await fetchFeedText(feed.url);
            const fresh = icsToCortexEvents(text, feed);
            const before = JSON.stringify(specificEvents.filter(e => e.extFeed === feed.id).map(e => e.id + e.title + e.date + e.start + e.end).sort());
            const after = JSON.stringify(fresh.map(e => e.id + e.title + e.date + e.start + e.end).sort());
            if (before !== after) { replaceFeedEvents(feed.id, fresh); changed = true; }
            feed.lastOk = Date.now();
            feed.lastError = '';
            feed.count = fresh.length;
        } catch (err) {
            feed.lastError = String(err.message || err).slice(0, 140);
            errors.push(feed.name);
        }
    }
    cortexStore.setItem('cortex_calendar_feeds', JSON.stringify(calendarFeeds));
    cortexStore.setItem('cortex_calendar_last_refresh', String(Date.now()));
    if (changed) {
        if (typeof saveData === 'function') saveData();
        if (typeof renderCalendar === 'function') renderCalendar();
        if (typeof renderWeeklyPlanner === 'function') renderWeeklyPlanner();
        if (typeof renderDayPlannerModule === 'function') renderDayPlannerModule();
        if (typeof renderTasks === 'function') renderTasks();
        if (typeof renderToday === 'function') renderToday();
    }
    calendarRefreshRunning = false;
    if (manual && typeof showToast === 'function') {
        showToast(errors.length ? `[CALENDAR] Could not read: ${errors.join(', ')}` : '[CALENDAR] Calendars up to date.');
    }
    renderCalendarConnect();
}

function explainImportedEvent(ev) {
    const feed = calendarFeeds.find(f => f.id === ev.extFeed);
    if (typeof showToast === 'function') {
        showToast(`[CALENDAR] "${ev.title}" comes from ${feed ? feed.name : 'another calendar'}. Change it there; Cortex updates within 30 minutes.`);
    }
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------
let calConnectState = { error: '', feedUrl: '', busy: false };

function openCalendarConnect() {
    if (document.getElementById('calendar-connect')) { renderCalendarConnect(); return; }
    const root = document.getElementById('modals-root') || document.body;
    const wrap = document.createElement('div');
    wrap.id = 'calendar-connect';
    wrap.className = 'modules-overlay';
    wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('[data-close]')) wrap.remove(); });
    wrap.addEventListener('keydown', (e) => { if (e.key === 'Escape') wrap.remove(); });
    root.appendChild(wrap);
    calConnectState.error = '';
    renderCalendarConnect();
    // Show the existing link straight away if the user already made one
    if (window.CortexAccount && window.CortexAccount.isSignedIn() && !calConnectState.feedUrl && cortexStore.getItem('cortex_calendar_feed_made') === '1') {
        loadCortexFeedUrl(false);
    }
}

async function loadCortexFeedUrl(reset) {
    calConnectState.busy = true;
    calConnectState.error = '';
    renderCalendarConnect();
    try {
        const token = await window.CortexAccount.rpc('calendar_feed_token', { reset: Boolean(reset) });
        calConnectState.feedUrl = calendarBridgeUrl('feed=' + token);
        cortexStore.setItem('cortex_calendar_feed_made', '1');
        // Make sure the cloud copy (what the link serves) is current
        if (typeof triggerCloudSyncNow === 'function') triggerCloudSyncNow();
        else if (typeof syncNow === 'function') syncNow();
    } catch (err) {
        calConnectState.error = /function|404|PGRST/i.test(String(err.message)) ? 'Calendar links are not switched on yet on the server.' : String(err.message || err);
    }
    calConnectState.busy = false;
    renderCalendarConnect();
}

function renderCalendarConnect() {
    const wrap = document.getElementById('calendar-connect');
    if (!wrap) return;
    const esc = (s) => (typeof escapeHtml === 'function' ? escapeHtml(String(s ?? '')) : String(s ?? ''));
    const signedIn = Boolean(window.CortexAccount && window.CortexAccount.isSignedIn());
    const ago = (ms) => {
        if (!ms) return 'not read yet';
        const m = Math.round((Date.now() - ms) / 60000);
        return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
    };
    const feedsHtml = calendarFeeds.length ? calendarFeeds.map(f => `
        <div class="cal-feed-row">
            <span class="cal-feed-dot" style="background:${esc(f.color)}"></span>
            <span class="cal-feed-name">${esc(f.name)}</span>
            <span class="cal-feed-meta ${f.lastError ? 'u-red' : ''}">${f.lastError ? esc(f.lastError) : `${f.count || 0} events · ${ago(f.lastOk)}`}</span>
            <button type="button" class="icon-btn delete" data-remove="${esc(f.id)}" aria-label="Remove ${esc(f.name)}">×</button>
        </div>`).join('') : '<div class="account-note">No calendars connected yet.</div>';

    let outHtml;
    if (!signedIn) {
        outHtml = `<p class="account-note">This needs the Cortex account, because your calendar link lives in the cloud. <button type="button" class="ghost-btn" data-act="signin">Sign in</button></p>`;
    } else if (!calConnectState.feedUrl) {
        outHtml = `<div class="account-actions"><button type="button" class="btn btn-sm" data-act="make-link" ${calConnectState.busy ? 'disabled' : ''}>${calConnectState.busy ? '[CREATING…]' : '[CREATE MY CALENDAR LINK]'}</button></div>`;
    } else {
        outHtml = `
            <div class="cal-link-row">
                <input type="text" class="form-control form-control-sm" readonly value="${esc(calConnectState.feedUrl)}" aria-label="Your Cortex calendar address">
                <button type="button" class="btn btn-sm" data-act="copy">[COPY]</button>
            </div>
            <ul class="cal-steps">
                <li><strong>Google:</strong> calendar.google.com → Other calendars <b>+</b> → From URL → paste.</li>
                <li><strong>Apple (Mac):</strong> Calendar → File → New Calendar Subscription → paste.</li>
                <li><strong>iPhone:</strong> Settings → Calendar → Accounts → Add Account → Other → Add Subscribed Calendar.</li>
            </ul>
            <p class="account-note">Keep this address private: whoever has it can see your Cortex events. Google refreshes subscribed calendars every few hours; Apple as often as you choose. <button type="button" class="ghost-btn danger" data-act="reset-link">Make a new address</button></p>`;
    }

    wrap.innerHTML = `
        <div class="modules-panel cal-connect-panel" role="dialog" aria-modal="true" aria-labelledby="cal-connect-title">
            <div class="modules-head">
                <span id="cal-connect-title" class="section-label">Google · Apple · Outlook calendars</span>
                <button type="button" class="hdr-icon" data-close aria-label="Close">×</button>
            </div>

            <div class="modules-group">
                <div class="modules-group-title">1 · Show your calendars in Cortex</div>
                ${feedsHtml}
                <details class="cal-help">
                    <summary>Where do I find the address?</summary>
                    <ul class="cal-steps">
                        <li><strong>Google:</strong> calendar.google.com on a computer → ⚙ Settings → click the calendar on the left → "Integrate calendar" → copy <em>Secret address in iCal format</em>.</li>
                        <li><strong>Apple / iCloud:</strong> Calendar app → right-click the calendar → Share → tick <em>Public Calendar</em> → copy the link (webcal://…).</li>
                        <li><strong>Outlook:</strong> Settings → Calendar → Shared calendars → Publish a calendar → copy the ICS link.</li>
                    </ul>
                </details>
                <label class="account-field" for="cal-feed-url">Calendar address
                    <input type="url" id="cal-feed-url" class="form-control form-control-sm" placeholder="https://calendar.google.com/calendar/ical/…/basic.ics" autocomplete="off">
                </label>
                <label class="account-field" for="cal-feed-name">Name
                    <input type="text" id="cal-feed-name" class="form-control form-control-sm" placeholder="Work, Personal, Family…" maxlength="40">
                </label>
                <div class="account-error" aria-live="polite">${esc(calConnectState.error)}</div>
                <div class="account-actions">
                    <button type="button" class="btn btn-primary btn-sm" data-act="add">[CONNECT]</button>
                    ${calendarFeeds.length ? '<button type="button" class="btn btn-sm" data-act="refresh">[REFRESH NOW]</button>' : ''}
                </div>
                <p class="account-note">Read-only: to change those events, use Google or Apple. Cortex re-reads them every 30 minutes.</p>
            </div>

            <div class="modules-group">
                <div class="modules-group-title">2 · Show Cortex events in Google or Apple</div>
                ${outHtml}
            </div>
        </div>`;

    const act = (n) => wrap.querySelector(`[data-act="${n}"]`);
    act('add')?.addEventListener('click', addCalendarFeedFromPanel);
    wrap.querySelector('#cal-feed-url')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') addCalendarFeedFromPanel(); });
    act('refresh')?.addEventListener('click', () => refreshCalendarFeeds({ manual: true }));
    act('signin')?.addEventListener('click', () => { wrap.remove(); if (typeof openAccountPanel === 'function') openAccountPanel(); });
    act('make-link')?.addEventListener('click', () => loadCortexFeedUrl(false));
    act('reset-link')?.addEventListener('click', () => {
        if (confirm('Make a new address? Calendars subscribed to the old one stop updating, and you will need to add the new one.')) loadCortexFeedUrl(true);
    });
    act('copy')?.addEventListener('click', async (e) => {
        try { await navigator.clipboard.writeText(calConnectState.feedUrl); e.currentTarget.textContent = '[COPIED]'; }
        catch (err) { wrap.querySelector('.cal-link-row input')?.select(); }
    });
    wrap.querySelectorAll('[data-remove]').forEach(b => b.addEventListener('click', () => {
        const id = b.dataset.remove;
        calendarFeeds = calendarFeeds.filter(f => f.id !== id);
        specificEvents = specificEvents.filter(e => e.extFeed !== id);
        saveCalendarFeeds();
        if (typeof renderCalendar === 'function') renderCalendar();
        renderCalendarConnect();
    }));
}

async function addCalendarFeedFromPanel() {
    const wrap = document.getElementById('calendar-connect');
    const urlInput = wrap.querySelector('#cal-feed-url');
    const nameInput = wrap.querySelector('#cal-feed-name');
    const raw = urlInput.value.trim().replace(/^webcal:\/\//i, 'https://');
    let host = '';
    try { host = new URL(raw).hostname; } catch (e) { /* invalid */ }
    if (!host) { calConnectState.error = 'Paste the full calendar address (it starts with https:// or webcal://).'; renderCalendarConnect(); return; }
    if (calendarFeeds.some(f => f.url === raw)) { calConnectState.error = 'That calendar is already connected.'; renderCalendarConnect(); return; }
    const guess = /google/.test(host) ? 'Google' : /icloud/.test(host) ? 'Apple' : /outlook|office/.test(host) ? 'Outlook' : 'Calendar';
    const feed = {
        id: 'cal_' + Date.now().toString(36),
        name: nameInput.value.trim() || guess,
        url: raw,
        color: CAL_FEED_COLORS[calendarFeeds.length % CAL_FEED_COLORS.length]
    };
    const btn = wrap.querySelector('[data-act="add"]');
    if (btn) { btn.disabled = true; btn.textContent = '[READING…]'; }
    try {
        const text = await fetchFeedText(raw);
        const events = icsToCortexEvents(text, feed);
        feed.lastOk = Date.now();
        feed.count = events.length;
        calendarFeeds.push(feed);
        replaceFeedEvents(feed.id, events);
        saveCalendarFeeds();
        calConnectState.error = '';
        if (typeof renderCalendar === 'function') renderCalendar();
        if (typeof renderWeeklyPlanner === 'function') renderWeeklyPlanner();
        if (typeof showToast === 'function') showToast(`[CALENDAR] ${feed.name} connected: ${events.length} events.`);
    } catch (err) {
        calConnectState.error = `Could not read that calendar: ${String(err.message || err).slice(0, 160)}`;
    }
    renderCalendarConnect();
}

// Refresh at start-up (if stale) and every 30 minutes
window.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        const last = parseInt(cortexStore.getItem('cortex_calendar_last_refresh') || '0', 10);
        if (Date.now() - last > CAL_REFRESH_MS) refreshCalendarFeeds();
    }, 6000);
    setInterval(() => refreshCalendarFeeds(), CAL_REFRESH_MS);
});

window.openCalendarConnect = openCalendarConnect;
window.refreshCalendarFeeds = refreshCalendarFeeds;
window.applyCalendarFeeds = applyCalendarFeeds;
window.explainImportedEvent = explainImportedEvent;
window.__cortexIcs = { parseIcs, icsToCortexEvents, expandIcsEvent }; // for tests
