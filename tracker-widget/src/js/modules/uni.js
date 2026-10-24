// --- js/modules/uni.js ---
// Modulo Atomico 9: UNIVERSITY (Architettura a Sotto-Moduli Componibili + Automazione Task/Planner/Calendar/Money)

const UNI_SUBMODULES = {
    roadmap: { id: 'roadmap', name: 'Roadmap & Prep' },
    lectures: { id: 'lectures', name: 'Orario Lezioni' },
    appeals: { id: 'appeals', name: 'Appelli & Tasse' },
    libretto: { id: 'libretto', name: 'Libretto (180 CFU)' }
};

let isUniSubEditMode = false;

function ensureTasseUniCategory() {
    if (typeof mCategories !== 'undefined' && !mCategories.includes('Tasse Uni')) {
        mCategories.push('Tasse Uni');
        if (typeof saveMoneyData === 'function') saveMoneyData();
    }
}

function getYesterdayDateStr() {
    const d = new Date(todayObj);
    d.setDate(d.getDate() - 1);
    return formatDate(d);
}

// ============================================================================
// 1. CALCOLO STATISTICHE CARRIERA (180 CFU, 18-30L CON 30L = 30, BASE /110)
// ============================================================================

function calculateUniStats() {
    const passed = uniData.passedExams || [];
    const targetCfu = uniData.targetCfu || 180;

    let totalCfu = 0;
    let sumGrades = 0;
    let sumWeightedGrades = 0;
    let laudeCount = 0;

    passed.forEach(ex => {
        const cfu = parseFloat(ex.cfu) || 0;
        const g = Math.min(30, Math.max(18, parseInt(ex.grade, 10) || 18));
        if (ex.laude) laudeCount++;
        totalCfu += cfu;
        sumGrades += g;
        sumWeightedGrades += (g * cfu);
    });

    const count = passed.length;
    const arithmeticMean = count > 0 ? (sumGrades / count) : 0;
    const weightedMean = totalCfu > 0 ? (sumWeightedGrades / totalCfu) : 0;
    const base110 = weightedMean > 0 ? ((weightedMean * 110) / 30) : 0;
    const cfuPct = Math.min(100, Math.round((totalCfu / targetCfu) * 100));

    return {
        count,
        totalCfu,
        targetCfu,
        cfuPct,
        laudeCount,
        arithmeticMean,
        weightedMean,
        base110
    };
}

// Calcola le ore reali studiate per un corso (sommando Studio, Anki, Dimostrazioni e Lezioni dai log)
function getExamStudiedHours(examId, examName) {
    let totalMins = 0;
    const catClean = (examName || '').trim().toLowerCase();

    for (let dateStr in logs) {
        const dayLog = logs[dateStr] || {};
        for (let tId in dayLog) {
            const t = templates.find(x => x.id === tId);
            if (!t) continue;
            const matchesExam = (t.uniExamId && t.uniExamId === examId) || (t.category && t.category.trim().toLowerCase() === catClean);
            if (!matchesExam) continue;

            const checkedCount = (dayLog[tId] || []).filter(Boolean).length;
            if (checkedCount <= 0) continue;

            const minsPerInst = typeof getTaskDurationMinutes === 'function'
                ? getTaskDurationMinutes(t, dateStr)
                : (t.timerMinutes || 30);
            totalMins += checkedCount * minsPerInst;
        }
    }
    return totalMins / 60;
}

// ============================================================================
// 2. PONTE AUTOMATICO CON DAILY TASKS & WEEKLY PLANNER (FASI STUDIO & LEZIONI)
// ============================================================================

function archiveTemplateSafely(t) {
    const yesterdayStr = getYesterdayDateStr();
    let hasLogs = false;
    for (let d in logs) {
        if (logs[d] && logs[d][t.id] && logs[d][t.id].some(Boolean)) {
            hasLogs = true;
            break;
        }
    }
    if (hasLogs) {
        t.endDate = yesterdayStr;
    } else {
        templates = templates.filter(x => x.id !== t.id);
    }
}

function upsertExamStudyTask(exam, role, title, instances, timerMinutes) {
    const catName = exam.name.trim();
    if (!categoryOrder.includes(catName)) {
        categoryOrder.push(catName);
    }

    let existing = templates.find(t =>
        t.uniExamId === exam.id &&
        t.uniRole === role &&
        (!t.endDate || t.endDate >= todayStr)
    );

    if (existing) {
        existing.category = catName;
        existing.title = title;
        existing.instances = instances;
        existing.timerMinutes = timerMinutes;
        existing.color = exam.color || '#ffffff';
        existing.endDate = null;
    } else {
        templates.push({
            id: `t_uni_${exam.id}_${role}_${Date.now()}`,
            uniExamId: exam.id,
            uniRole: role,
            category: catName,
            title: title,
            instances: instances,
            timerMinutes: timerMinutes,
            noTimer: false,
            frequency: 'all',
            daysOfWeek: [],
            startDate: todayStr,
            endDate: null,
            color: exam.color || '#ffffff',
            type: 'untimed',
            timeWindows: [],
            exceptions: []
        });
    }
}

// Gestisce il ciclo di vita delle task di un esame:
// - 'study'  -> 4x30m Studio + 2x30m Anki
// - 'proofs' -> 4x30m Dimostrazioni + 2x30m Anki
// - 'none'   -> Archivia tutte le task di studio dell'esame
function setExamPrepPhase(examId, newPhase) {
    const exam = (uniData.remainingExams || []).find(x => x.id === examId);
    if (!exam) return;

    exam.prepPhase = newPhase;

    const existingStudyTasks = templates.filter(t => t.uniExamId === exam.id && ['studio', 'anki', 'dimostrazioni'].includes(t.uniRole));

    if (newPhase === 'none') {
        existingStudyTasks.forEach(t => archiveTemplateSafely(t));
    } else if (newPhase === 'study') {
        // Archivia eventuale task Dimostrazioni attiva e attiva Studio (4x30m) + Anki (2x30m)
        existingStudyTasks.filter(t => t.uniRole === 'dimostrazioni').forEach(t => archiveTemplateSafely(t));
        upsertExamStudyTask(exam, 'studio', 'Studio', 4, 30);
        upsertExamStudyTask(exam, 'anki', 'Anki', 2, 30);
    } else if (newPhase === 'proofs') {
        // Archivia la task Studio iniziale e attiva Dimostrazioni (4x30m) + Anki (2x30m)
        existingStudyTasks.filter(t => t.uniRole === 'studio').forEach(t => archiveTemplateSafely(t));
        upsertExamStudyTask(exam, 'anki', 'Anki', 2, 30);
        upsertExamStudyTask(exam, 'dimostrazioni', 'Dimostrazioni', 4, 30);
    }

    syncCategoryOrder();
    saveData();
    saveUniData();
    refreshAllConnectedViews();

    if (typeof showToast === 'function') {
        const msgMap = {
            'study': `[UNI -> TASKS] "${exam.name}": creati 4x30m Studio + 2x30m Anki`,
            'proofs': `[UNI -> TASKS] "${exam.name}": switch a 4x30m Dimostrazioni + 2x30m Anki`,
            'none': `[UNI] Pausa preparazione per "${exam.name}"`
        };
        showToast(msgMap[newPhase] || '[UNI] Fase aggiornata');
    }
}

// Sincronizza l'orario delle lezioni di un corso come Timed Task (2B: spuntabile in Daily Tasks + visibile sul Weekly Planner)
function syncCourseLecturesToTimedTask(exam) {
    const existingLectureTasks = templates.filter(t => t.uniExamId === exam.id && t.uniRole === 'lecture');
    const validWindows = (exam.lectures || []).filter(w => w.start && w.end && Array.isArray(w.days) && w.days.length > 0);

    if (validWindows.length === 0) {
        existingLectureTasks.forEach(t => archiveTemplateSafely(t));
        syncCategoryOrder();
        saveData();
        return;
    }

    const catName = exam.name.trim();
    if (!categoryOrder.includes(catName)) categoryOrder.push(catName);

    const allDays = [];
    validWindows.forEach(w => {
        w.days.forEach(d => { if (!allDays.includes(d)) allDays.push(d); });
    });

    const [sh, sm] = validWindows[0].start.split(':').map(Number);
    const [eh, em] = validWindows[0].end.split(':').map(Number);
    const durMins = Math.max(15, (eh * 60 + em) - (sh * 60 + sm));

    let activeLectureTask = existingLectureTasks.find(t => !t.endDate || t.endDate >= todayStr);

    if (activeLectureTask) {
        activeLectureTask.category = catName;
        activeLectureTask.title = `Lezione ${catName}`;
        activeLectureTask.startDate = exam.lectureStart || todayStr;
        activeLectureTask.endDate = exam.lectureEnd || null;
        activeLectureTask.color = exam.color || '#4c5b73';
        activeLectureTask.timeWindows = validWindows;
        activeLectureTask.daysOfWeek = allDays;
        activeLectureTask.timerMinutes = durMins;
    } else {
        templates.push({
            id: `t_uni_lec_${exam.id}_${Date.now()}`,
            uniExamId: exam.id,
            uniRole: 'lecture',
            category: catName,
            title: `Lezione ${catName}`,
            instances: 1,
            timerMinutes: durMins,
            noTimer: false,
            frequency: 'specific',
            daysOfWeek: allDays,
            startDate: exam.lectureStart || todayStr,
            endDate: exam.lectureEnd || null,
            color: exam.color || '#4c5b73',
            type: 'timed',
            timeWindows: validWindows,
            exceptions: []
        });
    }

    syncCategoryOrder();
    saveData();
}

function refreshAllConnectedViews() {
    renderUniDashboard();
    if (typeof renderTasks === 'function') renderTasks();
    if (typeof renderWeeklyPlanner === 'function') renderWeeklyPlanner();
    if (typeof renderCalendar === 'function') renderCalendar();
    if (typeof renderTracker === 'function') renderTracker();
    if (typeof renderMoneyDashboard === 'function') renderMoneyDashboard();
}

// ============================================================================
// 3. AZIONI CRUD: CORSI RIMASTI, PASSAGGIO ESAME, APPELLI & TASSE UNI
// ============================================================================

function addRemainingCourse(name, cfu, year = 1, color = '#ffffff') {
    const cleanName = (name || '').trim();
    if (!cleanName) return false;

    const newCourse = {
        id: 'uex_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
        name: cleanName,
        cfu: Math.max(1, parseInt(cfu, 10) || 6),
        year: Math.max(1, Math.min(6, parseInt(year, 10) || 1)),
        color: color || '#ffffff',
        prepPhase: 'none',
        lectureStart: todayStr,
        lectureEnd: '',
        lectures: []
    };

    uniData.remainingExams.push(newCourse);
    saveUniData();
    renderUniDashboard();
    return true;
}

// Registra un esame superato (da UI o da comando DSL `esame [Nome] [Voto] [CFU]`)
function recordPassedExam(examNameOrId, rawGrade, rawCfu = null, dateStr = todayStr) {
    const q = (examNameOrId || '').trim();
    if (!q) return false;

    const gradeStr = String(rawGrade || '30').trim().toUpperCase();
    const isLaude = gradeStr.includes('L');
    const numericGrade = Math.min(30, Math.max(18, parseInt(gradeStr.replace(/\D/g, ''), 10) || 30));

    // Cerca se il corso era tra gli Esami Rimasti
    const remIdx = (uniData.remainingExams || []).findIndex(
        x => x.id === q || x.name.toLowerCase() === q.toLowerCase() || x.name.toLowerCase().includes(q.toLowerCase())
    );

    let finalName = q;
    let finalCfu = parseInt(rawCfu, 10) || 6;

    if (remIdx !== -1) {
        const matchedCourse = uniData.remainingExams[remIdx];
        finalName = matchedCourse.name;
        if (!rawCfu) finalCfu = matchedCourse.cfu || 6;

        // 1. Archivia tutte le task di Studio, Anki, Dimostrazioni e Lezioni collegate a questo corso
        templates
            .filter(t => t.uniExamId === matchedCourse.id || t.category.toLowerCase() === finalName.toLowerCase())
            .forEach(t => archiveTemplateSafely(t));

        // 2. Rimuove gli appelli futuri di questo esame e i relativi eventi sul calendario
        const appealsToRemove = (uniData.appeals || []).filter(a => a.examName.toLowerCase() === finalName.toLowerCase());
        appealsToRemove.forEach(a => {
            specificEvents = specificEvents.filter(e => e.id !== a.eventId);
        });
        uniData.appeals = (uniData.appeals || []).filter(a => a.examName.toLowerCase() !== finalName.toLowerCase());

        // 3. Rimuove il corso dagli Esami Rimasti
        uniData.remainingExams.splice(remIdx, 1);
    }

    uniData.passedExams.push({
        id: 'upass_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
        name: finalName,
        cfu: finalCfu,
        grade: numericGrade,
        laude: isLaude && numericGrade === 30,
        date: dateStr || todayStr
    });

    syncCategoryOrder();
    saveData();
    saveUniData();
    refreshAllConnectedViews();

    if (typeof showToast === 'function') {
        showToast(`[LIBRETTO] Registrato ${finalName}: ${numericGrade}${isLaude && numericGrade === 30 ? 'L' : ''} (${finalCfu} CFU)`);
    }
    return true;
}

function addUniAppeal(examName, dateStr, timeStr = '09:00', sessionName = '') {
    const cleanName = (examName || '').trim();
    if (!cleanName || !dateStr) return false;

    const appealId = 'uapp_' + Date.now();
    const eventId = 'e_uapp_' + appealId;

    let endTime = null;
    if (timeStr && timeStr.includes(':')) {
        const [h, m] = timeStr.split(':').map(Number);
        const endH = Math.min(23, h + 2);
        endTime = `${String(endH).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}`;
    }

    specificEvents.push({
        id: eventId,
        uniAppealId: appealId,
        title: `[APPELLO] ${cleanName}`,
        date: dateStr,
        start: timeStr || null,
        end: endTime,
        color: '#b08d43'
    });

    uniData.appeals.push({
        id: appealId,
        examName: cleanName,
        date: dateStr,
        time: timeStr || '09:00',
        session: sessionName || 'Sessione Esami',
        eventId: eventId
    });

    saveData();
    saveUniData();
    refreshAllConnectedViews();
    return true;
}

function deleteUniAppeal(appealId) {
    const app = (uniData.appeals || []).find(a => a.id === appealId);
    if (app) {
        specificEvents = specificEvents.filter(e => e.id !== app.eventId);
    }
    uniData.appeals = (uniData.appeals || []).filter(a => a.id !== appealId);
    saveData();
    saveUniData();
    refreshAllConnectedViews();
}

// Aggiunge una Tassa Universitaria -> Crea Evento Rosso nel giorno della scadenza + Categoria "Tasse Uni" in Money
function addUniTax(title, amount, dueDateStr) {
    const cleanTitle = (title || 'Rata Universitaria').trim();
    const amt = roundCurrency(amount);
    if (amt <= 0 || !dueDateStr) return false;

    ensureTasseUniCategory();

    const taxId = 'utax_' + Date.now();
    const eventId = 'e_utax_' + taxId;

    // Evento in ROSSO sul Calendar il giorno della scadenza
    specificEvents.push({
        id: eventId,
        uniTaxId: taxId,
        title: `[TASSA UNI] ${cleanTitle} (€${amt.toFixed(2)})`,
        date: dueDateStr,
        color: '#ff5555'
    });

    uniData.taxes.push({
        id: taxId,
        title: cleanTitle,
        amount: amt,
        dueDate: dueDateStr,
        paid: false,
        eventId: eventId
    });

    saveData();
    saveUniData();
    refreshAllConnectedViews();
    if (typeof showToast === 'function') {
        showToast(`[TASSA UNI] "${cleanTitle}" (€${amt.toFixed(2)}) -> Scadenza rossa il ${dueDateStr}`);
    }
    return true;
}

function payUniTax(taxId) {
    const tax = (uniData.taxes || []).find(t => t.id === taxId);
    if (!tax || tax.paid) return;

    ensureTasseUniCategory();

    if (typeof recordExpenseWithVaultCheck === 'function') {
        recordExpenseWithVaultCheck({
            amount: tax.amount,
            category: 'Tasse Uni',
            desc: tax.title,
            dateStr: todayStr
        });
    }

    tax.paid = true;
    // Rimuove l'evento rosso di scadenza dal calendario una volta pagata
    specificEvents = specificEvents.filter(e => e.id !== tax.eventId);

    saveData();
    saveUniData();
    refreshAllConnectedViews();
    if (typeof showToast === 'function') {
        showToast(`[TASSA PAGATA] -€${tax.amount.toFixed(2)} registrati in categoria "Tasse Uni"`);
    }
}

function deleteUniTax(taxId) {
    const tax = (uniData.taxes || []).find(t => t.id === taxId);
    if (tax) {
        specificEvents = specificEvents.filter(e => e.id !== tax.eventId);
    }
    uniData.taxes = (uniData.taxes || []).filter(t => t.id !== taxId);
    saveData();
    saveUniData();
    refreshAllConnectedViews();
}

// ============================================================================
// 4. ARCHITETTURA SOTTO-MODULI COMPONIBILI DENTRO #module-uni (PUNTO 5)
// ============================================================================

function toggleUniSubEditMode() {
    isUniSubEditMode = !isUniSubEditMode;
    renderUniDashboard();
}

function selectOrToggleUniSubModule(subKey, event = null) {
    if (!UNI_SUBMODULES[subKey]) return;
    if (!Array.isArray(uniData.activeSubModules)) {
        uniData.activeSubModules = ['roadmap'];
    }

    // Se siamo in modalità [EDIT SUB-VIEW] (o Shift+Click), aggiunge/rimuove il sotto-modulo nella vista multipla
    if (isUniSubEditMode || (event && event.shiftKey)) {
        const idx = uniData.activeSubModules.indexOf(subKey);
        if (idx !== -1) {
            if (uniData.activeSubModules.length > 1) {
                uniData.activeSubModules.splice(idx, 1);
            }
        } else {
            uniData.activeSubModules.push(subKey);
        }
    } else {
        // Click standard: mostra quel singolo sotto-modulo
        uniData.activeSubModules = [subKey];
    }

    saveUniData();
    renderUniDashboard();
}

function toggleUniSubSplitDirection() {
    uniData.subLayoutDir = uniData.subLayoutDir === 'col' ? 'row' : 'col';
    saveUniData();
    renderUniDashboard();
}

function renderUniDashboard() {
    ensureTasseUniCategory();
    const root = document.getElementById('uni-main-root');
    if (!root) return;

    const stats = calculateUniStats();
    const activeSubs = (Array.isArray(uniData.activeSubModules) && uniData.activeSubModules.length > 0)
        ? uniData.activeSubModules.filter(k => UNI_SUBMODULES[k])
        : ['roadmap'];

    const splitDir = uniData.subLayoutDir || 'row';

    root.innerHTML = '';

    // 1. TOP METRICS & SUB-MODULE CONTROLLER BAR
    const topBar = document.createElement('div');
    topBar.style.cssText = 'display:flex; flex-direction:column; gap:10px; border-bottom:1px solid var(--border-color); padding-bottom:12px; flex-shrink:0;';

    topBar.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-end; flex-wrap:wrap; gap:12px;">
            <div style="display:flex; gap:20px; align-items:baseline; flex-wrap:wrap;">
                <div>
                    <div class="section-label" style="margin-bottom:2px; color:var(--accent-green);">Weighted Avg</div>
                    <div style="font-size:1.5rem; font-weight:bold; color:var(--text-main); font-variant-numeric:tabular-nums;">${stats.weightedMean.toFixed(2)}</div>
                </div>
                <div style="border-left:1px solid var(--border-color); padding-left:14px;">
                    <div class="section-label" style="margin-bottom:2px;">Arithmetic Avg</div>
                    <div style="font-size:1.25rem; font-weight:bold; color:var(--text-muted); font-variant-numeric:tabular-nums;">${stats.arithmeticMean.toFixed(2)}</div>
                </div>
                <div style="border-left:1px solid var(--border-color); padding-left:14px;">
                    <div class="section-label" style="margin-bottom:2px; color:var(--accent-gold);">Base /110</div>
                    <div style="font-size:1.25rem; font-weight:bold; color:var(--text-main); font-variant-numeric:tabular-nums;">${stats.base110.toFixed(1)}</div>
                </div>
                <div style="border-left:1px solid var(--border-color); padding-left:14px;">
                    <div class="section-label" style="margin-bottom:2px;">Progress (180 CFU)</div>
                    <div style="font-size:1.25rem; font-weight:bold; color:var(--text-main); font-variant-numeric:tabular-nums;">${stats.totalCfu} <span style="font-size:var(--font-xs); color:var(--text-dim);">/ ${stats.targetCfu} CFU (${stats.cfuPct}%)</span></div>
                </div>
            </div>

            <!-- Barra Selettore Sotto-Moduli + Toggle [EDIT SUB-VIEW] -->
            <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;" id="uni-subnav-bar"></div>
        </div>

        <!-- Barra avanzamento 180 CFU -->
        <div class="vault-progress-track" style="height:5px;">
            <div class="vault-progress-fill" style="width:${stats.cfuPct}%;"></div>
        </div>
    `;

    const subNavBar = topBar.querySelector('#uni-subnav-bar');
    Object.keys(UNI_SUBMODULES).forEach(key => {
        const sub = UNI_SUBMODULES[key];
        const isActive = activeSubs.includes(key);
        const btn = document.createElement('button');
        btn.className = `btn btn-sm ${isActive ? 'btn-primary' : ''}`;
        btn.textContent = `[${isUniSubEditMode ? (isActive ? '✓ ' : '+ ') : ''}${sub.name.toUpperCase()}]`;
        btn.title = isUniSubEditMode
            ? 'Click to toggle this sub-module in combined view'
            : 'Click to open sub-module (Shift+Click to combine multiple)';
        btn.onclick = (e) => selectOrToggleUniSubModule(key, e);
        subNavBar.appendChild(btn);
    });

    if (isUniSubEditMode && activeSubs.length > 1) {
        const dirBtn = document.createElement('button');
        dirBtn.className = 'btn btn-sm';
        dirBtn.textContent = splitDir === 'row' ? '[SPLIT: SIDE-BY-SIDE]' : '[SPLIT: STACKED]';
        dirBtn.onclick = toggleUniSubSplitDirection;
        subNavBar.appendChild(dirBtn);
    }

    const editSubBtn = document.createElement('button');
    editSubBtn.className = `btn btn-sm ${isUniSubEditMode ? 'btn-primary' : ''}`;
    editSubBtn.textContent = isUniSubEditMode ? '[DONE SUB-VIEW]' : '[EDIT SUB-VIEW]';
    editSubBtn.title = 'Compose multiple sub-modules inside University';
    editSubBtn.onclick = toggleUniSubEditMode;
    subNavBar.appendChild(editSubBtn);

    root.appendChild(topBar);

    // 2. CONTENITORE TILING DEI SOTTO-MODULI ATTIVI
    const workspaceArea = document.createElement('div');
    workspaceArea.style.cssText = `flex:1; display:flex; flex-direction:${splitDir}; gap:14px; min-height:0; overflow:hidden; padding-top:4px;`;

    activeSubs.forEach(subKey => {
        const subCard = document.createElement('div');
        subCard.style.cssText = 'flex:1; display:flex; flex-direction:column; min-width:0; min-height:0; border:1px solid var(--border-color); background:rgba(255,255,255,0.01); padding:12px; overflow-y:auto;';

        if (subKey === 'roadmap') renderUniSubRoadmap(subCard);
        else if (subKey === 'lectures') renderUniSubLectures(subCard);
        else if (subKey === 'appeals') renderUniSubAppealsAndTaxes(subCard);
        else if (subKey === 'libretto') renderUniSubLibretto(subCard);

        workspaceArea.appendChild(subCard);
    });

    root.appendChild(workspaceArea);
}

// ============================================================================
// SOTTO-MODULO 1: ROADMAP ESAMI RIMASTI & AUTOMAZIONE FASI STUDIO
// ============================================================================

function renderUniSubRoadmap(container) {
    container.innerHTML = `
        <div class="sub-column-header" style="display:flex; justify-content:space-between; align-items:center;">
            <span>1. Esami Rimasti &amp; Fasi di Preparazione</span>
            <span style="font-size:0.65rem; color:var(--text-dim);">AUTO-CREATES CATEGORY &amp; 30M BLOCKS IN DAILY TASKS</span>
        </div>

        <!-- Form rapido aggiunta corso da dare -->
        <div style="display:flex; gap:6px; margin-bottom:12px; flex-wrap:wrap;">
            <input type="text" id="uni-new-course-name" class="form-control form-control-sm" style="flex:2; min-width:130px;" placeholder="Nome Corso (es. Algebra, Analisi II)..." onkeydown="if(event.key==='Enter'){event.preventDefault(); document.getElementById('btn-add-uni-course').click();}">
            <input type="number" id="uni-new-course-cfu" class="form-control form-control-sm no-spinners" style="width:65px; text-align:center;" placeholder="CFU" value="9" min="1" max="30">
            <input type="number" id="uni-new-course-year" class="form-control form-control-sm no-spinners" style="width:65px; text-align:center;" placeholder="Anno" value="1" min="1" max="6" title="Anno di corso">
            <input type="color" id="uni-new-course-color" value="#ffffff" style="width:32px; height:28px; background:transparent; border:1px solid var(--border-color); cursor:pointer;">
            <button type="button" id="btn-add-uni-course" class="btn btn-primary btn-sm">[+ ADD COURSE]</button>
        </div>

        <div id="uni-remaining-list" style="display:flex; flex-direction:column; gap:8px;"></div>
    `;

    container.querySelector('#btn-add-uni-course').onclick = () => {
        const name = container.querySelector('#uni-new-course-name').value;
        const cfu = container.querySelector('#uni-new-course-cfu').value;
        const year = container.querySelector('#uni-new-course-year').value;
        const color = container.querySelector('#uni-new-course-color').value;
        addRemainingCourse(name, cfu, year, color);
    };

    const listEl = container.querySelector('#uni-remaining-list');
    const courses = uniData.remainingExams || [];

    if (courses.length === 0) {
        listEl.innerHTML = '<div class="empty-state">[ NESSUN ESAME IN ROADMAP — AGGIUNGI UN CORSO SOPRA ]</div>';
        return;
    }

    courses.forEach(course => {
        const hoursStudied = getExamStudiedHours(course.id, course.name);
        const phase = course.prepPhase || 'none';

        const card = document.createElement('div');
        card.style.cssText = `border:1px solid ${phase !== 'none' ? 'var(--border-bright)' : 'var(--border-color)'}; border-left:3px solid ${course.color || '#ffffff'}; padding:10px 12px; background:rgba(255,255,255,0.02); display:flex; flex-direction:column; gap:8px;`;

        let phaseBadge = '<span style="color:var(--text-dim);">[IN ATTESA]</span>';
        if (phase === 'study') {
            phaseBadge = '<span style="color:var(--accent-green); font-weight:bold;">[FASE 1 ATTIVA: 4x30m STUDIO + 2x30m ANKI]</span>';
        } else if (phase === 'proofs') {
            phaseBadge = '<span style="color:var(--accent-gold); font-weight:bold;">[FASE 2 ATTIVA: 4x30m DIMOSTRAZIONI + 2x30m ANKI]</span>';
        }

        card.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
                <div>
                    <strong style="font-size:var(--font-md); color:var(--text-main); text-transform:uppercase;">${escapeHtml(course.name)}</strong>
                    <span style="font-size:var(--font-xs); color:var(--text-dim); margin-left:8px;">${course.cfu} CFU · ANNO ${course.year || 1}</span>
                </div>
                <div style="display:flex; align-items:center; gap:10px; font-size:var(--font-xs);">
                    <span style="padding:2px 7px; border:1px solid var(--border-color); background:#050505; font-variant-numeric:tabular-nums;">
                        STUDIED: <strong style="color:var(--text-main);">${hoursStudied.toFixed(1)}H</strong>
                    </span>
                </div>
            </div>

            <div style="font-size:var(--font-xs); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                <div>${phaseBadge}</div>
                <div class="uni-course-actions" style="display:flex; gap:5px; flex-wrap:wrap;"></div>
            </div>
        `;

        const actBox = card.querySelector('.uni-course-actions');

        // Bottone Fase 1: 4x30m Studio + 2x30m Anki
        const btnPhase1 = document.createElement('button');
        btnPhase1.className = `btn btn-sm ${phase === 'study' ? 'btn-primary' : ''}`;
        btnPhase1.textContent = '[1: STUDIO 4x30 + ANKI 2x30]';
        btnPhase1.onclick = () => setExamPrepPhase(course.id, phase === 'study' ? 'none' : 'study');

        // Bottone Fase 2: 4x30m Dimostrazioni + 2x30m Anki
        const btnPhase2 = document.createElement('button');
        btnPhase2.className = `btn btn-sm ${phase === 'proofs' ? 'btn-primary' : ''}`;
        btnPhase2.textContent = '[2: DIMOSTR. 4x30 + ANKI 2x30]';
        btnPhase2.onclick = () => setExamPrepPhase(course.id, phase === 'proofs' ? 'none' : 'proofs');

        // Bottone Avvia Focus immediato sulla categoria del corso
        const btnFocus = document.createElement('button');
        btnFocus.className = 'btn btn-sm';
        btnFocus.textContent = '[▶ FOCUS]';
        btnFocus.onclick = () => {
            if (typeof startTaskFocusByQuery === 'function') {
                if (!startTaskFocusByQuery(course.name)) {
                    showToast(`Attiva prima la Fase 1 o 2 per "${course.name}"`);
                }
            }
        };

        // Bottone Supera Esame -> Sposta nel Libretto
        const btnPass = document.createElement('button');
        btnPass.className = 'btn btn-sm';
        btnPass.style.borderColor = 'var(--accent-green)';
        btnPass.style.color = 'var(--accent-green)';
        btnPass.textContent = '[PASS ✓]';
        btnPass.onclick = () => {
            const g = prompt(`Inserisci il voto (18-30 o 30L) per "${course.name}" (${course.cfu} CFU):`, '30');
            if (g !== null && g.trim() !== '') {
                recordPassedExam(course.id, g.trim(), course.cfu, todayStr);
            }
        };

        const btnDel = document.createElement('button');
        btnDel.className = 'icon-btn delete';
        btnDel.textContent = '[X]';
        btnDel.onclick = () => {
            templates.filter(t => t.uniExamId === course.id).forEach(t => archiveTemplateSafely(t));
            uniData.remainingExams = uniData.remainingExams.filter(x => x.id !== course.id);
            syncCategoryOrder();
            saveData();
            saveUniData();
            refreshAllConnectedViews();
        };

        actBox.appendChild(btnPhase1);
        actBox.appendChild(btnPhase2);
        actBox.appendChild(btnFocus);
        actBox.appendChild(btnPass);
        actBox.appendChild(btnDel);

        listEl.appendChild(card);
    });
}

// ============================================================================
// SOTTO-MODULO 2: ORARIO LEZIONI -> TIMED TASKS (PLANNER + SCHEDULED TASKS)
// ============================================================================

function renderUniSubLectures(container) {
    const courses = uniData.remainingExams || [];

    container.innerHTML = `
        <div class="sub-column-header" style="display:flex; justify-content:space-between; align-items:center;">
            <span>2. Orario Lezioni (Timed Tasks)</span>
            <span style="font-size:0.65rem; color:var(--text-dim);">APPEARS ON WEEKLY PLANNER &amp; SCHEDULED DAILY TASKS</span>
        </div>
        <div id="uni-lectures-body" style="display:flex; flex-direction:column; gap:12px;"></div>
    `;

    const body = container.querySelector('#uni-lectures-body');
    if (courses.length === 0) {
        body.innerHTML = '<div class="empty-state">[ AGGIUNGI PRIMA UN CORSO NELLA ROADMAP PER CONFIGURARNE LE LEZIONI ]</div>';
        return;
    }

    const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    const dayVals = [1, 2, 3, 4, 5];

    courses.forEach(course => {
        if (!Array.isArray(course.lectures)) course.lectures = [];

        const box = document.createElement('div');
        box.style.cssText = `border:1px solid var(--border-color); border-left:3px solid ${course.color || '#ffffff'}; padding:10px; background:rgba(255,255,255,0.015); display:flex; flex-direction:column; gap:8px;`;

        box.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                <strong style="color:var(--text-main); text-transform:uppercase;">${escapeHtml(course.name)}</strong>
                <div style="display:flex; gap:6px; align-items:center; font-size:var(--font-xs);">
                    <span style="color:var(--text-dim);">START:</span>
                    <input type="date" class="form-control form-control-sm lec-start-inp" style="width:120px; padding:2px 6px;" value="${course.lectureStart || todayStr}">
                    <span style="color:var(--text-dim);">END:</span>
                    <input type="date" class="form-control form-control-sm lec-end-inp" style="width:120px; padding:2px 6px;" value="${course.lectureEnd || ''}">
                </div>
            </div>
            <div class="lec-slots-list" style="display:flex; flex-direction:column; gap:6px;"></div>
            <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap; padding-top:4px; border-top:1px dotted #222;">
                <input type="time" class="form-control form-control-sm new-lec-start" style="width:88px;" value="09:00">
                <span style="color:var(--text-dim);">-</span>
                <input type="time" class="form-control form-control-sm new-lec-end" style="width:88px;" value="11:00">
                <div class="new-lec-days" style="display:flex; gap:6px; font-size:var(--font-xs);">
                    ${dayVals.map((v, i) => `<label style="cursor:pointer;"><input type="checkbox" value="${v}"> ${dayLabels[i]}</label>`).join('')}
                </div>
                <button type="button" class="btn btn-sm btn-add-lec-slot" style="margin-left:auto;">[+ SLOT LEZIONE]</button>
            </div>
        `;

        const startInp = box.querySelector('.lec-start-inp');
        const endInp = box.querySelector('.lec-end-inp');
        startInp.onchange = () => {
            course.lectureStart = startInp.value || todayStr;
            syncCourseLecturesToTimedTask(course);
            saveUniData();
            refreshAllConnectedViews();
        };
        endInp.onchange = () => {
            course.lectureEnd = endInp.value || '';
            syncCourseLecturesToTimedTask(course);
            saveUniData();
            refreshAllConnectedViews();
        };

        const slotsList = box.querySelector('.lec-slots-list');
        if (course.lectures.length === 0) {
            slotsList.innerHTML = '<div style="font-size:var(--font-xs); color:var(--text-dim);">Nessuno slot lezione configurato.</div>';
        } else {
            course.lectures.forEach((slot, sIdx) => {
                const dayNamesStr = (slot.days || []).map(d => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(', ');
                const sRow = document.createElement('div');
                sRow.style.cssText = 'display:flex; justify-content:space-between; align-items:center; font-size:var(--font-xs); padding:4px 8px; background:rgba(255,255,255,0.03); border:1px solid var(--border-color);';
                sRow.innerHTML = `<span><strong>${escapeHtml(dayNamesStr)}</strong> // ${escapeHtml(slot.start)} – ${escapeHtml(slot.end)}</span>`;
                const delBtn = document.createElement('button');
                delBtn.className = 'icon-btn delete';
                delBtn.textContent = '[X]';
                delBtn.onclick = () => {
                    course.lectures.splice(sIdx, 1);
                    syncCourseLecturesToTimedTask(course);
                    saveUniData();
                    refreshAllConnectedViews();
                };
                sRow.appendChild(delBtn);
                slotsList.appendChild(sRow);
            });
        }

        box.querySelector('.btn-add-lec-slot').onclick = () => {
            const st = box.querySelector('.new-lec-start').value;
            const en = box.querySelector('.new-lec-end').value;
            const days = [];
            box.querySelectorAll('.new-lec-days input:checked').forEach(cb => days.push(parseInt(cb.value, 10)));
            if (!st || !en || days.length === 0) {
                showToast('Seleziona orario e almeno un giorno della settimana');
                return;
            }
            course.lectures.push({ start: st, end: en, days });
            syncCourseLecturesToTimedTask(course);
            saveUniData();
            refreshAllConnectedViews();
            showToast(`[LEZIONI] Aggiornato orario per "${course.name}"`);
        };

        body.appendChild(box);
    });
}

// ============================================================================
// SOTTO-MODULO 3: APPELLI D'ESAME & TASSE UNIVERSITARIE
// ============================================================================

function renderUniSubAppealsAndTaxes(container) {
    container.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:16px;">
            <!-- SEZIONE A: APPELLI D'ESAME -->
            <div>
                <div class="sub-column-header" style="display:flex; justify-content:space-between;">
                    <span>3A. Appelli d'Esame &amp; Countdown</span>
                    <span style="font-size:0.65rem; color:var(--text-dim);">AUTO-SYNCS TO CALENDAR &amp; PLANNER</span>
                </div>
                <div style="display:flex; gap:6px; margin-bottom:10px; flex-wrap:wrap;">
                    <input type="text" id="uni-app-name" class="form-control form-control-sm" style="flex:2; min-width:120px;" placeholder="Esame (es. Algebra)...">
                    <input type="date" id="uni-app-date" class="form-control form-control-sm" style="width:125px;" value="${todayStr}">
                    <input type="time" id="uni-app-time" class="form-control form-control-sm" style="width:85px;" value="09:00">
                    <button type="button" id="btn-add-uni-appeal" class="btn btn-primary btn-sm">[+ APPELLO]</button>
                </div>
                <div id="uni-appeals-list" style="display:flex; flex-direction:column; gap:6px;"></div>
            </div>

            <!-- SEZIONE B: TASSE UNIVERSITARIE (EVENTO ROSSO + CATEGORIA "TASSE UNI") -->
            <div style="border-top:1px solid var(--border-color); padding-top:12px;">
                <div class="sub-column-header" style="display:flex; justify-content:space-between;">
                    <span>3B. Tasse Universitarie (Scadenze &amp; Pagamenti)</span>
                    <span style="font-size:0.65rem; color:var(--accent-red);">RED CALENDAR EVENT + "TASSE UNI" MONEY CAT</span>
                </div>
                <div style="display:flex; gap:6px; margin-bottom:10px; flex-wrap:wrap;">
                    <input type="text" id="uni-tax-title" class="form-control form-control-sm" style="flex:2; min-width:120px;" placeholder="Nome Tassa (es. I Rata, II Rata)...">
                    <input type="number" id="uni-tax-amount" class="form-control form-control-sm no-spinners" style="width:85px;" step="0.01" placeholder="€ Importo">
                    <input type="date" id="uni-tax-date" class="form-control form-control-sm" style="width:125px;" value="${todayStr}">
                    <button type="button" id="btn-add-uni-tax" class="btn btn-danger btn-sm">[+ TASSA]</button>
                </div>
                <div id="uni-taxes-list" style="display:flex; flex-direction:column; gap:6px;"></div>
            </div>
        </div>
    `;

    container.querySelector('#btn-add-uni-appeal').onclick = () => {
        const name = container.querySelector('#uni-app-name').value;
        const date = container.querySelector('#uni-app-date').value;
        const time = container.querySelector('#uni-app-time').value;
        addUniAppeal(name, date, time);
    };

    container.querySelector('#btn-add-uni-tax').onclick = () => {
        const title = container.querySelector('#uni-tax-title').value;
        const amt = container.querySelector('#uni-tax-amount').value;
        const date = container.querySelector('#uni-tax-date').value;
        addUniTax(title, amt, date);
    };

    // Render Appelli ordinati per data
    const appListEl = container.querySelector('#uni-appeals-list');
    const sortedAppeals = [...(uniData.appeals || [])].sort((a, b) => a.date.localeCompare(b.date));

    if (sortedAppeals.length === 0) {
        appListEl.innerHTML = '<div class="empty-state" style="padding:4px 0;">[ NESSUN APPELLO IN PROGRAMMA ]</div>';
    } else {
        sortedAppeals.forEach(app => {
            const diffDays = Math.ceil((new Date(app.date) - new Date(todayStr)) / (1000 * 60 * 60 * 24));
            const cdLabel = diffDays === 0 ? 'TODAY!' : (diffDays > 0 ? `IN ${diffDays} DAYS` : `${Math.abs(diffDays)}D AGO`);

            const row = document.createElement('div');
            row.className = 'm-item-row';
            row.style.borderLeftColor = 'var(--accent-gold)';
            row.style.cursor = 'pointer';
            row.title = 'Click to jump Calendar to this appeal date';
            row.onclick = () => jumpToDate(app.date);

            row.innerHTML = `
                <div>
                    <div class="m-title">${escapeHtml(app.examName)}</div>
                    <div class="m-sub">${escapeHtml(app.date)} // ORE ${escapeHtml(app.time || '09:00')}</div>
                </div>
                <div style="display:flex; align-items:center; gap:10px;">
                    <span style="font-size:var(--font-xs); font-weight:bold; color:${diffDays <= 7 && diffDays >= 0 ? 'var(--accent-red)' : 'var(--accent-gold)'};">[${cdLabel}]</span>
                </div>
            `;
            const delBtn = document.createElement('button');
            delBtn.className = 'icon-btn delete';
            delBtn.textContent = '[X]';
            delBtn.onclick = (e) => { e.stopPropagation(); deleteUniAppeal(app.id); };
            row.lastElementChild.appendChild(delBtn);
            appListEl.appendChild(row);
        });
    }

    // Render Tasse Universitarie
    const taxListEl = container.querySelector('#uni-taxes-list');
    const sortedTaxes = [...(uniData.taxes || [])].sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    if (sortedTaxes.length === 0) {
        taxListEl.innerHTML = '<div class="empty-state" style="padding:4px 0;">[ NESSUNA TASSA REGISTRATA ]</div>';
    } else {
        sortedTaxes.forEach(tax => {
            const diffDays = Math.ceil((new Date(tax.dueDate) - new Date(todayStr)) / (1000 * 60 * 60 * 24));
            const statusBadge = tax.paid
                ? '<span style="color:var(--accent-green); font-weight:bold;">[PAGATA ✓]</span>'
                : `<span style="color:var(--accent-red); font-weight:bold;">[SCADE: ${tax.dueDate} (${diffDays >= 0 ? diffDays + 'g' : 'SCADUTA'})]</span>`;

            const row = document.createElement('div');
            row.className = 'm-item-row';
            row.style.borderLeftColor = tax.paid ? 'var(--accent-green)' : 'var(--accent-red)';
            row.style.opacity = tax.paid ? '0.6' : '1';

            row.innerHTML = `
                <div style="cursor:pointer;" onclick="jumpToDate('${tax.dueDate}')">
                    <div class="m-title"><span class="m-cat-badge">Tasse Uni</span>${escapeHtml(tax.title)}</div>
                    <div class="m-sub">${statusBadge}</div>
                </div>
                <div style="display:flex; align-items:center; gap:8px;">
                    <span class="m-amt neg">€${Number(tax.amount).toFixed(2)}</span>
                </div>
            `;

            if (!tax.paid) {
                const payBtn = document.createElement('button');
                payBtn.className = 'btn btn-sm';
                payBtn.textContent = '[PAY]';
                payBtn.title = 'Registra pagamento in Money sotto "Tasse Uni"';
                payBtn.onclick = () => payUniTax(tax.id);
                row.lastElementChild.appendChild(payBtn);
            }

            const delBtn = document.createElement('button');
            delBtn.className = 'icon-btn delete';
            delBtn.textContent = '[X]';
            delBtn.onclick = () => deleteUniTax(tax.id);
            row.lastElementChild.appendChild(delBtn);

            taxListEl.appendChild(row);
        });
    }
}

// ============================================================================
// SOTTO-MODULO 4: LIBRETTO UNIVERSITARIO & CARRIERA (180 CFU)
// ============================================================================

function renderUniSubLibretto(container) {
    container.innerHTML = `
        <div class="sub-column-header" style="display:flex; justify-content:space-between; align-items:center;">
            <span>4. Libretto Esami Superati (18–30L su 180 CFU)</span>
            <span style="font-size:0.65rem; color:var(--text-dim);">30L = 30 IN AVERAGES</span>
        </div>

        <div style="display:flex; gap:6px; margin-bottom:12px; flex-wrap:wrap;">
            <input type="text" id="uni-lib-name" class="form-control form-control-sm" style="flex:2; min-width:130px;" placeholder="Nome Esame...">
            <input type="text" id="uni-lib-grade" class="form-control form-control-sm" style="width:70px; text-align:center;" placeholder="28 / 30L">
            <input type="number" id="uni-lib-cfu" class="form-control form-control-sm no-spinners" style="width:65px; text-align:center;" placeholder="CFU" value="9" min="1">
            <input type="date" id="uni-lib-date" class="form-control form-control-sm" style="width:125px;" value="${todayStr}">
            <button type="button" id="btn-add-uni-libretto" class="btn btn-primary btn-sm">[+ REGISTRA VOTO]</button>
        </div>

        <div id="uni-libretto-list" style="display:flex; flex-direction:column; gap:6px;"></div>
    `;

    container.querySelector('#btn-add-uni-libretto').onclick = () => {
        const name = container.querySelector('#uni-lib-name').value;
        const grade = container.querySelector('#uni-lib-grade').value;
        const cfu = container.querySelector('#uni-lib-cfu').value;
        const date = container.querySelector('#uni-lib-date').value;
        recordPassedExam(name, grade, cfu, date);
    };

    const listEl = container.querySelector('#uni-libretto-list');
    const passed = [...(uniData.passedExams || [])].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    if (passed.length === 0) {
        listEl.innerHTML = '<div class="empty-state">[ NESSUN ESAME REGISTRATO NEL LIBRETTO ]</div>';
        return;
    }

    passed.forEach(ex => {
        const row = document.createElement('div');
        row.className = 'm-item-row in';
        const gradeBadge = `${ex.grade}${ex.laude ? 'L' : ''}`;

        row.innerHTML = `
            <div>
                <div class="m-title">${escapeHtml(ex.name)} <span style="color:var(--text-dim); font-size:var(--font-xs); margin-left:6px;">(${ex.cfu} CFU)</span></div>
                <div class="m-sub">REGISTRATO // ${escapeHtml(ex.date || todayStr)}</div>
            </div>
            <div style="display:flex; align-items:center; gap:12px;">
                <span style="font-size:var(--font-md); font-weight:bold; color:var(--accent-green); font-variant-numeric:tabular-nums;">${gradeBadge}</span>
            </div>
        `;

        const delBtn = document.createElement('button');
        delBtn.className = 'icon-btn delete';
        delBtn.textContent = '[X]';
        delBtn.onclick = () => {
            uniData.passedExams = uniData.passedExams.filter(p => p.id !== ex.id);
            saveUniData();
            renderUniDashboard();
        };
        row.lastElementChild.appendChild(delBtn);

        listEl.appendChild(row);
    });
}

window.addEventListener('DOMContentLoaded', () => {
    ensureTasseUniCategory();
    renderUniDashboard();
});