// --- js/modules/today.js ---
// TODAY: the home screen of Cortex.
//   Left  → cards: week priorities · now/up next · study windows · coming up · tasks · meals · routines · numbers
//   Right → TIMELINE of the day (fixed tasks, study windows with their sessions, meals, events)
// Which cards show, and in which order, is chosen in Settings → Today (js/core/prefs.js).
// On narrow screens everything stacks in that order.

(function () {
    'use strict';

    const esc = (s) => (typeof escapeHtml === 'function' ? escapeHtml(String(s ?? '')) : String(s ?? ''));
    const toMins = (hhmm) => {
        if (!hhmm || typeof hhmm !== 'string') return null;
        const [h, m] = hhmm.split(':').map(Number);
        return Number.isFinite(h) ? h * 60 + (m || 0) : null;
    };
    const pad = (n) => String(n).padStart(2, '0');
    const fmtMins = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
    const nowMinutes = () => { const n = (typeof getNow === 'function' ? getNow() : new Date()); return n.getHours() * 60 + n.getMinutes(); };
    const fmtDur = (m) => (window.CortexStudy ? CortexStudy.fmtDur(m) : `${Math.round(m)}m`);

    // ------------------------------------------------------------------
    // Data
    // ------------------------------------------------------------------

    function getTodayTasks() {
        const list = (typeof templates !== 'undefined' ? templates : []).filter(t =>
            t && t.type !== 'medicine' && typeof isTaskActiveOnDate === 'function' && isTaskActiveOnDate(t, todayStr)
            // the gym routine has its own card in COMING UP
            && !(typeof isGymRoutineTask === 'function' && isGymRoutineTask(t))
        );
        const dayIdx = (typeof getNow === 'function' ? getNow() : new Date()).getDay();
        return list.map(t => {
            const inst = t.instances || 1;
            const log = (logs[todayStr] && logs[todayStr][t.id]) || Array(inst).fill(false);
            const win = Array.isArray(t.timeWindows)
                ? t.timeWindows.find(w => w && w.days && w.days.includes(dayIdx) && w.start)
                : null;
            const mins = typeof getTaskDurationMinutes === 'function' ? getTaskDurationMinutes(t, todayStr) : 0;
            // Tasks measured in time (Algebra 2h): progress in minutes instead of boxes
            const timeTarget = window.CortexStudy && CortexStudy.isTimeTarget(t, todayStr) && mins > 0;
            const prog = timeTarget ? CortexStudy.progress(t, todayStr) : null;
            const ticks = log.filter(Boolean).length;
            const done = prog ? prog.complete : ticks >= inst;
            return { t, inst, log, ticks, done, start: win ? win.start : null, mins, prog };
        }).sort((a, b) => {
            if (a.done !== b.done) return a.done ? 1 : -1;
            const sa = toMins(a.start), sb = toMins(b.start);
            if (sa !== null && sb !== null) return sa - sb;
            if (sa !== null) return -1;
            if (sb !== null) return 1;
            return 0;
        });
    }

    function renderRoutines() {
        const active = (typeof routinesData !== 'undefined' ? routinesData : []).filter(r =>
            typeof isRoutineActiveOnDate === 'function' && isRoutineActiveOnDate(r, todayStr)
        );
        if (!active.length) return '';
        const blocks = active.map(r => {
            const logKey = typeof getRoutineLogStorageKey === 'function' ? getRoutineLogStorageKey(r, todayStr) : todayStr;
            const rLog = (typeof routineLogs !== 'undefined' && routineLogs[logKey]) || {};
            const secs = (r.sections || []).filter(sec => sec && Array.isArray(sec.items) && sec.items.length);
            const total = secs.reduce((a, sec) => a + sec.items.length, 0);
            const done = secs.reduce((a, sec) => a + sec.items.filter(it => rLog[it.id]).length, 0);
            // The section name appears once, above its steps (not repeated on every line)
            const sameAsTitle = secs.length === 1 && String(secs[0].title || '').trim().toLowerCase() === String(r.title || '').trim().toLowerCase();
            const list = secs.map(sec => `
                ${sameAsTitle || !sec.title ? '' : `<li class="today-routine-sec">${esc(sec.title)}</li>`}
                ${sec.items.map(it => `
                    <li><button type="button" class="today-routine-step ${rLog[it.id] ? 'is-done' : ''}" data-rt="${esc(r.id)}" data-rt-step="${esc(it.id)}" aria-pressed="${Boolean(rLog[it.id])}">
                        <span class="check-box ${rLog[it.id] ? 'checked' : ''}" aria-hidden="true"></span><span>${esc(it.title)}</span>
                    </button></li>`).join('')}`).join('');
            return `
                <details class="today-routine ${total && done === total ? 'is-complete' : ''}" style="--task-color:${esc(r.color || '#ffffff')}">
                    <summary><span>${esc(r.title)}</span><span class="dim">${done}/${total}</span></summary>
                    <ul>${list || '<li class="dim">No steps</li>'}</ul>
                </details>`;
        }).join('');
        return `
            <div class="today-section-head"><span>ROUTINES</span><span class="dim">${active.length}</span></div>
            <div class="today-routines">${blocks}</div>`;
    }

    // Every timed thing of today, flat (study sessions included), for the NOW card
    function getTimelineBlocks() {
        const dayIdx = (typeof getNow === 'function' ? getNow() : new Date()).getDay();
        const blocks = [];
        (typeof templates !== 'undefined' ? templates : []).forEach(t => {
            if (!t || !Array.isArray(t.timeWindows) || !isTaskActiveOnDate(t, todayStr)) return;
            t.timeWindows.forEach(w => {
                if (w && w.days && w.days.includes(dayIdx) && w.start && w.end) {
                    if (typeof plannerExceptions !== 'undefined' && plannerExceptions[`${t.id}_${todayStr}_${w.start}`]) return;
                    blocks.push({ start: toMins(w.start), end: toMins(w.end), title: t.title, color: t.color, kind: 'task' });
                }
            });
        });
        const eph = (typeof ephemeralData !== 'undefined' && Array.isArray(ephemeralData[todayStr])) ? ephemeralData[todayStr] : [];
        eph.forEach(b => {
            if (b && b.start && b.end) blocks.push({ start: toMins(b.start), end: toMins(b.end), title: b.title, color: b.color, kind: b.studyWindowId ? 'study' : 'block', windowId: b.studyWindowId || null, templateId: b.templateId });
        });
        (typeof specificEvents !== 'undefined' ? specificEvents : []).forEach(e => {
            if (e && e.date === todayStr && e.start && e.end) blocks.push({ start: toMins(e.start), end: toMins(e.end), title: e.title, color: e.color, kind: 'event' });
        });
        if (window.CortexMeals) {
            CortexMeals.getMealBlocks(todayStr).forEach(m => blocks.push({ start: m.start, end: m.end, title: m.title, sub: m.summary, color: '#8a8a8a', kind: 'meal', mealId: m.id, status: m.status }));
        }
        return blocks.filter(b => b.start !== null && b.end !== null).sort((a, b) => a.start - b.start);
    }

    function getStats() {
        let streak = 0, done = 0, total = 0;
        try {
            if (typeof computeConsistencyMetrics === 'function') {
                const m = computeConsistencyMetrics();
                streak = m.streak || 0;
                done = (m.todayStats && m.todayStats.completed) || 0;
                total = (m.todayStats && m.todayStats.total) || 0;
            } else if (typeof getStatsForDate === 'function') {
                const s = getStatsForDate(todayStr);
                done = s.completed; total = s.total;
            }
        } catch (e) { /* stats are optional */ }

        let focusMin = 0;
        (typeof focusLogs !== 'undefined' ? focusLogs : []).forEach(l => {
            if (l && (l.date === todayStr || (l.dateStr === todayStr))) focusMin += Number(l.minutes || l.mins || 0);
        });

        let spendable = null;
        try {
            if (typeof getMoneyAllocationMetrics === 'function') spendable = getMoneyAllocationMetrics().spendable;
        } catch (e) { /* money optional */ }

        let kcal = null;
        try {
            if (window.CortexMeals && (typeof isModuleEnabled !== 'function' || isModuleEnabled('diet'))) {
                const tot = CortexMeals.dayTotals(todayStr);
                if (tot.planned.kcal > 0) kcal = tot.eaten.kcal;
            }
        } catch (e) { /* diet optional */ }

        return { streak, done, total, focusMin, spendable, kcal };
    }

    // ------------------------------------------------------------------
    // Render
    // ------------------------------------------------------------------

    function renderNowCard() {
        const running = typeof focusPlaylist !== 'undefined' && focusPlaylist.length > 0 && currentPlaylistIndex < focusPlaylist.length;
        if (running) {
            const phase = focusPlaylist[currentPlaylistIndex];
            const secs = Math.abs(timeRemaining || 0);
            const pct = totalPhaseTime > 0 ? Math.max(0, Math.min(100, (timeRemaining / totalPhaseTime) * 100)) : 0;
            const title = phase.type === 'task' ? phase.title : 'Break';
            const nextPhase = focusPlaylist[currentPlaylistIndex + 1];
            const info = typeof getFocusSessionInfo === 'function' ? getFocusSessionInfo() : null;
            const fromTxt = info && !info.here && info.from ? ` · from your ${esc(info.from)}` : '';
            const queue = focusPlaylist.length > 1
                ? `<div class="today-now-queue dim">${currentPlaylistIndex + 1} of ${focusPlaylist.length}${nextPhase ? ` · next: ${nextPhase.type === 'break' ? `break ${nextPhase.duration}m` : esc(nextPhase.title)}` : ''}</div>`
                : '';
            return `
                <div class="today-now is-live ${phase.type === 'break' ? 'is-break' : ''}">
                    <div class="today-now-row">
                        <span class="today-now-label">${isPomodoroPaused ? 'PAUSED' : (phase.type === 'break' ? 'BREAK' : 'FOCUS')}${fromTxt}</span>
                        <span class="today-now-time">${pad(Math.floor(secs / 60))}:${pad(secs % 60)}</span>
                    </div>
                    <div class="today-now-title">${esc(title)}</div>
                    <div class="today-progress"><div style="width:${pct.toFixed(1)}%"></div></div>
                    ${queue}
                    <div class="today-now-actions">
                        <button type="button" class="btn btn-sm" onclick="togglePomodoroPause(); renderTodayModule();">${isPomodoroPaused ? '[RESUME]' : '[PAUSE]'}</button>
                        <button type="button" class="btn btn-sm" onclick="skipPomodoroPhase(); renderTodayModule();">[SKIP]</button>
                        <button type="button" class="ghost-btn" onclick="openFullscreenFocusOverlay()">Fullscreen</button>
                        <button type="button" class="ghost-btn danger" onclick="stopPomodoro(); renderTodayModule();" aria-label="Stop focus">Stop</button>
                    </div>
                </div>`;
        }

        const cur = nowMinutes();
        const blocks = getTimelineBlocks();
        const current = blocks.find(b => cur >= b.start && cur < b.end && b.kind !== 'meal') || blocks.find(b => cur >= b.start && cur < b.end);
        const next = blocks.find(b => b.start > cur);
        const focusBlock = current || next;
        let line = '<span class="dim">Nothing scheduled right now.</span>';
        if (current) line = `<span class="dim">Until ${fmtMins(current.end)}</span> ${esc(current.title)}`;
        else if (next) line = `<span class="dim">Next at ${fmtMins(next.start)}</span> ${esc(next.title)}`;

        let primary = '<button type="button" class="btn btn-primary btn-sm" onclick="openTimerModal()">[▶ START FOCUS]</button>';
        if (focusBlock && focusBlock.kind === 'study' && focusBlock.windowId) {
            primary = `<button type="button" class="btn btn-primary btn-sm" data-now-study="${esc(focusBlock.windowId)}">[▶ START STUDY]</button>
                       <button type="button" class="ghost-btn" onclick="openTimerModal()">Other focus</button>`;
        } else if (focusBlock && focusBlock.kind === 'meal' && !focusBlock.status && current === focusBlock) {
            primary = `<button type="button" class="btn btn-sm" data-meal-eaten="${esc(focusBlock.mealId)}">✓ Eaten</button>
                       <button type="button" class="btn btn-primary btn-sm" onclick="openTimerModal()">[▶ START FOCUS]</button>`;
        }

        return `
            <div class="today-now">
                <div class="today-now-row">
                    <span class="today-now-label">${current ? 'NOW' : 'UP NEXT'}</span>
                </div>
                <div class="today-now-title">${line}</div>
                <div class="today-now-actions">${primary}</div>
            </div>`;
    }

    function renderTaskRows(items) {
        if (!items.length) {
            const isPhone = typeof isMobileViewMode !== 'undefined' && isMobileViewMode;
            return `<div class="today-empty">No tasks for today. Add one below or ${isPhone ? 'tap <kbd>⌘</kbd> and write it' : 'press <kbd>Ctrl K</kbd>'}.</div>`;
        }
        return items.map(({ t, inst, ticks, done, start, mins, prog }) => {
            // One box per row, so every title lines up. Multi-step tasks advance one step per tap.
            const box = `<button type="button" class="check-box ${done ? 'checked' : ''} ${!done && ticks > 0 ? 'partial' : ''}" aria-label="Mark ${esc(t.title)} done" data-today-check="${esc(t.id)}"></button>`;
            let meta = '';
            let bar = '';
            if (prog) {
                meta = `<b>${fmtDur(Math.min(prog.done, Math.max(prog.target, prog.done)))}</b> / ${fmtDur(prog.target)}`;
                const pct = prog.target > 0 ? Math.min(100, (prog.done / prog.target) * 100) : (done ? 100 : 0);
                bar = `<div class="today-task-bar"><div style="width:${pct.toFixed(1)}%"></div></div>`;
            } else {
                const bits = [];
                if (start) bits.push(start);
                if (inst > 1) bits.push(`${ticks}/${inst}`);
                if (!start && mins > 0 && inst === 1) bits.push(fmtDur(mins));
                if (t.isTodo) bits.push('to-do');
                meta = esc(bits.join(' · '));
            }
            const canFocus = !done && mins > 0;
            return `
                <div class="today-task ${done ? 'is-done' : ''} ${prog ? 'has-bar' : ''}" style="--task-color:${esc(t.color || '#ffffff')}">
                    ${box}
                    <div class="today-task-body">
                        <div class="today-task-title">${esc(t.title)}</div>
                        ${bar}
                    </div>
                    <div class="today-task-meta">${meta}</div>
                    ${canFocus ? `<button type="button" class="ghost-btn today-task-play" data-today-focus="${esc(t.id)}" aria-label="Focus on ${esc(t.title)}">▶</button>` : '<span class="today-task-play"></span>'}
                </div>`;
        }).join('');
    }

    function toggleFromToday(id) {
        const t = (templates || []).find(x => x.id === id);
        if (!t) return;
        const inst = t.instances || 1;
        const prev = selectedDateStr;
        selectedDateStr = todayStr;
        try {
            const log = (logs[todayStr] && logs[todayStr][id]) || Array(inst).fill(false);
            const timeTarget = window.CortexStudy && CortexStudy.isTimeTarget(t, todayStr) && getTaskDurationMinutes(t, todayStr) > 0;
            const complete = timeTarget ? CortexStudy.progress(t, todayStr).complete : log.filter(Boolean).length >= inst;
            if (inst === 1) {
                toggleTask(id, 0);
            } else if (complete) {
                // un-tick everything
                if (!logs[todayStr]) logs[todayStr] = {};
                logs[todayStr][id] = Array(inst).fill(false);
                saveData();
                if (typeof renderTasks === 'function') renderTasks();
                if (typeof renderTracker === 'function') renderTracker();
            } else if (timeTarget) {
                // a study subject: one tap = done for today
                if (!logs[todayStr]) logs[todayStr] = {};
                logs[todayStr][id] = Array(inst).fill(true);
                saveData();
                if (typeof renderTasks === 'function') renderTasks();
                if (typeof renderTracker === 'function') renderTracker();
            } else {
                const next = log.findIndex(x => !x);
                toggleTask(id, next === -1 ? 0 : next);
            }
        } finally {
            selectedDateStr = prev;
        }
    }

    // TIMELINE: flat rows, study windows grouped with their sessions and breaks
    function renderTimeline() {
        const cur = nowMinutes();
        const flat = getTimelineBlocks().filter(b => b.kind !== 'study');
        const groups = window.CortexStudy ? CortexStudy.timelineGroups(todayStr) : [];
        const items = [
            ...flat.map(b => ({ type: 'block', start: b.start, b })),
            ...groups.map(g => ({ type: 'group', start: g.start, g }))
        ].sort((a, b) => a.start - b.start);
        if (!items.length) {
            return `<div class="today-empty">No timed blocks today. Plan your day in <a href="#" data-nav="plan">Plan</a>.</div>`;
        }

        const rows = [];
        let nowDrawn = false;
        const nowLine = () => `<div class="today-tl-now"><span>${fmtMins(cur)}</span></div>`;
        const maybeNow = (start) => { if (!nowDrawn && start > cur) { rows.push(nowLine()); nowDrawn = true; } };
        const stateOf = (s, e) => (e <= cur ? 'is-past' : (s <= cur ? 'is-current' : ''));

        items.forEach(it => {
            if (it.type === 'block') {
                const b = it.b;
                maybeNow(b.start);
                if (b.kind === 'meal') {
                    rows.push(`
                        <div class="today-tl-row is-meal ${stateOf(b.start, b.end)} ${b.status ? 'is-' + b.status : ''}">
                            <span class="today-tl-time">${fmtMins(b.start)}</span>
                            <button type="button" class="today-tl-block" data-meal-open="${esc(b.mealId)}" style="--block-color:#8a8a8a">
                                <span class="today-tl-title">${b.status === 'eaten' ? '✓ ' : b.status === 'partial' ? '◐ ' : b.status === 'skipped' ? '✗ ' : ''}${esc(b.title)} <span class="dim">${esc(b.sub || '')}</span></span>
                                <span class="today-tl-end">${fmtMins(b.end)}</span>
                            </button>
                        </div>`);
                    return;
                }
                rows.push(`
                    <div class="today-tl-row ${stateOf(b.start, b.end)}">
                        <span class="today-tl-time">${fmtMins(b.start)}</span>
                        <span class="today-tl-block" style="--block-color:${esc(b.color || '#555555')}">
                            <span class="today-tl-title">${esc(b.title)}</span>
                            <span class="today-tl-end">${fmtMins(b.end)}</span>
                        </span>
                    </div>`);
                return;
            }
            const g = it.g;
            maybeNow(g.start);
            rows.push(`
                <div class="today-tl-group-head ${stateOf(g.start, g.end)}">
                    <span class="today-tl-time">${fmtMins(g.start)}</span>
                    <button type="button" class="today-tl-group-title" data-study-edit="${esc(g.win.id)}" title="Edit this study window">
                        <span>◉ ${esc(g.label)} <span class="dim">· ${esc(g.rhythm)}</span></span>
                        <span class="today-tl-end">${fmtMins(g.end)}</span>
                    </button>
                </div>`);
            const ses = g.sessions;
            ses.forEach((b, i) => {
                const s = toMins(b.start), e = toMins(b.end);
                if (i > 0) {
                    const ps = toMins(ses[i - 1].end);
                    if (s - ps >= 3) {
                        maybeNow(ps);
                        rows.push(`<div class="today-tl-row is-break is-in-group ${stateOf(ps, s)}"><span class="today-tl-time">${fmtMins(ps)}</span><span class="today-tl-break">break · ${s - ps}m</span></div>`);
                    }
                }
                maybeNow(s);
                rows.push(`
                    <div class="today-tl-row is-in-group ${stateOf(s, e)}">
                        <span class="today-tl-time">${fmtMins(s)}</span>
                        <span class="today-tl-block" style="--block-color:${esc(b.color || '#555555')}">
                            <span class="today-tl-title">${esc(b.title)} <span class="dim">${e - s}m</span></span>
                            <span class="today-tl-end">${fmtMins(e)}</span>
                        </span>
                    </div>`);
            });
        });
        if (!nowDrawn) rows.push(nowLine());
        return rows.join('');
    }

    function renderStats(st) {
        const focusH = (st.focusMin / 60).toFixed(st.focusMin % 60 ? 1 : 0);
        const cells = [
            `<div class="today-stat"><span class="dim">STREAK</span><strong>${st.streak}d</strong></div>`,
            `<div class="today-stat"><span class="dim">FOCUS</span><strong>${focusH}h</strong></div>`
        ];
        if (st.kcal !== null) cells.push(`<div class="today-stat" data-nav="health" data-tab="diet"><span class="dim">EATEN</span><strong>${Math.round(st.kcal)}<small> kcal</small></strong></div>`);
        if (typeof isModuleEnabled !== 'function' || isModuleEnabled('money')) {
            const money = st.spendable === null ? '—' : `€${Number(st.spendable).toFixed(0)}`;
            cells.push(`<div class="today-stat" data-nav="money"><span class="dim">FREE</span><strong class="${st.spendable !== null && st.spendable < 0 ? 'neg' : ''}">${money}</strong></div>`);
        }
        return `<div class="today-stats">${cells.join('')}</div>`;
    }

    function cardOrder() {
        const list = typeof getPref === 'function' ? getPref('todayCards') : null;
        return Array.isArray(list) && list.length ? list : [
            { key: 'week', on: true }, { key: 'now', on: true }, { key: 'study', on: true }, { key: 'coming', on: true },
            { key: 'tasks', on: true }, { key: 'meals', on: true }, { key: 'routines', on: true }, { key: 'stats', on: true }, { key: 'timeline', on: true }
        ];
    }

    function renderTodayModule() {
        const root = document.getElementById('module-today');
        if (!root) return;

        // Today always shows today, whatever date other modules are browsing
        const items = getTodayTasks();
        const st = getStats();
        const doneCount = items.filter(i => i.done).length;
        const dateObj = typeof parseLocalDate === 'function' ? parseLocalDate(todayStr) : new Date();
        const dateLabel = dateObj.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
        const isPhone = typeof isMobileViewMode !== 'undefined' && isMobileViewMode;

        const openRoutines = new Set([...root.querySelectorAll('.today-routine[open] summary span:first-child')].map(e => e.textContent));
        const keepInput = root.querySelector('#today-add-input');
        const draft = keepInput ? keepInput.value : '';
        const hadFocus = keepInput && document.activeElement === keepInput;
        const prevScroll = root.scrollTop;

        const timelineHtml = () => `
            <div class="today-section-head">
                <span>TIMELINE</span>
                <button type="button" class="ghost-btn" data-nav="plan">Edit plan</button>
            </div>
            <div class="today-timeline">${renderTimeline()}</div>`;

        const cardHtml = {
            week: () => renderWeekPriorities(),
            now: () => renderNowCard(),
            study: () => (window.CortexStudy ? CortexStudy.renderTodayCard(todayStr) : ''),
            coming: () => renderComingUp(),
            tasks: () => `
                <div class="today-section-head">
                    <span>TODAY</span>
                    <span class="dim">${doneCount} / ${items.length}</span>
                </div>
                <div class="today-tasks">${renderTaskRows(items)}</div>
                <input type="text" id="today-add-input" class="today-add" placeholder="+ Add a to-do for today" autocomplete="off">`,
            meals: () => (window.CortexMeals ? CortexMeals.renderTodayCard(todayStr) : ''),
            routines: () => renderRoutines(),
            stats: () => renderStats(st),
            timeline: () => timelineHtml()
        };

        const order = cardOrder().filter(c => c.on && cardHtml[c.key]);
        const timelineOn = order.some(c => c.key === 'timeline');
        const mainKeys = order.filter(c => isPhone || c.key !== 'timeline').map(c => c.key);
        const mainHtml = mainKeys.map(k => {
            const html = cardHtml[k]();
            return html ? `<div class="today-card" data-card="${k}">${html}</div>` : '';
        }).join('');

        root.innerHTML = `
            <div class="today-wrap ${!timelineOn || isPhone ? 'is-single' : ''}">
                <section class="today-main">
                    <div class="today-date">${esc(dateLabel)}</div>
                    ${renderReviewInvite()}
                    ${mainHtml || '<div class="today-empty">Every card is hidden. Choose what Today shows in Settings → Today.</div>'}
                </section>
                ${timelineOn && !isPhone ? `<section class="today-side">${timelineHtml()}</section>` : ''}
            </div>`;
        if (prevScroll) root.scrollTop = prevScroll;

        root.querySelectorAll('.today-routine').forEach(d => {
            if (openRoutines.has(d.querySelector('summary span')?.textContent)) d.open = true;
        });
        root.querySelectorAll('[data-rt-step]').forEach(b => b.addEventListener('click', () => {
            if (typeof toggleRoutineStepCheckbox === 'function') toggleRoutineStepCheckbox(b.dataset.rt, b.dataset.rtStep, todayStr);
            renderTodayModule();
        }));

        const input = root.querySelector('#today-add-input');
        if (input) {
            input.value = draft;
            if (hadFocus) input.focus();
            input.addEventListener('keydown', (e) => {
                if (e.key !== 'Enter' || typeof addGeneralTask !== 'function') return;
                const prev = selectedDateStr;
                selectedDateStr = todayStr;
                addGeneralTask(e);
                selectedDateStr = prev;
                renderTodayModule();
                root.querySelector('#today-add-input')?.focus();
            });
        }

        root.querySelectorAll('[data-today-check]').forEach(el => {
            el.addEventListener('click', () => {
                toggleFromToday(el.dataset.todayCheck);
                renderTodayModule();
            });
        });
        root.querySelectorAll('[data-today-focus]').forEach(el => {
            el.addEventListener('click', () => {
                if (typeof quickStartTaskFocus !== 'function') return;
                const prev = selectedDateStr;
                selectedDateStr = todayStr;
                quickStartTaskFocus(el.dataset.todayFocus);
                selectedDateStr = prev;
                renderTodayModule();
            });
        });
        root.querySelectorAll('[data-nav]').forEach(el => {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                if (typeof navigateToSection === 'function') navigateToSection(el.dataset.nav, el.dataset.tab || null);
            });
        });
        root.querySelectorAll('[data-study]').forEach(el => {
            el.addEventListener('click', () => {
                if (typeof CortexLinks !== 'undefined') CortexLinks.startStudyFocus(el.dataset.study, 50, el.dataset.color || '#b08d43');
            });
        });
        root.querySelectorAll('[data-week-prio]').forEach(el => {
            el.addEventListener('click', () => {
                CortexLinks.toggleWeekPriority(CortexLinks.mondayOf(todayStr), parseInt(el.dataset.weekPrio, 10));
                renderTodayModule();
            });
        });
        root.querySelector('[data-gym-done]')?.addEventListener('click', () => {
            if (typeof openGymWorkoutReviewModal === 'function') openGymWorkoutReviewModal(todayStr, nextWorkoutDay);
        });
        root.querySelectorAll('[data-now-study]').forEach(el => el.addEventListener('click', () => {
            if (window.CortexStudy) { CortexStudy.startWindow(todayStr, el.dataset.nowStudy); renderTodayModule(); }
        }));
        // Study card + timeline window headers; meal card + timeline meals
        if (window.CortexStudy) CortexStudy.bindTodayCard(root, todayStr);
        if (window.CortexMeals) CortexMeals.bindTodayCard(root, todayStr);
    }

    // ------------------------------------------------------------------
    // Connections (js/modules/links.js)
    // ------------------------------------------------------------------
    function fmtH(mins) {
        if (mins < 60) return `${mins}m`;
        const h = mins / 60;
        return `${h % 1 ? h.toFixed(1) : h}h`;
    }

    function renderReviewInvite() {
        if (typeof CortexLinks === 'undefined' || !CortexLinks.isReviewDue()) return '';
        return `
            <div class="today-invite">
                <span>It's Sunday evening — your weekly review is ready.</span>
                <button type="button" class="btn btn-primary btn-sm" data-nav="today" data-tab="review">[REVIEW WEEK]</button>
            </div>`;
    }

    function renderWeekPriorities() {
        if (typeof CortexLinks === 'undefined') return '';
        const plan = CortexLinks.getWeekPlan();
        const items = plan && Array.isArray(plan.items) ? plan.items.filter(i => i && i.text) : [];
        if (!items.length) return '';
        return `
            <div class="today-week">
                <div class="today-week-head">THIS WEEK</div>
                ${items.map((it, i) => `
                    <button type="button" class="today-week-item ${it.done ? 'is-done' : ''}" data-week-prio="${i}">
                        <span class="today-week-num">${i + 1}</span><span>${esc(it.text)}</span>
                    </button>`).join('')}
            </div>`;
    }

    function renderComingUp() {
        if (typeof CortexLinks === 'undefined') return '';
        const rows = [];

        const on = (k) => typeof isModuleEnabled !== 'function' || isModuleEnabled(k);
        // Gym
        const gym = on('gym') ? CortexLinks.getTodayGym() : null;
        if (gym) {
            rows.push(`
                <div class="today-link ${gym.done ? 'is-done' : ''}">
                    <span class="today-link-kind">GYM</span>
                    <span class="today-link-main">${esc(gym.label)}<span class="dim"> · ${gym.exercises} exercises</span></span>
                    <span class="today-link-actions">
                        ${gym.done ? '<span class="dim">done ✓</span>' : `
                            <button type="button" class="ghost-btn" data-nav="health" data-tab="gym">Open</button>
                            <button type="button" class="btn btn-sm" data-gym-done>[DONE]</button>`}
                    </span>
                </div>`);
        }

        // Study (nearest appeals)
        (on('uni') ? CortexLinks.getStudyPlan() : []).slice(0, 3).forEach(p => {
            const pct = p.targetMin ? Math.min(100, Math.round((p.studiedMin / p.targetMin) * 100)) : 0;
            const when = p.daysLeft === 0 ? 'today' : p.daysLeft === 1 ? 'tomorrow' : `in ${p.daysLeft}d`;
            const todayLine = p.daysLeft === 0 ? 'Exam today — good luck'
                : p.todayLeftMin > 0 ? `~${fmtH(p.todayLeftMin)} left today` : 'on track today ✓';
            rows.push(`
                <div class="today-link" style="--link-color:${esc(p.color)}">
                    <span class="today-link-kind">EXAM ${esc(when)}</span>
                    <span class="today-link-main">${esc(p.name)}
                        <span class="dim"> · ${fmtH(p.studiedMin)} / ${fmtH(p.targetMin)} studied · ${esc(todayLine)}</span>
                        <span class="today-link-bar"><span style="width:${pct}%"></span></span>
                    </span>
                    <span class="today-link-actions">
                        ${p.daysLeft > 0 ? `<button type="button" class="btn btn-sm" data-study="${esc(p.name)}" data-color="${esc(p.color)}">[▶ STUDY 50m]</button>` : ''}
                    </span>
                </div>`);
        });

        // Bills
        (on('money') ? CortexLinks.getUpcomingBills() : []).forEach(b => {
            const days = CortexLinks.daysBetween(todayStr, b.due);
            const when = days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days}d`;
            rows.push(`
                <div class="today-link">
                    <span class="today-link-kind">BILL ${esc(when)}</span>
                    <span class="today-link-main">${esc(b.title)} · €${b.amount.toFixed(2)}<span class="dim"> · auto-deducted</span></span>
                    <span class="today-link-actions"><button type="button" class="ghost-btn" data-nav="money">Money</button></span>
                </div>`);
        });

        if (!rows.length) return '';
        return `
            <div class="today-section-head"><span>COMING UP</span></div>
            <div class="today-links">${rows.join('')}</div>`;
    }

    window.renderTodayModule = renderTodayModule;

    // Register as a module of the tiling engine (usable as a tile too)
    if (typeof dashboardModules !== 'undefined') {
        dashboardModules.today = {
            name: 'Today',
            id: 'module-today',
            minW: () => 300,
            minH: () => 240,
            render: renderTodayModule
        };
        if (typeof PRIMARY_MODULE_KEYS !== 'undefined' && !PRIMARY_MODULE_KEYS.includes('today')) PRIMARY_MODULE_KEYS.unshift('today');
        // ALL_MODULE_KEYS is computed once at load: without this the tiling engine
        // wouldn't park the Today element before re-rendering and would destroy it.
        if (typeof ALL_MODULE_KEYS !== 'undefined' && !ALL_MODULE_KEYS.includes('today')) ALL_MODULE_KEYS.push('today');
        if (typeof MACRO_SUBMODULES_MAP !== 'undefined') MACRO_SUBMODULES_MAP.today = ['today'];
    }

    // Live refresh: timer ticks every second while focus runs, otherwise once a minute
    let lastMinute = -1;
    setInterval(() => {
        const el = document.getElementById('module-today');
        if (!el || !el.isConnected || el.closest('#module-registry')) return;
        if (document.getElementById('study-editor') || document.getElementById('meal-sheet')) return;
        const running = typeof focusPlaylist !== 'undefined' && focusPlaylist.length > 0 && currentPlaylistIndex < focusPlaylist.length;
        const m = new Date().getMinutes();
        if (running) {
            const t = el.querySelector('.today-now-time');
            if (t) {
                const secs = Math.abs(timeRemaining || 0);
                t.textContent = `${pad(Math.floor(secs / 60))}:${pad(secs % 60)}`;
                const bar = el.querySelector('.today-progress > div');
                if (bar && totalPhaseTime > 0) bar.style.width = `${Math.max(0, Math.min(100, (timeRemaining / totalPhaseTime) * 100)).toFixed(1)}%`;
            } else {
                renderTodayModule();
            }
        } else if (m !== lastMinute || el.querySelector('.today-now.is-live')) {
            if (document.activeElement && document.activeElement.id === 'today-add-input') return;
            lastMinute = m;
            renderTodayModule();
        }
    }, 1000);
})();
