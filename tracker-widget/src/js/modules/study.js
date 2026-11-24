// --- js/modules/study.js ---
// STUDY WINDOWS
//
// Instead of placing half-hour blocks by hand, you say:
//   "today I study at the Potenza library from 09:00 to 14:00"
// and Cortex fills that window with study sessions for your subjects
// (Algebra 2h, Exercises 2h, Anki 1h...), following a rhythm you pick
// (decreasing 50·40·30·20, 50/10, Pomodoro, 52/17, 90/20, flow, custom)
// and an order based on mental load (theory → exercises → flashcards).
//
// Data: studyPlans[date] = { windows: [...], targets: { templateId: minutes } }  (state.js, synced)
// The sessions are normal day blocks in ephemeralData[date] with studyWindowId set,
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

    // ------------------------------------------------------------------
    // Rhythms and mental load
    // ------------------------------------------------------------------
    const RHYTHMS = {
        decreasing: {
            label: 'Decreasing 50 · 40 · 30 · 20', short: '50·40·30·20',
            desc: 'Longest session while you are fresh, shorter ones as attention drops. 10 min breaks, 20 after the shortest, then it starts again.',
            step: (i) => { const k = i % 4; return { work: [50, 40, 30, 20][k], brk: k === 3 ? 20 : 10 }; }
        },
        fifty: {
            label: '50 / 10', short: '50/10',
            desc: 'About a university hour: long enough to get into the material, with a real break every hour.',
            step: () => ({ work: 50, brk: 10 })
        },
        pomodoro: {
            label: 'Pomodoro 25 / 5', short: '25/5',
            desc: 'Short sprints with frequent breaks, 20 min every fourth. Good on tired days and for light work.',
            step: (i) => ({ work: 25, brk: i % 4 === 3 ? 20 : 5 })
        },
        thirty: {
            label: '30 / 5', short: '30/5',
            desc: 'The old half-hour blocks, with a short break between them.',
            step: () => ({ work: 30, brk: 5 })
        },
        desktime: {
            label: '52 / 17', short: '52/17',
            desc: 'Long breaks: the pattern a time-tracking app saw in its most productive users.',
            step: () => ({ work: 52, brk: 17 })
        },
        ultradian: {
            label: '90 / 20', short: '90/20',
            desc: 'One deep block of about 90 min, then a real break. For heavy theory when you are rested.',
            step: () => ({ work: 90, brk: 20 })
        },
        flow: {
            label: 'Flow, no breaks', short: 'flow',
            desc: 'Each subject in one continuous session. You only stop when you switch subject (5 min).',
            step: null
        },
        custom: {
            label: 'Custom', short: 'custom',
            desc: 'Your own work and break length.',
            step: null
        }
    };
    const RHYTHM_ORDER = ['decreasing', 'fifty', 'pomodoro', 'thirty', 'desktime', 'ultradian', 'flow', 'custom'];

    const LOADS = {
        deep:     { label: 'High focus', short: 'High',   hint: 'Theory, notes, new material', rank: 0 },
        practice: { label: 'Medium',     short: 'Medium', hint: 'Exercises and problems',       rank: 1 },
        light:    { label: 'Light',      short: 'Light',  hint: 'Flashcards, review (Anki)',    rank: 2 }
    };

    const ORDERS = {
        heavy_first: { label: 'Heavy first', desc: 'Theory while you are fresh, then exercises, light review at the end.' },
        interleave:  { label: 'Alternate',   desc: 'Theory and exercises take turns; light review at the end.' },
        warmup:      { label: 'Warm-up',     desc: 'A short light session to get started, then heavy first.' },
        manual:      { label: 'My order',    desc: 'The order of the list below.' }
    };

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
    function focusMinutes(tid, date) {
        return (typeof focusLogs !== 'undefined' ? focusLogs : [])
            .filter(l => l && l.templateId === tid && (l.date === date || l.dateStr === date))
            .reduce((a, l) => a + (Number(l.minutes) || 0), 0);
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
        (Array.isArray(ephemeralData[date]) ? ephemeralData[date] : []).forEach(b => {
            if (!b || !b.start || !b.end) return;
            if (win && b.studyWindowId === win.id && !b.pinned) return;
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

    // ------------------------------------------------------------------
    // Default subjects for a window
    // ------------------------------------------------------------------
    function candidateSubjects(date) {
        return (typeof templates !== 'undefined' ? templates : []).filter(t => isTimeTarget(t, date));
    }
    function defaultSubjectIds(date) {
        const all = candidateSubjects(date);
        const study = all.filter(t => t.load || STUDY_RE.test(`${t.title} ${t.category}`));
        return (study.length ? study : all).map(t => t.id);
    }

    // ------------------------------------------------------------------
    // THE PLANNER: fills a window with sessions
    // ------------------------------------------------------------------
    // Returns { sessions:[{tid,s,e,load}], breaks:[{s,e}], leftover:{tid:min}, placedMin, freeMin }
    function computePlan(date, win, opts = {}) {
        const allTemplates = typeof templates !== 'undefined' ? templates : [];
        const ids = Array.isArray(win.subjects) ? win.subjects : defaultSubjectIds(date);
        const subjects = ids.map(id => allTemplates.find(t => t.id === id)).filter(Boolean);
        const winS = toMin(win.start), winE = toMin(win.end);
        const result = { sessions: [], breaks: [], leftover: {}, placedMin: 0, freeMin: 0 };
        if (winS === null || winE === null || winE <= winS || !subjects.length) return result;

        // Today: plan only from now on (past sessions stay where they are)
        let from = winS;
        const isToday = date === todayStr;
        const nowMin = (() => { const n = getNow(); return n.getHours() * 60 + n.getMinutes(); })();
        if (isToday && !opts.ignoreNow && nowMin > winS) from = Math.min(winE, Math.ceil(nowMin / 5) * 5);

        const ownBlocks = (Array.isArray(ephemeralData[date]) ? ephemeralData[date] : []).filter(b => b && b.studyWindowId === win.id);
        const keptPast = isToday && !opts.ignoreNow ? ownBlocks.filter(b => !b.pinned && toMin(b.end) <= from) : [];

        // Minutes still to place per subject
        const otherWindowMin = (tid) => (Array.isArray(ephemeralData[date]) ? ephemeralData[date] : [])
            .filter(b => b && b.templateId === tid && b.studyWindowId && b.studyWindowId !== win.id)
            .reduce((a, b) => a + (toMin(b.end) - toMin(b.start)), 0);
        const pinnedMin = (tid) => ownBlocks.filter(b => b.pinned && b.templateId === tid)
            .reduce((a, b) => a + (toMin(b.end) - toMin(b.start)), 0);
        const pastMin = (tid) => keptPast.filter(b => b.templateId === tid)
            .reduce((a, b) => a + (toMin(b.end) - toMin(b.start)), 0);

        let queue = subjects.map((t, i) => {
            const pr = progress(t, date);
            // Done minutes already include sessions you ran with the timer; past planned blocks without timer don't count
            const already = Math.max(pr.done, 0) + otherWindowMin(t.id) + pinnedMin(t.id) + (opts.countPast ? pastMin(t.id) : 0);
            return { tid: t.id, load: loadOf(t), order: i, remaining: Math.max(0, targetFor(t, date) - already) };
        }).filter(q => q.remaining > 0);

        const order = ORDERS[win.order] ? win.order : 'heavy_first';
        if (order !== 'manual') queue.sort((a, b) => (LOADS[a.load].rank - LOADS[b.load].rank) || (a.order - b.order));
        if (order === 'warmup') {
            const li = queue.findIndex(q => q.load === 'light');
            if (li > 0) {
                const light = queue[li];
                const warm = Math.min(20, light.remaining);
                queue.unshift({ tid: light.tid, load: 'light', order: -1, remaining: warm, warm: true });
                light.remaining -= warm;
                if (light.remaining <= 0) queue.splice(li + 1, 1);
            }
        }

        const busy = busyIntervals(date, win);
        const segments = freeSegments(from, winE, busy);
        result.freeMin = segments.reduce((a, s) => a + (s.e - s.s), 0);

        const rhythmKey = RHYTHMS[win.rhythm] ? win.rhythm : 'decreasing';
        const customWork = Math.max(10, parseInt(win.customWork, 10) || getPrefSafe('studyCustomWork', 45));
        const customBreak = Math.max(0, parseInt(win.customBreak, 10) || getPrefSafe('studyCustomBreak', 10));
        const stepFor = (i, q) => {
            if (rhythmKey === 'flow') return { work: q ? q.remaining : 60, brk: 5 };
            if (rhythmKey === 'custom') return { work: customWork, brk: customBreak };
            return RHYTHMS[rhythmKey].step(i);
        };

        let segIdx = 0;
        let cursor = segments.length ? segments[0].s : winE;
        let step = 0;
        let rr = 0;   // round-robin counter for "alternate"
        let lastTid = null;

        const pick = () => {
            const live = queue.filter(q => q.remaining > 0);
            if (!live.length) return null;
            if (order === 'interleave') {
                const heavy = live.filter(q => q.load !== 'light');
                if (heavy.length) {
                    // alternate between subjects of different load first, then round-robin
                    const deep = heavy.filter(q => q.load === 'deep');
                    const prac = heavy.filter(q => q.load === 'practice');
                    const groups = [deep, prac].filter(g => g.length);
                    const g = groups[rr % groups.length];
                    rr++;
                    return g[0];
                }
            }
            return live[0];
        };

        let guard = 0;
        while (guard++ < 200) {
            const q = pick();
            if (!q) break;
            while (segIdx < segments.length && cursor >= segments[segIdx].e) {
                segIdx++;
                if (segIdx < segments.length) cursor = Math.max(cursor, segments[segIdx].s);
            }
            if (segIdx >= segments.length) break;
            const seg = segments[segIdx];
            cursor = Math.max(cursor, seg.s);
            const avail = seg.e - cursor;
            if (avail < MIN_SESSION) { cursor = seg.e; continue; }

            const { work, brk } = stepFor(step, q);
            let len = Math.min(work, avail, q.remaining);
            // Don't leave a crumb of less than 15 min for later: take it now if there is room
            const rest = q.remaining - len;
            if (rest > 0 && rest < 15 && len + rest <= avail && rhythmKey !== 'pomodoro') len += rest;
            if (len < MIN_SESSION && q.remaining >= MIN_SESSION) { cursor = seg.e; continue; }
            len = Math.max(1, Math.round(len));

            result.sessions.push({ tid: q.tid, s: cursor, e: cursor + len, load: q.load });
            q.remaining -= len;
            result.placedMin += len;
            cursor += len;
            lastTid = q.tid;
            step++;

            // Break (flow: only when switching subject)
            let b = brk;
            if (rhythmKey === 'flow') {
                const next = pick();
                b = next && next.tid !== lastTid ? 5 : 0;
            }
            if (b > 0 && cursor < winE) {
                const bEnd = Math.min(winE, cursor + b);
                // a busy slot right after the session already works as a break
                if (cursor < seg.e) result.breaks.push({ s: cursor, e: Math.min(bEnd, seg.e) });
                cursor = bEnd;
            }
        }

        queue.forEach(q => {
            if (q.remaining > 0) result.leftover[q.tid] = (result.leftover[q.tid] || 0) + q.remaining;
        });
        // No break after the last session
        const last = result.sessions[result.sessions.length - 1];
        result.breaks = last ? result.breaks.filter(b => b.s < last.e) : [];
        return result;
    }

    function getPrefSafe(k, d) {
        try { return typeof getPref === 'function' ? (getPref(k) ?? d) : d; } catch (e) { return d; }
    }

    // Writes the plan of a window into the day's blocks
    function applyPlan(date, winId) {
        const win = findWindow(date, winId);
        if (!win) return null;
        const plan = computePlan(date, win);
        if (!Array.isArray(ephemeralData[date])) ephemeralData[date] = [];
        const isToday = date === todayStr;
        const nowMin = (() => { const n = getNow(); return n.getHours() * 60 + n.getMinutes(); })();
        // Keep pinned sessions and (today) the ones already in the past
        ephemeralData[date] = ephemeralData[date].filter(b => {
            if (!b || b.studyWindowId !== winId) return true;
            if (b.pinned) return true;
            return isToday && toMin(b.end) <= nowMin;
        });
        const all = typeof templates !== 'undefined' ? templates : [];
        plan.sessions.forEach(s => {
            const t = all.find(x => x.id === s.tid);
            if (!t) return;
            const minutes = s.e - s.s;
            ephemeralData[date].push({
                id: uid('st'),
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
                auto: true
            });
        });
        win.lastPlan = { at: Date.now(), leftover: plan.leftover, placedMin: plan.placedMin };
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
            rhythm: data.rhythm,
            order: data.order,
            customWork: data.customWork,
            customBreak: data.customBreak,
            subjects: data.subjects
        });
        if (data.targets) {
            Object.entries(data.targets).forEach(([tid, m]) => {
                const t = (templates || []).find(x => x.id === tid);
                if (!t) return;
                if (m === baseTarget(t)) delete p.targets[tid];
                else p.targets[tid] = m;
            });
        }
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
            const nowMin = (() => { const n = getNow(); return n.getHours() * 60 + n.getMinutes(); })();
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
        return (Array.isArray(ephemeralData[date]) ? ephemeralData[date] : [])
            .filter(b => b && b.studyWindowId === winId)
            .sort((a, b) => toMin(a.start) - toMin(b.start));
    }

    function startWindow(date, winId) {
        if (typeof startCurrentPlaylistPhase !== 'function') return;
        const nowMin = (() => { const n = getNow(); return n.getHours() * 60 + n.getMinutes(); })();
        const list = sessionsOf(date, winId).filter(b => date !== todayStr || toMin(b.end) > nowMin);
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
            playlist.push({
                type: 'task', id: b.templateId, category: b.category, title: b.title,
                duration: dur, color: b.color || '#ffffff', isPartial: true, isStudy: true, studyBlockId: b.id
            });
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
            const rh = RHYTHMS[win.rhythm] || RHYTHMS.decreasing;
            band.innerHTML = `
                <div class="study-band-head">
                    <span class="study-band-title">${esc(win.place)} <span class="dim">· ${esc(win.start)}–${esc(win.end)} · ${esc(rh.short)}</span></span>
                    <span class="study-band-actions">
                        ${date === todayStr ? '<button type="button" class="ghost-btn" data-act="start" title="Start the timer for this window">▶ Start</button>' : ''}
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
    function renderTodayCard(date) {
        const wins = getWindows(date);
        const subjects = candidateSubjects(date).filter(t => defaultSubjectIds(date).includes(t.id));
        const leftToStudy = subjects.reduce((a, t) => { const p = progress(t, date); return a + Math.max(0, p.target - p.done); }, 0);
        if (!wins.length && (!subjects.length || leftToStudy <= 0)) return '';

        const nowMin = (() => { const n = getNow(); return n.getHours() * 60 + n.getMinutes(); })();
        let html = `<div class="today-section-head"><span>STUDY</span><span class="dim">${leftToStudy > 0 ? `${fmtDur(leftToStudy)} left` : 'done ✓'}</span></div>`;

        if (!wins.length) {
            // Today: only places still open for at least half an hour
            const places = placesOn(date).filter(p => date !== todayStr || p.slots.some(sl => toMin(sl.end) > nowMin + 30));
            html += `
                <div class="study-prompt">
                    <div class="study-prompt-q">Where and when do you study today?</div>
                    <div class="study-prompt-sub dim">${fmtDur(leftToStudy)} to study · pick a place and Cortex fills the time with sessions.</div>
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
            const studyMin = ses.reduce((a, b) => a + (toMin(b.end) - toMin(b.start)), 0);
            const rh = RHYTHMS[win.rhythm] || RHYTHMS.decreasing;
            const over = win.lastPlan && win.lastPlan.leftover ? Object.values(win.lastPlan.leftover).reduce((a, b) => a + b, 0) : 0;
            const live = date === todayStr && nowMin >= s && nowMin < e;
            const finished = date === todayStr && nowMin >= e;
            const strip = ses.map(b => {
                const l = ((toMin(b.start) - s) / total) * 100, w = ((toMin(b.end) - toMin(b.start)) / total) * 100;
                const past = date === todayStr && toMin(b.end) <= nowMin;
                return `<span class="study-strip-seg ${past ? 'is-past' : ''}" style="left:${l.toFixed(2)}%;width:${w.toFixed(2)}%;background:${esc(b.color || '#fff')}" title="${esc(b.start)}–${esc(b.end)} ${esc(b.title)}"></span>`;
            }).join('');
            const nowMark = live ? `<span class="study-strip-now" style="left:${(((nowMin - s) / total) * 100).toFixed(2)}%"></span>` : '';
            const nextSes = ses.find(b => toMin(b.end) > nowMin);
            html += `
                <div class="study-card ${live ? 'is-live' : ''} ${finished ? 'is-finished' : ''}">
                    <div class="study-card-row">
                        <div class="study-card-main">
                            <div class="study-card-title">${esc(win.place)} <span class="dim">${esc(win.start)}–${esc(win.end)}</span></div>
                            <div class="study-card-sub dim">${esc(rh.label)} · ${ses.length} session${ses.length === 1 ? '' : 's'} · ${fmtDur(studyMin)}${over > 0 ? ` · <span class="study-warn">${fmtDur(over)} don't fit</span>` : ''}</div>
                        </div>
                        <div class="study-card-actions">
                            ${date === todayStr && !finished && nextSes ? `<button type="button" class="btn btn-primary btn-sm" data-study-start="${esc(win.id)}">▶ ${live ? 'Start' : `Start at ${esc(nextSes.start)}`}</button>` : ''}
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
            rhythm: (RHYTHMS[win.rhythm] || RHYTHMS.decreasing).short,
            sessions: sessionsOf(date, win.id)
        }));
    }

    // ------------------------------------------------------------------
    // EDITOR (modal / bottom sheet on the phone)
    // ------------------------------------------------------------------
    function openEditor(date, opts = {}) {
        closeEditor();
        const existing = opts.id ? findWindow(date, opts.id) : null;
        const places = placesOn(date);
        const allTemplates = typeof templates !== 'undefined' ? templates : [];

        // Initial state
        const st = {
            id: existing ? existing.id : null,
            refId: existing ? existing.refId : (opts.refId || null),
            place: existing ? existing.place : '',
            start: existing ? existing.start : null,
            end: existing ? existing.end : null,
            rhythm: existing ? existing.rhythm : getPrefSafe('studyRhythm', 'decreasing'),
            order: existing ? existing.order : getPrefSafe('studyOrder', 'heavy_first'),
            customWork: existing && existing.customWork ? existing.customWork : getPrefSafe('studyCustomWork', 45),
            customBreak: existing && existing.customBreak !== undefined ? existing.customBreak : getPrefSafe('studyCustomBreak', 10),
            subjects: existing && Array.isArray(existing.subjects) ? [...existing.subjects] : defaultSubjectIds(date),
            targets: {},
            loads: {}
        };
        // Subjects you can pick: flexible tasks with a duration today (plus any already in the window)
        const cands = candidateSubjects(date);
        st.subjects.forEach(id => { const t = allTemplates.find(x => x.id === id); if (t && !cands.includes(t)) cands.push(t); });
        // Keep the window's order for "My order", then the others
        const ordered = [...st.subjects.map(id => cands.find(t => t.id === id)).filter(Boolean), ...cands.filter(t => !st.subjects.includes(t.id))];
        ordered.forEach(t => { st.targets[t.id] = targetFor(t, date); st.loads[t.id] = loadOf(t); });
        st.list = ordered.map(t => t.id);

        const placeObj = () => places.find(p => p.ref.id === st.refId) || null;
        if (!existing) {
            const p = placeObj();
            if (p) {
                st.place = p.ref.title;
                // Start from the first opening slot that is not over yet (today), at most 5 hours
                const nowMin = (() => { const n = getNow(); return n.getHours() * 60 + n.getMinutes(); })();
                const slot = p.slots.find(sl => date !== todayStr || toMin(sl.end) > nowMin + 30) || p.slots[0];
                let s = toMin(slot.start);
                if (date === todayStr) s = Math.max(s, Math.ceil((nowMin + 10) / 15) * 15);
                const e = Math.min(toMin(slot.end), s + 300);
                st.start = fmt(s); st.end = fmt(Math.max(s + 30, e));
            } else {
                st.place = 'Home';
                const nowMin = (() => { const n = getNow(); return n.getHours() * 60 + n.getMinutes(); })();
                const s = date === todayStr ? Math.max(9 * 60, Math.ceil((nowMin + 10) / 15) * 15) : 9 * 60;
                st.start = fmt(Math.min(s, 22 * 60)); st.end = fmt(Math.min(23 * 60 + 30, toMin(st.start) + 180));
            }
        }

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
                        <div class="study-label">Rhythm</div>
                        <div class="study-rhythms" data-rhythms></div>
                        <div class="study-custom" data-custom>
                            <label>Work <input type="number" min="10" max="180" step="5" class="form-control form-control-sm no-spinners" data-cw> min</label>
                            <label>Break <input type="number" min="0" max="60" step="5" class="form-control form-control-sm no-spinners" data-cb> min</label>
                        </div>
                    </section>
                    <section class="study-field">
                        <div class="study-label">Order</div>
                        <div class="study-seg" data-orders></div>
                        <div class="dim study-hint" data-order-desc></div>
                    </section>
                    <section class="study-field">
                        <div class="study-label">Subjects today <span class="dim" data-total></span></div>
                        <div class="study-subjects" data-subjects></div>
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
            update();
        });
        $('[data-place-name]').addEventListener('input', (e) => { st.place = e.target.value.trim() || 'Home'; });

        // --- Times
        $('[data-start]').value = st.start;
        $('[data-end]').value = st.end;
        $('[data-start]').addEventListener('change', (e) => { if (e.target.value) { st.start = e.target.value; update(); } });
        $('[data-end]').addEventListener('change', (e) => { if (e.target.value) { st.end = e.target.value; update(); } });

        // --- Rhythm
        const renderRhythms = () => {
            $('[data-rhythms]').innerHTML = RHYTHM_ORDER.map(k => `
                <button type="button" class="study-rhythm ${st.rhythm === k ? 'active' : ''}" data-rh="${k}" aria-pressed="${st.rhythm === k}">
                    <span class="study-rhythm-name">${esc(RHYTHMS[k].label)}</span>
                    <span class="study-rhythm-desc">${esc(RHYTHMS[k].desc)}</span>
                </button>`).join('');
            $('[data-custom]').hidden = st.rhythm !== 'custom';
        };
        $('[data-rhythms]').addEventListener('click', (e) => {
            const b = e.target.closest('[data-rh]');
            if (!b) return;
            st.rhythm = b.dataset.rh;
            renderRhythms();
            update();
        });
        $('[data-cw]').value = st.customWork;
        $('[data-cb]').value = st.customBreak;
        $('[data-cw]').addEventListener('input', (e) => { st.customWork = parseInt(e.target.value, 10) || 45; update(); });
        $('[data-cb]').addEventListener('input', (e) => { st.customBreak = Math.max(0, parseInt(e.target.value, 10) || 0); update(); });

        // --- Order
        const renderOrders = () => {
            $('[data-orders]').innerHTML = Object.entries(ORDERS).map(([k, o]) =>
                `<button type="button" class="${st.order === k ? 'active' : ''}" data-ord="${k}" aria-pressed="${st.order === k}">${esc(o.label)}</button>`).join('');
            $('[data-order-desc]').textContent = (ORDERS[st.order] || ORDERS.heavy_first).desc;
        };
        $('[data-orders]').addEventListener('click', (e) => {
            const b = e.target.closest('[data-ord]');
            if (!b) return;
            st.order = b.dataset.ord;
            renderOrders();
            renderSubjects();
            update();
        });

        // --- Subjects
        const renderSubjects = () => {
            if (!st.list.length) {
                $('[data-subjects]').innerHTML = `<div class="dim study-hint">No flexible tasks with a duration today. Add one (e.g. "Algebra 2h") in Tasks, then come back.</div>`;
                return;
            }
            $('[data-subjects]').innerHTML = st.list.map((id, i) => {
                const t = allTemplates.find(x => x.id === id);
                if (!t) return '';
                const on = st.subjects.includes(id);
                const pr = progress(t, date);
                return `
                    <div class="study-subj ${on ? '' : 'is-off'}" data-tid="${esc(id)}" style="--subj-color:${esc(t.color || '#fff')}">
                        <label class="study-subj-on"><input type="checkbox" ${on ? 'checked' : ''} data-on></label>
                        <div class="study-subj-name">
                            <span class="study-subj-title">${esc(t.title)}</span>
                            <span class="dim study-subj-cat">${esc(t.category || '')}${pr.done > 0 ? ` · ${fmtDur(pr.done)} done` : ''}</span>
                        </div>
                        <div class="study-seg study-seg-sm" role="radiogroup" aria-label="Mental load">
                            ${Object.entries(LOADS).map(([k, l]) => `<button type="button" class="${st.loads[id] === k ? 'active' : ''}" data-load="${k}" title="${esc(l.hint)}">${esc(l.short)}</button>`).join('')}
                        </div>
                        <div class="study-stepper">
                            <button type="button" data-step="-15" aria-label="Less time">−</button>
                            <span data-mins>${fmtDur(st.targets[id])}</span>
                            <button type="button" data-step="15" aria-label="More time">+</button>
                        </div>
                        ${st.order === 'manual' ? `<div class="study-move"><button type="button" data-move="-1" ${i === 0 ? 'disabled' : ''} aria-label="Move up">↑</button><button type="button" data-move="1" ${i === st.list.length - 1 ? 'disabled' : ''} aria-label="Move down">↓</button></div>` : ''}
                    </div>`;
            }).join('');
        };
        $('[data-subjects]').addEventListener('click', (e) => {
            const row = e.target.closest('[data-tid]');
            if (!row) return;
            const id = row.dataset.tid;
            const ld = e.target.closest('[data-load]');
            const stp = e.target.closest('[data-step]');
            const mv = e.target.closest('[data-move]');
            if (ld) { st.loads[id] = ld.dataset.load; renderSubjects(); update(); }
            else if (stp) {
                st.targets[id] = Math.max(0, Math.min(12 * 60, (st.targets[id] || 0) + parseInt(stp.dataset.step, 10)));
                renderSubjects(); update();
            } else if (mv) {
                const i = st.list.indexOf(id), j = i + parseInt(mv.dataset.move, 10);
                if (j >= 0 && j < st.list.length) { [st.list[i], st.list[j]] = [st.list[j], st.list[i]]; renderSubjects(); update(); }
            }
        });
        $('[data-subjects]').addEventListener('change', (e) => {
            const cb = e.target.closest('[data-on]');
            const row = e.target.closest('[data-tid]');
            if (!cb || !row) return;
            const id = row.dataset.tid;
            if (cb.checked && !st.subjects.includes(id)) st.subjects.push(id);
            if (!cb.checked) st.subjects = st.subjects.filter(x => x !== id);
            renderSubjects(); update();
        });

        // --- Live preview (same planner, nothing saved)
        const draftWindow = () => ({
            id: st.id || '__draft__',
            start: st.start, end: st.end, rhythm: st.rhythm, order: st.order,
            customWork: st.customWork, customBreak: st.customBreak,
            subjects: st.list.filter(id => st.subjects.includes(id))
        });
        const update = () => {
            // Targets and loads are applied temporarily so the preview uses them
            const p = dayPlan(date, true);
            const savedTargets = Object.assign({}, p.targets);
            const savedLoads = {};
            st.list.forEach(id => {
                const t = allTemplates.find(x => x.id === id);
                if (!t) return;
                savedLoads[id] = t.load;
                t.load = st.loads[id];
                p.targets[id] = st.targets[id];
            });
            let plan;
            try { plan = computePlan(date, draftWindow()); }
            finally {
                p.targets = savedTargets;
                st.list.forEach(id => { const t = allTemplates.find(x => x.id === id); if (t) { if (savedLoads[id] === undefined) delete t.load; else t.load = savedLoads[id]; } });
                if (!p.windows.length && !Object.keys(p.targets).length && !existing) delete studyPlans[date];
            }
            const s = toMin(st.start), e = toMin(st.end);
            const total = Math.max(1, e - s);
            const segs = plan.sessions.map(x => {
                const t = allTemplates.find(y => y.id === x.tid);
                return `<span class="study-pv-seg" style="left:${(((x.s - s) / total) * 100).toFixed(2)}%;width:${(((x.e - x.s) / total) * 100).toFixed(2)}%;background:${esc((t && t.color) || '#fff')}" title="${fmt(x.s)}–${fmt(x.e)} ${esc(t ? t.title : '')}"></span>`;
            }).join('');
            const busy = busyIntervals(date, draftWindow()).filter(b => b.e > s && b.s < e).map(b =>
                `<span class="study-pv-busy" style="left:${(((Math.max(b.s, s) - s) / total) * 100).toFixed(2)}%;width:${(((Math.min(b.e, e) - Math.max(b.s, s)) / total) * 100).toFixed(2)}%" title="${esc(b.why || 'busy')}"></span>`).join('');
            $('[data-preview]').innerHTML = `${busy}${segs}<span class="study-pv-edge l">${esc(st.start)}</span><span class="study-pv-edge r">${esc(st.end)}</span>`;

            const rows = [];
            const items = [...plan.sessions.map(x => ({ kind: 's', ...x })), ...plan.breaks.map(b => ({ kind: 'b', ...b }))].sort((a, b) => a.s - b.s);
            items.forEach(it => {
                if (it.kind === 'b') rows.push(`<div class="study-pv-row is-break"><span>${fmt(it.s)}</span><span>break · ${it.e - it.s}m</span></div>`);
                else {
                    const t = allTemplates.find(y => y.id === it.tid);
                    rows.push(`<div class="study-pv-row" style="--subj-color:${esc((t && t.color) || '#fff')}"><span>${fmt(it.s)}</span><span><b>${esc(t ? t.title : '')}</b> · ${it.e - it.s}m <span class="dim">${esc(LOADS[it.load] ? LOADS[it.load].short : '')}</span></span></div>`);
                }
            });
            $('[data-preview-list]').innerHTML = rows.join('') || '<div class="dim study-hint">Nothing to place: pick at least one subject with time left.</div>';

            const wanted = st.list.filter(id => st.subjects.includes(id)).reduce((a, id) => a + (st.targets[id] || 0), 0);
            const over = Object.values(plan.leftover).reduce((a, b) => a + b, 0);
            const p2 = placeObj();
            const outside = p2 && !p2.slots.some(sl => s >= toMin(sl.start) && e <= toMin(sl.end));
            $('[data-total]').textContent = `· ${fmtDur(wanted)} planned`;
            const bits = [`<span><b>${fmtDur(plan.placedMin)}</b> of study in ${plan.sessions.length} session${plan.sessions.length === 1 ? '' : 's'}</span>`];
            if (over > 0) bits.push(`<span class="study-warn">${fmtDur(over)} don't fit: make the window longer or lower a subject</span>`);
            else if (plan.freeMin - plan.placedMin - plan.breaks.reduce((a, b) => a + (b.e - b.s), 0) > 20) bits.push(`<span class="dim">window has room left</span>`);
            if (outside) bits.push(`<span class="study-warn">${esc(p2.ref.title)} is open ${esc(openingText(p2.slots))}</span>`);
            if (e <= s) bits.push('<span class="study-warn">The end must be after the start</span>');
            $('[data-summary]').innerHTML = bits.join('');
            $('[data-save]').disabled = e <= s;
        };

        // --- Save / remove / close
        $('[data-save]').addEventListener('click', () => {
            if (toMin(st.end) <= toMin(st.start)) return;
            // Mental load is a property of the task: saved on it
            st.list.forEach(id => {
                const t = allTemplates.find(x => x.id === id);
                if (t && st.loads[id] && t.load !== st.loads[id]) t.load = st.loads[id];
            });
            const p = placeObj();
            const res = saveWindow(date, {
                id: st.id,
                refId: st.refId,
                place: p ? p.ref.title : (st.place || 'Home'),
                color: p ? p.ref.color : null,
                start: st.start, end: st.end,
                rhythm: st.rhythm, order: st.order,
                customWork: st.customWork, customBreak: st.customBreak,
                subjects: st.list.filter(id => st.subjects.includes(id)),
                targets: Object.fromEntries(st.list.map(id => [id, st.targets[id]]))
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
        renderRhythms();
        renderOrders();
        renderSubjects();
        update();
        $('[data-save]').focus();
    }

    function closeEditor() {
        document.getElementById('study-editor')?.remove();
    }

    // ------------------------------------------------------------------
    // Public API
    // ------------------------------------------------------------------
    window.CortexStudy = {
        RHYTHMS, RHYTHM_ORDER, LOADS, ORDERS,
        loadOf, guessLoad, isTimeTarget, progress, targetFor, unitMinutes, fmtDur,
        getWindows, findWindow, sessionsOf, computePlan, applyPlan, saveWindow, removeWindow, replanWindow,
        creditMinutes, markPinned, startWindow, openEditor, closeEditor,
        decorateDayCanvas, renderTodayCard, bindTodayCard, timelineGroups, placesOn
    };
})();
