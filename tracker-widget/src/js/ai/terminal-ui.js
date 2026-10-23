// --- js/ai/terminal-ui.js ---
// Controller Command Palette DSL: Autocompletamento Contestuale [Tab], Esecuzione Istantanea [Enter] & Coda Staging [Shift+Enter]

let toastTimeout;
let commandHistory = [];
let historyIndex = -1;

let isStagingActive = false;
let isAskBarExpanded = false;
let stagedCommands = [];

let activeSuggestions = [];
let selectedSuggestionIdx = 0;

function showToast(msg) {
    const toast = document.getElementById('terminal-toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => { toast.classList.remove('show'); }, 3200);
}

// Apertura ed espansione fluida della barra al centro-alto
function openTerminal() {
    isAskBarExpanded = true;
    const container = document.getElementById('ask-bar-container');
    const backdrop = document.getElementById('terminalOverlay');
    const input = document.getElementById('terminal-input');

    if (container) container.classList.add('expanded');
    if (backdrop) backdrop.classList.add('show');

    if (input) {
        setTimeout(() => {
            input.focus();
            updateLivePreviewAndSuggestions();
        }, 50);
    }
    historyIndex = commandHistory.length;
}

function closeTerminal() {
    cancelStaging();
    hideSuggestionsAndPreview();

    isAskBarExpanded = false;
    const container = document.getElementById('ask-bar-container');
    const backdrop = document.getElementById('terminalOverlay');
    const input = document.getElementById('terminal-input');
    const answerBox = document.getElementById('terminal-ai-answer');

    if (container) container.classList.remove('expanded');
    if (backdrop) backdrop.classList.remove('show');
    if (input) {
        input.value = '';
        input.blur();
    }
    if (answerBox) {
        answerBox.style.display = 'none';
        answerBox.innerHTML = '';
    }
}

function openShortcutsHelp() {
    closeTerminal();
    closeModals();
    const modal = document.getElementById('shortcutsHelpModal');
    if (modal) modal.style.display = 'flex';
}

// ============================================================================
// ANTEPRIMA LIVE E TENDINA SUGGERIMENTI CONTESTUALI (2A)
// ============================================================================

function hideSuggestionsAndPreview() {
    const prevEl = document.getElementById('terminal-live-preview');
    const suggEl = document.getElementById('terminal-suggestions');
    if (prevEl) prevEl.style.display = 'none';
    if (suggEl) {
        suggEl.style.display = 'none';
        suggEl.innerHTML = '';
    }
    activeSuggestions = [];
    selectedSuggestionIdx = 0;
}

function updateLivePreviewAndSuggestions() {
    const input = document.getElementById('terminal-input');
    const prevEl = document.getElementById('terminal-live-preview');
    const suggEl = document.getElementById('terminal-suggestions');
    if (!input || !prevEl || !suggEl) return;

    const rawVal = input.value;
    const trimmed = rawVal.trim();

    if (!isAskBarExpanded || !trimmed) {
        hideSuggestionsAndPreview();
        return;
    }

    // 1. Mostra l'anteprima esatta dell'azione corrente + hint Shift+Enter
    prevEl.style.display = 'flex';
    prevEl.innerHTML = `
        <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(getCommandPreview(trimmed))}</span>
        <span style="color:var(--text-dim); font-size:0.65rem; flex-shrink:0;">[ENTER] RUN · [SHIFT+ENTER] STAGE</span>
    `;

    // 2. Calcola e disegna i suggerimenti contestuali live
    activeSuggestions = typeof getContextualSuggestions === 'function' ? getContextualSuggestions(rawVal) : [];
    if (activeSuggestions.length === 0) {
        suggEl.style.display = 'none';
        suggEl.innerHTML = '';
        selectedSuggestionIdx = 0;
        return;
    }

    if (selectedSuggestionIdx >= activeSuggestions.length) {
        selectedSuggestionIdx = 0;
    }

    suggEl.style.display = 'flex';
    suggEl.innerHTML = '';

    activeSuggestions.forEach((item, idx) => {
        const row = document.createElement('div');
        row.className = `suggestion-item ${idx === selectedSuggestionIdx ? 'active' : ''}`;
        row.innerHTML = `
            <span class="suggestion-cmd">${escapeHtml(item.display)}</span>
            <span class="suggestion-desc">${escapeHtml(item.desc)}</span>
        `;
        row.onmousedown = (e) => {
            e.preventDefault(); // Evita perdita di focus dall'input
            applySuggestionAtIndex(idx);
        };
        suggEl.appendChild(row);
    });
}

function applySuggestionAtIndex(idx) {
    if (idx < 0 || idx >= activeSuggestions.length) return;
    const item = activeSuggestions[idx];
    const input = document.getElementById('terminal-input');
    if (!input || !item) return;

    input.value = item.fillValue;
    input.focus();
    selectedSuggestionIdx = 0;
    updateLivePreviewAndSuggestions();
}

// ============================================================================
// STAGING AREA CODA COMANDI (1C: SHIFT+ENTER O SEPARATORE ;)
// ============================================================================

function pushCommandsToStaging(cmdsArray) {
    const stagingBox = document.getElementById('terminal-staging');
    if (!stagingBox) return;

    const cleanNew = (cmdsArray || []).map(c => c.trim()).filter(Boolean);
    if (cleanNew.length === 0) return;

    isStagingActive = true;
    stagedCommands.push(...cleanNew);

    stagingBox.style.display = 'flex';
    renderStagingCommandList();
}

function renderStagingCommandList() {
    const listEl = document.getElementById('staging-cmd-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    if (stagedCommands.length === 0) {
        cancelStaging();
        return;
    }

    stagedCommands.forEach((cmdStr, idx) => {
        const item = document.createElement('div');
        item.className = 'staging-cmd-item';

        const row = document.createElement('div');
        row.className = 'staging-cmd-row';

        const numSpan = document.createElement('span');
        numSpan.style.cssText = 'font-size:var(--font-xs); color:var(--text-dim); font-weight:bold;';
        numSpan.textContent = `[${idx + 1}]`;

        const inp = document.createElement('input');
        inp.type = 'text';
        inp.className = 'staging-cmd-input';
        inp.value = cmdStr;

        const previewDiv = document.createElement('div');
        previewDiv.className = 'staging-cmd-preview';
        previewDiv.textContent = getCommandPreview(cmdStr);

        inp.oninput = () => {
            stagedCommands[idx] = inp.value.trim();
            previewDiv.textContent = getCommandPreview(stagedCommands[idx]);
        };

        inp.onkeydown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                confirmStagingCommands();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                cancelStaging();
            }
        };

        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'icon-btn delete';
        delBtn.textContent = '[X]';
        delBtn.onclick = () => {
            stagedCommands.splice(idx, 1);
            renderStagingCommandList();
        };

        row.appendChild(numSpan);
        row.appendChild(inp);
        row.appendChild(delBtn);
        item.appendChild(row);
        item.appendChild(previewDiv);
        listEl.appendChild(item);
    });
}

function cancelStaging() {
    isStagingActive = false;
    stagedCommands = [];
    const stagingBox = document.getElementById('terminal-staging');
    if (stagingBox) stagingBox.style.display = 'none';
}

function confirmStagingCommands() {
    if (!isStagingActive) return;

    const validCmds = stagedCommands.map(c => c.trim()).filter(Boolean);
    if (validCmds.length === 0) {
        cancelStaging();
        return;
    }

    let executedCount = 0;
    let shouldKeepBarOpen = false;
    let openedModal = false;
    const modalCommands = ['?', 'help', 'plan', 'ledger', 'stats', 'food', 'macros', 'vault', 'settings', 'cfg'];

    validCmds.forEach(cmd => {
        const firstWord = cmd.split(/\s+/)[0].toLowerCase();
        if (modalCommands.includes(firstWord)) openedModal = true;
        if (typeof isInspectionOnlyCommand === 'function' && isInspectionOnlyCommand(cmd)) {
            shouldKeepBarOpen = true;
        }
        if (executeTerminalCommand(cmd)) executedCount++;
    });

    cancelStaging();
    if (!shouldKeepBarOpen && !openedModal) {
        closeTerminal();
    }
    if (executedCount > 0) {
        showToast(`[EXECUTED] ${executedCount} command(s) completed`);
    }
}

// ============================================================================
// EVENT LISTENERS & SCORCIATOIE GLOBALI
// ============================================================================

window.addEventListener('DOMContentLoaded', () => {
    const termInput = document.getElementById('terminal-input');

    if (termInput) {
        termInput.addEventListener('focus', () => {
            if (!isAskBarExpanded) openTerminal();
        });

        termInput.addEventListener('input', () => {
            const answerBox = document.getElementById('terminal-ai-answer');
            if (answerBox && answerBox.style.display === 'block' && termInput.value.trim() !== '') {
                answerBox.style.display = 'none';
            }
            selectedSuggestionIdx = 0;
            updateLivePreviewAndSuggestions();
        });

        termInput.addEventListener('keydown', (e) => {
            // 1. TAB -> Autocompleta con il suggerimento selezionato
            if (e.key === 'Tab') {
                if (activeSuggestions.length > 0) {
                    e.preventDefault();
                    applySuggestionAtIndex(selectedSuggestionIdx);
                }
                return;
            }

            // 2. FRECCE SU / GIÙ -> Navigano nella tendina suggerimenti (o nella cronologia se non ci sono suggerimenti)
            if (e.key === 'ArrowDown') {
                if (activeSuggestions.length > 0) {
                    e.preventDefault();
                    selectedSuggestionIdx = (selectedSuggestionIdx + 1) % activeSuggestions.length;
                    updateLivePreviewAndSuggestions();
                    return;
                }
                if (historyIndex < commandHistory.length - 1) {
                    e.preventDefault();
                    historyIndex++;
                    termInput.value = commandHistory[historyIndex];
                    updateLivePreviewAndSuggestions();
                } else {
                    historyIndex = commandHistory.length;
                    termInput.value = '';
                    updateLivePreviewAndSuggestions();
                }
                return;
            }

            if (e.key === 'ArrowUp') {
                if (activeSuggestions.length > 0) {
                    e.preventDefault();
                    selectedSuggestionIdx = (selectedSuggestionIdx - 1 + activeSuggestions.length) % activeSuggestions.length;
                    updateLivePreviewAndSuggestions();
                    return;
                }
                if (commandHistory.length > 0 && historyIndex > 0) {
                    e.preventDefault();
                    historyIndex--;
                    termInput.value = commandHistory[historyIndex];
                    updateLivePreviewAndSuggestions();
                }
                return;
            }

            // 3. ESC -> Chiude suggerimenti/staging o chiude la barra
            if (e.key === 'Escape') {
                e.preventDefault();
                if (isStagingActive) {
                    cancelStaging();
                    return;
                }
                closeTerminal();
                return;
            }

            // 4. ENTER / SHIFT+ENTER -> Esecuzione Istantanea o Staging Area (1C)
            if (e.key === 'Enter') {
                e.preventDefault();
                const rawVal = termInput.value.trim();

                // Se l'input è vuoto ma ci sono comandi in Staging Area -> li esegue tutti!
                if (!rawVal) {
                    if (isStagingActive) confirmStagingCommands();
                    return;
                }

                commandHistory.push(rawVal);
                historyIndex = commandHistory.length;

                // Se ha premuto Shift+Enter oppure ha scritto più comandi separati da ';' -> impila nella Staging Area
                if (e.shiftKey || rawVal.includes(';')) {
                    const parts = rawVal.split(';').map(s => s.trim()).filter(Boolean);
                    pushCommandsToStaging(parts);
                    termInput.value = '';
                    hideSuggestionsAndPreview();
                    return;
                }

                // Caso Enter singolo: se la Staging Area è già aperta, aggiunge anche questo comando alla coda ed esegue tutto
                if (isStagingActive) {
                    pushCommandsToStaging([rawVal]);
                    termInput.value = '';
                    hideSuggestionsAndPreview();
                    confirmStagingCommands();
                    return;
                }

                // Esecuzione diretta 0ms
                const isInspection = typeof isInspectionOnlyCommand === 'function' && isInspectionOnlyCommand(rawVal);
                const firstWord = rawVal.split(/\s+/)[0].toLowerCase();
                const modalCommands = ['?', 'help', 'plan', 'ledger', 'stats', 'food', 'macros', 'vault', 'settings', 'cfg'];

                const ok = executeTerminalCommand(rawVal);
                if (ok) {
                    if (isInspection) {
                        termInput.select();
                        hideSuggestionsAndPreview();
                    } else if (!modalCommands.includes(firstWord)) {
                        closeTerminal();
                    }
                } else {
                    showToast(`Invalid syntax or unknown command "${firstWord}". Press ? for manual.`);
                }
            }
        });
    }

    document.addEventListener('keydown', (e) => {
        if (isStagingActive && document.activeElement && !document.activeElement.classList.contains('staging-cmd-input') && document.activeElement !== termInput) {
            if (e.key === 'Enter') { e.preventDefault(); confirmStagingCommands(); return; }
        }

        if ((e.ctrlKey && e.code === 'Space') || (e.ctrlKey && e.key.toLowerCase() === 'k')) {
            e.preventDefault();
            if (isAskBarExpanded) closeTerminal();
            else openTerminal();
            return;
        }

        if (e.ctrlKey && e.key.toLowerCase() === 's') {
            e.preventDefault();
            saveData(); saveMoneyData(); saveHealthData(); saveWorkspaceState();
            showToast('[SYSTEM] All data saved to storage');
            return;
        }

        if (e.key === 'Escape') {
            if (isAskBarExpanded) {
                if (isStagingActive) cancelStaging();
                closeTerminal();
                return;
            }
            closeModals();
            document.querySelectorAll('.dropdown-content.show').forEach(d => d.classList.remove('show'));
            return;
        }

        const activeTag = document.activeElement ? document.activeElement.tagName : '';
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(activeTag) || (document.activeElement && document.activeElement.isContentEditable)) {
            return;
        }

        const anyModalOpen = Array.from(document.querySelectorAll('.modal-overlay')).some(m => m.style.display === 'flex');
        const pomoOverlay = document.getElementById('pomodoroOverlay');
        const fullPomoOpen = pomoOverlay && pomoOverlay.style.display === 'flex' && !pomoOverlay.classList.contains('widget-mode');
        if (anyModalOpen || fullPomoOpen || e.ctrlKey || e.altKey || e.metaKey) return;

        switch (e.key) {
            case ',':
                e.preventDefault();
                openSettingsModal();
                break;
            case 'r':
            case 'R':
                e.preventDefault();
                toggleRedMode();
                break;
            case '0':
                e.preventDefault();
                setQuadrantCount(0);
                break;
            case 'ArrowLeft':
                e.preventDefault(); shiftSelectedDate(-1); showToast(`Date: ${selectedDateStr}`); break;
            case 'ArrowRight':
                e.preventDefault(); shiftSelectedDate(1); showToast(`Date: ${selectedDateStr}`); break;
            case 't':
            case 'T':
                e.preventDefault(); jumpToDate(todayStr); showToast(`Today: ${todayStr}`); break;
            case 'p':
            case 'P':
                e.preventDefault(); openPlanTomorrowModal(); break;
            case 'j':
            case 'J':
                e.preventDefault(); openJournal(selectedDateStr); break;
            case 's':
            case 'S':
                e.preventDefault();
                if (activeSlots.length >= 2) {
                    const temp = activeSlots[0];
                    activeSlots[0] = activeSlots[1];
                    activeSlots[1] = temp;
                    renderQuadrantLayout();
                    showToast('Swapped quadrants');
                }
                break;
            case '?':
                e.preventDefault(); openShortcutsHelp(); break;
        }
    });
});