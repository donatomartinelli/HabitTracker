// --- js/ai/terminal-ui.js ---
// Controller Command Palette DSL + Automatic AI Natural Language Fallback -> Staging Area

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

function openTerminal() {
    if (typeof setHudTemporaryExpansion === 'function') setHudTemporaryExpansion(true);
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

    if (typeof setHudTemporaryExpansion === 'function') {
        const anyModalOpen = Array.from(document.querySelectorAll('.modal-overlay')).some(m => m.style.display === 'flex');
        if (!anyModalOpen) setHudTemporaryExpansion(false);
    }
}

function openShortcutsHelp() {
    closeTerminal();
    closeModals();
    const modal = document.getElementById('shortcutsHelpModal');
    if (modal) modal.style.display = 'flex';
}

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

    const isDsl = typeof isValidDslCommand === 'function' && isValidDslCommand(trimmed);
    const previewStr = getCommandPreview(trimmed);

    prevEl.style.display = 'flex';
    prevEl.innerHTML = `
        <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:${isDsl ? 'var(--text-muted)' : 'var(--accent-gold)'};">${escapeHtml(previewStr)}</span>
        <span style="color:var(--text-dim); font-size:0.65rem; flex-shrink:0;">${isDsl ? '[ENTER] RUN · [SHIFT+ENTER] STAGE' : '[ENTER] AI ➔ STAGING'}</span>
    `;

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
            e.preventDefault();
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
// STAGING AREA CODA COMANDI
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
    const modalCommands = ['?', 'help', 'ledger', 'stats', 'food', 'macros', 'vault', 'settings', 'cfg'];

    validCmds.forEach(cmd => {
        const firstWord = cmd.split(/\s+/)[0].toLowerCase();
        if (modalCommands.includes(firstWord)) openedModal = true;
        if (typeof isInspectionOnlyCommand === 'function' && isInspectionOnlyCommand(cmd)) {
            shouldKeepBarOpen = true;
        }
        if (executeTerminalCommand(cmd)) executedCount++;
    });

    const answerBox = document.getElementById('terminal-ai-answer');
    const hasInspectionCardOpen = shouldKeepBarOpen || (answerBox && answerBox.style.display === 'block');
    const anyModalNowOpen = openedModal || Array.from(document.querySelectorAll('.modal-overlay')).some(m => m.style.display === 'flex');

    cancelStaging();
    if (!hasInspectionCardOpen && !anyModalNowOpen) {
        closeTerminal();
    }

    if (executedCount > 0) {
        showToast(`[EXECUTED] ${executedCount} command(s) completed`);
    }
}

// Traduce con Gemini una frase in linguaggio naturale e popola la Staging Area
async function handleNaturalLanguageAiFallback(rawText, termInput) {
    if (typeof translateNaturalLanguageToDslWithGemini !== 'function') return;

    const prevEl = document.getElementById('terminal-live-preview');
    if (prevEl) {
        prevEl.style.display = 'flex';
        prevEl.innerHTML = `<span style="color:var(--accent-gold); font-weight:bold;">[◈ AI TRANSLATING TO DSL...] "${escapeHtml(rawText)}"</span>`;
    }
    if (termInput) termInput.disabled = true;

    try {
        const commands = await translateNaturalLanguageToDslWithGemini(rawText);
        if (termInput) {
            termInput.disabled = false;
            termInput.value = '';
            termInput.focus();
        }
        hideSuggestionsAndPreview();

        if (Array.isArray(commands) && commands.length > 0) {
            pushCommandsToStaging(commands);
            showToast(`[AI ➔ STAGING] ${commands.length} command(s) ready — Press [ENTER] to confirm`);
        } else {
            showToast(`[AI] Could not extract actionable commands from input`);
        }
    } catch (err) {
        if (termInput) {
            termInput.disabled = false;
            termInput.focus();
        }
        hideSuggestionsAndPreview();
        showToast(`[AI ERROR] ${err.message}`);
    }
}

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

        termInput.addEventListener('keydown', async (e) => {
            if (e.key === 'Tab') {
                if (activeSuggestions.length > 0) {
                    e.preventDefault();
                    applySuggestionAtIndex(selectedSuggestionIdx);
                }
                return;
            }

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

            if (e.key === 'ArrowUp' && e.shiftKey) {
                e.preventDefault();
                const currentRaw = termInput.value;
                const parts = currentRaw.split('+');
                const lastToken = parts[parts.length - 1].trim();

                let resolvedMod = null;
                if (activeSuggestions.length > 0 && activeSuggestions[selectedSuggestionIdx] && activeSuggestions[selectedSuggestionIdx].moduleKey) {
                    resolvedMod = activeSuggestions[selectedSuggestionIdx].moduleKey;
                } else if (typeof resolveModuleKeyFromText === 'function') {
                    resolvedMod = resolveModuleKeyFromText(lastToken);
                }

                if (resolvedMod) {
                    const prevMods = parts.slice(0, -1).map(s => s.trim()).filter(Boolean);
                    if (!prevMods.includes(resolvedMod)) prevMods.push(resolvedMod);
                    termInput.value = prevMods.join(' + ') + ' + ';
                    selectedSuggestionIdx = 0;
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

            if (e.key === 'Escape') {
                e.preventDefault();
                if (isStagingActive) {
                    cancelStaging();
                    return;
                }
                closeTerminal();
                return;
            }

            if (e.key === 'Enter') {
                e.preventDefault();
                const rawVal = termInput.value.trim();

                if (!rawVal) {
                    if (isStagingActive) confirmStagingCommands();
                    return;
                }

                commandHistory.push(rawVal);
                historyIndex = commandHistory.length;

                const matchedAliasMacro = (typeof customAliases !== 'undefined' && customAliases[rawVal.toLowerCase()])
                    ? customAliases[rawVal.toLowerCase()]
                    : null;

                if (e.shiftKey && matchedAliasMacro) {
                    const aliasParts = matchedAliasMacro.split(';').map(s => s.trim()).filter(Boolean);
                    pushCommandsToStaging(aliasParts);
                    termInput.value = '';
                    hideSuggestionsAndPreview();
                    return;
                }

                if (e.shiftKey || rawVal.includes(';')) {
                    const parts = rawVal.split(';').map(s => s.trim()).filter(Boolean);
                    pushCommandsToStaging(parts);
                    termInput.value = '';
                    hideSuggestionsAndPreview();
                    return;
                }

                // Verifica se è un comando DSL deterministico valido
                const isDirectDsl = typeof isValidDslCommand === 'function' && isValidDslCommand(rawVal);

                // Se NON è un comando DSL valido -> Invia automaticamente all'AI e popola la Staging Area (1A1)
                if (!isDirectDsl) {
                    await handleNaturalLanguageAiFallback(rawVal, termInput);
                    return;
                }

                if (isStagingActive) {
                    pushCommandsToStaging([rawVal]);
                    termInput.value = '';
                    hideSuggestionsAndPreview();
                    confirmStagingCommands();
                    return;
                }

                const isInspection = typeof isInspectionOnlyCommand === 'function' && isInspectionOnlyCommand(rawVal);
                const firstWord = rawVal.split(/\s+/)[0].toLowerCase();
                const modalCommands = ['?', 'help', 'ledger', 'stats', 'food', 'macros', 'vault', 'settings', 'cfg'];

                const ok = executeTerminalCommand(rawVal);
                const answerBox = document.getElementById('terminal-ai-answer');
                const hasInspectionCardOpen = isInspection || (answerBox && answerBox.style.display === 'block');
                const anyModalNowOpen = Array.from(document.querySelectorAll('.modal-overlay')).some(m => m.style.display === 'flex');

                if (ok) {
                    if (hasInspectionCardOpen) {
                        termInput.select();
                        hideSuggestionsAndPreview();
                    } else if (!modalCommands.includes(firstWord) && !anyModalNowOpen) {
                        closeTerminal();
                    } else if (anyModalNowOpen) {
                        isAskBarExpanded = false;
                        const container = document.getElementById('ask-bar-container');
                        const backdrop = document.getElementById('terminalOverlay');
                        if (container) container.classList.remove('expanded');
                        if (backdrop) backdrop.classList.remove('show');
                        termInput.value = '';
                        termInput.blur();
                        hideSuggestionsAndPreview();
                    }
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
            showToast('[SYSTEM] All data saved');
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