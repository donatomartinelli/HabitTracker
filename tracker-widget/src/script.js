// --- 1. DATA MANAGEMENT ---
function initData() {
    if (!localStorage.getItem('tracker_templates')) {
        localStorage.setItem('tracker_templates', JSON.stringify([]));
    }
    if (!localStorage.getItem('tracker_logs')) {
        localStorage.setItem('tracker_logs', JSON.stringify({}));
    }
    if (!localStorage.getItem('tracker_events')) {
        localStorage.setItem('tracker_events', JSON.stringify([]));
    }
    if (!localStorage.getItem('tracker_note_cats')) {
        localStorage.setItem('tracker_note_cats', JSON.stringify(["General", "Productivity", "Math", "Ideas"]));
    }
    if (!localStorage.getItem('tracker_category_order')) {
        localStorage.setItem('tracker_category_order', JSON.stringify([]));
    }
    if (!localStorage.getItem('tracker_references')) {
        localStorage.setItem('tracker_references', JSON.stringify([]));
    }
    if (!localStorage.getItem('ref_toggles')) {
        localStorage.setItem('ref_toggles', JSON.stringify({}));
    }
    if (!localStorage.getItem('tracker_ephemeral')) {
        localStorage.setItem('tracker_ephemeral', JSON.stringify({}));
    }
}

initData();

let templates = JSON.parse(localStorage.getItem('tracker_templates')) || [];
let logs = JSON.parse(localStorage.getItem('tracker_logs')) || {};
let specificEvents = JSON.parse(localStorage.getItem('tracker_events')) || [];
let noteCategories = JSON.parse(localStorage.getItem('tracker_note_cats')) || [];
let categoryOrder = JSON.parse(localStorage.getItem('tracker_category_order')) || [];
let referenceLayers = JSON.parse(localStorage.getItem('tracker_references')) || [];
let refToggles = JSON.parse(localStorage.getItem('ref_toggles')) || {};
let ephemeralData = JSON.parse(localStorage.getItem('tracker_ephemeral')) || {};

// Utility function to sync categoryOrder with reality
function syncCategoryOrder() {
    const existingCats = new Set(templates.map(t => t.category));
    
    existingCats.forEach(c => { 
        if (!categoryOrder.includes(c)) {
            categoryOrder.push(c); 
        }
    });
    
    categoryOrder = categoryOrder.filter(c => existingCats.has(c));
    localStorage.setItem('tracker_category_order', JSON.stringify(categoryOrder));
}

syncCategoryOrder();

function saveData() {
    localStorage.setItem('tracker_templates', JSON.stringify(templates));
    localStorage.setItem('tracker_logs', JSON.stringify(logs));
    localStorage.setItem('tracker_events', JSON.stringify(specificEvents));
    localStorage.setItem('tracker_category_order', JSON.stringify(categoryOrder));
    localStorage.setItem('tracker_references', JSON.stringify(referenceLayers));
    localStorage.setItem('ref_toggles', JSON.stringify(refToggles));
    localStorage.setItem('tracker_ephemeral', JSON.stringify(ephemeralData));
}

function renderNoteCategories() {
    const select = document.getElementById('note-category');
    const focusSelect = document.getElementById('focus-note-category');
    if (select) select.innerHTML = '';
    if (focusSelect) focusSelect.innerHTML = '';
    
    noteCategories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat; opt.innerText = cat;
        if (select) select.appendChild(opt);
        
        const optFocus = document.createElement('option');
        optFocus.value = cat; optFocus.innerText = cat;
        if (focusSelect) focusSelect.appendChild(optFocus);
    });
}

// --- GESTIONE CATEGORIE NOTE TRAMITE MODALE ---

function openManageNotesModal() {
    renderNotesManager();
    closeModals();
    document.getElementById('manageNotesModal').style.display = 'flex';
}

function renderNotesManager() {
    const container = document.getElementById('notes-manager-list');
    container.innerHTML = '';
    
    noteCategories.forEach(cat => {
        container.innerHTML += `
            <div class="manager-task">
                <span>${cat}</span>
                <div class="action-btns" style="display:flex;">
                    <button class="icon-btn delete" onclick="removeNoteCategory('${cat}')">×</button>
                </div>
            </div>
        `;
    });
}

function quickAddNoteCategory(event) {
    if (event.key === 'Enter') {
        const newCat = event.target.value.trim();
        if (newCat && !noteCategories.includes(newCat)) {
            noteCategories.push(newCat);
            saveData();
            event.target.value = ''; 
            renderNotesManager(); 
        }
    }
}

function removeNoteCategory(cat) {
    noteCategories = noteCategories.filter(c => c !== cat);
    saveData();
    renderNotesManager();
}

function formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function getNow() {
    return new Date();
}

function getTodayStr() {
    return formatDate(getNow());
}

let selectedDateStr = getTodayStr();
let currentCalendarDate = new Date(getNow().getFullYear(), getNow().getMonth(), 1);

function getTomorrowStr() {
    const t = getNow();
    t.setDate(t.getDate() + 1);
    return formatDate(t);
}

function changeMonth(offset) {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + offset);
    renderCalendar();
}

function isTaskActiveOnDate(template, dateStr) {
    if (template.exceptions && template.exceptions.includes(dateStr)) {
        return false;
    }
    if (dateStr < template.startDate) {
        return false;
    }
    if (template.endDate && dateStr > template.endDate) {
        return false;
    }
    
    const dateObj = new Date(dateStr);
    const dayOfWeek = dateObj.getDay();
    
    if (template.type === 'timed' || (template.timeWindows && template.timeWindows.length > 0)) {
        let inTimeWindowDays = false;
        if (template.timeWindows && template.timeWindows.length > 0) {
            for (let tw of template.timeWindows) {
                if (tw.days && tw.days.includes(dayOfWeek)) {
                    inTimeWindowDays = true;
                    break;
                }
            }
        }
        return inTimeWindowDays;
    }
    
    if (template.frequency === 'all') {
        return true;
    }
    if (template.frequency === 'weekdays' && dayOfWeek >= 1 && dayOfWeek <= 5) {
        return true;
    }
    if (template.frequency === 'weekends' && (dayOfWeek === 0 || dayOfWeek === 6)) {
        return true;
    }
    if (template.frequency === 'specific' && template.daysOfWeek && template.daysOfWeek.includes(dayOfWeek)) {
        return true;
    }
    
    return false;
}

function getStatsForDate(dateStr) {
    let total = 0;
    let completed = 0;
    let activeCategories = new Set();
    
    templates.forEach(t => {
        if (isTaskActiveOnDate(t, dateStr)) {
            total += t.instances;
            activeCategories.add(t.category);
            if (logs[dateStr] && logs[dateStr][t.id]) {
                completed += logs[dateStr][t.id].filter(Boolean).length;
            }
        }
    });
    
    return { 
        total: total, 
        completed: completed, 
        categories: Array.from(activeCategories) 
    };
}

// --- 2. ACTIONS (CRUD) ---

function toggleTask(templateId, instanceIndex) {
    if (!logs[selectedDateStr]) {
        logs[selectedDateStr] = {};
    }
    if (!logs[selectedDateStr][templateId]) {
        const t = templates.find(x => x.id === templateId);
        logs[selectedDateStr][templateId] = Array(t.instances).fill(false);
    }
    
    logs[selectedDateStr][templateId][instanceIndex] = !logs[selectedDateStr][templateId][instanceIndex];
    
    saveData();
    renderTasks();
    renderTracker();
}

function quickAddTask(event, categoryName) {
    if (event.key === 'Enter') {
        const title = event.target.value.trim();
        if (!title) {
            return;
        }

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
        if (!catName) {
            return;
        }
        
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
            t.timeWindows.forEach(tw => {
                addHabitTimeWindow(tw.start, tw.end, tw.days);
            });
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
            if (t.category === oldName) {
                t.category = newName; 
            }
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
            if (!t.exceptions) {
                t.exceptions = [];
            }
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
                    if (!t.exceptions) {
                        t.exceptions = [];
                    }
                    t.exceptions.push(selectedDateStr);
                }
            });
        } else if (mode === 'future') {
            templates.forEach(t => {
                if (t.category === deleteTargetId) {
                    t.endDate = yesterdayStr;
                }
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

// --- 3. POMODORO BUILDER & LOGIC ---
let pomodoroInterval;
let focusPlaylist = [];
let isPomodoroPaused = false;
let currentPlaylistIndex = 0;
let timeRemaining = 0;
let totalPhaseTime = 0;

function renderAvailableTasksForFocus() {
    const container = document.getElementById('focus-available-tasks');
    if (!container) return;
    container.innerHTML = '';
    
    let hasTasks = false;
    const cats = {};
    
    templates.forEach(t => {
        if (isTaskActiveOnDate(t, selectedDateStr)) {
            const currentLog = (logs[selectedDateStr] && logs[selectedDateStr][t.id]) || Array(t.instances).fill(false);
            const maxAvailable = currentLog.filter(x => !x).length;
            
            const inPlaylist = focusPlaylist.filter(p => p.type === 'task' && p.id === t.id).length;
            const remaining = maxAvailable - inPlaylist;
            
            if (maxAvailable > 0) {
                if (!cats[t.category]) cats[t.category] = [];
                cats[t.category].push({ task: t, remaining: remaining });
                hasTasks = true;
            }
        }
    });
    
    if (!hasTasks) {
        container.innerHTML = '<span style="color: var(--text-dim); font-size: 0.8rem;">No uncompleted tasks for today.</span>';
        return;
    }

    for (let cat in cats) {
        let catHasAvailable = cats[cat].some(d => d.remaining > 0);
        if (catHasAvailable) {
            // Creo il titolo della categoria come elemento separato (fix per il bug di innerHTML)
            const catTitle = document.createElement('div');
            catTitle.style.cssText = "width: 100%; font-size: 0.75rem; color: #888; font-weight: bold; margin-top: 10px; margin-bottom: 5px; text-transform: uppercase; border-bottom: 1px dotted #333;";
            catTitle.innerText = cat;
            container.appendChild(catTitle);
            
            cats[cat].forEach(data => {
                if (data.remaining > 0) {
                    const chip = document.createElement('div');
                    chip.className = 'playlist-task-chip';
                    chip.innerHTML = `+ ${data.task.title} <span style="opacity:0.6; margin-left: 8px;">${data.remaining} left</span>`;
                    chip.onclick = () => addTaskToPlaylist(data.task);
                    container.appendChild(chip);
                }
            });
        }
    }
}

function addTaskToPlaylist(task) {
    focusPlaylist.push({ type: 'task', id: task.id, title: task.title, duration: task.timerMinutes || 25, color: task.color || '#ffffff' });
    focusPlaylist.push({ type: 'break', duration: 5 });
    renderFocusPlaylist();
    renderAvailableTasksForFocus(); // Aggiorna i contatori togliendo 1
}

function removePlaylistIndex(index) {
    focusPlaylist.splice(index, 1);
    renderFocusPlaylist();
    renderAvailableTasksForFocus(); // Fa riapparire il bottone
}

function updatePlaylistDuration(index, value) {
    const val = parseInt(value);
    if (!isNaN(val) && val > 0) focusPlaylist[index].duration = val;
}

function renderFocusPlaylist() {
    const container = document.getElementById('focus-playlist');
    container.innerHTML = '';
    
    if (focusPlaylist.length === 0) {
        container.innerHTML = '<div style="color: #444; font-size: 0.8rem; text-align: center; margin-top: 30px;">Select a task above to add it here</div>';
        document.getElementById('btn-start-playlist').disabled = true;
        return;
    }
    
    document.getElementById('btn-start-playlist').disabled = false;
    
    focusPlaylist.forEach((item, index) => {
        if (item.type === 'task') {
            container.innerHTML += `
                <div class="playlist-item" style="border-left: 3px solid ${item.color};">
                    <div><strong>${item.title}</strong><div style="font-size: 0.7rem; color: var(--text-dim);">Task</div></div>
                    <div style="display: flex; gap: 10px; align-items: center;">
                        <input type="number" class="form-control no-spinners" style="width: 45px; padding: 4px; text-align: center;" value="${item.duration}" onchange="updatePlaylistDuration(${index}, this.value)"> <span style="font-size:0.7rem; color:#666;">min</span>
                        <button type="button" class="icon-btn delete" onclick="removePlaylistIndex(${index})">×</button>
                    </div>
                </div>`;
        } else if (item.type === 'break') {
            container.innerHTML += `
                <div class="playlist-break">
                    <span style="font-size: 0.7rem; color: var(--text-dim);">PAUSE</span>
                    <input type="number" class="form-control no-spinners" style="width: 45px; padding: 2px; text-align: center; border-color: #333;" value="${item.duration}" onchange="updatePlaylistDuration(${index}, this.value)">
                    <span style="font-size: 0.7rem; color: var(--text-dim);">MIN</span>
                    <button type="button" class="icon-btn delete" style="margin-left: 10px;" onclick="removePlaylistIndex(${index})">×</button>
                </div>`;
        }
    });
}

function openTimerModal() {
    focusPlaylist = [];
    renderAvailableTasksForFocus();
    renderFocusPlaylist();
    closeModals();
    document.getElementById('timerSetupModal').style.display = 'flex';
}

document.getElementById('timerSetupForm').addEventListener('submit', function(e) {
    e.preventDefault();
    if(focusPlaylist.length === 0) return;
    closeModals();
    
    if(focusPlaylist[focusPlaylist.length-1].type === 'break') focusPlaylist.pop();
    
    currentPlaylistIndex = 0;
    startCurrentPlaylistPhase();
});

function startCurrentPlaylistPhase() {
    if (currentPlaylistIndex >= focusPlaylist.length) {
        resetWidgetMode(); // Ripristina layout
        document.getElementById('pomodoroOverlay').style.display = 'none';
        handlePomodoroComplete();
        return;
    }
    isPomodoroPaused = false;
    document.getElementById('btn-pomodoro-pause').innerText = "Pause";
    
    const phase = focusPlaylist[currentPlaylistIndex];
    document.getElementById('pomodoroOverlay').style.display = 'flex';
    
    const titleEl = document.getElementById('pomodoro-task-title');
    const circle = document.getElementById('pomodoro-circle');
    
    if (phase.type === 'task') {
        titleEl.innerText = `Focus: ${phase.title}`;
        circle.setAttribute('stroke', phase.color);
    } else {
        titleEl.innerText = "Break Time";
        circle.setAttribute('stroke', '#666666');
    }

    totalPhaseTime = phase.duration * 60;
    timeRemaining = totalPhaseTime;
    
    runPomodoroTick();
    clearInterval(pomodoroInterval);
    pomodoroInterval = setInterval(runPomodoroTick, 1000);
}

function runPomodoroTick() {
    if (isPomodoroPaused) return;
    timeRemaining--;
    
    const m = Math.floor(Math.abs(timeRemaining) / 60).toString().padStart(2, '0');
    const s = (Math.abs(timeRemaining) % 60).toString().padStart(2, '0');
    document.getElementById('pomodoro-time-text').innerText = `${timeRemaining < 0 ? '-' : ''}${m}:${s}`;

    const overlay = document.getElementById('pomodoroOverlay');
    const isWidget = overlay.classList.contains('widget-mode');
    
    // Raggio e circonferenza cambiano in widget mode (60 vs 180)
    const radius = isWidget ? 60 : 180;
    const circumference = 2 * Math.PI * radius; 
    const circle = document.getElementById('pomodoro-circle');
    circle.style.strokeDasharray = `${circumference} ${circumference}`;
    
    const percent = Math.max(0, timeRemaining / totalPhaseTime);
    circle.style.strokeDashoffset = circumference - (percent * circumference);
    
    if (timeRemaining <= 0 && timeRemaining > -2) {
        clearInterval(pomodoroInterval);
        
        if (focusPlaylist[currentPlaylistIndex].type === 'task') {
            const t = templates.find(x => x.id === focusPlaylist[currentPlaylistIndex].id);
            if (t) {
                const currentLog = (logs[selectedDateStr] && logs[selectedDateStr][t.id]) || Array(t.instances).fill(false);
                const firstUncheckedIndex = currentLog.indexOf(false);
                if (firstUncheckedIndex !== -1) toggleTask(t.id, firstUncheckedIndex);
            }
        }
        currentPlaylistIndex++;
        startCurrentPlaylistPhase();
    }
}

function togglePomodoroPause() {
    isPomodoroPaused = !isPomodoroPaused;
    document.getElementById('btn-pomodoro-pause').innerText = isPomodoroPaused ? "Resume" : "Pause";
}

function stopPomodoro() {
    clearInterval(pomodoroInterval);
    resetWidgetMode(); // Ripristina layout
    document.getElementById('pomodoroOverlay').style.display = 'none';
    focusPlaylist = [];
}

// NOTE FOCUS E WIDGET DRAG
function handleFocusNoteKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        saveFocusNote();
    }
}
async function saveFocusNote() {
    const category = document.getElementById('focus-note-category').value;
    const textEl = document.getElementById('focus-note-text');
    const text = textEl.value.trim();
    if (!text) return;
    if (window.__TAURI__) {
        try {
            await window.__TAURI__.core.invoke('save_note', { category: category, text: `${text}\n\n` });
            textEl.value = ''; textEl.placeholder = "✓ Idea saved!";
            setTimeout(() => { textEl.placeholder = "Write your idea and press Enter..."; }, 1500);
        } catch(e) {}
    } else {
        textEl.value = ''; textEl.placeholder = "✓ Idea saved (Mock)!";
        setTimeout(() => { textEl.placeholder = "Write your idea and press Enter..."; }, 1500);
    }
}

let isDraggingWidget = false;
let widgetOffsetX, widgetOffsetY;

document.getElementById('widget-drag-handle').addEventListener('mousedown', (e) => {
    isDraggingWidget = true;
    const overlay = document.getElementById('pomodoroOverlay');
    widgetOffsetX = e.clientX - overlay.getBoundingClientRect().left;
    widgetOffsetY = e.clientY - overlay.getBoundingClientRect().top;
});
document.addEventListener('mousemove', (e) => {
    if (!isDraggingWidget) return;
    const overlay = document.getElementById('pomodoroOverlay');
    overlay.style.left = (e.clientX - widgetOffsetX) + 'px';
    overlay.style.top = (e.clientY - widgetOffsetY) + 'px';
    overlay.style.right = 'auto'; 
    overlay.style.bottom = 'auto'; 
});
document.addEventListener('mouseup', () => { isDraggingWidget = false; });

function toggleWidgetMode() {
    const overlay = document.getElementById('pomodoroOverlay');
    const btn = document.getElementById('btn-widget-mode');
    const isWidget = overlay.classList.toggle('widget-mode');
    
    if (isWidget) {
        btn.innerText = "⛶ Full";
        overlay.style.top = '20px'; overlay.style.right = '30px'; overlay.style.left = 'auto'; overlay.style.bottom = 'auto';
    } else {
        resetWidgetMode();
    }
    runPomodoroTick(); // Forza l'aggiornamento grafico del cerchio
}

function resetWidgetMode() {
    const overlay = document.getElementById('pomodoroOverlay');
    const btn = document.getElementById('btn-widget-mode');
    overlay.classList.remove('widget-mode');
    btn.innerText = "🗗 Mini Widget";
    overlay.style.top = '0'; overlay.style.left = '0'; overlay.style.right = '0'; overlay.style.bottom = '0';
}

// --- 4. RENDER ---

function renderManager() {
    const container = document.getElementById('manager-list');
    container.innerHTML = '';
    
    const cats = {};
    templates.forEach(t => {
        if (!cats[t.category]) {
            cats[t.category] = [];
        }
        cats[t.category].push(t);
    });

    syncCategoryOrder();

    categoryOrder.forEach(cat => {
        if (!cats[cat]) {
            return; 
        }
        
        let html = `
            <div class="manager-category">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div style="display:flex; align-items:center; gap: 10px;">
                        <div style="display:flex; flex-direction:column; gap:2px;">
                            <button class="icon-btn reorder" onclick="moveCategory('${cat}', -1)">▲</button>
                            <button class="icon-btn reorder" onclick="moveCategory('${cat}', 1)">▼</button>
                        </div>
                        <h3 style="margin:0; border:none; padding:0;">${cat}</h3>
                    </div>
                    <div class="action-btns" style="display:flex; margin-bottom:10px;">
                        <button class="icon-btn" onclick="openRenameModal('${cat}')">✎</button>
                        <button class="icon-btn delete" onclick="deleteCategory('${cat}')">×</button>
                    </div>
                </div>
                <div style="border-top: 1px solid #333; margin-top: 5px; padding-top: 10px;">
        `;
        
        cats[cat].forEach(t => {
            html += `
                <div class="manager-task">
                    <span>${t.title} (${t.instances}x)</span>
                    <div class="action-btns" style="display:flex;">
                        <button class="icon-btn" onclick="editTask('${t.id}')">✎</button>
                        <button class="icon-btn delete" onclick="deleteTask('${t.id}')">×</button>
                    </div>
                </div>
            `;
        });
        
        html += `
                    <div class="quick-add-task">
                        <span>+</span>
                        <input type="text" placeholder="Add task to ${cat}..." onkeypress="quickAddTask(event, '${cat}')">
                    </div>
                </div>
            </div>
        `;
        
        container.innerHTML += html;
    });
}

function renderTasks() {
    const titleEl = document.getElementById('selected-date-title');
    const [y, m, dayNum] = selectedDateStr.split('-').map(Number);
    // Impostare le 12:00 evita slittamenti al giorno precedente dovuti all'ora solare/legale
    const d = new Date(y, m - 1, dayNum, 12, 0, 0);
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    
    const todayStr = getTodayStr();
    if (selectedDateStr === todayStr) {
        titleEl.innerText = `Today, ${days[d.getDay()]} ${dayNum}`;
    } else {
        titleEl.innerText = `${days[d.getDay()]} ${dayNum}`;
    }

    const container = document.getElementById('today-tasks');
    container.innerHTML = '';
    let hasAnyTasks = false;

    // Events...
    const dayEvents = specificEvents.filter(e => e.date === selectedDateStr);
    
    if (dayEvents.length > 0) {
        hasAnyTasks = true;
        const eventGroup = document.createElement('div');
        eventGroup.className = 'category-group';
        eventGroup.innerHTML = `
            <div class="category-header-wrap" style="border-bottom-color: #333;">
                <div class="category-title" style="color: #888;">Events</div>
            </div>
        `;
        
        dayEvents.forEach(e => {
            eventGroup.innerHTML += `
                <div class="task-item" style="border-left: 4px solid ${e.color}; padding-left: 15px;">
                    <div class="task-left">
                        <div class="task-title" style="color: ${e.color}; font-weight: bold;">${e.title}</div>
                        <div class="action-btns" style="display:flex;">
                            <button class="icon-btn delete" onclick="deleteEvent('${e.id}')">×</button>
                        </div>
                    </div>
                </div>
            `;
        });
        
        container.appendChild(eventGroup);
    }

    syncCategoryOrder();

    categoryOrder.forEach(cat => {
        const activeTasks = templates.filter(t => t.category === cat && isTaskActiveOnDate(t, selectedDateStr));
        
        if (activeTasks.length > 0) {
            hasAnyTasks = true;
            const groupDiv = document.createElement('div');
            groupDiv.className = 'category-group';
            groupDiv.innerHTML = `
                <div class="category-header-wrap">
                    <div class="category-title">${cat}</div>
                </div>
            `;

            activeTasks.forEach(t => {
                const taskItem = document.createElement('div');
                taskItem.className = 'task-item';
                const currentLog = (logs[selectedDateStr] && logs[selectedDateStr][t.id]) || Array(t.instances).fill(false);
                
                let checkboxesHTML = '';
                for (let i = 0; i < t.instances; i++) {
                    checkboxesHTML += `<div class="check-box ${currentLog[i] ? 'checked' : ''}" onclick="toggleTask('${t.id}', ${i})"></div>`;
                }
                
                taskItem.innerHTML = `
                    <div class="task-left">
                        <div class="task-title">${t.title}</div>
                    </div>
                    <div class="instances-container">${checkboxesHTML}</div>
                `;
                
                groupDiv.appendChild(taskItem);
            });
            
            container.appendChild(groupDiv);
        }
    });

    if (!hasAnyTasks) {
        container.innerHTML = `<div class="empty-state">Nothing scheduled for this day.</div>`;
    }
}

function renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    
    document.getElementById('calendar-month-name').innerText = `${monthNames[currentCalendarDate.getMonth()]} ${currentCalendarDate.getFullYear()}`;
    
    grid.innerHTML = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map(d => `<div class="day-label">${d}</div>`).join('');

    const firstDay = new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth(), 1);
    const lastDay = new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth() + 1, 0);
    let startOffset = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;

    for (let i = 0; i < startOffset; i++) {
        grid.innerHTML += `<div></div>`; 
    }
    
    for (let i = 1; i <= lastDay.getDate(); i++) {
        const cellDate = new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth(), i);
        const cellDateStr = formatDate(cellDate);
        
        const stats = getStatsForDate(cellDateStr);
        const dayEvents = specificEvents.filter(e => e.date === cellDateStr);
        
        const dayCell = document.createElement('div');
        dayCell.className = 'month-day in-month';
        
        if (cellDateStr === todayStr) {
            dayCell.classList.add('today');
        }
        if (cellDateStr === selectedDateStr) {
            dayCell.classList.add('selected');
        }
        
        dayCell.innerText = i;
        
        let barsHTML = '';
        const whiteBarsCount = stats.categories.length;
        
        if (whiteBarsCount > 0) {
            const maxBars = Math.min(whiteBarsCount, 3);
            for(let k = 0; k < maxBars; k++) {
                barsHTML += `<div class="bar" style="background-color: var(--text-main);"></div>`;
            }
            if (whiteBarsCount > 3) {
                barsHTML += `<div style="font-size: 10px; color: var(--text-main); font-weight: bold; margin-left: 2px;">+</div>`;
            }
        }
        
        dayEvents.forEach(e => { 
            barsHTML += `<div class="bar" style="background-color: ${e.color};"></div>`; 
        });
        
        if (barsHTML !== '') {
            dayCell.innerHTML += `<div class="bars-container">${barsHTML}</div>`;
        }
        
        dayCell.onclick = () => selectDate(cellDateStr);
        grid.appendChild(dayCell);
    }
}

function renderTracker() {
    const tracker2D = document.getElementById('github-tracker');
    const strip1D = document.getElementById('tracker-strip-1d');
    
    tracker2D.innerHTML = '';
    strip1D.innerHTML = '';
    
    let earliestDate = todayStr;
    templates.forEach(t => { 
        if (t.startDate < earliestDate) {
            earliestDate = t.startDate; 
        }
    });
    
    const start = new Date(earliestDate);
    const today = new Date(todayStr);
    const diffDays = Math.ceil(Math.abs(today - start) / (1000 * 60 * 60 * 24));
    
    // Per il 2D storico calcoliamo i giorni necessari (es. multipli di 7)
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
        cell.title = `${dateStr} - ${stats.completed}/${stats.total} completed`; 
        cell.onclick = () => selectDate(dateStr);

        let lvlClass = 'lvl-none';
        if (stats.total > 0) {
            const p = stats.completed / stats.total;
            if (p > 0 && p < 0.4) {
                lvlClass = 'lvl-1';
            } else if (p >= 0.4 && p < 0.75) {
                lvlClass = 'lvl-2';
            } else if (p >= 0.75 && p < 1) {
                lvlClass = 'lvl-3';
            } else if (p === 1) {
                lvlClass = 'lvl-4';
            }
        }
        cell.classList.add(lvlClass);
        tracker2D.appendChild(cell);
    }

    // Per la striscia 1D in alto, prendiamo solo gli ultimi 25 giorni per non sbordare
    const daysToRender1D = Math.min(25, diffDays + 1);
    const startDate1D = new Date(todayObj);
    startDate1D.setDate(todayObj.getDate() - daysToRender1D + 1);
    
    for (let i = 0; i < daysToRender1D; i++) {
        const d = new Date(startDate1D);
        d.setDate(startDate1D.getDate() + i);
        const dateStr = formatDate(d);
        const stats = getStatsForDate(dateStr);
        
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.style.width = '12px'; // Più piccoli per la striscia
        cell.style.height = '12px';
        cell.title = `${dateStr} - ${stats.completed}/${stats.total}`; 
        
        let lvlClass = 'lvl-none';
        if (stats.total > 0) {
            const p = stats.completed / stats.total;
            if (p > 0 && p < 0.4) {
                lvlClass = 'lvl-1';
            } else if (p >= 0.4 && p < 0.75) {
                lvlClass = 'lvl-2';
            } else if (p >= 0.75 && p < 1) {
                lvlClass = 'lvl-3';
            } else if (p === 1) {
                lvlClass = 'lvl-4';
            }
        }
        cell.classList.add(lvlClass);
        strip1D.appendChild(cell);
    }
}

function toggleTrackerAccordion() {
    const content = document.getElementById('tracker-accordion-content');
    content.classList.toggle('expanded');
    
    if (content.classList.contains('expanded')) {
        setTimeout(() => {
            const wrapper = document.querySelector('.tracker-wrapper');
            if (wrapper) {
                wrapper.scrollLeft = wrapper.scrollWidth;
            }
        }, 10);
    }
}

// --- 5. MODALS MANAGEMENT E TYPE TOGGLE ---

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

// --- CHIUSURA NATIVA WIDGET ---
document.getElementById('btn-close-app').addEventListener('click', () => {
    if (window.__TAURI__) {
        window.__TAURI__.window.getCurrentWindow().close();
    } else {
        window.close();
    }
});

// --- NOTES MANAGEMENT ---
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
    
    if (!text) {
        return;
    }
    
    if (window.__TAURI__) {
        try {
            await window.__TAURI__.core.invoke('save_note', { category: category, text: `${text}\n\n` });
            textEl.value = '';
            const originalPlaceholder = textEl.placeholder;
            textEl.placeholder = "✓ Idea saved!";
            setTimeout(() => {
                textEl.placeholder = originalPlaceholder;
            }, 1500);
        } catch (e) {
            alert("Error saving note: " + e);
        }
    } else {
        textEl.value = '';
        const originalPlaceholder = textEl.placeholder;
        textEl.placeholder = "✓ Idea saved (Mock)!";
        setTimeout(() => {
            textEl.placeholder = originalPlaceholder;
        }, 1500);
    }
}

// --- RESIZER ---

function initTrackerResizer() {
    const resizer = document.getElementById('tracker-resizer');
    const tracker = document.getElementById('tracker-section');
    
    if (!resizer || !tracker) {
        return;
    }
    
    let isResizing = false;
    let startY = 0; 
    let startHeight = 0;
    const COLLAPSE_THRESHOLD = 55; 
    const DEFAULT_OPEN_HEIGHT = 350;
    
    resizer.addEventListener('mousedown', (e) => {
        isResizing = true; 
        startY = e.clientY; 
        startHeight = tracker.getBoundingClientRect().height;
        resizer.classList.add('dragging'); 
        document.body.style.userSelect = 'none'; 
        document.body.style.cursor = 'ns-resize';
    });
    
    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        const deltaY = startY - e.clientY;
        let newHeight = startHeight + deltaY;
        if (newHeight < COLLAPSE_THRESHOLD) {
            tracker.classList.add('collapsed'); 
            tracker.style.height = '0px'; 
        } else {
            tracker.classList.remove('collapsed'); 
            const maxHeight = window.innerHeight * 0.65; 
            newHeight = Math.min(newHeight, maxHeight);
            tracker.style.height = `${newHeight}px`; 
        }
    });
    
    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false; 
            resizer.classList.remove('dragging'); 
            document.body.style.userSelect = ''; 
            document.body.style.cursor = ''; 
        }
    });
    
    resizer.addEventListener('dblclick', () => {
        if (tracker.classList.contains('collapsed') || tracker.offsetHeight === 0) {
            tracker.classList.remove('collapsed'); 
            tracker.style.height = `${DEFAULT_OPEN_HEIGHT}px`; 
        } else {
            tracker.classList.add('collapsed'); 
            tracker.style.height = '0px'; 
        }
    });
}
initTrackerResizer();

function initNotesResizer() {
    const resizer = document.getElementById('notes-resizer');
    const notes = document.getElementById('notes-section');
    
    if (!resizer || !notes) {
        return;
    }
    
    let isResizing = false;
    let startY = 0; 
    let startHeight = 0;
    
    resizer.addEventListener('mousedown', (e) => {
        isResizing = true; 
        startY = e.clientY; 
        startHeight = notes.getBoundingClientRect().height;
        resizer.classList.add('dragging'); 
        document.body.style.userSelect = 'none'; 
        document.body.style.cursor = 'ns-resize';
    });
    
    document.addEventListener('mousemove', (e) => {
        if (!isResizing) {
            return;
        }
        let newHeight = startHeight + (startY - e.clientY);
        if (newHeight < 70) {
            notes.classList.add('collapsed'); 
            notes.style.height = '50px'; 
        } else {
            notes.classList.remove('collapsed'); 
            notes.style.height = `${Math.min(newHeight, window.innerHeight * 0.6)}px`; 
        }
    });
    
    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false; 
            resizer.classList.remove('dragging'); 
            document.body.style.userSelect = ''; 
            document.body.style.cursor = ''; 
        }
    });
    
    resizer.addEventListener('dblclick', () => {
        if (notes.classList.contains('collapsed') || notes.offsetHeight <= 50) {
            notes.classList.remove('collapsed'); 
            notes.style.height = `150px`; 
        } else {
            notes.classList.add('collapsed'); 
            notes.style.height = '50px'; 
        }
    });
}
initNotesResizer();

function selectColor(element, inputId) {
    const parent = element.closest('.color-palette');
    parent.querySelectorAll('.color-circle').forEach(el => el.classList.remove('active'));
    element.classList.add('active');
    document.getElementById(inputId).value = element.getAttribute('data-color');
}

function updateCustomColor(input, inputId) {
    const parent = input.closest('.form-group').querySelector('.color-palette');
    parent.querySelectorAll('.color-circle').forEach(el => el.classList.remove('active'));
    const preset = parent.querySelector(`.color-circle[data-color="${input.value}"]`);
    
    if (preset) {
        preset.classList.add('active');
    } else {
        const customBtn = parent.querySelector('.custom-color-btn'); 
        customBtn.classList.add('active'); 
        customBtn.style.background = input.value; 
        customBtn.style.borderColor = input.value; 
    }
    
    document.getElementById(inputId).value = input.value;
}

// --- GHOST LAYERS LOGIC ---
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
        const checked = days.includes(dayVals[i]) ? 'checked' : '';
        checksHtml += `<label class="day-check"><input type="checkbox" value="${dayVals[i]}" class="tw-day-check" ${checked}> ${dayLabels[i]}</label>`;
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
        <div class="days-checkboxes" style="display: flex; gap: 10px;">${checksHtml}</div>`;
        
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
    if (!ref) {
        return;
    }
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

// --- WEEKLY PLANNER ENGINE ---
function getWeekStart(dateStr) {
    const d = new Date(dateStr); 
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); 
    return new Date(d.setDate(diff));
}

function timeToPx(timeStr) {
    if (!timeStr || typeof timeStr !== 'string' || !timeStr.includes(':')) {
        return 0;
    }
    const [h, m] = timeStr.split(':').map(Number);
    return ((h - 7) + m/60) * 40;
}

function renderWeeklyPlanner() {
    try {
        const sidebar = document.getElementById('reference-toggles-list'); 
        const headerRow = document.getElementById('planner-header');
        const timeLabels = document.getElementById('planner-time-labels');
        const grid = document.getElementById('planner-grid');
        
        if (!sidebar || !headerRow || !timeLabels || !grid) {
            return;
        }

        // --- LETTURA DEI NUOVI TOGGLES ---
        const showFixed = document.getElementById('toggle-fixed-tasks') ? document.getElementById('toggle-fixed-tasks').checked : true;
        const showFlexible = document.getElementById('toggle-flexible-tasks') ? document.getElementById('toggle-flexible-tasks').checked : true;

        const safeLayers = referenceLayers || [];
        const safeToggles = refToggles || {};
        const safeTemplates = templates || [];
        const safeEvents = specificEvents || [];

        // 1. Render Topbar Toggles (Ghost Layers)
        sidebar.innerHTML = ''; 
        safeLayers.forEach(ref => {
            if (!ref || !ref.id) return;
            const isChecked = safeToggles[ref.id] ? 'checked' : '';
            sidebar.innerHTML += `
                <div class="ref-toggle-wrap" style="border-left: 2px solid ${ref.color}; margin-bottom: 5px;">
                    <label style="display:flex; align-items:center; color:#ccc; cursor:pointer; gap: 5px; flex: 1;">
                        <input type="checkbox" onchange="toggleReference('${ref.id}', this.checked)" ${isChecked}>
                        ${ref.title}
                    </label>
                    <button class="ref-del-btn" onclick="deleteReference('${ref.id}')">×</button>
                </div>
            `;
        });

        const PIXELS_PER_HOUR = 40;
        const startHour = 7;
        const totalGridHeight = (24 - startHour) * PIXELS_PER_HOUR;
        
        // 2. Colonna delle Ore fisse a sinistra
        timeLabels.innerHTML = '';
        timeLabels.style.height = `${totalGridHeight}px`;
        
        for (let h = startHour; h <= 24; h++) {
            if (h < 24) {
                timeLabels.innerHTML += `
                    <div class="time-label" style="top: ${(h - startHour) * PIXELS_PER_HOUR}px;">
                        ${h.toString().padStart(2, '0')}:00
                    </div>
                `;
            }
        }

        // 3. Reset Griglia e Header
        headerRow.innerHTML = ''; 
        grid.innerHTML = '';
        const weekStart = getWeekStart(selectedDateStr);
        const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        
        for (let i = 0; i < 7; i++) {
            const currentD = new Date(weekStart); 
            currentD.setDate(weekStart.getDate() + i);
            const loopDateStr = formatDate(currentD); 
            const jsDay = currentD.getDay(); 
            const isToday = loopDateStr === selectedDateStr;

            const headerCell = document.createElement('div');
            headerCell.className = `planner-header-day ${isToday ? 'today-col' : ''}`;
            headerCell.innerHTML = `<div class="day-title">${days[i]} ${currentD.getDate()}</div>`;
            
            let flexibleCategories = new Set();
            
            // LOGICA SHOW FIXED (Badge Eventi Specifici in alto)
            if (showFixed) {
                safeEvents.forEach(e => {
                    if (e && e.date === loopDateStr) {
                        headerCell.innerHTML += `
                            <div class="flexible-task-badge" style="border-left: 2px solid ${e.color};">
                                ★ ${e.title}
                            </div>
                        `;
                    }
                });
            }

            // LOGICA SHOW FLEXIBLE (Badge Task Flessibili in alto)
            if (showFlexible) {
                safeTemplates.forEach(t => {
                    if (t && isTaskActiveOnDate(t, loopDateStr)) {
                        if (t.type === 'untimed' || (!t.type && (!t.timeWindows || t.timeWindows.length === 0))) {
                            flexibleCategories.add(t.category);
                        }
                    }
                });
                
                flexibleCategories.forEach(cat => {
                    headerCell.innerHTML += `<div class="flexible-task-badge">${cat}</div>`;
                });
            }
            
            headerRow.appendChild(headerCell);

            const dayCol = document.createElement('div'); 
            dayCol.className = 'planner-col-absolute'; 
            dayCol.style.height = `${totalGridHeight}px`; 
            
            for (let h = startHour; h <= 24; h++) {
                dayCol.innerHTML += `<div class="grid-line-abs" style="top: ${(h - startHour) * PIXELS_PER_HOUR}px;"></div>`;
            }

            // Ghost Layers (Indipendenti dai toggles task)
            safeLayers.forEach(ref => {
                if (ref && safeToggles[ref.id]) {
                    const windows = ref.timeWindows || [];
                    const opacity = ref.opacity || 0.8;
                    
                    windows.forEach(tw => {
                        if (tw.days && tw.days.includes(jsDay)) {
                            const top = timeToPx(tw.start); 
                            const height = Math.max(timeToPx(tw.end) - top, 15);
                            
                            if (top + height > 0) {
                                dayCol.innerHTML += `
                                    <div class="block-absolute block-ref" style="top:${top}px; height:${height}px; border-color:${ref.color}; background-color:${ref.color}; color:${ref.color}; opacity: ${opacity}; filter: brightness(1.5);">
                                        <i>${ref.title}</i>
                                    </div>
                                `;
                            }
                        }
                    });
                }
            });

            // LOGICA SHOW FIXED (Blocchi Orari delle Task Temporizzate)
            if (showFixed) {
                safeTemplates.forEach(t => {
                    if (t && isTaskActiveOnDate(t, loopDateStr)) {
                        const color = t.color || '#ffffff';
                        if (t.timeWindows && t.timeWindows.length > 0) {
                            t.timeWindows.forEach(tw => {
                                if (tw.days && tw.days.includes(jsDay)) {
                                    const top = timeToPx(tw.start); 
                                    const height = Math.max(timeToPx(tw.end) - top, 15);
                                    
                                    if (top + height > 0) {
                                        dayCol.innerHTML += `
                                            <div class="block-absolute block-task" style="top:${top}px; height:${height}px; border-left: 3px solid ${color}; color: ${color};">
                                                <b>${t.title}</b>
                                            </div>
                                        `;
                                    }
                                }
                            });
                        }
                    }
                });
            }

            grid.appendChild(dayCol);
        }
        
    } catch (error) {
        console.error("Crash evitato in renderWeeklyPlanner:", error);
    }
}

// --- GESTIONE TAB TODAY/TOMORROW & EFFIMERE LOGIC ---
let currentDailyTab = 'today';

function switchDailyTab(tab) {
    currentDailyTab = tab;
    document.getElementById('tab-today').classList.toggle('active', tab === 'today');
    document.getElementById('tab-tomorrow').classList.toggle('active', tab === 'tomorrow');
    renderDailySchedule();
}

function renderDailySchedule() {
    const timeline = document.getElementById('daily-timeline');
    const flexList = document.getElementById('daily-flexible-list');
    
    if (!timeline || !flexList) {
        return;
    }
    
    // Il target è 'today' o 'tomorrow'
    const targetDateStr = currentDailyTab === 'today' ? getTodayStr() : getTomorrowStr();
    const targetData = ephemeralData[targetDateStr] || [];
    
    // Renderizza Timeline da 06:30 a 23:00
    timeline.innerHTML = '';
    const startHour = 6;
    for (let h = startHour; h <= 23; h++) {
        // Label speciale per le 6 (facciamo finta inizi 6:30)
        let timeLabel = h === 6 ? '06:30' : `${h.toString().padStart(2, '0')}:00`;
        
        // Trova se c'è un blocco effimero salvato per questa ora
        const block = targetData.find(b => b.time === timeLabel);
        
        let contentHtml = block 
            ? `<div class="ephemeral-content" onclick="removeEphemeralNote('${targetDateStr}', '${timeLabel}')">${block.text}</div>` 
            : `<div style="flex:1; padding-top:4px; border-bottom: 1px dotted rgba(255,255,255,0.05);"></div>`;

        timeline.innerHTML += `
            <div class="ephemeral-block">
                <div class="ephemeral-time">${timeLabel}</div>
                ${contentHtml}
                ${!block ? `<button class="timeline-add-btn" onclick="addEphemeralToTime('${targetDateStr}', '${timeLabel}')">+</button>` : ''}
            </div>
        `;
    }

    // Renderizza le Flexible Tasks attive (senza orario) nella colonna di destra
    flexList.innerHTML = '';
    templates.forEach(t => {
        if (isTaskActiveOnDate(t, targetDateStr) && (t.type === 'untimed' || !t.timeWindows || t.timeWindows.length === 0)) {
            flexList.innerHTML += `
                <div style="background: rgba(255,255,255,0.05); padding: 6px; margin-bottom: 5px; font-size: 0.8rem; border-left: 2px solid #555;">
                    ${t.title}
                </div>
            `;
        }
    });
}

function addEphemeralToTime(dateStr, timeLabel) {
    const note = prompt(`Add task/note for ${timeLabel}:`);
    if (note && note.trim() !== '') {
        if (!ephemeralData[dateStr]) {
            ephemeralData[dateStr] = [];
        }
        ephemeralData[dateStr].push({ time: timeLabel, text: note.trim() });
        saveData();
        renderDailySchedule();
    }
}

function removeEphemeralNote(dateStr, timeLabel) {
    if(confirm(`Remove note for ${timeLabel}?`)) {
        ephemeralData[dateStr] = ephemeralData[dateStr].filter(b => b.time !== timeLabel);
        saveData();
        renderDailySchedule();
    }
}

function addEphemeralNote() {
    alert("Use the '+' buttons directly on the timeline times (Hover over the timeline to the left) to add a task to a specific hour!");
}

// --- CHIUSURA DROPDOWN GHOST LAYERS CLICCANDO FUORI ---
window.onclick = function(event) {
    if (!event.target.matches('.dropdown-btn')) {
        const dropdowns = document.getElementsByClassName("dropdown-content");
        for (let i = 0; i < dropdowns.length; i++) {
            if (dropdowns[i].classList.contains('show')) {
                dropdowns[i].classList.remove('show');
            }
        }
    }
}

// Initialize rendering calls
renderTasks(); 
renderCalendar();
renderTracker();
renderNoteCategories();
renderWeeklyPlanner();
switchDailyTab('today');