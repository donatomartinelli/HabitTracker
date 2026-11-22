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
        if (!m) m = findFree(ctx, /\b(\d{1,2})h\b/);
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
        for (const v of VERBS) if (v.words.includes(first)) return { verb: v.verb, len: first.length };
        return null;
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
            if (v === 'done') return body ? [{ kind: 'done', label: `Mark done · ${body}`, cmd: `done ${body}` }] : [];
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
        const date = extractDate(ctx, today);
        const time = extractTime(ctx);
        const dur = extractDuration(ctx);
        const title = rest(ctx);
        const forced = verbHit ? verbHit.verb : null;

        if (!title) return out;

        if (time || forced === 'event') {
            const d = date || today;
            if (time) {
                const end = time.end !== null ? time.end : Math.min(23 * 60 + 59, time.start + (dur || 60));
                out.push({
                    kind: 'event',
                    label: `Event · ${prettyDate(d, today)} · ${fmtMins(time.start)}–${fmtMins(end)} · ${title}`,
                    cmd: `event @${d} ${fmtMins(time.start)}-${fmtMins(end)} ${title}`
                });
            } else {
                out.push({ kind: 'event', label: `Event · ${prettyDate(d, today)} · ${title}`, cmd: `event @${d} ${title}` });
            }
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

    const api = { interpret, _internals: { extractDate, extractTime, makeCtx, rest } };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.CortexNL = api;
})(typeof window !== 'undefined' ? window : globalThis);
