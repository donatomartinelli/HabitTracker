// --- js/ai/terminal-ui.js ---
// Command Bar UI, Loop Hands-Free "Hey Tracker", Rilevamento Silenzio (VAD) & Verdetto Vocale ("Va bene" / "Ritenta")

let toastTimeout;
let commandHistory = [];
let historyIndex = -1;

let isRecordingVoice = false;
let isStagingActive = false;
let stagedCommands = [];
let mediaRecorder = null;
let audioChunks = [];
let speechRecInstance = null;

// Stato per Wake Word "Hey Tracker", Rilevamento Silenzio e Conferma Vocale Staging
let isHeyTrackerEnabled = true;
let wakeWordRec = null;
let wakeWordActive = false;
let verdictRec = null;
let vadAudioContext = null;
let vadInterval = null;

function showToast(msg) {
    const toast = document.getElementById('terminal-toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => { toast.classList.remove('show'); }, 3200);
}

function handleGeminiKeyInput(val) {
    saveGeminiKey(val);
    updateGeminiKeyStatusUI();
}

function updateGeminiKeyStatusUI() {
    const inp = document.getElementById('gemini-api-key-input');
    const status = document.getElementById('gemini-key-status');
    if (inp && inp.value !== geminiApiKey) inp.value = geminiApiKey;
    if (status) {
        status.textContent = geminiApiKey ? '[ACTIVE: GEMINI AI AGENT]' : '[STANDARD MODE]';
        status.style.color = geminiApiKey ? 'var(--accent-green)' : 'var(--text-dim)';
    }
}

function openTerminal(autoStartVoice = false) {
    const overlay = document.getElementById('terminalOverlay');
    const input = document.getElementById('terminal-input');
    const feedback = document.getElementById('terminal-feedback');
    const answerBox = document.getElementById('terminal-ai-answer');
    if (!overlay || !input) return;

    stopWakeWordListener();
    cancelStaging();
    stopVoiceRecordingSilently();

    if (answerBox) {
        answerBox.style.display = 'none';
        answerBox.innerHTML = '';
    }

    overlay.style.display = 'flex';
    input.value = '';
    historyIndex = commandHistory.length;

    if (feedback) {
        feedback.textContent = geminiApiKey
            ? 'AI Ready. Ask a question ("Cosa mangio oggi?"), type a command, or speak.'
            : 'Ready. Press [Enter] to execute, [VOICE] to speak, [?] for manual.';
        feedback.style.color = 'var(--text-dim)';
    }

    setTimeout(() => {
        input.focus();
        if (autoStartVoice) startVoiceRecording();
    }, 20);
}

function closeTerminal() {
    stopVoiceRecordingSilently();
    stopStagingVerdictListener();
    cancelStaging();

    const overlay = document.getElementById('terminalOverlay');
    const input = document.getElementById('terminal-input');
    const answerBox = document.getElementById('terminal-ai-answer');
    if (overlay) overlay.style.display = 'none';
    if (input) input.blur();
    if (answerBox) answerBox.style.display = 'none';

    // Riattiva l'ascolto passivo "Hey Tracker" quando il terminale si chiude
    setTimeout(startWakeWordListener, 400);
}

function openShortcutsHelp() {
    closeTerminal();
    closeModals();
    const modal = document.getElementById('shortcutsHelpModal');
    if (modal) modal.style.display = 'flex';
}

// ============================================================================
// STAGING AREA + ASCOLTO AUTOMATICO DEL VERDETTO ("VA BENE" / "RITENTA")
// ============================================================================

function openStagingArea(transcriptText, commandsArray) {
    const stagingBox = document.getElementById('terminal-staging');
    const transcriptEl = document.getElementById('staging-transcript-box');
    const feedback = document.getElementById('terminal-feedback');
    if (!stagingBox || !transcriptEl) return;

    isStagingActive = true;
    stagedCommands = (commandsArray || []).map(c => c.trim()).filter(Boolean);

    transcriptEl.innerHTML = `<strong style="color:var(--text-main);">INPUT // TRANSCRIPT:</strong> "${escapeHtml(transcriptText)}"`;
    stagingBox.style.display = 'flex';
    renderStagingCommandList();

    if (feedback) {
        feedback.textContent = 'Say "VA BENE" (or press Enter) to Confirm, "RITENTA" (or R) to Retry, "ANNULLA" (or Esc) to Cancel.';
        feedback.style.color = 'var(--accent-green)';
    }

    // Avvia l'ascolto vocale per "Va bene" / "Ritenta" / "Annulla"
    startStagingVerdictListener();
}

function renderStagingCommandList() {
    const listEl = document.getElementById('staging-cmd-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    if (stagedCommands.length === 0) {
        listEl.innerHTML = '<div class="empty-state" style="padding:4px 0;">[ NO VALID COMMANDS EXTRACTED — SAY "RITENTA" OR PRESS [R] ]</div>';
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

function startStagingVerdictListener() {
    stopStagingVerdictListener();
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    const statusEl = document.getElementById('staging-voice-verdict-status');
    if (!SpeechRec) return;

    try {
        verdictRec = new SpeechRec();
        verdictRec.lang = 'it-IT';
        verdictRec.continuous = true;
        verdictRec.interimResults = true;

        verdictRec.onstart = () => {
            if (statusEl) statusEl.textContent = '[● LISTENING: "VA BENE" / "RITENTA"]';
        };

        verdictRec.onresult = (event) => {
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                const phrase = event.results[i][0].transcript.toLowerCase().trim();
                if (phrase.includes('va bene') || phrase.includes('conferma') || phrase.includes('esegui') || phrase === 'sì' || phrase === 'si' || phrase === 'ok') {
                    stopStagingVerdictListener();
                    confirmStagingCommands();
                    return;
                }
                if (phrase.includes('ritenta') || phrase.includes('riprova') || phrase.includes('rifai')) {
                    stopStagingVerdictListener();
                    retryVoiceCapture();
                    return;
                }
                if (phrase.includes('annulla') || phrase.includes('cancella') || phrase.includes('chiudi')) {
                    stopStagingVerdictListener();
                    closeTerminal();
                    return;
                }
            }
        };

        verdictRec.onerror = () => {
            if (statusEl) statusEl.textContent = '';
        };

        verdictRec.onend = () => {
            if (isStagingActive && verdictRec) {
                try { verdictRec.start(); } catch (e) {}
            } else if (statusEl) {
                statusEl.textContent = '';
            }
        };

        verdictRec.start();
    } catch (e) {}
}

function stopStagingVerdictListener() {
    const statusEl = document.getElementById('staging-voice-verdict-status');
    if (statusEl) statusEl.textContent = '';
    if (verdictRec) {
        const r = verdictRec;
        verdictRec = null;
        try { r.abort(); } catch (e) {}
    }
}

function cancelStaging() {
    stopStagingVerdictListener();
    isStagingActive = false;
    stagedCommands = [];
    const stagingBox = document.getElementById('terminal-staging');
    if (stagingBox) stagingBox.style.display = 'none';
}

function confirmStagingCommands() {
    if (!isStagingActive) return;
    stopStagingVerdictListener();

    const validCmds = stagedCommands.map(c => c.trim()).filter(Boolean);
    if (validCmds.length === 0) {
        cancelStaging();
        return;
    }

    let executedCount = 0;
    let shouldKeepOpen = false;
    const modalCommands = ['?', 'help', 'plan', 'tomorrow', 'ledger', 'stats', 'food', 'macros', 'vault'];

    validCmds.forEach(cmd => {
        const firstWord = cmd.split(/\s+/)[0].toLowerCase();
        if (modalCommands.includes(firstWord)) shouldKeepOpen = true;
        if (executeTerminalCommand(cmd)) executedCount++;
    });

    cancelStaging();
    if (!shouldKeepOpen) closeTerminal();
    if (executedCount > 1) showToast(`[CONFIRMED] Executed ${executedCount} actions`);
}

function retryVoiceCapture() {
    cancelStaging();
    const input = document.getElementById('terminal-input');
    if (input) input.value = '';
    startVoiceRecording();
}

// ============================================================================
// REGISTRAZIONE VOCALE CON RILEVAMENTO AUTOMATICO DEL SILENZIO (ZERO-CLICK)
// ============================================================================

function toggleVoiceCapture() {
    if (isRecordingVoice) {
        stopVoiceRecordingAndProcess();
    } else {
        startVoiceRecording();
    }
}

function setMicButtonUI(recording) {
    isRecordingVoice = recording;
    const btn = document.getElementById('btn-terminal-mic');
    const feedback = document.getElementById('terminal-feedback');
    if (btn) {
        btn.classList.toggle('recording', recording);
        btn.textContent = recording ? '[● LISTENING... AUTO-SEND ON SILENCE]' : '[VOICE // MIC]';
    }
    if (recording && feedback) {
        feedback.textContent = 'Speak naturally in Italian... (Auto-sends when you pause speaking, or press Enter)';
        feedback.style.color = 'var(--accent-red)';
    }
}

function cleanupVadMonitor() {
    if (vadInterval) {
        clearInterval(vadInterval);
        vadInterval = null;
    }
    if (vadAudioContext) {
        try { vadAudioContext.close(); } catch (e) {}
        vadAudioContext = null;
    }
}

function stopVoiceRecordingSilently() {
    cleanupVadMonitor();
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.onstop = null;
        mediaRecorder.stop();
    }
    if (mediaRecorder && mediaRecorder.stream) {
        mediaRecorder.stream.getTracks().forEach(t => t.stop());
    }
    if (speechRecInstance) {
        try { speechRecInstance.abort(); } catch (e) {}
        speechRecInstance = null;
    }
    setMicButtonUI(false);
}

// Monitora il volume del microfono e ferma automaticamente la registrazione dopo ~1.6s di silenzio
function attachSilenceDetector(stream) {
    cleanupVadMonitor();
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        vadAudioContext = new AudioCtx();
        const source = vadAudioContext.createMediaStreamSource(stream);
        const analyser = vadAudioContext.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);

        const data = new Uint8Array(analyser.fftSize);
        let hasSpoken = false;
        let silenceStart = Date.now();
        const recordingStart = Date.now();

        vadInterval = setInterval(() => {
            if (!isRecordingVoice) {
                cleanupVadMonitor();
                return;
            }
            analyser.getByteTimeDomainData(data);
            let sum = 0;
            for (let i = 0; i < data.length; i++) {
                const v = (data[i] - 128) / 128;
                sum += v * v;
            }
            const rms = Math.sqrt(sum / data.length);

            if (rms > 0.022) {
                hasSpoken = true;
                silenceStart = Date.now();
            } else {
                const silentMs = Date.now() - silenceStart;
                const totalMs = Date.now() - recordingStart;
                // Se hai parlato e fai pausa per 1.6s (oppure 6s di silenzio totale), invia in automatico
                if ((hasSpoken && silentMs > 1650) || (!hasSpoken && totalMs > 6000)) {
                    stopVoiceRecordingAndProcess();
                }
            }
        }, 100);
    } catch (e) {}
}

async function startVoiceRecording() {
    stopWakeWordListener();
    stopStagingVerdictListener();
    cancelStaging();

    if (geminiApiKey) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            audioChunks = [];
            mediaRecorder = new MediaRecorder(stream);

            mediaRecorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) audioChunks.push(e.data);
            };

            mediaRecorder.onstop = async () => {
                cleanupVadMonitor();
                stream.getTracks().forEach(t => t.stop());
                const mimeType = mediaRecorder.mimeType || 'audio/webm';
                const audioBlob = new Blob(audioChunks, { type: mimeType });
                await queryOrRefineWithGemini({ audioBlob, mimeType });
            };

            mediaRecorder.start();
            setMicButtonUI(true);
            attachSilenceDetector(stream);
            return;
        } catch (err) {
            setMicButtonUI(false);
            return;
        }
    }

    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) return;

    try {
        speechRecInstance = new SpeechRec();
        speechRecInstance.lang = 'it-IT';
        speechRecInstance.interimResults = false;
        speechRecInstance.maxAlternatives = 1;

        speechRecInstance.onresult = (event) => {
            const transcript = event.results[0][0].transcript.trim();
            setMicButtonUI(false);
            openStagingArea(transcript, [transcript]);
        };
        speechRecInstance.onerror = () => setMicButtonUI(false);
        speechRecInstance.onend = () => { if (isRecordingVoice) setMicButtonUI(false); };

        speechRecInstance.start();
        setMicButtonUI(true);
    } catch (e) {
        setMicButtonUI(false);
    }
}

function stopVoiceRecordingAndProcess() {
    if (!isRecordingVoice) return;
    cleanupVadMonitor();
    setMicButtonUI(false);
    if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
    if (speechRecInstance) { try { speechRecInstance.stop(); } catch (e) {} }
}

// ============================================================================
// WAKE WORD CONTINUA "HEY TRACKER" (SEMPRE ATTIVA ALL'AVVIO SENZA SUONI)
// ============================================================================

function startWakeWordListener() {
    if (!isHeyTrackerEnabled || wakeWordActive || isRecordingVoice || isStagingActive) return;
    const termOverlay = document.getElementById('terminalOverlay');
    if (termOverlay && termOverlay.style.display === 'flex') return;

    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) return;

    try {
        wakeWordRec = new SpeechRec();
        wakeWordRec.lang = 'it-IT';
        wakeWordRec.continuous = true;
        wakeWordRec.interimResults = true;

        wakeWordRec.onstart = () => { wakeWordActive = true; };

        wakeWordRec.onresult = (event) => {
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                const text = event.results[i][0].transcript.toLowerCase();
                if (
                    text.includes('hey tracker') ||
                    text.includes('ei tracker') ||
                    text.includes('ehi tracker') ||
                    text.includes('ok tracker')
                ) {
                    stopWakeWordListener();
                    openTerminal(true);
                    return;
                }
            }
        };

        wakeWordRec.onerror = () => { wakeWordActive = false; };

        wakeWordRec.onend = () => {
            wakeWordActive = false;
            const isTermOpen = termOverlay && termOverlay.style.display === 'flex';
            if (isHeyTrackerEnabled && !isTermOpen && !isRecordingVoice && !isStagingActive) {
                setTimeout(startWakeWordListener, 800);
            }
        };

        wakeWordRec.start();
    } catch (e) {
        wakeWordActive = false;
    }
}

function stopWakeWordListener() {
    wakeWordActive = false;
    if (wakeWordRec) {
        const r = wakeWordRec;
        wakeWordRec = null;
        try { r.abort(); } catch (e) {}
    }
}

// ============================================================================
// EVENT LISTENERS & SCORCIATOIE GLOBALI
// ============================================================================

window.addEventListener('DOMContentLoaded', () => {
    updateGeminiKeyStatusUI();
    setTimeout(startWakeWordListener, 1200);

    const termInput = document.getElementById('terminal-input');
    const termFeedback = document.getElementById('terminal-feedback');

    if (termInput) {
        termInput.addEventListener('input', () => {
            if (termFeedback && !isStagingActive) {
                termFeedback.textContent = getCommandPreview(termInput.value);
                termFeedback.style.color = 'var(--text-dim)';
            }
        });

        termInput.addEventListener('keydown', (e) => {
            if (isRecordingVoice && e.key === 'Enter') {
                e.preventDefault();
                stopVoiceRecordingAndProcess();
                return;
            }

            if (isStagingActive) {
                if (e.key === 'Enter') { e.preventDefault(); confirmStagingCommands(); return; }
                if (e.key.toLowerCase() === 'r' && !e.ctrlKey) { e.preventDefault(); retryVoiceCapture(); return; }
                if (e.key === 'Escape') { e.preventDefault(); cancelStaging(); return; }
            }

            if (e.key === 'Enter') {
                e.preventDefault();
                const rawVal = termInput.value.trim();
                if (!rawVal) return;

                commandHistory.push(rawVal);
                historyIndex = commandHistory.length;

                const firstWord = rawVal.split(/\s+/)[0].toLowerCase();
                if (firstWord === 'ai' && geminiApiKey) {
                    queryOrRefineWithGemini({ rawText: rawVal.slice(2).trim() });
                    return;
                }

                const ok = executeTerminalCommand(rawVal);
                if (ok) {
                    const modalCommands = ['?', 'help', 'plan', 'tomorrow', 'ledger', 'stats', 'food', 'macros', 'vault'];
                    if (!modalCommands.includes(firstWord)) closeTerminal();
                } else if (geminiApiKey) {
                    // Qualsiasi frase naturale o domanda viene gestita da Gemini Flash
                    queryOrRefineWithGemini({ rawText: rawVal });
                } else if (termFeedback) {
                    termFeedback.textContent = 'Unknown command. Type ? for help or add Gemini API Key in [CFG].';
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
        if (isStagingActive && document.activeElement && !document.activeElement.classList.contains('staging-cmd-input')) {
            if (e.key === 'Enter') { e.preventDefault(); confirmStagingCommands(); return; }
            if (e.key.toLowerCase() === 'r') { e.preventDefault(); retryVoiceCapture(); return; }
        }

        if ((e.ctrlKey && e.code === 'Space') || (e.ctrlKey && e.key.toLowerCase() === 'k')) {
            e.preventDefault();
            const overlay = document.getElementById('terminalOverlay');
            if (overlay && overlay.style.display === 'flex') closeTerminal();
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
            const termOverlay = document.getElementById('terminalOverlay');
            if (termOverlay && termOverlay.style.display === 'flex') {
                if (isStagingActive) cancelStaging();
                else closeTerminal();
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
            case 'v':
            case 'V':
                e.preventDefault();
                openTerminal(true);
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
            case 'w':
            case 'W':
                e.preventDefault();
                if (typeof toggleWeeklyFlexibleDrawer === 'function') toggleWeeklyFlexibleDrawer();
                break;
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