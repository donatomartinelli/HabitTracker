// --- js/core/nl-parser.js ---
// OFFLINE NATURAL-LANGUAGE → COMMAND TRANSLATOR (Italian + English)
//
// Turns sentences like
//   "dentista domani alle 15 per un'ora"   → event @2026-11-23 15:00-16:00 dentista
//   "12€ pranzo"                            → out 12 pranzo
//   "spent 4.50 on coffee #food"            → out 4.50 #food coffee
//   "call mum friday"                        → todo @2026-11-27 call mum
//   "peso 72.4"                              → weight 72.4
// into the existing command language (js/core/dsl.js). No network, no AI.
//
// Pure functions: testable with node (tests/nl-parser.test.js).
// API: CortexNL.interpret(text, { today: 'YYYY-MM-DD', noteCategories: [] })
//   → [{ kind, label, cmd }]  (best guess first, then alternatives) or [] if not understood.

(function (root) {
    'use strict';

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------
    const pad = (n) => String(n).padStart(2, '0');
    const fmtDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const parseDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
    const addDays = (s, n) => { const d = parseDate(s); d.setDate(d.getDate() + n); return fmtDate(d); };
    const fmtMins = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
    const strip = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
    const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const MON_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const prettyDate = (s, today) => {
        if (s === today) return 'today';
        if (s === addDays(today, 1)) return 'tomorrow';
        const d = parseDate(s);
        return `${DAY_SHORT[d.getDay()]} ${d.getDate()} ${MON_SHORT[d.getMonth()]}`;
    };

    const WEEKDAYS = [
        ['domenica', 'dom', 'sunday', 'sun'],
        ['lunedi', 'lun', 'monday', 'mon'],
        ['martedi', 'mar', 'tuesday', 'tue', 'tues'],
        ['mercoledi', 'mer', 'wednesday', 'wed'],
        ['giovedi', 'gio', 'thursday', 'thu', 'thur', 'thurs'],
        ['venerdi', 'ven', 'friday', 'fri'],
        ['sabato', 'sab', 'saturday', 'sat']
    ];
    const MONTHS = [
        ['gennaio', 'gen', 'january', 'jan'], ['febbraio', 'feb', 'february'], ['marzo', 'march'],
        ['aprile', 'apr', 'april'], ['maggio', 'mag', 'may'], ['giugno', 'giu', 'june', 'jun'],
        ['luglio', 'lug', 'july', 'jul'], ['agosto', 'ago', 'august', 'aug'], ['settembre', 'set', 'sett', 'september', 'sep', 'sept'],
        ['ottobre', 'ott', 'october', 'oct'], ['novembre', 'nov', 'november'], ['dicembre', 'dic', 'december', 'dec']
    ];
    const WEEKDAY_RE = WEEKDAYS.flat().sort((a, b) => b.length - a.length).join('|');
    const MONTH_RE = MONTHS.flat().sort((a, b) => b.length - a.length).join('|');
    const monthIndex = (w) => MONTHS.findIndex(list => list.includes(w));
    const weekdayIndex = (w) => WEEKDAYS.findIndex(list => list.includes(w));

    // Connector words removed around the parts we understood
    const FILLERS = new Set(['alle', 'alla', 'ore', 'at', 'il', 'lo', 'la', 'on', 'per', 'for', 'a', 'di', 'del', 'da', 'dalle', 'dalla', 'from', 'to', 'until', 'fino',
        'entro', 'by', 'the', 'e', 'and', 'in', 'tra', 'fra', 'su', 'of', 'un', 'una', 'uno', 'an', 'con']);

    // ------------------------------------------------------------------
    // Extraction: each extractor finds a span in the (accent-stripped, lowercase)
    // text and blanks it out so the rest becomes the title.
    // ------------------------------------------------------------------

    function makeCtx(text) {
        const norm = strip(text.toLowerCase());
        return { orig: text, norm, mask: Array(text.length).fill(false) };
    }
    function take(ctx, start, len) { for (let i = start; i < start + len && i < ctx.mask.length; i++) ctx.mask[i] = true; }
    function findFree(ctx, re) {
        re.lastIndex = 0;
        let m;
        const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
        while ((m = g.exec(ctx.norm)) !== null) {
            const s = m.index, e = s + m[0].length;
            let free = true;
            for (let i = s; i < e; i++) if (ctx.mask[i]) { free = false; break; }
            if (free && m[0].length) return m;
            if (!m[0].length) g.lastIndex++;
        }
        return null;
    }
    function rest(ctx) {
        let out = '';
        for (let i = 0; i < ctx.orig.length; i++) out += ctx.mask[i] ? ' ' : ctx.orig[i];
        const words = out.split(/\s+/).filter(Boolean);
        // drop connector words at the edges and dangling punctuation
        const isFiller = (w) => FILLERS.has(strip(w.toLowerCase()).replace(/[^a-z']/g, '')) || /^[,.;:–\-—]+$/.test(w);
        while (words.length && isFiller(words[0])) words.shift();
        while (words.length && isFiller(words[words.length - 1])) words.pop();
        return words.join(' ').replace(/\s+([,.;:])/g, '$1').trim();
    }

    function extractHashtag(ctx) {
        const m = findFree(ctx, /(^|\s)#([a-z0-9_]+)/);
        if (!m) return null;
        const start = m.index + m[1].length;
        take(ctx, start, m[0].length - m[1].length);
        return ctx.orig.substr(start + 1, m[2].length);
    }

    function extractAmount(ctx, allowBare) {
        // €12 · 12€ · 12 € · 12 euro · 12,50 eur
        let m = findFree(ctx, /(^|\s)(€\s?(\d+(?:[.,]\d{1,2})?)|(\d+(?:[.,]\d{1,2})?)\s?(€|euro|eur)(?=\s|$|[.,;!]))/);
        if (m) {
            take(ctx, m.index + m[1].length, m[0].length - m[1].length);
            return parseFloat((m[3] || m[4]).replace(',', '.'));
        }
        if (allowBare) {
            m = findFree(ctx, /(^|\s)(\d+(?:[.,]\d{1,2})?)(?=\s|$)/);
            if (m) {
                take(ctx, m.index + m[1].length, m[2].length);
                return parseFloat(m[2].replace(',', '.'));
            }
        }
        return null;
    }

    function extractDate(ctx, today) {
        let m;
        // tra/fra N giorni · in N days
        m = findFree(ctx, /\b(?:tra|fra|in)\s+(\d{1,2}|un|una|one|two|due|tre|three)\s+(giorni|giorno|days?|settimane|settimana|weeks?)\b/);
        if (m) {
            const words = { un: 1, una: 1, one: 1, due: 2, two: 2, tre: 3, three: 3 };
            const n = words[m[1]] || parseInt(m[1], 10);
            const mult = /^(sett|week)/.test(m[2]) ? 7 : 1;
            take(ctx, m.index, m[0].length);
            return addDays(today, n * mult);
        }
        // prossima settimana · next week
        m = findFree(ctx, /\b(?:la\s+)?(?:prossima\s+settimana|settimana\s+prossima|next\s+week)\b/);
        if (m) { take(ctx, m.index, m[0].length); return addDays(today, 7); }
        // dopodomani · day after tomorrow
        m = findFree(ctx, /\b(dopodomani|day after tomorrow)\b/);
        if (m) { take(ctx, m.index, m[0].length); return addDays(today, 2); }
        // oggi/stasera/stamattina · today/tonight
        m = findFree(ctx, /\b(oggi|stasera|stamattina|stanotte|oggi pomeriggio|today|tonight|this (?:morning|afternoon|evening))\b/);
        if (m) { take(ctx, m.index, m[0].length); return today; }
        // domani (mattina|pomeriggio|sera) · tomorrow
        m = findFree(ctx, /\b(domani|tomorrow|tmw)\b/);
        if (m) { take(ctx, m.index, m[0].length); return addDays(today, 1); }
        // ieri · yesterday
        m = findFree(ctx, /\b(ieri|yesterday)\b/);
        if (m) { take(ctx, m.index, m[0].length); return addDays(today, -1); }
        // ISO 2026-11-23
        m = findFree(ctx, /\b(\d{4})-(\d{2})-(\d{2})\b/);
        if (m) { take(ctx, m.index, m[0].length); return `${m[1]}-${m[2]}-${m[3]}`; }
        // 23/11(/2026) · 23-11 · 23.11
        m = findFree(ctx, /\b(\d{1,2})[\/.](\d{1,2})(?:[\/.](\d{2,4}))?\b/);
        if (m && +m[2] >= 1 && +m[2] <= 12 && +m[1] >= 1 && +m[1] <= 31) {
            take(ctx, m.index, m[0].length);
            return resolveDayMonth(today, +m[1], +m[2] - 1, m[3]);
        }
        // 23 novembre · 23 nov
        m = findFree(ctx, new RegExp(`\\b(\\d{1,2})\\s+(${MONTH_RE})\\b(?:\\s+(\\d{4}))?`));
        if (m) { take(ctx, m.index, m[0].length); return resolveDayMonth(today, +m[1], monthIndex(m[2]), m[3]); }
        // november 23 · nov 23rd
        m = findFree(ctx, new RegExp(`\\b(${MONTH_RE})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`));
        if (m) { take(ctx, m.index, m[0].length); return resolveDayMonth(today, +m[2], monthIndex(m[1]), null); }
        // (next) monday · lunedì (prossimo)
        m = findFree(ctx, new RegExp(`\\b(next\\s+|questo\\s+|this\\s+)?(${WEEKDAY_RE})\\b(\\s+prossimo|\\s+prossima)?`));
        if (m) {
            const target = weekdayIndex(m[2]);
            const cur = parseDate(today).getDay();
            let diff = (target - cur + 7) % 7;
            if (diff === 0 && (m[1] && /next/.test(m[1]) || m[3])) diff = 7;
            if (m[1] && /next/.test(m[1]) && diff < 7 && diff !== 0) diff += 0; // "next friday" = the coming friday
            take(ctx, m.index, m[0].length);
            return addDays(today, diff);
        }
        return null;
    }

    function resolveDayMonth(today, day, monthIdx, yearStr) {
        const t = parseDate(today);
        let year = yearStr ? parseInt(yearStr.length === 2 ? '20' + yearStr : yearStr, 10) : t.getFullYear();
        let d = new Date(year, monthIdx, day);
        if (!yearStr && fmtDate(d) < today && (t - d) > 1000 * 60 * 60 * 24 * 60) d = new Date(year + 1, monthIdx, day);
        return fmtDate(d);
    }

    function toMinutes(h, m, ampm) {
        let hh = parseInt(h, 10);
        const mm = m ? parseInt(m, 10) : 0;
        if (ampm) {
            const pm = /p/.test(ampm);
            if (pm && hh < 12) hh += 12;
            if (!pm && hh === 12) hh = 0;
        }
        if (hh > 23 || mm > 59) return null;
        return hh * 60 + mm;
    }

    function extractTime(ctx) {
        let m;
        // ranges: dalle 15 alle 17 · from 3 to 5pm · 15-17 · 15:00-16:30 · 3-5pm
        m = findFree(ctx, /\b(?:dalle|dalla|from)?\s*(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?\s*(?:-|–|alle|a|to|until|fino alle)\s*(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?\b/);
        if (m && (m[2] || m[5] || m[3] || m[6] || /dalle|dalla|from|alle|to|-|–/.test(m[0]))) {
            const endAmpm = m[6] || null;
            const s = toMinutes(m[1], m[2], m[3] || endAmpm);
            const e = toMinutes(m[4], m[5], endAmpm);
            if (s !== null && e !== null && e > s) {
                take(ctx, m.index, m[0].length);
                return { start: s, end: e };
            }
        }
        // single: alle 15(:30) · ore 15 · at 3pm · 3pm · 15:30 · 15h
        m = findFree(ctx, /\b(?:alle|ore|at|h)\s+(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?\b/);
        if (!m) m = findFree(ctx, /\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)\b/);
        if (!m) m = findFree(ctx, /\b(\d{1,2})[:](\d{2})\b/);
        // "15h" is an hour, "2h" is a length (handled by extractDuration)
        if (!m) { const h = findFree(ctx, /\b(\d{1,2})h\b/); if (h && +h[1] >= 13) m = h; }
        if (m) {
            const s = toMinutes(m[1], m[2], m[3]);
            if (s !== null) {
                take(ctx, m.index, m[0].length);
                return { start: s, end: null };
            }
        }
        // parts of the day without a number: "stasera" → 20:00 only if asked explicitly isn't reliable → skip
        return null;
    }

    function extractDuration(ctx) {
        let m = findFree(ctx, /\b(?:per|for)\s+(?:un'?|una|an|one|1)\s*(?:ora|hour)\b/);
        if (m) { take(ctx, m.index, m[0].length); return 60; }
        m = findFree(ctx, /\b(?:per|for)?\s*mezz'?\s*ora\b|\b(?:for\s+)?half an hour\b/);
        if (m) { take(ctx, m.index, m[0].length); return 30; }
        m = findFree(ctx, /\b(?:per|for)?\s*(\d+(?:[.,]\d+)?)\s*(ore|ora|hours?|h|hrs?)\s*(?:e\s*)?(\d{1,2})?\s*(?:m|min)?\b/);
        if (m && !/[:]/.test(m[0])) {
            const h = parseFloat(m[1].replace(',', '.'));
            const extra = m[3] ? parseInt(m[3], 10) : 0;
            take(ctx, m.index, m[0].length);
            return Math.round(h * 60) + extra;
        }
        m = findFree(ctx, /\b(?:per|for)?\s*(\d+)\s*(minuti|minuto|min|mins|minutes?|m)\b/);
        if (m) { take(ctx, m.index, m[0].length); return parseInt(m[1], 10); }
        return null;
    }

    // ------------------------------------------------------------------
    // Parts of the day: "stasera", "domani pomeriggio", "in the morning"
    // → a time window used to place things in a free slot.
    // ------------------------------------------------------------------
    const DAYPARTS = { morning: [8 * 60, 12 * 60], afternoon: [13 * 60, 19 * 60], evening: [19 * 60, 23 * 60] };
    const DAYPART_LABEL = { morning: 'morning', afternoon: 'afternoon', evening: 'evening' };

    function extractDayPart(ctx, today) {
        const pick = (re, part, date) => {
            const m = findFree(ctx, re);
            if (!m) return null;
            take(ctx, m.index, m[0].length);
            return { part, date };
        };
        return pick(/\b(stamattina|stamani|this morning)\b/, 'morning', today)
            || pick(/\b(oggi pomeriggio|this afternoon)\b/, 'afternoon', today)
            || pick(/\b(stasera|stanotte|tonight|this evening)\b/, 'evening', today)
            || pick(/\b(?:(?:in the|in|di|la|nel|nella)\s+)?(mattina|mattinata|morning)\b/, 'morning', null)
            || pick(/\b(?:(?:in the|in|di|il|nel)\s+)?(pomeriggio|afternoon)\b/, 'afternoon', null)
            || pick(/\b(?:(?:in the|in|di|la|nella)\s+)?(serata|sera|evening)\b|\bin serata\b/, 'evening', null);
    }

    // ------------------------------------------------------------------
    // Free-slot finder: first gap of `dur` minutes in [from, to),
    // avoiding the busy intervals [[start, end], ...] (minutes).
    // ------------------------------------------------------------------
    function findSlot(busy, dur, from, to) {
        const iv = (busy || []).filter(b => b && b[1] > b[0]).map(b => [b[0], b[1]]).sort((a, b) => a[0] - b[0]);
        let t = Math.ceil(from / 15) * 15;
        for (const [s, e] of iv) {
            if (e <= t) continue;
            if (s - t >= dur) break;
            t = Math.max(t, Math.ceil(e / 15) * 15);
        }
        return t + dur <= to ? t : null;
    }

    function slotOn(date, dur, part, today, opts) {
        const win = part ? DAYPARTS[part] : [opts.dayStart ?? 8 * 60, opts.dayEnd ?? 22 * 60];
        let from = win[0];
        if (date === today && typeof opts.now === 'number') from = Math.max(from, opts.now + 5);
        const busy = typeof opts.busyOn === 'function' ? (opts.busyOn(date) || []) : [];
        const s = findSlot(busy, dur, from, win[1]);
        return s === null ? null : { start: s, end: s + dur };
    }

    // ------------------------------------------------------------------
    // Recurrence: "ogni lunedì e giovedì", "every weekday", "tutti i giorni"
    // ------------------------------------------------------------------
    const DAY_CODE = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const EN_PLURAL = ['sundays', 'mondays', 'tuesdays', 'wednesdays', 'thursdays', 'fridays', 'saturdays'];

    function extractRecurrence(ctx) {
        const pick = (re) => { const m = findFree(ctx, re); if (m) take(ctx, m.index, m[0].length); return m; };
        if (pick(/\b(?:(?:ogni|tutti i|nei)\s+giorni?\s+(?:feriali?|lavorativi?)|giorni feriali|dal lunedi al venerdi|(?:every|on)\s+weekdays?|weekdays)\b/))
            return { spec: 'weekdays', days: [1, 2, 3, 4, 5], label: 'every weekday' };
        if (pick(/\b(?:(?:ogni|nei|tutti i)\s+(?:weekend|fine settimana)|(?:every|on)\s+weekends?|weekends)\b/))
            return { spec: 'weekends', days: [0, 6], label: 'every weekend' };
        if (pick(/\b(?:ogni giorno|tutti i giorni|ogni di|every day|everyday|each day|daily)\b/))
            return { spec: 'daily', days: [0, 1, 2, 3, 4, 5, 6], label: 'every day' };
        const DAYW = `(?:${WEEKDAY_RE})`;
        const SEP = `\\s*(?:,|\\be\\b|\\band\\b|&|\\/)\\s*(?:il\\s+|i\\s+)?`;
        let m = pick(new RegExp(`\\b(?:ogni|every|each|tutti\\s+i|tutte\\s+le)\\s+(${DAYW}s?(?:${SEP}${DAYW}s?)*)\\b`));
        if (!m) {
            const PL = EN_PLURAL.join('|');
            m = pick(new RegExp(`\\b(?:on\\s+)?((?:${PL})(?:${SEP}(?:${PL}))*)\\b`));
        }
        if (!m) return null;
        const days = [];
        m[1].split(/\s*(?:,|\be\b|\band\b|&|\/)\s*/).forEach(w => {
            w = w.replace(/^(il|i)\s+/, '').trim();
            let i = weekdayIndex(w);
            if (i < 0) i = weekdayIndex(w.replace(/s$/, ''));
            if (i >= 0 && !days.includes(i)) days.push(i);
        });
        if (!days.length) return null;
        days.sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)); // Monday first
        return { spec: days.map(i => DAY_CODE[i]).join(','), days, label: 'every ' + days.map(i => DAY_SHORT[i]).join(', ') };
    }

    // ------------------------------------------------------------------
    // Tolerant matching of existing items: "fatto anal" → "Studio analisi"
    // ------------------------------------------------------------------
    const simple = (s) => strip(String(s || '').toLowerCase()).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const ARTICLES = /^(il|lo|la|l|i|gli|le|un|una|uno|the|my|mio|mia|a|an)\s+/;

    function scoreTitle(query, title) {
        const a = simple(query).replace(ARTICLES, ''), b = simple(title);
        if (!a || !b) return 0;
        if (a === b) return 100;
        if (b.startsWith(a)) return 90;
        const qt = a.split(' '), bt = b.split(' ');
        if (qt.every(w => bt.some(x => x.startsWith(w)))) return 80;
        if (b.includes(a)) return 70;
        if (a.length >= 3) {
            let i = 0;
            for (const ch of b) if (ch === a[i]) i++;
            if (i === a.length) return 40;
        }
        return 0;
    }

    function findItem(query, items, filter) {
        let best = null, bestScore = 0;
        for (const it of items || []) {
            if (!it || (filter && !filter(it))) continue;
            let s = scoreTitle(query, it.title);
            if (!s) continue;
            if (it.done) s -= 5;
            if (s > bestScore) { bestScore = s; best = it; }
        }
        return bestScore >= 40 ? best : null;
    }

    // ------------------------------------------------------------------
    // Verbs (first word) — Italian + English aliases → DSL verb
    // ------------------------------------------------------------------
    const VERBS = [
        { verb: 'out', words: ['spesa', 'speso', 'spesi', 'pagato', 'pagata', 'comprato', 'out', 'expense', 'spent', 'paid', 'bought'] },
        { verb: 'in', words: ['entrata', 'incasso', 'incassato', 'ricevuto', 'ricevuti', 'stipendio', 'guadagnato', 'income', 'earned', 'received', 'salary'] },
        { verb: 'note', words: ['nota', 'appunto', 'annota', 'note', 'jot'] },
        { verb: 'weight', words: ['peso', 'pesato', 'weight', 'weigh', 'weighed'] },
        { verb: 'done', words: ['fatto', 'fatta', 'completato', 'completata', 'finito', 'done', 'finished', 'completed', 'check'] },
        { verb: 'focus', words: ['focus', 'concentrati', 'pomodoro', 'studia', 'study'] },
        // "riunione"/"meeting" are not verbs: they stay in the event title
        { verb: 'event', words: ['evento', 'appuntamento', 'event', 'appointment'] },
        { verb: 'todo', words: ['todo', 'to-do', 'ricordami', 'ricorda', 'remind', 'remember', 'task', 'compito'] },
        { verb: 'wish', words: ['wish', 'desidero', 'comprare', 'voglio'] }
    ];
    const SECTIONS = [
        { key: 'today', words: ['oggi', 'today', 'home'] },
        { key: 'plan', words: ['piano', 'plan', 'planner', 'agenda', 'calendario', 'calendar', 'settimana', 'week'] },
        { key: 'notes', words: ['note', 'notes', 'appunti'] },
        { key: 'study', words: ['studio', 'study', 'universita', 'uni', 'university', 'matematica', 'math', 'esami', 'exams'] },
        { key: 'money', words: ['soldi', 'money', 'conti', 'finanze', 'spese', 'budget', 'banca', 'bank'] },
        { key: 'health', words: ['salute', 'health', 'palestra', 'gym', 'dieta', 'diet', 'peso', 'streak'] },
        { key: 'tiles', words: ['tiles', 'tessere', 'dashboard'] }
    ];
    const NAV_WORDS = /^(vai\s+(?:a|al|alla|in|su)|apri|mostra|open|go\s+to|show|goto)\s+/;

    function matchVerb(norm) {
        const first = norm.split(/\s+/)[0].replace(/[:,]$/, '');
        // two-word verbs
        if (/^da\s+fare\b/.test(norm)) return { verb: 'todo', len: norm.match(/^da\s+fare/)[0].length };
        if (/^remind\s+me(\s+to)?\b/.test(norm)) return { verb: 'todo', len: norm.match(/^remind\s+me(\s+to)?/)[0].length };
        if (/^voglio\s+comprare\b/.test(norm)) return { verb: 'wish', len: norm.match(/^voglio\s+comprare/)[0].length };
        const did = norm.match(/^(?:ho\s+(?:fatto|finito|completato)|i\s+(?:did|finished|completed)|spunta|completa)\b/);
        if (did) return { verb: 'done', len: did[0].length };
        for (const v of VERBS) if (v.words.includes(first)) return { verb: v.verb, len: first.length };
        return null;
    }

    // ------------------------------------------------------------------
    // Actions on what already exists: undo, questions, move, postpone
    // ------------------------------------------------------------------
    const timeRange = (s, e) => `${fmtMins(s)}-${fmtMins(e)}`;
    const AGENDA_RE = /^(?:(?:che\s+)?cosa\s+(?:ho|c'?e|devo\s+fare|mi\s+resta(?:\s+da\s+fare)?|resta|manca)|che\s+(?:ho|c'?e)|what'?s\s+(?:on|left|planned|next|up)|what\s+(?:is\s+on|do\s+i\s+have|have\s+i\s+got)|agenda|impegni|my\s+day|schedule\s+for)\b/;
    const AGENDA_LEFTOVER = /^(?:in\s+programma|da\s+fare|di\s+bello|planned|left|to\s+do|on|next|up|for)?$/;
    const SPENT_RE = /^(?:quanto\s+(?:ho\s+)?spes[oi]|spese|how\s+much\s+(?:did\s+i\s+|have\s+i\s+)?spen[dt]|spending|spent)\b/;
    const MOVE_RE = /^(?:sposta|spostare|rimanda|rimandare|posticipa|anticipa|move|reschedule|postpone|push|defer)\s+/;
    const BULK_RE = /^(?:tutto|tutti|tutte|il\s+resto|il\s+non\s+fatto|quello\s+che\s+(?:non\s+ho\s+fatto|resta|manca)|cio\s+che\s+resta|everything|all|the\s+rest|undone|unfinished|what'?s\s+left)(?:\s+(?:il\s+)?(?:non\s+fatto|da\s+fare|quello\s+che\s+resta|undone|unfinished|left|di\s+oggi|today|from\s+today))*(?=\s|$)/;

    function interpretAction(raw, norm, today, opts) {
        const items = opts.items || [];

        // Undo
        if (/^(?:annulla|undo|disfa|ctrl\s*\+?\s*z)(?:\s+(?:l'?ultima\s+(?:cosa|azione|modifica)|last(?:\s+change)?))?$/.test(norm)) {
            return [{ kind: 'undo', label: 'Undo the last change', cmd: 'undo' }];
        }

        // "cosa ho giovedì?" · "what's on friday"
        const ag = norm.match(AGENDA_RE);
        if (ag) {
            const ctx = makeCtx(raw.slice(ag[0].length).replace(/[?!.]+\s*$/, ''));
            const part = extractDayPart(ctx, today);
            const d = extractDate(ctx, today) || (part && part.date) || today;
            if (AGENDA_LEFTOVER.test(simple(rest(ctx)))) {
                return [{ kind: 'agenda', label: `Show schedule · ${prettyDate(d, today)}`, cmd: d === today ? 'today' : `schedule @${d}` }];
            }
        }

        // "quanto ho speso questa settimana?" (a sentence with an amount is an expense instead)
        if (SPENT_RE.test(norm) && !/\d/.test(norm)) {
            let period = 'month', label = 'this month';
            if (/\b(oggi|today)\b/.test(norm)) { period = 'today'; label = 'today'; }
            else if (/\b(ieri|yesterday)\b/.test(norm)) { period = 'yesterday'; label = 'yesterday'; }
            else if (/\b(settimana|week)\b/.test(norm)) { period = 'week'; label = 'this week'; }
            else if (/\b(anno|year)\b/.test(norm)) { period = 'year'; label = 'this year'; }
            return [{ kind: 'spent', label: `Spending · ${label}`, cmd: `spent ${period}` }];
        }

        const mv = norm.match(MOVE_RE);
        if (!mv) return null;
        const after = raw.slice(mv[0].length);
        const afterNorm = strip(after.toLowerCase());

        // "rimanda tutto a domani" · "push everything unfinished to monday"
        const bulk = afterNorm.match(BULK_RE);
        if (bulk) {
            const ctx = makeCtx(after);
            take(ctx, 0, bulk[0].length);
            const d = extractDate(ctx, today) || addDays(today, 1);
            const left = items.filter(it => it.kind === 'todo' && it.date && it.date <= today && !it.done && it.date !== d).length;
            const what = opts.items ? `${left} unfinished to-do${left === 1 ? '' : 's'}` : 'unfinished to-dos';
            return [{ kind: 'postpone', label: `Move ${what} → ${prettyDate(d, today)}`, cmd: `postpone @${d}` }];
        }

        // "sposta dentista a giovedì alle 16"
        const ctx = makeCtx(after);
        const part = extractDayPart(ctx, today);
        const date = extractDate(ctx, today);
        const time = extractTime(ctx);
        const dur = extractDuration(ctx);
        const query = rest(ctx);
        if (!query || (!date && !time && !part)) return null;
        const item = findItem(query, items, it => it.kind === 'event' || it.kind === 'todo');
        if (!item) return [];
        const d = date || (part && part.date) || item.date || today;
        let span = '';
        if (item.kind === 'event') {
            const len = dur || (item.start != null && item.end != null ? item.end - item.start : 60);
            if (time) {
                let s = time.start;
                if (part && part.part !== 'morning' && s < 12 * 60 && s >= 60) s += 12 * 60;
                span = timeRange(s, time.end !== null && time.end > s ? time.end : Math.min(23 * 60 + 59, s + len));
            } else if (part) {
                const slot = slotOn(d, len, part.part, today, opts);
                if (slot) span = timeRange(slot.start, slot.end);
            }
        }
        const shown = span ? ` · ${span.replace('-', '–')}` : '';
        return [{ kind: 'move', label: `Move · ${item.title} → ${prettyDate(d, today)}${shown}`, cmd: `move ${item.id} @${d}${span ? ' ' + span : ''}` }];
    }

    // "chiama Marco domani poi palestra alle 18" · "12€ pranzo; peso 72"
    function interpretChain(raw, opts) {
        const bySemicolon = raw.includes(';');
        const parts = (bySemicolon ? raw.split(/\s*;\s*/) : raw.split(/\s+(?:e\s+poi|poi|and\s+then|then)\s+/i))
            .map(s => s.trim()).filter(Boolean);
        if (parts.length < 2) return null;
        const firstVerb = matchVerb(strip(raw.toLowerCase()));
        if (firstVerb && firstVerb.verb === 'note') return null;
        const today = opts.today || fmtDate(new Date());
        const sub = Object.assign({}, opts, { _noChain: true });
        // A later part without its own date happens on the same day as the previous one:
        // "chiama Marco domani poi palestra alle 18" → both tomorrow
        let lastDate = null;
        const picks = parts.map(p => {
            const c = makeCtx(p);
            const dp = extractDayPart(c, today);
            const own = extractDate(c, today) || (dp && dp.date);
            let pick = interpret(p, sub)[0] || null;
            if (own) lastDate = own;
            else if (lastDate && pick && (pick.kind === 'event' || pick.kind === 'todo')) pick = interpret(`${p} ${lastDate}`, sub)[0] || pick;
            return pick;
        });
        if (picks.some(p => !p || p.kind === 'nav' || p.kind === 'undo' || p.kind === 'multi')) return null;
        return {
            bySemicolon,
            kind: 'multi',
            label: `${picks.length} actions · ` + picks.map(p => p.label).join('  +  '),
            cmd: picks.map(p => p.cmd).join(' ;; ')
        };
    }

    // ------------------------------------------------------------------
    // Main
    // ------------------------------------------------------------------
    function interpret(text, opts = {}) {
        const raw = String(text || '').trim();
        if (!raw) return [];
        const today = opts.today || fmtDate(new Date());
        const noteCats = (opts.noteCategories || []).map(c => String(c));
        const out = [];
        const norm = strip(raw.toLowerCase());

        if (!opts._noChain) {
            const chain = interpretChain(raw, opts);
            if (chain) {
                const { bySemicolon, ...multi } = chain;
                // "x; y" is always a list; "x poi y" might also be one single thing, offered as alternatives
                return bySemicolon ? [multi] : [multi].concat(interpret(raw, Object.assign({}, opts, { _noChain: true })));
            }
        }

        const action = interpretAction(raw, norm, today, opts);
        if (action) return action;

        // Navigation: "vai a soldi" / "open money"
        const nav = norm.match(NAV_WORDS);
        if (nav) {
            const target = norm.slice(nav[0].length).trim();
            const sec = SECTIONS.find(s => s.words.includes(target));
            if (sec) return [{ kind: 'nav', label: `Go to ${sec.key === 'tiles' ? 'Tiles' : sec.key[0].toUpperCase() + sec.key.slice(1)}`, cmd: `@nav ${sec.key}` }];
        }

        const verbHit = matchVerb(norm);
        const body = verbHit ? raw.slice(verbHit.len).replace(/^[\s:,]+/, '') : raw;
        const ctx = makeCtx(body);

        // ---- explicit verbs ----
        if (verbHit) {
            const v = verbHit.verb;
            if (v === 'out' || v === 'in') {
                const tag = extractHashtag(ctx);
                const amt = extractAmount(ctx, true);
                extractDate(ctx, today); // dates on money are ignored (logged today)
                let desc = rest(ctx).replace(/^(per|for|on|di|in)\s+/i, '');
                // Noun-like verbs describe the money themselves: "stipendio 1200€" → "stipendio"
                const verbWord = raw.slice(0, verbHit.len).trim();
                if (!desc && /^(stipendio|salary|incasso|entrata|income|spesa|expense)$/i.test(verbWord)) desc = verbWord.toLowerCase();
                if (amt === null) return [];
                const amtStr = amt.toFixed(2).replace(/\.00$/, '');
                const cmd = v === 'out'
                    ? `out ${amtStr}${tag ? ' #' + tag : ''}${desc ? ' ' + desc : ''}`
                    : `in ${amtStr}${desc ? ' ' + desc : ''}`;
                out.push({ kind: v === 'out' ? 'expense' : 'income', label: `${v === 'out' ? 'Expense' : 'Income'} · €${amt.toFixed(2)}${tag ? ' · #' + tag : ''}${desc ? ' · ' + desc : ''}`, cmd });
                return out;
            }
            if (v === 'weight') {
                const m = body.match(/(\d{2,3}(?:[.,]\d{1,2})?)/);
                if (!m) return [];
                const kg = m[1].replace(',', '.');
                const note = body.replace(m[0], '').replace(/\bkg\b/i, '').trim();
                return [{ kind: 'weight', label: `Log weight · ${kg} kg${note ? ' · ' + note : ''}`, cmd: `weight ${kg}${note ? ' ' + note : ''}` }];
            }
            if (v === 'note') {
                const colon = body.indexOf(':');
                if (colon > 0 && colon < 35) {
                    const cat = body.slice(0, colon).trim();
                    const txt = body.slice(colon + 1).trim();
                    const known = noteCats.find(c => c.toLowerCase() === cat.toLowerCase());
                    return [{ kind: 'note', label: `Note in ${known || cat}${known ? '' : ' (new)'} · ${txt}`, cmd: `note ${known || cat}: ${txt}` }];
                }
                return body ? [{ kind: 'note', label: `Note · ${body}`, cmd: `note ${body}` }] : [];
            }
            if (v === 'done') {
                if (!body) return [];
                const it = findItem(body, opts.items, x => (x.kind === 'todo' || x.kind === 'task') && x.date === today && !x.done);
                if (it) return [{ kind: 'done', label: `Mark done · ${it.title}`, cmd: `done ${it.title}` }];
                return [{ kind: 'done', label: `Mark done · ${body}`, cmd: `done ${body}` }];
            }
            if (v === 'focus') return [{ kind: 'focus', label: body ? `Start focus · ${body}` : 'Start focus', cmd: `focus${body ? ' ' + body : ''}` }];
            if (v === 'wish') {
                const amt = extractAmount(ctx, true);
                const item = rest(ctx);
                return item ? [{ kind: 'wish', label: `Wishlist · ${item}${amt !== null ? ' · €' + amt : ''}`, cmd: `wish ${item}${amt !== null ? ' ' + amt : ''}` }] : [];
            }
            // event / todo fall through to the date/time logic below, with a forced kind
        }

        // ---- implicit: weight "72.4 kg" ----
        if (!verbHit) {
            const w = norm.match(/^(\d{2,3}(?:[.,]\d{1,2})?)\s*kg$/);
            if (w) return [{ kind: 'weight', label: `Log weight · ${w[1].replace(',', '.')} kg`, cmd: `weight ${w[1].replace(',', '.')}` }];
        }

        // ---- implicit: note "Category: text" with a known category ----
        if (!verbHit) {
            const colon = raw.indexOf(':');
            if (colon > 0 && colon < 35 && !/^\d/.test(raw)) {
                const cat = raw.slice(0, colon).trim();
                const known = noteCats.find(c => c.toLowerCase() === cat.toLowerCase());
                if (known) {
                    const txt = raw.slice(colon + 1).trim();
                    if (txt) out.push({ kind: 'note', label: `Note in ${known} · ${txt}`, cmd: `note ${known}: ${txt}` });
                }
            }
        }

        // ---- implicit money: "12€ pranzo" / "€4.50 caffè #food" ----
        if (!verbHit) {
            const mctx = makeCtx(raw);
            const tag = extractHashtag(mctx);
            const amt = extractAmount(mctx, false);
            if (amt !== null) {
                const desc = rest(mctx).replace(/^(per|for|on|di|in)\s+/i, '');
                const amtStr = amt.toFixed(2).replace(/\.00$/, '');
                const isIncome = /^\+/.test(raw) || /\b(stipendio|entrata|incasso|ricevut|salary|income|earned|refund|rimborso)\b/.test(norm);
                const expense = { kind: 'expense', label: `Expense · €${amt.toFixed(2)}${tag ? ' · #' + tag : ''}${desc ? ' · ' + desc : ''}`, cmd: `out ${amtStr}${tag ? ' #' + tag : ''}${desc ? ' ' + desc : ''}` };
                const income = { kind: 'income', label: `Income · €${amt.toFixed(2)}${desc ? ' · ' + desc : ''}`, cmd: `in ${amtStr}${desc ? ' ' + desc : ''}` };
                return isIncome ? [income, expense] : [expense, income];
            }
        }

        // ---- date / time → event or to-do ----
        const rec = extractRecurrence(ctx);
        const part = extractDayPart(ctx, today);
        const date = extractDate(ctx, today) || (part && part.date) || null;
        let time = extractTime(ctx);
        const dur = extractDuration(ctx);
        const title = rest(ctx);
        const forced = verbHit ? verbHit.verb : null;

        if (!title) return out;

        // "alle 3 di pomeriggio" → 15:00
        if (time && part && part.part !== 'morning' && time.start >= 60 && time.start < 12 * 60) {
            time = { start: time.start + 720, end: time.end !== null && time.end < 720 ? time.end + 720 : time.end };
        }

        // Repeating: "ogni lunedì alle 18 palestra"
        if (rec) {
            let span = '';
            if (time) span = timeRange(time.start, time.end !== null ? time.end : Math.min(23 * 60 + 59, time.start + (dur || 60)));
            out.push({
                kind: 'repeat',
                label: `Repeat · ${rec.label}${span ? ' · ' + span.replace('-', '–') : ''} · ${title}`,
                cmd: `every ${rec.spec}${span ? ' ' + span : ''} ${title}`
            });
            return out;
        }

        if (time) {
            const d = date || today;
            const end = time.end !== null ? time.end : Math.min(23 * 60 + 59, time.start + (dur || 60));
            out.push({
                kind: 'event',
                label: `Event · ${prettyDate(d, today)} · ${fmtMins(time.start)}–${fmtMins(end)} · ${title}`,
                cmd: `event @${d} ${fmtMins(time.start)}-${fmtMins(end)} ${title}`
            });
            out.push({ kind: 'todo', label: `To-do · ${prettyDate(d, today)} · ${title}`, cmd: `todo @${d} ${title}` });
            return out;
        }

        // A length or a part of the day but no hour: put it in the first free slot.
        // "studio analisi 2h domani" → event in the first free 2 hours tomorrow
        if ((dur || part) && forced !== 'todo') {
            const d = date || today;
            const slot = slotOn(d, dur || 60, part && part.part, today, opts);
            if (slot) {
                const where = part ? `free ${DAYPART_LABEL[part.part]} slot` : 'first free slot';
                const ev = {
                    kind: 'event',
                    label: `Event · ${prettyDate(d, today)} · ${fmtMins(slot.start)}–${fmtMins(slot.end)} (${where}) · ${title}`,
                    cmd: `event @${d} ${timeRange(slot.start, slot.end)} ${title}`
                };
                const td = { kind: 'todo', label: `To-do · ${prettyDate(d, today)} · ${title}`, cmd: `todo @${d} ${title}` };
                if (dur || forced === 'event') out.push(ev, td); else out.push(td, ev);
                return out;
            }
        }

        if (forced === 'event') {
            const d = date || today;
            out.push({ kind: 'event', label: `Event · ${prettyDate(d, today)} · ${title}`, cmd: `event @${d} ${title}` });
            out.push({ kind: 'todo', label: `To-do · ${prettyDate(d, today)} · ${title}`, cmd: `todo @${d} ${title}` });
            return out;
        }

        if (date || forced === 'todo') {
            const d = date || today;
            out.push({ kind: 'todo', label: `To-do · ${prettyDate(d, today)} · ${title}`, cmd: `todo @${d} ${title}` });
            if (date) out.push({ kind: 'event', label: `Event · ${prettyDate(d, today)} · ${title}`, cmd: `event @${d} ${title}` });
            return out;
        }

        return out;
    }

    const api = { interpret, findSlot, scoreTitle, _internals: { extractDate, extractTime, extractRecurrence, extractDayPart, makeCtx, rest } };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.CortexNL = api;
})(typeof window !== 'undefined' ? window : globalThis);
