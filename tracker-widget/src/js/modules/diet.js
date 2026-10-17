// --- ATOMIC MODULE 5: DIET, AUTO-MACRO PARSER & COMPACT BODY WEIGHT ---

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
        row.style.cssText = 'display: grid; grid-template-columns: 2fr 1fr 1fr 1fr 1fr 1fr auto; gap: 6px; align-items: center; padding: 5px 8px; background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); font-size: var(--font-xs);';

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
        delBtn.textContent = '[X]';
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

function addBodyMetricLog(customWeight = null, customNote = null) {
    const wInp = document.getElementById('body-weight-input');
    const nInp = document.getElementById('body-note-input');

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
    renderBodyMetrics();
    if (typeof showToast === 'function') showToast(`[DIET] Logged weight: ${weightVal.toFixed(1)} kg`);
    return true;
}

function deleteBodyMetricLog(id) {
    bodyLogs = bodyLogs.filter(x => x.id !== id);
    saveHealthData();
    renderBodyMetrics();
}

function renderBodyMetrics() {
    const heroEl = document.getElementById('body-weight-display');
    const deltaEl = document.getElementById('body-weight-delta');
    const chipsCont = document.getElementById('body-history-chips');
    if (!heroEl || !deltaEl || !chipsCont) return;

    chipsCont.innerHTML = '';

    if (bodyLogs.length === 0) {
        heroEl.textContent = '-- KG';
        deltaEl.textContent = '';
        chipsCont.innerHTML = '<div class="empty-state" style="padding:4px 0;">[ NO LOGS YET ]</div>';
        return;
    }

    const latest = bodyLogs[bodyLogs.length - 1];
    heroEl.textContent = `${latest.weight.toFixed(1)} KG`;

    if (bodyLogs.length >= 2) {
        const prev = bodyLogs[bodyLogs.length - 2];
        const diff = Math.round((latest.weight - prev.weight) * 10) / 10;
        const sign = diff > 0 ? '+' : '';
        deltaEl.textContent = `(${sign}${diff.toFixed(1)})`;
    } else {
        deltaEl.textContent = '';
    }

    [...bodyLogs].reverse().slice(0, 8).forEach(entry => {
        const chip = document.createElement('div');
        chip.className = 'body-chip';
        chip.style.justifyContent = 'space-between';
        const noteStr = entry.note ? ` · ${entry.note}` : '';
        chip.innerHTML = `
            <span><strong style="color:var(--text-main);">${entry.weight.toFixed(1)}kg</strong> <span style="color:var(--text-dim);">${escapeHtml(entry.date)}${escapeHtml(noteStr)}</span></span>
        `;
        const delBtn = document.createElement('button');
        delBtn.className = 'icon-btn delete';
        delBtn.textContent = '[X]';
        delBtn.onclick = () => deleteBodyMetricLog(entry.id);
        chip.appendChild(delBtn);
        chipsCont.appendChild(chip);
    });
}

function renderDiet() {
    renderBodyMetrics();
    const mainArea = document.getElementById('diet-main-content');
    if (!mainArea) return;
    mainArea.innerHTML = '';

    const todayJS = new Date(selectedDateStr).getDay();
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
        rowEl.appendChild(labelCell);

        dayOrder.forEach(dVal => {
            const cell = document.createElement('div');
            cell.className = `diet-cell ${todayJS === dVal ? 'diet-col-active' : ''}`;
            cell.title = "Double-click to edit meal";
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
    mainArea.appendChild(wrapper);

    const rulesEl = document.getElementById('diet-rules');
    if (rulesEl) {
        rulesEl.title = "Double-click to edit diet rules";
        rulesEl.style.cursor = 'pointer';
        rulesEl.textContent = dietRules;
        rulesEl.ondblclick = () => startDietRulesEdit(rulesEl);
    }
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
        if (typeof showToast === 'function') showToast('[DIET] Meal & Macros updated');
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
        if (typeof showToast === 'function') showToast('[DIET] Rules updated');
    };

    inp.onblur = commit;
    inp.onkeydown = (e) => {
        if (e.key === 'Enter') { e.preventDefault(); inp.blur(); }
        else if (e.key === 'Escape') { e.preventDefault(); renderDiet(); }
    };

    rulesEl.appendChild(inp);
    inp.focus();
}