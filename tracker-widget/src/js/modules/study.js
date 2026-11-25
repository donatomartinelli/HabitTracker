// --- js/modules/study.js ---
// STUDY WINDOWS
//
// You say where and when you study ("Potenza library, 09:00–12:00") and which tasks you work on.
// You split that time between them (2h theory + 1h exercises, or the other way round), and
// Cortex proposes a few ways to run it, each aware of the phases of studying:
//   warm-up → new material → exercises → recall with the book closed → light review.
// Session lengths follow the time you have and the plan you pick: there is no fixed rhythm.
// Cortex remembers which plans you pick, how you split the time and how long you actually
// stay focused, and offers that first next time.
//
// Data: studyPlans[date] = { windows: [...], targets: { templateId: minutes } }  (state.js, synced)
//   window = { id, refId, place, color, start, end, subjects:[tid], split:{tid: minutes}, style, lenShift }
// The sessions are normal day blocks in ephemeralData[date] with studyWindowId (and phase) set,
// so every view (Today, Day planner, Week, Tasks) shows them without extra code.
// A session you drag or resize becomes "pinned": re-planning keeps it.

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
    // Kind of work and phases of a study session
    // ------------------------------------------------------------------
    const LOADS = {
        deep:     { label: 'Theory',    short: 'Theory',    hint: 'New material: reading, understanding, notes', rank: 0 },
        practice: { label: 'Exercises', short: 'Exercises', hint: 'Exercises and problems',                       rank: 1 },
        light:    { label: 'Review',    short: 'Review',    hint: 'Flashcards and light review (Anki)',           rank: 2 }
    };

    const PHASES = {
        warmup:   { label: 'warm-up',      hint: 'Go over what you did last time, then open today’s material.' },
        learn:    { label: 'new material', hint: 'Read, understand, take notes.' },
        practice: { label: 'exercises',    hint: 'Solve without looking at the solution first.' },
        review:   { label: 'review',       hint: 'Flashcards and spaced repetition.' },
        recall:   { label: 'recall',       hint: 'Book closed: write or say what you remember, then check what you missed.' }
    };
    const LOAD_PHASE = { deep: 'learn', practice: 'practice', light: 'review' };

    // ------------------------------------------------------------------
    // Plan styles: each one is a way of running the same time
    // ------------------------------------------------------------------
    // len: [preferred, shortest, longest] session per kind of work (minutes of focus)
    // brk: break = session × ratio (between min and max); a long break once `every` minutes of focus add up
    const STYLES = {
        deep_first: {
            label: 'Theory first', short: 'theory first',
            why: 'The longest sessions go to theory while you are fresh, exercises come after, and a short recall closes what you read.',
            len: { deep: [55, 35, 75], practice: [45, 25, 60], light: [25, 10, 35] },
            decay: true, recall: true,
            brk: { ratio: 0.2, min: 5, max: 15, every: 110, long: 20 }
        },
        interleave: {
            label: 'Learn, then apply', short: 'learn + apply',
            why: 'Theory and exercises take turns, so you use what you just read while it is fresh. Light review at the end.',
            len: { deep: [40, 25, 50], practice: [35, 20, 45], light: [20, 10, 30] },
            brk: { ratio: 0.18, min: 5, max: 10, every: 100, long: 20 }
        },
        ramp: {
            label: 'Warm-up, then peak', short: 'warm-up',
            why: 'An easy start to get going, the longest session once you are warmed up, lighter work as attention drops.',
            len: { deep: [50, 30, 70], practice: [40, 25, 55], light: [20, 10, 30] },
            peak: 75, decay: true, recall: true, warmup: true,
            brk: { ratio: 0.2, min: 5, max: 15, every: 120, long: 20 }
        },
        pace: {
            label: 'Your pace', short: 'your pace',
            why: '',   // written from your history, see paceFromHistory()
            recall: true,
            brk: { ratio: 0.2, min: 5, max: 15, every: 110, long: 20 }
        },
        sprints: {
            label: 'Short sprints', short: 'sprints',
            why: 'Sessions of 25–30 min with 5 min breaks. For tired days, or when it is hard to get started.',
            len: { deep: [28, 20, 32], practice: [28, 20, 32], light: [20, 10, 30] },
            brk: { ratio: 0.2, min: 5, max: 5, every: 100, long: 15 }
        },
        long: {
            label: 'Long blocks', short: 'long blocks',
            why: 'Few sessions of about 90 min with real breaks and fewer switches. For heavy material on a rested day.',
            len: { deep: [85, 60, 100], practice: [75, 50, 90], light: [30, 10, 40] },
            recall: true,
            brk: { ratio: 0.2, min: 15, max: 20, every: Infinity, long: 20 }
        }
    };
    const STYLE_ORDER = ['deep_first', 'interleave', 'ramp', 'pace', 'sprints', 'long'];
    // Windows saved with the old fixed rhythms
    const LEGACY_STYLE = { decreasing: 'deep_first', fifty: 'deep_first', desktime: 'deep_first', custom: 'deep_first', pomodoro: 'sprints', thirty: 'sprints', ultradian: 'long', flow: 'long' };
    const LEN_SHIFTS = [{ v: -10, label: 'Shorter' }, { v: 0, label: 'As proposed' }, { v: 10, label: 'Longer' }];

    function styleOf(win) {
        if (win && STYLES[win.style]) return win.style;
        return (win && LEGACY_STYLE[win.rhythm]) || 'deep_first';
    }
    function styleLabel(win) { return STYLES[styleOf(win)].label; }

    const MIN_SESSION = 10;
    const STUDY_RE = /stud|exam|esam|lezion|lecture|analisi|analys|algebr|fisic|physic|math|matemat|\buni\b|universit|corso|course|chapter|capitol|anki|flashcard|eserciz|exercis|problem|ripass|review|teoria|theory|appunt|notes/i;

    function guessLoad(t) {
        const s = `${t.title || ''} ${t.category || ''}`.toLowerCase();
        if (/anki|flashcard|carte|ripass|review|vocab|memor/.test(s)) return 'light';
        if (/eserciz|exercis|problem|esercitaz|practice|quiz|test/.test(s)) return 'practice';
        return 'deep';
    }
    function loadOf(t) {
        return (t && LOADS[t.load]) ? t.load : guessLoad(t || {});
    }
    function phaseLabel(key) { return PHASES[key] ? PHASES[key].label : ''; }
    // What a focus phase needs to show the study phase (Today card, header strip)
    function phaseInfo(key) {
        return PHASES[key] ? { phase: key, phaseLabel: PHASES[key].label, phaseHint: PHASES[key].hint } : {};
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
    // Minutes studied today for a task: timer minutes, or ticked boxes × block length, whichever is more
    function progress(t, date) {
        const target = targetFor(t, date);
        const done = Math.max(focusMinutes(t.id, date), ticksDone(t, date) * unitMinutes(t));
        const allTicked = ticksDone(t, date) >= (t.instances || 1);
        return { done, target, complete: allTicked || (target > 0 && done >= target), unit: unitMinutes(t) };
    }
    // What is still to do today for a task, not counting what other windows already plan for it
    // (Time already done is in `done`: blocks that are over or done do not count again.)
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
    // Busy time on a day (everything that is not this window's own auto sessions)
    // ------------------------------------------------------------------
    function busyIntervals(date, win) {
        const out = [];
        const dayIdx = parseLocalDate(date).getDay();
        (typeof templates !== 'undefined' ? templates : []).forEach(t => {
            if (!t || !Array.isArray(t.timeWindows) || !t.timeWindows.length || !isTaskActiveOnDate(t, date)) return;
            t.timeWindows.forEach(tw => {
                if (!tw || !tw.days || !tw.days.includes(dayIdx)) return;
                if (plannerExceptions[`${t.id}_${date}_${tw.start}`]) return;
                out.push({ s: toMin(tw.start), e: toMin(tw.end), why: t.title });
            });
        });
        (typeof routinesData !== 'undefined' ? routinesData : []).forEach(r => {
            if (!r || r.type !== 'timed' || typeof isRoutineActiveOnDate !== 'function' || !isRoutineActiveOnDate(r, date)) return;
            (r.timeWindows || []).forEach(tw => {
                if (tw && tw.days && tw.days.includes(dayIdx)) out.push({ s: toMin(tw.start), e: toMin(tw.end), why: r.title });
            });
        });
        (typeof specificEvents !== 'undefined' ? specificEvents : []).forEach(e => {
            if (e && e.date === date && e.start && e.end) out.push({ s: toMin(e.start), e: toMin(e.end), why: e.title });
        });
        dayBlocks(date).forEach(b => {
            if (!b || !b.start || !b.end) return;
            if (win && b.studyWindowId === win.id && !keepsOwn(b, date)) return;
            out.push({ s: toMin(b.start), e: toMin(b.end), why: b.title, block: b });
        });
        if (window.CortexMeals && typeof CortexMeals.getMealBlocks === 'function') {
            CortexMeals.getMealBlocks(date).forEach(m => out.push({ s: m.start, e: m.end, why: m.title, meal: true }));
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

    // Minutes of the whole window you can study in (its own sessions, pinned or not, count as free)
    function windowStudyMinutes(date, win) {
        const s = toMin(win.start), e = toMin(win.end);
        if (s === null || e === null || e <= s) return 0;
        const busy = busyIntervals(date, win).filter(b => !(b.block && b.block.studyWindowId === win.id));
        return sum(freeSegments(s, e, busy), x => x.e - x.s);
    }

    // ------------------------------------------------------------------
    // Default subjects for a window
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

    function stylePicks() {
        const p = getPrefSafe('studyStylePicks', {});
        return p && typeof p === 'object' ? p : {};
    }
    // The plans in the order to offer them: the ones you pick most often first
    function rankedStyles() {
        const picks = stylePicks();
        return [...STYLE_ORDER].sort((a, b) => (picks[b] || 0) - (picks[a] || 0) || STYLE_ORDER.indexOf(a) - STYLE_ORDER.indexOf(b));
    }
    function favouriteStyle() {
        const top = rankedStyles()[0];
        return (stylePicks()[top] || 0) >= 2 ? top : 'deep_first';
    }
    function notePick(style) {
        const picks = Object.assign({}, stylePicks());
        picks[style] = (picks[style] || 0) + 1;
        setPrefQuiet('studyStylePicks', picks);
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
    // Splitting the window's time between subjects
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
        const extra = total - units * 5;
        if (extra > 0) {
            const big = ids.reduce((a, id) => (out[id] > out[a] ? id : a), ids[0]);
            out[big] += extra;
        }
        return out;
    }

    // Quick ways to split the time, shown as chips in the editor
    function splitOptions(date, ids, total, loads, winId) {
        if (ids.length < 2 || total <= 0) return [];
        const all = typeof templates !== 'undefined' ? templates : [];
        const out = [];
        const add = (key, label, weightOf) => {
            const split = roundSplit(ids, weightOf, total);
            const sig = ids.map(id => split[id]).join(',');
            if (out.some(o => o.sig === sig) || ids.some(id => split[id] <= 0)) return;
            out.push({ key, label, split, sig });
        };
        const memo = splitMemo(ids);
        if (memo) add('memo', 'Like last time', id => memo[id]);
        const left = Object.fromEntries(ids.map(id => {
            const t = all.find(x => x.id === id);
            return [id, t ? remainingToday(t, date, winId) : 0];
        }));
        if (ids.every(id => left[id] > 0)) add('left', 'By what is left today', id => left[id]);
        add('even', 'Even', () => 1);
        if (ids.length === 2) {
            add('r21', '2 : 1', id => (id === ids[0] ? 2 : 1));
            add('r12', '1 : 2', id => (id === ids[0] ? 1 : 2));
        } else if (new Set(ids.map(id => loads[id])).size > 1) {
            const w = { deep: 2, practice: 1.4, light: 0.6 };
            add('theory', 'More on theory', id => w[loads[id]] || 1);
        }
        return out;
    }

    // The split a saved window asks for, as weights (missing = an average share)
    function splitWeights(date, win, subjects) {
        const sp = win && win.split && typeof win.split === 'object' ? win.split : null;
        if (sp && subjects.some(t => Number(sp[t.id]) > 0)) {
            const known = subjects.map(t => Number(sp[t.id])).filter(v => Number.isFinite(v) && v > 0);
            const avg = sum(known) / known.length;
            return Object.fromEntries(subjects.map(t => {
                const v = Number(sp[t.id]);
                return [t.id, Number.isFinite(v) && v >= 0 ? v : avg];
            }));
        }
        const memo = splitMemo(subjects.map(t => t.id));
        if (memo) return Object.fromEntries(subjects.map(t => [t.id, memo[t.id] || 0]));
        const left = subjects.map(t => remainingToday(t, date, win ? win.id : null));
        const anyLeft = left.some(v => v > 0);
        return Object.fromEntries(subjects.map((t, i) => [t.id, anyLeft ? left[i] : 1]));
    }

    // ------------------------------------------------------------------
    // THE PLANNER
    // ------------------------------------------------------------------
    // Splits `W` minutes of focus into sessions near the preferred length (the first ones a bit longer with decay)
    function chunk(W, spec, decay) {
        W = Math.round(W);
        if (W < 5) return [];
        const [pref, min, max] = spec;
        if (W <= max) return [W];
        let k = Math.max(1, Math.round(W / pref));
        while (k > 1 && W / k < min) k--;
        while (W / k > max) k++;          // the longest length always wins: a sprint never becomes a long block
        const w = Array.from({ length: k }, (_, i) => (decay ? Math.pow(0.88, i) : 1));
        const sw = sum(w);
        const out = w.map(x => Math.max(5, round5((W * x) / sw)));
        out[out.length - 1] += W - sum(out);
        if (out.length > 1 && out[out.length - 1] < 5) out[out.length - 2] += out.pop();
        return out;
    }

    function styleConfig(key, lenShift = 0) {
        const base = STYLES[key];
        if (!base) return null;
        let len = base.len;
        if (key === 'pace') {
            const p = paceFromHistory();
            if (!p) return null;
            const L = p.len;
            len = { deep: [L, Math.max(15, L - 15), L + 15], practice: [L, Math.max(15, L - 15), L + 15], light: [Math.min(25, L), 10, 35] };
        }
        if (lenShift) {
            len = Object.fromEntries(Object.entries(len).map(([k, [p, mn, mx]]) =>
                [k, [Math.max(10, p + lenShift), Math.max(10, mn + lenShift), Math.max(15, mx + lenShift)]]));
        }
        return Object.assign({}, base, { len, peak: base.peak ? Math.max(30, base.peak + lenShift) : 0 });
    }

    // The sessions of a plan, in order: [{ tid, load, len, phase }]. null = this style does not fit these subjects.
    // subs: [{ tid, load, order, W }] with W = minutes of focus for this window
    function buildUnits(styleKey, subs, cfg) {
        const units = [];
        const unit = (s, len, phase) => ({ tid: s.tid, load: s.load, len, phase });
        const push = (s, len, phase) => { if (len >= MIN_SESSION) units.push(unit(s, len, phase)); };
        const byKind = [...subs].sort((a, b) => (LOADS[a.load].rank - LOADS[b.load].rank) || (a.order - b.order));
        const recallFor = (s, W) => (cfg.recall && s.load === 'deep' && W >= 80 ? (W >= 150 ? 15 : 10) : 0);
        // One subject's sessions, then (for theory) a recall with the book closed
        const series = (s, W) => {
            const rec = recallFor(s, W);
            chunk(W - rec, cfg.len[s.load], cfg.decay).forEach(l => push(s, l, LOAD_PHASE[s.load]));
            if (rec) push(s, rec, 'recall');
        };
        const totalW = sum(subs, s => s.W);
        if (!subs.length) return [];

        if (styleKey === 'interleave') {
            const deep = byKind.filter(s => s.load === 'deep');
            const prac = byKind.filter(s => s.load === 'practice');
            const light = byKind.filter(s => s.load === 'light');
            // sessions of a group of subjects, the subjects taking turns
            const turns = (group) => {
                const lists = group.map(s => chunk(s.W, cfg.len[s.load]).map(l => unit(s, l, LOAD_PHASE[s.load])));
                const out = [];
                while (lists.some(li => li.length)) lists.forEach(li => { if (li.length) out.push(li.shift()); });
                return out;
            };
            // exercises split into as many sessions as theory (when long enough), so each reading is followed by practice
            const evenly = (s, W, k, phase) => {
                const n = Math.max(1, Math.min(k, Math.floor(W / Math.max(15, cfg.len.practice[1]))));
                const base = round5(W / n);
                return Array.from({ length: n }, (_, i) => unit(s, i === n - 1 ? W - base * (n - 1) : base, phase));
            };
            let a, b;
            if (deep.length && prac.length) {
                a = turns(deep);
                b = turns(prac);
                if (prac.length === 1 && b.length < a.length) b = evenly(prac[0], prac[0].W, a.length, 'practice');
            } else if (deep.length + prac.length === 1) {
                // a single theory subject: its own reading and its own exercises take turns
                const s = deep[0];
                if (!s || s.W < 50) return null;
                const learnW = round5(s.W * 0.55);
                a = chunk(learnW, cfg.len.deep).map(l => unit(s, l, 'learn'));
                b = evenly(s, s.W - learnW, a.length, 'practice');
            } else if (deep.length + prac.length >= 2) {
                // all the same kind of work: the subjects take turns
                a = turns(deep.length ? deep : prac);
                b = [];
            } else return null;
            while (a.length || b.length) {
                if (a.length) units.push(a.shift());
                if (b.length) units.push(b.shift());
            }
            light.forEach(s => series(s, s.W));
            return units;
        }

        if (styleKey === 'ramp') {
            if (totalW < 50) return null;
            const W = new Map(subs.map(s => [s.tid, s.W]));
            const light = byKind.filter(s => s.load === 'light');
            const heavy = byKind.filter(s => s.load !== 'light');
            // 1. warm-up: some flashcards, or ten minutes going over the first subject
            if (light.length) {
                const s = light[0], w = s.W - 20 < MIN_SESSION ? s.W : 20;
                push(s, w, 'review'); W.set(s.tid, s.W - w);
            } else if (heavy.length) {
                const s = heavy[0], w = Math.min(10, s.W);
                push(s, w, 'warmup'); W.set(s.tid, s.W - w);
            }
            // 2. the peak: the longest session right after, then shorter ones
            let peakDone = false;
            heavy.forEach(s => {
                let w = W.get(s.tid);
                const rec = recallFor(s, w);
                w -= rec;
                if (!peakDone && w >= MIN_SESSION) {
                    let p = Math.min(w, cfg.peak || 75);
                    if (w - p > 0 && w - p < 15) p = w;
                    push(s, p, LOAD_PHASE[s.load]);
                    w -= p;
                    peakDone = true;
                }
                chunk(w, cfg.len[s.load], true).forEach(l => push(s, l, LOAD_PHASE[s.load]));
                if (rec) push(s, rec, 'recall');
            });
            // 3. what is left of the light work, at the end
            light.forEach(s => chunk(W.get(s.tid), cfg.len.light).forEach(l => push(s, l, 'review')));
            return units;
        }

        if (styleKey === 'long' && !subs.some(s => s.load !== 'light' && s.W >= 60)) return null;
        byKind.forEach(s => series(s, s.W));
        return units;
    }

    function addBreaks(units, cfg) {
        const b = cfg.brk;
        let since = 0;
        units.forEach((u, i) => {
            u.brk = 0;
            if (i === units.length - 1) return;
            since += u.len;
            if (u.phase === 'warmup') return;            // the warm-up flows into the first session
            if (since >= b.every) { u.brk = b.long; since = 0; return; }
            u.brk = Math.max(b.min, Math.min(b.max, round5(u.len * b.ratio)));
        });
    }

    // Finds how many minutes of focus each subject gets so that sessions + breaks fill F minutes
    // subs: [{ tid, load, order, S }] with S = this subject's share of the free time (breaks included)
    function fitUnits(styleKey, subs, F, cfg) {
        const SS = sum(subs, s => s.S);
        if (SS <= 0) return [];
        let W = subs.map(s => s.S * 0.82);
        let units = null;
        for (let it = 0; it < 10; it++) {
            const list = subs.map((s, i) => Object.assign({}, s, { W: Math.max(0, round5(W[i])) })).filter(s => s.W >= 5);
            units = buildUnits(styleKey, list, cfg);
            if (!units) return null;
            addBreaks(units, cfg);
            const diff = F - sum(units, u => u.len + u.brk);
            if (Math.abs(diff) <= 4) break;
            W = W.map((w, i) => Math.max(0, w + (0.8 * diff * subs[i].S) / SS));   // damped: session counts jump
        }
        if (!units || !units.length) return units;
        // The last few minutes: 5 at a time, each time to (or from) the subject furthest from its share,
        // on its shortest session when adding and its longest when taking, so the shape stays the same
        let diff = F - sum(units, u => u.len + u.brk);
        const real = (u) => u.phase !== 'recall' && u.phase !== 'warmup';
        const totalFocus = sum(units, u => u.len) + diff;
        let guard = 0;
        while (Math.abs(diff) >= 5 && guard++ < 200) {
            const focus = {};
            units.forEach(u => { focus[u.tid] = (focus[u.tid] || 0) + u.len; });
            const gap = (s) => (s.S / SS) * totalFocus - (focus[s.tid] || 0);
            const step = diff > 0 ? 5 : -5;
            const movable = (u) => real(u) && (step > 0 || u.len + step >= MIN_SESSION);
            const target = subs.filter(s => units.some(u => u.tid === s.tid && movable(u)))
                .sort((a, b) => (step > 0 ? gap(b) - gap(a) : gap(a) - gap(b)))[0];
            if (!target) break;
            const own = units.filter(u => u.tid === target.tid && movable(u));
            const u = own.reduce((a, x) => (step > 0 ? (x.len < a.len ? x : a) : (x.len > a.len ? x : a)), own[0]);
            u.len += step;
            diff -= step;
        }
        if (diff !== 0) {
            const u = [...units].reverse().find(real);
            if (u) u.len = Math.max(MIN_SESSION, u.len + diff);
        }
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
        // A little time left at the end of the window: the last session takes it
        const last = result.sessions[result.sessions.length - 1];
        if (last) {
            const seg = segments.find(sg => last.e > sg.s && last.e <= sg.e);
            const gap = seg ? seg.e - last.e : 0;
            if (gap > 0 && gap <= (last.phase === 'recall' ? 5 : 20) && !segments.some(sg => sg.s > last.e)) {
                result.placedMin += gap;
                last.e = seg.e;
            }
        }
        result.breaks = last ? result.breaks.filter(b => b.s < last.e) : [];
    }

    // Free minutes after the last session (time the plan did not use)
    function slackAfter(result, segments) {
        const last = result.sessions[result.sessions.length - 1];
        const end = last ? last.e : -Infinity;
        return sum(segments, sg => Math.max(0, sg.e - Math.max(sg.s, end)));
    }

    // Returns { style, sessions:[{tid,s,e,load,phase}], breaks:[{s,e}], leftover:{tid:min}, placedMin, freeMin, focusBy:{tid:min} }
    // opts.style: plan style to use (default: the window's) · opts.loads: {tid: load} not saved yet
    // opts.lenShift: −10 / 0 / +10 on session lengths · opts.ignoreNow: plan the whole window even today
    // opts.capToTarget: (automatic re-plans) a task never gets more than what is left of its day's target;
    //                   the time it frees goes to the others, and what nobody needs stays free
    function computePlan(date, win, opts = {}) {
        const allTemplates = typeof templates !== 'undefined' ? templates : [];
        const wanted = STYLES[opts.style] ? opts.style : styleOf(win);
        const ids = Array.isArray(win.subjects) ? win.subjects : defaultSubjectIds(date);
        const subjects = ids.map(id => allTemplates.find(t => t.id === id)).filter(Boolean);
        const winS = toMin(win.start), winE = toMin(win.end);
        const result = { style: wanted, sessions: [], breaks: [], leftover: {}, placedMin: 0, freeMin: 0, focusBy: {} };
        if (winS === null || winE === null || winE <= winS || !subjects.length) return result;
        const loadFor = (t) => (opts.loads && LOADS[opts.loads[t.id]] ? opts.loads[t.id] : loadOf(t));
        const lenShift = Number.isFinite(opts.lenShift) ? opts.lenShift : (Number(win.lenShift) || 0);

        // Today: plan only from now on (past sessions stay where they are)
        let from = winS;
        const isToday = date === todayStr;
        const nowMin = nowMinutes();
        if (isToday && !opts.ignoreNow && nowMin > winS) from = Math.min(winE, Math.ceil(nowMin / 5) * 5);

        // Time this window already gave each subject: its sessions that stay (done, moved by hand,
        // over, running) and anything else on that subject inside the window (a different timer you ran)
        const used = {};
        const ids0 = new Set(subjects.map(t => t.id));
        dayBlocks(date).forEach(b => {
            if (!b || !ids0.has(b.templateId)) return;
            if (b.studyWindowId === win.id) {
                const past = isToday && !opts.ignoreNow && toMin(b.end) <= from;
                if (past || keepsOwn(b, date)) used[b.templateId] = (used[b.templateId] || 0) + blockLen(b);
                return;
            }
            const overlap = Math.min(toMin(b.end), winE) - Math.max(toMin(b.start), winS);
            if (overlap > 0) used[b.templateId] = (used[b.templateId] || 0) + overlap;
        });

        const busy = busyIntervals(date, win);
        const segments = freeSegments(from, winE, busy);
        const F = sum(segments, x => x.e - x.s);
        result.freeMin = F;
        if (F < MIN_SESSION) return result;

        // Each subject's share of the time that is left, following the split you chose for the whole window
        const total = windowStudyMinutes(date, win);
        const weights = splitWeights(date, win, subjects);
        const sumW = sum(subjects, t => weights[t.id]);
        if (sumW <= 0) return result;
        const rem = subjects.map((t, i) => {
            const w = (weights[t.id] || 0) / sumW;
            let r = Math.max(0, w * total - (used[t.id] || 0));
            let cap = Infinity;
            if (opts.capToTarget && isTimeTarget(t, date)) {
                const left = remainingToday(t, date, win.id);       // minutes of focus still to do today
                cap = left > 0 ? left / 0.85 : 0;                   // as time in the window, breaks included
                r = Math.min(r, cap);
            }
            return { tid: t.id, load: loadFor(t), order: i, rem: r, cap, w };
        });
        if (opts.capToTarget) {
            // Time nobody uses any more (a task already done, minutes lost at the start) goes to the
            // other tasks of the window, following the split, up to what each still has to do today
            let extra = F - sum(rem, r => r.rem);
            for (let guard = 0; extra > 1 && guard < 10; guard++) {
                const open = rem.filter(r => r.w > 0 && r.cap - r.rem > 0.5);
                if (!open.length) break;
                const sw = sum(open, r => r.w);
                let given = 0;
                open.forEach(r => { const add = Math.min(r.cap - r.rem, (extra * r.w) / sw); r.rem += add; given += add; });
                extra -= given;
                if (given < 0.5) break;
            }
        }
        const sumRem = sum(rem, r => r.rem);
        if (sumRem <= 0) return result;
        // Shares of the free time; when capped, a window that has more time than work leaves the rest free
        const scale = opts.capToTarget ? Math.min(1, F / sumRem) : F / sumRem;
        const subs = rem.map(r => Object.assign(r, { S: r.rem * scale })).filter(r => r.S >= 5);
        if (!subs.length) return result;
        const Ffill = Math.min(F, sum(subs, s => s.S));
        result.freeMin = F;

        let styleKey = wanted;
        let cfg = styleConfig(styleKey, lenShift);
        const fitFor = (Feff) => fitUnits(styleKey, subs.map(s => Object.assign({}, s, { S: (s.S * Feff) / Ffill })), Feff, cfg);
        let units = cfg ? fitFor(Ffill) : null;
        if (!units || !units.length) {
            if (opts.strict) return Object.assign(result, { style: null });
            styleKey = 'deep_first';
            cfg = styleConfig(styleKey, lenShift);
            units = fitFor(Ffill) || [];
        }
        result.style = styleKey;

        // Busy slots in the middle waste a few minutes (or save a break): fit again on the time really usable
        const tryPlace = (list) => {
            const r = { sessions: [], breaks: [], leftover: {}, placedMin: 0 };
            placeUnits(list, segments, r);
            r.over = sum(Object.values(r.leftover));
            r.slack = Math.max(0, slackAfter(r, segments) - (F - Ffill));   // time left free on purpose is not slack
            r.score = r.over * 2 + Math.max(0, r.slack - 20);
            return r;
        };
        let attempt = tryPlace(units);
        let best = attempt;
        let Feff = Ffill;
        for (let pass = 0; pass < 4 && attempt.score > 0; pass++) {
            Feff = Math.max(MIN_SESSION, Feff - attempt.over + (attempt.slack > 20 ? attempt.slack - 5 : 0));
            const next = fitFor(Feff);
            if (!next || !next.length) break;
            attempt = tryPlace(next);
            if (attempt.score < best.score) best = attempt;
        }
        ['sessions', 'breaks', 'leftover', 'placedMin'].forEach(k => { result[k] = best[k]; });
        result.sessions.forEach(s => { result.focusBy[s.tid] = (result.focusBy[s.tid] || 0) + (s.e - s.s); });
        return result;
    }

    function planSignature(plan) {
        return plan.sessions.map(s => `${s.tid}:${s.e - s.s}:${s.phase}`).join('|');
    }

    // The plans to choose from for a window, best first
    function proposePlans(date, win, opts = {}) {
        const pace = paceFromHistory();
        const picks = stylePicks();
        const topPick = Math.max(0, ...Object.values(picks).map(Number).filter(Number.isFinite));
        const out = [];
        const seen = new Set();
        rankedStyles().forEach(k => {
            if (k === 'pace' && !pace) return;
            const plan = computePlan(date, win, Object.assign({}, opts, { style: k, strict: true }));
            if (plan.style !== k || !plan.sessions.length) return;
            const sig = planSignature(plan);
            if (seen.has(sig)) return;
            seen.add(sig);
            const why = k === 'pace'
                ? `Sessions as long as the ones you actually hold: about ${pace.len} min, from your last ${pace.n} sessions.`
                : STYLES[k].why;
            out.push({ style: k, label: STYLES[k].label, why, plan, usual: topPick >= 2 && (picks[k] || 0) === topPick });
        });
        return out;
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
                color: t.color || '#ffffff',
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
        win.lastPlan = { at: Date.now(), leftover: plan.leftover, placedMin: plan.placedMin, style: plan.style };
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
            style: STYLES[data.style] ? data.style : styleOf(win),
            lenShift: Number(data.lenShift) || 0,
            subjects: data.subjects,
            split: data.split && typeof data.split === 'object' ? Object.assign({}, data.split) : (win.split || null)
        });
        // the old fixed-rhythm settings are gone
        ['rhythm', 'order', 'customWork', 'customBreak'].forEach(k => delete win[k]);
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
                // sessions already done today stay as a record, without a window
                if (isToday && toMin(b.end) <= nowMin) { delete b.studyWindowId; return true; }
                return false;
            });
        }
        if (!p.windows.length && !Object.keys(p.targets).length) delete studyPlans[date];
        saveData();
        rerenderAll();
    }

    function replanWindow(date, winId) {
        applyPlan(date, winId);
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
            b = { id: wanted, templateId: t.id, title: t.title, category: t.category, color: t.color || '#b08d43', blocksUsed: 0, focusBlock: true };
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
            applyPlan(date, win.id, { capToTarget: true });
            changed = true;
        });
        if (changed) { saveData(); rerenderAll(); }
    }

    // Focus of that day not counted in any task (e.g. the exam "Study" button before it knew your tasks)
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
        getWindows(date).forEach(win => {
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
                    <span class="study-band-title">${esc(win.place)} <span class="dim">· ${esc(win.start)}–${esc(win.end)} · ${esc(STYLES[styleOf(win)].short)}</span></span>
                    <span class="study-band-actions">
                        ${date === todayStr ? `<button type="button" class="ghost-btn" data-act="start" title="Start the timer for this window">${typeof focusStateIcon === 'function' ? focusStateIcon(false) : '▶'} Start</button>` : ''}
                        <button type="button" class="ghost-btn" data-act="edit">Edit</button>
                    </span>
                </div>`;
            band.querySelector('[data-act="edit"]').addEventListener('click', (ev) => { ev.stopPropagation(); openEditor(date, { id: win.id }); });
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
                    ${g.tasks.map(t => { const left = remainingToday(t, date, null); return `<button type="button" class="study-chip" data-orphan-to="${esc(t.id)}" style="--chip-color:${esc(t.color || '#888')}">${esc(t.title)}<span class="dim">${esc(t.category || '')}${left > 0 ? ` · ${fmtDur(left)} left` : ''}</span></button>`; }).join('')}
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
                    <div class="study-prompt-sub dim">${fmtDur(leftToStudy)} to study · pick a place and the time, then choose how to split it.</div>
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
            const over = win.lastPlan && win.lastPlan.leftover ? Object.values(win.lastPlan.leftover).reduce((a, b) => a + b, 0) : 0;
            const live = date === todayStr && nowMin >= s && nowMin < e;
            const finished = date === todayStr && nowMin >= e;
            const strip = ses.map(b => {
                const l = ((toMin(b.start) - s) / total) * 100, w = (blockLen(b) / total) * 100;
                const past = date === todayStr && toMin(b.end) <= nowMin;
                return `<span class="study-strip-seg ${past ? 'is-past' : ''}" style="left:${l.toFixed(2)}%;width:${w.toFixed(2)}%;background:${esc(b.color || '#fff')}" title="${esc(b.start)}–${esc(b.end)} ${esc(b.title)}${b.phase ? ' · ' + esc(phaseLabel(b.phase)) : ''}"></span>`;
            }).join('');
            const nowMark = live ? `<span class="study-strip-now" style="left:${(((nowMin - s) / total) * 100).toFixed(2)}%"></span>` : '';
            const nextSes = ses.find(b => toMin(b.end) > nowMin);
            const playIco = typeof focusStateIcon === 'function' ? focusStateIcon(false) : '▶';
            html += `
                <div class="study-card ${live ? 'is-live' : ''} ${finished ? 'is-finished' : ''}">
                    <div class="study-card-row">
                        <div class="study-card-main">
                            <div class="study-card-title">${esc(win.place)} <span class="dim">${esc(win.start)}–${esc(win.end)}</span></div>
                            <div class="study-card-sub dim">${esc(styleLabel(win))} · ${ses.length} session${ses.length === 1 ? '' : 's'} · ${fmtDur(studyMin)}${over > 0 ? ` · <span class="study-warn">${fmtDur(over)} don't fit</span>` : ''}</div>
                        </div>
                        <div class="study-card-actions">
                            ${date === todayStr && !finished && nextSes ? `<button type="button" class="btn btn-primary btn-sm" data-study-start="${esc(win.id)}">${playIco} ${live ? 'Start' : `Start at ${esc(nextSes.start)}`}</button>` : ''}
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
            openEditor(date, { refId });
        }));
        root.querySelectorAll('[data-study-edit]').forEach(el => el.addEventListener('click', () => openEditor(date, { id: el.dataset.studyEdit })));
        root.querySelectorAll('[data-study-start]').forEach(el => el.addEventListener('click', () => startWindow(date, el.dataset.studyStart)));
    }

    // Timeline rows for Today: window header + sessions + breaks, in time order
    function timelineGroups(date) {
        return getWindows(date).map(win => ({
            win,
            start: toMin(win.start),
            end: toMin(win.end),
            label: win.place,
            style: STYLES[styleOf(win)].short,
            sessions: sessionsOf(date, win.id)
        }));
    }

    // ------------------------------------------------------------------
    // EDITOR (modal / bottom sheet on the phone)
    // ------------------------------------------------------------------
    // A thin bar of the plan over the window: sessions in their colours, breaks as gaps
    function planStrip(plan, s, e, colorOf) {
        const total = Math.max(1, e - s);
        return plan.sessions.map(x => `<span class="study-pv-seg ${x.phase === 'recall' || x.phase === 'warmup' ? 'is-soft' : ''}" style="left:${(((x.s - s) / total) * 100).toFixed(2)}%;width:${(((x.e - x.s) / total) * 100).toFixed(2)}%;background:${esc(colorOf(x.tid))}"></span>`).join('');
    }

    function openEditor(date, opts = {}) {
        closeEditor();
        const existing = opts.id ? findWindow(date, opts.id) : null;
        const places = placesOn(date);
        const allTemplates = typeof templates !== 'undefined' ? templates : [];
        const tpl = (id) => allTemplates.find(x => x.id === id);
        const colorOf = (id) => { const t = tpl(id); return (t && t.color) || '#ffffff'; };

        // Initial state
        const st = {
            id: existing ? existing.id : null,
            refId: existing ? existing.refId : (opts.refId || null),
            place: existing ? existing.place : '',
            start: existing ? existing.start : null,
            end: existing ? existing.end : null,
            style: existing ? styleOf(existing) : favouriteStyle(),
            lenShift: existing ? (Number(existing.lenShift) || 0) : (Number(getPrefSafe('studyLenShift', 0)) || 0),
            subjects: existing && Array.isArray(existing.subjects) ? [...existing.subjects] : defaultSubjectIds(date),
            loads: {},
            split: {},
            splitMode: 'left',
            options: [],
            plans: [],
            plan: null
        };
        // Subjects you can pick: flexible tasks with a duration today (plus any already in the window)
        const cands = candidateSubjects(date);
        st.subjects.forEach(id => { const t = tpl(id); if (t && !cands.includes(t)) cands.push(t); });
        // Keep the window's order, then the others
        const ordered = [...st.subjects.map(id => cands.find(t => t.id === id)).filter(Boolean), ...cands.filter(t => !st.subjects.includes(t.id))];
        ordered.forEach(t => { st.loads[t.id] = loadOf(t); });
        st.list = ordered.map(t => t.id);
        st.subjects = st.subjects.filter(id => st.list.includes(id));
        const onIds = () => st.list.filter(id => st.subjects.includes(id));

        const placeObj = () => places.find(p => p.ref.id === st.refId) || null;
        if (!existing) {
            const p = placeObj();
            const nowMin = nowMinutes();
            if (p) {
                st.place = p.ref.title;
                // Start from the first opening slot that is not over yet (today), at most 5 hours
                const slot = p.slots.find(sl => date !== todayStr || toMin(sl.end) > nowMin + 30) || p.slots[0];
                let s = toMin(slot.start);
                if (date === todayStr) s = Math.max(s, Math.ceil((nowMin + 10) / 15) * 15);
                const e = Math.min(toMin(slot.end), s + 300);
                st.start = fmt(s); st.end = fmt(Math.max(s + 30, e));
            } else {
                st.place = 'Home';
                const s = date === todayStr ? Math.max(9 * 60, Math.ceil((nowMin + 10) / 15) * 15) : 9 * 60;
                st.start = fmt(Math.min(s, 22 * 60)); st.end = fmt(Math.min(23 * 60 + 30, toMin(st.start) + 180));
            }
        }

        const draftWindow = () => ({
            id: st.id || '__draft__',
            start: st.start, end: st.end,
            style: st.style, lenShift: st.lenShift,
            subjects: onIds(),
            split: st.split
        });
        const totalMin = () => windowStudyMinutes(date, draftWindow());

        // The split: re-derived when the time or the subjects change, unless you set it by hand
        const refreshSplit = () => {
            const ids = onIds();
            const total = totalMin();
            st.options = splitOptions(date, ids, total, st.loads, st.id);
            if (ids.length < 2) { st.split = ids.length ? { [ids[0]]: total } : {}; return; }
            if (st.splitMode !== 'custom') {
                const o = st.options.find(x => x.key === st.splitMode) || st.options.find(x => x.key === 'left') || st.options[0];
                if (o) { st.splitMode = o.key; st.split = Object.assign({}, o.split); return; }
            }
            const known = ids.filter(id => st.split[id] > 0);
            const avg = known.length ? sum(known, id => st.split[id]) / known.length : 1;
            st.split = roundSplit(ids, id => (st.split[id] !== undefined ? st.split[id] : avg), total);
            st.splitMode = 'custom';
        };
        if (existing && existing.split && typeof existing.split === 'object' && onIds().some(id => Number(existing.split[id]) > 0)) {
            st.split = Object.assign({}, existing.split);
            st.splitMode = 'custom';
        } else {
            st.splitMode = splitMemo(onIds()) ? 'memo' : 'left';
        }
        refreshSplit();

        const dateObj = parseLocalDate(date);
        const dateLabel = dateObj.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

        const wrap = document.createElement('div');
        wrap.id = 'study-editor';
        wrap.className = 'study-overlay';
        wrap.innerHTML = `
            <div class="study-sheet" role="dialog" aria-modal="true" aria-labelledby="study-ed-title">
                <div class="study-sheet-head">
                    <div>
                        <div id="study-ed-title" class="study-sheet-title">${existing ? 'Edit study window' : 'New study window'}</div>
                        <div class="dim study-sheet-date">${esc(dateLabel)}</div>
                    </div>
                    <button type="button" class="hdr-icon" data-close aria-label="Close">×</button>
                </div>
                <div class="study-sheet-body">
                    <section class="study-field">
                        <div class="study-label">Where</div>
                        <div class="study-chips" data-places></div>
                        <input type="text" class="form-control form-control-sm study-place-input" data-place-name placeholder="Name of the place" maxlength="40">
                    </section>
                    <section class="study-field">
                        <div class="study-label">When</div>
                        <div class="study-time-row">
                            <label>From <input type="time" class="form-control form-control-sm" data-start step="300"></label>
                            <label>To <input type="time" class="form-control form-control-sm" data-end step="300"></label>
                            <span class="dim study-open" data-open></span>
                        </div>
                    </section>
                    <section class="study-field">
                        <div class="study-label">What <span class="dim" data-total></span></div>
                        <div class="study-split-opts" data-split-opts></div>
                        <div class="study-subjects" data-subjects></div>
                    </section>
                    <section class="study-field">
                        <div class="study-label">How <span class="dim">· plans Cortex proposes for this time</span></div>
                        <div class="study-plans" data-plans></div>
                        <div class="study-shift-row">
                            <span class="dim">Sessions</span>
                            <div class="study-seg study-seg-sm" data-shift role="radiogroup" aria-label="Session length"></div>
                        </div>
                    </section>
                    <section class="study-field">
                        <div class="study-label">Plan</div>
                        <div class="study-preview" data-preview></div>
                        <div class="study-preview-list" data-preview-list></div>
                        <div class="study-summary" data-summary></div>
                    </section>
                </div>
                <div class="study-sheet-foot">
                    ${existing ? '<button type="button" class="ghost-btn danger" data-remove>Remove window</button>' : '<span></span>'}
                    <div class="study-foot-right">
                        <button type="button" class="btn btn-sm" data-close>Cancel</button>
                        <button type="button" class="btn btn-primary btn-sm" data-save>${existing ? 'Save and re-plan' : 'Create sessions'}</button>
                    </div>
                </div>
            </div>`;
        (document.getElementById('modals-root') || document.body).appendChild(wrap);

        const $ = (sel) => wrap.querySelector(sel);

        // --- Places
        const renderPlaces = () => {
            const chips = places.map(p => `<button type="button" class="study-chip ${st.refId === p.ref.id ? 'active' : ''}" data-ref="${esc(p.ref.id)}" style="--chip-color:${esc(p.ref.color || '#888')}">${esc(p.ref.title)}<span class="dim">${esc(openingText(p.slots))}</span></button>`).join('');
            $('[data-places]').innerHTML = chips + `<button type="button" class="study-chip ${!st.refId ? 'active' : ''}" data-ref="">Home / elsewhere</button>`;
            $('[data-place-name]').hidden = Boolean(st.refId);
            $('[data-place-name]').value = st.refId ? '' : (st.place || 'Home');
            const p = placeObj();
            $('[data-open]').textContent = p ? `open ${openingText(p.slots)}` : '';
        };
        $('[data-places]').addEventListener('click', (e) => {
            const b = e.target.closest('[data-ref]');
            if (!b) return;
            st.refId = b.dataset.ref || null;
            const p = placeObj();
            if (p) {
                st.place = p.ref.title;
                // Keep the chosen times if they fit in the opening hours, otherwise use the first slot
                const s = toMin(st.start), en = toMin(st.end);
                const fits = p.slots.some(sl => s >= toMin(sl.start) && en <= toMin(sl.end));
                if (!fits) {
                    const sl = p.slots[0];
                    st.start = sl.start;
                    st.end = fmt(Math.min(toMin(sl.end), toMin(sl.start) + 300));
                    $('[data-start]').value = st.start; $('[data-end]').value = st.end;
                }
            } else {
                st.place = 'Home';
            }
            renderPlaces();
            update({ split: true });
        });
        $('[data-place-name]').addEventListener('input', (e) => { st.place = e.target.value.trim() || 'Home'; });

        // --- Times
        $('[data-start]').value = st.start;
        $('[data-end]').value = st.end;
        $('[data-start]').addEventListener('change', (e) => { if (e.target.value) { st.start = e.target.value; update({ split: true }); } });
        $('[data-end]').addEventListener('change', (e) => { if (e.target.value) { st.end = e.target.value; update({ split: true }); } });

        // --- What: subjects, kind of work and their share of the time
        const renderSplitOptions = () => {
            const ids = onIds();
            const cur = ids.map(id => st.split[id]).join(',');
            $('[data-split-opts]').innerHTML = st.options.length ? st.options.map(o => `
                <button type="button" class="study-split ${o.sig === cur ? 'active' : ''}" data-split="${esc(o.key)}">
                    <span class="study-split-name">${esc(o.label)}</span>
                    <span class="study-split-vals">${ids.map(id => `<span><i style="background:${esc(colorOf(id))}"></i>${fmtDur(o.split[id])}</span>`).join('')}</span>
                </button>`).join('') : '';
        };
        $('[data-split-opts]').addEventListener('click', (e) => {
            const b = e.target.closest('[data-split]');
            if (!b) return;
            const o = st.options.find(x => x.key === b.dataset.split);
            if (!o) return;
            st.splitMode = o.key;
            st.split = Object.assign({}, o.split);
            update();
        });

        const renderSubjects = () => {
            if (!st.list.length) {
                $('[data-subjects]').innerHTML = `<div class="dim study-hint">No flexible tasks with a duration today. Add one (e.g. "Algebra 2h") in Tasks, then come back.</div>`;
                return;
            }
            const many = onIds().length > 1;
            $('[data-subjects]').innerHTML = st.list.map(id => {
                const t = tpl(id);
                if (!t) return '';
                const on = st.subjects.includes(id);
                const pr = progress(t, date);
                const left = remainingToday(t, date, st.id);
                const info = [t.category || '', pr.done > 0 ? `${fmtDur(pr.done)} done` : '', left > 0 ? `${fmtDur(left)} left today` : (pr.target > 0 ? 'target reached' : '')].filter(Boolean).join(' · ');
                return `
                    <div class="study-subj ${on ? '' : 'is-off'}" data-tid="${esc(id)}" style="--subj-color:${esc(t.color || '#fff')}">
                        <label class="study-subj-on"><input type="checkbox" ${on ? 'checked' : ''} data-on aria-label="Study ${esc(t.title)} in this window"></label>
                        <div class="study-subj-name">
                            <span class="study-subj-title">${esc(t.title)}</span>
                            <span class="dim study-subj-cat">${esc(info)}</span>
                        </div>
                        <div class="study-seg study-seg-sm" role="radiogroup" aria-label="Kind of work">
                            ${Object.entries(LOADS).map(([k, l]) => `<button type="button" class="${st.loads[id] === k ? 'active' : ''}" data-load="${k}" title="${esc(l.hint)}" aria-pressed="${st.loads[id] === k}">${esc(l.short)}</button>`).join('')}
                        </div>
                        ${on ? `<div class="study-stepper" title="Time in this window">
                            ${many ? '<button type="button" data-step="-15" aria-label="Less time">−</button>' : ''}
                            <span data-mins>${fmtDur(st.split[id] || 0)}</span>
                            ${many ? '<button type="button" data-step="15" aria-label="More time">+</button>' : ''}
                        </div>` : '<span class="study-stepper is-empty dim">—</span>'}
                    </div>`;
            }).join('');
        };
        // + / − on one subject: the time comes from (or goes to) the next one in the list
        const stepSplit = (id, delta) => {
            const ids = onIds();
            if (ids.length < 2 || !ids.includes(id)) return;
            const total = sum(ids, x => st.split[x]);
            const cur = st.split[id] || 0;
            let d = delta > 0 ? Math.min(delta, total - cur) : Math.max(delta, -cur);
            if (!d) return;
            const i = ids.indexOf(id);
            const others = [...ids.slice(i + 1), ...ids.slice(0, i)];
            if (d > 0) {
                let need = d;
                for (const o of others) {
                    const take = Math.min(need, st.split[o] || 0);
                    st.split[o] -= take;
                    need -= take;
                    if (!need) break;
                }
                d -= need;
            } else {
                st.split[others[0]] = (st.split[others[0]] || 0) - d;
            }
            st.split[id] = cur + d;
            st.splitMode = 'custom';
        };
        $('[data-subjects]').addEventListener('click', (e) => {
            const row = e.target.closest('[data-tid]');
            if (!row) return;
            const id = row.dataset.tid;
            const ld = e.target.closest('[data-load]');
            const stp = e.target.closest('[data-step]');
            if (ld) { st.loads[id] = ld.dataset.load; update({ split: true }); }
            else if (stp) { stepSplit(id, parseInt(stp.dataset.step, 10)); update(); }
        });
        $('[data-subjects]').addEventListener('change', (e) => {
            const cb = e.target.closest('[data-on]');
            const row = e.target.closest('[data-tid]');
            if (!cb || !row) return;
            const id = row.dataset.tid;
            if (cb.checked && !st.subjects.includes(id)) st.subjects.push(id);
            if (!cb.checked) { st.subjects = st.subjects.filter(x => x !== id); delete st.split[id]; }
            // A different set of subjects: back to the suggested split (or the one you used for this set)
            if (st.splitMode === 'custom' && cb.checked) delete st.split[id];
            else if (st.splitMode !== 'custom') st.splitMode = splitMemo(onIds()) ? 'memo' : 'left';
            update({ split: true });
        });

        // --- How: the proposed plans
        const renderPlans = () => {
            const s = toMin(st.start), e = toMin(st.end);
            st.plans = (e > s && onIds().length) ? proposePlans(date, draftWindow(), { loads: st.loads, lenShift: st.lenShift }) : [];
            if (st.plans.length && !st.plans.some(p => p.style === st.style)) st.style = st.plans[0].style;
            const chosen = st.plans.find(p => p.style === st.style);
            st.plan = chosen ? chosen.plan : null;
            $('[data-plans]').innerHTML = st.plans.length ? st.plans.map(p => {
                const ses = p.plan.sessions;
                const longest = ses.reduce((a, x) => Math.max(a, x.e - x.s), 0);
                return `
                    <button type="button" class="study-plan ${p.style === st.style ? 'active' : ''}" data-style="${esc(p.style)}" aria-pressed="${p.style === st.style}">
                        <span class="study-plan-name">${esc(p.label)}${p.usual ? ' <span class="study-plan-tag">your usual</span>' : ''}</span>
                        <span class="study-plan-bar">${planStrip(p.plan, s, e, colorOf)}</span>
                        <span class="study-plan-stats">${ses.length} session${ses.length === 1 ? '' : 's'} · ${fmtDur(p.plan.placedMin)} focus · longest ${fmtDur(longest)}</span>
                        <span class="study-plan-why">${esc(p.why)}</span>
                    </button>`;
            }).join('') : '<div class="dim study-hint">Pick at least one task and a time to see the plans.</div>';
            $('[data-shift]').innerHTML = LEN_SHIFTS.map(x => `<button type="button" class="${st.lenShift === x.v ? 'active' : ''}" data-shift-v="${x.v}" aria-pressed="${st.lenShift === x.v}">${esc(x.label)}</button>`).join('');
        };
        $('[data-plans]').addEventListener('click', (e) => {
            const b = e.target.closest('[data-style]');
            if (!b) return;
            st.style = b.dataset.style;
            update();
        });
        $('[data-shift]').addEventListener('click', (e) => {
            const b = e.target.closest('[data-shift-v]');
            if (!b) return;
            st.lenShift = parseInt(b.dataset.shiftV, 10) || 0;
            update();
        });

        // --- Plan detail (the chosen proposal, nothing saved yet)
        const renderPreview = () => {
            const s = toMin(st.start), e = toMin(st.end);
            const total = Math.max(1, e - s);
            const plan = st.plan || { sessions: [], breaks: [], leftover: {}, placedMin: 0, freeMin: 0, focusBy: {} };
            const busy = e > s ? busyIntervals(date, draftWindow()).filter(b => b.e > s && b.s < e).map(b =>
                `<span class="study-pv-busy" style="left:${(((Math.max(b.s, s) - s) / total) * 100).toFixed(2)}%;width:${(((Math.min(b.e, e) - Math.max(b.s, s)) / total) * 100).toFixed(2)}%" title="${esc(b.why || 'busy')}"></span>`).join('') : '';
            $('[data-preview]').innerHTML = `${busy}${planStrip(plan, s, e, colorOf)}<span class="study-pv-edge l">${esc(st.start)}</span><span class="study-pv-edge r">${esc(st.end)}</span>`;

            const items = [...plan.sessions.map(x => ({ kind: 's', ...x })), ...plan.breaks.map(b => ({ kind: 'b', ...b }))].sort((a, b) => a.s - b.s);
            $('[data-preview-list]').innerHTML = items.map(it => {
                if (it.kind === 'b') return `<div class="study-pv-row is-break"><span>${fmt(it.s)}</span><span>break · ${it.e - it.s}m</span></div>`;
                const t = tpl(it.tid);
                const ph = PHASES[it.phase];
                return `<div class="study-pv-row" style="--subj-color:${esc(colorOf(it.tid))}"><span>${fmt(it.s)}</span><span><b>${esc(t ? t.title : '')}</b> · ${it.e - it.s}m${ph ? ` <span class="study-pv-phase">${esc(ph.label)}</span> <span class="dim">${esc(ph.hint)}</span>` : ''}</span></div>`;
            }).join('') || '<div class="dim study-hint">Nothing to place: pick at least one task with time in this window.</div>';

            const over = sum(Object.values(plan.leftover || {}));
            const p2 = placeObj();
            const outside = p2 && !p2.slots.some(sl => s >= toMin(sl.start) && e <= toMin(sl.end));
            const ids = onIds();
            const bits = [];
            if (plan.sessions.length) bits.push(`<span><b>${fmtDur(plan.placedMin)}</b> of focus in ${plan.sessions.length} session${plan.sessions.length === 1 ? '' : 's'}</span>`);
            if (ids.length > 1 && plan.sessions.length) bits.push(`<span class="dim">${ids.filter(id => plan.focusBy[id]).map(id => `${esc(tpl(id) ? tpl(id).title : '')} ${fmtDur(plan.focusBy[id])}`).join(' · ')}</span>`);
            if (over > 0) bits.push(`<span class="study-warn">${fmtDur(over)} don't fit around the busy slots</span>`);
            if (outside) bits.push(`<span class="study-warn">${esc(p2.ref.title)} is open ${esc(openingText(p2.slots))}</span>`);
            if (e <= s) bits.push('<span class="study-warn">The end must be after the start</span>');
            $('[data-summary]').innerHTML = bits.join('');
            $('[data-save]').disabled = e <= s || !plan.sessions.length;
        };

        const update = (o = {}) => {
            if (o.split) refreshSplit();
            const total = totalMin();
            $('[data-total]').textContent = total > 0 ? `· ${fmtDur(total)} to split` : '';
            renderSplitOptions();
            renderSubjects();
            renderPlans();
            renderPreview();
        };

        // --- Save / remove / close
        $('[data-save]').addEventListener('click', () => {
            if (toMin(st.end) <= toMin(st.start) || !st.plan) return;
            // The kind of work is a property of the task: saved on it
            st.list.forEach(id => {
                const t = tpl(id);
                if (t && st.loads[id] && t.load !== st.loads[id]) t.load = st.loads[id];
            });
            // What Cortex learns: the plan you picked, how you split the time, how long you like sessions
            if (!existing || styleOf(existing) !== st.style) notePick(st.style);
            rememberSplit(onIds(), st.split);
            setPrefQuiet('studyLenShift', st.lenShift);
            const p = placeObj();
            const res = saveWindow(date, {
                id: st.id,
                refId: st.refId,
                place: p ? p.ref.title : (st.place || 'Home'),
                color: p ? p.ref.color : null,
                start: st.start, end: st.end,
                style: st.style, lenShift: st.lenShift,
                subjects: onIds(),
                split: Object.fromEntries(onIds().map(id => [id, st.split[id] || 0]))
            });
            closeEditor();
            if (typeof showToast === 'function' && res && res.plan) {
                showToast(`${res.plan.sessions.length} study session${res.plan.sessions.length === 1 ? '' : 's'} planned · ${res.win.place} ${res.win.start}–${res.win.end}`);
            }
        });
        $('[data-remove]')?.addEventListener('click', () => {
            removeWindow(date, st.id);
            closeEditor();
            if (typeof showToast === 'function') showToast('Study window removed');
        });
        wrap.addEventListener('click', (e) => {
            if (e.target === wrap || e.target.closest('[data-close]')) closeEditor();
        });
        wrap.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeEditor(); });

        renderPlaces();
        update();
        $('[data-save]').focus();
    }

    function closeEditor() {
        document.getElementById('study-editor')?.remove();
    }

    // For Settings → Focus & study: what Cortex has learned so far
    function learnedSummary() {
        const picks = stylePicks();
        const n = sum(Object.values(picks));
        const top = rankedStyles()[0];
        const pace = paceFromHistory();
        return {
            picks: n,
            favourite: n && picks[top] ? { style: top, label: STYLES[top].label, count: picks[top] } : null,
            pace,
            splits: Object.keys(getPrefSafe('studySplitMemo', {}) || {}).length,
            lenShift: Number(getPrefSafe('studyLenShift', 0)) || 0
        };
    }
    function forgetLearned() {
        setPrefQuiet('studyStylePicks', {});
        setPrefQuiet('studySplitMemo', {});
        setPrefQuiet('studyLenShift', 0);
    }

    // ------------------------------------------------------------------
    // Public API
    // ------------------------------------------------------------------
    window.CortexStudy = {
        STYLES, STYLE_ORDER, LOADS, PHASES,
        loadOf, guessLoad, isTimeTarget, progress, targetFor, unitMinutes, fmtDur, phaseLabel, phaseInfo, styleLabel,
        remainingToday, isAhead, settleSession, replanAfterFocus, unassignedFocus, assignFocus, ignoreFocus,
        getWindows, findWindow, sessionsOf, computePlan, proposePlans, applyPlan, saveWindow, removeWindow, replanWindow,
        creditMinutes, markPinned, startWindow, openEditor, closeEditor,
        decorateDayCanvas, renderTodayCard, bindTodayCard, timelineGroups, placesOn,
        paceFromHistory, learnedSummary, forgetLearned
    };
})();
