// --- ATOMIC MODULE 1: CALENDAR & JOURNAL ---

function selectDate(dateStr) {
    selectedDateStr = dateStr;
    renderCalendar();
    if (typeof renderTasks === 'function') renderTasks();
    if (typeof renderWeeklyPlanner === 'function') renderWeeklyPlanner();
    if (typeof renderDiet === 'function') renderDiet();
}

function changeMonth(dir) {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + dir);
    renderCalendar();
}

function renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    if (!grid) return;

    const monthNames = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];
    const monthNameEl = document.getElementById('calendar-month-name');
    if (monthNameEl) {
        monthNameEl.innerText = `${monthNames[currentCalendarDate.getMonth()]} ${currentCalendarDate.getFullYear()}`;
    }

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
    renderCalendarDaySummary();
}

function renderCalendarDaySummary() {
    const lbl = document.getElementById('calendar-selected-day-label');
    const cont = document.getElementById('calendar-day-summary');
    if (!cont) return;

    if (lbl) lbl.textContent = `OVERVIEW // ${selectedDateStr}`;
    cont.innerHTML = '';

    const dayEvents = specificEvents.filter(e => e.date === selectedDateStr);
    const stats = getStatsForDate(selectedDateStr);
    const hasJournal = !!(journals[selectedDateStr] && journals[selectedDateStr].trim());

    const statsRow = document.createElement('div');
    statsRow.style.cssText = 'font-size: var(--font-xs); color: var(--text-muted); padding: 6px 8px; border: 1px solid var(--border-color); background: rgba(255,255,255,0.015); display: flex; justify-content: space-between;';
    statsRow.innerHTML = `
        <span>TASKS COMPLETED: <strong style="color:var(--text-main);">${stats.completed}/${stats.total}</strong></span>
        <span style="color:${hasJournal ? 'var(--accent-green)' : 'var(--text-dim)'};">${hasJournal ? '[JOURNAL WRITTEN]' : '[NO JOURNAL]'}</span>
    `;
    cont.appendChild(statsRow);

    if (dayEvents.length > 0) {
        dayEvents.forEach(e => {
            const evRow = document.createElement('div');
            evRow.style.cssText = `font-size: var(--font-xs); padding: 6px 8px; border: 1px solid var(--border-color); border-left: 3px solid ${e.color}; display: flex; justify-content: space-between; align-items: center;`;
            const timeBadge = (e.start && e.end) ? `[${e.start}-${e.end}] ` : '';
            evRow.innerHTML = `<strong style="color:${e.color};">${escapeHtml(timeBadge + e.title)}</strong>`;
            const delBtn = document.createElement('button');
            delBtn.className = 'icon-btn delete';
            delBtn.textContent = '[X]';
            delBtn.onclick = () => deleteEvent(e.id);
            evRow.appendChild(delBtn);
            cont.appendChild(evRow);
        });
    }
}

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
    renderCalendarDaySummary();
    if (typeof showToast === 'function') showToast(`[JOURNAL] Saved entry for ${dateStr}`);
}