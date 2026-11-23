// --- js/modules/review.js ---
// WEEKLY REVIEW: how the week went (vs the week before) + 3 priorities for next week.
// The week reviewed is Monday → Sunday of the current week (on Sunday evening that's "this week").
// Priorities are saved in dailyPriorities['week:<next Monday>'] (synced) and shown on Today.

(function () {
    'use strict';

    const esc = (s) => (typeof escapeHtml === 'function' ? escapeHtml(String(s ?? '')) : String(s ?? ''));
    const L = () => window.CortexLinks;

    function daysOf(monday) {
        return Array.from({ length: 7 }, (_, i) => L().addDays(monday, i));
    }

    function weekStats(monday) {
        const days = daysOf(monday);
        const last = days[6];
        const inWeek = (d) => d && d >= monday && d <= last;

        let done = 0, total = 0;
        days.forEach(d => {
            if (d > todayStr) return;
            const s = typeof getStatsForDate === 'function' ? getStatsForDate(d) : { completed: 0, total: 0 };
            done += s.completed; total += s.total;
        });

        let focusMin = 0;
        const byCat = {};
        (typeof focusLogs !== 'undefined' ? focusLogs : []).forEach(l => {
            if (!l || !inWeek(l.date)) return;
            const m = Number(l.minutes || 0);
            focusMin += m;
            const k = l.category === 'Study' ? l.title : (l.category || 'General');
            byCat[k] = (byCat[k] || 0) + m;
        });

        let spent = 0, earned = 0;
        (typeof mTransactions !== 'undefined' ? mTransactions : []).forEach(t => {
            if (!t || !inWeek(t.date)) return;
            if (t.type === 'in') earned += Number(t.amount || 0); else spent += Number(t.amount || 0);
        });

        const gymTask = (typeof templates !== 'undefined' ? templates : []).find(t => typeof isGymRoutineTask === 'function' && isGymRoutineTask(t));
        const gym = gymTask ? days.filter(d => logs[d] && logs[d][gymTask.id] && logs[d][gymTask.id].some(Boolean)).length : 0;

        const weights = (typeof bodyLogs !== 'undefined' ? bodyLogs : []).filter(b => b && inWeek(b.date)).sort((a, b) => a.date.localeCompare(b.date));
        const weight = weights.length ? { first: weights[0].weight, last: weights[weights.length - 1].weight } : null;

        // Habits: recurring tasks with at least 3 active days this week
        const habits = [];
        (typeof templates !== 'undefined' ? templates : []).forEach(t => {
            if (!t || t.isTodo || t.type === 'medicine') return;
            let act = 0, ok = 0;
            days.forEach(d => {
                if (d > todayStr || !isTaskActiveOnDate(t, d)) return;
                act++;
                const log = logs[d] && logs[d][t.id];
                if (log && log.every(Boolean)) ok++;
            });
            if (act >= 3) habits.push({ title: t.title, ratio: ok / act, ok, act });
        });
        habits.sort((a, b) => b.ratio - a.ratio);

        return { done, total, focusMin, byCat, spent, earned, gym, weight, habits };
    }

    function delta(cur, prev, { money = false, invert = false } = {}) {
        if (!prev && !cur) return '';
        const diff = cur - prev;
        if (Math.abs(diff) < 0.01) return '<span class="dim">= last week</span>';
        const good = invert ? diff < 0 : diff > 0;
        const val = money ? `€${Math.abs(diff).toFixed(0)}` : Math.abs(diff) % 1 ? Math.abs(diff).toFixed(1) : Math.abs(diff);
        return `<span class="${good ? 'up' : 'down'}">${diff > 0 ? '▲' : '▼'} ${val}</span>`;
    }

    const h = (m) => (m / 60).toFixed(m % 60 ? 1 : 0);
    const fmtRange = (monday) => {
        const a = parseLocalDate(monday), b = parseLocalDate(L().addDays(monday, 6));
        const o = { day: 'numeric', month: 'short' };
        return `${a.toLocaleDateString('en-GB', o)} – ${b.toLocaleDateString('en-GB', o)}`;
    };

    function renderReviewModule() {
        const root = document.getElementById('module-review');
        if (!root || !L()) return;

        const monday = L().mondayOf(todayStr);
        const prevMonday = L().addDays(monday, -7);
        const nextMonday = L().addDays(monday, 7);
        const cur = weekStats(monday);
        const prev = weekStats(prevMonday);
        const pct = cur.total ? Math.round((cur.done / cur.total) * 100) : 0;
        const prevPct = prev.total ? Math.round((prev.done / prev.total) * 100) : 0;

        const cats = Object.entries(cur.byCat).sort((a, b) => b[1] - a[1]).slice(0, 5);
        const maxCat = cats.length ? cats[0][1] : 1;
        const best = cur.habits.slice(0, 3);
        const worst = cur.habits.filter(x => x.ratio < 1).slice(-3).reverse();
        const study = L().getStudyPlan();
        const existing = L().getWeekPlan(nextMonday);
        const prio = (existing && existing.items) || [];
        const lastWeekPlan = L().getWeekPlan(monday);
        const lastItems = (lastWeekPlan && lastWeekPlan.items || []).filter(i => i && i.text);

        root.innerHTML = `
            <div class="review-wrap">
                <div class="review-head">
                    <div>
                        <div class="today-date">WEEKLY REVIEW</div>
                        <div class="review-title">${esc(fmtRange(monday))}</div>
                    </div>
                    ${existing && existing.reviewedAt ? '<span class="dim">Reviewed ✓</span>' : ''}
                </div>

                <div class="review-grid">
                    <div class="today-stat"><span class="dim">TASKS DONE</span><strong>${pct}%</strong>${delta(pct, prevPct)}<span class="dim">${cur.done} / ${cur.total}</span></div>
                    <div class="today-stat"><span class="dim">FOCUS</span><strong>${h(cur.focusMin)}h</strong>${delta(cur.focusMin / 60, prev.focusMin / 60)}</div>
                    <div class="today-stat"><span class="dim">SPENT</span><strong>€${cur.spent.toFixed(0)}</strong>${delta(cur.spent, prev.spent, { money: true, invert: true })}</div>
                    <div class="today-stat"><span class="dim">EARNED</span><strong>€${cur.earned.toFixed(0)}</strong>${delta(cur.earned, prev.earned, { money: true })}</div>
                    <div class="today-stat"><span class="dim">GYM</span><strong>${cur.gym}×</strong>${delta(cur.gym, prev.gym)}</div>
                    <div class="today-stat"><span class="dim">WEIGHT</span><strong>${cur.weight ? cur.weight.last + ' kg' : '—'}</strong>${cur.weight && cur.weight.first !== cur.weight.last ? `<span class="dim">from ${cur.weight.first}</span>` : ''}</div>
                </div>

                ${lastItems.length ? `
                <div class="today-section-head"><span>LAST WEEK'S PRIORITIES</span><span class="dim">${lastItems.filter(i => i.done).length} / ${lastItems.length}</span></div>
                <div class="review-list">${lastItems.map(i => `<div class="${i.done ? '' : 'dim'}">${i.done ? '✓' : '○'} ${esc(i.text)}</div>`).join('')}</div>` : ''}

                <div class="review-cols">
                    <div>
                        <div class="today-section-head"><span>WHERE YOUR FOCUS WENT</span></div>
                        ${cats.length ? cats.map(([k, m]) => `
                            <div class="review-bar-row"><span>${esc(k)}</span><span class="review-bar"><span style="width:${Math.round((m / maxCat) * 100)}%"></span></span><span class="dim">${h(m)}h</span></div>`).join('')
                            : '<div class="today-empty">No focus sessions logged this week.</div>'}
                    </div>
                    <div>
                        <div class="today-section-head"><span>HABITS</span></div>
                        ${best.length ? `<div class="review-list">${best.map(x => `<div>▲ ${esc(x.title)} <span class="dim">${x.ok}/${x.act}</span></div>`).join('')}</div>` : '<div class="today-empty">Not enough recurring tasks yet.</div>'}
                        ${worst.length ? `<div class="review-list">${worst.map(x => `<div class="dim">▼ ${esc(x.title)} ${x.ok}/${x.act}</div>`).join('')}</div>` : ''}
                    </div>
                </div>

                ${study.length ? `
                <div class="today-section-head"><span>EXAMS AHEAD</span></div>
                <div class="review-list">${study.map(p => `<div>${esc(p.name)} <span class="dim">· ${p.date} · ${Math.round(p.studiedMin / 60)}h / ${Math.round(p.targetMin / 60)}h · ~${h(p.perDayMin)}h/day needed</span></div>`).join('')}</div>` : ''}

                <div class="today-section-head"><span>3 PRIORITIES FOR NEXT WEEK</span> <span class="dim">${esc(fmtRange(nextMonday))}</span></div>
                <div class="review-prio">
                    ${[0, 1, 2].map(i => `<input type="text" class="today-add" data-prio="${i}" placeholder="${['The one thing that matters most', 'Second priority', 'Third priority'][i]}" value="${esc((prio[i] && prio[i].text) || '')}" autocomplete="off">`).join('')}
                </div>
                <div class="review-actions">
                    <button type="button" class="btn btn-primary" data-save-review>[SAVE AND CLOSE THE WEEK]</button>
                </div>
            </div>`;

        root.querySelector('[data-save-review]').addEventListener('click', () => {
            const items = [...root.querySelectorAll('[data-prio]')].map(inp => inp.value.trim()).filter(Boolean)
                .map((text, i) => ({ text, done: !!(prio[i] && prio[i].text === text && prio[i].done) }));
            L().saveWeekPlan(nextMonday, { items, reviewedAt: new Date().toISOString() });
            if (typeof showToast === 'function') showToast(`[REVIEW] Week closed · ${items.length} priorities set for next week`);
            if (typeof navigateToSection === 'function') navigateToSection('today', 'today');
        });
        root.querySelectorAll('[data-prio]').forEach((inp, i, all) => {
            inp.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); (all[i + 1] || root.querySelector('[data-save-review]')).focus(); }
            });
        });
    }

    window.renderReviewModule = renderReviewModule;

    if (typeof dashboardModules !== 'undefined') {
        dashboardModules.review = { name: 'Weekly review', id: 'module-review', minW: () => 320, minH: () => 300, render: renderReviewModule };
        if (typeof ALL_MODULE_KEYS !== 'undefined' && !ALL_MODULE_KEYS.includes('review')) ALL_MODULE_KEYS.push('review');
        if (typeof MACRO_SUBMODULES_MAP !== 'undefined') MACRO_SUBMODULES_MAP.review = ['review'];
    }
})();
