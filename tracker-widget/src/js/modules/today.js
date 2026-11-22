// --- js/modules/today.js ---
// TODAY: the home screen of Cortex.
//   Left  → NOW (focus timer or current block) · TODAY's tasks · quick stats
//   Right → TIMELINE of the day (fixed tasks, planned blocks, events)
// On narrow screens the two columns stack.
// Reuses the app's existing logic (templates, logs, focus engine, money metrics).

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
            const done = log.every(Boolean);
            const win = Array.isArray(t.timeWindows)
                ? t.timeWindows.find(w => w && w.days && w.days.includes(dayIdx) && w.start)
                : null;
            const mins = typeof getTaskDurationMinutes === 'function' ? getTaskDurationMinutes(t, todayStr) : 0;
            return { t, inst, log, done, start: win ? win.start : null, mins };
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
            const items = (r.sections || []).flatMap(sec => (sec.items || []).map(it => ({ sec: sec.title, title: it.title })));
            const list = items.map(it => `<li><span class="dim">${esc(it.sec)}</span> ${esc(it.title)}</li>`).join('');
            return `
                <details class="today-routine" style="--task-color:${esc(r.color || '#ffffff')}">
                    <summary><span>${esc(r.title)}</span><span class="dim">${items.length} steps</span></summary>
                    <ul>${list || '<li class="dim">No steps</li>'}</ul>
                </details>`;
        }).join('');
        return `
            <div class="today-section-head"><span>ROUTINES</span><span class="dim">${active.length}</span></div>
            <div class="today-routines">${blocks}</div>`;
    }

    function getTimelineBlocks() {
        const dayIdx = (typeof getNow === 'function' ? getNow() : new Date()).getDay();
        const blocks = [];
        (typeof templates !== 'undefined' ? templates : []).forEach(t => {
            if (!t || !Array.isArray(t.timeWindows) || !isTaskActiveOnDate(t, todayStr)) return;
            t.timeWindows.forEach(w => {
                if (w && w.days && w.days.includes(dayIdx) && w.start && w.end) {
                    blocks.push({ start: toMins(w.start), end: toMins(w.end), title: t.title, color: t.color, kind: 'task' });
                }
            });
        });
        const eph = (typeof ephemeralData !== 'undefined' && Array.isArray(ephemeralData[todayStr])) ? ephemeralData[todayStr] : [];
        eph.forEach(b => {
            if (b && b.start && b.end) blocks.push({ start: toMins(b.start), end: toMins(b.end), title: b.title, color: b.color, kind: 'block' });
        });
        (typeof specificEvents !== 'undefined' ? specificEvents : []).forEach(e => {
            if (e && e.date === todayStr && e.start && e.end) blocks.push({ start: toMins(e.start), end: toMins(e.end), title: e.title, color: e.color, kind: 'event' });
        });
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

        return { streak, done, total, focusMin, spendable };
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
            return `
                <div class="today-now is-live">
                    <div class="today-now-row">
                        <span class="today-now-label">${isPomodoroPaused ? 'PAUSED' : 'FOCUS'}</span>
                        <span class="today-now-time">${pad(Math.floor(secs / 60))}:${pad(secs % 60)}</span>
                    </div>
                    <div class="today-now-title">${esc(title)}</div>
                    <div class="today-progress"><div style="width:${pct.toFixed(1)}%"></div></div>
                    <div class="today-now-actions">
                        <button type="button" class="btn btn-sm" onclick="togglePomodoroPause(); renderTodayModule();">${isPomodoroPaused ? '[RESUME]' : '[PAUSE]'}</button>
                        <button type="button" class="btn btn-sm" onclick="skipPomodoroPhase(); renderTodayModule();">[SKIP]</button>
                        <button type="button" class="ghost-btn" onclick="openFullscreenFocusOverlay()">Fullscreen</button>
                        <button type="button" class="ghost-btn danger" onclick="stopPomodoro(); renderTodayModule();" aria-label="Stop focus">Stop</button>
                    </div>
                </div>`;
        }

        const now = (typeof getNow === 'function' ? getNow() : new Date());
        const cur = now.getHours() * 60 + now.getMinutes();
        const blocks = getTimelineBlocks();
        const current = blocks.find(b => cur >= b.start && cur < b.end);
        const next = blocks.find(b => b.start > cur);
        let line = '<span class="dim">Nothing scheduled right now.</span>';
        if (current) line = `<span class="dim">Until ${fmtMins(current.end)}</span> ${esc(current.title)}`;
        else if (next) line = `<span class="dim">Next at ${fmtMins(next.start)}</span> ${esc(next.title)}`;

        return `
            <div class="today-now">
                <div class="today-now-row">
                    <span class="today-now-label">${current ? 'NOW' : 'UP NEXT'}</span>
                </div>
                <div class="today-now-title">${line}</div>
                <div class="today-now-actions">
                    <button type="button" class="btn btn-primary btn-sm" onclick="openTimerModal()">[▶ START FOCUS]</button>
                </div>
            </div>`;
    }

    function renderTaskRows(items) {
        if (!items.length) {
            return `<div class="today-empty">No tasks for today. Add one below or press <kbd>Ctrl K</kbd>.</div>`;
        }
        return items.map(({ t, inst, log, done, start, mins }) => {
            const boxes = Array.from({ length: inst }, (_, i) =>
                `<button type="button" class="check-box ${log[i] ? 'checked' : ''}" aria-label="Mark ${esc(t.title)} ${inst > 1 ? (i + 1) : ''} done" data-today-toggle="${esc(t.id)}" data-i="${i}"></button>`
            ).join('');
            const meta = [];
            if (start) meta.push(start);
            if (!start && mins > 0) meta.push(mins >= 60 ? `${(mins / 60).toFixed(mins % 60 ? 1 : 0)}h` : `${mins}m`);
            if (t.isTodo) meta.push('to-do');
            const canFocus = !done && mins > 0;
            return `
                <div class="today-task ${done ? 'is-done' : ''}" style="--task-color:${esc(t.color || '#ffffff')}">
                    <div class="today-task-checks">${boxes}</div>
                    <div class="today-task-title">${esc(t.title)}</div>
                    <div class="today-task-meta">${esc(meta.join(' · '))}</div>
                    ${canFocus ? `<button type="button" class="ghost-btn today-task-play" data-today-focus="${esc(t.id)}" aria-label="Focus on ${esc(t.title)}">▶</button>` : '<span class="today-task-play"></span>'}
                </div>`;
        }).join('');
    }

    function renderTimeline(blocks) {
        const now = (typeof getNow === 'function' ? getNow() : new Date());
        const cur = now.getHours() * 60 + now.getMinutes();
        if (!blocks.length) {
            return `<div class="today-empty">No timed blocks today. Plan your day in <a href="#" data-nav="plan">Plan</a>.</div>`;
        }
        let nowDrawn = false;
        const rows = [];
        blocks.forEach(b => {
            if (!nowDrawn && b.start > cur) {
                rows.push(`<div class="today-tl-now"><span>${fmtMins(cur)}</span></div>`);
                nowDrawn = true;
            }
            const state = b.end <= cur ? 'is-past' : (b.start <= cur ? 'is-current' : '');
            rows.push(`
                <div class="today-tl-row ${state}">
                    <span class="today-tl-time">${fmtMins(b.start)}</span>
                    <span class="today-tl-block" style="--block-color:${esc(b.color || '#555555')}">
                        <span class="today-tl-title">${esc(b.title)}</span>
                        <span class="today-tl-end">${fmtMins(b.end)}</span>
                    </span>
                </div>`);
        });
        if (!nowDrawn) rows.push(`<div class="today-tl-now"><span>${fmtMins(cur)}</span></div>`);
        return rows.join('');
    }

    function renderTodayModule() {
        const root = document.getElementById('module-today');
        if (!root) return;

        // Today always shows today, whatever date other modules are browsing
        const items = getTodayTasks();
        const blocks = getTimelineBlocks();
        const st = getStats();
        const doneCount = items.filter(i => i.done).length;
        const focusH = (st.focusMin / 60).toFixed(st.focusMin % 60 ? 1 : 0);
        const money = st.spendable === null ? '—' : `€${Number(st.spendable).toFixed(0)}`;
        const dateObj = typeof parseLocalDate === 'function' ? parseLocalDate(todayStr) : new Date();
        const dateLabel = dateObj.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

        const openRoutines = new Set([...root.querySelectorAll('.today-routine[open] summary span:first-child')].map(e => e.textContent));
        const keepInput = root.querySelector('#today-add-input');
        const draft = keepInput ? keepInput.value : '';
        const hadFocus = keepInput && document.activeElement === keepInput;

        root.innerHTML = `
            <div class="today-wrap">
                <section class="today-main">
                    <div class="today-date">${esc(dateLabel)}</div>
                    ${renderReviewInvite()}
                    ${renderWeekPriorities()}
                    ${renderNowCard()}
                    ${renderComingUp()}
                    <div class="today-section-head">
                        <span>TODAY</span>
                        <span class="dim">${doneCount} / ${items.length}</span>
                    </div>
                    <div class="today-tasks">${renderTaskRows(items)}</div>
                    <input type="text" id="today-add-input" class="today-add" placeholder="+ Add a to-do for today" autocomplete="off">
                    ${renderRoutines()}
                    <div class="today-stats">
                        <div class="today-stat"><span class="dim">STREAK</span><strong>${st.streak}d</strong></div>
                        <div class="today-stat"><span class="dim">FOCUS</span><strong>${focusH}h</strong></div>
                        ${(typeof isModuleEnabled !== 'function' || isModuleEnabled('money')) ? `<div class="today-stat" data-nav="money"><span class="dim">FREE</span><strong class="${st.spendable !== null && st.spendable < 0 ? 'neg' : ''}">${money}</strong></div>` : ''}
                    </div>
                </section>
                <section class="today-side">
                    <div class="today-section-head">
                        <span>TIMELINE</span>
                        <button type="button" class="ghost-btn" data-nav="plan">Edit plan</button>
                    </div>
                    <div class="today-timeline">${renderTimeline(blocks)}</div>
                </section>
            </div>`;

        root.querySelectorAll('.today-routine').forEach(d => {
            if (openRoutines.has(d.querySelector('summary span')?.textContent)) d.open = true;
        });

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

        root.querySelectorAll('[data-today-toggle]').forEach(el => {
            el.addEventListener('click', () => {
                const prev = selectedDateStr;
                selectedDateStr = todayStr;
                toggleTask(el.dataset.todayToggle, parseInt(el.dataset.i, 10));
                selectedDateStr = prev;
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
