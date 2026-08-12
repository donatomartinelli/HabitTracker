// --- 1. DATA MANAGEMENT ---
function initData() {
    if (!localStorage.getItem('tracker_templates')) localStorage.setItem('tracker_templates', JSON.stringify([]));
    if (!localStorage.getItem('tracker_logs')) localStorage.setItem('tracker_logs', JSON.stringify({}));
    if (!localStorage.getItem('tracker_events')) localStorage.setItem('tracker_events', JSON.stringify([]));
}

initData();
let templates = JSON.parse(localStorage.getItem('tracker_templates'));
let logs = JSON.parse(localStorage.getItem('tracker_logs'));
let specificEvents = JSON.parse(localStorage.getItem('tracker_events'));

function saveData() {
    localStorage.setItem('tracker_templates', JSON.stringify(templates));
    localStorage.setItem('tracker_logs', JSON.stringify(logs));
    localStorage.setItem('tracker_events', JSON.stringify(specificEvents));
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
    templates.forEach(t => {
        if (isTaskActiveOnDate(t, dateStr)) {
            total += t.instances;
            if (logs[dateStr] && logs[dateStr][t.id]) {
                completed += logs[dateStr][t.id].filter(Boolean).length;
            }
        }
    });
    return { total, completed };
}

// --- 2. ACTIONS (CRUD) ---
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
            frequency: 'all', daysOfWeek: [], startDate: todayStr, endDate: null
        });
        saveData();
        renderManager(); 
        renderTracker();
        renderCalendar(); 
    }
}

function quickAddCalendar(event) {
    if (event.key === 'Enter') {
        const catName = event.target.value.trim();
        if (!catName) return;
        
        templates.push({
            id: 't_' + Date.now(), category: catName, title: 'First Task', instances: 1, timerMinutes: 25,
            frequency: 'all', daysOfWeek: [], startDate: todayStr, endDate: null
        });
        saveData();
        event.target.value = ''; 
        renderManager();
        renderTracker();
        renderCalendar(); 
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

function deleteTask(id) {
    if(confirm("Permanently delete this task?")) {
        templates = templates.filter(t => t.id !== id);
        saveData();
        renderTasks(); renderTracker(); renderCalendar(); renderManager(); 
    }
}

function deleteEvent(id) {
    specificEvents = specificEvents.filter(e => e.id !== id);
    saveData();
    renderTasks(); renderCalendar();
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
        saveData();
        renderTasks(); renderManager();
    }
    closeModals();
});

function deleteCategory(catName) {
    if(confirm(`Delete the ENTIRE calendar "${catName}"?`)) {
        templates = templates.filter(t => t.category !== catName);
        saveData();
        renderTasks(); renderTracker(); renderCalendar(); renderManager();
    }
}

function selectDate(dateStr) {
    selectedDateStr = dateStr;
    renderCalendar(); 
    renderTasks();    
}

// --- 3. POMODORO TIMER (MODAL BASED) ---
let pomodoroInterval;
let activePomodoroData = null;

// Apre la modale per decidere i minuti
function openTimerModal(taskId, defaultMins) {
    const t = templates.find(x => x.id === taskId);
    const currentLog = (logs[selectedDateStr] && logs[selectedDateStr][taskId]) || Array(t.instances).fill(false);
    
    let targetIndex = -1;
    for(let i=0; i < t.instances; i++){
        if(!currentLog[i]) { targetIndex = i; break; }
    }

    if (targetIndex === -1) {
        alert("All sessions for this task are already completed today!");
        return;
    }

    document.getElementById('tmr-task-id').value = taskId;
    document.getElementById('tmr-index').value = targetIndex;
    document.getElementById('tmr-minutes').value = defaultMins;
    
    closeModals();
    document.getElementById('timerSetupModal').style.display = 'flex';
}

// Quando premi "Start" dalla modale
document.getElementById('timerSetupForm').addEventListener('submit', function(e) {
    e.preventDefault();
    const taskId = document.getElementById('tmr-task-id').value;
    const index = parseInt(document.getElementById('tmr-index').value, 10);
    const mins = parseInt(document.getElementById('tmr-minutes').value, 10);
    
    closeModals();
    startPomodoro(taskId, index, mins);
});

// Timer Reale
function startPomodoro(taskId, index, mins) {
    activePomodoroData = { id: taskId, index: index, minutes: mins };
    
    document.getElementById('pomodoroOverlay').style.display = 'flex';
    const circle = document.getElementById('pomodoro-circle');
    const circumference = 2 * Math.PI * 180; 
    circle.style.strokeDasharray = `${circumference} ${circumference}`;
    
    const totalSeconds = mins * 60;
    let timeLeft = totalSeconds;
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
    if(!activePomodoroData) return;
    
    // Auto check the instance
    toggleTask(activePomodoroData.id, activePomodoroData.index);
    
    const currentLogAfter = logs[selectedDateStr][activePomodoroData.id];
    const hasMore = currentLogAfter.includes(false);

    setTimeout(() => {
        if(hasMore) {
            if(confirm(`Session complete and logged! Start next session for this task?`)) {
                // Riapri la modale per la prossima istanza
                openTimerModal(activePomodoroData.id, activePomodoroData.minutes);
            }
        } else {
            alert("Focus session complete! All daily repetitions for this task are done.");
        }
    }, 100);
}

function stopPomodoro() {
    clearInterval(pomodoroInterval);
    activePomodoroData = null;
    document.getElementById('pomodoroOverlay').style.display = 'none';
}

// --- 4. RENDER ---
function renderTasks() {
    const titleEl = document.getElementById('selected-date-title');
    const parts = selectedDateStr.split('-');
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    
    if (selectedDateStr === todayStr) {
        titleEl.innerText = `Today, ${days[d.getDay()]} ${d.getDate()}`;
    } else {
        titleEl.innerText = `${days[d.getDay()]} ${d.getDate()}`;
    }

    const container = document.getElementById('today-tasks');
    container.innerHTML = '';

    let hasAnyTasks = false;

    // 1. Render Specific Events for this date
    const dayEvents = specificEvents.filter(e => e.date === selectedDateStr);
    if (dayEvents.length > 0) {
        hasAnyTasks = true;
        const eventGroup = document.createElement('div');
        eventGroup.className = 'category-group';
        eventGroup.innerHTML = `<div class="category-header-wrap" style="border-bottom-color: #333;"><div class="category-title" style="color: #888;">Events</div></div>`;
        
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

    // 2. Render Habits
    const categories = {};
    templates.forEach(t => { if (!categories[t.category]) categories[t.category] = []; });

    for (const cat in categories) {
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
                const mins = t.timerMinutes || 25;
                
                let checkboxesHTML = '';
                for (let i = 0; i < t.instances; i++) {
                    checkboxesHTML += `<div class="check-box ${currentLog[i] ? 'checked' : ''}" onclick="toggleTask('${t.id}', ${i})"></div>`;
                }

                taskItem.innerHTML = `
                    <div class="task-left">
                        <div class="task-title">${t.title}</div>
                        <button class="btn-start-task" onclick="openTimerModal('${t.id}', ${mins})" title="Start Timer">▶ Focus</button>
                    </div>
                    <div class="instances-container">${checkboxesHTML}</div>
                `;
                groupDiv.appendChild(taskItem);
            });
            container.appendChild(groupDiv);
        }
    }

    if (!hasAnyTasks) {
        container.innerHTML = `<div class="empty-state">Nothing scheduled for this day. </div>`;
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
        if (stats.total > 0) dotsHTML += `<div class="dot" style="background-color: var(--text-main);"></div>`;
        dayEvents.forEach(e => { dotsHTML += `<div class="dot" style="background-color: ${e.color};"></div>`; });
        
        if (dotsHTML !== '') {
            dayCell.innerHTML += `<div class="dots-container">${dotsHTML}</div>`;
        }
        
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
            if (p === 0) cell.classList.add('lvl-0');
            else if (p < 0.4) cell.classList.add('lvl-1');
            else if (p < 0.75) cell.classList.add('lvl-2');
            else if (p < 1) cell.classList.add('lvl-3');
            else cell.classList.add('lvl-4');
        }
        tracker.appendChild(cell);
    }

    setTimeout(() => {
        const wrapper = document.querySelector('.tracker-wrapper');
        wrapper.scrollLeft = wrapper.scrollWidth;
    }, 10);
}

function renderManager() {
    const container = document.getElementById('manager-list');
    container.innerHTML = '';
    
    const cats = {};
    templates.forEach(t => {
        if(!cats[t.category]) cats[t.category] = [];
        cats[t.category].push(t);
    });

    for(const cat in cats) {
        let html = `
        <div class="manager-category">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <h3>${cat}</h3>
                <div class="action-btns" style="display:flex; margin-bottom:10px;">
                    <button class="icon-btn" onclick="openRenameModal('${cat}')">✎</button>
                    <button class="icon-btn delete" onclick="deleteCategory('${cat}')">×</button>
                </div>
            </div>
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
        </div>`;
        container.innerHTML += html;
    }
}

// --- 5. MODALS MANAGEMENT ---
function openFormModal() {
    document.getElementById('habitForm').reset();
    document.getElementById('h-id').value = ""; 
    document.getElementById('modal-title').innerText = "Create New Habit";
    toggleDays();
    closeModals();
    document.getElementById('formModal').style.display = 'flex';
}

function openEventModal() {
    document.getElementById('eventForm').reset();
    document.getElementById('e-date').value = selectedDateStr;
    closeModals();
    document.getElementById('eventModal').style.display = 'flex';
}

function openManagerModal() {
    renderManager();
    closeModals();
    document.getElementById('managerModal').style.display = 'flex';
}

function closeModals() {
    document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none');
}

function toggleDays() {
    const freq = document.getElementById('h-frequency').value;
    document.getElementById('h-days-container').style.display = (freq === 'specific') ? 'flex' : 'none';
}

// Habit Submit
document.getElementById('habitForm').addEventListener('submit', function(e) {
    e.preventDefault();
    const id = document.getElementById('h-id').value;
    const category = document.getElementById('h-category').value.trim();
    const title = document.getElementById('h-title').value.trim();
    const instances = parseInt(document.getElementById('h-instances').value, 10);
    const timerMins = parseInt(document.getElementById('h-timer').value, 10);
    const frequency = document.getElementById('h-frequency').value;
    let endDate = document.getElementById('h-enddate').value || null;
    
    let daysOfWeek = [];
    if (frequency === 'specific') {
        document.querySelectorAll('#h-days-container input:checked').forEach(cb => daysOfWeek.push(parseInt(cb.value)));
        if (daysOfWeek.length === 0) { alert("Please select at least one day!"); return; }
    }

    if (id) {
        const t = templates.find(x => x.id === id);
        t.category = category; t.title = title; t.instances = instances; t.timerMinutes = timerMins;
        t.frequency = frequency; t.daysOfWeek = daysOfWeek; t.endDate = endDate;
    } else {
        templates.push({
            id: 't_' + Date.now(), category, title, instances, timerMinutes: timerMins, 
            frequency, daysOfWeek, startDate: selectedDateStr, endDate
        });
    }
    saveData(); closeModals(); renderTasks(); renderTracker(); renderCalendar();
});

// Event Submit
document.getElementById('eventForm').addEventListener('submit', function(e) {
    e.preventDefault();
    const title = document.getElementById('e-title').value.trim();
    const date = document.getElementById('e-date').value;
    const color = document.getElementById('e-color').value;

    specificEvents.push({ id: 'e_' + Date.now(), title, date, color });
    
    saveData(); closeModals(); renderTasks(); renderCalendar();
});

// STARTUP
renderTasks(); 
renderCalendar();
renderTracker();

// --- 6. CHIUSURA NATIVA WIDGET ---
document.getElementById('btn-close-app').addEventListener('click', () => {
    if (window.__TAURI__) {
        // Ora che ha i permessi, questo comando chiuderà la finestra istantaneamente
        window.__TAURI__.window.getCurrentWindow().close();
    } else {
        window.close();
    }
});