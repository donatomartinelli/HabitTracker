// --- 5. TERMINAL ENGINE: COMMAND PALETTE & GLOBAL SHORTCUTS ---

let toastTimeout;
let commandHistory = [];
let historyIndex = -1;

function showToast(msg) {
    const toast = document.getElementById('terminal-toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        toast.classList.remove('show');
    }, 2600);
}

function openTerminal() {
    const overlay = document.getElementById('terminalOverlay');
    const input = document.getElementById('terminal-input');
    const feedback = document.getElementById('terminal-feedback');
    if (!overlay || !input) return;

    overlay.style.display = 'flex';
    input.value = '';
    historyIndex = commandHistory.length;
    if (feedback) {
        feedback.textContent = 'Ready. Press [Enter] to execute, [Esc] to close, [?] for manual.';
        feedback.style.color = 'var(--text-dim)';
    }
    setTimeout(() => input.focus(), 10);
}

function closeTerminal() {
    const overlay = document.getElementById('terminalOverlay');
    const input = document.getElementById('terminal-input');
    if (overlay) overlay.style.display = 'none';
    if (input) input.blur();
}

function openShortcutsHelp() {
    closeTerminal();
    closeModals();
    const modal = document.getElementById('shortcutsHelpModal');
    if (modal) modal.style.display = 'flex';
}

function resolveDateToken(token) {
    const clean = token.replace(/^@/, '').toLowerCase();
    const d = new Date(todayObj);
    if (clean === 'oggi' || clean === 'today') return todayStr;
    if (clean === 'domani' || clean === 'tomorrow' || clean === 'tmw') {
        d.setDate(d.getDate() + 1);
        return formatDate(d);
    }
    if (clean === 'ieri' || clean === 'yesterday') {
        d.setDate(d.getDate() - 1);
        return formatDate(d);
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
    return null;
}

function jumpToDate(dateStr) {
    const parts = dateStr.split('-').map(Number);
    if (parts.length !== 3 || isNaN(parts[0])) return;
    currentCalendarDate = new Date(parts[0], parts[1] - 1, 1);
    selectDate(dateStr);
}

function shiftSelectedDate(daysOffset) {
    const d = new Date(selectedDateStr);
    d.setDate(d.getDate() + daysOffset);
    jumpToDate(formatDate(d));
}

function getCommandPreview(raw) {
    const str = raw.trim();
    if (!str) return 'Ready. Press [Enter] to execute, [Esc] to close, [?] for manual.';
    if (str === '?' || str.toLowerCase() === 'help') return 'Open System Manual (CLI, Shortcuts & Mouse Actions)';

    const parts = str.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const rest = str.slice(parts[0].length).trim();

    switch (cmd) {
        case 'plan':
        case 'tomorrow':
            return `[EVENING BUILDER] Open interactive workspace to assemble tomorrow's plan`;
        case 'log': {
            const m = rest.match(/^(\d+)\s*(.*)$/);
            if (!m) return 'Syntax: log [minutes] [category] (e.g. log 45 Studio)';
            return `[FOCUS LEDGER] Record ${m[1]} real minutes in category "${m[2] || 'Studio'}"`;
        }
        case 'ledger':
        case 'stats':
            return `[FOCUS LEDGER] Open Consistency History & Real Focus Hours breakdown`;
        case 'weight':
        case 'peso': {
            const m = rest.match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
            if (!m) return 'Syntax: weight [kg] [optional note] (e.g. weight 74.5 morning)';
            return `[HEALTH] Log Body Weight: ${parseFloat(m[1].replace(',', '.')).toFixed(1)} kg ${m[2] ? '(' + m[2] + ')' : ''}`;
        }
        case 'food':
        case 'macros':
            return `[HEALTH] Open Nutritional Database (Kcal & Macros per 100g)`;
        case 'vault':
            return `[MONEY] Open modal to create a new Salvadanaio / Automatic Rule`;
        case 'out':
        case '-': {
            const m = rest.match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
            if (!m) return 'Syntax: out [amount] #[category] [description] (e.g. out 8.50 #treno A/R)';
            return `[MONEY] Subtract €${parseFloat(m[1].replace(',', '.')).toFixed(2)} — "${m[2] || 'Expense'}"`;
        }
        case 'in':
        case '+': {
            const m = rest.match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
            if (!m) return 'Syntax: in [amount] [description] (e.g. in 500 borsa)';
            return `[MONEY] Add +€${parseFloat(m[1].replace(',', '.')).toFixed(2)} — "${m[2] || 'Income'}" (triggers Vault rules)`;
        }
        case 'wish':
        case 'comprare': {
            if (!rest) return 'Syntax: wish [item name] [optional cost]';
            return `[MONEY] Add "${rest}" to Ideas Incubator`;
        }
        case 'todo': {
            if (!rest) return 'Syntax: todo [task title]';
            return `[DAILY] Add "${rest}" to General To-Do`;
        }
        case 'task': {
            if (!rest) return 'Syntax: task [title] [@oggi | @domani | @YYYY-MM-DD]';
            return `[PLANNER] Create scheduled task: ${rest}`;
        }
        case 'event': {
            if (!rest) return 'Syntax: event [@date] [event title] (e.g. event @domani Esame)';
            return `[CALENDAR] Create single event: ${rest}`;
        }
        case 'note': {
            if (!rest) return 'Syntax: note [Category]: [text]  OR  note [text]';
            return `[NOTES] Append quick note`;
        }
        case 'focus':
        case 'pomo': {
            const m = rest.match(/^(\d+)\s*(.*)$/);
            if (!m) return 'Syntax: focus [minutes] [optional title] (e.g. focus 30 Analisi)';
            return `[POMODORO] Start ${m[1]} min session: "${m[2] || 'Quick Focus'}"`;
        }
        case 'gym':
        case 'workout':
            return `[HEALTH] Complete active workout (Day ${nextWorkoutDay}) and advance`;
        case 'swap':
            return `[LAYOUT] Swap Left (${activeLeft.toUpperCase()}) and Right (${activeRight.toUpperCase()}) panes`;
        case 'left':
        case 'right':
            return `[LAYOUT] Mount module on ${cmd.toUpperCase()} pane (daily, planner, health, money)`;
        case 'goto':
            return `[CALENDAR] Jump to date (oggi, domani, ieri, YYYY-MM-DD)`;
        case 'export':
        case 'backup':
            return `[SYSTEM] Export complete JSON backup file`;
        default:
            return `Unknown command "${cmd}". Type ? for available commands.`;
    }
}

function executeTerminalCommand(raw) {
    const str = raw.trim();
    if (!str) return false;

    commandHistory.push(str);
    historyIndex = commandHistory.length;

    if (str === '?' || str.toLowerCase() === 'help') {
        openShortcutsHelp();
        return true;
    }

    const parts = str.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const rest = str.slice(parts[0].length).trim();

    // 0a. EVENING BUILDER: plan
    if (cmd === 'plan' || cmd === 'tomorrow') {
        closeTerminal();
        openPlanTomorrowModal();
        return true;
    }

    // 0b. MANUAL FOCUS LOG: log 45 Studio
    if (cmd === 'log') {
        const m = rest.match(/^(\d+)\s*(.*)$/);
        if (!m) return false;
        const mins = parseInt(m[1], 10);
        const cat = m[2].trim() || 'Studio';
        logFocusSession(mins, cat, 'Manual Log', selectedDateStr);
        showToast(`[LEDGER] Logged ${mins}m in "${cat}"`);
        return true;
    }

    // 0c. OPEN FOCUS LEDGER: ledger / stats
    if (cmd === 'ledger' || cmd === 'stats') {
        closeTerminal();
        openTrackerModal();
        return true;
    }

    // 0d. BODY WEIGHT LOG: weight 74.5 [nota opzionale]
    if (cmd === 'weight' || cmd === 'peso') {
        const m = rest.match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
        if (!m) return false;
        const w = parseFloat(m[1].replace(',', '.'));
        const note = m[2].trim();
        if (typeof addBodyMetricLog === 'function') {
            return addBodyMetricLog(w, note);
        }
        return false;
    }

    // 0e. OPEN NUTRITIONAL DB: food / macros
    if (cmd === 'food' || cmd === 'macros') {
        if (typeof openFoodDbModal === 'function') {
            closeTerminal();
            openFoodDbModal();
            return true;
        }
        return false;
    }

    // 0f. OPEN NEW VAULT MODAL: vault
    if (cmd === 'vault') {
        if (typeof openVaultModal === 'function') {
            closeTerminal();
            openVaultModal();
            return true;
        }
        return false;
    }

    // 1. USCITA MONEY (Supporta #categoria, es: out 8.50 #treno regionale)
    if (cmd === 'out' || cmd === '-') {
        const m = rest.match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
        if (!m) return false;
        const amt = roundCurrency(m[1].replace(',', '.'));
        let rawDesc = m[2].trim();
        let category = 'Generale';

        const catMatch = rawDesc.match(/#([a-zA-Z0-9_À-ÿ]+)/);
        if (catMatch) {
            const rawTag = catMatch[1];
            category = rawTag.charAt(0).toUpperCase() + rawTag.slice(1).toLowerCase();
            rawDesc = rawDesc.replace(catMatch[0], '').trim();
            if (!mCategories.includes(category)) mCategories.push(category);
        }

        const desc = rawDesc || category;
        mBalance = roundCurrency(mBalance - amt);
        mTransactions.push({
            id: 'mt_' + Date.now(),
            type: 'out',
            amount: amt,
            category: category,
            desc: desc,
            date: todayStr
        });
        saveMoneyData();
        renderMoneyDashboard();
        showToast(`[MONEY] -€${amt.toFixed(2)} [${category}] ${desc}`);
        return true;
    }

    // 2. ENTRATA MONEY (Attiva automaticamente le regole % dei Salvadanai)
    if (cmd === 'in' || cmd === '+') {
        const m = rest.match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
        if (!m) return false;
        const amt = roundCurrency(m[1].replace(',', '.'));
        const desc = m[2].trim() || 'Income';
        mBalance = roundCurrency(mBalance + amt);
        const autoSaved = typeof applyIncomeVaultRules === 'function' ? applyIncomeVaultRules(amt) : 0;

        mTransactions.push({
            id: 'mt_' + Date.now(),
            type: 'in',
            amount: amt,
            category: 'Entrata',
            desc: desc,
            date: todayStr
        });
        saveMoneyData();
        renderMoneyDashboard();
        const vaultMsg = autoSaved > 0 ? ` (Auto-Vault: €${autoSaved.toFixed(2)})` : '';
        showToast(`[MONEY] +€${amt.toFixed(2)} (${desc})${vaultMsg}`);
        return true;
    }

    // 3. WISHLIST
    if (cmd === 'wish' || cmd === 'comprare') {
        if (!rest) return false;
        const m = rest.match(/^(.*?)\s+(\d+(?:[.,]\d+)?)$/);
        let title = rest;
        let cost = "";
        if (m && m[1].trim()) {
            title = m[1].trim();
            cost = roundCurrency(m[2].replace(',', '.'));
        }
        mWishlist.push({
            id: 'mw_' + Date.now(),
            title: title,
            cost: cost,
            order: mWishlist.length
        });
        saveMoneyData();
        renderMoneyDashboard();
        showToast(`[WISH] Added: ${title}${cost ? ' (€' + cost.toFixed(2) + ')' : ''}`);
        return true;
    }

    // 4. GENERAL TO-DO
    if (cmd === 'todo') {
        if (!rest) return false;
        generalTodos.push({ id: 'todo_' + Date.now(), title: rest });
        saveData();
        renderGeneralTodos();
        showToast(`[TODO] Added: ${rest}`);
        return true;
    }

    // 5. SCHEDULED TASK
    if (cmd === 'task') {
        if (!rest) return false;
        let targetDate = selectedDateStr;
        let titleTokens = [];
        rest.split(/\s+/).forEach(tok => {
            if (tok.startsWith('@')) {
                const resolved = resolveDateToken(tok);
                if (resolved) targetDate = resolved;
                else titleTokens.push(tok);
            } else {
                titleTokens.push(tok);
            }
        });
        const finalTitle = titleTokens.join(' ').trim();
        if (!finalTitle) return false;

        const dayIdx = new Date(targetDate).getDay();
        const catName = 'General To-Do';
        if (!categoryOrder.includes(catName)) categoryOrder.push(catName);

        templates.push({
            id: 't_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
            category: catName,
            title: finalTitle,
            instances: 1,
            timerMinutes: 25,
            frequency: 'specific',
            daysOfWeek: [dayIdx],
            startDate: targetDate,
            endDate: targetDate,
            color: '#ffffff',
            type: 'untimed',
            timeWindows: []
        });
        saveData();
        renderTasks();
        renderWeeklyPlanner();
        renderTracker();
        showToast(`[TASK] "${finalTitle}" scheduled for ${targetDate}`);
        return true;
    }

    // 6. CALENDAR EVENT
    if (cmd === 'event') {
        if (!rest) return false;
        const subParts = rest.split(/\s+/);
        let dateStr = selectedDateStr;
        let title = rest;

        const maybeDate = resolveDateToken(subParts[0]);
        if (maybeDate) {
            dateStr = maybeDate;
            title = subParts.slice(1).join(' ').trim();
        }
        if (!title) return false;

        specificEvents.push({
            id: 'e_' + Date.now(),
            title: title,
            date: dateStr,
            color: '#b84b4b'
        });
        saveData();
        renderCalendar();
        renderTasks();
        renderWeeklyPlanner();
        showToast(`[EVENT] "${title}" on ${dateStr}`);
        return true;
    }

    // 7. QUICK NOTE
    if (cmd === 'note') {
        if (!rest) return false;
        let targetCat = document.getElementById('note-category') ? document.getElementById('note-category').value : 'General';
        let noteBody = rest;

        const colonIdx = rest.indexOf(':');
        if (colonIdx > 0 && colonIdx < 25) {
            const candidateCat = rest.slice(0, colonIdx).trim();
            const candidateBody = rest.slice(colonIdx + 1).trim();
            if (candidateCat && candidateBody) {
                const match = noteCategories.find(c => c.toLowerCase() === candidateCat.toLowerCase());
                if (match) {
                    targetCat = match;
                } else {
                    targetCat = candidateCat;
                    noteCategories.push(targetCat);
                }
                noteBody = candidateBody;
            }
        }

        if (!notesContent[targetCat]) notesContent[targetCat] = "";
        notesContent[targetCat] += (notesContent[targetCat] === "" ? "" : "\n\n") + noteBody;
        saveData();
        renderNoteCategories();
        refreshNotesView();
        showToast(`[NOTE] Saved in "${targetCat}"`);
        return true;
    }

    // 8. INSTANT POMODORO
    if (cmd === 'focus' || cmd === 'pomo') {
        const m = rest.match(/^(\d+)\s*(.*)$/);
        if (!m) return false;
        const mins = Math.max(1, parseInt(m[1], 10));
        const focusTitle = m[2].trim() || 'Terminal Focus';

        focusPlaylist = [{
            type: 'task',
            id: 'custom_' + Date.now(),
            category: 'Focus',
            title: focusTitle,
            duration: mins,
            color: '#ffffff',
            isPartial: true
        }];
        currentPlaylistIndex = 0;
        startCurrentPlaylistPhase();
        showToast(`[FOCUS] Started ${mins}m: ${focusTitle}`);
        return true;
    }

    // 9. COMPLETE WORKOUT
    if (cmd === 'workout' || (cmd === 'gym' && rest.toLowerCase() === 'done')) {
        if (typeof completeWorkout === 'function') {
            const completedDay = nextWorkoutDay;
            completeWorkout(completedDay);
            showToast(`[HEALTH] Workout Day ${completedDay} completed!`);
            return true;
        }
        return false;
    }

    // 10. LAYOUT COMMANDS
    if (cmd === 'swap') {
        switchModule('left', activeRight);
        showToast(`[LAYOUT] Swapped panes`);
        return true;
    }

    if (cmd === 'left' || cmd === 'right') {
        const modKey = rest.toLowerCase();
        if (dashboardModules[modKey]) {
            switchModule(cmd, modKey);
            showToast(`[LAYOUT] ${cmd.toUpperCase()} -> ${dashboardModules[modKey].name}`);
            return true;
        }
        return false;
    }

    // 11. GOTO DATE
    if (cmd === 'goto') {
        const resolved = resolveDateToken(rest);
        if (!resolved) return false;
        jumpToDate(resolved);
        showToast(`[CALENDAR] Selected ${resolved}`);
        return true;
    }

    // 12. EXPORT BACKUP
    if (cmd === 'export' || cmd === 'backup') {
        exportData();
        showToast(`[SYSTEM] Backup exported`);
        return true;
    }

    return false;
}

window.addEventListener('DOMContentLoaded', () => {
    const termInput = document.getElementById('terminal-input');
    const termFeedback = document.getElementById('terminal-feedback');

    if (termInput) {
        termInput.addEventListener('input', () => {
            if (termFeedback) {
                termFeedback.textContent = getCommandPreview(termInput.value);
                termFeedback.style.color = 'var(--text-dim)';
            }
        });

        termInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const rawVal = termInput.value.trim();
                const ok = executeTerminalCommand(rawVal);
                if (ok) {
                    const modalCommands = ['?', 'help', 'plan', 'tomorrow', 'ledger', 'stats', 'food', 'macros', 'vault'];
                    if (!modalCommands.includes(rawVal.toLowerCase())) {
                        closeTerminal();
                    }
                } else if (termFeedback) {
                    termFeedback.textContent = 'Invalid syntax or unknown command. Type ? for help.';
                    termFeedback.style.color = '#ff6666';
                }
            } else if (e.key === 'Escape') {
                e.preventDefault();
                closeTerminal();
            } else if (e.key === 'ArrowUp') {
                if (commandHistory.length > 0 && historyIndex > 0) {
                    e.preventDefault();
                    historyIndex--;
                    termInput.value = commandHistory[historyIndex];
                    if (termFeedback) termFeedback.textContent = getCommandPreview(termInput.value);
                }
            } else if (e.key === 'ArrowDown') {
                if (historyIndex < commandHistory.length - 1) {
                    e.preventDefault();
                    historyIndex++;
                    termInput.value = commandHistory[historyIndex];
                } else {
                    historyIndex = commandHistory.length;
                    termInput.value = '';
                }
                if (termFeedback) termFeedback.textContent = getCommandPreview(termInput.value);
            }
        });
    }

    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey && e.code === 'Space') || (e.ctrlKey && e.key.toLowerCase() === 'k')) {
            e.preventDefault();
            const overlay = document.getElementById('terminalOverlay');
            if (overlay && overlay.style.display === 'flex') {
                closeTerminal();
            } else {
                openTerminal();
            }
            return;
        }

        if (e.ctrlKey && e.key.toLowerCase() === 's') {
            e.preventDefault();
            saveData();
            saveMoneyData();
            saveHealthData();
            showToast('[SYSTEM] All data saved to storage');
            return;
        }

        if (e.key === 'Escape') {
            const termOverlay = document.getElementById('terminalOverlay');
            if (termOverlay && termOverlay.style.display === 'flex') {
                closeTerminal();
                return;
            }
            closeModals();
            document.querySelectorAll('.dropdown-content.show').forEach(d => d.classList.remove('show'));
            if (document.activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
                document.activeElement.blur();
            }
            return;
        }

        const activeTag = document.activeElement ? document.activeElement.tagName : '';
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(activeTag) || (document.activeElement && document.activeElement.isContentEditable)) {
            return;
        }

        const anyModalOpen = Array.from(document.querySelectorAll('.modal-overlay')).some(m => m.style.display === 'flex');
        const pomoOverlay = document.getElementById('pomodoroOverlay');
        const fullPomoOpen = pomoOverlay && pomoOverlay.style.display === 'flex' && !pomoOverlay.classList.contains('widget-mode');
        if (anyModalOpen || fullPomoOpen) return;

        if (e.ctrlKey || e.altKey || e.metaKey) return;

        switch (e.key) {
            case 'ArrowLeft':
                e.preventDefault();
                shiftSelectedDate(-1);
                showToast(`Date: ${selectedDateStr}`);
                break;
            case 'ArrowRight':
                e.preventDefault();
                shiftSelectedDate(1);
                showToast(`Date: ${selectedDateStr}`);
                break;
            case 't':
            case 'T':
                e.preventDefault();
                jumpToDate(todayStr);
                showToast(`Today: ${todayStr}`);
                break;
            case 'p':
            case 'P':
                e.preventDefault();
                openPlanTomorrowModal();
                break;
            case 'j':
            case 'J':
                e.preventDefault();
                openJournal(selectedDateStr);
                break;
            case 'n':
            case 'N': {
                e.preventDefault();
                const notes = document.getElementById('notes-section');
                if (!notes) break;
                if (notes.classList.contains('collapsed') || notes.style.display === 'none') {
                    notes.classList.remove('collapsed');
                    notes.style.display = 'flex';
                    notes.style.flexDirection = 'column';
                    notes.style.height = '250px';
                    setTimeout(() => {
                        const txt = document.getElementById('note-text');
                        if (txt) txt.focus();
                    }, 20);
                } else {
                    notes.classList.add('collapsed');
                    notes.style.display = 'none';
                }
                break;
            }
            case 'w':
            case 'W': {
                e.preventDefault();
                const drawer = document.getElementById('weekly-drawer');
                if (!drawer) break;
                if (drawer.classList.contains('collapsed') || drawer.style.display === 'none') {
                    drawer.classList.remove('collapsed');
                    drawer.style.display = 'flex';
                    drawer.style.flexDirection = 'column';
                    drawer.style.height = '200px';
                } else {
                    drawer.classList.add('collapsed');
                    drawer.style.display = 'none';
                }
                break;
            }
            case 's':
            case 'S':
                e.preventDefault();
                switchModule('left', activeRight);
                showToast(`Swapped panes`);
                break;
            case '1':
                e.preventDefault();
                switchModule('left', 'daily');
                break;
            case '2':
                e.preventDefault();
                switchModule('left', 'planner');
                break;
            case '3':
                e.preventDefault();
                switchModule('left', 'health');
                break;
            case '4':
                e.preventDefault();
                switchModule('left', 'money');
                break;
            case '!':
                e.preventDefault();
                switchModule('right', 'daily');
                break;
            case '"':
            case '@':
                e.preventDefault();
                switchModule('right', 'planner');
                break;
            case '£':
            case '#':
                e.preventDefault();
                switchModule('right', 'health');
                break;
            case '$':
                e.preventDefault();
                switchModule('right', 'money');
                break;
            case '?':
                e.preventDefault();
                openShortcutsHelp();
                break;
        }
    });
});