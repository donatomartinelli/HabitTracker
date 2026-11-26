// --- js/modules/meals.js ---
// MEALS IN YOUR DAY
//
// The diet plan (dietData: one row per meal, one text per weekday, e.g. "Riso 160g\nTonno 90g")
// gets a time, so every meal shows on the day timeline with exactly what to eat.
// You log what you actually ate (as planned, or with real grams, or extra food)
// and Cortex counts the calories and macros you really had.
// Also: the food table (macros per 100 g) and the scale (body weight log + trend).
//
// Data:
//   dietData[i] = { id, type, time: 'HH:MM', dur: minutes, 0..6: 'planned text' }   (synced, saveHealthData)
//   dietLogs[date] = { meals: { [mealId]: { status: 'eaten'|'skipped', items: [{ name, g }] } },
//                      extra: [{ name, g }], times: { [mealId]: 'HH:MM' } }        (synced)
//   foodDb = [{ name, kcal, p, c, f, defaultG }]  per 100 g                         (synced)
//   bodyLogs = [{ id, date, weight, note }]                                         (synced)

(function () {
    'use strict';

    const esc = (s) => (typeof escapeHtml === 'function' ? escapeHtml(String(s ?? '')) : String(s ?? ''));
    const pad = (n) => String(n).padStart(2, '0');
    const toMin = (hhmm) => {
        if (!hhmm || typeof hhmm !== 'string' || !hhmm.includes(':')) return null;
        const [h, m] = hhmm.split(':').map(Number);
        return Number.isFinite(h) ? h * 60 + (m || 0) : null;
    };
    const fmt = (mins) => { const m = Math.max(0, Math.min(1439, Math.round(mins))); return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`; };
    const r0 = (n) => Math.round(n || 0);
    const num = (n) => r0(n).toLocaleString('en-US');

    // ------------------------------------------------------------------
    // Meal rows: id, usual time, duration
    // ------------------------------------------------------------------
    const DEFAULT_TIMES = [
        { re: /colazion|breakfast|morning meal/i, time: '07:30', dur: 20 },
        { re: /spuntino\s*1|snack\s*1|morning snack|mid-?morning/i, time: '10:30', dur: 15 },
        { re: /pranzo|lunch/i, time: '13:00', dur: 30 },
        { re: /spuntino\s*2|snack\s*2|merenda|afternoon snack/i, time: '16:30', dur: 15 },
        { re: /spuntino|snack/i, time: '16:30', dur: 15 },
        { re: /cena|dinner|supper/i, time: '20:00', dur: 30 }
    ];

    function ensureMealMeta() {
        if (typeof dietData === 'undefined' || !Array.isArray(dietData)) return;
        let changed = false;
        const used = new Set();
        dietData.forEach((row, idx) => {
            if (!row || typeof row !== 'object') return;
            if (!row.id || used.has(row.id)) {
                row.id = 'meal_' + String(row.type || idx).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') + '_' + idx;
                changed = true;
            }
            used.add(row.id);
            if (row.time === undefined) {
                const hit = DEFAULT_TIMES.find(d => d.re.test(row.type || ''));
                row.time = hit ? hit.time : '';
                row.dur = hit ? hit.dur : 20;
                changed = true;
            }
            if (!row.dur) { row.dur = 20; changed = true; }
        });
        if (changed && typeof saveHealthData === 'function') saveHealthData();
    }

    function mealRows() {
        ensureMealMeta();
        return (typeof dietData !== 'undefined' && Array.isArray(dietData)) ? dietData : [];
    }
    function mealById(id) { return mealRows().find(r => r.id === id) || null; }

    function dayLog(date, create = false) {
        if (typeof dietLogs === 'undefined') return null;
        let d = dietLogs[date];
        if (!d && create) d = dietLogs[date] = { meals: {}, extra: [], times: {} };
        if (d) {
            if (!d.meals || typeof d.meals !== 'object') d.meals = {};
            if (!Array.isArray(d.extra)) d.extra = [];
            if (!d.times || typeof d.times !== 'object') d.times = {};
        }
        return d || null;
    }

    function mealTime(row, date) {
        const d = dayLog(date);
        return (d && d.times[row.id]) || row.time || '';
    }
    function plannedText(row, date) {
        const dayIdx = parseLocalDate(date).getDay();
        return String(row[dayIdx] || '').trim();
    }
    // Breakfast is a meal like the others (the old "hide breakfast" switch is gone)
    function isBreakfastHidden() { return false; }

    // ------------------------------------------------------------------
    // Food parsing and macros
    // ------------------------------------------------------------------
    function findFood(text) {
        const lower = String(text || '').toLowerCase();
        const sorted = [...(typeof foodDb !== 'undefined' ? foodDb : [])].sort((a, b) => b.name.length - a.name.length);
        return sorted.find(f => f && f.name && lower.includes(f.name.toLowerCase())) || null;
    }
    function foodByName(name) {
        const n = String(name || '').toLowerCase().trim();
        return (typeof foodDb !== 'undefined' ? foodDb : []).find(f => f.name.toLowerCase() === n) || findFood(name);
    }

    // "Riso 160g" → { name:'Riso', g:160 } ; "2 Uova" → 2 × default portion ; "Banana" → default portion
    function parseLine(line) {
        const text = String(line || '').trim();
        if (!text || /^[-—–]$/.test(text)) return null;
        if (/pasto\s*libero|free meal/i.test(text)) return { label: 'Free meal', free: true };
        const food = findFood(text);
        let g = null;
        const gm = text.match(/(\d+(?:[.,]\d+)?)\s*g\b/i);
        if (gm) g = parseFloat(gm[1].replace(',', '.'));
        else if (food) {
            const cm = text.match(/(?:^|\s)(\d+(?:[.,]\d+)?)\s+(?!g\b)/i);
            g = cm ? parseFloat(cm[1].replace(',', '.')) * (food.defaultG || 60) : (food.defaultG || 100);
        }
        // Rules like "Olio 15g (Pranzo, Cena)" count twice
        if (/pranzo/i.test(text) && /cena/i.test(text) && g) g *= 2;
        const label = food ? food.name : text.replace(/^[A-ZÀ-Ü ]+:\s*/, '');
        return { label, name: food ? food.name : null, g, food };
    }
    function parseItems(text) {
        // "[ PASTO\nLIBERO ]" is written over two lines in some plans
        const norm = String(text || '').replace(/\[?\s*pasto\s+libero\s*\]?/ig, 'PASTO LIBERO');
        return norm.split(/[\n+|]/).map(parseLine).filter(Boolean);
    }
    function macrosOfItems(items) {
        const t = { kcal: 0, p: 0, c: 0, f: 0 };
        items.forEach(it => {
            const food = it.food || foodByName(it.name);
            if (!food || !it.g) return;
            const k = it.g / 100;
            t.kcal += (parseFloat(food.kcal) || 0) * k;
            t.p += (parseFloat(food.p) || 0) * k;
            t.c += (parseFloat(food.c) || 0) * k;
            t.f += (parseFloat(food.f) || 0) * k;
        });
        return t;
    }

    function plannedItemsOf(row, date) { return parseItems(plannedText(row, date)); }

    function mealStatus(row, date) {
        const d = dayLog(date);
        return d && d.meals[row.id] ? d.meals[row.id] : null;
    }

    // ------------------------------------------------------------------
    // Food by food: each planned food is eaten ✓, not eaten ✗ or not logged yet.
    // log = { status: 'eaten' | 'partial' | 'skipped', items: [{ name, g }] (eaten), skipped: [names] }
    // ------------------------------------------------------------------
    const lc = (x) => String(x || '').toLowerCase();
    function plannedFor(mealId, date) {
        if (mealId === '__rules') return parseItems(typeof dietRules === 'string' ? dietRules : '');
        const row = mealById(mealId);
        return row ? plannedItemsOf(row, date) : [];
    }
    function logFor(date, mealId) {
        const d = dayLog(date);
        return d && d.meals[mealId] ? d.meals[mealId] : null;
    }
    // 'eaten' | 'skipped' | null for one planned food
    function foodState(log, name) {
        if (!log) return null;
        const n = lc(name);
        if ((log.items || []).some(i => lc(i.name) === n)) return 'eaten';
        if ((log.skipped || []).some(x => lc(x) === n)) return 'skipped';
        if (log.status === 'skipped') return 'skipped';
        return null;
    }
    // Status of the whole meal from its foods
    function refreshStatus(date, mealId) {
        const d = dayLog(date);
        const log = d && d.meals[mealId];
        if (!log) return;
        if (!Array.isArray(log.items)) log.items = [];
        if (!Array.isArray(log.skipped)) log.skipped = [];
        const names = plannedFor(mealId, date).filter(x => x.name).map(x => lc(x.name));
        const eaten = new Set(log.items.map(i => lc(i.name)));
        const skipped = new Set(log.skipped.map(lc));
        if (!eaten.size && !skipped.size) { delete d.meals[mealId]; return; }
        const pending = names.filter(n => !eaten.has(n) && !skipped.has(n));
        if (!eaten.size) log.status = pending.length ? 'partial' : 'skipped';
        else log.status = (!skipped.size && !pending.length) ? 'eaten' : 'partial';
    }
    // Tap on a food: not logged → eaten → not eaten → eaten …
    function toggleFood(date, mealId, name) {
        const planned = plannedFor(mealId, date);
        const food = planned.find(x => x.name && lc(x.name) === lc(name));
        const label = food ? food.name : name;
        const d = dayLog(date, true);
        let log = d.meals[mealId];
        if (!log) log = d.meals[mealId] = { status: 'partial', items: [], skipped: [] };
        if (!Array.isArray(log.items)) log.items = [];
        if (!Array.isArray(log.skipped)) log.skipped = [];
        // An old "whole meal skipped" becomes food-by-food
        if (log.status === 'skipped' && !log.skipped.length) log.skipped = planned.filter(x => x.name).map(x => x.name);
        const state = foodState(log, name);
        log.items = log.items.filter(i => lc(i.name) !== lc(name));
        log.skipped = log.skipped.filter(x => lc(x) !== lc(name));
        if (state === 'eaten') log.skipped.push(label);
        else log.items.push({ name: label, g: r0(food && food.g ? food.g : 0) });
        refreshStatus(date, mealId);
        persist();
        rerender();
    }
    function skipMeal(date, mealId) {
        const d = dayLog(date, true);
        d.meals[mealId] = { status: 'skipped', items: [], skipped: plannedFor(mealId, date).filter(x => x.name).map(x => x.name) };
        persist();
        rerender();
    }
    // Chips for the planned foods of a meal, tappable
    function foodChipsHtml(mealId, date, planned, log) {
        return planned.map(i => {
            if (i.free) return '<span class="meal-food">Free meal</span>';
            if (!i.name) return `<span class="meal-food is-unknown">${esc(i.label)}</span>`;
            const stt = foodState(log, i.name);
            const ate = stt === 'eaten' ? (log.items || []).find(x => lc(x.name) === lc(i.name)) : null;
            const g = ate && ate.g ? ate.g : i.g;
            const mark = stt === 'eaten' ? '✓ ' : stt === 'skipped' ? '✗ ' : '';
            const tip = stt === 'eaten' ? 'Eaten: tap if you did not eat it' : stt === 'skipped' ? 'Not eaten: tap if you ate it' : 'Tap when you have eaten it';
            return `<button type="button" class="meal-food is-toggle ${stt ? 'is-' + stt : ''}" data-food="${esc(i.name)}" data-food-meal="${esc(mealId)}" title="${tip}" aria-pressed="${stt === 'eaten'}">${mark}${esc(i.name)}${g ? ` <b>${r0(g)}g</b>` : ''}</button>`;
        }).join('');
    }
    function bindFoodChips(root, date) {
        root.querySelectorAll('[data-food]').forEach(b => b.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleFood(date, b.dataset.foodMeal, b.dataset.food);
        }));
    }

    // Totals for a day: planned (plan + daily extras) and actually eaten
    function dayTotals(date) {
        const planned = { kcal: 0, p: 0, c: 0, f: 0 };
        const eaten = { kcal: 0, p: 0, c: 0, f: 0 };
        const add = (a, b) => { a.kcal += b.kcal; a.p += b.p; a.c += b.c; a.f += b.f; };
        let logged = 0;
        mealRows().forEach(row => {
            if (isBreakfastHidden(row)) return;
            add(planned, macrosOfItems(plannedItemsOf(row, date)));
            const st = mealStatus(row, date);
            if (st && st.status !== 'skipped') add(eaten, macrosOfItems(st.items || []));
            if (st) logged++;
        });
        const rulesItems = parseItems(typeof dietRules === 'string' ? dietRules : '');
        add(planned, macrosOfItems(rulesItems));
        const d = dayLog(date);
        const rules = d && d.meals.__rules;
        if (rules && rules.status !== 'skipped') add(eaten, macrosOfItems(rules.items || []));
        if (d && d.extra.length) add(eaten, macrosOfItems(d.extra));
        return { planned, eaten, logged };
    }

    // ------------------------------------------------------------------
    // Timeline blocks (Today, Day planner, study planner)
    // ------------------------------------------------------------------
    function getMealBlocks(date) {
        if (typeof isModuleEnabled === 'function' && !isModuleEnabled('diet')) return [];
        return mealRows().map(row => {
            if (isBreakfastHidden(row)) return null;
            const t = toMin(mealTime(row, date));
            const text = plannedText(row, date);
            if (t === null || !text || /^[-—–]$/.test(text)) return null;
            const items = parseItems(text);
            const kcal = macrosOfItems(items).kcal;
            const st = mealStatus(row, date);
            return {
                id: row.id,
                title: row.type,
                start: t,
                end: Math.min(24 * 60, t + (parseInt(row.dur, 10) || 20)),
                summary: items.map(i => i.free ? 'Free meal' : (i.g && i.name ? `${i.name} ${r0(i.g)}g` : i.label)).join(' · '),
                kcal,
                status: st ? st.status : null,
                eatenKcal: st && st.status !== 'skipped' ? macrosOfItems(st.items || []).kcal : 0,
                foods: items
            };
        }).filter(Boolean).sort((a, b) => a.start - b.start);
    }

    // Day planner: draw meals as their own blocks (drag = move only that day)
    function decorateDayCanvas(canvas, date, zoom, startHour) {
        if (!canvas) return;
        const px = (mins) => ((mins / 60) - startHour) * zoom;
        getMealBlocks(date).forEach(m => {
            const el = document.createElement('div');
            el.className = `meal-block ${m.status ? 'is-' + m.status : ''}`;
            el.style.top = `${px(m.start)}px`;
            el.style.height = `${Math.max(14, px(m.end) - px(m.start))}px`;
            el.title = `${fmt(m.start)} ${m.title}: ${m.summary}`;
            el.innerHTML = `<span class="meal-block-t"><b>${esc(fmt(m.start))} ${esc(m.title)}</b> <span class="meal-block-s">${esc(m.summary)}</span></span><span class="meal-block-k">${m.status === 'eaten' ? '✓ ' : m.status === 'partial' ? '◐ ' : ''}${num(m.kcal)} kcal</span>`;
            el.addEventListener('click', (e) => { e.stopPropagation(); openMealSheet(date, m.id); });
            canvas.appendChild(el);
        });
    }

    // ------------------------------------------------------------------
    // Logging
    // ------------------------------------------------------------------
    function rerender() {
        ['renderDiet', 'renderTodayModule', 'renderDayPlannerModule'].forEach(fn => {
            try { if (typeof window[fn] === 'function') window[fn](); } catch (e) { console.error('[meals]', fn, e); }
        });
    }
    function persist() {
        if (typeof saveHealthData === 'function') saveHealthData();
        if (typeof markLocalChangeForCloud === 'function') markLocalChangeForCloud();
    }

    function markEatenAsPlanned(date, mealId) {
        const planned = plannedFor(mealId, date).filter(i => i.name && i.g);
        const d = dayLog(date, true);
        const prev = d.meals[mealId] || { items: [], skipped: [] };
        // "Eaten" on a meal: everything not marked as not eaten
        const skipped = prev.status === 'skipped' ? [] : (prev.skipped || []);
        const items = [...(prev.items || [])];
        planned.forEach(x => {
            if (!items.some(i => lc(i.name) === lc(x.name)) && !skipped.some(y => lc(y) === lc(x.name))) items.push({ name: x.name, g: r0(x.g) });
        });
        d.meals[mealId] = { status: 'eaten', items, skipped };
        // a meal with no food from your table (a free meal, "pizza") still counts as eaten
        if (items.length || skipped.length) refreshStatus(date, mealId);
        persist();
        rerender();
    }
    function clearMeal(date, mealId) {
        const d = dayLog(date);
        if (d) { delete d.meals[mealId]; persist(); rerender(); }
    }

    // ------------------------------------------------------------------
    // Meal sheet: what to eat, what you ate
    // ------------------------------------------------------------------
    function openMealSheet(date, mealId) {
        closeSheet();
        const isRules = mealId === '__rules';
        const row = isRules ? null : mealById(mealId);
        if (!isRules && !row) return;
        const planned = isRules ? parseItems(typeof dietRules === 'string' ? dietRules : '') : plannedItemsOf(row, date);
        const st = isRules ? (dayLog(date) && dayLog(date).meals.__rules) : mealStatus(row, date);

        // Working list: planned foods (ticked unless marked as not eaten) + extra foods you logged
        const items = planned.filter(p => p.name).map(p => {
            const stt = foodState(st, p.name);
            const hit = stt === 'eaten' ? (st.items || []).find(i => lc(i.name) === lc(p.name)) : null;
            return { name: p.name, g: hit && hit.g ? hit.g : r0(p.g), planned: r0(p.g), on: stt !== 'skipped' };
        });
        (st && st.items ? st.items : []).forEach(i => {
            if (!planned.some(p => p.name && lc(p.name) === lc(i.name))) items.push({ name: i.name, g: i.g, planned: null, on: true });
        });
        // Water and similar notes are not foods: don't ask to add them to the table
        const unmatched = planned.filter(p => !p.name && !p.free && !/acqua|water|\d\s*l\b|litr/i.test(p.label));
        const isFree = planned.some(p => p.free);

        const dateLabel = parseLocalDate(date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
        const wrap = document.createElement('div');
        wrap.id = 'meal-sheet';
        wrap.className = 'study-overlay';
        wrap.innerHTML = `
            <div class="study-sheet meal-sheet" role="dialog" aria-modal="true" aria-labelledby="meal-title">
                <div class="study-sheet-head">
                    <div>
                        <div id="meal-title" class="study-sheet-title">${esc(isRules ? 'Daily extras' : row.type)}</div>
                        <div class="dim study-sheet-date">${esc(dateLabel)}</div>
                    </div>
                    <button type="button" class="hdr-icon" data-close aria-label="Close">×</button>
                </div>
                <div class="study-sheet-body">
                    ${isRules ? '' : `
                    <section class="study-field">
                        <div class="study-label">When</div>
                        <div class="study-time-row">
                            <label>Time <input type="time" class="form-control form-control-sm" data-time value="${esc(mealTime(row, date))}"></label>
                            <label>Lasts <input type="number" min="5" max="120" step="5" class="form-control form-control-sm no-spinners" data-dur value="${esc(row.dur || 20)}"> min</label>
                            <label class="meal-only-today"><input type="checkbox" data-only-today ${dayLog(date) && dayLog(date).times[row.id] ? 'checked' : ''}> only this day</label>
                        </div>
                    </section>`}
                    <section class="study-field">
                        <div class="study-label">${st ? 'What you ate' : 'What to eat'} <span class="dim">· untick what you did not eat, change the grams to what you really ate</span></div>
                        ${isFree ? '<div class="study-hint">Free meal in the plan: add what you ate below if you want it counted.</div>' : ''}
                        <div class="meal-items" data-items></div>
                        ${unmatched.length ? `<div class="dim study-hint">Not in your food table (no calories): ${unmatched.map(u => esc(u.label)).join(', ')}. Add them in Diet → Foods.</div>` : ''}
                        <div class="meal-add">
                            <input type="text" class="form-control form-control-sm" list="meal-food-list" placeholder="Add a food (from your table)" data-add-name>
                            <input type="number" class="form-control form-control-sm no-spinners" placeholder="g" min="1" data-add-g>
                            <button type="button" class="btn btn-sm" data-add>Add</button>
                            <datalist id="meal-food-list">${(typeof foodDb !== 'undefined' ? foodDb : []).map(f => `<option value="${esc(f.name)}">`).join('')}</datalist>
                        </div>
                    </section>
                    <section class="study-field">
                        <div class="meal-total" data-total></div>
                    </section>
                </div>
                <div class="study-sheet-foot">
                    <div class="meal-foot-left">
                        ${st ? '<button type="button" class="ghost-btn" data-clear>Clear log</button>' : ''}
                        ${!isRules ? '<button type="button" class="ghost-btn" data-skip>Not eaten</button>' : ''}
                    </div>
                    <div class="study-foot-right">
                        <button type="button" class="btn btn-sm" data-close>Cancel</button>
                        <button type="button" class="btn btn-primary btn-sm" data-save>${st ? 'Save' : 'Eaten'}</button>
                    </div>
                </div>
            </div>`;
        (document.getElementById('modals-root') || document.body).appendChild(wrap);
        const $ = (s) => wrap.querySelector(s);

        const renderItems = () => {
            $('[data-items]').innerHTML = items.map((it, i) => {
                const food = foodByName(it.name);
                const m = it.on && food ? macrosOfItems([{ name: it.name, g: it.g, food }]) : null;
                return `
                    <div class="meal-item ${it.on ? '' : 'is-off'}" data-i="${i}">
                        <label class="meal-item-on"><input type="checkbox" data-on ${it.on ? 'checked' : ''}></label>
                        <span class="meal-item-name">${esc(it.name)}${it.planned !== null && it.planned !== undefined && it.g !== it.planned ? `<span class="dim"> · plan ${r0(it.planned)}g</span>` : ''}${it.planned === null ? '<span class="dim"> · extra</span>' : ''}</span>
                        <span class="meal-item-g"><input type="number" min="0" step="5" class="form-control form-control-sm no-spinners" data-g value="${esc(r0(it.g))}">g</span>
                        <span class="meal-item-k">${m ? `${num(m.kcal)} kcal` : '<span class="dim">—</span>'}</span>
                        ${it.planned === null ? '<button type="button" class="icon-btn delete" data-del aria-label="Remove">×</button>' : '<span></span>'}
                    </div>`;
            }).join('') || '<div class="dim study-hint">Nothing planned for this meal.</div>';
            const tot = macrosOfItems(items.filter(i => i.on));
            const plan = macrosOfItems(planned.filter(p => p.name));
            $('[data-total]').innerHTML = `
                <div class="meal-total-k"><b>${num(tot.kcal)}</b> kcal <span class="dim">/ ${num(plan.kcal)} planned</span></div>
                <div class="meal-total-m dim">Protein ${r0(tot.p)} g · Carbs ${r0(tot.c)} g · Fat ${r0(tot.f)} g</div>`;
        };
        $('[data-items]').addEventListener('change', (e) => {
            const rowEl = e.target.closest('[data-i]');
            if (!rowEl) return;
            const it = items[parseInt(rowEl.dataset.i, 10)];
            if (e.target.matches('[data-on]')) it.on = e.target.checked;
            if (e.target.matches('[data-g]')) { it.g = Math.max(0, parseFloat(e.target.value) || 0); it.on = it.g > 0; }
            renderItems();
        });
        $('[data-items]').addEventListener('click', (e) => {
            const del = e.target.closest('[data-del]');
            if (!del) return;
            items.splice(parseInt(del.closest('[data-i]').dataset.i, 10), 1);
            renderItems();
        });
        const addFood = () => {
            const name = $('[data-add-name]').value.trim();
            if (!name) return;
            const food = foodByName(name);
            const g = parseFloat($('[data-add-g]').value) || (food ? food.defaultG || 100 : 100);
            items.push({ name: food ? food.name : name, g, planned: null, on: true });
            $('[data-add-name]').value = ''; $('[data-add-g]').value = '';
            renderItems();
            $('[data-add-name]').focus();
        };
        $('[data-add]').addEventListener('click', addFood);
        $('[data-add-g]').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addFood(); } });

        const saveTime = () => {
            if (isRules) return;
            const t = $('[data-time]').value;
            const dur = Math.max(5, parseInt($('[data-dur]').value, 10) || 20);
            const onlyToday = $('[data-only-today]').checked;
            row.dur = dur;
            const d = dayLog(date, onlyToday);
            if (onlyToday) { if (t) d.times[row.id] = t; }
            else {
                if (t) row.time = t;
                if (d) delete d.times[row.id];
            }
        };
        $('[data-save]').addEventListener('click', () => {
            saveTime();
            const d = dayLog(date, true);
            const mid = isRules ? '__rules' : row.id;
            d.meals[mid] = {
                status: 'eaten',
                items: items.filter(i => i.on && i.g > 0).map(i => ({ name: i.name, g: r0(i.g) })),
                skipped: items.filter(i => i.planned !== null && (!i.on || !(i.g > 0))).map(i => i.name)
            };
            refreshStatus(date, mid);
            persist();
            closeSheet();
            rerender();
        });
        $('[data-skip]')?.addEventListener('click', () => {
            saveTime();
            closeSheet();
            skipMeal(date, row.id);
        });
        $('[data-clear]')?.addEventListener('click', () => { saveTime(); clearMeal(date, isRules ? '__rules' : row.id); closeSheet(); });
        wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('[data-close]')) closeSheet(); });
        wrap.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });
        renderItems();
        $('[data-save]').focus();
    }
    function closeSheet() { document.getElementById('meal-sheet')?.remove(); }

    // ------------------------------------------------------------------
    // Weight
    // ------------------------------------------------------------------
    function weightSeries() {
        const byDate = {};
        (typeof bodyLogs !== 'undefined' ? bodyLogs : []).forEach(l => { if (l && l.date && l.weight) byDate[l.date] = l.weight; });
        return Object.keys(byDate).sort().map(d => ({ date: d, w: byDate[d] }));
    }
    function weightStats() {
        const s = weightSeries();
        if (!s.length) return null;
        const last = s[s.length - 1];
        const prev = s.length > 1 ? s[s.length - 2] : null;
        const avg = (from) => {
            const pts = s.filter(p => p.date >= from);
            return pts.length ? pts.reduce((a, p) => a + p.w, 0) / pts.length : null;
        };
        const daysAgo = (n) => { const d = parseLocalDate(todayStr); d.setDate(d.getDate() - n); return formatDate(d); };
        const avg7 = avg(daysAgo(6));
        const prevWeek = s.filter(p => p.date >= daysAgo(13) && p.date < daysAgo(6));
        const avgPrev7 = prevWeek.length ? prevWeek.reduce((a, p) => a + p.w, 0) / prevWeek.length : null;
        return { last, prev, avg7, weekChange: avg7 !== null && avgPrev7 !== null ? avg7 - avgPrev7 : null, series: s };
    }
    function logWeight(val) {
        const w = Math.round(parseFloat(String(val).replace(',', '.')) * 10) / 10;
        if (!w || w < 20 || w > 400) return false;
        // One weigh-in per day: a new one today replaces the old one
        bodyLogs = (bodyLogs || []).filter(l => l.date !== todayStr);
        bodyLogs.push({ id: 'bw_' + Date.now(), date: todayStr, weight: w, note: '' });
        persist();
        rerender();
        if (typeof showToast === 'function') showToast(`Weight saved: ${w.toFixed(1)} kg`);
        return true;
    }
    function weightChartSvg(series, days = 60) {
        const from = (() => { const d = parseLocalDate(todayStr); d.setDate(d.getDate() - days + 1); return formatDate(d); })();
        const pts = series.filter(p => p.date >= from);
        if (pts.length < 2) return '<div class="dim study-hint">The chart appears after two weigh-ins.</div>';
        const W = 600, H = 140, P = 8;
        const ws = pts.map(p => p.w);
        let lo = Math.min(...ws), hi = Math.max(...ws);
        if (hi - lo < 1) { lo -= 0.5; hi += 0.5; }
        const t0 = parseLocalDate(pts[0].date).getTime(), t1 = parseLocalDate(todayStr).getTime();
        const x = (d) => P + ((parseLocalDate(d).getTime() - t0) / Math.max(1, t1 - t0)) * (W - 2 * P);
        const y = (w) => P + (1 - (w - lo) / (hi - lo)) * (H - 2 * P);
        const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.w).toFixed(1)}`).join(' ');
        // 7-point moving average = the trend
        const ma = pts.map((p, i) => { const win = pts.slice(Math.max(0, i - 6), i + 1); return { date: p.date, w: win.reduce((a, q) => a + q.w, 0) / win.length }; });
        const trend = ma.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.w).toFixed(1)}`).join(' ');
        // Zero-length round-capped strokes stay round even when the chart is stretched
        const dots = pts.map(p => `<path d="M${x(p.date).toFixed(1)},${y(p.w).toFixed(1)}h0.01"><title>${esc(p.date)}: ${p.w.toFixed(1)} kg</title></path>`).join('');
        return `
            <svg class="weight-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Weight, last ${days} days">
                <path class="wc-raw" d="${line}"/>
                <path class="wc-trend" d="${trend}"/>
                <g class="wc-dots">${dots}</g>
            </svg>
            <div class="weight-chart-axis dim"><span>${esc(pts[0].date)}</span><span>range ${Math.min(...ws).toFixed(1)}–${Math.max(...ws).toFixed(1)} kg</span><span>today</span></div>`;
    }

    function weightCardHtml(compact) {
        const ws = weightStats();
        const today = ws && ws.last.date === todayStr ? ws.last : null;
        const delta = ws && ws.prev ? ws.last.w - ws.prev.w : null;
        return `
            <div class="weight-card ${compact ? 'is-compact' : ''}">
                <div class="weight-card-main">
                    <div class="weight-now">${ws ? `<b>${ws.last.w.toFixed(1)}</b> kg` : '<span class="dim">No weigh-ins yet</span>'}</div>
                    <div class="weight-sub dim">${ws ? [
                        ws.last.date === todayStr ? 'today' : `on ${esc(ws.last.date)}`,
                        delta !== null ? `${delta > 0 ? '+' : ''}${delta.toFixed(1)} vs last` : null,
                        ws.avg7 !== null ? `7-day avg ${ws.avg7.toFixed(1)}` : null,
                        ws.weekChange !== null ? `${ws.weekChange > 0 ? '+' : ''}${ws.weekChange.toFixed(1)} kg/week` : null
                    ].filter(Boolean).join(' · ') : 'Weigh yourself in the morning, before eating, for comparable numbers.'}</div>
                </div>
                <form class="weight-form" data-weight-form>
                    <input type="number" inputmode="decimal" step="0.1" min="20" max="400" class="form-control form-control-sm no-spinners" placeholder="${today ? today.w.toFixed(1) : 'kg'}" aria-label="Weight in kg" data-weight-input>
                    <button type="submit" class="btn btn-sm">${today ? 'Update' : 'Log weight'}</button>
                </form>
            </div>`;
    }
    function bindWeight(root) {
        root.querySelectorAll('[data-weight-form]').forEach(f => f.addEventListener('submit', (e) => {
            e.preventDefault();
            const inp = f.querySelector('[data-weight-input]');
            if (!logWeight(inp.value)) { inp.focus(); if (typeof showToast === 'function') showToast('Enter your weight in kg, e.g. 72.4'); }
        }));
    }

    // ------------------------------------------------------------------
    // Diet → Today
    // ------------------------------------------------------------------
    function macroBar(label, eaten, planned, unit) {
        const pct = planned > 0 ? Math.min(100, (eaten / planned) * 100) : 0;
        return `<div class="macro-bar"><div class="macro-bar-top"><span>${esc(label)}</span><span><b>${num(eaten)}</b><span class="dim"> / ${num(planned)} ${unit}</span></span></div><div class="macro-bar-track"><div style="width:${pct.toFixed(1)}%"></div></div></div>`;
    }

    function renderToday() {
        const root = document.getElementById('module-diet-today');
        if (!root) return;
        const date = selectedDateStr;
        const scroller = root.querySelector('.diet2');
        const prevScroll = scroller ? scroller.scrollTop : 0;
        const tot = dayTotals(date);
        const dateObj = parseLocalDate(date);
        const nowMin = (() => { const n = getNow(); return n.getHours() * 60 + n.getMinutes(); })();
        const rows = mealRows().filter(r => !isBreakfastHidden(r))
            .map(r => ({ row: r, t: toMin(mealTime(r, date)) }))
            .sort((a, b) => (a.t ?? 9999) - (b.t ?? 9999));

        const mealsHtml = rows.map(({ row, t }) => {
            const items = plannedItemsOf(row, date);
            const st = mealStatus(row, date);
            const plan = macrosOfItems(items);
            const eaten = st && st.status !== 'skipped' ? macrosOfItems(st.items || []) : null;
            const past = date === todayStr && t !== null && t + (row.dur || 20) < nowMin;
            const pending = items.some(i => i.name && !foodState(st, i.name));
            const itemsHtml = items.length ? foodChipsHtml(row.id, date, items, st) : '<span class="dim">Nothing planned</span>';
            let status = '';
            if (st && st.status === 'eaten') status = `<span class="meal-status is-eaten">✓ ${num(eaten.kcal)} kcal</span>`;
            else if (st && st.status === 'skipped') status = '<span class="meal-status is-skipped">✗ not eaten</span>';
            else if (st) status = `<span class="meal-status is-partial">◐ ${num(eaten.kcal)} kcal</span>`;
            if (items.some(i => i.name) && (!st || pending)) {
                status += `<span class="meal-quick-row">
                    <button type="button" class="btn btn-sm meal-quick" data-eaten="${esc(row.id)}" title="${st ? 'The rest eaten as planned' : 'Eaten as planned'}">✓ ${st ? 'Rest' : 'Eaten'}</button>
                    ${!st ? `<button type="button" class="ghost-btn meal-skip" data-skip-meal="${esc(row.id)}" title="Not eaten">✗</button>` : ''}
                </span>`;
            }
            return `
                <div class="meal-row ${st ? 'is-' + st.status : ''} ${past && !st ? 'is-due' : ''}" data-meal="${esc(row.id)}">
                    <button type="button" class="meal-time" data-open="${esc(row.id)}" title="Change time">${t !== null ? fmt(t) : '--:--'}</button>
                    <div class="meal-main">
                        <button type="button" class="meal-name" data-open="${esc(row.id)}" title="Change grams, add food, move the time">${esc(row.type)} <span class="dim">· ${num(plan.kcal)} kcal</span></button>
                        <span class="meal-foods">${itemsHtml}</span>
                    </div>
                    <span class="meal-side">${status}</span>
                </div>`;
        }).join('');

        const rulesText = typeof dietRules === 'string' ? dietRules.trim() : '';
        const rulesSt = dayLog(date) && dayLog(date).meals.__rules;
        const extras = rulesText ? `
            <div class="meal-row is-extras ${rulesSt ? 'is-' + rulesSt.status : ''}">
                <span class="meal-time dim">daily</span>
                <button type="button" class="meal-main" data-open="__rules">
                    <span class="meal-name">Daily extras <span class="dim">· ${num(macrosOfItems(parseItems(rulesText)).kcal)} kcal</span></span>
                    <span class="meal-foods"><span class="meal-food dim">${esc(rulesText)}</span></span>
                </button>
                <span class="meal-side">${rulesSt ? `<span class="meal-status is-eaten">✓ ${num(macrosOfItems(rulesSt.items || []).kcal)} kcal</span>` : `<button type="button" class="btn btn-sm meal-quick" data-eaten="__rules">✓ Eaten</button>`}</span>
            </div>` : '';

        root.innerHTML = `
            <div class="module-body-padded diet2 u-grow u-scroll-y">
                <div class="diet2-head">
                    <div>
                        <span class="section-label">Meals</span>
                        <span class="u-fs-xs u-dim u-ml-2">${esc(dateObj.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' }))}</span>
                    </div>
                    <div class="diet2-head-actions">
                        <button type="button" class="ghost-btn" data-add-meal>+ Meal</button>
                    </div>
                </div>
                <div class="diet2-grid">
                    <div class="diet2-col">
                        <div class="diet2-summary">
                            <div class="diet2-kcal"><b>${num(tot.eaten.kcal)}</b> <span class="dim">/ ${num(tot.planned.kcal)} kcal eaten</span></div>
                            <div class="macro-track-big"><div style="width:${tot.planned.kcal ? Math.min(100, (tot.eaten.kcal / tot.planned.kcal) * 100).toFixed(1) : 0}%"></div></div>
                            <div class="diet2-macros">
                                ${macroBar('Protein', tot.eaten.p, tot.planned.p, 'g')}
                                ${macroBar('Carbs', tot.eaten.c, tot.planned.c, 'g')}
                                ${macroBar('Fat', tot.eaten.f, tot.planned.f, 'g')}
                            </div>
                        </div>
                        <div class="diet2-meals">${mealsHtml || '<div class="dim study-hint">No meals in your plan yet. Add one with “+ Meal”.</div>'}${extras}</div>
                        <div class="dim study-hint">Tap a food when you have eaten it (tap again: not eaten). Tap the meal name to change grams, add food or move its time.</div>
                    </div>
                    <div class="diet2-col diet2-side">
                        <div class="today-section-head"><span>WEIGHT</span><button type="button" class="ghost-btn" data-nav-weight>History</button></div>
                        ${weightCardHtml(true)}
                    </div>
                </div>
            </div>`;

        root.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => openMealSheet(date, b.dataset.open)));
        root.querySelectorAll('[data-eaten]').forEach(b => b.addEventListener('click', (e) => { e.stopPropagation(); markEatenAsPlanned(date, b.dataset.eaten); }));
        root.querySelectorAll('[data-skip-meal]').forEach(b => b.addEventListener('click', (e) => { e.stopPropagation(); skipMeal(date, b.dataset.skipMeal); }));
        bindFoodChips(root, date);
        root.querySelector('[data-add-meal]')?.addEventListener('click', addMeal);
        root.querySelector('[data-nav-weight]')?.addEventListener('click', () => { if (typeof navigateToSub === 'function') navigateToSub('diet_weight'); });
        bindWeight(root);
        const sc = root.querySelector('.diet2');
        if (sc && prevScroll) sc.scrollTop = prevScroll;
    }

    function addMeal() {
        const name = prompt('Name of the meal (e.g. Breakfast, Snack, Dinner):');
        if (!name || !name.trim()) return;
        const time = prompt('Usual time (HH:MM):', '10:30');
        const row = { type: name.trim() };
        [0, 1, 2, 3, 4, 5, 6].forEach(d => { row[d] = ''; });
        const hit = DEFAULT_TIMES.find(d => d.re.test(row.type));
        row.time = /^\d{1,2}:\d{2}$/.test(String(time || '').trim()) ? String(time).trim().padStart(5, '0') : (hit ? hit.time : '12:00');
        row.dur = hit ? hit.dur : 20;
        dietData.push(row);
        ensureMealMeta();
        persist();
        rerender();
        if (typeof showToast === 'function') showToast(`"${row.type}" added: write what to eat in Diet → Week plan`);
    }

    // ------------------------------------------------------------------
    // Diet → Foods (macros per 100 g)
    // ------------------------------------------------------------------
    let foodFilter = '';
    let foodSort = { key: 'name', dir: 1 };
    function renderFoods() {
        const root = document.getElementById('module-diet-foods');
        if (!root) return;
        const list = (typeof foodDb !== 'undefined' ? foodDb : []).map((f, idx) => ({ f, idx }))
            .filter(x => !foodFilter || x.f.name.toLowerCase().includes(foodFilter.toLowerCase()));
        list.sort((a, b) => {
            const k = foodSort.key;
            const va = k === 'name' ? a.f.name.toLowerCase() : (parseFloat(a.f[k]) || 0);
            const vb = k === 'name' ? b.f.name.toLowerCase() : (parseFloat(b.f[k]) || 0);
            return (va > vb ? 1 : va < vb ? -1 : 0) * foodSort.dir;
        });
        const th = (key, label, cls = '') => `<th class="${cls}"><button type="button" data-sort="${key}">${label}${foodSort.key === key ? (foodSort.dir > 0 ? ' ↑' : ' ↓') : ''}</button></th>`;
        const hadFocus = document.activeElement && document.activeElement.matches && document.activeElement.matches('[data-food-filter]');
        root.innerHTML = `
            <div class="module-body-padded foods u-grow u-scroll-y">
                <div class="diet2-head">
                    <div><span class="section-label">Foods</span><span class="u-fs-xs u-dim u-ml-2">values per 100 g · ${(foodDb || []).length} foods</span></div>
                    <input type="search" class="form-control form-control-sm foods-filter" placeholder="Search foods" value="${esc(foodFilter)}" data-food-filter>
                </div>
                <div class="foods-table-wrap">
                    <table class="foods-table">
                        <thead><tr>${th('name', 'Food', 'is-name')}${th('kcal', 'kcal')}${th('p', 'Protein')}${th('c', 'Carbs')}${th('f', 'Fat')}${th('defaultG', 'Portion')}<th></th></tr></thead>
                        <tbody>
                            <tr class="foods-new">
                                <td class="is-name"><input type="text" class="foods-in" placeholder="+ New food" data-new="name"></td>
                                <td><input type="number" step="0.1" class="foods-in no-spinners" placeholder="kcal" data-new="kcal"></td>
                                <td><input type="number" step="0.1" class="foods-in no-spinners" placeholder="g" data-new="p"></td>
                                <td><input type="number" step="0.1" class="foods-in no-spinners" placeholder="g" data-new="c"></td>
                                <td><input type="number" step="0.1" class="foods-in no-spinners" placeholder="g" data-new="f"></td>
                                <td><input type="number" step="1" class="foods-in no-spinners" placeholder="100" data-new="defaultG"></td>
                                <td><button type="button" class="btn btn-sm" data-new-add>Add</button></td>
                            </tr>
                            ${list.map(({ f, idx }) => `
                                <tr data-idx="${idx}">
                                    <td class="is-name"><input type="text" class="foods-in" value="${esc(f.name)}" data-k="name"></td>
                                    <td><input type="number" step="0.1" class="foods-in no-spinners" value="${esc(f.kcal)}" data-k="kcal"></td>
                                    <td><input type="number" step="0.1" class="foods-in no-spinners" value="${esc(f.p)}" data-k="p"></td>
                                    <td><input type="number" step="0.1" class="foods-in no-spinners" value="${esc(f.c)}" data-k="c"></td>
                                    <td><input type="number" step="0.1" class="foods-in no-spinners" value="${esc(f.f)}" data-k="f"></td>
                                    <td><input type="number" step="1" class="foods-in no-spinners" value="${esc(f.defaultG || 100)}" data-k="defaultG"></td>
                                    <td><button type="button" class="icon-btn delete" data-del aria-label="Delete ${esc(f.name)}">×</button></td>
                                </tr>`).join('')}
                        </tbody>
                    </table>
                </div>
                <div class="dim study-hint">Write meals in the plan as “Riso 160g” or “2 Uova”: the name must contain a food from this table. “Portion” is used when you write a number without grams (2 Uova = 2 × portion).</div>
            </div>`;
        const filt = root.querySelector('[data-food-filter]');
        filt.addEventListener('input', () => { foodFilter = filt.value; renderFoods(); });
        if (hadFocus) { filt.focus(); filt.setSelectionRange(filt.value.length, filt.value.length); }
        root.querySelectorAll('[data-sort]').forEach(b => b.addEventListener('click', () => {
            const k = b.dataset.sort;
            foodSort = foodSort.key === k ? { key: k, dir: -foodSort.dir } : { key: k, dir: k === 'name' ? 1 : -1 };
            renderFoods();
        }));
        root.querySelectorAll('tr[data-idx]').forEach(tr => {
            const idx = parseInt(tr.dataset.idx, 10);
            tr.querySelectorAll('[data-k]').forEach(inp => inp.addEventListener('change', () => {
                const k = inp.dataset.k;
                foodDb[idx][k] = k === 'name' ? inp.value.trim() : (parseFloat(inp.value) || 0);
                persist();
                if (typeof renderDietAtomWeek === 'function') renderDietAtomWeek();
            }));
            tr.querySelector('[data-del]').addEventListener('click', () => {
                if (!confirm(`Delete "${foodDb[idx].name}" from your foods?`)) return;
                foodDb.splice(idx, 1);
                persist(); renderFoods();
            });
        });
        const addNew = () => {
            const g = (k) => root.querySelector(`[data-new="${k}"]`).value;
            const name = g('name').trim();
            if (!name) { root.querySelector('[data-new="name"]').focus(); return; }
            foodDb.unshift({ name, kcal: parseFloat(g('kcal')) || 0, p: parseFloat(g('p')) || 0, c: parseFloat(g('c')) || 0, f: parseFloat(g('f')) || 0, defaultG: parseFloat(g('defaultG')) || 100 });
            persist(); renderFoods();
            root.querySelector('[data-new="name"]')?.focus();
        };
        root.querySelector('[data-new-add]').addEventListener('click', addNew);
        root.querySelectorAll('[data-new]').forEach(i => i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addNew(); } }));
    }

    // ------------------------------------------------------------------
    // Diet → Weight
    // ------------------------------------------------------------------
    function renderWeight() {
        const root = document.getElementById('module-diet-weight');
        if (!root) return;
        const ws = weightStats();
        const hist = ws ? [...ws.series].reverse().slice(0, 30) : [];
        root.innerHTML = `
            <div class="module-body-padded weightmod u-grow u-scroll-y">
                <div class="diet2-head"><div><span class="section-label">Weight</span><span class="u-fs-xs u-dim u-ml-2">one weigh-in per day</span></div></div>
                ${weightCardHtml(false)}
                <div class="weight-chart-wrap">${ws ? weightChartSvg(ws.series) : ''}<div class="weight-legend dim"><span class="lg-raw"></span> weigh-ins <span class="lg-trend"></span> 7-day trend</div></div>
                <div class="today-section-head"><span>HISTORY</span><span class="dim">${ws ? ws.series.length : 0}</span></div>
                <div class="weight-hist">
                    ${hist.map((p, i) => {
                        const prev = hist[i + 1];
                        const d = prev ? p.w - prev.w : null;
                        return `<div class="weight-hist-row"><span class="dim">${esc(p.date)}</span><b>${p.w.toFixed(1)} kg</b><span class="${d > 0 ? 'is-up' : d < 0 ? 'is-down' : 'dim'}">${d === null ? '' : `${d > 0 ? '+' : ''}${d.toFixed(1)}`}</span><button type="button" class="icon-btn delete" data-wdel="${esc(p.date)}" aria-label="Delete">×</button></div>`;
                    }).join('') || '<div class="dim study-hint">No weigh-ins yet.</div>'}
                </div>
            </div>`;
        bindWeight(root);
        root.querySelectorAll('[data-wdel]').forEach(b => b.addEventListener('click', () => {
            bodyLogs = (bodyLogs || []).filter(l => l.date !== b.dataset.wdel);
            persist(); rerender(); renderWeight();
        }));
    }

    // ------------------------------------------------------------------
    // Today card
    // ------------------------------------------------------------------
    // Every meal of the day, one line each: what the plan says, and two buttons, eaten or not.
    // "All eaten" logs every meal still open as planned (logging the day in one go).
    // The meal name opens the sheet: real grams, extra food, foods you left out.
    function renderTodayCard(date) {
        if (typeof isModuleEnabled === 'function' && !isModuleEnabled('diet')) return '';
        const blocks = getMealBlocks(date);
        if (!blocks.length) return '';
        const tot = dayTotals(date);
        const open = blocks.filter(b => !b.status);
        const rows = blocks.map(b => {
            const what = b.summary || 'Nothing planned';
            let side;
            if (!b.status) {
                side = `<button type="button" class="btn btn-sm" data-meal-eaten="${esc(b.id)}" title="Eaten as planned">✓ Eaten</button>
                        <button type="button" class="ghost-btn" data-meal-skip="${esc(b.id)}" title="Not eaten">✗</button>`;
            } else {
                const label = b.status === 'skipped' ? '✗ not eaten' : `${b.status === 'partial' ? '◐' : '✓'} ${num(b.eatenKcal)} kcal`;
                side = `<button type="button" class="meal-status is-${esc(b.status)}" data-meal-open="${esc(b.id)}" title="Change what you ate">${label}</button>
                        <button type="button" class="ghost-btn today-meal-undo" data-meal-clear="${esc(b.id)}" title="Not logged yet" aria-label="Undo ${esc(b.title)}">↺</button>`;
            }
            return `
                <div class="today-meal-row ${b.status ? 'is-' + esc(b.status) : ''}">
                    <button type="button" class="today-meal-name" data-meal-open="${esc(b.id)}" title="Grams, extra food, what you left out">${esc(b.title)}</button>
                    <span class="today-meal-what" title="${esc(what)}">${esc(what)}</span>
                    <span class="today-meal-side">${side}</span>
                </div>`;
        }).join('');
        return `
            <div class="today-section-head">
                <span>MEALS</span>
                <span class="today-meal-head-right">
                    <span class="dim">${num(tot.eaten.kcal)} / ${num(tot.planned.kcal)} kcal</span>
                    ${open.length > 1 ? `<button type="button" class="ghost-btn" data-meal-all title="Log every meal still open as eaten, as planned">✓ All eaten</button>` : ''}
                </span>
            </div>
            <div class="today-meals">${rows}</div>`;
    }
    function bindTodayCard(root, date) {
        root.querySelectorAll('[data-meal-open]').forEach(b => b.addEventListener('click', () => openMealSheet(date, b.dataset.mealOpen)));
        root.querySelectorAll('[data-meal-eaten]').forEach(b => b.addEventListener('click', () => markEatenAsPlanned(date, b.dataset.mealEaten)));
        root.querySelectorAll('[data-meal-skip]').forEach(b => b.addEventListener('click', () => skipMeal(date, b.dataset.mealSkip)));
        root.querySelectorAll('[data-meal-clear]').forEach(b => b.addEventListener('click', () => clearMeal(date, b.dataset.mealClear)));
        root.querySelector('[data-meal-all]')?.addEventListener('click', () => logAllAsPlanned(date));
        bindFoodChips(root, date);
    }
    // Every meal not logged yet: eaten as planned
    function logAllAsPlanned(date) {
        const open = getMealBlocks(date).filter(b => !b.status);
        if (!open.length) return;
        const d = dayLog(date, true);
        open.forEach(b => {
            const items = plannedFor(b.id, date).filter(i => i.name && i.g).map(i => ({ name: i.name, g: r0(i.g) }));
            d.meals[b.id] = { status: 'eaten', items, skipped: [] };
        });
        persist();
        rerender();
        if (typeof showToast === 'function') showToast(`${open.length} meal${open.length === 1 ? '' : 's'} logged as eaten`);
    }

    // ------------------------------------------------------------------
    // Register Foods and Weight as Diet views
    // ------------------------------------------------------------------
    if (typeof dashboardModules !== 'undefined') {
        dashboardModules.diet_foods = { name: 'Diet: Foods', id: 'module-diet-foods', minW: () => 320, minH: () => 180, render: renderFoods };
        dashboardModules.diet_weight = { name: 'Diet: Weight', id: 'module-diet-weight', minW: () => 260, minH: () => 180, render: renderWeight };
        if (dashboardModules.diet_today) dashboardModules.diet_today.name = 'Diet: Today';
        if (dashboardModules.diet_week) dashboardModules.diet_week.name = 'Diet: Week plan';
        if (typeof ALL_MODULE_KEYS !== 'undefined') ['diet_foods', 'diet_weight'].forEach(k => { if (!ALL_MODULE_KEYS.includes(k)) ALL_MODULE_KEYS.push(k); });
        if (typeof MACRO_SUBMODULES_MAP !== 'undefined' && Array.isArray(MACRO_SUBMODULES_MAP.diet)) {
            ['diet_foods', 'diet_weight'].forEach(k => { if (!MACRO_SUBMODULES_MAP.diet.includes(k)) MACRO_SUBMODULES_MAP.diet.push(k); });
        }
    }

    ensureMealMeta();

    window.CortexMeals = {
        getMealBlocks, decorateDayCanvas, openMealSheet, markEatenAsPlanned, skipMeal, toggleFood, dayTotals,
        renderToday, renderFoods, renderWeight, renderTodayCard, bindTodayCard,
        weightCardHtml, bindWeight, logWeight, parseItems, macrosOfItems
    };
})();
