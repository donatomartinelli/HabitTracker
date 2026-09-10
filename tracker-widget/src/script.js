// --- 1. DATA MANAGEMENT ---
function initData() {
    if (!localStorage.getItem('tracker_templates')) localStorage.setItem('tracker_templates', JSON.stringify([]));
    if (!localStorage.getItem('tracker_logs')) localStorage.setItem('tracker_logs', JSON.stringify({}));
    if (!localStorage.getItem('tracker_events')) localStorage.setItem('tracker_events', JSON.stringify([]));
    if (!localStorage.getItem('tracker_note_cats')) localStorage.setItem('tracker_note_cats', JSON.stringify(["General", "Productivity", "Math", "Ideas"]));
    if (!localStorage.getItem('tracker_category_order')) localStorage.setItem('tracker_category_order', JSON.stringify([]));
    if (!localStorage.getItem('tracker_references')) localStorage.setItem('tracker_references', JSON.stringify([]));
    if (!localStorage.getItem('ref_toggles')) localStorage.setItem('ref_toggles', JSON.stringify({}));
}

initData();
let templates = JSON.parse(localStorage.getItem('tracker_templates')) || [];
let logs = JSON.parse(localStorage.getItem('tracker_logs')) || {};
let specificEvents = JSON.parse(localStorage.getItem('tracker_events')) || [];
let noteCategories = JSON.parse(localStorage.getItem('tracker_note_cats')) || [];
let categoryOrder = JSON.parse(localStorage.getItem('tracker_category_order')) || [];
let referenceLayers = JSON.parse(localStorage.getItem('tracker_references')) || [];
let refToggles = JSON.parse(localStorage.getItem('ref_toggles')) || {};

// THEME MANAGEMENT
let currentTheme = localStorage.getItem('tracker_theme') || 'dark';
if (currentTheme === 'glass') document.body.classList.add('theme-liquid-glass');

function toggleTheme() {
    document.body.classList.toggle('theme-liquid-glass');
    localStorage.setItem('tracker_theme', document.body.classList.contains('theme-liquid-glass') ? 'glass' : 'dark');
}

function syncCategoryOrder() {
    const existingCats = new Set(templates.map(t => t.category));
    existingCats.forEach(c => { if (!categoryOrder.includes(c)) categoryOrder.push(c); });
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
}

function renderNoteCategories() {
    const select = document.getElementById('note-category');
    select.innerHTML = '';
    noteCategories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.innerText = cat;
        select.appendChild(opt);
    });
}

function openManageNotesModal() {
    renderNotesManager();
    closeModals();
    document.getElementById('manageNotesModal').style.display = 'flex';
}

function renderNotesManager() {
    const container = document.getElementById('notes-manager-list');
    container.innerHTML = '';
    noteCategories.forEach(cat => {
        container.innerHTML += `<div class="manager-task"><span>${cat}</span><div class="action-btns" style="display:flex;"><button class="icon-btn delete" onclick="removeNoteCategory('${cat}')">×</button></div></div>`;
    });
}

function quickAddNoteCategory(event) {
    if (event.key === 'Enter') {
        const newCat = event.target.value.trim();
        if (newCat && !noteCategories.includes(newCat)) {
            noteCategories.push(newCat);
            localStorage.setItem('tracker_note_cats', JSON.stringify(noteCategories));
            event.target.value = ''; 
            renderNotesManager(); 
        }
    }
}

function removeNoteCategory(cat) {
    noteCategories = noteCategories.filter(c => c !== cat);
    localStorage.setItem('tracker_note_cats', JSON.stringify(noteCategories));
    renderNotesManager();
}

function formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

const todayObj = new Date();
const todayStr = formatDate(todayObj);

let selectedDateStr = todayStr;
let currentCalendarDate = new Date(todayObj.getFullYear(), todayObj.getMonth(), 1);

function changeMonth(offset) {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + offset);
    renderCalendar();
}

function isTaskActiveOnDate(template, dateStr) {
    if (template.exceptions && template.exceptions.includes(dateStr)) return false;
    if (dateStr < template.startDate) return false;
    if (template.endDate && dateStr > template.endDate) return false;
    const dateObj = new Date(dateStr);
    const dayOfWeek = dateObj.getDay();
    if (template.frequency === 'all') return true;
    if (template.frequency === 'weekdays' && dayOfWeek >= 1 && dayOfWeek <= 5) return true;
    if (template.frequency === 'weekends' && (dayOfWeek === 0 || dayOfWeek === 6)) return true;
    if (template.frequency === 'specific' && template.daysOfWeek.includes(dayOfWeek)) return true;
    return false;
}

function getStatsForDate(dateStr) {
    let total = 0, completed = 0;
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
    return { total, completed, categories: Array.from(activeCategories) };
}

function toggleTask(templateId, instanceIndex) {
    if (!logs[selectedDateStr]) logs[selectedDateStr] = {};
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
        if (!title) return;
        templates.push({
            id: 't_' + Date.now(), category: categoryName, title: title, instances: 1, timerMinutes: 25,
            frequency: 'all', daysOfWeek: [], startDate: todayStr, endDate: null, color: '#ffffff'
        });
        saveData(); renderManager(); renderTracker(); renderCalendar(); 
    }
}

function quickAddCalendar(event) {
    if (event.key === 'Enter') {
        const catName = event.target.value.trim();
        if (!catName) return;
        templates.push({
            id: 't_' + Date.now(), category: catName, title: 'First Task', instances: 1, timerMinutes: 25,
            frequency: 'all', daysOfWeek: [], startDate: todayStr, endDate: null, color: '#ffffff'
        });
        saveData(); event.target.value = ''; renderManager(); renderTracker(); renderCalendar(); 
    }
}

function editTask(id) {
    const t = templates.find(x => x.id === id);
    if(!t) return;
    document.getElementById('h-id').value = t.id;
    document.getElementById('h-category').value = t.category;
    document.getElementById('h-title').value = t.title;
    document.getElementById('h-instances').value = t.instances;
    document.getElementById('h-timer').value = t.timerMinutes || 25;
    document.getElementById('h-frequency').value = t.frequency;
    document.getElementById('h-enddate').value = t.endDate || "";
    
    toggleDays();
    if(t.frequency === 'specific') {
        document.querySelectorAll('#h-days-container input').forEach(cb => { cb.checked = t.daysOfWeek.includes(parseInt(cb.value)); });
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
    renderTasks(); renderCalendar(); renderWeeklyPlanner();
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
        templates.forEach(t => { if (t.category === oldName) t.category = newName; });
        saveData(); renderTasks(); renderManager();
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
            templates.forEach(t => { if (t.category === deleteTargetId) t.endDate = yesterdayStr; });
        } else if (mode === 'all') {
            templates = templates.filter(x => x.category !== deleteTargetId);
            syncCategoryOrder();
        }
    } else if (deleteTargetType === 'reference' && mode === 'all') {
        referenceLayers = referenceLayers.filter(r => r.id !== deleteTargetId);
        delete refToggles[deleteTargetId];
    }

    saveData(); closeModals(); renderTasks(); renderTracker(); renderCalendar(); renderManager(); renderWeeklyPlanner();
}

function selectDate(dateStr) {
    selectedDateStr = dateStr;
    renderCalendar(); renderTasks(); renderWeeklyPlanner();
}

let pomodoroInterval;
function openTimerModal() {
    closeModals(); document.getElementById('timerSetupModal').style.display = 'flex';
}
document.getElementById('timerSetupForm').addEventListener('submit', function(e) {
    e.preventDefault();
    const mins = parseInt(document.getElementById('tmr-minutes').value, 10);
    closeModals(); startPomodoro(mins);
});
function startPomodoro(mins) {
    document.getElementById('pomodoroOverlay').style.display = 'flex';
    const circle = document.getElementById('pomodoro-circle');
    const circumference = 2 * Math.PI * 180; 
    circle.style.strokeDasharray = `${circumference} ${circumference}`;
    const totalSeconds = mins * 60; let timeLeft = totalSeconds;
    clearInterval(pomodoroInterval);
    pomodoroInterval = setInterval(() => {
        timeLeft--;
        const percent = timeLeft / totalSeconds;
        circle.style.strokeDashoffset = circumference - (percent * circumference);
        if (timeLeft <= 0) {
            clearInterval(pomodoroInterval);
            document.getElementById('pomodoroOverlay').style.display = 'none';
            handlePomodoroComplete();
        }
    }, 1000);
}
function handlePomodoroComplete() {
    const listContainer = document.getElementById('uncompleted-tasks-list');
    listContainer.innerHTML = ''; let hasTasks = false;
    templates.forEach(t => {
        if (isTaskActiveOnDate(t, selectedDateStr)) {
            const currentLog = (logs[selectedDateStr] && logs[selectedDateStr][t.id]) || Array(t.instances).fill(false);
            const firstUncheckedIndex = currentLog.indexOf(false);
            if (firstUncheckedIndex !== -1) {
                hasTasks = true;
                const btn = document.createElement('button');
                btn.className = 'btn'; btn.style.textAlign = 'left'; btn.style.fontFamily = 'inherit';
                btn.innerText = `[${t.category}] ${t.title}`;
                btn.onclick = () => { toggleTask(t.id, firstUncheckedIndex); closeModals(); };
                listContainer.appendChild(btn);
            }
        }
    });
    if (!hasTasks) listContainer.innerHTML = '<p style="color: var(--text-dim);">No pending tasks for today!</p>';
    document.getElementById('timerCompleteModal').style.display = 'flex';
}
function stopPomodoro() { clearInterval(pomodoroInterval); document.getElementById('pomodoroOverlay').style.display = 'none'; }

function moveCategory(catName, direction) {
    const index = categoryOrder.indexOf(catName);
    if (index === -1) return;
    if (direction === -1 && index > 0) {
        [categoryOrder[index - 1], categoryOrder[index]] = [categoryOrder[index], categoryOrder[index - 1]];
    } else if (direction === 1 && index < categoryOrder.length - 1) {
        [categoryOrder[index + 1], categoryOrder[index]] = [categoryOrder[index], categoryOrder[index + 1]];
    }
    saveData(); renderManager(); renderTasks();
}

function renderManager() {
    const container = document.getElementById('manager-list');
    container.innerHTML = '';
    const cats = {};
    templates.forEach(t => {
        if(!cats[t.category]) cats[t.category] = [];
        cats[t.category].push(t);
    });
    syncCategoryOrder();
    categoryOrder.forEach(cat => {
        if (!cats[cat]) return; 
        let html = `<div class="manager-category"><div style="display:flex; justify-content:space-between; align-items:center;"><div style="display:flex; align-items:center; gap: 10px;"><div style="display:flex; flex-direction:column; gap:2px;"><button class="icon-btn reorder" onclick="moveCategory('${cat}', -1)">▲</button><button class="icon-btn reorder" onclick="moveCategory('${cat}', 1)">▼</button></div><h3 style="margin:0; border:none; padding:0;">${cat}</h3></div><div class="action-btns" style="display:flex; margin-bottom:10px;"><button class="icon-btn" onclick="openRenameModal('${cat}')">✎</button><button class="icon-btn delete" onclick="deleteCategory('${cat}')">×</button></div></div><div style="border-top: 1px solid #333; margin-top: 5px; padding-top: 10px;">`;
        cats[cat].forEach(t => { html += `<div class="manager-task"><span>${t.title} (${t.instances}x)</span><div class="action-btns" style="display:flex;"><button class="icon-btn" onclick="editTask('${t.id}')">✎</button><button class="icon-btn delete" onclick="deleteTask('${t.id}')">×</button></div></div>`; });
        html += `<div class="quick-add-task"><span>+</span><input type="text" placeholder="Add task to ${cat}..." onkeypress="quickAddTask(event, '${cat}')"></div></div></div>`;
        container.innerHTML += html;
    });
}

function renderTasks() {
    const titleEl = document.getElementById('selected-date-title');
    const parts = selectedDateStr.split('-');
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    if (selectedDateStr === todayStr) titleEl.innerText = `Today, ${days[d.getDay()]} ${d.getDate()}`;
    else titleEl.innerText = `${days[d.getDay()]} ${d.getDate()}`;

    const container = document.getElementById('today-tasks');
    container.innerHTML = '';
    let hasAnyTasks = false;

    const dayEvents = specificEvents.filter(e => e.date === selectedDateStr);
    if (dayEvents.length > 0) {
        hasAnyTasks = true;
        const eventGroup = document.createElement('div');
        eventGroup.className = 'category-group';
        eventGroup.innerHTML = `<div class="category-header-wrap" style="border-bottom-color: #333;"><div class="category-title" style="color: #888;">Events</div></div>`;
        dayEvents.forEach(e => {
            eventGroup.innerHTML += `<div class="task-item" style="border-left: 4px solid ${e.color}; padding-left: 15px;"><div class="task-left"><div class="task-title" style="color: ${e.color}; font-weight: bold;">${e.title}</div><div class="action-btns" style="display:flex;"><button class="icon-btn delete" onclick="deleteEvent('${e.id}')">×</button></div></div></div>`;
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
            groupDiv.innerHTML = `<div class="category-header-wrap"><div class="category-title">${cat}</div></div>`;
            activeTasks.forEach(t => {
                const taskItem = document.createElement('div');
                taskItem.className = 'task-item';
                const currentLog = (logs[selectedDateStr] && logs[selectedDateStr][t.id]) || Array(t.instances).fill(false);
                let checkboxesHTML = '';
                for (let i = 0; i < t.instances; i++) { checkboxesHTML += `<div class="check-box ${currentLog[i] ? 'checked' : ''}" onclick="toggleTask('${t.id}', ${i})"></div>`; }
                taskItem.innerHTML = `<div class="task-left"><div class="task-title">${t.title}</div></div><div class="instances-container">${checkboxesHTML}</div>`;
                groupDiv.appendChild(taskItem);
            });
            container.appendChild(groupDiv);
        }
    });
    if (!hasAnyTasks) container.innerHTML = `<div class="empty-state">Nothing scheduled for this day.</div>`;
}

function renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    document.getElementById('calendar-month-name').innerText = `${monthNames[currentCalendarDate.getMonth()]} ${currentCalendarDate.getFullYear()}`;
    grid.innerHTML = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map(d => `<div class="day-label">${d}</div>`).join('');
    const firstDay = new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth(), 1);
    const lastDay = new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth() + 1, 0);
    let startOffset = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;

    for (let i = 0; i < startOffset; i++) grid.innerHTML += `<div></div>`; 
    for (let i = 1; i <= lastDay.getDate(); i++) {
        const cellDate = new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth(), i);
        const cellDateStr = formatDate(cellDate);
        const stats = getStatsForDate(cellDateStr);
        const dayEvents = specificEvents.filter(e => e.date === cellDateStr);
        
        const dayCell = document.createElement('div');
        dayCell.className = 'month-day in-month';
        if (cellDateStr === todayStr) dayCell.classList.add('today');
        if (cellDateStr === selectedDateStr) dayCell.classList.add('selected');
        dayCell.innerText = i;
        
        let dotsHTML = '';
        const whiteDotsCount = stats.categories.length;
        if (whiteDotsCount > 0) {
            const maxDots = Math.min(whiteDotsCount, 3);
            for(let k = 0; k < maxDots; k++) { dotsHTML += `<div class="dot" style="background-color: var(--text-main);"></div>`; }
            if (whiteDotsCount > 3) dotsHTML += `<div style="font-size: 8px; color: var(--text-main); font-weight: bold; line-height: 5px; margin-left: 1px;">+</div>`;
        }
        dayEvents.forEach(e => { dotsHTML += `<div class="dot" style="background-color: ${e.color};"></div>`; });
        if (dotsHTML !== '') dayCell.innerHTML += `<div class="dots-container">${dotsHTML}</div>`;
        
        dayCell.onclick = () => selectDate(cellDateStr);
        grid.appendChild(dayCell);
    }
}

function renderTracker() {
    const tracker = document.getElementById('github-tracker');
    tracker.innerHTML = '';
    let earliestDate = todayStr;
    templates.forEach(t => { if (t.startDate < earliestDate) earliestDate = t.startDate; });
    const start = new Date(earliestDate);
    const today = new Date(todayStr);
    const diffDays = Math.ceil(Math.abs(today - start) / (1000 * 60 * 60 * 24));
    const daysToRender = Math.max(7, diffDays + 1); 
    const startDate = new Date(todayObj);
    startDate.setDate(todayObj.getDate() - daysToRender + 1); 
    
    for (let i = 0; i < daysToRender; i++) {
        const d = new Date(startDate);
        d.setDate(startDate.getDate() + i);
        const dateStr = formatDate(d);
        const stats = getStatsForDate(dateStr);
        
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.title = `${dateStr} - ${stats.completed}/${stats.total} completed`; 
        cell.onclick = () => selectDate(dateStr);

        if (stats.total === 0) cell.classList.add('lvl-none');
        else {
            const p = stats.completed / stats.total;
            if (p === 0) cell.classList.add('lvl-none'); // NERO DI 0/0
            else if (p < 0.4) cell.classList.add('lvl-1');
            else if (p < 0.75) cell.classList.add('lvl-2');
            else if (p < 1) cell.classList.add('lvl-3');
            else cell.classList.add('lvl-4');
        }
        tracker.appendChild(cell);
    }
    setTimeout(() => { const wrapper = document.querySelector('.tracker-wrapper'); if(wrapper) wrapper.scrollLeft = wrapper.scrollWidth; }, 10);
}

function openFormModal() {
    document.getElementById('habitForm').reset();
    document.getElementById('h-id').value = ""; 
    document.getElementById('modal-title').innerText = "Create New Habit";
    toggleDays(); closeModals();
    document.getElementById('formModal').style.display = 'flex';
}

function openEventModal() {
    document.getElementById('eventForm').reset();
    document.getElementById('e-date').value = selectedDateStr;
    closeModals();
    document.getElementById('eventModal').style.display = 'flex';
}

function openManagerModal() { renderManager(); closeModals(); document.getElementById('managerModal').style.display = 'flex'; }
function closeModals() { document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none'); }
function toggleDays() { const freq = document.getElementById('h-frequency').value; document.getElementById('h-days-container').style.display = (freq === 'specific') ? 'flex' : 'none'; }

document.getElementById('habitForm').addEventListener('submit', function(e) {
    e.preventDefault();
    const id = document.getElementById('h-id').value;
    const category = document.getElementById('h-category').value.trim();
    const title = document.getElementById('h-title').value.trim();
    const startDate = document.getElementById('h-startdate').value; 
    const endDate = document.getElementById('h-enddate').value || null;
    const startTime = document.getElementById('h-starttime').value || null; 
    const endTime = document.getElementById('h-endtime').value || null; 
    const color = document.getElementById('h-color').value || '#ffffff';
    const instances = parseInt(document.getElementById('h-instances').value, 10);
    const timerMins = parseInt(document.getElementById('h-timer').value, 10);
    const frequency = document.getElementById('h-frequency').value;
    
    let daysOfWeek = [];
    if (frequency === 'specific') {
        document.querySelectorAll('#h-days-container input:checked').forEach(cb => daysOfWeek.push(parseInt(cb.value)));
        if (daysOfWeek.length === 0) { alert("Please select at least one day!"); return; }
    }

    if (id) {
        const t = templates.find(x => x.id === id);
        t.category = category; t.title = title; t.instances = instances; t.timerMinutes = timerMins;
        t.frequency = frequency; t.daysOfWeek = daysOfWeek; t.startDate = startDate; t.endDate = endDate;
        t.startTime = startTime; t.endTime = endTime; t.color = color;
    } else {
        templates.push({
            id: 't_' + Date.now(), category, title, instances, timerMinutes: timerMins, 
            frequency, daysOfWeek, startDate, endDate, startTime, endTime, color, exceptions: []
        });
    }
    saveData(); closeModals(); renderTasks(); renderTracker(); renderCalendar(); renderWeeklyPlanner();
});

document.getElementById('eventForm').addEventListener('submit', function(e) {
    e.preventDefault();
    const title = document.getElementById('e-title').value.trim();
    const date = document.getElementById('e-date').value;
    const color = document.getElementById('e-color').value;
    specificEvents.push({ id: 'e_' + Date.now(), title, date, color });
    saveData(); closeModals(); renderTasks(); renderCalendar(); renderWeeklyPlanner();
});

renderTasks(); renderCalendar(); renderTracker(); renderNoteCategories();

document.getElementById('btn-close-app').addEventListener('click', () => {
    if (window.__TAURI__) { window.__TAURI__.window.getCurrentWindow().close(); } else { window.close(); }
});

function handleNoteKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); saveNote(); }
}

async function saveNote() {
    const category = document.getElementById('note-category').value;
    const textEl = document.getElementById('note-text');
    const text = textEl.value.trim();
    if (!text) return;
    if (window.__TAURI__) {
        try {
            const formattedText = `${text}\n\n`;
            await window.__TAURI__.core.invoke('save_note', { category: category, text: formattedText });
            textEl.value = '';
            const originalPlaceholder = textEl.placeholder;
            textEl.placeholder = "✓ Idea saved!";
            setTimeout(() => { textEl.placeholder = originalPlaceholder; }, 1500);
        } catch (e) { alert("Error saving note: " + e); }
    } else {
        textEl.value = ''; const originalPlaceholder = textEl.placeholder; textEl.placeholder = "✓ Idea saved (Mock)!";
        setTimeout(() => { textEl.placeholder = originalPlaceholder; }, 1500);
    }
}

function initTrackerResizer() {
    const resizer = document.getElementById('tracker-resizer');
    const tracker = document.getElementById('tracker-section');
    if (!resizer || !tracker) return;
    let isResizing = false, startY = 0, startHeight = 0;
    resizer.addEventListener('mousedown', (e) => {
        isResizing = true; startY = e.clientY; startHeight = tracker.getBoundingClientRect().height;
        resizer.classList.add('dragging'); document.body.style.userSelect = 'none'; document.body.style.cursor = 'ns-resize';
    });
    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        const deltaY = startY - e.clientY; let newHeight = startHeight + deltaY;
        if (newHeight < 55) { tracker.classList.add('collapsed'); tracker.style.height = '0px'; } 
        else { tracker.classList.remove('collapsed'); tracker.style.height = `${Math.min(newHeight, window.innerHeight * 0.65)}px`; }
    });
    document.addEventListener('mouseup', () => {
        if (isResizing) { isResizing = false; resizer.classList.remove('dragging'); document.body.style.userSelect = ''; document.body.style.cursor = ''; }
    });
    resizer.addEventListener('dblclick', () => {
        if (tracker.classList.contains('collapsed') || tracker.offsetHeight === 0) { tracker.classList.remove('collapsed'); tracker.style.height = `350px`; } 
        else { tracker.classList.add('collapsed'); tracker.style.height = '0px'; }
    });
}
initTrackerResizer();

function initNotesResizer() {
    const resizer = document.getElementById('notes-resizer');
    const notes = document.getElementById('notes-section');
    if (!resizer || !notes) return;
    let isResizing = false, startY = 0, startHeight = 0;
    resizer.addEventListener('mousedown', (e) => {
        isResizing = true; startY = e.clientY; startHeight = notes.getBoundingClientRect().height;
        document.body.style.userSelect = 'none'; document.body.style.cursor = 'ns-resize';
    });
    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        const deltaY = startY - e.clientY; let newHeight = startHeight + deltaY;
        if (newHeight < 60) { notes.classList.add('collapsed'); notes.style.height = '50px'; }
        else { notes.classList.remove('collapsed'); notes.style.height = `${Math.min(newHeight, window.innerHeight * 0.5)}px`; }
    });
    document.addEventListener('mouseup', () => {
        if (isResizing) { isResizing = false; document.body.style.userSelect = ''; document.body.style.cursor = ''; }
    });
    resizer.addEventListener('dblclick', () => {
        if (notes.classList.contains('collapsed')) { notes.classList.remove('collapsed'); notes.style.height = `350px`; } 
        else { notes.classList.add('collapsed'); notes.style.height = '50px'; }
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
    const customBtn = parent.querySelector('.custom-color-btn');
    customBtn.classList.add('active');
    customBtn.style.background = input.value;
    customBtn.style.borderColor = input.value;
}

function switchDrawerView(view) {
    document.getElementById('view-tasks').style.display = view === 'tasks' ? 'block' : 'none';
    document.getElementById('view-tracker').style.display = view === 'tracker' ? 'flex' : 'none';
    document.getElementById('tab-tasks').classList.toggle('active', view === 'tasks');
    document.getElementById('tab-tracker').classList.toggle('active', view === 'tracker');
}

function addRefTimeWindow(start = '', end = '') {
    const container = document.getElementById('ref-time-windows-container');
    const div = document.createElement('div');
    div.style.display = 'flex'; div.style.gap = '15px'; div.style.marginBottom = '10px';
    div.innerHTML = `
        <div class="form-group" style="flex: 1; margin-bottom: 0;">
            <input type="time" class="form-control ref-start" required value="${start}">
        </div>
        <div class="form-group" style="flex: 1; margin-bottom: 0;">
            <input type="time" class="form-control ref-end" required value="${end}">
        </div>
        <button type="button" class="icon-btn delete" onclick="this.parentElement.remove()" style="margin-top: 5px;">×</button>
    `;
    container.appendChild(div);
}

function openReferenceModal() {
    document.getElementById('referenceForm').reset();
    document.getElementById('ref-id').value = "";
    document.getElementById('ref-time-windows-container').innerHTML = '';
    addRefTimeWindow();
    closeModals();
    document.getElementById('referenceModal').style.display = 'flex';
}

document.getElementById('referenceForm').addEventListener('submit', function(e) {
    e.preventDefault();
    const title = document.getElementById('ref-title').value.trim();
    const color = document.getElementById('r-color').value || '#444444';
    
    let days = [];
    document.querySelectorAll('input[name="ref-day"]:checked').forEach(cb => days.push(parseInt(cb.value)));
    if (days.length === 0) { alert("Select at least one day!"); return; }

    let timeWindows = [];
    document.querySelectorAll('#ref-time-windows-container > div').forEach(row => {
        const start = row.querySelector('.ref-start').value;
        const end = row.querySelector('.ref-end').value;
        if(start && end) timeWindows.push({start, end});
    });

    const id = document.getElementById('ref-id').value || 'r_' + Date.now();
    
    if (document.getElementById('ref-id').value) {
        const ref = referenceLayers.find(x => x.id === id);
        ref.title = title; ref.timeWindows = timeWindows; ref.days = days; ref.color = color;
    } else {
        referenceLayers.push({ id, title, timeWindows, days, color });
        refToggles[id] = true; 
    }
    saveData(); closeModals(); renderWeeklyPlanner();
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
    saveData(); renderWeeklyPlanner();
}

function getWeekStart(dateStr) {
    const d = new Date(dateStr);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); 
    return new Date(d.setDate(diff));
}

function timeToPx(timeStr) {
    if (!timeStr || typeof timeStr !== 'string' || !timeStr.includes(':')) return 0;
    const [h, m] = timeStr.split(':').map(Number);
    return (h + m/60) * 40;
}

function renderWeeklyPlanner() {
    try {
        const sidebar = document.getElementById('reference-toggles');
        const headerRow = document.getElementById('planner-header');
        const timeLabels = document.getElementById('planner-time-labels');
        const grid = document.getElementById('planner-grid');
        
        if (!sidebar || !headerRow || !timeLabels || !grid) return;

        const safeLayers = referenceLayers || [];
        const safeToggles = refToggles || {};
        const safeTemplates = templates || [];
        const safeEvents = specificEvents || [];

        sidebar.innerHTML = ''; 
        safeLayers.forEach(ref => {
            if (!ref || !ref.id) return;
            const isChecked = safeToggles[ref.id] ? 'checked' : '';
            sidebar.innerHTML += `<div class="ref-toggle-wrap" style="border-left: 2px solid ${ref.color};"><label style="display:flex; align-items:center; color:#ccc; cursor:pointer; gap: 5px;"><input type="checkbox" onchange="toggleReference('${ref.id}', this.checked)" ${isChecked}>${ref.title}</label><button class="ref-del-btn" onclick="deleteReference('${ref.id}')">×</button></div>`;
        });

        const PIXELS_PER_HOUR = 40;
        const totalGridHeight = 24 * PIXELS_PER_HOUR;
        
        timeLabels.innerHTML = '';
        timeLabels.style.height = `${totalGridHeight}px`;
        for(let h = 0; h <= 24; h++) {
            const top = h * PIXELS_PER_HOUR;
            if (h < 24) timeLabels.innerHTML += `<div class="time-label" style="top: ${top}px;">${h.toString().padStart(2, '0')}:00</div>`;
        }

        headerRow.innerHTML = ''; grid.innerHTML = '';
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
            safeEvents.forEach(e => { if (e && e.date === loopDateStr) headerCell.innerHTML += `<div class="flexible-task-badge" style="border-left: 2px solid ${e.color};">★ ${e.title}</div>`; });
            safeTemplates.forEach(t => { if (t && isTaskActiveOnDate(t, loopDateStr) && (!t.startTime || !t.endTime)) flexibleCategories.add(t.category); });
            flexibleCategories.forEach(cat => { headerCell.innerHTML += `<div class="flexible-task-badge">${cat}</div>`; });

            headerRow.appendChild(headerCell);

            const dayCol = document.createElement('div');
            dayCol.className = 'planner-col-absolute';
            dayCol.style.height = `${totalGridHeight}px`; 
            
            for(let h = 0; h <= 24; h++) dayCol.innerHTML += `<div class="grid-line-abs" style="top: ${h * PIXELS_PER_HOUR}px;"></div>`;

            safeLayers.forEach(ref => {
                if (ref && ref.days && safeToggles[ref.id] && ref.days.includes(jsDay)) {
                    // Fix in case of old ghost layer structure, falls back to timeWindows
                    const windows = ref.timeWindows || (ref.startTime ? [{start: ref.startTime, end: ref.endTime}] : []);
                    windows.forEach(tw => {
                        const top = timeToPx(tw.start);
                        const height = Math.max(timeToPx(tw.end) - top, 15);
                        dayCol.innerHTML += `<div class="block-absolute block-ref" style="top:${top}px; height:${height}px; border-color:${ref.color}; background-color:${ref.color}; color:${ref.color}; filter: brightness(1.5);"><i>${ref.title}</i></div>`;
                    });
                }
            });

            safeTemplates.forEach(t => {
                if (t && isTaskActiveOnDate(t, loopDateStr) && t.startTime && t.endTime) {
                    const top = timeToPx(t.startTime);
                    const height = Math.max(timeToPx(t.endTime) - top, 15);
                    const color = t.color || '#ffffff';
                    dayCol.innerHTML += `<div class="block-absolute block-task" style="top:${top}px; height:${height}px; border-left: 3px solid ${color}; color: ${color};"><b>${t.title}</b></div>`;
                }
            });
            grid.appendChild(dayCol);
        }
        
        // AUTO-SCROLL TO 07:00
        setTimeout(() => {
            const scrollArea = document.getElementById('planner-scroll');
            if (scrollArea) scrollArea.scrollTop = timeToPx('07:00') - 20; 
        }, 50);

    } catch (error) { console.error("Crash evitato in renderWeeklyPlanner:", error); }
}

renderWeeklyPlanner();
switchDrawerView('tasks');