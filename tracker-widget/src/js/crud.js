// --- 2. ACTIONS & CRUD (Create, Read, Update, Delete) ---

function toggleTask(templateId, instanceIndex) {
    if (!logs[selectedDateStr]) {
        logs[selectedDateStr] = {};
    }
    
    const targetTemplate = templates.find(x => x.id === templateId);
    if (!targetTemplate) return;

    if (!logs[selectedDateStr][templateId]) {
        logs[selectedDateStr][templateId] = Array(targetTemplate.instances || 1).fill(false);
    }
    
    logs[selectedDateStr][templateId][instanceIndex] = !logs[selectedDateStr][templateId][instanceIndex];
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
}

// Avvia il Pomodoro direttamente su una task specifica dalla lista giornaliera
function quickStartTaskFocus(templateId) {
    const t = templates.find(x => x.id === templateId);
    if (!t) return;

    focusPlaylist = [{
        type: 'task',
        id: t.id,
        title: t.title,
        duration: t.timerMinutes || 25,
        color: t.color || '#ffffff',
        isPartial: false
    }];
    currentPlaylistIndex = 0;
    startCurrentPlaylistPhase();
    if (typeof showToast === 'function') {
        showToast(`[FOCUS] Started ${t.timerMinutes || 25}m: ${t.title}`);
    }
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
        renderTracker(); 
        renderCalendar(); 
        renderWeeklyPlanner(); 
        renderAvailableTasksForFocus();
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
        renderTracker(); 
        renderCalendar(); 
        renderWeeklyPlanner();
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
        document.getElementById('h-instances').value = t.instances || 1; 
        document.getElementById('h-timer').value = t.timerMinutes || 25;
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

let deleteTargetType = ''; 
let deleteTargetId = '';   

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
    renderCalendar(); 
    renderWeeklyPlanner(); 
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
        renderWeeklyPlanner(); 
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
    renderCalendar(); 
    renderManager(); 
    renderWeeklyPlanner(); 
    renderAvailableTasksForFocus();
}

function selectDate(dateStr) { 
    selectedDateStr = dateStr; 
    renderCalendar(); 
    renderTasks(); 
    renderWeeklyPlanner(); 
    if (typeof renderDiet === 'function') renderDiet();
}

// --- GESTIONE UNIFICATA NOTES ---
let currentNoteMode = 'write';
let notesAutosaveTimer;

function toggleNotesMode() {
    const checkbox = document.getElementById('notes-mode-checkbox');
    currentNoteMode = (checkbox && checkbox.checked) ? 'browse' : 'write';
    refreshNotesView();
}

function refreshNotesView() {
    const checkbox = document.getElementById('notes-mode-checkbox');
    currentNoteMode = (checkbox && checkbox.checked) ? 'browse' : 'write';

    const catEl = document.getElementById('note-category');
    const textEl = document.getElementById('note-text');
    if (!catEl || !textEl) return;

    const cat = catEl.value;
    if (currentNoteMode === 'write') {
        textEl.value = '';
        textEl.placeholder = "Write your idea and press Enter...";
    } else {
        textEl.value = notesContent[cat] || '';
        textEl.placeholder = "Edit your notes here...";
    }
}

function handleNoteKeyDown(event) { 
    if (currentNoteMode === 'write' && event.key === 'Enter' && !event.shiftKey) { 
        event.preventDefault(); 
        saveNote(); 
    } 
}

function saveNote() {
    const cat = document.getElementById('note-category').value; 
    const textEl = document.getElementById('note-text'); 
    const text = textEl.value.trim(); 
    if (!text || !cat) return;

    if (!notesContent[cat]) notesContent[cat] = "";
    notesContent[cat] += (notesContent[cat] === "" ? "" : "\n\n") + text;
    saveData();
    
    textEl.value = ''; 
    textEl.placeholder = "[OK] Idea saved!"; 
    setTimeout(() => { 
        if (currentNoteMode === 'write') textEl.placeholder = "Write your idea and press Enter..."; 
    }, 1500); 
}

function handleNoteInput() {
    if (currentNoteMode === 'browse') {
        clearTimeout(notesAutosaveTimer);
        notesAutosaveTimer = setTimeout(() => {
            const cat = document.getElementById('note-category').value;
            const textEl = document.getElementById('note-text');
            if (cat && textEl) {
                notesContent[cat] = textEl.value;
                saveData();
            }
        }, 500);
    }
}

// --- DIARIO (JOURNAL) ---
function openJournal(dateStr) {
    document.getElementById('journal-title').innerText = `Journal // ${dateStr}`;
    document.getElementById('journal-date-hidden').value = dateStr;
    document.getElementById('journal-text').value = journals[dateStr] || '';
    
    closeModals(); 
    document.getElementById('journalModal').style.display = 'flex';
}

function saveJournal() {
    const dateStr = document.getElementById('journal-date-hidden').value; 
    const text = document.getElementById('journal-text').value;
    
    journals[dateStr] = text; 
    saveData(); 
    closeModals();
    if (typeof showToast === 'function') showToast(`[JOURNAL] Saved entry for ${dateStr}`);
}

function addRefTimeWindow(start = '', end = '', days = []) {
    const container = document.getElementById('ref-time-windows-container'); 
    const div = document.createElement('div'); 
    div.className = 'ref-time-window-row'; 
    div.style.border = '1px solid #333'; 
    div.style.padding = '10px'; 
    div.style.marginBottom = '10px'; 
    div.style.background = 'rgba(255,255,255,0.02)';
    
    const dayLabels = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']; 
    const dayVals = [1, 2, 3, 4, 5, 6, 0]; 
    let checksHtml = '';
    
    for (let i = 0; i < 7; i++) {
        checksHtml += `<label class="day-check"><input type="checkbox" value="${dayVals[i]}" class="tw-day-check" ${days.includes(dayVals[i]) ? 'checked' : ''}> ${dayLabels[i]}</label>`;
    }
    
    div.innerHTML = `
        <div style="display: flex; gap: 15px; margin-bottom: 10px;">
            <div class="form-group" style="flex: 1; margin-bottom: 0;">
                <label>Start</label>
                <input type="time" class="form-control ref-start" required value="${start}">
            </div>
            <div class="form-group" style="flex: 1; margin-bottom: 0;">
                <label>End</label>
                <input type="time" class="form-control ref-end" required value="${end}">
            </div>
            <button type="button" class="icon-btn delete" onclick="this.parentElement.parentElement.remove()" style="margin-top: 20px;">[X]</button>
        </div>
        <div class="days-checkboxes" style="display: flex; gap: 10px;">${checksHtml}</div>
    `;
    container.appendChild(div);
}

function openReferenceModal() { 
    document.getElementById('referenceForm').reset(); 
    document.getElementById('ref-id').value = ""; 
    document.getElementById('ref-time-windows-container').innerHTML = ''; 
    addRefTimeWindow(); 
    document.getElementById('r-color').value = '#444444'; 
    updateCustomColor(document.getElementById('r-color'), 'r-color'); 
    closeModals(); 
    document.getElementById('referenceModal').style.display = 'flex'; 
}

document.getElementById('referenceForm').addEventListener('submit', function(e) {
    e.preventDefault(); 
    
    const title = document.getElementById('ref-title').value.trim(); 
    const color = document.getElementById('r-color').value || '#444444'; 
    let timeWindows = [];
    
    document.querySelectorAll('.ref-time-window-row').forEach(row => { 
        const start = row.querySelector('.ref-start').value; 
        const end = row.querySelector('.ref-end').value; 
        let days = []; 
        
        row.querySelectorAll('.tw-day-check:checked').forEach(cb => days.push(parseInt(cb.value, 10))); 
        
        if (start && end && days.length > 0) {
            timeWindows.push({ start: start, end: end, days: days }); 
        }
    });
    
    if (timeWindows.length === 0) { 
        alert("Please complete at least one time window!"); 
        return; 
    }
    
    const id = document.getElementById('ref-id').value || 'r_' + Date.now();
    
    if (document.getElementById('ref-id').value) { 
        const ref = referenceLayers.find(x => x.id === id); 
        ref.title = title; 
        ref.timeWindows = timeWindows; 
        ref.color = color; 
    } else { 
        referenceLayers.push({ id: id, title: title, timeWindows: timeWindows, color: color, opacity: '0.8' }); 
        refToggles[id] = true; 
    }
    
    saveData(); 
    closeModals(); 
    renderWeeklyPlanner();
});

function deleteReference(id) { 
    const ref = referenceLayers.find(r => r.id === id); 
    if (!ref) return; 
    
    deleteTargetType = 'reference'; 
    deleteTargetId = id; 
    document.getElementById('delete-target-name').innerText = `Ghost Layer "${ref.title}"`; 
    document.getElementById('btn-del-single').style.display = 'none'; 
    document.getElementById('btn-del-future').style.display = 'none'; 
    
    closeModals(); 
    document.getElementById('deleteModal').style.display = 'flex'; 
}

function toggleReference(id, checked) { 
    refToggles[id] = checked; 
    saveData(); 
    renderWeeklyPlanner(); 
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

function openCreationModal() { 
    document.getElementById('habitForm').reset(); 
    document.getElementById('h-id').value = ""; 
    document.getElementById('h-startdate').value = selectedDateStr; 
    document.getElementById('h-color').value = '#ffffff'; 
    updateCustomColor(document.getElementById('h-color'), 'h-color'); 
    
    document.querySelector('input[name="h-type"][value="timed"]').checked = true; 
    toggleHabitType(); 
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

function closeModals() { 
    document.querySelectorAll('.modal-overlay').forEach(m => {
        m.style.display = 'none';
    }); 
}

function toggleDays() { 
    const freq = document.getElementById('h-frequency').value; 
    document.getElementById('h-days-container').style.display = (freq === 'specific') ? 'flex' : 'none'; 
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
    
    let instances = 1; 
    let timerMins = 25; 
    let frequency = 'specific'; 
    let daysOfWeek = []; 
    let timeWindows = [];
    
    if (type === 'timed') {
        document.querySelectorAll('.habit-time-window-row').forEach(row => { 
            const start = row.querySelector('.h-start').value; 
            const end = row.querySelector('.h-end').value; 
            let days = []; 
            
            row.querySelectorAll('.tw-day-check:checked').forEach(cb => { 
                days.push(parseInt(cb.value, 10)); 
                if (!daysOfWeek.includes(parseInt(cb.value, 10))) {
                    daysOfWeek.push(parseInt(cb.value, 10));
                }
            }); 
            
            if (start && end && days.length > 0) {
                timeWindows.push({ start: start, end: end, days: days }); 
            }
        });
        
        if (timeWindows.length === 0) { 
            alert("Please complete at least one time window with selected days!"); 
            return; 
        }
    } else {
        instances = parseInt(document.getElementById('h-instances').value, 10) || 1; 
        timerMins = parseInt(document.getElementById('h-timer').value, 10) || 25; 
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
        t.category = category; 
        t.title = title; 
        t.instances = instances; 
        t.timerMinutes = timerMins; 
        t.frequency = frequency; 
        t.daysOfWeek = daysOfWeek; 
        t.startDate = startDate; 
        t.endDate = endDate; 
        t.color = color; 
        t.timeWindows = timeWindows; 
        t.type = type; 
    } else {
        templates.push({ 
            id: 't_' + Date.now(), 
            category: category, 
            title: title, 
            instances: instances, 
            timerMinutes: timerMins, 
            frequency: frequency, 
            daysOfWeek: daysOfWeek, 
            startDate: startDate, 
            endDate: endDate, 
            color: color, 
            timeWindows: timeWindows, 
            type: type, 
            exceptions: [] 
        });
    }
    
    saveData(); 
    closeModals(); 
    renderTasks(); 
    renderTracker(); 
    renderCalendar(); 
    renderWeeklyPlanner(); 
    renderAvailableTasksForFocus();
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
    renderCalendar(); 
    renderWeeklyPlanner(); 
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
    renderCalendar();
    if (typeof renderMeds === 'function') renderMeds();
});

const btnClose = document.getElementById('btn-close-app'); 
if (btnClose) {
    btnClose.addEventListener('click', () => { 
        if (window.__TAURI__) {
            window.__TAURI__.window.getCurrentWindow().close(); 
        } else {
            window.close();
        }
    });
}

function addHabitTimeWindow(start = '', end = '', days = []) {
    const container = document.getElementById('h-time-windows-container'); 
    const div = document.createElement('div'); 
    div.className = 'habit-time-window-row'; 
    div.style.border = '1px solid #333'; 
    div.style.padding = '10px'; 
    div.style.marginBottom = '10px'; 
    div.style.background = 'rgba(255,255,255,0.02)';
    
    const dayLabels = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']; 
    const dayVals = [1, 2, 3, 4, 5, 6, 0]; 
    let checksHtml = '';
    
    for (let i = 0; i < 7; i++) {
        const checked = days.includes(dayVals[i]) ? 'checked' : '';
        checksHtml += `
            <label class="day-check">
                <input type="checkbox" value="${dayVals[i]}" class="tw-day-check" ${checked}> ${dayLabels[i]}
            </label>
        `;
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
        <div class="days-checkboxes" style="display: flex; gap: 10px;">
            ${checksHtml}
        </div>
    `;
    
    container.appendChild(div);
}

function openTrackerModal() { 
    closeModals(); 
    document.getElementById('trackerModal').style.display = 'flex'; 
}

// ============================================================================
// FOCUS HOURS LEDGER & EVENING BUILDER (PLAN TOMORROW)
// ============================================================================

function openTrackerModal() { 
    closeModals(); 
    renderTracker();
    renderFocusLedger();
    document.getElementById('trackerModal').style.display = 'flex'; 
}

function deleteFocusLogEntry(id) {
    focusLogs = focusLogs.filter(x => x.id !== id);
    saveData();
    renderFocusLedger();
}

function renderFocusLedger() {
    const container = document.getElementById('focus-ledger-container');
    const summaryEl = document.getElementById('focus-ledger-summary');
    if (!container || !summaryEl) return;

    container.innerHTML = '';
    const weekStartStr = formatDate(getWeekStart(todayStr));

    let totalMinsAll = 0;
    let totalMinsWeek = 0;
    let totalMinsToday = 0;
    const byCat = {};

    focusLogs.forEach(item => {
        const m = parseInt(item.minutes, 10) || 0;
        const cat = item.category || 'General';
        totalMinsAll += m;
        if (item.date >= weekStartStr && item.date <= todayStr) totalMinsWeek += m;
        if (item.date === todayStr) totalMinsToday += m;

        if (!byCat[cat]) byCat[cat] = { total: 0, week: 0, today: 0 };
        byCat[cat].total += m;
        if (item.date >= weekStartStr && item.date <= todayStr) byCat[cat].week += m;
        if (item.date === todayStr) byCat[cat].today += m;
    });

    const fmtH = (mins) => (mins / 60).toFixed(1) + 'H';
    summaryEl.textContent = `TODAY: ${fmtH(totalMinsToday)} | WEEK: ${fmtH(totalMinsWeek)} | ALL-TIME: ${fmtH(totalMinsAll)}`;

    if (focusLogs.length === 0) {
        container.innerHTML = '<div class="empty-state">[ NO FOCUS SESSIONS LOGGED YET — COMPLETE A POMODORO OR TYPE "log 45 Studio" IN TERMINAL ]</div>';
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

    // Ultime 5 sessioni registrate
    const recentHeader = document.createElement('div');
    recentHeader.className = 'sub-column-header';
    recentHeader.textContent = 'Recent Focus Sessions';
    container.appendChild(recentHeader);

    const recentList = document.createElement('div');
    recentList.style.cssText = 'display: flex; flex-direction: column; gap: 4px; max-height: 130px; overflow-y: auto;';

    [...focusLogs].reverse().slice(0, 6).forEach(item => {
        const r = document.createElement('div');
        r.style.cssText = 'display: flex; justify-content: space-between; align-items: center; font-size: var(--font-xs); padding: 4px 8px; border-bottom: 1px dotted #222;';
        r.innerHTML = `
            <div>
                <span style="color: var(--text-dim); margin-right: 8px;">${escapeHtml(item.date)}</span>
                <strong style="color: var(--text-main);">[${escapeHtml(item.category)}]</strong> 
                <span style="color: var(--text-muted);">${escapeHtml(item.title)}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 10px;">
                <strong style="color: var(--text-main);">${item.minutes} min</strong>
            </div>
        `;
        const delBtn = document.createElement('button');
        delBtn.className = 'icon-btn delete';
        delBtn.textContent = '[X]';
        delBtn.onclick = () => deleteFocusLogEntry(item.id);
        r.lastElementChild.appendChild(delBtn);
        recentList.appendChild(r);
    });
    container.appendChild(recentList);
}

// --- BANNER PRIORITA' DEL GIORNO ---
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
    banner.style.justifyContent = 'space-between';
    banner.style.alignItems = 'center';
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

// --- EVENING BUILDER: PLAN TOMORROW ---
function openPlanTomorrowModal() {
    closeModals();
    renderPlanTomorrowModal();
    document.getElementById('planTomorrowModal').style.display = 'flex';
}

function saveTomorrowPriority(val) {
    const clean = val.trim();
    if (clean) {
        dailyPriorities[tomorrowStr] = clean;
    } else {
        delete dailyPriorities[tomorrowStr];
    }
    saveData();
    if (selectedDateStr === tomorrowStr) renderPriorityBanner();
}

function rolloverTaskToTomorrow(templateId) {
    const t = templates.find(x => x.id === templateId);
    if (!t) return;
    const tmwDayIdx = new Date(tomorrowStr).getDay();

    // Se era una task singola creata solo per oggi, la sposta direttamente a domani
    if (t.startDate === todayStr && t.endDate === todayStr) {
        t.startDate = tomorrowStr;
        t.endDate = tomorrowStr;
        t.daysOfWeek = [tmwDayIdx];
        if (t.timeWindows && t.timeWindows.length > 0) {
            t.timeWindows.forEach(tw => { tw.days = [tmwDayIdx]; });
        }
    } else {
        // Se è un'abitudine ricorrente non finita oggi, crea una sessione di recupero per domani
        const catName = t.category || 'Rollover';
        if (!categoryOrder.includes(catName)) categoryOrder.push(catName);
        templates.push({
            id: 't_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
            category: catName,
            title: `[Rollover] ${t.title}`,
            instances: 1,
            timerMinutes: t.timerMinutes || 25,
            frequency: 'specific',
            daysOfWeek: [tmwDayIdx],
            startDate: tomorrowStr,
            endDate: tomorrowStr,
            color: t.color || '#ffffff',
            type: 'untimed',
            timeWindows: []
        });
    }

    saveData();
    renderTasks();
    renderWeeklyPlanner();
    renderPlanTomorrowModal();
    if (typeof showToast === 'function') showToast(`[PLAN] Rolled over "${t.title}" to tomorrow`);
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
    renderWeeklyPlanner();
    renderPlanTomorrowModal();
}

function addQuickTomorrowTask() {
    const titleEl = document.getElementById('plan-tmw-new-title');
    const startEl = document.getElementById('plan-tmw-new-start');
    const endEl = document.getElementById('plan-tmw-new-end');
    if (!titleEl) return;

    const title = titleEl.value.trim();
    if (!title) return;

    const startVal = startEl ? startEl.value : '';
    const endVal = endEl ? endEl.value : '';
    const isTimed = !!(startVal && endVal);
    const tmwDayIdx = new Date(tomorrowStr).getDay();

    const catName = 'Planned';
    if (!categoryOrder.includes(catName)) categoryOrder.push(catName);

    templates.push({
        id: 't_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
        category: catName,
        title: title,
        instances: 1,
        timerMinutes: 25,
        frequency: 'specific',
        daysOfWeek: [tmwDayIdx],
        startDate: tomorrowStr,
        endDate: tomorrowStr,
        color: '#ffffff',
        type: isTimed ? 'timed' : 'untimed',
        timeWindows: isTimed ? [{ start: startVal, end: endVal, days: [tmwDayIdx] }] : []
    });

    titleEl.value = '';
    if (startEl) startEl.value = '';
    if (endEl) endEl.value = '';

    saveData();
    renderTasks();
    renderWeeklyPlanner();
    renderPlanTomorrowModal();
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
    saveData();
    renderTasks();
    renderWeeklyPlanner();
    renderPlanTomorrowModal();
}

function renderPlanTomorrowModal() {
    const dateLbl = document.getElementById('plan-tmw-date-label');
    if (dateLbl) dateLbl.textContent = `TARGET // ${tomorrowStr}`;

    const prioInput = document.getElementById('plan-tmw-priority');
    if (prioInput) prioInput.value = dailyPriorities[tomorrowStr] || '';

    // 1. Unfinished Today
    const rolloverCont = document.getElementById('plan-tmw-rollover');
    if (rolloverCont) {
        rolloverCont.innerHTML = '';
        const unfinished = templates.filter(t => {
            if (t.type === 'medicine') return false;
            if (!isTaskActiveOnDate(t, todayStr)) return false;
            const curLog = (logs[todayStr] && logs[todayStr][t.id]) || Array(t.instances || 1).fill(false);
            return curLog.some(x => !x);
        });

        if (unfinished.length === 0) {
            rolloverCont.innerHTML = '<div class="empty-state">[ ALL TODAY TASKS COMPLETED ]</div>';
        } else {
            unfinished.forEach(t => {
                const isSingleToday = (t.startDate === todayStr && t.endDate === todayStr);
                const row = document.createElement('div');
                row.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 6px 8px; background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); font-size: var(--font-xs);';
                row.innerHTML = `<div><strong style="color: var(--text-dim);">[${escapeHtml(t.category)}]</strong> ${escapeHtml(t.title)}</div>`;
                const btn = document.createElement('button');
                btn.className = 'btn btn-sm';
                btn.textContent = isSingleToday ? '[MOVE -> TMW]' : '[+1 TMW]';
                btn.onclick = () => rolloverTaskToTomorrow(t.id);
                row.appendChild(btn);
                rolloverCont.appendChild(row);
            });
        }
    }

    // 2. General To-Do Inbox
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
                btn.textContent = '[-> TMW]';
                btn.onclick = () => assignInboxItemToTomorrow(item.id);
                row.appendChild(btn);
                inboxCont.appendChild(row);
            });
        }
    }

    // 3. Constraints & Lineup per Domani
    const constraintsCont = document.getElementById('plan-tmw-constraints');
    const lineupCont = document.getElementById('plan-tmw-lineup');
    const tmwDayIdx = new Date(tomorrowStr).getDay();

    const tmwTasks = templates.filter(t => isTaskActiveOnDate(t, tomorrowStr));
    const tmwEvents = specificEvents.filter(e => e.date === tomorrowStr);

    let committedMins = 0;
    tmwTasks.forEach(t => {
        if (t.timeWindows && t.timeWindows.length > 0) {
            t.timeWindows.forEach(tw => {
                if (tw.days && tw.days.includes(tmwDayIdx) && tw.start && tw.end) {
                    const [sh, sm] = tw.start.split(':').map(Number);
                    const [eh, em] = tw.end.split(':').map(Number);
                    committedMins += Math.max(0, (eh * 60 + em) - (sh * 60 + sm));
                }
            });
        } else {
            committedMins += (t.instances || 1) * (t.timerMinutes || 25);
        }
    });

    if (constraintsCont) {
        constraintsCont.innerHTML = `
            <div>:: ESTIMATED WORKLOAD: <strong style="color: var(--text-main);">${(committedMins / 60).toFixed(1)} HOURS</strong> (${tmwTasks.length} tasks)</div>
            <div>:: CALENDAR EVENTS: <strong style="color: var(--text-main);">${tmwEvents.length}</strong></div>
            <div>:: ACTIVE WORKOUT SPLIT: <strong style="color: var(--text-main);">DAY ${nextWorkoutDay}</strong></div>
        `;
    }

    if (lineupCont) {
        lineupCont.innerHTML = '';
        if (tmwTasks.length === 0 && tmwEvents.length === 0) {
            lineupCont.innerHTML = '<div class="empty-state">[ NO TASKS SCHEDULED FOR TOMORROW YET ]</div>';
        } else {
            tmwEvents.forEach(ev => {
                const row = document.createElement('div');
                row.style.cssText = `display: flex; justify-content: space-between; align-items: center; padding: 6px 8px; border: 1px solid var(--border-color); border-left: 3px solid ${ev.color}; font-size: var(--font-xs);`;
                const timeBadge = (ev.start && ev.end) ? `[${ev.start}-${ev.end}] ` : '[EVENT] ';
                row.innerHTML = `<strong style="color: ${ev.color};">${escapeHtml(timeBadge + ev.title)}</strong>`;
                lineupCont.appendChild(row);
            });

            tmwTasks.forEach(t => {
                const row = document.createElement('div');
                row.style.cssText = `display: flex; justify-content: space-between; align-items: center; padding: 6px 8px; background: rgba(255,255,255,0.015); border: 1px solid var(--border-color); border-left: 3px solid ${t.color || '#fff'}; font-size: var(--font-xs);`;
                let timeStr = '[FLEX]';
                if (t.timeWindows && t.timeWindows.length > 0) {
                    const tw = t.timeWindows.find(w => w.days && w.days.includes(tmwDayIdx));
                    if (tw) timeStr = `[${tw.start}-${tw.end}]`;
                }
                row.innerHTML = `
                    <div>
                        <span style="color: var(--text-dim); margin-right: 6px;">${timeStr}</span>
                        <strong style="color: var(--text-main);">${escapeHtml(t.title)}</strong>
                        <span style="color: var(--text-dim); margin-left: 6px;">(${escapeHtml(t.category)})</span>
                    </div>
                `;
                const skipBtn = document.createElement('button');
                skipBtn.className = 'icon-btn delete';
                skipBtn.title = 'Remove / Skip for tomorrow';
                skipBtn.textContent = '[SKIP]';
                skipBtn.onclick = () => skipTaskOnTomorrow(t.id);
                row.appendChild(skipBtn);
                lineupCont.appendChild(row);
            });
        }
    }
}