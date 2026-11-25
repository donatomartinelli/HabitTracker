// --- js/modules/study.js ---
// STUDY WINDOWS — the planner
//
// A window is where and when you study (Library 09:00–12:00), which tasks you work on, in which
// order, and how many minutes of study each gets (Theory 1h, Practice 1h, Anki 30m).
// Those minutes are all study: breaks come on top of them, never out of them.
// Sessions last at most one hour. The plan you pick sets their length (30, 45 or 60 minutes) and
// the breaks after them (5, 10 or 15 minutes; 20 about every two hours of study).
// Three kinds of work, each with its own light colour on every exam:
//   Theory (studio) · Practice (esercizi) · Review (Anki)
//
// Data: studyPlans[date] = { windows: [...], targets: {...} }  (state.js, synced)
//   window = { id, refId, place, color, start, end, subjects:[tid, in order], split:{tid: study minutes}, len: 30|45|60 }
// Sessions are day blocks in ephemeralData[date] with studyWindowId and phase, so every view shows them.
// A session moved by hand or done with the timer stays where it is when the window re-plans.
// Creating and editing a window happens on the timeline itself: js/modules/study-draft.js.

(function () {
    'use strict';

    const esc = (s) => (typeof escapeHtml === 'function' ? escapeHtml(String(s ?? '')) : String(s ?? ''));
    const pad = (n) => String(n).padStart(2, '0');
    const toMin = (hhmm) => {
        if (!hhmm || typeof hhmm !== 'string' || !hhmm.includes(':')) return null;
        const [h, m] = hhmm.split(':').map(Number);
        return Number.isFinite(h) ? h * 60 + (m || 0) : null;
    };
    const fmt = (mins) => {
        const m = Math.max(0, Math.min(24 * 60 - 1, Math.round(mins)));
        return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
    };
    const fmtDur = (mins) => {
        const m = Math.round(mins);
        if (m < 60) return `${m}m`;
        const h = Math.floor(m / 60), r = m % 60;
        return r ? `${h}h${pad(r)}` : `${h}h`;
    };
    const uid = (p) => `${p}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e5).toString(36)}`;
    const round5 = (m) => Math.round(m / 5) * 5;
    const sum = (arr, f = (x) => x) => arr.reduce((a, x) => a + (Number(f(x)) || 0), 0);
    const nowMinutes = () => { const n = getNow(); return n.getHours() * 60 + n.getMinutes(); };

    // ------------------------------------------------------------------
    // Kinds of work, phases, session lengths
    // ------------------------------------------------------------------
    const LOADS = {
        deep:     { label: 'Theory',   short: 'Theory',   hint: 'Studio: new material, reading, notes', rank: 0, color: '#9fc4ee' },
        practice: { label: 'Practice', short: 'Practice', hint: 'Esercizi: exercises and problems',      rank: 1, color: '#a8dbb2' },
        light:    { label: 'Review',   short: 'Review',   hint: 'Ripasso: flashcards like Anki',         rank: 2, color: '#f0d58f' }
    };
    const PHASES = {
        learn:    { label: 'theory',   hint: 'Read, understand, take notes.' },
        practice: { label: 'practice', hint: 'Solve without looking at the solution first.' },
        review:   { label: 'review',   hint: 'Flashcards and spaced repetition.' }
    };
    const LOAD_PHASE = { deep: 'learn', practice: 'practice', light: 'review' };

    const LENGTHS = [30, 45, 60];                  // the plans: how long each session is at most
    const BREAK_AFTER = { 30: 5, 45: 10, 60: 15 };
    const LONG_BREAK = 20;                          // instead of the usual one, about every two hours of study
    const LONG_EVERY = 120;
    const MIN_SESSION = 10;
    const STUDY_RE = /stud|exam|esam|lezion|lecture|analisi|analys|algebr|fisic|physic|math|matemat|\buni\b|universit|corso|course|chapter|capitol|anki|flashcard|eserciz|exercis|problem|ripass|review|teoria|theory|appunt|notes/i;

    function guessLoad(t) {
        const s = `${t.title || ''} ${t.category || ''}`.toLowerCase();
        if (/anki|flashcard|carte|ripass|review|vocab|memor/.test(s)) return 'light';
        if (/eserciz|exercis|problem|esercitaz|practice|pratica|quiz|test/.test(s)) return 'practice';
        return 'deep';
    }
    function loadOf(t) {
        return (t && LOADS[t.load]) ? t.load : guessLoad(t || {});
    }
    function kindColor(load) { return (LOADS[load] || LOADS.deep).color; }
    function phaseLabel(key) { return PHASES[key] ? PHASES[key].label : ''; }
    // What a focus phase needs to show the kind of work (Today card, header strip)
    function phaseInfo(key) {
        return PHASES[key] ? { phase: key, phaseLabel: PHASES[key].label, phaseHint: PHASES[key].hint } : {};
    }
    function lengthOf(win) {
        const l = Number(win && win.len);
        return LENGTHS.includes(l) ? l : defaultLength();
    }

    function getPrefSafe(k, d) {
        try { return typeof getPref === 'function' ? (getPref(k) ?? d) : d; } catch (e) { return d; }
    }
    function setPrefQuiet(k, v) {
        try { if (typeof setPref === 'function') setPref(k, v, { rerender: false }); } catch (e) { /* prefs optional */ }
    }

    // ------------------------------------------------------------------
    // Data helpers
    // ------------------------------------------------------------------
    function dayPlan(date, create = false) {
        if (typeof studyPlans === 'undefined') return null;
        let p = studyPlans[date];
        if (!p && create) p = studyPlans[date] = { windows: [], targets: {} };
        if (p) {
            if (!Array.isArray(p.windows)) p.windows = [];
            if (!p.targets || typeof p.targets !== 'object') p.targets = {};
        }
        return p || null;
    }
    function getWindows(date) {
        const p = dayPlan(date);
        return p ? [...p.windows].sort((a, b) => (toMin(a.start) || 0) - (toMin(b.start) || 0)) : [];
    }
    function findWindow(date, id) {
        const p = dayPlan(date);
        return p ? p.windows.find(w => w.id === id) || null : null;
    }
    const dayBlocks = (date) => (Array.isArray(ephemeralData[date]) ? ephemeralData[date] : []);
    const blockLen = (b) => toMin(b.end) - toMin(b.start);

    // Flexible tasks with a duration = things you can study for a given amount of time
    function isTimeTarget(t, date) {
        if (!t || t.type === 'medicine' || t.type === 'timed' || t.isTodo) return false;
        if (Array.isArray(t.timeWindows) && t.timeWindows.length) return false;
        if (t.noTimer) return false;
        if (typeof isGymRoutineTask === 'function' && isGymRoutineTask(t)) return false;
        return typeof isTaskActiveOnDate !== 'function' || isTaskActiveOnDate(t, date);
    }
    function unitMinutes(t) {
        const m = parseInt(t.timerMinutes, 10);
        return m > 0 ? m : 25;
    }
    function baseTarget(t) {
        return (t.instances || 1) * unitMinutes(t);
    }
    function targetFor(t, date) {
        const p = dayPlan(date);
        const o = p && p.targets ? parseInt(p.targets[t.id], 10) : NaN;
        return Number.isFinite(o) && o >= 0 ? o : baseTarget(t);
    }
    // Minutes of focus on a task that day. Sessions saved before they carried the task id count
    // when their name and category are exactly the task's.
    function focusMinutes(tid, date) {
        const t = (typeof templates !== 'undefined' ? templates : []).find(x => x.id === tid);
        return (typeof focusLogs !== 'undefined' ? focusLogs : [])
            .filter(l => l && (l.date === date || l.dateStr === date) && (l.templateId === tid || (!l.templateId && t && legacyMatch(l, t))))
            .reduce((a, l) => a + (Number(l.minutes) || 0), 0);
    }
    function legacyMatch(l, t) {
        return Boolean(t.title) && l.title === t.title && (l.category || '') === (t.category || '');
    }
    function ticksDone(t, date) {
        const log = (typeof logs !== 'undefined' && logs[date] && logs[date][t.id]) || [];
        return log.filter(Boolean).length;
    }
    // Minutes studied that day for a task: timer minutes, or ticked boxes × block length, whichever is more
    function progress(t, date) {
        const target = targetFor(t, date);
        const done = Math.max(focusMinutes(t.id, date), ticksDone(t, date) * unitMinutes(t));
        const allTicked = ticksDone(t, date) >= (t.instances || 1);
        return { done, target, complete: allTicked || (target > 0 && done >= target), unit: unitMinutes(t) };
    }
    // What is still to do that day for a task, not counting what is already planned ahead elsewhere
    // (time already done is in `done`: blocks that are over or done do not count again)
    function remainingToday(t, date, winId) {
        const pr = progress(t, date);
        const elsewhere = dayBlocks(date)
            .filter(b => b && b.templateId === t.id && (!winId || b.studyWindowId !== winId) && isAhead(b, date))
            .reduce((a, b) => a + blockLen(b), 0);
        return Math.max(0, pr.target - pr.done - elsewhere);
    }
    // A block still to come: not done, and (today) not over yet; days before today have nothing ahead
    function isAhead(b, date) {
        if (!b || b.done) return false;
        if (date < todayStr) return false;
        return date > todayStr || toMin(b.end) > nowMinutes();
    }
    // Sessions of a window that re-planning leaves alone: moved by hand, done with the timer,
    // over already, or the one running right now
    function keepsOwn(b, date) {
        if (b.pinned || b.done) return true;
        if (date !== todayStr) return false;
        if (toMin(b.end) <= nowMinutes()) return true;
        const running = typeof window.getRunningFocusBlockIds === 'function' ? window.getRunningFocusBlockIds() : [];
        return running.includes(b.id);
    }

    // After a timed session: tick boxes for every full block of minutes reached
    function creditMinutes(tid, date, addedMin) {
        const t = (typeof templates !== 'undefined' ? templates : []).find(x => x.id === tid);
        if (!t || !addedMin) return;
        const unit = unitMinutes(t);
        const total = focusMinutes(tid, date);          // already includes the new log
        const before = Math.floor(Math.max(0, total - addedMin) / unit);
        const after = Math.floor(total / unit);
        let toTick = after - before;
        if (toTick <= 0) return;
        if (!logs[date]) logs[date] = {};
        const inst = t.instances || 1;
        const arr = logs[date][tid] || Array(inst).fill(false);
        while (arr.length < inst) arr.push(false);
        for (let i = 0; i < arr.length && toTick > 0; i++) {
            if (!arr[i]) { arr[i] = true; toTick--; }
        }
        logs[date][tid] = arr;
        saveData();
    }

    // ------------------------------------------------------------------
    // Busy time on a day (everything that is not this window's own sessions to re-plan)
    // ------------------------------------------------------------------
    function busyIntervals(date, win) {
        const out = [];
        const dayIdx = parseLocalDate(date).getDay();
        (typeof templates !== 'undefined' ? templates : []).forEach(t => {
            if (!t || !Array.isArray(t.timeWindows) || !t.timeWindows.length || !isTaskActiveOnDate(t, date)) return;
            t.timeWindows.forEach(tw => {
                if (!tw || !tw.days || !tw.days.includes(dayIdx)) return;
                if (plannerExceptions[`${t.id}_${date}_${tw.start}`]) return;
                out.push({ s: toMin(tw.start), e: toMin(tw.end), why: t.title, color: t.color });
            });
        });
        (typeof routinesData !== 'undefined' ? routinesData : []).forEach(r => {
            if (!r || r.type !== 'timed' || typeof isRoutineActiveOnDate !== 'function' || !isRoutineActiveOnDate(r, date)) return;
            (r.timeWindows || []).forEach(tw => {
                if (tw && tw.days && tw.days.includes(dayIdx)) out.push({ s: toMin(tw.start), e: toMin(tw.end), why: r.title, color: r.color });
            });
        });
        (typeof specificEvents !== 'undefined' ? specificEvents : []).forEach(e => {
            if (e && e.date === date && e.start && e.end) out.push({ s: toMin(e.start), e: toMin(e.end), why: e.title, color: e.color });
        });
        dayBlocks(date).forEach(b => {
            if (!b || !b.start || !b.end) return;
            if (win && b.studyWindowId === win.id && !keepsOwn(b, date)) return;
            out.push({ s: toMin(b.start), e: toMin(b.end), why: b.title, color: b.color, block: b });
        });
        if (window.CortexMeals && typeof CortexMeals.getMealBlocks === 'function') {
            CortexMeals.getMealBlocks(date).forEach(m => out.push({ s: m.start, e: m.end, why: m.title, meal: true, color: '#8a8a8a' }));
        }
        return out.filter(x => x.s !== null && x.e !== null && x.e > x.s).sort((a, b) => a.s - b.s);
    }

    function freeSegments(from, to, busy) {
        const segs = [];
        let cur = from;
        busy.forEach(b => {
            if (b.e <= cur || b.s >= to) return;
            if (b.s > cur) segs.push({ s: cur, e: Math.min(b.s, to) });
            cur = Math.max(cur, b.e);
        });
        if (cur < to) segs.push({ s: cur, e: to });
        return segs;
    }

    // ------------------------------------------------------------------
    // Subjects of a window
    // ------------------------------------------------------------------
    function candidateSubjects(date) {
        return (typeof templates !== 'undefined' ? templates : []).filter(t => isTimeTarget(t, date));
    }
    function defaultSubjectIds(date) {
        const all = candidateSubjects(date);
        const study = all.filter(t => t.load || STUDY_RE.test(`${t.title} ${t.category}`));
        const pool = study.length ? study : all;
        // tasks whose target for the day is already reached are not ticked (you can still tick them)
        const open = pool.filter(t => !progress(t, date).complete);
        return (open.length ? open : pool).map(t => t.id);
    }
    // Default order: theory, then practice, then review
    function byKind(list) {
        return [...list].sort((a, b) => LOADS[loadOf(a)].rank - LOADS[loadOf(b)].rank);
    }

    // ------------------------------------------------------------------
    // What Cortex learns from you
    // ------------------------------------------------------------------
    // How long you actually stay on a session: the median of your recent real focus sessions
    function paceFromHistory() {
        const all = typeof templates !== 'undefined' ? templates : [];
        const since = (() => { const d = new Date(getNow()); d.setDate(d.getDate() - 30); return formatDate(d); })();
        const pool = (typeof focusLogs !== 'undefined' ? focusLogs : []).filter(l =>
            l && l.templateId && Number(l.minutes) >= MIN_SESSION && String(l.date || '') >= since
            && !['warmup', 'recall', 'review'].includes(l.phase));
        const studyish = pool.filter(l => {
            const t = all.find(x => x.id === l.templateId);
            return t && (t.load ? t.load !== 'light' : STUDY_RE.test(`${t.title} ${t.category}`));
        });
        const recent = (studyish.length >= 6 ? studyish : pool).slice(-40);
        if (recent.length < 6) return null;
        const v = recent.map(l => Number(l.minutes)).sort((a, b) => a - b);
        const med = v[Math.floor(v.length / 2)];
        return { len: Math.max(20, Math.min(90, round5(med))), n: recent.length };
    }

    function lengthPicks() {
        const p = getPrefSafe('studyLenPicks', {});
        return p && typeof p === 'object' ? p : {};
    }
    // The session length offered first: the one you pick most, else the closest to how long you really focus
    function defaultLength() {
        const picks = lengthPicks();
        const top = [...LENGTHS].sort((a, b) => (picks[b] || 0) - (picks[a] || 0))[0];
        if ((picks[top] || 0) >= 2) return top;
        const pace = paceFromHistory();
        if (pace) return [...LENGTHS].sort((a, b) => Math.abs(a - pace.len) - Math.abs(b - pace.len))[0];
        return 45;
    }
    function noteLengthPick(len) {
        const picks = Object.assign({}, lengthPicks());
        picks[len] = (picks[len] || 0) + 1;
        setPrefQuiet('studyLenPicks', picks);
    }

    // How you split the time last time you studied these same tasks together
    const memoKey = (ids) => [...ids].sort().join('|');
    function splitMemo(ids) {
        if (ids.length < 2) return null;
        const m = getPrefSafe('studySplitMemo', {});
        const hit = m && typeof m === 'object' ? m[memoKey(ids)] : null;
        return hit && hit.w && typeof hit.w === 'object' ? hit.w : null;
    }
    function rememberSplit(ids, split) {
        if (ids.length < 2) return;
        const tot = sum(ids, id => split[id]);
        if (tot <= 0) return;
        const m = Object.assign({}, getPrefSafe('studySplitMemo', {}));
        m[memoKey(ids)] = { at: Date.now(), w: Object.fromEntries(ids.map(id => [id, Math.round(((split[id] || 0) / tot) * 1000) / 1000])) };
        // keep the 30 most recent combinations
        const keys = Object.keys(m).sort((a, b) => (m[b].at || 0) - (m[a].at || 0));
        keys.slice(30).forEach(k => delete m[k]);
        setPrefQuiet('studySplitMemo', m);
    }

    // ------------------------------------------------------------------
    // Splitting study minutes between subjects
    // ------------------------------------------------------------------
    // Minutes (multiples of 5) proportional to the weights, adding up to `total`
    function roundSplit(ids, weightOf, total) {
        const out = {};
        if (!ids.length) return out;
        const w = ids.map(id => Math.max(0, Number(weightOf(id)) || 0));
        const sw = sum(w);
        if (sw <= 0 || total <= 0) { ids.forEach(id => { out[id] = 0; }); return out; }
        const units = Math.floor(total / 5);
        const raw = w.map(x => (x / sw) * units);
        const fl = raw.map(Math.floor);
        let left = units - sum(fl);
        raw.map((x, i) => ({ i, f: x - fl[i] })).sort((a, b) => b.f - a.f).forEach(({ i }) => {
            if (left > 0 && w[i] > 0) { fl[i]++; left--; }
        });
        ids.forEach((id, i) => { out[id] = fl[i] * 5; });
        return out;
    }

    // The study minutes a window asks for, per subject. A window saved without a split uses what is
    // left of each task that day.
    function splitOf(date, win, subjects) {
        const sp = win && win.split && typeof win.split === 'object' ? win.split : null;
        if (sp && subjects.some(t => Number(sp[t.id]) > 0)) {
            return Object.fromEntries(subjects.map(t => [t.id, Math.max(0, Math.round(Number(sp[t.id]) || 0))]));
        }
        return Object.fromEntries(subjects.map(t => [t.id, remainingToday(t, date, win ? win.id : null)]));
    }

    // ------------------------------------------------------------------
    // THE PLANNER
    // ------------------------------------------------------------------
    // A subject's study minutes as sessions of at most L minutes, as even as possible (100 → 35·35·30 with L = 45)
    function chunkEqual(W, L) {
        W = Math.round(W);
        if (W <= 0) return [];
        const k = Math.ceil(W / L);
        const base = Math.floor(W / k / 5) * 5 || Math.floor(W / k);
        const out = Array(k).fill(base);
        let rest = W - base * k;
        for (let i = 0; i < k && rest >= 5; i++) { out[i] += 5; rest -= 5; }
        out[k - 1] += rest;
        return out.filter(x => x > 0);
    }

    // Sessions in your order, each subject's minutes exactly; a break after every session but the last
    function buildUnits(want, L) {
        const units = [];
        want.forEach(s => chunkEqual(s.W, L).forEach(len => units.push({ tid: s.tid, load: s.load, len, phase: LOAD_PHASE[s.load] })));
        let since = 0;
        units.forEach((u, i) => {
            u.brk = 0;
            if (i === units.length - 1) return;
            since += u.len;
            if (since >= LONG_EVERY) { u.brk = LONG_BREAK; since = 0; }
            else u.brk = BREAK_AFTER[L] || 10;
        });
        return units;
    }

    // Lays the sessions on the free time; a busy slot in the middle (a meal, a lecture) works as a break.
    // A session that runs into a busy slot goes on after it; a crumb under 10 min moves to the
    // subject's next session; less than 15 min before the busy slot is not worth starting.
    function placeUnits(units, segments, result) {
        let si = 0;
        let cur = segments.length ? segments[0].s : 0;
        const carry = {};
        const push = (u, s, e) => {
            result.sessions.push({ tid: u.tid, s, e, load: u.load, phase: u.phase });
            result.placedMin += e - s;
        };
        units.forEach((u, ui) => {
            let need = u.len + (carry[u.tid] || 0);
            carry[u.tid] = 0;
            let guard = 0;
            while (need > 0 && guard++ < 50) {
                while (si < segments.length && cur >= segments[si].e) {
                    si++;
                    if (si < segments.length) cur = Math.max(cur, segments[si].s);
                }
                if (si >= segments.length) break;
                const seg = segments[si];
                cur = Math.max(cur, seg.s);
                const avail = seg.e - cur;
                if (need <= avail) { push(u, cur, cur + need); cur += need; need = 0; break; }
                if (avail < 15) { cur = seg.e; continue; }
                const rest = need - avail;
                push(u, cur, seg.e);
                cur = seg.e;
                if (rest >= MIN_SESSION) { need = rest; continue; }
                carry[u.tid] = rest;
                need = 0;
            }
            if (need > 0) result.leftover[u.tid] = (result.leftover[u.tid] || 0) + need;
            if (u.brk > 0 && ui < units.length - 1 && si < segments.length) {
                const seg = segments[si];
                if (cur < seg.e) result.breaks.push({ s: cur, e: Math.min(cur + u.brk, seg.e) });
                cur += u.brk;
            }
        });
        Object.entries(carry).forEach(([tid, m]) => { if (m > 0) result.leftover[tid] = (result.leftover[tid] || 0) + m; });
        const last = result.sessions[result.sessions.length - 1];
        result.breaks = last ? result.breaks.filter(b => b.s < last.e) : [];
    }

    function layout(want, L, segments) {
        const r = { sessions: [], breaks: [], leftover: {}, placedMin: 0 };
        placeUnits(buildUnits(want, L), segments, r);
        r.over = sum(Object.values(r.leftover));
        return r;
    }

    // Returns { len, sessions:[{tid,s,e,load,phase}], breaks:[{s,e}], leftover:{tid:min}, cut:{tid:min},
    //           placedMin, wanted, freeMin, endMin, fits, focusBy:{tid:min} }
    // opts.len: 30/45/60 (default: the window's) · opts.loads: {tid: load} not saved yet · opts.ignoreNow: whole window even today
    // opts.capToTarget: (automatic re-plans) a task never gets more than what is left of its day's target
    // opts.fit: what does not fit any more (the window got shorter, the day moved on) is cut evenly
    function computePlan(date, win, opts = {}) {
        const allTemplates = typeof templates !== 'undefined' ? templates : [];
        const L = LENGTHS.includes(Number(opts.len)) ? Number(opts.len) : lengthOf(win);
        const ids = Array.isArray(win.subjects) ? win.subjects : defaultSubjectIds(date);
        const subjects = ids.map(id => allTemplates.find(t => t.id === id)).filter(Boolean);
        const winS = toMin(win.start), winE = toMin(win.end);
        const result = { len: L, sessions: [], breaks: [], leftover: {}, cut: {}, placedMin: 0, wanted: 0, freeMin: 0, endMin: null, fits: true, focusBy: {} };
        if (winS === null || winE === null || winE <= winS || !subjects.length) return result;
        const loadFor = (t) => (opts.loads && LOADS[opts.loads[t.id]] ? opts.loads[t.id] : loadOf(t));

        // Today: plan only from now on (past sessions stay where they are)
        let from = winS;
        const isToday = date === todayStr;
        if (isToday && !opts.ignoreNow && nowMinutes() > winS) from = Math.min(winE, Math.ceil(nowMinutes() / 5) * 5);

        // Study this window already gave each subject: its sessions that stay (done, moved by hand,
        // over, running) and anything else on that subject inside the window (a different timer you ran)
        const used = {};
        const idSet = new Set(subjects.map(t => t.id));
        dayBlocks(date).forEach(b => {
            if (!b || !idSet.has(b.templateId)) return;
            if (b.studyWindowId === win.id) {
                const past = isToday && !opts.ignoreNow && toMin(b.end) <= from;
                if (past || keepsOwn(b, date)) used[b.templateId] = (used[b.templateId] || 0) + blockLen(b);
                return;
            }
            const overlap = Math.min(toMin(b.end), winE) - Math.max(toMin(b.start), winS);
            if (overlap > 0) used[b.templateId] = (used[b.templateId] || 0) + overlap;
        });

        const segments = freeSegments(from, winE, busyIntervals(date, win));
        result.freeMin = sum(segments, x => x.e - x.s);

        const split = splitOf(date, win, subjects);
        const want = subjects.map((t, i) => {
            let W = Math.max(0, (split[t.id] || 0) - (used[t.id] || 0));
            if (opts.capToTarget && isTimeTarget(t, date)) W = Math.min(W, remainingToday(t, date, win.id));
            return { tid: t.id, load: loadFor(t), order: i, W: Math.round(W) };
        }).filter(x => x.W >= 1);
        result.wanted = sum(want, x => x.W);
        if (!want.length || result.freeMin < MIN_SESSION) {
            result.fits = !want.length;
            want.forEach(x => { result.leftover[x.tid] = x.W; });
            return result;
        }

        let placed = layout(want, L, segments);
        if (placed.over > 0 && opts.fit) {
            // keep the proportions, cut until it fits (5 minutes at a time)
            let lo = 0, hi = 1, best = null;
            for (let i = 0; i < 14; i++) {
                const mid = (lo + hi) / 2;
                const smaller = want.map(x => Object.assign({}, x, { W: Math.floor((x.W * mid) / 5) * 5 })).filter(x => x.W >= 5);
                const r = layout(smaller, L, segments);
                if (r.over === 0) { lo = mid; best = r; } else hi = mid;
            }
            if (best) {
                const got = {};
                best.sessions.forEach(s => { got[s.tid] = (got[s.tid] || 0) + (s.e - s.s); });
                want.forEach(x => { const c = x.W - (got[x.tid] || 0); if (c > 0) result.cut[x.tid] = c; });
                placed = best;
            }
        }
        ['sessions', 'breaks', 'leftover', 'placedMin'].forEach(k => { result[k] = placed[k]; });
        result.fits = placed.over === 0;
        result.sessions.forEach(s => { result.focusBy[s.tid] = (result.focusBy[s.tid] || 0) + (s.e - s.s); });
        const last = result.sessions[result.sessions.length - 1];
        result.endMin = last ? last.e : null;
        return result;
    }

    // The most study (multiples of 5) that fits in a window with sessions of L minutes,
    // split by the given weights
    function capacity(date, win, L, ids, weightOf, opts = {}) {
        let lo = 0, hi = Math.max(0, toMin(win.end) - toMin(win.start));
        hi = Math.floor(hi / 5) * 5;
        let best = 0;
        while (lo <= hi) {
            const mid = Math.floor((lo + hi) / 10) * 5;
            const split = roundSplit(ids, weightOf, mid);
            const plan = computePlan(date, Object.assign({}, win, { subjects: ids, split }), Object.assign({}, opts, { len: L }));
            if (plan.fits) { best = mid; lo = mid + 5; }
            else hi = mid - 5;
        }
        return best;
    }

    // Writes the plan of a window into the day's blocks
    function applyPlan(date, winId, opts = {}) {
        const win = findWindow(date, winId);
        if (!win) return null;
        const plan = computePlan(date, win, opts);
        if (!Array.isArray(ephemeralData[date])) ephemeralData[date] = [];
        const isToday = date === todayStr;
        const nowMin = nowMinutes();
        // Keep sessions moved by hand, done with the timer, already over or running now
        ephemeralData[date] = ephemeralData[date].filter(b => {
            if (!b || b.studyWindowId !== winId) return true;
            return keepsOwn(b, date) || (isToday && toMin(b.end) <= nowMin);
        });
        const all = typeof templates !== 'undefined' ? templates : [];
        plan.sessions.forEach(s => {
            const t = all.find(x => x.id === s.tid);
            if (!t) return;
            const minutes = s.e - s.s;
            // same plan → same ids on every device, so two devices re-planning never duplicate sessions
            let id = `st_${winId}_${s.s}_${String(t.id).slice(-6)}`;
            if (ephemeralData[date].some(b => b && b.id === id)) id = uid('st');
            ephemeralData[date].push({
                id,
                templateId: t.id,
                title: t.title,
                category: t.category,
                color: kindColor(s.load),
                start: fmt(s.s),
                end: fmt(s.e),
                minutes,
                blocksUsed: Math.round((minutes / unitMinutes(t)) * 100) / 100,
                studyWindowId: winId,
                load: s.load,
                phase: s.phase,
                auto: true
            });
        });
        win.lastPlan = { at: Date.now(), leftover: plan.leftover, cut: plan.cut, placedMin: plan.placedMin, len: plan.len };
        return plan;
    }

    function rerenderAll() {
        ['renderDayPlannerModule', 'renderWeeklyPlanner', 'renderTasks', 'renderTodayModule', 'renderCalendar'].forEach(fn => {
            try { if (typeof window[fn] === 'function') window[fn](); } catch (e) { console.error('[study]', fn, e); }
        });
    }

    function saveWindow(date, data) {
        const p = dayPlan(date, true);
        let win = data.id ? p.windows.find(w => w.id === data.id) : null;
        if (!win) {
            win = { id: uid('sw') };
            p.windows.push(win);
        }
        Object.assign(win, {
            refId: data.refId || null,
            place: data.place || 'Study',
            color: data.color || null,
            start: data.start,
            end: data.end,
            len: LENGTHS.includes(Number(data.len)) ? Number(data.len) : lengthOf(win),
            subjects: data.subjects,
            split: data.split && typeof data.split === 'object' ? Object.assign({}, data.split) : (win.split || null)
        });
        // the old styles and rhythms are gone
        ['style', 'lenShift', 'rhythm', 'order', 'customWork', 'customBreak'].forEach(k => delete win[k]);
        const plan = applyPlan(date, win.id);
        saveData();
        rerenderAll();
        return { win, plan };
    }

    function removeWindow(date, winId) {
        const p = dayPlan(date);
        if (!p) return;
        p.windows = p.windows.filter(w => w.id !== winId);
        if (Array.isArray(ephemeralData[date])) {
            const isToday = date === todayStr;
            const nowMin = nowMinutes();
            ephemeralData[date] = ephemeralData[date].filter(b => {
                if (!b || b.studyWindowId !== winId) return true;
                // sessions already done stay as a record, without a window
                if (b.done || (isToday && toMin(b.end) <= nowMin)) { delete b.studyWindowId; return true; }
                return false;
            });
        }
        if (!p.windows.length && !Object.keys(p.targets).length) delete studyPlans[date];
        saveData();
        rerenderAll();
    }

    function replanWindow(date, winId) {
        applyPlan(date, winId, { fit: true });
        saveData();
        rerenderAll();
    }

    // ------------------------------------------------------------------
    // What really happened (called by focus.js when a timer phase on a task ends)
    // ------------------------------------------------------------------
    // The phase's block on the timeline becomes the real time you focused; a session that had no
    // block (the exam button, the setup window...) gets one, so the day shows what you did.
    function settleSession(phase, minutes, date, endMs, sessionId, phaseIndex) {
        if (!phase || phase.type !== 'task' || !phase.id || !(minutes > 0)) return;
        const t = (typeof templates !== 'undefined' ? templates : []).find(x => x.id === phase.id);
        if (!t) return;
        if (!Array.isArray(ephemeralData[date])) ephemeralData[date] = [];
        const list = ephemeralData[date];
        const end = new Date(endMs);
        const endMin = end.getHours() * 60 + end.getMinutes();
        const len = Math.max(1, Math.round(minutes));
        const startMin = Math.max(0, endMin - len);
        const wanted = phase.studyBlockId || phase.blockId || `eb_fs_${sessionId || 'x'}_${phaseIndex}`;
        let b = list.find(x => x && x.id === wanted);
        if (!b) {
            b = { id: wanted, templateId: t.id, title: t.title, category: t.category, color: t.load ? kindColor(t.load) : (t.color || '#b08d43'), blocksUsed: 0, focusBlock: true };
            list.push(b);
        }
        Object.assign(b, { start: fmt(startMin), end: fmt(Math.max(startMin + 1, endMin)), minutes: len, done: true });
        if (b.studyWindowId) { b.pinned = true; b.auto = false; }
        if (phase.phase && !b.phase) b.phase = phase.phase;
    }

    // Something the plan did not foresee happened today (a different timer, a stop, a skip):
    // today's windows that are not over re-plan what is still ahead, from now
    function replanAfterFocus(date = todayStr) {
        const nowMin = nowMinutes();
        let changed = false;
        getWindows(date).forEach(win => {
            if (toMin(win.end) <= nowMin) return;
            if (typeof window.isStudyWindowRunning === 'function' && window.isStudyWindowRunning(win.id)) return;
            applyPlan(date, win.id, { capToTarget: true, fit: true });
            changed = true;
        });
        if (changed) { saveData(); rerenderAll(); }
    }

    // Focus of that day not counted in any task (e.g. a free session, or the exam button before it knew your tasks)
    function unassignedFocus(date) {
        const groups = new Map();
        const all = typeof templates !== 'undefined' ? templates : [];
        (typeof focusLogs !== 'undefined' ? focusLogs : []).forEach(l => {
            if (!l || l.date !== date || l.templateId || l.noTask) return;
            if (all.some(t => legacyMatch(l, t))) return;
            const key = `${l.category || ''}|${l.title || ''}`;
            const g = groups.get(key) || { key, title: l.title || 'Focus', category: l.category || '', minutes: 0, ids: [] };
            g.minutes += Number(l.minutes) || 0;
            g.ids.push(l.id);
            groups.set(key, g);
        });
        const fold = (s) => String(s || '').toLowerCase().trim();
        return [...groups.values()].filter(g => g.minutes > 0).map(g => {
            // the tasks of the same course or category first
            const word = fold(['Study', 'Focus', 'General'].includes(g.category) ? g.title : g.category);
            const rel = (t) => (word && (fold(t.category) === word || fold(t.title) === word) ? 2 : 0) + (word && fold(t.category).includes(word) ? 1 : 0);
            const tasks = candidateSubjects(date).sort((a, b) => rel(b) - rel(a) || (LOADS[loadOf(a)].rank - LOADS[loadOf(b)].rank));
            const close = tasks.filter(t => rel(t) > 0);
            return Object.assign(g, { tasks: (close.length ? close : tasks).slice(0, 6) });
        });
    }
    function assignFocus(date, ids, tid) {
        const t = (typeof templates !== 'undefined' ? templates : []).find(x => x.id === tid);
        if (!t) return;
        let mins = 0;
        focusLogs.forEach(l => {
            if (l && ids.includes(l.id) && !l.templateId && l.date === date) {
                l.templateId = t.id;
                l.title = t.title;
                l.category = t.category;
                mins += Number(l.minutes) || 0;
            }
        });
        if (mins > 0) creditMinutes(t.id, date, mins);
        saveData();
        rerenderAll();
        if (typeof showToast === 'function') showToast(`${fmtDur(mins)} counted in ${t.title}`);
    }
    function ignoreFocus(date, ids) {
        focusLogs.forEach(l => { if (l && ids.includes(l.id) && l.date === date) l.noTask = true; });
        saveData();
        rerenderAll();
    }

    // Called by tasks.js when a study session is dragged or resized by hand
    function markPinned(block) {
        if (block && block.studyWindowId) { block.pinned = true; block.auto = false; }
    }

    // ------------------------------------------------------------------
    // Places = ghost layers (libraries, home...) with their opening hours on a date
    // ------------------------------------------------------------------
    function placesOn(date) {
        const dayIdx = parseLocalDate(date).getDay();
        return (typeof referenceLayers !== 'undefined' ? referenceLayers : [])
            .filter(r => r && Array.isArray(r.timeWindows))
            .map(r => ({
                ref: r,
                slots: r.timeWindows.filter(tw => tw && tw.days && tw.days.includes(dayIdx) && tw.start && tw.end)
                    .sort((a, b) => toMin(a.start) - toMin(b.start))
            }))
            .filter(p => p.slots.length && (typeof ghostKindOf === 'function' ? ghostKindOf(p.ref) === 'study' : !/tren|train|bus|metro|tram|transport|volo|flight/i.test(p.ref.title)));
    }
    function openingText(slots) {
        return slots.map(s => `${s.start}–${s.end}`).join(', ');
    }

    // ------------------------------------------------------------------
    // Running a window with the focus timer
    // ------------------------------------------------------------------
    function sessionsOf(date, winId) {
        return dayBlocks(date)
            .filter(b => b && b.studyWindowId === winId)
            .sort((a, b) => toMin(a.start) - toMin(b.start));
    }

    function startWindow(date, winId) {
        if (typeof startCurrentPlaylistPhase !== 'function') return;
        if (typeof closeRunningSession === 'function') closeRunningSession();
        const nowMin = nowMinutes();
        const list = sessionsOf(date, winId).filter(b => !b.done && (date !== todayStr || toMin(b.end) > nowMin));
        if (!list.length) { if (typeof showToast === 'function') showToast('No sessions left in this window.'); return; }
        const playlist = [];
        list.forEach((b, i) => {
            const s = toMin(b.start), e = toMin(b.end);
            const startAt = (date === todayStr && i === 0) ? Math.max(s, nowMin) : s;
            const dur = Math.max(1, e - startAt);
            if (i > 0) {
                const prevEnd = toMin(list[i - 1].end);
                const gap = s - prevEnd;
                if (gap > 0 && gap <= 45) playlist.push({ type: 'break', duration: gap });
            }
            playlist.push(Object.assign({
                type: 'task', id: b.templateId, category: b.category, title: b.title,
                duration: dur, color: b.color || '#ffffff', isPartial: true, isStudy: true,
                studyBlockId: b.id, windowId: winId
            }, phaseInfo(b.phase)));
        });
        focusPlaylist = playlist;
        currentPlaylistIndex = 0;
        isFullscreenFocusOpen = false;
        startCurrentPlaylistPhase();
        if (typeof showToast === 'function') {
            const w = findWindow(date, winId);
            showToast(`Study window started${w ? ` · ${w.place}` : ''} — ${list.length} session${list.length === 1 ? '' : 's'}`);
        }
    }

    // ------------------------------------------------------------------
    // Drawing: bands on the Day planner timeline
    // ------------------------------------------------------------------
    function decorateDayCanvas(canvas, date, zoom, startHour) {
        if (!canvas) return;
        const px = (mins) => ((mins / 60) - startHour) * zoom;
        const editing = window.CortexStudyDraft ? CortexStudyDraft.editingId(date) : null;
        getWindows(date).forEach(win => {
            if (win.id === editing) return;   // the window being edited is drawn by the draft
            const s = toMin(win.start), e = toMin(win.end);
            if (s === null || e === null) return;
            const band = document.createElement('div');
            band.className = 'study-band';
            band.style.top = `${px(s)}px`;
            band.style.height = `${Math.max(14, px(e) - px(s))}px`;
            const ref = win.refId ? (referenceLayers || []).find(r => r.id === win.refId) : null;
            band.style.setProperty('--band-color', win.color || (ref && ref.color) || 'var(--accent)');
            band.innerHTML = `
                <div class="study-band-head">
                    <span class="study-band-title">${esc(win.place)} <span class="dim">· ${esc(win.start)}–${esc(win.end)} · ${lengthOf(win)}m sessions</span></span>
                    <span class="study-band-actions">
                        ${date === todayStr ? `<button type="button" class="ghost-btn" data-act="start" title="Start the timer for this window">${typeof focusStateIcon === 'function' ? focusStateIcon(false) : '▶'} Start</button>` : ''}
                        <button type="button" class="ghost-btn" data-act="edit">Edit</button>
                    </span>
                </div>`;
            band.querySelector('[data-act="edit"]').addEventListener('click', (ev) => { ev.stopPropagation(); openEditor(date, { id: win.id, host: 'plan' }); });
            band.querySelector('[data-act="start"]')?.addEventListener('click', (ev) => { ev.stopPropagation(); startWindow(date, win.id); });
            canvas.appendChild(band);

            // Break markers between sessions
            const ses = sessionsOf(date, win.id);
            for (let i = 1; i < ses.length; i++) {
                const ge = toMin(ses[i].start), gs = toMin(ses[i - 1].end);
                if (ge - gs < 5) continue;
                const mark = document.createElement('div');
                mark.className = 'study-break-mark';
                mark.style.top = `${px(gs)}px`;
                mark.style.height = `${Math.max(2, px(ge) - px(gs))}px`;
                if (px(ge) - px(gs) >= 11) mark.innerHTML = `<span>break ${ge - gs}m</span>`;
                canvas.appendChild(mark);
            }
        });
    }

    // ------------------------------------------------------------------
    // Today card
    // ------------------------------------------------------------------
    function renderOrphans(date) {
        return unassignedFocus(date).map(g => `
            <div class="study-orphan" data-orphan="${esc(g.ids.join(','))}">
                <div class="study-orphan-q"><b>${fmtDur(g.minutes)}</b> of focus on <b>${esc(g.title)}</b> ${g.ids.length > 1 ? `(${g.ids.length} sessions) ` : ''}is not counted in a task yet. Which one was it?</div>
                <div class="study-chips">
                    ${g.tasks.map(t => { const left = remainingToday(t, date, null); return `<button type="button" class="study-chip" data-orphan-to="${esc(t.id)}" style="--chip-color:${esc(kindColor(loadOf(t)))}">${esc(t.title)}<span class="dim">${esc(t.category || '')}${left > 0 ? ` · ${fmtDur(left)} left` : ''}</span></button>`; }).join('')}
                    <button type="button" class="study-chip" data-orphan-none>None<span class="dim">just keep it as focus time</span></button>
                </div>
            </div>`).join('');
    }

    function renderTodayCard(date) {
        const wins = getWindows(date);
        const subjects = candidateSubjects(date).filter(t => defaultSubjectIds(date).includes(t.id));
        const leftToStudy = subjects.reduce((a, t) => { const p = progress(t, date); return a + Math.max(0, p.target - p.done); }, 0);
        const orphans = renderOrphans(date);
        if (!wins.length && !orphans && (!subjects.length || leftToStudy <= 0)) return '';

        const nowMin = nowMinutes();
        let html = `<div class="today-section-head"><span>STUDY</span><span class="dim">${leftToStudy > 0 ? `${fmtDur(leftToStudy)} left` : 'done ✓'}</span></div>` + orphans;

        if (!wins.length) {
            // Today: only places still open for at least half an hour
            const places = placesOn(date).filter(p => date !== todayStr || p.slots.some(sl => toMin(sl.end) > nowMin + 30));
            html += `
                <div class="study-prompt">
                    <div class="study-prompt-q">Where and when do you study today?</div>
                    <div class="study-prompt-sub dim">${fmtDur(leftToStudy)} to study · press a place, then drag on the timeline from start to end.</div>
                    <div class="study-chips">
                        ${places.map(p => `<button type="button" class="study-chip" data-study-new="${esc(p.ref.id)}" style="--chip-color:${esc(p.ref.color || '#888')}">${esc(p.ref.title)}<span class="dim">${esc(openingText(p.slots))}</span></button>`).join('')}
                        <button type="button" class="study-chip" data-study-new="">Home / elsewhere</button>
                    </div>
                </div>`;
            return html;
        }

        wins.forEach(win => {
            const ses = sessionsOf(date, win.id);
            const s = toMin(win.start), e = toMin(win.end);
            const total = Math.max(1, e - s);
            const studyMin = ses.reduce((a, b) => a + blockLen(b), 0);
            const over = win.lastPlan ? sum(Object.values(win.lastPlan.leftover || {})) + sum(Object.values(win.lastPlan.cut || {})) : 0;
            const live = date === todayStr && nowMin >= s && nowMin < e;
            const finished = date === todayStr && nowMin >= e;
            const strip = ses.map(b => {
                const l = ((toMin(b.start) - s) / total) * 100, w = (blockLen(b) / total) * 100;
                const past = date === todayStr && toMin(b.end) <= nowMin;
                return `<span class="study-strip-seg ${past ? 'is-past' : ''}" style="left:${l.toFixed(2)}%;width:${w.toFixed(2)}%;background:${esc(b.color || '#fff')}" title="${esc(b.start)}–${esc(b.end)} ${esc(b.title)}${b.phase ? ' · ' + esc(phaseLabel(b.phase)) : ''}"></span>`;
            }).join('');
            const nowMark = live ? `<span class="study-strip-now" style="left:${(((nowMin - s) / total) * 100).toFixed(2)}%"></span>` : '';
            const nextSes = ses.find(b => !b.done && toMin(b.end) > nowMin);
            const playIco = typeof focusStateIcon === 'function' ? focusStateIcon(false) : '▶';
            html += `
                <div class="study-card ${live ? 'is-live' : ''} ${finished ? 'is-finished' : ''}">
                    <div class="study-card-row">
                        <div class="study-card-main">
                            <div class="study-card-title">${esc(win.place)} <span class="dim">${esc(win.start)}–${esc(win.end)}</span></div>
                            <div class="study-card-sub dim">${lengthOf(win)}-min sessions · ${ses.length} session${ses.length === 1 ? '' : 's'} · ${fmtDur(studyMin)} of study${over > 0 ? ` · <span class="study-warn">${fmtDur(over)} don't fit</span>` : ''}</div>
                        </div>
                        <div class="study-card-actions">
                            ${date === todayStr && typeof window.isStudyWindowRunning === 'function' && window.isStudyWindowRunning(win.id)
                                ? '<span class="dim study-running">running</span>'
                                : (date === todayStr && !finished && nextSes ? `<button type="button" class="btn btn-primary btn-sm" data-study-start="${esc(win.id)}">${playIco} ${live ? 'Start' : `Start at ${esc(nextSes.start)}`}</button>` : '')}
                            <button type="button" class="ghost-btn" data-study-edit="${esc(win.id)}">Edit</button>
                        </div>
                    </div>
                    <div class="study-strip">${strip}${nowMark}</div>
                </div>`;
        });
        html += `<button type="button" class="ghost-btn study-add-more" data-study-new="">+ Another window</button>`;
        return html;
    }

    function bindTodayCard(root, date) {
        root.querySelectorAll('[data-orphan]').forEach(box => {
            const ids = box.dataset.orphan.split(',').filter(Boolean);
            box.querySelectorAll('[data-orphan-to]').forEach(el => el.addEventListener('click', () => assignFocus(date, ids, el.dataset.orphanTo)));
            box.querySelector('[data-orphan-none]')?.addEventListener('click', () => ignoreFocus(date, ids));
        });
        root.querySelectorAll('[data-study-new]').forEach(el => el.addEventListener('click', () => {
            const refId = el.dataset.studyNew || null;
            openEditor(date, { refId, host: 'today' });
        }));
        root.querySelectorAll('[data-study-edit]').forEach(el => el.addEventListener('click', () => openEditor(date, { id: el.dataset.studyEdit, host: 'today' })));
        root.querySelectorAll('[data-study-start]').forEach(el => el.addEventListener('click', () => startWindow(date, el.dataset.studyStart)));
    }

    // Timeline rows for Today: window header + sessions + breaks, in time order
    function timelineGroups(date) {
        return getWindows(date).map(win => ({
            win,
            start: toMin(win.start),
            end: toMin(win.end),
            label: win.place,
            style: `${lengthOf(win)}m sessions`,
            sessions: sessionsOf(date, win.id)
        }));
    }

    // Creating / editing a window happens on the timeline (js/modules/study-draft.js).
    // opts: { id } to edit, { refId } to start from a place, { host: 'plan' | 'today' }
    function openEditor(date, opts = {}) {
        if (window.CortexStudyDraft) CortexStudyDraft.start(date, opts);
    }
    function closeEditor() {
        if (window.CortexStudyDraft) CortexStudyDraft.cancel();
    }

    // ------------------------------------------------------------------
    // Exam tasks get the colour of their kind of work (once, only if they still had the course's colour)
    // ------------------------------------------------------------------
    function colourExamTasks() {
        if (typeof templates === 'undefined' || typeof uniData === 'undefined') return;
        const courses = (uniData && uniData.remainingExams) || [];
        let changed = false;
        templates.forEach(t => {
            if (!t || !LOADS[t.load] || !String(t.uniRole || '').startsWith('plan_') || t.kindColor) return;
            const course = courses.find(c => c.id === t.uniExamId);
            if (!t.color || (course && t.color === course.color) || t.color === '#ffffff') {
                t.color = kindColor(t.load);
                changed = true;
            }
            t.kindColor = true;
            changed = true;
        });
        if (changed && typeof saveData === 'function') saveData();
    }
    setTimeout(colourExamTasks, 0);

    // For Settings → Focus & study: what Cortex has learned so far
    function learnedSummary() {
        const picks = lengthPicks();
        const n = sum(Object.values(picks));
        const top = [...LENGTHS].sort((a, b) => (picks[b] || 0) - (picks[a] || 0))[0];
        return {
            picks: n,
            favourite: n && picks[top] ? { len: top, label: `${top}-min sessions`, count: picks[top] } : null,
            pace: paceFromHistory(),
            splits: Object.keys(getPrefSafe('studySplitMemo', {}) || {}).length
        };
    }
    function forgetLearned() {
        setPrefQuiet('studyLenPicks', {});
        setPrefQuiet('studySplitMemo', {});
    }

    // ------------------------------------------------------------------
    // Public API
    // ------------------------------------------------------------------
    window.CortexStudy = {
        LOADS, PHASES, LENGTHS, BREAK_AFTER,
        loadOf, guessLoad, kindColor, isTimeTarget, progress, targetFor, unitMinutes, fmtDur, fmt, toMin,
        phaseLabel, phaseInfo, lengthOf, defaultLength, noteLengthPick, splitMemo, rememberSplit, roundSplit,
        remainingToday, isAhead, candidateSubjects, defaultSubjectIds, byKind, busyIntervals, placesOn, openingText,
        getWindows, findWindow, sessionsOf, computePlan, capacity, applyPlan, saveWindow, removeWindow, replanWindow,
        settleSession, replanAfterFocus, unassignedFocus, assignFocus, ignoreFocus,
        creditMinutes, markPinned, startWindow, openEditor, closeEditor,
        decorateDayCanvas, renderTodayCard, bindTodayCard, timelineGroups,
        paceFromHistory, learnedSummary, forgetLearned
    };
})();
