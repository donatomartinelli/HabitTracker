// --- js/modules/focus.js ---
// Pomodoro Engine (Timestamp-accurate), Header Inline Focus Bar + Bottom Progress Line & Fullscreen Toggle

let pomodoroInterval;
let focusPlaylist = [];
let isPomodoroPaused = false;
let isFullscreenFocusOpen = false;
let currentPlaylistIndex = 0;
let timeRemaining = 0;
let totalPhaseTime = 0;
let phaseEndTimeMs = 0;

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playBeep(frequency, duration) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, audioCtx.currentTime);
    gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + duration);
}

// Restituisce i minuti reali di una task (0 se è una routine Check-Only o Medicina)
function getTaskDurationMinutes(t, dateStr = selectedDateStr) {
    if (!t || t.type === 'medicine' || t.noTimer) return 0;

    if (t.type === 'timed' && t.timeWindows && t.timeWindows.length > 0) {
        const dayIdx = new Date(dateStr).getDay();
        const matchingTw = t.timeWindows.find(w => w.days && w.days.includes(dayIdx)) || t.timeWindows[0];
        if (matchingTw && matchingTw.start && matchingTw.end) {
            const [sh, sm] = matchingTw.start.split(':').map(Number);
            const [eh, em] = matchingTw.end.split(':').map(Number);
            const diff = (eh * 60 + em) - (sh * 60 + sm);
            if (diff > 0) return diff;
        }
    }

    const mins = parseInt(t.timerMinutes, 10);
    if (!isNaN(mins) && mins <= 0) return 0;
    return mins || 25;
}

// Cerca una task reale per nome o per categoria (es. "Duolingo" o "French")
function findMatchingTaskForFocus(queryStr) {
    const q = (queryStr || '').trim().toLowerCase();
    if (!q) return null;

    const validTemplates = templates.filter(t => getTaskDurationMinutes(t, selectedDateStr) > 0);
    const activeToday = validTemplates.filter(t => isTaskActiveOnDate(t, selectedDateStr));

    // 1. Priorità: Task attive oggi non ancora completate
    const uncompletedActive = activeToday.filter(t => {
        const curLog = (logs[selectedDateStr] && logs[selectedDateStr][t.id]) || Array(t.instances || 1).fill(false);
        return curLog.some(x => !x);
    });

    let match = uncompletedActive.find(t => t.title.toLowerCase() === q || t.category.toLowerCase() === q)
        || uncompletedActive.find(t => t.title.toLowerCase().includes(q) || t.category.toLowerCase().includes(q));
    if (match) return match;

    // 2. Qualsiasi task attiva oggi
    match = activeToday.find(t => t.title.toLowerCase() === q || t.category.toLowerCase() === q)
        || activeToday.find(t => t.title.toLowerCase().includes(q) || t.category.toLowerCase().includes(q));
    if (match) return match;

    // 3. Fallback su tutte le task del database
    return validTemplates.find(t => t.title.toLowerCase().includes(q) || t.category.toLowerCase().includes(q)) || null;
}

// Avvia il Focus direttamente dall'ID della task (in modalità Header Inline di default)
function quickStartTaskFocus(templateId) {
    const t = templates.find(x => x.id === templateId);
    if (!t) return false;

    const mins = getTaskDurationMinutes(t, selectedDateStr);
    if (mins <= 0) {
        if (typeof showToast === 'function') showToast(`[CHECK-ONLY] "${t.title}" has no timer.`);
        return false;
    }

    focusPlaylist = [{
        type: 'task',
        id: t.id,
        category: t.category,
        title: t.title,
        duration: mins,
        color: t.color || '#ffffff',
        isPartial: false
    }];
    currentPlaylistIndex = 0;
    isFullscreenFocusOpen = false;
    startCurrentPlaylistPhase();
    if (typeof showToast === 'function') {
        showToast(`[FOCUS INLINE] Started ${mins}m: ${t.title} [${t.category}]`);
    }
    return true;
}

// Avvia il Focus cercando la task per nome o categoria (usato da voce e terminale)
function startTaskFocusByQuery(queryStr, overrideMinutes = null) {
    const matchedTask = findMatchingTaskForFocus(queryStr);
    if (matchedTask) {
        const mins = (overrideMinutes && overrideMinutes > 0)
            ? overrideMinutes
            : getTaskDurationMinutes(matchedTask, selectedDateStr);

        focusPlaylist = [{
            type: 'task',
            id: matchedTask.id,
            category: matchedTask.category,
            title: matchedTask.title,
            duration: mins,
            color: matchedTask.color || '#ffffff',
            isPartial: false
        }];
        currentPlaylistIndex = 0;
        isFullscreenFocusOpen = false;
        startCurrentPlaylistPhase();
        if (typeof showToast === 'function') {
            showToast(`[FOCUS INLINE] ${matchedTask.title} (${matchedTask.category}) — ${mins}m`);
        }
        return true;
    }
    return false;
}

function checkOffCompletedTaskInstance(templateId) {
    const t = templates.find(x => x.id === templateId);
    if (!t) return;
    const instancesCount = t.instances || 1;
    const currentLog = (logs[selectedDateStr] && logs[selectedDateStr][t.id]) || Array(instancesCount).fill(false);
    const firstUncheckedIndex = currentLog.indexOf(false);
    if (firstUncheckedIndex !== -1 && typeof toggleTask === 'function') {
        toggleTask(t.id, firstUncheckedIndex);
    }
}

function skipPomodoroPhase() {
    if (focusPlaylist.length === 0 || currentPlaylistIndex >= focusPlaylist.length) return;

    const phase = focusPlaylist[currentPlaylistIndex];
    if (phase.type === 'task') {
        if (typeof logFocusSession === 'function') {
            const elapsedMins = Math.max(1, Math.round((totalPhaseTime - Math.max(0, timeRemaining)) / 60));
            logFocusSession(elapsedMins, phase.category, phase.title, todayStr);
        }
        if (!phase.isPartial && phase.id) {
            checkOffCompletedTaskInstance(phase.id);
        }
    }

    clearInterval(pomodoroInterval);
    currentPlaylistIndex++;
    startCurrentPlaylistPhase();
}

function resetPomodoroPhase() {
    if (focusPlaylist.length === 0) return;
    timeRemaining = totalPhaseTime;
    phaseEndTimeMs = Date.now() + (timeRemaining * 1000);
    updatePomodoroDisplay();
}

function splitPlaylistTask(index) {
    const item = focusPlaylist[index];
    if (item.type !== 'task' || item.duration <= 2) return;

    const breakMins = 3;
    const half1 = Math.floor(item.duration / 2);
    const half2 = item.duration - half1;

    const part1 = { type: 'task', id: item.id, category: item.category, title: item.title + " (Part 1)", duration: half1, color: item.color, isPartial: true };
    const breakPart = { type: 'break', duration: breakMins };
    const part2 = { type: 'task', id: item.id, category: item.category, title: item.title + " (Part 2)", duration: half2, color: item.color, isPartial: false };

    focusPlaylist.splice(index, 1, part1, breakPart, part2);
    renderFocusPlaylist();
}

function renderAvailableTasksForFocus() {
    const container = document.getElementById('focus-available-tasks');
    if (!container) return;

    container.innerHTML = '';
    let hasTasks = false;
    const cats = {};

    templates.forEach(t => {
        const mins = getTaskDurationMinutes(t, selectedDateStr);
        if (mins <= 0) return;

        if (isTaskActiveOnDate(t, selectedDateStr)) {
            const currentLog = (logs[selectedDateStr] && logs[selectedDateStr][t.id]) || Array(t.instances || 1).fill(false);
            const maxAvailable = currentLog.filter(x => !x).length;
            const inPlaylist = focusPlaylist.filter(p => p.type === 'task' && p.id === t.id && !p.isPartial).length;
            const remaining = maxAvailable - inPlaylist;

            if (maxAvailable > 0) {
                if (!cats[t.category]) cats[t.category] = [];
                cats[t.category].push({ task: t, remaining, mins });
                hasTasks = true;
            }
        }
    });

    if (!hasTasks) {
        container.innerHTML = '<span class="empty-state">[ NO TIMED TASKS PENDING FOR SELECTED DATE ]</span>';
        return;
    }

    for (let cat in cats) {
        if (cats[cat].some(d => d.remaining > 0)) {
            const catTitle = document.createElement('div');
            catTitle.style.cssText = "width: 100%; font-size: var(--font-xs); color: var(--text-dim); font-weight: bold; margin-top: 8px; margin-bottom: 4px; text-transform: uppercase; border-bottom: 1px dotted #333;";
            catTitle.textContent = cat;
            container.appendChild(catTitle);

            cats[cat].forEach(data => {
                if (data.remaining > 0) {
                    const chip = document.createElement('div');
                    chip.className = 'playlist-task-chip';
                    chip.innerHTML = `+ ${escapeHtml(data.task.title)} <span style="opacity:0.6; margin-left: 6px;">(${data.mins}m) [${data.remaining}]</span>`;
                    chip.onclick = () => addTaskToPlaylist(data.task);
                    container.appendChild(chip);
                }
            });
        }
    }
}

function addTaskToPlaylist(task) {
    const mins = getTaskDurationMinutes(task, selectedDateStr);
    if (mins <= 0) return;

    focusPlaylist.push({
        type: 'task',
        id: task.id,
        category: task.category,
        title: task.title,
        duration: mins,
        color: task.color || '#ffffff',
        isPartial: false
    });
    focusPlaylist.push({
        type: 'break',
        duration: 5
    });
    renderFocusPlaylist();
    renderAvailableTasksForFocus();
}

function removePlaylistIndex(index) {
    focusPlaylist.splice(index, 1);
    renderFocusPlaylist();
    renderAvailableTasksForFocus();
}

function updatePlaylistDuration(index, value) {
    const val = parseInt(value, 10);
    if (!isNaN(val) && val > 0) {
        focusPlaylist[index].duration = val;
    }
}

function renderFocusPlaylist() {
    const container = document.getElementById('focus-playlist');
    if (!container) return;
    container.innerHTML = '';

    if (focusPlaylist.length === 0) {
        container.innerHTML = '<div class="empty-state" style="text-align: center; margin-top: 25px;">[ SELECT A TASK ABOVE TO BUILD PLAYLIST ]</div>';
        document.getElementById('btn-start-playlist').disabled = true;
        return;
    }

    document.getElementById('btn-start-playlist').disabled = false;

    focusPlaylist.forEach((item, index) => {
        if (item.type === 'task') {
            container.innerHTML += `
                <div class="playlist-item" style="border-left: 3px solid ${item.color};">
                    <div>
                        <strong>${escapeHtml(item.title)}</strong>
                        <div style="font-size: var(--font-xs); color: var(--text-dim);">${escapeHtml(item.category || 'WORK SESSION')}</div>
                    </div>
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <input type="number" class="form-control form-control-sm no-spinners" style="width: 48px; text-align: center;" value="${item.duration}" onchange="updatePlaylistDuration(${index}, this.value)"> 
                        <span style="font-size:var(--font-xs); color:var(--text-dim);">MIN</span>
                        <button type="button" class="btn btn-sm" onclick="splitPlaylistTask(${index})">SPLIT</button>
                        <button type="button" class="icon-btn delete" onclick="removePlaylistIndex(${index})">[X]</button>
                    </div>
                </div>
            `;
        } else if (item.type === 'break') {
            container.innerHTML += `
                <div class="playlist-break">
                    <span style="font-size: var(--font-xs); color: var(--text-dim);">BREAK</span>
                    <input type="number" class="form-control form-control-sm no-spinners" style="width: 48px; text-align: center;" value="${item.duration}" onchange="updatePlaylistDuration(${index}, this.value)">
                    <span style="font-size: var(--font-xs); color: var(--text-dim);">MIN</span>
                    <button type="button" class="icon-btn delete" onclick="removePlaylistIndex(${index})">[X]</button>
                </div>
            `;
        }
    });
}

function renderLiveFocusQueue() {
    const queueEl = document.getElementById('focus-live-queue');
    if (!queueEl) return;

    if (focusPlaylist.length <= 1) {
        const single = focusPlaylist[0];
        queueEl.innerHTML = single
            ? `<div style="font-size:var(--font-xs); color:var(--text-dim); text-align:center;">ACTIVE TASK // <strong style="color:var(--text-main);">${escapeHtml(single.title)} (${single.duration}m)</strong> — Auto-checks on completion</div>`
            : '';
        return;
    }

    let html = `<div class="sub-column-header" style="margin-bottom:6px;">PLAYLIST QUEUE (${currentPlaylistIndex + 1}/${focusPlaylist.length})</div><div style="display:flex; flex-direction:column; gap:4px; max-height:140px; overflow-y:auto;">`;

    focusPlaylist.forEach((step, idx) => {
        const isCurrent = idx === currentPlaylistIndex;
        const isDone = idx < currentPlaylistIndex;
        const label = step.type === 'break' ? 'BREAK TIME' : `${step.title} [${step.category || ''}]`;
        const statusTag = isDone ? '[DONE]' : (isCurrent ? '[▶ NOW]' : `[#${idx + 1}]`);

        html += `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:5px 10px; font-size:var(--font-xs); border:1px solid ${isCurrent ? 'var(--text-main)' : 'var(--border-color)'}; background:${isCurrent ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.015)'}; opacity:${isDone ? '0.4' : '1'};">
                <div><strong style="margin-right:8px;">${statusTag}</strong><span>${escapeHtml(label)}</span></div>
                <span style="color:var(--text-muted); font-variant-numeric:tabular-nums;">${step.duration}m</span>
            </div>
        `;
    });

    html += `</div>`;
    queueEl.innerHTML = html;
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
    if (focusPlaylist.length === 0) return;

    closeModals();
    if (focusPlaylist[focusPlaylist.length - 1].type === 'break') {
        focusPlaylist.pop();
    }

    currentPlaylistIndex = 0;
    isFullscreenFocusOpen = false;
    startCurrentPlaylistPhase();
});

function syncFocusViewState() {
    const isActive = focusPlaylist.length > 0 && currentPlaylistIndex < focusPlaylist.length;
    const inlineWrap = document.getElementById('header-inline-focus');
    const progTrack = document.getElementById('header-focus-progress-track');
    const overlay = document.getElementById('pomodoroOverlay');
    const btnWidgetMode = document.getElementById('btn-widget-mode');

    if (btnWidgetMode) {
        btnWidgetMode.textContent = '[_ MINIMIZE TO HEADER]';
    }

    if (!isActive) {
        if (inlineWrap) inlineWrap.style.display = 'none';
        if (progTrack) progTrack.style.display = 'none';
        if (overlay) {
            overlay.classList.remove('widget-mode');
            overlay.style.display = 'none';
        }
        return;
    }

    if (inlineWrap) inlineWrap.style.display = 'flex';
    if (progTrack) progTrack.style.display = 'block';

    if (overlay) {
        overlay.classList.remove('widget-mode');
        overlay.style.display = isFullscreenFocusOpen ? 'flex' : 'none';
    }
}

function openFullscreenFocusOverlay() {
    if (focusPlaylist.length === 0 || currentPlaylistIndex >= focusPlaylist.length) return;
    isFullscreenFocusOpen = true;
    syncFocusViewState();
    updatePomodoroDisplay();
}

// Nel fullscreen, il pulsante in alto a sinistra minimizza il timer nella barra dell'header (zero coperture)
function toggleWidgetMode() {
    isFullscreenFocusOpen = false;
    syncFocusViewState();
    updatePomodoroDisplay();
}

function resetWidgetMode() {
    isFullscreenFocusOpen = false;
    const overlay = document.getElementById('pomodoroOverlay');
    if (overlay) {
        overlay.classList.remove('widget-mode');
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.right = '0';
        overlay.style.bottom = '0';
    }
}

function startCurrentPlaylistPhase() {
    if (currentPlaylistIndex >= focusPlaylist.length) {
        stopPomodoro();
        if (typeof showToast === 'function') showToast('[FOCUS] Session completed & tasks checked off!');
        return;
    }

    isPomodoroPaused = false;
    const pauseBtnFull = document.getElementById('btn-pomodoro-pause');
    if (pauseBtnFull) pauseBtnFull.innerText = 'Pause';
    const pauseBtnHdr = document.getElementById('btn-header-focus-pause');
    if (pauseBtnHdr) pauseBtnHdr.textContent = '[PAUSE]';

    const phase = focusPlaylist[currentPlaylistIndex];
    const activeColor = phase.type === 'task' ? (phase.color || '#ffffff') : '#888888';

    // Aggiorna Fullscreen Overlay
    const titleEl = document.getElementById('pomodoro-task-title');
    const circle = document.getElementById('pomodoro-circle');
    if (phase.type === 'task') {
        const catPrefix = phase.category ? `[${phase.category}] ` : '';
        if (titleEl) titleEl.innerText = `${catPrefix}${phase.title}`;
        if (circle) circle.setAttribute('stroke', activeColor);
        playBeep(800, 0.2);
    } else {
        if (titleEl) titleEl.innerText = 'BREAK TIME';
        if (circle) circle.setAttribute('stroke', '#666666');
    }

    // Aggiorna Header Inline Pill & Progress Bar
    const hdrPill = document.getElementById('header-focus-pill');
    const hdrTitle = document.getElementById('header-focus-title');
    const hdrIcon = document.getElementById('header-focus-icon');
    const hdrProgBar = document.getElementById('header-focus-progress-bar');

    if (hdrPill) {
        hdrPill.style.borderLeftColor = activeColor;
        hdrPill.classList.remove('is-paused');
    }
    if (hdrTitle) {
        hdrTitle.textContent = phase.type === 'task' ? phase.title : 'BREAK';
    }
    if (hdrIcon) {
        hdrIcon.textContent = '▶';
        hdrIcon.style.color = activeColor;
    }
    if (hdrProgBar) {
        hdrProgBar.style.background = activeColor;
    }

    totalPhaseTime = phase.duration * 60;
    timeRemaining = totalPhaseTime;
    phaseEndTimeMs = Date.now() + (totalPhaseTime * 1000);

    syncFocusViewState();
    renderLiveFocusQueue();
    updatePomodoroDisplay();
    clearInterval(pomodoroInterval);
    pomodoroInterval = setInterval(runPomodoroTick, 250);
}

function updatePomodoroDisplay() {
    const m = Math.floor(Math.abs(timeRemaining) / 60).toString().padStart(2, '0');
    const s = (Math.abs(timeRemaining) % 60).toString().padStart(2, '0');
    const formattedTime = `${timeRemaining < 0 ? '-' : ''}${m}:${s}`;

    // 1. Testo Fullscreen
    const textEl = document.getElementById('pomodoro-time-text');
    if (textEl) textEl.innerText = formattedTime;

    // 2. Testo Header Inline
    const hdrTimeEl = document.getElementById('header-focus-time');
    if (hdrTimeEl) hdrTimeEl.textContent = formattedTime;

    const percent = totalPhaseTime > 0 ? Math.max(0, Math.min(1, timeRemaining / totalPhaseTime)) : 0;

    // 3. Linea di progresso inferiore nell'Header
    const hdrProgBar = document.getElementById('header-focus-progress-bar');
    if (hdrProgBar) {
        hdrProgBar.style.width = `${(percent * 100).toFixed(2)}%`;
    }

    // 4. Cerchio SVG Fullscreen
    const radius = 145;
    const circumference = 2 * Math.PI * radius;
    const circle = document.getElementById('pomodoro-circle');
    if (circle) {
        circle.style.strokeDasharray = `${circumference} ${circumference}`;
        circle.style.strokeDashoffset = circumference - (percent * circumference);
    }
}

function runPomodoroTick() {
    if (isPomodoroPaused) return;

    const nowMs = Date.now();
    timeRemaining = Math.ceil((phaseEndTimeMs - nowMs) / 1000);
    updatePomodoroDisplay();

    if (timeRemaining <= 0) {
        clearInterval(pomodoroInterval);
        const phase = focusPlaylist[currentPlaylistIndex];

        if (phase.type === 'task') {
            playBeep(400, 0.5);
            if (typeof logFocusSession === 'function') {
                logFocusSession(phase.duration, phase.category, phase.title, todayStr);
            }
            if (!phase.isPartial && phase.id) {
                checkOffCompletedTaskInstance(phase.id);
            }
        }

        currentPlaylistIndex++;
        startCurrentPlaylistPhase();
    }
}

function togglePomodoroPause() {
    isPomodoroPaused = !isPomodoroPaused;
    if (!isPomodoroPaused) {
        phaseEndTimeMs = Date.now() + (timeRemaining * 1000);
    }

    const pauseBtnFull = document.getElementById('btn-pomodoro-pause');
    if (pauseBtnFull) pauseBtnFull.innerText = isPomodoroPaused ? 'Resume' : 'Pause';

    const pauseBtnHdr = document.getElementById('btn-header-focus-pause');
    if (pauseBtnHdr) pauseBtnHdr.textContent = isPomodoroPaused ? '[RESUME]' : '[PAUSE]';

    const hdrPill = document.getElementById('header-focus-pill');
    if (hdrPill) hdrPill.classList.toggle('is-paused', isPomodoroPaused);

    const hdrIcon = document.getElementById('header-focus-icon');
    if (hdrIcon) hdrIcon.textContent = isPomodoroPaused ? '⏸' : '▶';
}

function stopPomodoro() {
    clearInterval(pomodoroInterval);
    focusPlaylist = [];
    isFullscreenFocusOpen = false;
    resetWidgetMode();
    syncFocusViewState();
}