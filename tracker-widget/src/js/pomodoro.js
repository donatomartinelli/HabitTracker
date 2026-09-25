// --- 3. POMODORO BUILDER & WIDGET LOGIC ---

let pomodoroInterval; 
let focusPlaylist = []; 
let isPomodoroPaused = false; 
let currentPlaylistIndex = 0; 
let timeRemaining = 0; 
let totalPhaseTime = 0;

// --- AUDIO BEEP GENERATO DAL BROWSER ---
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

// --- SKIP & RESET ---
function skipPomodoroPhase() {
    if (focusPlaylist.length === 0 || currentPlaylistIndex >= focusPlaylist.length) return;
    
    const phase = focusPlaylist[currentPlaylistIndex];
    if (phase.type === 'task' && !phase.isPartial) {
        const t = templates.find(x => x.id === phase.id);
        if (t) { 
            const currentLog = (logs[selectedDateStr] && logs[selectedDateStr][t.id]) || Array(t.instances).fill(false); 
            const firstUncheckedIndex = currentLog.indexOf(false); 
            if (firstUncheckedIndex !== -1) toggleTask(t.id, firstUncheckedIndex); 
        }
    }
    
    clearInterval(pomodoroInterval);
    currentPlaylistIndex++; 
    startCurrentPlaylistPhase();
}

function resetPomodoroPhase() {
    if (focusPlaylist.length === 0) return;
    timeRemaining = totalPhaseTime;
    runPomodoroTick();
}

function splitPlaylistTask(index) {
    const item = focusPlaylist[index];
    
    // Se non è una task o dura 2 minuti o meno, ignora il clic
    if (item.type !== 'task' || item.duration <= 2) return;
    
    // Pausa di default (modificabile poi liberamente nell'interfaccia)
    const breakMins = 3; 
    
    const half1 = Math.floor(item.duration / 2);
    const half2 = item.duration - half1;
    
    const part1 = { type: 'task', id: item.id, title: item.title + " (Part 1)", duration: half1, color: item.color, isPartial: true };
    const breakPart = { type: 'break', duration: breakMins };
    const part2 = { type: 'task', id: item.id, title: item.title + " (Part 2)", duration: half2, color: item.color };
    
    // Sostituisce la singola task con i tre nuovi pezzi
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
        if (isTaskActiveOnDate(t, selectedDateStr)) {
            const currentLog = (logs[selectedDateStr] && logs[selectedDateStr][t.id]) || Array(t.instances).fill(false);
            const maxAvailable = currentLog.filter(x => !x).length;
            const inPlaylist = focusPlaylist.filter(p => p.type === 'task' && p.id === t.id).length;
            const remaining = maxAvailable - inPlaylist;
            
            if (maxAvailable > 0) { 
                if (!cats[t.category]) cats[t.category] = []; 
                cats[t.category].push({ task: t, remaining: remaining }); 
                hasTasks = true; 
            }
        }
    });
    
    if (!hasTasks) { 
        container.innerHTML = '<span style="color: var(--text-dim); font-size: 0.8rem;">No uncompleted tasks for today.</span>'; 
        return; 
    }
    
    for (let cat in cats) {
        if (cats[cat].some(d => d.remaining > 0)) {
            const catTitle = document.createElement('div'); 
            catTitle.style.cssText = "width: 100%; font-size: 0.75rem; color: #888; font-weight: bold; margin-top: 10px; margin-bottom: 5px; text-transform: uppercase; border-bottom: 1px dotted #333;"; 
            catTitle.innerText = cat; 
            container.appendChild(catTitle);
            
            cats[cat].forEach(data => { 
                if (data.remaining > 0) { 
                    const chip = document.createElement('div'); 
                    chip.className = 'playlist-task-chip'; 
                    chip.innerHTML = `+ ${data.task.title} <span style="opacity:0.6; margin-left: 8px;">${data.remaining} left</span>`; 
                    chip.onclick = () => addTaskToPlaylist(data.task); 
                    container.appendChild(chip); 
                } 
            });
        }
    }
}

function addTaskToPlaylist(task) { 
    focusPlaylist.push({ 
        type: 'task', 
        id: task.id, 
        title: task.title, 
        duration: task.timerMinutes || 25, 
        color: task.color || '#ffffff' 
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
    const val = parseInt(value); 
    if (!isNaN(val) && val > 0) {
        focusPlaylist[index].duration = val; 
    }
}

function renderFocusPlaylist() {
    const container = document.getElementById('focus-playlist'); 
    container.innerHTML = '';
    
    if (focusPlaylist.length === 0) { 
        container.innerHTML = '<div style="color: #444; font-size: 0.8rem; text-align: center; margin-top: 30px;">Select a task above to add it here</div>'; 
        document.getElementById('btn-start-playlist').disabled = true; 
        return; 
    }
    
    document.getElementById('btn-start-playlist').disabled = false;
    
    focusPlaylist.forEach((item, index) => {
        if (item.type === 'task') {
            container.innerHTML += `
                <div class="playlist-item" style="border-left: 3px solid ${item.color};">
                    <div>
                        <strong>${item.title}</strong>
                        <div style="font-size: 0.7rem; color: var(--text-dim);">Task</div>
                    </div>
                    <div style="display: flex; gap: 10px; align-items: center;">
                        <input type="number" class="form-control no-spinners" style="width: 45px; padding: 4px; text-align: center;" value="${item.duration}" onchange="updatePlaylistDuration(${index}, this.value)"> 
                        <span style="font-size:0.7rem; color:#666;">min</span>
                        <button type="button" class="btn" style="padding: 2px 6px; font-size: 0.65rem;" onclick="splitPlaylistTask(${index})">SPLIT</button>
                        <button type="button" class="icon-btn delete" onclick="removePlaylistIndex(${index})">×</button>
                    </div>
                </div>
            `;
        } else if (item.type === 'break') {
            container.innerHTML += `
                <div class="playlist-break">
                    <span style="font-size: 0.7rem; color: var(--text-dim);">PAUSE</span>
                    <input type="number" class="form-control no-spinners" style="width: 45px; padding: 2px; text-align: center; border-color: #333;" value="${item.duration}" onchange="updatePlaylistDuration(${index}, this.value)">
                    <span style="font-size: 0.7rem; color: var(--text-dim);">MIN</span>
                    <button type="button" class="icon-btn delete" style="margin-left: 10px;" onclick="removePlaylistIndex(${index})">×</button>
                </div>
            `;
        }
    });
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
    if(focusPlaylist.length === 0) return; 
    
    closeModals();
    
    if(focusPlaylist[focusPlaylist.length-1].type === 'break') {
        focusPlaylist.pop();
    }
    
    currentPlaylistIndex = 0; 
    startCurrentPlaylistPhase();
});

function startCurrentPlaylistPhase() {
    if (currentPlaylistIndex >= focusPlaylist.length) { 
        resetWidgetMode(); 
        document.getElementById('pomodoroOverlay').style.display = 'none'; 
        return; 
    }
    
    isPomodoroPaused = false; 
    document.getElementById('btn-pomodoro-pause').innerText = "Pause";
    
    const phase = focusPlaylist[currentPlaylistIndex]; 
    document.getElementById('pomodoroOverlay').style.display = 'flex';
    
    const titleEl = document.getElementById('pomodoro-task-title'); 
    const circle = document.getElementById('pomodoro-circle');
    
    if (phase.type === 'task') { 
        titleEl.innerText = `Focus: ${phase.title}`; 
        circle.setAttribute('stroke', phase.color); 
        playBeep(800, 0.2); // Beep acuto e breve (Inizio)
    } else { 
        titleEl.innerText = "Break Time"; 
        circle.setAttribute('stroke', '#666666'); 
    }
    
    totalPhaseTime = phase.duration * 60; 
    timeRemaining = totalPhaseTime;
    
    runPomodoroTick(); 
    clearInterval(pomodoroInterval); 
    pomodoroInterval = setInterval(runPomodoroTick, 1000);
}

function runPomodoroTick() {
    if (isPomodoroPaused) return; 
    timeRemaining--;
    
    const m = Math.floor(Math.abs(timeRemaining) / 60).toString().padStart(2, '0'); 
    const s = (Math.abs(timeRemaining) % 60).toString().padStart(2, '0');
    
    document.getElementById('pomodoro-time-text').innerText = `${timeRemaining < 0 ? '-' : ''}${m}:${s}`;
    
    const overlay = document.getElementById('pomodoroOverlay'); 
    const isWidget = overlay.classList.contains('widget-mode');
    
    const radius = isWidget ? 60 : 180; 
    const circumference = 2 * Math.PI * radius; 
    const circle = document.getElementById('pomodoro-circle');
    
    circle.style.strokeDasharray = `${circumference} ${circumference}`; 
    const percent = Math.max(0, timeRemaining / totalPhaseTime); 
    circle.style.strokeDashoffset = circumference - (percent * circumference);
    
    if (timeRemaining <= 0 && timeRemaining > -2) {
        clearInterval(pomodoroInterval);
        const phase = focusPlaylist[currentPlaylistIndex];
        
        if (phase.type === 'task') {
            playBeep(400, 0.5); // Beep più grave e lungo (Fine)
            if (!phase.isPartial) {
                const t = templates.find(x => x.id === phase.id);
                if (t) { 
                    const currentLog = (logs[selectedDateStr] && logs[selectedDateStr][t.id]) || Array(t.instances).fill(false); 
                    const firstUncheckedIndex = currentLog.indexOf(false); 
                    if (firstUncheckedIndex !== -1) toggleTask(t.id, firstUncheckedIndex); 
                }
            }
        }
        
        currentPlaylistIndex++; 
        startCurrentPlaylistPhase();
    }
}

function togglePomodoroPause() { 
    isPomodoroPaused = !isPomodoroPaused; 
    document.getElementById('btn-pomodoro-pause').innerText = isPomodoroPaused ? "Resume" : "Pause"; 
}

function stopPomodoro() { 
    clearInterval(pomodoroInterval); 
    resetWidgetMode(); 
    document.getElementById('pomodoroOverlay').style.display = 'none'; 
    focusPlaylist = []; 
}

function handleFocusNoteKeyDown(event) { 
    if (event.key === 'Enter' && !event.shiftKey) { 
        event.preventDefault(); 
        saveFocusNote(); 
    } 
}

function saveFocusNote() {
    const cat = document.getElementById('focus-note-category').value; 
    const textEl = document.getElementById('focus-note-text'); 
    const text = textEl.value.trim(); 
    if (!text) return;
    
    if (!notesContent[cat]) notesContent[cat] = "";
    notesContent[cat] += (notesContent[cat] === "" ? "" : "\n\n") + text;
    localStorage.setItem('tracker_notes', JSON.stringify(notesContent));
    
    textEl.value = ''; 
    textEl.placeholder = "✓ Idea saved!"; 
    setTimeout(() => { textEl.placeholder = "Write your idea and press Enter..."; }, 1500); 
}

let isDraggingWidget = false; 
let widgetOffsetX, widgetOffsetY;

document.getElementById('widget-drag-handle').addEventListener('mousedown', (e) => { 
    isDraggingWidget = true; 
    const overlay = document.getElementById('pomodoroOverlay'); 
    widgetOffsetX = e.clientX - overlay.getBoundingClientRect().left; 
    widgetOffsetY = e.clientY - overlay.getBoundingClientRect().top; 
});

document.addEventListener('mousemove', (e) => { 
    if (!isDraggingWidget) return; 
    const overlay = document.getElementById('pomodoroOverlay'); 
    overlay.style.left = (e.clientX - widgetOffsetX) + 'px'; 
    overlay.style.top = (e.clientY - widgetOffsetY) + 'px'; 
    overlay.style.right = 'auto'; 
    overlay.style.bottom = 'auto'; 
});

document.addEventListener('mouseup', () => { 
    isDraggingWidget = false; 
});

function toggleWidgetMode() {
    const overlay = document.getElementById('pomodoroOverlay'); 
    const isWidget = overlay.classList.toggle('widget-mode');
    
    if (isWidget) { 
        overlay.style.top = '20px'; 
        overlay.style.right = '30px'; 
        overlay.style.left = 'auto'; 
        overlay.style.bottom = 'auto'; 
    } else {
        resetWidgetMode();
    }
    
    runPomodoroTick(); 
}

function resetWidgetMode() { 
    const overlay = document.getElementById('pomodoroOverlay'); 
    overlay.classList.remove('widget-mode'); 
    overlay.style.top = '0'; 
    overlay.style.left = '0'; 
    overlay.style.right = '0'; 
    overlay.style.bottom = '0'; 
}