// --- js/modules/tasks.js ---
// Atomic Module 2: Daily Tasks, Check-Only Routines, Consistency Tracker & 1-Day Interactive Timeline (Plan Tomorrow)

let deleteTargetType = '';
let deleteTargetId = '';
let tmwTimelineZoom = 46; // 46px per ora nella Timeline di Plan Tomorrow

function toggleTask(templateId, instanceIndex) {
    if (!logs[selectedDateStr]) logs[selectedDateStr] = {};

    const targetTemplate = templates.find(x => x.id === templateId);
    if (!targetTemplate) return;

    if (!logs[selectedDateStr][templateId]) {
        logs[selectedDateStr][templateId] = Array(targetTemplate.instances || 1).fill(false);
    }

    const wasChecked = Boolean(logs[selectedDateStr][templateId][instanceIndex]);

    // PONTE BIDIREZIONALE PALESTRA: se stai spuntando la task "Palestra", apre il modale di revisione pesi/ripetizioni!
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
    }

    saveData();
    renderTasks();
    renderTracker();
    if (typeof renderMeds === 'function') renderMeds();
    if (typeof renderCalendarDaySummary === 'function') renderCalendarDaySummary();
}

function recalculateMedicineAlerts(t) {
    specificEvents = specificEvents.filter(e => e.parentId !== t.id);
    if (t.stock <= 0) return;

    const daysLeft = Math.floor(t.stock / t.instances);
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
    }
}

function toggleTaskTimerMode() {
    const modeRadio = document.querySelector('input[name="h-timer-mode"]:checked');
    const isCheckOnly = modeRadio && modeRadio.value === 'checkonly';
    const timerGroup = document.getElementById('h-timer-group');
    if (timerGroup) {
        timerGroup.style.display = isCheckOnly ? 'none' : 'block';
    }
}

function editTask(id) {
    const t = templates.find(x => x.id === id);
    if (!t) return;

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
}

function openRenameModal(oldName) {
    document.getElementById('r-old-name').value = oldName;
    document.getElementById('r-new-name').value = oldName;
    closeModals();
    document.getElementById('renameModal').style.display = 'flex';
}

document.getElementById('renameForm').addEventListener('submit', function(e) {
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
    let targetDate = new Date(selectedDateStr);
    targetDate.setDate(targetDate.getDate() - 1);
    const yesterdayStr = formatDate(targetDate);

    if (deleteTargetType === 'task') {
        const t = templates.find(x => x.id === deleteTargetId);
        if (t) {
            if (mode === 'single') {
                if (!t.exceptions) t.exceptions = [];
                t.exceptions.push(selectedDateStr);
            } else if (mode === 'future') {
                t.endDate = yesterdayStr;
            } else if (mode === 'all') {
                templates = templates.filter(x => x.id !== deleteTargetId);
            }
        }
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
    } else if (deleteTargetType === 'reference' && mode === 'all') {
        referenceLayers = referenceLayers.filter(r => r.id !== deleteTargetId);
        delete refToggles[deleteTargetId];
    }

    saveData();
    closeModals();
    renderTasks();
    renderTracker();
    renderManager();
    if (typeof renderCalendar === 'function') renderCalendar();
    if (typeof renderWeeklyPlanner === 'function') renderWeeklyPlanner();
    if (typeof renderAvailableTasksForFocus === 'function') renderAvailableTasksForFocus();
}

function toggleHabitType() {
    const isTimed = document.querySelector('input[name="h-type"]:checked').value === 'timed';
    document.getElementById('timed-section').style.display = isTimed ? 'block' : 'none';
    document.getElementById('untimed-section').style.display = isTimed ? 'none' : 'block';
}

function toggleCreationType() {
    const type = document.querySelector('input[name="creation-type"]:checked').value;
    document.getElementById('habitForm').style.display = type === 'habit' ? 'block' : 'none';
    document.getElementById('eventForm').style.display = type === 'event' ? 'block' : 'none';
    document.getElementById('medicineForm').style.display = type === 'medicine' ? 'block' : 'none';
}

function toggleDays() {
    const freq = document.getElementById('h-frequency').value;
    document.getElementById('h-days-container').style.display = (freq === 'specific') ? 'flex' : 'none';
}

function openCreationModal() {
    document.getElementById('habitForm').reset();
    document.getElementById('h-id').value = "";
    document.getElementById('h-startdate').value = selectedDateStr;
    document.getElementById('h-color').value = '#ffffff';
    updateCustomColor(document.getElementById('h-color'), 'h-color');

    document.querySelector('input[name="h-type"][value="timed"]').checked = true;
    toggleHabitType();

    const measuredRadio = document.querySelector('input[name="h-timer-mode"][value="measured"]');
    if (measuredRadio) measuredRadio.checked = true;
    toggleTaskTimerMode();

    document.getElementById('h-time-windows-container').innerHTML = '';
    addHabitTimeWindow();
    toggleDays();

    document.getElementById('eventForm').reset();
    document.getElementById('e-date').value = selectedDateStr;
    document.getElementById('e-color').value = '#b84b4b';
    updateCustomColor(document.getElementById('e-color'), 'e-color');

    const medStart = document.getElementById('med-startdate');
    if (medStart) medStart.value = selectedDateStr;

    document.querySelector('input[name="creation-type"][value="habit"]').checked = true;
    toggleCreationType();

    closeModals();
    document.getElementById('creationModal').style.display = 'flex';
}

function openManagerModal() {
    renderManager();
    closeModals();
    document.getElementById('managerModal').style.display = 'flex';
}

function addHabitTimeWindow(start = '', end = '', days = []) {
    const container = document.getElementById('h-time-windows-container');
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

document.getElementById('habitForm').addEventListener('submit', function(e) {
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
});

document.getElementById('eventForm').addEventListener('submit', function(e) {
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
});

document.getElementById('medicineForm').addEventListener('submit', function(e) {
    e.preventDefault();
    const catName = 'Medicine';
    if (!categoryOrder.includes(catName)) categoryOrder.push(catName);

    const med = {
        id: 'm_' + Date.now(),
        category: catName,
        title: document.getElementById('med-title').value.trim(),
        instances: parseInt(document.getElementById('med-instances').value, 10),
        stock: parseInt(document.getElementById('med-stock').value, 10),
        alertDays: parseInt(document.getElementById('med-alert').value, 10),
        startDate: document.getElementById('med-startdate').value,
        endDate: null,
        color: '#4c5b73',
        type: 'medicine',
        noTimer: true,
        timerMinutes: 0,
        frequency: 'all',
        timeWindows: [],
        daysOfWeek: []
    };

    templates.push(med);
    recalculateMedicineAlerts(med);
    saveData();
    document.getElementById('medicineForm').reset();
    closeModals();
    renderTasks();
    if (typeof renderCalendar === 'function') renderCalendar();
    if (typeof renderMeds === 'function') renderMeds();
});

// --- RENDER TASKS, MANAGER & INBOX ---

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

    templates.forEach(t => {
        if (!cats[t.category]) cats[t.category] = [];
        cats[t.category].push(t);
    });

    syncCategoryOrder();

    categoryOrder.forEach(cat => {
        if (!cats[cat]) return;

        const catDiv = document.createElement('div');
        catDiv.className = 'manager-category';

        const headerRow = document.createElement('div');
        headerRow.style.cssText = 'display:flex; justify-content:space-between; align-items:center;';

        const leftPart = document.createElement('div');
        leftPart.style.cssText = 'display:flex; align-items:center; gap: 10px;';

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
        titleEl.style.cssText = 'margin:0; border:none; padding:0;';
        titleEl.textContent = cat;

        leftPart.appendChild(arrowsCol);
        leftPart.appendChild(titleEl);

        const rightActions = document.createElement('div');
        rightActions.className = 'action-btns';
        rightActions.style.cssText = 'display:flex; margin-bottom:6px;';

        const btnRename = document.createElement('button');
        btnRename.className = 'icon-btn';
        btnRename.textContent = '[EDIT]';
        btnRename.onclick = () => openRenameModal(cat);

        const btnDelCat = document.createElement('button');
        btnDelCat.className = 'icon-btn delete';
        btnDelCat.textContent = '[X]';
        btnDelCat.onclick = () => deleteCategory(cat);

        rightActions.appendChild(btnRename);
        rightActions.appendChild(btnDelCat);

        headerRow.appendChild(leftPart);
        headerRow.appendChild(rightActions);
        catDiv.appendChild(headerRow);

        const tasksWrap = document.createElement('div');
        tasksWrap.style.cssText = 'border-top: 1px solid #333; margin-top: 5px; padding-top: 10px;';

        cats[cat].forEach(t => {
            const taskRow = document.createElement('div');
            taskRow.className = 'manager-task';

            const mins = typeof getTaskDurationMinutes === 'function' ? getTaskDurationMinutes(t) : (t.timerMinutes || 0);
            const durBadge = mins > 0 ? `${mins}m` : 'CHECK-ONLY';
            const spanTitle = document.createElement('span');
            spanTitle.textContent = `${t.title} (${t.instances || 1}x · ${durBadge})`;

            const taskActions = document.createElement('div');
            taskActions.className = 'action-btns';
            taskActions.style.display = 'flex';

            const btnEdit = document.createElement('button');
            btnEdit.className = 'icon-btn';
            btnEdit.textContent = '[EDIT]';
            btnEdit.onclick = () => editTask(t.id);

            const btnDel = document.createElement('button');
            btnDel.className = 'icon-btn delete';
            btnDel.textContent = '[X]';
            btnDel.onclick = () => deleteTask(t.id);

            taskActions.appendChild(btnEdit);
            taskActions.appendChild(btnDel);
            taskRow.appendChild(spanTitle);
            taskRow.appendChild(taskActions);
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

function renderTasks() {
    renderPriorityBanner();
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
    const selectedDayIdx = new Date(selectedDateStr).getDay();
    const customBlocksToday = Array.isArray(ephemeralData[selectedDateStr]) ? ephemeralData[selectedDateStr] : [];

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

            const actions = document.createElement('div');
            actions.className = 'task-quick-actions';

            const delBtn = document.createElement('button');
            delBtn.className = 'icon-btn delete';
            delBtn.textContent = '[X]';
            delBtn.onclick = () => deleteEvent(e.id);

            actions.appendChild(delBtn);
            left.appendChild(title);
            item.appendChild(left);
            item.appendChild(actions);
            eventGroup.appendChild(item);
        });
        schedFrag.appendChild(eventGroup);
    }

    syncCategoryOrder();

    categoryOrder.forEach(cat => {
        const activeTasks = templates.filter(t => t.category === cat && isTaskActiveOnDate(t, selectedDateStr));
        if (activeTasks.length > 0) {
            const isTaskScheduledOnDay = (t) => {
                if (t.type === 'timed' || (t.timeWindows && t.timeWindows.length > 0)) return true;
                return customBlocksToday.some(b => b.templateId === t.id);
            };

            const schedTasks = activeTasks.filter(t => isTaskScheduledOnDay(t));
            const flexTasks = activeTasks.filter(t => !isTaskScheduledOnDay(t));

            const createGroup = (tasks, isScheduledGroup) => {
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
                    if (isScheduledGroup) {
                        const customTimes = customBlocksToday.filter(b => b.templateId === t.id).map(b => `${b.start}-${b.end}`);
                        if (customTimes.length > 0) {
                            timePrefix = `[${customTimes.join(', ')}] `;
                        } else if (t.timeWindows && t.timeWindows.length > 0) {
                            const matchingTw = t.timeWindows.find(tw => tw.days && tw.days.includes(selectedDayIdx));
                            if (matchingTw) timePrefix = `[${matchingTw.start}] `;
                        }
                    }
                    const minSuffix = (!isScheduledGroup && taskMins > 0) ? ` (${taskMins}m)` : '';
                    titleDiv.textContent = `${timePrefix}${t.title}${minSuffix}`;
                    leftDiv.appendChild(titleDiv);

                    const quickActions = document.createElement('div');
                    quickActions.className = 'task-quick-actions';

                    if (t.type !== 'medicine') {
                        if (taskMins > 0) {
                            const btnFocus = document.createElement('button');
                            btnFocus.className = 'icon-btn';
                            btnFocus.title = `Start ${taskMins}m Focus timer on ${t.title}`;
                            btnFocus.textContent = '[▶]';
                            btnFocus.onclick = () => quickStartTaskFocus(t.id);
                            quickActions.appendChild(btnFocus);
                        }

                        const btnEdit = document.createElement('button');
                        btnEdit.className = 'icon-btn';
                        btnEdit.title = 'Edit task';
                        btnEdit.textContent = '[✎]';
                        btnEdit.onclick = () => editTask(t.id);
                        quickActions.appendChild(btnEdit);
                    }

                    const btnDel = document.createElement('button');
                    btnDel.className = 'icon-btn delete';
                    btnDel.title = 'Delete task';
                    btnDel.textContent = '[×]';
                    btnDel.onclick = () => deleteTask(t.id);
                    quickActions.appendChild(btnDel);

                    const instContainer = document.createElement('div');
                    instContainer.className = 'instances-container';
                    instContainer.appendChild(quickActions);

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

            if (schedTasks.length > 0) { hasSched = true; schedFrag.appendChild(createGroup(schedTasks, true)); }
            if (flexTasks.length > 0) { hasFlex = true; flexFrag.appendChild(createGroup(flexTasks, false)); }
        }
    });

    if (hasSched) schedContainer.appendChild(schedFrag);
    else schedContainer.innerHTML = `<div class="empty-state">[ NONE ]</div>`;

    if (hasFlex) flexContainer.appendChild(flexFrag);
    else flexContainer.innerHTML = `<div class="empty-state">[ NONE ]</div>`;
}

// --- INBOX COMPATTA ---
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

        generalTodos.push({ id: 'todo_' + Date.now(), title: title });
        saveData();
        renderGeneralTodos();
        if (typeof showToast === 'function') showToast(`[INBOX] Added "${title}"`);
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
}

function renderGeneralTodos() {
    const inboxBtn = document.getElementById('btn-inbox-toggle');
    if (inboxBtn) inboxBtn.textContent = `[INBOX (${generalTodos.length}) ▼]`;

    const container = document.getElementById('general-todo-list');
    if (!container) return;
    container.innerHTML = '';

    if (generalTodos.length === 0) {
        container.innerHTML = '<span class="empty-state">[ NO GENERAL TASKS PENDING ]</span>';
        return;
    }

    const frag = document.createDocumentFragment();
    generalTodos.forEach(t => {
        const isSelected = selectedTodos.has(t.id);
        const item = document.createElement('div');
        item.className = 'task-item';
        item.style.cssText = `padding: 6px 10px; background: rgba(255,255,255,0.02); border: 1px solid ${isSelected ? 'var(--text-main)' : 'rgba(255,255,255,0.05)'}; cursor: pointer;`;
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
        delBtn.textContent = '[X]';
        delBtn.onclick = (ev) => { ev.stopPropagation(); deleteGeneralTodo(t.id); };

        item.appendChild(left);
        item.appendChild(delBtn);
        frag.appendChild(item);
    });
    container.appendChild(frag);
}

function openAssignModal() {
    if (selectedTodos.size === 0) {
        alert("Please select at least one task!");
        return;
    }
    const dateInput = document.getElementById('assign-date');
    dateInput.value = selectedDateStr;
    dateInput.min = todayStr;
    document.getElementById('todo-dropdown-content').classList.remove('show');
    closeModals();
    document.getElementById('assignModal').style.display = 'flex';
}

document.getElementById('assignForm').addEventListener('submit', function(e) {
    e.preventDefault();
    const dateStr = document.getElementById('assign-date').value;
    const dayIndex = new Date(dateStr).getDay();

    const catName = 'General To-Do';
    if (!categoryOrder.includes(catName)) categoryOrder.push(catName);

    selectedTodos.forEach(id => {
        const task = generalTodos.find(t => t.id === id);
        if (task) {
            templates.push({
                id: 't_' + Date.now() + '_' + Math.floor(Math.random() * 10000),
                category: catName,
                title: task.title,
                instances: 1,
                timerMinutes: 25,
                noTimer: false,
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
    renderGeneralTodos();
    renderTasks();
    if (typeof renderWeeklyPlanner === 'function') renderWeeklyPlanner();
});

// ============================================================================
// CONSISTENCY TRACKER & TASK-DRIVEN REAL FOCUS LEDGER
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

    const start = new Date(earliestDate);
    const today = new Date(todayStr);
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
    const d = new Date(todayStr);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const weekStartStr = formatDate(new Date(d.setDate(diff)));

    let totalMinsAll = 0, totalMinsWeek = 0, totalMinsToday = 0;
    const byCat = {};
    const completedHistoryEntries = [];

    const allDates = Object.keys(logs).sort();
    allDates.forEach(dateStr => {
        const dayLogObj = logs[dateStr] || {};
        for (let templateId in dayLogObj) {
            const t = templates.find(x => x.id === templateId);
            if (!t) continue;

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

    const fmtH = (mins) => (mins / 60).toFixed(1) + 'H';
    summaryEl.textContent = `TODAY: ${fmtH(totalMinsToday)} | WEEK: ${fmtH(totalMinsWeek)} | ALL-TIME: ${fmtH(totalMinsAll)}`;

    if (completedHistoryEntries.length === 0) {
        container.innerHTML = '<div class="empty-state">[ NO MEASURED TASKS COMPLETED YET — CHECK OFF A TIMED TASK OR COMPLETE A FOCUS SESSION ]</div>';
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

function renderPriorityBanner() {
    const banner = document.getElementById('daily-priority-banner');
    if (!banner) return;
    const prio = (dailyPriorities[selectedDateStr] || '').trim();
    if (!prio) {
        banner.style.display = 'none';
        banner.innerHTML = '';
        return;
    }
    banner.style.display = 'flex';
    banner.innerHTML = `
        <div>
            <span style="color: var(--text-dim); font-weight: bold; margin-right: 8px;">[#1 PRIORITY // ${selectedDateStr}]:</span>
            <strong style="color: var(--text-main); font-size: var(--font-sm);">${escapeHtml(prio)}</strong>
        </div>
    `;
    const clearBtn = document.createElement('button');
    clearBtn.className = 'icon-btn delete';
    clearBtn.textContent = '[CLEAR]';
    clearBtn.onclick = () => {
        delete dailyPriorities[selectedDateStr];
        saveData();
        renderPriorityBanner();
    };
    banner.appendChild(clearBtn);
}

// ============================================================================
// EVENING BUILDER: PLAN TOMORROW (TIMELINE GIORNALIERA 06:30-24:00 & BLOCCHI PROPORZIONALI)
// ============================================================================

function openPlanTomorrowModal() {
    closeModals();
    renderPlanTomorrowModal();
    document.getElementById('planTomorrowModal').style.display = 'flex';
}

function saveTomorrowPriority(val) {
    const clean = val.trim();
    if (clean) dailyPriorities[tomorrowStr] = clean;
    else delete dailyPriorities[tomorrowStr];
    saveData();
    if (selectedDateStr === tomorrowStr) renderPriorityBanner();
}

// Piazza uno o più blocchi di una Task sulla Timeline di Domani all'orario scelto
function placeTaskBlockOnTomorrowTimeline(templateId, startTimeStr, blocksMultiplier = 1) {
    const t = templates.find(x => x.id === templateId);
    if (!t) return;

    const unitMins = typeof getTaskDurationMinutes === 'function' ? getTaskDurationMinutes(t, tomorrowStr) : (t.timerMinutes || 25);
    const count = Math.max(1, parseInt(blocksMultiplier, 10) || 1);
    const totalDurationMins = Math.max(5, unitMins * count);

    const startMins = timeToMinutes(startTimeStr);
    const endMins = Math.min(24 * 60, startMins + totalDurationMins);
    const finalStartStr = minutesToTimeStr(startMins);
    const finalEndStr = minutesToTimeStr(endMins);

    if (!Array.isArray(ephemeralData[tomorrowStr])) {
        ephemeralData[tomorrowStr] = [];
    }

    ephemeralData[tomorrowStr].push({
        id: 'eb_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
        templateId: t.id,
        title: count > 1 ? `${t.title} (${count}x)` : t.title,
        category: t.category,
        color: t.color || '#ffffff',
        start: finalStartStr,
        end: finalEndStr,
        minutes: totalDurationMins,
        blocksUsed: count
    });

    saveData();
    renderTasks();
    if (typeof renderWeeklyPlanner === 'function') renderWeeklyPlanner();
    renderPlanTomorrowModal();
}

function removeTomorrowTimelineBlock(dateStr, blockId) {
    if (!Array.isArray(ephemeralData[dateStr])) return;
    ephemeralData[dateStr] = ephemeralData[dateStr].filter(b => b.id !== blockId);
    saveData();
    renderTasks();
    if (typeof renderWeeklyPlanner === 'function') renderWeeklyPlanner();
    if (dateStr === tomorrowStr) renderPlanTomorrowModal();
}

function moveTomorrowTimelineBlock(blockId, newStartTimeStr, isFixedTemplate = false, oldStartStr = '') {
    if (isFixedTemplate) {
        const t = templates.find(x => x.id === blockId);
        if (!t) return;
        // Nasconde l'orario fisso di default per domani e crea il blocco spostato
        plannerExceptions[`${t.id}_${tomorrowStr}_${oldStartStr}`] = true;
        placeTaskBlockOnTomorrowTimeline(t.id, newStartTimeStr, 1);
        return;
    }

    const list = ephemeralData[tomorrowStr];
    if (!Array.isArray(list)) return;
    const b = list.find(x => x.id === blockId);
    if (!b) return;

    const dur = b.minutes || (timeToMinutes(b.end) - timeToMinutes(b.start)) || 25;
    const startMins = timeToMinutes(newStartTimeStr);
    const endMins = Math.min(24 * 60, startMins + dur);
    b.start = minutesToTimeStr(startMins);
    b.end = minutesToTimeStr(endMins);

    saveData();
    renderTasks();
    if (typeof renderWeeklyPlanner === 'function') renderWeeklyPlanner();
    renderPlanTomorrowModal();
}

function assignInboxItemToTomorrow(todoId) {
    const item = generalTodos.find(x => x.id === todoId);
    if (!item) return;

    const tmwDayIdx = new Date(tomorrowStr).getDay();
    const catName = 'General To-Do';
    if (!categoryOrder.includes(catName)) categoryOrder.push(catName);

    templates.push({
        id: 't_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
        category: catName,
        title: item.title,
        instances: 1,
        timerMinutes: 25,
        noTimer: false,
        frequency: 'specific',
        daysOfWeek: [tmwDayIdx],
        startDate: tomorrowStr,
        endDate: tomorrowStr,
        color: '#ffffff',
        type: 'untimed',
        timeWindows: []
    });

    generalTodos = generalTodos.filter(x => x.id !== todoId);
    selectedTodos.delete(todoId);
    saveData();
    renderGeneralTodos();
    renderTasks();
    if (typeof renderWeeklyPlanner === 'function') renderWeeklyPlanner();
    renderPlanTomorrowModal();
}

function addQuickTomorrowTask() {
    const titleEl = document.getElementById('plan-tmw-new-title');
    const minsEl = document.getElementById('plan-tmw-new-mins');
    const startEl = document.getElementById('plan-tmw-new-start');
    if (!titleEl) return;

    const title = titleEl.value.trim();
    if (!title) return;

    const mins = Math.max(5, parseInt(minsEl ? minsEl.value : 30, 10) || 30);
    const startVal = startEl ? startEl.value : '';
    const tmwDayIdx = new Date(tomorrowStr).getDay();

    const catName = 'Planned';
    if (!categoryOrder.includes(catName)) categoryOrder.push(catName);

    const newTaskId = 't_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    templates.push({
        id: newTaskId,
        category: catName,
        title: title,
        instances: 1,
        timerMinutes: mins,
        noTimer: false,
        frequency: 'specific',
        daysOfWeek: [tmwDayIdx],
        startDate: tomorrowStr,
        endDate: tomorrowStr,
        color: '#ffffff',
        type: 'untimed',
        timeWindows: []
    });

    titleEl.value = '';
    if (startEl) startEl.value = '';

    saveData();
    if (startVal) {
        placeTaskBlockOnTomorrowTimeline(newTaskId, startVal, 1);
    } else {
        renderTasks();
        if (typeof renderWeeklyPlanner === 'function') renderWeeklyPlanner();
        renderPlanTomorrowModal();
    }
}

function skipTaskOnTomorrow(templateId) {
    const t = templates.find(x => x.id === templateId);
    if (!t) return;
    if (t.startDate === tomorrowStr && t.endDate === tomorrowStr) {
        templates = templates.filter(x => x.id !== templateId);
    } else {
        if (!t.exceptions) t.exceptions = [];
        if (!t.exceptions.includes(tomorrowStr)) t.exceptions.push(tomorrowStr);
    }
    if (Array.isArray(ephemeralData[tomorrowStr])) {
        ephemeralData[tomorrowStr] = ephemeralData[tomorrowStr].filter(b => b.templateId !== templateId);
    }
    saveData();
    renderTasks();
    if (typeof renderWeeklyPlanner === 'function') renderWeeklyPlanner();
    renderPlanTomorrowModal();
}

function renderPlanTomorrowModal() {
    const dateLbl = document.getElementById('plan-tmw-date-label');
    if (dateLbl) dateLbl.textContent = `TOMORROW // ${tomorrowStr}`;

    const prioInput = document.getElementById('plan-tmw-priority');
    if (prioInput) prioInput.value = dailyPriorities[tomorrowStr] || '';

    const tmwDayIdx = new Date(tomorrowStr).getDay();
    const customBlocks = Array.isArray(ephemeralData[tomorrowStr]) ? ephemeralData[tomorrowStr] : [];

    // 1. Render Blocchi Task Disponibili per Domani (proporzionali e trascinabili sulla Timeline)
    const availCont = document.getElementById('plan-tmw-available-blocks');
    if (availCont) {
        availCont.innerHTML = '';
        const activeTmwTasks = templates.filter(t => isTaskActiveOnDate(t, tomorrowStr) && t.type !== 'medicine');

        let totalCommittedMins = 0;

        if (activeTmwTasks.length === 0) {
            availCont.innerHTML = '<div class="empty-state">[ NO TASKS ACTIVE FOR TOMORROW ]</div>';
        } else {
            activeTmwTasks.forEach(t => {
                const unitMins = typeof getTaskDurationMinutes === 'function' ? getTaskDurationMinutes(t, tomorrowStr) : (t.timerMinutes || 0);
                const isFixedTimed = (t.type === 'timed' || (t.timeWindows && t.timeWindows.length > 0));
                const totalInstances = t.instances || 1;
                const usedBlocks = customBlocks
                    .filter(b => b.templateId === t.id)
                    .reduce((acc, b) => acc + (b.blocksUsed || 1), 0);
                const remainingBlocks = isFixedTimed ? 0 : Math.max(0, totalInstances - usedBlocks);

                totalCommittedMins += totalInstances * unitMins;

                const row = document.createElement('div');
                row.style.cssText = `display: flex; justify-content: space-between; align-items: center; padding: 7px 10px; background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-left: 3px solid ${t.color || '#fff'}; font-size: var(--font-xs); gap: 8px;`;

                if (unitMins > 0 && remainingBlocks > 0) {
                    row.draggable = true;
                    row.style.cursor = 'grab';
                    row.title = 'Drag onto the timeline on the right!';
                }

                const leftInfo = document.createElement('div');
                leftInfo.style.cssText = 'flex: 1; min-width: 0;';
                const badgeText = unitMins > 0
                    ? `${unitMins}m/block · ${remainingBlocks}/${totalInstances} left`
                    : `CHECK-ONLY ROUTINE`;

                leftInfo.innerHTML = `
                    <div style="font-weight:bold; color:var(--text-main); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                        <span style="color:var(--text-dim);">[${escapeHtml(t.category)}]</span> ${escapeHtml(t.title)}
                    </div>
                    <div style="font-size:0.65rem; color:var(--text-dim); margin-top:2px;">${badgeText}</div>
                `;

                const rightControls = document.createElement('div');
                rightControls.style.cssText = 'display: flex; align-items: center; gap: 5px; flex-shrink: 0;';

                // Se ha blocchi con minuti da piazzare sulla timeline
                let multSelect = null;
                if (unitMins > 0 && remainingBlocks > 0) {
                    if (remainingBlocks > 1) {
                        multSelect = document.createElement('select');
                        multSelect.className = 'form-control form-control-sm';
                        multSelect.style.cssText = 'width: 68px; padding: 2px 4px; font-size: 0.65rem;';
                        for (let k = 1; k <= remainingBlocks; k++) {
                            const opt = document.createElement('option');
                            opt.value = k;
                            opt.textContent = `${k}x (${k * unitMins}m)`;
                            multSelect.appendChild(opt);
                        }
                        rightControls.appendChild(multSelect);
                    }

                    const timeInp = document.createElement('input');
                    timeInp.type = 'time';
                    timeInp.value = '09:00';
                    timeInp.className = 'form-control form-control-sm';
                    timeInp.style.cssText = 'width: 78px; padding: 2px 4px; font-size: 0.65rem;';

                    const placeBtn = document.createElement('button');
                    placeBtn.className = 'btn btn-sm';
                    placeBtn.textContent = '[-> GRID]';
                    placeBtn.onclick = () => {
                        const mult = multSelect ? parseInt(multSelect.value, 10) : 1;
                        placeTaskBlockOnTomorrowTimeline(t.id, timeInp.value || '09:00', mult);
                    };

                    rightControls.appendChild(timeInp);
                    rightControls.appendChild(placeBtn);

                    row.ondragstart = (ev) => {
                        const mult = multSelect ? parseInt(multSelect.value, 10) : 1;
                        ev.dataTransfer.setData('text/plain', JSON.stringify({
                            kind: 'new_block',
                            templateId: t.id,
                            multiplier: mult
                        }));
                    };
                }

                const skipBtn = document.createElement('button');
                skipBtn.className = 'icon-btn delete';
                skipBtn.title = 'Skip this task tomorrow';
                skipBtn.textContent = '[SKIP]';
                skipBtn.onclick = () => skipTaskOnTomorrow(t.id);
                rightControls.appendChild(skipBtn);

                row.appendChild(leftInfo);
                row.appendChild(rightControls);
                availCont.appendChild(row);
            });
        }

        const badgeEl = document.getElementById('plan-tmw-workload-badge');
        if (badgeEl) badgeEl.textContent = `${(totalCommittedMins / 60).toFixed(1)}H TOTAL`;
    }

    // 2. General To-Do Inbox (unica fonte di spostamento rapido)
    const inboxCont = document.getElementById('plan-tmw-inbox');
    if (inboxCont) {
        inboxCont.innerHTML = '';
        if (generalTodos.length === 0) {
            inboxCont.innerHTML = '<div class="empty-state">[ INBOX EMPTY ]</div>';
        } else {
            generalTodos.forEach(item => {
                const row = document.createElement('div');
                row.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 6px 8px; background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); font-size: var(--font-xs);';
                row.innerHTML = `<span>${escapeHtml(item.title)}</span>`;
                const btn = document.createElement('button');
                btn.className = 'btn btn-sm';
                btn.textContent = '[+ ADD TO TMW]';
                btn.onclick = () => assignInboxItemToTomorrow(item.id);
                row.appendChild(btn);
                inboxCont.appendChild(row);
            });
        }
    }

    // 3. Disegna la Timeline Giornaliera di Domani (06:30 - 24:00)
    renderTomorrowOneDayTimeline();
}

function renderTomorrowOneDayTimeline() {
    const labelsCol = document.getElementById('plan-tmw-time-labels');
    const canvasCol = document.getElementById('plan-tmw-day-canvas');
    if (!labelsCol || !canvasCol) return;

    const startHour = 6.5; // 06:30
    const totalHeight = (24 - startHour) * tmwTimelineZoom;

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

    // Linee orizzontali ogni 30 minuti per riferimento visivo preciso
    for (let half = 13; half <= 48; half++) {
        const hDec = half / 2;
        const line = document.createElement('div');
        line.className = 'grid-line-abs';
        line.style.top = `${(hDec - startHour) * tmwTimelineZoom}px`;
        if (half % 2 !== 0) line.style.opacity = '0.35';
        canvasCol.appendChild(line);
    }

    // Indicatore visivo dell'orario durante il Drag & Drop sulla Timeline
    const dropIndicator = document.createElement('div');
    dropIndicator.style.cssText = 'display:none; position:absolute; left:0; right:0; border-top: 2px solid var(--text-main); z-index: 60; pointer-events:none;';
    const dropBadge = document.createElement('span');
    dropBadge.style.cssText = 'position:absolute; right:6px; top:-18px; background:#000; color:var(--text-main); border:1px solid var(--text-main); font-size:var(--font-xs); padding:1px 6px; font-weight:bold;';
    dropIndicator.appendChild(dropBadge);
    canvasCol.appendChild(dropIndicator);

    const calcSnappedTimeFromY = (clientY) => {
        const rect = canvasCol.getBoundingClientRect();
        const relY = Math.max(0, Math.min(totalHeight, clientY - rect.top));
        const rawMins = Math.round(((relY / tmwTimelineZoom) + startHour) * 60);
        // Snap preciso a multipli di 5 minuti (perfetto per task da 10m come Duolingo o 30m come Algebra)
        const snappedMins = Math.round(rawMins / 5) * 5;
        return minutesToTimeStr(snappedMins);
    };

    canvasCol.ondragover = (ev) => {
        ev.preventDefault();
        const tStr = calcSnappedTimeFromY(ev.clientY);
        const topPx = timeToPx(tStr, tmwTimelineZoom);
        dropIndicator.style.display = 'block';
        dropIndicator.style.top = `${topPx}px`;
        dropBadge.textContent = `DROP AT ${tStr}`;
    };

    canvasCol.ondragleave = () => {
        dropIndicator.style.display = 'none';
    };

    canvasCol.ondrop = (ev) => {
        ev.preventDefault();
        dropIndicator.style.display = 'none';
        const targetTimeStr = calcSnappedTimeFromY(ev.clientY);
        try {
            const payload = JSON.parse(ev.dataTransfer.getData('text/plain'));
            if (payload.kind === 'new_block') {
                placeTaskBlockOnTomorrowTimeline(payload.templateId, targetTimeStr, payload.multiplier || 1);
            } else if (payload.kind === 'move_ephemeral') {
                moveTomorrowTimelineBlock(payload.blockId, targetTimeStr, false);
            } else if (payload.kind === 'move_fixed') {
                moveTomorrowTimelineBlock(payload.templateId, targetTimeStr, true, payload.oldStart);
            }
        } catch (e) {}
    };

    const tmwDayIdx = new Date(tomorrowStr).getDay();

    // 1. Ghost Layers di domani sullo sfondo
    referenceLayers.forEach(ref => {
        if (ref && refToggles[ref.id]) {
            (ref.timeWindows || []).forEach(tw => {
                if (tw.days && tw.days.includes(tmwDayIdx)) {
                    const top = timeToPx(tw.start, tmwTimelineZoom);
                    const height = Math.max(timeToPx(tw.end, tmwTimelineZoom) - top, 8);
                    const block = document.createElement('div');
                    block.className = 'block-absolute block-ref';
                    block.style.cssText = `top:${top}px; height:${height}px; border-color:${ref.color}; background-color:${hexToRgba(ref.color, 0.14)}; padding: 2px 6px; color: var(--text-dim);`;
                    block.textContent = `[GHOST] ${ref.title} (${tw.start}-${tw.end})`;
                    canvasCol.appendChild(block);
                }
            });
        }
    });

    // 2. Raccoglie tutti i blocchi di domani (Task fisse + Blocchi Proporzionali piazzati + Eventi)
    const timelineBlocks = [];

    templates.forEach(t => {
        if (t && isTaskActiveOnDate(t, tomorrowStr) && t.timeWindows && t.timeWindows.length > 0) {
            t.timeWindows.forEach(tw => {
                if (tw.days && tw.days.includes(tmwDayIdx)) {
                    if (plannerExceptions[`${t.id}_${tomorrowStr}_${tw.start}`]) return;
                    const top = timeToPx(tw.start, tmwTimelineZoom);
                    const height = Math.max(timeToPx(tw.end, tmwTimelineZoom) - top, 8);
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

    const customBlocks = Array.isArray(ephemeralData[tomorrowStr]) ? ephemeralData[tomorrowStr] : [];
    customBlocks.forEach(cb => {
        const top = timeToPx(cb.start, tmwTimelineZoom);
        const height = Math.max(timeToPx(cb.end, tmwTimelineZoom) - top, 8);
        timelineBlocks.push({
            kind: 'ephemeral_task',
            id: cb.id,
            templateId: cb.templateId,
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
        if (e && e.date === tomorrowStr && e.start && e.end) {
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
            font-size: ${isSmall ? '0.64rem' : 'var(--font-xs)'};
            cursor: grab;
        `;

        block.draggable = (b.kind !== 'event');
        block.ondragstart = (ev) => {
            if (b.kind === 'ephemeral_task') {
                ev.dataTransfer.setData('text/plain', JSON.stringify({
                    kind: 'move_ephemeral',
                    blockId: b.id
                }));
            } else if (b.kind === 'fixed_task') {
                ev.dataTransfer.setData('text/plain', JSON.stringify({
                    kind: 'move_fixed',
                    templateId: b.id,
                    oldStart: b.start
                }));
            }
        };

        const infoSpan = document.createElement('span');
        infoSpan.style.cssText = 'overflow:hidden; text-overflow:ellipsis; white-space:nowrap;';
        infoSpan.innerHTML = `<strong>[${b.start}–${b.end}] ${escapeHtml(b.title)}</strong> <span style="opacity:0.75;">(${b.minutes}m · ${escapeHtml(b.category)})</span>`;
        block.appendChild(infoSpan);

        const removeBlockAction = (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            if (b.kind === 'ephemeral_task') {
                removeTomorrowTimelineBlock(tomorrowStr, b.id);
            } else if (b.kind === 'fixed_task') {
                plannerExceptions[`${b.id}_${tomorrowStr}_${b.start}`] = true;
                saveData();
                renderWeeklyPlanner();
                renderPlanTomorrowModal();
            }
        };

        block.oncontextmenu = removeBlockAction;

        if (!isSmall && b.kind !== 'event') {
            const delBtn = document.createElement('button');
            delBtn.className = 'icon-btn delete';
            delBtn.style.fontSize = '0.65rem';
            delBtn.textContent = '[×]';
            delBtn.onclick = removeBlockAction;
            block.appendChild(delBtn);
        }

        canvasCol.appendChild(block);
    });
}

renderTracker();