// --- 2. ACTIONS & CRUD (Create, Read, Update, Delete) ---

function toggleTask(templateId, instanceIndex) {
    if (!logs[selectedDateStr]) {
        logs[selectedDateStr] = {};
    }
    
    if (!logs[selectedDateStr][templateId]) {
        logs[selectedDateStr][templateId] = Array(templates.find(x => x.id === templateId).instances).fill(false);
    }
    
    logs[selectedDateStr][templateId][instanceIndex] = !logs[selectedDateStr][templateId][instanceIndex];
    
    saveData(); 
    renderTasks(); 
    renderTracker();
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
                cb.checked = t.daysOfWeek && t.daysOfWeek.includes(parseInt(cb.value));
            });
        }
    }
    
    document.getElementById('modal-title').innerText = "Edit Habit"; 
    closeModals(); 
    document.getElementById('formModal').style.display = 'flex';
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
    document.getElementById('delete-target-name').innerText = `the "${catName}" calendar`;
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
        if (mode === 'single') { 
            if (!t.exceptions) t.exceptions = []; 
            t.exceptions.push(selectedDateStr); 
        } else if (mode === 'future') {
            t.endDate = yesterdayStr;
        } else if (mode === 'all') {
            templates = templates.filter(x => x.id !== deleteTargetId);
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
}

function handleNoteKeyDown(event) { 
    if (event.key === 'Enter' && !event.shiftKey) { 
        event.preventDefault(); 
        saveNote(); 
    } 
}

async function saveNote() {
    const category = document.getElementById('note-category').value; 
    const textEl = document.getElementById('note-text'); 
    const text = textEl.value.trim(); 
    
    if (!text) return;
    
    if (window.__TAURI__) { 
        try { 
            await window.__TAURI__.core.invoke('save_note', { category: category, text: `${text}\n\n` }); 
            textEl.value = ''; 
            textEl.placeholder = "✓ Idea saved!"; 
            setTimeout(() => { textEl.placeholder = "Write your idea and press Enter..."; }, 1500); 
        } catch (e) { 
            alert("Error saving note: " + e); 
        } 
    } else { 
        textEl.value = ''; 
        textEl.placeholder = "✓ Idea saved (Mock)!"; 
        setTimeout(() => { textEl.placeholder = "Write your idea and press Enter..."; }, 1500); 
    }
}

function openJournal(dateStr) {
    document.getElementById('journal-title').innerText = `Journal - ${dateStr}`;
    document.getElementById('journal-date-hidden').value = dateStr;
    
    let journals = JSON.parse(localStorage.getItem('tracker_journal')) || {};
    document.getElementById('journal-text').value = journals[dateStr] || '';
    
    closeModals(); 
    document.getElementById('journalModal').style.display = 'flex';
}

function saveJournal() {
    const dateStr = document.getElementById('journal-date-hidden').value; 
    const text = document.getElementById('journal-text').value;
    let journals = JSON.parse(localStorage.getItem('tracker_journal')) || {}; 
    
    journals[dateStr] = text; 
    localStorage.setItem('tracker_journal', JSON.stringify(journals)); 
    
    closeModals();
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
    
    for(let i=0; i<7; i++) {
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
            <button type="button" class="icon-btn delete" onclick="this.parentElement.parentElement.remove()" style="margin-top: 20px;">×</button>
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
        
        row.querySelectorAll('.tw-day-check:checked').forEach(cb => days.push(parseInt(cb.value))); 
        
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

function openFormModal() { 
    document.getElementById('habitForm').reset(); 
    document.getElementById('h-id').value = ""; 
    document.getElementById('h-startdate').value = selectedDateStr; 
    document.getElementById('h-color').value = '#ffffff'; 
    updateCustomColor(document.getElementById('h-color'), 'h-color'); 
    
    document.querySelector('input[name="h-type"][value="timed"]').checked = true; 
    toggleHabitType(); 
    
    document.getElementById('h-time-windows-container').innerHTML = ''; 
    addHabitTimeWindow(); 
    
    document.getElementById('modal-title').innerText = "Create New Habit"; 
    toggleDays(); 
    closeModals(); 
    document.getElementById('formModal').style.display = 'flex'; 
}

function openEventModal() { 
    document.getElementById('eventForm').reset(); 
    document.getElementById('e-date').value = selectedDateStr; 
    document.getElementById('e-color').value = '#b84b4b'; 
    updateCustomColor(document.getElementById('e-color'), 'e-color'); 
    closeModals(); 
    document.getElementById('eventModal').style.display = 'flex'; 
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
    let timerMins = 0; 
    let frequency = 'specific'; 
    let daysOfWeek = []; 
    let timeWindows = [];
    
    if (type === 'timed') {
        document.querySelectorAll('.habit-time-window-row').forEach(row => { 
            const start = row.querySelector('.h-start').value; 
            const end = row.querySelector('.h-end').value; 
            let days = []; 
            
            row.querySelectorAll('.tw-day-check:checked').forEach(cb => { 
                days.push(parseInt(cb.value)); 
                if (!daysOfWeek.includes(parseInt(cb.value))) {
                    daysOfWeek.push(parseInt(cb.value));
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
                daysOfWeek.push(parseInt(cb.value));
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
    
    specificEvents.push({ 
        id: 'e_' + Date.now(), 
        title: document.getElementById('e-title').value.trim(), 
        date: document.getElementById('e-date').value, 
        color: document.getElementById('e-color').value 
    }); 
    
    saveData(); 
    closeModals(); 
    renderTasks(); 
    renderCalendar(); 
    renderWeeklyPlanner(); 
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

const btnMin = document.getElementById('btn-minimize-app'); 
if (btnMin) {
    btnMin.addEventListener('click', () => { 
        if (window.__TAURI__) {
            window.__TAURI__.window.getCurrentWindow().minimize(); 
        }
    });
}

// --- FUNZIONE MANCANTE: Crea la finestra degli orari per le Habit ---

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
            <button type="button" class="icon-btn delete" onclick="this.parentElement.parentElement.remove()" style="margin-top: 20px;">×</button>
        </div>
        <div class="days-checkboxes" style="display: flex; gap: 10px;">
            ${checksHtml}
        </div>
    `;
    
    container.appendChild(div);
}