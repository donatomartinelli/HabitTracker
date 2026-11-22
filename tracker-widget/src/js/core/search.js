// --- js/core/search.js ---
// UNIVERSAL SEARCH across your data, used by the command palette.
// Looks in: tasks & to-dos, notes, events, transactions, wishlist, routines, university exams.
// Each result knows how to take you there (open the right section, date or note).

(function () {
    'use strict';

    const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

    function score(haystack, q) {
        const h = fold(haystack);
        if (!h || !q) return 0;
        if (h === q) return 100;
        if (h.startsWith(q)) return 80;
        const idx = h.indexOf(' ' + q);
        if (idx !== -1) return 65;
        if (q.length < 3) return 0; // very short queries: only word starts, no "ou" → "Routine"
        if (h.includes(q)) return 45;
        // every word of the query appears somewhere
        const words = q.split(/\s+/).filter(Boolean);
        if (words.length > 1 && words.every(w => h.includes(w))) return 35;
        return 0;
    }

    function snippet(text, q, max = 70) {
        const t = String(text || '').replace(/\s+/g, ' ').trim();
        const i = fold(t).indexOf(q);
        if (i < 0 || t.length <= max) return t.slice(0, max) + (t.length > max ? '…' : '');
        const start = Math.max(0, i - 20);
        return (start > 0 ? '…' : '') + t.slice(start, start + max) + (start + max < t.length ? '…' : '');
    }

    const go = (sec, tab) => () => { if (typeof navigateToSection === 'function') navigateToSection(sec, tab); };
    const goDate = (sec, tab, date) => () => {
        if (date && typeof jumpToDate === 'function') jumpToDate(date);
        if (typeof navigateToSection === 'function') navigateToSection(sec, tab);
    };

    function searchAll(query, limit = 8) {
        const q = fold(query).trim();
        if (q.length < 2) return [];
        const results = [];
        const push = (s, r) => { if (s > 0) results.push(Object.assign({ score: s }, r)); };

        // Tasks & to-dos
        (typeof templates !== 'undefined' ? templates : []).forEach(t => {
            if (!t || !t.title) return;
            const s = Math.max(score(t.title, q), score(t.category, q) * 0.6);
            const when = t.startDate && t.startDate === t.endDate ? t.startDate : '';
            push(s, {
                kind: t.isTodo ? 'To-do' : 'Task',
                title: t.title,
                sub: [t.category, when].filter(Boolean).join(' · '),
                run: when ? goDate('today', 'tasks', when) : go('today', 'tasks')
            });
        });

        // Notes: one result per matching line, best few per category
        const notes = (typeof notesContent !== 'undefined' ? notesContent : {});
        Object.keys(notes).forEach(cat => {
            const text = notes[cat];
            if (typeof text !== 'string' || !text) return;
            const catScore = score(cat.split('/').pop(), q);
            if (catScore) {
                push(catScore + 5, { kind: 'Notes', title: cat, sub: 'Category', run: () => openNoteCategory(cat, '') });
            }
            let hits = 0;
            text.split('\n').forEach(line => {
                if (hits >= 2 || !line.trim()) return;
                const s = score(line, q);
                if (s) {
                    hits++;
                    push(s * 0.9, { kind: 'Note', title: snippet(line, q), sub: cat, run: () => openNoteCategory(cat, query) });
                }
            });
        });

        // Events
        (typeof specificEvents !== 'undefined' ? specificEvents : []).forEach(e => {
            if (!e || !e.title) return;
            push(score(e.title, q), {
                kind: 'Event',
                title: e.title,
                sub: [e.date, e.start && e.end ? `${e.start}–${e.end}` : ''].filter(Boolean).join(' · '),
                run: goDate('plan', 'calendar', e.date)
            });
        });

        // Transactions (newest first wins ties)
        (typeof mTransactions !== 'undefined' ? mTransactions : []).slice(-400).forEach(tx => {
            if (!tx) return;
            const s = Math.max(score(tx.desc, q), score(tx.category, q) * 0.7);
            const sign = tx.type === 'in' ? '+' : '−';
            push(s, {
                kind: tx.type === 'in' ? 'Income' : 'Expense',
                title: `${sign}€${Number(tx.amount || 0).toFixed(2)} · ${tx.desc || tx.category || ''}`,
                sub: [tx.category, tx.date].filter(Boolean).join(' · '),
                date: tx.date || '',
                run: () => {
                    if (typeof navState !== 'undefined') navState.lastSub = Object.assign(navState.lastSub || {}, { money: 'm_tx' });
                    go('money', 'money')();
                }
            });
        });

        // Wishlist
        (typeof mWishlist !== 'undefined' ? mWishlist : []).forEach(w => {
            if (!w || !w.title) return;
            push(score(w.title, q) * 0.9, {
                kind: 'Wishlist', title: w.title, sub: w.cost ? `€${w.cost}` : 'Incubator',
                run: () => {
                    if (typeof navState !== 'undefined') navState.lastSub = Object.assign(navState.lastSub || {}, { money: 'm_incubator' });
                    go('money', 'money')();
                }
            });
        });

        // Routines (title or any step)
        (typeof routinesData !== 'undefined' ? routinesData : []).forEach(r => {
            if (!r) return;
            let s = score(r.title, q);
            let sub = 'Routine';
            (r.sections || []).forEach(sec => (sec.items || []).forEach(it => {
                const si = score(it.title, q) * 0.85;
                if (si > s) { s = si; sub = `${r.title} › ${it.title}`; }
            }));
            push(s, { kind: 'Routine', title: r.title, sub, run: go('today', 'today') });
        });

        // University
        const uni = (typeof uniData !== 'undefined' ? uniData : {});
        [...(uni.remainingExams || []), ...(uni.passedExams || [])].forEach(ex => {
            const name = ex && (ex.name || ex.title);
            if (!name) return;
            const passed = (uni.passedExams || []).includes(ex);
            push(score(name, q), {
                kind: 'Exam', title: name,
                sub: passed ? `Passed${ex.grade ? ' · ' + ex.grade : ''}` : `${ex.cfu ? ex.cfu + ' CFU' : 'To do'}`,
                run: go('study', 'uni')
            });
        });

        // Results that would lead to a switched-off module are hidden
        const kindModule = { Note: 'notes', Notes: 'notes', Event: 'calendar', Income: 'money', Expense: 'money', Wishlist: 'money', Exam: 'uni' };
        for (let i = results.length - 1; i >= 0; i--) {
            const m = kindModule[results[i].kind];
            if (m && typeof isModuleEnabled === 'function' && !isModuleEnabled(m)) results.splice(i, 1);
        }
        results.sort((a, b) => b.score - a.score || String(b.date || '').localeCompare(String(a.date || '')));
        return results.slice(0, limit);
    }

    // Opens the notes section on a category, optionally pre-filtered
    function openNoteCategory(cat, filter) {
        if (typeof activeNoteCategory !== 'undefined') activeNoteCategory = cat;
        if (typeof currentBrowseFilterQuery !== 'undefined') currentBrowseFilterQuery = filter || '';
        if (typeof navigateToSection === 'function') navigateToSection('notes');
        if (typeof renderNoteCategories === 'function') renderNoteCategories();
    }

    window.cortexSearch = searchAll;
    window.openNoteCategory = openNoteCategory;
})();
