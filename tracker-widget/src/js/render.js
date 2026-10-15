// --- 4. RENDER & UI UPDATES (COLLISION-FREE PLANNER & QUICK ACTIONS) ---

let plannerZoom = 40;

function hexToRgba(hex, alpha) {
    if (!hex || typeof hex !== 'string' || hex.length < 7) return `rgba(255, 255, 255, ${alpha})`;
    let r = parseInt(hex.slice(1, 3), 16),
        g = parseInt(hex.slice(3, 5), 16),
        b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function showTooltip(e, title, timeStr, category) {
    const tooltip = document.getElementById('planner-tooltip');
    if (!tooltip) return;
    tooltip.innerHTML = `<strong style="display:block; margin-bottom:3px; color:#fff;">${escapeHtml(title)}</strong><span style="color:#aaa;">${escapeHtml(timeStr)}</span><br><span style="color:#666; margin-top:2px; display:inline-block; text-transform:uppercase;">${escapeHtml(category)}</span>`;
    tooltip.style.display = 'block';
    tooltip.style.left = (e.clientX + 15) + 'px';
    tooltip.style.top = (e.clientY + 15) + 'px';
}

function moveTooltip(e) {
    const tooltip = document.getElementById('planner-tooltip');
    if (tooltip) { 
        tooltip.style.left = (e.clientX + 15) + 'px'; 
        tooltip.style.top = (e.clientY + 15) + 'px'; 
    }
}

function hideTooltip() {
    const tooltip = document.getElementById('planner-tooltip');
    if (tooltip) tooltip.style.display = 'none';
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

            const spanTitle = document.createElement('span');
            spanTitle.textContent = `${t.title} (${t.instances || 1}x)`;

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
        const plusSpan = document.createElement('span');
        plusSpan.textContent = '+';
        const inputQuick = document.createElement('input');
        inputQuick.type = 'text';
        inputQuick.placeholder = `Add task to ${cat}...`;
        inputQuick.onkeypress = (e) => quickAddTask(e, cat);

        quickAddDiv.appendChild(plusSpan);
        quickAddDiv.appendChild(inputQuick);
        tasksWrap.appendChild(quickAddDiv);

        catDiv.appendChild(tasksWrap);
        frag.appendChild(catDiv);
    });

    container.appendChild(frag);
}

function renderTasks() {
    if (typeof renderPriorityBanner === 'function') renderPriorityBanner();
    const schedContainer = document.getElementById('scheduled-tasks-list'); 
    const flexContainer = document.getElementById('flexible-tasks-list');
    
    if (!schedContainer || !flexContainer) return;
    
    schedContainer.innerHTML = ''; 
    flexContainer.innerHTML = ''; 
    const schedFrag = document.createDocumentFragment();
    const flexFrag = document.createDocumentFragment();
    let hasSched = false;
    let hasFlex = false;
    
    const dayEvents = specificEvents.filter(e => e.date === selectedDateStr);
    const selectedDayIdx = new Date(selectedDateStr).getDay();
    
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
            const schedTasks = activeTasks.filter(t => t.type === 'timed' || (t.timeWindows && t.timeWindows.length > 0));
            const flexTasks = activeTasks.filter(t => t.type !== 'timed' && (!t.timeWindows || t.timeWindows.length === 0));

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

                    // Mostra l'orario accanto alle task programmate
                    let timePrefix = '';
                    if (isScheduledGroup && t.timeWindows && t.timeWindows.length > 0) {
                        const matchingTw = t.timeWindows.find(tw => tw.days && tw.days.includes(selectedDayIdx));
                        if (matchingTw) timePrefix = `[${matchingTw.start}] `;
                    }
                    titleDiv.textContent = `${timePrefix}${t.title}`;
                    leftDiv.appendChild(titleDiv);

                    // Azioni rapide al passaggio del mouse (Focus, Edit, Delete)
                    const quickActions = document.createElement('div');
                    quickActions.className = 'task-quick-actions';

                    if (t.type !== 'medicine') {
                        const btnFocus = document.createElement('button');
                        btnFocus.className = 'icon-btn';
                        btnFocus.title = 'Start instant Focus timer on this task';
                        btnFocus.textContent = '[▶]';
                        btnFocus.onclick = () => quickStartTaskFocus(t.id);
                        quickActions.appendChild(btnFocus);

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

            if (schedTasks.length > 0) {
                hasSched = true;
                schedFrag.appendChild(createGroup(schedTasks, true));
            }
            if (flexTasks.length > 0) {
                hasFlex = true;
                flexFrag.appendChild(createGroup(flexTasks, false));
            }
        }
    });
    
    if (hasSched) schedContainer.appendChild(schedFrag);
    else schedContainer.innerHTML = `<div class="empty-state">[ NONE ]</div>`;

    if (hasFlex) flexContainer.appendChild(flexFrag);
    else flexContainer.innerHTML = `<div class="empty-state">[ NONE ]</div>`;
}

function renderCalendar() {
    const grid = document.getElementById('calendar-grid'); 
    if (!grid) return;
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    
    document.getElementById('calendar-month-name').innerText = `${monthNames[currentCalendarDate.getMonth()]} ${currentCalendarDate.getFullYear()}`;
    
    grid.innerHTML = '';
    const frag = document.createDocumentFragment();

    ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].forEach(d => {
        const lbl = document.createElement('div');
        lbl.className = 'day-label';
        lbl.textContent = d;
        frag.appendChild(lbl);
    });

    const firstDay = new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth(), 1); 
    const lastDay = new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth() + 1, 0);
    
    let startOffset = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
    
    for (let i = 0; i < startOffset; i++) {
        frag.appendChild(document.createElement('div')); 
    }
    
    for (let i = 1; i <= lastDay.getDate(); i++) {
        const cellDateStr = formatDate(new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth(), i)); 
        const dayEvents = specificEvents.filter(e => e.date === cellDateStr);
        
        const dayCell = document.createElement('div'); 
        dayCell.className = 'month-day in-month';
        
        if (cellDateStr === todayStr) dayCell.classList.add('today'); 
        if (cellDateStr === selectedDateStr) dayCell.classList.add('selected'); 
        
        dayCell.textContent = i;
        
        if (dayEvents.length > 0) {
            const barsContainer = document.createElement('div');
            barsContainer.className = 'bars-container';
            dayEvents.forEach(e => {
                const bar = document.createElement('div');
                bar.className = 'bar';
                bar.style.backgroundColor = e.color;
                barsContainer.appendChild(bar);
            });
            dayCell.appendChild(barsContainer);
        }
        
        dayCell.onclick = () => selectDate(cellDateStr); 
        dayCell.ondblclick = () => openJournal(cellDateStr); 
        
        frag.appendChild(dayCell);
    }

    grid.appendChild(frag);
}

function changeMonth(dir) {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + dir);
    renderCalendar();
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
        cell.onclick = () => {
            closeModals();
            selectDate(dateStr);
        };
        
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
        cell.style.width = '11px'; 
        cell.style.height = '11px'; 
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

    // Calcolo TODAY X/Y e STREAK consecutiva
    if (metricsEl) {
        const todayStats = getStatsForDate(todayStr);
        let streak = 0;
        let checkD = new Date(todayObj);

        // Se oggi non hai ancora spuntato nulla, controlla la serie a partire da ieri
        if (todayStats.completed === 0) {
            checkD.setDate(checkD.getDate() - 1);
        }

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
    return ((h - 7) + m / 60) * plannerZoom; 
}

// Algoritmo che divide in colonne affiancate gli impegni che si sovrappongono nello stesso orario
function computeOverlapColumns(blocks) {
    blocks.sort((a, b) => a.top - b.top || (b.bottom - a.bottom));
    let clusters = [];
    let currentCluster = [];
    let clusterEnd = -1;

    blocks.forEach(b => {
        if (currentCluster.length === 0 || b.top < clusterEnd) {
            currentCluster.push(b);
            clusterEnd = Math.max(clusterEnd, b.bottom);
        } else {
            clusters.push(currentCluster);
            currentCluster = [b];
            clusterEnd = b.bottom;
        }
    });
    if (currentCluster.length > 0) clusters.push(currentCluster);

    clusters.forEach(cluster => {
        const cols = [];
        cluster.forEach(b => {
            let placed = false;
            for (let c = 0; c < cols.length; c++) {
                if (cols[c] <= b.top) {
                    cols[c] = b.bottom;
                    b.colIndex = c;
                    placed = true;
                    break;
                }
            }
            if (!placed) {
                b.colIndex = cols.length;
                cols.push(b.bottom);
            }
        });
        const totalCols = cols.length;
        cluster.forEach(b => {
            b.totalCols = totalCols;
        });
    });
}

function renderWeeklyPlanner() {
    try {
        const sidebar = document.getElementById('reference-toggles-list'); 
        const headerRow = document.getElementById('planner-header'); 
        const timeLabels = document.getElementById('planner-time-labels'); 
        const grid = document.getElementById('planner-grid');
        const drawerDaysRow = document.getElementById('drawer-days-row'); 
        
        if (!sidebar || !headerRow || !timeLabels || !grid) return;
        
        sidebar.innerHTML = ''; 
        referenceLayers.forEach(ref => {
            if (!ref || !ref.id) return; 
            const wrap = document.createElement('div');
            wrap.className = 'ref-toggle-wrap';
            wrap.style.cssText = `border-left: 2px solid ${ref.color}; margin-bottom: 5px;`;

            const lbl = document.createElement('label');
            lbl.style.cssText = 'display:flex; align-items:center; color:#ccc; cursor:pointer; gap: 5px; flex: 1;';

            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = !!refToggles[ref.id];
            cb.onchange = () => toggleReference(ref.id, cb.checked);

            const spanTxt = document.createElement('span');
            spanTxt.textContent = ref.title;

            lbl.appendChild(cb);
            lbl.appendChild(spanTxt);

            const delBtn = document.createElement('button');
            delBtn.className = 'ref-del-btn';
            delBtn.textContent = '[X]';
            delBtn.onclick = () => deleteReference(ref.id);

            wrap.appendChild(lbl);
            wrap.appendChild(delBtn);
            sidebar.appendChild(wrap);
        });

        const startHour = 7; 
        const totalGridHeight = (24 - startHour) * plannerZoom;
        
        timeLabels.innerHTML = ''; 
        timeLabels.style.height = `${totalGridHeight}px`;
        
        for (let h = startHour; h < 24; h++) {
            const tl = document.createElement('div');
            tl.className = 'time-label';
            tl.style.top = `${(h - startHour) * plannerZoom}px`;
            tl.textContent = `${h.toString().padStart(2, '0')}:00`;
            timeLabels.appendChild(tl);
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
            
            const headerCell = document.createElement('div'); 
            headerCell.className = `planner-header-day ${isToday ? 'today-col' : ''}`;
            headerCell.style.cursor = 'pointer';
            headerCell.onclick = () => selectDate(loopDateStr);
            headerCell.innerHTML = `<div class="day-title">${days[i]} ${currentD.getDate()}</div>`;
            headerRow.appendChild(headerCell);

            if (drawerDaysRow) {
                const dropZone = document.createElement('div');
                dropZone.className = `planner-header-day ${isToday ? 'today-col' : ''}`;
                dropZone.style.cssText = 'background: rgba(255,255,255,0.01); min-height: 90px; padding: 5px;';
                dropZone.innerHTML = `<div class="day-title" style="margin-bottom:4px;">${days[i]}</div>`;
                
                let flexibleCategories = new Set();
                
                specificEvents.forEach(e => { 
                    if (e && e.date === loopDateStr) {
                        const badge = document.createElement('div');
                        badge.className = 'flexible-task-badge';
                        badge.style.borderLeft = `2px solid ${e.color}`;
                        badge.textContent = `[*] ${e.title}`;
                        dropZone.appendChild(badge);
                    }
                });
                
                templates.forEach(t => { 
                    if (t && isTaskActiveOnDate(t, loopDateStr)) {
                        if (t.type === 'untimed' || (!t.type && (!t.timeWindows || t.timeWindows.length === 0))) {
                            flexibleCategories.add(t.category);
                        }
                    }
                }); 
                
                flexibleCategories.forEach(cat => {
                    const badge = document.createElement('div');
                    badge.className = 'flexible-task-badge';
                    badge.textContent = cat;
                    dropZone.appendChild(badge);
                }); 
                
                drawerDaysRow.appendChild(dropZone);
            }

            const dayCol = document.createElement('div'); 
            dayCol.className = 'planner-col-absolute'; 
            dayCol.style.height = `${totalGridHeight}px`; 
            dayCol.oncontextmenu = (e) => restorePlannerInstances(e, loopDateStr);
            
            for (let h = startHour; h <= 24; h++) {
                const line = document.createElement('div');
                line.className = 'grid-line-abs';
                line.style.top = `${(h - startHour) * plannerZoom}px`;
                dayCol.appendChild(line);
            }

            // 1. Ghost Layers sullo sfondo
            referenceLayers.forEach(ref => {
                if (ref && refToggles[ref.id]) {
                    (ref.timeWindows || []).forEach(tw => {
                        if (tw.days && tw.days.includes(jsDay)) {
                            const top = timeToPx(tw.start); 
                            const height = Math.max(timeToPx(tw.end) - top, 15);
                            if (top + height > 0) {
                                const block = document.createElement('div');
                                block.className = 'block-absolute block-ref';
                                block.style.cssText = `top:${top}px; height:${height}px; border-color:${ref.color}; background-color:${hexToRgba(ref.color, ref.opacity || 0.15)};`;
                                block.onmouseenter = (ev) => showTooltip(ev, ref.title, `${tw.start} - ${tw.end}`, 'Ghost Layer');
                                block.onmousemove = moveTooltip;
                                block.onmouseleave = hideTooltip;
                                dayCol.appendChild(block);
                            }
                        }
                    });
                }
            });

            // 2. Raccolta di tutti i blocchi orari del giorno (Task + Single Events con orario)
            const dayBlocks = [];

            templates.forEach(t => {
                if (t && isTaskActiveOnDate(t, loopDateStr) && t.timeWindows && t.timeWindows.length > 0) {
                    t.timeWindows.forEach(tw => {
                        if (tw.days && tw.days.includes(jsDay)) {
                            if (plannerExceptions[`${t.id}_${loopDateStr}_${tw.start}`]) return;
                            const top = timeToPx(tw.start);
                            const height = Math.max(timeToPx(tw.end) - top, 16);
                            if (top + height > 0) {
                                dayBlocks.push({
                                    kind: 'task',
                                    id: t.id,
                                    title: t.title,
                                    category: t.category,
                                    color: t.color || '#ffffff',
                                    start: tw.start,
                                    end: tw.end,
                                    top: top,
                                    height: height,
                                    bottom: top + height
                                });
                            }
                        }
                    });
                }
            });

            specificEvents.forEach(e => {
                if (e && e.date === loopDateStr && e.start && e.end) {
                    const top = timeToPx(e.start);
                    const height = Math.max(timeToPx(e.end) - top, 16);
                    if (top + height > 0) {
                        dayBlocks.push({
                            kind: 'event',
                            id: e.id,
                            title: e.title,
                            category: 'Single Event',
                            color: e.color || '#b84b4b',
                            start: e.start,
                            end: e.end,
                            top: top,
                            height: height,
                            bottom: top + height
                        });
                    }
                }
            });

            // Calcolo colonne anti-sovrapposizione
            computeOverlapColumns(dayBlocks);

            dayBlocks.forEach(b => {
                const block = document.createElement('div');
                block.className = `block-absolute ${b.kind === 'event' ? 'block-event' : 'block-task'}`;
                const widthPct = 100 / (b.totalCols || 1);
                const leftPct = (b.colIndex || 0) * widthPct;

                block.style.cssText = `
                    top: ${b.top}px;
                    height: ${b.height}px;
                    left: calc(${leftPct}% + 1px);
                    width: calc(${widthPct}% - 2px);
                    border-left: 3px solid ${b.color};
                    color: ${b.color};
                `;

                const bTag = document.createElement('b');
                bTag.textContent = b.title;
                block.appendChild(bTag);

                block.onmouseenter = (ev) => showTooltip(ev, b.title, `${b.start} - ${b.end}`, b.category);
                block.onmousemove = moveTooltip;
                block.onmouseleave = hideTooltip;
                if (b.kind === 'task') {
                    block.oncontextmenu = (ev) => hidePlannerInstance(ev, b.id, loopDateStr, b.start);
                }
                dayCol.appendChild(block);
            });
            
            grid.appendChild(dayCol);
        }

        const scrollArea = document.getElementById('planner-scroll');
        if (scrollArea) {
            if (!document.getElementById('planner-hover-line')) {
                const hl = document.createElement('div');
                hl.id = 'planner-hover-line';
                hl.style.cssText = 'display:none; position:absolute; left:0; right:0; height:0; border-top:1px solid rgba(255,255,255,0.3); pointer-events:none; z-index:50;';
                hl.innerHTML = '<div id="planner-hover-time" style="position:absolute; left:2px; top:-9px; width:40px; text-align:center; background:#050505; color:#fff; font-size:var(--font-xs); padding:1px 0; border: 1px solid #444; z-index:100;"></div>';
                scrollArea.appendChild(hl);
                
                scrollArea.addEventListener('mousemove', function(e) {
                    const rect = scrollArea.getBoundingClientRect();
                    const y = e.clientY - rect.top + scrollArea.scrollTop;
                    const gridOffset = 8;
                    const relativeY = y - gridOffset;
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
                
                scrollArea.addEventListener('wheel', function(e) {
                    if (e.ctrlKey) {
                        e.preventDefault();
                        plannerZoom += e.deltaY > 0 ? -4 : 4;
                        plannerZoom = Math.max(20, Math.min(120, plannerZoom)); 
                        renderWeeklyPlanner();
                    }
                }, { passive: false });
            } else {
                scrollArea.appendChild(document.getElementById('planner-hover-line'));
            }
        }
        
        drawCurrentTimeLine(); 
        
    } catch (error) { 
        console.error("Error in renderWeeklyPlanner:", error); 
    }
}

function hidePlannerInstance(e, taskId, dateStr, startTime) {
    e.preventDefault(); 
    e.stopPropagation(); 
    
    const exceptionKey = `${taskId}_${dateStr}_${startTime}`;
    plannerExceptions[exceptionKey] = true;
    saveData();
    renderWeeklyPlanner();
}

function restorePlannerInstances(e, dateStr) {
    e.preventDefault(); 
    
    let changed = false;
    for (let key in plannerExceptions) {
        if (key.includes(`_${dateStr}_`)) {
            delete plannerExceptions[key];
            changed = true;
        }
    }
    
    if (changed) {
        saveData();
        renderWeeklyPlanner();
    }
}

window.shouldScrollPlanner = true; 

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
            const top = ((h - 7) + m / 60) * plannerZoom; 
            
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
    if (!event.target.matches('.dropdown-btn') && !event.target.closest('.module-title')) { 
        const dropdowns = document.getElementsByClassName("dropdown-content"); 
        for (let i = 0; i < dropdowns.length; i++) {
            if (dropdowns[i].classList.contains('show')) {
                dropdowns[i].classList.remove('show');
            }
        }
    }
};

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

function renderNoteCategories() {
    if (!noteCategories || noteCategories.length === 0) {
        noteCategories = ['General'];
        saveData();
    }

    const select = document.getElementById('note-category');
    const focusSelect = document.getElementById('focus-note-category');
    const prevVal = select ? select.value : null;

    if (select) select.innerHTML = '';
    if (focusSelect) focusSelect.innerHTML = '';
    
    noteCategories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat; 
        opt.textContent = cat;
        if (select) select.appendChild(opt);
        
        const optFocus = document.createElement('option');
        optFocus.value = cat; 
        optFocus.textContent = cat;
        if (focusSelect) focusSelect.appendChild(optFocus);
    });

    if (select && prevVal && noteCategories.includes(prevVal)) {
        select.value = prevVal;
    }

    refreshNotesView();
}

function openManageNotesModal() {
    renderNotesManager();
    closeModals();
    document.getElementById('manageNotesModal').style.display = 'flex';
}

function renderNotesManager() {
    const container = document.getElementById('notes-manager-list');
    if (!container) return;
    container.innerHTML = '';
    
    noteCategories.forEach(cat => {
        const row = document.createElement('div');
        row.className = 'manager-task';

        const span = document.createElement('span');
        span.textContent = cat;

        const actions = document.createElement('div');
        actions.className = 'action-btns';
        actions.style.display = 'flex';

        const delBtn = document.createElement('button');
        delBtn.className = 'icon-btn delete';
        delBtn.textContent = '[X]';
        delBtn.onclick = () => removeNoteCategory(cat);

        actions.appendChild(delBtn);
        row.appendChild(span);
        row.appendChild(actions);
        container.appendChild(row);
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
            renderNoteCategories();
        }
    }
}

function removeNoteCategory(cat) {
    noteCategories = noteCategories.filter(c => c !== cat);
    if (noteCategories.length === 0) noteCategories = ['General'];
    saveData();
    renderNotesManager();
    renderNoteCategories();
}

const dashboardModules = {
    'daily': { name: 'Daily / Notes', id: 'module-daily' },
    'planner': { name: 'Weekly Planner', id: 'module-planner' },
    'health': { name: 'Health', id: 'module-health' },
    'money': { name: 'Money', id: 'module-money' }
};

function initDashboard() {
    const savedWidth = localStorage.getItem('tracker_pane_left_width') || '50%';
    document.getElementById('pane-left').style.width = savedWidth;
    document.getElementById('pane-right').style.width = `calc(100% - ${savedWidth} - 8px)`;
    
    mountModule('left', activeLeft);
    mountModule('right', activeRight);
    initVerticalResizer();
}

function mountModule(side, modKey) {
    if (side === 'left') {
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
    
    if (contentContainer.children.length > 0) {
        document.getElementById('module-registry').appendChild(contentContainer.children[0]);
    }
    contentContainer.appendChild(modElement);
    
    updateDropdownMenus();
    
    if (modKey === 'money' && typeof drawSteppedChart === 'function') setTimeout(drawSteppedChart, 10);
    if (modKey === 'health' && typeof renderHealthDashboard === 'function') renderHealthDashboard();
    if (modKey === 'planner') renderWeeklyPlanner();
}

function switchModule(side, newModKey) {
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
        for (const [key, mod] of Object.entries(dashboardModules)) {
            if ((side === 'left' && key === activeLeft) || (side === 'right' && key === activeRight)) continue;
            
            const isOther = (side === 'left' && key === activeRight) || (side === 'right' && key === activeLeft);
            html += `<div style="padding: 9px 14px; cursor: pointer; color: white; border-bottom: 1px solid #222; font-size: var(--font-xs); text-transform: uppercase;" onclick="switchModule('${side}', '${key}')" onmouseover="this.style.background='rgba(255,255,255,0.06)'" onmouseout="this.style.background='transparent'">${mod.name} ${isOther ? ' [SWAP]' : ''}</div>`;
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
        
        if (newLeftPercent < 30) newLeftPercent = 30;
        if (newLeftPercent > 70) newLeftPercent = 70;
        
        leftPane.style.width = `${newLeftPercent}%`;
        rightPane.style.width = `calc(${100 - newLeftPercent}% - 8px)`;
    });
    
    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            resizer.classList.remove('dragging');
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
            
            localStorage.setItem('tracker_pane_left_width', leftPane.style.width);
            renderWeeklyPlanner();
            if (activeLeft === 'money' || activeRight === 'money') { 
                if (typeof drawSteppedChart === 'function') setTimeout(drawSteppedChart, 10); 
            }
        }
    });
}

function addGeneralTask(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        const title = e.target.value.trim();
        if (!title) return;

        if (title.toLowerCase().startsWith('comprare ')) {
            const ideaName = title.substring(9).trim();
            
            mWishlist.push({
                id: 'mw_' + Date.now(),
                title: ideaName,
                cost: "",
                order: mWishlist.length
            });
            saveMoneyData();
            if (typeof renderMoneyDashboard === 'function') renderMoneyDashboard();
            if (typeof showToast === 'function') showToast(`[WISH] Added "${ideaName}" to Incubator`);
            
            e.target.value = '';
            return;
        }

        generalTodos.push({ id: 'todo_' + Date.now(), title: title });
        saveData();
        renderGeneralTodos();
        if (typeof showToast === 'function') showToast(`[TODO] Added "${title}"`);
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
        delBtn.onclick = (ev) => {
            ev.stopPropagation();
            deleteGeneralTodo(t.id);
        };

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
    const targetDateObj = new Date(dateStr);
    const dayIndex = targetDateObj.getDay();

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
    renderWeeklyPlanner();
});

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
            drawer.style.height = `200px`;
        } else { 
            drawer.classList.add('collapsed'); 
            drawer.style.display = 'none'; 
        } 
    });
}

function updateOpacity(val) {
    savedOpacity = val;
    document.documentElement.style.setProperty('--bg-opacity', val);
    const label = document.getElementById('opacity-val');
    if (label) label.innerText = val;
    localStorage.setItem('tracker_opacity', val);
}

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

function updateGlobalClock() {
    const clockEl = document.getElementById('global-clock');
    if (!clockEl) return;
    
    const now = getNow();
    const timeStr = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
    const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
    const dayName = days[now.getDay()];
    const dayNum = now.getDate().toString().padStart(2, '0');
    
    clockEl.innerText = `${timeStr} // ${dayName} ${dayNum}`;
}

setInterval(updateGlobalClock, 1000);
updateGlobalClock();

window.addEventListener('DOMContentLoaded', () => {
    initDashboard();
    renderGeneralTodos();
});