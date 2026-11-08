// --- js/modules/tasks.js ---
// Atomic Module 2 (Tasks: Fixed, Flexible, Routines, To-Do) & Atomic Module 10 (Day Planner: Any Day >= Today, Transports Lock, Custom Mouse Drag & Resize)

let deleteTargetType = '';
let deleteTargetId = '';
let tmwTimelineZoom = 46; // 46px per ora nella Timeline del Day Planner
let planBuilderDateStr = ''; // Data attiva nel modulo Day Planner (sempre >= todayStr)

// Stato per la modalità [EDIT] a monte in [TASKS ⚙] (Scelta 3A)
let isTasksManagerEditMode = false;
let selectedManagerCats = new Set();
let selectedManagerTasks = new Set();

// Stato per il motore Custom Mouse Drag & Resize sulla Timeline del Day Planner (3A & 4B)
let planTimelineDragState = null;
let planTimelineGhostEl = null;

function ensurePlanBuilderDateValid() {
    if (!planBuilderDateStr || planBuilderDateStr < todayStr) {
        planBuilderDateStr = (selectedDateStr && selectedDateStr >= todayStr) ? selectedDateStr : todayStr;
    }
    return planBuilderDateStr;
}

function isSingleDayTodoTemplate(t) {
    if (!t) return false;
    return t.category === 'General To-Do' || t.isTodo === true;
}

function shouldShowTaskInSettingsManager(t) {
    if (!t || t.type === 'medicine') return false;
    if (isSingleDayTodoTemplate(t)) {
        if (t.endDate && t.endDate < todayStr) return false;
        const targetDay = t.startDate || todayStr;
        const dayLog = (logs[targetDay] && logs[targetDay][t.id]) || [];
        const isCompleted = dayLog.length >= (t.instances || 1) && dayLog.every(Boolean);
        if (isCompleted) return false;
    }
    return true;
}

function toggleTask(templateId, instanceIndex) {
    if (!logs[selectedDateStr]) logs[selectedDateStr] = {};

    const targetTemplate = templates.find(x => x.id === templateId);
    if (!targetTemplate) return;

    if (!logs[selectedDateStr][templateId]) {
        logs[selectedDateStr][templateId] = Array(targetTemplate.instances || 1).fill(false);
    }

    const wasChecked = Boolean(logs[selectedDateStr][templateId][instanceIndex]);

    if (!wasChecked && typeof isGymRoutineTask === 'function' && isGymRoutineTask(targetTemplate)) {
        if (typeof openGymWorkoutReviewModal === 'function') {
            openGymWorkoutReviewModal(selectedDateStr, nextWorkoutDay);
            return;
        }
    }

    logs[selectedDateStr][templateId][instanceIndex] = !wasChecked;
    const isChecked = logs[selectedDateStr][templateId][instanceIndex];

    if (targetTemplate.type === 'medicine') {
        if (isChecked) {
            targetTemplate.stock = Math.max(0, (targetTemplate.stock || 0) - 1);
        } else {
            targetTemplate.stock = (targetTemplate.stock || 0) + 1;
        }
        recalculateMedicineAlerts(targetTemplate);
        if (typeof showToast === 'function') {
            showToast(`[MEDICINE] ${targetTemplate.title}: ${targetTemplate.stock} doses left`);
        }
    }

    saveData();
    renderTasks();
    renderTracker();
    if (typeof renderCalendar === 'function') renderCalendar();
    if (typeof renderCalendarDaySummary === 'function') renderCalendarDaySummary();
}

function recalculateMedicineAlerts(t) {
    specificEvents = specificEvents.filter(e => e.parentId !== t.id);
    if (t.stock <= 0) return;

    const intervalMult = (t.frequency === 'interval')
        ? Math.max(1, parseInt(t.intervalDays, 10) || 14)
        : 1;
    const daysLeft = Math.floor((t.stock / (t.instances || 1)) * intervalMult);

    let runOutDateObj = new Date();
    runOutDateObj.setDate(runOutDateObj.getDate() + daysLeft);
    const runOutDateStr = formatDate(runOutDateObj);

    let alertDateObj = new Date(runOutDateObj);
    alertDateObj.setDate(alertDateObj.getDate() - (t.alertDays || 7));
    const alertDateStr = formatDate(alertDateObj);

    specificEvents.push({
        id: 'e_runout_' + t.id + '_' + Date.now(),
        parentId: t.id,
        title: `[!] ${t.title} OUT OF STOCK`,
        date: runOutDateStr,
        color: '#b84b4b'
    });

    if (alertDateStr >= todayStr && t.alertDays > 0) {
        specificEvents.push({
            id: 'e_warn_' + t.id + '_' + Date.now(),
            parentId: t.id,
            title: `[MED] Restock ${t.title}`,
            date: alertDateStr,
            color: '#4c5b73'
        });
    }
}

function quickAddTask(event, categoryName) {
    if (event.key === 'Enter') {
        const title = event.target.value.trim();
        if (!title) return;

        templates.push({
            id: 't_' + Date.now(),
            category: categoryName,
            title: title,
            instances: 1,
            timerMinutes: 25,
            noTimer: false,
            frequency: 'all',
            daysOfWeek: [],
            startDate: todayStr,
            endDate: null,
            color: '#ffffff',
            type: 'untimed',
            timeWindows: []
        });

        saveData();
        renderManager();
        renderTasks();
        renderTracker();
        if (typeof renderCalendar === 'function') renderCalendar();
        if (typeof renderWeeklyPlanner === 'function') renderWeeklyPlanner();
        renderDayPlannerModule();
    }
}

function quickAddCalendar(event) {
    if (event.key === 'Enter') {
        const catName = event.target.value.trim();
        if (!catName) return;

        templates.push({
            id: 't_' + Date.now(),
            category: catName,
            title: 'First Task',
            instances: 1,
            timerMinutes: 25,
            noTimer: false,
            frequency: 'all',
            daysOfWeek: [],
            startDate: todayStr,
            endDate: null,
            color: '#ffffff',
            type: 'untimed',
            timeWindows: []
        });

        saveData();
        event.target.value = '';
        renderManager();
        renderTasks();
        renderTracker();
        if (typeof renderCalendar === 'function') renderCalendar();
        if (typeof renderWeeklyPlanner === 'function') renderWeeklyPlanner();
        renderDayPlannerModule();
    }
}

// ============================================================================
// TOGGLES & HELPERS MODALE CREAZIONE UNIFICATO (HABIT, ROUTINE, EVENT, MEDICINE)
// ============================================================================

function toggleTaskTimerMode() {
    const modeRadio = document.querySelector('input[name="h-timer-mode"]:checked');
    const isCheckOnly = modeRadio && modeRadio.value === 'checkonly';
    const timerGroup = document.getElementById('h-timer-group');
    if (timerGroup) {
        timerGroup.style.display = isCheckOnly ? 'none' : 'block';
    }
}

function toggleRoutineScheduleType() {
    const isTimed = document.querySelector('input[name="rtn-type"]:checked')?.value === 'timed';
    const timedSec = document.getElementById('rtn-timed-section');
    const untimedSec = document.getElementById('rtn-untimed-section');
    if (timedSec) timedSec.style.display = isTimed ? 'block' : 'none';
    if (untimedSec) untimedSec.style.display = isTimed ? 'none' : 'block';
}

function toggleRoutineTimerMode() {
    const modeRadio = document.querySelector('input[name="rtn-timer-mode"]:checked');
    const isMeasured = modeRadio && modeRadio.value === 'measured';
    const grp = document.getElementById('rtn-timer-group');
    if (grp) grp.style.display = isMeasured ? 'block' : 'none';
}

function toggleRoutineDays() {
    const freq = document.getElementById('rtn-frequency')?.value;
    const cont = document.getElementById('rtn-days-container');
    if (cont) cont.style.display = (freq === 'specific') ? 'flex' : 'none';
}

function toggleMedFrequencyInputs() {
    const freq = document.getElementById('med-frequency')?.value;
    const intGrp = document.getElementById('med-interval-group');
    const daysGrp = document.getElementById('med-days-container');
    if (intGrp) intGrp.style.display = (freq === 'interval') ? 'block' : 'none';
    if (daysGrp) daysGrp.style.display = (freq === 'specific') ? 'flex' : 'none';
}

function populateMedicineRoutineSelect(selectedRoutineId = 'rtn_evening') {
    const sel = document.getElementById('med-routine-select');
    if (!sel) return;
    sel.innerHTML = '';
    (routinesData || []).forEach(r => {
        const opt = document.createElement('option');
        opt.value = r.id;
        opt.textContent = r.title;
        if (r.id === selectedRoutineId) opt.selected = true;
        sel.appendChild(opt);
    });
}

function editTask(id) {
    const t = templates.find(x => x.id === id);
    if (!t) return;

    if (t.type === 'medicine') {
        editMedicine(id);
        return;
    }

    document.getElementById('h-id').value = t.id;
    document.getElementById('h-category').value = t.category;
    document.getElementById('h-title').value = t.title;
    document.getElementById('h-startdate').value = t.startDate || todayStr;
    document.getElementById('h-enddate').value = t.endDate || "";

    const colorInput = document.getElementById('h-color');
    colorInput.value = t.color || '#ffffff';
    updateCustomColor(colorInput, 'h-color');

    const hasTimeWindows = t.timeWindows && t.timeWindows.length > 0;
    const isTimed = t.type === 'timed' || hasTimeWindows;

    document.querySelector(`input[name="h-type"][value="${isTimed ? 'timed' : 'untimed'}"]`).checked = true;
    toggleHabitType();

    document.getElementById('h-time-windows-container').innerHTML = '';

    if (isTimed) {
        if (hasTimeWindows) {
            t.timeWindows.forEach(tw => addHabitTimeWindow(tw.start, tw.end, tw.days));
        } else {
            addHabitTimeWindow();
        }
    } else {
        const isCheckOnly = Boolean(t.noTimer || t.timerMinutes === 0);
        const radioVal = isCheckOnly ? 'checkonly' : 'measured';
        const radioEl = document.querySelector(`input[name="h-timer-mode"][value="${radioVal}"]`);
        if (radioEl) radioEl.checked = true;
        toggleTaskTimerMode();

        document.getElementById('h-instances').value = t.instances || 1;
        document.getElementById('h-timer').value = t.timerMinutes > 0 ? t.timerMinutes : 25;
        document.getElementById('h-frequency').value = t.frequency || 'all';
        toggleDays();

        if (t.frequency === 'specific') {
            document.querySelectorAll('#h-days-container input').forEach(cb => {
                cb.checked = t.daysOfWeek && t.daysOfWeek.includes(parseInt(cb.value, 10));
            });
        }
    }

    document.querySelector('input[name="creation-type"][value="habit"]').checked = true;
    toggleCreationType();
    closeModals();
    document.getElementById('creationModal').style.display = 'flex';
}

function editMedicine(id) {
    const m = templates.find(x => x.id === id && x.type === 'medicine');
    if (!m) return;

    populateMedicineRoutineSelect(m.routineId || 'rtn_evening');
    document.getElementById('med-id').value = m.id;
    document.getElementById('med-title').value = m.title;
    document.getElementById('med-instances').value = m.instances || 1;
    document.getElementById('med-stock').value = m.stock ?? 30;
    document.getElementById('med-startdate').value = m.startDate || todayStr;
    document.getElementById('med-alert').value = m.alertDays || 7;
    document.getElementById('med-frequency').value = m.frequency || 'all';
    document.getElementById('med-interval-days').value = m.intervalDays || 14;
    toggleMedFrequencyInputs();

    if (m.frequency === 'specific') {
        document.querySelectorAll('#med-days-container input').forEach(cb => {
            cb.checked = m.daysOfWeek && m.daysOfWeek.includes(parseInt(cb.value, 10));
        });
    }

    document.querySelector('input[name="creation-type"][value="medicine"]').checked = true;
    toggleCreationType();
    closeModals();
    document.getElementById('creationModal').style.display = 'flex';
}

function editRoutine(routineId) {
    const r = (routinesData || []).find(x => x.id === routineId);
    if (!r) return;

    document.getElementById('rtn-id').value = r.id;
    document.getElementById('rtn-title').value = r.title;
    document.getElementById('rtn-startdate').value = r.startDate || todayStr;
    document.getElementById('rtn-enddate').value = r.endDate || '';

    const colorInp = document.getElementById('rtn-color');
    colorInp.value = r.color || '#b08d43';
    updateCustomColor(colorInp, 'rtn-color');

    const hasTw = r.timeWindows && r.timeWindows.length > 0;
    const isTimed = r.type === 'timed' || hasTw;
    document.querySelector(`input[name="rtn-type"][value="${isTimed ? 'timed' : 'untimed'}"]`).checked = true;
    toggleRoutineScheduleType();

    document.getElementById('rtn-time-windows-container').innerHTML = '';
    if (isTimed) {
        if (hasTw) r.timeWindows.forEach(tw => addRoutineTimeWindow(tw.start, tw.end, tw.days));
        else addRoutineTimeWindow();
    } else {
        const isCheckOnly = Boolean(r.noTimer || !r.timerMinutes);
        document.querySelector(`input[name="rtn-timer-mode"][value="${isCheckOnly ? 'checkonly' : 'measured'}"]`).checked = true;
        toggleRoutineTimerMode();
        document.getElementById('rtn-timer').value = r.timerMinutes || 20;
        document.getElementById('rtn-frequency').value = r.frequency || 'all';
        toggleRoutineDays();
        if (r.frequency === 'specific') {
            document.querySelectorAll('#rtn-days-container input').forEach(cb => {
                cb.checked = r.daysOfWeek && r.daysOfWeek.includes(parseInt(cb.value, 10));
            });
        }
    }

    const builder = document.getElementById('rtn-subsections-builder');
    if (builder) {
        builder.innerHTML = '';
        (r.sections || []).forEach(sec => {
            addRoutineFormSubsection(sec.title, (sec.items || []).map(i => i.title), sec.id);
        });
        if ((r.sections || []).length === 0) {
            addRoutineFormSubsection('Steps', []);
        }
    }

    document.querySelector('input[name="creation-type"][value="routine"]').checked = true;
    toggleCreationType();
    closeModals();
    document.getElementById('creationModal').style.display = 'flex';
}

function deleteTask(id) {
    const t = templates.find(x => x.id === id);
    if (!t) return;

    deleteTargetType = 'task';
    deleteTargetId = id;
    document.getElementById('delete-target-name').innerText = `"${t.title}"`;
    document.getElementById('btn-del-single').style.display = 'block';
    document.getElementById('btn-del-future').style.display = 'block';

    closeModals();
    document.getElementById('deleteModal').style.display = 'flex';
}

function deleteEvent(id) {
    specificEvents = specificEvents.filter(e => e.id !== id);
    saveData();
    renderTasks();
    if (typeof renderCalendar === 'function') renderCalendar();
    if (typeof renderWeeklyPlanner === 'function') renderWeeklyPlanner();
    renderDayPlannerModule();
}

function openRenameModal(oldName) {
    document.getElementById('r-old-name').value = oldName;
    document.getElementById('r-new-name').value = oldName;
    closeModals();
    document.getElementById('renameModal').style.display = 'flex';
}

document.getElementById('renameForm')?.addEventListener('submit', function(e) {
    e.preventDefault();
    const oldName = document.getElementById('r-old-name').value;
    const newName = document.getElementById('r-new-name').value.trim();

    if (newName && newName !== oldName) {
        templates.forEach(t => {
            if (t.category === oldName) t.category = newName;
        });
        saveData();
        renderTasks();
        renderManager();
        if (typeof renderWeeklyPlanner === 'function') renderWeeklyPlanner();
        renderDayPlannerModule();
    }
    closeModals();
});

function deleteCategory(catName) {
    deleteTargetType = 'category';
    deleteTargetId = catName;
    document.getElementById('delete-target-name').innerText = `category "${catName}"`;
    document.getElementById('btn-del-single').style.display = 'block';
    document.getElementById('btn-del-future').style.display = 'block';

    closeModals();
    document.getElementById('deleteModal').style.display = 'flex';
}

function confirmDelete(mode) {
    let targetDate = parseLocalDate(selectedDateStr);
    targetDate.setDate(targetDate.getDate() - 1);
    const yesterdayStr = formatDate(targetDate);

    if (deleteTargetType === 'bulk_manager') {
        templates.forEach(t => {
            if (selectedManagerTasks.has(t.id) || selectedManagerCats.has(t.category)) {
                if (mode === 'single') {
                    if (!t.exceptions) t.exceptions = [];
                    t.exceptions.push(selectedDateStr);
                } else if (mode === 'future') {
                    t.endDate = yesterdayStr;
                }
            }
        });
        if (mode === 'all') {
            templates = templates.filter(t => !selectedManagerTasks.has(t.id) && !selectedManagerCats.has(t.category));
            syncCategoryOrder();
        }
        selectedManagerCats.clear();
        selectedManagerTasks.clear();
    } else if (deleteTargetType === 'task') {
        const t = templates.find(x => x.id === deleteTargetId);
        if (t) {
            if (mode === 'single') {
                if (!t.exceptions) t.exceptions = [];
                t.exceptions.push(selectedDateStr);
            } else if (mode === 'future') {
                t.endDate = yesterdayStr;
            } else if (mode === 'all') {
                templates = templates.filter(x => x.id !== deleteTargetId);
                specificEvents = specificEvents.filter(e => e.parentId !== deleteTargetId);
            }
        }
        selectedManagerTasks.delete(deleteTargetId);
    } else if (deleteTargetType === 'category') {
        if (mode === 'single') {
            templates.forEach(t => {
                if (t.category === deleteTargetId) {
                    if (!t.exceptions) t.exceptions = [];
                    t.exceptions.push(selectedDateStr);
                }
            });
        } else if (mode === 'future') {
            templates.forEach(t => {
                if (t.category === deleteTargetId) t.endDate = yesterdayStr;
            });
        } else if (mode === 'all') {
            templates = templates.filter(x => x.category !== deleteTargetId);
            syncCategoryOrder();
        }
        selectedManagerCats.delete(deleteTargetId);
    } else if (deleteTargetType === 'reference' && mode === 'all') {
        referenceLayers = referenceLayers.filter(r => r.id !== deleteTargetId);
        delete refToggles[deleteTargetId];
    }

    saveData();
    closeModals();
    renderTasks();
    renderTracker();
    if (typeof renderCalendar === 'function') renderCalendar();
    if (typeof renderWeeklyPlanner === 'function') renderWeeklyPlanner();
    if (typeof renderAvailableTasksForFocus === 'function') renderAvailableTasksForFocus();
    renderDayPlannerModule();
}

function toggleHabitType() {
    const isTimed = document.querySelector('input[name="h-type"]:checked').value === 'timed';
    document.getElementById('timed-section').style.display = isTimed ? 'block' : 'none';
    document.getElementById('untimed-section').style.display = isTimed ? 'none' : 'block';
}

function toggleCreationType() {
    const type = document.querySelector('input[name="creation-type"]:checked').value;
    const hForm = document.getElementById('habitForm');
    const rForm = document.getElementById('routineForm');
    const eForm = document.getElementById('eventForm');
    const mForm = document.getElementById('medicineForm');
    if (hForm) hForm.style.display = type === 'habit' ? 'block' : 'none';
    if (rForm) rForm.style.display = type === 'routine' ? 'block' : 'none';
    if (eForm) eForm.style.display = type === 'event' ? 'block' : 'none';
    if (mForm) mForm.style.display = type === 'medicine' ? 'block' : 'none';
}

function toggleDays() {
    const freq = document.getElementById('h-frequency').value;
    document.getElementById('h-days-container').style.display = (freq === 'specific') ? 'flex' : 'none';
}

function openCreationModal(defaultTab = 'habit') {
    document.getElementById('habitForm').reset();
    document.getElementById('h-id').value = "";
    document.getElementById('h-startdate').value = selectedDateStr;
    document.getElementById('h-color').value = '#ffffff';
    updateCustomColor(document.getElementById('h-color'), 'h-color');

    document.querySelector('input[name="h-type"][value="untimed"]').checked = true;
    toggleHabitType();

    const measuredRadio = document.querySelector('input[name="h-timer-mode"][value="measured"]');
    if (measuredRadio) measuredRadio.checked = true;
    toggleTaskTimerMode();

    document.getElementById('h-time-windows-container').innerHTML = '';
    addHabitTimeWindow();
    toggleDays();

    const rtnForm = document.getElementById('routineForm');
    if (rtnForm) {
        rtnForm.reset();
        document.getElementById('rtn-id').value = '';
        document.getElementById('rtn-startdate').value = selectedDateStr;
        document.getElementById('rtn-color').value = '#b08d43';
        updateCustomColor(document.getElementById('rtn-color'), 'rtn-color');
        document.querySelector('input[name="rtn-type"][value="untimed"]').checked = true;
        toggleRoutineScheduleType();
        document.querySelector('input[name="rtn-timer-mode"][value="checkonly"]').checked = true;
        toggleRoutineTimerMode();
        document.getElementById('rtn-time-windows-container').innerHTML = '';
        addRoutineTimeWindow();
        toggleRoutineDays();
        const builder = document.getElementById('rtn-subsections-builder');
        if (builder) {
            builder.innerHTML = '';
            addRoutineFormSubsection('Steps', []);
        }
    }

    document.getElementById('eventForm').reset();
    document.getElementById('e-date').value = selectedDateStr;
    document.getElementById('e-color').value = '#b84b4b';
    updateCustomColor(document.getElementById('e-color'), 'e-color');

    const medForm = document.getElementById('medicineForm');
    if (medForm) {
        medForm.reset();
        const medIdInp = document.getElementById('med-id');
        if (medIdInp) medIdInp.value = '';
        const medStart = document.getElementById('med-startdate');
        if (medStart) medStart.value = selectedDateStr;
        populateMedicineRoutineSelect('rtn_evening');
        toggleMedFrequencyInputs();
    }

    const targetRadio = document.querySelector(`input[name="creation-type"][value="${defaultTab}"]`)
        || document.querySelector('input[name="creation-type"][value="habit"]');
    if (targetRadio) targetRadio.checked = true;
    toggleCreationType();

    closeModals();
    document.getElementById('creationModal').style.display = 'flex';
}

function openTasksSettingsModal(defaultTab = 'tcfg-tasks') {
    isTasksManagerEditMode = false;
    selectedManagerCats.clear();
    selectedManagerTasks.clear();
    updateTasksManagerEditToolbar();
    renderManager();
    renderRoutinesManagerList();
    renderMedsManagerList();
    renderGhostLayersManagerList();
    closeModals();
    if (typeof switchTasksConfigTab === 'function') switchTasksConfigTab(defaultTab);
    const modal = document.getElementById('tasksSettingsModal');
    if (modal) modal.style.display = 'flex';
}

function openManagerModal() {
    openTasksSettingsModal('tcfg-tasks');
}

function addHabitTimeWindow(start = '', end = '', days = []) {
    const container = document.getElementById('h-time-windows-container');
    if (!container) return;
    const div = document.createElement('div');
    div.className = 'habit-time-window-row';
    div.style.cssText = 'border: 1px solid #333; padding: 10px; margin-bottom: 10px; background: rgba(255,255,255,0.02);';

    const dayLabels = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
    const dayVals = [1, 2, 3, 4, 5, 6, 0];
    let checksHtml = '';

    for (let i = 0; i < 7; i++) {
        const checked = days.includes(dayVals[i]) ? 'checked' : '';
        checksHtml += `<label class="day-check"><input type="checkbox" value="${dayVals[i]}" class="tw-day-check" ${checked}> ${dayLabels[i]}</label>`;
    }

    div.innerHTML = `
        <div style="display: flex; gap: 15px; margin-bottom: 10px;">
            <div class="form-group" style="flex: 1; margin-bottom: 0;">
                <label>Start</label>
                <input type="time" class="form-control h-start" value="${start}">
            </div>
            <div class="form-group" style="flex: 1; margin-bottom: 0;">
                <label>End</label>
                <input type="time" class="form-control h-end" value="${end}">
            </div>
            <button type="button" class="icon-btn delete" onclick="this.parentElement.parentElement.remove()" style="margin-top: 20px;">[X]</button>
        </div>
        <div class="days-checkboxes" style="display: flex; gap: 10px;">${checksHtml}</div>
    `;
    container.appendChild(div);
}

function addRoutineTimeWindow(start = '', end = '', days = []) {
    const container = document.getElementById('rtn-time-windows-container');
    if (!container) return;
    const div = document.createElement('div');
    div.className = 'rtn-time-window-row';
    div.style.cssText = 'border: 1px solid #333; padding: 10px; margin-bottom: 10px; background: rgba(255,255,255,0.02);';

    const dayLabels = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
    const dayVals = [1, 2, 3, 4, 5, 6, 0];
    let checksHtml = '';

    for (let i = 0; i < 7; i++) {
        const checked = days.includes(dayVals[i]) ? 'checked' : '';
        checksHtml += `<label class="day-check"><input type="checkbox" value="${dayVals[i]}" class="tw-day-check" ${checked}> ${dayLabels[i]}</label>`;
    }

    div.innerHTML = `
        <div style="display: flex; gap: 15px; margin-bottom: 10px;">
            <div class="form-group" style="flex: 1; margin-bottom: 0;">
                <label>Start</label>
                <input type="time" class="form-control rtn-start" value="${start}">
            </div>
            <div class="form-group" style="flex: 1; margin-bottom: 0;">
                <label>End</label>
                <input type="time" class="form-control rtn-end" value="${end}">
            </div>
            <button type="button" class="icon-btn delete" onclick="this.parentElement.parentElement.remove()" style="margin-top: 20px;">[X]</button>
        </div>
        <div class="days-checkboxes" style="display: flex; gap: 10px;">${checksHtml}</div>
    `;
    container.appendChild(div);
}

function addRoutineFormSubsection(secTitle = '', stepTitlesArray = [], existingSecId = '') {
    const builder = document.getElementById('rtn-subsections-builder');
    if (!builder) return;

    const secBox = document.createElement('div');
    secBox.className = 'rtn-form-sec-box';
    if (existingSecId) secBox.dataset.secId = existingSecId;
    secBox.style.cssText = 'border: 1px solid var(--border-color); background: rgba(255,255,255,0.02); padding: 10px; display: flex; flex-direction: column; gap: 8px;';

    secBox.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
            <input type="text" class="form-control form-control-sm rtn-sec-name-inp" placeholder="Sub-section Name (e.g. Grooming, Casa, Chiusura)..." value="${escapeHtml(secTitle)}" style="font-weight: bold;">
            <button type="button" class="icon-btn delete" onclick="this.parentElement.parentElement.remove()" title="Remove Sub-section">[X]</button>
        </div>
        <div class="rtn-sec-steps-list" style="display: flex; flex-direction: column; gap: 4px;"></div>
        <div style="display: flex; gap: 6px;">
            <input type="text" class="form-control form-control-sm rtn-new-step-inp" placeholder="+ Add step (e.g. Doccia, Rasatura barba + crema) & press Enter...">
            <button type="button" class="btn btn-sm rtn-add-step-btn">[+ STEP]</button>
        </div>
    `;

    const stepsList = secBox.querySelector('.rtn-sec-steps-list');

    const appendStepRow = (stepText) => {
        const clean = (stepText || '').trim();
        if (!clean) return;
        const row = document.createElement('div');
        row.style.cssText = 'display: flex; justify-content: space-between; align-items: center; gap: 6px; padding: 3px 6px; background: rgba(255,255,255,0.02); border: 1px solid #222;';
        row.innerHTML = `
            <input type="text" class="form-control form-control-sm rtn-step-val-inp" value="${escapeHtml(clean)}" style="border: none; background: transparent; padding: 2px 4px;">
            <button type="button" class="icon-btn delete" onclick="this.parentElement.remove()">[×]</button>
        `;
        stepsList.appendChild(row);
    };

    (stepTitlesArray || []).forEach(st => appendStepRow(st));

    const newStepInp = secBox.querySelector('.rtn-new-step-inp');
    const addStepBtn = secBox.querySelector('.rtn-add-step-btn');

    newStepInp.onkeydown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            appendStepRow(newStepInp.value);
            newStepInp.value = '';
        }
    };
    addStepBtn.onclick = () => {
        appendStepRow(newStepInp.value);
        newStepInp.value = '';
        newStepInp.focus();
    };

    builder.appendChild(secBox);
}

// --- SUBMIT HANDLERS ---

document.getElementById('habitForm')?.addEventListener('submit', function(e) {
    e.preventDefault();
    const id = document.getElementById('h-id').value;
    const category = document.getElementById('h-category').value.trim();
    const title = document.getElementById('h-title').value.trim();
    const startDate = document.getElementById('h-startdate').value;
    const endDate = document.getElementById('h-enddate').value || null;
    const color = document.getElementById('h-color').value || '#ffffff';
    const type = document.querySelector('input[name="h-type"]:checked').value;

    let instances = 1, timerMins = 25, noTimer = false, frequency = 'specific', daysOfWeek = [], timeWindows = [];

    if (type === 'timed') {
        document.querySelectorAll('.habit-time-window-row').forEach(row => {
            const start = row.querySelector('.h-start').value;
            const end = row.querySelector('.h-end').value;
            let days = [];
            row.querySelectorAll('.tw-day-check:checked').forEach(cb => {
                const dVal = parseInt(cb.value, 10);
                days.push(dVal);
                if (!daysOfWeek.includes(dVal)) daysOfWeek.push(dVal);
            });
            if (start && end && days.length > 0) timeWindows.push({ start, end, days });
        });
        if (timeWindows.length === 0) {
            alert("Please complete at least one time window with selected days!");
            return;
        }
        const [sh, sm] = timeWindows[0].start.split(':').map(Number);
        const [eh, em] = timeWindows[0].end.split(':').map(Number);
        timerMins = Math.max(5, (eh * 60 + em) - (sh * 60 + sm));
    } else {
        const modeRadio = document.querySelector('input[name="h-timer-mode"]:checked');
        noTimer = (modeRadio && modeRadio.value === 'checkonly');
        instances = parseInt(document.getElementById('h-instances').value, 10) || 1;
        timerMins = noTimer ? 0 : (parseInt(document.getElementById('h-timer').value, 10) || 25);
        frequency = document.getElementById('h-frequency').value;
        if (frequency === 'specific') {
            document.querySelectorAll('#h-days-container input:checked').forEach(cb => {
                daysOfWeek.push(parseInt(cb.value, 10));
            });
            if (daysOfWeek.length === 0) {
                alert("Please select at least one day!");
                return;
            }
        }
    }

    if (id) {
        const t = templates.find(x => x.id === id);
        if (t) {
            Object.assign(t, { category, title, instances, timerMinutes: timerMins, noTimer, frequency, daysOfWeek, startDate, endDate, color, timeWindows, type });
        }
    } else {
        templates.push({
            id: 't_' + Date.now(),
            category, title, instances, timerMinutes: timerMins, noTimer, frequency, daysOfWeek, startDate, endDate, color, timeWindows, type, exceptions: []
        });
    }

    saveData();
    closeModals();
    renderTasks();
    renderTracker();
    if (typeof renderCalendar === 'function') renderCalendar();
    if (typeof renderWeeklyPlanner === 'function') renderWeeklyPlanner();
    if (typeof renderAvailableTasksForFocus === 'function') renderAvailableTasksForFocus();
    renderDayPlannerModule();
});

document.getElementById('routineForm')?.addEventListener('submit', function(e) {
    e.preventDefault();
    const id = document.getElementById('rtn-id').value;
    const title = document.getElementById('rtn-title').value.trim();
    const startDate = document.getElementById('rtn-startdate').value || todayStr;
    const endDate = document.getElementById('rtn-enddate').value || null;
    const color = document.getElementById('rtn-color').value || '#b08d43';
    const type = document.querySelector('input[name="rtn-type"]:checked').value;

    let timerMinutes = 20, noTimer = true, frequency = 'all', daysOfWeek = [], timeWindows = [];

    if (type === 'timed') {
        document.querySelectorAll('.rtn-time-window-row').forEach(row => {
            const start = row.querySelector('.rtn-start').value;
            const end = row.querySelector('.rtn-end').value;
            let days = [];
            row.querySelectorAll('.tw-day-check:checked').forEach(cb => {
                const dVal = parseInt(cb.value, 10);
                days.push(dVal);
                if (!daysOfWeek.includes(dVal)) daysOfWeek.push(dVal);
            });
            if (start && end && days.length > 0) timeWindows.push({ start, end, days });
        });
        if (timeWindows.length === 0) {
            alert("Please complete at least one time window with selected days!");
            return;
        }
        frequency = 'specific';
        noTimer = false;
        const [sh, sm] = timeWindows[0].start.split(':').map(Number);
        const [eh, em] = timeWindows[0].end.split(':').map(Number);
        timerMinutes = Math.max(5, (eh * 60 + em) - (sh * 60 + sm));
    } else {
        const modeRadio = document.querySelector('input[name="rtn-timer-mode"]:checked');
        noTimer = (modeRadio && modeRadio.value === 'checkonly');
        timerMinutes = noTimer ? 0 : (parseInt(document.getElementById('rtn-timer').value, 10) || 20);
        frequency = document.getElementById('rtn-frequency').value;
        if (frequency === 'specific') {
            document.querySelectorAll('#rtn-days-container input:checked').forEach(cb => {
                daysOfWeek.push(parseInt(cb.value, 10));
            });
            if (daysOfWeek.length === 0) {
                alert("Please select at least one day!");
                return;
            }
        }
    }

    const sections = [];
    document.querySelectorAll('#rtn-subsections-builder .rtn-form-sec-box').forEach((box, idx) => {
        const secName = box.querySelector('.rtn-sec-name-inp').value.trim() || `Section ${idx + 1}`;
        const pendingInp = box.querySelector('.rtn-new-step-inp');
        const items = [];
        box.querySelectorAll('.rtn-step-val-inp').forEach((sInp, sIdx) => {
            const val = sInp.value.trim();
            if (val) {
                items.push({
                    id: `ri_${Date.now()}_${idx}_${sIdx}`,
                    title: val
                });
            }
        });
        if (pendingInp && pendingInp.value.trim()) {
            items.push({
                id: `ri_${Date.now()}_${idx}_p`,
                title: pendingInp.value.trim()
            });
        }
        if (items.length > 0 || secName) {
            sections.push({
                id: box.dataset.secId || `sec_${Date.now()}_${idx}`,
                title: secName,
                items: items
            });
        }
    });

    if (id) {
        const existing = routinesData.find(x => x.id === id);
        if (existing) {
            Object.assign(existing, { title, color, startDate, endDate, type, noTimer, timerMinutes, frequency, daysOfWeek, timeWindows, sections });
        }
    } else {
        routinesData.push({
            id: 'rtn_' + Date.now(),
            title, color, startDate, endDate, type, noTimer, timerMinutes, frequency, daysOfWeek, timeWindows, sections
        });
    }

    saveData();
    closeModals();
    renderTasks();
    if (typeof renderWeeklyPlanner === 'function') renderWeeklyPlanner();
    renderDayPlannerModule();
});

document.getElementById('eventForm')?.addEventListener('submit', function(e) {
    e.preventDefault();
    const startVal = document.getElementById('e-start') ? document.getElementById('e-start').value : '';
    const endVal = document.getElementById('e-end') ? document.getElementById('e-end').value : '';

    specificEvents.push({
        id: 'e_' + Date.now(),
        title: document.getElementById('e-title').value.trim(),
        date: document.getElementById('e-date').value,
        start: startVal || null,
        end: endVal || null,
        color: document.getElementById('e-color').value
    });

    saveData();
    closeModals();
    renderTasks();
    if (typeof renderCalendar === 'function') renderCalendar();
    if (typeof renderWeeklyPlanner === 'function') renderWeeklyPlanner();
    renderDayPlannerModule();
});

document.getElementById('medicineForm')?.addEventListener('submit', function(e) {
    e.preventDefault();
    const id = document.getElementById('med-id') ? document.getElementById('med-id').value : '';
    const catName = 'Medicine';
    if (!categoryOrder.includes(catName)) categoryOrder.push(catName);

    const frequency = document.getElementById('med-frequency') ? document.getElementById('med-frequency').value : 'all';
    const intervalDays = document.getElementById('med-interval-days')
        ? Math.max(1, parseInt(document.getElementById('med-interval-days').value, 10) || 14)
        : 14;
    const routineId = document.getElementById('med-routine-select')
        ? document.getElementById('med-routine-select').value
        : 'rtn_evening';

    const daysOfWeek = [];
    if (frequency === 'specific') {
        document.querySelectorAll('#med-days-container input:checked').forEach(cb => {
            daysOfWeek.push(parseInt(cb.value, 10));
        });
    }

    const medPayload = {
        category: catName,
        title: document.getElementById('med-title').value.trim(),
        routineId: routineId,
        instances: parseInt(document.getElementById('med-instances').value, 10) || 1,
        stock: parseInt(document.getElementById('med-stock').value, 10) || 0,
        alertDays: parseInt(document.getElementById('med-alert').value, 10) || 7,
        startDate: document.getElementById('med-startdate').value || todayStr,
        endDate: null,
        color: '#4c5b73',
        type: 'medicine',
        noTimer: true,
        timerMinutes: 0,
        frequency: frequency,
        intervalDays: intervalDays,
        timeWindows: [],
        daysOfWeek: daysOfWeek
    };

    let targetMed = null;
    if (id) {
        targetMed = templates.find(x => x.id === id);
        if (targetMed) Object.assign(targetMed, medPayload);
    } else {
        targetMed = Object.assign({ id: 'm_' + Date.now() }, medPayload);
        templates.push(targetMed);
    }

    if (targetMed) recalculateMedicineAlerts(targetMed);
    saveData();
    document.getElementById('medicineForm').reset();
    closeModals();
    renderTasks();
    if (typeof renderCalendar === 'function') renderCalendar();
});

// ============================================================================
// DEDICATED [TASKS ⚙] MANAGER: MODALITÀ [EDIT] A MONTE (3A), ROUTINES, MEDICINES
// ============================================================================

function toggleTasksManagerEditMode(forceState = null) {
    isTasksManagerEditMode = forceState !== null ? Boolean(forceState) : !isTasksManagerEditMode;
    if (!isTasksManagerEditMode) {
        selectedManagerCats.clear();
        selectedManagerTasks.clear();
    }
    updateTasksManagerEditToolbar();
    renderManager();
}

function updateTasksManagerEditToolbar() {
    const toggleBtn = document.getElementById('btn-tcfg-toggle-edit');
    const editOneBtn = document.getElementById('btn-tcfg-edit-one');
    const delManyBtn = document.getElementById('btn-tcfg-delete-many');

    const totalSel = selectedManagerCats.size + selectedManagerTasks.size;

    if (toggleBtn) {
        toggleBtn.textContent = isTasksManagerEditMode ? '[DONE EDIT]' : '[EDIT]';
        toggleBtn.classList.toggle('btn-primary', isTasksManagerEditMode);
    }
    if (editOneBtn) {
        editOneBtn.style.display = isTasksManagerEditMode ? 'inline-block' : 'none';
        editOneBtn.disabled = (totalSel !== 1);
    }
    if (delManyBtn) {
        delManyBtn.style.display = isTasksManagerEditMode ? 'inline-block' : 'none';
        delManyBtn.disabled = (totalSel === 0);
        delManyBtn.textContent = `[X DELETE (${totalSel})]`;
    }
}

function toggleSelectManagerCat(catName) {
    if (selectedManagerCats.has(catName)) selectedManagerCats.delete(catName);
    else selectedManagerCats.add(catName);
    updateTasksManagerEditToolbar();
    renderManager();
}

function toggleSelectManagerTask(taskId) {
    if (selectedManagerTasks.has(taskId)) selectedManagerTasks.delete(taskId);
    else selectedManagerTasks.add(taskId);
    updateTasksManagerEditToolbar();
    renderManager();
}

function editSelectedManagerItem() {
    const totalSel = selectedManagerCats.size + selectedManagerTasks.size;
    if (totalSel !== 1) return;

    if (selectedManagerCats.size === 1) {
        const catName = Array.from(selectedManagerCats)[0];
        openRenameModal(catName);
    } else if (selectedManagerTasks.size === 1) {
        const taskId = Array.from(selectedManagerTasks)[0];
        editTask(taskId);
    }
}

function deleteSelectedManagerItems() {
    const totalSel = selectedManagerCats.size + selectedManagerTasks.size;
    if (totalSel === 0) return;

    if (totalSel === 1) {
        if (selectedManagerCats.size === 1) {
            deleteCategory(Array.from(selectedManagerCats)[0]);
            return;
        } else {
            deleteTask(Array.from(selectedManagerTasks)[0]);
            return;
        }
    }

    deleteTargetType = 'bulk_manager';
    deleteTargetId = '';
    document.getElementById('delete-target-name').innerText = `${totalSel} selected items`;
    document.getElementById('btn-del-single').style.display = 'block';
    document.getElementById('btn-del-future').style.display = 'block';

    closeModals();
    document.getElementById('deleteModal').style.display = 'flex';
}

function moveCategory(catName, direction) {
    const idx = categoryOrder.indexOf(catName);
    if (idx === -1) return;
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= categoryOrder.length) return;

    const temp = categoryOrder[idx];
    categoryOrder[idx] = categoryOrder[newIdx];
    categoryOrder[newIdx] = temp;

    saveData();
    renderManager();
    renderTasks();
}

function renderManager() {
    const container = document.getElementById('manager-list');
    if (!container) return;
    container.innerHTML = '';
    const frag = document.createDocumentFragment();
    const cats = {};

    templates.filter(t => shouldShowTaskInSettingsManager(t)).forEach(t => {
        if (!cats[t.category]) cats[t.category] = [];
        cats[t.category].push(t);
    });

    syncCategoryOrder();

    categoryOrder.forEach(cat => {
        if (!cats[cat] || cats[cat].length === 0) return;

        const catDiv = document.createElement('div');
        catDiv.className = 'manager-category';

        const headerRow = document.createElement('div');
        headerRow.style.cssText = 'display:flex; justify-content:space-between; align-items:center;';

        const leftPart = document.createElement('div');
        leftPart.style.cssText = 'display:flex; align-items:center; gap: 10px;';

        if (isTasksManagerEditMode) {
            const catCb = document.createElement('div');
            catCb.className = `check-box ${selectedManagerCats.has(cat) ? 'checked' : ''}`;
            catCb.onclick = () => toggleSelectManagerCat(cat);
            leftPart.appendChild(catCb);
        }

        const arrowsCol = document.createElement('div');
        arrowsCol.style.cssText = 'display:flex; flex-direction:column; gap:2px;';

        const btnUp = document.createElement('button');
        btnUp.className = 'icon-btn reorder';
        btnUp.textContent = '▲';
        btnUp.onclick = () => moveCategory(cat, -1);

        const btnDown = document.createElement('button');
        btnDown.className = 'icon-btn reorder';
        btnDown.textContent = '▼';
        btnDown.onclick = () => moveCategory(cat, 1);

        arrowsCol.appendChild(btnUp);
        arrowsCol.appendChild(btnDown);

        const titleEl = document.createElement('h3');
        titleEl.style.cssText = 'margin:0; border:none; padding:0; cursor:pointer;';
        titleEl.textContent = cat;
        if (isTasksManagerEditMode) {
            titleEl.onclick = () => toggleSelectManagerCat(cat);
        }

        leftPart.appendChild(arrowsCol);
        leftPart.appendChild(titleEl);
        headerRow.appendChild(leftPart);
        catDiv.appendChild(headerRow);

        const tasksWrap = document.createElement('div');
        tasksWrap.style.cssText = 'border-top: 1px solid #333; margin-top: 5px; padding-top: 10px;';

        cats[cat].forEach(t => {
            const isSel = selectedManagerTasks.has(t.id);
            const taskRow = document.createElement('div');
            taskRow.className = 'manager-task';
            taskRow.style.cssText = `display:flex; justify-content:space-between; align-items:center; padding: 6px 8px; cursor:${isTasksManagerEditMode ? 'pointer' : 'default'}; background:${isSel ? 'rgba(255,255,255,0.06)' : 'transparent'};`;

            const leftTask = document.createElement('div');
            leftTask.style.cssText = 'display:flex; align-items:center; gap:10px;';

            if (isTasksManagerEditMode) {
                const tCb = document.createElement('div');
                tCb.className = `check-box ${isSel ? 'checked' : ''}`;
                leftTask.appendChild(tCb);
                taskRow.onclick = () => toggleSelectManagerTask(t.id);
            }

            const mins = typeof getTaskDurationMinutes === 'function' ? getTaskDurationMinutes(t) : (t.timerMinutes || 0);
            const durBadge = mins > 0 ? `${mins}m` : 'CHECK-ONLY';
            const dateBadge = isSingleDayTodoTemplate(t) && t.startDate ? ` · @${t.startDate}` : '';
            const spanTitle = document.createElement('span');
            spanTitle.textContent = `${t.title} (${t.instances || 1}x · ${durBadge}${dateBadge})`;

            leftTask.appendChild(spanTitle);
            taskRow.appendChild(leftTask);
            tasksWrap.appendChild(taskRow);
        });

        const quickAddDiv = document.createElement('div');
        quickAddDiv.className = 'quick-add-task';
        quickAddDiv.innerHTML = '<span>+</span>';
        const inputQuick = document.createElement('input');
        inputQuick.type = 'text';
        inputQuick.placeholder = `Add task to ${cat}...`;
        inputQuick.onkeypress = (e) => quickAddTask(e, cat);
        quickAddDiv.appendChild(inputQuick);
        tasksWrap.appendChild(quickAddDiv);

        catDiv.appendChild(tasksWrap);
        frag.appendChild(catDiv);
    });

    container.appendChild(frag);
}

function renderRoutinesManagerList() {
    const cont = document.getElementById('routines-manager-list');
    if (!cont) return;
    cont.innerHTML = '';

    if (!Array.isArray(routinesData) || routinesData.length === 0) {
        cont.innerHTML = '<div class="empty-state">[ NO ROUTINES CONFIGURED ]</div>';
        return;
    }

    routinesData.forEach((r, idx) => {
        const box = document.createElement('div');
        box.className = 'cfg-box';
        box.style.borderLeft = `3px solid ${r.color || '#ffffff'}`;

        const secSummary = (r.sections || []).map(s => `${s.title} (${(s.items || []).length})`).join(' · ');
        const schedBadge = r.type === 'timed' && r.timeWindows?.length
            ? `TIMED: ${r.timeWindows.map(w => w.start + '-' + w.end).join(', ')}`
            : `FREQ: ${(r.frequency || 'all').toUpperCase()}${!r.noTimer && r.timerMinutes ? ' · ' + r.timerMinutes + 'm' : ''}`;

        box.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <strong style="font-size:var(--font-sm); color:var(--text-main); text-transform:uppercase;">${escapeHtml(r.title)}</strong>
                    <span style="font-size:var(--font-xs); color:var(--text-dim); margin-left:8px;">[${escapeHtml(schedBadge)}]</span>
                    <div style="font-size:var(--font-xs); color:var(--text-muted); margin-top:4px;">${escapeHtml(secSummary || 'No sub-sections')}</div>
                </div>
                <div style="display:flex; gap:8px;">
                    <button type="button" class="btn btn-sm btn-edit-rtn">[EDIT]</button>
                    <button type="button" class="icon-btn delete btn-del-rtn">[X]</button>
                </div>
            </div>
        `;

        box.querySelector('.btn-edit-rtn').onclick = () => editRoutine(r.id);
        box.querySelector('.btn-del-rtn').onclick = () => {
            routinesData.splice(idx, 1);
            saveData();
            renderRoutinesManagerList();
            renderTasks();
            if (typeof renderWeeklyPlanner === 'function') renderWeeklyPlanner();
            renderDayPlannerModule();
        };

        cont.appendChild(box);
    });
}

function renderMedsManagerList() {
    const cont = document.getElementById('meds-manager-list');
    if (!cont) return;
    cont.innerHTML = '';

    const meds = templates.filter(t => t.type === 'medicine');
    if (meds.length === 0) {
        cont.innerHTML = '<div class="empty-state">[ NO MEDICINES CONFIGURED — CLICK "+ NEW MEDICINE" ABOVE ]</div>';
        return;
    }

    meds.forEach(m => {
        const linkedRtn = (routinesData || []).find(r => r.id === m.routineId) || routinesData[0];
        const freqDesc = m.frequency === 'interval'
            ? `Every ${m.intervalDays || 14} days (from ${m.startDate})`
            : (m.frequency === 'specific' ? 'Specific days' : 'Every day');

        const row = document.createElement('div');
        row.className = 'cfg-box';
        row.style.cssText = 'display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; border-left:3px solid #4c5b73;';

        row.innerHTML = `
            <div>
                <strong style="color:var(--text-main); font-size:var(--font-sm);">${escapeHtml(m.title)}</strong>
                <span style="font-size:var(--font-xs); color:var(--text-dim); margin-left:8px;">➔ Injected in: <strong>${escapeHtml(linkedRtn ? linkedRtn.title : 'Evening Routine')}</strong></span>
                <div style="font-size:var(--font-xs); color:var(--text-muted); margin-top:3px;">
                    ${escapeHtml(freqDesc)} · ${m.instances || 1} dose(s) · Alert ${m.alertDays || 7}d before runout
                </div>
            </div>
            <div style="display:flex; align-items:center; gap:10px;">
                <div style="display:flex; align-items:center; gap:4px; font-size:var(--font-xs);">
                    <span style="color:var(--text-dim);">STOCK:</span>
                    <input type="number" class="form-control form-control-sm no-spinners med-stock-quick" style="width:65px; text-align:center;" value="${m.stock ?? 0}">
                </div>
                <button type="button" class="btn btn-sm btn-edit-med">[EDIT]</button>
                <button type="button" class="icon-btn delete btn-del-med">[X]</button>
            </div>
        `;

        row.querySelector('.med-stock-quick').onchange = (e) => {
            m.stock = Math.max(0, parseInt(e.target.value, 10) || 0);
            recalculateMedicineAlerts(m);
            saveData();
            renderTasks();
            if (typeof renderCalendar === 'function') renderCalendar();
        };
        row.querySelector('.btn-edit-med').onclick = () => editMedicine(m.id);
        row.querySelector('.btn-del-med').onclick = () => deleteTask(m.id);

        cont.appendChild(row);
    });
}

function renderGhostLayersManagerList() {
    const cont = document.getElementById('ghosts-manager-list');
    if (!cont) return;
    cont.innerHTML = '';

    if (!Array.isArray(referenceLayers) || referenceLayers.length === 0) {
        cont.innerHTML = '<div class="empty-state">[ NO GHOST LAYERS CONFIGURED — CLICK "+ NEW GHOST LAYER" ABOVE ]</div>';
        return;
    }

    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    referenceLayers.forEach(ref => {
        const box = document.createElement('div');
        box.className = 'cfg-box';
        box.style.borderLeft = `3px solid ${ref.color || '#444444'}`;

        const slotsSummary = (ref.timeWindows || []).map(tw => {
            const dStr = (tw.days || []).map(d => dayNames[d]).join(',');
            return `${tw.start}–${tw.end} (${dStr})`;
        }).join('  ·  ');

        box.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; gap:12px;">
                <div style="flex:1; min-width:0;">
                    <strong style="font-size:var(--font-sm); color:var(--text-main); text-transform:uppercase;">${escapeHtml(ref.title)}</strong>
                    <div style="font-size:var(--font-xs); color:var(--text-muted); margin-top:4px; word-break:break-word;">
                        ${escapeHtml(slotsSummary || 'No time windows')}
                    </div>
                </div>
                <div style="display:flex; gap:8px; flex-shrink:0;">
                    <button type="button" class="btn btn-sm btn-edit-ghost">[EDIT]</button>
                    <button type="button" class="icon-btn delete btn-del-ghost">[X]</button>
                </div>
            </div>
        `;

        box.querySelector('.btn-edit-ghost').onclick = () => openReferenceModal(ref.id);
        box.querySelector('.btn-del-ghost').onclick = () => deleteReference(ref.id);

        cont.appendChild(box);
    });
}

// ============================================================================
// RENDER PRINCIPALE TASKS: 4 COLONNE (FIXED, FLEXIBLE, ROUTINES, TO-DO)
// ============================================================================

function renderTasks() {
    const dateBadge = document.getElementById('tasks-date-badge');
    if (dateBadge) dateBadge.textContent = `// ${selectedDateStr}`;

    const schedContainer = document.getElementById('scheduled-tasks-list');
    const flexContainer = document.getElementById('flexible-tasks-list');
    if (!schedContainer || !flexContainer) return;

    schedContainer.innerHTML = '';
    flexContainer.innerHTML = '';
    const schedFrag = document.createDocumentFragment();
    const flexFrag = document.createDocumentFragment();
    let hasSched = false, hasFlex = false;

    const dayEvents = specificEvents.filter(e => e.date === selectedDateStr);
    const selectedDayIdx = parseLocalDate(selectedDateStr).getDay();
    const customBlocksToday = Array.isArray(ephemeralData[selectedDateStr]) ? ephemeralData[selectedDateStr] : [];
    const confirmedTransportsToday = customBlocksToday.filter(b => b.isTransport);

    if (dayEvents.length > 0) {
        hasSched = true;
        const eventGroup = document.createElement('div');
        eventGroup.className = 'category-group';
        eventGroup.innerHTML = `<div class="category-header-wrap"><div class="category-title" style="color: var(--text-dim);">Events</div></div>`;

        dayEvents.forEach(e => {
            const item = document.createElement('div');
            item.className = 'task-item';
            item.style.cssText = `border-left: 3px solid ${e.color}; padding-left: 10px;`;

            const left = document.createElement('div');
            left.className = 'task-left';

            const title = document.createElement('div');
            title.className = 'task-title';
            title.style.cssText = `color: ${e.color}; font-weight: bold;`;
            const timeBadge = (e.start && e.end) ? `[${e.start}-${e.end}] ` : '';
            title.textContent = `${timeBadge}${e.title}`;

            left.appendChild(title);
            item.appendChild(left);
            eventGroup.appendChild(item);

            item.classList.add('ev-edit-trigger'); item.style.cursor = 'pointer'; 
            item.onclick = () => openEventQuickEditPopover(e.id, item);
        });
        schedFrag.appendChild(eventGroup);
    }

    // Mostra in Fixed anche i Treni / Trasporti confermati nel Day Planner per questo giorno
    if (confirmedTransportsToday.length > 0) {
        hasSched = true;
        const trGroup = document.createElement('div');
        trGroup.className = 'category-group';
        trGroup.innerHTML = `<div class="category-header-wrap"><div class="category-title" style="color: var(--text-dim);">Transports</div></div>`;

        confirmedTransportsToday.forEach(tr => {
            const item = document.createElement('div');
            item.className = 'task-item';
            item.style.cssText = `border-left: 3px solid ${tr.color || '#ffffff'}; padding-left: 10px;`;

            const left = document.createElement('div');
            left.className = 'task-left';

            const title = document.createElement('div');
            title.className = 'task-title';
            title.textContent = `[${tr.start}-${tr.end}] ${tr.title}`;

            left.appendChild(title);
            item.appendChild(left);
            trGroup.appendChild(item);
        });
        schedFrag.appendChild(trGroup);
    }

    syncCategoryOrder();

    categoryOrder.forEach(cat => {
        const activeTasks = templates.filter(t =>
            t.category === cat &&
            t.type !== 'medicine' &&
            !isSingleDayTodoTemplate(t) &&
            isTaskActiveOnDate(t, selectedDateStr)
        );

        if (activeTasks.length > 0) {
            const isTaskFixedOnDay = (t) => {
                if (t.type === 'timed' || (t.timeWindows && t.timeWindows.length > 0)) return true;
                return customBlocksToday.some(b => b.templateId === t.id);
            };

            const fixedTasks = activeTasks.filter(t => isTaskFixedOnDay(t));
            const flexTasks = activeTasks.filter(t => !isTaskFixedOnDay(t));

            const createPureGroup = (tasks, isFixedGroup) => {
                const groupDiv = document.createElement('div');
                groupDiv.className = 'category-group';

                const headerWrap = document.createElement('div');
                headerWrap.className = 'category-header-wrap';
                const catTitle = document.createElement('div');
                catTitle.className = 'category-title';
                catTitle.textContent = cat;
                headerWrap.appendChild(catTitle);
                groupDiv.appendChild(headerWrap);

                tasks.forEach(t => {
                    const taskItem = document.createElement('div');
                    taskItem.className = 'task-item';
                    const instancesCount = t.instances || 1;
                    const currentLog = (logs[selectedDateStr] && logs[selectedDateStr][t.id]) || Array(instancesCount).fill(false);

                    const leftDiv = document.createElement('div');
                    leftDiv.className = 'task-left';

                    const titleDiv = document.createElement('div');
                    titleDiv.className = 'task-title';

                    const taskMins = typeof getTaskDurationMinutes === 'function' ? getTaskDurationMinutes(t, selectedDateStr) : (t.timerMinutes || 0);
                    let timePrefix = '';
                    if (isFixedGroup) {
                        const customTimes = customBlocksToday.filter(b => b.templateId === t.id).map(b => `${b.start}-${b.end}`);
                        if (customTimes.length > 0) {
                            timePrefix = `[${customTimes.join(', ')}] `;
                        } else if (t.timeWindows && t.timeWindows.length > 0) {
                            const matchingTw = t.timeWindows.find(tw => tw.days && tw.days.includes(selectedDayIdx));
                            if (matchingTw) timePrefix = `[${matchingTw.start}] `;
                        }
                    }
                    const minSuffix = (!isFixedGroup && taskMins > 0) ? ` (${taskMins}m)` : '';
                    titleDiv.textContent = `${timePrefix}${t.title}${minSuffix}`;
                    leftDiv.appendChild(titleDiv);

                    const instContainer = document.createElement('div');
                    instContainer.className = 'instances-container';

                    for (let i = 0; i < instancesCount; i++) {
                        const cb = document.createElement('div');
                        cb.className = `check-box ${currentLog[i] ? 'checked' : ''}`;
                        cb.onclick = () => toggleTask(t.id, i);
                        instContainer.appendChild(cb);
                    }

                    taskItem.appendChild(leftDiv);
                    taskItem.appendChild(instContainer);
                    groupDiv.appendChild(taskItem);
                });
                return groupDiv;
            };

            if (fixedTasks.length > 0) { hasSched = true; schedFrag.appendChild(createPureGroup(fixedTasks, true)); }
            if (flexTasks.length > 0) { hasFlex = true; flexFrag.appendChild(createPureGroup(flexTasks, false)); }
        }
    });

    if (hasSched) schedContainer.appendChild(schedFrag);
    else schedContainer.innerHTML = `<div class="empty-state">[ NONE ]</div>`;

    if (hasFlex) flexContainer.appendChild(flexFrag);
    else flexContainer.innerHTML = `<div class="empty-state">[ NONE ]</div>`;

    renderRoutinesColumn();
    renderTodoColumn();
}

// --- COLONNA 3: ROUTINES + INIEZIONE AUTOMATICA MEDICINE ---

function isRoutineActiveOnDate(routine, dateStr) {
    if (!routine) return false;
    if (routine.startDate && dateStr < routine.startDate) return false;
    if (routine.endDate && dateStr > routine.endDate) return false;

    const dayOfWeek = parseLocalDate(dateStr).getDay();
    if (routine.type === 'timed' && Array.isArray(routine.timeWindows) && routine.timeWindows.length > 0) {
        return routine.timeWindows.some(tw => tw.days && tw.days.includes(dayOfWeek));
    }

    const freq = routine.frequency || 'all';
    if (freq === 'all') return true;
    if (freq === 'weekdays') return dayOfWeek >= 1 && dayOfWeek <= 5;
    if (freq === 'weekends' || freq === 'weekend') return dayOfWeek === 0 || dayOfWeek === 6;
    if (freq === 'specific' && Array.isArray(routine.daysOfWeek)) {
        return routine.daysOfWeek.includes(dayOfWeek);
    }
    return true;
}

function getRoutineLogStorageKey(routine, dateStr) {
    if ((routine.frequency === 'weekends' || routine.frequency === 'weekend') && typeof getWeekStart === 'function') {
        return 'wk_' + formatDate(getWeekStart(dateStr));
    }
    return dateStr;
}

function toggleRoutineStepCheckbox(routineId, stepId, dateStr = selectedDateStr) {
    const routine = (routinesData || []).find(r => r.id === routineId);
    if (!routine) return;

    const logKey = getRoutineLogStorageKey(routine, dateStr);
    if (!routineLogs[logKey]) routineLogs[logKey] = {};
    routineLogs[logKey][stepId] = !routineLogs[logKey][stepId];

    saveData();
    renderRoutinesColumn();
}

function renderRoutinesColumn() {
    const container = document.getElementById('routines-tasks-list');
    if (!container) return;

    container.innerHTML = '';
    const activeRoutines = (routinesData || []).filter(r => isRoutineActiveOnDate(r, selectedDateStr));
    const activeMedsToday = templates.filter(t => t.type === 'medicine' && isTaskActiveOnDate(t, selectedDateStr));

    if (activeRoutines.length === 0 && activeMedsToday.length === 0) {
        container.innerHTML = `<div class="empty-state">[ NONE ]</div>`;
        return;
    }

    const frag = document.createDocumentFragment();
    const defaultEveningRtnId = activeRoutines.find(r => r.id === 'rtn_evening')?.id || activeRoutines[0]?.id;

    activeRoutines.forEach(routine => {
        const logKey = getRoutineLogStorageKey(routine, selectedDateStr);
        const rLog = routineLogs[logKey] || {};

        const injectedMeds = activeMedsToday.filter(m => {
            if (m.routineId) return m.routineId === routine.id;
            return routine.id === defaultEveningRtnId;
        });

        const card = document.createElement('div');
        card.className = 'category-group';
        card.style.borderLeft = `3px solid ${routine.color || '#ffffff'}`;

        const header = document.createElement('div');
        header.className = 'category-header-wrap';
        header.innerHTML = `<div class="category-title">${escapeHtml(routine.title)}</div>`;
        card.appendChild(header);

        if (injectedMeds.length > 0) {
            const medSec = document.createElement('div');
            medSec.className = 'routine-subsection';
            medSec.innerHTML = `<div class="routine-subsection-title">// MEDICINE</div>`;

            injectedMeds.forEach(m => {
                const inst = m.instances || 1;
                const currentLog = (logs[selectedDateStr] && logs[selectedDateStr][m.id]) || Array(inst).fill(false);
                const row = document.createElement('div');
                row.className = 'task-item';

                const left = document.createElement('div');
                left.className = 'task-left';

                const titleEl = document.createElement('div');
                titleEl.className = 'task-title';
                const lowStock = (m.stock || 0) <= (m.alertDays || 7);
                titleEl.innerHTML = `${escapeHtml(m.title)} <span style="font-size:0.65rem; color:${lowStock ? 'var(--accent-red)' : 'var(--text-dim)'};">(${m.stock ?? 0})</span>`;
                left.appendChild(titleEl);

                const instCont = document.createElement('div');
                instCont.className = 'instances-container';
                for (let i = 0; i < inst; i++) {
                    const cb = document.createElement('div');
                    cb.className = `check-box ${currentLog[i] ? 'checked' : ''}`;
                    cb.onclick = () => toggleTask(m.id, i);
                    instCont.appendChild(cb);
                }

                row.appendChild(left);
                row.appendChild(instCont);
                medSec.appendChild(row);
            });

            card.appendChild(medSec);
        }

        (routine.sections || []).forEach(sec => {
            if (!sec.items || sec.items.length === 0) return;
            const secBlock = document.createElement('div');
            secBlock.className = 'routine-subsection';

            const secTitle = document.createElement('div');
            secTitle.className = 'routine-subsection-title';
            secTitle.textContent = `// ${sec.title}`;
            secBlock.appendChild(secTitle);

            sec.items.forEach(item => {
                const isChecked = Boolean(rLog[item.id]);
                const row = document.createElement('div');
                row.className = 'task-item';

                const left = document.createElement('div');
                left.className = 'task-left';

                const titleEl = document.createElement('div');
                titleEl.className = 'task-title';
                if (isChecked) {
                    titleEl.style.textDecoration = 'line-through';
                    titleEl.style.color = 'var(--text-dim)';
                }
                titleEl.textContent = item.title;
                left.appendChild(titleEl);

                const right = document.createElement('div');
                right.className = 'instances-container';

                const cb = document.createElement('div');
                cb.className = `check-box ${isChecked ? 'checked' : ''}`;
                cb.onclick = () => toggleRoutineStepCheckbox(routine.id, item.id, selectedDateStr);
                right.appendChild(cb);

                row.appendChild(left);
                row.appendChild(right);
                secBlock.appendChild(row);
            });

            card.appendChild(secBlock);
        });

        frag.appendChild(card);
    });

    container.appendChild(frag);
}

function renderTodoColumn() {
    const assignedCont = document.getElementById('assigned-todos-list');
    const customBlocksToday = Array.isArray(ephemeralData[selectedDateStr]) ? ephemeralData[selectedDateStr] : [];

    if (assignedCont) {
        assignedCont.innerHTML = '';
        const assignedToday = templates.filter(t => isSingleDayTodoTemplate(t) && isTaskActiveOnDate(t, selectedDateStr));

        if (assignedToday.length === 0) {
            assignedCont.innerHTML = `<div class="empty-state">[ NONE ]</div>`;
        } else {
            const groupDiv = document.createElement('div');
            groupDiv.className = 'category-group';
            groupDiv.style.marginBottom = '0';

            assignedToday.forEach(t => {
                const taskItem = document.createElement('div');
                taskItem.className = 'task-item';
                const instancesCount = t.instances || 1;
                const currentLog = (logs[selectedDateStr] && logs[selectedDateStr][t.id]) || Array(instancesCount).fill(false);
                const isAllChecked = currentLog.every(Boolean);

                const leftDiv = document.createElement('div');
                leftDiv.className = 'task-left';

                const titleDiv = document.createElement('div');
                titleDiv.className = 'task-title';
                if (isAllChecked) {
                    titleDiv.style.textDecoration = 'line-through';
                    titleDiv.style.color = 'var(--text-dim)';
                }

                const schedBlock = customBlocksToday.find(b => b.templateId === t.id);
                const timePrefix = schedBlock ? `[${schedBlock.start}-${schedBlock.end}] ` : '';
                titleDiv.textContent = `${timePrefix}${t.title}`;
                leftDiv.appendChild(titleDiv);

                const instContainer = document.createElement('div');
                instContainer.className = 'instances-container';

                for (let i = 0; i < instancesCount; i++) {
                    const cb = document.createElement('div');
                    cb.className = `check-box ${currentLog[i] ? 'checked' : ''}`;
                    cb.onclick = () => toggleTask(t.id, i);
                    instContainer.appendChild(cb);
                }

                taskItem.appendChild(leftDiv);
                taskItem.appendChild(instContainer);
                groupDiv.appendChild(taskItem);
            });

            assignedCont.appendChild(groupDiv);
        }
    }
}

function addGeneralTask(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        const title = e.target.value.trim();
        if (!title) return;

        if (title.toLowerCase().startsWith('comprare ')) {
            const ideaName = title.substring(9).trim();
            mWishlist.push({ id: 'mw_' + Date.now(), title: ideaName, cost: "", order: mWishlist.length });
            saveMoneyData();
            if (typeof renderMoneyDashboard === 'function') renderMoneyDashboard();
            if (typeof showToast === 'function') showToast(`[WISH] Added "${ideaName}" to Incubator`);
            e.target.value = '';
            return;
        }

        const dayIndex = parseLocalDate(selectedDateStr).getDay();
        const catName = 'General To-Do';
        if (!categoryOrder.includes(catName)) categoryOrder.push(catName);

        templates.push({
            id: 't_' + Date.now() + '_' + Math.floor(Math.random() * 10000),
            isTodo: true,
            category: catName,
            title: title,
            instances: 1,
            timerMinutes: 15,
            noTimer: true,
            frequency: 'specific',
            daysOfWeek: [dayIndex],
            startDate: selectedDateStr,
            endDate: selectedDateStr,
            color: '#ffffff',
            type: 'untimed',
            timeWindows: []
        });

        saveData();
        renderTasks();
        renderDayPlannerModule();
        if (typeof showToast === 'function') showToast(`[TO-DO] Added "${title}" on ${selectedDateStr}`);
        e.target.value = '';
    }
}

function toggleTodoSelection(id) {
    if (selectedTodos.has(id)) selectedTodos.delete(id);
    else selectedTodos.add(id);
    renderGeneralTodos();
}

function deleteGeneralTodo(id) {
    generalTodos = generalTodos.filter(t => t.id !== id);
    selectedTodos.delete(id);
    saveData();
    renderGeneralTodos();
    renderDayPlannerModule();
}

function renderGeneralTodos() {
    const countEl = document.getElementById('unassigned-todo-count');
    if (countEl) countEl.textContent = `${generalTodos.length}`;

    const assignBtn = document.getElementById('btn-assign-todos');
    if (assignBtn) {
        assignBtn.style.display = selectedTodos.size > 0 ? 'block' : 'none';
        assignBtn.textContent = `[ASSIGN SELECTED (${selectedTodos.size}) TO DATE]`;
    }

    const container = document.getElementById('general-todo-list');
    if (!container) return;
    container.innerHTML = '';

    if (generalTodos.length === 0) {
        container.innerHTML = '<span class="empty-state" style="padding: 4px 0;">[ QUEUE EMPTY ]</span>';
        return;
    }

    const frag = document.createDocumentFragment();
    generalTodos.forEach(t => {
        const isSelected = selectedTodos.has(t.id);
        const item = document.createElement('div');
        item.className = 'task-item';
        item.style.cssText = `padding: 6px 8px; background: rgba(255,255,255,0.02); border: 1px solid ${isSelected ? 'var(--text-main)' : 'rgba(255,255,255,0.05)'}; cursor: pointer;`;
        item.onclick = () => toggleTodoSelection(t.id);

        const left = document.createElement('div');
        left.className = 'task-left';

        const cb = document.createElement('div');
        cb.className = `check-box ${isSelected ? 'checked' : ''}`;
        cb.style.marginRight = '8px';

        const span = document.createElement('span');
        span.style.cssText = `font-size: var(--font-xs); color: ${isSelected ? '#fff' : '#ccc'};`;
        span.textContent = t.title;

        left.appendChild(cb);
        left.appendChild(span);

        const delBtn = document.createElement('button');
        delBtn.className = 'icon-btn delete';
        delBtn.textContent = '[×]';
        delBtn.onclick = (ev) => { ev.stopPropagation(); deleteGeneralTodo(t.id); };

        item.appendChild(left);
        item.appendChild(delBtn);
        frag.appendChild(item);
    });
    container.appendChild(frag);
}

function openAssignModal() {
    if (selectedTodos.size === 0) return;
    const dateInput = document.getElementById('assign-date');
    if (dateInput) dateInput.value = selectedDateStr;
    closeModals();
    document.getElementById('assignModal').style.display = 'flex';
}

document.getElementById('assignForm')?.addEventListener('submit', function(e) {
    e.preventDefault();
    const dateStr = document.getElementById('assign-date').value;
    const dayIndex = parseLocalDate(dateStr).getDay();

    const catName = 'General To-Do';
    if (!categoryOrder.includes(catName)) categoryOrder.push(catName);

    selectedTodos.forEach(id => {
        const task = generalTodos.find(t => t.id === id);
        if (task) {
            templates.push({
                id: 't_' + Date.now() + '_' + Math.floor(Math.random() * 10000),
                isTodo: true,
                category: catName,
                title: task.title,
                instances: 1,
                timerMinutes: 15,
                noTimer: true,
                frequency: 'specific',
                daysOfWeek: [dayIndex],
                startDate: dateStr,
                endDate: dateStr,
                color: '#ffffff',
                type: 'untimed',
                timeWindows: []
            });
        }
    });

    generalTodos = generalTodos.filter(t => !selectedTodos.has(t.id));
    selectedTodos.clear();
    saveData();
    closeModals();
    renderTasks();
    if (typeof renderWeeklyPlanner === 'function') renderWeeklyPlanner();
    renderDayPlannerModule();
});

// ============================================================================
// CONSISTENCY TRACKER & FOCUS LEDGER
// ============================================================================

function openTrackerModal() {
    closeModals();
    if (typeof summonModule === 'function') {
        summonModule('streak');
    }
    renderTracker();
    renderFocusLedger();
}

function renderTracker() {
    const tracker2D = document.getElementById('github-tracker');
    const strip1D = document.getElementById('tracker-strip-1d');
    const metricsEl = document.getElementById('tracker-metrics');
    if (!tracker2D || !strip1D) return;

    tracker2D.innerHTML = '';
    strip1D.innerHTML = '';

    const frag2D = document.createDocumentFragment();
    const frag1D = document.createDocumentFragment();

    let earliestDate = todayStr;
    templates.forEach(t => {
        if (t.startDate && t.startDate < earliestDate) earliestDate = t.startDate;
    });

    const start = parseLocalDate(earliestDate);
    const today = parseLocalDate(todayStr);
    const diffDays = Math.ceil(Math.abs(today - start) / (1000 * 60 * 60 * 24));

    const daysToRender2D = Math.max(7, diffDays + 1);
    const startDate2D = new Date(todayObj);
    startDate2D.setDate(todayObj.getDate() - daysToRender2D + 1);

    for (let i = 0; i < daysToRender2D; i++) {
        const d = new Date(startDate2D);
        d.setDate(startDate2D.getDate() + i);
        const dateStr = formatDate(d);
        const stats = getStatsForDate(dateStr);

        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.title = `${dateStr} // ${stats.completed}/${stats.total} completed`;
        cell.onclick = () => { closeModals(); selectDate(dateStr); };

        let lvlClass = 'lvl-none';
        if (stats.total > 0) {
            const p = stats.completed / stats.total;
            if (p > 0 && p < 0.4) lvlClass = 'lvl-1';
            else if (p >= 0.4 && p < 0.75) lvlClass = 'lvl-2';
            else if (p >= 0.75 && p < 1) lvlClass = 'lvl-3';
            else if (p === 1) lvlClass = 'lvl-4';
        }
        cell.classList.add(lvlClass);
        frag2D.appendChild(cell);
    }

    const daysToRender1D = Math.min(35, diffDays + 1);
    const startDate1D = new Date(todayObj);
    startDate1D.setDate(todayObj.getDate() - daysToRender1D + 1);

    for (let i = 0; i < daysToRender1D; i++) {
        const d = new Date(startDate1D);
        d.setDate(startDate1D.getDate() + i);
        const dateStr = formatDate(d);
        const stats = getStatsForDate(dateStr);

        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.style.cssText = 'width: 11px; height: 11px;';
        cell.title = `${dateStr} // ${stats.completed}/${stats.total}`;

        let lvlClass = 'lvl-none';
        if (stats.total > 0) {
            const p = stats.completed / stats.total;
            if (p > 0 && p < 0.4) lvlClass = 'lvl-1';
            else if (p >= 0.4 && p < 0.75) lvlClass = 'lvl-2';
            else if (p >= 0.75 && p < 1) lvlClass = 'lvl-3';
            else if (p === 1) lvlClass = 'lvl-4';
        }
        cell.classList.add(lvlClass);
        frag1D.appendChild(cell);
    }

    tracker2D.appendChild(frag2D);
    strip1D.appendChild(frag1D);

    if (metricsEl) {
        const todayStats = getStatsForDate(todayStr);
        let streak = 0;
        let checkD = new Date(todayObj);
        if (todayStats.completed === 0) checkD.setDate(checkD.getDate() - 1);

        for (let k = 0; k < 365; k++) {
            const dStr = formatDate(checkD);
            const st = getStatsForDate(dStr);
            if (st.total > 0 && st.completed > 0) {
                streak++;
                checkD.setDate(checkD.getDate() - 1);
            } else {
                break;
            }
        }
        metricsEl.textContent = `TODAY ${todayStats.completed}/${todayStats.total} | STREAK ${streak}D`;
    }
    renderFocusLedger();
}

function renderFocusLedger() {
    const container = document.getElementById('focus-ledger-container');
    const summaryEl = document.getElementById('focus-ledger-summary');
    if (!container || !summaryEl) return;

    container.innerHTML = '';
    const d = parseLocalDate(todayStr);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    const weekStartStr = formatDate(d);

    let totalMinsAll = 0, totalMinsWeek = 0, totalMinsToday = 0;
    const byCat = {};
    const completedHistoryEntries = [];
    const accountedDateTitles = new Set();

    const allDates = Object.keys(logs).sort();
    allDates.forEach(dateStr => {
        const dayLogObj = logs[dateStr] || {};
        for (let templateId in dayLogObj) {
            const t = templates.find(x => x.id === templateId);
            if (!t) continue;

            accountedDateTitles.add(`${dateStr}_${t.title.toLowerCase()}`);

            const minsPerInstance = typeof getTaskDurationMinutes === 'function'
                ? getTaskDurationMinutes(t, dateStr)
                : (t.timerMinutes || 0);
            if (minsPerInstance <= 0) continue;

            const checkedCount = (dayLogObj[templateId] || []).filter(Boolean).length;
            if (checkedCount <= 0) continue;

            const totalTaskMins = checkedCount * minsPerInstance;
            const cat = t.category || 'General';

            totalMinsAll += totalTaskMins;
            if (dateStr >= weekStartStr && dateStr <= todayStr) totalMinsWeek += totalTaskMins;
            if (dateStr === todayStr) totalMinsToday += totalTaskMins;

            if (!byCat[cat]) byCat[cat] = { total: 0, week: 0, today: 0 };
            byCat[cat].total += totalTaskMins;
            if (dateStr >= weekStartStr && dateStr <= todayStr) byCat[cat].week += totalTaskMins;
            if (dateStr === todayStr) byCat[cat].today += totalTaskMins;

            completedHistoryEntries.push({
                date: dateStr,
                category: cat,
                title: `${t.title}${checkedCount > 1 ? ' (x' + checkedCount + ')' : ''}`,
                minutes: totalTaskMins
            });
        }
    });

    if (Array.isArray(focusLogs)) {
        focusLogs.forEach(fl => {
            if (!fl || !fl.date || !fl.minutes) return;
            const key = `${fl.date}_${(fl.title || '').toLowerCase()}`;
            if (accountedDateTitles.has(key)) return;

            const mins = parseInt(fl.minutes, 10) || 0;
            if (mins <= 0) return;
            const cat = fl.category || 'General';

            totalMinsAll += mins;
            if (fl.date >= weekStartStr && fl.date <= todayStr) totalMinsWeek += mins;
            if (fl.date === todayStr) totalMinsToday += mins;

            if (!byCat[cat]) byCat[cat] = { total: 0, week: 0, today: 0 };
            byCat[cat].total += mins;
            if (fl.date >= weekStartStr && fl.date <= todayStr) byCat[cat].week += mins;
            if (fl.date === todayStr) byCat[cat].today += mins;

            completedHistoryEntries.push({
                date: fl.date,
                category: cat,
                title: fl.title || 'Focus Session',
                minutes: mins
            });
        });
    }

    const fmtH = (mins) => (mins / 60).toFixed(1) + 'H';
    summaryEl.textContent = `TODAY: ${fmtH(totalMinsToday)} | WEEK: ${fmtH(totalMinsWeek)} | ALL-TIME: ${fmtH(totalMinsAll)}`;

    if (completedHistoryEntries.length === 0) {
        container.innerHTML = '<div class="empty-state">[ NO MEASURED TASKS COMPLETED YET ]</div>';
        return;
    }

    const catEntries = Object.entries(byCat).sort((a, b) => b[1].total - a[1].total);
    const maxCatMins = Math.max(...catEntries.map(e => e[1].total), 1);

    const gridWrap = document.createElement('div');
    gridWrap.style.cssText = 'display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px;';

    catEntries.forEach(([catName, stats]) => {
        const pct = Math.round((stats.total / maxCatMins) * 100);
        const row = document.createElement('div');
        row.style.cssText = 'display: grid; grid-template-columns: 140px 1fr 220px; align-items: center; gap: 12px; font-size: var(--font-xs); padding: 6px 10px; background: rgba(255,255,255,0.02); border: 1px solid var(--border-color);';
        row.innerHTML = `
            <strong style="color: var(--text-main); text-transform: uppercase; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(catName)}</strong>
            <div style="height: 8px; background: #111; border: 1px solid #333; position: relative;">
                <div style="height: 100%; width: ${pct}%; background: var(--text-main);"></div>
            </div>
            <div style="text-align: right; color: var(--text-muted); font-variant-numeric: tabular-nums;">
                <span style="color: var(--text-main); font-weight: bold;">${fmtH(stats.total)}</span> 
                <span style="color: var(--text-dim);"> (WK: ${fmtH(stats.week)} | TD: ${fmtH(stats.today)})</span>
            </div>
        `;
        gridWrap.appendChild(row);
    });
    container.appendChild(gridWrap);

    const recentHeader = document.createElement('div');
    recentHeader.className = 'sub-column-header';
    recentHeader.textContent = 'Recently Completed Measured Tasks';
    container.appendChild(recentHeader);

    const recentList = document.createElement('div');
    recentList.style.cssText = 'display: flex; flex-direction: column; gap: 4px; max-height: 130px; overflow-y: auto;';

    completedHistoryEntries.reverse().slice(0, 8).forEach(item => {
        const r = document.createElement('div');
        r.style.cssText = 'display: flex; justify-content: space-between; align-items: center; font-size: var(--font-xs); padding: 4px 8px; border-bottom: 1px dotted #222;';
        r.innerHTML = `
            <div>
                <span style="color: var(--text-dim); margin-right: 8px;">${escapeHtml(item.date)}</span>
                <strong style="color: var(--text-main);">[${escapeHtml(item.category)}]</strong> 
                <span style="color: var(--text-muted);">${escapeHtml(item.title)}</span>
            </div>
            <div>
                <strong style="color: var(--text-main);">${item.minutes} min</strong>
            </div>
        `;
        recentList.appendChild(r);
    });
    container.appendChild(recentList);
}

// ============================================================================
// MODULO ATOMICO 10: DAY PLANNER (1A, 2B, 3A DA 15 MIN, 4B CUSTOM MOUSE DRAG & RESIZE)
// ============================================================================

// Compatibilità con scorciatoia P, comando DSL `plan` e vecchi alias: monta il modulo Day Planner
function openPlanTomorrowModal() {
    closeModals();
    if (!planBuilderDateStr || planBuilderDateStr < todayStr) {
        planBuilderDateStr = tomorrowStr;
    }
    if (typeof summonModule === 'function') {
        summonModule('plan');
    }
    renderDayPlannerModule();
}

let currentDayPlanMode = 'view'; // 'view' | 'edit'

function toggleDayPlanMode(forceMode = null) {
    const cb = document.getElementById('day-plan-mode-checkbox');
    if (forceMode === 'edit' && cb) cb.checked = true;
    else if (forceMode === 'view' && cb) cb.checked = false;

    currentDayPlanMode = (cb && cb.checked) ? 'edit' : 'view';
    const leftCol = document.getElementById('plan-mod-left-col');
    if (leftCol) {
        leftCol.style.display = currentDayPlanMode === 'edit' ? 'flex' : 'none';
    }
    renderDayPlannerModule();
}

function setPlanBuilderDate(dateStr) {
    const clamped = (!dateStr || dateStr < todayStr) ? todayStr : dateStr;
    planBuilderDateStr = clamped;
    if (typeof selectDate === 'function' && selectedDateStr !== clamped) {
        selectDate(clamped);
    } else {
        renderDayPlannerModule();
    }
}

function shiftPlanBuilderDate(daysOffset) {
    ensurePlanBuilderDateValid();
    const d = parseLocalDate(planBuilderDateStr);
    d.setDate(d.getDate() + daysOffset);
    const nextStr = formatDate(d);
    setPlanBuilderDate(nextStr < todayStr ? todayStr : nextStr);
}

function togglePlanGhostLayer(refId) {
    refToggles[refId] = !refToggles[refId];
    saveData();
    renderDayPlannerModule();
    if (typeof renderWeeklyPlanner === 'function') renderWeeklyPlanner();
}

// 2B. Fissa o sblocca un Treno / Ghost Layer nel piano del giorno selezionato
function toggleConfirmTransportSlot(dateStr, refId, refTitle, color, startStr, endStr) {
    if (!Array.isArray(ephemeralData[dateStr])) {
        ephemeralData[dateStr] = [];
    }

    const existingIdx = ephemeralData[dateStr].findIndex(b =>
        b.isTransport && b.refId === refId && b.start === startStr && b.end === endStr
    );

    if (existingIdx !== -1) {
        ephemeralData[dateStr].splice(existingIdx, 1);
        if (typeof showToast === 'function') {
            showToast(`[TRANSPORT UNLOCKED] Removed "${refTitle} (${startStr}-${endStr})" from ${dateStr}`);
        }
    } else {
        const durMins = Math.max(5, timeToMinutes(endStr) - timeToMinutes(startStr));
        ephemeralData[dateStr].push({
            id: 'tr_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
            isTransport: true,
            refId: refId,
            title: refTitle,
            category: 'Transport',
            color: color || '#4c5b73',
            start: startStr,
            end: endStr,
            minutes: durMins,
            blocksUsed: 1
        });
        if (typeof showToast === 'function') {
            showToast(`[TRANSPORT LOCKED] "${refTitle} (${startStr}-${endStr})" fixed on ${dateStr}`);
        }
    }

    saveData();
    renderDayPlannerModule();
    renderTasks();
    if (typeof renderWeeklyPlanner === 'function') renderWeeklyPlanner();
}

// Piazza un blocco (Flexible Task o To-Do da 15m) sulla Timeline del giorno `targetDateStr`
function placeItemOnDayTimeline(payload, targetDateStr, startTimeStr) {
    if (!Array.isArray(ephemeralData[targetDateStr])) {
        ephemeralData[targetDateStr] = [];
    }

    // Caso 1: To-Do dalla coda Unassigned -> La assegna a `targetDateStr` e la piazza a 15 minuti
    if (payload.sourceType === 'unassigned_todo') {
        const todoItem = generalTodos.find(x => x.id === payload.todoId);
        if (!todoItem) return;

        const dayIdx = parseLocalDate(targetDateStr).getDay();
        const catName = 'General To-Do';
        if (!categoryOrder.includes(catName)) categoryOrder.push(catName);

        const newTemplateId = 't_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
        templates.push({
            id: newTemplateId,
            isTodo: true,
            category: catName,
            title: todoItem.title,
            instances: 1,
            timerMinutes: 15,
            noTimer: true,
            frequency: 'specific',
            daysOfWeek: [dayIdx],
            startDate: targetDateStr,
            endDate: targetDateStr,
            color: '#ffffff',
            type: 'untimed',
            timeWindows: []
        });

        generalTodos = generalTodos.filter(x => x.id !== payload.todoId);
        selectedTodos.delete(payload.todoId);

        const startMins = timeToMinutes(startTimeStr);
        const endMins = Math.min(24 * 60, startMins + 15);
        ephemeralData[targetDateStr].push({
            id: 'eb_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
            templateId: newTemplateId,
            title: todoItem.title,
            category: 'To-Do',
            color: '#ffffff',
            start: minutesToTimeStr(startMins),
            end: minutesToTimeStr(endMins),
            minutes: endMins - startMins,
            blocksUsed: 1
        });

        saveData();
        renderDayPlannerModule();
        renderTasks();
        if (typeof renderWeeklyPlanner === 'function') renderWeeklyPlanner();
        return;
    }

    // Caso 2: Task Flexible o To-Do già assegnata al giorno
    const t = templates.find(x => x.id === payload.templateId);
    if (!t) return;

    const isTodo = isSingleDayTodoTemplate(t);
    const rawMins = typeof getTaskDurationMinutes === 'function' ? getTaskDurationMinutes(t, targetDateStr) : (t.timerMinutes || 0);
    const durationMins = isTodo ? 15 : Math.max(5, rawMins > 0 ? rawMins : 15);

    const startMins = timeToMinutes(startTimeStr);
    const endMins = Math.min(24 * 60, startMins + durationMins);

    ephemeralData[targetDateStr].push({
        id: 'eb_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
        templateId: t.id,
        title: t.title,
        category: isTodo ? 'To-Do' : t.category,
        color: t.color || '#ffffff',
        start: minutesToTimeStr(startMins),
        end: minutesToTimeStr(endMins),
        minutes: endMins - startMins,
        blocksUsed: 1
    });

    saveData();
    renderDayPlannerModule();
    renderTasks();
    if (typeof renderWeeklyPlanner === 'function') renderWeeklyPlanner();
}

function removeTomorrowTimelineBlock(dateStr, blockId) {
    if (!Array.isArray(ephemeralData[dateStr])) return;
    ephemeralData[dateStr] = ephemeralData[dateStr].filter(b => b.id !== blockId);
    saveData();
    renderTasks();
    if (typeof renderWeeklyPlanner === 'function') renderWeeklyPlanner();
    renderDayPlannerModule();
}

function renderPlanTomorrowModal() {
    renderDayPlannerModule();
}

function renderDayPlannerModule() {
    const targetDate = ensurePlanBuilderDateValid();
    const dateLbl = document.getElementById('plan-mod-date-label');
    if (!dateLbl) return;

    const dayNamesFull = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const targetDateObj = parseLocalDate(targetDate);
    const targetDayIdx = targetDateObj.getDay();

    dateLbl.textContent = `// ${targetDate}`;

    const customBlocks = Array.isArray(ephemeralData[targetDate]) ? ephemeralData[targetDate] : [];

    // 1. SEZIONE GHOST LAYERS (Banner compatto con Toggle + Click per Lockare)
    const trCont = document.getElementById('plan-mod-transports');
    if (trCont) {
        trCont.innerHTML = '';
        let hasAnyGhost = false;

        referenceLayers.forEach(ref => {
            if (!ref || !Array.isArray(ref.timeWindows)) return;
            const slotsToday = ref.timeWindows.filter(tw => tw.days && tw.days.includes(targetDayIdx));
            if (slotsToday.length === 0) return;

            hasAnyGhost = true;
            const isVisible = Boolean(refToggles[ref.id]);
            const lockedSlotsCount = slotsToday.filter(tw =>
                customBlocks.some(b => b.isTransport && b.refId === ref.id && b.start === tw.start && b.end === tw.end)
            ).length;

            const refBox = document.createElement('div');
            refBox.style.cssText = `padding: 5px 8px; border: 1px solid ${isVisible ? 'var(--border-color)' : 'rgba(255,255,255,0.05)'}; border-left: 2px solid ${ref.color || '#4c5b73'}; background: rgba(255,255,255,${isVisible ? '0.02' : '0.005'}); opacity: ${isVisible || lockedSlotsCount > 0 ? '0.9' : '0.45'}; transition: opacity 0.15s, border-color 0.15s;`;

            const bannerRow = document.createElement('div');
            bannerRow.style.cssText = 'display: flex; justify-content: space-between; align-items: center; cursor: pointer; user-select: none; gap: 6px;';
            bannerRow.onclick = () => togglePlanGhostLayer(ref.id);

            const lockedBadge = lockedSlotsCount > 0
                ? `<span style="color: var(--accent-green); font-size: 0.6rem; margin-left: 6px;">[${lockedSlotsCount} LOCKED]</span>`
                : '';

            bannerRow.innerHTML = `
                <div style="display: flex; align-items: center; gap: 6px; min-width: 0;">
                    <div class="check-box ${isVisible ? 'checked' : ''}" style="width: 11px; height: 11px;"></div>
                    <span style="font-size: var(--font-xs); color: ${isVisible ? 'var(--text-muted)' : 'var(--text-dim)'}; font-weight: bold; text-transform: uppercase; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                        ${escapeHtml(ref.title)}
                    </span>
                    ${lockedBadge}
                </div>
                <span style="font-size: 0.58rem; color: var(--text-dim); flex-shrink: 0;">
                    ${isVisible ? '[HIDE ▲]' : `[SHOW ${slotsToday.length} ▼]`}
                </span>
            `;
            refBox.appendChild(bannerRow);

            if (isVisible) {
                const chipsWrap = document.createElement('div');
                chipsWrap.style.cssText = 'display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; padding-top: 5px; border-top: 1px dotted rgba(255,255,255,0.06);';

                slotsToday.forEach(tw => {
                    const isConfirmed = customBlocks.some(b =>
                        b.isTransport && b.refId === ref.id && b.start === tw.start && b.end === tw.end
                    );
                    const chip = document.createElement('button');
                    chip.type = 'button';
                    chip.className = `btn btn-sm ${isConfirmed ? 'btn-primary' : ''}`;
                    chip.style.cssText = `padding: 1px 6px; font-size: 0.62rem; font-variant-numeric: tabular-nums; ${!isConfirmed ? 'border-style: dashed; opacity: 0.7;' : ''}`;
                    chip.textContent = `${isConfirmed ? '🔒 ' : ''}${tw.start}–${tw.end}`;
                    chip.title = isConfirmed ? 'Click to unlock from day plan' : 'Click to lock in place on timeline';
                    chip.onclick = (e) => {
                        e.stopPropagation();
                        toggleConfirmTransportSlot(targetDate, ref.id, ref.title, ref.color, tw.start, tw.end);
                    };
                    chipsWrap.appendChild(chip);
                });

                refBox.appendChild(chipsWrap);
            }

            trCont.appendChild(refBox);
        });

        if (!hasAnyGhost) {
            trCont.innerHTML = `<div class="empty-state" style="padding: 4px 0;">[ NO GHOST LAYERS ON ${dayNamesFull[targetDayIdx]} ]</div>`;
        }
    }

    // 2. SEZIONE FLEXIBLE TASKS
    const availCont = document.getElementById('plan-mod-available-blocks');
    if (availCont) {
        availCont.innerHTML = '';

        const flexTasksForDay = templates.filter(t => {
            if (!t || t.type === 'medicine' || isSingleDayTodoTemplate(t)) return false;
            if (t.type === 'timed' || (t.timeWindows && t.timeWindows.length > 0)) return false;
            return isTaskActiveOnDate(t, targetDate);
        });

        let totalCommittedMins = 0;

        if (flexTasksForDay.length === 0) {
            availCont.innerHTML = '<div class="empty-state" style="padding: 4px 0;">[ NO FLEXIBLE TASKS FOR THIS DAY ]</div>';
        } else {
            flexTasksForDay.forEach(t => {
                const rawMins = typeof getTaskDurationMinutes === 'function' ? getTaskDurationMinutes(t, targetDate) : (t.timerMinutes || 0);
                const unitMins = rawMins > 0 ? rawMins : 15;
                const totalInstances = t.instances || 1;
                const usedBlocks = customBlocks
                    .filter(b => b.templateId === t.id)
                    .reduce((acc, b) => acc + (b.blocksUsed || 1), 0);
                const remainingBlocks = Math.max(0, totalInstances - usedBlocks);

                totalCommittedMins += totalInstances * unitMins;

                const row = document.createElement('div');
                row.className = 'plan-draggable-card';
                row.style.cssText = `display: flex; justify-content: space-between; align-items: center; padding: 7px 10px; background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-left: 3px solid ${t.color || '#fff'}; font-size: var(--font-xs); opacity: ${remainingBlocks > 0 ? '1' : '0.4'}; cursor: ${remainingBlocks > 0 ? 'grab' : 'default'}; user-select: none;`;

                row.innerHTML = `
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-weight: bold; color: var(--text-main); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                            <span style="color: var(--text-dim);">[${escapeHtml(t.category)}]</span> ${escapeHtml(t.title)}
                        </div>
                        <div style="font-size: 0.65rem; color: var(--text-dim); margin-top: 2px;">
                            ${unitMins}m/block · <strong>${remainingBlocks}/${totalInstances} remaining</strong>
                        </div>
                    </div>
                    <span style="font-size: 0.65rem; color: var(--text-dim); font-weight: bold;">${remainingBlocks > 0 ? '[:: DRAG]' : '[PLACED]'}</span>
                `;

                if (remainingBlocks > 0) {
                    bindPlanTimelineDragSource(row, {
                        kind: 'new_item',
                        sourceType: 'flexible_task',
                        templateId: t.id,
                        title: t.title,
                        durationMins: unitMins,
                        color: t.color || '#ffffff'
                    });
                }

                availCont.appendChild(row);
            });
        }

        const badgeEl = document.getElementById('plan-mod-workload-badge');
        if (badgeEl) badgeEl.textContent = `${(totalCommittedMins / 60).toFixed(1)}H FLEX`;
    }

    // 3. SEZIONE TO-DO
    const inboxCont = document.getElementById('plan-mod-inbox');
    if (inboxCont) {
        inboxCont.innerHTML = '';

        const assignedUnplacedTodos = templates.filter(t =>
            isSingleDayTodoTemplate(t) &&
            isTaskActiveOnDate(t, targetDate) &&
            !customBlocks.some(b => b.templateId === t.id)
        );

        if (assignedUnplacedTodos.length === 0 && generalTodos.length === 0) {
            inboxCont.innerHTML = '<div class="empty-state" style="padding: 4px 0;">[ NO TO-DO IN QUEUE ]</div>';
        } else {
            assignedUnplacedTodos.forEach(t => {
                const row = document.createElement('div');
                row.className = 'plan-draggable-card';
                row.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; background: rgba(255,255,255,0.03); border: 1px solid var(--border-bright); border-left: 3px solid #ffffff; font-size: var(--font-xs); cursor: grab; user-select: none;';
                row.innerHTML = `
                    <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"><strong>[ASSIGNED]</strong> ${escapeHtml(t.title)}</span>
                    <span style="font-size: 0.62rem; color: var(--text-dim); flex-shrink: 0; margin-left: 6px;">[:: 15m]</span>
                `;
                bindPlanTimelineDragSource(row, {
                    kind: 'new_item',
                    sourceType: 'assigned_todo',
                    templateId: t.id,
                    title: t.title,
                    durationMins: 15,
                    color: '#ffffff'
                });
                inboxCont.appendChild(row);
            });

            generalTodos.forEach(item => {
                const row = document.createElement('div');
                row.className = 'plan-draggable-card';
                row.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; background: rgba(255,255,255,0.02); border: 1px dashed var(--border-color); font-size: var(--font-xs); cursor: grab; user-select: none;';
                row.innerHTML = `
                    <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(item.title)}</span>
                    <span style="font-size: 0.62rem; color: var(--text-dim); flex-shrink: 0; margin-left: 6px;">[:: DRAG 15m]</span>
                `;
                bindPlanTimelineDragSource(row, {
                    kind: 'new_item',
                    sourceType: 'unassigned_todo',
                    todoId: item.id,
                    title: item.title,
                    durationMins: 15,
                    color: '#ffffff'
                });
                inboxCont.appendChild(row);
            });
        }
    }

    renderDayPlannerTimelineCanvas(targetDate);
}

// ============================================================================
// TIMELINE GIORNALIERA INTERATTIVA + CUSTOM MOUSE DRAG & RESIZE (3A & 4B)
// ============================================================================

function ensurePlanTimelineGhostEl() {
    if (!planTimelineGhostEl) {
        planTimelineGhostEl = document.createElement('div');
        planTimelineGhostEl.className = 'custom-drag-ghost';
        document.body.appendChild(planTimelineGhostEl);
    }
    return planTimelineGhostEl;
}

function bindPlanTimelineDragSource(el, payload) {
    el.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        if (['BUTTON', 'INPUT', 'SELECT'].includes(e.target.tagName)) return;
        e.preventDefault();
        e.stopPropagation();

        planTimelineDragState = {
            mode: payload.kind, // 'new_item' | 'move_block' | 'resize_block'
            payload: payload,
            startX: e.clientX,
            startY: e.clientY,
            isDragging: false,
            currentSnappedTime: null,
            currentDurationMins: payload.durationMins || 15
        };
    });
}

function renderDayPlannerTimelineCanvas(targetDate) {
    const labelsCol = document.getElementById('plan-mod-time-labels');
    const canvasCol = document.getElementById('plan-mod-day-canvas');
    if (!labelsCol || !canvasCol) return;

    const startHour = 6.5; // 06:30
    const totalHeight = (24 - startHour) * tmwTimelineZoom;

    const phaseCol = document.getElementById('plan-mod-phase-labels');
    if (typeof renderPhaseLabelsColumn === 'function') {
        renderPhaseLabelsColumn(phaseCol, tmwTimelineZoom);
    }

    labelsCol.innerHTML = '';
    labelsCol.style.height = `${totalHeight}px`;

    const lbl630 = document.createElement('div');
    lbl630.className = 'time-label';
    lbl630.style.top = '0px';
    lbl630.textContent = '06:30';
    labelsCol.appendChild(lbl630);

    for (let h = 7; h < 24; h++) {
        const tl = document.createElement('div');
        tl.className = 'time-label';
        tl.style.top = `${(h - startHour) * tmwTimelineZoom}px`;
        tl.textContent = `${String(h).padStart(2, '0')}:00`;
        labelsCol.appendChild(tl);
    }

    canvasCol.innerHTML = '';
    canvasCol.style.height = `${totalHeight}px`;

    if (typeof appendDayPhaseBandsToColumn === 'function') {
        appendDayPhaseBandsToColumn(canvasCol, tmwTimelineZoom, true);
    }

    for (let half = 13; half <= 48; half++) {
        const hDec = half / 2;
        const line = document.createElement('div');
        line.className = 'grid-line-abs';
        line.style.top = `${(hDec - startHour) * tmwTimelineZoom}px`;
        if (half % 2 !== 0) line.style.opacity = '0.35';
        canvasCol.appendChild(line);
    }

    // Indicatore visivo di posizionamento durante il trascinamento col mouse
    const dropIndicator = document.createElement('div');
    dropIndicator.id = 'plan-mod-drop-indicator';
    dropIndicator.style.cssText = 'display:none; position:absolute; left:0; right:0; border: 1px dashed var(--text-main); background: rgba(255,255,255,0.12); z-index: 80; pointer-events:none;';
    const dropBadge = document.createElement('span');
    dropBadge.id = 'plan-mod-drop-badge';
    dropBadge.style.cssText = 'position:absolute; right:6px; top:2px; background:#000; color:var(--text-main); border:1px solid var(--text-main); font-size:0.65rem; padding:1px 6px; font-weight:bold;';
    dropIndicator.appendChild(dropBadge);
    canvasCol.appendChild(dropIndicator);

    const dayIdx = parseLocalDate(targetDate).getDay();
    const customBlocks = Array.isArray(ephemeralData[targetDate]) ? ephemeralData[targetDate] : [];

    // 1. Ghost Layers sulla Timeline: visibili SOLO se il toggle del layer è attivo (refToggles[ref.id])
    referenceLayers.forEach(ref => {
        if (!ref || !refToggles[ref.id] || !Array.isArray(ref.timeWindows)) return;
        ref.timeWindows.forEach(tw => {
            if (tw.days && tw.days.includes(dayIdx)) {
                const alreadyConfirmed = customBlocks.some(b =>
                    b.isTransport && b.refId === ref.id && b.start === tw.start && b.end === tw.end
                );
                if (alreadyConfirmed) return;

                const top = timeToPx(tw.start, tmwTimelineZoom);
                const height = Math.max(timeToPx(tw.end, tmwTimelineZoom) - top, 12);
                const block = document.createElement('div');
                block.className = 'block-absolute block-ref';
                block.style.cssText = `top:${top}px; height:${height}px; border: 1px dashed ${ref.color || '#555'}; background-color:${hexToRgba(ref.color || '#555555', 0.06)}; padding: 1px 6px; color: var(--text-dim); opacity: 0.55; cursor: pointer; display: flex; justify-content: space-between; align-items: center; z-index: 3; transition: opacity 0.15s, border-color 0.15s;`;
                block.title = 'Click to lock this Ghost Layer slot in place';
                block.onmouseenter = () => { block.style.opacity = '0.95'; block.style.borderColor = 'var(--text-main)'; };
                block.onmouseleave = () => { block.style.opacity = '0.55'; block.style.borderColor = ref.color || '#555'; };
                block.innerHTML = `
                    <span style="font-size:0.62rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(ref.title)} (${tw.start}–${tw.end})</span>
                    <span style="font-size:0.58rem; color:var(--text-muted); flex-shrink:0; margin-left:6px;">[LOCK]</span>
                `;
                block.onclick = (e) => {
                    e.stopPropagation();
                    toggleConfirmTransportSlot(targetDate, ref.id, ref.title, ref.color, tw.start, tw.end);
                };
                canvasCol.appendChild(block);
            }
        });
    });

    // 2. Raccoglie tutti i blocchi attivi (Fixed Tasks, Timed Routines, Ephemeral/Transports, Events)
    const timelineBlocks = [];

    templates.forEach(t => {
        if (t && isTaskActiveOnDate(t, targetDate) && t.timeWindows && t.timeWindows.length > 0) {
            t.timeWindows.forEach(tw => {
                if (tw.days && tw.days.includes(dayIdx)) {
                    if (plannerExceptions[`${t.id}_${targetDate}_${tw.start}`]) return;
                    const top = timeToPx(tw.start, tmwTimelineZoom);
                    const height = Math.max(timeToPx(tw.end, tmwTimelineZoom) - top, 10);
                    const durMins = timeToMinutes(tw.end) - timeToMinutes(tw.start);
                    timelineBlocks.push({
                        kind: 'fixed_task',
                        id: t.id,
                        title: t.title,
                        category: t.category,
                        color: t.color || '#ffffff',
                        start: tw.start,
                        end: tw.end,
                        minutes: durMins,
                        top, height, bottom: top + height
                    });
                }
            });
        }
    });

    (routinesData || []).forEach(r => {
        if (r && r.type === 'timed' && isRoutineActiveOnDate(r, targetDate) && Array.isArray(r.timeWindows)) {
            r.timeWindows.forEach(tw => {
                if (tw.days && tw.days.includes(dayIdx)) {
                    const top = timeToPx(tw.start, tmwTimelineZoom);
                    const height = Math.max(timeToPx(tw.end, tmwTimelineZoom) - top, 10);
                    timelineBlocks.push({
                        kind: 'routine',
                        id: r.id,
                        title: r.title,
                        category: 'Routine',
                        color: r.color || '#b08d43',
                        start: tw.start,
                        end: tw.end,
                        minutes: timeToMinutes(tw.end) - timeToMinutes(tw.start),
                        top, height, bottom: top + height
                    });
                }
            });
        }
    });

    customBlocks.forEach(cb => {
        const top = timeToPx(cb.start, tmwTimelineZoom);
        const height = Math.max(timeToPx(cb.end, tmwTimelineZoom) - top, 10);
        timelineBlocks.push({
            kind: 'ephemeral_task',
            id: cb.id,
            templateId: cb.templateId,
            isTransport: cb.isTransport,
            title: cb.title,
            category: cb.category || 'Planned',
            color: cb.color || '#ffffff',
            start: cb.start,
            end: cb.end,
            minutes: cb.minutes || (timeToMinutes(cb.end) - timeToMinutes(cb.start)),
            top, height, bottom: top + height
        });
    });

    specificEvents.forEach(e => {
        if (e && e.date === targetDate && e.start && e.end) {
            const top = timeToPx(e.start, tmwTimelineZoom);
            const height = Math.max(timeToPx(e.end, tmwTimelineZoom) - top, 10);
            timelineBlocks.push({
                kind: 'event',
                id: e.id,
                title: e.title,
                category: 'Event',
                color: e.color || '#b84b4b',
                start: e.start,
                end: e.end,
                minutes: timeToMinutes(e.end) - timeToMinutes(e.start),
                top, height, bottom: top + height
            });
        }
    });

    computeOverlapColumns(timelineBlocks);

    timelineBlocks.forEach(b => {
        const block = document.createElement('div');
        block.className = `block-absolute ${b.kind === 'event' ? 'block-event' : 'block-task'}`;
        const widthPct = 100 / (b.totalCols || 1);
        const leftPct = (b.colIndex || 0) * widthPct;
        const isSmall = b.height < 18;

        block.style.cssText = `
            top: ${b.top}px;
            height: ${b.height}px;
            left: calc(${leftPct}% + 2px);
            width: calc(${widthPct}% - 4px);
            border-left: 3px solid ${b.color};
            color: ${b.color};
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: ${isSmall ? '0 6px' : '3px 8px'};
            font-size: ${isSmall ? '0.62rem' : 'var(--font-xs)'};
            cursor: ${b.kind === 'ephemeral_task' ? 'grab' : 'default'};
            z-index: 10;
        `;

        const infoSpan = document.createElement('span');
        infoSpan.style.cssText = 'overflow:hidden; text-overflow:ellipsis; white-space:nowrap; pointer-events:none;';
        const trPrefix = b.isTransport ? '🚆 ' : '';
        infoSpan.innerHTML = `<strong>[${b.start}–${b.end}] ${trPrefix}${escapeHtml(b.title)}</strong> <span style="opacity:0.75;">(${b.minutes}m)</span>`;
        block.appendChild(infoSpan);

        const removeBlockAction = (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            if (b.kind === 'ephemeral_task') {
                removeTomorrowTimelineBlock(targetDate, b.id);
            } else if (b.kind === 'fixed_task') {
                plannerExceptions[`${b.id}_${targetDate}_${b.start}`] = true;
                saveData();
                renderWeeklyPlanner();
                renderDayPlannerModule();
            }
        };

        block.oncontextmenu = removeBlockAction;

        if (b.kind === 'ephemeral_task') {
            const delBtn = document.createElement('button');
            delBtn.className = 'icon-btn delete';
            delBtn.style.cssText = 'font-size: 0.65rem; z-index: 15;';
            delBtn.textContent = '[×]';
            delBtn.onclick = removeBlockAction;
            block.appendChild(delBtn);

            // Trascinamento per spostare d'orario il blocco
            bindPlanTimelineDragSource(block, {
                kind: 'move_block',
                blockId: b.id,
                title: b.title,
                durationMins: b.minutes
            });

            // 3A. Maniglia inferiore per allungare / accorciare la durata (Resize Handle)
            const resizeHandle = document.createElement('div');
            resizeHandle.className = 'plan-block-resize-handle';
            resizeHandle.title = 'Drag bottom edge to resize duration';
            resizeHandle.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                planTimelineDragState = {
                    mode: 'resize_block',
                    payload: {
                        blockId: b.id,
                        title: b.title,
                        startTimeStr: b.start,
                        startMins: timeToMinutes(b.start),
                        durationMins: b.minutes
                    },
                    startX: e.clientX,
                    startY: e.clientY,
                    isDragging: true,
                    currentSnappedTime: b.start,
                    currentDurationMins: b.minutes
                };
                document.body.style.cursor = 'ns-resize';
            });
            block.appendChild(resizeHandle);
        }

        canvasCol.appendChild(block);
    });

    if (typeof drawCurrentTimeLine === 'function') {
        drawCurrentTimeLine();
    }
}

// Listener globali per il motore Custom Mouse Drag & Resize sulla Timeline del Day Planner
window.addEventListener('mousemove', (e) => {
    if (!planTimelineDragState) return;

    const dist = Math.hypot(e.clientX - planTimelineDragState.startX, e.clientY - planTimelineDragState.startY);
    if (!planTimelineDragState.isDragging && dist > 5) {
        planTimelineDragState.isDragging = true;
        if (planTimelineDragState.mode !== 'resize_block') {
            const ghost = ensurePlanTimelineGhostEl();
            ghost.textContent = `[:: ${planTimelineDragState.payload.title}]`;
            ghost.style.display = 'block';
            document.body.style.cursor = 'grabbing';
        }
    }

    if (!planTimelineDragState.isDragging) return;

    if (planTimelineDragState.mode !== 'resize_block' && planTimelineGhostEl) {
        planTimelineGhostEl.style.left = `${e.clientX + 12}px`;
        planTimelineGhostEl.style.top = `${e.clientY + 12}px`;
    }

    const canvasCol = document.getElementById('plan-mod-day-canvas');
    const indicator = document.getElementById('plan-mod-drop-indicator');
    const badge = document.getElementById('plan-mod-drop-badge');
    if (!canvasCol || !indicator || !badge) return;

    const rect = canvasCol.getBoundingClientRect();
    const startHour = 6.5;
    const totalHeight = (24 - startHour) * tmwTimelineZoom;

    if (planTimelineDragState.mode === 'resize_block') {
        const relY = Math.max(0, Math.min(totalHeight, e.clientY - rect.top));
        const hoverMins = Math.round((((relY / tmwTimelineZoom) + startHour) * 60) / 5) * 5;
        const startMins = planTimelineDragState.payload.startMins;
        const newDur = Math.max(5, Math.min(24 * 60 - startMins, hoverMins - startMins));

        planTimelineDragState.currentDurationMins = newDur;
        const endStr = minutesToTimeStr(startMins + newDur);
        const topPx = timeToPx(planTimelineDragState.payload.startTimeStr, tmwTimelineZoom);
        const heightPx = Math.max(8, (newDur / 60) * tmwTimelineZoom);

        indicator.style.display = 'block';
        indicator.style.top = `${topPx}px`;
        indicator.style.height = `${heightPx}px`;
        badge.textContent = `${planTimelineDragState.payload.startTimeStr}–${endStr} (${newDur}m)`;
        return;
    }

    // Modalità 'new_item' o 'move_block': verifica se il cursore è sopra la Timeline
    if (e.clientX >= rect.left - 30 && e.clientX <= rect.right + 30 && e.clientY >= rect.top && e.clientY <= rect.bottom) {
        const relY = Math.max(0, Math.min(totalHeight, e.clientY - rect.top));
        const rawMins = Math.round(((relY / tmwTimelineZoom) + startHour) * 60);
        const snappedMins = Math.max(390, Math.min(24 * 60 - 5, Math.round(rawMins / 5) * 5));
        const snappedTimeStr = minutesToTimeStr(snappedMins);
        const dur = planTimelineDragState.currentDurationMins || 15;
        const endStr = minutesToTimeStr(Math.min(24 * 60, snappedMins + dur));

        planTimelineDragState.currentSnappedTime = snappedTimeStr;

        const topPx = timeToPx(snappedTimeStr, tmwTimelineZoom);
        const heightPx = Math.max(10, (dur / 60) * tmwTimelineZoom);

        indicator.style.display = 'block';
        indicator.style.top = `${topPx}px`;
        indicator.style.height = `${heightPx}px`;
        badge.textContent = `DROP ${snappedTimeStr}–${endStr} (${dur}m)`;
    } else {
        planTimelineDragState.currentSnappedTime = null;
        indicator.style.display = 'none';
    }
});

window.addEventListener('mouseup', () => {
    if (!planTimelineDragState) return;

    const state = planTimelineDragState;
    planTimelineDragState = null;

    if (planTimelineGhostEl) planTimelineGhostEl.style.display = 'none';
    const indicator = document.getElementById('plan-mod-drop-indicator');
    if (indicator) indicator.style.display = 'none';
    document.body.style.cursor = '';

    if (!state.isDragging) return;

    const targetDate = ensurePlanBuilderDateValid();
    const list = Array.isArray(ephemeralData[targetDate]) ? ephemeralData[targetDate] : [];

    if (state.mode === 'resize_block') {
        const b = list.find(x => x.id === state.payload.blockId);
        if (b && state.currentDurationMins >= 5) {
            const startMins = timeToMinutes(b.start);
            const endMins = Math.min(24 * 60, startMins + state.currentDurationMins);
            b.end = minutesToTimeStr(endMins);
            b.minutes = endMins - startMins;
            saveData();
            renderDayPlannerModule();
            renderTasks();
            if (typeof renderWeeklyPlanner === 'function') renderWeeklyPlanner();
        }
        return;
    }

    if (state.mode === 'move_block' && state.currentSnappedTime) {
        const b = list.find(x => x.id === state.payload.blockId);
        if (b) {
            const dur = b.minutes || 15;
            const startMins = timeToMinutes(state.currentSnappedTime);
            const endMins = Math.min(24 * 60, startMins + dur);
            b.start = minutesToTimeStr(startMins);
            b.end = minutesToTimeStr(endMins);
            saveData();
            renderDayPlannerModule();
            renderTasks();
            if (typeof renderWeeklyPlanner === 'function') renderWeeklyPlanner();
        }
        return;
    }

    if (state.mode === 'new_item' && state.currentSnappedTime) {
        placeItemOnDayTimeline(state.payload, targetDate, state.currentSnappedTime);
    }
});

renderTracker();