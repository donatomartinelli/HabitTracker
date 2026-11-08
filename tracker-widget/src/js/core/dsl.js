// --- js/core/dsl.js ---
// Motore DSL 100% Locale + Riconoscimento Validità per Fallback AI + Event Parser Avanzato (Data, Orario/Durata, Colore)

let isRedMode = localStorage.getItem('tracker_red_mode') === 'true';

const EVENT_COLOR_MAP = {
    'red': '#b84b4b',
    'rosso': '#b84b4b',
    'green': '#5f7a61',
    'verde': '#5f7a61',
    'blue': '#4c5b73',
    'blu': '#4c5b73',
    'gold': '#b08d43',
    'yellow': '#b08d43',
    'giallo': '#b08d43',
    'oro': '#b08d43',
    'purple': '#725b7a',
    'viola': '#725b7a',
    'white': '#ffffff',
    'bianco': '#ffffff',
    'grey': '#6e7073',
    'gray': '#6e7073',
    'grigio': '#6e7073'
};

function resolveEventColorToken(tok) {
    if (!tok || !tok.startsWith('#')) return null;
    const clean = tok.slice(1).toLowerCase();
    if (EVENT_COLOR_MAP[clean]) return EVENT_COLOR_MAP[clean];
    if (/^[0-9a-f]{6}$/i.test(clean)) return `#${clean}`;
    return null;
}

// Parsa la stringa di argomenti del comando `event` estraendo data, start, end (da range o durata) e colore
function parseEventCommandArgs(restStr) {
    const tokens = (restStr || '').trim().split(/\s+/).filter(Boolean);
    let dateStr = selectedDateStr;
    let startTime = null;
    let endTime = null;
    let durationMins = null;
    let color = '#b84b4b';
    const titleWords = [];

    for (let i = 0; i < tokens.length; i++) {
        const tok = tokens[i];

        // 1. Data (@oggi, @domani, @YYYY-MM-DD, YYYY-MM-DD)
        const maybeDate = resolveDateToken(tok);
        if (maybeDate && (tok.startsWith('@') || /^\d{4}-\d{2}-\d{2}$/.test(tok))) {
            dateStr = maybeDate;
            continue;
        }

        // 2. Fascia oraria esplicita HH:MM-HH:MM
        const rangeMatch = tok.match(/^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/);
        if (rangeMatch && !startTime) {
            const padT = (s) => s.length === 4 ? '0' + s : s;
            startTime = padT(rangeMatch[1]);
            endTime = padT(rangeMatch[2]);
            continue;
        }

        // 3. Ora singola HH:MM
        const singleTimeMatch = tok.match(/^(\d{1,2}:\d{2})$/);
        if (singleTimeMatch && !startTime) {
            startTime = singleTimeMatch[1].length === 4 ? '0' + singleTimeMatch[1] : singleTimeMatch[1];
            continue;
        }
        if (singleTimeMatch && startTime && !endTime) {
            endTime = singleTimeMatch[1].length === 4 ? '0' + singleTimeMatch[1] : singleTimeMatch[1];
            continue;
        }

        // 4. Durata (es. 90m, 45min, 2h, 1.5h) subito dopo un'ora di inizio
        const durMatch = tok.match(/^(\d+(?:[.,]\d+)?)(m|min|mins|h|hr|hrs)$/i);
        if (durMatch && startTime && !endTime) {
            const val = parseFloat(durMatch[1].replace(',', '.'));
            const unit = durMatch[2].toLowerCase();
            durationMins = unit.startsWith('h') ? Math.round(val * 60) : Math.round(val);
            continue;
        }

        // 5. Colore (#red, #green, #blue, #gold, #purple, #white, #grey o #hex)
        const maybeColor = resolveEventColorToken(tok);
        if (maybeColor) {
            color = maybeColor;
            continue;
        }

        titleWords.push(tok);
    }

    if (startTime && !endTime) {
        const [sh, sm] = startTime.split(':').map(Number);
        const addMins = durationMins && durationMins > 0 ? durationMins : 60; // Default 60m se specificata solo l'ora di inizio
        const totalEnd = Math.min(23 * 60 + 59, (sh * 60 + (sm || 0)) + addMins);
        const eh = Math.floor(totalEnd / 60);
        const em = totalEnd % 60;
        endTime = `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
    }

    return {
        date: dateStr,
        start: startTime,
        end: endTime,
        color: color,
        title: titleWords.join(' ').trim()
    };
}

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
    const d = parseLocalDate(selectedDateStr);
    d.setDate(d.getDate() + daysOffset);
    jumpToDate(formatDate(d));
}

// ============================================================================
// CATALOGO COMANDI DSL & AUTOCOMPLETAMENTO CONTESTUALE LIVE
// ============================================================================

const DSL_COMMAND_SPECS = [
    { verb: 'hud', syntax: 'hud [on|off]', fill: 'hud', desc: 'Toggle Tactical HUD Pod (Shortcut: H)' },
    { verb: 'uni', syntax: 'uni [roadmap|lectures|appeals|libretto|info]', fill: 'uni', desc: 'Summon University module or switch sub-modules' },
    { verb: 'esame', syntax: 'esame [Nome] [Voto 18-30L] [CFU]', fill: 'esame ', desc: 'Record passed exam in Libretto & archive study tasks' },
    { verb: 'tassa', syntax: 'tassa [Importo] [YYYY-MM-DD] [Nome]', fill: 'tassa ', desc: 'Add University tax (Red Calendar event + Tasse Uni)' },
    { verb: 'appello', syntax: 'appello [Nome] [YYYY-MM-DD] [HH:MM]', fill: 'appello ', desc: 'Schedule exam appeal date on Calendar & Planner' },
    { verb: 'out', syntax: 'out [€] #[Vault/Cat] [desc]', fill: 'out ', desc: 'Log expense (auto-deducts from matching Vault)' },
    { verb: 'in', syntax: 'in [€] [desc]', fill: 'in ', desc: 'Log income (+€ and trigger % Vault rules)' },
    { verb: 'wish', syntax: 'wish [item] [optional €]', fill: 'wish ', desc: 'Add item to Purchase Ideas Incubator' },
    { verb: 'done', syntax: 'done [task title]', fill: 'done ', desc: 'Check off completed task for selected date' },
    { verb: 'focus', syntax: 'focus [task/cat]', fill: 'focus ', desc: 'Start Pomodoro timer linked to task' },
    { verb: 'task', syntax: 'task [title] [@oggi|@domani]', fill: 'task ', desc: 'Schedule a flexible task on a date' },
    { verb: 'todo', syntax: 'todo [text]', fill: 'todo ', desc: 'Add quick item to To-Do' },
    { verb: 'event', syntax: 'event [@date] [HH:MM-HH:MM | HH:MM 90m] [#color] [title]', fill: 'event @domani 15:00-16:00 #red ', desc: 'Create timed/colored event on Calendar & Planner' },
    { verb: 'note', syntax: 'note [Category]: [text]', fill: 'note ', desc: 'Append note to existing or new category' },
    { verb: 'weight', syntax: 'weight [kg] [optional note]', fill: 'weight ', desc: 'Log body weight in kg' },
    { verb: 'gym', syntax: 'gym [info | done]', fill: 'gym', desc: 'Show active workout split or complete' },
    { verb: 'diet', syntax: 'diet [@oggi | @domani]', fill: 'diet', desc: 'Show instant meal plan & auto-macros summary' },
    { verb: 'today', syntax: 'today', fill: 'today', desc: 'Show instant summary of today\'s tasks & schedule' },
    { verb: 'tomorrow', syntax: 'tomorrow', fill: 'tomorrow', desc: 'Show instant summary of tomorrow\'s tasks & schedule' },
    { verb: 'bal', syntax: 'bal', fill: 'bal', desc: 'Show instant Spendable Balance, Vaults & Cashflow' },
    { verb: 'summon', syntax: 'summon [module]', fill: 'summon ', desc: 'Mount module into workspace tiling layout' },
    { verb: 'plan', syntax: 'plan', fill: 'plan', desc: 'Open Day Planner Timeline' },
    { verb: 'ledger', syntax: 'ledger', fill: 'ledger', desc: 'Open Consistency Grid & Real Focus Hours Ledger' },
    { verb: 'vault', syntax: 'vault', fill: 'vault', desc: 'Open modal to create a new Vault' },
    { verb: 'food', syntax: 'food', fill: 'food', desc: 'Open Nutritional Database (Kcal & Macros/100g)' },
    { verb: 'red', syntax: 'red [on|off]', fill: 'red', desc: 'Toggle Red Gelatin optical filter' },
    { verb: 'zero', syntax: 'zero', fill: 'zero', desc: 'Switch workspace to Zero-UI Mode' },
    { verb: 'swap', syntax: 'swap', fill: 'swap', desc: 'Swap primary tiling quadrants' },
    { verb: 'goto', syntax: 'goto [@oggi|@domani|YYYY-MM-DD]', fill: 'goto ', desc: 'Jump calendar to target date' },
    { verb: 'settings', syntax: 'settings', fill: 'settings', desc: 'Open System Settings' },
    { verb: 'export', syntax: 'export', fill: 'export', desc: 'Download full JSON database backup' },
    { verb: '?', syntax: '? / help', fill: '?', desc: 'Open Cortex Manual' }
];

// Verifica se una stringa è un comando DSL deterministico valido (altrimenti passa al traduttore AI -> Staging)
function isValidDslCommand(raw) {
    const str = (raw || '').trim();
    if (!str) return false;
    if (str === '?' || str.toLowerCase() === 'help') return true;

    const lowerStr = str.toLowerCase();
    if (typeof customAliases !== 'undefined' && customAliases[lowerStr]) return true;
    if (typeof workspacePresets !== 'undefined' && workspacePresets.some(p => p.name.toLowerCase() === lowerStr)) return true;

    if (str.includes('+')) {
        const modTokens = str.split('+').map(s => s.trim()).filter(Boolean);
        const resolved = modTokens.map(m => typeof resolveModuleKeyFromText === 'function' ? resolveModuleKeyFromText(m) : null);
        if (resolved.length > 0 && resolved.every(Boolean)) return true;
    }

    if (typeof resolveModuleKeyFromText === 'function' && resolveModuleKeyFromText(str) && str.split(/\s+/).length <= 3) {
        const exactMod = resolveModuleKeyFromText(str);
        if (exactMod && (dashboardModules[lowerStr] || dashboardModules[exactMod].name.toLowerCase() === lowerStr)) {
            return true;
        }
    }

    const parts = str.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const rest = str.slice(parts[0].length).trim();

    switch (cmd) {
        case 'hud':
        case 'uni':
        case 'diet':
        case 'gym':
        case 'today':
        case 'oggi':
        case 'tomorrow':
        case 'domani':
        case 'schedule':
        case 'bal':
        case 'money':
        case 'balance':
        case 'red':
        case 'redmode':
        case 'zero':
        case 'plan':
        case 'ledger':
        case 'stats':
        case 'food':
        case 'macros':
        case 'vault':
        case 'sony':
        case 'audio':
        case 'workout':
        case 'swap':
        case 'settings':
        case 'cfg':
        case 'export':
        case 'backup':
            return true;
        case 'esame':
            return /^(.*?)\s+(\d{2}[lL]?)(?:\s+(\d+))?$/.test(rest);
        case 'tassa':
        case 'out':
        case '-':
        case 'in':
        case '+':
        case 'weight':
        case 'peso':
            return /\d/.test(rest);
        case 'appello':
            return Boolean(rest && rest.split(/\s+/).some(tok => resolveDateToken(tok)));
        case 'wish':
        case 'comprare':
        case 'todo':
        case 'task':
        case 'done':
        case 'check':
        case 'note':
        case 'focus':
        case 'pomo':
            return Boolean(rest);
        case 'event': {
            const parsedEv = parseEventCommandArgs(rest);
            return Boolean(parsedEv.title);
        }
        case 'summon':
        case 'view':
        case 'show':
        case 'open':
            return Boolean(dashboardModules[rest.toLowerCase()] || (typeof resolveModuleKeyFromText === 'function' && resolveModuleKeyFromText(rest)));
        case 'goto':
            return Boolean(resolveDateToken(rest));
        default:
            return false;
    }
}

function getContextualSuggestions(rawInput) {
    const val = (rawInput || '');
    const trimmed = val.trimStart();
    if (!trimmed) return [];

    const segments = val.split(';');
    const prefixBeforeLast = segments.length > 1 ? segments.slice(0, -1).join(';') + '; ' : '';
    const activeSeg = segments[segments.length - 1].trimStart();
    if (!activeSeg) return [];

    if (activeSeg.includes('+')) {
        const plusParts = activeSeg.split('+');
        const completedMods = plusParts.slice(0, -1).map(s => s.trim()).filter(Boolean);
        const currentModQuery = plusParts[plusParts.length - 1].trim().toLowerCase();
        const completedKeys = completedMods.map(m => typeof resolveModuleKeyFromText === 'function' ? resolveModuleKeyFromText(m) : m).filter(Boolean);
        const prefixPlus = prefixBeforeLast + completedMods.join(' + ') + ' + ';

        return Object.keys(dashboardModules)
            .filter(k => !completedKeys.includes(k) && (!currentModQuery || k.startsWith(currentModQuery) || dashboardModules[k].name.toLowerCase().includes(currentModQuery)))
            .map(k => ({
                display: `${completedMods.join(' + ')} + ${dashboardModules[k].name.toLowerCase()}`,
                desc: `[MULTI-VIEW] Add [${dashboardModules[k].name}]`,
                fillValue: `${prefixPlus}${k}`,
                isModuleSuggestion: true,
                moduleKey: k
            }));
    }

    const parts = activeSeg.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const hasSpaceAfterCmd = activeSeg.length > parts[0].length;
    const rest = activeSeg.slice(parts[0].length).trimStart();
    const fullQueryLower = activeSeg.trim().toLowerCase();

    const matchingDirectModules = Object.keys(dashboardModules)
        .filter(k => k.startsWith(fullQueryLower) || dashboardModules[k].name.toLowerCase().startsWith(fullQueryLower) || dashboardModules[k].name.toLowerCase().includes(fullQueryLower))
        .map(k => ({
            display: `${dashboardModules[k].name.toLowerCase()} (${k})`,
            desc: `[OPEN VIEW] ${dashboardModules[k].name}`,
            fillValue: prefixBeforeLast + k,
            isModuleSuggestion: true,
            moduleKey: k
        }));

    if (!hasSpaceAfterCmd) {
        const customAliasMatches = Object.entries(typeof customAliases !== 'undefined' ? customAliases : {})
            .filter(([aliasName]) => aliasName.toLowerCase().startsWith(cmd))
            .map(([aliasName, macroStr]) => ({
                display: `${aliasName} [ALIAS]`,
                desc: `Macro -> ${macroStr}`,
                fillValue: prefixBeforeLast + aliasName
            }));

        const savedPresetMatches = (typeof workspacePresets !== 'undefined' ? workspacePresets : [])
            .filter(p => p.name.toLowerCase().startsWith(cmd))
            .map(p => ({
                display: `${p.name.toLowerCase()} [VIEW]`,
                desc: `Load view "${p.name}"`,
                fillValue: prefixBeforeLast + p.name.toLowerCase()
            }));

        const stdMatches = DSL_COMMAND_SPECS
            .filter(s => s.verb.startsWith(cmd) || s.syntax.toLowerCase().startsWith(cmd))
            .map(s => ({
                display: s.syntax,
                desc: s.desc,
                fillValue: prefixBeforeLast + s.fill
            }));

        return [...customAliasMatches, ...savedPresetMatches, ...matchingDirectModules, ...stdMatches].slice(0, 9);
    }

    if (cmd === 'event') {
        const colorHashMatch = activeSeg.match(/^(.*?\s+)#([a-zA-Z]*)$/);
        if (colorHashMatch) {
            const beforeHash = colorHashMatch[1];
            const cQuery = (colorHashMatch[2] || '').toLowerCase();
            const colorNames = [
                { tag: '#red', hex: '#b84b4b', label: 'Red' },
                { tag: '#green', hex: '#5f7a61', label: 'Green' },
                { tag: '#blue', hex: '#4c5b73', label: 'Blue' },
                { tag: '#gold', hex: '#b08d43', label: 'Gold' },
                { tag: '#purple', hex: '#725b7a', label: 'Purple' },
                { tag: '#white', hex: '#ffffff', label: 'White' },
                { tag: '#grey', hex: '#6e7073', label: 'Grey' }
            ];
            return colorNames
                .filter(c => !cQuery || c.tag.slice(1).startsWith(cQuery))
                .map(c => ({
                    display: `${c.tag} (${c.label})`,
                    desc: `Event color ${c.hex}`,
                    fillValue: `${prefixBeforeLast}${beforeHash}${c.tag} `
                }));
        }
    }

    if (cmd === 'uni') {
        const subOpts = [
            { display: 'uni', desc: 'Summon University module', fillValue: `${prefixBeforeLast}uni` },
            { display: 'uni info', desc: 'Instant Career & Exams snapshot', fillValue: `${prefixBeforeLast}uni info` },
            { display: 'uni roadmap', desc: 'Open Roadmap & Study Phases', fillValue: `${prefixBeforeLast}uni roadmap` },
            { display: 'uni lectures', desc: 'Open Orario Lezioni', fillValue: `${prefixBeforeLast}uni lectures` },
            { display: 'uni appeals', desc: 'Open Appelli & Tasse', fillValue: `${prefixBeforeLast}uni appeals` },
            { display: 'uni libretto', desc: 'Open Libretto (180 CFU)', fillValue: `${prefixBeforeLast}uni libretto` }
        ];
        const q = rest.toLowerCase();
        return subOpts.filter(o => !q || o.display.toLowerCase().includes(q));
    }

    if (cmd === 'esame' || cmd === 'appello') {
        const q = rest.toLowerCase();
        const remCourses = (typeof uniData !== 'undefined' && uniData.remainingExams) ? uniData.remainingExams : [];
        return remCourses
            .filter(c => !q || c.name.toLowerCase().includes(q))
            .map(c => ({
                display: cmd === 'esame' ? `esame ${c.name} [Voto] ${c.cfu}` : `appello ${c.name} ${todayStr} 09:00`,
                desc: `${c.name} (${c.cfu} CFU)`,
                fillValue: `${prefixBeforeLast}${cmd} ${c.name} `
            }));
    }

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
                    desc: `[${t.category}] ${mins > 0 ? mins + 'm · ' : ''}${doneCount}/${t.instances || 1}`,
                    fillValue: `${prefixBeforeLast}${cmd} ${t.title}`
                };
            });
    }

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
                        desc: `VAULT (€${roundCurrency(v.balance).toFixed(2)})`,
                        fillValue: `${prefixBeforeLast}${beforeHash}#${v.name} `
                    });
                }
            });

            mCategories.forEach(c => {
                if (!mVaults.some(v => v.name.toLowerCase() === c.toLowerCase())) {
                    if (!tagQuery || c.toLowerCase().includes(tagQuery)) {
                        results.push({
                            display: `#${c}`,
                            desc: `CATEGORY`,
                            fillValue: `${prefixBeforeLast}${beforeHash}#${c} `
                        });
                    }
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
// ANTEPRIMA LIVE DEL COMANDO (getCommandPreview) CON PREVIEW AI FALLBACK (1A2)
// ============================================================================

function getCommandPreview(raw) {
    const str = (raw || '').trim();
    if (!str) return 'Type DSL command or natural language for AI';
    if (str.includes(';')) {
        const count = str.split(';').map(s => s.trim()).filter(Boolean).length;
        return `[MULTI-COMMAND] Stage ${count} commands into queue`;
    }
    if (str === '?' || str.toLowerCase() === 'help') return 'Open Cortex Manual';

    // Se non è un comando DSL riconosciuto, mostra subito il badge di traduzione AI verso Staging (1A2)
    if (!isValidDslCommand(str)) {
        return `[✦ AI TRANSLATE -> STAGING] Press [ENTER] to convert natural language into DSL commands`;
    }

    const lowerStr = str.toLowerCase();

    if (typeof customAliases !== 'undefined' && customAliases[lowerStr]) {
        return `[ALIAS "${lowerStr.toUpperCase()}"] Runs: ${customAliases[lowerStr]}`;
    }

    if (typeof workspacePresets !== 'undefined') {
        const matchedPreset = workspacePresets.find(p => p.name.toLowerCase() === lowerStr);
        if (matchedPreset) return `[VIEW] Load "${matchedPreset.name}"`;
    }

    if (str.includes('+') || (typeof resolveModuleKeyFromText === 'function' && resolveModuleKeyFromText(str) && !['uni', 'gym', 'diet', 'money', 'bal'].includes(lowerStr))) {
        const modParts = str.split('+').map(s => s.trim()).filter(Boolean);
        const resolved = modParts.map(m => typeof resolveModuleKeyFromText === 'function' ? resolveModuleKeyFromText(m) : null);
        if (resolved.length > 0 && resolved.every(Boolean)) {
            const names = resolved.map(k => dashboardModules[k].name).join(' + ');
            return `[VIEW] Open ${names}`;
        }
    }

    const parts = str.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const rest = str.slice(parts[0].length).trim();

    switch (cmd) {
        case 'hud': return '[HUD POD] Toggle Tactical HUD Widget (Shortcut: H)';
        case 'uni':
            if (rest.toLowerCase() === 'info') return `[INSPECT UNI] Career Averages, CFU & Appeals`;
            return `[UNIVERSITY] Open University ${rest ? '(' + rest.toUpperCase() + ')' : ''}`;
        case 'esame':
            return `[UNI -> LIBRETTO] Record passed exam (${rest})`;
        case 'tassa':
            return `[UNI -> TAX] Create Red Deadline Event + Tasse Uni: ${rest}`;
        case 'appello':
            return `[UNI -> CALENDAR] Schedule exam appeal: ${rest}`;
        case 'diet': {
            const targetDate = resolveDateToken(rest) || selectedDateStr;
            return `[INSPECT DIET] Meals & macros for ${targetDate}`;
        }
        case 'gym':
            if (rest.toLowerCase() === 'done') return `[GYM] Complete active workout (Day ${nextWorkoutDay})`;
            return `[INSPECT GYM] Active Workout Split (Day ${nextWorkoutDay})`;
        case 'today':
        case 'oggi':
            return `[INSPECT] Schedule for TODAY (${todayStr})`;
        case 'tomorrow':
        case 'domani':
        case 'schedule':
            return `[INSPECT] Schedule for TOMORROW (${tomorrowStr})`;
        case 'bal':
        case 'money':
        case 'balance':
            return `[INSPECT MONEY] Spendable Balance, Vaults & Cashflow`;
        case 'red':
        case 'redmode':
            return `[VISUAL] Toggle Red Gelatin Mode`;
        case 'zero':
            return `[WORKSPACE] Zero-UI Mode`;
        case 'plan':
            return `[DAY PLANNER] Open Day Planner Timeline`;
        case 'ledger':
        case 'stats':
            return `[LEDGER] Open Consistency & Focus Hours`;
        case 'weight':
        case 'peso': {
            const m = rest.match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
            if (!m) return 'Syntax: weight [kg] [note]';
            return `[HEALTH] Log Body Weight: ${parseFloat(m[1].replace(',', '.')).toFixed(1)} kg`;
        }
        case 'food':
        case 'macros':
            return `[HEALTH] Open Nutritional Database`;
        case 'vault':
            return `[MONEY] Open Vault modal`;
        case 'out':
        case '-': {
            const m = rest.match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
            if (!m) return 'Syntax: out [amount] #[vault/cat] [desc]';
            const amt = parseFloat(m[1].replace(',', '.'));
            const tail = m[2] || '';
            const catMatch = tail.match(/#([a-zA-Z0-9_À-ÿ]+)/);
            const cat = catMatch ? catMatch[1] : 'Generale';
            const cleanDesc = tail.replace(/#[a-zA-Z0-9_À-ÿ]+/, '').trim();
            const matchedV = typeof findMatchingVaultForExpense === 'function' ? findMatchingVaultForExpense(cat, cleanDesc || tail) : null;
            if (matchedV) {
                const proj = roundCurrency((parseFloat(matchedV.balance) || 0) - amt);
                return `[VAULT ${matchedV.name.toUpperCase()}] -€${amt.toFixed(2)} (New bal: €${proj.toFixed(2)})`;
            }
            return `[MONEY] -€${amt.toFixed(2)} [${cat}] — "${cleanDesc || tail || 'Expense'}"`;
        }
        case 'in':
        case '+': {
            const m = rest.match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
            if (!m) return 'Syntax: in [amount] [desc]';
            return `[MONEY] +€${parseFloat(m[1].replace(',', '.')).toFixed(2)} — "${m[2] || 'Income'}"`;
        }
        case 'wish':
        case 'comprare':
            return `[INCUBATOR] Add "${rest}"`;
        case 'todo':
            return `[TO-DO] Add "${rest}"`;
        case 'task':
            return `[TASKS] Schedule flexible task: ${rest}`;
        case 'done':
        case 'check':
            return `[TASKS] Check off "${rest}"`;
        case 'event': {
            const ev = parseEventCommandArgs(rest);
            const tSlot = (ev.start && ev.end) ? ` [${ev.start}–${ev.end}]` : '';
            return `[EVENT ${ev.date}${tSlot}] "${ev.title}" (Color: ${ev.color})`;
        }
        case 'note':
            return `[NOTES] Append note: ${rest}`;
        case 'focus':
        case 'pomo': {
            const numMatch = rest.match(/^(\d+)\s+(.+)$/);
            const queryPart = numMatch ? numMatch[2].trim() : rest;
            const matched = typeof findMatchingTaskForFocus === 'function' ? findMatchingTaskForFocus(queryPart) : null;
            if (matched) {
                const dur = (numMatch ? parseInt(numMatch[1], 10) : null) || getTaskDurationMinutes(matched, selectedDateStr);
                return `[FOCUS] Start ${dur}m on "${matched.title}"`;
            }
            return `[FOCUS] Start session on "${queryPart}"`;
        }
        case 'workout':
            return `[GYM] Complete workout (Day ${nextWorkoutDay})`;
        case 'summon':
        case 'view':
        case 'show':
        case 'open': {
            const modKey = typeof resolveModuleKeyFromText === 'function' ? resolveModuleKeyFromText(rest) : rest.toLowerCase();
            return dashboardModules[modKey] ? `[WORKSPACE] Summon "${dashboardModules[modKey].name}"` : `[WORKSPACE] Unknown module`;
        }
        case 'swap':
            return `[WORKSPACE] Swap quadrants`;
        case 'settings':
        case 'cfg':
            return `[SYSTEM] Open Settings`;
        case 'goto':
            return `[CALENDAR] Jump to ${resolveDateToken(rest) || rest}`;
        case 'export':
        case 'backup':
            return `[SYSTEM] Export JSON backup`;
        default:
            return `[✦ AI TRANSLATE -> STAGING] Press [ENTER] to convert natural language into DSL commands`;
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
            <span>[ESC]</span>
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
        rem.forEach(c => {
            const hrs = typeof getExamStudiedHours === 'function' ? getExamStudiedHours(c.id, c.name) : 0;
            html += `<div style="display:flex; justify-content:space-between; font-size:var(--font-xs); padding:4px 8px; border:1px solid var(--border-color);">
                <span><strong>${escapeHtml(c.name)}</strong> (${c.cfu} CFU)</span>
                <strong>${hrs.toFixed(1)}h</strong>
            </div>`;
        });
    }

    if (apps.length > 0) {
        apps.slice(0, 4).forEach(a => {
            html += `<div style="display:flex; justify-content:space-between; font-size:var(--font-xs); padding:4px 8px; border-left:2px solid var(--accent-gold); background:rgba(255,255,255,0.02);">
                <strong>${escapeHtml(a.examName)}</strong>
                <span>${escapeHtml(a.date)} (${escapeHtml(a.time)})</span>
            </div>`;
        });
    }

    showInstantInspectionCard('UNIVERSITY // 180 CFU', html);
}

function renderInstantDietSummary(targetDateStr) {
    const dObj = parseLocalDate(targetDateStr);
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
            <strong style="color:var(--text-main);">MACROS</strong>
            <span style="color:var(--text-main); font-weight:bold;">${totals.kcal} KCAL &nbsp;|&nbsp; P: ${totals.p}g · C: ${totals.c}g · F: ${totals.f}g</span>
        </div>
    `;

    showInstantInspectionCard(`DIET // ${dayNames[dayIdx]} (${targetDateStr})`, rowsHtml);
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
            const weightBadge = weights.length > 0 ? weights.join(' · ') : (ex.sets > 0 ? '—' : 'BW');
            const meta = typeof resolveGymSchemeMeta === 'function' ? resolveGymSchemeMeta(ex.repStr) : { isProg: false };
            const progTag = meta.isProg ? ` [${ex.sets}x${ex.currentReps || 5}]` : '';

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

    showInstantInspectionCard(`WORKOUT SPLIT // DAY ${activeDay}`, rowsHtml);
}

function renderInstantScheduleSummary(targetDateStr) {
    const dayIdx = parseLocalDate(targetDateStr).getDay();
    const activeTasks = templates.filter(t => isTaskActiveOnDate(t, targetDateStr));
    const dayEvents = specificEvents.filter(e => e.date === targetDateStr);
    const customBlocks = Array.isArray(ephemeralData[targetDateStr]) ? ephemeralData[targetDateStr] : [];

    let html = '';

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
                    </div>
                    <span style="color:${isAllDone ? 'var(--accent-green)' : 'var(--text-muted)'}; font-weight:bold;">[${doneCount}/${totalCount}]</span>
                </div>
            `;
        });
    }

    showInstantInspectionCard(`SCHEDULE // ${targetDateStr}`, html);
}

function renderInstantMoneySummary() {
    const metrics = typeof getMoneyAllocationMetrics === 'function'
        ? getMoneyAllocationMetrics()
        : { total: mBalance, spendable: mBalance, vaulted: 0, pendingBills: 0, monthIn: 0, monthOut: 0, monthNet: 0 };

    let html = `
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; font-size:var(--font-xs);">
            <div style="padding:8px 10px; border:1px solid var(--border-bright); background:rgba(255,255,255,0.03);">
                <div style="color:var(--text-dim);">SPENDABLE</div>
                <div style="font-size:var(--font-lg); font-weight:bold; color:${metrics.spendable < 0 ? 'var(--accent-red)' : 'var(--accent-green)'}; margin-top:2px;">€${metrics.spendable.toFixed(2)}</div>
            </div>
            <div style="padding:8px 10px; border:1px solid var(--border-color); background:rgba(255,255,255,0.02);">
                <div style="color:var(--text-dim);">TOTAL BALANCE</div>
                <div style="font-size:var(--font-lg); font-weight:bold; color:var(--text-main); margin-top:2px;">€${metrics.total.toFixed(2)}</div>
            </div>
        </div>
        <div style="display:flex; justify-content:space-between; padding:5px 8px; border:1px solid var(--border-color); font-size:var(--font-xs); color:var(--text-muted);">
            <span>VAULTS: <strong>€${metrics.vaulted.toFixed(2)}</strong></span>
            <span>BILLS: <strong>€${metrics.pendingBills.toFixed(2)}</strong></span>
            <span>NET: <strong>${metrics.monthNet >= 0 ? '+' : ''}€${metrics.monthNet.toFixed(2)}</strong></span>
        </div>
    `;

    showInstantInspectionCard(`FINANCE SNAPSHOT`, html);
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

    const lowerStr = str.toLowerCase();

    if (typeof customAliases !== 'undefined' && customAliases[lowerStr]) {
        const subCmds = customAliases[lowerStr].split(';').map(s => s.trim()).filter(Boolean);
        let okCount = 0;
        subCmds.forEach(sc => {
            if (executeTerminalCommand(sc)) okCount++;
        });
        if (typeof showToast === 'function') {
            showToast(`[ALIAS: ${lowerStr.toUpperCase()}] Executed ${okCount} command(s)`);
        }
        return okCount > 0;
    }

    if (typeof workspacePresets !== 'undefined') {
        const matchedPreset = workspacePresets.find(p => p.name.toLowerCase() === lowerStr);
        if (matchedPreset && typeof applyWorkspacePreset === 'function') {
            if (typeof isHudMode !== 'undefined' && isHudMode && typeof toggleHudMode === 'function') {
                toggleHudMode(false);
            }
            applyWorkspacePreset(matchedPreset.id);
            return true;
        }
    }

    if (str.includes('+') || (typeof resolveModuleKeyFromText === 'function' && resolveModuleKeyFromText(str) && !['uni', 'gym', 'diet', 'money', 'bal'].includes(lowerStr) && str.split(/\s+/).length <= 3)) {
        const modTokens = str.split('+').map(s => s.trim()).filter(Boolean);
        const resolvedKeys = modTokens.map(m => typeof resolveModuleKeyFromText === 'function' ? resolveModuleKeyFromText(m) : null);
        if (resolvedKeys.length > 0 && resolvedKeys.every(Boolean)) {
            if (!str.includes('+')) {
                const singleKey = resolvedKeys[0];
                if (dashboardModules[lowerStr] || dashboardModules[singleKey].name.toLowerCase() === lowerStr) {
                    return setModulesView(resolvedKeys);
                }
            } else {
                return setModulesView(resolvedKeys);
            }
        }
    }

    const parts = str.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const rest = str.slice(parts[0].length).trim();

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
            return true;
        }
        return false;
    }

    if (cmd === 'esame') {
        const m = rest.match(/^(.*?)\s+(\d{2}[lL]?)(?:\s+(\d+))?$/);
        if (!m || !m[1].trim()) return false;
        if (typeof recordPassedExam === 'function') {
            return recordPassedExam(m[1].trim(), m[2].trim(), m[3] ? parseInt(m[3], 10) : null, todayStr);
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

    if (cmd === 'hud') {
        if (typeof closeTerminal === 'function') closeTerminal();
        if (typeof toggleHudMode === 'function') {
            if (rest.toLowerCase() === 'on') toggleHudMode(true);
            else if (rest.toLowerCase() === 'off') toggleHudMode(false);
            else toggleHudMode();
            return true;
        }
        return false;
    }

    if (cmd === 'tassa') {
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
            return addUniAppeal(examName, dateStr, timeStr);
        }
        return false;
    }

    if (cmd === 'diet') {
        renderInstantDietSummary(resolveDateToken(rest) || selectedDateStr);
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
        renderInstantScheduleSummary(resolveDateToken(rest) || tomorrowStr);
        return true;
    }

    if (cmd === 'bal' || cmd === 'money' || cmd === 'balance') {
        renderInstantMoneySummary();
        return true;
    }

    if (cmd === 'red' || cmd === 'redmode') {
        if (rest.toLowerCase() === 'on') toggleRedMode(true);
        else if (rest.toLowerCase() === 'off') toggleRedMode(false);
        else toggleRedMode();
        return true;
    }

    if (cmd === 'zero') {
        if (typeof setQuadrantCount === 'function') setQuadrantCount(0);
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
        if (typeof addBodyMetricLog === 'function') {
            return addBodyMetricLog(parseFloat(m[1].replace(',', '.')), m[2].trim());
        }
        return false;
    }

    if (cmd === 'sony' || cmd === 'audio') {
        if (typeof closeTerminal === 'function') closeTerminal();
        document.getElementById('sony-folder-input')?.click();
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
            if (res && res.matchedVault && typeof showToast === 'function') {
                showToast(`[VAULT ${res.matchedVault.name.toUpperCase()}] -€${amt.toFixed(2)} -> €${res.newVaultBalance.toFixed(2)}`);
                return true;
            }
        }
        if (typeof showToast === 'function') showToast(`[MONEY] -€${amt.toFixed(2)} [${category}] ${desc}`);
        if (typeof renderHudPod === 'function') renderHudPod();
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
        if (typeof renderHudPod === 'function') renderHudPod();
        const vaultMsg = autoSaved > 0 ? ` (Vault: €${autoSaved.toFixed(2)})` : '';
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
        mWishlist.push({ id: 'mw_' + Date.now(), category: 'General', title, cost, order: mWishlist.length });
        saveMoneyData();
        if (typeof renderMoneyDashboard === 'function') renderMoneyDashboard();
        if (typeof showToast === 'function') showToast(`[INCUBATOR] Added: ${title}`);
        return true;
    }

    if (cmd === 'todo') {
        if (!rest) return false;
        const dayIdx = parseLocalDate(selectedDateStr).getDay();
        const catName = 'General To-Do';
        if (!categoryOrder.includes(catName)) categoryOrder.push(catName);

        templates.push({
            id: 't_' + Date.now() + '_' + Math.floor(Math.random() * 10000),
            isTodo: true,
            category: catName,
            title: rest,
            instances: 1,
            timerMinutes: 15,
            noTimer: true,
            frequency: 'specific',
            daysOfWeek: [dayIdx],
            startDate: selectedDateStr,
            endDate: selectedDateStr,
            color: '#ffffff',
            type: 'untimed',
            timeWindows: []
        });
        saveData();
        if (typeof renderTasks === 'function') renderTasks();
        if (typeof renderDayPlannerModule === 'function') renderDayPlannerModule();
        if (typeof renderHudPod === 'function') renderHudPod();
        if (typeof showToast === 'function') showToast(`[TO-DO] Added "${rest}"`);
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

        const dayIdx = parseLocalDate(targetDate).getDay();
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
        if (typeof renderHudPod === 'function') renderHudPod();
        if (typeof showToast === 'function') showToast(`[TASK] "${finalTitle}" on ${targetDate}`);
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
            if (typeof renderHudPod === 'function') renderHudPod();
            if (typeof showToast === 'function') showToast(`[DONE] "${match.title}"`);
            return true;
        }
        return false;
    }

    // 2A1 + 2B1: Creazione Evento con Data, Fascia Oraria / Durata e Colore
    if (cmd === 'event') {
        if (!rest) return false;
        const parsedEv = parseEventCommandArgs(rest);
        if (!parsedEv.title) return false;

        specificEvents.push({
            id: 'e_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
            title: parsedEv.title,
            date: parsedEv.date,
            start: parsedEv.start || null,
            end: parsedEv.end || null,
            color: parsedEv.color || '#b84b4b'
        });

        saveData();
        if (typeof renderCalendar === 'function') renderCalendar();
        if (typeof renderTasks === 'function') renderTasks();
        if (typeof renderWeeklyPlanner === 'function') renderWeeklyPlanner();
        if (typeof renderDayPlannerModule === 'function') renderDayPlannerModule();
        if (typeof renderHudPod === 'function') renderHudPod();

        const timeLabel = (parsedEv.start && parsedEv.end) ? ` (${parsedEv.start}–${parsedEv.end})` : '';
        if (typeof showToast === 'function') {
            showToast(`[EVENT] "${parsedEv.title}" on ${parsedEv.date}${timeLabel}`);
        }
        return true;
    }

    if (cmd === 'note') {
        if (!rest) return false;
        let targetCat = typeof getTargetCategoryForWrite === 'function' ? getTargetCategoryForWrite() : 'General';
        let noteBody = rest;

        const colonIdx = rest.indexOf(':');
        if (colonIdx > 0 && colonIdx < 35) {
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
        return false;
    }

    if (cmd === 'summon' || cmd === 'view' || cmd === 'show' || cmd === 'open') {
        const modKey = typeof resolveModuleKeyFromText === 'function' ? resolveModuleKeyFromText(rest) : rest.toLowerCase();
        if (dashboardModules[modKey]) {
            summonModule(modKey);
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
            return true;
        }
        return false;
    }

    if (cmd === 'goto') {
        const resolved = resolveDateToken(rest);
        if (!resolved) return false;
        jumpToDate(resolved);
        return true;
    }

    if (cmd === 'export' || cmd === 'backup') {
        exportData();
        return true;
    }

    return false;
}