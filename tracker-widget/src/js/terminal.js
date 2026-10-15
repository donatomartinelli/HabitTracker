// --- 5. TERMINAL ENGINE: CLI, HYBRID VOICE CONTROL, GEMINI AI REFINER & STAGING ---

let toastTimeout;
let commandHistory = [];
let historyIndex = -1;

// Stato Voice & Staging
let isRecordingVoice = false;
let isStagingActive = false;
let stagedCommands = [];
let mediaRecorder = null;
let audioChunks = [];
let speechRecInstance = null;

function showToast(msg) {
    const toast = document.getElementById('terminal-toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        toast.classList.remove('show');
    }, 2800);
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
        status.textContent = geminiApiKey ? '[ACTIVE: GEMINI FLASH AI]' : '[STANDARD VOICE MODE]';
        status.style.color = geminiApiKey ? 'var(--accent-green)' : 'var(--text-dim)';
    }
}

function openTerminal(autoStartVoice = false) {
    const overlay = document.getElementById('terminalOverlay');
    const input = document.getElementById('terminal-input');
    const feedback = document.getElementById('terminal-feedback');
    if (!overlay || !input) return;

    cancelStaging();
    stopVoiceRecordingSilently();

    overlay.style.display = 'flex';
    input.value = '';
    historyIndex = commandHistory.length;
    if (feedback) {
        feedback.textContent = geminiApiKey
            ? 'AI Ready. Type command, natural sentence, or press [VOICE] to speak.'
            : 'Ready. Press [Enter] to execute, [VOICE] to speak, [?] for manual.';
        feedback.style.color = 'var(--text-dim)';
    }
    setTimeout(() => {
        input.focus();
        if (autoStartVoice) toggleVoiceCapture();
    }, 15);
}

function closeTerminal() {
    stopVoiceRecordingSilently();
    cancelStaging();
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

// ============================================================================
// SISTEMA DI CONFERMA (STAGING AREA)
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
        feedback.textContent = 'Review proposed actions. Press [Enter] to Confirm All, [R] to Retry Voice, [Esc] to Cancel.';
        feedback.style.color = 'var(--accent-green)';
    }
}

function renderStagingCommandList() {
    const listEl = document.getElementById('staging-cmd-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    if (stagedCommands.length === 0) {
        listEl.innerHTML = '<div class="empty-state" style="padding:4px 0;">[ NO VALID COMMANDS EXTRACTED — PRESS [R] TO RETRY ]</div>';
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
    let shouldKeepOpen = false;
    const modalCommands = ['?', 'help', 'plan', 'tomorrow', 'ledger', 'stats', 'food', 'macros', 'vault'];

    validCmds.forEach(cmd => {
        const firstWord = cmd.split(/\s+/)[0].toLowerCase();
        if (modalCommands.includes(firstWord)) shouldKeepOpen = true;
        if (executeTerminalCommand(cmd)) executedCount++;
    });

    cancelStaging();
    if (!shouldKeepOpen) {
        closeTerminal();
    }
    if (executedCount > 1) {
        showToast(`[CONFIRMED] Executed ${executedCount} commands`);
    }
}

function retryVoiceCapture() {
    cancelStaging();
    const input = document.getElementById('terminal-input');
    if (input) input.value = '';
    startVoiceRecording();
}

// ============================================================================
// MOTORE VOCALE IBRIDO + RAFFINATORE GEMINI FLASH
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
        btn.textContent = recording ? '[● STOP & REFINE]' : '[VOICE // MIC]';
    }
    if (recording && feedback) {
        feedback.textContent = geminiApiKey
            ? 'Listening (AI Mode)... Speak naturally, then press [Enter] or click [STOP] when done.'
            : 'Listening (Standard Mode)... Speak a command clearly.';
        feedback.style.color = 'var(--accent-red)';
    }
}

function stopVoiceRecordingSilently() {
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

async function startVoiceRecording() {
    cancelStaging();

    // MODALITA' 1: Con Chiave Gemini Flash -> Registra audio nativo (Funziona su Windows Tauri, Android, iOS)
    if (geminiApiKey) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            audioChunks = [];
            mediaRecorder = new MediaRecorder(stream);

            mediaRecorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) audioChunks.push(e.data);
            };

            mediaRecorder.onstop = async () => {
                stream.getTracks().forEach(t => t.stop());
                const mimeType = mediaRecorder.mimeType || 'audio/webm';
                const audioBlob = new Blob(audioChunks, { type: mimeType });
                await refineWithGemini({ audioBlob, mimeType });
            };

            mediaRecorder.start();
            setMicButtonUI(true);
            return;
        } catch (err) {
            const feedback = document.getElementById('terminal-feedback');
            if (feedback) {
                feedback.textContent = 'Microphone permission denied or unavailable.';
                feedback.style.color = 'var(--accent-red)';
            }
            setMicButtonUI(false);
            return;
        }
    }

    // MODALITA' 2: Senza Chiave -> Usa Web Speech API del dispositivo
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
        const feedback = document.getElementById('terminal-feedback');
        if (feedback) {
            feedback.textContent = 'Standard voice not supported in this window. Add a free Gemini API Key in [CFG] for full voice AI.';
            feedback.style.color = 'var(--accent-red)';
        }
        return;
    }

    try {
        speechRecInstance = new SpeechRec();
        speechRecInstance.lang = 'it-IT';
        speechRecInstance.interimResults = false;
        speechRecInstance.maxAlternatives = 1;

        speechRecInstance.onresult = (event) => {
            const transcript = event.results[0][0].transcript.trim();
            setMicButtonUI(false);
            const normalized = normalizeBasicVoiceCommand(transcript);
            openStagingArea(transcript, [normalized]);
        };

        speechRecInstance.onerror = () => {
            setMicButtonUI(false);
            const feedback = document.getElementById('terminal-feedback');
            if (feedback) {
                feedback.textContent = 'Voice recognition blocked by system WebView. Add a Gemini API Key in [CFG] to enable native audio capture.';
                feedback.style.color = 'var(--accent-red)';
            }
        };

        speechRecInstance.onend = () => {
            if (isRecordingVoice) setMicButtonUI(false);
        };

        speechRecInstance.start();
        setMicButtonUI(true);
    } catch (e) {
        setMicButtonUI(false);
    }
}

function stopVoiceRecordingAndProcess() {
    if (!isRecordingVoice) return;
    setMicButtonUI(false);
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }
    if (speechRecInstance) {
        try { speechRecInstance.stop(); } catch (e) {}
    }
}

// Normalizzatore base per chi usa la voce senza AI
function normalizeBasicVoiceCommand(spokenText) {
    let s = spokenText.trim();
    const lower = s.toLowerCase();
    if (lower.startsWith('spesa ') || lower.startsWith('uscita ')) {
        s = 'out ' + s.slice(s.indexOf(' ') + 1);
    } else if (lower.startsWith('entrata ')) {
        s = 'in ' + s.slice(s.indexOf(' ') + 1);
    } else if (lower.startsWith('nota ')) {
        s = 'note ' + s.slice(5);
    } else if (lower.startsWith('peso ')) {
        s = 'weight ' + s.slice(5);
    }
    return s;
}

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64String = reader.result.split(',')[1];
            resolve(base64String);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

// Cache del modello funzionante per non dover chiedere la lista a ogni comando
let cachedGeminiModel = null;

// Chiede a Google quali modelli "Flash" sono realmente attivi per la tua API Key
async function getAvailableFlashModels(apiKey) {
    const defaults = [
        'models/gemini-flash-latest',
        'models/gemini-3.5-flash',
        'models/gemini-3.1-flash-lite',
        'models/gemini-2.5-flash',
        'models/gemini-2.0-flash'
    ];
    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`);
        if (!res.ok) return defaults;
        const data = await res.json();
        if (!data.models || !Array.isArray(data.models)) return defaults;

        // Filtra solo i modelli testuali/multimodali che supportano generateContent
        const valid = data.models.filter(m => {
            const name = (m.name || '').toLowerCase();
            const methods = m.supportedGenerationMethods || [];
            const isExcluded = name.includes('tts') || name.includes('image') || name.includes('embedding') || name.includes('vision') || name.includes('robotics') || name.includes('aqa');
            return methods.includes('generateContent') && !isExcluded && name.includes('gemini');
        }).map(m => m.name);

        // Metti in cima i modelli "flash" (più veloci e con quota gratuita)
        const flashModels = valid.filter(n => n.toLowerCase().includes('flash')).reverse();
        const otherModels = valid.filter(n => !n.toLowerCase().includes('flash')).reverse();
        const combined = [...flashModels, ...otherModels];

        return combined.length > 0 ? combined : defaults;
    } catch (e) {
        return defaults;
    }
}

// Chiamata al Raffinatore AI Gemini con Auto-Discovery e Fallback automatico
async function refineWithGemini({ audioBlob = null, mimeType = 'audio/webm', rawText = null }) {
    const feedback = document.getElementById('terminal-feedback');
    const cleanKey = (geminiApiKey || '').trim();

    if (!cleanKey) {
        if (feedback) {
            feedback.textContent = 'Missing Gemini API Key. Open [CFG] and paste your key.';
            feedback.style.color = 'var(--accent-red)';
        }
        return;
    }

    if (feedback) {
        feedback.textContent = '[AI REFINER] Analyzing and translating into terminal commands...';
        feedback.style.color = 'var(--accent-gold)';
    }

    const systemPrompt = `You are the command parser for a minimalist terminal Habit, Finance & Health Tracker.
Today's date is ${todayStr}. Tomorrow's date is ${tomorrowStr}.
Existing Expense Categories: ${mCategories.join(', ')}.
Existing Note Categories: ${noteCategories.join(', ')}.
Existing Habit Categories: ${categoryOrder.join(', ')}.

Translate the user's spoken audio or natural language sentence (in Italian or English) into 1 or more valid CLI commands from this exact specification:
1. "out [amount] #[category] [description]" -> Log an expense (e.g. "out 8.50 #Treno Biglietto Potenza", "out 3.20 #Cibo Colazione bar").
2. "in [amount] [description]" -> Log an income (e.g. "in 500 Borsa di studio").
3. "wish [item name] [optional cost]" -> Add purchase idea to wishlist (e.g. "wish Orologio Casio 45").
4. "todo [text]" -> Add general unscheduled task to inbox (e.g. "todo Chiamare segreteria").
5. "task [title] [@oggi | @domani | @YYYY-MM-DD]" -> Schedule a specific task on a date (e.g. "task Ripassare Analisi @domani").
6. "event [@oggi | @domani | @YYYY-MM-DD] [title]" -> Add a calendar event (e.g. "event @2026-10-25 Esame Analisi").
7. "note [Category]: [text]" -> Save a note under a category (e.g. "note Math: Verificare teorema di Bolzano").
8. "focus [minutes] [title]" -> Start a Pomodoro focus timer right now (e.g. "focus 30 Studio Algebra").
9. "log [minutes] [category]" -> Log completed study/work minutes into the Focus Ledger (e.g. "log 45 Studio").
10. "weight [kg] [optional note]" -> Log body weight in kg (e.g. "weight 74.5 mattino").
11. "gym done" -> Mark today's gym workout as completed.
12. "plan" -> Open the Evening Builder to plan tomorrow.
13. "goto [oggi | domani | ieri | YYYY-MM-DD]" -> Jump calendar to date.
14. "left [daily|planner|health|money]" or "right [daily|planner|health|money]" or "swap" -> Change layout panes.

Return ONLY a valid JSON object with this exact structure (no markdown, no backticks):
{
  "transcript": "The exact transcription of what the user said or wrote",
  "commands": ["command 1", "command 2"]
}`;

    try {
        const userParts = [{ text: systemPrompt }];
        if (audioBlob) {
            const b64 = await blobToBase64(audioBlob);
            userParts.push({
                inlineData: {
                    mimeType: mimeType.split(';')[0] || 'audio/webm',
                    data: b64
                }
            });
        } else if (rawText) {
            userParts.push({ text: `User input: "${rawText}"` });
        }

        // Ottiene la lista dei modelli disponibili per la chiave dell'utente
        const candidateModels = cachedGeminiModel
            ? [cachedGeminiModel, ...(await getAvailableFlashModels(cleanKey)).filter(m => m !== cachedGeminiModel)]
            : await getAvailableFlashModels(cleanKey);

        let lastErrorMsg = 'No compatible model found';
        let responseData = null;

        // Prova i modelli disponibili finché non trova quello attivo e gratuito
        for (const modelPath of candidateModels) {
            const normalizedPath = modelPath.startsWith('models/') ? modelPath : `models/${modelPath}`;
            const url = `https://generativelanguage.googleapis.com/v1beta/${normalizedPath}:generateContent?key=${encodeURIComponent(cleanKey)}`;

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: userParts }],
                    generationConfig: {
                        responseMimeType: "application/json",
                        temperature: 0.1
                    }
                })
            });

            if (response.ok) {
                cachedGeminiModel = normalizedPath;
                responseData = await response.json();
                break;
            } else {
                const errJson = await response.json().catch(() => ({}));
                lastErrorMsg = errJson.error?.message || `HTTP ${response.status}`;
                // Se l'errore è 400 (API Key non valida), inutile provare altri modelli
                if (response.status === 400 && lastErrorMsg.toLowerCase().includes('api key')) {
                    break;
                }
            }
        }

        if (!responseData) {
            cachedGeminiModel = null;
            throw new Error(lastErrorMsg);
        }

        let rawJsonText = responseData.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        // Pulisce eventuali blocchi ```json ... ``` se il modello li aggiunge
        rawJsonText = rawJsonText.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();

        const parsed = JSON.parse(rawJsonText);
        const transcript = parsed.transcript || rawText || 'Voice Input';
        const commands = Array.isArray(parsed.commands) ? parsed.commands : [];

        openStagingArea(transcript, commands);
    } catch (err) {
        if (feedback) {
            feedback.textContent = `AI Refiner Error: ${err.message}`;
            feedback.style.color = 'var(--accent-red)';
        }
    }
}

// ============================================================================
// PREVIEW & ESECUZIONE COMANDI STANDARD
// ============================================================================

function getCommandPreview(raw) {
    const str = raw.trim();
    if (!str) return 'Ready. Press [Enter] to execute, [VOICE] to speak, [?] for manual.';
    if (str === '?' || str.toLowerCase() === 'help') return 'Open System Manual (CLI, Shortcuts & Mouse Actions)';

    const parts = str.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const rest = str.slice(parts[0].length).trim();

    switch (cmd) {
        case 'ai':
            return geminiApiKey
                ? `[AI REFINER] Translate natural language into staged commands: "${rest}"`
                : `[AI REFINER] Requires Gemini API Key in [CFG]`;
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
            return geminiApiKey
                ? `Press [Enter] to translate natural sentence with Gemini AI: "${str}"`
                : `Unknown command "${cmd}". Type ? for manual or add Gemini Key in [CFG].`;
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

    if (cmd === 'plan' || cmd === 'tomorrow') {
        closeTerminal();
        openPlanTomorrowModal();
        return true;
    }

    if (cmd === 'log') {
        const m = rest.match(/^(\d+)\s*(.*)$/);
        if (!m) return false;
        const mins = parseInt(m[1], 10);
        const cat = m[2].trim() || 'Studio';
        logFocusSession(mins, cat, 'Manual Log', selectedDateStr);
        showToast(`[LEDGER] Logged ${mins}m in "${cat}"`);
        return true;
    }

    if (cmd === 'ledger' || cmd === 'stats') {
        closeTerminal();
        openTrackerModal();
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

    if (cmd === 'food' || cmd === 'macros') {
        if (typeof openFoodDbModal === 'function') {
            closeTerminal();
            openFoodDbModal();
            return true;
        }
        return false;
    }

    if (cmd === 'vault') {
        if (typeof openVaultModal === 'function') {
            closeTerminal();
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
            const rawTag = catMatch[1];
            category = rawTag.charAt(0).toUpperCase() + rawTag.slice(1).toLowerCase();
            rawDesc = rawDesc.replace(catMatch[0], '').trim();
            if (!mCategories.includes(category)) mCategories.push(category);
        }

        const desc = rawDesc || category;
        mBalance = roundCurrency(mBalance - amt);
        mTransactions.push({
            id: 'mt_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
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

    if (cmd === 'in' || cmd === '+') {
        const m = rest.match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
        if (!m) return false;
        const amt = roundCurrency(m[1].replace(',', '.'));
        const desc = m[2].trim() || 'Income';
        mBalance = roundCurrency(mBalance + amt);
        const autoSaved = typeof applyIncomeVaultRules === 'function' ? applyIncomeVaultRules(amt) : 0;

        mTransactions.push({
            id: 'mt_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
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

    if (cmd === 'todo') {
        if (!rest) return false;
        generalTodos.push({ id: 'todo_' + Date.now(), title: rest });
        saveData();
        renderGeneralTodos();
        showToast(`[TODO] Added: ${rest}`);
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

    if (cmd === 'workout' || (cmd === 'gym' && rest.toLowerCase() === 'done')) {
        if (typeof completeWorkout === 'function') {
            const completedDay = nextWorkoutDay;
            completeWorkout(completedDay);
            showToast(`[HEALTH] Workout Day ${completedDay} completed!`);
            return true;
        }
        return false;
    }

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

    if (cmd === 'goto') {
        const resolved = resolveDateToken(rest);
        if (!resolved) return false;
        jumpToDate(resolved);
        showToast(`[CALENDAR] Selected ${resolved}`);
        return true;
    }

    if (cmd === 'export' || cmd === 'backup') {
        exportData();
        showToast(`[SYSTEM] Backup exported`);
        return true;
    }

    return false;
}

window.addEventListener('DOMContentLoaded', () => {
    updateGeminiKeyStatusUI();

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
            // Se sta registrando la voce e premi Invio, ferma la registrazione e manda al Raffinatore
            if (isRecordingVoice && e.key === 'Enter') {
                e.preventDefault();
                stopVoiceRecordingAndProcess();
                return;
            }

            // Se siamo nel riquadro di conferma (Staging Area)
            if (isStagingActive) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    confirmStagingCommands();
                    return;
                }
                if (e.key.toLowerCase() === 'r' && !e.ctrlKey && !e.metaKey) {
                    e.preventDefault();
                    retryVoiceCapture();
                    return;
                }
                if (e.key === 'Escape') {
                    e.preventDefault();
                    cancelStaging();
                    return;
                }
            }

            if (e.key === 'Enter') {
                e.preventDefault();
                const rawVal = termInput.value.trim();
                if (!rawVal) return;

                // Se inizia con "ai " o non è un comando standard ma c'è la chiave Gemini, usa il Raffinatore AI
                const firstWord = rawVal.split(/\s+/)[0].toLowerCase();
                if (firstWord === 'ai' && geminiApiKey) {
                    refineWithGemini({ rawText: rawVal.slice(2).trim() });
                    return;
                }

                const ok = executeTerminalCommand(rawVal);
                if (ok) {
                    const modalCommands = ['?', 'help', 'plan', 'tomorrow', 'ledger', 'stats', 'food', 'macros', 'vault'];
                    if (!modalCommands.includes(firstWord)) {
                        closeTerminal();
                    }
                } else if (geminiApiKey) {
                    // Fallback intelligente: se hai scritto una frase naturale, la passa a Gemini Flash e apre la conferma
                    refineWithGemini({ rawText: rawVal });
                } else if (termFeedback) {
                    termFeedback.textContent = 'Invalid syntax or unknown command. Type ? for help or add Gemini API Key in [CFG].';
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
        // Scorciatoie dentro lo Staging quando il focus non è dentro un sotto-input
        if (isStagingActive && document.activeElement && !document.activeElement.classList.contains('staging-cmd-input')) {
            if (e.key === 'Enter') {
                e.preventDefault();
                confirmStagingCommands();
                return;
            }
            if (e.key.toLowerCase() === 'r') {
                e.preventDefault();
                retryVoiceCapture();
                return;
            }
        }

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
                if (isStagingActive) {
                    cancelStaging();
                } else {
                    closeTerminal();
                }
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
            case 'v':
            case 'V':
                e.preventDefault();
                openTerminal(true);
                break;
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