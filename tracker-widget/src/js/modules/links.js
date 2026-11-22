// --- js/modules/links.js ---
// CONNECTIONS BETWEEN MODULES
//   Exams → study:  next appeals, hours studied per course (from focus sessions),
//                   suggested hours per day to be ready in time.
//   Bills → Today:  recurring bills due in the next 3 days (they are auto-deducted on the day).
//   Gym   → Today:  today's workout split, with open / mark done.
//   Week priorities: the 3 priorities chosen in the weekly review.
//
// Pure read helpers + a couple of actions. Rendered by today.js and review.js.

(function () {
    'use strict';

    // Rough guide: about 12 hours of personal study per CFU (1 CFU ≈ 25h total workload,
    // about half of it is lectures). Used only to suggest a daily pace.
    const STUDY_HOURS_PER_CFU = 12;
    const STUDY_HORIZON_DAYS = 90;
    const BILLS_AHEAD_DAYS = 3;

    const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
    const pad = (n) => String(n).padStart(2, '0');
    const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const parse = (s) => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); };
    const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
    const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return fmt(d); };

    // ------------------------------------------------------------------
    // Exams → study
    // ------------------------------------------------------------------
    function studiedMinutesFor(courseName, sinceDate = null, onlyDate = null) {
        const key = fold(courseName);
        if (!key) return 0;
        let mins = 0;
        (typeof focusLogs !== 'undefined' ? focusLogs : []).forEach(l => {
            if (!l) return;
            if (onlyDate && l.date !== onlyDate) return;
            if (sinceDate && l.date < sinceDate) return;
            if (fold(l.title).includes(key) || fold(l.category).includes(key)) mins += Number(l.minutes || 0);
        });
        return mins;
    }

    function findCourse(name) {
        const key = fold(name).replace(/^\[appello\]\s*/, '');
        const list = (typeof uniData !== 'undefined' && uniData.remainingExams) || [];
        return list.find(c => fold(c.name) === key) || list.find(c => key.includes(fold(c.name)) || fold(c.name).includes(key)) || null;
    }

    function getStudyPlan() {
        const appeals = ((typeof uniData !== 'undefined' && uniData.appeals) || [])
            .filter(a => a && a.date && a.date >= todayStr && daysBetween(todayStr, a.date) <= STUDY_HORIZON_DAYS)
            .sort((a, b) => a.date.localeCompare(b.date));
        const seen = new Set();
        const plan = [];
        appeals.forEach(a => {
            const name = String(a.examName || '').trim();
            if (!name || seen.has(fold(name))) return; // only the nearest appeal per exam
            seen.add(fold(name));
            const course = findCourse(name);
            const cfu = (course && course.cfu) || 6;
            const targetMin = cfu * STUDY_HOURS_PER_CFU * 60;
            const studiedMin = studiedMinutesFor(name);
            const todayMin = studiedMinutesFor(name, null, todayStr);
            const daysLeft = Math.max(0, daysBetween(todayStr, a.date));
            const remainingMin = Math.max(0, targetMin - studiedMin);
            const perDayMin = daysLeft > 0 ? Math.ceil(remainingMin / daysLeft / 15) * 15 : remainingMin;
            plan.push({
                name, date: a.date, time: a.time, daysLeft, cfu,
                color: (course && course.color) || '#b08d43',
                targetMin, studiedMin, todayMin, remainingMin, perDayMin,
                todayLeftMin: Math.max(0, perDayMin - todayMin)
            });
        });
        return plan;
    }

    // Starts a focus session titled with the course name, so it counts as study for that exam
    function startStudyFocus(courseName, minutes = 50, color = '#b08d43') {
        if (typeof focusPlaylist === 'undefined' || typeof startCurrentPlaylistPhase !== 'function') return false;
        focusPlaylist = [
            { type: 'task', id: null, category: 'Study', title: courseName, duration: minutes, color, isPartial: false },
            { type: 'break', duration: 10 }
        ];
        currentPlaylistIndex = 0;
        if (typeof isFullscreenFocusOpen !== 'undefined') isFullscreenFocusOpen = false;
        startCurrentPlaylistPhase();
        if (typeof showToast === 'function') showToast(`[STUDY] ${minutes}m on ${courseName}`);
        if (typeof renderTodayModule === 'function') renderTodayModule();
        return true;
    }

    // ------------------------------------------------------------------
    // Bills → Today
    // ------------------------------------------------------------------
    function nextDueDate(rec) {
        const day = parseInt(rec.dayOfMonth, 10);
        if (!day) return null;
        const t = parse(todayStr);
        for (let k = 0; k < 2; k++) {
            const y = t.getFullYear(), m = t.getMonth() + k;
            const last = new Date(y, m + 1, 0).getDate();
            const cand = fmt(new Date(y, m, Math.min(day, last)));
            const paid = rec.lastProcessed && rec.lastProcessed >= cand;
            if (cand >= todayStr && !paid) return cand;
        }
        return null;
    }

    function getUpcomingBills(daysAhead = BILLS_AHEAD_DAYS) {
        const limit = addDays(todayStr, daysAhead);
        return ((typeof mRecurring !== 'undefined' && mRecurring) || [])
            .filter(r => r && (!r.endDate || r.endDate >= todayStr) && (!r.startDate || r.startDate <= limit))
            .map(r => ({ title: r.title, amount: Number(r.amount || 0), due: nextDueDate(r) }))
            .filter(b => b.due && b.due <= limit)
            .sort((a, b) => a.due.localeCompare(b.due));
    }

    // ------------------------------------------------------------------
    // Gym → Today
    // ------------------------------------------------------------------
    function getTodayGym() {
        if (typeof isGymTrainingScheduledOnDate !== 'function' || !isGymTrainingScheduledOnDate(todayStr)) return null;
        const day = typeof nextWorkoutDay !== 'undefined' ? nextWorkoutDay : 1;
        const info = typeof getSplitDayMusclesInfo === 'function' ? getSplitDayMusclesInfo(day) : { acronym: `S${day}`, fullLabel: `Split ${day}` };
        const exercises = (typeof gymPlan !== 'undefined' && Array.isArray(gymPlan[day])) ? gymPlan[day].length : 0;
        const gymTask = (typeof templates !== 'undefined' ? templates : []).find(t => typeof isGymRoutineTask === 'function' && isGymRoutineTask(t));
        const done = !!(gymTask && logs[todayStr] && logs[todayStr][gymTask.id] && logs[todayStr][gymTask.id].some(Boolean));
        return { day, label: info.fullLabel || info.acronym, acronym: info.acronym, exercises, done };
    }

    // ------------------------------------------------------------------
    // Weekly priorities (stored in dailyPriorities, which is already synced)
    // ------------------------------------------------------------------
    function mondayOf(dateStr) {
        const d = parse(dateStr);
        const offset = (d.getDay() + 6) % 7; // Monday = 0
        d.setDate(d.getDate() - offset);
        return fmt(d);
    }
    const weekKey = (monday) => `week:${monday}`;

    function getWeekPlan(monday = mondayOf(todayStr)) {
        const v = (typeof dailyPriorities !== 'undefined' && dailyPriorities[weekKey(monday)]) || null;
        return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
    }
    function saveWeekPlan(monday, plan) {
        if (typeof dailyPriorities === 'undefined') return;
        dailyPriorities[weekKey(monday)] = plan;
        if (typeof saveData === 'function') saveData();
    }
    function toggleWeekPriority(monday, idx) {
        const plan = getWeekPlan(monday);
        if (!plan || !Array.isArray(plan.items) || !plan.items[idx]) return;
        plan.items[idx].done = !plan.items[idx].done;
        saveWeekPlan(monday, plan);
    }

    // Has the review for the week ending this Sunday been done?
    function isReviewDue() {
        const now = typeof getNow === 'function' ? getNow() : new Date();
        if (now.getDay() !== 0 || now.getHours() < 18) return false;
        const nextMonday = addDays(mondayOf(todayStr), 7);
        const plan = getWeekPlan(nextMonday);
        return !(plan && plan.reviewedAt);
    }

    window.CortexLinks = {
        getStudyPlan, startStudyFocus, studiedMinutesFor,
        getUpcomingBills, getTodayGym,
        mondayOf, addDays, daysBetween, getWeekPlan, saveWeekPlan, toggleWeekPriority, isReviewDue,
        STUDY_HOURS_PER_CFU
    };
})();
