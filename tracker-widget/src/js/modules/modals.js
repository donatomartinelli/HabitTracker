// --- js/modules/modals.js ---
// Iniezione sincrona dei modali HTML (Con nuovo Plan Tomorrow: Inbox + Blocchi Proporzionali + Timeline 06:30-24:00)

function initModalsHtml() {
    const root = document.getElementById('modals-root');
    if (!root) return;

    root.innerHTML = `
    <!-- 1. Journal Modal -->
    <div id="journalModal" class="modal-overlay" onclick="if(event.target === this) closeModals()">
        <div class="modal-content" style="width: 600px; height: 70vh; display: flex; flex-direction: column;">
            <h2 id="journal-title">Journal</h2>
            <input type="hidden" id="journal-date-hidden">
            <p class="modal-subtitle">Write your daily log, reflections, or review.</p>
            <textarea id="journal-text" class="form-control" style="flex: 1; resize: none; line-height: 1.5; padding: 15px;" placeholder="Log entry..."></textarea>
            <div class="modal-actions">
                <button class="btn" onclick="closeModals()">Close [Esc]</button>
                <button class="btn btn-primary" onclick="saveJournal()">Save Log</button>
            </div>
        </div>
    </div>

    <!-- 2. Pomodoro Timer Overlay -->
    <div id="pomodoroOverlay" class="pomodoro-overlay">
        <div id="widget-drag-handle">
            <span style="flex: 1; text-align: left;">:: FOCUS WIDGET</span>
            <button id="btn-widget-mode-full" class="icon-btn" style="font-size: var(--font-xs); padding-right: 8px;" onclick="toggleWidgetMode()">[+ FULL]</button>
        </div>
        <div id="focus-split-container" style="display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%; height: 100%; position: relative; padding: 24px;">
            <button id="btn-widget-mode" class="btn btn-sm" style="position: absolute; top: 25px; left: 25px;" onclick="toggleWidgetMode()">[_ MINI WIDGET]</button>
            
            <h2 id="pomodoro-task-title" style="color: var(--text-main); margin-bottom: 20px; text-align: center; font-weight: bold; border: none; font-size: var(--font-lg);">Task Name</h2>
            
            <div class="timer-circle-wrapper">
                <svg class="progress-ring" width="320" height="320" id="pomodoro-svg">
                    <circle stroke="#1a1a1a" stroke-width="4" fill="transparent" r="145" cx="160" cy="160" />
                    <circle id="pomodoro-circle" class="progress-ring__circle" stroke="#ffffff" stroke-width="4" fill="transparent" r="145" cx="160" cy="160" />
                </svg>
                <div class="timer-text-hover" id="pomodoro-time-text">25:00</div>
            </div>
            
            <div id="focus-controls" style="display: flex; gap: 12px; margin-top: 28px; z-index: 501;">
                <button id="btn-pomodoro-pause" class="btn btn-primary" onclick="togglePomodoroPause()">Pause</button>
                <button class="btn" onclick="skipPomodoroPhase()">Skip &amp; Check</button>
                <button class="btn" onclick="resetPomodoroPhase()">Reset</button>
                <button class="btn btn-danger" onclick="stopPomodoro()">Abort</button>
            </div>

            <div id="focus-live-queue" style="width: 100%; max-width: 460px; margin-top: 28px;"></div>
        </div>
    </div>

    <!-- 3. Timer Setup Modal -->
    <div id="timerSetupModal" class="modal-overlay" onclick="if(event.target === this) closeModals()">
        <div class="modal-content" style="width: 460px;">
            <h2>Focus Session Builder</h2>
            <form id="timerSetupForm">
                <p class="modal-subtitle">1. Select active timed tasks from selected date</p>
                <div id="focus-available-tasks" style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 20px;"></div>
                <p class="modal-subtitle">2. Focus Playlist</p>
                <div id="focus-playlist" style="display: flex; flex-direction: column; gap: 6px; background: rgba(255,255,255,0.02); padding: 10px; border: 1px solid var(--border-color); min-height: 100px; margin-bottom: 20px;"></div>
                <div class="modal-actions">
                    <button type="button" class="btn" onclick="closeModals()">Cancel</button>
                    <button type="submit" class="btn btn-primary" id="btn-start-playlist" disabled>Start Focus</button>
                </div>
            </form>
        </div>
    </div>

    <!-- 5. Combined Creation Modal (Habits, Events, Medicines) -->
    <div id="creationModal" class="modal-overlay" onclick="if(event.target === this) closeModals()">
        <div class="modal-content">
            <h2>Add to Planner</h2>
            <div class="task-type-toggle" style="margin-bottom: 20px;">
                <label class="type-radio">
                    <input type="radio" name="creation-type" value="habit" checked onchange="toggleCreationType()"> Habit / Task
                </label>
                <label class="type-radio">
                    <input type="radio" name="creation-type" value="event" onchange="toggleCreationType()"> Single Event
                </label>
                <label class="type-radio">
                    <input type="radio" name="creation-type" value="medicine" onchange="toggleCreationType()"> Medicine
                </label>
            </div>

            <form id="habitForm">
                <input type="hidden" id="h-id">
                <div class="form-group">
                    <label>Category / Calendar</label>
                    <input type="text" id="h-category" class="form-control" placeholder="e.g. French, Studio, Routine" required>
                </div>
                <div class="form-group">
                    <label>Task Name</label>
                    <input type="text" id="h-title" class="form-control" placeholder="e.g. Duolingo, Analisi II, Log transactions" required>
                </div>
                <div class="form-group">
                    <label>Color</label>
                    <div class="color-palette" id="habit-color-palette">
                        <div class="color-circle active" style="background: #ffffff;" data-color="#ffffff" onclick="selectColor(this, 'h-color')"></div>
                        <div class="color-circle" style="background: #b84b4b;" data-color="#b84b4b" onclick="selectColor(this, 'h-color')"></div>
                        <div class="color-circle" style="background: #5f7a61;" data-color="#5f7a61" onclick="selectColor(this, 'h-color')"></div>
                        <div class="color-circle" style="background: #4c5b73;" data-color="#4c5b73" onclick="selectColor(this, 'h-color')"></div>
                        <div class="color-circle" style="background: #b08d43;" data-color="#b08d43" onclick="selectColor(this, 'h-color')"></div>
                        <div class="color-circle" style="background: #725b7a;" data-color="#725b7a" onclick="selectColor(this, 'h-color')"></div>
                        <div class="color-circle" style="background: #6e7073;" data-color="#6e7073" onclick="selectColor(this, 'h-color')"></div>
                        <div class="color-circle custom-color-btn" onclick="document.getElementById('h-color').click()">+</div>
                    </div>
                    <input type="color" id="h-color" style="display: none;" value="#ffffff" onchange="updateCustomColor(this, 'h-color')">
                </div>
                <div style="display: flex; gap: 15px;">
                    <div class="form-group" style="flex: 1;">
                        <label>Start Date</label>
                        <input type="date" id="h-startdate" class="form-control" required>
                    </div>
                    <div class="form-group" style="flex: 1;">
                        <label>End Date (optional)</label>
                        <input type="date" id="h-enddate" class="form-control">
                    </div>
                </div>
                <div class="form-group">
                    <label>Schedule Mode</label>
                    <div class="task-type-toggle">
                        <label class="type-radio">
                            <input type="radio" name="h-type" value="timed" onchange="toggleHabitType()"> Timed (Grid)
                        </label>
                        <label class="type-radio">
                            <input type="radio" name="h-type" value="untimed" checked onchange="toggleHabitType()"> Untimed (Flexible)
                        </label>
                    </div>
                </div>
                <div id="timed-section" style="display: none;">
                    <div class="form-group">
                        <label>Time Windows &amp; Days</label>
                        <div id="h-time-windows-container"></div>
                        <button type="button" class="btn" style="width: 100%; border-style: dashed; margin-bottom: 10px;" onclick="addHabitTimeWindow()">+ Add Time Window</button>
                    </div>
                </div>
                <div id="untimed-section">
                    <div class="form-group">
                        <label>Task Measurement Mode</label>
                        <div class="task-type-toggle">
                            <label class="type-radio">
                                <input type="radio" name="h-timer-mode" value="measured" checked onchange="toggleTaskTimerMode()"> Focus Timer (Measured)
                            </label>
                            <label class="type-radio">
                                <input type="radio" name="h-timer-mode" value="checkonly" onchange="toggleTaskTimerMode()"> Check-Only Routine (No Timer)
                            </label>
                        </div>
                    </div>
                    <div style="display: flex; gap: 15px;">
                        <div class="form-group" style="flex: 1;">
                            <label>Daily Repetitions (Blocks)</label>
                            <input type="number" id="h-instances" class="form-control" value="1" min="1" max="50">
                        </div>
                        <div class="form-group" style="flex: 1;" id="h-timer-group">
                            <label>Minutes per Block</label>
                            <input type="number" id="h-timer" class="form-control" value="25" min="1">
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Frequency</label>
                        <select id="h-frequency" class="form-control" onchange="toggleDays()">
                            <option value="all">Every day</option>
                            <option value="weekdays">Weekdays (Mon-Fri)</option>
                            <option value="weekends">Weekends (Sat-Sun)</option>
                            <option value="specific">Specific days</option>
                        </select>
                    </div>
                    <div class="form-group days-checkboxes" id="h-days-container" style="display: flex; gap: 10px;">
                        <label class="day-check"><input type="checkbox" value="1"> Mon</label>
                        <label class="day-check"><input type="checkbox" value="2"> Tue</label>
                        <label class="day-check"><input type="checkbox" value="3"> Wed</label>
                        <label class="day-check"><input type="checkbox" value="4"> Thu</label>
                        <label class="day-check"><input type="checkbox" value="5"> Fri</label>
                        <label class="day-check"><input type="checkbox" value="6"> Sat</label>
                        <label class="day-check"><input type="checkbox" value="0"> Sun</label>
                    </div>
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn" onclick="closeModals()">Cancel</button>
                    <button type="submit" class="btn btn-primary">Save Habit</button>
                </div>
            </form>

            <form id="eventForm" style="display: none;">
                <div class="form-group">
                    <label>Event Name</label>
                    <input type="text" id="e-title" class="form-control" required>
                </div>
                <div class="form-group">
                    <label>Date</label>
                    <input type="date" id="e-date" class="form-control" required>
                </div>
                <div style="display: flex; gap: 15px;">
                    <div class="form-group" style="flex: 1;">
                        <label>Start Time (Optional)</label>
                        <input type="time" id="e-start" class="form-control">
                    </div>
                    <div class="form-group" style="flex: 1;">
                        <label>End Time (Optional)</label>
                        <input type="time" id="e-end" class="form-control">
                    </div>
                </div>
                <div class="form-group">
                    <label>Color</label>
                    <div class="color-palette" id="event-color-palette">
                        <div class="color-circle active" style="background: #b84b4b;" data-color="#b84b4b" onclick="selectColor(this, 'e-color')"></div>
                        <div class="color-circle" style="background: #5f7a61;" data-color="#5f7a61" onclick="selectColor(this, 'e-color')"></div>
                        <div class="color-circle" style="background: #4c5b73;" data-color="#4c5b73" onclick="selectColor(this, 'e-color')"></div>
                        <div class="color-circle" style="background: #b08d43;" data-color="#b08d43" onclick="selectColor(this, 'e-color')"></div>
                        <div class="color-circle custom-color-btn" onclick="document.getElementById('e-color').click()">+</div>
                    </div>
                    <input type="color" id="e-color" style="display: none;" value="#b84b4b" onchange="updateCustomColor(this, 'e-color')">
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn" onclick="closeModals()">Cancel</button>
                    <button type="submit" class="btn btn-primary">Save Event</button>
                </div>
            </form>

            <form id="medicineForm" style="display: none;">
                <div class="form-group">
                    <label>Medicine Name</label>
                    <input type="text" id="med-title" class="form-control" placeholder="e.g. Vitamin D" required>
                </div>
                <div style="display: flex; gap: 15px;">
                    <div class="form-group" style="flex: 1;">
                        <label>Doses per day</label>
                        <input type="number" id="med-instances" class="form-control no-spinners" value="1" min="1" required>
                    </div>
                    <div class="form-group" style="flex: 1;">
                        <label>Current Stock (Total doses)</label>
                        <input type="number" id="med-stock" class="form-control no-spinners" placeholder="e.g. 30" required>
                    </div>
                </div>
                <div style="display: flex; gap: 15px;">
                    <div class="form-group" style="flex: 1;">
                        <label>Start Date</label>
                        <input type="date" id="med-startdate" class="form-control" required>
                    </div>
                    <div class="form-group" style="flex: 1;">
                        <label>Alert Days Before Runout</label>
                        <input type="number" id="med-alert" class="form-control no-spinners" value="7" min="1" required>
                    </div>
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn" onclick="closeModals()">Cancel</button>
                    <button type="submit" class="btn btn-primary">Save Medicine</button>
                </div>
            </form>
        </div>
    </div>

    <!-- 6. Rename Category Modal -->
    <div id="renameModal" class="modal-overlay" onclick="if(event.target === this) closeModals()">
        <div class="modal-content" style="width: 400px;">
            <h2>Rename Category</h2>
            <form id="renameForm">
                <input type="hidden" id="r-old-name">
                <div class="form-group">
                    <label>New Name</label>
                    <input type="text" id="r-new-name" class="form-control" required>
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn" onclick="closeModals()">Cancel</button>
                    <button type="submit" class="btn btn-primary">Save</button>
                </div>
            </form>
        </div>
    </div>

    <!-- 7. Manager & System Config Modal -->
    <div id="managerModal" class="modal-overlay" onclick="if(event.target === this) closeModals()">
        <div class="modal-content">
            <h2>System Configuration &amp; Habits</h2>
            <div class="cfg-box">
                <label style="display: flex; justify-content: space-between; color: var(--text-dim); font-size: var(--font-xs); text-transform: uppercase; margin-bottom: 8px;">
                    <span>Background Opacity</span>
                    <span id="opacity-val">0.92</span>
                </label>
                <input type="range" id="bg-opacity-slider" min="0.1" max="1.0" step="0.01" value="0.92" style="width: 100%; accent-color: var(--text-main);" oninput="updateOpacity(this.value)">
            </div>
            <div class="cfg-box" style="display: flex; justify-content: space-between; align-items: center;">
                <span style="color: var(--text-dim); font-size: var(--font-xs); text-transform: uppercase;">Database Backup</span>
                <div style="display: flex; gap: 10px;">
                    <button class="btn btn-sm" onclick="exportData()">[EXPORT JSON]</button>
                    <label class="btn btn-sm" style="cursor: pointer; margin: 0;">
                        [IMPORT JSON]
                        <input type="file" accept=".json" style="display: none;" onchange="importData(event)">
                    </label>
                </div>
            </div>
            <div class="cfg-box">
                <label style="display: flex; justify-content: space-between; color: var(--text-dim); font-size: var(--font-xs); text-transform: uppercase; margin-bottom: 6px;">
                    <span>AI Voice Refiner // Gemini Flash API Key</span>
                    <span id="gemini-key-status" style="color: var(--accent-green);"></span>
                </label>
                <div style="display: flex; gap: 8px;">
                    <input type="password" id="gemini-api-key-input" class="form-control form-control-sm" placeholder="Paste Gemini API Key (AIzaSy...)..." oninput="handleGeminiKeyInput(this.value)">
                    <button type="button" class="btn btn-sm" onclick="const inp=document.getElementById('gemini-api-key-input'); inp.type = inp.type==='password' ? 'text' : 'password';">[SHOW]</button>
                </div>
            </div>
            <div class="cfg-box">
                <label style="display: flex; justify-content: space-between; color: var(--text-dim); font-size: var(--font-xs); text-transform: uppercase; margin-bottom: 6px;">
                    <span>Sony Recorder Pipeline // Dedicated Gemini Key</span>
                    <span id="gemini-audio-key-status" style="color: var(--text-dim);"></span>
                </label>
                <div style="display: flex; gap: 8px; margin-bottom: 8px;">
                    <input type="password" id="gemini-audio-key-input" class="form-control form-control-sm" placeholder="Optional 2nd API Key..." oninput="handleGeminiAudioKeyInput(this.value)">
                    <button type="button" class="btn btn-sm" onclick="const inp=document.getElementById('gemini-audio-key-input'); inp.type = inp.type==='password' ? 'text' : 'password';">[SHOW]</button>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span id="processed-audio-count" style="font-size: var(--font-xs); color: var(--text-dim);">0 audio files in history</span>
                    <button type="button" class="btn btn-sm" onclick="resetProcessedAudioHistory()">[RESET AUDIO MEMORY]</button>
                </div>
            </div>
            <div id="manager-list" class="manager-list"></div>
            <div class="quick-add-task new-calendar-add">
                <span>+</span>
                <input type="text" placeholder="Create new category and press Enter..." onkeypress="quickAddCalendar(event)">
            </div>
            <div class="modal-actions">
                <button class="btn btn-primary" onclick="closeModals(); renderTasks();">Close</button>
            </div>
        </div>
    </div>

    <!-- 8. Manage Note Categories Modal -->
    <div id="manageNotesModal" class="modal-overlay" onclick="if(event.target === this) closeModals()">
        <div class="modal-content" style="width: 420px;">
            <h2>Note Categories</h2>
            <div id="notes-manager-list" class="manager-list"></div>
            <div class="quick-add-task new-calendar-add">
                <span>+</span>
                <input type="text" placeholder="Add new category and press Enter..." onkeypress="quickAddNoteCategory(event)">
            </div>
            <div class="modal-actions">
                <button class="btn btn-primary" onclick="closeModals(); renderNoteCategories();">Close</button>
            </div>
        </div>
    </div>

    <!-- 9. Delete Options Modal -->
    <div id="deleteModal" class="modal-overlay" onclick="if(event.target === this) closeModals()">
        <div class="modal-content" style="width: 450px;">
            <h2 id="delete-modal-title">Delete Options</h2>
            <p class="modal-subtitle">Select action for <strong style="color: white;" id="delete-target-name"></strong>:</p>
            <div style="display: flex; flex-direction: column; gap: 10px;">
                <button id="btn-del-single" class="btn" style="text-align: left; padding: 12px;" onclick="confirmDelete('single')">
                    <strong>Delete for selected date only</strong>
                </button>
                <button id="btn-del-future" class="btn" style="text-align: left; padding: 12px;" onclick="confirmDelete('future')">
                    <strong>Delete from selected date onwards</strong>
                </button>
                <button class="btn btn-danger" style="text-align: left; padding: 12px;" onclick="confirmDelete('all')">
                    <strong>Delete completely from database</strong>
                </button>
            </div>
            <div class="modal-actions">
                <button class="btn" onclick="closeModals()">Cancel</button>
            </div>
        </div>
    </div>

    <!-- 10. Assign General To-Do Modal -->
    <div id="assignModal" class="modal-overlay" onclick="if(event.target === this) closeModals()">
        <div class="modal-content" style="width: 400px;">
            <h2>Assign Tasks</h2>
            <p class="modal-subtitle">Select target date for selected tasks:</p>
            <form id="assignForm">
                <div class="form-group">
                    <label>Target Date</label>
                    <input type="date" id="assign-date" class="form-control" required>
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn" onclick="closeModals()">Cancel</button>
                    <button type="submit" class="btn btn-primary">Confirm</button>
                </div>
            </form>
        </div>
    </div>

    <!-- 11. Consistency Tracker & Real Focus Hours Ledger Modal -->
    <div id="trackerModal" class="modal-overlay" onclick="if(event.target === this) closeModals()">
        <div class="modal-content" style="width: 780px; max-width: 94%;">
            <h2>Consistency History &amp; Real Focus Ledger</h2>
            <div class="sub-column-header">Habit Completion Grid</div>
            <div class="tracker-wrapper" style="margin-bottom: 22px;">
                <div class="tracker-grid" id="github-tracker" style="margin-top: 5px;"></div>
            </div>
            <div class="sub-column-header" style="display: flex; justify-content: space-between; align-items: center;">
                <span>Real Focus Hours Ledger (From Completed Tasks &amp; Calendars)</span>
                <span id="focus-ledger-summary" style="color: var(--text-main); font-weight: bold;">TOTAL: 0.0H</span>
            </div>
            <div id="focus-ledger-container" style="margin-bottom: 18px;"></div>
            <div class="modal-actions">
                <button class="btn btn-primary" onclick="closeModals()">Close [Esc]</button>
            </div>
        </div>
    </div>

    <!-- 12. Evening Builder: Plan Tomorrow Modal (CON TIMELINE 1-DAY 06:30-24:00 E BLOCCHI PROPORZIONALI) -->
    <div id="planTomorrowModal" class="modal-overlay" onclick="if(event.target === this) closeModals()">
        <div class="modal-content" style="width: 960px; max-width: 96%; height: 88vh; display: flex; flex-direction: column;">
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); padding-bottom: 10px; margin-bottom: 14px; flex-shrink: 0;">
                <div>
                    <h2 style="margin: 0; border: none; padding: 0;">Evening Builder // 1-Day Timeline (06:30 – 24:00)</h2>
                    <span style="font-size: var(--font-xs); color: var(--text-dim);">Drag task blocks onto the timeline or choose start time. Block height matches exact minutes.</span>
                </div>
                <span id="plan-tmw-date-label" style="font-size: var(--font-sm); color: var(--text-main); font-weight: bold; padding: 4px 10px; border: 1px solid var(--border-color);">YYYY-MM-DD</span>
            </div>

            <div style="display: flex; gap: 20px; flex: 1; overflow: hidden; min-height: 0;">
                
                <!-- COLONNA SINISTRA: Priorità, Inbox, Blocchi Task Proporzionali da Piazzare & Quick Add -->
                <div style="width: 44%; display: flex; flex-direction: column; gap: 14px; overflow-y: auto; padding-right: 8px; border-right: 1px solid var(--border-color);">
                    
                    <div class="form-group" style="margin-bottom: 0;">
                        <label>Tomorrow's #1 Priority / Main Objective</label>
                        <input type="text" id="plan-tmw-priority" class="form-control form-control-sm" placeholder="e.g. Complete Analysis II proofs..." oninput="saveTomorrowPriority(this.value)">
                    </div>

                    <!-- 1. Blocchi Task Attive Domani (con scelta numero blocchi es. Algebra 2x30m e Drag & Drop) -->
                    <div>
                        <div class="sub-column-header" style="display:flex; justify-content:space-between;">
                            <span>1. Tomorrow's Task Blocks (Drag to Timeline)</span>
                            <span id="plan-tmw-workload-badge" style="color:var(--text-main); font-weight:bold;">0.0H</span>
                        </div>
                        <div id="plan-tmw-available-blocks" style="display: flex; flex-direction: column; gap: 6px;"></div>
                    </div>

                    <!-- 2. General To-Do Inbox (Senza più le abitudini ripetute di oggi) -->
                    <div>
                        <div class="sub-column-header">2. General To-Do Inbox (Move to Tomorrow)</div>
                        <div id="plan-tmw-inbox" style="display: flex; flex-direction: column; gap: 6px;"></div>
                    </div>

                    <!-- 3. Quick Add Nuova Task per Domani -->
                    <div style="border-top: 1px solid var(--border-color); padding-top: 10px;">
                        <div class="sub-column-header">3. Create New Task Block for Tomorrow</div>
                        <div style="display: flex; gap: 6px; align-items: center;">
                            <input type="text" id="plan-tmw-new-title" class="form-control form-control-sm" style="flex: 1;" placeholder="Task title..." onkeydown="if(event.key==='Enter'){event.preventDefault(); addQuickTomorrowTask();}">
                            <input type="number" id="plan-tmw-new-mins" class="form-control form-control-sm no-spinners" style="width: 58px; text-align:center;" value="30" min="5" step="5" title="Duration in minutes">
                            <span style="font-size:var(--font-xs); color:var(--text-dim);">MIN</span>
                            <input type="time" id="plan-tmw-new-start" class="form-control form-control-sm" style="width: 88px;" title="Optional start time">
                            <button type="button" class="btn btn-primary btn-sm" onclick="addQuickTomorrowTask()">[+ ADD]</button>
                        </div>
                    </div>
                </div>

                <!-- COLONNA DESTRA: TIMELINE GIORNALIERA 06:30 - 24:00 IDENTICA AL WEEKLY PLANNER -->
                <div style="flex: 1; display: flex; flex-direction: column; min-height: 0; overflow: hidden;">
                    <div class="sub-column-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; flex-shrink: 0;">
                        <span>TOMORROW'S TIMELINE (06:30 – 24:00)</span>
                        <span style="color: var(--text-dim); font-size: 0.65rem;">DRAG BLOCKS TO SCHEDULE OR MOVE · RIGHT-CLICK TO UNSCHEDULE</span>
                    </div>

                    <div id="plan-tmw-timeline-scroll" style="flex: 1; display: flex; overflow-y: auto; position: relative; border: 1px solid var(--border-color); background: rgba(255,255,255,0.01); padding-top: 10px;">
                        <div id="plan-tmw-time-labels" class="planner-time-labels" style="width: 48px;"></div>
                        <div id="plan-tmw-day-canvas" class="planner-col-absolute" style="flex: 1; position: relative;"></div>
                    </div>
                </div>
            </div>

            <div class="modal-actions" style="margin-top: 14px; flex-shrink: 0;">
                <button type="button" class="btn" onclick="closeModals()">Close</button>
                <button type="button" class="btn btn-primary" onclick="closeModals(); jumpToDate(tomorrowStr);">Lock Plan &amp; View Tomorrow [&gt;]</button>
            </div>
        </div>
    </div>

    <!-- 13. Money Transaction Modal -->
    <div id="mTransactionModal" class="modal-overlay" onclick="if(event.target === this) closeModals()">
        <div class="modal-content" style="width: 420px;">
            <h2 id="m-trans-title">New Transaction</h2>
            <form id="mTransactionForm">
                <input type="hidden" id="m-trans-type">
                <div style="display: flex; gap: 12px;">
                    <div class="form-group" style="flex: 1;">
                        <label>Amount (€)</label>
                        <input type="number" id="m-trans-amount" class="form-control no-spinners" step="0.01" required>
                    </div>
                    <div class="form-group" style="flex: 1;" id="m-trans-cat-group">
                        <label>Category</label>
                        <input type="text" id="m-trans-cat" list="m-cat-datalist" class="form-control" placeholder="e.g. Treno, Cinema">
                        <datalist id="m-cat-datalist"></datalist>
                    </div>
                </div>
                <div class="form-group">
                    <label>Description</label>
                    <input type="text" id="m-trans-desc" class="form-control" required>
                </div>
                <div class="form-group">
                    <label>Date</label>
                    <input type="date" id="m-trans-date" class="form-control" required>
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn" onclick="closeModals()">Cancel</button>
                    <button type="submit" class="btn btn-primary">Save</button>
                </div>
            </form>
        </div>
    </div>

    <!-- 13B. Create / Edit Vault Modal -->
    <div id="mVaultModal" class="modal-overlay" onclick="if(event.target === this) closeModals()">
        <div class="modal-content" style="width: 450px;">
            <h2>Create / Edit Vault (Salvadanaio)</h2>
            <form id="mVaultForm">
                <input type="hidden" id="m-vault-id">
                <div class="form-group">
                    <label>Vault Name</label>
                    <input type="text" id="m-vault-name" class="form-control" placeholder="e.g. Fondo Emergenza, Viaggio" required>
                </div>
                <div style="display: flex; gap: 12px;">
                    <div class="form-group" style="flex: 1;">
                        <label>Initial Deposit (€)</label>
                        <input type="number" id="m-vault-balance" class="form-control no-spinners" step="0.01" value="0" min="0" required>
                    </div>
                    <div class="form-group" style="flex: 1;">
                        <label>Target Goal (€, Optional)</label>
                        <input type="number" id="m-vault-target" class="form-control no-spinners" step="0.01" min="0" placeholder="e.g. 500">
                    </div>
                </div>
                <div class="form-group">
                    <label>Automatic Rule</label>
                    <select id="m-vault-rule-type" class="form-control" onchange="toggleVaultRuleInput()">
                        <option value="none">Manual only (No automatic rule)</option>
                        <option value="percent_in">Auto-save % of every Income (+ IN)</option>
                        <option value="monthly_fixed">Auto-save Fixed € on Day 1 of each Month</option>
                    </select>
                </div>
                <div class="form-group" id="m-vault-rule-val-group" style="display: none;">
                    <label id="m-vault-rule-val-label">Rule Value</label>
                    <input type="number" id="m-vault-rule-val" class="form-control no-spinners" step="0.01" min="0" placeholder="e.g. 15">
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn" onclick="closeModals()">Cancel</button>
                    <button type="submit" class="btn btn-primary">Save Vault</button>
                </div>
            </form>
        </div>
    </div>

    <!-- 13C. Vault Transfer Modal -->
    <div id="mVaultTransferModal" class="modal-overlay" onclick="if(event.target === this) closeModals()">
        <div class="modal-content" style="width: 380px;">
            <h2 id="m-vtrans-title">Vault Transfer</h2>
            <form id="mVaultTransferForm">
                <input type="hidden" id="m-vtrans-id">
                <input type="hidden" id="m-vtrans-dir">
                <div class="form-group">
                    <label>Amount (€)</label>
                    <input type="number" id="m-vtrans-amount" class="form-control no-spinners" step="0.01" min="0.01" required>
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn" onclick="closeModals()">Cancel</button>
                    <button type="submit" class="btn btn-primary">Confirm</button>
                </div>
            </form>
        </div>
    </div>

    <!-- 14. Recurring Payment Modal -->
    <div id="mRecurringModal" class="modal-overlay" onclick="if(event.target === this) closeModals()">
        <div class="modal-content" style="width: 450px;">
            <h2>Add Recurring Payment</h2>
            <form id="mRecurringForm">
                <div class="form-group">
                    <label>Name</label>
                    <input type="text" id="m-rec-title" class="form-control" required>
                </div>
                <div style="display: flex; gap: 15px;">
                    <div class="form-group" style="flex: 1;">
                        <label>Amount (€)</label>
                        <input type="number" id="m-rec-amount" class="form-control no-spinners" step="0.01" required>
                    </div>
                    <div class="form-group" style="flex: 1;">
                        <label>Day of Month (1-31)</label>
                        <input type="number" id="m-rec-day" class="form-control no-spinners" min="1" max="31" required>
                    </div>
                </div>
                <div style="display: flex; gap: 15px;">
                    <div class="form-group" style="flex: 1;">
                        <label>Start Date</label>
                        <input type="date" id="m-rec-start" class="form-control" required>
                    </div>
                    <div class="form-group" style="flex: 1;">
                        <label>End Date (Optional)</label>
                        <input type="date" id="m-rec-end" class="form-control">
                    </div>
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn" onclick="closeModals()">Cancel</button>
                    <button type="submit" class="btn btn-primary">Save</button>
                </div>
            </form>
        </div>
    </div>

    <!-- 15. Purchase Idea Modal -->
    <div id="mWishlistModal" class="modal-overlay" onclick="if(event.target === this) closeModals()">
        <div class="modal-content" style="width: 400px;">
            <h2>Purchase Idea</h2>
            <form id="mWishlistForm">
                <div class="form-group">
                    <label>Item Name</label>
                    <input type="text" id="m-wish-title" class="form-control" required>
                </div>
                <div class="form-group">
                    <label>Estimated Cost (€, Optional)</label>
                    <input type="number" id="m-wish-cost" class="form-control no-spinners" step="0.01">
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn" onclick="closeModals()">Cancel</button>
                    <button type="submit" class="btn btn-primary">Save</button>
                </div>
            </form>
        </div>
    </div>

    <!-- 16. Ghost Layer Modal -->
    <div id="referenceModal" class="modal-overlay" onclick="if(event.target === this) closeModals()">
        <div class="modal-content" style="width: 450px;">
            <h2>Add Ghost Layer</h2>
            <form id="referenceForm">
                <input type="hidden" id="ref-id">
                <div class="form-group">
                    <label>Layer Name</label>
                    <input type="text" id="ref-title" class="form-control" required>
                </div>
                <div class="form-group">
                    <label>Time Windows &amp; Days</label>
                    <div id="ref-time-windows-container"></div>
                    <button type="button" class="btn" style="width: 100%; border-style: dashed; margin-bottom: 10px;" onclick="addRefTimeWindow()">+ Add Time Window</button>
                </div>
                <div class="form-group">
                    <label>Color</label>
                    <div class="color-palette" id="ref-color-palette">
                        <div class="color-circle active" style="background: #444444;" data-color="#444444" onclick="selectColor(this, 'r-color')"></div>
                        <div class="color-circle" style="background: #b84b4b;" data-color="#b84b4b" onclick="selectColor(this, 'r-color')"></div>
                        <div class="color-circle custom-color-btn" onclick="document.getElementById('r-color').click()">+</div>
                    </div>
                    <input type="color" id="r-color" style="display: none;" value="#444444" onchange="updateCustomColor(this, 'r-color')">
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn" onclick="closeModals()">Cancel</button>
                    <button type="submit" class="btn btn-primary">Save</button>
                </div>
            </form>
        </div>
    </div>

    <!-- 16B. Nutritional Database Modal -->
    <div id="foodDbModal" class="modal-overlay" onclick="if(event.target === this) closeModals()">
        <div class="modal-content" style="width: 680px; max-width: 95%; max-height: 85vh; display: flex; flex-direction: column;">
            <h2>Nutritional Database (Values per 100g)</h2>
            <p class="modal-subtitle">Used to automatically estimate daily Kcal, Proteins (P), Carbs (C) and Fats (F) from your Diet table.</p>
            <div style="display: grid; grid-template-columns: 2fr 1fr 1fr 1fr 1fr 1fr auto; gap: 6px; margin-bottom: 14px; align-items: end; padding-bottom: 12px; border-bottom: 1px solid var(--border-color);">
                <div>
                    <label style="font-size: 0.65rem; color: var(--text-dim); display: block; margin-bottom: 4px;">FOOD NAME</label>
                    <input type="text" id="fdb-name" class="form-control form-control-sm" placeholder="e.g. Avena">
                </div>
                <div>
                    <label style="font-size: 0.65rem; color: var(--text-dim); display: block; margin-bottom: 4px;">KCAL/100G</label>
                    <input type="number" id="fdb-kcal" class="form-control form-control-sm no-spinners" placeholder="389">
                </div>
                <div>
                    <label style="font-size: 0.65rem; color: var(--text-dim); display: block; margin-bottom: 4px;">PROT (G)</label>
                    <input type="number" id="fdb-p" class="form-control form-control-sm no-spinners" step="0.1" placeholder="16.9">
                </div>
                <div>
                    <label style="font-size: 0.65rem; color: var(--text-dim); display: block; margin-bottom: 4px;">CARB (G)</label>
                    <input type="number" id="fdb-c" class="form-control form-control-sm no-spinners" step="0.1" placeholder="66.3">
                </div>
                <div>
                    <label style="font-size: 0.65rem; color: var(--text-dim); display: block; margin-bottom: 4px;">FAT (G)</label>
                    <input type="number" id="fdb-f" class="form-control form-control-sm no-spinners" step="0.1" placeholder="6.9">
                </div>
                <div>
                    <label style="font-size: 0.65rem; color: var(--text-dim); display: block; margin-bottom: 4px;">STD GRAMS</label>
                    <input type="number" id="fdb-defg" class="form-control form-control-sm no-spinners" placeholder="100" value="100">
                </div>
                <button type="button" class="btn btn-primary btn-sm" style="height: 29px;" onclick="addFoodDbItem()">[+ ADD]</button>
            </div>
            <div id="food-db-list" style="flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; padding-right: 6px;"></div>
            <div class="modal-actions">
                <button type="button" class="btn btn-primary" onclick="closeModals(); renderDiet();">Save &amp; Recalculate</button>
            </div>
        </div>
    </div>

    <!-- 19. System Manual Modal -->
    <div id="shortcutsHelpModal" class="modal-overlay" onclick="if(event.target === this) closeModals()">
        <div class="modal-content" style="width: 880px; max-width: 96%; max-height: 90vh;">
            <div style="display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1px solid var(--border-color); padding-bottom: 8px; margin-bottom: 16px;">
                <h2 style="margin: 0; border: none; padding: 0;">System Manual // CLI, Shortcuts &amp; Interactions</h2>
                <span style="font-size: var(--font-xs); color: var(--text-dim);">OPEN ANYTIME WITH [?] OR [CTRL + SPACE]</span>
            </div>
            <div class="help-manual-columns">
                <div class="help-section-card">
                    <div class="help-section-title">1. CLI // Tasks, Planner &amp; Focus</div>
                    <div class="help-grid">
                        <div class="help-key">focus [task/cat]</div><div class="help-desc">Start Focus using the task's own duration &amp; auto-check</div>
                        <div class="help-key">done [task]</div><div class="help-desc">Check off today's matching task</div>
                        <div class="help-key">plan</div><div class="help-desc">Open Evening Builder 1-Day Timeline (06:30–24:00)</div>
                        <div class="help-key">todo [text]</div><div class="help-desc">Add item to General To-Do inbox</div>
                        <div class="help-key">task [text] [@day]</div><div class="help-desc">Schedule task on <code>@oggi</code>, <code>@domani</code> or <code>@YYYY-MM-DD</code></div>
                        <div class="help-key">event [@day] [title]</div><div class="help-desc">Add calendar event</div>
                        <div class="help-key">note [cat]: [text]</div><div class="help-desc">Append note to category</div>
                        <div class="help-key">ledger</div><div class="help-desc">Open Consistency Grid &amp; Real Focus Hours Ledger</div>
                    </div>
                </div>
                <div class="help-section-card">
                    <div class="help-section-title">2. CLI // Money, Diet &amp; Gym</div>
                    <div class="help-grid">
                        <div class="help-key">out [€] #[cat] [desc]</div><div class="help-desc">Log categorized expense</div>
                        <div class="help-key">in [€] [desc]</div><div class="help-desc">Log income &amp; trigger Vault % rules</div>
                        <div class="help-key">wish [item] [€]</div><div class="help-desc">Add idea to Incubator</div>
                        <div class="help-key">vault</div><div class="help-desc">Create a new Salvadanaio / Auto-Rule</div>
                        <div class="help-key">weight [kg] [note]</div><div class="help-desc">Log body weight &amp; note</div>
                        <div class="help-key">gym done</div><div class="help-desc">Complete active workout day &amp; advance</div>
                        <div class="help-key">red</div><div class="help-desc">Toggle Red Gelatin Mode</div>
                    </div>
                </div>
            </div>
            <div class="modal-actions" style="margin-top: 10px;">
                <button class="btn btn-primary" onclick="closeModals()">Close Manual [Esc]</button>
            </div>
        </div>
    </div>
    `;
}

initModalsHtml();

function closeModals() {
    document.querySelectorAll('.modal-overlay').forEach(m => {
        m.style.display = 'none';
    });
}

function selectColor(element, inputId) {
    const parent = element.closest('.color-palette');
    if (!parent) return;
    parent.querySelectorAll('.color-circle').forEach(el => el.classList.remove('active'));
    element.classList.add('active');
    const inp = document.getElementById(inputId);
    if (inp) inp.value = element.getAttribute('data-color');
}

function updateCustomColor(input, inputId) {
    const group = input.closest('.form-group');
    if (!group) return;
    const parent = group.querySelector('.color-palette');
    if (!parent) return;

    parent.querySelectorAll('.color-circle').forEach(el => el.classList.remove('active'));
    const preset = parent.querySelector(`.color-circle[data-color="${input.value}"]`);

    if (preset) {
        preset.classList.add('active');
    } else {
        const customBtn = parent.querySelector('.custom-color-btn');
        if (customBtn) {
            customBtn.classList.add('active');
            customBtn.style.background = input.value;
            customBtn.style.borderColor = input.value;
        }
    }

    const targetInp = document.getElementById(inputId);
    if (targetInp) targetInp.value = input.value;
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

const btnClose = document.getElementById('btn-close-app');
if (btnClose) {
    btnClose.addEventListener('click', () => {
        if (window.__TAURI__) {
            window.__TAURI__.window.getCurrentWindow().close();
        } else {
            window.close();
        }
    });
}