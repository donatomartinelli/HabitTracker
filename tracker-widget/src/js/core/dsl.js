// --- js/core/dsl.js ---
// Domain Specific Language (DSL) // Scheletro Comandi Interni & Gestore Red Mode

let isRedMode = localStorage.getItem('tracker_red_mode') === 'true';

function applyRedModeUI() {
    document.body.classList.toggle('red-mode', isRedMode);
    const btn = document.getElementById('btn-red-mode');
    if (btn) {
        btn.textContent = isRedMode ? '[RED: ON]' : '[RED]';
        btn.classList.toggle('btn-primary', isRedMode);
    }
}

function toggleRedMode(forceState = null) {
    isRedMode = forceState !== null ? Boolean(forceState) : !isRedMode;
    localStorage.setItem('tracker_red_mode', isRedMode ? 'true' : 'false');
    applyRedModeUI();
    if (typeof showToast === 'function') {
        showToast(isRedMode ? '[RED MODE] Gelatina Rossa ACTIVE' : '[RED MODE] Standard Palette Restored');
    }
}

window.addEventListener('DOMContentLoaded', applyRedModeUI);

function resolveDateToken(token) {
    if (!token) return null;
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
    const str = (raw || '').trim();
    if (!str) return 'Ready. Ask AI ("Cosa mangio oggi?"), type a command, or say "Hey Tracker".';
    if (str === '?' || str.toLowerCase() === 'help') return 'Open System Manual (CLI, Shortcuts & Actions)';

    const parts = str.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const rest = str.slice(parts[0].length).trim();

    switch (cmd) {
        case 'red':
        case 'redmode':
            return `[VISUAL] Toggle Red Gelatin Mode (${rest || 'toggle'})`;
        case 'zero':
            return `[WORKSPACE] Switch to Zero-UI Mode (0 quadrants)`;
        case 'ai':
            return geminiApiKey ? `[AI AGENT] Ask or translate natural input: "${rest}"` : `[AI AGENT] Requires Gemini API Key in [CFG]`;
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
            return `[FOCUS LEDGER] Open Consistency Grid & Real Focus Hours breakdown`;
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
            if (!m) return 'Syntax: out [amount] #[category] [desc] (e.g. out 8.50 #Treno A/R)';
            return `[MONEY] Subtract €${parseFloat(m[1].replace(',', '.')).toFixed(2)} — "${m[2] || 'Expense'}"`;
        }
        case 'in':
        case '+': {
            const m = rest.match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
            if (!m) return 'Syntax: in [amount] [desc] (e.g. in 500 borsa)';
            return `[MONEY] Add +€${parseFloat(m[1].replace(',', '.')).toFixed(2)} — "${m[2] || 'Income'}" (triggers Vault rules)`;
        }
        case 'wish':
        case 'comprare': {
            if (!rest) return 'Syntax: wish [item name] [optional cost]';
            return `[MONEY] Add "${rest}" to Ideas Incubator`;
        }
        case 'todo': {
            if (!rest) return 'Syntax: todo [task title]';
            return `[TASKS] Add "${rest}" to General To-Do Inbox`;
        }
        case 'task': {
            if (!rest) return 'Syntax: task [title] [@oggi | @domani | @YYYY-MM-DD]';
            return `[TASKS] Schedule task: ${rest}`;
        }
        case 'done':
        case 'check': {
            if (!rest) return 'Syntax: done [task title] (checks off matching task today)';
            return `[TASKS] Check off today's task matching "${rest}"`;
        }
        case 'event': {
            if (!rest) return 'Syntax: event [@date] [title]';
            return `[CALENDAR] Create single event: ${rest}`;
        }
        case 'note': {
            if (!rest) return 'Syntax: note [Category]: [text]';
            return `[NOTES] Append note (creates category if new): ${rest}`;
        }
        case 'focus':
        case 'pomo': {
            const m = rest.match(/^(\d+)\s*(.*)$/);
            if (!m) return 'Syntax: focus [minutes] [optional title]';
            return `[POMODORO] Start ${m[1]} min session: "${m[2] || 'Quick Focus'}"`;
        }
        case 'gym':
        case 'workout':
            return `[GYM] Complete active workout (Day ${nextWorkoutDay}) and advance`;
        case 'summon':
        case 'view':
        case 'show':
        case 'open': {
            const modKey = rest.toLowerCase();
            return dashboardModules[modKey] ? `[WORKSPACE] Summon module "${dashboardModules[modKey].name}"` : `[WORKSPACE] Specify: calendar, tasks, notes, planner, diet, gym, money`;
        }
        case 'goto':
            return `[CALENDAR] Jump to date`;
        case 'export':
        case 'backup':
            return `[SYSTEM] Export complete JSON backup file`;
        default:
            return geminiApiKey
                ? `Press [Enter] to ask AI or translate natural sentence: "${str}"`
                : `Unknown command "${str}". Type ? for help or add Gemini Key in [CFG].`;
    }
}

function executeTerminalCommand(raw) {
    const str = (raw || '').trim();
    if (!str) return false;

    if (str === '?' || str.toLowerCase() === 'help') {
        if (typeof openShortcutsHelp === 'function') openShortcutsHelp();
        return true;
    }

    const parts = str.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const rest = str.slice(parts[0].length).trim();

    if (cmd === 'red' || cmd === 'redmode') {
        if (rest.toLowerCase() === 'on') toggleRedMode(true);
        else if (rest.toLowerCase() === 'off') toggleRedMode(false);
        else toggleRedMode();
        return true;
    }

    if (cmd === 'zero') {
        if (typeof setQuadrantCount === 'function') setQuadrantCount(0);
        if (typeof showToast === 'function') showToast('[WORKSPACE] Zero-UI Mode active');
        return true;
    }

    if (cmd === 'plan' || cmd === 'tomorrow') {
        if (typeof closeTerminal === 'function') closeTerminal();
        if (typeof openPlanTomorrowModal === 'function') openPlanTomorrowModal();
        return true;
    }

    if (cmd === 'log') {
        const m = rest.match(/^(\d+)\s*(.*)$/);
        if (!m) return false;
        const mins = parseInt(m[1], 10);
        const cat = m[2].trim() || 'Studio';
        logFocusSession(mins, cat, 'Manual Log', selectedDateStr);
        if (typeof showToast === 'function') showToast(`[LEDGER] Logged ${mins}m in "${cat}"`);
        return true;
    }

    if (cmd === 'ledger' || cmd === 'stats') {
        if (typeof closeTerminal === 'function') closeTerminal();
        if (typeof openTrackerModal === 'function') openTrackerModal();
        return true;
    }

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

    if (cmd === 'sony' || cmd === 'audio') {
        if (typeof closeTerminal === 'function') closeTerminal();
        const folderInp = document.getElementById('sony-folder-input');
        if (folderInp) folderInp.click();
        return true;
    }

    if (cmd === 'food' || cmd === 'macros') {
        if (typeof openFoodDbModal === 'function') {
            if (typeof closeTerminal === 'function') closeTerminal();
            openFoodDbModal();
            return true;
        }
        return false;
    }

    if (cmd === 'vault') {
        if (typeof openVaultModal === 'function') {
            if (typeof closeTerminal === 'function') closeTerminal();
            openVaultModal();
            return true;
        }
        return false;
    }

    if (cmd === 'out' || cmd === '-') {
        const m = rest.match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
        if (!m) return false;
        const amt = roundCurrency(m[1].replace(',', '.'));
        let rawDesc = m[2].trim();
        let category = 'Generale';

        const catMatch = rawDesc.match(/#([a-zA-Z0-9_À-ÿ]+)/);
        if (catMatch) {
            category = catMatch[1].charAt(0).toUpperCase() + catMatch[1].slice(1).toLowerCase();
            rawDesc = rawDesc.replace(catMatch[0], '').trim();
            if (!mCategories.includes(category)) mCategories.push(category);
        }

        const desc = rawDesc || category;
        mBalance = roundCurrency(mBalance - amt);
        mTransactions.push({
            id: 'mt_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
            type: 'out', amount: amt, category, desc, date: todayStr
        });
        saveMoneyData();
        if (typeof renderMoneyDashboard === 'function') renderMoneyDashboard();
        if (typeof showToast === 'function') showToast(`[MONEY] -€${amt.toFixed(2)} [${category}] ${desc}`);
        return true;
    }

    if (cmd === 'in' || cmd === '+') {
        const m = rest.match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
        if (!m) return false;
        const amt = roundCurrency(m[1].replace(',', '.'));
        const desc = m[2].trim() || 'Income';
        mBalance = roundCurrency(mBalance + amt);
        const autoSaved = typeof applyIncomeVaultRules === 'function' ? applyIncomeVaultRules(amt) : 0;

        mTransactions.push({
            id: 'mt_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
            type: 'in', amount: amt, category: 'Entrata', desc, date: todayStr
        });
        saveMoneyData();
        if (typeof renderMoneyDashboard === 'function') renderMoneyDashboard();
        const vaultMsg = autoSaved > 0 ? ` (Auto-Vault: €${autoSaved.toFixed(2)})` : '';
        if (typeof showToast === 'function') showToast(`[MONEY] +€${amt.toFixed(2)} (${desc})${vaultMsg}`);
        return true;
    }

    if (cmd === 'wish' || cmd === 'comprare') {
        if (!rest) return false;
        const m = rest.match(/^(.*?)\s+(\d+(?:[.,]\d+)?)$/);
        let title = rest, cost = "";
        if (m && m[1].trim()) {
            title = m[1].trim();
            cost = roundCurrency(m[2].replace(',', '.'));
        }
        mWishlist.push({ id: 'mw_' + Date.now(), title, cost, order: mWishlist.length });
        saveMoneyData();
        if (typeof renderMoneyDashboard === 'function') renderMoneyDashboard();
        if (typeof showToast === 'function') showToast(`[WISH] Added: ${title}${cost ? ' (€' + cost.toFixed(2) + ')' : ''}`);
        return true;
    }

    if (cmd === 'todo') {
        if (!rest) return false;
        generalTodos.push({ id: 'todo_' + Date.now(), title: rest });
        saveData();
        if (typeof renderGeneralTodos === 'function') renderGeneralTodos();
        if (typeof showToast === 'function') showToast(`[TODO] Added: ${rest}`);
        return true;
    }

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
            category: catName, title: finalTitle, instances: 1, timerMinutes: 25,
            frequency: 'specific', daysOfWeek: [dayIdx], startDate: targetDate, endDate: targetDate,
            color: '#ffffff', type: 'untimed', timeWindows: []
        });
        saveData();
        if (typeof renderTasks === 'function') renderTasks();
        if (typeof renderWeeklyPlanner === 'function') renderWeeklyPlanner();
        if (typeof renderTracker === 'function') renderTracker();
        if (typeof showToast === 'function') showToast(`[TASK] "${finalTitle}" scheduled for ${targetDate}`);
        return true;
    }

    if (cmd === 'done' || cmd === 'check') {
        if (!rest) return false;
        const q = rest.toLowerCase();
        const activeToday = templates.filter(t => isTaskActiveOnDate(t, selectedDateStr));
        const match = activeToday.find(t => t.title.toLowerCase().includes(q) || t.category.toLowerCase().includes(q));
        if (!match) return false;

        const curLog = (logs[selectedDateStr] && logs[selectedDateStr][match.id]) || Array(match.instances || 1).fill(false);
        const idx = curLog.indexOf(false);
        if (idx !== -1 && typeof toggleTask === 'function') {
            toggleTask(match.id, idx);
            if (typeof showToast === 'function') showToast(`[DONE] Checked off "${match.title}"`);
            return true;
        }
        return false;
    }

    if (cmd === 'event') {
        if (!rest) return false;
        const subParts = rest.split(/\s+/);
        let dateStr = selectedDateStr, title = rest;
        const maybeDate = resolveDateToken(subParts[0]);
        if (maybeDate) {
            dateStr = maybeDate;
            title = subParts.slice(1).join(' ').trim();
        }
        if (!title) return false;

        specificEvents.push({ id: 'e_' + Date.now(), title, date: dateStr, color: '#b84b4b' });
        saveData();
        if (typeof renderCalendar === 'function') renderCalendar();
        if (typeof renderTasks === 'function') renderTasks();
        if (typeof renderWeeklyPlanner === 'function') renderWeeklyPlanner();
        if (typeof showToast === 'function') showToast(`[EVENT] "${title}" on ${dateStr}`);
        return true;
    }

    if (cmd === 'note') {
        if (!rest) return false;
        let targetCat = document.getElementById('note-category') ? document.getElementById('note-category').value : 'General';
        let noteBody = rest;

        const colonIdx = rest.indexOf(':');
        if (colonIdx > 0 && colonIdx < 30) {
            const candidateCat = rest.slice(0, colonIdx).trim();
            const candidateBody = rest.slice(colonIdx + 1).trim();
            if (candidateCat && candidateBody) {
                const match = noteCategories.find(c => c.toLowerCase() === candidateCat.toLowerCase());
                if (match) targetCat = match;
                else {
                    targetCat = candidateCat;
                    noteCategories.push(targetCat);
                }
                noteBody = candidateBody;
            }
        }

        if (!notesContent[targetCat]) notesContent[targetCat] = "";
        notesContent[targetCat] += (notesContent[targetCat] === "" ? "" : "\n\n") + noteBody;
        saveData();
        if (typeof renderNoteCategories === 'function') renderNoteCategories();
        const select = document.getElementById('note-category');
        if (select) select.value = targetCat;
        if (typeof refreshNotesView === 'function') refreshNotesView();
        if (typeof showToast === 'function') showToast(`[NOTE] Saved in "${targetCat}"`);
        return true;
    }

    if (cmd === 'focus' || cmd === 'pomo') {
        const m = rest.match(/^(\d+)\s*(.*)$/);
        if (!m) return false;
        const mins = Math.max(1, parseInt(m[1], 10));
        const focusTitle = m[2].trim() || 'Terminal Focus';

        focusPlaylist = [{
            type: 'task', id: 'custom_' + Date.now(), category: 'Focus',
            title: focusTitle, duration: mins, color: '#ffffff', isPartial: true
        }];
        currentPlaylistIndex = 0;
        startCurrentPlaylistPhase();
        if (typeof showToast === 'function') showToast(`[FOCUS] Started ${mins}m: ${focusTitle}`);
        return true;
    }

    if (cmd === 'workout' || (cmd === 'gym' && rest.toLowerCase() === 'done')) {
        if (typeof completeWorkout === 'function') {
            const completedDay = nextWorkoutDay;
            completeWorkout(completedDay);
            if (typeof showToast === 'function') showToast(`[GYM] Workout Day ${completedDay} completed!`);
            return true;
        }
        return false;
    }

    if (cmd === 'summon' || cmd === 'view' || cmd === 'show' || cmd === 'open') {
        const modKey = rest.toLowerCase();
        if (dashboardModules[modKey]) {
            summonModule(modKey);
            if (typeof showToast === 'function') showToast(`[WORKSPACE] Summoned ${dashboardModules[modKey].name}`);
            return true;
        }
        return false;
    }

    if (cmd === 'swap') {
        if (activeSlots.length >= 2) {
            const temp = activeSlots[0];
            activeSlots[0] = activeSlots[1];
            activeSlots[1] = temp;
            renderQuadrantLayout();
            if (typeof showToast === 'function') showToast(`[WORKSPACE] Swapped quadrants`);
            return true;
        }
        return false;
    }

    if (cmd === 'goto') {
        const resolved = resolveDateToken(rest);
        if (!resolved) return false;
        jumpToDate(resolved);
        if (typeof showToast === 'function') showToast(`[CALENDAR] Selected ${resolved}`);
        return true;
    }

    if (cmd === 'export' || cmd === 'backup') {
        exportData();
        if (typeof showToast === 'function') showToast(`[SYSTEM] Backup exported`);
        return true;
    }

    return false;
}