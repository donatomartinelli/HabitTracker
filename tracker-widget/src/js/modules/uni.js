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

let roadmapViewMode = cortexStore.getItem('cortex_roadmap_view') || 'grid';

function toggleRoadmapView() {
    roadmapViewMode = roadmapViewMode === 'list' ? 'grid' : 'list';
    cortexStore.setItem('cortex_roadmap_view', roadmapViewMode);
    renderUniAtomRoadmap();
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

function syncCourseLecturesToEvents(exam) {
    // Rimuovi in modo sicuro tutti i vecchi eventi lezione associati a questo corso
    specificEvents = specificEvents.filter(e => !(e.uniExamId === exam.id && e.uniRole === 'lecture'));
    
    if (!exam.lectures || exam.lectures.length === 0 || !exam.lectureStart || !exam.lectureEnd) {
        saveData();
        return;
    }
    
    const startD = parseLocalDate(exam.lectureStart);
    const endD = parseLocalDate(exam.lectureEnd);
    let curr = new Date(startD);
    
    while (curr <= endD) {
        const dayIdx = curr.getDay(); // 0 (Sun) to 6 (Sat)
        const dateStr = formatDate(curr);
        
        exam.lectures.forEach(slot => {
            if (slot.days && slot.days.includes(dayIdx)) {
                specificEvents.push({
                    id: `e_lec_${exam.id}_${dateStr}_${slot.start.replace(':','')}`,
                    uniExamId: exam.id,
                    uniRole: 'lecture',
                    title: `[LEZ] ${exam.name}`,
                    date: dateStr,
                    start: slot.start,
                    end: slot.end,
                    color: exam.color || '#4c5b73'
                });
            }
        });
        curr.setDate(curr.getDate() + 1);
    }
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

        // COLD STORAGE: Task e Routine
        templates
            .filter(t => t.uniExamId === matchedCourse.id || t.category.toLowerCase() === finalName.toLowerCase())
            .forEach(t => archiveTemplateSafely(t));

        // Pulisci Appelli e Lezioni
        const appealsToRemove = (uniData.appeals || []).filter(a => a.examName.toLowerCase() === finalName.toLowerCase());
        appealsToRemove.forEach(a => { specificEvents = specificEvents.filter(e => e.id !== a.eventId); });
        uniData.appeals = (uniData.appeals || []).filter(a => a.examName.toLowerCase() !== finalName.toLowerCase());
        specificEvents = specificEvents.filter(e => e.uniExamId !== matchedCourse.id);

        // COLD STORAGE: Note -> "Archive / Nome Corso"
        const archiveRoot = `Archive / ${finalName}`;
        if (!noteCategories.includes(archiveRoot)) noteCategories.push(archiveRoot);

        Object.keys(notesContent).forEach(cat => {
            if (cat === finalName || cat.startsWith(`${finalName} /`)) {
                const subName = cat === finalName ? 'Generale' : cat.replace(`${finalName} /`, '').trim();
                const destCat = `${archiveRoot} / ${subName}`;
                if (!noteCategories.includes(destCat)) noteCategories.push(destCat);
                notesContent[destCat] = notesContent[cat];
                delete notesContent[cat];
                noteCategories = noteCategories.filter(c => c !== cat);
            }
        });

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
        showToast(`[COLD STORAGE] ${finalName} verbalizzato. Dati archiviati.`);
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
    // (fees category is ensured when a fee is added or paid)

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
    wrap.style.cssText = 'flex:1; display:flex; flex-direction:column; gap:var(--space-3); overflow-y:auto; height:100%;';

    wrap.innerHTML = `
        <div class="section-header-row u-mb-0 u-noshrink">
            <div>
                <span class="section-label">Uni Roadmap</span>
                <span class="u-fs-xs u-dim u-ml-2">// ${courses.length} COURSES</span>
            </div>
            <div class="u-flex u-gap-2">
                <button type="button" class="btn btn-sm" onclick="toggleRoadmapView()">[VIEW: ${roadmapViewMode.toUpperCase()}]</button>
                <button type="button" class="btn btn-sm ${showRoadmapAddForm ? 'btn-primary' : ''}" id="btn-toggle-roadmap-add">+</button>
            </div>
        </div>

        <div id="uni-roadmap-add-row" style="display:${showRoadmapAddForm ? 'flex' : 'none'}; gap:var(--space-2); flex-wrap:wrap; padding:var(--space-2); border:1px solid var(--border-bright); background:#060606;">
            <input type="text" id="uni-new-course-name" class="form-control form-control-sm" style="flex:2; min-width:130px;" placeholder="Course name...">
            <input type="number" id="uni-new-course-cfu" class="form-control form-control-sm no-spinners u-tc" style="width:60px;" placeholder="CFU" value="9" min="1" max="30">
            <input type="number" id="uni-new-course-year" class="form-control form-control-sm no-spinners u-tc" style="width:55px;" placeholder="Yr" value="1" min="1" max="6">
            <input class="u-pointer" type="color" id="uni-new-course-color" value="#ffffff" style="width:30px; height:27px; background:transparent; border:1px solid var(--border-color);">
            <button type="button" id="btn-add-uni-course" class="btn btn-primary btn-sm">[SAVE]</button>
        </div>

        <div class="u-col u-gap-2" id="uni-remaining-list" style="display:flex;"></div>
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
        listEl.innerHTML = '<div class="empty-state">[ NO COURSES IN ROADMAP ]</div>';
    } else {
        const groupedByYear = {};
        courses.forEach(c => {
            const y = c.year || 1;
            if (!groupedByYear[y]) groupedByYear[y] = [];
            groupedByYear[y].push(c);
        });

        Object.keys(groupedByYear).sort((a, b) => parseInt(a) - parseInt(b)).forEach(year => {
            const yearHeader = document.createElement('div');
            yearHeader.className = 'sub-column-header';
            yearHeader.style.marginTop = '10px';
            yearHeader.textContent = `ANNO ACCADEMICO ${year}`;
            listEl.appendChild(yearHeader);

            const yearGrid = document.createElement('div');
            yearGrid.style.cssText = roadmapViewMode === 'grid' 
                ? 'display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 10px;' 
                : 'display: flex; flex-direction: column; gap: 8px;';

            groupedByYear[year].forEach(course => {
                const hoursStudied = getExamStudiedHours(course.id, course.name);
                const phase = course.prepPhase || 'none';

                const card = document.createElement('div');
                card.className = 'uni-card';
                card.style.setProperty('--course-color', course.color || '#ffffff');

                const renderNormalMode = () => {
                    const next = nextCourseTest(course);
                    const daysTo = next ? Math.round((parseLocalDate(next.date) - parseLocalDate(todayStr)) / 86400000) : null;
                    const preparing = Boolean(course.preparing) || phase === 'study' || phase === 'proofs';
                    const plan = course.plan && Array.isArray(course.plan.blocks) && course.plan.blocks.length ? course.plan : null;
                    const planLine = plan ? `${plan.blocks.map(x => `${x.label} ${fmtPrepDur(x.minutes)}`).join(' · ')} · ${prepDaysLabel(plan.days)}` : 'old plan: open it to set blocks and days';
                    const nextLine = next
                        ? `${EXAM_TEST_KINDS[next.kind] || 'Exam'} ${daysTo === 0 ? 'today' : daysTo === 1 ? 'tomorrow' : `in ${daysTo} days`} · ${next.date}`
                        : 'No exam date yet';
                    card.classList.toggle('is-preparing', preparing);
                    card.innerHTML = `
                        <div class="uni-card-top">
                            <div class="u-grow u-minw0">
                                <div class="uni-card-name">${escapeHtml(course.name)}</div>
                                <div class="uni-card-sub">${course.cfu} CFU · year ${course.year || 1}${course.examFormat && EXAM_FORMATS[course.examFormat] ? ' · ' + EXAM_FORMATS[course.examFormat].label.toLowerCase() : ''}</div>
                            </div>
                            <span class="uni-card-hours" title="Hours studied">${hoursStudied.toFixed(1)}h</span>
                        </div>
                        <div class="uni-card-next ${next && daysTo <= 7 ? 'is-close' : ''}">${escapeHtml(nextLine)}</div>
                        ${preparing ? `<div class="uni-card-plan"><span class="uni-prep-badge">Preparing</span> ${escapeHtml(planLine)}</div>` : ''}
                        <div class="uni-card-actions">
                            <button type="button" class="btn btn-sm ${preparing ? '' : 'btn-primary'}" data-prep>${preparing ? 'Plan' : 'Prepare'}</button>
                            <span class="u-grow"></span>
                            <button type="button" class="ghost-btn" data-pass title="Record the grade">Passed ✓</button>
                            <button type="button" class="icon-btn" data-edit aria-label="Edit ${escapeHtml(course.name)}">✎</button>
                            <button type="button" class="icon-btn delete" data-del aria-label="Delete ${escapeHtml(course.name)}">×</button>
                        </div>`;
                    card.querySelector('[data-prep]').onclick = () => openExamPrepSheet(course.id);
                    card.querySelector('[data-pass]').onclick = () => {
                        const g = prompt(`Grade (18-30 or 30L) for "${course.name}" (${course.cfu} CFU):`, '30');
                        if (g !== null && g.trim() !== '') recordPassedExam(course.id, g.trim(), course.cfu, todayStr);
                    };
                    card.querySelector('[data-edit]').onclick = renderEditMode;
                    card.querySelector('[data-del]').onclick = () => {
                        if (!confirm(`Remove "${course.name}" from your courses? Its study tasks end today.`)) return;
                        templates.filter(t => t.uniExamId === course.id).forEach(t => archiveTemplateSafely(t));
                        uniData.remainingExams = uniData.remainingExams.filter(x => x.id !== course.id);
                        syncCategoryOrder();
                        saveData();
                        saveUniData();
                        refreshAllConnectedViews();
                    };
                };

                const renderEditMode = () => {
                    card.innerHTML = `
                        <div class="u-flex u-col u-gap-2" style="height:100%;">
                            <input type="text" class="form-control form-control-sm edit-name" value="${escapeHtml(course.name)}">
                            <div class="u-flex u-gap-2">
                                <input type="number" class="form-control form-control-sm no-spinners edit-cfu u-grow" value="${course.cfu}" placeholder="CFU">
                                <input type="number" class="form-control form-control-sm no-spinners edit-year u-grow" value="${course.year || 1}" placeholder="Year">
                                <input type="color" class="edit-color u-pointer" value="${course.color || '#ffffff'}" style="width:30px; height:27px; background:transparent; border:1px solid var(--border-color);">
                            </div>
                            <div class="u-flex u-jc-end u-gap-2" style="margin-top:auto;">
                                <button type="button" class="btn btn-sm btn-cancel-edit">[ESC]</button>
                                <button type="button" class="btn btn-primary btn-sm btn-save-edit">[SAVE]</button>
                            </div>
                        </div>
                    `;

                    card.querySelector('.btn-cancel-edit').onclick = renderNormalMode;
                    card.querySelector('.btn-save-edit').onclick = () => {
                        course.name = card.querySelector('.edit-name').value.trim() || course.name;
                        course.cfu = parseInt(card.querySelector('.edit-cfu').value, 10) || 6;
                        course.year = parseInt(card.querySelector('.edit-year').value, 10) || 1;
                        course.color = card.querySelector('.edit-color').value;
                        saveUniData();
                        renderUniAtomRoadmap();
                    };
                };

                renderNormalMode();
                yearGrid.appendChild(card);
            });
            listEl.appendChild(yearGrid);
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
        <div class="module-body-padded u-grow u-flex u-col u-gap-3 u-scroll-y">
            <div class="section-header-row u-mb-0 u-noshrink">
                <div>
                    <span class="section-label">Uni Lectures</span>
                    <span class="u-fs-xs u-dim u-ml-2">// CALENDAR EVENTS</span>
                </div>
            </div>
            <div class="u-col u-gap-3" id="uni-lectures-body" style="display:flex;"></div>
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
            <div class="u-flex u-jc-between u-ai-center u-wrap u-gap-2">
                <strong class="u-main u-upper">${escapeHtml(course.name)}</strong>
                <div class="u-flex u-gap-2 u-ai-center u-fs-xs">
                    <input type="date" class="form-control form-control-sm lec-start-inp" style="width:118px; padding:2px var(--space-2);" value="${course.lectureStart || todayStr}">
                    <span class="u-dim">–</span>
                    <input type="date" class="form-control form-control-sm lec-end-inp" style="width:118px; padding:2px var(--space-2);" value="${course.lectureEnd || ''}">
                </div>
            </div>
            <div class="lec-slots-list u-flex u-col u-gap-2"></div>
            <div class="u-flex u-gap-2 u-ai-center u-wrap" style="padding-top:var(--space-1); border-top:1px dotted var(--border-color);">
                <input type="time" class="form-control form-control-sm new-lec-start" style="width:84px;" value="09:00">
                <span class="u-dim">-</span>
                <input type="time" class="form-control form-control-sm new-lec-end" style="width:84px;" value="11:00">
                <div class="new-lec-days u-flex u-gap-2 u-fs-xs">
                    ${dayVals.map((v, i) => `<label class="u-pointer"><input type="checkbox" value="${v}"> ${dayLabels[i]}</label>`).join('')}
                </div>
                <button type="button" class="btn btn-sm btn-add-lec-slot" style="margin-left:auto;">[+ SLOT]</button>
            </div>
        `;

        const startInp = box.querySelector('.lec-start-inp');
        const endInp = box.querySelector('.lec-end-inp');
        
        startInp.onchange = () => {
            course.lectureStart = startInp.value || todayStr;
            syncCourseLecturesToEvents(course);
            saveUniData();
            refreshAllConnectedViews();
        };
        endInp.onchange = () => {
            course.lectureEnd = endInp.value || '';
            syncCourseLecturesToEvents(course);
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
                sRow.style.cssText = 'display:flex; justify-content:space-between; align-items:center; font-size:var(--font-xs); padding:var(--space-1) var(--space-2); background:rgba(255,255,255,0.03); border:1px solid var(--border-color);';
                sRow.innerHTML = `<span><strong>${escapeHtml(dayNamesStr)}</strong> // ${escapeHtml(slot.start)} – ${escapeHtml(slot.end)}</span>`;
                const delBtn = document.createElement('button');
                delBtn.className = 'icon-btn delete';
                delBtn.textContent = '×';
                delBtn.onclick = () => {
                    course.lectures.splice(sIdx, 1);
                    syncCourseLecturesToEvents(course);
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
            syncCourseLecturesToEvents(course);
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
        <div class="module-body-padded u-grow u-flex u-col u-gap-4 u-scroll-y">
            <div class="section-header-row u-mb-0 u-noshrink">
                <div>
                    <span class="section-label">Appeals &amp; Taxes</span>
                    <span class="u-fs-xs u-dim u-ml-2">// ${appealsCount} APPEALS · ${unpaidTaxes} UNPAID</span>
                </div>
            </div>

            <div class="daily-columns-wrap u-ai-start u-gap-4">
                <!-- COLONNA SINISTRA: APPELLI -->
                <div class="u-grow u-minw0 u-flex u-col u-gap-2">
                    <div class="sub-column-header">Exam Appeals</div>
                    <div class="u-flex u-gap-2 u-wrap">
                        <input type="text" id="uni-app-name" class="form-control form-control-sm u-grow" style="min-width:100px;" placeholder="Exam..." list="uni-course-names">
                        <datalist id="uni-course-names">${(uniData.remainingExams || []).map(c => `<option value="${escapeHtml(c.name)}">`).join('')}</datalist>
                        <select id="uni-app-kind" class="form-control form-control-sm" style="width:auto;">${Object.entries(EXAM_TEST_KINDS).map(([k, l]) => `<option value="${k}" ${k === 'written' ? 'selected' : ''}>${l}</option>`).join('')}</select>
                        <input type="date" id="uni-app-date" class="form-control form-control-sm" style="width:118px;" value="${todayStr}">
                        <input type="time" id="uni-app-time" class="form-control form-control-sm" style="width:80px;" value="09:00">
                        <button type="button" id="btn-add-uni-appeal" class="btn btn-primary btn-sm">+</button>
                    </div>
                    <div class="u-col u-gap-2" id="uni-appeals-list" style="display:flex;"></div>
                </div>

                <!-- COLONNA DESTRA: TASSE UNIVERSITARIE -->
                <div class="u-grow u-minw0 u-flex u-col u-gap-2">
                    <div class="sub-column-header">University Taxes</div>
                    <div class="u-flex u-gap-2 u-wrap">
                        <input type="text" id="uni-tax-title" class="form-control form-control-sm u-grow" style="min-width:95px;" placeholder="Tax name...">
                        <input type="number" id="uni-tax-amount" class="form-control form-control-sm no-spinners" style="width:75px;" step="0.01" placeholder="€">
                        <input type="date" id="uni-tax-date" class="form-control form-control-sm" style="width:118px;" value="${todayStr}">
                        <button type="button" id="btn-add-uni-tax" class="btn btn-danger btn-sm">+</button>
                    </div>
                    <div class="u-col u-gap-2" id="uni-taxes-list" style="display:flex;"></div>
                </div>
            </div>
        </div>
    `;

    root.querySelector('#btn-add-uni-appeal').onclick = () => {
        const name = root.querySelector('#uni-app-name').value;
        const date = root.querySelector('#uni-app-date').value;
        const time = root.querySelector('#uni-app-time').value;
        const kind = root.querySelector('#uni-app-kind').value;
        const course = (uniData.remainingExams || []).find(c => c.name.toLowerCase() === String(name || '').trim().toLowerCase());
        if (course) {
            // A date of a course you have: same path as the Prepare sheet
            const tests = courseTests(course).map(a => ({ id: a.id, kind: a.kind || 'exam', date: a.date, time: a.time }));
            tests.push({ id: null, kind, date, time });
            saveCourseTests(course, tests);
            saveData(); saveUniData(); refreshAllConnectedViews();
        } else {
            addUniAppeal(name, date, time, EXAM_TEST_KINDS[kind] || '');
        }
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
        appListEl.innerHTML = '<div class="empty-state u-py-1">[ NONE ]</div>';
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
                    <div class="m-sub">${escapeHtml(EXAM_TEST_KINDS[app.kind] || app.session || 'Exam')} · ${escapeHtml(app.date)} · ${escapeHtml(app.time || '09:00')}</div>
                </div>
                <div class="u-flex u-ai-center u-gap-2">
                    <span style="font-size:var(--font-xs); font-weight:bold; color:${diffDays <= 7 && diffDays >= 0 ? 'var(--accent-red)' : 'var(--accent-gold)'};">[${cdLabel}]</span>
                </div>
            `;
            const delBtn = document.createElement('button');
            delBtn.className = 'icon-btn delete';
            delBtn.textContent = '×';
            delBtn.onclick = (e) => { e.stopPropagation(); deleteUniAppeal(app.id); };
            row.lastElementChild.appendChild(delBtn);
            appListEl.appendChild(row);
        });
    }

    const taxListEl = root.querySelector('#uni-taxes-list');
    const sortedTaxes = [...(uniData.taxes || [])].sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    if (sortedTaxes.length === 0) {
        taxListEl.innerHTML = '<div class="empty-state u-py-1">[ NONE ]</div>';
    } else {
        sortedTaxes.forEach(tax => {
            const diffDays = Math.ceil((parseLocalDate(tax.dueDate) - parseLocalDate(todayStr)) / (1000 * 60 * 60 * 24));
            const statusBadge = tax.paid
                ? '<span class="u-green u-bold">[PAID ✓]</span>'
                : `<span class="u-red u-bold">[${tax.dueDate} (${diffDays >= 0 ? diffDays + 'D' : 'OVERDUE'})]</span>`;

            const row = document.createElement('div');
            row.className = 'm-item-row';
            row.style.borderLeftColor = tax.paid ? 'var(--accent-green)' : 'var(--accent-red)';
            row.style.opacity = tax.paid ? '0.6' : '1';

            row.innerHTML = `
                <div class="u-pointer" onclick="jumpToDate('${tax.dueDate}')">
                    <div class="m-title">${escapeHtml(tax.title)}</div>
                    <div class="m-sub">${statusBadge}</div>
                </div>
                <div class="u-flex u-ai-center u-gap-2">
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
            delBtn.textContent = '×';
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
        <div class="module-body-padded u-grow u-flex u-col u-gap-3 u-scroll-y">
            <div class="section-header-row u-mb-0 u-noshrink">
                <div>
                    <span class="section-label">Libretto</span>
                    <span class="u-fs-xs u-dim u-ml-2 u-tnum">// ${stats.totalCfu}/${stats.targetCfu} CFU (${stats.cfuPct}%)</span>
                </div>
                <button type="button" class="btn btn-sm ${showLibrettoAddForm ? 'btn-primary' : ''}" id="btn-toggle-lib-add">+</button>
            </div>

            <!-- METRICHE CARRIERA COMPATTE -->
            <div class="u-grid u-gap-2" style="grid-template-columns:repeat(4, minmax(0, 1fr));">
                <div class="cfg-box u-m-0 u-tc" style="padding:var(--space-2) var(--space-3);">
                    <div class="u-fs-2xs u-dim">WEIGHTED AVG</div>
                    <div class="u-fs-md u-bold u-green u-tnum" style="margin-top:2px;">${stats.weightedMean.toFixed(2)}</div>
                </div>
                <div class="cfg-box u-m-0 u-tc" style="padding:var(--space-2) var(--space-3);">
                    <div class="u-fs-2xs u-dim">ARITHMETIC AVG</div>
                    <div class="u-fs-md u-bold u-main u-tnum" style="margin-top:2px;">${stats.arithmeticMean.toFixed(2)}</div>
                </div>
                <div class="cfg-box u-m-0 u-tc" style="padding:var(--space-2) var(--space-3);">
                    <div class="u-fs-2xs u-dim">BASE /110</div>
                    <div class="u-fs-md u-bold u-gold u-tnum" style="margin-top:2px;">${stats.base110.toFixed(1)}</div>
                </div>
                <div class="cfg-box u-m-0 u-tc" style="padding:var(--space-2) var(--space-3);">
                    <div class="u-fs-2xs u-dim">EXAMS PASSED</div>
                    <div class="u-fs-md u-bold u-main u-tnum" style="margin-top:2px;">${stats.count}${stats.laudeCount > 0 ? ' (' + stats.laudeCount + 'L)' : ''}</div>
                </div>
            </div>

            <div class="vault-progress-track u-noshrink" style="height:5px;">
                <div class="vault-progress-fill" style="width:${stats.cfuPct}%;"></div>
            </div>

            <div id="uni-lib-add-row" style="display:${showLibrettoAddForm ? 'flex' : 'none'}; gap:var(--space-2); flex-wrap:wrap; padding:var(--space-2); border:1px solid var(--border-bright); background:#060606;">
                <input type="text" id="uni-lib-name" class="form-control form-control-sm" style="flex:2; min-width:120px;" placeholder="Exam name...">
                <input type="text" id="uni-lib-grade" class="form-control form-control-sm u-tc" style="width:65px;" placeholder="30L">
                <input type="number" id="uni-lib-cfu" class="form-control form-control-sm no-spinners u-tc" style="width:60px;" placeholder="CFU" value="9" min="1">
                <input type="date" id="uni-lib-date" class="form-control form-control-sm" style="width:118px;" value="${todayStr}">
                <button type="button" id="btn-add-uni-libretto" class="btn btn-primary btn-sm">[SAVE]</button>
            </div>

            <div class="u-col u-gap-2" id="uni-libretto-list" style="display:flex;"></div>
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
                <div class="m-title">${escapeHtml(ex.name)} <span class="u-dim u-fs-xs u-ml-2">(${ex.cfu} CFU)</span></div>
                <div class="m-sub">${escapeHtml(ex.date || todayStr)}</div>
            </div>
            <div class="u-flex u-ai-center u-gap-3">
                <span class="u-fs-md u-bold u-green u-tnum">${gradeBadge}</span>
            </div>
        `;

        const delBtn = document.createElement('button');
        delBtn.className = 'icon-btn delete';
        delBtn.textContent = '×';
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
    // The fees category is created when a fee is added, not on every start (keeps new installs clean)
    if (typeof CORTEX_STARTER_USER === 'undefined' || !CORTEX_STARTER_USER) ensureTasseUniCategory();
    renderUniDashboard();
});
// ============================================================================
// 5. PREPARING AN EXAM
// ----------------------------------------------------------------------------
// "Prepare" on a course opens one sheet:
//   - exam format (written + oral, written only, oral only, midterms, project + oral)
//   - the dates of each test (they become appeals + calendar events)
//   - the daily study plan: on which days, which blocks (Theory 2h High, Exercises 2h Medium,
//     Anki 1h Light...), from when until when (default: the day before the first test)
// Saving creates one daily task per block (category = the course), with its mental load,
// so it shows in Today, in study windows and in the focus playlist.
// ============================================================================

const EXAM_FORMATS = {
    written_oral: { label: 'Written + oral', tests: ['written', 'oral'] },
    written: { label: 'Written only', tests: ['written'] },
    oral: { label: 'Oral only', tests: ['oral'] },
    partials: { label: 'Midterms', tests: ['partial', 'partial'] },
    project_oral: { label: 'Project + oral', tests: ['project', 'oral'] }
};
const EXAM_TEST_KINDS = { written: 'Written', oral: 'Oral', partial: 'Midterm', project: 'Project due', exam: 'Exam' };
const PREP_DAY_SETS = {
    all: { label: 'Every day', days: [0, 1, 2, 3, 4, 5, 6] },
    monsat: { label: 'Mon–Sat', days: [1, 2, 3, 4, 5, 6] },
    weekdays: { label: 'Mon–Fri', days: [1, 2, 3, 4, 5] }
};
const PREP_DEFAULT_BLOCKS = [
    { label: 'Theory', minutes: 120, load: 'deep' },
    { label: 'Exercises', minutes: 120, load: 'practice' },
    { label: 'Anki', minutes: 60, load: 'light' }
];

function courseTests(course) {
    return (uniData.appeals || []).filter(a => a.examId === course.id || (!a.examId && String(a.examName || '').toLowerCase() === String(course.name || '').toLowerCase()))
        .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
}
function nextCourseTest(course) {
    return courseTests(course).find(a => a.date >= todayStr) || null;
}
function prepDaysLabel(days) {
    const hit = Object.values(PREP_DAY_SETS).find(s => s.days.length === days.length && s.days.every(d => days.includes(d)));
    if (hit) return hit.label;
    const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return [1, 2, 3, 4, 5, 6, 0].filter(d => days.includes(d)).map(d => names[d]).join(' ');
}
function fmtPrepDur(m) {
    const h = Math.floor(m / 60), r = m % 60;
    return h ? (r ? `${h}h${String(r).padStart(2, '0')}` : `${h}h`) : `${r}m`;
}
function splitPrepMinutes(m) {
    for (const u of [30, 25, 20, 15]) if (m >= u && m % u === 0) return { instances: m / u, timer: u };
    return { instances: 1, timer: Math.max(5, m) };
}
function prepPlanTemplates(course) {
    return templates.filter(t => t.uniExamId === course.id && (String(t.uniRole || '').startsWith('plan_') || ['studio', 'anki', 'dimostrazioni'].includes(t.uniRole)) && (!t.endDate || t.endDate >= todayStr));
}

// The plan shown when the sheet opens: saved plan, or the old [1]/[2] tasks, or the defaults
function currentPrepPlan(course) {
    if (course.plan && Array.isArray(course.plan.blocks) && course.plan.blocks.length) return JSON.parse(JSON.stringify(course.plan));
    const legacy = prepPlanTemplates(course);
    const roleInfo = { studio: ['Theory', 'deep'], dimostrazioni: ['Proofs', 'practice'], anki: ['Anki', 'light'] };
    const blocks = legacy.length
        ? legacy.map(t => ({ id: 'b' + Math.random().toString(36).slice(2, 7), label: (roleInfo[t.uniRole] || [t.title])[0], minutes: (t.instances || 1) * (parseInt(t.timerMinutes, 10) || 30), load: t.load || (roleInfo[t.uniRole] || [null, 'deep'])[1] }))
        : PREP_DEFAULT_BLOCKS.map(b => Object.assign({ id: 'b' + Math.random().toString(36).slice(2, 7) }, b));
    const first = nextCourseTest(course);
    const until = first ? (() => { const d = parseLocalDate(first.date); d.setDate(d.getDate() - 1); return formatDate(d); })() : '';
    return { days: [1, 2, 3, 4, 5, 6], blocks, from: todayStr, until };
}

function saveCourseTests(course, tests) {
    const keep = new Set();
    tests.filter(x => x.date).forEach(x => {
        const label = EXAM_TEST_KINDS[x.kind] || 'Exam';
        let app = x.id ? (uniData.appeals || []).find(a => a.id === x.id) : null;
        if (!app) {
            const id = 'uapp_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
            app = { id, eventId: 'e_uapp_' + id };
            uniData.appeals.push(app);
        }
        Object.assign(app, { examId: course.id, examName: course.name, kind: x.kind, date: x.date, time: x.time || '09:00', session: label });
        keep.add(app.id);
        specificEvents = specificEvents.filter(e => e.id !== app.eventId);
        const [h, m] = (app.time || '09:00').split(':').map(Number);
        specificEvents.push({
            id: app.eventId, uniAppealId: app.id, title: `${label} · ${course.name}`,
            date: app.date, start: app.time, end: `${String(Math.min(23, (h || 9) + 2)).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}`,
            color: course.color && course.color !== '#ffffff' ? course.color : '#b08d43'
        });
    });
    // Dates removed in the sheet
    courseTests(course).filter(a => !keep.has(a.id)).forEach(a => {
        specificEvents = specificEvents.filter(e => e.id !== a.eventId);
        uniData.appeals = uniData.appeals.filter(x => x.id !== a.id);
    });
}

function applyPrepPlan(course, plan) {
    const days = Array.isArray(plan.days) && plan.days.length ? plan.days : [0, 1, 2, 3, 4, 5, 6];
    const blocks = plan.blocks.filter(b => b.label && b.minutes > 0);
    const catName = course.name.trim();
    if (!categoryOrder.includes(catName)) categoryOrder.push(catName);
    // Old [1]/[2] tasks and blocks no longer in the plan
    prepPlanTemplates(course).forEach(t => {
        if (!blocks.some(b => t.uniRole === 'plan_' + b.id)) archiveTemplateSafely(t);
    });
    blocks.forEach(b => {
        const { instances, timer } = splitPrepMinutes(b.minutes);
        let t = templates.find(x => x.uniExamId === course.id && x.uniRole === 'plan_' + b.id);
        if (!t) {
            t = { id: `t_uni_${course.id}_${b.id}_${Date.now()}`, uniExamId: course.id, uniRole: 'plan_' + b.id, exceptions: [], type: 'untimed', timeWindows: [], noTimer: false };
            templates.push(t);
        }
        Object.assign(t, {
            category: catName, title: b.label, instances, timerMinutes: timer, load: b.load,
            frequency: days.length === 7 ? 'all' : 'specific', daysOfWeek: days.length === 7 ? [] : [...days],
            startDate: plan.from || todayStr, endDate: plan.until || null,
            color: (window.CortexStudy && b.load) ? CortexStudy.kindColor(b.load) : (course.color || '#ffffff'), kindColor: true,
            priority: b.load === 'light' ? 'low' : 'high'
        });
    });
    course.plan = { days, blocks, from: plan.from || todayStr, until: plan.until || '' };
    course.preparing = true;
    course.prepPhase = 'plan';
}

function stopPreparing(course) {
    prepPlanTemplates(course).forEach(t => archiveTemplateSafely(t));
    course.preparing = false;
    course.prepPhase = 'none';
    syncCategoryOrder();
    saveData();
    saveUniData();
    refreshAllConnectedViews();
    if (typeof showToast === 'function') showToast(`Stopped preparing ${course.name}: its daily tasks end today`);
}

function openExamPrepSheet(courseId) {
    document.getElementById('exam-prep')?.remove();
    const course = (uniData.remainingExams || []).find(c => c.id === courseId);
    if (!course) return;
    const esc = (v) => escapeHtml(String(v ?? ''));
    const st = {
        format: course.examFormat || 'written_oral',
        tests: courseTests(course).map(a => ({ id: a.id, kind: a.kind || 'exam', date: a.date, time: a.time || '09:00' })),
        plan: currentPrepPlan(course)
    };
    if (!st.tests.length) st.tests = EXAM_FORMATS[st.format].tests.map(k => ({ id: null, kind: k, date: '', time: '09:00' }));
    const loads = window.CortexStudy ? CortexStudy.LOADS : { deep: { short: 'High' }, practice: { short: 'Medium' }, light: { short: 'Light' } };

    const wrap = document.createElement('div');
    wrap.id = 'exam-prep';
    wrap.className = 'study-overlay';
    wrap.innerHTML = `
        <div class="study-sheet" role="dialog" aria-modal="true" aria-labelledby="exam-prep-title">
            <div class="study-sheet-head">
                <div>
                    <div id="exam-prep-title" class="study-sheet-title">Prepare ${esc(course.name)}</div>
                    <div class="dim study-sheet-date">${esc(course.cfu)} CFU · year ${esc(course.year || 1)}</div>
                </div>
                <button type="button" class="hdr-icon" data-close aria-label="Close">×</button>
            </div>
            <div class="study-sheet-body">
                <section class="study-field">
                    <div class="study-label">How the exam works</div>
                    <div class="study-seg" data-formats></div>
                </section>
                <section class="study-field">
                    <div class="study-label">Dates <span class="dim">· every date becomes an event in your calendar</span></div>
                    <div class="prep-tests" data-tests></div>
                    <button type="button" class="ghost-btn" data-add-test>+ Another date</button>
                </section>
                <section class="study-field">
                    <div class="study-label">Daily study <span class="dim" data-per-day></span></div>
                    <div class="prep-days">
                        <div class="study-seg" data-daysets></div>
                        <div class="prep-daypick" data-daypick></div>
                    </div>
                    <div class="prep-blocks" data-blocks></div>
                    <button type="button" class="ghost-btn" data-add-block>+ Another block</button>
                </section>
                <section class="study-field">
                    <div class="study-label">When</div>
                    <div class="study-time-row">
                        <label>From <input type="date" class="form-control form-control-sm" data-from></label>
                        <label>Until <input type="date" class="form-control form-control-sm" data-until></label>
                        <button type="button" class="ghost-btn" data-until-first>Day before the first date</button>
                    </div>
                    <div class="study-summary" data-summary></div>
                </section>
            </div>
            <div class="study-sheet-foot">
                ${course.preparing || course.prepPhase === 'study' || course.prepPhase === 'proofs' ? '<button type="button" class="ghost-btn danger" data-stop>Stop preparing</button>' : '<span></span>'}
                <div class="study-foot-right">
                    <button type="button" class="btn btn-sm" data-close>Cancel</button>
                    <button type="button" class="btn btn-primary btn-sm" data-save>${course.preparing ? 'Save plan' : 'Start preparing'}</button>
                </div>
            </div>
        </div>`;
    (document.getElementById('modals-root') || document.body).appendChild(wrap);
    const $ = (s) => wrap.querySelector(s);
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    const renderFormats = () => {
        $('[data-formats]').innerHTML = Object.entries(EXAM_FORMATS).map(([k, f]) => `<button type="button" class="${st.format === k ? 'active' : ''}" data-format="${k}" aria-pressed="${st.format === k}">${esc(f.label)}</button>`).join('');
    };
    const renderTests = () => {
        $('[data-tests]').innerHTML = st.tests.map((x, i) => `
            <div class="prep-test" data-i="${i}">
                <select class="form-control form-control-sm" data-kind>${Object.entries(EXAM_TEST_KINDS).map(([k, l]) => `<option value="${k}" ${x.kind === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
                <input type="date" class="form-control form-control-sm" data-date value="${esc(x.date)}">
                <input type="time" class="form-control form-control-sm" data-time value="${esc(x.time)}">
                <button type="button" class="icon-btn delete" data-del-test aria-label="Remove date">×</button>
            </div>`).join('') || '<div class="dim study-hint">No dates yet.</div>';
    };
    const renderDays = () => {
        const cur = st.plan.days;
        $('[data-daysets]').innerHTML = Object.entries(PREP_DAY_SETS).map(([k, s]) => {
            const on = s.days.length === cur.length && s.days.every(d => cur.includes(d));
            return `<button type="button" class="${on ? 'active' : ''}" data-dayset="${k}">${esc(s.label)}</button>`;
        }).join('');
        $('[data-daypick]').innerHTML = [1, 2, 3, 4, 5, 6, 0].map(d => `<button type="button" class="prep-day ${cur.includes(d) ? 'active' : ''}" data-day="${d}" aria-pressed="${cur.includes(d)}">${dayNames[d].slice(0, 2)}</button>`).join('');
    };
    const renderBlocks = () => {
        $('[data-blocks]').innerHTML = st.plan.blocks.map((b, i) => `
            <div class="prep-block" data-i="${i}">
                <input type="text" class="form-control form-control-sm" data-label value="${esc(b.label)}" placeholder="What (Theory, Exercises, Anki…)">
                <div class="study-seg study-seg-sm">${Object.entries(loads).map(([k, l]) => `<button type="button" class="${b.load === k ? 'active' : ''}" data-load="${k}" title="${esc(l.hint || '')}">${esc(l.short)}</button>`).join('')}</div>
                <div class="study-stepper"><button type="button" data-step="-15" aria-label="Less">−</button><span>${fmtPrepDur(b.minutes)}</span><button type="button" data-step="15" aria-label="More">+</button></div>
                <button type="button" class="icon-btn delete" data-del-block aria-label="Remove block">×</button>
            </div>`).join('');
        update();
    };
    const update = () => {
        const per = st.plan.blocks.reduce((a, b) => a + (b.minutes || 0), 0);
        $('[data-per-day]').textContent = `· ${fmtPrepDur(per)} a day`;
        const from = $('[data-from]').value || todayStr;
        const until = $('[data-until]').value;
        let daysCount = 0;
        if (until && until >= from) {
            const d = parseLocalDate(from), end = parseLocalDate(until);
            while (d <= end) { if (st.plan.days.includes(d.getDay())) daysCount++; d.setDate(d.getDate() + 1); }
        }
        const bits = [`${fmtPrepDur(per)} on ${esc(prepDaysLabel(st.plan.days))}`];
        if (until) bits.push(`${daysCount} study days · <b>${fmtPrepDur(per * daysCount)}</b> in total`);
        else bits.push('<span class="study-warn">no end date: the tasks keep going until you stop preparing</span>');
        const target = (parseFloat(course.cfu) || 6) * 25 * 60;   // ~25 h of work per CFU
        if (until && per * daysCount < target * 0.5) bits.push(`<span class="dim">a ${esc(course.cfu)} CFU course is usually ~${Math.round(target / 60)}h of work</span>`);
        $('[data-summary]').innerHTML = bits.join(' · ');
    };

    $('[data-formats]').addEventListener('click', (e) => {
        const b = e.target.closest('[data-format]');
        if (!b) return;
        st.format = b.dataset.format;
        // Rebuild the empty date rows for the new format; keep dates already filled in
        const filled = st.tests.filter(x => x.date);
        if (!filled.length) st.tests = EXAM_FORMATS[st.format].tests.map(k => ({ id: null, kind: k, date: '', time: '09:00' }));
        renderFormats(); renderTests();
    });
    $('[data-tests]').addEventListener('change', (e) => {
        const row = e.target.closest('[data-i]');
        if (!row) return;
        const x = st.tests[parseInt(row.dataset.i, 10)];
        if (e.target.matches('[data-kind]')) x.kind = e.target.value;
        if (e.target.matches('[data-date]')) x.date = e.target.value;
        if (e.target.matches('[data-time]')) x.time = e.target.value;
    });
    $('[data-tests]').addEventListener('click', (e) => {
        const del = e.target.closest('[data-del-test]');
        if (!del) return;
        st.tests.splice(parseInt(del.closest('[data-i]').dataset.i, 10), 1);
        renderTests();
    });
    $('[data-add-test]').addEventListener('click', () => {
        const last = st.tests[st.tests.length - 1];
        st.tests.push({ id: null, kind: last ? last.kind : 'exam', date: '', time: '09:00' });
        renderTests();
    });
    $('[data-daysets]').addEventListener('click', (e) => {
        const b = e.target.closest('[data-dayset]');
        if (!b) return;
        st.plan.days = [...PREP_DAY_SETS[b.dataset.dayset].days];
        renderDays(); update();
    });
    $('[data-daypick]').addEventListener('click', (e) => {
        const b = e.target.closest('[data-day]');
        if (!b) return;
        const d = parseInt(b.dataset.day, 10);
        st.plan.days = st.plan.days.includes(d) ? st.plan.days.filter(x => x !== d) : [...st.plan.days, d];
        if (!st.plan.days.length) st.plan.days = [d];
        renderDays(); update();
    });
    $('[data-blocks]').addEventListener('click', (e) => {
        const row = e.target.closest('[data-i]');
        if (!row) return;
        const b = st.plan.blocks[parseInt(row.dataset.i, 10)];
        const ld = e.target.closest('[data-load]');
        const stp = e.target.closest('[data-step]');
        if (ld) { b.load = ld.dataset.load; renderBlocks(); }
        else if (stp) { b.minutes = Math.max(15, Math.min(600, b.minutes + parseInt(stp.dataset.step, 10))); renderBlocks(); }
        else if (e.target.closest('[data-del-block]')) { st.plan.blocks.splice(parseInt(row.dataset.i, 10), 1); renderBlocks(); }
    });
    $('[data-blocks]').addEventListener('input', (e) => {
        const row = e.target.closest('[data-i]');
        if (row && e.target.matches('[data-label]')) st.plan.blocks[parseInt(row.dataset.i, 10)].label = e.target.value;
    });
    $('[data-add-block]').addEventListener('click', () => {
        st.plan.blocks.push({ id: 'b' + Math.random().toString(36).slice(2, 7), label: '', minutes: 60, load: 'deep' });
        renderBlocks();
        wrap.querySelector('.prep-block:last-child [data-label]')?.focus();
    });
    $('[data-from]').value = st.plan.from || todayStr;
    $('[data-until]').value = st.plan.until || '';
    $('[data-from]').addEventListener('change', update);
    $('[data-until]').addEventListener('change', update);
    $('[data-until-first]').addEventListener('click', () => {
        const first = st.tests.filter(x => x.date && x.date >= todayStr).sort((a, b) => a.date.localeCompare(b.date))[0];
        if (!first) { if (typeof showToast === 'function') showToast('Add the date of the exam first'); return; }
        const d = parseLocalDate(first.date); d.setDate(d.getDate() - 1);
        $('[data-until]').value = formatDate(d);
        update();
    });

    const close = () => wrap.remove();
    $('[data-save]').addEventListener('click', () => {
        const blocks = st.plan.blocks.filter(b => String(b.label || '').trim() && b.minutes > 0).map(b => Object.assign(b, { label: b.label.trim() }));
        if (!blocks.length) { if (typeof showToast === 'function') showToast('Add at least one study block (e.g. Theory 2h)'); return; }
        let until = $('[data-until]').value;
        if (!until) {
            const first = st.tests.filter(x => x.date && x.date >= todayStr).sort((a, b) => a.date.localeCompare(b.date))[0];
            if (first) { const d = parseLocalDate(first.date); d.setDate(d.getDate() - 1); until = formatDate(d); }
        }
        course.examFormat = st.format;
        saveCourseTests(course, st.tests);
        applyPrepPlan(course, { days: st.plan.days, blocks, from: $('[data-from]').value || todayStr, until });
        syncCategoryOrder();
        saveData();
        saveUniData();
        refreshAllConnectedViews();
        if (typeof renderTodayModule === 'function') renderTodayModule();
        close();
        if (typeof showToast === 'function') showToast(`${course.name}: ${blocks.map(b => `${b.label} ${fmtPrepDur(b.minutes)}`).join(' · ')} on ${prepDaysLabel(course.plan.days)}`);
    });
    $('[data-stop]')?.addEventListener('click', () => { close(); stopPreparing(course); });
    wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('[data-close]')) close(); });
    wrap.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

    renderFormats();
    renderTests();
    renderDays();
    renderBlocks();
}
window.openExamPrepSheet = openExamPrepSheet;
