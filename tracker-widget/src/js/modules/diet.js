// --- js/modules/diet.js ---
// ATOMIC MODULE 5 & SUB-MODULES:
// - diet_today (#module-diet-today): Visione giornaliera sincronizzata con selectedDateStr (<-, ->, T)
// - diet_week (#module-diet-week): Matrice settimanale completa (Zero istruzioni superflue)

let hideBreakfast = cortexStore.getItem('cortex_hide_breakfast') === 'true';

function toggleBreakfastVisibility() {
    hideBreakfast = !hideBreakfast;
    cortexStore.setItem('cortex_hide_breakfast', String(hideBreakfast));
    renderDiet();
}

function parseFoodSegmentMacros(segmentText) {
    let kcal = 0, p = 0, c = 0, f = 0;
    if (!segmentText || segmentText.includes('PASTO') || segmentText.includes('LIBERO')) {
        return { kcal: 0, p: 0, c: 0, f: 0, isFreeMeal: segmentText && segmentText.includes('LIBERO') };
    }

    const lowerSeg = segmentText.toLowerCase();
    const sortedFoods = [...foodDb].sort((a, b) => b.name.length - a.name.length);

    for (const item of sortedFoods) {
        const foodNameLower = item.name.toLowerCase();
        if (lowerSeg.includes(foodNameLower)) {
            let grams = item.defaultG || 100;
            const gramMatch = segmentText.match(/(\d+(?:[.,]\d+)?)\s*g\b/i);
            if (gramMatch) {
                grams = parseFloat(gramMatch[1].replace(',', '.'));
            } else {
                const unitMatch = segmentText.match(/(\d+(?:[.,]\d+)?)\s+/);
                if (unitMatch) {
                    const count = parseFloat(unitMatch[1].replace(',', '.'));
                    grams = count * (item.defaultG || 60);
                }
            }
            if (lowerSeg.includes('pranzo') && lowerSeg.includes('cena')) {
                grams *= 2;
            }

            const ratio = grams / 100.0;
            kcal += (parseFloat(item.kcal) || 0) * ratio;
            p += (parseFloat(item.p) || 0) * ratio;
            c += (parseFloat(item.c) || 0) * ratio;
            f += (parseFloat(item.f) || 0) * ratio;
            break;
        }
    }

    return { kcal, p, c, f, isFreeMeal: false };
}

function calculateDayMacros(dayKey) {
    let totalKcal = 0, totalP = 0, totalC = 0, totalF = 0;
    let hasFreeMeal = false;

    dietData.forEach(rowObj => {
        const cellText = rowObj[dayKey] || '';
        cellText.split(/[\n+]/).forEach(line => {
            const res = parseFoodSegmentMacros(line.trim());
            if (res.isFreeMeal) hasFreeMeal = true;
            totalKcal += res.kcal;
            totalP += res.p;
            totalC += res.c;
            totalF += res.f;
        });
    });

    if (dietRules) {
        dietRules.split('|').forEach(block => {
            block.split('+').forEach(sub => {
                const res = parseFoodSegmentMacros(sub.trim());
                totalKcal += res.kcal;
                totalP += res.p;
                totalC += res.c;
                totalF += res.f;
            });
        });
    }

    return {
        kcal: Math.round(totalKcal),
        p: Math.round(totalP),
        c: Math.round(totalC),
        f: Math.round(totalF),
        hasFreeMeal
    };
}

function openFoodDbModal() {
    closeModals();
    renderFoodDbList();
    document.getElementById('foodDbModal').style.display = 'flex';
}

function renderFoodDbList() {
    const list = document.getElementById('food-db-list');
    if (!list) return;
    list.innerHTML = '';

    const frag = document.createDocumentFragment();
    foodDb.forEach((item, idx) => {
        const row = document.createElement('div');
        row.style.cssText = 'display:grid; grid-template-columns:2fr 1fr 1fr 1fr 1fr 1fr auto; gap:var(--space-2); align-items:center; padding:var(--space-1) var(--space-2); background:rgba(255,255,255,0.02); border:1px solid var(--border-color); font-size:var(--font-xs);';

        const makeInp = (val, key, isText = false) => {
            const inp = document.createElement('input');
            inp.type = isText ? 'text' : 'number';
            if (!isText) inp.step = '0.1';
            inp.className = 'gym-edit-input no-spinners';
            inp.style.width = '100%';
            inp.value = val;
            inp.onchange = () => {
                foodDb[idx][key] = isText ? inp.value.trim() : (parseFloat(inp.value) || 0);
                saveHealthData();
            };
            return inp;
        };

        row.appendChild(makeInp(item.name, 'name', true));
        row.appendChild(makeInp(item.kcal, 'kcal'));
        row.appendChild(makeInp(item.p, 'p'));
        row.appendChild(makeInp(item.c, 'c'));
        row.appendChild(makeInp(item.f, 'f'));
        row.appendChild(makeInp(item.defaultG || 100, 'defaultG'));

        const delBtn = document.createElement('button');
        delBtn.className = 'icon-btn delete';
        delBtn.textContent = '×';
        delBtn.onclick = () => {
            foodDb.splice(idx, 1);
            saveHealthData();
            renderFoodDbList();
        };
        row.appendChild(delBtn);
        frag.appendChild(row);
    });

    list.appendChild(frag);
}

function addFoodDbItem() {
    const nameEl = document.getElementById('fdb-name');
    const kcalEl = document.getElementById('fdb-kcal');
    const pEl = document.getElementById('fdb-p');
    const cEl = document.getElementById('fdb-c');
    const fEl = document.getElementById('fdb-f');
    const defgEl = document.getElementById('fdb-defg');

    const name = (nameEl.value || '').trim();
    if (!name) return;

    foodDb.unshift({
        name,
        kcal: parseFloat(kcalEl.value) || 0,
        p: parseFloat(pEl.value) || 0,
        c: parseFloat(cEl.value) || 0,
        f: parseFloat(fEl.value) || 0,
        defaultG: parseFloat(defgEl.value) || 100
    });

    nameEl.value = ''; kcalEl.value = ''; pEl.value = ''; cEl.value = ''; fEl.value = ''; defgEl.value = '100';
    saveHealthData();
    renderFoodDbList();
    renderDiet();
}

function addBodyMetricLog(customWeight = null, customNote = null, weightInpId = 'body-weight-input', noteInpId = 'body-note-input') {
    const wInp = document.getElementById(weightInpId);
    const nInp = document.getElementById(noteInpId);

    const weightVal = customWeight !== null ? parseFloat(customWeight) : parseFloat(wInp ? wInp.value : 0);
    if (!weightVal || weightVal <= 0) return false;

    const noteVal = customNote !== null ? customNote : (nInp ? nInp.value.trim() : '');

    bodyLogs.push({
        id: 'bw_' + Date.now(),
        date: todayStr,
        weight: Math.round(weightVal * 10) / 10,
        note: noteVal
    });

    if (wInp && customWeight === null) wInp.value = '';
    if (nInp && customNote === null) nInp.value = '';

    saveHealthData();
    renderDiet();
    if (typeof showToast === 'function') showToast(`[WEIGHT] ${weightVal.toFixed(1)} kg`);
    return true;
}

function deleteBodyMetricLog(id) {
    bodyLogs = bodyLogs.filter(x => x.id !== id);
    saveHealthData();
    renderDiet();
}

// Genera il componente Header unificato per i moduli Diet (con Weight Popover e bottone [⚙])
function buildDietHeaderControlsDom(suffixId) {
    const popId = `weight-popover-${suffixId}`;
    const wInpId = `bw-inp-${suffixId}`;
    const nInpId = `bn-inp-${suffixId}`;

    let latestStr = '-- KG';
    let deltaStr = '';
    if (bodyLogs.length > 0) {
        const latest = bodyLogs[bodyLogs.length - 1];
        latestStr = `${latest.weight.toFixed(1)} KG`;
        if (bodyLogs.length >= 2) {
            const prev = bodyLogs[bodyLogs.length - 2];
            const diff = Math.round((latest.weight - prev.weight) * 10) / 10;
            deltaStr = `(${diff > 0 ? '+' : ''}${diff.toFixed(1)})`;
        }
    }

    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex; gap:var(--space-2); align-items:center;';

    const drop = document.createElement('div');
    drop.className = 'dropdown';
    drop.innerHTML = `
        <button type="button" class="btn btn-sm dropdown-btn">
            <strong>${latestStr}</strong> <span class="u-dim">${deltaStr}</span>
        </button>
        <div id="${popId}" class="dropdown-content" style="right:0; width:280px; padding:var(--space-3);">
            <div class="sub-column-header">Body Weight</div>
            <div class="u-flex u-gap-2 u-mb-3">
                <input type="number" id="${wInpId}" class="form-control form-control-sm no-spinners" step="0.1" placeholder="kg" style="width:80px;">
                <input type="text" id="${nInpId}" class="form-control form-control-sm u-grow" placeholder="Note...">
                <button type="button" class="btn btn-primary btn-sm btn-log-w">+</button>
            </div>
            <div class="bw-chips-list u-flex u-col u-gap-1 u-scroll-y" style="max-height:130px;"></div>
        </div>
    `;

    const btnBadge = drop.querySelector('.dropdown-btn');
    const popEl = drop.querySelector(`#${popId}`);
    popEl.onclick = (e) => e.stopPropagation();
    btnBadge.onclick = (e) => {
        e.stopPropagation();
        document.querySelectorAll('.dropdown-content.show').forEach(d => { if (d !== popEl) d.classList.remove('show'); });
        popEl.classList.toggle('show');
    };

    const submitW = () => addBodyMetricLog(null, null, wInpId, nInpId);
    drop.querySelector('.btn-log-w').onclick = submitW;
    drop.querySelector(`#${nInpId}`).onkeydown = (e) => {
        if (e.key === 'Enter') { e.preventDefault(); submitW(); }
    };

    const chipsList = drop.querySelector('.bw-chips-list');
    if (bodyLogs.length === 0) {
        chipsList.innerHTML = '<div class="empty-state u-py-1">[ NONE ]</div>';
    } else {
        [...bodyLogs].reverse().slice(0, 8).forEach(entry => {
            const chip = document.createElement('div');
            chip.className = 'body-chip';
            chip.style.justifyContent = 'space-between';
            const noteStr = entry.note ? ` · ${entry.note}` : '';
            chip.innerHTML = `<span><strong class="u-main">${entry.weight.toFixed(1)}kg</strong> <span class="u-dim">${escapeHtml(entry.date)}${escapeHtml(noteStr)}</span></span>`;
            const delBtn = document.createElement('button');
            delBtn.className = 'icon-btn delete';
            delBtn.textContent = '×';
            delBtn.onclick = () => deleteBodyMetricLog(entry.id);
            chip.appendChild(delBtn);
            chipsList.appendChild(chip);
        });
    }

    const cfgBtn = document.createElement('button');
    cfgBtn.type = 'button';
    cfgBtn.className = 'btn btn-sm';
    cfgBtn.textContent = '⚙';
    cfgBtn.onclick = openFoodDbModal;

    wrap.appendChild(drop);
    wrap.appendChild(cfgBtn);
    return wrap;
}

// Funzione master che aggiorna tutti i contenitori Diet
function renderDiet() {
    renderDietAtomToday();
    renderDietAtomWeek();
    renderLegacyDietContainer();
    // Foods table and weight log live in js/modules/meals.js
    if (window.CortexMeals) {
        CortexMeals.renderFoods();
        CortexMeals.renderWeight();
    }
}

// ============================================================================
// SOTTO-MODULO 1: DIET: TODAY MEALS (#module-diet-today) — SINCRONIZZATO CON <- / -> / T
// ============================================================================

function renderDietAtomToday() {
    // New day view: meals with times, what you ate, weight (js/modules/meals.js)
    if (window.CortexMeals) { CortexMeals.renderToday(); return; }
    const root = document.getElementById('module-diet-today');
    if (!root) return;

    const prevScroll = root.querySelector('.module-body-padded')?.scrollTop || 0;
    const dObj = parseLocalDate(selectedDateStr);
    const dayKey = dObj.getDay();
    const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const totals = calculateDayMacros(dayKey);

    root.innerHTML = `
        <div class="module-body-padded u-grow u-flex u-col u-gap-3 u-scroll-y">
            <div class="section-header-row u-mb-0" id="diet-today-hdr">
                <div>
                    <span class="section-label">Diet</span>
                    <span class="u-fs-xs u-dim u-ml-2">// ${dayNames[dayKey]} ${selectedDateStr}</span>
                </div>
                <div class="u-gap-2 u-ai-center" style="display:flex;" id="diet-today-right-controls">
                    <button type="button" class="btn btn-sm" onclick="toggleBreakfastVisibility()">${hideBreakfast ? '[👁 SHOW BRKFST]' : '[Ø HIDE BRKFST]'}</button>
                </div>
            </div>

            <div id="diet-today-list-mount" class="diet-wrapper u-w-full"></div>

            <div id="diet-today-rules" class="diet-rules-bar u-pointer" style="margin-top:2px;"></div>
        </div>
    `;

    // Aggiunge i controlli del peso corporeo di fianco al bottone della colazione
    root.querySelector('#diet-today-right-controls').appendChild(buildDietHeaderControlsDom('today'));

    const listMount = root.querySelector('#diet-today-list-mount');

    // Intestazione compatta identica alla matrice settimanale
    const headerRow = document.createElement('div');
    headerRow.className = 'diet-row';
    headerRow.style.gridTemplateColumns = '95px 1fr';
    headerRow.innerHTML = `
        <div class="diet-header">MEAL</div>
        <div class="diet-header diet-col-active">${dayNames[dayKey]} // ${selectedDateStr}</div>
    `;
    listMount.appendChild(headerRow);

    // Righe dei pasti in formato lista compatta
    dietData.forEach((rowObj, rowIdx) => {
        // FILTRO OPZIONALE COLAZIONE
        if (hideBreakfast && (rowObj.type.toLowerCase().includes('spuntino 1') || rowObj.type.toLowerCase().includes('colazione'))) {
            return;
        }

        const rowEl = document.createElement('div');
        rowEl.className = 'diet-row';
        rowEl.style.gridTemplateColumns = '95px 1fr';

        const labelCell = document.createElement('div');
        labelCell.className = 'diet-cell diet-row-label';
        labelCell.textContent = rowObj.type;

        const valCell = document.createElement('div');
        valCell.className = 'diet-cell diet-col-active';
        valCell.style.cssText = 'justify-content:flex-start; text-align:left; padding:var(--space-2) var(--space-3);';
        valCell.textContent = (rowObj[dayKey] || '').trim() || '—';
        valCell.ondblclick = () => startDietCellEdit(valCell, rowIdx, dayKey);

        rowEl.appendChild(labelCell);
        rowEl.appendChild(valCell);
        listMount.appendChild(rowEl);
    });

    // Riga finale MACROS compatta
    const macroRow = document.createElement('div');
    macroRow.className = 'diet-row';
    macroRow.style.gridTemplateColumns = '95px 1fr';
    macroRow.innerHTML = `
        <div class="diet-cell diet-row-label u-main" style="border-top:1px solid var(--border-color);">MACROS</div>
        <div class="diet-macro-cell diet-col-active u-jc-between u-ai-center" style="flex-direction:row; padding:var(--space-2) var(--space-3);">
            <span class="diet-macro-kcal">${totals.kcal} KCAL${totals.hasFreeMeal ? '*' : ''}</span>
            <span class="diet-macro-sub u-muted u-bold">P: ${totals.p}g &nbsp;·&nbsp; C: ${totals.c}g &nbsp;·&nbsp; F: ${totals.f}g</span>
        </div>
    `;
    listMount.appendChild(macroRow);

    const rulesEl = root.querySelector('#diet-today-rules');
    rulesEl.textContent = dietRules;
    rulesEl.ondblclick = () => startDietRulesEdit(rulesEl);

    const padded = root.querySelector('.module-body-padded');
    if (padded && prevScroll > 0) padded.scrollTop = prevScroll;
}

// ============================================================================
// SOTTO-MODULO 2: DIET: WEEKLY MATRIX (#module-diet-week)
// ============================================================================

function renderDietAtomWeek() {
    const root = document.getElementById('module-diet-week');
    if (!root) return;

    root.innerHTML = `
        <div class="module-body-padded u-grow u-flex u-col u-gap-3 u-scroll-y">
            <div class="section-header-row u-mb-0" id="diet-week-hdr">
                <div>
                    <span class="section-label">Diet Matrix</span>
                    <span class="u-fs-xs u-dim u-ml-2">// WEEKLY</span>
                </div>
            </div>
            <div class="u-w-full" id="diet-week-table-mount"></div>
            <div id="diet-week-rules" class="diet-rules-bar u-pointer"></div>
        </div>
    `;

    root.querySelector('#diet-week-hdr').appendChild(buildDietHeaderControlsDom('week'));
    buildWeeklyDietMatrixDom(root.querySelector('#diet-week-table-mount'));

    const rulesEl = root.querySelector('#diet-week-rules');
    rulesEl.textContent = dietRules;
    rulesEl.ondblclick = () => startDietRulesEdit(rulesEl);
}

function renderLegacyDietContainer() {
    const mainArea = document.getElementById('diet-main-content');
    if (!mainArea) return;
    buildWeeklyDietMatrixDom(mainArea);
    const rulesEl = document.getElementById('diet-rules');
    if (rulesEl) {
        rulesEl.style.cursor = 'pointer';
        rulesEl.textContent = dietRules;
        rulesEl.ondblclick = () => startDietRulesEdit(rulesEl);
    }
}

function buildWeeklyDietMatrixDom(targetEl) {
    if (!targetEl) return;
    targetEl.innerHTML = '';

    const todayJS = parseLocalDate(selectedDateStr).getDay();
    const dayOrder = [1, 2, 3, 4, 5, 6, 0];
    const dayLabels = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

    const wrapper = document.createElement('div');
    wrapper.className = 'diet-wrapper';

    const headerRow = document.createElement('div');
    headerRow.className = 'diet-row';

    const emptyCorner = document.createElement('div');
    emptyCorner.className = 'diet-header';
    emptyCorner.textContent = 'MEAL';
    headerRow.appendChild(emptyCorner);

    dayOrder.forEach((dVal, idx) => {
        const hCell = document.createElement('div');
        hCell.className = `diet-header ${todayJS === dVal ? 'diet-col-active' : ''}`;
        hCell.textContent = dayLabels[idx];
        headerRow.appendChild(hCell);
    });
    wrapper.appendChild(headerRow);

    dietData.forEach((rowObj, rowIdx) => {
        const rowEl = document.createElement('div');
        rowEl.className = 'diet-row';

        const labelCell = document.createElement('div');
        labelCell.className = 'diet-cell diet-row-label';
        labelCell.textContent = rowObj.type;
        if (rowObj.time) {
            const tm = document.createElement('span');
            tm.className = 'diet-row-time';
            tm.textContent = rowObj.time;
            labelCell.appendChild(tm);
        }
        if (window.CortexMeals && rowObj.id) {
            labelCell.style.cursor = 'pointer';
            labelCell.title = 'Change time';
            labelCell.onclick = () => CortexMeals.openMealSheet(selectedDateStr, rowObj.id);
        }
        rowEl.appendChild(labelCell);

        dayOrder.forEach(dVal => {
            const cell = document.createElement('div');
            cell.className = `diet-cell ${todayJS === dVal ? 'diet-col-active' : ''}`;
            cell.textContent = rowObj[dVal] || '';
            cell.ondblclick = () => startDietCellEdit(cell, rowIdx, dVal);
            rowEl.appendChild(cell);
        });

        wrapper.appendChild(rowEl);
    });

    const macroRow = document.createElement('div');
    macroRow.className = 'diet-row';

    const macroLabel = document.createElement('div');
    macroLabel.className = 'diet-cell diet-row-label';
    macroLabel.style.borderTop = '1px solid var(--border-color)';
    macroLabel.style.color = 'var(--text-main)';
    macroLabel.textContent = 'MACROS';
    macroRow.appendChild(macroLabel);

    dayOrder.forEach(dVal => {
        const totals = calculateDayMacros(dVal);
        const mCell = document.createElement('div');
        mCell.className = `diet-macro-cell ${todayJS === dVal ? 'diet-col-active' : ''}`;
        mCell.innerHTML = `
            <span class="diet-macro-kcal">${totals.kcal} KCAL${totals.hasFreeMeal ? '*' : ''}</span>
            <span class="diet-macro-sub">P:${totals.p}g C:${totals.c}g F:${totals.f}g</span>
        `;
        macroRow.appendChild(mCell);
    });
    wrapper.appendChild(macroRow);
    targetEl.appendChild(wrapper);
}

function startDietCellEdit(cell, rowIdx, dayKey) {
    if (cell.querySelector('textarea')) return;
    const currentVal = dietData[rowIdx][dayKey] || '';
    cell.innerHTML = '';

    const ta = document.createElement('textarea');
    ta.className = 'diet-inline-editor';
    ta.value = currentVal;

    const commit = () => {
        dietData[rowIdx][dayKey] = ta.value.trim();
        saveHealthData();
        renderDiet();
    };

    ta.onblur = commit;
    ta.onkeydown = (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            ta.blur();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            renderDiet();
        }
    };

    cell.appendChild(ta);
    ta.focus();
}

function startDietRulesEdit(rulesEl) {
    if (rulesEl.querySelector('input')) return;
    const currentVal = dietRules;
    rulesEl.innerHTML = '';

    const inp = document.createElement('input');
    inp.type = 'text';
    inp.className = 'form-control form-control-sm';
    inp.value = currentVal;

    const commit = () => {
        dietRules = inp.value.trim() || DEFAULT_DIET_RULES;
        saveHealthData();
        renderDiet();
    };

    inp.onblur = commit;
    inp.onkeydown = (e) => {
        if (e.key === 'Enter') { e.preventDefault(); inp.blur(); }
        else if (e.key === 'Escape') { e.preventDefault(); renderDiet(); }
    };

    rulesEl.appendChild(inp);
    inp.focus();
}

window.addEventListener('DOMContentLoaded', () => {
    renderDiet();
});