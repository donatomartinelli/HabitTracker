// --- js/modules/modals.js ---
// Iniezione sincrona dei modali HTML (Con Manuale DSL Strutturato ? e Pipeline Sony Intatta)

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
    <div id="pomodoroOverlay" class="pomodoro-overlay" style="z-index: 2500;">
        <div id="widget-drag-handle">
            <span style="flex: 1; text-align: left;">:: FOCUS WIDGET</span>
            <button id="btn-widget-mode-full" class="icon-btn" style="font-size: var(--font-xs); padding-right: 8px;" onclick="toggleWidgetMode()">[+ FULL]</button>
        </div>
        <div id="focus-split-container" style="display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%; height: 100%; position: relative; padding: 24px;">
            <button id="btn-widget-mode" class="btn btn-sm" style="position: absolute; top: 25px; left: 25px; z-index: 2510;" onclick="toggleWidgetMode()">[_ MINIMIZE TO HEADER]</button>
            
            <h2 id="pomodoro-task-title" style="color: var(--text-main); margin-bottom: 20px; text-align: center; font-weight: bold; border: none; font-size: var(--font-lg);">Task Name</h2>
            
            <div class="timer-circle-wrapper">
                <svg class="progress-ring" width="320" height="320" id="pomodoro-svg">
                    <circle stroke="#1a1a1a" stroke-width="4" fill="transparent" r="145" cx="160" cy="160" />
                    <circle id="pomodoro-circle" class="progress-ring__circle" stroke="#ffffff" stroke-width="4" fill="transparent" r="145" cx="160" cy="160" />
                </svg>
                <div class="timer-text-hover" id="pomodoro-time-text">25:00</div>
            </div>
            
            <div id="focus-controls" style="display: flex; gap: 12px; margin-top: 28px; z-index: 2510; flex-wrap: wrap; justify-content: center;">
                <button id="btn-pomodoro-pause" class="btn btn-primary" onclick="togglePomodoroPause()">Pause</button>
                <button class="btn" onclick="skipPomodoroPhase()">Skip &amp; Check</button>
                <button class="btn" onclick="resetPomodoroPhase()">Reset</button>
                <button class="btn" onclick="toggleWidgetMode()">[_ Header Mode]</button>
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

    <!-- 7. Unified Settings & System Control Modal (4 Tabs) -->
    <div id="managerModal" class="modal-overlay" onclick="if(event.target === this) closeModals()">
        <div class="modal-content settings-modal-box">
            <div class="settings-top-bar">
                <div>
                    <h2 style="margin: 0; border: none; padding: 0;">System Settings &amp; Workspace</h2>
                    <span style="font-size: var(--font-xs); color: var(--text-dim);">CONFIGURE LAYOUTS, ACTIONS, SONY AUDIO KEYS, HABITS &amp; BACKUPS</span>
                </div>
                <button class="btn btn-sm" onclick="closeModals(); renderTasks();">[ESC // CLOSE]</button>
            </div>

            <div class="settings-body-split">
                <!-- Sidebar Navigazione Tab -->
                <div class="settings-sidebar">
                    <div>
                        <button type="button" class="settings-nav-btn active" data-tab="tab-workspace" onclick="switchSettingsTab('tab-workspace')">1. Workspace &amp; UI</button>
                        <button type="button" class="settings-nav-btn" data-tab="tab-ai" onclick="switchSettingsTab('tab-ai')">2. Sony Audio Pipeline</button>
                        <button type="button" class="settings-nav-btn" data-tab="tab-habits" onclick="switchSettingsTab('tab-habits')">3. Habits &amp; Cats</button>
                        <button type="button" class="settings-nav-btn" data-tab="tab-system" onclick="switchSettingsTab('tab-system')">4. Data &amp; Manual</button>
                    </div>
                    <div style="padding: 0 16px; font-size: 0.65rem; color: var(--text-dim);">
                        SHORTCUTS: [E] EDIT · [0] ZERO · [P] PLAN · [R] RED · [?] HELP
                    </div>
                </div>

                <!-- TAB 1: APPEARANCE, QUICK ACTIONS & WORKSPACE VIEWS -->
                <div id="tab-workspace" class="settings-tab-panel active">
                    <div class="cfg-box">
                        <div class="sub-column-header">Quick System Actions &amp; Builders</div>
                        <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                            <button type="button" class="btn btn-sm" onclick="closeModals(); toggleLayoutEditMode();">[EDIT LAYOUT // E]</button>
                            <button type="button" class="btn btn-sm" onclick="closeModals(); setQuadrantCount(0);">[0 // ZERO-UI MODE]</button>
                            <button type="button" class="btn btn-sm" onclick="openPlanTomorrowModal()">[PLAN TOMORROW // P]</button>
                            <button type="button" class="btn btn-sm" onclick="openTimerModal()">[▶ FOCUS BUILDER]</button>
                            <button type="button" class="btn btn-primary btn-sm" onclick="openCreationModal()">[+ NEW HABIT / EVENT / MED]</button>
                        </div>
                    </div>

                    <div class="cfg-box" style="display: flex; flex-direction: column; gap: 14px;">
                        <div class="sub-column-header" style="margin-bottom: 0;">Appearance &amp; Optical Filter</div>
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="color: var(--text-muted); font-size: var(--font-xs); text-transform: uppercase;">Red Gelatin Optical Mode (Shortcut: R)</span>
                            <button type="button" id="btn-red-mode" class="btn btn-sm" onclick="toggleRedMode()">[RED]</button>
                        </div>
                        <div>
                            <label style="display: flex; justify-content: space-between; color: var(--text-dim); font-size: var(--font-xs); text-transform: uppercase; margin-bottom: 6px;">
                                <span>Window Background Opacity</span>
                                <span id="opacity-val">0.92</span>
                            </label>
                            <input type="range" id="bg-opacity-slider" min="0.1" max="1.0" step="0.01" value="0.92" style="width: 100%; accent-color: var(--text-main);" oninput="updateOpacity(this.value)">
                        </div>
                    </div>

                    <div class="cfg-box" style="padding: 0;">
                        <div id="settings-workspace-container"></div>
                    </div>

                    <div class="cfg-box">
                        <div class="sub-column-header" style="display:flex; justify-content:space-between; align-items:center;">
                            <span>3. Custom Command Aliases (1-Word Macros)</span>
                            <span style="font-size:0.65rem; color:var(--text-dim);">TYPE ALIAS IN COMMAND BAR + [ENTER] TO RUN ALL</span>
                        </div>
                        <div id="settings-aliases-container"></div>
                    </div>
                </div>

                <!-- TAB 2: SONY RECORDER PIPELINE (GEMINI AUDIO TRANSCRIPTION) -->
                <div id="tab-ai" class="settings-tab-panel">
                    <div class="cfg-box">
                        <label style="display: flex; justify-content: space-between; color: var(--text-dim); font-size: var(--font-xs); text-transform: uppercase; margin-bottom: 6px;">
                            <span>Primary Gemini API Key (Fallback for Audio Pipeline)</span>
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
                            <input type="password" id="gemini-audio-key-input" class="form-control form-control-sm" placeholder="Optional Dedicated API Key for [SYNC SONY]..." oninput="handleGeminiAudioKeyInput(this.value)">
                            <button type="button" class="btn btn-sm" onclick="const inp=document.getElementById('gemini-audio-key-input'); inp.type = inp.type==='password' ? 'text' : 'password';">[SHOW]</button>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span id="processed-audio-count" style="font-size: var(--font-xs); color: var(--text-dim);">0 audio files in history</span>
                            <button type="button" class="btn btn-sm" onclick="resetProcessedAudioHistory()">[RESET AUDIO MEMORY]</button>
                        </div>
                    </div>
                </div>

                <!-- TAB 3: HABITS & CATEGORIES -->
                <div id="tab-habits" class="settings-tab-panel">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span class="section-label">Manage Categories &amp; Habits</span>
                        <button type="button" class="btn btn-primary btn-sm" onclick="openCreationModal()">[+ ADD HABIT / EVENT / MED]</button>
                    </div>
                    <div id="manager-list" class="manager-list" style="margin-bottom: 8px;"></div>
                    <div class="quick-add-task new-calendar-add">
                        <span>+</span>
                        <input type="text" placeholder="Create new category and press Enter..." onkeypress="quickAddCalendar(event)">
                    </div>
                </div>

                <!-- TAB 4: DATA & SYSTEM MANUAL -->
                <div id="tab-system" class="settings-tab-panel">
                    <div class="cfg-box" style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <div style="color: var(--text-main); font-size: var(--font-xs); font-weight: bold; text-transform: uppercase;">Database JSON Backup</div>
                            <div style="color: var(--text-dim); font-size: 0.68rem; margin-top: 2px;">Export or restore all habits, logs, notes, diet, gym and finances</div>
                        </div>
                        <div style="display: flex; gap: 10px;">
                            <button type="button" class="btn btn-sm" onclick="exportData()">[EXPORT JSON]</button>
                            <label class="btn btn-sm" style="cursor: pointer; margin: 0;">
                                [IMPORT JSON]
                                <input type="file" accept=".json" style="display: none;" onchange="importData(event)">
                            </label>
                        </div>
                    </div>

                    <div class="cfg-box" style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <div style="color: var(--text-main); font-size: var(--font-xs); font-weight: bold; text-transform: uppercase;">Cortex DSL &amp; Shortcuts Manual</div>
                            <div style="color: var(--text-dim); font-size: 0.68rem; margin-top: 2px;">View all DSL commands, contextual autocomplete rules and shortcuts</div>
                        </div>
                        <button type="button" class="btn btn-sm" onclick="openShortcutsHelp()">[OPEN MANUAL // ?]</button>
                    </div>
                </div>
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

    <!-- 12. Evening Builder: Plan Tomorrow Modal -->
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
                <div style="width: 44%; display: flex; flex-direction: column; gap: 14px; overflow-y: auto; padding-right: 8px; border-right: 1px solid var(--border-color);">
                    <div class="form-group" style="margin-bottom: 0;">
                        <label>Tomorrow's #1 Priority / Main Objective</label>
                        <input type="text" id="plan-tmw-priority" class="form-control form-control-sm" placeholder="e.g. Complete Analysis II proofs..." oninput="saveTomorrowPriority(this.value)">
                    </div>

                    <div>
                        <div class="sub-column-header" style="display:flex; justify-content:space-between;">
                            <span>1. Tomorrow's Task Blocks (Drag to Timeline)</span>
                            <span id="plan-tmw-workload-badge" style="color:var(--text-main); font-weight:bold;">0.0H</span>
                        </div>
                        <div id="plan-tmw-available-blocks" style="display: flex; flex-direction: column; gap: 6px;"></div>
                    </div>

                    <div>
                        <div class="sub-column-header">2. General To-Do Inbox (Move to Tomorrow)</div>
                        <div id="plan-tmw-inbox" style="display: flex; flex-direction: column; gap: 6px;"></div>
                    </div>

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
                    <input type="text" id="m-vault-name" class="form-control" placeholder="e.g. Amazon, Fondo Emergenza" required>
                </div>
                <div style="display: flex; gap: 12px;">
                    <div class="form-group" style="flex: 1;">
                        <label>Initial Deposit (€)</label>
                        <input type="number" id="m-vault-balance" class="form-control no-spinners" step="0.01" value="0" required>
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
                        <option value="monthly_fixed">Auto-save Fixed € on Renewal Day of Month</option>
                    </select>
                </div>
                <div style="display: none; gap: 12px;" id="m-vault-rule-val-group">
                    <div class="form-group" style="flex: 1;">
                        <label id="m-vault-rule-val-label">Rule Value</label>
                        <input type="number" id="m-vault-rule-val" class="form-control no-spinners" step="0.01" min="0" placeholder="e.g. 15">
                    </div>
                    <div class="form-group" style="flex: 1;" id="m-vault-renewal-day-group">
                        <label>Renewal Day (1-31)</label>
                        <input type="number" id="m-vault-renewal-day" class="form-control no-spinners" min="1" max="31" value="15">
                    </div>
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

    <!-- 19. Cortex DSL & System Manual Modal (?) -->
    <div id="shortcutsHelpModal" class="modal-overlay" onclick="if(event.target === this) closeModals()">
        <div class="modal-content" style="width: 960px; max-width: 96%; max-height: 90vh;">
            <div style="display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1px solid var(--border-color); padding-bottom: 8px; margin-bottom: 14px;">
                <div>
                    <h2 style="margin: 0; border: none; padding: 0;">Cortex DSL Manual // Sintassi, Autocompletamento &amp; Modifiche</h2>
                    <span style="font-size: var(--font-xs); color: var(--text-dim);">Usa <code>[TAB]</code> per autocompletare · <code>[ENTER]</code> per eseguire all'istante · <code>[SHIFT + ENTER]</code> (o <code>;</code>) per impilare nella Staging Area.</span>
                </div>
                <span style="font-size: var(--font-xs); color: var(--text-main); font-weight: bold;">SHORTCUT: [?]</span>
            </div>

            <div class="help-manual-columns">
                <!-- 1. TASKS, FOCUS, CALENDARIO & NOTE -->
                <div class="help-section-card">
                    <div class="help-section-title">1. Task, Focus, Calendario &amp; Note</div>
                    <div class="help-grid">
                        <div class="help-key"><code>done [task]</code><br><span style="color:var(--text-dim); font-weight:normal;">es. <code>done Duolingo</code></span></div>
                        <div class="help-desc"><strong>Modifica:</strong> Spunta la prima casella libera della task attiva oggi (autocompleta con <code>[TAB]</code>). Se è un medicinale, scala <code>-1</code> dallo stock.</div>

                        <div class="help-key"><code>focus [task/cat]</code><br><span style="color:var(--text-dim); font-weight:normal;">es. <code>focus Analisi</code></span></div>
                        <div class="help-desc"><strong>Modifica:</strong> Avvia il timer Pomodoro con la durata esatta configurata nella task (o <code>focus 45 Analisi</code> per forzare i minuti) e spunta la task al termine.</div>

                        <div class="help-key"><code>task [titolo] [@day]</code><br><span style="color:var(--text-dim); font-weight:normal;">es. <code>task Studio @domani</code></span></div>
                        <div class="help-desc"><strong>Modifica:</strong> Crea una task flessibile da 25m nella categoria <code>General To-Do</code> per <code>@oggi</code>, <code>@domani</code> o <code>@YYYY-MM-DD</code>.</div>

                        <div class="help-key"><code>todo [testo]</code><br><span style="color:var(--text-dim); font-weight:normal;">es. <code>todo Bolletta</code></span></div>
                        <div class="help-desc"><strong>Modifica:</strong> Aggiunge una voce non schedulata nella lista <code>General To-Do Inbox</code>.</div>

                        <div class="help-key"><code>event [@day] [titolo]</code><br><span style="color:var(--text-dim); font-weight:normal;">es. <code>event @domani Esame</code></span></div>
                        <div class="help-desc"><strong>Modifica:</strong> Inserisce un evento singolo sul Calendario e nel Weekly Planner.</div>

                        <div class="help-key"><code>note [Cat]: [testo]</code><br><span style="color:var(--text-dim); font-weight:normal;">es. <code>note Math: Teorema</code></span></div>
                        <div class="help-desc"><strong>Modifica:</strong> Accoda la nota nella categoria indicata (premi <code>[TAB]</code> dopo <code>note </code> per scegliere la categoria; se nuova, la crea).</div>
                    </div>
                </div>

                <!-- 2. MONEY, VAULTS, DIETA & PALESTRA -->
                <div class="help-section-card">
                    <div class="help-section-title">2. Money, Salvadanai, Dieta &amp; Palestra</div>
                    <div class="help-grid">
                        <div class="help-key"><code>out [€] #[Cat/Vault] [desc]</code><br><span style="color:var(--text-dim); font-weight:normal;">es. <code>out 20 #Amazon Cavo</code></span></div>
                        <div class="help-desc"><strong>Modifica:</strong> Sottrae l'importo dal saldo totale. Se <code>#Nome</code> corrisponde a un <strong>Vault</strong>, scala direttamente dal Vault (anche andando in negativo per il rollover); altrimenti riduce lo Spendable Balance.</div>

                        <div class="help-key"><code>in [€] [desc]</code><br><span style="color:var(--text-dim); font-weight:normal;">es. <code>in 500 Borsa</code></span></div>
                        <div class="help-desc"><strong>Modifica:</strong> Aggiunge <code>+€</code> al saldo totale e accantona automaticamente le percentuali nei Vault con regola <code>% of Income</code>.</div>

                        <div class="help-key"><code>wish [item] [€ opz.]</code><br><span style="color:var(--text-dim); font-weight:normal;">es. <code>wish Libro 18</code></span></div>
                        <div class="help-desc"><strong>Modifica:</strong> Inserisce l'idea d'acquisto nel <code>Purchase Ideas Incubator</code> senza toccare il saldo.</div>

                        <div class="help-key"><code>weight [kg] [nota]</code><br><span style="color:var(--text-dim); font-weight:normal;">es. <code>weight 74.5 digiuno</code></span></div>
                        <div class="help-desc"><strong>Modifica:</strong> Registra il peso corporeo odierno e aggiorna il delta <code>+/- kg</code> nel modulo Diet.</div>

                        <div class="help-key"><code>gym done</code></div>
                        <div class="help-desc"><strong>Modifica:</strong> Salva tutti i carichi inseriti nella scheda attiva e avanza al giorno successivo dello split (<code>Day 1 ↔ Day 2</code>).</div>
                    </div>
                </div>

                <!-- 3. ISPEZIONE ISTANTANEA IN SOLA LETTURA (0ms) -->
                <div class="help-section-card">
                    <div class="help-section-title">3. Ispezione Rapida in Sola Lettura (0ms nella Barra)</div>
                    <div class="help-grid">
                        <div class="help-key"><code>diet</code> / <code>diet @domani</code></div>
                        <div class="help-desc">Mostra subito nella barra tutti i pasti del giorno, le regole fisse e i macro calcolati (Kcal, P, C, F).</div>

                        <div class="help-key"><code>gym</code></div>
                        <div class="help-desc">Mostra gli esercizi del <code>Day</code> attivo in palestra con le ripetizioni e gli ultimi pesi salvati.</div>

                        <div class="help-key"><code>today</code> / <code>tomorrow</code></div>
                        <div class="help-desc">Mostra il riepilogo di priorità #1, eventi, task orarie/flessibili e stato di completamento per oggi o domani.</div>

                        <div class="help-key"><code>bal</code> / <code>money</code></div>
                        <div class="help-desc">Mostra Spendable Balance, saldo totale, saldo di ogni Vault e cashflow netto del mese.</div>
                    </div>
                </div>

                <!-- 4. WORKSPACE, STAGING & SCORCIATOIE GLOBALI -->
                <div class="help-section-card">
                    <div class="help-section-title">4. Workspace, Staging &amp; Scorciatoie da Tastiera</div>
                    <div class="help-grid">
                        <div class="help-key"><code>summon [modulo]</code> · <code>swap</code> · <code>zero</code></div>
                        <div class="help-desc">Monta un modulo nel layout tiling (<code>calendar</code>, <code>tasks</code>, <code>notes</code>, <code>planner</code>, <code>diet</code>, <code>gym</code>, <code>money</code>, <code>streak</code>), scambia i quadranti o attiva Zero-UI.</div>

                        <div class="help-key"><code>plan</code> · <code>ledger</code> · <code>food</code> · <code>vault</code></div>
                        <div class="help-desc">Apre rispettivamente l'Evening Builder (Timeline Domani), il Focus Ledger, il Food DB o il modale nuovo Salvadanaio.</div>

                        <div class="help-key">[SHIFT + ENTER] / <code>;</code></div>
                        <div class="help-desc">Mette il comando nella <strong>Staging Area</strong> per accumularne altri prima di premere <code>[ENTER]</code>.</div>

                        <div class="help-key">[CTRL+SPACE] · [?] · [,] · [E]</div>
                        <div class="help-desc"><code>[CTRL+SPACE]</code> apre la barra · <code>[?]</code> Manuale · <code>[,]</code> Settings · <code>[E]</code> Edit Layout · <code>[P]</code> Plan Tomorrow · <code>[J]</code> Journal · <code>[R]</code> Red Mode.</div>
                    </div>
                </div>

                <div class="help-section-card" style="grid-column: 1 / -1;">
                    <div class="help-section-title">5. University Bridge (180 CFU, Appelli &amp; Tasse)</div>
                    <div class="help-grid">
                        <div class="help-key"><code>uni</code> · <code>uni info</code></div>
                        <div class="help-desc">Monta il modulo <code>University</code> (con i suoi 4 sotto-moduli componibili) o mostra le medie nella barra.</div>

                        <div class="help-key"><code>esame [Nome] [Voto] [CFU]</code></div>
                        <div class="help-desc"><strong>Modifica:</strong> Registra il voto nel Libretto (es. <code>esame Algebra 28 9</code>), ricalcola le medie su 180 CFU e archivia le task di studio del corso.</div>

                        <div class="help-key"><code>tassa [€] [Data] [Nome]</code></div>
                        <div class="help-desc"><strong>Modifica:</strong> Crea un evento in rosso sul Calendario il giorno della scadenza e collega il pagamento alla categoria <code>Tasse Uni</code>.</div>

                        <div class="help-key"><code>appello [Nome] [Data] [Ora]</code></div>
                        <div class="help-desc"><strong>Modifica:</strong> Aggiunge l'appello con countdown e crea il blocco su Calendar e Weekly Planner.</div>
                    </div>
                </div>
            </div>

            <div class="modal-actions" style="margin-top: 10px;">
                <button class="btn btn-primary" onclick="closeModals()">Close Manual [Esc]</button>
            </div>
        </div>
    </div>

    <!-- 20. Quick-Switcher Modal (Shortcut: V) -->
    <div id="quickSwitcherModal" class="modal-overlay" onclick="if(event.target === this) closeModals()">
        <div class="modal-content" style="width: 640px; max-width: 95%; padding: 20px;">
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-color); padding-bottom:10px; margin-bottom:12px;">
                <div>
                    <h2 style="margin:0; border:none; padding:0;">Quick View Switcher</h2>
                    <span style="font-size:var(--font-xs); color:var(--text-dim);">CLICK TO REPLACE VIEW · <strong>[SHIFT + CLICK]</strong> (OR <strong>[SHIFT + ↑]</strong>) TO COMBINE MULTIPLE MODULES</span>
                </div>
                <button class="btn btn-sm" onclick="closeModals()">[ESC]</button>
            </div>

            <input type="text" id="qs-filter-input" class="form-control form-control-sm" style="margin-bottom:12px;" placeholder="Filter views or type 'notes + tasks' and press Enter..." autocomplete="off">

            <div id="qs-staged-bar" style="display:none; align-items:center; justify-content:space-between; padding:8px 12px; margin-bottom:12px; border:1px solid var(--text-main); background:rgba(255,255,255,0.05);">
                <div style="font-size:var(--font-xs);">
                    <span style="color:var(--text-dim); font-weight:bold;">COMBINING MODULES: </span>
                    <strong id="qs-staged-list" style="color:var(--text-main); text-transform:uppercase;"></strong>
                </div>
                <div style="display:flex; gap:6px;">
                    <button type="button" class="btn btn-sm" onclick="clearQuickSwitcherStaged()">[CLEAR]</button>
                    <button type="button" class="btn btn-primary btn-sm" onclick="commitQuickSwitcherStaged()">[OPEN COMBINED // ENTER]</button>
                </div>
            </div>

            <div id="qs-body-content" style="display:flex; flex-direction:column; gap:14px; max-height:62vh; overflow-y:auto;"></div>
        </div>
    </div>
    `;
}

initModalsHtml();

function closeModals() {
    document.querySelectorAll('.modal-overlay').forEach(m => {
        m.style.display = 'none';
    });
    if (typeof setHudTemporaryExpansion === 'function' && !isAskBarExpanded) {
        setHudTemporaryExpansion(false);
    }
}

// ============================================================================
// EDITOR CUSTOM ALIASES CON SUGGERIMENTI ISPIRAZIONALI (SENZA PRESET FORZATI)
// ============================================================================

const ALIAS_INSPIRATION_TEMPLATES = [
    { name: 'sera', cmds: 'red on; tasks; plan', desc: 'Attiva Gelatina Rossa, monta Daily Tasks e apre la Timeline di domani' },
    { name: 'mattina', cmds: 'red off; tasks + planner; today', desc: 'Ripristina colori, affianca Tasks + Planner e mostra il riepilogo di oggi' },
    { name: 'sessione', cmds: 'uni roadmap + notes', desc: 'Sovrappone sullo schermo University Roadmap e Notes affiancati' },
    { name: 'conti', cmds: 'money; bal', desc: 'Apre il modulo Money a tutto schermo e mostra lo snapshot dei Vault' },
    { name: 'barra', cmds: 'hud on', desc: 'Collassa Cortex nella striscia HUD da 56px Always-on-Top' }
];

function renderCustomAliasesSettingsUI() {
    const cont = document.getElementById('settings-aliases-container');
    if (!cont) return;

    const entries = Object.entries(typeof customAliases !== 'undefined' ? customAliases : {});

    let html = `
        <div style="margin-bottom: 12px;">
            <div style="font-size: 0.65rem; color: var(--text-dim); text-transform: uppercase; margin-bottom: 6px;">
                Idee &amp; Template (Clicca un suggerimento per pre-compilare i campi qui sotto):
            </div>
            <div style="display: flex; flex-wrap: wrap; gap: 6px;" id="alias-inspiration-chips"></div>
        </div>

        <div style="display: flex; gap: 6px; margin-bottom: 12px; align-items: center; flex-wrap: wrap;">
            <input type="text" id="new-alias-name" class="form-control form-control-sm" style="width: 130px; font-weight: bold;" placeholder="Parola (es. sera)">
            <span style="color: var(--text-dim); font-weight: bold;">=</span>
            <input type="text" id="new-alias-cmds" class="form-control form-control-sm" style="flex: 1; min-width: 220px;" placeholder="Comandi separati da ; (es. red on; tasks; plan)" onkeydown="if(event.key==='Enter'){event.preventDefault(); saveCustomAliasFromUI();}">
            <button type="button" class="btn btn-primary btn-sm" onclick="saveCustomAliasFromUI()">[+ SAVE ALIAS]</button>
        </div>

        <div id="custom-aliases-list" style="display: flex; flex-direction: column; gap: 6px;"></div>
    `;

    cont.innerHTML = html;

    const chipsBox = cont.querySelector('#alias-inspiration-chips');
    ALIAS_INSPIRATION_TEMPLATES.forEach(tpl => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'btn btn-sm';
        chip.style.cssText = 'font-size: 0.65rem; padding: 3px 8px; border-style: dashed; text-transform: none;';
        chip.title = `${tpl.desc}\nComandi: ${tpl.cmds}`;
        chip.innerHTML = `<strong>${escapeHtml(tpl.name)}</strong> <span style="color:var(--text-dim);">→ ${escapeHtml(tpl.cmds)}</span>`;
        chip.onclick = () => {
            const nInp = document.getElementById('new-alias-name');
            const cInp = document.getElementById('new-alias-cmds');
            if (nInp) nInp.value = tpl.name;
            if (cInp) {
                cInp.value = tpl.cmds;
                cInp.focus();
            }
        };
        chipsBox.appendChild(chip);
    });

    const listEl = cont.querySelector('#custom-aliases-list');
    if (entries.length === 0) {
        listEl.innerHTML = `<div class="empty-state" style="padding: 6px 0;">[ NESSUN ALIAS CREATO — CLICCA UN SUGGERIMENTO SOPRA O SCRIVI IL TUO ]</div>`;
    } else {
        entries.forEach(([aliasKey, macroCmds]) => {
            const row = document.createElement('div');
            row.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; background: rgba(255,255,255,0.025); border: 1px solid var(--border-color); border-left: 3px solid var(--text-main); font-size: var(--font-xs); gap: 10px;';
            row.innerHTML = `
                <div style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                    <strong style="color:var(--text-main); text-transform:uppercase; margin-right:8px;">${escapeHtml(aliasKey)}</strong>
                    <span style="color:var(--text-dim);">→</span>
                    <code style="color:var(--text-muted); margin-left:6px;">${escapeHtml(macroCmds)}</code>
                </div>
                <div style="display:flex; gap:6px; flex-shrink:0;">
                    <button type="button" class="btn btn-sm btn-run-alias" title="Esegui ora questo alias">[▶ RUN]</button>
                    <button type="button" class="icon-btn btn-edit-alias" title="Modifica">[✎]</button>
                    <button type="button" class="icon-btn delete btn-del-alias" title="Elimina">[X]</button>
                </div>
            `;
            row.querySelector('.btn-run-alias').onclick = () => {
                closeModals();
                executeTerminalCommand(aliasKey);
            };
            row.querySelector('.btn-edit-alias').onclick = () => {
                document.getElementById('new-alias-name').value = aliasKey;
                document.getElementById('new-alias-cmds').value = macroCmds;
                document.getElementById('new-alias-cmds').focus();
            };
            row.querySelector('.btn-del-alias').onclick = () => {
                delete customAliases[aliasKey];
                saveCustomAliases();
                renderCustomAliasesSettingsUI();
            };
            listEl.appendChild(row);
        });
    }
}

function saveCustomAliasFromUI() {
    const nInp = document.getElementById('new-alias-name');
    const cInp = document.getElementById('new-alias-cmds');
    if (!nInp || !cInp) return;

    const cleanName = nInp.value.trim().toLowerCase().replace(/\s+/g, '_');
    const cleanCmds = cInp.value.trim();
    if (!cleanName || !cleanCmds) return;

    customAliases[cleanName] = cleanCmds;
    saveCustomAliases();
    nInp.value = '';
    cInp.value = '';
    renderCustomAliasesSettingsUI();
    if (typeof showToast === 'function') {
        showToast(`[ALIAS SAVED] Type "${cleanName}" in the command bar!`);
    }
}

// ============================================================================
// QUICK-SWITCHER MODAL (SCORCIATOIA: V) CON COMBINAZIONE MULTI-MODULO
// ============================================================================

let qsStagedModules = [];

function openQuickSwitcherModal() {
    if (typeof setHudTemporaryExpansion === 'function') setHudTemporaryExpansion(true);
    closeModals();
    if (typeof setHudTemporaryExpansion === 'function') setHudTemporaryExpansion(true);

    qsStagedModules = [];
    const modal = document.getElementById('quickSwitcherModal');
    const inp = document.getElementById('qs-filter-input');
    if (!modal) return;

    modal.style.display = 'flex';
    if (inp) {
        inp.value = '';
        inp.oninput = () => renderQuickSwitcherContent(inp.value);
        inp.onkeydown = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                closeModals();
                return;
            }
            if (e.key === 'ArrowUp' && e.shiftKey) {
                e.preventDefault();
                const q = inp.value.trim();
                const modKey = typeof resolveModuleKeyFromText === 'function' ? resolveModuleKeyFromText(q) : null;
                if (modKey && !qsStagedModules.includes(modKey)) {
                    qsStagedModules.push(modKey);
                    inp.value = '';
                    renderQuickSwitcherContent('');
                }
                return;
            }
            if (e.key === 'Enter') {
                e.preventDefault();
                if (qsStagedModules.length > 0 && !inp.value.trim()) {
                    commitQuickSwitcherStaged();
                    return;
                }
                const q = inp.value.trim();
                if (q) {
                    if (executeTerminalCommand(q)) {
                        closeModals();
                    }
                } else if (qsStagedModules.length > 0) {
                    commitQuickSwitcherStaged();
                }
            }
        };
        setTimeout(() => inp.focus(), 30);
    }

    renderQuickSwitcherContent('');
}

function clearQuickSwitcherStaged() {
    qsStagedModules = [];
    renderQuickSwitcherContent(document.getElementById('qs-filter-input')?.value || '');
}

function commitQuickSwitcherStaged() {
    if (qsStagedModules.length === 0) return;
    const toMount = [...qsStagedModules];
    qsStagedModules = [];
    closeModals();
    setModulesView(toMount);
}

function renderQuickSwitcherContent(filterStr = '') {
    const body = document.getElementById('qs-body-content');
    const stagedBar = document.getElementById('qs-staged-bar');
    const stagedList = document.getElementById('qs-staged-list');
    if (!body) return;

    if (stagedBar && stagedList) {
        if (qsStagedModules.length > 0) {
            stagedBar.style.display = 'flex';
            stagedList.textContent = qsStagedModules.map(k => dashboardModules[k].name).join(' + ');
        } else {
            stagedBar.style.display = 'none';
        }
    }

    const q = (filterStr || '').trim().toLowerCase();
    body.innerHTML = '';

    // 1. VISTE SALVATE (PRESETS)
    const matchingPresets = (workspacePresets || []).filter(p => !q || p.name.toLowerCase().includes(q));
    const presetsSection = document.createElement('div');
    presetsSection.innerHTML = `<div class="sub-column-header">1. Saved Custom Views (Click to Replace Screen)</div>`;

    if (matchingPresets.length === 0) {
        presetsSection.innerHTML += `<div class="empty-state" style="padding:4px 0;">[ NO SAVED VIEWS MATCHING ]</div>`;
    } else {
        const grid = document.createElement('div');
        grid.style.cssText = 'display:grid; grid-template-columns: repeat(3, 1fr); gap:8px;';
        matchingPresets.forEach(p => {
            const pLeaves = p.tree ? collectLeafPanes(p.tree).map(l => dashboardModules[l.module]?.name || l.module) : [];
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn';
            btn.style.cssText = 'text-align:left; padding:10px 12px; display:flex; flex-direction:column; gap:4px;';
            btn.innerHTML = `
                <strong style="color:var(--text-main); font-size:var(--font-sm);">${escapeHtml(p.name)}</strong>
                <span style="color:var(--text-dim); font-size:0.65rem; text-transform:none;">${escapeHtml(pLeaves.join(' + ') || 'ZERO-UI')}</span>
            `;
            btn.onclick = () => {
                closeModals();
                if (typeof isHudMode !== 'undefined' && isHudMode) toggleHudMode(false);
                applyWorkspacePreset(p.id);
            };
            grid.appendChild(btn);
        });
        presetsSection.appendChild(grid);
    }
    body.appendChild(presetsSection);

    // 2. GRIGLIA DEI 9 MODULI SINGOLI (Click = Apri subito · Shift+Click = Combina più schede)
    const modSection = document.createElement('div');
    modSection.innerHTML = `<div class="sub-column-header">2. Atomic Modules (Click = Open Single · Shift+Click = Combine Multiple)</div>`;
    const modGrid = document.createElement('div');
    modGrid.style.cssText = 'display:grid; grid-template-columns: repeat(3, 1fr); gap:8px;';

    ALL_MODULE_KEYS
        .filter(k => !q || k.includes(q) || dashboardModules[k].name.toLowerCase().includes(q))
        .forEach(k => {
            const isStaged = qsStagedModules.includes(k);
            const isCurrentlyMounted = activeSlots.includes(k);
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `btn ${isStaged ? 'btn-primary' : ''}`;
            btn.style.cssText = 'text-align:left; padding:10px 12px; display:flex; justify-content:space-between; align-items:center;';
            btn.innerHTML = `
                <div>
                    <div style="font-weight:bold; font-size:var(--font-xs);">${escapeHtml(dashboardModules[k].name)}</div>
                    <div style="font-size:0.62rem; opacity:0.65;">cmd: ${escapeHtml(k)}</div>
                </div>
                <span style="font-size:0.65rem;">${isStaged ? '[+ STAGED]' : (isCurrentlyMounted ? '[ACTIVE]' : '')}</span>
            `;
            btn.onclick = (e) => {
                if (e.shiftKey) {
                    const idx = qsStagedModules.indexOf(k);
                    if (idx !== -1) qsStagedModules.splice(idx, 1);
                    else qsStagedModules.push(k);
                    renderQuickSwitcherContent(document.getElementById('qs-filter-input')?.value || '');
                } else if (qsStagedModules.length > 0) {
                    if (!qsStagedModules.includes(k)) qsStagedModules.push(k);
                    commitQuickSwitcherStaged();
                } else {
                    closeModals();
                    setModulesView([k]);
                }
            };
            modGrid.appendChild(btn);
        });

    modSection.appendChild(modGrid);
    body.appendChild(modSection);
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
    if (typeof persistKeysMap === 'function') {
        persistKeysMap({ 'tracker_opacity': String(val) });
    } else {
        localStorage.setItem('tracker_opacity', val);
    }
}

document.documentElement.style.setProperty('--bg-opacity', savedOpacity);
const sliderEl = document.getElementById('bg-opacity-slider');
if (sliderEl) sliderEl.value = savedOpacity;
const labelEl = document.getElementById('opacity-val');
if (labelEl) labelEl.innerText = savedOpacity;

function switchSettingsTab(tabId) {
    document.querySelectorAll('.settings-nav-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabId);
    });
    document.querySelectorAll('.settings-tab-panel').forEach(panel => {
        panel.classList.toggle('active', panel.id === tabId);
    });
}

function openSettingsModal(defaultTab = 'tab-workspace') {
    if (typeof renderManager === 'function') renderManager();
    if (typeof updateWorkspaceDropdownUI === 'function') updateWorkspaceDropdownUI();
    if (typeof updateGeminiKeyStatusUI === 'function') updateGeminiKeyStatusUI();
    if (typeof updateGeminiAudioKeyStatusUI === 'function') updateGeminiAudioKeyStatusUI();
    if (typeof applyRedModeUI === 'function') applyRedModeUI();
    if (typeof setHudTemporaryExpansion === 'function') setHudTemporaryExpansion(true);
    if (typeof renderCustomAliasesSettingsUI === 'function') renderCustomAliasesSettingsUI();

    const sEl = document.getElementById('bg-opacity-slider');
    if (sEl) sEl.value = savedOpacity;
    const lEl = document.getElementById('opacity-val');
    if (lEl) lEl.innerText = savedOpacity;

    closeModals();
    switchSettingsTab(defaultTab);
    const modal = document.getElementById('managerModal');
    if (modal) modal.style.display = 'flex';
}

const btnMinimize = document.getElementById('btn-minimize-app');
if (btnMinimize) {
    btnMinimize.addEventListener('click', () => {
        if (window.__TAURI__ && window.__TAURI__.window) {
            window.__TAURI__.window.getCurrentWindow().minimize();
        }
    });
}

const btnClose = document.getElementById('btn-close-app');
if (btnClose) {
    btnClose.addEventListener('click', () => {
        if (window.__TAURI__ && window.__TAURI__.window) {
            window.__TAURI__.window.getCurrentWindow().close();
        } else {
            window.close();
        }
    });
}