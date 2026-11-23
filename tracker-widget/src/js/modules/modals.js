// --- js/modules/modals.js ---
// Iniezione sincrona dei modali HTML (Con Manuale DSL Strutturato ? e Pipeline Sony Intatta)

function initModalsHtml() {
    const root = document.getElementById('modals-root');
    if (!root) return;

    root.innerHTML = `

    <!-- 2. Pomodoro Timer Overlay -->
    <div id="pomodoroOverlay" class="pomodoro-overlay" style="z-index:2500;">
        <div id="widget-drag-handle">
            <span class="u-grow" style="text-align:left;">:: FOCUS WIDGET</span>
            <button id="btn-widget-mode-full" class="icon-btn u-fs-xs" style="padding-right:var(--space-2);" onclick="toggleWidgetMode()">[+ FULL]</button>
        </div>
        <div class="u-col u-ai-center u-jc-center u-w-full" id="focus-split-container" style="display:flex; height:100%; position:relative; padding:var(--space-5);">
            <button id="btn-widget-mode" class="btn btn-sm" style="position:absolute; top:25px; left:25px; z-index:2510;" onclick="toggleWidgetMode()">[_ MINIMIZE]</button>
            
            <h2 class="u-main u-tc u-bold u-border-0 u-fs-lg" id="pomodoro-task-title" style="margin-bottom:var(--space-5);">Task Name</h2>
            
            <div class="timer-circle-wrapper">
                <svg class="progress-ring" width="320" height="320" id="pomodoro-svg">
                    <circle stroke="#1a1a1a" stroke-width="4" fill="transparent" r="145" cx="160" cy="160" />
                    <circle id="pomodoro-circle" class="progress-ring__circle" stroke="#ffffff" stroke-width="4" fill="transparent" r="145" cx="160" cy="160" />
                </svg>
                <div class="timer-text-hover" id="pomodoro-time-text">25:00</div>
            </div>
            
            <div class="u-gap-3 u-wrap u-jc-center" id="focus-controls" style="display:flex; margin-top:var(--space-6); z-index:2510;">
                <button id="btn-pomodoro-pause" class="btn btn-primary" onclick="togglePomodoroPause()">Pause</button>
                <button class="btn" onclick="skipPomodoroPhase()">Skip</button>
                <button class="btn" onclick="resetPomodoroPhase()">Reset</button>
                <button class="btn btn-danger" onclick="stopPomodoro()">Abort</button>
            </div>

            <div class="u-w-full" id="focus-live-queue" style="max-width:460px; margin-top:var(--space-6);"></div>
        </div>
    </div>

    <!-- 3. Timer Setup Modal -->
    <div id="timerSetupModal" class="modal-overlay" onclick="if(event.target === this) closeModals()">
        <div class="modal-content" style="width:460px;">
            <h2>Focus Session Builder</h2>
            <form id="timerSetupForm">
                <p class="modal-subtitle">1. Pick a free session or one of today's tasks</p>
                <div class="u-wrap u-gap-2" id="focus-available-tasks" style="display:flex; margin-bottom:var(--space-5);"></div>
                <p class="modal-subtitle">2. Focus Playlist</p>
                <div class="u-col u-gap-2" id="focus-playlist" style="display:flex; background:rgba(255,255,255,0.02); padding:var(--space-3); border:1px solid var(--border-color); min-height:100px; margin-bottom:var(--space-5);"></div>
                <div class="modal-actions">
                    <button type="button" class="btn" onclick="closeModals()">Cancel</button>
                    <button type="submit" class="btn btn-primary" id="btn-start-playlist" disabled>Start Focus</button>
                </div>
            </form>
        </div>
    </div>

    <!-- 5. Combined Creation Modal (Habits, Routines, Events, Medicines) -->
    <div id="creationModal" class="modal-overlay" onclick="if(event.target === this) closeModals()">
        <div class="modal-content" style="width:780px; max-width:95%;">
            <h2 id="creation-modal-title">Add to Planner &amp; Tasks</h2>
            <div class="task-type-toggle" style="margin-bottom:var(--space-5);">
                <label class="type-radio">
                    <input type="radio" name="creation-type" value="habit" checked onchange="toggleCreationType()"> Habit / Task
                </label>
                <label class="type-radio">
                    <input type="radio" name="creation-type" value="routine" onchange="toggleCreationType()"> Routine
                </label>
                <label class="type-radio">
                    <input type="radio" name="creation-type" value="event" onchange="toggleCreationType()"> Single Event
                </label>
                <label class="type-radio">
                    <input type="radio" name="creation-type" value="medicine" onchange="toggleCreationType()"> Medicine
                </label>
            </div>

            <!-- FORM 1: HABIT / TASK -->
            <form id="habitForm">
                <input type="hidden" id="h-id">
                <div class="form-group">
                    <label>Category / Calendar</label>
                    <input type="text" id="h-category" class="form-control" placeholder="e.g. French, Studio, General" required>
                </div>
                <div class="form-group">
                    <label>Task Name</label>
                    <input type="text" id="h-title" class="form-control" placeholder="e.g. Duolingo, Analisi II" required>
                </div>
                <div class="form-group">
                    <label>Priority Level</label>
                    <div class="task-type-toggle">
                        <label class="type-radio">
                            <input type="radio" name="h-priority" value="high" checked> HIGH (Mandatory)
                        </label>
                        <label class="type-radio">
                            <input type="radio" name="h-priority" value="optional"> OPTIONAL (Locked until High are done)
                        </label>
                    </div>
                </div>
                <div class="form-group">
                    <label>Color</label>
                    <div class="color-palette" id="habit-color-palette">
                        <div class="color-circle active" style="background:#ffffff;" data-color="#ffffff" onclick="selectColor(this, 'h-color')"></div>
                        <div class="color-circle" style="background:#b84b4b;" data-color="#b84b4b" onclick="selectColor(this, 'h-color')"></div>
                        <div class="color-circle" style="background:#5f7a61;" data-color="#5f7a61" onclick="selectColor(this, 'h-color')"></div>
                        <div class="color-circle" style="background:#4c5b73;" data-color="#4c5b73" onclick="selectColor(this, 'h-color')"></div>
                        <div class="color-circle" style="background:#b08d43;" data-color="#b08d43" onclick="selectColor(this, 'h-color')"></div>
                        <div class="color-circle" style="background:#725b7a;" data-color="#725b7a" onclick="selectColor(this, 'h-color')"></div>
                        <div class="color-circle" style="background:#6e7073;" data-color="#6e7073" onclick="selectColor(this, 'h-color')"></div>
                        <div class="color-circle custom-color-btn" onclick="document.getElementById('h-color').click()">+</div>
                    </div>
                    <input type="color" id="h-color" style="display:none;" value="#ffffff" onchange="updateCustomColor(this, 'h-color')">
                </div>
                <div class="u-flex u-gap-4">
                    <div class="form-group u-grow">
                        <label>Start Date</label>
                        <input type="date" id="h-startdate" class="form-control" required>
                    </div>
                    <div class="form-group u-grow">
                        <label>End Date (optional)</label>
                        <input type="date" id="h-enddate" class="form-control">
                    </div>
                </div>
                <div class="form-group">
                    <label>Schedule Mode</label>
                    <div class="task-type-toggle">
                        <label class="type-radio">
                            <input type="radio" name="h-type" value="timed" onchange="toggleHabitType()"> Timed (Fixed)
                        </label>
                        <label class="type-radio">
                            <input type="radio" name="h-type" value="untimed" checked onchange="toggleHabitType()"> Untimed (Flexible)
                        </label>
                    </div>
                </div>
                <div id="timed-section" style="display:none;">
                    <div class="form-group">
                        <label>Time Windows &amp; Days</label>
                        <div id="h-time-windows-container"></div>
                        <button type="button" class="btn u-w-full u-mb-3" style="border-style:dashed;" onclick="addHabitTimeWindow()">+ Add Time Window</button>
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
                                <input type="radio" name="h-timer-mode" value="checkonly" onchange="toggleTaskTimerMode()"> Check-Only (No Timer)
                            </label>
                        </div>
                    </div>
                    <div class="u-flex u-gap-4">
                        <div class="form-group u-grow">
                            <label>Daily Repetitions (Blocks)</label>
                            <input type="number" id="h-instances" class="form-control" value="1" min="1" max="50">
                        </div>
                        <div class="form-group u-grow" id="h-timer-group">
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
                    <div class="form-group days-checkboxes u-gap-3" id="h-days-container" style="display:flex;">
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
                    <button type="submit" class="btn btn-primary">Save Task</button>
                </div>
            </form>

            <!-- FORM 2: ROUTINE -->
            <form id="routineForm" style="display:none;">
                <input type="hidden" id="rtn-id">
                <div class="form-group">
                    <label>Routine Name</label>
                    <input type="text" id="rtn-title" class="form-control" placeholder="e.g. Morning Routine, Evening Routine, Weekly Routine" required>
                </div>
                <div class="form-group">
                    <label>Color</label>
                    <div class="color-palette" id="rtn-color-palette">
                        <div class="color-circle active" style="background:#b08d43;" data-color="#b08d43" onclick="selectColor(this, 'rtn-color')"></div>
                        <div class="color-circle" style="background:#4c5b73;" data-color="#4c5b73" onclick="selectColor(this, 'rtn-color')"></div>
                        <div class="color-circle" style="background:#5f7a61;" data-color="#5f7a61" onclick="selectColor(this, 'rtn-color')"></div>
                        <div class="color-circle" style="background:#ffffff;" data-color="#ffffff" onclick="selectColor(this, 'rtn-color')"></div>
                        <div class="color-circle" style="background:#b84b4b;" data-color="#b84b4b" onclick="selectColor(this, 'rtn-color')"></div>
                        <div class="color-circle custom-color-btn" onclick="document.getElementById('rtn-color').click()">+</div>
                    </div>
                    <input type="color" id="rtn-color" style="display:none;" value="#b08d43" onchange="updateCustomColor(this, 'rtn-color')">
                </div>
                <div class="u-flex u-gap-4">
                    <div class="form-group u-grow">
                        <label>Start Date</label>
                        <input type="date" id="rtn-startdate" class="form-control" required>
                    </div>
                    <div class="form-group u-grow">
                        <label>End Date (optional)</label>
                        <input type="date" id="rtn-enddate" class="form-control">
                    </div>
                </div>
                <div class="form-group">
                    <label>Schedule Mode</label>
                    <div class="task-type-toggle">
                        <label class="type-radio">
                            <input type="radio" name="rtn-type" value="timed" onchange="toggleRoutineScheduleType()"> Timed (Block on Planner)
                        </label>
                        <label class="type-radio">
                            <input type="radio" name="rtn-type" value="untimed" checked onchange="toggleRoutineScheduleType()"> Untimed (Checklist)
                        </label>
                    </div>
                </div>
                <div id="rtn-timed-section" style="display:none;">
                    <div class="form-group">
                        <label>Time Windows &amp; Days (Shows Routine Block on Weekly Planner)</label>
                        <div id="rtn-time-windows-container"></div>
                        <button type="button" class="btn u-w-full u-mb-3" style="border-style:dashed;" onclick="addRoutineTimeWindow()">+ Add Time Window</button>
                    </div>
                </div>
                <div id="rtn-untimed-section">
                    <div class="form-group">
                        <label>Duration / Focus Mode</label>
                        <div class="task-type-toggle">
                            <label class="type-radio">
                                <input type="radio" name="rtn-timer-mode" value="measured" onchange="toggleRoutineTimerMode()"> Focus Timer (Measured)
                            </label>
                            <label class="type-radio">
                                <input type="radio" name="rtn-timer-mode" value="checkonly" checked onchange="toggleRoutineTimerMode()"> Check-Only (No Timer)
                            </label>
                        </div>
                    </div>
                    <div class="form-group" id="rtn-timer-group" style="display:none;">
                        <label>Total Routine Duration (Minutes)</label>
                        <input type="number" id="rtn-timer" class="form-control no-spinners" value="20" min="1">
                    </div>
                    <div class="form-group">
                        <label>Frequency</label>
                        <select id="rtn-frequency" class="form-control" onchange="toggleRoutineDays()">
                            <option value="all">Every day</option>
                            <option value="weekdays">Weekdays (Mon-Fri)</option>
                            <option value="weekends">Weekends (Sat-Sun)</option>
                            <option value="specific">Specific days</option>
                        </select>
                    </div>
                    <div class="form-group days-checkboxes u-gap-3" id="rtn-days-container" style="display:none;">
                        <label class="day-check"><input type="checkbox" value="1"> Mon</label>
                        <label class="day-check"><input type="checkbox" value="2"> Tue</label>
                        <label class="day-check"><input type="checkbox" value="3"> Wed</label>
                        <label class="day-check"><input type="checkbox" value="4"> Thu</label>
                        <label class="day-check"><input type="checkbox" value="5"> Fri</label>
                        <label class="day-check"><input type="checkbox" value="6"> Sat</label>
                        <label class="day-check"><input type="checkbox" value="0"> Sun</label>
                    </div>
                </div>

                <div class="form-group" style="border-top:1px solid var(--border-color); padding-top:var(--space-4);">
                    <div class="u-flex u-jc-between u-ai-center u-mb-2">
                        <label class="u-mb-0">Sub-Sections &amp; Checklist Steps</label>
                        <button type="button" class="btn btn-sm" onclick="addRoutineFormSubsection()">[+ ADD SUB-SECTION]</button>
                    </div>
                    <div class="u-col u-gap-3 u-scroll-y" id="rtn-subsections-builder" style="display:flex; max-height:260px; padding-right:var(--space-1);"></div>
                </div>

                <div class="modal-actions">
                    <button type="button" class="btn" onclick="closeModals()">Cancel</button>
                    <button type="submit" class="btn btn-primary">Save Routine</button>
                </div>
            </form>

            <!-- FORM 3: SINGLE EVENT -->
            <form id="eventForm" style="display:none;">
                <div class="form-group">
                    <label>Event Name</label>
                    <input type="text" id="e-title" class="form-control" required>
                </div>
                <div class="form-group">
                    <label>Date</label>
                    <input type="date" id="e-date" class="form-control" required>
                </div>
                <div class="u-flex u-gap-4">
                    <div class="form-group u-grow">
                        <label>Start Time (Optional)</label>
                        <input type="time" id="e-start" class="form-control">
                    </div>
                    <div class="form-group u-grow">
                        <label>End Time (Optional)</label>
                        <input type="time" id="e-end" class="form-control">
                    </div>
                </div>
                <div class="form-group">
                    <label>Color</label>
                    <div class="color-palette" id="event-color-palette">
                        <div class="color-circle active" style="background:#b84b4b;" data-color="#b84b4b" onclick="selectColor(this, 'e-color')"></div>
                        <div class="color-circle" style="background:#5f7a61;" data-color="#5f7a61" onclick="selectColor(this, 'e-color')"></div>
                        <div class="color-circle" style="background:#4c5b73;" data-color="#4c5b73" onclick="selectColor(this, 'e-color')"></div>
                        <div class="color-circle" style="background:#b08d43;" data-color="#b08d43" onclick="selectColor(this, 'e-color')"></div>
                        <div class="color-circle custom-color-btn" onclick="document.getElementById('e-color').click()">+</div>
                    </div>
                    <input type="color" id="e-color" style="display:none;" value="#b84b4b" onchange="updateCustomColor(this, 'e-color')">
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn" onclick="closeModals()">Cancel</button>
                    <button type="submit" class="btn btn-primary">Save Event</button>
                </div>
            </form>

            <!-- FORM 4: MEDICINE -->
            <form id="medicineForm" style="display:none;">
                <input type="hidden" id="med-id">
                <div class="form-group">
                    <label>Medicine Name</label>
                    <input type="text" id="med-title" class="form-control" placeholder="e.g. Minoxidil, Finasteride, Vitamina D" required>
                </div>
                <div class="form-group">
                    <label>Inject into Routine (Appears under // MEDICINE)</label>
                    <select id="med-routine-select" class="form-control"></select>
                </div>
                <div class="u-flex u-gap-4">
                    <div class="form-group u-grow">
                        <label>Doses per intake</label>
                        <input type="number" id="med-instances" class="form-control no-spinners" value="1" min="1" required>
                    </div>
                    <div class="form-group u-grow">
                        <label>Current Stock (Total doses)</label>
                        <input type="number" id="med-stock" class="form-control no-spinners" placeholder="e.g. 30" required>
                    </div>
                </div>
                <div class="u-flex u-gap-4">
                    <div class="form-group u-grow">
                        <label>Start Date</label>
                        <input type="date" id="med-startdate" class="form-control" required>
                    </div>
                    <div class="form-group u-grow">
                        <label>Alert Days Before Runout</label>
                        <input type="number" id="med-alert" class="form-control no-spinners" value="7" min="1" required>
                    </div>
                </div>
                <div class="u-flex u-gap-4">
                    <div class="form-group u-grow">
                        <label>Frequency</label>
                        <select id="med-frequency" class="form-control" onchange="toggleMedFrequencyInputs()">
                            <option value="all">Every day</option>
                            <option value="interval">Every N days (e.g. Every 14 days / 2 weeks)</option>
                            <option value="specific">Specific days of week</option>
                        </select>
                    </div>
                    <div class="form-group u-grow" style="display:none;" id="med-interval-group">
                        <label>Interval (Every X Days)</label>
                        <input type="number" id="med-interval-days" class="form-control no-spinners" value="14" min="1">
                    </div>
                </div>
                <div class="form-group days-checkboxes u-gap-3" id="med-days-container" style="display:none;">
                    <label class="day-check"><input type="checkbox" value="1"> Mon</label>
                    <label class="day-check"><input type="checkbox" value="2"> Tue</label>
                    <label class="day-check"><input type="checkbox" value="3"> Wed</label>
                    <label class="day-check"><input type="checkbox" value="4"> Thu</label>
                    <label class="day-check"><input type="checkbox" value="5"> Fri</label>
                    <label class="day-check"><input type="checkbox" value="6"> Sat</label>
                    <label class="day-check"><input type="checkbox" value="0"> Sun</label>
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
        <div class="modal-content" style="width:400px;">
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

    <!-- 6B. DEDICATED TASKS SETTINGS MODAL -->
    <div id="tasksSettingsModal" class="modal-overlay" onclick="if(event.target === this) closeModals()">
        <div class="modal-content settings-modal-box">
            <div class="settings-top-bar">
                <div>
                    <h2 class="u-m-0 u-border-0 u-p-0">Tasks, Routines &amp; Medicines Settings</h2>
                    <span class="u-fs-xs u-dim">MANAGE CATEGORIES, ASSIGN DAY PHASES, EDIT ROUTINES &amp; MEDICINE STOCK</span>
                </div>
                <div class="u-flex u-gap-2 u-ai-center">
                    <button type="button" class="btn btn-primary btn-sm" onclick="openCreationModal()">[+ NEW TASK / ROUTINE / EVENT / MED]</button>
                    <button type="button" class="btn btn-sm" onclick="closeModals(); renderTasks();">[ESC // CLOSE]</button>
                </div>
            </div>

            <div class="settings-body-split">
                <div class="settings-sidebar">
                    <div>
                        <button type="button" class="settings-nav-btn tasks-cfg-nav active" data-tab="tcfg-tasks" onclick="switchTasksConfigTab('tcfg-tasks')">1. Habits, Cats &amp; Phases</button>
                        <button type="button" class="settings-nav-btn tasks-cfg-nav" data-tab="tcfg-routines" onclick="switchTasksConfigTab('tcfg-routines')">2. Routines</button>
                        <button type="button" class="settings-nav-btn tasks-cfg-nav" data-tab="tcfg-meds" onclick="switchTasksConfigTab('tcfg-meds')">3. Medicines &amp; Stock</button>
                        <button type="button" class="settings-nav-btn tasks-cfg-nav" data-tab="tcfg-ghosts" onclick="switchTasksConfigTab('tcfg-ghosts')">4. Ghost Layers</button>
                    </div>
                </div>

                <!-- TAB 1: HABITS & CATEGORIES -->
                <div id="tcfg-tasks" class="settings-tab-panel tasks-cfg-panel active">
                    <div class="u-flex u-jc-between u-ai-center u-wrap u-gap-2" style="padding-bottom:var(--space-3); border-bottom:1px solid var(--border-color);">
                        <span class="section-label">Categories &amp; Tasks</span>
                        <div class="u-flex u-gap-2 u-ai-center u-wrap">
                            <button type="button" id="btn-tcfg-toggle-edit" class="btn btn-sm" onclick="toggleTasksManagerEditMode()">[EDIT]</button>
                            <button type="button" id="btn-tcfg-edit-one" class="btn btn-sm" style="display:none;" onclick="editSelectedManagerItem()" disabled>[EDIT SELECTED]</button>
                            <button type="button" id="btn-tcfg-delete-many" class="btn btn-danger btn-sm" style="display:none;" onclick="deleteSelectedManagerItems()" disabled>[X DELETE (0)]</button>
                            <button type="button" class="btn btn-primary btn-sm" onclick="openCreationModal('habit')">[+ NEW TASK]</button>
                        </div>
                    </div>
                    <div id="manager-list" class="manager-list u-mb-2"></div>
                    <div class="quick-add-task new-calendar-add">
                        <span>+</span>
                        <input type="text" placeholder="Create new category and press Enter..." onkeypress="quickAddCalendar(event)">
                    </div>
                </div>

                <!-- TAB 2: ROUTINES -->
                <div id="tcfg-routines" class="settings-tab-panel tasks-cfg-panel">
                    <div class="u-flex u-jc-between u-ai-center">
                        <span class="section-label">Configured Routines &amp; Sub-Sections</span>
                        <button type="button" class="btn btn-primary btn-sm" onclick="openCreationModal('routine')">[+ NEW ROUTINE]</button>
                    </div>
                    <div id="routines-manager-list" class="manager-list"></div>
                </div>

                <!-- TAB 3: MEDICINES & STOCK -->
                <div id="tcfg-meds" class="settings-tab-panel tasks-cfg-panel">
                    <div class="u-flex u-jc-between u-ai-center">
                        <span class="section-label">Medicines (Injected into Routines + Calendar Alerts)</span>
                        <button type="button" class="btn btn-primary btn-sm" onclick="openCreationModal('medicine')">[+ NEW MEDICINE]</button>
                    </div>
                    <div id="meds-manager-list" class="manager-list"></div>
                </div>

                <!-- TAB 4: GHOST LAYERS -->
                <div id="tcfg-ghosts" class="settings-tab-panel tasks-cfg-panel">
                    <div class="u-flex u-jc-between u-ai-center">
                        <span class="section-label">Ghost Layers (Trains, Transports &amp; Reference Schedules)</span>
                        <button type="button" class="btn btn-primary btn-sm" onclick="openReferenceModal()">[+ NEW GHOST LAYER]</button>
                    </div>
                    <div id="ghosts-manager-list" class="manager-list"></div>
                </div>
            </div>
        </div>
    </div>

    <!-- 7. Global System Settings Modal -->
    <div id="managerModal" class="modal-overlay" onclick="if(event.target === this) closeModals()">
        <div class="modal-content settings-modal-box">
            <div class="settings-top-bar">
                <div>
                    <h2 class="u-m-0 u-border-0 u-p-0">System Settings &amp; Workspace</h2>
                    <span class="u-fs-xs u-dim">CONFIGURE LAYOUTS, ALIASES, SONY AUDIO KEYS &amp; BACKUPS</span>
                </div>
                <button class="btn btn-sm" onclick="closeModals(); renderTasks();">[ESC // CLOSE]</button>
            </div>

            <div class="settings-body-split">
                <div class="settings-sidebar">
                    <div>
                        <button type="button" class="settings-nav-btn sys-cfg-nav active" data-tab="tab-workspace" onclick="switchSettingsTab('tab-workspace')">1. Workspace &amp; UI</button>
                        <button type="button" class="settings-nav-btn sys-cfg-nav lab-sony" data-tab="tab-ai" onclick="switchSettingsTab('tab-ai')">2. Sony Audio Pipeline</button>
                        <button type="button" class="settings-nav-btn sys-cfg-nav" data-tab="tab-system" onclick="switchSettingsTab('tab-system')">3. Data &amp; Manual</button>
                    </div>
                </div>

                <div id="tab-workspace" class="settings-tab-panel sys-cfg-panel active">
                    <div class="cfg-box">
                        <div class="sub-column-header">Quick System Actions &amp; Builders</div>
                        <div class="u-flex u-wrap u-gap-2">
                            <button type="button" class="btn btn-sm" onclick="closeModals(); toggleLayoutEditMode();">[EDIT LAYOUT // E]</button>
                            <button type="button" class="btn btn-sm" onclick="closeModals(); setQuadrantCount(0);">[0 // ZERO-UI MODE]</button>
                            <button type="button" class="btn btn-sm" onclick="openPlanTomorrowModal()">[PLAN TOMORROW // P]</button>
                            <button type="button" class="btn btn-sm" onclick="openTasksSettingsModal()">[TASKS &amp; ROUTINES ⚙]</button>
                        </div>
                    </div>
                    <div class="cfg-box u-flex u-col u-gap-4">
                        <div class="sub-column-header u-mb-0">Appearance &amp; Optical Filter</div>
                        <div class="u-flex u-jc-between u-ai-center">
                            <span class="u-muted u-fs-xs u-upper">Red Gelatin Optical Mode (Shortcut: R)</span>
                            <button type="button" id="btn-red-mode" class="btn btn-sm" onclick="toggleRedMode()">[RED]</button>
                        </div>
                        <div class="u-flex u-jc-between u-ai-center u-gap-3 u-wrap">
                            <span class="u-muted u-fs-xs u-upper">Font</span>
                            <div class="font-choice" role="radiogroup" aria-label="Font">
                                <button type="button" class="btn btn-sm" data-font-choice="vt323" style="font-family:'VT323',monospace!important; font-size-adjust:.56;">[TERMINAL]</button>
                                <button type="button" class="btn btn-sm" data-font-choice="jetbrains" style="font-family:'JetBrains Mono',monospace!important;">[JETBRAINS]</button>
                                <button type="button" class="btn btn-sm" data-font-choice="space" style="font-family:'Space Mono',monospace!important;">[SPACE]</button>
                                <button type="button" class="btn btn-sm" data-font-choice="classic" style="font-family:var(--font-system)!important;">[CLASSIC]</button>
                            </div>
                        </div>
                        <div>
                            <label class="u-flex u-jc-between u-dim u-fs-xs u-upper u-mb-2">
                                <span>Window Background Opacity</span>
                                <span id="opacity-val">0.92</span>
                            </label>
                            <input class="u-w-full" type="range" id="bg-opacity-slider" min="0.1" max="1.0" step="0.01" value="0.92" style="accent-color:var(--text-main);" oninput="updateOpacity(this.value)">
                        </div>
                    </div>
                    <div class="cfg-box u-p-0">
                        <div id="settings-workspace-container"></div>
                    </div>
                    <div class="cfg-box">
                        <div class="sub-column-header u-flex u-jc-between u-ai-center">
                            <span>Custom Command Aliases (1-Word Macros)</span>
                        </div>
                        <div id="settings-aliases-container"></div>
                    </div>
                </div>

                <div id="tab-ai" class="settings-tab-panel sys-cfg-panel">
                    <div class="cfg-box">
                        <label class="u-flex u-jc-between u-dim u-fs-xs u-upper u-mb-2">
                            <span>Primary Gemini API Key (Fallback for Audio Pipeline)</span>
                            <span class="u-green" id="gemini-key-status"></span>
                        </label>
                        <div class="u-flex u-gap-2">
                            <input type="password" id="gemini-api-key-input" class="form-control form-control-sm" placeholder="Paste Gemini API Key (AIzaSy...)..." oninput="handleGeminiKeyInput(this.value)">
                            <button type="button" class="btn btn-sm" onclick="const inp=document.getElementById('gemini-api-key-input'); inp.type = inp.type==='password' ? 'text' : 'password';">[SHOW]</button>
                        </div>
                    </div>
                    <div class="cfg-box">
                        <label class="u-flex u-jc-between u-dim u-fs-xs u-upper u-mb-2">
                            <span>Sony Recorder Pipeline // Dedicated Gemini Key</span>
                            <span class="u-dim" id="gemini-audio-key-status"></span>
                        </label>
                        <div class="u-flex u-gap-2 u-mb-2">
                            <input type="password" id="gemini-audio-key-input" class="form-control form-control-sm" placeholder="Optional Dedicated API Key for [SYNC SONY]..." oninput="handleGeminiAudioKeyInput(this.value)">
                            <button type="button" class="btn btn-sm" onclick="const inp=document.getElementById('gemini-audio-key-input'); inp.type = inp.type==='password' ? 'text' : 'password';">[SHOW]</button>
                        </div>
                        <div class="u-flex u-jc-between u-ai-center">
                            <span class="u-fs-xs u-dim" id="processed-audio-count">0 audio files in history</span>
                            <button type="button" class="btn btn-sm" onclick="resetProcessedAudioHistory()">[RESET AUDIO MEMORY]</button>
                        </div>
                    </div>
                </div>

                <div id="tab-system" class="settings-tab-panel sys-cfg-panel">
                    <div class="cfg-box u-flex u-col u-gap-3" style="border-color:var(--border-bright);">
                        <div class="u-flex u-jc-between u-ai-center">
                            <span class="u-main u-fs-xs u-bold u-upper">GitHub Gist Cloud Sync (PC ↔ Tablet ↔ Phone)</span>
                            <span class="u-fs-xs u-dim" id="cloud-sync-settings-status">[NOT CONFIGURED]</span>
                        </div>
                        <div class="u-flex u-gap-2 u-wrap">
                            <input type="password" id="cloud-gist-token-inp" class="form-control form-control-sm" style="flex:2; min-width:180px;" placeholder="GitHub Token (ghp_... with 'gist' scope)" onchange="saveCloudSyncCredentialsFromUI()">
                            <button type="button" class="btn btn-sm" onclick="const i=document.getElementById('cloud-gist-token-inp'); i.type=i.type==='password'?'text':'password';">[SHOW]</button>
                        </div>
                        <div class="u-flex u-gap-2 u-wrap">
                            <input type="text" id="cloud-gist-id-inp" class="form-control form-control-sm" style="flex:2; min-width:180px;" placeholder="Secret Gist ID (or click Create New)" onchange="saveCloudSyncCredentialsFromUI()">
                            <button type="button" class="btn btn-primary btn-sm" onclick="createNewSecretGistForCortex()">[+ CREATE NEW SECRET GIST]</button>
                        </div>
                        <div class="u-flex u-jc-between u-ai-center u-gap-2 u-wrap" style="padding-top:var(--space-2); border-top:1px dotted var(--border-color);">
                            <div class="u-flex u-gap-2">
                                <button type="button" class="btn btn-primary btn-sm" onclick="syncNow(true)">[⇅ SYNC NOW]</button>
                                <button type="button" class="btn btn-sm" id="cloud-sync-conflicts-btn" onclick="showSyncConflictsModal()">[SAVED CONFLICTS: 0]</button>
                            </div>
                            <button type="button" class="btn btn-sm u-gold" style="border-color:var(--accent-gold);" onclick="copyMagicMobileSetupUrl()">[🔗 COPY MAGIC SETUP URL]</button>
                        </div>
                    </div>
                    <div class="cfg-box lab-bridge u-flex u-col u-gap-3" style="border-color:var(--accent-gold);">
                        <div class="u-flex u-jc-between u-ai-center">
                            <span class="u-main u-fs-xs u-bold u-upper">Google/Apple Calendar &amp; Gmail Bank Bridge</span>
                            <span class="u-fs-xs u-dim" id="bridge-settings-status">[NOT CONFIGURED]</span>
                        </div>
                        <input type="text" id="bridge-webapp-url-inp" class="form-control form-control-sm" placeholder="Google Apps Script Web App URL" onchange="saveExternalBridgeConfigFromUI()">
                        <input type="text" id="bridge-icloud-ics-inp" class="form-control form-control-sm" placeholder="Optional Apple iCloud Calendar URL (webcal://...)" onchange="saveExternalBridgeConfigFromUI()">
                        <input type="text" id="bridge-bank-query-inp" class="form-control form-control-sm" placeholder="Gmail Bank Query" onchange="saveExternalBridgeConfigFromUI()">
                        <div class="u-flex u-jc-between u-ai-center u-gap-2 u-wrap" style="padding-top:var(--space-2); border-top:1px dotted var(--border-color);">
                            <button type="button" class="btn btn-sm" onclick="syncExternalCalendarsNow(true)">[📅 SYNC CALENDARS NOW]</button>
                            <button type="button" class="btn btn-primary btn-sm" onclick="scanBankEmailsNow(true)">[🏦 SCAN BANK EMAILS]</button>
                        </div>
                    </div>
                    <div class="cfg-box u-flex u-jc-between u-ai-center">
                        <div class="u-main u-fs-xs u-bold u-upper">Database JSON Backup</div>
                        <div class="u-flex u-gap-3">
                            <button type="button" class="btn btn-sm" onclick="exportData()">[EXPORT JSON]</button>
                            <label class="btn btn-sm u-pointer u-m-0">
                                [IMPORT JSON]
                                <input type="file" accept=".json" style="display:none;" onchange="importData(event)">
                            </label>
                        </div>
                    </div>
                    <div class="cfg-box u-flex u-jc-between u-ai-center">
                        <div class="u-main u-fs-xs u-bold u-upper">DSL &amp; Shortcuts Manual</div>
                        <button type="button" class="btn btn-sm" onclick="openShortcutsHelp()">[MANUAL // ?]</button>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- 8. Manage Note Categories Modal -->
    <div id="manageNotesModal" class="modal-overlay" onclick="if(event.target === this) closeModals()">
        <div class="modal-content" style="width:420px;">
            <h2>Manage Folders</h2>
            <div id="notes-manager-list" class="manager-list"></div>
            <div class="quick-add-task new-calendar-add">
                <span>+</span>
                <input type="text" placeholder="Add new root folder and press Enter..." onkeypress="quickAddNoteCategory(event)">
            </div>
            <div class="notes-md-box">
                <div class="sub-column-header">Markdown · Notion · Obsidian</div>
                <p class="notes-md-hint">Export every folder as Markdown files, or bring notes in from Notion (Export → Markdown &amp; CSV), Obsidian or any .md / .txt file.</p>
                <div class="notes-md-actions">
                    <button type="button" class="btn btn-sm" onclick="exportNotesMarkdown()">[EXPORT .ZIP]</button>
                    <button type="button" class="btn btn-sm" onclick="pickNotesToImport()">[IMPORT FILES]</button>
                </div>
            </div>
            <div class="modal-actions">
                <button class="btn btn-primary" onclick="closeModals(); renderNoteCategories();">Close</button>
            </div>
        </div>
    </div>

    <!-- 9. Delete Options Modal -->
    <div id="deleteModal" class="modal-overlay" onclick="if(event.target === this) closeModals()">
        <div class="modal-content" style="width:450px;">
            <h2 id="delete-modal-title">Delete Options</h2>
            <p class="modal-subtitle">Select action for <strong style="color:white;" id="delete-target-name"></strong>:</p>
            <div class="u-flex u-col u-gap-3">
                <button id="btn-del-single" class="btn" style="text-align:left; padding:var(--space-3);" onclick="confirmDelete('single')">
                    <strong>Delete for selected date only</strong>
                </button>
                <button id="btn-del-future" class="btn" style="text-align:left; padding:var(--space-3);" onclick="confirmDelete('future')">
                    <strong>Delete from selected date onwards</strong>
                </button>
                <button class="btn btn-danger" style="text-align:left; padding:var(--space-3);" onclick="confirmDelete('all')">
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
        <div class="modal-content" style="width:400px;">
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

    <!-- 13. Money Transaction Modal -->
    <div id="mTransactionModal" class="modal-overlay" onclick="if(event.target === this) closeModals()">
        <div class="modal-content" style="width:420px;">
            <h2 id="m-trans-title">New Transaction</h2>
            <form id="mTransactionForm">
                <input type="hidden" id="m-trans-type">
                <div class="u-flex u-gap-3">
                    <div class="form-group u-grow">
                        <label>Amount (€)</label>
                        <input type="number" id="m-trans-amount" class="form-control no-spinners" step="0.01" required>
                    </div>
                    <div class="form-group u-grow" id="m-trans-cat-group">
                        <label>Category</label>
                        <select id="m-trans-cat" class="form-control" onchange="handleModalCatSelectChange(this)"></select>
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
        <div class="modal-content" style="width:450px;">
            <h2>Create / Edit Vault</h2>
            <form id="mVaultForm">
                <input type="hidden" id="m-vault-id">
                <div class="form-group">
                    <label>Vault Name</label>
                    <input type="text" id="m-vault-name" class="form-control" placeholder="e.g. Amazon, Fondo Emergenza" required>
                </div>
                <div class="u-flex u-gap-3">
                    <div class="form-group u-grow">
                        <label>Initial Deposit (€)</label>
                        <input type="number" id="m-vault-balance" class="form-control no-spinners" step="0.01" value="0" required>
                    </div>
                    <div class="form-group u-grow">
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
                <div class="u-gap-3" style="display:none;" id="m-vault-rule-val-group">
                    <div class="form-group u-grow">
                        <label id="m-vault-rule-val-label">Rule Value</label>
                        <input type="number" id="m-vault-rule-val" class="form-control no-spinners" step="0.01" min="0" placeholder="e.g. 15">
                    </div>
                    <div class="form-group u-grow" id="m-vault-renewal-day-group">
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
        <div class="modal-content" style="width:380px;">
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
        <div class="modal-content" style="width:450px;">
            <h2>Add Recurring Payment</h2>
            <form id="mRecurringForm">
                <div class="form-group">
                    <label>Name</label>
                    <input type="text" id="m-rec-title" class="form-control" required>
                </div>
                <div class="u-flex u-gap-4">
                    <div class="form-group u-grow">
                        <label>Amount (€)</label>
                        <input type="number" id="m-rec-amount" class="form-control no-spinners" step="0.01" required>
                    </div>
                    <div class="form-group u-grow">
                        <label>Day of Month (1-31)</label>
                        <input type="number" id="m-rec-day" class="form-control no-spinners" min="1" max="31" required>
                    </div>
                </div>
                <div class="u-flex u-gap-4">
                    <div class="form-group u-grow">
                        <label>Start Date</label>
                        <input type="date" id="m-rec-start" class="form-control" required>
                    </div>
                    <div class="form-group u-grow">
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
        <div class="modal-content" style="width:400px;">
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
        <div class="modal-content" style="width:450px;">
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
                    <button type="button" class="btn u-w-full u-mb-3" style="border-style:dashed;" onclick="addRefTimeWindow()">+ Add Time Window</button>
                </div>
                <div class="form-group">
                    <label>Color</label>
                    <div class="color-palette" id="ref-color-palette">
                        <div class="color-circle active" style="background:#444444;" data-color="#444444" onclick="selectColor(this, 'r-color')"></div>
                        <div class="color-circle" style="background:#b84b4b;" data-color="#b84b4b" onclick="selectColor(this, 'r-color')"></div>
                        <div class="color-circle custom-color-btn" onclick="document.getElementById('r-color').click()">+</div>
                    </div>
                    <input type="color" id="r-color" style="display:none;" value="#444444" onchange="updateCustomColor(this, 'r-color')">
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
        <div class="modal-content u-flex u-col" style="width:680px; max-width:95%; max-height:85vh;">
            <h2>Nutritional Database (Values per 100g)</h2>
            <p class="modal-subtitle">Used to automatically estimate daily Kcal, Proteins (P), Carbs (C) and Fats (F) from your Diet table.</p>
            <div class="u-grid u-gap-2 u-mb-4" style="grid-template-columns:2fr 1fr 1fr 1fr 1fr 1fr auto; align-items:end; padding-bottom:var(--space-3); border-bottom:1px solid var(--border-color);">
                <div>
                    <label class="u-fs-2xs u-dim u-block u-mb-1">FOOD NAME</label>
                    <input type="text" id="fdb-name" class="form-control form-control-sm" placeholder="e.g. Avena">
                </div>
                <div>
                    <label class="u-fs-2xs u-dim u-block u-mb-1">KCAL/100G</label>
                    <input type="number" id="fdb-kcal" class="form-control form-control-sm no-spinners" placeholder="389">
                </div>
                <div>
                    <label class="u-fs-2xs u-dim u-block u-mb-1">PROT (G)</label>
                    <input type="number" id="fdb-p" class="form-control form-control-sm no-spinners" step="0.1" placeholder="16.9">
                </div>
                <div>
                    <label class="u-fs-2xs u-dim u-block u-mb-1">CARB (G)</label>
                    <input type="number" id="fdb-c" class="form-control form-control-sm no-spinners" step="0.1" placeholder="66.3">
                </div>
                <div>
                    <label class="u-fs-2xs u-dim u-block u-mb-1">FAT (G)</label>
                    <input type="number" id="fdb-f" class="form-control form-control-sm no-spinners" step="0.1" placeholder="6.9">
                </div>
                <div>
                    <label class="u-fs-2xs u-dim u-block u-mb-1">STD GRAMS</label>
                    <input type="number" id="fdb-defg" class="form-control form-control-sm no-spinners" placeholder="100" value="100">
                </div>
                <button type="button" class="btn btn-primary btn-sm" style="height:29px;" onclick="addFoodDbItem()">[+ ADD]</button>
            </div>
            <div class="u-grow u-scroll-y u-col u-gap-2" id="food-db-list" style="display:flex; padding-right:var(--space-2);"></div>
            <div class="modal-actions">
                <button type="button" class="btn btn-primary" onclick="closeModals(); renderDiet();">Save &amp; Recalculate</button>
            </div>
        </div>
    </div>

    <!-- 19. Cortex DSL & System Manual Modal -->
    <div id="shortcutsHelpModal" class="modal-overlay" onclick="if(event.target === this) closeModals()">
        <div class="modal-content" style="width:960px; max-width:96%; max-height:90vh;">
            <div class="u-flex u-jc-between u-ai-base u-mb-4" style="border-bottom:1px solid var(--border-color); padding-bottom:var(--space-2);">
                <div>
                    <h2 class="u-m-0 u-border-0 u-p-0">Cortex DSL Manual // Sintassi, Autocompletamento &amp; Modifiche</h2>
                    <span class="u-fs-xs u-dim">Usa <code>[TAB]</code> per autocompletare · <code>[ENTER]</code> per eseguire all'istante · <code>[SHIFT + ENTER]</code> (o <code>;</code>) per impilare nella Staging Area.</span>
                </div>
                <span class="u-fs-xs u-main u-bold">SHORTCUT: [?]</span>
            </div>

            <div class="help-manual-columns">
                <!-- 1. TASKS, FOCUS, CALENDARIO & NOTE -->
                <div class="help-section-card">
                    <div class="help-section-title">1. Task, Focus, Calendario &amp; Note</div>
                    <div class="help-grid">
                        <div class="help-key"><code>done [task]</code><br><span class="u-dim u-normal">es. <code>done Duolingo</code></span></div>
                        <div class="help-desc"><strong>Effect:</strong> Checks the first open box of the matching task active today.</div>

                        <div class="help-key"><code>focus [task/cat]</code><br><span class="u-dim u-normal">es. <code>focus Analisi</code></span></div>
                        <div class="help-desc"><strong>Effect:</strong> Starts the Pomodoro timer with the configured length and adds a block to the Day Planner.</div>

                        <div class="help-key"><code>task [titolo] [@day]</code><br><span class="u-dim u-normal">es. <code>task Studio @domani</code></span></div>
                        <div class="help-desc"><strong>Effect:</strong> Creates a flexible task.</div>

                        <div class="help-key"><code>todo [testo]</code><br><span class="u-dim u-normal">es. <code>todo Bolletta</code></span></div>
                        <div class="help-desc"><strong>Effect:</strong> Adds an unscheduled item to the Inbox.</div>

                        <div class="help-key"><code>event [@day] [titolo]</code><br><span class="u-dim u-normal">es. <code>event @domani Esame</code></span></div>
                        <div class="help-desc"><strong>Effect:</strong> Adds a one-off event to the Calendar and Planner.</div>

                        <div class="help-key"><code>note [Cat]: [testo]</code><br><span class="u-dim u-normal">es. <code>note Math: Teorema</code></span></div>
                        <div class="help-desc"><strong>Effect:</strong> Appends the note to the category (creates the folder if it doesn't exist).</div>
                    </div>
                </div>

                <!-- 2. MONEY, VAULTS, DIETA & PALESTRA -->
                <div class="help-section-card">
                    <div class="help-section-title">2. Money, vaults, diet and gym</div>
                    <div class="help-grid">
                        <div class="help-key"><code>out [€] #[Cat/Vault] [desc]</code><br><span class="u-dim u-normal">es. <code>out 20 #Amazon Cavo</code></span></div>
                        <div class="help-desc"><strong>Effect:</strong> Subtracts the amount from the balance. If <code>#Name</code> matches a <strong>Vault</strong>, it comes out of that vault.</div>

                        <div class="help-key"><code>in [€] [desc]</code><br><span class="u-dim u-normal">es. <code>in 500 Borsa</code></span></div>
                        <div class="help-desc"><strong>Effect:</strong> Adds <code>+€</code> to the total balance.</div>

                        <div class="help-key"><code>wish [item] [€ opz.]</code><br><span class="u-dim u-normal">es. <code>wish Libro 18</code></span></div>
                        <div class="help-desc"><strong>Effect:</strong> Adds a purchase idea to the Incubator.</div>

                        <div class="help-key"><code>weight [kg] [nota]</code><br><span class="u-dim u-normal">es. <code>weight 74.5 digiuno</code></span></div>
                        <div class="help-desc"><strong>Effect:</strong> Logs your body weight.</div>

                        <div class="help-key"><code>gym done</code></div>
                        <div class="help-desc"><strong>Effect:</strong> Saves the active workout and moves to the next split.</div>
                    </div>
                </div>

                <!-- 3. ISPEZIONE ISTANTANEA IN SOLA LETTURA (0ms) -->
                <div class="help-section-card">
                    <div class="help-section-title">3. Ispezione Rapida in Sola Lettura</div>
                    <div class="help-grid">
                        <div class="help-key"><code>diet</code> / <code>diet @domani</code></div>
                        <div class="help-desc">Shows meals, fixed rules and calculated macros.</div>

                        <div class="help-key"><code>gym</code></div>
                        <div class="help-desc">Shows the exercises of the active gym <code>Day</code>.</div>

                        <div class="help-key"><code>today</code> / <code>tomorrow</code></div>
                        <div class="help-desc">Shows a summary of timed and flexible tasks.</div>

                        <div class="help-key"><code>bal</code> / <code>money</code></div>
                        <div class="help-desc">Shows the spendable balance and vault status.</div>
                    </div>
                </div>

                <!-- 4. WORKSPACE, STAGING & SCORCIATOIE GLOBALI -->
                <div class="help-section-card">
                    <div class="help-section-title">4. Workspace, Staging &amp; Scorciatoie da Tastiera</div>
                    <div class="help-grid">
                        <div class="help-key"><code>summon [modulo]</code> · <code>swap</code> · <code>zero</code></div>
                        <div class="help-desc">Opens a module (including <code>math</code>).</div>

                        <div class="help-key"><code>plan</code> · <code>ledger</code> · <code>food</code> · <code>vault</code></div>
                        <div class="help-desc">Opens Planner, Ledger, Food DB and Vault respectively.</div>

                        <div class="help-key">[SHIFT + ENTER] / <code>;</code></div>
                        <div class="help-desc">Puts the command in the <strong>staging area</strong>.</div>

                        <div class="help-key">[CTRL+SPACE] · [?] · [,] · [E]</div>
                        <div class="help-desc">Command bar / Manual / Settings / Edit layout.</div>
                    </div>
                </div>

                <div class="help-section-card" style="grid-column:1 / -1;">
                    <div class="help-section-title">5. University Bridge (180 CFU, Appelli &amp; Tasse)</div>
                    <div class="help-grid">
                        <div class="help-key"><code>uni</code> · <code>uni info</code></div>
                        <div class="help-desc">Opens <code>University</code> or shows your grade averages.</div>

                        <div class="help-key"><code>esame [Nome] [Voto] [CFU]</code></div>
                        <div class="help-desc"><strong>Effect:</strong> Records the grade in the Libretto and moves the notes to <strong>Archive</strong>.</div>

                        <div class="help-key"><code>tassa [€] [Data] [Nome]</code></div>
                        <div class="help-desc"><strong>Effect:</strong> Creates a red event on the Calendar.</div>

                        <div class="help-key"><code>appello [Nome] [Data] [Ora]</code></div>
                        <div class="help-desc"><strong>Effect:</strong> Adds the exam session with a countdown.</div>
                    </div>
                </div>
            </div>

            <div class="modal-actions u-mt-3">
                <button class="btn btn-primary" onclick="closeModals()">Close Manual [Esc]</button>
            </div>
        </div>
    </div>

    <!-- 20. Quick-Switcher Modal (Shortcut: V) -->
    <div id="quickSwitcherModal" class="modal-overlay" onclick="if(event.target === this) closeModals()">
        <div class="modal-content" style="width:620px; max-width:95%; padding:var(--space-5);">
            <div class="u-flex u-jc-between u-ai-center u-mb-3" style="border-bottom:1px solid var(--border-color); padding-bottom:var(--space-3);">
                <h2 class="u-m-0 u-border-0 u-p-0">Views &amp; Modules</h2>
                <button class="btn btn-sm" onclick="closeModals()">[ESC]</button>
            </div>

            <input type="text" id="qs-filter-input" class="form-control form-control-sm u-mb-3" placeholder="Filter..." autocomplete="off">

            <div class="u-ai-center u-jc-between u-mb-3" id="qs-staged-bar" style="display:none; padding:var(--space-2) var(--space-3); border:1px solid var(--text-main); background:rgba(255,255,255,0.05);">
                <div class="u-fs-xs">
                    <strong class="u-main u-upper" id="qs-staged-list"></strong>
                </div>
                <div class="u-flex u-gap-2">
                    <button type="button" class="btn btn-sm" onclick="clearQuickSwitcherStaged()">[CLEAR]</button>
                    <button type="button" class="btn btn-primary btn-sm" onclick="commitQuickSwitcherStaged()">[OPEN]</button>
                </div>
            </div>

            <div class="u-col u-gap-4 u-scroll-y" id="qs-body-content" style="display:flex; max-height:62vh;"></div>
        </div>
    </div>

    <!-- 21. Routines Manager Modal -->
    <div id="routinesManagerModal" class="modal-overlay" onclick="if(event.target === this) closeModals()">
        <div class="modal-content u-flex u-col" style="width:780px; max-width:96%; max-height:88vh;">
            <div class="u-flex u-jc-between u-ai-center u-mb-3" style="border-bottom:1px solid var(--border-color); padding-bottom:var(--space-3);">
                <div>
                    <h2 class="u-m-0 u-border-0 u-p-0">Routines &amp; Sub-Sections Manager</h2>
                    <span class="u-fs-xs u-dim">CONFIGURE MORNING, EVENING, WEEKLY ROUTINES, MEDICINE STOCK &amp; ACTION TRIGGERS</span>
                </div>
                <button type="button" class="btn btn-sm" onclick="closeModals()">[ESC]</button>
            </div>

            <div class="u-flex u-gap-2 u-mb-4 u-ai-center" style="padding-bottom:var(--space-3); border-bottom:1px solid var(--border-color);">
                <input type="text" id="new-routine-name-inp" class="form-control form-control-sm u-grow" placeholder="New Routine Name (e.g. Pre-Exam Routine, Gym Prep)..." onkeydown="if(event.key==='Enter'){event.preventDefault(); addNewRoutineFromModal();}">
                <select id="new-routine-freq-sel" class="form-control form-control-sm" style="width:170px;">
                    <option value="all">Every Day</option>
                    <option value="weekend">Weekend (Sat–Sun)</option>
                    <option value="sunday">Sunday Only</option>
                    <option value="weekdays">Weekdays (Mon–Fri)</option>
                </select>
                <button type="button" class="btn btn-primary btn-sm" onclick="addNewRoutineFromModal()">[+ CREATE ROUTINE]</button>
            </div>

            <div class="u-grow u-scroll-y u-col u-gap-4" id="routines-manager-body" style="display:flex; padding-right:var(--space-2);"></div>

            <div class="modal-actions u-mt-3">
                <button type="button" class="btn btn-primary" onclick="closeModals(); renderTasks();">Done</button>
            </div>
        </div>
    </div>

    `;
}

initModalsHtml();

function closeModals() {
    qsExpandedMacroKey = null;
    if (typeof hidePresetModulesHoverPopup === 'function') hidePresetModulesHoverPopup();
    document.querySelectorAll('.modal-overlay').forEach(m => {
        m.style.display = 'none';
    });
    if (typeof setHudTemporaryExpansion === 'function' && !isAskBarExpanded) {
        setHudTemporaryExpansion(false);
    }
}

// ============================================================================
// EDITOR CUSTOM ALIASES
// ============================================================================

const ALIAS_INSPIRATION_TEMPLATES = [
    { name: 'sera', cmds: 'red on; tasks; plan', desc: "Turns on red mode, opens Daily Tasks and tomorrow's timeline" },
    { name: 'mattina', cmds: 'red off; tasks + planner; today', desc: "Restores colors, shows Tasks + Planner side by side and today's summary" },
    { name: 'sessione', cmds: 'uni roadmap + notes', desc: 'Shows University Roadmap and Notes side by side' },
    { name: 'conti', cmds: 'money; bal', desc: 'Opens Money full screen and shows the vault snapshot' },
    { name: 'barra', cmds: 'hud on', desc: 'Collapses Cortex into the always-on-top HUD strip' }
];

function renderCustomAliasesSettingsUI() {
    const cont = document.getElementById('settings-aliases-container');
    if (!cont) return;

    const entries = Object.entries(typeof customAliases !== 'undefined' ? customAliases : {});

    let html = `
        <div class="u-mb-3">
            <div class="u-fs-2xs u-dim u-upper u-mb-2">
                Idee &amp; Template:
            </div>
            <div class="u-wrap u-gap-2" style="display:flex;" id="alias-inspiration-chips"></div>
        </div>

        <div class="u-flex u-gap-2 u-mb-3 u-ai-center u-wrap">
            <input type="text" id="new-alias-name" class="form-control form-control-sm u-bold" style="width:130px;" placeholder="Parola (es. sera)">
            <span class="u-dim u-bold">=</span>
            <input type="text" id="new-alias-cmds" class="form-control form-control-sm u-grow" style="min-width:220px;" placeholder="Comandi separati da ; (es. red on; tasks; plan)" onkeydown="if(event.key==='Enter'){event.preventDefault(); saveCustomAliasFromUI();}">
            <button type="button" class="btn btn-primary btn-sm" onclick="saveCustomAliasFromUI()">[+ SAVE ALIAS]</button>
        </div>

        <div class="u-col u-gap-2" id="custom-aliases-list" style="display:flex;"></div>
    `;

    cont.innerHTML = html;

    const chipsBox = cont.querySelector('#alias-inspiration-chips');
    ALIAS_INSPIRATION_TEMPLATES.forEach(tpl => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'btn btn-sm';
        chip.style.cssText = 'font-size:var(--font-2xs); padding:var(--space-1) var(--space-2); border-style:dashed; text-transform:none;';
        chip.title = `${tpl.desc}\nComandi: ${tpl.cmds}`;
        chip.innerHTML = `<strong>${escapeHtml(tpl.name)}</strong> <span class="u-dim">→ ${escapeHtml(tpl.cmds)}</span>`;
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
        listEl.innerHTML = `<div class="empty-state u-py-2">[ NESSUN ALIAS CREATO ]</div>`;
    } else {
        entries.forEach(([aliasKey, macroCmds]) => {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:var(--space-2) var(--space-3); background:rgba(255,255,255,0.025); border:1px solid var(--border-color); border-left:3px solid var(--text-main); font-size:var(--font-xs); gap:var(--space-3);';
            row.innerHTML = `
                <div class="u-grow u-minw0 u-clip u-nowrap" style="text-overflow:ellipsis;">
                    <strong class="u-main u-upper" style="margin-right:var(--space-2);">${escapeHtml(aliasKey)}</strong>
                    <span class="u-dim">→</span>
                    <code class="u-muted u-ml-2">${escapeHtml(macroCmds)}</code>
                </div>
                <div class="u-flex u-gap-2 u-noshrink">
                    <button type="button" class="btn btn-sm btn-run-alias" title="Esegui ora questo alias">[▶ RUN]</button>
                    <button type="button" class="icon-btn btn-edit-alias" title="Modifica">✎</button>
                    <button type="button" class="icon-btn delete btn-del-alias" title="Delete">×</button>
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
}

// ============================================================================
// QUICK-SWITCHER MODAL E HELPERS CATEGORIE 
// ============================================================================

let qsStagedModules = [];
let qsExpandedMacroKey = null;

function openQuickSwitcherModal() {
    if (typeof setHudTemporaryExpansion === 'function') setHudTemporaryExpansion(true);
    closeModals();
    if (typeof setHudTemporaryExpansion === 'function') setHudTemporaryExpansion(true);

    qsStagedModules = [];
    qsExpandedMacroKey = null; 
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
    if (typeof setModulesView === 'function') setModulesView(toMount);
}

function renderQuickSwitcherContent(filterStr = '') {
    const body = document.getElementById('qs-body-content');
    const stagedBar = document.getElementById('qs-staged-bar');
    const stagedList = document.getElementById('qs-staged-list');
    if (!body) return;

    if (stagedBar && stagedList) {
        if (qsStagedModules.length > 0) {
            stagedBar.style.display = 'flex';
            stagedList.textContent = qsStagedModules.map(k => dashboardModules[k]?.name || k).join(' + ');
        } else {
            stagedBar.style.display = 'none';
        }
    }

    const q = (filterStr || '').trim().toLowerCase();
    body.innerHTML = '';

    const matchingPresets = (typeof workspacePresets !== 'undefined' ? workspacePresets : []).filter(p => !q || p.name.toLowerCase().includes(q));
    const presetsSection = document.createElement('div');
    presetsSection.innerHTML = `<div class="sub-column-header">Saved Views</div>`;

    if (matchingPresets.length === 0) {
        presetsSection.innerHTML += `<div class="empty-state u-py-1">[ NONE ]</div>`;
    } else {
        const grid = document.createElement('div');
        grid.style.cssText = 'display:grid; grid-template-columns:repeat(3, 1fr); gap:var(--space-2);';
        matchingPresets.forEach(p => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn';
            btn.style.cssText = 'text-align:left; padding:var(--space-3) var(--space-3); display:flex; align-items:center; justify-content:space-between;';
            btn.innerHTML = `<strong class="u-main u-fs-sm u-clip u-nowrap" style="text-overflow:ellipsis;">${escapeHtml(p.name)}</strong>`;
            btn.onclick = () => {
                closeModals();
                if (typeof applyWorkspacePreset === 'function') applyWorkspacePreset(p.id);
            };
            grid.appendChild(btn);
        });
        presetsSection.appendChild(grid);
    }
    body.appendChild(presetsSection);

    const modSection = document.createElement('div');
    modSection.innerHTML = `<div class="sub-column-header">Modules</div>`;
    const modGrid = document.createElement('div');
    modGrid.style.cssText = 'display:grid; grid-template-columns:repeat(3, 1fr); gap:var(--space-2);';

    const primaryList = typeof PRIMARY_MODULE_KEYS !== 'undefined' ? PRIMARY_MODULE_KEYS : [];

    primaryList.filter(k => {
        if (!q) return true;
        const subKeys = (typeof MACRO_SUBMODULES_MAP !== 'undefined' && MACRO_SUBMODULES_MAP[k]) ? MACRO_SUBMODULES_MAP[k] : [k];
        const subMatches = subKeys.some(sk => typeof dashboardModules !== 'undefined' && dashboardModules[sk] && (sk.includes(q) || dashboardModules[sk].name.toLowerCase().includes(q)));
        return k.includes(q) || (dashboardModules[k] && dashboardModules[k].name.toLowerCase().includes(q)) || subMatches;
    }).forEach(k => {
        const subKeys = (typeof MACRO_SUBMODULES_MAP !== 'undefined' && MACRO_SUBMODULES_MAP[k]) ? MACRO_SUBMODULES_MAP[k] : [k];
        const isStaged = qsStagedModules.includes(k);
        const isCurrentlyMounted = typeof activeSlots !== 'undefined' && (activeSlots.includes(k) || subKeys.some(sk => activeSlots.includes(sk)));
        const cleanMacroName = dashboardModules[k] ? dashboardModules[k].name : k;

        const cardWrap = document.createElement('div');
        cardWrap.style.cssText = 'display:flex; flex-direction:column; position:relative;';

        const topRow = document.createElement('div');
        topRow.style.cssText = 'display:flex; width:100%;';

        const mainBtn = document.createElement('button');
        mainBtn.type = 'button';
        mainBtn.className = `btn ${isStaged ? 'btn-primary' : ''}`;
        mainBtn.style.cssText = 'flex:1; text-align:left; padding:var(--space-3) var(--space-3); display:flex; justify-content:space-between; align-items:center; min-width:0;';
        mainBtn.innerHTML = `
            <div class="u-bold u-fs-xs u-clip u-nowrap" style="text-overflow:ellipsis;">${escapeHtml(cleanMacroName)}</div>
            <span class="u-fs-2xs u-ml-1">${isStaged ? '+' : (isCurrentlyMounted ? '●' : '')}</span>
        `;

        mainBtn.onclick = (e) => {
            if (e.shiftKey || e.altKey) {
                const idx = qsStagedModules.indexOf(k);
                if (idx !== -1) qsStagedModules.splice(idx, 1);
                else qsStagedModules.push(k);
                renderQuickSwitcherContent(document.getElementById('qs-filter-input')?.value || '');
            } else if (qsStagedModules.length > 0) {
                if (!qsStagedModules.includes(k)) qsStagedModules.push(k);
                commitQuickSwitcherStaged();
            } else {
                closeModals();
                if (typeof setModulesView === 'function') setModulesView([k]);
            }
        };
        topRow.appendChild(mainBtn);

        const isExpanded = (qsExpandedMacroKey === k) || (q && subKeys.length > 1 && subKeys.some(sk => dashboardModules[sk]?.name.toLowerCase().includes(q)));
        const dropBtn = document.createElement('button');
        dropBtn.type = 'button';
        dropBtn.className = `btn ${isExpanded ? 'btn-primary' : ''}`;
        dropBtn.style.cssText = 'padding:0 var(--space-3); margin-left:-1px; font-size:0.72rem;';
        dropBtn.textContent = isExpanded ? '▴' : '▾';
        dropBtn.onclick = (e) => {
            e.stopPropagation();
            qsExpandedMacroKey = (qsExpandedMacroKey === k) ? null : k;
            renderQuickSwitcherContent(document.getElementById('qs-filter-input')?.value || '');
        };
        topRow.appendChild(dropBtn);
        cardWrap.appendChild(topRow);

        if (isExpanded) {
            const subTray = document.createElement('div');
            subTray.style.cssText = 'border:1px solid var(--text-main); border-top:none; background:#070707; padding:var(--space-2); display:flex; flex-direction:column; gap:var(--space-1);';

            subKeys.forEach(sk => {
                if (!dashboardModules[sk]) return;
                const subStaged = qsStagedModules.includes(sk);
                const subMounted = typeof activeSlots !== 'undefined' && activeSlots.includes(sk);
                const shortSubName = dashboardModules[sk].name.replace(/^.*?:\s*/, '');

                const subBtn = document.createElement('button');
                subBtn.type = 'button';
                subBtn.className = `btn btn-sm ${subStaged ? 'btn-primary' : ''}`;
                subBtn.style.cssText = 'text-align:left; display:flex; justify-content:space-between; align-items:center; padding:var(--space-1) var(--space-2);';
                subBtn.innerHTML = `
                    <span>↳ ${escapeHtml(shortSubName)}</span>
                    <span class="u-fs-2xs" style="opacity:0.75;">${subStaged ? '+' : (subMounted ? '●' : '')}</span>
                `;
                subBtn.onclick = (ev) => {
                    ev.stopPropagation();
                    if (ev.shiftKey || ev.altKey) {
                        const idx = qsStagedModules.indexOf(sk);
                        if (idx !== -1) qsStagedModules.splice(idx, 1);
                        else qsStagedModules.push(sk);
                        renderQuickSwitcherContent(document.getElementById('qs-filter-input')?.value || '');
                    } else if (qsStagedModules.length > 0) {
                        if (!qsStagedModules.includes(sk)) qsStagedModules.push(sk);
                        commitQuickSwitcherStaged();
                    } else {
                        closeModals();
                        if (typeof setModulesView === 'function') setModulesView([sk]);
                    }
                };
                subTray.appendChild(subBtn);
            });
            cardWrap.appendChild(subTray);
        }
        modGrid.appendChild(cardWrap);
    });

    modSection.appendChild(modGrid);
    body.appendChild(modSection);
}

function populateCentralModalCategorySelects(initialFullCat) {
    const parentSel = document.getElementById('ncm-parent-cat');
    if (!parentSel) return;

    parentSel.innerHTML = '';
    
    if (typeof noteCategories !== 'undefined') {
        noteCategories.sort().forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat;
            const depth = (cat.match(/\//g) || []).length;
            const indent = ' '.repeat(depth * 3); // Spazi non-breaking nel DOM textContent
            opt.textContent = `${indent}${cat.split(' / ').pop()}`;
            if (cat === initialFullCat) opt.selected = true;
            parentSel.appendChild(opt);
        });
    }

    const newOpt = document.createElement('option');
    newOpt.value = '__NEW__';
    newOpt.textContent = '+ New Folder...';
    parentSel.appendChild(newOpt);

    parentSel.onchange = () => {
        if (parentSel.value === '__NEW__') {
            const entered = prompt('Create new folder path (e.g. Work / Meetings):');
            if (entered && entered.trim()) {
                let clean = entered.trim();
                clean = clean.split('/').map(x => x.trim()).filter(Boolean).join(' / ');
                if (typeof noteCategories !== 'undefined' && !noteCategories.includes(clean)) {
                    noteCategories.push(clean);
                }
                populateCentralModalCategorySelects(clean);
            } else {
                populateCentralModalCategorySelects(initialFullCat);
            }
        }
    };
}

function getCentralModalSelectedFullCategory() {
    return document.getElementById('ncm-parent-cat')?.value || 'General';
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
    if (typeof savedOpacity !== 'undefined') window.savedOpacity = val;
    document.documentElement.style.setProperty('--bg-opacity', val);
    const label = document.getElementById('opacity-val');
    if (label) label.innerText = val;
    if (typeof persistKeysMap === 'function') {
        persistKeysMap({ 'tracker_opacity': String(val) });
    } else {
        cortexStore.setItem('tracker_opacity', val);
    }
}

function switchSettingsTab(tabId) {
    document.querySelectorAll('.sys-cfg-nav').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabId);
    });
    document.querySelectorAll('.sys-cfg-panel').forEach(panel => {
        panel.classList.toggle('active', panel.id === tabId);
    });
}

function switchTasksConfigTab(tabId) {
    document.querySelectorAll('.tasks-cfg-nav').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabId);
    });
    document.querySelectorAll('.tasks-cfg-panel').forEach(panel => {
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
    if (typeof updateCloudSyncSettingsUI === 'function') updateCloudSyncSettingsUI();

    const sEl = document.getElementById('bg-opacity-slider');
    if (sEl && typeof savedOpacity !== 'undefined') sEl.value = savedOpacity;
    const lEl = document.getElementById('opacity-val');
    if (lEl && typeof savedOpacity !== 'undefined') lEl.innerText = savedOpacity;

    closeModals();
    switchSettingsTab(defaultTab);
    const modal = document.getElementById('managerModal');
    if (modal) modal.style.display = 'flex';
}

// ============================================================================
// FORM SUBMIT HANDLERS
// ============================================================================

document.getElementById('habitForm')?.addEventListener('submit', function(e) {
    e.preventDefault();
    const id = document.getElementById('h-id').value;
    const category = document.getElementById('h-category').value.trim();
    const title = document.getElementById('h-title').value.trim();
    const startDate = document.getElementById('h-startdate').value;
    const endDate = document.getElementById('h-enddate').value || null;
    const color = document.getElementById('h-color').value || '#ffffff';
    const type = document.querySelector('input[name="h-type"]:checked').value;
    const priorityNode = document.querySelector('input[name="h-priority"]:checked');
    const priority = priorityNode ? priorityNode.value : 'high';

    let instances = 1, timerMins = 25, noTimer = false, frequency = 'specific', daysOfWeek = [], timeWindows = [];

    if (type === 'timed') {
        document.querySelectorAll('.habit-time-window-row').forEach(row => {
            const start = row.querySelector('.h-start').value;
            const end = row.querySelector('.h-end').value;
            let days = [];
            row.querySelectorAll('.tw-day-check:checked').forEach(cb => {
                const dVal = parseInt(cb.value, 10);
                days.push(dVal);
                if (!daysOfWeek.includes(dVal)) daysOfWeek.push(dVal);
            });
            if (start && end && days.length > 0) timeWindows.push({ start, end, days });
        });
        if (timeWindows.length === 0) {
            alert("Please complete at least one time window with selected days!");
            return;
        }
        const [sh, sm] = timeWindows[0].start.split(':').map(Number);
        const [eh, em] = timeWindows[0].end.split(':').map(Number);
        timerMins = Math.max(5, (eh * 60 + em) - (sh * 60 + sm));
    } else {
        const modeRadio = document.querySelector('input[name="h-timer-mode"]:checked');
        noTimer = (modeRadio && modeRadio.value === 'checkonly');
        instances = parseInt(document.getElementById('h-instances').value, 10) || 1;
        timerMins = noTimer ? 0 : (parseInt(document.getElementById('h-timer').value, 10) || 25);
        frequency = document.getElementById('h-frequency').value;
        if (frequency === 'specific') {
            document.querySelectorAll('#h-days-container input:checked').forEach(cb => {
                daysOfWeek.push(parseInt(cb.value, 10));
            });
            if (daysOfWeek.length === 0) {
                alert("Please select at least one day!");
                return;
            }
        }
    }

    if (id) {
        const t = templates.find(x => x.id === id);
        if (t) {
            Object.assign(t, { category, title, instances, timerMinutes: timerMins, noTimer, frequency, daysOfWeek, startDate, endDate, color, timeWindows, type, priority });
        }
    } else {
        templates.push({
            id: 't_' + Date.now(),
            category, title, instances, timerMinutes: timerMins, noTimer, frequency, daysOfWeek, startDate, endDate, color, timeWindows, type, exceptions: [], priority
        });
    }

    saveData();
    closeModals();
    renderTasks();
    if (typeof renderTracker === 'function') renderTracker();
    if (typeof renderCalendar === 'function') renderCalendar();
    if (typeof renderWeeklyPlanner === 'function') renderWeeklyPlanner();
    if (typeof renderAvailableTasksForFocus === 'function') renderAvailableTasksForFocus();
    if (typeof renderDayPlannerModule === 'function') renderDayPlannerModule();
});

document.getElementById('routineForm')?.addEventListener('submit', function(e) {
    e.preventDefault();
    const id = document.getElementById('rtn-id').value;
    const title = document.getElementById('rtn-title').value.trim();
    const startDate = document.getElementById('rtn-startdate').value || todayStr;
    const endDate = document.getElementById('rtn-enddate').value || null;
    const color = document.getElementById('rtn-color').value || '#b08d43';
    const type = document.querySelector('input[name="rtn-type"]:checked').value;

    let timerMinutes = 20, noTimer = true, frequency = 'all', daysOfWeek = [], timeWindows = [];

    if (type === 'timed') {
        document.querySelectorAll('.rtn-time-window-row').forEach(row => {
            const start = row.querySelector('.rtn-start').value;
            const end = row.querySelector('.rtn-end').value;
            let days = [];
            row.querySelectorAll('.tw-day-check:checked').forEach(cb => {
                const dVal = parseInt(cb.value, 10);
                days.push(dVal);
                if (!daysOfWeek.includes(dVal)) daysOfWeek.push(dVal);
            });
            if (start && end && days.length > 0) timeWindows.push({ start, end, days });
        });
        if (timeWindows.length === 0) {
            alert("Please complete at least one time window with selected days!");
            return;
        }
        frequency = 'specific';
        noTimer = false;
        const [sh, sm] = timeWindows[0].start.split(':').map(Number);
        const [eh, em] = timeWindows[0].end.split(':').map(Number);
        timerMinutes = Math.max(5, (eh * 60 + em) - (sh * 60 + sm));
    } else {
        const modeRadio = document.querySelector('input[name="rtn-timer-mode"]:checked');
        noTimer = (modeRadio && modeRadio.value === 'checkonly');
        timerMinutes = noTimer ? 0 : (parseInt(document.getElementById('rtn-timer').value, 10) || 20);
        frequency = document.getElementById('rtn-frequency').value;
        if (frequency === 'specific') {
            document.querySelectorAll('#rtn-days-container input:checked').forEach(cb => {
                daysOfWeek.push(parseInt(cb.value, 10));
            });
            if (daysOfWeek.length === 0) {
                alert("Please select at least one day!");
                return;
            }
        }
    }

    const sections = [];
    document.querySelectorAll('#rtn-subsections-builder .rtn-form-sec-box').forEach((box, idx) => {
        const secName = box.querySelector('.rtn-sec-name-inp').value.trim() || `Section ${idx + 1}`;
        const pendingInp = box.querySelector('.rtn-new-step-inp');
        const items = [];
        box.querySelectorAll('.rtn-step-val-inp').forEach((sInp, sIdx) => {
            const val = sInp.value.trim();
            if (val) {
                items.push({
                    id: `ri_${Date.now()}_${idx}_${sIdx}`,
                    title: val
                });
            }
        });
        if (pendingInp && pendingInp.value.trim()) {
            items.push({
                id: `ri_${Date.now()}_${idx}_p`,
                title: pendingInp.value.trim()
            });
        }
        if (items.length > 0 || secName) {
            sections.push({
                id: box.dataset.secId || `sec_${Date.now()}_${idx}`,
                title: secName,
                items: items
            });
        }
    });

    if (id) {
        const existing = routinesData.find(x => x.id === id);
        if (existing) {
            Object.assign(existing, { title, color, startDate, endDate, type, noTimer, timerMinutes, frequency, daysOfWeek, timeWindows, sections });
        }
    } else {
        routinesData.push({
            id: 'rtn_' + Date.now(),
            title, color, startDate, endDate, type, noTimer, timerMinutes, frequency, daysOfWeek, timeWindows, sections
        });
    }

    saveData();
    closeModals();
    renderTasks();
    if (typeof renderWeeklyPlanner === 'function') renderWeeklyPlanner();
    if (typeof renderDayPlannerModule === 'function') renderDayPlannerModule();
});

document.getElementById('eventForm')?.addEventListener('submit', function(e) {
    e.preventDefault();
    const startVal = document.getElementById('e-start') ? document.getElementById('e-start').value : '';
    const endVal = document.getElementById('e-end') ? document.getElementById('e-end').value : '';

    specificEvents.push({
        id: 'e_' + Date.now(),
        title: document.getElementById('e-title').value.trim(),
        date: document.getElementById('e-date').value,
        start: startVal || null,
        end: endVal || null,
        color: document.getElementById('e-color').value
    });

    saveData();
    closeModals();
    renderTasks();
    if (typeof renderCalendar === 'function') renderCalendar();
    if (typeof renderWeeklyPlanner === 'function') renderWeeklyPlanner();
    if (typeof renderDayPlannerModule === 'function') renderDayPlannerModule();
});

document.getElementById('medicineForm')?.addEventListener('submit', function(e) {
    e.preventDefault();
    const id = document.getElementById('med-id') ? document.getElementById('med-id').value : '';
    const catName = 'Medicine';
    if (!categoryOrder.includes(catName)) categoryOrder.push(catName);

    const frequency = document.getElementById('med-frequency') ? document.getElementById('med-frequency').value : 'all';
    const intervalDays = document.getElementById('med-interval-days')
        ? Math.max(1, parseInt(document.getElementById('med-interval-days').value, 10) || 14)
        : 14;
    const routineId = document.getElementById('med-routine-select')
        ? document.getElementById('med-routine-select').value
        : 'rtn_evening';

    const daysOfWeek = [];
    if (frequency === 'specific') {
        document.querySelectorAll('#med-days-container input:checked').forEach(cb => {
            daysOfWeek.push(parseInt(cb.value, 10));
        });
    }

    const medPayload = {
        category: catName,
        title: document.getElementById('med-title').value.trim(),
        routineId: routineId,
        instances: parseInt(document.getElementById('med-instances').value, 10) || 1,
        stock: parseInt(document.getElementById('med-stock').value, 10) || 0,
        alertDays: parseInt(document.getElementById('med-alert').value, 10) || 7,
        startDate: document.getElementById('med-startdate').value || todayStr,
        endDate: null,
        color: '#4c5b73',
        type: 'medicine',
        noTimer: true,
        timerMinutes: 0,
        frequency: frequency,
        intervalDays: intervalDays,
        timeWindows: [],
        daysOfWeek: daysOfWeek
    };

    let targetMed = null;
    if (id) {
        targetMed = templates.find(x => x.id === id);
        if (targetMed) Object.assign(targetMed, medPayload);
    } else {
        targetMed = Object.assign({ id: 'm_' + Date.now() }, medPayload);
        templates.push(targetMed);
    }

    if (targetMed && typeof recalculateMedicineAlerts === 'function') recalculateMedicineAlerts(targetMed);
    saveData();
    document.getElementById('medicineForm').reset();
    closeModals();
    renderTasks();
    if (typeof renderCalendar === 'function') renderCalendar();
});