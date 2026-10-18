// --- js/ai/terminal-ui.js ---
let toastTimeout;
let commandHistory = [];
let historyIndex = -1;

let isRecordingVoice = false;
let isStagingActive = false;
let isAskBarExpanded = false;
let stagedCommands = [];
let mediaRecorder = null;
let audioChunks = [];

let isHeyTrackerEnabled = localStorage.getItem('tracker_hey_enabled') !== 'false';
let sharedMicStream = null;
let sharedAudioCtx = null;
let sharedAnalyser = null;

let bgWakeLoopTimer = null;
let bgRollingRecorder = null;
let bgHeaderChunk = null;
let bgPreRollChunks = [];
let bgSpeechChunks = [];
let bgIsCapturingSpeech = false;
let bgIsEvaluating = false;
let bgSpeechStartMs = 0;
let bgLastLoudMs = 0;

let verdictLoopTimer = null;
let verdictRecorder = null;
let isVerdictCapturing = false;
let isVerdictEvaluating = false;
let vadInterval = null;

function showToast(msg) {
    const toast = document.getElementById('terminal-toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => { toast.classList.remove('show'); }, 3200);
}

async function bringAppWindowToFront() {
    try {
        if (window.__TAURI__ && window.__TAURI__.window) {
            const appWin = window.__TAURI__.window.getCurrentWindow();
            if (appWin.unminimize) await appWin.unminimize();
            if (appWin.show) await appWin.show();
            if (appWin.setFocus) await appWin.setFocus();
        }
        window.focus();
    } catch (e) {}
}

function handleGeminiKeyInput(val) {
    saveGeminiKey(val);
    updateGeminiKeyStatusUI();
    if (geminiApiKey && isHeyTrackerEnabled) {
        startNativeHeyTrackerStandby();
    }
}

function updateGeminiKeyStatusUI() {
    const inp = document.getElementById('gemini-api-key-input');
    const status = document.getElementById('gemini-key-status');
    if (inp && inp.value !== geminiApiKey) inp.value = geminiApiKey;
    if (status) {
        status.textContent = geminiApiKey ? '[ACTIVE: GEMINI AI AGENT]' : '[NO API KEY]';
        status.style.color = geminiApiKey ? 'var(--accent-green)' : 'var(--accent-red)';
    }
    updateAskStatusDot('standby');
}

// Gestione del puntino di stato (●) a destra della barra
function updateAskStatusDot(state = 'standby') {
    const dot = document.getElementById('ask-status-dot');
    if (!dot) return;

    dot.className = 'ask-status-dot';
    if (!geminiApiKey) {
        dot.classList.add('state-off');
        dot.title = 'AI Voice Standby: Missing Gemini API Key in Settings';
        return;
    }
    if (!isHeyTrackerEnabled && !isRecordingVoice && !bgIsEvaluating) {
        dot.classList.add('state-off');
        dot.title = 'Voice standby PAUSED (Click to enable)';
        return;
    }

    if (state === 'recording' || isRecordingVoice) {
        dot.classList.add('state-recording');
        dot.title = 'Listening to your voice... (Click to stop)';
    } else if (state === 'processing' || bgIsEvaluating) {
        dot.classList.add('state-processing');
        dot.title = 'Processing query... Click to ABORT instantly';
    } else if (state === 'standby') {
        dot.classList.add('state-standby');
        dot.title = 'Always-On Standby: Say "Hey Tracker" or click to speak';
    }
}

function toggleHeyTrackerStandbyState() {
    isHeyTrackerEnabled = !isHeyTrackerEnabled;
    localStorage.setItem('tracker_hey_enabled', isHeyTrackerEnabled ? 'true' : 'false');
    if (isHeyTrackerEnabled) {
        startNativeHeyTrackerStandby();
        showToast('[HEY TRACKER] Always-On voice standby ENABLED');
    } else {
        stopNativeHeyTrackerStandby();
        showToast('[HEY TRACKER] Voice standby PAUSED');
    }
    updateAskStatusDot('standby');
}

function handleStatusDotClick(e) {
    e.stopPropagation();
    // Se sta elaborando (giallo), un click interrompe/annulla all'istante la richiesta Gemini
    if (bgIsEvaluating || (typeof isGeminiProcessing !== 'undefined' && isGeminiProcessing) || document.getElementById('ask-status-dot')?.classList.contains('state-processing')) {
        if (typeof abortActiveGeminiRequest === 'function') abortActiveGeminiRequest();
        closeTerminal();
        showToast('[ABORTED] Request cancelled.');
        return;
    }
    if (isRecordingVoice) {
        stopVoiceRecordingAndProcess();
    } else {
        openTerminal(true);
    }
}

async function ensureSharedMicAnalyser() {
    if (sharedMicStream && sharedMicStream.active && sharedAnalyser) {
        if (sharedAudioCtx && sharedAudioCtx.state === 'suspended') {
            await sharedAudioCtx.resume();
        }
        return true;
    }
    try {
        sharedMicStream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        sharedAudioCtx = new AudioCtx();
        const source = sharedAudioCtx.createMediaStreamSource(sharedMicStream);
        sharedAnalyser = sharedAudioCtx.createAnalyser();
        sharedAnalyser.fftSize = 512;
        source.connect(sharedAnalyser);
        return true;
    } catch (e) {
        return false;
    }
}

function readCurrentMicRms() {
    if (!sharedAnalyser) return 0;
    const data = new Uint8Array(sharedAnalyser.fftSize);
    sharedAnalyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
    }
    return Math.sqrt(sum / data.length);
}

// Motore nativo Standby "Hey Tracker" con pre-roll
async function startNativeHeyTrackerStandby() {
    stopNativeHeyTrackerStandby();
    if (!isHeyTrackerEnabled || !geminiApiKey) {
        updateAskStatusDot('off');
        return;
    }

    if (isAskBarExpanded || isRecordingVoice || isStagingActive) return;

    const ok = await ensureSharedMicAnalyser();
    if (!ok) {
        updateAskStatusDot('off');
        return;
    }

    try {
        bgHeaderChunk = null;
        bgPreRollChunks = [];
        bgSpeechChunks = [];
        bgIsCapturingSpeech = false;

        bgRollingRecorder = new MediaRecorder(sharedMicStream);
        bgRollingRecorder.ondataavailable = (e) => {
            if (!e.data || e.data.size === 0) return;
            if (!bgHeaderChunk) {
                bgHeaderChunk = e.data;
                return;
            }
            if (bgIsCapturingSpeech) {
                bgSpeechChunks.push(e.data);
            } else {
                bgPreRollChunks.push(e.data);
                if (bgPreRollChunks.length > 3) bgPreRollChunks.shift();
            }
        };

        bgRollingRecorder.start(250);
        updateAskStatusDot('standby');

        let loudFrames = 0;
        bgWakeLoopTimer = setInterval(async () => {
            if (!isHeyTrackerEnabled || bgIsEvaluating || isRecordingVoice || isStagingActive || isAskBarExpanded) return;

            const rms = readCurrentMicRms();
            const now = Date.now();

            if (!bgIsCapturingSpeech) {
                if (rms > 0.028) {
                    loudFrames++;
                    if (loudFrames >= 2) {
                        bgIsCapturingSpeech = true;
                        bgSpeechStartMs = now;
                        bgLastLoudMs = now;
                        bgSpeechChunks = [...bgPreRollChunks];
                        bgPreRollChunks = [];
                        loudFrames = 0;
                        updateAskStatusDot('recording');
                    }
                } else {
                    loudFrames = 0;
                }
            } else {
                if (rms > 0.022) bgLastLoudMs = now;
                const silentDuration = now - bgLastLoudMs;
                const totalSpeechDuration = now - bgSpeechStartMs;

                if (silentDuration > 1300 || totalSpeechDuration > 9000) {
                    bgIsCapturingSpeech = false;

                    if (totalSpeechDuration < 650 || bgSpeechChunks.length < 2) {
                        bgSpeechChunks = [];
                        updateAskStatusDot('standby');
                        return;
                    }

                    bgIsEvaluating = true;
                    updateAskStatusDot('processing');

                    const mimeType = bgRollingRecorder.mimeType || 'audio/webm';
                    const blobParts = bgHeaderChunk ? [bgHeaderChunk, ...bgSpeechChunks] : [...bgSpeechChunks];
                    const fullBlob = new Blob(blobParts, { type: mimeType });
                    bgSpeechChunks = [];

                    stopNativeHeyTrackerStandby();
                    const res = await queryOrRefineWithGemini({
                        audioBlob: fullBlob,
                        mimeType: mimeType,
                        isWakeWordCheck: true
                    });
                    bgIsEvaluating = false;

                    if (!res || !res.wakeWordDetected) {
                        startNativeHeyTrackerStandby();
                    }
                }
            }
        }, 90);
    } catch (e) {
        updateAskStatusDot('off');
    }
}

function stopNativeHeyTrackerStandby() {
    if (bgWakeLoopTimer) {
        clearInterval(bgWakeLoopTimer);
        bgWakeLoopTimer = null;
    }
    if (bgRollingRecorder && bgRollingRecorder.state !== 'inactive') {
        try { bgRollingRecorder.stop(); } catch (e) {}
    }
    bgRollingRecorder = null;
    bgIsCapturingSpeech = false;
    updateAskStatusDot('standby');
}

// Apertura ed espansione fluida della barra "Ask anything"
function openTerminal(autoStartVoice = false) {
    stopNativeHeyTrackerStandby();
    cancelStaging();
    stopVoiceRecordingSilently();

    isAskBarExpanded = true;
    const container = document.getElementById('ask-bar-container');
    const backdrop = document.getElementById('terminalOverlay');
    const input = document.getElementById('terminal-input');
    const answerBox = document.getElementById('terminal-ai-answer');

    if (container) container.classList.add('expanded');
    if (backdrop) backdrop.classList.add('show');

    if (answerBox) {
        answerBox.style.display = 'none';
        answerBox.innerHTML = '';
    }

    if (input) {
        input.value = '';
        setTimeout(() => {
            input.focus();
            if (autoStartVoice) startVoiceRecording();
        }, 80);
    }
    historyIndex = commandHistory.length;
}

function closeTerminal() {
    stopVoiceRecordingSilently();
    stopStagingVerdictListener();
    cancelStaging();

    isAskBarExpanded = false;
    const container = document.getElementById('ask-bar-container');
    const backdrop = document.getElementById('terminalOverlay');
    const input = document.getElementById('terminal-input');
    const answerBox = document.getElementById('terminal-ai-answer');

    if (container) container.classList.remove('expanded');
    if (backdrop) backdrop.classList.remove('show');
    if (input) input.blur();
    if (answerBox) answerBox.style.display = 'none';

    setTimeout(startNativeHeyTrackerStandby, 350);
}
function openShortcutsHelp() {
    closeTerminal();
    closeModals();
    const modal = document.getElementById('shortcutsHelpModal');
    if (modal) modal.style.display = 'flex';
}

// ============================================================================
// 3. STAGING AREA + VERDETTO VOCALE NATIVO ("VA BENE" / "RITENTA" / "ANNULLA")
// ============================================================================

function openStagingArea(transcriptText, commandsArray) {
    const stagingBox = document.getElementById('terminal-staging');
    const transcriptEl = document.getElementById('staging-transcript-box');
    const input = document.getElementById('terminal-input');
    if (!stagingBox || !transcriptEl) return;

    isStagingActive = true;
    stagedCommands = (commandsArray || []).map(c => c.trim()).filter(Boolean);

    // Mostra subito la query trascritta anche nella barra principale
    if (input && transcriptText) {
        input.value = transcriptText;
    }

    transcriptEl.innerHTML = `<strong style="color:var(--text-main);">TRANSCRIPT //</strong> "${escapeHtml(transcriptText)}"`;
    stagingBox.style.display = 'flex';
    renderStagingCommandList();
    updateAskStatusDot('standby');

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

// Ascolta "Va bene" / "Procedi" / "Ritenta" / "Annulla" tramite microfono nativo + Gemini
async function startStagingVerdictListener() {
    stopStagingVerdictListener();
    if (!geminiApiKey) return;

    const statusEl = document.getElementById('staging-voice-verdict-status');
    const ok = await ensureSharedMicAnalyser();
    if (!ok) return;

    if (statusEl) statusEl.textContent = '[● LISTENING: SAY "VA BENE" OR "RITENTA"]';
    updateAskStatusDot('standby');

    let vHeader = null;
    let vPreRoll = [];
    let vSpeech = [];
    let vStartMs = 0;
    let vLastLoudMs = 0;
    let vLoudFrames = 0;
    isVerdictCapturing = false;
    isVerdictEvaluating = false;

    try {
        verdictRecorder = new MediaRecorder(sharedMicStream);
        verdictRecorder.ondataavailable = (e) => {
            if (!e.data || e.data.size === 0) return;
            if (!vHeader) {
                vHeader = e.data;
                return;
            }
            if (isVerdictCapturing) {
                vSpeech.push(e.data);
            } else {
                vPreRoll.push(e.data);
                if (vPreRoll.length > 3) vPreRoll.shift();
            }
        };
        verdictRecorder.start(200);

        verdictLoopTimer = setInterval(async () => {
            if (!isStagingActive || isVerdictEvaluating) return;

            const rms = readCurrentMicRms();
            const now = Date.now();

            if (!isVerdictCapturing) {
                if (rms > 0.028) {
                    vLoudFrames++;
                    if (vLoudFrames >= 2) {
                        isVerdictCapturing = true;
                        vStartMs = now;
                        vLastLoudMs = now;
                        vSpeech = [...vPreRoll];
                        vPreRoll = [];
                        vLoudFrames = 0;
                        updateAskStatusDot('recording');
                        if (statusEl) statusEl.textContent = '[● HEARING VERDICT...]';
                    }
                } else {
                    vLoudFrames = 0;
                }
            } else {
                if (rms > 0.022) vLastLoudMs = now;
                const silentMs = now - vLastLoudMs;
                const totalMs = now - vStartMs;

                if (silentMs > 1000 || totalMs > 4000) {
                    isVerdictCapturing = false;
                    if (totalMs < 380 || vSpeech.length === 0) {
                        vSpeech = [];
                        updateAskStatusDot('standby');
                        if (statusEl) statusEl.textContent = '[● LISTENING: SAY "VA BENE" OR "RITENTA"]';
                        return;
                    }

                    isVerdictEvaluating = true;
                    updateAskStatusDot('processing');
                    if (statusEl) statusEl.textContent = '[● PROCESSING VERDICT...]';

                    const mimeType = verdictRecorder.mimeType || 'audio/webm';
                    const blobParts = vHeader ? [vHeader, ...vSpeech] : [...vSpeech];
                    const verdictBlob = new Blob(blobParts, { type: mimeType });
                    vSpeech = [];

                    const verdict = await evaluateSpokenStagingVerdict(verdictBlob, mimeType);
                    isVerdictEvaluating = false;

                    if (!isStagingActive) return;

                    if (verdict === 'confirm') {
                        stopStagingVerdictListener();
                        confirmStagingCommands();
                    } else if (verdict === 'retry') {
                        stopStagingVerdictListener();
                        retryVoiceCapture();
                    } else if (verdict === 'cancel') {
                        stopStagingVerdictListener();
                        closeTerminal();
                    } else {
                        updateAskStatusDot('standby');
                        if (statusEl) statusEl.textContent = '[● LISTENING: SAY "VA BENE" OR "RITENTA"]';
                    }
                }
            }
        }, 85);
    } catch (e) {}
}

function stopStagingVerdictListener() {
    const statusEl = document.getElementById('staging-voice-verdict-status');
    if (statusEl) statusEl.textContent = '';
    if (verdictLoopTimer) {
        clearInterval(verdictLoopTimer);
        verdictLoopTimer = null;
    }
    if (verdictRecorder && verdictRecorder.state !== 'inactive') {
        try { verdictRecorder.stop(); } catch (e) {}
    }
    verdictRecorder = null;
    isVerdictCapturing = false;
    isVerdictEvaluating = false;
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
    const modalCommands = ['?', 'help', 'plan', 'tomorrow', 'ledger', 'stats', 'food', 'macros', 'vault', 'settings', 'cfg'];

    validCmds.forEach(cmd => {
        const firstWord = cmd.split(/\s+/)[0].toLowerCase();
        if (modalCommands.includes(firstWord)) shouldKeepOpen = true;
        if (executeTerminalCommand(cmd)) executedCount++;
    });

    cancelStaging();
    if (!shouldKeepOpen) closeTerminal();
    if (executedCount > 0) showToast(`[CONFIRMED] Executed ${executedCount} action(s)`);
}

function retryVoiceCapture() {
    cancelStaging();
    const answerBox = document.getElementById('terminal-ai-answer');
    if (answerBox) {
        answerBox.style.display = 'none';
        answerBox.innerHTML = '';
    }
    const input = document.getElementById('terminal-input');
    if (input) input.value = '';
    startVoiceRecording();
}

// ============================================================================
// 4. REGISTRAZIONE VOCALE ATTIVA CON LIVE PREVIEW & AUTO-SILENCE STOP
// ============================================================================

let liveSpeechRecognizer = null;

function startLiveBrowserPreview() {
    stopLiveBrowserPreview();
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) return;
    try {
        liveSpeechRecognizer = new SpeechRec();
        liveSpeechRecognizer.lang = 'it-IT';
        liveSpeechRecognizer.continuous = true;
        liveSpeechRecognizer.interimResults = true;
        liveSpeechRecognizer.onresult = (event) => {
            if (!isRecordingVoice) return;
            let liveText = '';
            for (let i = 0; i < event.results.length; i++) {
                liveText += event.results[i][0].transcript;
            }
            const input = document.getElementById('terminal-input');
            if (input && liveText.trim()) {
                input.value = liveText.trim();
            }
        };
        liveSpeechRecognizer.start();
    } catch (e) {}
}

function stopLiveBrowserPreview() {
    if (liveSpeechRecognizer) {
        try { liveSpeechRecognizer.stop(); } catch (e) {}
        liveSpeechRecognizer = null;
    }
}

function toggleVoiceCapture() {
    if (isRecordingVoice) {
        stopVoiceRecordingAndProcess();
    } else {
        startVoiceRecording();
    }
}

function setMicButtonUI(recording) {
    isRecordingVoice = recording;
    const input = document.getElementById('terminal-input');
    if (recording) {
        updateAskStatusDot('recording');
        if (input) input.placeholder = 'Listening... speak naturally (auto-sends on silence)';
    } else {
        if (input) input.placeholder = 'Ask anything';
    }
}

function cleanupVadMonitor() {
    if (vadInterval) {
        clearInterval(vadInterval);
        vadInterval = null;
    }
}

function stopVoiceRecordingSilently() {
    cleanupVadMonitor();
    stopLiveBrowserPreview();
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.onstop = null;
        try { mediaRecorder.stop(); } catch (e) {}
    }
    setMicButtonUI(false);
}

function attachSilenceDetector() {
    cleanupVadMonitor();
    let hasSpoken = false;
    let silenceStart = Date.now();
    const recordingStart = Date.now();

    vadInterval = setInterval(() => {
        if (!isRecordingVoice) {
            cleanupVadMonitor();
            return;
        }
        const rms = readCurrentMicRms();

        if (rms > 0.024) {
            hasSpoken = true;
            silenceStart = Date.now();
        } else {
            const silentMs = Date.now() - silenceStart;
            const totalMs = Date.now() - recordingStart;
            if ((hasSpoken && silentMs > 1400) || (!hasSpoken && totalMs > 6000)) {
                stopVoiceRecordingAndProcess();
            }
        }
    }, 90);
}

async function startVoiceRecording() {
    stopNativeHeyTrackerStandby();
    stopStagingVerdictListener();
    cancelStaging();

    if (!geminiApiKey) {
        showToast('[AI VOICE] Add your Gemini API Key in [SETTINGS] -> AI & Voice');
        openSettingsModal('tab-ai');
        return;
    }

    const ok = await ensureSharedMicAnalyser();
    if (!ok) {
        setMicButtonUI(false);
        return;
    }

    try {
        audioChunks = [];
        mediaRecorder = new MediaRecorder(sharedMicStream);

        mediaRecorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) audioChunks.push(e.data);
        };

        mediaRecorder.onstop = async () => {
            cleanupVadMonitor();
            stopLiveBrowserPreview();
            updateAskStatusDot('processing');

            const mimeType = mediaRecorder.mimeType || 'audio/webm';
            const audioBlob = new Blob(audioChunks, { type: mimeType });
            await queryOrRefineWithGemini({ audioBlob, mimeType, isWakeWordCheck: false });
        };

        mediaRecorder.start();
        setMicButtonUI(true);
        startLiveBrowserPreview();
        attachSilenceDetector();
    } catch (err) {
        setMicButtonUI(false);
    }
}

function stopVoiceRecordingAndProcess() {
    if (!isRecordingVoice) return;
    cleanupVadMonitor();
    stopLiveBrowserPreview();
    isRecordingVoice = false;
    updateAskStatusDot('processing');
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        try { mediaRecorder.stop(); } catch (e) {}
    }
}

// ============================================================================
// EVENT LISTENERS & SCORCIATOIE GLOBALI
// ============================================================================

window.addEventListener('DOMContentLoaded', () => {
    updateGeminiKeyStatusUI();
    setTimeout(startNativeHeyTrackerStandby, 900);

    const termInput = document.getElementById('terminal-input');

    if (termInput) {
        termInput.addEventListener('focus', () => {
            if (!isAskBarExpanded) openTerminal(false);
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
                if (e.key === 'Escape') { e.preventDefault(); cancelStaging(); closeTerminal(); return; }
            }

            if (e.key === 'Enter') {
                e.preventDefault();
                const rawVal = termInput.value.trim();
                if (!rawVal) return;

                commandHistory.push(rawVal);
                historyIndex = commandHistory.length;

                const firstWord = rawVal.split(/\s+/)[0].toLowerCase();
                if (firstWord === 'ai' && geminiApiKey) {
                    queryOrRefineWithGemini({ rawText: rawVal.slice(2).trim(), isWakeWordCheck: false });
                    return;
                }

                const ok = executeTerminalCommand(rawVal);
                if (ok) {
                    const modalCommands = ['?', 'help', 'plan', 'tomorrow', 'ledger', 'stats', 'food', 'macros', 'vault', 'settings', 'cfg'];
                    if (!modalCommands.includes(firstWord)) closeTerminal();
                } else if (geminiApiKey) {
                    queryOrRefineWithGemini({ rawText: rawVal, isWakeWordCheck: false });
                } else {
                    showToast('Unknown command. Type ? for manual or add Gemini Key in Settings.');
                }
            } else if (e.key === 'Escape') {
                e.preventDefault();
                if (typeof abortActiveGeminiRequest === 'function') abortActiveGeminiRequest();
                closeTerminal();
            } else if (e.key === 'ArrowUp') {
                if (commandHistory.length > 0 && historyIndex > 0) {
                    e.preventDefault();
                    historyIndex--;
                    termInput.value = commandHistory[historyIndex];
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
            if (isAskBarExpanded) closeTerminal();
            else openTerminal(false);
            return;
        }

        if (e.ctrlKey && e.key.toLowerCase() === 's') {
            e.preventDefault();
            saveData(); saveMoneyData(); saveHealthData(); saveWorkspaceState();
            showToast('[SYSTEM] All data saved to storage');
            return;
        }

        if (e.key === 'Escape') {
            if (typeof abortActiveGeminiRequest === 'function' && typeof isGeminiProcessing !== 'undefined' && isGeminiProcessing) {
                abortActiveGeminiRequest();
                closeTerminal();
                showToast('[ABORTED] AI request cancelled');
                return;
            }
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