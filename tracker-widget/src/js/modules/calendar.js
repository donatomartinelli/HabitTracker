// --- js/modules/calendar.js ---
// ATOMIC MODULE 1 & SUB-MODULES:
// - cal_grid (#module-cal-grid): Griglia mensile rigida (Max 3 pallini + "+N")
// - cal_agenda (#module-cal-agenda): Lista eventi del giorno selezionato con Popover Colore/Orario

let activeEventPopoverEl = null;

function closeEventQuickEditPopover() {
    if (activeEventPopoverEl) {
        activeEventPopoverEl.remove();
        activeEventPopoverEl = null;
    }
}

document.addEventListener('mousedown', (e) => {
    if (activeEventPopoverEl && !activeEventPopoverEl.contains(e.target) && !e.target.closest('.ev-edit-trigger')) {
        closeEventQuickEditPopover();
    }
});

function openEventQuickEditPopover(eventId, anchorEl) {
    const ev = specificEvents.find(x => x.id === eventId);
    if (!ev || !anchorEl) return;

    if (activeEventPopoverEl && activeEventPopoverEl.dataset.eventId === eventId) {
        closeEventQuickEditPopover();
        return;
    }
    closeEventQuickEditPopover();

    const rect = anchorEl.getBoundingClientRect();
    const pop = document.createElement('div');
    pop.dataset.eventId = eventId;
    pop.style.cssText = `
        position: fixed;
        top: ${Math.min(window.innerHeight - 190, Math.round(rect.bottom + 6))}px;
        left: ${Math.min(window.innerWidth - 260, Math.max(8, Math.round(rect.left)))}px;
        width: 245px;
        background: #060606;
        border: 1px solid var(--text-main);
        padding: 10px;
        z-index: 9800;
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.96);
        display: flex;
        flex-direction: column;
        gap: 8px;
    `;

    const paletteColors = ['#b84b4b', '#5f7a61', '#4c5b73', '#b08d43', '#725b7a', '#ffffff', '#6e7073'];
    const circlesHtml = paletteColors.map(c => `
        <div class="color-circle ${ev.color === c ? 'active' : ''}" data-col="${c}" style="width:20px; height:20px; background:${c};"></div>
    `).join('');

    pop.innerHTML = `
        <input type="text" class="form-control form-control-sm ev-pop-title" value="${escapeHtml(ev.title)}" placeholder="Event title...">
        <div style="display:flex; gap:6px; align-items:center;">
            <input type="time" class="form-control form-control-sm ev-pop-start" style="flex:1; padding:3px 6px;" value="${ev.start || ''}">
            <span style="color:var(--text-dim);">-</span>
            <input type="time" class="form-control form-control-sm ev-pop-end" style="flex:1; padding:3px 6px;" value="${ev.end || ''}">
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center;">
            <div style="display:flex; gap:5px;">${circlesHtml}</div>
            <input type="color" class="ev-pop-custom-col" value="${ev.color || '#b84b4b'}" style="width:22px; height:20px; border:1px solid #444; background:transparent; cursor:pointer;">
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; padding-top:4px; border-top:1px dotted #222;">
            <button type="button" class="btn btn-danger btn-sm ev-pop-del" style="padding:2px 6px;">[DELETE]</button>
            <button type="button" class="btn btn-primary btn-sm ev-pop-save" style="padding:2px 8px;">[SAVE]</button>
        </div>
    `;

    let selectedColor = ev.color || '#b84b4b';

    pop.querySelectorAll('.color-circle').forEach(circle => {
        circle.onclick = () => {
            pop.querySelectorAll('.color-circle').forEach(c => c.classList.remove('active'));
            circle.classList.add('active');
            selectedColor = circle.dataset.col;
            ev.color = selectedColor;
            saveData();
            renderCalendar();
            if (typeof renderTasks === 'function') renderTasks();
            if (typeof renderWeeklyPlanner === 'function') renderWeeklyPlanner();
            if (typeof renderDayPlannerModule === 'function') renderDayPlannerModule();
        };
    });

    const customColInp = pop.querySelector('.ev-pop-custom-col');
    customColInp.oninput = () => {
        selectedColor = customColInp.value;
    };

    const saveEvChanges = () => {
        const newTitle = pop.querySelector('.ev-pop-title').value.trim();
        const st = pop.querySelector('.ev-pop-start').value;
        const en = pop.querySelector('.ev-pop-end').value;
        if (newTitle) ev.title = newTitle;
        ev.start = st || null;
        if (st && !en) {
            const [sh, sm] = st.split(':').map(Number);
            const tot = Math.min(23 * 60 + 59, (sh * 60 + (sm || 0)) + 60);
            ev.end = `${String(Math.floor(tot / 60)).padStart(2, '0')}:${String(tot % 60).padStart(2, '0')}`;
        } else {
            ev.end = en || null;
        }
        ev.color = selectedColor;

        saveData();
        closeEventQuickEditPopover();
        renderCalendar();
        if (typeof renderTasks === 'function') renderTasks();
        if (typeof renderWeeklyPlanner === 'function') renderWeeklyPlanner();
        if (typeof renderDayPlannerModule === 'function') renderDayPlannerModule();
    };

    pop.querySelector('.ev-pop-save').onclick = saveEvChanges;
    pop.querySelector('.ev-pop-del').onclick = () => {
        closeEventQuickEditPopover();
        deleteEvent(ev.id);
    };
    pop.querySelectorAll('input').forEach(inp => {
        inp.onkeydown = (e) => {
            if (e.key === 'Enter') { e.preventDefault(); saveEvChanges(); }
            else if (e.key === 'Escape') { e.preventDefault(); closeEventQuickEditPopover(); }
        };
    });

    document.body.appendChild(pop);
    activeEventPopoverEl = pop;
}

function selectDate(dateStr) {
    selectedDateStr = dateStr;
    if (typeof planBuilderDateStr !== 'undefined') {
        planBuilderDateStr = dateStr < todayStr ? todayStr : dateStr;
    }
    renderCalendar();
    if (typeof renderTasks === 'function') renderTasks();
    if (typeof renderWeeklyPlanner === 'function') renderWeeklyPlanner();
    if (typeof renderDayPlannerModule === 'function') renderDayPlannerModule();
    if (typeof renderDiet === 'function') renderDiet();
    if (typeof renderGymDashboard === 'function') renderGymDashboard();
}

function changeMonth(dir) {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + dir);
    renderCalendar();
}

function buildMonthGridDom(targetGridEl) {
    if (!targetGridEl) return;
    targetGridEl.innerHTML = '';
    const frag = document.createDocumentFragment();

    ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].forEach(d => {
        const lbl = document.createElement('div');
        lbl.className = 'day-label';
        lbl.textContent = d;
        frag.appendChild(lbl);
    });

    const firstDay = new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth(), 1);
    const lastDay = new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth() + 1, 0);
    const startOffset = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;

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

        const numSpan = document.createElement('span');
        numSpan.textContent = i;
        dayCell.appendChild(numSpan);

        // Max 3 pallini + badge "+N" per non deformare mai la colonna
        if (dayEvents.length > 0) {
            const barsContainer = document.createElement('div');
            barsContainer.className = 'bars-container';
            dayEvents.slice(0, 3).forEach(e => {
                const bar = document.createElement('div');
                bar.className = 'bar';
                bar.style.backgroundColor = e.color;
                barsContainer.appendChild(bar);
            });
            if (dayEvents.length > 3) {
                const moreSpan = document.createElement('span');
                moreSpan.className = 'bar-more';
                moreSpan.textContent = `+${dayEvents.length - 3}`;
                barsContainer.appendChild(moreSpan);
            }
            dayCell.appendChild(barsContainer);
        }

        dayCell.onclick = () => selectDate(cellDateStr);
        frag.appendChild(dayCell);
    }

    targetGridEl.appendChild(frag);
}

function buildDayEventsListDom(targetListEl) {
    if (!targetListEl) return;
    targetListEl.innerHTML = '';

    const dayEvents = specificEvents.filter(e => e.date === selectedDateStr);
    if (dayEvents.length === 0) {
        targetListEl.innerHTML = `<div class="empty-state">[ NONE ]</div>`;
        return;
    }

    dayEvents.forEach(e => {
        const evRow = document.createElement('div');
        evRow.className = 'ev-edit-trigger';
        evRow.style.cssText = `font-size: var(--font-xs); padding: 6px 8px; border: 1px solid var(--border-color); border-left: 3px solid ${e.color}; display: flex; justify-content: space-between; align-items: center; cursor: pointer;`;
        const timeBadge = (e.start && e.end) ? `[${e.start}–${e.end}] ` : (e.start ? `[${e.start}] ` : '');
        evRow.innerHTML = `<strong style="color:${e.color}; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(timeBadge + e.title)}</strong>`;

        evRow.onclick = (ev) => {
            if (ev.target.closest('.delete')) return;
            openEventQuickEditPopover(e.id, evRow);
        };

        const delBtn = document.createElement('button');
        delBtn.className = 'icon-btn delete';
        delBtn.textContent = '[X]';
        delBtn.onclick = (ev) => {
            ev.stopPropagation();
            deleteEvent(e.id);
        };
        evRow.appendChild(delBtn);
        targetListEl.appendChild(evRow);
    });
}

// ============================================================================
// SOTTO-MODULO 1: CALENDAR: MONTH GRID (#module-cal-grid)
// ============================================================================

function renderCalendarAtomGrid() {
    const root = document.getElementById('module-cal-grid');
    if (!root) return;

    const monthNames = [
        "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
        "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"
    ];
    const monthLabel = `${monthNames[currentCalendarDate.getMonth()]} ${currentCalendarDate.getFullYear()}`;

    root.innerHTML = `
        <div class="module-body-padded" style="flex:1; display:flex; flex-direction:column; gap:12px; overflow-y:auto;">
            <div class="section-header-row" style="margin-bottom:0;">
                <div>
                    <span class="section-label">Calendar</span>
                    <span style="font-size:var(--font-xs); color:var(--text-dim); margin-left:6px;">// ${monthLabel}</span>
                </div>
                <div style="display:flex; gap:6px; align-items:center;">
                    <button type="button" class="btn btn-sm" onclick="changeMonth(-1)">[&lt;]</button>
                    <button type="button" class="btn btn-sm" onclick="changeMonth(1)">[&gt;]</button>
                </div>
            </div>
            <div class="month-grid" id="cal-atom-grid-mount"></div>
        </div>
    `;

    buildMonthGridDom(root.querySelector('#cal-atom-grid-mount'));
}

// ============================================================================
// SOTTO-MODULO 2: CALENDAR: DAY EVENTS (#module-cal-agenda)
// ============================================================================

function renderCalendarAtomAgenda() {
    const root = document.getElementById('module-cal-agenda');
    if (!root) return;

    root.innerHTML = `
        <div class="module-body-padded" style="flex:1; display:flex; flex-direction:column; gap:10px; overflow-y:auto;">
            <div class="section-header-row" style="margin-bottom:0;">
                <div>
                    <span class="section-label">Day Events</span>
                    <span style="font-size:var(--font-xs); color:var(--text-dim); margin-left:6px;">// ${selectedDateStr}</span>
                </div>
                <button type="button" class="btn btn-sm" onclick="openCreationModal('event')">[+]</button>
            </div>
            <div id="cal-atom-agenda-mount" style="display:flex; flex-direction:column; gap:6px;"></div>
        </div>
    `;

    buildDayEventsListDom(root.querySelector('#cal-atom-agenda-mount'));
}

function renderCalendar() {
    renderCalendarAtomGrid();
    renderCalendarAtomAgenda();

    // Aggiorna anche eventuale contenitore legacy #module-calendar
    const legacyGrid = document.getElementById('calendar-grid');
    if (legacyGrid) {
        const monthNames = [
            "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
            "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"
        ];
        const monthNameEl = document.getElementById('calendar-month-name');
        if (monthNameEl) {
            monthNameEl.innerText = `// ${monthNames[currentCalendarDate.getMonth()]} ${currentCalendarDate.getFullYear()}`;
        }
        buildMonthGridDom(legacyGrid);
        renderCalendarDaySummary();
    }
}

function renderCalendarDaySummary() {
    renderCalendarAtomAgenda();
    const lbl = document.getElementById('calendar-selected-day-label');
    const cont = document.getElementById('calendar-day-summary');
    if (!cont) return;
    if (lbl) lbl.textContent = `EVENTS // ${selectedDateStr}`;
    buildDayEventsListDom(cont);
}

window.addEventListener('DOMContentLoaded', () => {
    renderCalendar();
});