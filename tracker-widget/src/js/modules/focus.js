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
let focusDraft = [];          // the playlist being built in the setup window (never the running one)

// ----------------------------------------------------------------------------
// Sessions and progress
// ----------------------------------------------------------------------------
// Every session on a task counts for that task, however it was started (Today ▶, an exam,
// the setup window, a study window, a command). Stopping keeps the minutes you did, and the
// session leaves its block on today's timeline, so study windows plan around what you really do.

function isFocusRunning() {
    return focusPlaylist.length > 0 && currentPlaylistIndex < focusPlaylist.length;
}

// A playlist item for a task: tasks measured in time (Algebra 2h) count minutes, the others tick a box when done
function makeTaskPhase(t, mins, extra = {}) {
    const isTemplate = templates.some(x => x.id === t.id);
    const study = Boolean(isTemplate && window.CortexStudy && CortexStudy.isTimeTarget(t, todayStr));
    return Object.assign({
        type: 'task', id: t.id, category: t.category, title: t.title, duration: mins,
        color: t.color || '#ffffff', isPartial: study, isStudy: study
    }, extra);
}

// Minutes of focus done so far in the phase that is running
function elapsedPhaseMinutes() {
    return Math.max(0, Math.round((totalPhaseTime - Math.max(0, timeRemaining)) / 60));
}

// Blocks this session put on the timeline for phases that will not happen any more
function dropPlannedFocusBlocks(fromIndex) {
    const ids = focusPlaylist.slice(fromIndex).map(p => p && p.blockId).filter(Boolean);
    if (!ids.length || !Array.isArray(ephemeralData[todayStr])) return;
    ephemeralData[todayStr] = ephemeralData[todayStr].filter(b => !(b && ids.includes(b.id) && !b.done));
}

// A new session is about to replace the running one: keep what you did in it
function closeRunningSession() {
    if (!isFocusRunning()) return;
    const phase = focusPlaylist[currentPlaylistIndex];
    const mins = elapsedPhaseMinutes();
    if (phase && phase.type === 'task' && mins >= 1) completeTaskPhase(phase, mins, todayStr, currentPlaylistIndex, Date.now());
    dropPlannedFocusBlocks(mins >= 1 ? currentPlaylistIndex + 1 : currentPlaylistIndex);
    clearInterval(pomodoroInterval);
}

// When a session starts, its task phases appear on today's timeline from now on, one block each.
// Phases of a study window already have theirs. Ids are fixed per session, so every device agrees.
function placeSessionBlocks() {
    if (!Array.isArray(ephemeralData[todayStr])) ephemeralData[todayStr] = [];
    const now = getNow();
    let cur = now.getHours() * 60 + now.getMinutes();
    let added = false;
    focusPlaylist.forEach((p, i) => {
        const len = Math.max(0, Number(p && p.duration) || 0);
        if (i < currentPlaylistIndex) return;
        if (p.type === 'task' && p.id && !p.studyBlockId && !p.blockId && templates.some(t => t.id === p.id) && cur + 5 <= 24 * 60) {
            p.blockId = `eb_fs_${focusSessionId}_${i}`;
            const block = {
                id: p.blockId, templateId: p.id, title: p.title, category: p.category,
                color: p.color || '#b08d43',
                start: minutesToTimeStr(cur), end: minutesToTimeStr(Math.min(24 * 60 - 1, cur + len)),
                minutes: len, blocksUsed: 0, focusBlock: true
            };
            if (p.phase) block.phase = p.phase;
            ephemeralData[todayStr].push(block);
            added = true;
        }
        cur += len;
    });
    return added;
}

// For study.js: the block being worked on right now, and whether a window's own playlist is running
window.getRunningFocusBlockIds = () => {
    if (!isFocusRunning()) return [];
    const p = focusPlaylist[currentPlaylistIndex];
    return [p.studyBlockId, p.blockId].filter(Boolean);
};
window.isStudyWindowRunning = (winId) => isFocusRunning() && focusPlaylist.slice(currentPlaylistIndex).some(p => p && p.windowId === winId);

function replanStudyAfterFocus() {
    if (window.CortexStudy && typeof CortexStudy.replanAfterFocus === 'function') CortexStudy.replanAfterFocus(todayStr);
}

// audioCtx è condiviso: viene creato una sola volta in js/core/audio.js
function focusSoundOn() {
    return typeof getPref !== 'function' || getPref('focusSound') !== false;
}

function playBeep(frequency, duration) {
    if (!focusSoundOn()) return;
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
        const dayIdx = parseLocalDate(dateStr).getDay();
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
// opts.minutes: length of the session (default: the task's timer)
function quickStartTaskFocus(templateId, opts = {}) {
    const t = templates.find(x => x.id === templateId);
    if (!t) return false;

    let mins = Number(opts.minutes) > 0 ? Number(opts.minutes) : getTaskDurationMinutes(t, selectedDateStr);
    if (mins <= 0) {
        if (typeof showToast === 'function') showToast(`[CHECK-ONLY] "${t.title}" has no timer.`);
        return false;
    }

    // Tasks measured in time (Algebra 2h): run the planned session if there is one now,
    // and count the minutes instead of ticking one box per timer
    const study = window.CortexStudy && CortexStudy.isTimeTarget(t, selectedDateStr);
    let planned = null;
    if (study && selectedDateStr === todayStr) {
        const now = getNow();
        const nowMin = now.getHours() * 60 + now.getMinutes();
        planned = (Array.isArray(ephemeralData[todayStr]) ? ephemeralData[todayStr] : [])
            .filter(b => b && b.templateId === t.id && b.studyWindowId && timeToMinutes(b.end) > nowMin && timeToMinutes(b.start) <= nowMin + 10)
            .sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start))[0] || null;
        if (planned) mins = Math.max(5, timeToMinutes(planned.end) - Math.max(nowMin, timeToMinutes(planned.start)));
    }

    closeRunningSession();
    const extra = planned
        ? Object.assign({ studyBlockId: planned.id, windowId: planned.studyWindowId }, window.CortexStudy ? CortexStudy.phaseInfo(planned.phase) : {})
        : {};
    focusPlaylist = [makeTaskPhase(t, mins, extra)];
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

        closeRunningSession();
        focusPlaylist = [makeTaskPhase(matchedTask, mins)];
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

// A focus session not tied to a task (from the command bar or the builder)
function startFreeFocus(title, mins = 25) {
    closeRunningSession();
    focusPlaylist = [{ type: 'task', id: null, category: 'Focus', title: title || 'Deep work', duration: mins, color: '#ffffff', isPartial: true }];
    currentPlaylistIndex = 0;
    isFullscreenFocusOpen = false;
    startCurrentPlaylistPhase();
    if (typeof showToast === 'function') showToast(`[FOCUS] ${focusPlaylist[0].title} — ${mins} min`);
}

function checkOffCompletedTaskInstance(templateId, dateStr = todayStr) {
    const t = templates.find(x => x.id === templateId);
    if (!t) return;
    const instancesCount = t.instances || 1;
    const currentLog = (logs[dateStr] && logs[dateStr][t.id]) || Array(instancesCount).fill(false);
    const firstUncheckedIndex = currentLog.indexOf(false);
    if (firstUncheckedIndex !== -1 && typeof toggleTask === 'function') {
        // toggleTask works on the date being viewed: point it at the session's date
        const prev = selectedDateStr;
        selectedDateStr = dateStr;
        try { toggleTask(t.id, firstUncheckedIndex); } finally { selectedDateStr = prev; }
    }
}

// A focus phase on a task is over (finished or skipped): log the minutes once, credit the task.
// The log id is fixed per session + phase, so two devices finishing the same phase count it once.
// endMs: when the phase ended (its planned end when it ran to the end, so every device writes the same)
function completeTaskPhase(phase, minutes, dateStr, phaseIndex, endMs = Date.now()) {
    if (!phase || phase.type !== 'task' || minutes <= 0) return;
    const entryId = focusSessionId ? `fl_${focusSessionId}_${phaseIndex}` : null;
    let logged = true;
    if (typeof logFocusSession === 'function') {
        // planned length, study phase and end time let Cortex learn how long you really stay on a session
        logged = logFocusSession(minutes, phase.category, phase.title, dateStr, phase.id || null, entryId, { planned: phase.duration, phase: phase.phase || null, at: endMs }) !== false;
    }
    if (!logged) return;
    if (phase.isStudy && phase.id && window.CortexStudy) {
        CortexStudy.creditMinutes(phase.id, dateStr, minutes);
    } else if (!phase.isPartial && phase.id) {
        checkOffCompletedTaskInstance(phase.id, dateStr);
    }
    // its block on the timeline becomes what really happened
    if (window.CortexStudy && typeof CortexStudy.settleSession === 'function') {
        CortexStudy.settleSession(phase, minutes, dateStr, endMs, focusSessionId, phaseIndex);
        saveData();
    }
}

function skipPomodoroPhase() {
    if (focusPlaylist.length === 0 || currentPlaylistIndex >= focusPlaylist.length) return;

    const phase = focusPlaylist[currentPlaylistIndex];
    if (phase.type === 'task') {
        completeTaskPhase(phase, Math.max(1, elapsedPhaseMinutes()), todayStr, currentPlaylistIndex, Date.now());
    }

    clearInterval(pomodoroInterval);
    currentPlaylistIndex++;
    startCurrentPlaylistPhase();
    // A task ended early: unless a study window's own playlist goes on, today's windows use the time it freed
    const windowGoesOn = focusPlaylist.slice(currentPlaylistIndex).some(p => p && p.windowId);
    if (phase.type === 'task' && !windowGoesOn) replanStudyAfterFocus();
}

function resetPomodoroPhase() {
    if (focusPlaylist.length === 0) return;
    timeRemaining = totalPhaseTime;
    phaseEndTimeMs = Date.now() + (timeRemaining * 1000);
    updatePomodoroDisplay();
    publishFocusSession();
}

function splitPlaylistTask(index) {
    const item = focusDraft[index];
    if (item.type !== 'task' || item.duration <= 2) return;

    const breakMins = 3;
    const half1 = Math.floor(item.duration / 2);
    const half2 = item.duration - half1;

    // a task counted in minutes keeps counting minutes in both halves; one counted in boxes ticks at the end
    const part1 = Object.assign({}, item, { title: item.title + " (Part 1)", duration: half1, isPartial: true });
    const breakPart = { type: 'break', duration: breakMins };
    const part2 = Object.assign({}, item, { title: item.title + " (Part 2)", duration: half2, isPartial: item.isStudy ? true : item.isPartial });

    focusDraft.splice(index, 1, part1, breakPart, part2);
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
            const inPlaylist = focusDraft.filter(p => p.type === 'task' && p.id === t.id && !p.isPartial).length;
            const remaining = maxAvailable - inPlaylist;

            if (maxAvailable > 0) {
                if (!cats[t.category]) cats[t.category] = [];
                cats[t.category].push({ task: t, remaining, mins });
                hasTasks = true;
            }
        }
    });

    (routinesData || []).forEach(r => {
        const mins = (!r.noTimer && parseInt(r.timerMinutes, 10) > 0) ? parseInt(r.timerMinutes, 10) : 0;
        if (mins <= 0) return;
        if (typeof isRoutineActiveOnDate === 'function' && isRoutineActiveOnDate(r, selectedDateStr)) {
            const alreadyInPlaylist = focusDraft.some(p => p.id === r.id);
            if (!alreadyInPlaylist) {
                if (!cats['Routines']) cats['Routines'] = [];
                cats['Routines'].push({
                    task: { id: r.id, category: 'Routines', title: r.title, color: r.color || '#b08d43', timerMinutes: mins, noTimer: false },
                    remaining: 1,
                    mins: mins
                });
                hasTasks = true;
            }
        }
    });
    
    // Free focus: always available, no task with a duration needed
    const free = document.createElement('div');
    free.className = 'focus-free-row';
    free.innerHTML = `
        <input type="text" class="form-control form-control-sm" id="focus-free-title" placeholder="What are you focusing on? (optional)" maxlength="60">
        <button type="button" class="btn btn-sm" data-mins="25">[+ 25 MIN]</button>
        <button type="button" class="btn btn-sm" data-mins="50">[+ 50 MIN]</button>`;
    free.querySelectorAll('[data-mins]').forEach(b => b.addEventListener('click', () => {
        const title = (free.querySelector('#focus-free-title').value || '').trim() || 'Deep work';
        focusDraft.push({ type: 'task', id: null, category: 'Focus', title, duration: parseInt(b.dataset.mins, 10), color: '#ffffff', isPartial: true });
        focusDraft.push({ type: 'break', duration: 5 });
        renderFocusPlaylist();
        renderAvailableTasksForFocus();
    }));
    container.appendChild(free);

    if (!hasTasks) {
        const empty = document.createElement('span');
        empty.className = 'empty-state';
        empty.textContent = 'No tasks with a duration today: add a free session above.';
        container.appendChild(empty);
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
                    chip.innerHTML = `+ ${escapeHtml(data.task.title)} <span class="u-ml-2" style="opacity:0.6;">(${data.mins}m) [${data.remaining}]</span>`;
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

    focusDraft.push(makeTaskPhase(task, mins));
    focusDraft.push({
        type: 'break',
        duration: 5
    });
    renderFocusPlaylist();
    renderAvailableTasksForFocus();
}

function removePlaylistIndex(index) {
    focusDraft.splice(index, 1);
    renderFocusPlaylist();
    renderAvailableTasksForFocus();
}

function updatePlaylistDuration(index, value) {
    const val = parseInt(value, 10);
    if (!isNaN(val) && val > 0) {
        focusDraft[index].duration = val;
    }
}

function renderFocusPlaylist() {
    const container = document.getElementById('focus-playlist');
    if (!container) return;
    container.innerHTML = '';

    if (focusDraft.length === 0) {
        container.innerHTML = '<div class="empty-state u-tc" style="margin-top:var(--space-5);">[ SELECT A TASK ABOVE TO BUILD PLAYLIST ]</div>';
        document.getElementById('btn-start-playlist').disabled = true;
        return;
    }

    document.getElementById('btn-start-playlist').disabled = false;

    focusDraft.forEach((item, index) => {
        if (item.type === 'task') {
            container.innerHTML += `
                <div class="playlist-item" style="border-left: 3px solid ${item.color};">
                    <div>
                        <strong>${escapeHtml(item.title)}</strong>
                        <div class="u-fs-xs u-dim">${escapeHtml(item.category || 'WORK SESSION')}</div>
                    </div>
                    <div class="u-flex u-gap-2 u-ai-center">
                        <input type="number" class="form-control form-control-sm no-spinners u-tc" style="width:48px;" value="${item.duration}" onchange="updatePlaylistDuration(${index}, this.value)"> 
                        <span class="u-fs-xs u-dim">MIN</span>
                        <button type="button" class="btn btn-sm" onclick="splitPlaylistTask(${index})">SPLIT</button>
                        <button type="button" class="icon-btn delete" onclick="removePlaylistIndex(${index})">×</button>
                    </div>
                </div>
            `;
        } else if (item.type === 'break') {
            container.innerHTML += `
                <div class="playlist-break">
                    <span class="u-fs-xs u-dim">BREAK</span>
                    <input type="number" class="form-control form-control-sm no-spinners u-tc" style="width:48px;" value="${item.duration}" onchange="updatePlaylistDuration(${index}, this.value)">
                    <span class="u-fs-xs u-dim">MIN</span>
                    <button type="button" class="icon-btn delete" onclick="removePlaylistIndex(${index})">×</button>
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
            ? `<div class="u-fs-xs u-dim u-tc">ACTIVE TASK // <strong class="u-main">${escapeHtml(single.title)} (${single.duration}m)</strong>${single.id && !single.isPartial ? ' — checked off when the timer ends' : ''}</div>`
            : '';
        return;
    }

    let html = `<div class="sub-column-header u-mb-2">PLAYLIST QUEUE (${currentPlaylistIndex + 1}/${focusPlaylist.length})</div><div class="u-flex u-col u-gap-1 u-scroll-y" style="max-height:140px;">`;

    focusPlaylist.forEach((step, idx) => {
        const isCurrent = idx === currentPlaylistIndex;
        const isDone = idx < currentPlaylistIndex;
        const label = step.type === 'break' ? 'BREAK TIME' : `${step.title} [${step.category || ''}]`;
        const statusTag = isDone ? '[DONE]' : (isCurrent ? '[▶ NOW]' : `[#${idx + 1}]`);

        html += `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:var(--space-1) var(--space-3); font-size:var(--font-xs); border:1px solid ${isCurrent ? 'var(--text-main)' : 'var(--border-color)'}; background:${isCurrent ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.015)'}; opacity:${isDone ? '0.4' : '1'};">
                <div><strong style="margin-right:var(--space-2);">${statusTag}</strong><span>${escapeHtml(label)}</span></div>
                <span class="u-muted u-tnum">${step.duration}m</span>
            </div>
        `;
    });

    html += `</div>`;
    queueEl.innerHTML = html;
}

// Builds a new playlist in a draft: the running session stays untouched until you press Start
function openTimerModal() {
    focusDraft = [];
    renderAvailableTasksForFocus();
    renderFocusPlaylist();
    closeModals();
    document.getElementById('timerSetupModal').style.display = 'flex';
}

document.getElementById('timerSetupForm').addEventListener('submit', function(e) {
    e.preventDefault();
    if (focusDraft.length === 0) return;

    closeModals();
    if (focusDraft[focusDraft.length - 1].type === 'break') {
        focusDraft.pop();
    }
    closeRunningSession();
    focusPlaylist = focusDraft;
    focusDraft = [];

    currentPlaylistIndex = 0;
    isFullscreenFocusOpen = false;
    startCurrentPlaylistPhase();
});

// Play / pause drawn the same way everywhere (an emoji pause sign looked nothing like the play triangle)
const FOCUS_ICON_PLAY = '<svg class="fx-ico" viewBox="0 0 10 10" aria-hidden="true" focusable="false"><path d="M2.2 1.2 8.8 5 2.2 8.8z" fill="currentColor"/></svg>';
const FOCUS_ICON_PAUSE = '<svg class="fx-ico" viewBox="0 0 10 10" aria-hidden="true" focusable="false"><path d="M2.2 1.4h2.2v7.2H2.2zM5.6 1.4h2.2v7.2H5.6z" fill="currentColor"/></svg>';
function focusStateIcon(paused) { return paused ? FOCUS_ICON_PAUSE : FOCUS_ICON_PLAY; }
window.focusStateIcon = focusStateIcon;

// The timer is already on screen (Today's "Now" card, the HUD pod): no need for the strip under the header
function isFocusTimerShownElsewhere() {
    const visible = (el) => el && el.isConnected && !el.closest('#module-registry') && el.getClientRects().length > 0;
    if (visible(document.querySelector('#module-today .today-now'))) return true;
    if (typeof isHudMode !== 'undefined' && isHudMode && visible(document.getElementById('hud-pod-focus-box'))) return true;
    return false;
}

let focusStripShown = null;
function syncFocusViewState() {
    const isActive = focusPlaylist.length > 0 && currentPlaylistIndex < focusPlaylist.length;
    const inlineWrap = document.getElementById('header-inline-focus');
    const progTrack = document.getElementById('header-focus-progress-track');
    const overlay = document.getElementById('pomodoroOverlay');
    const btnWidgetMode = document.getElementById('btn-widget-mode');

    if (btnWidgetMode) {
        btnWidgetMode.textContent = '[_ MINIMIZE]';
    }

    const showStrip = isActive && !isFocusTimerShownElsewhere();
    focusStripShown = showStrip;
    document.body.classList.toggle('focus-running', isActive);
    document.body.classList.toggle('focus-active', showStrip);
    if (inlineWrap) inlineWrap.style.display = showStrip ? 'flex' : 'none';
    if (progTrack) progTrack.style.display = showStrip ? 'block' : 'none';

    if (overlay) {
        overlay.classList.remove('widget-mode');
        overlay.style.display = isActive && isFullscreenFocusOpen ? 'flex' : 'none';
    }
}

// Checked on every tick: switching section or tile shows/hides the strip without each view having to say so
function refreshFocusStripVisibility() {
    const isActive = focusPlaylist.length > 0 && currentPlaylistIndex < focusPlaylist.length;
    const want = isActive && !isFocusTimerShownElsewhere();
    if (want !== focusStripShown) syncFocusViewState();
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

// opts.startAt: when the phase began (the end of the previous one), so every device
//               computes the same end time; default = now.
// opts.quiet:   no beep (catching up phases that ended while the app was closed)
function startCurrentPlaylistPhase(opts = {}) {
    if (currentPlaylistIndex >= focusPlaylist.length) {
        stopPomodoro();
        if (typeof showToast === 'function') showToast('[FOCUS] Session completed & tasks checked off!');
        return;
    }

    // A new playlist = a new session, shared with your other devices
    if (focusSessionRef !== focusPlaylist || !focusSessionId) {
        focusSessionId = 'fs_' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
        focusSessionRef = focusPlaylist;
        focusSessionFrom = focusDeviceLabel();
        focusSessionStartedHere = true;
        // Its tasks appear on today's timeline; study windows move their sessions around them
        if (placeSessionBlocks()) {
            saveData();
            replanStudyAfterFocus();
            if (typeof renderDayPlannerModule === 'function') renderDayPlannerModule();
        }
    }

    isPomodoroPaused = false;
    const phase = focusPlaylist[currentPlaylistIndex];
    renderFocusPhaseChrome(phase, { beep: !opts.quiet });

    totalPhaseTime = phase.duration * 60;
    phaseEndTimeMs = (opts.startAt || Date.now()) + (totalPhaseTime * 1000);
    timeRemaining = Math.ceil((phaseEndTimeMs - Date.now()) / 1000);

    // ATTIVA LA ZENITH MODE
    toggleZenithMode(true, phase.category);

    syncFocusViewState();
    renderLiveFocusQueue();
    updatePomodoroDisplay();
    clearInterval(pomodoroInterval);
    pomodoroInterval = setInterval(runPomodoroTick, 250);
    publishFocusSession();
}

// Titles, colours and buttons of the current phase (header strip + full screen)
function renderFocusPhaseChrome(phase, opts = {}) {
    const pauseBtnFull = document.getElementById('btn-pomodoro-pause');
    if (pauseBtnFull) pauseBtnFull.innerText = isPomodoroPaused ? 'Resume' : 'Pause';
    const pauseBtnHdr = document.getElementById('btn-header-focus-pause');
    if (pauseBtnHdr) pauseBtnHdr.textContent = isPomodoroPaused ? '[RESUME]' : '[PAUSE]';

    const activeColor = phase.type === 'task' ? (phase.color || '#ffffff') : '#888888';

    // Aggiorna Fullscreen Overlay
    const titleEl = document.getElementById('pomodoro-task-title');
    const circle = document.getElementById('pomodoro-circle');
    if (phase.type === 'task') {
        const catPrefix = phase.category ? `[${phase.category}] ` : '';
        if (titleEl) titleEl.innerText = `${catPrefix}${phase.title}`;
        if (circle) circle.setAttribute('stroke', activeColor);
        if (opts.beep) playBeep(800, 0.2);
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
        hdrPill.classList.toggle('is-paused', isPomodoroPaused);
    }
    if (hdrTitle) {
        hdrTitle.textContent = phase.type === 'task' ? phase.title + (phase.phaseLabel ? ` · ${phase.phaseLabel}` : '') : 'BREAK';
    }
    if (hdrIcon) {
        hdrIcon.innerHTML = focusStateIcon(isPomodoroPaused);
        hdrIcon.style.color = activeColor;
    }
    if (hdrProgBar) {
        hdrProgBar.style.background = activeColor;
    }
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
    refreshFocusStripVisibility();
    if (isPomodoroPaused) return;

    const nowMs = Date.now();
    timeRemaining = Math.ceil((phaseEndTimeMs - nowMs) / 1000);
    updatePomodoroDisplay();

    if (timeRemaining <= 0) {
        clearInterval(pomodoroInterval);
        const phase = focusPlaylist[currentPlaylistIndex];
        if (!phase) { stopPomodoro(); return; }
        const endedAt = phaseEndTimeMs;
        // Ended a while ago (app was closed, or another device ran it): catch up quietly
        const overdue = nowMs - endedAt > 5000;

        if (phase.type === 'task') {
            if (window.sysAudio && focusSoundOn() && !overdue) window.sysAudio.playSweep(); // <-- SUONO SWEEP
            const endDate = typeof formatDate === 'function' ? formatDate(new Date(endedAt)) : todayStr;
            completeTaskPhase(phase, phase.duration, endDate, currentPlaylistIndex, endedAt);
            if (typeof renderTodayModule === 'function') renderTodayModule();
        }

        currentPlaylistIndex++;
        // The next phase starts when this one ended: same timing on every device
        startCurrentPlaylistPhase({ startAt: endedAt, quiet: overdue });
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
    if (hdrIcon) hdrIcon.innerHTML = focusStateIcon(isPomodoroPaused);
    publishFocusSession();
}

// Stop: the minutes done in the current task are kept (opts.silent: stopped on another device, which already counted them)
function stopPomodoro(opts = {}) {
    const byUser = isFocusRunning() && !opts.silent;
    if (byUser) {
        const phase = focusPlaylist[currentPlaylistIndex];
        const mins = elapsedPhaseMinutes();
        const counted = phase && phase.type === 'task' && mins >= 1;
        if (counted) completeTaskPhase(phase, mins, todayStr, currentPlaylistIndex, Date.now());
        dropPlannedFocusBlocks(counted ? currentPlaylistIndex + 1 : currentPlaylistIndex);
        saveData();
    }
    clearInterval(pomodoroInterval);
    focusPlaylist = [];
    isFullscreenFocusOpen = false;
    resetWidgetMode();
    syncFocusViewState();
    
    // DISATTIVA LA ZENITH MODE
    toggleZenithMode(false);
    focusSessionId = null;
    focusSessionRef = null;
    publishFocusSession();
    // today's study windows re-plan what is left, from now
    if (byUser) {
        replanStudyAfterFocus();
        if (typeof renderTodayModule === 'function') renderTodayModule();
    }
}

function toggleZenithMode(isActive, categoryName) {
    if (!isActive) {
        document.body.classList.remove('zenith-mode');
        document.querySelectorAll('.quadrant-cell').forEach(el => el.classList.remove('zenith-focus-target'));
        return;
    }
    
    document.body.classList.add('zenith-mode');
    document.querySelectorAll('.quadrant-cell').forEach(el => el.classList.remove('zenith-focus-target'));

    // Heuristica per trovare il modulo da tenere illuminato
    let targetModKey = 'notes'; // Default a Notes
    const q = (categoryName || '').toLowerCase();
    
    if (q === 'palestra' || q.includes('gym')) targetModKey = 'gym';
    else if (q === 'diet' || q === 'health') targetModKey = 'diet';
    else if (q === 'math' || q.includes('trachtenberg')) targetModKey = 'math';
    else if (typeof uniData !== 'undefined' && uniData.remainingExams && uniData.remainingExams.some(e => e.name.toLowerCase() === q)) targetModKey = 'uni';

    // Cerca il nodo DOM con quel modulo e illuminàlo
    const cell = document.querySelector(`.quadrant-cell[data-module="${targetModKey}"]`);
    if (cell) cell.classList.add('zenith-focus-target');
    // Dimming only makes sense with several panels on screen (tiles) and a panel to keep lit:
    // with a single section or on the phone it would just black out the whole app
    const cells = document.querySelectorAll('.quadrant-cell').length;
    if (!cell || cells < 2 || document.body.classList.contains('mobile-view-mode')) {
        document.body.classList.remove('zenith-mode');
    }
}
// ============================================================================
// ONE FOCUS SESSION FOR ALL YOUR DEVICES
// ============================================================================
// The running session (playlist, current phase, absolute end time, pause) is saved as one
// piece of synced data ("focusSession", see js/core/cloud-sync.js). Start on the phone, open
// the tablet: the same timer is there, at the same second. Pause, skip and stop travel too.
// It is saved as a single JSON string so a sync can never mix half of one device's session
// with half of another's: the newest whole session wins.

const FOCUS_SESSION_KEY = 'tracker_focus_session';
let focusSessionId = null;
let focusSessionRef = null;          // the playlist array this session id belongs to
let focusSessionFrom = '';           // 'phone' | 'tablet' | 'computer' | 'desktop app'
let focusSessionStartedHere = false;
let focusSessionJson = cortexStore.getItem(FOCUS_SESSION_KEY) || null;   // what is shared right now
let applyingSharedFocus = false;

function focusDeviceLabel() {
    const ua = navigator.userAgent || '';
    if (window.__TAURI__) return 'desktop app';
    if (/iPad|Tablet/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua)) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return 'tablet';
    if (/Mobi|iPhone|Android/i.test(ua)) return 'phone';
    return 'computer';
}

function serializeFocusSession() {
    const running = focusPlaylist.length > 0 && currentPlaylistIndex < focusPlaylist.length && focusSessionId;
    if (!running) return null;
    return JSON.stringify({
        v: 1,
        id: focusSessionId,
        from: focusSessionFrom,
        playlist: focusPlaylist,
        index: currentPlaylistIndex,
        total: totalPhaseTime,
        paused: isPomodoroPaused,
        endMs: isPomodoroPaused ? null : phaseEndTimeMs,
        remaining: isPomodoroPaused ? Math.max(0, timeRemaining) : null
    });
}

// Called after every change of the local timer: save, and send it soon
function publishFocusSession() {
    if (applyingSharedFocus) return;
    const json = serializeFocusSession();
    if (json === focusSessionJson) return;
    focusSessionJson = json;
    if (json) cortexStore.setItem(FOCUS_SESSION_KEY, json);
    else cortexStore.removeItem(FOCUS_SESSION_KEY);
    if (typeof markLocalChangeForCloud === 'function') markLocalChangeForCloud();
    // Don't wait the usual 3 s: other devices should see it right away
    if (typeof scheduleSyncSoon === 'function' && typeof isCloudSyncConfigured === 'function' && isCloudSyncConfigured()) scheduleSyncSoon(400);
}

// For cloud-sync.js
function getFocusSessionForSync() {
    return focusSessionJson || null;
}
function applyFocusSessionFromSync(json) {
    const next = json || null;
    const boot = focusBootPending;
    focusBootPending = false;
    if (next === focusSessionJson && !boot) return;
    const changed = next !== focusSessionJson;
    focusSessionJson = next;
    if (next) cortexStore.setItem(FOCUS_SESSION_KEY, next);
    else cortexStore.removeItem(FOCUS_SESSION_KEY);
    adoptFocusSession(next, { fromOtherDevice: changed });
}

// At start-up, with sync on, wait for the cloud before resuming what this device remembers:
// the session may have been stopped elsewhere, and resuming it would count minutes never done.
let focusBootPending = false;
function settleFocusBoot() {
    if (!focusBootPending) return;
    focusBootPending = false;
    if (focusSessionJson && !focusPlaylist.length) adoptFocusSession(focusSessionJson, { fromOtherDevice: false });
}
window.settleFocusBoot = settleFocusBoot;

// When the last phase of a session ended (ms), or null if paused
function focusSessionEndsAt(st) {
    if (!st || st.paused || !st.endMs) return null;
    const rest = (st.playlist || []).slice(st.index + 1).reduce((a, p) => a + (Number(p.duration) || 0), 0);
    return Number(st.endMs) + rest * 60000;
}
const FOCUS_STALE_MS = 12 * 60 * 60 * 1000;

// Make this device show the shared session (or stop, if it was stopped elsewhere)
function adoptFocusSession(json, opts = {}) {
    let st = null;
    try { st = json ? JSON.parse(json) : null; } catch (e) { st = null; }
    let valid = st && Array.isArray(st.playlist) && st.playlist.length && st.index >= 0 && st.index < st.playlist.length;
    // Finished more than 12 hours ago: forgotten, not something to count now. Clear it everywhere.
    const endsAt = valid ? focusSessionEndsAt(st) : null;
    if (valid && endsAt !== null && Date.now() - endsAt > FOCUS_STALE_MS) {
        valid = false;
        focusSessionJson = null;
        cortexStore.removeItem(FOCUS_SESSION_KEY);
        if (typeof markLocalChangeForCloud === 'function') setTimeout(markLocalChangeForCloud, 0);
    }

    applyingSharedFocus = true;
    try {
        if (!valid) {
            if (focusPlaylist.length) {
                const wasRunning = Boolean(focusSessionId);
                stopPomodoro({ silent: true });
                if (opts.fromOtherDevice && wasRunning && typeof showToast === 'function') showToast('[FOCUS] Stopped on another device');
            }
            focusSessionId = null;
            focusSessionRef = null;
        } else {
            const isNew = st.id !== focusSessionId;
            focusPlaylist = st.playlist;
            focusSessionRef = focusPlaylist;
            focusSessionId = st.id;
            focusSessionFrom = st.from || '';
            if (isNew) focusSessionStartedHere = !opts.fromOtherDevice && st.from === focusDeviceLabel();
            currentPlaylistIndex = st.index;
            isPomodoroPaused = Boolean(st.paused);
            totalPhaseTime = Number(st.total) || (focusPlaylist[currentPlaylistIndex].duration * 60);
            if (isPomodoroPaused) {
                timeRemaining = Math.max(0, Number(st.remaining) || 0);
                phaseEndTimeMs = Date.now() + timeRemaining * 1000;
            } else {
                phaseEndTimeMs = Number(st.endMs) || Date.now();
                timeRemaining = Math.ceil((phaseEndTimeMs - Date.now()) / 1000);
            }
            const phase = focusPlaylist[currentPlaylistIndex];
            renderFocusPhaseChrome(phase, { beep: false });
            if (isNew) isFullscreenFocusOpen = false;
            toggleZenithMode(true, phase.category);
            syncFocusViewState();
            renderLiveFocusQueue();
            updatePomodoroDisplay();
            clearInterval(pomodoroInterval);
            pomodoroInterval = setInterval(runPomodoroTick, 250);
            if (isNew && opts.fromOtherDevice && typeof showToast === 'function') {
                const m = Math.max(0, Math.floor(timeRemaining / 60));
                showToast(`[FOCUS] Running from your ${focusSessionFrom || 'other device'}: ${phase.type === 'task' ? phase.title : 'break'} · ${m} min left`);
            }
        }
    } finally {
        applyingSharedFocus = false;
    }
    if (typeof renderTodayModule === 'function') renderTodayModule();
}

// For the Today card: where the running session comes from
window.getFocusSessionInfo = () => (focusSessionId ? { id: focusSessionId, from: focusSessionFrom, here: focusSessionStartedHere } : null);

// After a reload (or reopening the app) the session continues where it is
window.addEventListener('DOMContentLoaded', () => {
    if (!focusSessionJson || focusPlaylist.length) return;
    const canSync = typeof isCloudSyncConfigured === 'function' && isCloudSyncConfigured() && navigator.onLine;
    if (!canSync) {
        setTimeout(() => adoptFocusSession(focusSessionJson, { fromOtherDevice: false }), 0);
        return;
    }
    focusBootPending = true;
    setTimeout(settleFocusBoot, 8000);   // cloud too slow: go with what this device has
});
