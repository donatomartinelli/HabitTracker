// --- js/core/dsl.js ---
// Motore DSL 100% Locale: Azioni, University Bridge (uni, esame, tassa, appello), Ispezione Istantanea & Autocompletamento

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

// ============================================================================
// CATALOGO COMANDI DSL & AUTOCOMPLETAMENTO CONTESTUALE LIVE
// ============================================================================

const DSL_COMMAND_SPECS = [
    { verb: 'uni', syntax: 'uni [roadmap|lectures|appeals|libretto|info]', fill: 'uni', desc: 'Summon University module or switch its internal sub-modules' },
    { verb: 'esame', syntax: 'esame [Nome] [Voto 18-30L] [CFU]', fill: 'esame ', desc: 'Record passed exam in Libretto & archive its study tasks' },
    { verb: 'tassa', syntax: 'tassa [Importo] [YYYY-MM-DD] [Nome]', fill: 'tassa ', desc: 'Add University tax (Red Calendar event + Tasse Uni category)' },
    { verb: 'appello', syntax: 'appello [Nome] [YYYY-MM-DD] [HH:MM]', fill: 'appello ', desc: 'Schedule exam appeal date on Calendar & Planner' },
    { verb: 'out', syntax: 'out [€] #[Vault/Cat] [desc]', fill: 'out ', desc: 'Log expense (auto-deducts from matching Vault)' },
    { verb: 'in', syntax: 'in [€] [desc]', fill: 'in ', desc: 'Log income (+€ and trigger % Vault rules)' },
    { verb: 'wish', syntax: 'wish [item] [optional €]', fill: 'wish ', desc: 'Add item to Purchase Ideas Incubator' },
    { verb: 'done', syntax: 'done [task title]', fill: 'done ', desc: 'Check off completed task for selected date' },
    { verb: 'focus', syntax: 'focus [task/cat]', fill: 'focus ', desc: 'Start Pomodoro timer linked to task' },
    { verb: 'task', syntax: 'task [title] [@oggi|@domani]', fill: 'task ', desc: 'Schedule a flexible task on a date' },
    { verb: 'todo', syntax: 'todo [text]', fill: 'todo ', desc: 'Add quick item to General To-Do Inbox' },
    { verb: 'event', syntax: 'event [@date] [title]', fill: 'event @domani ', desc: 'Create calendar event on date' },
    { verb: 'note', syntax: 'note [Category]: [text]', fill: 'note ', desc: 'Append note to existing or new category' },
    { verb: 'weight', syntax: 'weight [kg] [optional note]', fill: 'weight ', desc: 'Log body weight in kg' },
    { verb: 'gym', syntax: 'gym [info | done]', fill: 'gym', desc: 'Show active workout split or type "gym done" to complete' },
    { verb: 'diet', syntax: 'diet [@oggi | @domani]', fill: 'diet', desc: 'Show instant meal plan & auto-macros summary' },
    { verb: 'today', syntax: 'today', fill: 'today', desc: 'Show instant summary of today\'s tasks & schedule' },
    { verb: 'tomorrow', syntax: 'tomorrow', fill: 'tomorrow', desc: 'Show instant summary of tomorrow\'s tasks & schedule' },
    { verb: 'bal', syntax: 'bal', fill: 'bal', desc: 'Show instant Spendable Balance, Vaults & Cashflow' },
    { verb: 'summon', syntax: 'summon [module]', fill: 'summon ', desc: 'Mount module into workspace tiling layout' },
    { verb: 'plan', syntax: 'plan', fill: 'plan', desc: 'Open Evening Builder (Plan Tomorrow 1-Day Timeline)' },
    { verb: 'ledger', syntax: 'ledger', fill: 'ledger', desc: 'Open Consistency Grid & Real Focus Hours Ledger' },
    { verb: 'vault', syntax: 'vault', fill: 'vault', desc: 'Open modal to create a new Salvadanaio' },
    { verb: 'food', syntax: 'food', fill: 'food', desc: 'Open Nutritional Database (Kcal & Macros/100g)' },
    { verb: 'red', syntax: 'red [on|off]', fill: 'red', desc: 'Toggle Red Gelatin optical filter' },
    { verb: 'zero', syntax: 'zero', fill: 'zero', desc: 'Switch workspace to Zero-UI Mode (0 quadrants)' },
    { verb: 'swap', syntax: 'swap', fill: 'swap', desc: 'Swap primary tiling quadrants' },
    { verb: 'goto', syntax: 'goto [@oggi|@domani|YYYY-MM-DD]', fill: 'goto ', desc: 'Jump calendar to target date' },
    { verb: 'settings', syntax: 'settings', fill: 'settings', desc: 'Open System Settings & Workspace Control' },
    { verb: 'export', syntax: 'export', fill: 'export', desc: 'Download full JSON database backup' },
    { verb: '?', syntax: '? / help', fill: '?', desc: 'Open full Cortex DSL Manual & Shortcuts' }
];

function getContextualSuggestions(rawInput) {
    const val = (rawInput || '');
    const trimmed = val.trimStart();
    if (!trimmed) return [];

    const segments = val.split(';');
    const prefixBeforeLast = segments.length > 1 ? segments.slice(0, -1).join(';') + '; ' : '';
    const activeSeg = segments[segments.length - 1].trimStart();
    if (!activeSeg) return [];

    const parts = activeSeg.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const hasSpaceAfterCmd = activeSeg.length > parts[0].length;
    const rest = activeSeg.slice(parts[0].length).trimStart();

    if (!hasSpaceAfterCmd) {
        return DSL_COMMAND_SPECS
            .filter(s => s.verb.startsWith(cmd) || s.syntax.toLowerCase().startsWith(cmd))
            .slice(0, 8)
            .map(s => ({
                display: s.syntax,
                desc: s.desc,
                fillValue: prefixBeforeLast + s.fill
            }));
    }

    // Autocompletamento per `uni ` -> Sotto-moduli e viste di #module-uni
    if (cmd === 'uni') {
        const subOpts = [
            { display: 'uni', desc: 'Summon University module', fillValue: `${prefixBeforeLast}uni` },
            { display: 'uni info', desc: 'Instant Career & Exams snapshot in bar', fillValue: `${prefixBeforeLast}uni info` },
            { display: 'uni roadmap', desc: 'Open Roadmap & Study Phases sub-module', fillValue: `${prefixBeforeLast}uni roadmap` },
            { display: 'uni lectures', desc: 'Open Orario Lezioni sub-module', fillValue: `${prefixBeforeLast}uni lectures` },
            { display: 'uni appeals', desc: 'Open Appelli & Tasse sub-module', fillValue: `${prefixBeforeLast}uni appeals` },
            { display: 'uni libretto', desc: 'Open Libretto (180 CFU) sub-module', fillValue: `${prefixBeforeLast}uni libretto` }
        ];
        const q = rest.toLowerCase();
        return subOpts.filter(o => !q || o.display.toLowerCase().includes(q));
    }

    // Autocompletamento per `esame ` o `appello ` -> Pesca dai corsi rimasti in Roadmap
    if (cmd === 'esame' || cmd === 'appello') {
        const q = rest.toLowerCase();
        const remCourses = (typeof uniData !== 'undefined' && uniData.remainingExams) ? uniData.remainingExams : [];
        return remCourses
            .filter(c => !q || c.name.toLowerCase().includes(q))
            .map(c => ({
                display: cmd === 'esame' ? `esame ${c.name} [Voto] ${c.cfu}` : `appello ${c.name} ${todayStr} 09:00`,
                desc: `${c.name} (${c.cfu} CFU · Anno ${c.year || 1})`,
                fillValue: `${prefixBeforeLast}${cmd} ${c.name} `
            }));
    }

    // Autocompletamento per `done ` e `focus `
    if (cmd === 'done' || cmd === 'check' || cmd === 'focus' || cmd === 'pomo') {
        const q = rest.toLowerCase();
        const isFocus = (cmd === 'focus' || cmd === 'pomo');
        const activeToday = templates.filter(t => isTaskActiveOnDate(t, selectedDateStr));

        return activeToday
            .filter(t => {
                if (isFocus && (typeof getTaskDurationMinutes === 'function' ? getTaskDurationMinutes(t, selectedDateStr) <= 0 : t.noTimer)) {
                    return false;
                }
                return !q || t.title.toLowerCase().includes(q) || t.category.toLowerCase().includes(q);
            })
            .slice(0, 8)
            .map(t => {
                const curLog = (logs[selectedDateStr] && logs[selectedDateStr][t.id]) || Array(t.instances || 1).fill(false);
                const doneCount = curLog.filter(Boolean).length;
                const mins = typeof getTaskDurationMinutes === 'function' ? getTaskDurationMinutes(t, selectedDateStr) : (t.timerMinutes || 0);
                return {
                    display: `${cmd} ${t.title}`,
                    desc: `[${t.category}] ${mins > 0 ? mins + 'm · ' : ''}${doneCount}/${t.instances || 1} done`,
                    fillValue: `${prefixBeforeLast}${cmd} ${t.title}`
                };
            });
    }

    // Autocompletamento per `out` / `-` -> Vaults & Categorie (inclusa #Tasse Uni)
    if (cmd === 'out' || cmd === '-') {
        const hashMatch = activeSeg.match(/^(.*?\s+)#([a-zA-Z0-9_À-ÿ]*)$/);
        if (hashMatch) {
            const beforeHash = hashMatch[1];
            const tagQuery = (hashMatch[2] || '').toLowerCase();
            const results = [];

            mVaults.forEach(v => {
                if (!tagQuery || v.name.toLowerCase().includes(tagQuery)) {
                    results.push({
                        display: `#${v.name}`,
                        desc: `VAULT (Balance: €${roundCurrency(v.balance).toFixed(2)})`,
                        fillValue: `${prefixBeforeLast}${beforeHash}#${v.name} `
                    });
                }
            });

            mCategories.forEach(c => {
                if (!mVaults.some(v => v.name.toLowerCase() === c.toLowerCase())) {
                    if (!tagQuery || c.toLowerCase().includes(tagQuery)) {
                        results.push({
                            display: `#${c}`,
                            desc: `EXPENSE CATEGORY`,
                            fillValue: `${prefixBeforeLast}${beforeHash}#${c} `
                        });
                    }
                }
            });

            return results.slice(0, 8);
        }

        const amtOnlyMatch = rest.match(/^(\d+(?:[.,]\d+)?)\s*$/);
        if (amtOnlyMatch && activeSeg.endsWith(' ')) {
            const amtStr = amtOnlyMatch[1];
            const results = [];
            mVaults.forEach(v => {
                results.push({
                    display: `${cmd} ${amtStr} #${v.name}`,
                    desc: `Deduct from Vault "${v.name}" (€${roundCurrency(v.balance).toFixed(2)})`,
                    fillValue: `${prefixBeforeLast}${cmd} ${amtStr} #${v.name} `
                });
            });
            mCategories.slice(0, 6).forEach(c => {
                if (!mVaults.some(v => v.name.toLowerCase() === c.toLowerCase())) {
                    results.push({
                        display: `${cmd} ${amtStr} #${c}`,
                        desc: `Log in category "${c}"`,
                        fillValue: `${prefixBeforeLast}${cmd} ${amtStr} #${c} `
                    });
                }
            });
            return results.slice(0, 8);
        }
    }

    if (cmd === 'note') {
        if (!rest.includes(':')) {
            const q = rest.toLowerCase();
            return noteCategories
                .filter(c => !q || c.toLowerCase().includes(q))
                .slice(0, 8)
                .map(c => ({
                    display: `note ${c}: [text]`,
                    desc: `Append note to [${c}]`,
                    fillValue: `${prefixBeforeLast}note ${c}: `
                }));
        }
        return [];
    }

    if (cmd === 'summon' || cmd === 'view' || cmd === 'show' || cmd === 'open') {
        const q = rest.toLowerCase();
        return Object.keys(dashboardModules)
            .filter(k => !q || k.includes(q) || dashboardModules[k].name.toLowerCase().includes(q))
            .map(k => ({
                display: `${cmd} ${k}`,
                desc: `Mount module [${dashboardModules[k].name}]`,
                fillValue: `${prefixBeforeLast}${cmd} ${k}`
            }));
    }

    if (cmd === 'gym') {
        return [
            { display: 'gym', desc: `Inspect active Workout Split (Day ${nextWorkoutDay}) & weights`, fillValue: `${prefixBeforeLast}gym` },
            { display: 'gym done', desc: `Complete Day ${nextWorkoutDay} workout & advance split`, fillValue: `${prefixBeforeLast}gym done` }
        ];
    }

    if (cmd === 'diet') {
        return [
            { display: 'diet @oggi', desc: `Show today's meals & macros (${todayStr})`, fillValue: `${prefixBeforeLast}diet @oggi` },
            { display: 'diet @domani', desc: `Show tomorrow's meals & macros (${tomorrowStr})`, fillValue: `${prefixBeforeLast}diet @domani` }
        ];
    }

    if (cmd === 'task' || cmd === 'event' || cmd === 'goto') {
        const atMatch = activeSeg.match(/^(.*?\s*)@([a-zA-Z0-9-]*)$/);
        if (atMatch) {
            const beforeAt = atMatch[1];
            const atQuery = (atMatch[2] || '').toLowerCase();
            const dateTokens = [
                { tok: '@oggi', desc: `Today (${todayStr})` },
                { tok: '@domani', desc: `Tomorrow (${tomorrowStr})` },
                { tok: '@ieri', desc: 'Yesterday' }
            ];
            return dateTokens
                .filter(d => !atQuery || d.tok.slice(1).startsWith(atQuery))
                .map(d => ({
                    display: d.tok,
                    desc: d.desc,
                    fillValue: `${prefixBeforeLast}${beforeAt}${d.tok} `
                }));
        }
    }

    return [];
}

// ============================================================================
// ANTEPRIMA LIVE DEL COMANDO (getCommandPreview)
// ============================================================================

function getCommandPreview(raw) {
    const str = (raw || '').trim();
    if (!str) return 'Type a DSL command (? for manual · Shift+Enter to stage)';
    if (str.includes(';')) {
        const count = str.split(';').map(s => s.trim()).filter(Boolean).length;
        return `[MULTI-COMMAND] Press Enter to stage ${count} commands into queue`;
    }
    if (str === '?' || str.toLowerCase() === 'help') return 'Open Cortex DSL Manual & Shortcuts';

    const parts = str.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const rest = str.slice(parts[0].length).trim();

    switch (cmd) {
        case 'uni':
            if (rest.toLowerCase() === 'info') return `[INSPECT UNI] Show instant Career Averages, CFU & Appeals summary`;
            return `[UNIVERSITY] Summon #module-uni ${rest ? '(Sub-module: ' + rest.toUpperCase() + ')' : ''}`;
        case 'esame':
            if (!rest) return 'Syntax: esame [Nome] [Voto 18-30L] [CFU] (e.g. esame Algebra 28 9)';
            return `[UNI -> LIBRETTO] Record passed exam (${rest}), update averages & archive study tasks`;
        case 'tassa':
            if (!rest) return 'Syntax: tassa [Importo] [YYYY-MM-DD] [Nome] (e.g. tassa 350 2026-11-30 Prima Rata)';
            return `[UNI -> TAX & CALENDAR] Create Red Deadline Event + log in "Tasse Uni": ${rest}`;
        case 'appello':
            if (!rest) return 'Syntax: appello [Nome] [YYYY-MM-DD] [HH:MM] (e.g. appello Analisi 2026-12-15 09:00)';
            return `[UNI -> CALENDAR] Schedule exam appeal & countdown: ${rest}`;
        case 'diet': {
            const targetDate = resolveDateToken(rest) || selectedDateStr;
            return `[INSPECT DIET] Show meals & macros for ${targetDate === tomorrowStr ? 'TOMORROW' : targetDate}`;
        }
        case 'gym':
            if (rest.toLowerCase() === 'done') {
                return `[GYM ACTION] Complete active workout (Day ${nextWorkoutDay}) & advance split`;
            }
            return `[INSPECT GYM] Show active Workout Split (Day ${nextWorkoutDay}) & last weights`;
        case 'today':
        case 'oggi':
            return `[INSPECT SCHEDULE] Show tasks, schedule & events for TODAY (${todayStr})`;
        case 'tomorrow':
        case 'domani':
        case 'schedule':
            return `[INSPECT SCHEDULE] Show tasks, schedule & events for TOMORROW (${tomorrowStr})`;
        case 'bal':
        case 'money':
        case 'balance':
            return `[INSPECT MONEY] Show Spendable Balance, Vaults & Monthly Cashflow`;
        case 'red':
        case 'redmode':
            return `[VISUAL] Toggle Red Gelatin Mode (${rest || 'toggle'})`;
        case 'zero':
            return `[WORKSPACE] Switch to Zero-UI Mode (0 quadrants)`;
        case 'plan':
            return `[EVENING BUILDER] Open 1-Day Timeline (06:30–24:00) for tomorrow`;
        case 'ledger':
        case 'stats':
            return `[FOCUS LEDGER] Summon Consistency Grid & Real Focus Hours breakdown`;
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
            return `[MONEY] Open modal to create a new Salvadanaio with monthly renewal day`;
        case 'out':
        case '-': {
            const m = rest.match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
            if (!m) return 'Syntax: out [amount] #[vault/category] [desc] (e.g. out 20 #Amazon Cavo)';
            const amt = parseFloat(m[1].replace(',', '.'));
            const tail = m[2] || '';
            const catMatch = tail.match(/#([a-zA-Z0-9_À-ÿ]+)/);
            const cat = catMatch ? catMatch[1] : 'Generale';
            const cleanDesc = tail.replace(/#[a-zA-Z0-9_À-ÿ]+/, '').trim();
            const matchedV = typeof findMatchingVaultForExpense === 'function' ? findMatchingVaultForExpense(cat, cleanDesc || tail) : null;
            if (matchedV) {
                const proj = roundCurrency((parseFloat(matchedV.balance) || 0) - amt);
                return `[MONEY -> VAULT ${matchedV.name.toUpperCase()}] Deduct €${amt.toFixed(2)} (Vault becomes €${proj.toFixed(2)})`;
            }
            return `[MONEY] Subtract €${amt.toFixed(2)} [${cat}] — "${cleanDesc || tail || 'Expense'}"`;
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
            return `[MONEY] Add "${rest}" to Purchase Ideas Incubator`;
        }
        case 'todo': {
            if (!rest) return 'Syntax: todo [task title]';
            return `[TASKS] Add "${rest}" to General To-Do Inbox`;
        }
        case 'task': {
            if (!rest) return 'Syntax: task [title] [@oggi | @domani | @YYYY-MM-DD]';
            return `[TASKS] Schedule flexible task: ${rest}`;
        }
        case 'done':
        case 'check': {
            if (!rest) return 'Syntax: done [task title] (checks off matching task today)';
            return `[TASKS] Check off task matching "${rest}"`;
        }
        case 'event': {
            if (!rest) return 'Syntax: event [@date] [title]';
            return `[CALENDAR] Create single event: ${rest}`;
        }
        case 'note': {
            if (!rest) return 'Syntax: note [Category]: [text]';
            return `[NOTES] Append note: ${rest}`;
        }
        case 'focus':
        case 'pomo': {
            if (!rest) return 'Syntax: focus [task title or category] (e.g. focus Duolingo)';
            const numMatch = rest.match(/^(\d+)\s+(.+)$/);
            const queryPart = numMatch ? numMatch[2].trim() : rest;
            const matched = typeof findMatchingTaskForFocus === 'function' ? findMatchingTaskForFocus(queryPart) : null;
            if (matched) {
                const dur = (numMatch ? parseInt(numMatch[1], 10) : null) || getTaskDurationMinutes(matched, selectedDateStr);
                return `[FOCUS] Start ${dur}m session on "${matched.title}" [${matched.category}]`;
            }
            return `[FOCUS] No active timed task matching "${queryPart}"`;
        }
        case 'workout':
            return `[GYM] Complete active workout (Day ${nextWorkoutDay}) and advance`;
        case 'summon':
        case 'view':
        case 'show':
        case 'open': {
            const modKey = rest.toLowerCase();
            return dashboardModules[modKey] ? `[WORKSPACE] Summon module "${dashboardModules[modKey].name}"` : `[WORKSPACE] Specify: calendar, tasks, notes, planner, diet, gym, money, streak, uni`;
        }
        case 'swap':
            return `[WORKSPACE] Swap primary tiling quadrants`;
        case 'settings':
        case 'cfg':
            return `[SYSTEM] Open Settings & Workspace Control Panel`;
        case 'goto':
            return `[CALENDAR] Jump to date (${resolveDateToken(rest) || 'specify @oggi, @domani or YYYY-MM-DD'})`;
        case 'export':
        case 'backup':
            return `[SYSTEM] Export complete JSON backup file`;
        default:
            return `Unknown DSL command "${cmd}". Press [?] for full command manual.`;
    }
}

// ============================================================================
// RIEPILOGHI ISTANTANEI IN SOLA LETTURA (0ms LOCAL RENDERING)
// ============================================================================

function showInstantInspectionCard(titleHtml, bodyHtml) {
    const answerBox = document.getElementById('terminal-ai-answer');
    if (!answerBox) return;
    answerBox.style.display = 'block';
    answerBox.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:var(--font-xs); color:var(--text-dim); margin-bottom:8px; border-bottom:1px solid var(--border-color); padding-bottom:4px; text-transform:uppercase;">
            <span>${titleHtml}</span>
            <span>[ESC TO CLOSE]</span>
        </div>
        <div style="display:flex; flex-direction:column; gap:6px;">${bodyHtml}</div>
    `;
}

function renderInstantUniSummary() {
    const st = typeof calculateUniStats === 'function' ? calculateUniStats() : { weightedMean: 0, arithmeticMean: 0, base110: 0, totalCfu: 0, targetCfu: 180 };
    const rem = (uniData && uniData.remainingExams) ? uniData.remainingExams : [];
    const apps = (uniData && uniData.appeals) ? uniData.appeals : [];

    let html = `
        <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:6px; font-size:var(--font-xs); text-align:center;">
            <div style="padding:6px; border:1px solid var(--border-bright);">
                <div style="color:var(--text-dim);">WEIGHTED</div>
                <strong style="font-size:var(--font-md); color:var(--accent-green);">${st.weightedMean.toFixed(2)}</strong>
            </div>
            <div style="padding:6px; border:1px solid var(--border-color);">
                <div style="color:var(--text-dim);">ARITHMETIC</div>
                <strong style="font-size:var(--font-md);">${st.arithmeticMean.toFixed(2)}</strong>
            </div>
            <div style="padding:6px; border:1px solid var(--border-color);">
                <div style="color:var(--text-dim);">BASE /110</div>
                <strong style="font-size:var(--font-md); color:var(--accent-gold);">${st.base110.toFixed(1)}</strong>
            </div>
            <div style="padding:6px; border:1px solid var(--border-color);">
                <div style="color:var(--text-dim);">CFU</div>
                <strong style="font-size:var(--font-md);">${st.totalCfu}/${st.targetCfu}</strong>
            </div>
        </div>
    `;

    if (rem.length > 0) {
        html += `<div style="font-size:var(--font-xs); color:var(--text-dim); margin-top:4px;">ACTIVE COURSES IN ROADMAP:</div>`;
        rem.forEach(c => {
            const hrs = typeof getExamStudiedHours === 'function' ? getExamStudiedHours(c.id, c.name) : 0;
            html += `<div style="display:flex; justify-content:space-between; font-size:var(--font-xs); padding:4px 8px; border:1px solid var(--border-color);">
                <span><strong>${escapeHtml(c.name)}</strong> (${c.cfu} CFU) — Phase: ${escapeHtml(c.prepPhase.toUpperCase())}</span>
                <strong>${hrs.toFixed(1)}h studied</strong>
            </div>`;
        });
    }

    if (apps.length > 0) {
        html += `<div style="font-size:var(--font-xs); color:var(--text-dim); margin-top:4px;">UPCOMING APPEALS:</div>`;
        apps.slice(0, 4).forEach(a => {
            html += `<div style="display:flex; justify-content:space-between; font-size:var(--font-xs); padding:4px 8px; border-left:2px solid var(--accent-gold); background:rgba(255,255,255,0.02);">
                <strong>${escapeHtml(a.examName)}</strong>
                <span>${escapeHtml(a.date)} (${escapeHtml(a.time)})</span>
            </div>`;
        });
    }

    showInstantInspectionCard('UNIVERSITY SNAPSHOT // 180 CFU', html);
}

function renderInstantDietSummary(targetDateStr) {
    const dObj = new Date(targetDateStr);
    const dayIdx = dObj.getDay();
    const dayNames = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
    const totals = typeof calculateDayMacros === 'function' ? calculateDayMacros(dayIdx) : { kcal: 0, p: 0, c: 0, f: 0 };

    let rowsHtml = '';
    dietData.forEach(row => {
        const food = (row[dayIdx] || '—').replace(/\n/g, ' + ');
        rowsHtml += `
            <div style="display:flex; justify-content:space-between; gap:12px; padding:4px 8px; background:rgba(255,255,255,0.02); border:1px solid var(--border-color); font-size:var(--font-xs);">
                <strong style="color:var(--text-dim); text-transform:uppercase; min-width:90px;">${escapeHtml(row.type)}</strong>
                <span style="color:var(--text-main); text-align:right;">${escapeHtml(food)}</span>
            </div>
        `;
    });

    rowsHtml += `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 8px; border:1px solid var(--border-bright); background:rgba(255,255,255,0.04); font-size:var(--font-xs); margin-top:2px;">
            <strong style="color:var(--text-main);">ESTIMATED DAILY MACROS</strong>
            <span style="color:var(--text-main); font-weight:bold;">${totals.kcal} KCAL &nbsp;|&nbsp; P: ${totals.p}g · C: ${totals.c}g · F: ${totals.f}g</span>
        </div>
        <div style="font-size:0.68rem; color:var(--text-dim); padding:2px 4px;">${escapeHtml(dietRules)}</div>
    `;

    showInstantInspectionCard(`DIET & MACROS // ${dayNames[dayIdx]} (${targetDateStr})`, rowsHtml);
}

function renderInstantGymSummary() {
    const activeDay = nextWorkoutDay;
    const list = gymPlan[activeDay] || [];

    let rowsHtml = '';
    if (list.length === 0) {
        rowsHtml = `<div class="empty-state">[ NO EXERCISES IN DAY ${activeDay} ]</div>`;
    } else {
        list.forEach(ex => {
            const weights = [];
            for (let i = 0; i < (ex.sets || 0); i++) {
                const w = savedGymWeights[`gw_${ex.id}_${i}`];
                if (w) weights.push(`${w}kg`);
            }
            const weightBadge = weights.length > 0 ? weights.join(' · ') : (ex.sets > 0 ? 'No weights logged' : 'Bodyweight');
            const meta = typeof resolveGymSchemeMeta === 'function' ? resolveGymSchemeMeta(ex.repStr) : { isProg: false };
            const progTag = meta.isProg ? ` [ORA: ${ex.sets}x${ex.currentReps || 5}]` : '';

            rowsHtml += `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:4px 8px; background:rgba(255,255,255,0.02); border:1px solid var(--border-color); font-size:var(--font-xs);">
                    <div>
                        <strong style="color:var(--text-main);">${escapeHtml(ex.name)}</strong>
                        <span style="color:var(--text-dim); margin-left:6px;">(${escapeHtml(ex.repStr + progTag)})</span>
                    </div>
                    <span style="color:var(--text-muted); font-variant-numeric:tabular-nums;">${escapeHtml(weightBadge)}</span>
                </div>
            `;
        });
    }

    rowsHtml += `<div style="font-size:0.68rem; color:var(--text-dim); margin-top:2px;">Type <strong style="color:var(--text-main);">gym done</strong> to review weights/reps &amp; complete Day ${activeDay}.</div>`;
    showInstantInspectionCard(`ACTIVE WORKOUT SPLIT // DAY ${activeDay}`, rowsHtml);
}

function renderInstantScheduleSummary(targetDateStr) {
    const dayIdx = new Date(targetDateStr).getDay();
    const prio = dailyPriorities[targetDateStr] || '';
    const activeTasks = templates.filter(t => isTaskActiveOnDate(t, targetDateStr));
    const dayEvents = specificEvents.filter(e => e.date === targetDateStr);
    const customBlocks = Array.isArray(ephemeralData[targetDateStr]) ? ephemeralData[targetDateStr] : [];

    let html = '';
    if (prio) {
        html += `<div style="padding:5px 8px; border-left:3px solid var(--text-main); background:rgba(255,255,255,0.04); font-size:var(--font-xs);"><strong>#1 PRIORITY:</strong> ${escapeHtml(prio)}</div>`;
    }

    dayEvents.forEach(ev => {
        const tBadge = (ev.start && ev.end) ? `[${ev.start}-${ev.end}] ` : '[EVENT] ';
        html += `<div style="padding:4px 8px; border-left:3px solid ${ev.color || 'var(--accent-red)'}; background:rgba(255,255,255,0.02); font-size:var(--font-xs); color:var(--text-main);"><strong>${escapeHtml(tBadge + ev.title)}</strong></div>`;
    });

    if (activeTasks.length === 0 && dayEvents.length === 0) {
        html += `<div class="empty-state" style="padding:4px 0;">[ NO TASKS OR EVENTS FOR ${targetDateStr} ]</div>`;
    } else {
        activeTasks.forEach(t => {
            const curLog = (logs[targetDateStr] && logs[targetDateStr][t.id]) || Array(t.instances || 1).fill(false);
            const doneCount = curLog.filter(Boolean).length;
            const totalCount = t.instances || 1;
            const isAllDone = doneCount >= totalCount;

            let schedStr = 'FLEX';
            const customTimes = customBlocks.filter(b => b.templateId === t.id).map(b => `${b.start}-${b.end}`);
            if (customTimes.length > 0) {
                schedStr = customTimes.join(', ');
            } else if (t.timeWindows && t.timeWindows.length > 0) {
                const tws = t.timeWindows.filter(w => w.days && w.days.includes(dayIdx));
                if (tws.length > 0) schedStr = tws.map(w => `${w.start}-${w.end}`).join(', ');
            }

            html += `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:4px 8px; background:rgba(255,255,255,0.02); border:1px solid var(--border-color); font-size:var(--font-xs); opacity:${isAllDone ? '0.45' : '1'};">
                    <div>
                        <span style="color:var(--text-dim); margin-right:6px;">[${escapeHtml(schedStr)}]</span>
                        <strong style="color:var(--text-main);">${escapeHtml(t.title)}</strong>
                        <span style="color:var(--text-dim); margin-left:6px;">(${escapeHtml(t.category)})</span>
                    </div>
                    <span style="color:${isAllDone ? 'var(--accent-green)' : 'var(--text-muted)'}; font-weight:bold;">[${doneCount}/${totalCount}]</span>
                </div>
            `;
        });
    }

    showInstantInspectionCard(`SCHEDULE OVERVIEW // ${targetDateStr}`, html);
}

function renderInstantMoneySummary() {
    const metrics = typeof getMoneyAllocationMetrics === 'function'
        ? getMoneyAllocationMetrics()
        : { total: mBalance, spendable: mBalance, vaulted: 0, pendingBills: 0, monthIn: 0, monthOut: 0, monthNet: 0 };

    let html = `
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; font-size:var(--font-xs);">
            <div style="padding:8px 10px; border:1px solid var(--border-bright); background:rgba(255,255,255,0.03);">
                <div style="color:var(--text-dim);">SPENDABLE (FREE)</div>
                <div style="font-size:var(--font-lg); font-weight:bold; color:${metrics.spendable < 0 ? 'var(--accent-red)' : 'var(--accent-green)'}; margin-top:2px;">€${metrics.spendable.toFixed(2)}</div>
            </div>
            <div style="padding:8px 10px; border:1px solid var(--border-color); background:rgba(255,255,255,0.02);">
                <div style="color:var(--text-dim);">TOTAL ACCOUNT BALANCE</div>
                <div style="font-size:var(--font-lg); font-weight:bold; color:var(--text-main); margin-top:2px;">€${metrics.total.toFixed(2)}</div>
            </div>
        </div>
        <div style="display:flex; justify-content:space-between; padding:5px 8px; border:1px solid var(--border-color); font-size:var(--font-xs); color:var(--text-muted);">
            <span>LOCKED IN VAULTS: <strong>€${metrics.vaulted.toFixed(2)}</strong></span>
            <span>PENDING BILLS: <strong>€${metrics.pendingBills.toFixed(2)}</strong></span>
            <span>MONTH NET: <strong>${metrics.monthNet >= 0 ? '+' : ''}€${metrics.monthNet.toFixed(2)}</strong></span>
        </div>
    `;

    if (mVaults.length > 0) {
        html += `<div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:2px;">`;
        mVaults.forEach(v => {
            const bal = roundCurrency(v.balance);
            html += `<span style="font-size:var(--font-xs); padding:3px 8px; border:1px solid ${bal < 0 ? 'var(--accent-red)' : 'var(--border-color)'}; background:rgba(255,255,255,0.02);">${escapeHtml(v.name)}: <strong style="color:${bal < 0 ? 'var(--accent-red)' : 'var(--text-main)'};">€${bal.toFixed(2)}</strong></span>`;
        });
        html += `</div>`;
    }

    showInstantInspectionCard(`FINANCE & VAULTS SNAPSHOT`, html);
}

function isInspectionOnlyCommand(raw) {
    const parts = (raw || '').trim().split(/\s+/);
    const cmd = (parts[0] || '').toLowerCase();
    const rest = (parts[1] || '').toLowerCase();
    if (cmd === 'diet' || cmd === 'today' || cmd === 'oggi' || cmd === 'tomorrow' || cmd === 'domani' || cmd === 'schedule' || cmd === 'bal' || cmd === 'money' || cmd === 'balance') {
        return true;
    }
    if (cmd === 'gym' && rest !== 'done') return true;
    if (cmd === 'uni' && rest === 'info') return true;
    return false;
}

// ============================================================================
// ESECUZIONE COMANDO DSL (executeTerminalCommand)
// ============================================================================

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

    // --- COMANDI MODULO UNIVERSITY (uni, esame, tassa, appello) ---
    if (cmd === 'uni') {
        const subArg = rest.toLowerCase();
        if (subArg === 'info') {
            renderInstantUniSummary();
            return true;
        }
        if (typeof UNI_SUBMODULES !== 'undefined' && UNI_SUBMODULES[subArg]) {
            uniData.activeSubModules = [subArg];
            saveUniData();
        }
        if (typeof summonModule === 'function') {
            summonModule('uni');
            if (typeof renderUniDashboard === 'function') renderUniDashboard();
            if (typeof showToast === 'function') showToast('[WORKSPACE] Summoned University');
            return true;
        }
        return false;
    }

    if (cmd === 'esame') {
        // Supporta: esame [Nome anche multi-parola] [Voto es. 28 o 30L] [CFU opzionale]
        const m = rest.match(/^(.*?)\s+(\d{2}[lL]?)(?:\s+(\d+))?$/);
        if (!m || !m[1].trim()) return false;
        const examName = m[1].trim();
        const gradeStr = m[2].trim();
        const cfuVal = m[3] ? parseInt(m[3], 10) : null;
        if (typeof recordPassedExam === 'function') {
            return recordPassedExam(examName, gradeStr, cfuVal, todayStr);
        }
        return false;
    }

    if (cmd === 'workout' || (cmd === 'gym' && rest.toLowerCase() === 'done')) {
        if (typeof closeTerminal === 'function') closeTerminal();
        if (typeof openGymWorkoutReviewModal === 'function') {
            openGymWorkoutReviewModal(selectedDateStr, nextWorkoutDay);
            return true;
        }
        return false;
    }
    
    if (cmd === 'tassa') {
        // Supporta qualsiasi ordine di Importo, Data (@YYYY-MM-DD o YYYY-MM-DD) e Nome Tassa
        if (!rest) return false;
        let dateStr = null;
        let amountVal = null;
        const titleWords = [];

        rest.split(/\s+/).forEach(tok => {
            const maybeDate = resolveDateToken(tok);
            if (maybeDate && !dateStr) {
                dateStr = maybeDate;
            } else if (/^\d+(?:[.,]\d+)?$/.test(tok.replace('€', '')) && amountVal === null) {
                amountVal = parseFloat(tok.replace('€', '').replace(',', '.'));
            } else {
                titleWords.push(tok);
            }
        });

        if (amountVal === null || amountVal <= 0) return false;
        if (!dateStr) dateStr = todayStr;
        const taxTitle = titleWords.join(' ').trim() || 'Rata Universitaria';

        if (typeof addUniTax === 'function') {
            return addUniTax(taxTitle, amountVal, dateStr);
        }
        return false;
    }

    if (cmd === 'appello') {
        if (!rest) return false;
        let dateStr = null;
        let timeStr = '09:00';
        const nameWords = [];

        rest.split(/\s+/).forEach(tok => {
            const maybeDate = resolveDateToken(tok);
            if (maybeDate && !dateStr) {
                dateStr = maybeDate;
            } else if (/^\d{2}:\d{2}$/.test(tok)) {
                timeStr = tok;
            } else {
                nameWords.push(tok);
            }
        });

        const examName = nameWords.join(' ').trim();
        if (!examName || !dateStr) return false;
        if (typeof addUniAppeal === 'function') {
            const ok = addUniAppeal(examName, dateStr, timeStr);
            if (ok && typeof showToast === 'function') {
                showToast(`[APPELLO] "${examName}" fissato per il ${dateStr} (${timeStr})`);
            }
            return ok;
        }
        return false;
    }

    // --- COMANDI DI ISPEZIONE ISTANTANEA IN SOLA LETTURA (0ms) ---
    if (cmd === 'diet') {
        const targetDate = resolveDateToken(rest) || selectedDateStr;
        renderInstantDietSummary(targetDate);
        return true;
    }

    if (cmd === 'gym' && rest.toLowerCase() !== 'done') {
        renderInstantGymSummary();
        return true;
    }

    if (cmd === 'today' || cmd === 'oggi') {
        renderInstantScheduleSummary(todayStr);
        return true;
    }

    if (cmd === 'tomorrow' || cmd === 'domani' || cmd === 'schedule') {
        const targetDate = resolveDateToken(rest) || tomorrowStr;
        renderInstantScheduleSummary(targetDate);
        return true;
    }

    if (cmd === 'bal' || cmd === 'money' || cmd === 'balance') {
        renderInstantMoneySummary();
        return true;
    }

    // --- COMANDI DI AZIONE E SISTEMA ---
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

    if (cmd === 'settings' || cmd === 'cfg') {
        if (typeof closeTerminal === 'function') closeTerminal();
        if (typeof openSettingsModal === 'function') openSettingsModal();
        return true;
    }

    if (cmd === 'plan') {
        if (typeof closeTerminal === 'function') closeTerminal();
        if (typeof openPlanTomorrowModal === 'function') openPlanTomorrowModal();
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
            category = catMatch[1].charAt(0).toUpperCase() + catMatch[1].slice(1);
            rawDesc = rawDesc.replace(catMatch[0], '').trim();
        }

        const desc = rawDesc || category;
        if (typeof recordExpenseWithVaultCheck === 'function') {
            const res = recordExpenseWithVaultCheck({ amount: amt, category, desc, dateStr: todayStr });
            if (res && res.matchedVault) {
                if (typeof showToast === 'function') {
                    showToast(`[VAULT ${res.matchedVault.name.toUpperCase()}] -€${amt.toFixed(2)} (${desc}) -> Bal: €${res.newVaultBalance.toFixed(2)}`);
                }
                return true;
            }
        }
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
            category: catName, title: finalTitle, instances: 1, timerMinutes: 25, noTimer: false,
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
        const match = activeToday.find(t => t.title.toLowerCase() === q)
            || activeToday.find(t => t.title.toLowerCase().includes(q) || t.category.toLowerCase().includes(q));
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
        if (!rest) return false;
        const numMatch = rest.match(/^(\d+)\s+(.+)$/);
        if (numMatch) {
            const overrideMins = parseInt(numMatch[1], 10);
            const query = numMatch[2].trim();
            if (typeof startTaskFocusByQuery === 'function' && startTaskFocusByQuery(query, overrideMins)) {
                return true;
            }
        } else if (typeof startTaskFocusByQuery === 'function' && startTaskFocusByQuery(rest)) {
            return true;
        }
        if (typeof showToast === 'function') showToast(`[FOCUS] No active timed task matching "${rest}"`);
        return false;
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