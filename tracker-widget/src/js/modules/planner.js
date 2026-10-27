// --- js/modules/planner.js ---
// Atomic Module 4: Weekly Planner (06:30 - 24:00), Left Phase Column (Auto-Injected), No Bottom Footer & Editable Ghost Layers

const PLANNER_START_HOUR = 6.5; // 06:30
let plannerZoom = 42;
window.shouldScrollPlanner = true;

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

function getWeekStart(dateStr) {
    const d = parseLocalDate(dateStr);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
}

function timeToMinutes(timeStr) {
    if (!timeStr || typeof timeStr !== 'string' || !timeStr.includes(':')) return 390;
    const [h, m] = timeStr.split(':').map(Number);
    return (h * 60) + (m || 0);
}

function minutesToTimeStr(totalMins) {
    const clamped = Math.max(390, Math.min(24 * 60, Math.round(totalMins)));
    const h = Math.floor(clamped / 60);
    const m = clamped % 60;
    if (h === 24) return '23:59';
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function timeToPx(timeStr, zoomVal = plannerZoom) {
    if (!timeStr || typeof timeStr !== 'string' || !timeStr.includes(':')) return 0;
    const [h, m] = timeStr.split(':').map(Number);
    return ((h + (m / 60)) - PLANNER_START_HOUR) * zoomVal;
}

function getDayPhaseForTime(timeStr) {
    const mins = timeToMinutes(timeStr);
    const phases = typeof DAY_PHASES !== 'undefined' ? DAY_PHASES : [];
    for (const ph of phases) {
        const pStart = timeToMinutes(ph.start);
        const pEnd = timeToMinutes(ph.end);
        if (mins >= pStart && mins < pEnd) return ph;
    }
    return phases[phases.length - 1] || { id: 'evening', short: 'EVENING', start: '20:00', end: '24:00' };
}

// Popola la colonna dedicata delle 5 Fasi a sinistra della colonna degli orari
function renderPhaseLabelsColumn(phaseColEl, zoomVal) {
    if (!phaseColEl) return;
    const totalHeight = (24 - PLANNER_START_HOUR) * zoomVal;
    phaseColEl.innerHTML = '';
    phaseColEl.style.height = `${totalHeight}px`;

    const phases = typeof DAY_PHASES !== 'undefined' ? DAY_PHASES : [];
    phases.forEach((ph, idx) => {
        const topPx = (ph.startDec - PLANNER_START_HOUR) * zoomVal;
        const heightPx = (ph.endDec - ph.startDec) * zoomVal;

        const box = document.createElement('div');
        box.className = `planner-phase-block-label ${idx % 2 === 1 ? 'alt' : ''}`;
        box.style.cssText = `top: ${topPx}px; height: ${heightPx}px;`;
        box.title = `${ph.label} (${ph.start} – ${ph.end})`;
        box.innerHTML = `<span>${escapeHtml(ph.short)}</span>`;
        phaseColEl.appendChild(box);
    });
}

// Disegna dentro le colonne della griglia SOLO le linee divisorie orizzontali delle fasi (zero scritte interne)
function appendDayPhaseBandsToColumn(colEl, zoomVal) {
    const phases = typeof DAY_PHASES !== 'undefined' ? DAY_PHASES : [];
    phases.forEach((ph, idx) => {
        const topPx = (ph.startDec - PLANNER_START_HOUR) * zoomVal;
        const heightPx = (ph.endDec - ph.startDec) * zoomVal;

        const band = document.createElement('div');
        band.className = `planner-phase-band ${idx % 2 === 1 ? 'alt' : ''}`;
        band.style.cssText = `top:${topPx}px; height:${heightPx}px;`;
        colEl.appendChild(band);
    });
}

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
        cluster.forEach(b => { b.totalCols = totalCols; });
    });
}

function renderWeeklyPlanner() {
    try {
        const sidebar = document.getElementById('reference-toggles-list');
        const headerRow = document.getElementById('planner-header');
        const scrollArea = document.getElementById('planner-scroll');
        const timeLabels = document.getElementById('planner-time-labels');
        const grid = document.getElementById('planner-grid');

        if (!sidebar || !headerRow || !timeLabels || !grid) return;

        // Auto-inietta la colonna delle Fasi a sinistra degli orari se mancante in index.html
        let phaseLabels = document.getElementById('planner-phase-labels');
        if (!phaseLabels && scrollArea) {
            phaseLabels = document.createElement('div');
            phaseLabels.id = 'planner-phase-labels';
            phaseLabels.className = 'planner-phase-labels';
            scrollArea.insertBefore(phaseLabels, timeLabels);
        }

        // Allinea l'header alle 2 colonne di sinistra (58px Fasi + 45px Orari = 103px) e rimuove il vecchio footer
        headerRow.style.paddingLeft = '103px';
        const oldFooter = document.getElementById('planner-fixed-footer');
        if (oldFooter) oldFooter.remove();

        sidebar.innerHTML = '';
        referenceLayers.forEach(ref => {
            if (!ref || !ref.id) return;
            const wrap = document.createElement('div');
            wrap.className = 'ref-toggle-wrap';
            wrap.style.cssText = `border-left: 2px solid ${ref.color}; margin-bottom: 5px; justify-content: space-between;`;

            const lbl = document.createElement('label');
            lbl.style.cssText = 'display:flex; align-items:center; color:#ccc; cursor:pointer; gap: 5px; flex: 1; min-width: 0;';

            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = !!refToggles[ref.id];
            cb.onchange = () => toggleReference(ref.id, cb.checked);

            const spanTxt = document.createElement('span');
            spanTxt.style.cssText = 'overflow:hidden; text-overflow:ellipsis; white-space:nowrap;';
            spanTxt.textContent = ref.title;

            lbl.appendChild(cb);
            lbl.appendChild(spanTxt);

            const actBox = document.createElement('div');
            actBox.style.cssText = 'display:flex; gap:4px; align-items:center;';

            const editBtn = document.createElement('button');
            editBtn.className = 'icon-btn';
            editBtn.style.fontSize = '0.65rem';
            editBtn.textContent = '[EDIT]';
            editBtn.onclick = (e) => {
                e.stopPropagation();
                openReferenceModal(ref.id);
            };

            const delBtn = document.createElement('button');
            delBtn.className = 'ref-del-btn';
            delBtn.textContent = '[X]';
            delBtn.onclick = (e) => {
                e.stopPropagation();
                deleteReference(ref.id);
            };

            actBox.appendChild(editBtn);
            actBox.appendChild(delBtn);

            wrap.appendChild(lbl);
            wrap.appendChild(actBox);
            sidebar.appendChild(wrap);
        });

        const totalGridHeight = (24 - PLANNER_START_HOUR) * plannerZoom;

        // 1. Colonna delle 5 Fasi a sinistra degli orari
        renderPhaseLabelsColumn(phaseLabels, plannerZoom);

        // 2. Colonna degli orari (06:30 - 23:00)
        timeLabels.innerHTML = '';
        timeLabels.style.height = `${totalGridHeight}px`;

        const tl630 = document.createElement('div');
        tl630.className = 'time-label';
        tl630.style.top = `0px`;
        tl630.textContent = `06:30`;
        timeLabels.appendChild(tl630);

        for (let h = 7; h < 24; h++) {
            const tl = document.createElement('div');
            tl.className = 'time-label';
            tl.style.top = `${(h - PLANNER_START_HOUR) * plannerZoom}px`;
            tl.textContent = `${h.toString().padStart(2, '0')}:00`;
            timeLabels.appendChild(tl);
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
            headerCell.style.cursor = 'pointer';
            headerCell.onclick = () => selectDate(loopDateStr);
            headerCell.innerHTML = `<div class="day-title">${days[i]} ${currentD.getDate()}</div>`;
            headerRow.appendChild(headerCell);

            const dayCol = document.createElement('div');
            dayCol.className = 'planner-col-absolute';
            dayCol.style.height = `${totalGridHeight}px`;
            dayCol.oncontextmenu = (e) => restorePlannerInstances(e, loopDateStr);

            // Linee divisorie delle 5 Fasi (senza scritte dentro la griglia)
            appendDayPhaseBandsToColumn(dayCol, plannerZoom);

            const line630 = document.createElement('div');
            line630.className = 'grid-line-abs';
            line630.style.top = `0px`;
            dayCol.appendChild(line630);

            for (let h = 7; h <= 24; h++) {
                const line = document.createElement('div');
                line.className = 'grid-line-abs';
                line.style.top = `${(h - PLANNER_START_HOUR) * plannerZoom}px`;
                dayCol.appendChild(line);
            }

            const customDayBlocks = Array.isArray(ephemeralData[loopDateStr]) ? ephemeralData[loopDateStr] : [];

            // 1. Ghost Layers
            referenceLayers.forEach(ref => {
                if (ref && refToggles[ref.id]) {
                    (ref.timeWindows || []).forEach(tw => {
                        if (tw.days && tw.days.includes(jsDay)) {
                            const isLocked = customDayBlocks.some(b =>
                                b.isTransport && b.refId === ref.id && b.start === tw.start && b.end === tw.end
                            );
                            if (isLocked) return;

                            const top = timeToPx(tw.start);
                            const height = Math.max(timeToPx(tw.end) - top, 6);
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

            // 2. Blocchi Orari
            const dayBlocks = [];

            templates.forEach(t => {
                if (t && isTaskActiveOnDate(t, loopDateStr) && t.timeWindows && t.timeWindows.length > 0) {
                    t.timeWindows.forEach(tw => {
                        if (tw.days && tw.days.includes(jsDay)) {
                            if (plannerExceptions[`${t.id}_${loopDateStr}_${tw.start}`]) return;
                            const top = timeToPx(tw.start);
                            const height = Math.max(timeToPx(tw.end) - top, 7);
                            if (top + height > 0) {
                                dayBlocks.push({
                                    kind: 'task', id: t.id, title: t.title, category: t.category,
                                    color: t.color || '#ffffff', start: tw.start, end: tw.end,
                                    top, height, bottom: top + height
                                });
                            }
                        }
                    });
                }
            });

            (routinesData || []).forEach(r => {
                if (r && r.type === 'timed' && typeof isRoutineActiveOnDate === 'function' && isRoutineActiveOnDate(r, loopDateStr) && Array.isArray(r.timeWindows)) {
                    r.timeWindows.forEach(tw => {
                        if (tw.days && tw.days.includes(jsDay)) {
                            const top = timeToPx(tw.start);
                            const height = Math.max(timeToPx(tw.end) - top, 7);
                            if (top + height > 0) {
                                dayBlocks.push({
                                    kind: 'routine', id: r.id, title: r.title, category: 'Routine',
                                    color: r.color || '#b08d43', start: tw.start, end: tw.end,
                                    top, height, bottom: top + height
                                });
                            }
                        }
                    });
                }
            });

            customDayBlocks.forEach(cb => {
                const top = timeToPx(cb.start);
                const height = Math.max(timeToPx(cb.end) - top, 7);
                if (top + height > 0) {
                    dayBlocks.push({
                        kind: 'ephemeral',
                        id: cb.id,
                        templateId: cb.templateId,
                        isTransport: cb.isTransport,
                        title: cb.title,
                        category: cb.category || 'Planned',
                        color: cb.color || '#ffffff',
                        start: cb.start,
                        end: cb.end,
                        top, height, bottom: top + height
                    });
                }
            });

            specificEvents.forEach(e => {
                if (e && e.date === loopDateStr && e.start && e.end) {
                    const top = timeToPx(e.start);
                    const height = Math.max(timeToPx(e.end) - top, 10);
                    if (top + height > 0) {
                        dayBlocks.push({
                            kind: 'event', id: e.id, title: e.title, category: 'Single Event',
                            color: e.color || '#b84b4b', start: e.start, end: e.end,
                            top, height, bottom: top + height
                        });
                    }
                }
            });

            computeOverlapColumns(dayBlocks);

            dayBlocks.forEach(b => {
                const block = document.createElement('div');
                block.className = `block-absolute ${b.kind === 'event' ? 'block-event' : 'block-task'}`;
                const widthPct = 100 / (b.totalCols || 1);
                const leftPct = (b.colIndex || 0) * widthPct;
                const isCompact = b.height < 16;

                block.style.cssText = `
                    top: ${b.top}px;
                    height: ${b.height}px;
                    left: calc(${leftPct}% + 1px);
                    width: calc(${widthPct}% - 2px);
                    border-left: 3px solid ${b.color};
                    color: ${b.color};
                    padding: ${isCompact ? '0px 4px' : '2px 5px'};
                    font-size: ${isCompact ? '0.62rem' : 'var(--font-xs)'};
                    line-height: ${isCompact ? '1' : '1.2'};
                `;

                const bTag = document.createElement('b');
                bTag.textContent = (b.isTransport ? '🚆 ' : '') + b.title;
                block.appendChild(bTag);

                const phaseMeta = getDayPhaseForTime(b.start);
                block.onmouseenter = (ev) => showTooltip(ev, b.title, `${b.start} - ${b.end} (${phaseMeta.short})`, b.category);
                block.onmousemove = moveTooltip;
                block.onmouseleave = hideTooltip;

                if (b.kind === 'task') {
                    block.oncontextmenu = (ev) => hidePlannerInstance(ev, b.id, loopDateStr, b.start);
                } else if (b.kind === 'ephemeral') {
                    block.oncontextmenu = (ev) => {
                        ev.preventDefault();
                        ev.stopPropagation();
                        if (typeof removeTomorrowTimelineBlock === 'function') {
                            removeTomorrowTimelineBlock(loopDateStr, b.id);
                        }
                    };
                }
                dayCol.appendChild(block);
            });

            grid.appendChild(dayCol);
        }

        if (scrollArea) {
            if (!document.getElementById('planner-hover-line')) {
                const hl = document.createElement('div');
                hl.id = 'planner-hover-line';
                hl.style.cssText = 'display:none; position:absolute; left:0; right:0; height:0; border-top:1px solid rgba(255,255,255,0.3); pointer-events:none; z-index:50;';
                hl.innerHTML = '<div id="planner-hover-time" style="position:absolute; left:60px; top:-9px; width:40px; text-align:center; background:#050505; color:#fff; font-size:var(--font-xs); padding:1px 0; border: 1px solid #444; z-index:100;"></div>';
                scrollArea.appendChild(hl);

                scrollArea.addEventListener('mousemove', function(e) {
                    const rect = scrollArea.getBoundingClientRect();
                    const y = e.clientY - rect.top + scrollArea.scrollTop;
                    const relativeY = y - 8;
                    const hoursDec = (relativeY / plannerZoom) + PLANNER_START_HOUR;

                    if (hoursDec >= PLANNER_START_HOUR && hoursDec <= 24 && relativeY >= 0) {
                        const h = Math.floor(hoursDec);
                        const m = Math.floor((hoursDec - h) * 60);
                        document.getElementById('planner-hover-time').innerText = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
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
                        plannerZoom = Math.max(22, Math.min(120, plannerZoom));
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
    plannerExceptions[`${taskId}_${dateStr}_${startTime}`] = true;
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

function drawCurrentTimeLine() {
    document.querySelectorAll('.current-time-line').forEach(e => e.remove());
    const now = getNow();
    const h = now.getHours();
    const m = now.getMinutes();
    const curHourDec = h + (m / 60);

    if (curHourDec < PLANNER_START_HOUR) return;

    // 1. Weekly Planner
    const weekStart = getWeekStart(selectedDateStr);
    const daysDiff = Math.floor((now - weekStart) / (1000 * 60 * 60 * 24));

    if (daysDiff >= 0 && daysDiff < 7) {
        const cols = document.querySelectorAll('#planner-grid .planner-col-absolute');
        if (cols[daysDiff]) {
            const top = (curHourDec - PLANNER_START_HOUR) * plannerZoom;
            const line = document.createElement('div');
            line.className = 'current-time-line';
            line.style.top = `${top}px`;
            cols[daysDiff].appendChild(line);

            if (window.shouldScrollPlanner) {
                const scrollArea = document.getElementById('planner-scroll');
                if (scrollArea) scrollArea.scrollTop = top - (scrollArea.clientHeight / 2);
                window.shouldScrollPlanner = false;
            }
        }
    }

    // 2. Day Planner
    const dayPlanCanvas = document.getElementById('plan-mod-day-canvas');
    if (dayPlanCanvas && typeof planBuilderDateStr !== 'undefined' && planBuilderDateStr === todayStr) {
        const topDay = (curHourDec - PLANNER_START_HOUR) * (typeof tmwTimelineZoom !== 'undefined' ? tmwTimelineZoom : 46);
        const lineDay = document.createElement('div');
        lineDay.className = 'current-time-line';
        lineDay.style.top = `${topDay}px`;
        dayPlanCanvas.appendChild(lineDay);
    }
}

setInterval(drawCurrentTimeLine, 60000);

// --- GHOST LAYERS CRUD (CREAZIONE E MODIFICA COMPLETA) ---
function addRefTimeWindow(start = '', end = '', days = []) {
    const container = document.getElementById('ref-time-windows-container');
    if (!container) return;
    const div = document.createElement('div');
    div.className = 'ref-time-window-row';
    div.style.cssText = 'border: 1px solid #333; padding: 10px; margin-bottom: 10px; background: rgba(255,255,255,0.02);';

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

function openReferenceModal(refId = null) {
    const form = document.getElementById('referenceForm');
    if (!form) return;
    form.reset();

    const cont = document.getElementById('ref-time-windows-container');
    if (cont) cont.innerHTML = '';

    if (refId) {
        const ref = referenceLayers.find(x => x.id === refId);
        if (!ref) return;
        document.getElementById('ref-id').value = ref.id;
        document.getElementById('ref-title').value = ref.title;
        const cInp = document.getElementById('r-color');
        cInp.value = ref.color || '#444444';
        updateCustomColor(cInp, 'r-color');

        if (Array.isArray(ref.timeWindows) && ref.timeWindows.length > 0) {
            ref.timeWindows.forEach(tw => addRefTimeWindow(tw.start, tw.end, tw.days || []));
        } else {
            addRefTimeWindow();
        }
    } else {
        document.getElementById('ref-id').value = "";
        addRefTimeWindow();
        const cInp = document.getElementById('r-color');
        cInp.value = '#444444';
        updateCustomColor(cInp, 'r-color');
    }

    closeModals();
    document.getElementById('referenceModal').style.display = 'flex';
}

document.getElementById('referenceForm')?.addEventListener('submit', function(e) {
    e.preventDefault();
    const existingId = document.getElementById('ref-id').value;
    const title = document.getElementById('ref-title').value.trim();
    const color = document.getElementById('r-color').value || '#444444';
    let timeWindows = [];

    document.querySelectorAll('.ref-time-window-row').forEach(row => {
        const start = row.querySelector('.ref-start').value;
        const end = row.querySelector('.ref-end').value;
        let days = [];
        row.querySelectorAll('.tw-day-check:checked').forEach(cb => days.push(parseInt(cb.value, 10)));
        if (start && end && days.length > 0) timeWindows.push({ start, end, days });
    });

    if (timeWindows.length === 0) {
        alert("Please complete at least one time window!");
        return;
    }

    if (existingId) {
        const ref = referenceLayers.find(x => x.id === existingId);
        if (ref) {
            ref.title = title;
            ref.timeWindows = timeWindows;
            ref.color = color;
        }
    } else {
        const newId = 'r_' + Date.now();
        referenceLayers.push({ id: newId, title, timeWindows, color, opacity: '0.8' });
        refToggles[newId] = true;
    }

    saveData();
    closeModals();
    renderWeeklyPlanner();
    if (typeof renderDayPlannerModule === 'function') renderDayPlannerModule();
    if (typeof renderGhostLayersManagerList === 'function') renderGhostLayersManagerList();
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
    if (typeof renderDayPlannerModule === 'function') renderDayPlannerModule();
}