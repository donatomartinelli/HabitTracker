// --- js/modules/gym.js ---
// ATOMIC MODULE 6 & SUB-MODULES:
// - gym_today (#module-gym-today): Allenamento del giorno selezionato o "[ NO TRAINING SCHEDULED FOR THIS DATE ]"
// - gym_split (#module-gym-split): Panoramica completa delle 2 schede
// - [⚙] Gym Settings Modal: Gestione Gruppi Muscolari, Assegnazione Esercizi, Routine & Orari

const GYM_REP_SCHEMES = [
    { label: '4x5-8', sets: 4, isProg: true, minR: 5, maxR: 8 },
    { label: '3x5-8', sets: 3, isProg: true, minR: 5, maxR: 8 },
    { label: '10-8-8', sets: 3, isProg: false },
    { label: '8-8-6', sets: 3, isProg: false },
    { label: '12-12-10', sets: 3, isProg: false },
    { label: '2x12 + 1xmax - 20%', sets: 3, isProg: false },
    { label: '2x12 + 10 parziali', sets: 3, isProg: false },
    { label: '3xMax', sets: 0, isProg: false }
];

let pendingReviewDateStr = null;
let forcedTrainingDates = new Set();
let activeGymSettingsTab = 'gcfg-split';
let editingSettingsSplitDay = 1;

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

    if (clean.toLowerCase().includes('2x12')) return { label: clean, sets: 3, isProg: false };
    if (/^\d+\s*-\s*\d+\s*-\s*\d+/.test(clean)) return { label: clean, sets: 3, isProg: false };
    if (clean.toLowerCase().includes('max') && !clean.toLowerCase().includes('2x12')) return { label: clean, sets: 0, isProg: false };
    const simpleSets = clean.match(/^(\d+)\s*x/i);
    if (simpleSets) return { label: clean, sets: parseInt(simpleSets[1], 10) || 3, isProg: false };
    return { label: clean || '3x10', sets: 3, isProg: false };
}

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

function getSplitDayMusclesInfo(dayNum) {
    const list = gymPlan[dayNum] || [];
    const groups = [];
    list.forEach(ex => {
        const g = (ex.group || 'Generale').trim();
        if (g && !groups.includes(g)) groups.push(g);
    });

    if (groups.length === 0) {
        return { acronym: `S${dayNum}`, fullLabel: `SPLIT ${dayNum}`, groups: [] };
    }

    const mainGroups = groups.filter(g => !g.toLowerCase().startsWith('addom'));
    const acronymSource = mainGroups.length > 0 ? mainGroups : groups;
    const acronym = acronymSource.map(g => g.charAt(0).toUpperCase()).join('');
    const fullLabel = acronymSource.map(g => g.toUpperCase()).join(' · ');

    return { acronym, fullLabel, groups };
}

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

// Verifica se in una determinata data è previsto allenamento secondo la Routine Palestra
function isGymTrainingScheduledOnDate(dateStr) {
    if (forcedTrainingDates.has(dateStr)) return true;
    const gymTask = templates.find(t => isGymRoutineTask(t));
    if (gymTask) {
        if (logs[dateStr] && logs[dateStr][gymTask.id] && logs[dateStr][gymTask.id].some(Boolean)) {
            return true;
        }
        return isTaskActiveOnDate(gymTask, dateStr);
    }
    if (gymRoutine.enabled === false) return false;
    if (gymStartDate && dateStr < gymStartDate) return false;
    if (gymEndDate && dateStr > gymEndDate) return false;

    const dayIdx = parseLocalDate(dateStr).getDay();
    return (gymRoutine.timeWindows || []).some(tw => Array.isArray(tw.days) && tw.days.includes(dayIdx));
}

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
        showToast('[GYM] Schedule updated');
    }
}

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
        showToast(`[GYM RESET] Starting today on ${info.acronym}`);
    }
}

// Funzione master che aggiorna tutti i sottomoduli Gym
function renderGymDashboard() {
    migrateExistingGymPlanStructure();
    ensureGymModalsExist();

    renderGymAtomToday();
    renderGymAtomSplit();

    const legacyRoot = document.getElementById('gym-main-root');
    if (legacyRoot) {
        renderGymAtomSplit(legacyRoot);
    }
}

// Costruisce una card Scheda Allenamento (per Giorno 1 o Giorno 2)
function buildGymSplitCardDom(dayNum, dateStrForCompletion = todayStr, isSingleTodayView = false) {
    if (!gymPlan[dayNum]) gymPlan[dayNum] = [];
    const isActive = (dayNum === nextWorkoutDay);
    const dayInfo = getSplitDayMusclesInfo(dayNum);

    const card = document.createElement('div');
    card.className = `gym-day-card ${isSingleTodayView || isActive ? 'gym-day-active' : 'gym-day-inactive'}`;

    const header = document.createElement('div');
    header.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; border-bottom: 1px solid var(--border-color); padding-bottom: 8px; gap: 8px; flex-wrap: wrap;';

    const titleWrap = document.createElement('div');
    titleWrap.style.cursor = 'pointer';
    titleWrap.onclick = () => {
        nextWorkoutDay = dayNum;
        saveHealthData();
        renderGymDashboard();
    };

    titleWrap.innerHTML = `
        <div style="display:flex; align-items:baseline; gap:8px;">
            <span style="font-size:var(--font-md); font-weight:bold; color:${(isSingleTodayView || isActive) ? 'var(--text-main)' : 'var(--text-dim)'}; letter-spacing:1px;">
                ${escapeHtml(dayInfo.acronym)}
            </span>
            <span style="font-size:var(--font-xs); color:var(--text-dim);">
                // ${escapeHtml(dayInfo.fullLabel)}
            </span>
        </div>
    `;
    header.appendChild(titleWrap);

    if (isSingleTodayView || isActive) {
        const doneBtn = document.createElement('button');
        doneBtn.className = 'btn btn-primary btn-sm';
        doneBtn.textContent = `[DONE ${dayInfo.acronym}]`;
        doneBtn.onclick = () => openGymWorkoutReviewModal(dateStrForCompletion, dayNum);
        header.appendChild(doneBtn);
    }

    card.appendChild(header);

    const list = document.createElement('div');
    list.className = 'gym-ex-list';
    list.style.cssText = 'display:flex; flex-direction:column; gap:10px;';

    const groupedMap = new Map();
    gymPlan[dayNum].forEach((ex, exIdx) => {
        const gName = (ex.group || 'Generale').trim();
        if (!groupedMap.has(gName)) groupedMap.set(gName, []);
        groupedMap.get(gName).push({ ex, exIdx });
    });

    groupedMap.forEach((items, groupName) => {
        const macroCell = document.createElement('div');
        macroCell.style.cssText = 'border: 1px solid var(--border-color); background: rgba(255,255,255,0.02); padding: 8px 10px; display: flex; flex-direction: column; gap: 4px;';

        const groupHeader = document.createElement('div');
        groupHeader.style.cssText = 'display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-color); padding-bottom:4px; margin-bottom:2px;';
        groupHeader.innerHTML = `
            <span style="font-size:var(--font-xs); font-weight:bold; color:var(--text-main); text-transform:uppercase; letter-spacing:1px;">
                // ${escapeHtml(groupName)}
            </span>
        `;
        macroCell.appendChild(groupHeader);

        items.forEach(({ ex, exIdx }) => {
            const meta = resolveGymSchemeMeta(ex.repStr);
            const row = document.createElement('div');
            row.className = 'gym-ex-row';

            const info = document.createElement('div');
            info.className = 'gym-ex-info';
            info.style.cursor = 'pointer';
            info.onclick = () => openExerciseConfigModal(dayNum, exIdx);

            let progBadgeHtml = '';
            if (meta.isProg) {
                const curR = ex.currentReps || meta.minR || 5;
                progBadgeHtml = `<span class="gym-prog-badge" style="display:inline-block; margin-left:6px; padding:1px 5px; border:1px solid var(--text-main); color:var(--text-main); font-weight:bold; font-size:0.65rem;">[${ex.sets}x${curR}]</span>`;
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
            macroCell.appendChild(row);
        });

        list.appendChild(macroCell);
    });

    card.appendChild(list);
    return card;
}

// ============================================================================
// SOTTO-MODULO 1: GYM: TODAY WORKOUT (#module-gym-today) — SINCRONIZZATO CON <- / -> / T
// ============================================================================

function renderGymAtomToday() {
    const root = document.getElementById('module-gym-today');
    if (!root) return;

    const info1 = getSplitDayMusclesInfo(1);
    const info2 = getSplitDayMusclesInfo(2);
    const activeInfo = nextWorkoutDay === 1 ? info1 : info2;
    const isScheduled = isGymTrainingScheduledOnDate(selectedDateStr);

    root.innerHTML = `
        <div class="module-body-padded" style="flex:1; display:flex; flex-direction:column; gap:12px; overflow:hidden; min-height:0;">
            <div class="section-header-row" style="margin-bottom:0; flex-shrink:0;">
                <div>
                    <span class="section-label">Gym</span>
                    <span style="font-size:var(--font-xs); color:var(--text-dim); margin-left:6px;">// ${selectedDateStr} (${escapeHtml(activeInfo.acronym)})</span>
                </div>
                <div style="display:flex; gap:6px; align-items:center;">
                    <button type="button" class="btn btn-sm ${nextWorkoutDay === 1 ? 'btn-primary' : ''}" id="gt-sw-1">[${escapeHtml(info1.acronym)}]</button>
                    <button type="button" class="btn btn-sm ${nextWorkoutDay === 2 ? 'btn-primary' : ''}" id="gt-sw-2">[${escapeHtml(info2.acronym)}]</button>
                    <button type="button" class="btn btn-sm" onclick="openGymSettingsModal()">[⚙]</button>
                </div>
            </div>
            <div id="gym-today-body" style="flex:1; display:flex; flex-direction:column; min-height:0; overflow:hidden;"></div>
        </div>
    `;

    root.querySelector('#gt-sw-1').onclick = () => {
        nextWorkoutDay = 1;
        saveHealthData();
        renderGymDashboard();
    };
    root.querySelector('#gt-sw-2').onclick = () => {
        nextWorkoutDay = 2;
        saveHealthData();
        renderGymDashboard();
    };

    const body = root.querySelector('#gym-today-body');
    if (!isScheduled) {
        body.innerHTML = `
            <div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px; border:1px dashed var(--border-color); background:rgba(255,255,255,0.01);">
                <div class="empty-state" style="padding:0;">[ NO TRAINING SCHEDULED FOR THIS DATE ]</div>
                <button type="button" class="btn btn-sm" id="btn-force-train-today">[TRAIN ANYWAY]</button>
            </div>
        `;
        body.querySelector('#btn-force-train-today').onclick = () => {
            forcedTrainingDates.add(selectedDateStr);
            renderGymAtomToday();
        };
    } else {
        body.appendChild(buildGymSplitCardDom(nextWorkoutDay, selectedDateStr, true));
    }
}

// ============================================================================
// SOTTO-MODULO 2: GYM: FULL SPLIT (#module-gym-split)
// ============================================================================

function renderGymAtomSplit(customContainer = null) {
    const root = customContainer || document.getElementById('module-gym-split');
    if (!root) return;

    const info1 = getSplitDayMusclesInfo(1);
    const info2 = getSplitDayMusclesInfo(2);
    const activeInfo = nextWorkoutDay === 1 ? info1 : info2;

    const innerWrap = document.createElement('div');
    innerWrap.className = customContainer ? '' : 'module-body-padded';
    innerWrap.style.cssText = 'flex:1; display:flex; flex-direction:column; gap:12px; overflow:hidden; min-height:0; height:100%;';

    innerWrap.innerHTML = `
        <div class="section-header-row" style="margin-bottom:0; flex-shrink:0;">
            <div>
                <span class="section-label">Gym Split</span>
                <span style="font-size:var(--font-xs); color:var(--text-dim); margin-left:6px;">// ACTIVE: ${escapeHtml(activeInfo.acronym)}</span>
            </div>
            <div style="display:flex; gap:6px; align-items:center;">
                <button type="button" class="btn btn-sm ${nextWorkoutDay === 1 ? 'btn-primary' : ''}" id="gs-sw-1">[${escapeHtml(info1.acronym)}]</button>
                <button type="button" class="btn btn-sm ${nextWorkoutDay === 2 ? 'btn-primary' : ''}" id="gs-sw-2">[${escapeHtml(info2.acronym)}]</button>
                <button type="button" class="btn btn-sm" onclick="openGymSettingsModal()">[⚙]</button>
            </div>
        </div>
        <div id="gym-split-cards-row" style="flex:1; display:flex; flex-direction:row; gap:16px; overflow:hidden; min-height:0;"></div>
    `;

    innerWrap.querySelector('#gs-sw-1').onclick = () => {
        nextWorkoutDay = 1;
        saveHealthData();
        renderGymDashboard();
    };
    innerWrap.querySelector('#gs-sw-2').onclick = () => {
        nextWorkoutDay = 2;
        saveHealthData();
        renderGymDashboard();
    };

    const row = innerWrap.querySelector('#gym-split-cards-row');
    row.appendChild(buildGymSplitCardDom(1, selectedDateStr, false));
    row.appendChild(buildGymSplitCardDom(2, selectedDateStr, false));

    root.innerHTML = '';
    root.appendChild(innerWrap);
}

// ============================================================================
// MODALE [⚙] GYM SETTINGS: GESTIONE SCHEDE/MUSCOLI E ROUTINE/ORARI
// ============================================================================

function ensureGymModalsExist() {
    const root = document.getElementById('modals-root');
    if (!root) return;

    if (!document.getElementById('gymSettingsModal')) {
        const gsModal = document.createElement('div');
        gsModal.id = 'gymSettingsModal';
        gsModal.className = 'modal-overlay';
        gsModal.onclick = (e) => { if (e.target === gsModal) closeModals(); };
        gsModal.innerHTML = `
            <div class="modal-content settings-modal-box">
                <div class="settings-top-bar">
                    <h2 style="margin:0; border:none; padding:0;">Gym Settings</h2>
                    <button type="button" class="btn btn-sm" onclick="closeModals(); renderGymDashboard();">[ESC]</button>
                </div>
                <div class="settings-body-split">
                    <div class="settings-sidebar">
                        <div>
                            <button type="button" class="settings-nav-btn gym-cfg-nav active" data-tab="gcfg-split" onclick="switchGymSettingsTab('gcfg-split')">1. Splits &amp; Exercises</button>
                            <button type="button" class="settings-nav-btn gym-cfg-nav" data-tab="gcfg-routine" onclick="switchGymSettingsTab('gcfg-routine')">2. Routine &amp; Schedule</button>
                        </div>
                    </div>
                    <div id="gcfg-split" class="settings-tab-panel gym-cfg-panel active"></div>
                    <div id="gcfg-routine" class="settings-tab-panel gym-cfg-panel"></div>
                </div>
            </div>
        `;
        root.appendChild(gsModal);
    }

    if (!document.getElementById('gymExerciseConfigModal')) {
        const exModal = document.createElement('div');
        exModal.id = 'gymExerciseConfigModal';
        exModal.className = 'modal-overlay';
        exModal.onclick = (e) => { if (e.target === exModal) closeModals(); };
        exModal.innerHTML = `
            <div class="modal-content" style="width: 540px; max-width: 95%;">
                <h2 id="gym-ex-cfg-title">Exercise</h2>
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
                    <h2 id="gym-rev-title" style="margin:0; border:none; padding:0;">Complete Workout</h2>
                    <button type="button" class="btn btn-sm" onclick="closeModals()">[ESC]</button>
                </div>
                <div id="gym-rev-body" style="flex:1; overflow-y:auto; display:flex; flex-direction:column; gap:12px; padding-right:4px;"></div>
            </div>
        `;
        root.appendChild(revModal);
    }
}

function openGymSettingsModal(defaultTab = 'gcfg-split') {
    ensureGymModalsExist();
    closeModals();
    switchGymSettingsTab(defaultTab);
    const modal = document.getElementById('gymSettingsModal');
    if (modal) modal.style.display = 'flex';
}

function switchGymSettingsTab(tabId) {
    activeGymSettingsTab = tabId;
    document.querySelectorAll('.gym-cfg-nav').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabId);
    });
    document.querySelectorAll('.gym-cfg-panel').forEach(panel => {
        panel.classList.toggle('active', panel.id === tabId);
    });
    if (tabId === 'gcfg-split') renderGymSettingsSplitTab();
    else if (tabId === 'gcfg-routine') renderGymSettingsRoutineTab();
}

// TAB 1 IN GYM SETTINGS: EDITOR DELLE SCHEDE, GRUPPI MUSCOLARI E ASSEGNAZIONE ESERCIZI
function renderGymSettingsSplitTab() {
    const container = document.getElementById('gcfg-split');
    if (!container) return;

    const info1 = getSplitDayMusclesInfo(1);
    const info2 = getSplitDayMusclesInfo(2);
    const dayNum = editingSettingsSplitDay;
    const curList = gymPlan[dayNum] || [];

    const allGroups = [];
    curList.forEach(ex => {
        const g = (ex.group || 'Generale').trim();
        if (!allGroups.includes(g)) allGroups.push(g);
    });

    container.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-color); padding-bottom:10px; flex-wrap:wrap; gap:8px;">
            <div style="display:flex; gap:8px;">
                <button type="button" class="btn btn-sm ${dayNum === 1 ? 'btn-primary' : ''}" id="gcfg-pick-1">[SPLIT 1 // ${escapeHtml(info1.acronym)}]</button>
                <button type="button" class="btn btn-sm ${dayNum === 2 ? 'btn-primary' : ''}" id="gcfg-pick-2">[SPLIT 2 // ${escapeHtml(info2.acronym)}]</button>
            </div>
            <div style="display:flex; gap:6px;">
                <input type="text" id="gcfg-new-group-inp" class="form-control form-control-sm" style="width:165px;" placeholder="+ New Muscle Group...">
                <button type="button" class="btn btn-sm" id="gcfg-add-group-btn">[+ GROUP]</button>
            </div>
        </div>
        <div id="gcfg-groups-list" style="display:flex; flex-direction:column; gap:14px;"></div>
    `;

    container.querySelector('#gcfg-pick-1').onclick = () => {
        editingSettingsSplitDay = 1;
        renderGymSettingsSplitTab();
    };
    container.querySelector('#gcfg-pick-2').onclick = () => {
        editingSettingsSplitDay = 2;
        renderGymSettingsSplitTab();
    };

    const newGrpInp = container.querySelector('#gcfg-new-group-inp');
    const addGrpAction = () => {
        const val = newGrpInp.value.trim();
        if (!val) return;
        gymPlan[dayNum].push({
            id: `g${dayNum}_${Date.now()}`,
            group: val,
            name: 'New Exercise',
            repStr: '3x5-8',
            sets: 3,
            currentReps: 5
        });
        saveHealthData();
        renderGymSettingsSplitTab();
        renderGymDashboard();
    };
    container.querySelector('#gcfg-add-group-btn').onclick = addGrpAction;
    newGrpInp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); addGrpAction(); } };

    const groupsListEl = container.querySelector('#gcfg-groups-list');
    allGroups.forEach(groupName => {
        const groupBox = document.createElement('div');
        groupBox.className = 'cfg-box';
        groupBox.style.marginBottom = '0';

        const hdr = document.createElement('div');
        hdr.style.cssText = 'display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-color); padding-bottom:6px; margin-bottom:8px; gap:8px;';
        hdr.innerHTML = `
            <input type="text" class="form-control form-control-sm grp-rename-inp" style="width:180px; font-weight:bold; text-transform:uppercase;" value="${escapeHtml(groupName)}">
            <button type="button" class="btn btn-sm btn-add-ex-in-grp">[+ EXERCISE IN ${escapeHtml(groupName.toUpperCase())}]</button>
        `;

        const renInp = hdr.querySelector('.grp-rename-inp');
        renInp.onchange = () => {
            const nextG = renInp.value.trim() || groupName;
            curList.forEach(ex => { if (ex.group === groupName) ex.group = nextG; });
            saveHealthData();
            renderGymSettingsSplitTab();
            renderGymDashboard();
        };

        hdr.querySelector('.btn-add-ex-in-grp').onclick = () => {
            gymPlan[dayNum].push({
                id: `g${dayNum}_${Date.now()}`,
                group: groupName,
                name: 'New Exercise',
                repStr: '3x5-8',
                sets: 3,
                currentReps: 5
            });
            saveHealthData();
            renderGymSettingsSplitTab();
            renderGymDashboard();
        };

        groupBox.appendChild(hdr);

        const exRowsCont = document.createElement('div');
        exRowsCont.style.cssText = 'display:flex; flex-direction:column; gap:6px;';

        curList.forEach((ex, exIdx) => {
            if ((ex.group || 'Generale').trim() !== groupName) return;

            const row = document.createElement('div');
            row.style.cssText = 'display:grid; grid-template-columns: 1fr 140px 130px 65px auto; gap:6px; align-items:center;';

            const groupOptionsHtml = allGroups.map(g => `<option value="${escapeHtml(g)}" ${g === groupName ? 'selected' : ''}>${escapeHtml(g)}</option>`).join('') + `<option value="__NEW__">+ New Group...</option>`;
            const schemeOptionsHtml = GYM_REP_SCHEMES.map(sc => `<option value="${escapeHtml(sc.label)}" ${sc.label.toLowerCase() === (ex.repStr || '').toLowerCase() ? 'selected' : ''}>${escapeHtml(sc.label)}</option>`).join('');

            row.innerHTML = `
                <input type="text" class="form-control form-control-sm ex-name-inp" value="${escapeHtml(ex.name)}">
                <select class="form-control form-control-sm ex-grp-sel">${groupOptionsHtml}</select>
                <select class="form-control form-control-sm ex-scheme-sel">${schemeOptionsHtml}</select>
                <input type="number" class="form-control form-control-sm no-spinners ex-sets-inp" min="0" max="10" value="${ex.sets ?? 3}" title="Weight boxes">
                <button type="button" class="icon-btn delete ex-del-btn">[X]</button>
            `;

            row.querySelector('.ex-name-inp').onchange = (e) => {
                ex.name = e.target.value.trim() || ex.name;
                saveHealthData();
                renderGymDashboard();
            };

            row.querySelector('.ex-grp-sel').onchange = (e) => {
                if (e.target.value === '__NEW__') {
                    const entered = prompt('New Muscle Group Name:');
                    if (entered && entered.trim()) {
                        ex.group = entered.trim();
                    }
                } else {
                    ex.group = e.target.value;
                }
                saveHealthData();
                renderGymSettingsSplitTab();
                renderGymDashboard();
            };

            row.querySelector('.ex-scheme-sel').onchange = (e) => {
                ex.repStr = e.target.value;
                const meta = resolveGymSchemeMeta(ex.repStr);
                ex.sets = meta.sets;
                if (meta.isProg && !ex.currentReps) ex.currentReps = 5;
                saveHealthData();
                renderGymSettingsSplitTab();
                renderGymDashboard();
            };

            row.querySelector('.ex-sets-inp').onchange = (e) => {
                ex.sets = Math.max(0, Math.min(10, parseInt(e.target.value, 10) || 0));
                saveHealthData();
                renderGymDashboard();
            };

            row.querySelector('.ex-del-btn').onclick = () => {
                gymPlan[dayNum].splice(exIdx, 1);
                saveHealthData();
                renderGymSettingsSplitTab();
                renderGymDashboard();
            };

            exRowsCont.appendChild(row);
        });

        groupBox.appendChild(exRowsCont);
        groupsListEl.appendChild(groupBox);
    });
}

// TAB 2 IN GYM SETTINGS: ROUTINE, FASCE ORARIE E RESET PUNTO DI PARTENZA
function renderGymSettingsRoutineTab() {
    const container = document.getElementById('gcfg-routine');
    if (!container) return;

    const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const dayValues = [1, 2, 3, 4, 5, 6, 0];
    const info1 = getSplitDayMusclesInfo(1);
    const info2 = getSplitDayMusclesInfo(2);

    container.innerHTML = `
        <div class="cfg-box" style="margin-bottom:0; border-color:var(--border-bright);">
            <div class="sub-column-header" style="display:flex; justify-content:space-between; align-items:center;">
                <span>1. Starting Split &amp; Reset</span>
                <span style="font-size:0.65rem; color:var(--accent-green);">ACTIVE: ${escapeHtml(nextWorkoutDay === 1 ? info1.acronym : info2.acronym)}</span>
            </div>
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
                <button type="button" class="btn btn-sm ${nextWorkoutDay === 1 ? 'btn-primary' : ''}" id="btn-reset-start-1">
                    [START TODAY ON ${escapeHtml(info1.acronym)} &amp; CLEAR PAST]
                </button>
                <button type="button" class="btn btn-sm ${nextWorkoutDay === 2 ? 'btn-primary' : ''}" id="btn-reset-start-2">
                    [START TODAY ON ${escapeHtml(info2.acronym)} &amp; CLEAR PAST]
                </button>
            </div>
        </div>

        <div class="cfg-box" style="margin-bottom:0;">
            <div class="sub-column-header" style="display:flex; justify-content:space-between; align-items:center;">
                <span>2. Weekly Schedule Slots</span>
                <label style="font-size:var(--font-xs); cursor:pointer; display:flex; align-items:center; gap:6px;">
                    <input type="checkbox" id="gym-routine-enabled" ${gymRoutine.enabled !== false ? 'checked' : ''}>
                    <strong style="color:var(--text-main);">SYNC TO PLANNER &amp; TASKS</strong>
                </label>
            </div>

            <div id="gym-tw-list" style="display:flex; flex-direction:column; gap:10px; margin-bottom:12px;"></div>

            <button type="button" id="btn-add-gym-tw" class="btn btn-sm" style="width:100%; border-style:dashed; margin-bottom:14px;">
                [+ ADD TIME WINDOW]
            </button>

            <div style="display:flex; gap:14px; flex-wrap:wrap; align-items:flex-end; border-top:1px solid var(--border-color); padding-top:12px;">
                <div class="form-group" style="margin-bottom:0; flex:1; min-width:140px;">
                    <label>Start Date</label>
                    <input type="date" id="gym-start-date" class="form-control form-control-sm" value="${gymStartDate || todayStr}">
                </div>
                <div class="form-group" style="margin-bottom:0; flex:1; min-width:140px;">
                    <label>End Date</label>
                    <input type="date" id="gym-end-date" class="form-control form-control-sm" value="${gymEndDate}">
                </div>
                <button type="button" id="btn-save-gym-routine" class="btn btn-primary btn-sm" style="height:31px;">
                    [SAVE SCHEDULE]
                </button>
            </div>
        </div>
    `;

    container.querySelector('#btn-reset-start-1').onclick = () => resetGymStartingPoint(1, true);
    container.querySelector('#btn-reset-start-2').onclick = () => resetGymStartingPoint(2, true);

    const twListEl = container.querySelector('#gym-tw-list');

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
                    ${daysHtml}
                </div>
                <div style="display:flex; align-items:center; gap:8px;">
                    <input type="time" class="form-control form-control-sm tw-start-inp" style="width:92px;" value="${tw.start || '19:45'}">
                    <span style="color:var(--text-dim);">-</span>
                    <input type="time" class="form-control form-control-sm tw-end-inp" style="width:92px;" value="${tw.end || '21:15'}">
                    <button type="button" class="icon-btn delete btn-del-tw">[X]</button>
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

    container.querySelector('#btn-add-gym-tw').onclick = () => {
        gymRoutine.timeWindows = readDomWindowsIntoState();
        gymRoutine.timeWindows.push({ days: [6], start: '16:00', end: '17:30' });
        renderTimeWindowsRows();
    };

    container.querySelector('#btn-save-gym-routine').onclick = () => {
        gymRoutine.enabled = container.querySelector('#gym-routine-enabled').checked;
        gymRoutine.timeWindows = readDomWindowsIntoState();
        gymStartDate = container.querySelector('#gym-start-date').value || todayStr;
        gymEndDate = container.querySelector('#gym-end-date').value || '';

        saveHealthData();
        updateGymDates();
        syncGymRoutineTask(true);
        renderGymDashboard();
    };
}

// ============================================================================
// MODALI SINGOLO ESERCIZIO & REVISIONE FINE ALLENAMENTO
// ============================================================================

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
                    <label>Muscle Group</label>
                    <input type="text" id="cfg-ex-group" class="form-control form-control-sm" value="${escapeHtml(selectedGroup)}">
                </div>
                <div class="form-group" style="flex:2; margin-bottom:0;">
                    <label>Exercise Name</label>
                    <input type="text" id="cfg-ex-name" class="form-control form-control-sm" value="${escapeHtml(ex.name)}">
                </div>
            </div>

            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:6px;" id="cfg-scheme-grid"></div>

            <div style="display:flex; gap:10px; align-items:flex-end;">
                <div class="form-group" style="flex:2; margin-bottom:0;">
                    <label>Custom Rep Scheme</label>
                    <input type="text" id="cfg-ex-repstr" class="form-control form-control-sm" value="${escapeHtml(selectedRepStr)}">
                </div>
                <div class="form-group" style="flex:1; margin-bottom:0;">
                    <label>Weight Boxes</label>
                    <input type="number" id="cfg-ex-sets" class="form-control form-control-sm no-spinners" min="0" max="10" value="${selectedSets}">
                </div>
            </div>

            <div id="cfg-prog-section" style="display:${curMeta.isProg ? 'block' : 'none'}; padding:10px; border:1px solid var(--border-bright); background:rgba(255,255,255,0.03);">
                <label style="font-size:var(--font-xs); color:var(--text-main); font-weight:bold; text-transform:uppercase; display:block; margin-bottom:8px;">
                    Current Target Reps:
                </label>
                <div style="display:flex; gap:8px;" id="cfg-prog-btns">
                    ${[5, 6, 7, 8].map(r => `
                        <button type="button" class="btn btn-sm ${selectedCurReps === r ? 'btn-primary' : ''}" data-rep="${r}" style="flex:1;">
                            ${selectedSets}x${r}
                        </button>
                    `).join('')}
                </div>
            </div>

            <div class="modal-actions" style="margin-top:6px;">
                <button type="button" class="btn" onclick="closeModals()">Cancel</button>
                <button type="button" class="btn btn-primary" id="btn-save-ex-cfg">[SAVE]</button>
            </div>
        `;

        const grid = body.querySelector('#cfg-scheme-grid');
        GYM_REP_SCHEMES.forEach(sc => {
            const isSel = sc.label.toLowerCase() === selectedRepStr.toLowerCase();
            const b = document.createElement('button');
            b.type = 'button';
            b.className = `btn btn-sm ${isSel ? 'btn-primary' : ''}`;
            b.style.textAlign = 'left';
            b.innerHTML = `<div style="font-weight:bold;">${escapeHtml(sc.label)}</div>`;
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

        body.querySelector('#btn-save-ex-cfg').onclick = () => {
            ex.group = body.querySelector('#cfg-ex-group').value.trim() || 'Generale';
            ex.name = body.querySelector('#cfg-ex-name').value.trim() || 'Exercise';
            ex.repStr = body.querySelector('#cfg-ex-repstr').value.trim() || '3x10';
            ex.sets = Math.max(0, Math.min(10, parseInt(body.querySelector('#cfg-ex-sets').value, 10) || 0));
            const finalMeta = resolveGymSchemeMeta(ex.repStr);
            if (finalMeta.isProg) {
                ex.currentReps = selectedCurReps || 5;
            }
            saveHealthData();
            closeModals();
            renderGymDashboard();
        };
    };

    renderConfigContent();
    closeModals();
    modal.style.display = 'flex';
}

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

    if (titleEl) {
        titleEl.textContent = `Complete Workout // ${curInfo.acronym} (${pendingReviewDateStr})`;
    }

    body.innerHTML = '';

    const switchSplitBar = document.createElement('div');
    switchSplitBar.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:8px 12px; background:#080808; border:1px solid var(--border-color); flex-wrap:wrap; gap:8px;';
    switchSplitBar.innerHTML = `
        <span style="font-size:var(--font-xs); color:var(--text-muted); font-weight:bold;">SPLIT COMPLETED:</span>
        <div style="display:flex; gap:6px;">
            <button type="button" class="btn btn-sm ${dayNum === 1 ? 'btn-primary' : ''}" id="rev-pick-split-1">[${escapeHtml(info1.acronym)}]</button>
            <button type="button" class="btn btn-sm ${dayNum === 2 ? 'btn-primary' : ''}" id="rev-pick-split-2">[${escapeHtml(info2.acronym)}]</button>
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

    const unchangedBox = document.createElement('div');
    unchangedBox.style.cssText = 'padding:12px; border:1px solid var(--border-bright); background:rgba(255,255,255,0.03); display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;';
    unchangedBox.innerHTML = `
        <strong style="font-size:var(--font-sm); color:var(--text-main);">Keep weights &amp; reps unchanged?</strong>
        <button type="button" class="btn btn-primary" id="btn-gym-rev-unchanged">[CONFIRM ${escapeHtml(curInfo.acronym)}]</button>
    `;
    unchangedBox.querySelector('#btn-gym-rev-unchanged').onclick = () => {
        finalizeGymWorkoutCompletion(dayNum, pendingReviewDateStr);
    };
    body.appendChild(unchangedBox);

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
                        <button type="button" class="icon-btn btn-rep-minus">[-]</button>
                        <span style="font-size:var(--font-xs); font-weight:bold; color:${bumpedWeightNotice ? 'var(--accent-green)' : 'var(--text-main)'}; min-width:64px; text-align:center;">
                            ${ex.sets}x${cur} ${bumpedWeightNotice ? '[+KG]' : ''}
                        </span>
                        <button type="button" class="btn btn-sm btn-rep-plus" style="padding:2px 6px;">[+1 REP]</button>
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
        <button type="button" class="btn" onclick="closeModals()">Cancel</button>
        <button type="button" class="btn btn-primary" id="btn-gym-rev-save">[SAVE &amp; COMPLETE ${escapeHtml(curInfo.acronym)}]</button>
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
        showToast(`[GYM] Completed ${completedInfo.acronym} · Next: ${nextInfo.acronym}`);
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

// Sincronizza automaticamente Gym Today quando cambi giorno con <-, ->, T o Calendar
window.addEventListener('DOMContentLoaded', () => {
    migrateExistingGymPlanStructure();
    syncGymRoutineTask(false);
    renderGymDashboard();

    if (typeof window.selectDate === 'function' && !window.selectDate._gymHooked) {
        const origSelectDate = window.selectDate;
        window.selectDate = function(dateStr) {
            origSelectDate(dateStr);
            renderGymDashboard();
        };
        window.selectDate._gymHooked = true;
    }
});