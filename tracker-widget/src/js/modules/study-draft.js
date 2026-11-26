// --- js/modules/study-draft.js ---
// CREATING A STUDY WINDOW ON THE TIMELINE (no modal)
//
// "Study window" → drag on the day's timeline from when you start to when you stop
// (mouse: press and drag · phone: hold, then drag). The window starts empty: only the space.
// A panel beside the timeline (docked at the bottom on the phone) shows the times, where, the
// tasks to tick in your order with their time "here" (15 minutes at a time; when the ticked tasks
// need more than fits, you choose how much of each goes in), the plans (30, 45 or 60-minute
// sessions) and every session and break with start and end.
// The window on the timeline stretches from its edges and moves from its label; the panel and
// the timeline always show the same thing.
// Hosts: Plan → Day (its own canvas) and Today (a day view drawn here in place of the list).
// The planning itself is in js/modules/study.js.

(function () {
    'use strict';

    const St = () => window.CortexStudy;
    const esc = (s) => (typeof escapeHtml === 'function' ? escapeHtml(String(s ?? '')) : String(s ?? ''));
    const pad = (n) => String(n).padStart(2, '0');
    const fmt = (m) => { const v = Math.max(0, Math.min(24 * 60 - 1, Math.round(m))); return `${pad(Math.floor(v / 60))}:${pad(v % 60)}`; };
    const toMin = (s) => { if (!s || !String(s).includes(':')) return null; const [h, m] = String(s).split(':').map(Number); return Number.isFinite(h) ? h * 60 + (m || 0) : null; };
    const dur = (m) => (St() ? St().fmtDur(m) : `${Math.round(m)}m`);
    const sum = (arr, f = (x) => x) => arr.reduce((a, x) => a + (Number(f(x)) || 0), 0);
    const isPhone = () => typeof isMobileViewMode !== 'undefined' && isMobileViewMode;
    const tpl = (id) => (typeof templates !== 'undefined' ? templates : []).find(t => t.id === id);
    const dayStartMin = () => Math.round((typeof CORTEX_DAY !== 'undefined' ? CORTEX_DAY.start : 6.5) * 60);
    const dayEndMin = () => Math.round((typeof CORTEX_DAY !== 'undefined' ? CORTEX_DAY.end : 24) * 60);
    const TODAY_ZOOM = 46;            // px per hour, like the Day planner
    const MIN_WINDOW = 15;

    let D = null;                     // the window being drawn / edited

    // ------------------------------------------------------------------
    // Start / end
    // ------------------------------------------------------------------
    function hostOf(opts) {
        if (opts.host === 'today' || opts.host === 'plan') return opts.host;
        const inToday = typeof navState !== 'undefined' && navState.mode === 'section' && navState.section === 'today';
        return inToday ? 'today' : 'plan';
    }

    function start(date, opts = {}) {
        const S = St();
        if (!S) return;
        if (D) cleanup();
        const existing = opts.id ? S.findWindow(date, opts.id) : null;
        const cands = S.candidateSubjects(date);
        // A new window starts empty: you draw the space, then tick what to study in it
        const chosen = existing && Array.isArray(existing.subjects) ? [...existing.subjects] : [];
        chosen.forEach(id => { const t = tpl(id); if (t && !cands.includes(t)) cands.push(t); });
        // the window's own order first, then the other tasks: still to do today before done, theory → practice → review
        const inOrder = chosen.map(id => cands.find(t => t.id === id)).filter(Boolean);
        const others = S.byKind(cands.filter(t => !chosen.includes(t.id)));
        const leftNow = (t) => S.remainingToday(t, date, existing ? existing.id : null);
        const list = [...inOrder, ...others.filter(t => leftNow(t) > 0), ...others.filter(t => leftNow(t) <= 0)].map(t => t.id);

        D = {
            host: hostOf(opts), date,
            id: existing ? existing.id : null,
            refId: existing ? existing.refId : (opts.refId || null),
            place: existing ? existing.place : 'Home',
            start: existing ? existing.start : null,
            end: existing ? existing.end : null,
            list,
            on: chosen.filter(id => list.includes(id)),
            loads: Object.fromEntries(list.map(id => [id, S.loadOf(tpl(id))])),
            split: existing && existing.split ? Object.assign({}, existing.split) : {},
            len: existing ? S.lengthOf(existing) : S.defaultLength(),
            touched: Boolean(existing),
            note: '',
            collapsed: false,
            scrolled: false
        };
        // A place picked from Today: only its name; you draw when on the timeline
        if (!existing && D.refId) {
            const p = S.placesOn(date).find(x => x.ref.id === D.refId);
            if (p) D.place = p.ref.title;
        }
        // an old window saved without minutes: what was left of each task, as far as it fits
        if (existing && !existing.split) {
            D.on.forEach(id => { D.split[id] = 0; });
            D.on.forEach(id => { D.split[id] = maxFor(id, roundUp(leftOf(id))); });
        }

        // Show the host
        if (D.host === 'plan') {
            if (typeof navState === 'undefined' || navState.section !== 'plan' || navState.mode !== 'section') navigateToSection('plan', 'plan');
            if (typeof planBuilderDateStr !== 'undefined' && planBuilderDateStr !== date && typeof setPlanBuilderDate === 'function') setPlanBuilderDate(date);
        } else if (typeof navState === 'undefined' || navState.section !== 'today' || navState.mode !== 'section') {
            navigateToSection('today', 'today');
        }
        refreshHost();
    }

    function cancel() {
        if (!D) return;
        const host = D.host;
        cleanup();
        D = null;
        refreshHost(host);
    }

    function cleanup() {
        document.getElementById('study-editor')?.remove();
        document.querySelectorAll('.sd-overlay').forEach(el => el.remove());
        document.body.classList.remove('sd-docked', 'sd-docked-min');
        const leftCol = document.getElementById('plan-mod-left-col');
        if (leftCol) {
            leftCol.querySelectorAll('.plan-edit-sec').forEach(s => { s.style.display = ''; });
            leftCol.style.display = (typeof currentDayPlanMode !== 'undefined' && currentDayPlanMode === 'edit') ? 'flex' : 'none';
        }
    }

    function refreshHost(host = D && D.host) {
        if (host === 'plan' && typeof renderDayPlannerModule === 'function') renderDayPlannerModule();
        if (typeof renderTodayModule === 'function') renderTodayModule();
    }

    const nowMinutes = () => { const n = getNow(); return n.getHours() * 60 + n.getMinutes(); };

    // ------------------------------------------------------------------
    // The plan of the draft
    // ------------------------------------------------------------------
    const onIds = () => D.list.filter(id => D.on.includes(id));
    const draftWin = (extra = {}) => Object.assign({
        id: D.id || '__draft__', start: D.start, end: D.end, len: D.len,
        subjects: onIds(), split: Object.fromEntries(onIds().map(id => [id, D.split[id] || 0]))
    }, extra);
    const planFor = (len = D.len, split = null) => St().computePlan(D.date, draftWin(split ? { split, len } : { len }), { loads: D.loads, len });
    const fits = (split, len = D.len) => planFor(len, split).fits;
    const leftOf = (id) => { const t = tpl(id); return t ? St().remainingToday(t, D.date, D.id) : 0; };

    const STEP = 15;                                   // minutes go up and down 15 at a time
    const dayWord = () => (D.date === todayStr ? 'today' : 'that day');
    const roundUp = (m) => Math.ceil(Math.max(0, m) / STEP) * STEP;

    // The most study that fits in the window, with the ticked tasks in these proportions
    const capFor = (weightOf, len = D.len) => St().capacity(D.date, draftWin({ len }), len, onIds(), weightOf, { loads: D.loads });
    // What the ticked tasks still need today, all together
    const needToday = () => sum(onIds(), id => roundUp(leftOf(id)));

    // The window got shorter or the session length changed: what no longer fits comes off the
    // last tasks first (the ones at the top of your list keep their time)
    function refreshSplit() {
        const ids = onIds();
        if (!ids.length || !D.start || !D.end) return;
        const cut = [];
        for (let i = ids.length - 1, guard = 0; i >= 0 && guard < 400 && !fits(D.split); guard++) {
            const id = ids[i];
            if ((D.split[id] || 0) <= 0) { i--; continue; }
            D.split[id] = Math.max(0, (D.split[id] || 0) - STEP);
            if (!cut.includes(id)) cut.push(id);
        }
        if (cut.length) D.note = `The window is shorter now: less time for ${cut.map(id => (tpl(id) ? tpl(id).title : '')).join(', ')}.`;
    }

    // The most minutes one task can have with the others as they are (up to `upTo`)
    function maxFor(id, upTo) {
        if (!D.start || !D.end) return 0;
        let lo = 0, hi = Math.floor(upTo / STEP), best = 0;
        while (lo <= hi) {
            const mid = Math.floor((lo + hi) / 2);
            const split = Object.assign({}, D.split, { [id]: mid * STEP });
            if (fits(split)) { best = mid * STEP; lo = mid + 1; } else hi = mid - 1;
        }
        // the last few minutes that are not a full step
        if (best < upTo && upTo % STEP && fits(Object.assign({}, D.split, { [id]: upTo }))) best = upTo;
        return best;
    }

    // ------------------------------------------------------------------
    // Hosts
    // ------------------------------------------------------------------
    function isActive(host) { return Boolean(D && (!host || D.host === host)); }
    function editingId(date) { return D && D.date === date ? (D.id || '__draft__') : null; }

    // Plan → Day: the panel takes the place of the left column; the window is drawn over the canvas
    function mountPlan() {
        if (!D || D.host !== 'plan') return;
        const date = typeof ensurePlanBuilderDateValid === 'function' ? ensurePlanBuilderDateValid() : D.date;
        if (date !== D.date) { cleanup(); D = null; return; }
        const canvas = document.getElementById('plan-mod-day-canvas');
        if (!canvas) return;
        const panel = panelElement(document.getElementById('plan-mod-left-col'));
        renderPanel(panel);
        drawOverlay(canvas, { zoom: typeof tmwTimelineZoom !== 'undefined' ? tmwTimelineZoom : 46, startHour: dayStartMin() / 60 });
        scrollToWindow(document.getElementById('plan-mod-timeline-scroll'), typeof tmwTimelineZoom !== 'undefined' ? tmwTimelineZoom : 46);
    }

    // Today: a day view in place of the timeline list, the panel in place of the cards
    function renderToday(root) {
        if (!D || D.host !== 'today' || !root) return;
        const phone = isPhone();
        const keepDay = root.querySelector('.sd-day-scroll')?.scrollTop || 0;
        root.innerHTML = `
            <div class="today-wrap ${phone ? 'is-single' : ''}">
                ${phone ? '' : '<section class="today-main sd-panel-host"></section>'}
                <section class="${phone ? 'today-main' : 'today-side'}"><div class="sd-day"></div></section>
            </div>`;
        const panel = panelElement(root.querySelector('.sd-panel-host'));
        const dayEl = root.querySelector('.sd-day');
        dayEl.innerHTML = dayViewHtml();
        renderPanel(panel);
        const canvas = dayEl.querySelector('.sd-day-canvas');
        drawOverlay(canvas, { zoom: TODAY_ZOOM, startHour: dayStartMin() / 60 });
        const scroller = dayEl.querySelector('.sd-day-scroll');
        if (keepDay && scroller) scroller.scrollTop = keepDay;
        scrollToWindow(phone ? null : scroller, TODAY_ZOOM, canvas);
    }

    // The panel element: inside the host column on a computer, docked at the bottom on the phone
    function panelElement(hostEl) {
        let el = document.getElementById('study-editor');
        const phone = isPhone() || !hostEl;
        if (phone) {
            if (!el || el.parentElement !== document.body) {
                el?.remove();
                el = document.createElement('div');
                el.id = 'study-editor';
                document.body.appendChild(el);
            }
            el.className = 'sd-panel sd-dock' + (D.collapsed ? ' is-min' : '');
            document.body.classList.add('sd-docked');
            document.body.classList.toggle('sd-docked-min', D.collapsed);
        } else {
            if (hostEl.id === 'plan-mod-left-col') {
                hostEl.style.display = 'flex';
                hostEl.querySelectorAll('.plan-edit-sec').forEach(s => { s.style.display = 'none'; });
            }
            if (!el || el.parentElement !== hostEl) {
                el?.remove();
                el = document.createElement('div');
                el.id = 'study-editor';
                hostEl.prepend(el);
            }
            el.className = 'sd-panel';
            document.body.classList.remove('sd-docked', 'sd-docked-min');
        }
        if (!el.dataset.bound) bindPanel(el);
        return el;
    }

    function scrollToWindow(scroller, zoom, canvas) {
        if (D.scrolled) return;
        D.scrolled = true;
        const target = D.start ? toMin(D.start) : (D.date === todayStr ? nowMinutes() : 9 * 60);
        const y = Math.max(0, ((target - 60) / 60 - dayStartMin() / 60) * zoom);
        if (scroller) scroller.scrollTop = y;
        else if (canvas) {
            const top = canvas.getBoundingClientRect().top + window.scrollY + y;
            const content = document.getElementById('app-content-wrapper');
            if (content && content.scrollHeight > content.clientHeight) content.scrollTop = Math.max(0, content.scrollTop + canvas.getBoundingClientRect().top - 120 + y);
            else window.scrollTo(0, Math.max(0, top - 120));
        }
    }

    // ------------------------------------------------------------------
    // Today's day view (what is already on the day, so you see where the window can go)
    // ------------------------------------------------------------------
    function dayViewHtml() {
        const s0 = dayStartMin(), e0 = dayEndMin();
        const h = ((e0 - s0) / 60) * TODAY_ZOOM;
        const y = (m) => ((m - s0) / 60) * TODAY_ZOOM;
        const labels = [], lines = [];
        for (let m = Math.ceil(s0 / 60) * 60; m < e0; m += 60) {
            labels.push(`<span style="top:${y(m)}px">${fmt(m)}</span>`);
            lines.push(`<i style="top:${y(m)}px"></i>`);
        }
        const busy = St().busyIntervals(D.date, draftWin()).map(b => {
            const top = y(Math.max(b.s, s0)), hh = Math.max(10, y(Math.min(b.e, e0)) - top);
            return `<div class="sd-busy" style="top:${top}px;height:${hh}px;--c:${esc(b.color || '#666')}"><span>${esc(fmt(b.s))} ${esc(b.why || '')}</span></div>`;
        }).join('');
        const nowLine = D.date === todayStr ? `<div class="sd-now" style="top:${y(nowMinutes())}px"></div>` : '';
        return `
            <div class="today-section-head"><span>TIMELINE</span><span class="dim">${D.start ? 'stretch or move the window' : 'drag from start to end'}</span></div>
            <div class="sd-day-scroll">
                <div class="sd-day-labels" style="height:${h}px">${labels.join('')}</div>
                <div class="sd-day-canvas" style="height:${h}px">${lines.join('')}${busy}${nowLine}</div>
            </div>`;
    }

    // ------------------------------------------------------------------
    // The window on the timeline: drag to draw, stretch the edges, move from the label
    // ------------------------------------------------------------------
    function drawOverlay(canvas, geom) {
        let ov = canvas.querySelector(':scope > .sd-overlay');
        if (!ov) {
            ov = document.createElement('div');
            ov.className = 'sd-overlay';
            canvas.appendChild(ov);
            bindOverlay(ov);
        }
        ov._geom = geom;
        renderOverlay(ov);
    }

    function renderOverlay(ov) {
        if (!ov || !D) return;
        const { zoom, startHour } = ov._geom;
        const y = (m) => ((m / 60) - startHour) * zoom;
        if (!D.start || !D.end) {
            const at = D.date === todayStr ? Math.max(dayStartMin(), nowMinutes()) : 9 * 60;
            ov.innerHTML = `<div class="sd-hint-float" style="top:${y(at)}px">${isPhone() ? 'Hold, then drag from start to end' : 'Drag from when you start to when you stop'}</div>`;
            return;
        }
        const s = toMin(D.start), e = toMin(D.end);
        const plan = planFor();
        const items = [
            ...plan.sessions.map(x => {
                const t = tpl(x.tid);
                const top = y(x.s) - y(s), h = y(x.e) - y(x.s);
                return `<div class="sd-ses" style="top:${top}px;height:${Math.max(3, h)}px;--k:${esc(St().kindColor(x.load))}">${h >= 13 ? `<span>${fmt(x.s)}–${fmt(x.e)} ${esc(t ? t.title : '')}</span>` : ''}</div>`;
            }),
            ...plan.breaks.map(b => {
                const top = y(b.s) - y(s), h = y(b.e) - y(b.s);
                return `<div class="sd-brk" style="top:${top}px;height:${Math.max(2, h)}px">${h >= 12 ? `<span>break ${b.e - b.s}m</span>` : ''}</div>`;
            })
        ].join('') || `<div class="sd-band-empty">${isPhone() ? 'Now pick what to study below' : 'Now pick what to study in the panel'}</div>`;
        ov.innerHTML = `
            <div class="sd-band" style="top:${y(s)}px;height:${Math.max(12, y(e) - y(s))}px">
                <div class="sd-handle top" data-sd-h="top" title="Drag to change the start"></div>
                <div class="sd-band-label" data-sd-h="move" title="Drag to move the window">${esc(D.place || 'Study')} · ${esc(D.start)}–${esc(D.end)} · ${dur(e - s)}</div>
                <div class="sd-band-body">${items}</div>
                <div class="sd-handle bottom" data-sd-h="bottom" title="Drag to change the end"></div>
            </div>`;
    }

    function bindOverlay(ov) {
        let drag = null;
        let press = null;

        const minAt = (clientY) => {
            const { zoom, startHour } = ov._geom;
            const r = ov.getBoundingClientRect();
            const m = Math.round(((clientY - r.top) / zoom + startHour) * 60 / 5) * 5;
            return Math.max(dayStartMin(), Math.min(dayEndMin(), m));
        };
        const begin = (kind, clientY) => {
            const m = minAt(clientY);
            const s = toMin(D.start), e = toMin(D.end);
            drag = { kind, m0: m, s0: s, e0: e, moved: false };
            ov.classList.add('is-dragging');
            if (kind === 'new') { D.start = fmt(m); D.end = fmt(Math.min(dayEndMin(), m + MIN_WINDOW)); }
        };
        const move = (clientY) => {
            if (!drag) return;
            const m = minAt(clientY);
            if (Math.abs(m - drag.m0) >= 5) drag.moved = true;
            let s, e;
            if (drag.kind === 'new') { s = Math.min(drag.m0, m); e = Math.max(drag.m0, m); if (e - s < MIN_WINDOW) e = s + MIN_WINDOW; }
            else if (drag.kind === 'top') { e = drag.e0; s = Math.min(m, e - MIN_WINDOW); }
            else if (drag.kind === 'bottom') { s = drag.s0; e = Math.max(m, s + MIN_WINDOW); }
            else { const len = drag.e0 - drag.s0; s = Math.max(dayStartMin(), Math.min(dayEndMin() - len, drag.s0 + (m - drag.m0))); e = s + len; }
            D.start = fmt(s); D.end = fmt(Math.min(dayEndMin(), e));
            renderOverlay(ov);
            const head = document.querySelector('#study-editor [data-sd-times]');
            if (head) head.textContent = `${D.start}–${D.end}`;
        };
        const end = () => {
            if (!drag) return;
            // a click without dragging: a two-hour window from there
            if (drag.kind === 'new' && !drag.moved) {
                const s = drag.m0;
                D.start = fmt(s); D.end = fmt(Math.min(dayEndMin(), s + 120));
            }
            drag = null;
            ov.classList.remove('is-dragging');
            timesChanged();
        };

        // Mouse: press and drag
        ov.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            const h = e.target.closest('[data-sd-h]');
            if (!h && e.target.closest('.sd-band')) return;    // inside the window: nothing to do
            e.preventDefault();
            begin(h ? h.dataset.sdH : 'new', e.clientY);
            const mm = (ev) => move(ev.clientY);
            const mu = () => { document.removeEventListener('mousemove', mm); document.removeEventListener('mouseup', mu); end(); };
            document.addEventListener('mousemove', mm);
            document.addEventListener('mouseup', mu);
        });

        // Touch: handles move at once; elsewhere hold for a moment, then drag (a quick swipe still scrolls)
        ov.addEventListener('touchstart', (e) => {
            if (e.touches.length !== 1) return;
            const t = e.touches[0];
            const h = e.target.closest('[data-sd-h]');
            if (h) { e.preventDefault(); begin(h.dataset.sdH, t.clientY); return; }
            if (e.target.closest('.sd-band')) return;
            press = { x: t.clientX, y: t.clientY, timer: setTimeout(() => {
                if (!press) return;
                begin('new', press.y);
                if (navigator.vibrate) navigator.vibrate(12);
            }, 350) };
        }, { passive: false });
        ov.addEventListener('touchmove', (e) => {
            const t = e.touches[0];
            if (drag) { e.preventDefault(); move(t.clientY); return; }
            if (press && (Math.abs(t.clientX - press.x) > 8 || Math.abs(t.clientY - press.y) > 8)) { clearTimeout(press.timer); press = null; }
        }, { passive: false });
        const touchEnd = () => {
            if (press) { clearTimeout(press.timer); press = null; }
            if (drag) end();
        };
        ov.addEventListener('touchend', touchEnd);
        ov.addEventListener('touchcancel', touchEnd);
    }

    function timesChanged() {
        if (!D) return;
        if (toMin(D.end) <= toMin(D.start)) D.end = fmt(toMin(D.start) + MIN_WINDOW);
        D.note = '';
        // tasks ticked before the window was drawn get their time now, in your order
        onIds().forEach(id => { if (D.split[id] === undefined) D.split[id] = 0; });
        onIds().forEach(id => { if (!D.split[id] && !D.touched) D.split[id] = maxFor(id, roundUp(leftOf(id)) || 30); });
        D.touched = true;
        refreshSplit();
        rerender();
    }

    // Re-draws the panel and the window on the timeline (Today also redraws its day view)
    function rerender() {
        if (!D) return;
        if (D.host === 'today') {
            const root = document.getElementById('module-today');
            const keep = document.querySelector('#study-editor .sd-body')?.scrollTop || 0;
            const keepDay = root?.querySelector('.sd-day-scroll')?.scrollTop || 0;
            if (root) renderToday(root);
            const body = document.querySelector('#study-editor .sd-body');
            if (body) body.scrollTop = keep;
            const day = root?.querySelector('.sd-day-scroll');
            if (day && keepDay) day.scrollTop = keepDay;
            return;
        }
        mountPlan();
    }

    // ------------------------------------------------------------------
    // The panel
    // ------------------------------------------------------------------
    function placeObj() {
        return D.refId ? St().placesOn(D.date).find(p => p.ref.id === D.refId) || null : null;
    }

    function renderPanel(el) {
        if (!D) return;
        const S = St();
        const keep = el.querySelector('.sd-body')?.scrollTop || 0;
        const dateLabel = parseLocalDate(D.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
        const has = Boolean(D.start && D.end);
        const s = toMin(D.start), e = toMin(D.end);
        const ids = onIds();
        const plan = has ? planFor() : null;
        const chosen = sum(ids, id => D.split[id] || 0);
        const places = S.placesOn(D.date);
        const p = placeObj();
        const outside = has && p && !p.slots.some(sl => s >= toMin(sl.start) && e <= toMin(sl.end));
        const startsNow = has && D.date === todayStr && nowMinutes() > s && nowMinutes() < e;

        // What: the tasks, in your order. Ticked ones get "time here": how much of the task this window takes.
        const rows = D.list.map((id) => {
            const t = tpl(id);
            if (!t) return '';
            const on = D.on.includes(id);
            const pr = S.progress(t, D.date);
            const left = leftOf(id);
            const info = [t.category || '', left > 0 ? `${dur(left)} left ${dayWord()}` : (pr.target > 0 ? `done ${dayWord()} ✓` : '')].filter(Boolean).join(' · ');
            const k = D.loads[id];
            const mins = D.split[id] || 0;
            return `
                <div class="sd-subj ${on ? '' : 'is-off'}" data-tid="${esc(id)}" style="--k:${esc(S.kindColor(k))}">
                    <span class="sd-grip" data-sd-grip title="Drag to change the order" aria-label="Move ${esc(t.title)}">⋮⋮</span>
                    <label class="study-subj-on"><input type="checkbox" ${on ? 'checked' : ''} data-sd-on aria-label="Study ${esc(t.title)} in this window"></label>
                    <div class="study-subj-name">
                        <span class="study-subj-title">${esc(t.title)}</span>
                        <span class="dim study-subj-cat">${esc(info)}</span>
                    </div>
                    <div class="study-seg study-seg-sm sd-kinds" role="radiogroup" aria-label="Kind of work">
                        ${Object.entries(S.LOADS).map(([key, l]) => `<button type="button" class="${k === key ? 'active' : ''}" data-sd-load="${key}" title="${esc(l.hint)}" aria-pressed="${k === key}" style="--k:${esc(l.color)}">${esc(l.short)}</button>`).join('')}
                    </div>
                    ${on && has ? `<div class="sd-here">
                        <span class="sd-here-label dim">here</span>
                        <div class="study-stepper" title="How much of ${esc(t.title)} you study in this window (breaks come on top)">
                            <button type="button" data-sd-step="-${STEP}" aria-label="${STEP} minutes less" ${mins <= 0 ? 'disabled' : ''}>−</button>
                            <input type="text" inputmode="numeric" class="sd-mins ${mins <= 0 ? 'is-zero' : ''}" value="${esc(dur(mins))}" data-sd-mins aria-label="Time for ${esc(t.title)} in this window">
                            <button type="button" data-sd-step="${STEP}" aria-label="${STEP} minutes more">+</button>
                        </div>
                    </div>` : '<span class="sd-here is-empty"></span>'}
                </div>`;
        }).join('');
        // How much fits, and whether the ticked tasks need more than that
        // (with the time you gave each task as proportions; before any time, what each still needs today)
        const cap = !has || !ids.length ? 0 : (chosen > 0 ? capFor(id => D.split[id] || 0) : capFor(id => roundUp(leftOf(id)) || STEP));
        const need = has ? needToday() : 0;
        const tooMuch = has && ids.length && need > cap;
        const whatHead = !has ? '' : !ids.length
            ? `<div class="sd-what-head dim">Tick what you want to study here.</div>`
            : `<div class="sd-what-head ${tooMuch ? 'is-over' : ''}">
                    <div class="sd-what-nums"><span><b>${dur(chosen)}</b> chosen</span>${chosen > cap ? `<span class="study-warn">· only ${dur(cap)} fits now</span>` : `<span class="dim">· about <b>${dur(cap)}</b> of study fits here</span>`}</div>
                    ${tooMuch ? `<div class="sd-what-msg">Your ticked tasks still need <b>${dur(need)}</b> ${dayWord()}: not all of it fits. Choose how much of each goes here with − and +.</div>` : ''}
                </div>`;

        // How: one plan per session length
        const cards = has && chosen > 0 ? S.LENGTHS.map(L => {
            const pl = L === D.len ? plan : planFor(L);
            const brk = sum(pl.breaks, b => b.e - b.s);
            const over = sum(Object.values(pl.leftover));
            const bar = pl.sessions.map(x => `<span class="study-pv-seg" style="left:${(((x.s - s) / (e - s)) * 100).toFixed(2)}%;width:${(((x.e - x.s) / (e - s)) * 100).toFixed(2)}%;background:${esc(S.kindColor(x.load))}"></span>`).join('');
            return `
                <button type="button" class="sd-plan ${L === D.len ? 'active' : ''}" data-sd-len="${L}" aria-pressed="${L === D.len}">
                    <span class="sd-plan-name">${L}-min sessions</span>
                    <span class="sd-plan-sub dim">breaks of ${S.BREAK_AFTER[L]}m</span>
                    <span class="study-plan-bar">${bar}</span>
                    <span class="sd-plan-stats">${pl.fits
                        ? `${pl.sessions.length} session${pl.sessions.length === 1 ? '' : 's'} · ${dur(brk)} of breaks${pl.endMin ? ` · ends ${fmt(pl.endMin)}` : ''}`
                        : `<span class="study-warn">${dur(over)} of study don't fit</span>`}</span>
                </button>`;
        }).join('') : '';

        // Plan: every session and break with start and end
        let list = '';
        if (plan && plan.sessions.length) {
            const items = [...plan.sessions.map(x => ({ k: 's', ...x })), ...plan.breaks.map(b => ({ k: 'b', ...b }))].sort((a, b) => a.s - b.s);
            list = items.map(it => {
                if (it.k === 'b') return `<div class="sd-row is-break"><span class="sd-time">${fmt(it.s)}–${fmt(it.e)}</span><span class="sd-what">break</span><span class="sd-len">${it.e - it.s}m</span></div>`;
                const t = tpl(it.tid);
                return `<div class="sd-row" style="--k:${esc(S.kindColor(it.load))}"><span class="sd-time">${fmt(it.s)}–${fmt(it.e)}</span><span class="sd-what"><b>${esc(t ? t.title : '')}</b>${t && t.category ? ` <span class="dim">· ${esc(t.category)}</span>` : ''}</span><span class="sd-len">${it.e - it.s}m</span></div>`;
            }).join('');
        }
        const brkTotal = plan ? sum(plan.breaks, b => b.e - b.s) : 0;
        const free = plan && plan.fits && plan.endMin ? Math.max(0, e - plan.endMin) : 0;
        const over = plan ? sum(Object.values(plan.leftover)) : 0;
        const summary = [];
        if (plan && plan.sessions.length) summary.push(`<span><b>${dur(plan.placedMin)}</b> of study + ${dur(brkTotal)} of breaks</span>`);
        if (free >= 5) summary.push(`<span class="dim">${dur(free)} free at the end</span>`);
        if (over > 0) summary.push(`<span class="study-warn">${dur(over)} of study don't fit: lower a task or make the window longer</span>`);
        if (startsNow) summary.push(`<span class="dim">Planned from now (${fmt(nowMinutes())})</span>`);
        if (outside) summary.push(`<span class="study-warn">${esc(p.ref.title)} is open ${esc(S.openingText(p.slots))}</span>`);

        el.innerHTML = `
            <div class="sd-head" data-sd-collapse>
                <div class="sd-head-main">
                    <div class="sd-title">${D.id ? 'Edit study window' : 'New study window'}</div>
                    <div class="dim sd-date">${esc(dateLabel)} · <span data-sd-times>${has ? `${esc(D.start)}–${esc(D.end)}` : 'not placed yet'}</span></div>
                </div>
                <button type="button" class="hdr-icon" data-sd-cancel aria-label="Close">×</button>
            </div>
            <div class="sd-body">
                ${has ? '' : `<div class="sd-hint">${isPhone() ? 'Hold on the timeline, then drag from when you start to when you stop.' : 'Drag on the timeline from when you start to when you stop.'} Or type the times below.</div>`}
                <section class="study-field">
                    <div class="study-label">When</div>
                    <div class="study-time-row">
                        <label>From <input type="time" class="form-control form-control-sm" data-sd-start step="300" value="${esc(D.start || '')}"></label>
                        <label>To <input type="time" class="form-control form-control-sm" data-sd-end step="300" value="${esc(D.end || '')}"></label>
                        <span class="dim study-open">${has ? dur(e - s) : ''}${p ? ` · open ${esc(S.openingText(p.slots))}` : ''}</span>
                    </div>
                </section>
                <section class="study-field">
                    <div class="study-label">Where</div>
                    <div class="study-chips">
                        ${places.map(x => `<button type="button" class="study-chip ${D.refId === x.ref.id ? 'active' : ''}" data-sd-ref="${esc(x.ref.id)}" style="--chip-color:${esc(x.ref.color || '#888')}">${esc(x.ref.title)}<span class="dim">${esc(S.openingText(x.slots))}</span></button>`).join('')}
                        <button type="button" class="study-chip ${!D.refId ? 'active' : ''}" data-sd-ref="">Home / elsewhere</button>
                    </div>
                    ${D.refId ? '' : `<input type="text" class="form-control form-control-sm study-place-input" data-sd-place placeholder="Name of the place" maxlength="40" value="${esc(D.place || 'Home')}">`}
                </section>
                <section class="study-field">
                    <div class="study-label">What <span class="dim">· time of study, breaks come on top</span></div>
                    ${whatHead}
                    <div class="sd-subjects" data-sd-list>${rows || '<div class="dim study-hint">No flexible tasks with a duration on this day. Add one (e.g. "Algebra 2h") in Tasks.</div>'}</div>
                    ${D.note ? `<div class="study-hint study-warn">${esc(D.note)}</div>` : ''}
                </section>
                ${cards ? `<section class="study-field">
                    <div class="study-label">How <span class="dim">· sessions last at most an hour</span></div>
                    <div class="sd-plans">${cards}</div>
                </section>` : ''}
                ${has ? `<section class="study-field">
                    <div class="study-label">Plan</div>
                    <div class="sd-list">${list || '<div class="dim study-hint">Pick at least one task and give it some minutes.</div>'}</div>
                    <div class="study-summary">${summary.join('')}</div>
                </section>` : ''}
            </div>
            <div class="sd-foot">
                ${D.id ? '<button type="button" class="ghost-btn danger" data-sd-remove>Remove window</button>' : '<span></span>'}
                <div class="study-foot-right">
                    <button type="button" class="btn btn-sm" data-sd-cancel>Cancel</button>
                    <button type="button" class="btn btn-primary btn-sm" data-sd-save ${plan && plan.sessions.length ? '' : 'disabled'}>${D.id ? 'Save' : 'Create sessions'}</button>
                </div>
            </div>`;
        const body = el.querySelector('.sd-body');
        if (body) body.scrollTop = keep;
    }

    function bindPanel(el) {
        el.dataset.bound = '1';
        el.addEventListener('click', (e) => {
            if (!D) return;
            const t = e.target;
            if (t.closest('[data-sd-cancel]')) { e.stopPropagation(); cancel(); return; }
            if (t.closest('[data-sd-save]')) { save(); return; }
            if (t.closest('[data-sd-remove]')) {
                St().removeWindow(D.date, D.id);
                const host = D.host; cleanup(); D = null; refreshHost(host);
                if (typeof showToast === 'function') showToast('Study window removed');
                return;
            }
            const col = t.closest('[data-sd-collapse]');
            if (col && isPhone() && !t.closest('button')) { D.collapsed = !D.collapsed; rerender(); return; }
            const ref = t.closest('[data-sd-ref]');
            if (ref) { pickPlace(ref.dataset.sdRef || null); return; }
            const ln = t.closest('[data-sd-len]');
            if (ln) { D.len = parseInt(ln.dataset.sdLen, 10); D.note = ''; refreshSplit(); rerender(); return; }
            const row = t.closest('[data-tid]');
            if (!row) return;
            const id = row.dataset.tid;
            const ld = t.closest('[data-sd-load]');
            if (ld) { D.loads[id] = ld.dataset.sdLoad; rerender(); return; }
            const stp = t.closest('[data-sd-step]');
            if (stp) { step(id, parseInt(stp.dataset.sdStep, 10)); return; }
        });
        el.addEventListener('change', (e) => {
            if (!D) return;
            const t = e.target;
            if (t.matches('[data-sd-start]') && t.value) { D.start = t.value; if (!D.end || toMin(D.end) <= toMin(D.start)) D.end = fmt(toMin(D.start) + 120); timesChanged(); return; }
            if (t.matches('[data-sd-end]') && t.value) { D.end = t.value; if (!D.start) D.start = fmt(Math.max(dayStartMin(), toMin(D.end) - 120)); timesChanged(); return; }
            if (t.matches('[data-sd-on]')) {
                const id = t.closest('[data-tid]').dataset.tid;
                toggleSubject(id, t.checked);
                return;
            }
            if (t.matches('[data-sd-mins]')) {
                const id = t.closest('[data-tid]').dataset.tid;
                setMinutes(id, parseDuration(t.value));
            }
        });
        el.addEventListener('input', (e) => {
            if (D && e.target.matches('[data-sd-place]')) D.place = e.target.value.trim() || 'Home';
        });
        el.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') cancel();
            if (e.key === 'Enter' && e.target.matches('[data-sd-mins]')) e.target.blur();
        });
        bindReorder(el);
    }

    function parseDuration(v) {
        const s = String(v || '').trim().toLowerCase().replace(',', '.');
        let m = /^(\d+)\s*h\s*(\d+)?\s*m?$/.exec(s) || /^(\d+):(\d{1,2})$/.exec(s);
        if (m) return parseInt(m[1], 10) * 60 + (parseInt(m[2], 10) || 0);
        m = /^(\d+(?:\.\d+)?)\s*h$/.exec(s);
        if (m) return Math.round(parseFloat(m[1]) * 60);
        m = /^(\d+)\s*(m|min)?$/.exec(s);
        return m ? parseInt(m[1], 10) : NaN;
    }

    // − / + : 15 minutes at a time, never more than fits in the window
    function step(id, delta) {
        const cur = D.split[id] || 0;
        // from an odd value (typed by hand) the first step lands on a multiple of 15
        const next = Math.max(0, delta > 0 ? Math.floor(cur / STEP) * STEP + STEP : Math.ceil(cur / STEP) * STEP - STEP);
        if (delta > 0 && !fits(Object.assign({}, D.split, { [id]: next }))) {
            D.note = 'The window is full: lower another task, pick longer sessions or make the window longer.';
        } else {
            D.split[id] = next;
            D.note = '';
        }
        rerender();
    }
    function setMinutes(id, mins) {
        if (!Number.isFinite(mins) || mins < 0) { rerender(); return; }
        const want = Math.round(mins);
        const max = maxFor(id, want);
        D.split[id] = Math.min(want, max);
        D.note = max < want ? `Only ${dur(max)} of ${tpl(id) ? tpl(id).title : 'it'} fit with the other tasks as they are.` : '';
        rerender();
    }
    // Ticking a task gives it what is left of it today, as far as there is room (the tasks above keep theirs)
    function toggleSubject(id, on) {
        if (on && !D.on.includes(id)) D.on.push(id);
        if (!on) { D.on = D.on.filter(x => x !== id); delete D.split[id]; }
        D.note = '';
        if (on && D.start && D.end) {
            D.split[id] = 0;
            const want = roundUp(leftOf(id)) || 30;
            D.split[id] = maxFor(id, want);
            const t = tpl(id);
            if (D.split[id] === 0) D.note = `The window is full: lower another task to make room for ${t ? t.title : 'it'}.`;
            else if (D.split[id] < want) D.note = `${t ? t.title : 'It'} needs ${dur(want)} ${dayWord()}: ${dur(D.split[id])} fit here.`;
        }
        rerender();
    }
    function pickPlace(refId) {
        D.refId = refId;
        const p = placeObj();
        D.place = p ? p.ref.title : 'Home';
        rerender();
    }

    // Drag the ⋮⋮ grip to change the order of the tasks (mouse and touch)
    function bindReorder(el) {
        el.addEventListener('pointerdown', (e) => {
            const grip = e.target.closest('[data-sd-grip]');
            if (!grip || !D) return;
            e.preventDefault();
            const listEl = el.querySelector('[data-sd-list]');
            const row = grip.closest('[data-tid]');
            const id = row.dataset.tid;
            row.classList.add('is-moving');
            grip.setPointerCapture?.(e.pointerId);
            const onMove = (ev) => {
                const rows = [...listEl.querySelectorAll('[data-tid]')];
                const others = rows.filter(r => r !== row);
                let idx = others.findIndex(r => { const b = r.getBoundingClientRect(); return ev.clientY < b.top + b.height / 2; });
                if (idx < 0) idx = others.length;
                const before = others[idx] || null;
                if (before !== row.nextElementSibling) listEl.insertBefore(row, before);
            };
            const onUp = () => {
                grip.removeEventListener('pointermove', onMove);
                grip.removeEventListener('pointerup', onUp);
                grip.removeEventListener('pointercancel', onUp);
                row.classList.remove('is-moving');
                const order = [...listEl.querySelectorAll('[data-tid]')].map(r => r.dataset.tid);
                if (order.join('|') !== D.list.join('|')) { D.list = order; rerender(); }
            };
            grip.addEventListener('pointermove', onMove);
            grip.addEventListener('pointerup', onUp);
            grip.addEventListener('pointercancel', onUp);
        });
    }

    function save() {
        if (!D || !D.start || !D.end) return;
        const plan = planFor();
        if (!plan.sessions.length) return;
        const S = St();
        const existing = D.id ? S.findWindow(D.date, D.id) : null;
        // the kind of work is a property of the task: saved on it
        D.list.forEach(id => { const t = tpl(id); if (t && D.loads[id] && t.load !== D.loads[id]) t.load = D.loads[id]; });
        // what Cortex learns: the session length you pick, how you split the time
        if (!existing || S.lengthOf(existing) !== D.len) S.noteLengthPick(D.len);
        const p = placeObj();
        const res = S.saveWindow(D.date, {
            id: D.id, refId: D.refId,
            place: p ? p.ref.title : (D.place || 'Home'),
            color: p ? p.ref.color : null,
            start: D.start, end: D.end, len: D.len,
            subjects: onIds(),
            split: Object.fromEntries(onIds().map(id => [id, D.split[id] || 0]))
        });
        const host = D.host;
        cleanup();
        D = null;
        refreshHost(host);
        if (typeof showToast === 'function' && res && res.plan) {
            showToast(`${res.plan.sessions.length} study session${res.plan.sessions.length === 1 ? '' : 's'} planned · ${res.win.place} ${res.win.start}–${res.win.end}`);
        }
    }

    // Leaving the page that hosts the draft closes it (nothing is saved)
    (function hookNavigation() {
        if (typeof navigateToSection !== 'function') return;
        const orig = navigateToSection;
        window.navigateToSection = navigateToSection = function (secKey, ...rest) {
            if (D && secKey !== (D.host === 'today' ? 'today' : 'plan')) { cleanup(); D = null; }
            return orig.call(this, secKey, ...rest);
        };
    })();
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && D && !document.querySelector('.modal-overlay[style*="flex"]')) cancel(); });

    window.CortexStudyDraft = { start, cancel, isActive, editingId, mountPlan, renderToday };
})();
