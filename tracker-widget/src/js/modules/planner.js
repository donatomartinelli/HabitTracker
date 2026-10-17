// --- js/modules/planner.js ---
// Atomic Module 4: Weekly Planner (06:30 - 24:00), Blocchi Proporzionali & Fascia Flessibile Fissa a Fine Giornata

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
    const d = new Date(dateStr);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
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
        const timeLabels = document.getElementById('planner-time-labels');
        const grid = document.getElementById('planner-grid');
        const fixedFooter = document.getElementById('planner-fixed-footer');

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

        const totalGridHeight = (24 - PLANNER_START_HOUR) * plannerZoom;

        timeLabels.innerHTML = '';
        timeLabels.style.height = `${totalGridHeight}px`;

        // Etichetta iniziale 06:30 + tutte le ore piene dalle 07:00 alle 23:00
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
        if (fixedFooter) fixedFooter.innerHTML = '';

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

            // Fascia fissa a fine giornata per ogni colonna (mostra le task flessibili non piazzate su orario e gli eventi)
            if (fixedFooter) {
                const footerCell = document.createElement('div');
                footerCell.style.cssText = 'flex: 1; border-right: 1px solid var(--border-color); padding: 4px; display: flex; flex-direction: column; gap: 3px; min-width: 0;';
                if (i === 6) footerCell.style.borderRight = 'none';

                const dayCustomBlocks = Array.isArray(ephemeralData[loopDateStr]) ? ephemeralData[loopDateStr] : [];

                specificEvents.forEach(e => {
                    if (e && e.date === loopDateStr && (!e.start || !e.end)) {
                        const badge = document.createElement('div');
                        badge.className = 'flexible-task-badge';
                        badge.style.borderLeft = `2px solid ${e.color}`;
                        badge.textContent = `[*] ${e.title}`;
                        footerCell.appendChild(badge);
                    }
                });

                templates.forEach(t => {
                    if (t && isTaskActiveOnDate(t, loopDateStr)) {
                        const isFlex = (t.type === 'untimed' || (!t.type && (!t.timeWindows || t.timeWindows.length === 0)));
                        const placedCount = dayCustomBlocks.filter(b => b.templateId === t.id).length;
                        if (isFlex && placedCount < (t.instances || 1)) {
                            const badge = document.createElement('div');
                            badge.className = 'flexible-task-badge';
                            badge.style.borderLeft = `2px solid ${t.color || '#fff'}`;
                            const rem = (t.instances || 1) - placedCount;
                            badge.textContent = `${t.title}${rem > 1 ? ' x' + rem : ''}`;
                            footerCell.appendChild(badge);
                        }
                    }
                });

                fixedFooter.appendChild(footerCell);
            }

            const dayCol = document.createElement('div');
            dayCol.className = 'planner-col-absolute';
            dayCol.style.height = `${totalGridHeight}px`;
            dayCol.oncontextmenu = (e) => restorePlannerInstances(e, loopDateStr);

            // Linea 06:30 + linee orarie
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

            // 1. Ghost Layers
            referenceLayers.forEach(ref => {
                if (ref && refToggles[ref.id]) {
                    (ref.timeWindows || []).forEach(tw => {
                        if (tw.days && tw.days.includes(jsDay)) {
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

            // 2. Blocchi Orari (Task fisse + Blocchi posizionati sulla Timeline del giorno + Eventi con orario)
            const dayBlocks = [];

            templates.forEach(t => {
                if (t && isTaskActiveOnDate(t, loopDateStr) && t.timeWindows && t.timeWindows.length > 0) {
                    t.timeWindows.forEach(tw => {
                        if (tw.days && tw.days.includes(jsDay)) {
                            if (plannerExceptions[`${t.id}_${loopDateStr}_${tw.start}`]) return;
                            const top = timeToPx(tw.start);
                            const height = Math.max(timeToPx(tw.end) - top, 7); // Proporzionale anche per 10 min
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

            // Blocchi posizionati tramite Plan Tomorrow Timeline per quella data specifica
            const customDayBlocks = Array.isArray(ephemeralData[loopDateStr]) ? ephemeralData[loopDateStr] : [];
            customDayBlocks.forEach(cb => {
                const top = timeToPx(cb.start);
                const height = Math.max(timeToPx(cb.end) - top, 7);
                if (top + height > 0) {
                    dayBlocks.push({
                        kind: 'ephemeral',
                        id: cb.id,
                        templateId: cb.templateId,
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
                bTag.textContent = b.title;
                block.appendChild(bTag);

                block.onmouseenter = (ev) => showTooltip(ev, b.title, `${b.start} - ${b.end}`, b.category);
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

    const weekStart = getWeekStart(selectedDateStr);
    const daysDiff = Math.floor((now - weekStart) / (1000 * 60 * 60 * 24));

    if (daysDiff >= 0 && daysDiff < 7) {
        const cols = document.querySelectorAll('#planner-grid .planner-col-absolute');
        if (cols[daysDiff] && curHourDec >= PLANNER_START_HOUR) {
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
}

setInterval(drawCurrentTimeLine, 60000);

// --- GHOST LAYERS CRUD ---
function addRefTimeWindow(start = '', end = '', days = []) {
    const container = document.getElementById('ref-time-windows-container');
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
        row.querySelectorAll('.tw-day-check:checked').forEach(cb => days.push(parseInt(cb.value, 10)));
        if (start && end && days.length > 0) timeWindows.push({ start, end, days });
    });

    if (timeWindows.length === 0) {
        alert("Please complete at least one time window!");
        return;
    }

    const id = document.getElementById('ref-id').value || 'r_' + Date.now();
    if (document.getElementById('ref-id').value) {
        const ref = referenceLayers.find(x => x.id === id);
        if (ref) { ref.title = title; ref.timeWindows = timeWindows; ref.color = color; }
    } else {
        referenceLayers.push({ id, title, timeWindows, color, opacity: '0.8' });
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