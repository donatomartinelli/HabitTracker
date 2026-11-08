// --- js/modules/uni.js ---
// ATOMIC MODULE 9 & FIRST-CLASS SUB-MODULES:
// - uni_roadmap (#module-uni-roadmap): Corsi rimasti e fasi di studio (Fase 1 Studio+Anki / Fase 2 Dimostrazioni+Anki)
// - uni_lectures (#module-uni-lectures): Orario lezioni sincronizzato con Planner e Tasks
// - uni_appeals (#module-uni-appeals): Appelli con countdown e Tasse Universitarie
// - uni_libretto (#module-uni-libretto): Medie, progresso 180 CFU ed esami verbalizzati

let showRoadmapAddForm = false;
let showLibrettoAddForm = false;

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

function setExamPrepPhase(examId, newPhase) {
    const exam = (uniData.remainingExams || []).find(x => x.id === examId);
    if (!exam) return;

    exam.prepPhase = newPhase;

    const existingStudyTasks = templates.filter(t => t.uniExamId === exam.id && ['studio', 'anki', 'dimostrazioni'].includes(t.uniRole));

    if (newPhase === 'none') {
        existingStudyTasks.forEach(t => archiveTemplateSafely(t));
    } else if (newPhase === 'study') {
        existingStudyTasks.filter(t => t.uniRole === 'dimostrazioni').forEach(t => archiveTemplateSafely(t));
        upsertExamStudyTask(exam, 'studio', 'Studio', 4, 30);
        upsertExamStudyTask(exam, 'anki', 'Anki', 2, 30);
    } else if (newPhase === 'proofs') {
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
            'study': `[UNI] "${exam.name}": 4x30m Studio + 2x30m Anki`,
            'proofs': `[UNI] "${exam.name}": 4x30m Dimostrazioni + 2x30m Anki`,
            'none': `[UNI] Paused "${exam.name}"`
        };
        showToast(msgMap[newPhase] || '[UNI] Updated');
    }
}

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
    showRoadmapAddForm = false;
    saveUniData();
    renderUniDashboard();
    return true;
}

function recordPassedExam(examNameOrId, rawGrade, rawCfu = null, dateStr = todayStr) {
    const q = (examNameOrId || '').trim();
    if (!q) return false;

    const gradeStr = String(rawGrade || '30').trim().toUpperCase();
    const isLaude = gradeStr.includes('L');
    const numericGrade = Math.min(30, Math.max(18, parseInt(gradeStr.replace(/\D/g, ''), 10) || 30));

    const remIdx = (uniData.remainingExams || []).findIndex(
        x => x.id === q || x.name.toLowerCase() === q.toLowerCase() || x.name.toLowerCase().includes(q.toLowerCase())
    );

    let finalName = q;
    let finalCfu = parseInt(rawCfu, 10) || 6;

    if (remIdx !== -1) {
        const matchedCourse = uniData.remainingExams[remIdx];
        finalName = matchedCourse.name;
        if (!rawCfu) finalCfu = matchedCourse.cfu || 6;

        templates
            .filter(t => t.uniExamId === matchedCourse.id || t.category.toLowerCase() === finalName.toLowerCase())
            .forEach(t => archiveTemplateSafely(t));

        const appealsToRemove = (uniData.appeals || []).filter(a => a.examName.toLowerCase() === finalName.toLowerCase());
        appealsToRemove.forEach(a => {
            specificEvents = specificEvents.filter(e => e.id !== a.eventId);
        });
        uniData.appeals = (uniData.appeals || []).filter(a => a.examName.toLowerCase() !== finalName.toLowerCase());

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

    showLibrettoAddForm = false;
    syncCategoryOrder();
    saveData();
    saveUniData();
    refreshAllConnectedViews();

    if (typeof showToast === 'function') {
        showToast(`[LIBRETTO] ${finalName}: ${numericGrade}${isLaude && numericGrade === 30 ? 'L' : ''} (${finalCfu} CFU)`);
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
        specificEvents = specificEvents.filter(e => e.id !== a.eventId);
    }
    uniData.appeals = (uniData.appeals || []).filter(a => a.id !== appealId);
    saveData();
    saveUniData();
    refreshAllConnectedViews();
}

function addUniTax(title, amount, dueDateStr) {
    const cleanTitle = (title || 'Rata Universitaria').trim();
    const amt = roundCurrency(amount);
    if (amt <= 0 || !dueDateStr) return false;

    ensureTasseUniCategory();

    const taxId = 'utax_' + Date.now();
    const eventId = 'e_utax_' + taxId;

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
        showToast(`[TASSA UNI] "${cleanTitle}" (€${amt.toFixed(2)}) -> ${dueDateStr}`);
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
    specificEvents = specificEvents.filter(e => e.id !== tax.eventId);

    saveData();
    saveUniData();
    refreshAllConnectedViews();
    if (typeof showToast === 'function') {
        showToast(`[PAID] -€${tax.amount.toFixed(2)} in Tasse Uni`);
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
// 4. RENDER MASTER E I 4 SOTTO-MODULI ATOMICI INDIPENDENTI
// ============================================================================

function renderUniDashboard() {
    ensureTasseUniCategory();

    renderUniAtomRoadmap();
    renderUniAtomLectures();
    renderUniAtomAppeals();
    renderUniAtomLibretto();

    const legacyRoot = document.getElementById('uni-main-root');
    if (legacyRoot) {
        renderUniAtomRoadmap(legacyRoot);
    }
}

// ----------------------------------------------------------------------------
// ATOM 1: UNI: ROADMAP & PREP (#module-uni-roadmap)
// ----------------------------------------------------------------------------

function renderUniAtomRoadmap(customContainer = null) {
    const root = customContainer || document.getElementById('module-uni-roadmap');
    if (!root) return;

    const courses = uniData.remainingExams || [];

    const wrap = document.createElement('div');
    wrap.className = customContainer ? '' : 'module-body-padded';
    wrap.style.cssText = 'flex:1; display:flex; flex-direction:column; gap:12px; overflow-y:auto; height:100%;';

    wrap.innerHTML = `
        <div class="section-header-row" style="margin-bottom:0; flex-shrink:0;">
            <div>
                <span class="section-label">Uni Roadmap</span>
                <span style="font-size:var(--font-xs); color:var(--text-dim); margin-left:6px;">// ${courses.length} COURSES</span>
            </div>
            <button type="button" class="btn btn-sm ${showRoadmapAddForm ? 'btn-primary' : ''}" id="btn-toggle-roadmap-add">[+]</button>
        </div>

        <div id="uni-roadmap-add-row" style="display:${showRoadmapAddForm ? 'flex' : 'none'}; gap:6px; flex-wrap:wrap; padding:8px; border:1px solid var(--border-bright); background:#060606;">
            <input type="text" id="uni-new-course-name" class="form-control form-control-sm" style="flex:2; min-width:130px;" placeholder="Course name...">
            <input type="number" id="uni-new-course-cfu" class="form-control form-control-sm no-spinners" style="width:60px; text-align:center;" placeholder="CFU" value="9" min="1" max="30">
            <input type="number" id="uni-new-course-year" class="form-control form-control-sm no-spinners" style="width:55px; text-align:center;" placeholder="Yr" value="1" min="1" max="6">
            <input type="color" id="uni-new-course-color" value="#ffffff" style="width:30px; height:27px; background:transparent; border:1px solid var(--border-color); cursor:pointer;">
            <button type="button" id="btn-add-uni-course" class="btn btn-primary btn-sm">[SAVE]</button>
        </div>

        <div id="uni-remaining-list" style="display:flex; flex-direction:column; gap:8px;"></div>
    `;

    wrap.querySelector('#btn-toggle-roadmap-add').onclick = () => {
        showRoadmapAddForm = !showRoadmapAddForm;
        renderUniAtomRoadmap(customContainer);
    };

    const submitNewCourse = () => {
        const name = wrap.querySelector('#uni-new-course-name').value;
        const cfu = wrap.querySelector('#uni-new-course-cfu').value;
        const year = wrap.querySelector('#uni-new-course-year').value;
        const color = wrap.querySelector('#uni-new-course-color').value;
        addRemainingCourse(name, cfu, year, color);
    };

    wrap.querySelector('#btn-add-uni-course').onclick = submitNewCourse;
    wrap.querySelector('#uni-new-course-name').onkeydown = (e) => {
        if (e.key === 'Enter') { e.preventDefault(); submitNewCourse(); }
    };

    const listEl = wrap.querySelector('#uni-remaining-list');
    if (courses.length === 0) {
        listEl.innerHTML = '<div class="empty-state">[ NONE ]</div>';
    } else {
        courses.forEach(course => {
            const hoursStudied = getExamStudiedHours(course.id, course.name);
            const phase = course.prepPhase || 'none';

            const card = document.createElement('div');
            card.style.cssText = `border:1px solid ${phase !== 'none' ? 'var(--border-bright)' : 'var(--border-color)'}; border-left:3px solid ${course.color || '#ffffff'}; padding:10px 12px; background:rgba(255,255,255,0.02); display:flex; flex-direction:column; gap:8px;`;

            let phaseBadge = '<span style="color:var(--text-dim);">[IDLE]</span>';
            if (phase === 'study') {
                phaseBadge = '<span style="color:var(--accent-green); font-weight:bold;">[PHASE 1: 4x30m STUDIO + 2x30m ANKI]</span>';
            } else if (phase === 'proofs') {
                phaseBadge = '<span style="color:var(--accent-gold); font-weight:bold;">[PHASE 2: 4x30m DIMOSTR. + 2x30m ANKI]</span>';
            }

            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
                    <div>
                        <strong style="font-size:var(--font-md); color:var(--text-main); text-transform:uppercase;">${escapeHtml(course.name)}</strong>
                        <span style="font-size:var(--font-xs); color:var(--text-dim); margin-left:8px;">${course.cfu} CFU · Y${course.year || 1}</span>
                    </div>
                    <span style="font-size:var(--font-xs); padding:2px 7px; border:1px solid var(--border-color); background:#050505; font-variant-numeric:tabular-nums;">
                        <strong style="color:var(--text-main);">${hoursStudied.toFixed(1)}H</strong>
                    </span>
                </div>

                <div style="font-size:var(--font-xs); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                    <div>${phaseBadge}</div>
                    <div class="uni-course-actions" style="display:flex; gap:5px; flex-wrap:wrap;"></div>
                </div>
            `;

            const actBox = card.querySelector('.uni-course-actions');

            const btnPhase1 = document.createElement('button');
            btnPhase1.className = `btn btn-sm ${phase === 'study' ? 'btn-primary' : ''}`;
            btnPhase1.textContent = '[1: STUDIO]';
            btnPhase1.onclick = () => setExamPrepPhase(course.id, phase === 'study' ? 'none' : 'study');

            const btnPhase2 = document.createElement('button');
            btnPhase2.className = `btn btn-sm ${phase === 'proofs' ? 'btn-primary' : ''}`;
            btnPhase2.textContent = '[2: DIMOSTR.]';
            btnPhase2.onclick = () => setExamPrepPhase(course.id, phase === 'proofs' ? 'none' : 'proofs');

            const btnFocus = document.createElement('button');
            btnFocus.className = 'btn btn-sm';
            btnFocus.textContent = '[▶]';
            btnFocus.onclick = () => {
                if (typeof startTaskFocusByQuery === 'function') {
                    if (!startTaskFocusByQuery(course.name)) {
                        showToast(`Activate Phase 1 or 2 for "${course.name}" first`);
                    }
                }
            };

            const btnPass = document.createElement('button');
            btnPass.className = 'btn btn-sm';
            btnPass.style.borderColor = 'var(--accent-green)';
            btnPass.style.color = 'var(--accent-green)';
            btnPass.textContent = '[PASS ✓]';
            btnPass.onclick = () => {
                const g = prompt(`Grade (18-30 or 30L) for "${course.name}" (${course.cfu} CFU):`, '30');
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

    root.innerHTML = '';
    root.appendChild(wrap);
}

// ----------------------------------------------------------------------------
// ATOM 2: UNI: LECTURES (#module-uni-lectures)
// ----------------------------------------------------------------------------

function renderUniAtomLectures() {
    const root = document.getElementById('module-uni-lectures');
    if (!root) return;

    const courses = uniData.remainingExams || [];

    root.innerHTML = `
        <div class="module-body-padded" style="flex:1; display:flex; flex-direction:column; gap:12px; overflow-y:auto;">
            <div class="section-header-row" style="margin-bottom:0; flex-shrink:0;">
                <div>
                    <span class="section-label">Uni Lectures</span>
                    <span style="font-size:var(--font-xs); color:var(--text-dim); margin-left:6px;">// SCHEDULE</span>
                </div>
            </div>
            <div id="uni-lectures-body" style="display:flex; flex-direction:column; gap:12px;"></div>
        </div>
    `;

    const body = root.querySelector('#uni-lectures-body');
    if (courses.length === 0) {
        body.innerHTML = '<div class="empty-state">[ NO COURSES IN ROADMAP ]</div>';
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
                    <input type="date" class="form-control form-control-sm lec-start-inp" style="width:118px; padding:2px 6px;" value="${course.lectureStart || todayStr}">
                    <span style="color:var(--text-dim);">–</span>
                    <input type="date" class="form-control form-control-sm lec-end-inp" style="width:118px; padding:2px 6px;" value="${course.lectureEnd || ''}">
                </div>
            </div>
            <div class="lec-slots-list" style="display:flex; flex-direction:column; gap:6px;"></div>
            <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap; padding-top:4px; border-top:1px dotted #222;">
                <input type="time" class="form-control form-control-sm new-lec-start" style="width:84px;" value="09:00">
                <span style="color:var(--text-dim);">-</span>
                <input type="time" class="form-control form-control-sm new-lec-end" style="width:84px;" value="11:00">
                <div class="new-lec-days" style="display:flex; gap:6px; font-size:var(--font-xs);">
                    ${dayVals.map((v, i) => `<label style="cursor:pointer;"><input type="checkbox" value="${v}"> ${dayLabels[i]}</label>`).join('')}
                </div>
                <button type="button" class="btn btn-sm btn-add-lec-slot" style="margin-left:auto;">[+ SLOT]</button>
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
            slotsList.innerHTML = '<div class="empty-state" style="padding:2px 0;">[ NONE ]</div>';
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
            if (!st || !en || days.length === 0) return;
            course.lectures.push({ start: st, end: en, days });
            syncCourseLecturesToTimedTask(course);
            saveUniData();
            refreshAllConnectedViews();
        };

        body.appendChild(box);
    });
}

// ----------------------------------------------------------------------------
// ATOM 3: UNI: APPEALS & TAXES (#module-uni-appeals)
// ----------------------------------------------------------------------------

function renderUniAtomAppeals() {
    const root = document.getElementById('module-uni-appeals');
    if (!root) return;

    const appealsCount = (uniData.appeals || []).length;
    const unpaidTaxes = (uniData.taxes || []).filter(t => !t.paid).length;

    root.innerHTML = `
        <div class="module-body-padded" style="flex:1; display:flex; flex-direction:column; gap:14px; overflow-y:auto;">
            <div class="section-header-row" style="margin-bottom:0; flex-shrink:0;">
                <div>
                    <span class="section-label">Appeals &amp; Taxes</span>
                    <span style="font-size:var(--font-xs); color:var(--text-dim); margin-left:6px;">// ${appealsCount} APPEALS · ${unpaidTaxes} UNPAID</span>
                </div>
            </div>

            <div class="daily-columns-wrap" style="align-items:flex-start; gap:16px;">
                <!-- COLONNA SINISTRA: APPELLI -->
                <div style="flex:1; min-width:0; display:flex; flex-direction:column; gap:8px;">
                    <div class="sub-column-header">Exam Appeals</div>
                    <div style="display:flex; gap:6px; flex-wrap:wrap;">
                        <input type="text" id="uni-app-name" class="form-control form-control-sm" style="flex:1; min-width:100px;" placeholder="Exam...">
                        <input type="date" id="uni-app-date" class="form-control form-control-sm" style="width:118px;" value="${todayStr}">
                        <input type="time" id="uni-app-time" class="form-control form-control-sm" style="width:80px;" value="09:00">
                        <button type="button" id="btn-add-uni-appeal" class="btn btn-primary btn-sm">[+]</button>
                    </div>
                    <div id="uni-appeals-list" style="display:flex; flex-direction:column; gap:6px;"></div>
                </div>

                <!-- COLONNA DESTRA: TASSE UNIVERSITARIE -->
                <div style="flex:1; min-width:0; display:flex; flex-direction:column; gap:8px;">
                    <div class="sub-column-header">University Taxes</div>
                    <div style="display:flex; gap:6px; flex-wrap:wrap;">
                        <input type="text" id="uni-tax-title" class="form-control form-control-sm" style="flex:1; min-width:95px;" placeholder="Tax name...">
                        <input type="number" id="uni-tax-amount" class="form-control form-control-sm no-spinners" style="width:75px;" step="0.01" placeholder="€">
                        <input type="date" id="uni-tax-date" class="form-control form-control-sm" style="width:118px;" value="${todayStr}">
                        <button type="button" id="btn-add-uni-tax" class="btn btn-danger btn-sm">[+]</button>
                    </div>
                    <div id="uni-taxes-list" style="display:flex; flex-direction:column; gap:6px;"></div>
                </div>
            </div>
        </div>
    `;

    root.querySelector('#btn-add-uni-appeal').onclick = () => {
        const name = root.querySelector('#uni-app-name').value;
        const date = root.querySelector('#uni-app-date').value;
        const time = root.querySelector('#uni-app-time').value;
        addUniAppeal(name, date, time);
    };

    root.querySelector('#btn-add-uni-tax').onclick = () => {
        const title = root.querySelector('#uni-tax-title').value;
        const amt = root.querySelector('#uni-tax-amount').value;
        const date = root.querySelector('#uni-tax-date').value;
        addUniTax(title, amt, date);
    };

    const appListEl = root.querySelector('#uni-appeals-list');
    const sortedAppeals = [...(uniData.appeals || [])].sort((a, b) => a.date.localeCompare(b.date));

    if (sortedAppeals.length === 0) {
        appListEl.innerHTML = '<div class="empty-state" style="padding:4px 0;">[ NONE ]</div>';
    } else {
        sortedAppeals.forEach(app => {
            const diffDays = Math.ceil((parseLocalDate(app.date) - parseLocalDate(todayStr)) / (1000 * 60 * 60 * 24));
            const cdLabel = diffDays === 0 ? 'TODAY' : (diffDays > 0 ? `${diffDays}D` : `${Math.abs(diffDays)}D AGO`);

            const row = document.createElement('div');
            row.className = 'm-item-row';
            row.style.borderLeftColor = 'var(--accent-gold)';
            row.style.cursor = 'pointer';
            row.onclick = () => jumpToDate(app.date);

            row.innerHTML = `
                <div>
                    <div class="m-title">${escapeHtml(app.examName)}</div>
                    <div class="m-sub">${escapeHtml(app.date)} // ${escapeHtml(app.time || '09:00')}</div>
                </div>
                <div style="display:flex; align-items:center; gap:8px;">
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

    const taxListEl = root.querySelector('#uni-taxes-list');
    const sortedTaxes = [...(uniData.taxes || [])].sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    if (sortedTaxes.length === 0) {
        taxListEl.innerHTML = '<div class="empty-state" style="padding:4px 0;">[ NONE ]</div>';
    } else {
        sortedTaxes.forEach(tax => {
            const diffDays = Math.ceil((parseLocalDate(tax.dueDate) - parseLocalDate(todayStr)) / (1000 * 60 * 60 * 24));
            const statusBadge = tax.paid
                ? '<span style="color:var(--accent-green); font-weight:bold;">[PAID ✓]</span>'
                : `<span style="color:var(--accent-red); font-weight:bold;">[${tax.dueDate} (${diffDays >= 0 ? diffDays + 'D' : 'OVERDUE'})]</span>`;

            const row = document.createElement('div');
            row.className = 'm-item-row';
            row.style.borderLeftColor = tax.paid ? 'var(--accent-green)' : 'var(--accent-red)';
            row.style.opacity = tax.paid ? '0.6' : '1';

            row.innerHTML = `
                <div style="cursor:pointer;" onclick="jumpToDate('${tax.dueDate}')">
                    <div class="m-title">${escapeHtml(tax.title)}</div>
                    <div class="m-sub">${statusBadge}</div>
                </div>
                <div style="display:flex; align-items:center; gap:6px;">
                    <span class="m-amt neg">€${Number(tax.amount).toFixed(2)}</span>
                </div>
            `;

            if (!tax.paid) {
                const payBtn = document.createElement('button');
                payBtn.className = 'btn btn-sm';
                payBtn.textContent = '[PAY]';
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

// ----------------------------------------------------------------------------
// ATOM 4: UNI: LIBRETTO (180 CFU) (#module-uni-libretto)
// ----------------------------------------------------------------------------

function renderUniAtomLibretto() {
    const root = document.getElementById('module-uni-libretto');
    if (!root) return;

    const stats = calculateUniStats();
    const passed = [...(uniData.passedExams || [])].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    root.innerHTML = `
        <div class="module-body-padded" style="flex:1; display:flex; flex-direction:column; gap:12px; overflow-y:auto;">
            <div class="section-header-row" style="margin-bottom:0; flex-shrink:0;">
                <div>
                    <span class="section-label">Libretto</span>
                    <span style="font-size:var(--font-xs); color:var(--text-dim); margin-left:6px; font-variant-numeric:tabular-nums;">// ${stats.totalCfu}/${stats.targetCfu} CFU (${stats.cfuPct}%)</span>
                </div>
                <button type="button" class="btn btn-sm ${showLibrettoAddForm ? 'btn-primary' : ''}" id="btn-toggle-lib-add">[+]</button>
            </div>

            <!-- METRICHE CARRIERA COMPATTE -->
            <div style="display:grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap:8px;">
                <div class="cfg-box" style="margin:0; padding:8px 10px; text-align:center;">
                    <div style="font-size:0.6rem; color:var(--text-dim);">WEIGHTED AVG</div>
                    <div style="font-size:var(--font-md); font-weight:bold; color:var(--accent-green); margin-top:2px; font-variant-numeric:tabular-nums;">${stats.weightedMean.toFixed(2)}</div>
                </div>
                <div class="cfg-box" style="margin:0; padding:8px 10px; text-align:center;">
                    <div style="font-size:0.6rem; color:var(--text-dim);">ARITHMETIC AVG</div>
                    <div style="font-size:var(--font-md); font-weight:bold; color:var(--text-main); margin-top:2px; font-variant-numeric:tabular-nums;">${stats.arithmeticMean.toFixed(2)}</div>
                </div>
                <div class="cfg-box" style="margin:0; padding:8px 10px; text-align:center;">
                    <div style="font-size:0.6rem; color:var(--text-dim);">BASE /110</div>
                    <div style="font-size:var(--font-md); font-weight:bold; color:var(--accent-gold); margin-top:2px; font-variant-numeric:tabular-nums;">${stats.base110.toFixed(1)}</div>
                </div>
                <div class="cfg-box" style="margin:0; padding:8px 10px; text-align:center;">
                    <div style="font-size:0.6rem; color:var(--text-dim);">EXAMS PASSED</div>
                    <div style="font-size:var(--font-md); font-weight:bold; color:var(--text-main); margin-top:2px; font-variant-numeric:tabular-nums;">${stats.count}${stats.laudeCount > 0 ? ' (' + stats.laudeCount + 'L)' : ''}</div>
                </div>
            </div>

            <div class="vault-progress-track" style="height:5px; flex-shrink:0;">
                <div class="vault-progress-fill" style="width:${stats.cfuPct}%;"></div>
            </div>

            <div id="uni-lib-add-row" style="display:${showLibrettoAddForm ? 'flex' : 'none'}; gap:6px; flex-wrap:wrap; padding:8px; border:1px solid var(--border-bright); background:#060606;">
                <input type="text" id="uni-lib-name" class="form-control form-control-sm" style="flex:2; min-width:120px;" placeholder="Exam name...">
                <input type="text" id="uni-lib-grade" class="form-control form-control-sm" style="width:65px; text-align:center;" placeholder="30L">
                <input type="number" id="uni-lib-cfu" class="form-control form-control-sm no-spinners" style="width:60px; text-align:center;" placeholder="CFU" value="9" min="1">
                <input type="date" id="uni-lib-date" class="form-control form-control-sm" style="width:118px;" value="${todayStr}">
                <button type="button" id="btn-add-uni-libretto" class="btn btn-primary btn-sm">[SAVE]</button>
            </div>

            <div id="uni-libretto-list" style="display:flex; flex-direction:column; gap:6px;"></div>
        </div>
    `;

    root.querySelector('#btn-toggle-lib-add').onclick = () => {
        showLibrettoAddForm = !showLibrettoAddForm;
        renderUniAtomLibretto();
    };

    root.querySelector('#btn-add-uni-libretto').onclick = () => {
        const name = root.querySelector('#uni-lib-name').value;
        const grade = root.querySelector('#uni-lib-grade').value;
        const cfu = root.querySelector('#uni-lib-cfu').value;
        const date = root.querySelector('#uni-lib-date').value;
        recordPassedExam(name, grade, cfu, date);
    };

    const listEl = root.querySelector('#uni-libretto-list');
    if (passed.length === 0) {
        listEl.innerHTML = '<div class="empty-state">[ NONE ]</div>';
        return;
    }

    passed.forEach(ex => {
        const row = document.createElement('div');
        row.className = 'm-item-row in';
        const gradeBadge = `${ex.grade}${ex.laude ? 'L' : ''}`;

        row.innerHTML = `
            <div>
                <div class="m-title">${escapeHtml(ex.name)} <span style="color:var(--text-dim); font-size:var(--font-xs); margin-left:6px;">(${ex.cfu} CFU)</span></div>
                <div class="m-sub">${escapeHtml(ex.date || todayStr)}</div>
            </div>
            <div style="display:flex; align-items:center; gap:10px;">
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