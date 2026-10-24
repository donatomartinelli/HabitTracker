// --- js/modules/gym.js ---
// Atomic Module 6: WORKOUT SPLIT (Macro-Celle per Gruppo Muscolare, Sigle Dinamiche es. DBG/PSB, Multi-Orario Routine & Reset Punto di Partenza)

const GYM_SUBMODULES = {
    split: { id: 'split', name: '1. Schede Split' },
    routine: { id: 'routine', name: '2. Routine & Orari' }
};

const GYM_REP_SCHEMES = [
    { label: '4x5-8', sets: 4, isProg: true, minR: 5, maxR: 8, desc: '4 serie · Doppia progressione (5→6→7→8 rep, poi +kg)' },
    { label: '3x5-8', sets: 3, isProg: true, minR: 5, maxR: 8, desc: '3 serie · Doppia progressione (5→6→7→8 rep, poi +kg)' },
    { label: '10-8-8', sets: 3, isProg: false, desc: '3 serie piramidali inverse (3 caselle peso)' },
    { label: '8-8-6', sets: 3, isProg: false, desc: '3 serie (3 caselle peso)' },
    { label: '12-12-10', sets: 3, isProg: false, desc: '3 serie (3 caselle peso)' },
    { label: '2x12 + 1xmax - 20%', sets: 3, isProg: false, desc: '2 serie + 1 serie stripping -20% (3 caselle peso manuali)' },
    { label: '2x12 + 10 parziali', sets: 3, isProg: false, desc: '2 serie + parziali (3 caselle peso)' },
    { label: '3xMax', sets: 0, isProg: false, desc: 'Corpo libero / BW (0 caselle peso)' }
];

let isEditingGymPlan = false;
let isGymSubEditMode = false;
let pendingReviewDateStr = null;

function resolveGymSchemeMeta(repStr) {
    const clean = (repStr || '').trim();
    const exact = GYM_REP_SCHEMES.find(s => s.label.toLowerCase() === clean.toLowerCase());
    if (exact) return { ...exact };

    const progMatch = clean.match(/^(\d+)\s*x\s*(\d+)\s*-\s*(\d+)$/i);
    if (progMatch) {
        return {
            label: clean,
            sets: parseInt(progMatch[1], 10) || 3,
            isProg: true,
            minR: parseInt(progMatch[2], 10) || 5,
            maxR: parseInt(progMatch[3], 10) || 8
        };
    }

    if (clean.toLowerCase().includes('2x12')) {
        return { label: clean, sets: 3, isProg: false };
    }
    if (/^\d+\s*-\s*\d+\s*-\s*\d+/.test(clean)) {
        return { label: clean, sets: 3, isProg: false };
    }
    if (clean.toLowerCase().includes('max') && !clean.toLowerCase().includes('2x12')) {
        return { label: clean, sets: 0, isProg: false };
    }
    const simpleSets = clean.match(/^(\d+)\s*x/i);
    if (simpleSets) {
        return { label: clean, sets: parseInt(simpleSets[1], 10) || 3, isProg: false };
    }
    return { label: clean || '3x10', sets: 3, isProg: false };
}

// Deduce il gruppo muscolare dal nome dell'esercizio se mancante nei vecchi salvataggi
function inferMuscleGroupFromName(name, dayNum) {
    const n = (name || '').toLowerCase();
    if (n.includes('panca') || n.includes('croci') || n.includes('chest') || n.includes('pectoral')) return 'Pettorali';
    if (n.includes('shoulder') || n.includes('alzate') || n.includes('lento') || n.includes('deltoid') || n.includes('spalle')) return 'Spalle';
    if (n.includes('curl') && !n.includes('leg')) return 'Bicipiti';
    if (n.includes('lat ') || n.includes('rematore') || n.includes('pull') || n.includes('trazioni') || n.includes('row') || n.includes('dorsali')) return 'Dorsali';
    if (n.includes('push down') || n.includes('kick back') || n.includes('french') || n.includes('tricip')) return 'Tricipiti';
    if (n.includes('leg ') || n.includes('squat') || n.includes('pressa') || n.includes('affondi') || n.includes('calf')) return 'Gambe';
    if (n.includes('crunch') || n.includes('plank') || n.includes('libro') || n.includes('addom')) return 'Addome';
    return dayNum === 1 ? 'Pettorali' : 'Dorsali';
}

// Restituisce i gruppi muscolari ordinati di una scheda e la sigla dinamica (es. "DBG" per Dorsali, Bicipiti, Gambe)
function getSplitDayMusclesInfo(dayNum) {
    const list = gymPlan[dayNum] || [];
    const groups = [];
    list.forEach(ex => {
        const g = (ex.group || 'Generale').trim();
        if (g && !groups.includes(g)) groups.push(g);
    });

    if (groups.length === 0) {
        return { acronym: `S${dayNum}`, fullLabel: `SCHEDA ${dayNum}`, groups: [] };
    }

    // Calcola la sigla usando le iniziali dei gruppi principali (escludendo Addome se ci sono altri muscoli)
    const mainGroups = groups.filter(g => !g.toLowerCase().startsWith('addom'));
    const acronymSource = mainGroups.length > 0 ? mainGroups : groups;
    const acronym = acronymSource.map(g => g.charAt(0).toUpperCase()).join('');
    const fullLabel = acronymSource.map(g => g.toUpperCase()).join(' · ');

    return { acronym, fullLabel, groups };
}

// Migrazione automatica struttura esercizi (gruppi muscolari, 3 caselle per 2x12, currentReps) e multi-orario routine
function migrateExistingGymPlanStructure() {
    let changed = false;

    [1, 2].forEach(dayNum => {
        if (!Array.isArray(gymPlan[dayNum])) return;
        gymPlan[dayNum].forEach(ex => {
            if (!ex.group || !ex.group.trim()) {
                ex.group = inferMuscleGroupFromName(ex.name, dayNum);
                changed = true;
            }
            const meta = resolveGymSchemeMeta(ex.repStr);
            if (ex.repStr && ex.repStr.toLowerCase().includes('2x12') && ex.sets !== 3) {
                ex.sets = 3;
                changed = true;
            }
            if (meta.isProg) {
                if (ex.sets !== meta.sets) {
                    ex.sets = meta.sets;
                    changed = true;
                }
                if (!ex.currentReps || ex.currentReps < meta.minR || ex.currentReps > meta.maxR) {
                    ex.currentReps = meta.minR || 5;
                    changed = true;
                }
            }
        });
    });

    // Migrazione da singola fascia oraria a timeWindows multiple (es. Lun/Mar/Gio 19:45 + Sab 16:00)
    if (!Array.isArray(gymRoutine.timeWindows) || gymRoutine.timeWindows.length === 0) {
        gymRoutine.timeWindows = [
            { days: [1, 2, 4], start: "19:45", end: "21:15" },
            { days: [6], start: "16:00", end: "17:30" }
        ];
        changed = true;
    }

    if (changed) saveHealthData();
}

function isGymRoutineTask(t) {
    if (!t) return false;
    return t.id === 't_gym_routine' || t.isGymTask === true || t.title.trim().toLowerCase() === 'palestra';
}

// Sincronizza tutte le fasce orarie della Routine Palestra con la task "Palestra" su Daily Tasks e Weekly Planner
function syncGymRoutineTask(showNotification = false) {
    const validWindows = (gymRoutine.timeWindows || []).filter(w => w.start && w.end && Array.isArray(w.days) && w.days.length > 0);

    if (gymRoutine.enabled === false || validWindows.length === 0) {
        templates = templates.filter(t => !isGymRoutineTask(t));
        syncCategoryOrder();
        saveData();
        if (typeof renderTasks === 'function') renderTasks();
        if (typeof renderWeeklyPlanner === 'function') renderWeeklyPlanner();
        return;
    }

    const catName = 'Palestra';
    if (!categoryOrder.includes(catName)) categoryOrder.push(catName);

    const allDays = [];
    validWindows.forEach(w => {
        w.days.forEach(d => { if (!allDays.includes(d)) allDays.push(d); });
    });

    let existing = templates.find(t => isGymRoutineTask(t));

    if (existing) {
        existing.isGymTask = true;
        existing.category = catName;
        existing.title = 'Palestra';
        existing.type = 'timed';
        existing.noTimer = true;
        existing.timerMinutes = 0;
        existing.instances = 1;
        existing.startDate = gymStartDate || todayStr;
        existing.endDate = gymEndDate || null;
        existing.color = '#5f7a61';
        existing.frequency = 'specific';
        existing.daysOfWeek = allDays;
        existing.timeWindows = validWindows;
    } else {
        templates.push({
            id: 't_gym_routine',
            isGymTask: true,
            category: catName,
            title: 'Palestra',
            instances: 1,
            timerMinutes: 0,
            noTimer: true,
            frequency: 'specific',
            daysOfWeek: allDays,
            startDate: gymStartDate || todayStr,
            endDate: gymEndDate || null,
            color: '#5f7a61',
            type: 'timed',
            timeWindows: validWindows,
            exceptions: []
        });
    }

    syncCategoryOrder();
    saveData();
    if (typeof renderTasks === 'function') renderTasks();
    if (typeof renderWeeklyPlanner === 'function') renderWeeklyPlanner();
    if (showNotification && typeof showToast === 'function') {
        showToast('[GYM ROUTINE] Fasce orarie Palestra sincronizzate su Planner e Daily Tasks');
    }
}

// Funzione per ristabilire da zero il punto di partenza della Palestra da oggi
function resetGymStartingPoint(startingSplitNum = 1, clearPreviousOccurrences = true) {
    nextWorkoutDay = startingSplitNum === 2 ? 2 : 1;
    gymStartDate = todayStr;

    if (clearPreviousOccurrences) {
        const gymTasks = templates.filter(t => isGymRoutineTask(t));
        for (let dStr in logs) {
            if (dStr < todayStr) {
                gymTasks.forEach(gt => {
                    if (logs[dStr] && logs[dStr][gt.id]) {
                        delete logs[dStr][gt.id];
                    }
                });
            }
        }
    }

    saveHealthData();
    updateGymDates();
    syncGymRoutineTask(false);
    renderGymDashboard();
    if (typeof renderTasks === 'function') renderTasks();
    if (typeof renderTracker === 'function') renderTracker();

    const info = getSplitDayMusclesInfo(nextWorkoutDay);
    if (typeof showToast === 'function') {
        showToast(`[GYM RESET] Partenza impostata da OGGI (${todayStr}) sulla scheda ${info.acronym}!`);
    }
}

// ============================================================================
// LAYOUT MODULARE INTERNO A #module-gym
// ============================================================================

function toggleGymSubEditMode() {
    isGymSubEditMode = !isGymSubEditMode;
    renderGymDashboard();
}

function selectOrToggleGymSubModule(subKey, event = null) {
    if (!GYM_SUBMODULES[subKey]) return;
    if (!Array.isArray(gymRoutine.activeSubModules)) {
        gymRoutine.activeSubModules = ['split'];
    }

    if (isGymSubEditMode || (event && event.shiftKey)) {
        const idx = gymRoutine.activeSubModules.indexOf(subKey);
        if (idx !== -1) {
            if (gymRoutine.activeSubModules.length > 1) {
                gymRoutine.activeSubModules.splice(idx, 1);
            }
        } else {
            gymRoutine.activeSubModules.push(subKey);
        }
    } else {
        gymRoutine.activeSubModules = [subKey];
    }

    saveHealthData();
    renderGymDashboard();
}

function toggleGymSubSplitDirection() {
    gymRoutine.subLayoutDir = gymRoutine.subLayoutDir === 'col' ? 'row' : 'col';
    saveHealthData();
    renderGymDashboard();
}

function toggleGymEditMode() {
    isEditingGymPlan = !isEditingGymPlan;
    renderGymDashboard();
}

function renderGymDashboard() {
    migrateExistingGymPlanStructure();
    ensureGymModalsExist();

    const root = document.getElementById('gym-main-root');
    if (!root) return;

    const activeSubs = (Array.isArray(gymRoutine.activeSubModules) && gymRoutine.activeSubModules.length > 0)
        ? gymRoutine.activeSubModules.filter(k => GYM_SUBMODULES[k])
        : ['split'];

    const splitDir = gymRoutine.subLayoutDir || 'row';
    const info1 = getSplitDayMusclesInfo(1);
    const info2 = getSplitDayMusclesInfo(2);
    const activeInfo = nextWorkoutDay === 1 ? info1 : info2;

    root.innerHTML = '';

    // 1. BARRA SUPERIORE CON SELETTORE RAPIDO PUNTO DI PARTENZA & SOTTO-MODULI
    const topBar = document.createElement('div');
    topBar.style.cssText = 'display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; border-bottom:1px solid var(--border-color); padding-bottom:10px; flex-shrink:0;';

    topBar.innerHTML = `
        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
            <span class="section-label" style="color:var(--text-main);">Workout Split</span>
            <div style="display:flex; align-items:center; gap:4px; background:#050505; border:1px solid var(--border-color); padding:2px 4px;">
                <span style="font-size:0.65rem; color:var(--text-dim); padding:0 4px;">ORA TOCCHEREBBE A:</span>
                <button type="button" id="btn-switch-split-1" class="btn btn-sm ${nextWorkoutDay === 1 ? 'btn-primary' : ''}" style="padding:2px 8px;" title="Imposta ${escapeHtml(info1.acronym)} come scheda attiva adesso">[${escapeHtml(info1.acronym)}]</button>
                <button type="button" id="btn-switch-split-2" class="btn btn-sm ${nextWorkoutDay === 2 ? 'btn-primary' : ''}" style="padding:2px 8px;" title="Imposta ${escapeHtml(info2.acronym)} come scheda attiva adesso">[${escapeHtml(info2.acronym)}]</button>
            </div>
            <span style="font-size:var(--font-xs); color:var(--text-dim);">${escapeHtml(activeInfo.fullLabel)}</span>
        </div>
        <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;" id="gym-subnav-bar"></div>
    `;

    topBar.querySelector('#btn-switch-split-1').onclick = () => {
        nextWorkoutDay = 1;
        saveHealthData();
        renderGymDashboard();
        if (typeof showToast === 'function') showToast(`[GYM] Scheda attiva impostata su ${info1.acronym}`);
    };
    topBar.querySelector('#btn-switch-split-2').onclick = () => {
        nextWorkoutDay = 2;
        saveHealthData();
        renderGymDashboard();
        if (typeof showToast === 'function') showToast(`[GYM] Scheda attiva impostata su ${info2.acronym}`);
    };

    const navBar = topBar.querySelector('#gym-subnav-bar');
    Object.keys(GYM_SUBMODULES).forEach(key => {
        const sub = GYM_SUBMODULES[key];
        const isActive = activeSubs.includes(key);
        const btn = document.createElement('button');
        btn.className = `btn btn-sm ${isActive ? 'btn-primary' : ''}`;
        btn.textContent = `[${isGymSubEditMode ? (isActive ? '✓ ' : '+ ') : ''}${sub.name.toUpperCase()}]`;
        btn.onclick = (e) => selectOrToggleGymSubModule(key, e);
        navBar.appendChild(btn);
    });

    if (activeSubs.includes('split')) {
        const editSplitBtn = document.createElement('button');
        editSplitBtn.className = `btn btn-sm ${isEditingGymPlan ? 'btn-primary' : ''}`;
        editSplitBtn.textContent = isEditingGymPlan ? '[DONE EDIT SPLIT]' : '[EDIT SPLIT]';
        editSplitBtn.onclick = toggleGymEditMode;
        navBar.appendChild(editSplitBtn);
    }

    if (isGymSubEditMode && activeSubs.length > 1) {
        const dirBtn = document.createElement('button');
        dirBtn.className = 'btn btn-sm';
        dirBtn.textContent = splitDir === 'row' ? '[SPLIT: SIDE-BY-SIDE]' : '[SPLIT: STACKED]';
        dirBtn.onclick = toggleGymSubSplitDirection;
        navBar.appendChild(dirBtn);
    }

    const subViewBtn = document.createElement('button');
    subViewBtn.className = `btn btn-sm ${isGymSubEditMode ? 'btn-primary' : ''}`;
    subViewBtn.textContent = isGymSubEditMode ? '[DONE SUB-VIEW]' : '[EDIT SUB-VIEW]';
    subViewBtn.onclick = toggleGymSubEditMode;
    navBar.appendChild(subViewBtn);

    root.appendChild(topBar);

    // 2. AREA CONTENUTO SOTTO-MODULI
    const contentWrap = document.createElement('div');
    contentWrap.style.cssText = `flex:1; display:flex; flex-direction:${splitDir}; gap:14px; min-height:0; overflow:hidden;`;

    activeSubs.forEach(subKey => {
        const subBox = document.createElement('div');
        subBox.style.cssText = 'flex:1; display:flex; flex-direction:column; min-width:0; min-height:0; overflow:hidden;';
        if (subKey === 'split') {
            renderGymSubSplit(subBox);
        } else if (subKey === 'routine') {
            renderGymSubRoutine(subBox);
        }
        contentWrap.appendChild(subBox);
    });

    root.appendChild(contentWrap);
}

// ============================================================================
// SOTTO-MODULO 1: SCHEDE SPLIT CON MACRO-CELLE PER GRUPPO MUSCOLARE (DBG / PSB)
// ============================================================================

function renderGymSubSplit(container) {
    const cardsWrap = document.createElement('div');
    cardsWrap.style.cssText = 'flex:1; display:flex; flex-direction:row; gap:16px; overflow:hidden; min-height:0;';

    [1, 2].forEach(dayNum => {
        if (!gymPlan[dayNum]) gymPlan[dayNum] = [];
        const isActive = (dayNum === nextWorkoutDay);
        const dayInfo = getSplitDayMusclesInfo(dayNum);

        let cardClass = isActive ? 'gym-day-active' : 'gym-day-inactive';
        if (isEditingGymPlan) cardClass = 'gym-day-editing';

        const card = document.createElement('div');
        card.className = `gym-day-card ${cardClass}`;

        // Intestazione Scheda con Sigla Dinamica (es. DBG // DORSALI · BICIPITI · GAMBE)
        const header = document.createElement('div');
        header.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; border-bottom: 1px solid var(--border-color); padding-bottom: 8px; gap: 8px; flex-wrap: wrap;';

        const titleWrap = document.createElement('div');
        titleWrap.style.cursor = 'pointer';
        titleWrap.title = 'Clicca per impostare questa scheda come attiva adesso';
        titleWrap.onclick = () => {
            nextWorkoutDay = dayNum;
            saveHealthData();
            renderGymDashboard();
        };

        titleWrap.innerHTML = `
            <div style="display:flex; align-items:baseline; gap:8px;">
                <span style="font-size:var(--font-lg); font-weight:bold; color:${(isActive || isEditingGymPlan) ? 'var(--text-main)' : 'var(--text-dim)'}; letter-spacing:1px;">
                    ${escapeHtml(dayInfo.acronym)}
                </span>
                <span style="font-size:0.68rem; color:${isActive ? 'var(--accent-green)' : 'var(--text-dim)'}; font-weight:bold;">
                    ${isActive ? '// ACTIVE SPLIT' : '// CLICK TO ACTIVATE'}
                </span>
            </div>
            <div style="font-size:0.65rem; color:var(--text-dim); margin-top:2px; letter-spacing:0.5px;">
                ${escapeHtml(dayInfo.fullLabel)}
            </div>
        `;
        header.appendChild(titleWrap);

        if (isActive && !isEditingGymPlan) {
            const doneBtn = document.createElement('button');
            doneBtn.className = 'btn btn-primary btn-sm';
            doneBtn.textContent = `[DONE ${dayInfo.acronym}]`;
            doneBtn.onclick = () => openGymWorkoutReviewModal(todayStr, dayNum);
            header.appendChild(doneBtn);
        }

        card.appendChild(header);

        const list = document.createElement('div');
        list.className = 'gym-ex-list';
        list.style.cssText = 'display:flex; flex-direction:column; gap:12px;';

        // Raggruppa gli esercizi del giorno in Macro-Celle per Gruppo Muscolare
        const groupedMap = new Map();
        gymPlan[dayNum].forEach((ex, exIdx) => {
            const gName = (ex.group || 'Generale').trim();
            if (!groupedMap.has(gName)) groupedMap.set(gName, []);
            groupedMap.get(gName).push({ ex, exIdx });
        });

        groupedMap.forEach((items, groupName) => {
            // MACRO-CELLA DEL GRUPPO MUSCOLARE
            const macroCell = document.createElement('div');
            macroCell.style.cssText = 'border: 1px solid var(--border-color); background: rgba(255,255,255,0.02); padding: 8px 10px; display: flex; flex-direction: column; gap: 4px;';

            const groupHeader = document.createElement('div');
            groupHeader.style.cssText = 'display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-color); padding-bottom:4px; margin-bottom:2px;';

            if (isEditingGymPlan) {
                const grpInp = document.createElement('input');
                grpInp.type = 'text';
                grpInp.className = 'gym-edit-input';
                grpInp.style.cssText = 'font-weight:bold; text-transform:uppercase; width:150px;';
                grpInp.value = groupName;
                grpInp.title = 'Rinomina questo Gruppo Muscolare';
                grpInp.onchange = () => {
                    const newG = grpInp.value.trim() || 'Gruppo';
                    items.forEach(item => { item.ex.group = newG; });
                    saveHealthData();
                    renderGymDashboard();
                };
                groupHeader.appendChild(grpInp);

                const addExInGroupBtn = document.createElement('button');
                addExInGroupBtn.type = 'button';
                addExInGroupBtn.className = 'btn btn-sm';
                addExInGroupBtn.style.padding = '2px 6px';
                addExInGroupBtn.textContent = `[+ ESERCIZIO IN ${groupName.toUpperCase()}]`;
                addExInGroupBtn.onclick = () => {
                    gymPlan[dayNum].push({
                        id: `g${dayNum}_${Date.now()}`,
                        group: groupName,
                        name: 'Nuovo Esercizio',
                        repStr: '3x5-8',
                        sets: 3,
                        currentReps: 5
                    });
                    saveHealthData();
                    renderGymDashboard();
                    openExerciseConfigModal(dayNum, gymPlan[dayNum].length - 1);
                };
                groupHeader.appendChild(addExInGroupBtn);
            } else {
                groupHeader.innerHTML = `
                    <span style="font-size:var(--font-xs); font-weight:bold; color:var(--text-main); text-transform:uppercase; letter-spacing:1px;">
                        // ${escapeHtml(groupName)}
                    </span>
                    <span style="font-size:0.62rem; color:var(--text-dim);">${items.length} EX</span>
                `;
            }

            macroCell.appendChild(groupHeader);

            // Esercizi dentro la Macro-Cella
            items.forEach(({ ex, exIdx }) => {
                const meta = resolveGymSchemeMeta(ex.repStr);
                const row = document.createElement('div');
                row.className = 'gym-ex-row';

                if (isEditingGymPlan) {
                    const nameInp = document.createElement('input');
                    nameInp.type = 'text';
                    nameInp.className = 'gym-edit-input';
                    nameInp.style.flex = '2';
                    nameInp.value = ex.name;
                    nameInp.onchange = () => { ex.name = nameInp.value.trim() || 'Exercise'; saveHealthData(); };

                    const schemeBtn = document.createElement('button');
                    schemeBtn.type = 'button';
                    schemeBtn.className = 'btn btn-sm';
                    schemeBtn.style.cssText = 'min-width: 120px; text-align: center;';
                    schemeBtn.textContent = `${ex.repStr} (${ex.sets} box)`;
                    schemeBtn.onclick = () => openExerciseConfigModal(dayNum, exIdx);

                    const delBtn = document.createElement('button');
                    delBtn.className = 'icon-btn delete';
                    delBtn.textContent = '[X]';
                    delBtn.onclick = () => {
                        gymPlan[dayNum].splice(exIdx, 1);
                        saveHealthData();
                        renderGymDashboard();
                    };

                    row.appendChild(nameInp);
                    row.appendChild(schemeBtn);
                    row.appendChild(delBtn);
                } else {
                    const info = document.createElement('div');
                    info.className = 'gym-ex-info';
                    info.style.cursor = 'pointer';
                    info.title = 'Clicca per configurare gruppo muscolare, schema ripetizioni o target attuale';
                    info.onclick = () => openExerciseConfigModal(dayNum, exIdx);

                    let progBadgeHtml = '';
                    if (meta.isProg) {
                        const curR = ex.currentReps || meta.minR || 5;
                        progBadgeHtml = `<span class="gym-prog-badge" style="display:inline-block; margin-left:6px; padding:1px 5px; border:1px solid var(--text-main); color:var(--text-main); font-weight:bold; font-size:0.65rem;" title="Target ripetizioni attuale (Clicca per avanzare 5→6→7→8)">[ORA: ${ex.sets}x${curR}]</span>`;
                    }

                    info.innerHTML = `
                        <span class="gym-ex-name">${escapeHtml(ex.name)}</span>
                        <span class="gym-ex-reps">${escapeHtml(ex.repStr)}${progBadgeHtml}</span>
                    `;

                    const badgeEl = info.querySelector('.gym-prog-badge');
                    if (badgeEl) {
                        badgeEl.onclick = (ev) => {
                            ev.stopPropagation();
                            const cur = ex.currentReps || 5;
                            ex.currentReps = cur >= 8 ? 5 : cur + 1;
                            saveHealthData();
                            renderGymDashboard();
                            if (ex.currentReps === 5 && typeof showToast === 'function') {
                                showToast(`[PROGRESSIONE ${ex.name}] Completato 8 rep! Riportato a ${ex.sets}x5: aumenta il peso!`);
                            }
                        };
                    }

                    const setsCont = document.createElement('div');
                    setsCont.className = 'gym-sets-container';

                    if (ex.sets > 0) {
                        for (let i = 0; i < ex.sets; i++) {
                            const inputId = `gw_${ex.id}_${i}`;
                            const wInp = document.createElement('input');
                            wInp.type = 'number';
                            wInp.step = '0.5';
                            wInp.className = 'gym-input no-spinners';
                            wInp.id = inputId;
                            wInp.placeholder = 'kg';
                            wInp.value = savedGymWeights[inputId] || '';
                            wInp.oninput = () => {
                                savedGymWeights[inputId] = wInp.value;
                                saveHealthData();
                            };
                            setsCont.appendChild(wInp);
                        }
                    } else {
                        setsCont.innerHTML = `<span style="font-size:var(--font-xs); color:var(--text-dim);">BW</span>`;
                    }

                    row.appendChild(info);
                    row.appendChild(setsCont);
                }

                macroCell.appendChild(row);
            });

            list.appendChild(macroCell);
        });

        card.appendChild(list);

        if (isEditingGymPlan) {
            const addGroupBtn = document.createElement('button');
            addGroupBtn.className = 'btn btn-sm';
            addGroupBtn.style.cssText = 'width: 100%; border-style: dashed; margin-top: 6px;';
            addGroupBtn.textContent = `+ Nuovo Gruppo Muscolare in ${dayInfo.acronym}`;
            addGroupBtn.onclick = () => {
                const gName = prompt('Nome del Gruppo Muscolare (es. Dorsali, Bicipiti, Gambe, Pettorali, Spalle, Tricipiti, Addome):', 'Nuovo Gruppo');
                if (gName && gName.trim()) {
                    gymPlan[dayNum].push({
                        id: `g${dayNum}_${Date.now()}`,
                        group: gName.trim(),
                        name: 'Nuovo Esercizio',
                        repStr: '3x5-8',
                        sets: 3,
                        currentReps: 5
                    });
                    saveHealthData();
                    renderGymDashboard();
                }
            };
            card.appendChild(addGroupBtn);
        }

        cardsWrap.appendChild(card);
    });

    container.appendChild(cardsWrap);
}

// ============================================================================
// SOTTO-MODULO 2: ROUTINE MULTI-ORARIO (ES. LUN/MAR/GIO 19:45 + SAB 16:00) & RESET
// ============================================================================

function renderGymSubRoutine(container) {
    const dayLabels = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
    const dayValues = [1, 2, 3, 4, 5, 6, 0];
    const info1 = getSplitDayMusclesInfo(1);
    const info2 = getSplitDayMusclesInfo(2);

    if (!Array.isArray(gymRoutine.timeWindows) || gymRoutine.timeWindows.length === 0) {
        gymRoutine.timeWindows = [
            { days: [1, 2, 4], start: "19:45", end: "21:15" },
            { days: [6], start: "16:00", end: "17:30" }
        ];
    }

    const wrap = document.createElement('div');
    wrap.style.cssText = 'flex:1; display:flex; flex-direction:column; gap:14px; overflow-y:auto; padding-right:4px;';

    wrap.innerHTML = `
        <!-- BOX 1: PUNTO DI PARTENZA & RESET STORICO PALESTRA -->
        <div class="cfg-box" style="margin-bottom:0; border-color:var(--border-bright);">
            <div class="sub-column-header" style="display:flex; justify-content:space-between; align-items:center;">
                <span>1. Punto di Partenza &amp; Reset Occorrenze</span>
                <span style="font-size:0.65rem; color:var(--accent-green);">ACTIVE NOW: ${escapeHtml(nextWorkoutDay === 1 ? info1.acronym : info2.acronym)}</span>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
                <div style="font-size:var(--font-xs); color:var(--text-muted);">
                    Scegli quale scheda impostare come punto di partenza da <strong>OGGI (${todayStr})</strong> cancellando le occorrenze precedenti:
                </div>
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                    <button type="button" class="btn btn-sm ${nextWorkoutDay === 1 ? 'btn-primary' : ''}" id="btn-reset-start-1">
                        [PARTI OGGI DA ${escapeHtml(info1.acronym)} &amp; PULISCI PASSATO]
                    </button>
                    <button type="button" class="btn btn-sm ${nextWorkoutDay === 2 ? 'btn-primary' : ''}" id="btn-reset-start-2">
                        [PARTI OGGI DA ${escapeHtml(info2.acronym)} &amp; PULISCI PASSATO]
                    </button>
                </div>
            </div>
        </div>

        <!-- BOX 2: FASCE ORARIE MULTIPLE (ES. LUN/MAR/GIO 19:45 + SAB 16:00) -->
        <div class="cfg-box" style="margin-bottom:0;">
            <div class="sub-column-header" style="display:flex; justify-content:space-between; align-items:center;">
                <span>2. Fasce Orarie Settimanali (Multi-Occorrenza)</span>
                <label style="font-size:var(--font-xs); cursor:pointer; display:flex; align-items:center; gap:6px;">
                    <input type="checkbox" id="gym-routine-enabled" ${gymRoutine.enabled !== false ? 'checked' : ''}>
                    <strong style="color:var(--text-main);">GENERA TASK "PALESTRA" SU PLANNER &amp; TASKS</strong>
                </label>
            </div>

            <div id="gym-tw-list" style="display:flex; flex-direction:column; gap:10px; margin-bottom:12px;"></div>

            <button type="button" id="btn-add-gym-tw" class="btn btn-sm" style="width:100%; border-style:dashed; margin-bottom:14px;">
                [+ AGGIUNGI FASCIA ORARIA (ES. SABATO 16:00)]
            </button>

            <div style="display:flex; gap:14px; flex-wrap:wrap; align-items:flex-end; border-top:1px solid var(--border-color); padding-top:12px;">
                <div class="form-group" style="margin-bottom:0; flex:1; min-width:140px;">
                    <label>Data Inizio Scheda (Start Date)</label>
                    <input type="date" id="gym-start-date" class="form-control form-control-sm" value="${gymStartDate || todayStr}">
                </div>
                <div class="form-group" style="margin-bottom:0; flex:1; min-width:140px;">
                    <label>Data Fine Scheda (End Date Opzionale)</label>
                    <input type="date" id="gym-end-date" class="form-control form-control-sm" value="${gymEndDate}">
                </div>
                <button type="button" id="btn-save-gym-routine" class="btn btn-primary btn-sm" style="height:31px;">
                    [SALVA ORARI &amp; AGGIORNA TASK PALESTRA]
                </button>
            </div>
        </div>
    `;

    container.appendChild(wrap);

    wrap.querySelector('#btn-reset-start-1').onclick = () => resetGymStartingPoint(1, true);
    wrap.querySelector('#btn-reset-start-2').onclick = () => resetGymStartingPoint(2, true);

    const twListEl = wrap.querySelector('#gym-tw-list');

    const renderTimeWindowsRows = () => {
        twListEl.innerHTML = '';
        gymRoutine.timeWindows.forEach((tw, idx) => {
            const row = document.createElement('div');
            row.className = 'gym-tw-row';
            row.style.cssText = 'border:1px solid var(--border-color); background:rgba(255,255,255,0.015); padding:10px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;';

            const daysHtml = dayValues.map((dVal, dIdx) => {
                const checked = Array.isArray(tw.days) && tw.days.includes(dVal) ? 'checked' : '';
                return `
                    <label class="type-radio" style="padding:5px 10px; flex:0 0 auto;">
                        <input type="checkbox" class="tw-day-cb" value="${dVal}" ${checked}>
                        ${dayLabels[dIdx]}
                    </label>
                `;
            }).join('');

            row.innerHTML = `
                <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center;">
                    <span style="font-size:var(--font-xs); color:var(--text-dim); font-weight:bold; margin-right:4px;">SLOT #${idx + 1}:</span>
                    ${daysHtml}
                </div>
                <div style="display:flex; align-items:center; gap:8px;">
                    <input type="time" class="form-control form-control-sm tw-start-inp" style="width:92px;" value="${tw.start || '19:45'}">
                    <span style="color:var(--text-dim);">-</span>
                    <input type="time" class="form-control form-control-sm tw-end-inp" style="width:92px;" value="${tw.end || '21:15'}">
                    <button type="button" class="icon-btn delete btn-del-tw" title="Rimuovi fascia oraria">[X]</button>
                </div>
            `;

            row.querySelector('.btn-del-tw').onclick = () => {
                gymRoutine.timeWindows.splice(idx, 1);
                renderTimeWindowsRows();
            };

            twListEl.appendChild(row);
        });
    };

    renderTimeWindowsRows();

    const readDomWindowsIntoState = () => {
        const collected = [];
        twListEl.querySelectorAll('.gym-tw-row').forEach(r => {
            const days = [];
            r.querySelectorAll('.tw-day-cb:checked').forEach(cb => days.push(parseInt(cb.value, 10)));
            const st = r.querySelector('.tw-start-inp').value || '19:45';
            const en = r.querySelector('.tw-end-inp').value || '21:15';
            if (days.length > 0 && st && en) {
                collected.push({ days, start: st, end: en });
            }
        });
        return collected;
    };

    wrap.querySelector('#btn-add-gym-tw').onclick = () => {
        gymRoutine.timeWindows = readDomWindowsIntoState();
        gymRoutine.timeWindows.push({ days: [6], start: '16:00', end: '17:30' });
        renderTimeWindowsRows();
    };

    wrap.querySelector('#btn-save-gym-routine').onclick = () => {
        gymRoutine.enabled = wrap.querySelector('#gym-routine-enabled').checked;
        gymRoutine.timeWindows = readDomWindowsIntoState();
        gymStartDate = wrap.querySelector('#gym-start-date').value || todayStr;
        gymEndDate = wrap.querySelector('#gym-end-date').value || '';

        saveHealthData();
        updateGymDates();
        syncGymRoutineTask(true);
        renderGymDashboard();
    };
}

// ============================================================================
// MODALE 1: CONFIGURATORE SINGOLO ESERCIZIO (GRUPPO MUSCOLARE, SCHEMA & REP 5-8)
// ============================================================================

function ensureGymModalsExist() {
    const root = document.getElementById('modals-root');
    if (!root) return;

    if (!document.getElementById('gymExerciseConfigModal')) {
        const exModal = document.createElement('div');
        exModal.id = 'gymExerciseConfigModal';
        exModal.className = 'modal-overlay';
        exModal.onclick = (e) => { if (e.target === exModal) closeModals(); };
        exModal.innerHTML = `
            <div class="modal-content" style="width: 540px; max-width: 95%;">
                <h2 id="gym-ex-cfg-title">Configura Esercizio</h2>
                <div id="gym-ex-cfg-body" style="display:flex; flex-direction:column; gap:14px;"></div>
            </div>
        `;
        root.appendChild(exModal);
    }

    if (!document.getElementById('gymWorkoutReviewModal')) {
        const revModal = document.createElement('div');
        revModal.id = 'gymWorkoutReviewModal';
        revModal.className = 'modal-overlay';
        revModal.onclick = (e) => { if (e.target === revModal) closeModals(); };
        revModal.innerHTML = `
            <div class="modal-content" style="width: 700px; max-width: 96%; max-height: 88vh; display:flex; flex-direction:column;">
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-color); padding-bottom:10px; margin-bottom:12px;">
                    <div>
                        <h2 id="gym-rev-title" style="margin:0; border:none; padding:0;">Revisione Fine Allenamento</h2>
                        <span style="font-size:var(--font-xs); color:var(--text-dim);">SCEGLI LA SCHEDA SVOLTA OGGI E CONFERMA O AGGIORNA PESI / RIPETIZIONI</span>
                    </div>
                    <button type="button" class="btn btn-sm" onclick="closeModals()">[ESC]</button>
                </div>
                <div id="gym-rev-body" style="flex:1; overflow-y:auto; display:flex; flex-direction:column; gap:12px; padding-right:4px;"></div>
            </div>
        `;
        root.appendChild(revModal);
    }
}

function openExerciseConfigModal(dayNum, exIdx) {
    ensureGymModalsExist();
    const ex = gymPlan[dayNum] && gymPlan[dayNum][exIdx];
    if (!ex) return;

    const modal = document.getElementById('gymExerciseConfigModal');
    const body = document.getElementById('gym-ex-cfg-body');
    const meta = resolveGymSchemeMeta(ex.repStr);

    let selectedGroup = ex.group || 'Generale';
    let selectedRepStr = ex.repStr;
    let selectedSets = ex.sets;
    let selectedCurReps = ex.currentReps || meta.minR || 5;

    const renderConfigContent = () => {
        const curMeta = resolveGymSchemeMeta(selectedRepStr);

        body.innerHTML = `
            <div style="display:flex; gap:10px;">
                <div class="form-group" style="flex:1; margin-bottom:0;">
                    <label>Gruppo Muscolare (Macro-Cella)</label>
                    <input type="text" id="cfg-ex-group" class="form-control form-control-sm" value="${escapeHtml(selectedGroup)}" placeholder="es. Dorsali, Bicipiti, Gambe...">
                </div>
                <div class="form-group" style="flex:2; margin-bottom:0;">
                    <label>Nome Esercizio</label>
                    <input type="text" id="cfg-ex-name" class="form-control form-control-sm" value="${escapeHtml(ex.name)}">
                </div>
            </div>

            <div>
                <label style="font-size:var(--font-xs); color:var(--text-dim); text-transform:uppercase; display:block; margin-bottom:6px;">
                    1. Scegli Tipo di Ripetizioni (Genera automaticamente le caselle)
                </label>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:6px;" id="cfg-scheme-grid"></div>
            </div>

            <div style="display:flex; gap:10px; align-items:flex-end;">
                <div class="form-group" style="flex:2; margin-bottom:0;">
                    <label>Stringa Ripetizioni Personalizzata</label>
                    <input type="text" id="cfg-ex-repstr" class="form-control form-control-sm" value="${escapeHtml(selectedRepStr)}">
                </div>
                <div class="form-group" style="flex:1; margin-bottom:0;">
                    <label>N° Caselle Peso</label>
                    <input type="number" id="cfg-ex-sets" class="form-control form-control-sm no-spinners" min="0" max="10" value="${selectedSets}">
                </div>
            </div>

            <div id="cfg-prog-section" style="display:${curMeta.isProg ? 'block' : 'none'}; padding:10px; border:1px solid var(--border-bright); background:rgba(255,255,255,0.03);">
                <label style="font-size:var(--font-xs); color:var(--text-main); font-weight:bold; text-transform:uppercase; display:block; margin-bottom:8px;">
                    2. Progressione ${selectedSets}x5-8 // Ripetizioni Attuali da Eseguire:
                </label>
                <div style="display:flex; gap:8px;" id="cfg-prog-btns">
                    ${[5, 6, 7, 8].map(r => `
                        <button type="button" class="btn btn-sm ${selectedCurReps === r ? 'btn-primary' : ''}" data-rep="${r}" style="flex:1;">
                            ${selectedSets}x${r}
                        </button>
                    `).join('')}
                </div>
            </div>

            <div style="padding:10px; border:1px solid var(--border-color); background:rgba(255,255,255,0.015);">
                <label style="font-size:var(--font-xs); color:var(--text-dim); text-transform:uppercase; display:block; margin-bottom:8px;">
                    3. Caselle Peso Attuali (${selectedSets} serie)
                </label>
                <div id="cfg-weights-preview" style="display:flex; gap:8px; align-items:center;"></div>
            </div>

            <div class="modal-actions" style="margin-top:6px;">
                <button type="button" class="btn" onclick="closeModals()">Annulla</button>
                <button type="button" class="btn btn-primary" id="btn-save-ex-cfg">[SALVA ESERCIZIO]</button>
            </div>
        `;

        const grid = body.querySelector('#cfg-scheme-grid');
        GYM_REP_SCHEMES.forEach(sc => {
            const isSel = sc.label.toLowerCase() === selectedRepStr.toLowerCase();
            const b = document.createElement('button');
            b.type = 'button';
            b.className = `btn btn-sm ${isSel ? 'btn-primary' : ''}`;
            b.style.textAlign = 'left';
            b.innerHTML = `<div style="font-weight:bold;">${escapeHtml(sc.label)}</div><div style="font-size:0.62rem; opacity:0.75;">${sc.sets} caselle</div>`;
            b.onclick = () => {
                selectedGroup = body.querySelector('#cfg-ex-group').value.trim() || selectedGroup;
                ex.name = body.querySelector('#cfg-ex-name').value.trim() || ex.name;
                selectedRepStr = sc.label;
                selectedSets = sc.sets;
                if (sc.isProg && (!selectedCurReps || selectedCurReps < 5 || selectedCurReps > 8)) {
                    selectedCurReps = 5;
                }
                renderConfigContent();
            };
            grid.appendChild(b);
        });

        const repInp = body.querySelector('#cfg-ex-repstr');
        const setsInp = body.querySelector('#cfg-ex-sets');
        repInp.oninput = () => {
            selectedRepStr = repInp.value;
            const autoM = resolveGymSchemeMeta(selectedRepStr);
            selectedSets = autoM.sets;
            setsInp.value = selectedSets;
            body.querySelector('#cfg-prog-section').style.display = autoM.isProg ? 'block' : 'none';
        };
        setsInp.oninput = () => {
            selectedSets = Math.max(0, Math.min(10, parseInt(setsInp.value, 10) || 0));
        };

        body.querySelectorAll('#cfg-prog-btns button').forEach(btn => {
            btn.onclick = () => {
                selectedGroup = body.querySelector('#cfg-ex-group').value.trim() || selectedGroup;
                ex.name = body.querySelector('#cfg-ex-name').value.trim() || ex.name;
                selectedCurReps = parseInt(btn.dataset.rep, 10);
                renderConfigContent();
            };
        });

        const wCont = body.querySelector('#cfg-weights-preview');
        if (selectedSets > 0) {
            for (let i = 0; i < selectedSets; i++) {
                const wKey = `gw_${ex.id}_${i}`;
                const inp = document.createElement('input');
                inp.type = 'number';
                inp.step = '0.5';
                inp.className = 'gym-input no-spinners';
                inp.style.width = '58px';
                inp.placeholder = `S${i + 1} kg`;
                inp.value = savedGymWeights[wKey] || '';
                inp.oninput = () => {
                    savedGymWeights[wKey] = inp.value;
                };
                wCont.appendChild(inp);
            }
        } else {
            wCont.innerHTML = '<span style="font-size:var(--font-xs); color:var(--text-dim);">Corpo Libero (BW — 0 caselle peso)</span>';
        }

        body.querySelector('#btn-save-ex-cfg').onclick = () => {
            ex.group = body.querySelector('#cfg-ex-group').value.trim() || 'Generale';
            ex.name = body.querySelector('#cfg-ex-name').value.trim() || 'Esercizio';
            ex.repStr = body.querySelector('#cfg-ex-repstr').value.trim() || '3x10';
            ex.sets = Math.max(0, Math.min(10, parseInt(body.querySelector('#cfg-ex-sets').value, 10) || 0));
            const finalMeta = resolveGymSchemeMeta(ex.repStr);
            if (finalMeta.isProg) {
                ex.currentReps = selectedCurReps || 5;
            }
            saveHealthData();
            closeModals();
            renderGymDashboard();
            if (typeof showToast === 'function') showToast(`[GYM] Aggiornato "${ex.name}" in [${ex.group}]`);
        };
    };

    renderConfigContent();
    closeModals();
    modal.style.display = 'flex';
}

// ============================================================================
// MODALE 2: REVISIONE FINE ALLENAMENTO CON SCELTA SCHEDA SVOLTA OGGI
// ============================================================================

function openGymWorkoutReviewModal(targetDateStr = selectedDateStr, dayNum = nextWorkoutDay) {
    ensureGymModalsExist();
    migrateExistingGymPlanStructure();

    pendingReviewDateStr = targetDateStr || todayStr;
    const modal = document.getElementById('gymWorkoutReviewModal');
    const titleEl = document.getElementById('gym-rev-title');
    const body = document.getElementById('gym-rev-body');
    if (!modal || !body) return;

    const info1 = getSplitDayMusclesInfo(1);
    const info2 = getSplitDayMusclesInfo(2);
    const curInfo = dayNum === 1 ? info1 : info2;
    const nextInfo = dayNum === 1 ? info2 : info1;

    if (titleEl) {
        titleEl.textContent = `Fine Allenamento // Scheda ${curInfo.acronym} (${pendingReviewDateStr})`;
    }

    body.innerHTML = '';

    // 0. SELETTORE IN TESTA: "QUALE SCHEDA HAI FATTO OGGI?" (Così se eri rimasto su Giorno 2 ma oggi hai fatto Giorno 1, cambi con 1 click!)
    const switchSplitBar = document.createElement('div');
    switchSplitBar.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:8px 12px; background:#080808; border:1px solid var(--border-color); flex-wrap:wrap; gap:8px;';
    switchSplitBar.innerHTML = `
        <span style="font-size:var(--font-xs); color:var(--text-muted); font-weight:bold;">QUALE SCHEDA HAI SVOLTO OGGI?</span>
        <div style="display:flex; gap:6px;">
            <button type="button" class="btn btn-sm ${dayNum === 1 ? 'btn-primary' : ''}" id="rev-pick-split-1">
                [HO FATTO ${escapeHtml(info1.acronym)} (${escapeHtml(info1.fullLabel)})]
            </button>
            <button type="button" class="btn btn-sm ${dayNum === 2 ? 'btn-primary' : ''}" id="rev-pick-split-2">
                [HO FATTO ${escapeHtml(info2.acronym)} (${escapeHtml(info2.fullLabel)})]
            </button>
        </div>
    `;
    switchSplitBar.querySelector('#rev-pick-split-1').onclick = () => {
        nextWorkoutDay = 1;
        saveHealthData();
        openGymWorkoutReviewModal(pendingReviewDateStr, 1);
    };
    switchSplitBar.querySelector('#rev-pick-split-2').onclick = () => {
        nextWorkoutDay = 2;
        saveHealthData();
        openGymWorkoutReviewModal(pendingReviewDateStr, 2);
    };
    body.appendChild(switchSplitBar);

    // 1. BOTTONE HERO: PESI E RIPETIZIONI INVARIATI
    const unchangedBox = document.createElement('div');
    unchangedBox.style.cssText = 'padding:12px; border:1px solid var(--border-bright); background:rgba(255,255,255,0.03); display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;';
    unchangedBox.innerHTML = `
        <div>
            <div style="font-size:var(--font-sm); font-weight:bold; color:var(--text-main);">Hai lasciato i pesi e le ripetizioni invariati su ${escapeHtml(curInfo.acronym)}?</div>
            <div style="font-size:var(--font-xs); color:var(--text-dim);">Spunta la task Palestra di oggi e imposta il prossimo allenamento su <strong>${escapeHtml(nextInfo.acronym)}</strong>.</div>
        </div>
        <button type="button" class="btn btn-primary" id="btn-gym-rev-unchanged">[PESI INVARIATI // CONFERMA ${escapeHtml(curInfo.acronym)}]</button>
    `;
    unchangedBox.querySelector('#btn-gym-rev-unchanged').onclick = () => {
        finalizeGymWorkoutCompletion(dayNum, pendingReviewDateStr);
    };
    body.appendChild(unchangedBox);

    // 2. LISTA ESERCIZI RAGGRUPPATI PER MUSCOLO PER REGISTRARE PROGRESSI
    const exercises = gymPlan[dayNum] || [];
    const exListWrap = document.createElement('div');
    exListWrap.style.cssText = 'display:flex; flex-direction:column; gap:10px;';

    const groupedMap = new Map();
    exercises.forEach(ex => {
        const gName = (ex.group || 'Generale').trim();
        if (!groupedMap.has(gName)) groupedMap.set(gName, []);
        groupedMap.get(gName).push(ex);
    });

    groupedMap.forEach((groupExercises, groupName) => {
        const groupBox = document.createElement('div');
        groupBox.style.cssText = 'border:1px solid var(--border-color); padding:8px 10px; background:rgba(255,255,255,0.01); display:flex; flex-direction:column; gap:6px;';
        groupBox.innerHTML = `<div style="font-size:var(--font-xs); font-weight:bold; color:var(--text-dim); text-transform:uppercase; border-bottom:1px solid var(--border-color); padding-bottom:4px;">// ${escapeHtml(groupName)}</div>`;

        groupExercises.forEach(ex => {
            const meta = resolveGymSchemeMeta(ex.repStr);
            const row = document.createElement('div');
            row.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:6px 0; border-bottom:1px dotted rgba(255,255,255,0.06); gap:10px; flex-wrap:wrap;';

            const leftCol = document.createElement('div');
            leftCol.style.cssText = 'flex:1; min-width:170px;';
            leftCol.innerHTML = `
                <div style="font-size:var(--font-sm); font-weight:bold; color:var(--text-main);">${escapeHtml(ex.name)}</div>
                <div style="font-size:var(--font-xs); color:var(--text-dim);">${escapeHtml(ex.repStr)}</div>
            `;

            const rightCol = document.createElement('div');
            rightCol.style.cssText = 'display:flex; align-items:center; gap:10px; flex-wrap:wrap;';

            if (meta.isProg) {
                if (!ex.currentReps) ex.currentReps = 5;
                const progCtrl = document.createElement('div');
                progCtrl.style.cssText = 'display:flex; align-items:center; gap:4px; padding:3px 6px; border:1px solid var(--border-bright); background:#050505;';

                const renderProgCtrl = (bumpedWeightNotice = false) => {
                    const cur = ex.currentReps || 5;
                    progCtrl.innerHTML = `
                        <button type="button" class="icon-btn btn-rep-minus" title="Riduci ripetizioni">[-]</button>
                        <span style="font-size:var(--font-xs); font-weight:bold; color:${bumpedWeightNotice ? 'var(--accent-green)' : 'var(--text-main)'}; min-width:64px; text-align:center;">
                            ${ex.sets}x${cur} ${bumpedWeightNotice ? '[+KG!]' : ''}
                        </span>
                        <button type="button" class="btn btn-sm btn-rep-plus" style="padding:2px 6px;" title="Aumenta di +1 ripetizione">[+1 REP]</button>
                    `;
                    progCtrl.querySelector('.btn-rep-minus').onclick = () => {
                        ex.currentReps = Math.max(5, (ex.currentReps || 5) - 1);
                        renderProgCtrl(false);
                    };
                    progCtrl.querySelector('.btn-rep-plus').onclick = () => {
                        if ((ex.currentReps || 5) >= 8) {
                            ex.currentReps = 5;
                            renderProgCtrl(true);
                        } else {
                            ex.currentReps = (ex.currentReps || 5) + 1;
                            renderProgCtrl(false);
                        }
                    };
                };
                renderProgCtrl(false);
                rightCol.appendChild(progCtrl);
            }

            const wBox = document.createElement('div');
            wBox.style.cssText = 'display:flex; gap:5px; align-items:center;';

            if (ex.sets > 0) {
                for (let i = 0; i < ex.sets; i++) {
                    const inputId = `gw_${ex.id}_${i}`;
                    const inp = document.createElement('input');
                    inp.type = 'number';
                    inp.step = '0.5';
                    inp.className = 'gym-input no-spinners';
                    inp.style.width = '46px';
                    inp.placeholder = 'kg';
                    inp.value = savedGymWeights[inputId] || '';
                    inp.oninput = () => {
                        savedGymWeights[inputId] = inp.value;
                    };
                    wBox.appendChild(inp);
                }
            } else {
                wBox.innerHTML = '<span style="font-size:var(--font-xs); color:var(--text-dim);">BW</span>';
            }

            rightCol.appendChild(wBox);
            row.appendChild(leftCol);
            row.appendChild(rightCol);
            groupBox.appendChild(row);
        });

        exListWrap.appendChild(groupBox);
    });

    body.appendChild(exListWrap);

    const footer = document.createElement('div');
    footer.className = 'modal-actions';
    footer.style.marginTop = '10px';
    footer.innerHTML = `
        <button type="button" class="btn" onclick="closeModals()">Annulla</button>
        <button type="button" class="btn btn-primary" id="btn-gym-rev-save">[SALVA PROGRESSI &amp; COMPLETA ${escapeHtml(curInfo.acronym)}]</button>
    `;
    footer.querySelector('#btn-gym-rev-save').onclick = () => {
        finalizeGymWorkoutCompletion(dayNum, pendingReviewDateStr);
    };
    body.appendChild(footer);

    closeModals();
    modal.style.display = 'flex';
}

function finalizeGymWorkoutCompletion(dayNum = nextWorkoutDay, dateStr = todayStr) {
    const targetDate = dateStr || todayStr;
    const completedInfo = getSplitDayMusclesInfo(dayNum);

    let gymTask = templates.find(t => isGymRoutineTask(t));
    if (!gymTask) {
        syncGymRoutineTask(false);
        gymTask = templates.find(t => isGymRoutineTask(t));
    }

    if (gymTask) {
        if (!logs[targetDate]) logs[targetDate] = {};
        logs[targetDate][gymTask.id] = [true];
    }

    nextWorkoutDay = (dayNum === 1) ? 2 : 1;
    const nextInfo = getSplitDayMusclesInfo(nextWorkoutDay);

    saveHealthData();
    saveData();
    closeModals();

    renderGymDashboard();
    if (typeof renderTasks === 'function') renderTasks();
    if (typeof renderTracker === 'function') renderTracker();
    if (typeof renderCalendarDaySummary === 'function') renderCalendarDaySummary();

    if (typeof showToast === 'function') {
        showToast(`[GYM] Completata scheda ${completedInfo.acronym} · Prossimo turno: ${nextInfo.acronym}`);
    }
}

function completeWorkout(dayNum = nextWorkoutDay) {
    openGymWorkoutReviewModal(selectedDateStr || todayStr, dayNum);
}

function updateGymDates() {
    const sEl = document.getElementById('gym-start-date');
    const eEl = document.getElementById('gym-end-date');
    if (sEl) gymStartDate = sEl.value;
    if (eEl) gymEndDate = eEl.value;
    saveHealthData();

    specificEvents = specificEvents.filter(e => e.id !== 'gym_start_evt' && e.id !== 'gym_end_evt');
    if (gymStartDate) specificEvents.push({ id: 'gym_start_evt', date: gymStartDate, title: 'Workout Split Start', category: 'Health', color: '#5f7a61' });
    if (gymEndDate) specificEvents.push({ id: 'gym_end_evt', date: gymEndDate, title: 'Workout Split End', category: 'Health', color: '#ff5555' });
    saveData();

    if (typeof renderCalendar === 'function') renderCalendar();
    if (typeof renderTasks === 'function') renderTasks();
    if (typeof renderWeeklyPlanner === 'function') renderWeeklyPlanner();
}

window.addEventListener('DOMContentLoaded', () => {
    migrateExistingGymPlanStructure();
    syncGymRoutineTask(false);
    renderGymDashboard();
});