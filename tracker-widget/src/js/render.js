// --- 4. RENDER & UI UPDATES ---

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
        if (!cats[cat]) return; 
        
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
    const d = new Date(y, m - 1, dayNum, 12, 0, 0); 
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    
    titleEl.innerText = (selectedDateStr === todayStr) ? `Today, ${days[d.getDay()]} ${dayNum}` : `${days[d.getDay()]} ${dayNum}`;

    const schedContainer = document.getElementById('scheduled-tasks-list'); 
    const flexContainer = document.getElementById('flexible-tasks-list');
    
    if (!schedContainer || !flexContainer) return;
    
    schedContainer.innerHTML = ''; 
    flexContainer.innerHTML = ''; 
    let hasAnyTasks = false;
    
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
        schedContainer.appendChild(eventGroup); // Gli eventi vanno sempre nei programmati
    }
    
    syncCategoryOrder();
    
    categoryOrder.forEach(cat => {
        const activeTasks = templates.filter(t => t.category === cat && isTaskActiveOnDate(t, selectedDateStr));
        
        if (activeTasks.length > 0) {
            hasAnyTasks = true; 
            
            const schedTasks = activeTasks.filter(t => t.type === 'timed' || (t.timeWindows && t.timeWindows.length > 0));
            const flexTasks = activeTasks.filter(t => t.type !== 'timed' && (!t.timeWindows || t.timeWindows.length === 0));

            const createGroup = (tasks) => {
                const groupDiv = document.createElement('div'); 
                groupDiv.className = 'category-group'; 
                groupDiv.innerHTML = `<div class="category-header-wrap"><div class="category-title">${cat}</div></div>`;
                
                tasks.forEach(t => {
                    const taskItem = document.createElement('div'); 
                    taskItem.className = 'task-item'; 
                    const currentLog = (logs[selectedDateStr] && logs[selectedDateStr][t.id]) || Array(t.instances).fill(false);
                    
                    let checkboxesHTML = ''; 
                    for (let i = 0; i < t.instances; i++) {
                        checkboxesHTML += `<div class="check-box ${currentLog[i] ? 'checked' : ''}" onclick="toggleTask('${t.id}', ${i})"></div>`;
                    }
                    
                    taskItem.innerHTML = `<div class="task-left"><div class="task-title">${t.title}</div></div><div class="instances-container">${checkboxesHTML}</div>`; 
                    groupDiv.appendChild(taskItem);
                }); 
                return groupDiv;
            };

            if (schedTasks.length > 0) schedContainer.appendChild(createGroup(schedTasks));
            if (flexTasks.length > 0) flexContainer.appendChild(createGroup(flexTasks));
        }
    });
    
    if (!hasAnyTasks) {
        schedContainer.innerHTML = `<div class="empty-state">Nothing scheduled for this day.</div>`;
        flexContainer.innerHTML = `<div class="empty-state">No flexible tasks for this day.</div>`;
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
        const cellDateStr = formatDate(new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth(), i)); 
        const stats = getStatsForDate(cellDateStr); 
        const dayEvents = specificEvents.filter(e => e.date === cellDateStr);
        
        const dayCell = document.createElement('div'); 
        dayCell.className = 'month-day in-month';
        
        if (cellDateStr === todayStr) dayCell.classList.add('today'); 
        if (cellDateStr === selectedDateStr) dayCell.classList.add('selected'); 
        
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
        dayCell.ondblclick = () => openJournal(cellDateStr); 
        
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
        if (t.startDate < earliestDate) earliestDate = t.startDate; 
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
        cell.title = `${dateStr} - ${stats.completed}/${stats.total} completed`; 
        cell.onclick = () => selectDate(dateStr);
        
        let lvlClass = 'lvl-none'; 
        if (stats.total > 0) { 
            const p = stats.completed / stats.total; 
            if (p > 0 && p < 0.4) lvlClass = 'lvl-1'; 
            else if (p >= 0.4 && p < 0.75) lvlClass = 'lvl-2'; 
            else if (p >= 0.75 && p < 1) lvlClass = 'lvl-3'; 
            else if (p === 1) lvlClass = 'lvl-4'; 
        } 
        
        cell.classList.add(lvlClass); 
        tracker2D.appendChild(cell);
    }

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
        cell.style.width = '12px'; 
        cell.style.height = '12px'; 
        cell.title = `${dateStr} - ${stats.completed}/${stats.total}`; 
        
        let lvlClass = 'lvl-none'; 
        if (stats.total > 0) { 
            const p = stats.completed / stats.total; 
            if (p > 0 && p < 0.4) lvlClass = 'lvl-1'; 
            else if (p >= 0.4 && p < 0.75) lvlClass = 'lvl-2'; 
            else if (p >= 0.75 && p < 1) lvlClass = 'lvl-3'; 
            else if (p === 1) lvlClass = 'lvl-4'; 
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
            if (wrapper) wrapper.scrollLeft = wrapper.scrollWidth; 
        }, 10); 
    }
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
    return ((h - 7) + m/60) * 40; 
}

function renderWeeklyPlanner() {
    try {
        const sidebar = document.getElementById('reference-toggles-list'); 
        const headerRow = document.getElementById('planner-header'); 
        const timeLabels = document.getElementById('planner-time-labels'); 
        const grid = document.getElementById('planner-grid');
        
        if (!sidebar || !headerRow || !timeLabels || !grid) return;
        
        const showFixed = document.getElementById('toggle-fixed-tasks') ? document.getElementById('toggle-fixed-tasks').checked : true;
        const showFlexible = document.getElementById('toggle-flexible-tasks') ? document.getElementById('toggle-flexible-tasks').checked : true;
        
        sidebar.innerHTML = ''; 
        referenceLayers.forEach(ref => {
            if (!ref || !ref.id) return; 
            const isChecked = refToggles[ref.id] ? 'checked' : '';
            sidebar.innerHTML += `
                <div class="ref-toggle-wrap" style="border-left: 2px solid ${ref.color}; margin-bottom: 5px;">
                    <label style="display:flex; align-items:center; color:#ccc; cursor:pointer; gap: 5px; flex: 1;">
                        <input type="checkbox" onchange="toggleReference('${ref.id}', this.checked)" ${isChecked}> ${ref.title}
                    </label>
                    <button class="ref-del-btn" onclick="deleteReference('${ref.id}')">×</button>
                </div>
            `;
        });
        
        const PIXELS_PER_HOUR = 40; 
        const startHour = 7; 
        const totalGridHeight = (24 - startHour) * PIXELS_PER_HOUR;
        
        timeLabels.innerHTML = ''; 
        timeLabels.style.height = `${totalGridHeight}px`;
        
        for (let h = startHour; h <= 24; h++) {
            if (h < 24) {
                timeLabels.innerHTML += `<div class="time-label" style="top: ${(h - startHour) * PIXELS_PER_HOUR}px;">${h.toString().padStart(2, '0')}:00</div>`;
            }
        }

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
            
            if (showFixed) {
                specificEvents.forEach(e => { 
                    if (e && e.date === loopDateStr) {
                        headerCell.innerHTML += `<div class="flexible-task-badge" style="border-left: 2px solid ${e.color};">★ ${e.title}</div>`; 
                    }
                });
            }
            
            if (showFlexible) { 
                templates.forEach(t => { 
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

            referenceLayers.forEach(ref => {
                if (ref && refToggles[ref.id]) {
                    (ref.timeWindows || []).forEach(tw => {
                        if (tw.days && tw.days.includes(jsDay)) {
                            const top = timeToPx(tw.start); 
                            const height = Math.max(timeToPx(tw.end) - top, 15);
                            if (top + height > 0) {
                                dayCol.innerHTML += `<div class="block-absolute block-ref" style="top:${top}px; height:${height}px; border-color:${ref.color}; background-color:${ref.color}; color:${ref.color}; opacity: ${ref.opacity || 0.8}; filter: brightness(1.5);"><i>${ref.title}</i></div>`;
                            }
                        }
                    });
                }
            });

            if (showFixed) {
                templates.forEach(t => {
                    if (t && isTaskActiveOnDate(t, loopDateStr) && t.timeWindows && t.timeWindows.length > 0) {
                        t.timeWindows.forEach(tw => {
                            if (tw.days && tw.days.includes(jsDay)) {
                                const top = timeToPx(tw.start); 
                                const height = Math.max(timeToPx(tw.end) - top, 15);
                                if (top + height > 0) {
                                    dayCol.innerHTML += `<div class="block-absolute block-task" style="top:${top}px; height:${height}px; border-left: 3px solid ${t.color || '#fff'}; color: ${t.color || '#fff'};"><b>${t.title}</b></div>`;
                                }
                            }
                        });
                    }
                });
            }
            
            grid.appendChild(dayCol);
        }
        
        drawCurrentTimeLine(); 
        
    } catch (error) { 
        console.error("Crash evitato in renderWeeklyPlanner:", error); 
    }
}

function switchDailyTab(tab) {
    currentDailyTab = tab;
    document.getElementById('tab-today').classList.toggle('active', tab === 'today');
    document.getElementById('tab-tomorrow').classList.toggle('active', tab === 'tomorrow');
    renderDailySchedule();
}

function startTimelineDrag(h) { 
    dragStartH = h; 
}

function enterTimelineDrag(h) {
    if (dragStartH !== null) {
        document.querySelectorAll('.ephemeral-block').forEach(el => {
            let blockH = parseInt(el.getAttribute('data-h'));
            if ((blockH >= dragStartH && blockH <= h) || (blockH <= dragStartH && blockH >= h)) {
                el.style.background = 'rgba(255,255,255,0.05)';
            } else {
                el.style.background = '';
            }
        });
    }
}

function cancelTimelineDrag() { 
    dragStartH = null; 
    document.querySelectorAll('.ephemeral-block').forEach(el => el.style.background = ''); 
}

function endTimelineDrag(h, dateStr) {
    if (dragStartH !== null) {
        let start = Math.min(dragStartH, h); 
        let end = Math.max(dragStartH, h);
        dragStartH = null; 
        
        document.querySelectorAll('.ephemeral-block').forEach(el => el.style.background = '');
        
        const note = prompt(`Add task/note from ${start.toString().padStart(2,'0')}:00 to ${(end+1).toString().padStart(2,'0')}:00:`);
        
        if (note && note.trim() !== '') {
            let timeLabel = start === 6 ? '06:30' : `${start.toString().padStart(2,'0')}:00`;
            let span = end - start + 1;
            
            if (!ephemeralData[dateStr]) {
                ephemeralData[dateStr] = [];
            }
            
            ephemeralData[dateStr] = ephemeralData[dateStr].filter(b => b.time !== timeLabel);
            ephemeralData[dateStr].push({ time: timeLabel, text: note.trim(), span: span }); 
            saveData();
        }
        
        renderDailySchedule();
    }
}

function renderDailySchedule() {
    const timeline = document.getElementById('daily-timeline'); 
    const flexList = document.getElementById('daily-flexible-list');
    
    if (!timeline || !flexList) return;
    
    const targetDateStr = currentDailyTab === 'today' ? todayStr : tomorrowStr; 
    const targetData = ephemeralData[targetDateStr] || [];
    
    timeline.innerHTML = ''; 
    const startHour = 6;
    
    for (let h = startHour; h <= 23; h++) {
        let timeLabel = h === 6 ? '06:30' : `${h.toString().padStart(2, '0')}:00`;
        const block = targetData.find(b => b.time === timeLabel);
        
        let contentHtml = block 
            ? `<div class="ephemeral-content" style="position:absolute; top:0; left:45px; right:0; height:${(block.span || 1) * 36 - 1}px; z-index:10;" onclick="removeEphemeralNote('${targetDateStr}', '${timeLabel}')">${block.text}</div>` 
            : `<div style="flex:1; border-bottom: 1px dotted rgba(255,255,255,0.05); height: 100%;"></div>`;
            
        timeline.innerHTML += `
            <div class="ephemeral-block" data-h="${h}" onmousedown="startTimelineDrag(${h})" onmouseenter="enterTimelineDrag(${h})" onmouseup="endTimelineDrag(${h}, '${targetDateStr}')">
                <div class="ephemeral-time">${timeLabel}</div>
                ${contentHtml}
            </div>
        `;
    }

    flexList.innerHTML = '';
    
    templates.forEach(t => {
        if (isTaskActiveOnDate(t, targetDateStr) && (t.type === 'untimed' || !t.timeWindows || t.timeWindows.length === 0)) {
            flexList.innerHTML += `<div style="background: rgba(255,255,255,0.05); padding: 6px; margin-bottom: 5px; font-size: 0.8rem; border-left: 2px solid #555;">${t.title}</div>`;
        }
    });
    
    drawCurrentTimeLine();
}

function removeEphemeralNote(dateStr, timeLabel) { 
    if(confirm(`Remove note starting at ${timeLabel}?`)) { 
        ephemeralData[dateStr] = ephemeralData[dateStr].filter(b => b.time !== timeLabel); 
        saveData(); 
        renderDailySchedule(); 
    } 
}

function addEphemeralNote() { 
    alert("Use the Daily Timeline! Click and drag down on the hours to create a block."); 
}

window.shouldScrollPlanner = true; 
window.shouldScrollDaily = true;

function drawCurrentTimeLine() {
    document.querySelectorAll('.current-time-line').forEach(e => e.remove());
    const now = getNow(); 
    const h = now.getHours(); 
    const m = now.getMinutes();

    const weekStart = getWeekStart(selectedDateStr);
    const daysDiff = Math.floor((now - weekStart) / (1000 * 60 * 60 * 24));
    
    if (daysDiff >= 0 && daysDiff < 7) {
        const cols = document.querySelectorAll('.planner-col-absolute');
        if (cols[daysDiff] && h >= 7) {
            const top = ((h - 7) + m / 60) * 40; 
            cols[daysDiff].innerHTML += `<div class="current-time-line" style="top: ${top}px;"></div>`;
            
            if (window.shouldScrollPlanner) { 
                const scrollArea = document.getElementById('planner-scroll'); 
                if (scrollArea) {
                    scrollArea.scrollTop = top - (scrollArea.clientHeight / 2); 
                }
                window.shouldScrollPlanner = false; 
            }
        }
    }
    
    if (currentDailyTab === 'today' && selectedDateStr === todayStr) {
        const timeline = document.getElementById('daily-timeline');
        if (timeline && h >= 6) {
            const top = ((h - 6) + m / 60) * 36; 
            timeline.innerHTML += `<div class="current-time-line" style="top: ${top}px; left: 45px;"></div>`;
            
            if (window.shouldScrollDaily) { 
                timeline.scrollTop = top - (timeline.clientHeight / 2); 
                window.shouldScrollDaily = false; 
            }
        }
    }
}

setInterval(drawCurrentTimeLine, 60000);

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

function switchAppTab(tabId) {
    ['overview', 'health', 'money'].forEach(id => {
        const tabEl = document.getElementById(`tab-nav-${id}`); 
        if(tabEl) { 
            tabEl.classList.toggle('active', id === tabId); 
            tabEl.classList.toggle('inactive', id !== tabId); 
        }
        
        const screenEl = document.getElementById(`screen-${id}`); 
        if(screenEl) {
            screenEl.style.display = (id === tabId) ? (id === 'overview' ? 'flex' : 'flex') : 'none';
        }
    });
}

function initTrackerResizer() {
    const resizer = document.getElementById('tracker-resizer'); 
    const tracker = document.getElementById('tracker-section'); 
    if (!resizer || !tracker) return;
    
    let isResizing = false; 
    let startY = 0; 
    let startHeight = 0;
    
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
        let newHeight = startHeight + (startY - e.clientY); 
        
        if (newHeight < 55) { 
            tracker.classList.add('collapsed'); 
            tracker.style.height = '0px'; 
        } else { 
            tracker.classList.remove('collapsed'); 
            tracker.style.height = `${Math.min(newHeight, window.innerHeight * 0.65)}px`; 
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
            tracker.style.height = `350px`; 
        } else { 
            tracker.classList.add('collapsed'); 
            tracker.style.height = '0px'; 
        } 
    });
} 

function initNotesResizer() {
    const resizer = document.getElementById('notes-resizer'); 
    const notes = document.getElementById('notes-section'); 
    if (!resizer || !notes) return;
    
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
        if (!isResizing) return; 
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

// --- GESTIONE CATEGORIE NOTE (FUNZIONI MANCANTI) ---

function renderNoteCategories() {
    const select = document.getElementById('note-category');
    const focusSelect = document.getElementById('focus-note-category');
    if (select) select.innerHTML = '';
    if (focusSelect) focusSelect.innerHTML = '';
    
    noteCategories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat; 
        opt.innerText = cat;
        if (select) select.appendChild(opt);
        
        const optFocus = document.createElement('option');
        optFocus.value = cat; 
        optFocus.innerText = cat;
        if (focusSelect) focusSelect.appendChild(optFocus);
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
// --- INITIALIZATION CALLS ---
// --- GESTIONE TRASPARENZA (GLASSMORPHISM) ---
function updateOpacity(val) {
    document.documentElement.style.setProperty('--bg-opacity', val);
    const label = document.getElementById('opacity-val');
    if (label) label.innerText = val;
    localStorage.setItem('tracker_opacity', val);
}

// Carica la trasparenza salvata all'avvio
const savedOpacity = localStorage.getItem('tracker_opacity') || '0.92';
document.documentElement.style.setProperty('--bg-opacity', savedOpacity);
const sliderEl = document.getElementById('bg-opacity-slider');
if (sliderEl) sliderEl.value = savedOpacity;
const labelEl = document.getElementById('opacity-val');
if (labelEl) labelEl.innerText = savedOpacity;
initTrackerResizer();
initNotesResizer();
renderTasks(); 
renderCalendar();
renderTracker();
renderNoteCategories();
renderWeeklyPlanner();
switchDailyTab('today');