// --- js/ai/terminal-ui.js ---
// Command Bar UI, Motore Nativo Always-On "Hey Tracker" (WebAudio VAD + Pre-Roll + MediaRecorder) & Verdetto Vocale Nativo

let toastTimeout;
let commandHistory = [];
let historyIndex = -1;

let isRecordingVoice = false;
let isStagingActive = false;
let stagedCommands = [];
let mediaRecorder = null;
let audioChunks = [];

// Stato Motore Nativo "Hey Tracker" (Funziona su Tauri Windows senza webkitSpeechRecognition!)
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

// Stato Motore Nativo per Verdetto nella Staging Area ("Va bene" / "Ritenta" / "Annulla")
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

// Porta automaticamente la finestra Tauri in primo piano quando dici "Hey Tracker"
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
    updateHeyTrackerHeaderBadge();
}

// Aggiunge e aggiorna la spia [◉ HEY TRACKER] nell'header per vedere lo stato del microfono in tempo reale
function ensureHeyTrackerHeaderBadge() {
    const headerBtns = document.querySelector('.header-buttons');
    if (!headerBtns || document.getElementById('btn-hey-tracker-status')) return;

    const btn = document.createElement('button');
    btn.id = 'btn-hey-tracker-status';
    btn.className = 'btn btn-sm';
    btn.title = 'Click to toggle Always-On "Hey Tracker" voice standby';
    btn.onclick = () => {
        isHeyTrackerEnabled = !isHeyTrackerEnabled;
        localStorage.setItem('tracker_hey_enabled', isHeyTrackerEnabled ? 'true' : 'false');
        if (isHeyTrackerEnabled) {
            startNativeHeyTrackerStandby();
            showToast('[HEY TRACKER] Always-On voice standby ENABLED');
        } else {
            stopNativeHeyTrackerStandby();
            showToast('[HEY TRACKER] Voice standby PAUSED');
        }
        updateHeyTrackerHeaderBadge();
    };
    headerBtns.insertBefore(btn, headerBtns.firstChild);
    updateHeyTrackerHeaderBadge();
}

function updateHeyTrackerHeaderBadge(state = 'standby') {
    const btn = document.getElementById('btn-hey-tracker-status');
    if (!btn) return;

    if (!isHeyTrackerEnabled || !geminiApiKey) {
        btn.textContent = '[○ HEY: OFF]';
        btn.style.color = 'var(--text-dim)';
        btn.style.borderColor = 'var(--border-color)';
        return;
    }

    if (state === 'capturing') {
        btn.textContent = '[● HEARING VOICE...]';
        btn.style.color = 'var(--accent-red)';
        btn.style.borderColor = 'var(--accent-red)';
    } else if (state === 'checking') {
        btn.textContent = '[◈ AI CHECK...]';
        btn.style.color = 'var(--accent-gold)';
        btn.style.borderColor = 'var(--accent-gold)';
    } else {
        btn.textContent = '[◉ HEY TRACKER]';
        btn.style.color = 'var(--accent-green)';
        btn.style.borderColor = 'var(--border-color)';
    }
}

// ============================================================================
// ACCESSO CONDIVISO AL MICROFONO E LETTURA VOLUME (RMS)
// ============================================================================

async function ensureSharedMicAnalyser() {
    if (sharedMicStream && sharedMicStream.active && sharedAnalyser) {
        if (sharedAudioCtx && sharedAudioCtx.state === 'suspended') {
            await sharedAudioCtx.resume();
        }
        return true;
    }
    try {
        sharedMicStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
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

// ============================================================================
// 1. MOTORE NATIVO STAND-BY "HEY TRACKER" (CON PRE-ROLL BUFFER DI 750ms)
// ============================================================================

async function startNativeHeyTrackerStandby() {
    stopNativeHeyTrackerStandby();
    if (!isHeyTrackerEnabled || !geminiApiKey) {
        updateHeyTrackerHeaderBadge('off');
        return;
    }

    const termOverlay = document.getElementById('terminalOverlay');
    if ((termOverlay && termOverlay.style.display === 'flex') || isRecordingVoice || isStagingActive) {
        return;
    }

    const ok = await ensureSharedMicAnalyser();
    if (!ok) {
        updateHeyTrackerHeaderBadge('off');
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
            // Il primo chunk WebM contiene l'header del container audio
            if (!bgHeaderChunk) {
                bgHeaderChunk = e.data;
                return;
            }
            if (bgIsCapturingSpeech) {
                bgSpeechChunks.push(e.data);
            } else {
                // Mantiene gli ultimi 3 frammenti (~750ms) di pre-roll per non perdere mai "Hey..."
                bgPreRollChunks.push(e.data);
                if (bgPreRollChunks.length > 3) bgPreRollChunks.shift();
            }
        };

        bgRollingRecorder.start(250);
        updateHeyTrackerHeaderBadge('standby');

        let loudFrames = 0;

        bgWakeLoopTimer = setInterval(async () => {
            if (!isHeyTrackerEnabled || bgIsEvaluating || isRecordingVoice || isStagingActive) return;
            const isTermOpen = termOverlay && termOverlay.style.display === 'flex';
            if (isTermOpen) return;

            const rms = readCurrentMicRms();
            const now = Date.now();

            if (!bgIsCapturingSpeech) {
                if (rms > 0.028) {
                    loudFrames++;
                    if (loudFrames >= 2) {
                        // Inizio del parlato rilevato! Includiamo il pre-roll
                        bgIsCapturingSpeech = true;
                        bgSpeechStartMs = now;
                        bgLastLoudMs = now;
                        bgSpeechChunks = [...bgPreRollChunks];
                        bgPreRollChunks = [];
                        loudFrames = 0;
                        updateHeyTrackerHeaderBadge('capturing');
                    }
                } else {
                    loudFrames = 0;
                }
            } else {
                if (rms > 0.022) {
                    bgLastLoudMs = now;
                }
                const silentDuration = now - bgLastLoudMs;
                const totalSpeechDuration = now - bgSpeechStartMs;

                // Quando smetti di parlare per 1.3s (o dopo max 9s), valuta la frase
                if (silentDuration > 1300 || totalSpeechDuration > 9000) {
                    bgIsCapturingSpeech = false;

                    // Se era solo un colpo di tosse o un click (< 650ms totali), ignora senza chiamare l'API
                    if (totalSpeechDuration < 650 || bgSpeechChunks.length < 2) {
                        bgSpeechChunks = [];
                        updateHeyTrackerHeaderBadge('standby');
                        return;
                    }

                    bgIsEvaluating = true;
                    updateHeyTrackerHeaderBadge('checking');

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

                    // Se NON avevi detto "Hey Tracker", torna silenziosamente in ascolto
                    if (!res || !res.wakeWordDetected) {
                        startNativeHeyTrackerStandby();
                    }
                }
            }
        }, 90);
    } catch (e) {
        updateHeyTrackerHeaderBadge('off');
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
    updateHeyTrackerHeaderBadge('standby');
}

// ============================================================================
// 2. APERTURA / CHIUSURA TERMINALE E REGISTRAZIONE COMANDO ATTIVO
// ============================================================================

function openTerminal(autoStartVoice = false) {
    const overlay = document.getElementById('terminalOverlay');
    const input = document.getElementById('terminal-input');
    const feedback = document.getElementById('terminal-feedback');
    const answerBox = document.getElementById('terminal-ai-answer');
    if (!overlay || !input) return;

    stopNativeHeyTrackerStandby();
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

    // Riattiva subito l'ascolto passivo nativo "Hey Tracker"
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
    const feedback = document.getElementById('terminal-feedback');
    if (!stagingBox || !transcriptEl) return;

    isStagingActive = true;
    stagedCommands = (commandsArray || []).map(c => c.trim()).filter(Boolean);

    transcriptEl.innerHTML = `<strong style="color:var(--text-main);">INPUT // TRANSCRIPT:</strong> "${escapeHtml(transcriptText)}"`;
    stagingBox.style.display = 'flex';
    renderStagingCommandList();

    if (feedback) {
        feedback.textContent = 'Say "VA BENE" (or Enter) to Confirm, "RITENTA" (or R) to Retry, "ANNULLA" (or Esc) to Cancel.';
        feedback.style.color = 'var(--accent-green)';
    }

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

// Ascolta "Va bene" / "Ritenta" / "Annulla" tramite microfono nativo + Gemini (zero webkitSpeechRecognition)
async function startStagingVerdictListener() {
    stopStagingVerdictListener();
    if (!geminiApiKey) return;

    const statusEl = document.getElementById('staging-voice-verdict-status');
    const ok = await ensureSharedMicAnalyser();
    if (!ok) return;

    if (statusEl) statusEl.textContent = '[◉ SAY: "VA BENE" / "RITENTA" / "ANNULLA"]';

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
                        if (statusEl) statusEl.textContent = '[● HEARING VERDICT...]';
                    }
                } else {
                    vLoudFrames = 0;
                }
            } else {
                if (rms > 0.022) vLastLoudMs = now;
                const silentMs = now - vLastLoudMs;
                const totalMs = now - vStartMs;

                if (silentMs > 1050 || totalMs > 4000) {
                    isVerdictCapturing = false;
                    if (totalMs < 400 || vSpeech.length === 0) {
                        vSpeech = [];
                        if (statusEl) statusEl.textContent = '[◉ SAY: "VA BENE" / "RITENTA" / "ANNULLA"]';
                        return;
                    }

                    isVerdictEvaluating = true;
                    if (statusEl) statusEl.textContent = '[◈ VERIFYING...]';

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
                    } else if (statusEl) {
                        statusEl.textContent = '[◉ SAY: "VA BENE" / "RITENTA" / "ANNULLA"]';
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
// 4. REGISTRAZIONE VOCALE MANUALE/ATTIVA NEL TERMINALE (CON AUTO-SILENCE STOP)
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
}

function stopVoiceRecordingSilently() {
    cleanupVadMonitor();
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
            if ((hasSpoken && silentMs > 1550) || (!hasSpoken && totalMs > 6500)) {
                stopVoiceRecordingAndProcess();
            }
        }
    }, 95);
}

async function startVoiceRecording() {
    stopNativeHeyTrackerStandby();
    stopStagingVerdictListener();
    cancelStaging();

    if (!geminiApiKey) {
        const feedback = document.getElementById('terminal-feedback');
        if (feedback) {
            feedback.textContent = 'Add your free Gemini API Key in [CFG] to enable voice recognition.';
            feedback.style.color = 'var(--accent-red)';
        }
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
            const mimeType = mediaRecorder.mimeType || 'audio/webm';
            const audioBlob = new Blob(audioChunks, { type: mimeType });
            await queryOrRefineWithGemini({ audioBlob, mimeType, isWakeWordCheck: false });
        };

        mediaRecorder.start();
        setMicButtonUI(true);
        attachSilenceDetector();
    } catch (err) {
        setMicButtonUI(false);
    }
}

function stopVoiceRecordingAndProcess() {
    if (!isRecordingVoice) return;
    cleanupVadMonitor();
    setMicButtonUI(false);
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        try { mediaRecorder.stop(); } catch (e) {}
    }
}

// ============================================================================
// EVENT LISTENERS & SCORCIATOIE GLOBALI
// ============================================================================

window.addEventListener('DOMContentLoaded', () => {
    ensureHeyTrackerHeaderBadge();
    updateGeminiKeyStatusUI();
    setTimeout(startNativeHeyTrackerStandby, 900);

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
                    queryOrRefineWithGemini({ rawText: rawVal.slice(2).trim(), isWakeWordCheck: false });
                    return;
                }

                const ok = executeTerminalCommand(rawVal);
                if (ok) {
                    const modalCommands = ['?', 'help', 'plan', 'tomorrow', 'ledger', 'stats', 'food', 'macros', 'vault'];
                    if (!modalCommands.includes(firstWord)) closeTerminal();
                } else if (geminiApiKey) {
                    queryOrRefineWithGemini({ rawText: rawVal, isWakeWordCheck: false });
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