// --- 4. RENDER & UI UPDATES ---

let plannerZoom = 40; // Zoom base

// Utility per convertire l'HEX in RGBA per i ghost layer
function hexToRgba(hex, alpha) {
    let r = parseInt(hex.slice(1, 3), 16),
        g = parseInt(hex.slice(3, 5), 16),
        b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Funzioni per il Tooltip
function showTooltip(e, title, timeStr, category) {
    const tooltip = document.getElementById('planner-tooltip');
    if(!tooltip) return;
    tooltip.innerHTML = `<strong style="display:block; margin-bottom:4px; font-size:0.85rem;">${title}</strong><span style="color:#aaa;">${timeStr}</span><br><span style="color:#888; margin-top:2px; display:inline-block;">${category}</span>`;
    tooltip.style.display = 'block';
    tooltip.style.left = (e.clientX + 15) + 'px';
    tooltip.style.top = (e.clientY + 15) + 'px';
}
function moveTooltip(e) {
    const tooltip = document.getElementById('planner-tooltip');
    if(tooltip) { tooltip.style.left = (e.clientX + 15) + 'px'; tooltip.style.top = (e.clientY + 15) + 'px'; }
}
function hideTooltip() {
    const tooltip = document.getElementById('planner-tooltip');
    if(tooltip) tooltip.style.display = 'none';
}

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
        schedContainer.innerHTML = `<div class="empty-state"></div>`;
        flexContainer.innerHTML = `<div class="empty-state"></div>`;
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
        
        // Ho rimosso "const stats = getStatsForDate(cellDateStr);" perché non ci serve più calcolare la mole di lavoro
        const dayEvents = specificEvents.filter(e => e.date === cellDateStr);
        
        const dayCell = document.createElement('div'); 
        dayCell.className = 'month-day in-month';
        
        if (cellDateStr === todayStr) dayCell.classList.add('today'); 
        if (cellDateStr === selectedDateStr) dayCell.classList.add('selected'); 
        
        dayCell.innerText = i;
        
        let barsHTML = ''; 
        
        // MOSTRA SOLO GLI EVENTI COLORATI (Quadratini 6x6 stile brutalista)
        dayEvents.forEach(e => {
            barsHTML += `<div class="bar" style="background-color: ${e.color}; width: 6px; height: 6px;"></div>`;
        });
        
        if (barsHTML !== '') {
            // Aggiunto gap, flex-wrap e center per impaginarli elegantemente se ci sono più avvisi
            dayCell.innerHTML += `<div class="bars-container" style="gap: 3px; flex-wrap: wrap; justify-content: center; margin-top: 4px;">${barsHTML}</div>`;
        }
        
        dayCell.onclick = () => selectDate(cellDateStr); 
        dayCell.ondblclick = () => openJournal(cellDateStr); 
        
        grid.appendChild(dayCell);
    }
}

function changeMonth(dir) {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + dir);
    renderCalendar();
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

    const daysToRender1D = Math.min(45, diffDays + 1); 
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

function getWeekStart(dateStr) { 
    const d = new Date(dateStr); 
    const day = d.getDay(); 
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); 
    return new Date(d.setDate(diff)); 
}

function timeToPx(timeStr) { 
    if (!timeStr || typeof timeStr !== 'string' || !timeStr.includes(':')) return 0; 
    const [h, m] = timeStr.split(':').map(Number); 
    return ((h - 7) + m/60) * plannerZoom; 
}

// --- SOSTITUISCI LA FUNZIONE renderWeeklyPlanner ESISTENTE CON QUESTA ---
function renderWeeklyPlanner() {
    try {
        const sidebar = document.getElementById('reference-toggles-list'); 
        const headerRow = document.getElementById('planner-header'); 
        const timeLabels = document.getElementById('planner-time-labels'); 
        const grid = document.getElementById('planner-grid');
        const drawerDaysRow = document.getElementById('drawer-days-row'); 
        
        if (!sidebar || !headerRow || !timeLabels || !grid) return;
        
        // --- RIGHE ELIMINATE QUI --- (Niente più const showFixed e showFlexible)
        
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

        const startHour = 7; 
        const totalGridHeight = (24 - startHour) * plannerZoom;
        
        timeLabels.innerHTML = ''; 
        timeLabels.style.height = `${totalGridHeight}px`;
        
        for (let h = startHour; h <= 24; h++) {
            if (h < 24) timeLabels.innerHTML += `<div class="time-label" style="top: ${(h - startHour) * plannerZoom}px;">${h.toString().padStart(2, '0')}:00</div>`;
        }

        headerRow.innerHTML = ''; 
        grid.innerHTML = ''; 
        if (drawerDaysRow) drawerDaysRow.innerHTML = ''; 

        const weekStart = getWeekStart(selectedDateStr); 
        const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        
        for (let i = 0; i < 7; i++) {
            const currentD = new Date(weekStart); 
            currentD.setDate(weekStart.getDate() + i); 
            const loopDateStr = formatDate(currentD); 
            const jsDay = currentD.getDay(); 
            const isToday = loopDateStr === selectedDateStr;
            
            // --- HEADER PRINCIPALE (SOLO IL NOME DEL GIORNO) ---
            const headerCell = document.createElement('div'); 
            headerCell.className = `planner-header-day ${isToday ? 'today-col' : ''}`;

            // AGGIUNGI QUESTA RIGA: Separa i giorni in alto con linea tratteggiata
            headerCell.style.borderRight = i < 6 ? '1px solid rgba(255,255,255,0.15)' : 'none';
            
            headerCell.innerHTML = `<div class="day-title">${days[i]} ${currentD.getDate()}</div>`;
            headerRow.appendChild(headerCell);

            // --- GIORNI NELLA TENDINA (SOLO VISUALIZZAZIONE) ---
            if (drawerDaysRow) {
                const dropZone = document.createElement('div');
                dropZone.className = `planner-header-day ${isToday ? 'today-col' : ''}`;
                dropZone.style.borderRight = i < 6 ? '1px solid rgba(255,255,255,0.15)' : 'none';
                dropZone.style.borderTop = '1px solidrgba(255,255,255,0.15)'; 
                dropZone.style.background = 'rgba(255,255,255,0.01)';
                dropZone.style.minHeight = '100px';
                dropZone.style.padding = '5px';

                dropZone.innerHTML = `<div class="day-title" style="font-size:0.65rem; border-bottom:none;">${days[i]}</div>`;
                
                let flexibleCategories = new Set();
                
                specificEvents.forEach(e => { 
                    if (e && e.date === loopDateStr) dropZone.innerHTML += `<div class="flexible-task-badge" style="border-left: 2px solid ${e.color};">★ ${e.title}</div>`; 
                });
                
                templates.forEach(t => { 
                    if (t && isTaskActiveOnDate(t, loopDateStr)) {
                        if (t.type === 'untimed' || (!t.type && (!t.timeWindows || t.timeWindows.length === 0))) flexibleCategories.add(t.category); 
                    }
                }); 
                
                flexibleCategories.forEach(cat => {
                    dropZone.innerHTML += `<div class="flexible-task-badge">${cat}</div>`;
                }); 
                
                drawerDaysRow.appendChild(dropZone);
            }

            // --- GRIGLIA ORARIA ---
            const dayCol = document.createElement('div'); 
            dayCol.className = 'planner-col-absolute'; 
            dayCol.style.height = `${totalGridHeight}px`; 
            dayCol.style.marginTop = '0px'; 
            dayCol.style.borderRight = i < 6 ? '1px solid rgba(255,255,255,0.15)' : 'none';
            
            // AGGIUNTO: Tasto destro sul vuoto ripristina le lezioni nascoste!
            dayCol.oncontextmenu = (e) => restorePlannerInstances(e, loopDateStr);
            
            for (let h = startHour; h <= 24; h++) {
                dayCol.innerHTML += `<div class="grid-line-abs" style="top: ${(h - startHour) * plannerZoom}px;"></div>`;
            }

            // Ghost Layers (Mostrati sempre se la loro toggle globale in sidebar è attiva)
            referenceLayers.forEach(ref => {
                if (ref && refToggles[ref.id]) {
                    (ref.timeWindows || []).forEach(tw => {
                        if (tw.days && tw.days.includes(jsDay)) {
                            const top = timeToPx(tw.start); 
                            const height = Math.max(timeToPx(tw.end) - top, 15);
                            if (top + height > 0) dayCol.innerHTML += `<div class="block-absolute block-ref" style="top:${top}px; height:${height}px; border-color:${ref.color}; background-color:${hexToRgba(ref.color, ref.opacity || 0.15)};" onmouseenter="showTooltip(event, '${ref.title.replace(/'/g, "\\'")}', '${tw.start} - ${tw.end}', 'Ghost Layer')" onmousemove="moveTooltip(event)" onmouseleave="hideTooltip()"></div>`;
                        }
                    });
                }
            });

            // MOSTRA SEMPRE LE TASK A ORARIO (Con logica per saltare le eccezioni)
            templates.forEach(t => {
                if (t && isTaskActiveOnDate(t, loopDateStr) && t.timeWindows && t.timeWindows.length > 0) {
                    t.timeWindows.forEach(tw => {
                        if (tw.days && tw.days.includes(jsDay)) {
                            
                            // CHECK BUCO: Se esiste l'eccezione, salta il render del blocco
                            let plannerExceptions = JSON.parse(localStorage.getItem('tracker_planner_exceptions')) || {};
                            if (plannerExceptions[`${t.id}_${loopDateStr}_${tw.start}`]) return;

                            const top = timeToPx(tw.start); 
                            const height = Math.max(timeToPx(tw.end) - top, 15);
                            if (top + height > 0) {
                                // AGGIUNTO: oncontextmenu per nascondere il blocco
                                dayCol.innerHTML += `<div class="block-absolute block-task" style="top:${top}px; height:${height}px; border-left: 3px solid ${t.color || '#fff'}; color: ${t.color || '#fff'};" 
                                onmouseenter="showTooltip(event, '${t.title.replace(/'/g, "\\'")}', '${tw.start} - ${tw.end}', '${t.category.replace(/'/g, "\\'")}')" 
                                onmousemove="moveTooltip(event)" 
                                onmouseleave="hideTooltip()" 
                                oncontextmenu="hidePlannerInstance(event, '${t.id}', '${loopDateStr}', '${tw.start}')"><b>${t.title}</b></div>`;
                            }
                        }
                    });
                }
            });
            
            grid.appendChild(dayCol);
        }

        // --- RIPRISTINO HOVER LINE E ZOOM ---
        const scrollArea = document.getElementById('planner-scroll');
        if (scrollArea) {
            if (!document.getElementById('planner-hover-line')) {
                const hl = document.createElement('div');
                hl.id = 'planner-hover-line';
                hl.style.cssText = 'display:none; position:absolute; left:0; right:0; height:0; border-top:1px solidrgba(255,255,255,0.3); pointer-events:none; z-index:50;';
                hl.innerHTML = '<div id="planner-hover-time" style="position:absolute; left:4px; top:-9px; width:36px; text-align:center; background:#1a1a1a; color:#ccc; font-size:0.65rem; padding:2px 0; border-radius:3px; letter-spacing:1px; border: 1px solid #333; z-index:100;"></div>';
                scrollArea.appendChild(hl);
                
                // Hover logic
                scrollArea.addEventListener('mousemove', function(e) {
                    const rect = scrollArea.getBoundingClientRect();
                    const y = e.clientY - rect.top + scrollArea.scrollTop;
                    
                    const gridOffset = 8; // Nuovo offset allineato al padding della griglia
                    const relativeY = y - gridOffset;
                    
                    // Usa plannerZoom corretto
                    const hoursDec = (relativeY / plannerZoom) + 7;
                    
                    if (hoursDec >= 7 && hoursDec <= 24 && relativeY >= 0) {
                        const h = Math.floor(hoursDec);
                        const m = Math.floor((hoursDec - h) * 60);
                        document.getElementById('planner-hover-time').innerText = `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}`;
                        hl.style.display = 'block';
                        hl.style.top = `${y}px`; 
                    } else {
                        hl.style.display = 'none';
                    }
                });
                
                scrollArea.addEventListener('mouseleave', () => hl.style.display = 'none');
                
                // Mouse Wheel Zoom logic (Ctrl + Scroll)
                scrollArea.addEventListener('wheel', function(e) {
                    if (e.ctrlKey) {
                        e.preventDefault();
                        plannerZoom += e.deltaY > 0 ? -4 : 4;
                        plannerZoom = Math.max(20, Math.min(120, plannerZoom)); 
                        renderWeeklyPlanner();
                        // Sincronizza anche eventuale mirror giornaliero se esiste
                        if (typeof renderDailySchedule === 'function') renderDailySchedule(); 
                    }
                }, { passive: false });
            } else {
                // Mantiene la linea in cima ri-appendendola
                scrollArea.appendChild(document.getElementById('planner-hover-line'));
            }
        }
        
        drawCurrentTimeLine(); 
        if (typeof renderWeeklyInbox === 'function') renderWeeklyInbox(); 
        
    } catch (error) { 
        console.error("Crash evitato in renderWeeklyPlanner:", error); 
    }
}

// ==========================================
// NUOVE FUNZIONI: INBOX E DRAG & DROP
// ==========================================
// La funzione manterrà il nome interno per non perdere i dati che hai già salvato, ma in UI è "General To-Do"
function renderWeeklyInbox() {
    const container = document.getElementById('weekly-inbox-list');
    if (!container) return;
    container.innerHTML = '';
    
    weeklyInbox.forEach(task => {
        const el = document.createElement('div');
        el.className = 'flexible-task-badge draggable-task';
        el.style.cursor = 'grab';
        el.style.border = '1px solid rgba(255,255,255,0.2)';
        el.style.fontSize = '0.75rem';
        el.style.padding = '6px 10px';
        el.style.display = 'flex';
        el.style.alignItems = 'center';
        el.style.gap = '8px';
        
        // --- FIX CRITICI PER TAURI / WEBKIT ---
        el.setAttribute('draggable', 'true');
        el.style.webkitUserDrag = 'element'; // Sblocca il drag nativo su desktop
        el.style.userSelect = 'none';
        
        // pointer-events: none sul testo impedisce di selezionarlo per sbaglio
        el.innerHTML = `<span style="pointer-events:none;">:: ${task.title}</span> <button class="icon-btn delete" style="font-size:0.8rem; margin:0; padding:0; z-index: 10;" onclick="deleteWeeklyTask('${task.id}')">×</button>`;
        
        el.ondragstart = (e) => {
            e.dataTransfer.effectAllowed = 'move';
            // Doppio formato per massima compatibilità desktop
            e.dataTransfer.setData('text/plain', task.id);
            e.dataTransfer.setData('text', task.id); 
            setTimeout(() => { el.style.opacity = '0.4'; }, 10);
        };
        
        el.ondragend = (e) => {
            el.style.opacity = '1';
        };
        
        container.appendChild(el);
    });
}

function addWeeklyTask(event) {
    if (event.key === 'Enter') {
        const title = event.target.value.trim();
        if (!title) return;
        weeklyInbox.push({ id: 'w_' + Date.now(), title: title });
        saveData();
        renderWeeklyInbox();
        event.target.value = '';
    }
}

function deleteWeeklyTask(id) {
    weeklyInbox = weeklyInbox.filter(t => t.id !== id);
    saveData();
    renderWeeklyInbox();
}

// Nasconde il blocco e blocca il click per non farlo sentire al giorno sotto
function hidePlannerInstance(e, taskId, dateStr, startTime) {
    e.preventDefault(); 
    e.stopPropagation(); 
    
    const exceptionKey = `${taskId}_${dateStr}_${startTime}`;
    let plannerExceptions = JSON.parse(localStorage.getItem('tracker_planner_exceptions')) || {};
    
    plannerExceptions[exceptionKey] = true;
    localStorage.setItem('tracker_planner_exceptions', JSON.stringify(plannerExceptions));
    renderWeeklyPlanner();
}

// Ripristina tutte le task nascoste in una data specifica
function restorePlannerInstances(e, dateStr) {
    e.preventDefault(); 
    
    let plannerExceptions = JSON.parse(localStorage.getItem('tracker_planner_exceptions')) || {};
    let changed = false;
    
    // Cerca le eccezioni che contengono la data cliccata
    for (let key in plannerExceptions) {
        if (key.includes(`_${dateStr}_`)) {
            delete plannerExceptions[key];
            changed = true;
        }
    }
    
    if (changed) {
        localStorage.setItem('tracker_planner_exceptions', JSON.stringify(plannerExceptions));
        renderWeeklyPlanner();
    }
}

function dropWeeklyTask(e, targetDateStr, targetDayIndex) {
    e.preventDefault();
    
    // Legge entrambi i formati di dati, garantendo la compatibilità
    const taskId = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('text');
    
    if (!taskId) return; // Se il dato si è perso, si ferma

    const taskIndex = weeklyInbox.findIndex(t => t.id === taskId);
    if (taskIndex === -1) return;

    const task = weeklyInbox[taskIndex];
    weeklyInbox.splice(taskIndex, 1); // Rimuove dall'inbox

    const catName = 'Weekly To-Do';
    if (!categoryOrder.includes(catName)) {
        categoryOrder.push(catName);
    }

    templates.push({
        id: 't_' + Date.now(),
        category: catName,
        title: task.title,
        instances: 1,
        timerMinutes: 25,
        frequency: 'specific',
        daysOfWeek: [targetDayIndex],
        startDate: targetDateStr,
        endDate: targetDateStr, 
        color: '#ffffff',
        type: 'untimed',
        timeWindows: []
    });

    saveData();
    renderWeeklyPlanner();
    renderTasks();
}


window.shouldScrollPlanner = true; 

function drawCurrentTimeLine() {
    // Elimina la vecchia linea
    document.querySelectorAll('.current-time-line').forEach(e => e.remove());
    
    const now = getNow(); 
    const h = now.getHours(); 
    const m = now.getMinutes();

    const weekStart = getWeekStart(selectedDateStr);
    // Calcola il giorno della settimana corrente
    const daysDiff = Math.floor((now - weekStart) / (1000 * 60 * 60 * 24));
    
    if (daysDiff >= 0 && daysDiff < 7) {
        const cols = document.querySelectorAll('.planner-col-absolute');
        if (cols[daysDiff] && h >= 7) {
            // Usa plannerZoom (variabile globale) per calcolare la posizione esatta in pixel
            const top = ((h - 7) + m / 60) * plannerZoom; 
            
            // Crea la riga come elemento nativo per non rompere il Drag&Drop
            const line = document.createElement('div');
            line.className = 'current-time-line';
            line.style.top = `${top}px`;
            
            cols[daysDiff].appendChild(line);
            
            if (window.shouldScrollPlanner) { 
                const scrollArea = document.getElementById('planner-scroll'); 
                if (scrollArea) {
                    scrollArea.scrollTop = top - (scrollArea.clientHeight / 2); 
                }
                window.shouldScrollPlanner = false; 
            }
        }
    }
}

setInterval(drawCurrentTimeLine, 60000);

window.onclick = function(event) {
    // Chiude i dropdown se si clicca fuori
    if (!event.target.matches('.dropdown-btn') && !event.target.closest('.module-title')) { 
        const dropdowns = document.getElementsByClassName("dropdown-content"); 
        for (let i = 0; i < dropdowns.length; i++) {
            if (dropdowns[i].classList.contains('show')) {
                dropdowns[i].classList.remove('show');
            }
        }
    }
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
        
        // Se era completamente invisibile, lo prepariamo per aprirsi
        if (notes.style.display === 'none') {
            notes.style.display = 'flex';
            notes.style.flexDirection = 'column';
            notes.style.height = '1px';
            startHeight = 1;
        } else {
            startHeight = notes.getBoundingClientRect().height; 
        }
        
        resizer.classList.add('dragging'); 
        document.body.style.userSelect = 'none'; 
        document.body.style.cursor = 'ns-resize'; 
    });
    
    document.addEventListener('mousemove', (e) => { 
        if (!isResizing) return; 
        let newHeight = startHeight + (startY - e.clientY); 
        
        // Se scende sotto i 40px, scompare del tutto
        if (newHeight < 40) { 
            notes.classList.add('collapsed'); 
            notes.style.display = 'none'; 
        } else { 
            notes.classList.remove('collapsed'); 
            notes.style.display = 'flex';
            notes.style.flexDirection = 'column';
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
    
    // Doppio clic: Alterna tra "Aperto a 250px" e "Completamente invisibile"
    resizer.addEventListener('dblclick', () => { 
        if (notes.classList.contains('collapsed') || notes.style.display === 'none') { 
            notes.classList.remove('collapsed'); 
            notes.style.display = 'flex';
            notes.style.flexDirection = 'column';
            notes.style.height = `250px`; 
        } else { 
            notes.classList.add('collapsed'); 
            notes.style.display = 'none'; 
        } 
    });
}

// --- GESTIONE CATEGORIE NOTE (FUNZIONI MANCANTI) ---

// --- GESTIONE CATEGORIE NOTE ---

function renderNoteCategories() {
    // 1. Forza il caricamento dal disco fisso all'avvio
    const savedCats = localStorage.getItem('tracker_note_categories');
    if (savedCats) {
        noteCategories = JSON.parse(savedCats);
    }
    if (!noteCategories || noteCategories.length === 0) {
        noteCategories = ['General'];
    }

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

    // 2. Dopo aver caricato le categorie, carica il testo della categoria selezionata
    refreshNotesView();
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
            
            // Forza il salvataggio su disco
            localStorage.setItem('tracker_note_categories', JSON.stringify(noteCategories));
            
            event.target.value = ''; 
            renderNotesManager(); 
        }
    }
}

function removeNoteCategory(cat) {
    noteCategories = noteCategories.filter(c => c !== cat);
    if (noteCategories.length === 0) noteCategories = ['General'];
    
    // Forza il salvataggio su disco
    localStorage.setItem('tracker_note_categories', JSON.stringify(noteCategories));
    
    renderNotesManager();
}


// --- GESTIONE CONTENUTO NOTE ---

// --- GESTIONE CONTENUTO NOTE E TOGGLE WRITE/BROWSE ---

function toggleNotesMode() {
    const isBrowse = document.getElementById('notes-mode-checkbox').checked;
    const textArea = document.getElementById('note-text');
    
    if (isBrowse) {
        // Modalità BROWSE: Carica e mostra l'intero archivio
        refreshNotesView();
        textArea.placeholder = "Edit your notes here...";
    } else {
        // Modalità WRITE: Svuota la casella per l'input rapido
        textArea.value = "";
        textArea.placeholder = "Write your idea and press Enter...";
    }
}

function refreshNotesView() {
    const isBrowse = document.getElementById('notes-mode-checkbox') ? document.getElementById('notes-mode-checkbox').checked : false;
    const cat = document.getElementById('note-category').value;
    const textArea = document.getElementById('note-text');
    
    if (!cat || !textArea) return;
    
    if (isBrowse) {
        // Stampa tutto il testo salvato
        let savedNotes = JSON.parse(localStorage.getItem('tracker_notes_content')) || {};
        textArea.value = savedNotes[cat] || '';
    } else {
        // Lascia vuoto per scrivere al volo
        textArea.value = '';
    }
}

function handleNoteKeyDown(event) {
    const isBrowse = document.getElementById('notes-mode-checkbox').checked;
    
    // Agisce solo in modalità WRITE alla pressione di Invio (senza premere Shift)
    if (!isBrowse && event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault(); // Blocca l'a capo visivo nella casella vuota
        
        const cat = document.getElementById('note-category').value;
        const textArea = document.getElementById('note-text');
        const textToAdd = textArea.value.trim();
        
        if (textToAdd && cat) {
            // 1. Pesca il testo vecchio
            let savedNotes = JSON.parse(localStorage.getItem('tracker_notes_content')) || {};
            let currentContent = savedNotes[cat] || '';
            
            // 2. Aggiunge la riga nuova formattata (es. "- Nota rapida")
            let newContent = currentContent ? currentContent + '\n' + textToAdd : '- ' + textToAdd;
            
            // 3. Salva sul disco invisibilmente
            savedNotes[cat] = newContent;
            localStorage.setItem('tracker_notes_content', JSON.stringify(savedNotes));
            
            // 4. Cancella l'area
            textArea.value = '';
        }
    }
}

function handleNoteInput() {
    const isBrowse = document.getElementById('notes-mode-checkbox').checked;
    
    // Salva ogni lettera digitata in tempo reale SOLO se sei in modalità BROWSE
    if (isBrowse) {
        const cat = document.getElementById('note-category').value;
        const text = document.getElementById('note-text').value;
        
        let savedNotes = JSON.parse(localStorage.getItem('tracker_notes_content')) || {};
        savedNotes[cat] = text;
        localStorage.setItem('tracker_notes_content', JSON.stringify(savedNotes));
    }
}


// --- MODULAR DASHBOARD SYSTEM ---
const dashboardModules = {
    'daily': { name: 'Daily / Notes', id: 'module-daily' },
    'planner': { name: 'Weekly Planner', id: 'module-planner' },
    'health': { name: 'Health', id: 'module-health' },
    'money': { name: 'Money', id: 'module-money' }
};

let activeLeft = localStorage.getItem('tracker_mod_left') || 'daily';
let activeRight = localStorage.getItem('tracker_mod_right') || 'planner';

function initDashboard() {
    // Ripristina la larghezza salvata o 50/50 di default
    const savedWidth = localStorage.getItem('tracker_pane_left_width') || '50%';
    document.getElementById('pane-left').style.width = savedWidth;
    document.getElementById('pane-right').style.width = `calc(100% - ${savedWidth} - 10px)`;
    
    mountModule('left', activeLeft);
    mountModule('right', activeRight);
    initVerticalResizer();
}

function mountModule(side, modKey) {
    // Salva lo stato in memoria e aggiorna il titolo della tendina
    if(side === 'left') {
        activeLeft = modKey;
        localStorage.setItem('tracker_mod_left', modKey);
        document.getElementById('title-left').innerText = dashboardModules[modKey].name;
    } else {
        activeRight = modKey;
        localStorage.setItem('tracker_mod_right', modKey);
        document.getElementById('title-right').innerText = dashboardModules[modKey].name;
    }

    const contentContainer = document.getElementById(`content-${side}`);
    const modElement = document.getElementById(dashboardModules[modKey].id);
    
    // 1. Se c'è già un modulo qui, lo rimetto invisibile nel magazzino
    if(contentContainer.children.length > 0) {
        document.getElementById('module-registry').appendChild(contentContainer.children[0]);
    }
    // 2. Prelevo il modulo nuovo dal magazzino e lo piazzo nello schermo
    contentContainer.appendChild(modElement);
    
    updateDropdownMenus();
    
    // Inizializza o ridisegna la grafica del modulo inserito
    if (modKey === 'money' && typeof drawSteppedChart === 'function') setTimeout(drawSteppedChart, 10);
    if (modKey === 'health' && typeof renderHealthDashboard === 'function') renderHealthDashboard();
    if (modKey === 'planner') renderWeeklyPlanner();
}

function switchModule(side, newModKey) {
    // Esclusione reciproca: Se scegli a Sinistra un modulo che è già a Destra, scambiali di posto (Swap)
    if (side === 'left' && newModKey === activeRight) {
        mountModule('right', activeLeft);
    } else if (side === 'right' && newModKey === activeLeft) {
        mountModule('left', activeRight);
    }
    mountModule(side, newModKey);
}

function updateDropdownMenus() {
    const buildMenu = (side) => {
        let html = '';
        for(const [key, mod] of Object.entries(dashboardModules)) {
            // Nascondi dalla lista quello che è GIA' attivo su quel lato
            if((side === 'left' && key === activeLeft) || (side === 'right' && key === activeRight)) continue;
            
            // Se è attivo dall'altra parte, mostra l'icona di "Swap"
            const isOther = (side === 'left' && key === activeRight) || (side === 'right' && key === activeLeft);
            html += `<div style="padding: 10px 15px; cursor: pointer; color: white; border-bottom: 1px solid #333; font-size: 0.85rem;" onclick="switchModule('${side}', '${key}')" onmouseover="this.style.color='var(--text-main)'" onmouseout="this.style.color='white'">${mod.name} ${isOther ? ' ⇄' : ''}</div>`;
        }
        return html;
    };
    document.getElementById('dropdown-left').innerHTML = buildMenu('left');
    document.getElementById('dropdown-right').innerHTML = buildMenu('right');
}

function initVerticalResizer() {
    const resizer = document.getElementById('main-resizer');
    const leftPane = document.getElementById('pane-left');
    const rightPane = document.getElementById('pane-right');
    if (!resizer || !leftPane || !rightPane) return;
    
    let isResizing = false;
    
    resizer.addEventListener('mousedown', (e) => {
        isResizing = true;
        resizer.classList.add('dragging');
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'ew-resize';
    });
    
    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        const containerWidth = document.getElementById('app-content-wrapper').clientWidth;
        let newLeftPercent = (e.clientX / containerWidth) * 100;
        
        // Limita il trascinamento per non sfanculare il layout (min 30%, max 70%)
        if (newLeftPercent < 30) newLeftPercent = 30;
        if (newLeftPercent > 70) newLeftPercent = 70;
        
        leftPane.style.width = `${newLeftPercent}%`;
        rightPane.style.width = `calc(${100 - newLeftPercent}% - 10px)`;
    });
    
    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            resizer.classList.remove('dragging');
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
            
            // Salva le dimensioni esatte per la prossima volta
            localStorage.setItem('tracker_pane_left_width', leftPane.style.width);
            renderWeeklyPlanner(); // Ricalibra la grafica del planner
            if (activeLeft === 'money' || activeRight === 'money') { if(typeof drawSteppedChart === 'function') setTimeout(drawSteppedChart, 10); }
        }
    });
}

// --- LOGICA GENERAL TO-DO ---

function addGeneralTask(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        const title = e.target.value.trim();
        if (!title) return;

        // COMMAND PARSER: Intercetta il comando "comprare" (case-insensitive)
        if (title.toLowerCase().startsWith('comprare ')) {
            const ideaName = title.substring(9).trim(); // Taglia via "comprare "
            
            // Inietta direttamente nell'incubatore del Modulo Money
            mWishlist.push({
                id: 'mw_' + Date.now(),
                title: ideaName,
                cost: "", // Lascia il costo vuoto!
                order: mWishlist.length
            });
            saveMoneyData();
            if (typeof renderMoneyDashboard === 'function') renderMoneyDashboard();
            
            e.target.value = '';
            return; // Esce senza salvare la task nel General To-Do
        }

        // Flusso normale per tutte le altre task
        generalTodos.push({ id: 'todo_' + Date.now(), title: title });
        saveData();
        renderGeneralTodos();
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
    const container = document.getElementById('general-todo-list');
    if(!container) return;
    container.innerHTML = '';
    
    if(generalTodos.length === 0) {
        container.innerHTML = '<span style="color: var(--text-dim); font-size: 0.8rem;">No general tasks pending.</span>';
        return;
    }
    
    generalTodos.forEach(t => {
        const isSelected = selectedTodos.has(t.id);
        container.innerHTML += `
            <div class="task-item" style="padding: 6px 10px; background: rgba(255,255,255,0.02); border: 1px solid ${isSelected ? 'var(--text-main)' : 'rgba(255,255,255,0.05)'}; cursor: pointer; transition: 0.2s;" onclick="toggleTodoSelection('${t.id}')">
                <div class="task-left">
                    <div class="check-box ${isSelected ? 'checked' : ''}" style="margin-right: 10px;"></div>
                    <span style="font-size: 0.8rem; color: ${isSelected ? '#fff' : '#ccc'};">${t.title}</span>
                </div>
                <button class="icon-btn delete" onclick="event.stopPropagation(); deleteGeneralTodo('${t.id}')">×</button>
            </div>
        `;
    });
}

function openAssignModal() {
    if (selectedTodos.size === 0) {
        alert("Please select at least one task!");
        return;
    }
    
    // Prepara il modale: seleziona il giorno visualizzato nel calendario, min = oggi
    const dateInput = document.getElementById('assign-date');
    dateInput.value = selectedDateStr; 
    dateInput.min = todayStr; 
    
    // Chiude la tendina
    document.getElementById('todo-dropdown-content').classList.remove('show');
    
    closeModals();
    document.getElementById('assignModal').style.display = 'flex';
}

// Quando confermi il form del Modale
document.getElementById('assignForm').addEventListener('submit', function(e) {
    e.preventDefault();
    const dateStr = document.getElementById('assign-date').value;
    const targetDateObj = new Date(dateStr);
    const dayIndex = targetDateObj.getDay();

    const catName = 'General To-Do';
    if (!categoryOrder.includes(catName)) categoryOrder.push(catName);

    // Converte ogni task selezionata in un vero Habit "untimed" bloccato al giorno scelto
    selectedTodos.forEach(id => {
        const task = generalTodos.find(t => t.id === id);
        if (task) {
            templates.push({
                id: 't_' + Date.now() + Math.random(),
                category: catName,
                title: task.title,
                instances: 1,
                timerMinutes: 25,
                frequency: 'specific',
                daysOfWeek: [dayIndex],
                startDate: dateStr,
                endDate: dateStr, // Scade lo stesso giorno in cui inizia!
                color: '#ffffff',
                type: 'untimed',
                timeWindows: []
            });
        }
    });

    // Rimuove le task assegnate dalla lista Generale
    generalTodos = generalTodos.filter(t => !selectedTodos.has(t.id));
    selectedTodos.clear();
    saveData();
    closeModals();
    
    // Ridisegna l'interfaccia
    renderGeneralTodos();
    renderTasks();
    renderWeeklyPlanner();
});

// Aggiungi questo blocco in fondo a render.js
function initWeeklyResizer() {
    const resizer = document.getElementById('weekly-resizer'); 
    const drawer = document.getElementById('weekly-drawer'); 
    if (!resizer || !drawer) return;
    
    let isResizing = false; 
    let startY = 0; 
    let startHeight = 0;
    
    resizer.addEventListener('mousedown', (e) => { 
        isResizing = true; 
        startY = e.clientY; 
        
        if (drawer.style.display === 'none') {
            drawer.style.display = 'flex';
            drawer.style.flexDirection = 'column';
            drawer.style.height = '1px';
            startHeight = 1;
        } else {
            startHeight = drawer.getBoundingClientRect().height; 
        }
        
        resizer.classList.add('dragging'); 
        document.body.style.userSelect = 'none'; 
        document.body.style.cursor = 'ns-resize'; 
    });
    
    document.addEventListener('mousemove', (e) => { 
        if (!isResizing) return; 
        let newHeight = startHeight + (startY - e.clientY); 
        
        if (newHeight < 40) { 
            drawer.classList.add('collapsed'); 
            drawer.style.display = 'none'; 
        } else { 
            drawer.classList.remove('collapsed'); 
            drawer.style.display = 'flex';
            drawer.style.flexDirection = 'column';
            // Usa il limite infallibile del 60% dello schermo, fluido e senza blocchi
            drawer.style.height = `${Math.min(newHeight, window.innerHeight * 0.6)}px`;
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
        if (drawer.classList.contains('collapsed') || drawer.style.display === 'none') { 
            drawer.classList.remove('collapsed'); 
            drawer.style.display = 'flex';
            drawer.style.flexDirection = 'column';
            drawer.style.height = `200px`; // Altezza standard pulita al doppio clic
        } else { 
            drawer.classList.add('collapsed'); 
            drawer.style.display = 'none'; 
        } 
    });
}



// --- INITIALIZATION CALLS ---
// --- GESTIONE TRASPARENZA (GLASSMORPHISM) ---
function updateOpacity(val) {
    document.documentElement.style.setProperty('--bg-opacity', val);
    const label = document.getElementById('opacity-val');
    if (label) label.innerText = val;
    localStorage.setItem('tracker_opacity', val);
}

// --- INITIALIZATION CALLS ---
const savedOpacity = localStorage.getItem('tracker_opacity') || '0.92';
document.documentElement.style.setProperty('--bg-opacity', savedOpacity);
const sliderEl = document.getElementById('bg-opacity-slider');
if (sliderEl) sliderEl.value = savedOpacity;
const labelEl = document.getElementById('opacity-val');
if (labelEl) labelEl.innerText = savedOpacity;

initNotesResizer();
initWeeklyResizer();
renderTasks(); 
renderCalendar();
renderTracker();
renderNoteCategories();
renderWeeklyPlanner();
renderGeneralTodos();

// --- GLOBAL CLOCK ---
function updateGlobalClock() {
    const clockEl = document.getElementById('global-clock');
    if (!clockEl) return;
    
    const now = getNow();
    
    // Formato HH:MM
    const timeStr = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
    
    // Formato SUNDAY 27
    const days = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
    const dayName = days[now.getDay()];
    const dayNum = now.getDate().toString().padStart(2, '0');
    
    clockEl.innerText = `${timeStr} ${dayName} ${dayNum}`;
}

setInterval(updateGlobalClock, 1000);
updateGlobalClock();

window.addEventListener('DOMContentLoaded', () => {
    initDashboard();
    renderGeneralTodos();
});