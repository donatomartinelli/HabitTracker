// --- js/ai/gemini-agent.js ---
// 1. Pipeline Automatica USB Sony (VOICE/A/ -> SonyArchive -> Trascrizione Verbatim in "Registrazioni")
// 2. Solo modelli Gemini 2.5+ attivi + Auto-Discovery + Auto-Retry su Rate Limit

let cachedGeminiModel = 'models/gemini-2.5-flash';
let isSonySyncInProgress = false;
let sonyArchiveDir = localStorage.getItem('tracker_sony_archive_dir') || 'C:\\Users\\donat\\Desktop\\Progetti\\Cortex\\SonyArchive';

// Solo modelli attuali (rimossi definitivamente 2.0-flash e 1.5-flash)
const ACTIVE_GEMINI_MODELS = [
    'models/gemini-2.5-flash',
    'models/gemini-2.5-flash-lite',
    'models/gemini-flash-latest'
];

function sleepMs(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getAvailableGeminiKeys() {
    const keys = [];
    const kAudio = (typeof geminiAudioApiKey !== 'undefined' ? geminiAudioApiKey : '').trim();
    const kMain = (typeof geminiApiKey !== 'undefined' ? geminiApiKey : '').trim();
    if (kAudio) keys.push(kAudio);
    if (kMain && !keys.includes(kMain)) keys.push(kMain);
    return keys;
}

function handleGeminiKeyInput(val) {
    saveGeminiKey(val);
    updateGeminiKeyStatusUI();
    updateGeminiAudioKeyStatusUI();
}

function updateGeminiKeyStatusUI() {
    const inp = document.getElementById('gemini-api-key-input');
    const status = document.getElementById('gemini-key-status');
    if (inp && inp.value !== geminiApiKey) inp.value = geminiApiKey;
    if (status) {
        status.textContent = geminiApiKey ? '[KEY CONFIGURED]' : '[NO API KEY]';
        status.style.color = geminiApiKey ? 'var(--accent-green)' : 'var(--accent-red)';
    }
}

function handleGeminiAudioKeyInput(val) {
    saveGeminiAudioKey(val);
    updateGeminiAudioKeyStatusUI();
}

function updateGeminiAudioKeyStatusUI() {
    const inp = document.getElementById('gemini-audio-key-input');
    const status = document.getElementById('gemini-audio-key-status');
    const countEl = document.getElementById('processed-audio-count');

    if (inp && inp.value !== geminiAudioApiKey) inp.value = geminiAudioApiKey;
    if (status) {
        if (geminiAudioApiKey) {
            status.textContent = '[DEDICATED KEY ACTIVE]';
            status.style.color = 'var(--accent-green)';
        } else if (geminiApiKey) {
            status.textContent = '[USING MAIN KEY]';
            status.style.color = 'var(--accent-gold)';
        } else {
            status.textContent = '[NO KEY SET]';
            status.style.color = 'var(--accent-red)';
        }
    }
    if (countEl) {
        countEl.textContent = `${processedAudioFiles.length} audio files transcribed (Archive: ${sonyArchiveDir})`;
    }
}

function resetProcessedAudioHistory() {
    processedAudioFiles = [];
    saveData();
    updateGeminiAudioKeyStatusUI();
    if (typeof showToast === 'function') {
        showToast('[AUDIO PIPELINE] History cleared. Click [SYNC SONY] to re-transcribe files in SonyArchive.');
    }
}

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

function getAudioMimeType(filename, fileType = '') {
    if (fileType && fileType.startsWith('audio/')) return fileType;
    const ext = (filename || '').split('.').pop().toLowerCase();
    const map = { 'mp3': 'audio/mp3', 'wav': 'audio/wav', 'm4a': 'audio/mp4', 'aac': 'audio/aac', 'ogg': 'audio/ogg', 'flac': 'audio/flac', 'webm': 'audio/webm' };
    return map[ext] || 'audio/mp3';
}

// Se Google aggiorna i nomi dei modelli, chiede direttamente all'API quali modelli "flash" sono attivi
async function fetchActiveModelsFromGoogle(apiKey) {
    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`);
        if (!res.ok) return [];
        const data = await res.json();
        return (data.models || [])
            .filter(m =>
                m.name &&
                m.name.includes('flash') &&
                !m.name.includes('2.0') &&
                !m.name.includes('1.5') &&
                !m.name.includes('tts') &&
                !m.name.includes('image') &&
                Array.isArray(m.supportedGenerationMethods) &&
                m.supportedGenerationMethods.includes('generateContent')
            )
            .map(m => m.name);
    } catch (e) {
        return [];
    }
}

async function callGeminiWithFallback(userParts, baseGenConfig = { temperature: 0.0 }) {
    const apiKeys = getAvailableGeminiKeys();
    if (apiKeys.length === 0) {
        throw new Error('No Gemini API Key configured');
    }

    // Assicura che non venga mai usato un vecchio modello 2.0 o 1.5 rimasto in cache
    if (cachedGeminiModel && (cachedGeminiModel.includes('2.0') || cachedGeminiModel.includes('1.5'))) {
        cachedGeminiModel = 'models/gemini-2.5-flash';
    }

    let candidateModels = cachedGeminiModel
        ? [cachedGeminiModel, ...ACTIVE_GEMINI_MODELS.filter(m => m !== cachedGeminiModel)]
        : [...ACTIVE_GEMINI_MODELS];

    let primaryError = '';

    for (const apiKey of apiKeys) {
        // Esegue fino a 2 passaggi per chiave (con pausa automatica se c'è un picco di richieste al minuto)
        for (let attempt = 0; attempt < 2; attempt++) {
            for (const modelPath of candidateModels) {
                const normalizedPath = modelPath.startsWith('models/') ? modelPath : `models/${modelPath}`;
                const url = `https://generativelanguage.googleapis.com/v1beta/${normalizedPath}:generateContent?key=${encodeURIComponent(apiKey)}`;

                const genConfig = { ...baseGenConfig };

                try {
                    const res = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            contents: [{ parts: userParts }],
                            generationConfig: genConfig
                        })
                    });

                    if (res.ok) {
                        cachedGeminiModel = normalizedPath;
                        const data = await res.json();
                        return (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
                    } else {
                        const errJson = await res.json().catch(() => ({}));
                        const errMsg = errJson.error?.message || `HTTP ${res.status}`;
                        const lowerErr = errMsg.toLowerCase();

                        // Non sovrascrive mai un errore reale con un errore "no longer available / not found" di un modello secondario
                        if (!lowerErr.includes('no longer available') && !lowerErr.includes('not found')) {
                            primaryError = `[${normalizedPath.replace('models/', '')}] ${errMsg}`;
                        } else if (!primaryError) {
                            primaryError = errMsg;
                        }

                        // Chiave API non valida -> passa subito alla seconda chiave
                        if (res.status === 400 && lowerErr.includes('api key')) {
                            attempt = 2;
                            break;
                        }

                        // Modello non trovato -> prova a scoprire dinamicamente i modelli attivi
                        if (res.status === 404 || lowerErr.includes('no longer available')) {
                            const discovered = await fetchActiveModelsFromGoogle(apiKey);
                            if (discovered.length > 0) {
                                discovered.forEach(dm => {
                                    if (!candidateModels.includes(dm)) candidateModels.push(dm);
                                });
                            }
                            continue;
                        }

                        // Rate limit / Quota temporanea -> passa al modello lite o attende
                        if (res.status === 429 || lowerErr.includes('quota') || lowerErr.includes('exhausted')) {
                            await sleepMs(1500);
                            continue;
                        }
                    }
                } catch (netErr) {
                    if (!primaryError) primaryError = netErr.message || 'Network error';
                }
            }

            // Se il primo giro sulla chiave ha dato rate limit (429), attende 5 secondi e riprova
            if (attempt === 0 && primaryError.toLowerCase().includes('quota')) {
                const statusEl = document.getElementById('sony-pipeline-status');
                if (statusEl) statusEl.textContent = '[RATE LIMIT PAUSE 5S - RETRYING...]';
                await sleepMs(5000);
            } else {
                break;
            }
        }
    }

    throw new Error(primaryError || 'All Gemini models failed');
}

async function transcribeBase64AudioWithGemini(b64Data, filename, fileType) {
    const mimeType = getAudioMimeType(filename, fileType);

    const promptText = `Trascrivi questa registrazione audio in italiano PAROLA PER PAROLA (verbatim).
Segui rigorosamente ed esclusivamente queste regole:
1. FEDELTÀ PAROLA PER PAROLA: Scrivi esattamente tutte le parole pronunciate nell'audio nell'ordine esatto in cui vengono dette. NON riassumere, NON parafrasare, NON riformulare le frasi, NON cambiare i vocaboli e NON tagliare alcun concetto o frase.
2. RIMUOVI SOLO I SUONI DI ESITAZIONE: Elimina esclusivamente i suoni vocali di esitazione pura come "ehm", "uhm", "eh", "mmh".
3. RIMUOVI SOLO LE PAROLE RIPETUTE DUE VOLTE DI FILA: Se una stessa identica parola viene ripetuta immediatamente due volte per inceppamento (es. "del del", "che che", "la la", "non non", "io io"), scrivila una sola volta.
4. PUNTEGGIATURA: Inserisci la punteggiatura e i capoversi solo per rendere leggibile il flusso delle frasi senza alterare alcuna parola.
5. Restituisci SOLO il testo trascritto, senza alcuna introduzione, titolo o commento.`;

    const userParts = [
        { text: promptText },
        { inlineData: { mimeType, data: b64Data } }
    ];

    return callGeminiWithFallback(userParts, { temperature: 0.0 });
}

async function transcribeSingleAudioWithGemini(file) {
    const b64 = await blobToBase64(file);
    return transcribeBase64AudioWithGemini(b64, file.name, file.type);
}

async function extractActionsFromNoteWithGemini(noteBodyText) {
    const keys = getAvailableGeminiKeys();
    if (keys.length === 0) {
        if (typeof showToast === 'function') showToast('[ERROR] Add a Gemini API Key in [SETTINGS] -> Sony Audio first!');
        if (typeof openSettingsModal === 'function') openSettingsModal('tab-ai');
        return null;
    }

    const promptText = `Analyze the following personal note(s) (in Italian) and extract all actionable items into valid Cortex DSL commands.
Today's date is ${todayStr} and tomorrow is ${tomorrowStr}.

Notes text:
"""
${noteBodyText}
"""

Available DSL commands:
- "todo [text]" -> General task to put in Inbox
- "task [title] [@oggi | @domani | @YYYY-MM-DD]" -> Scheduled task on a specific date
- "event [@oggi | @domani | @YYYY-MM-DD] [title]" -> Calendar event on a specific date
- "wish [item] [optional €]" -> Purchase idea / something to buy
- "out [amount] #[Category] [desc]" -> Expense already made
- "in [amount] [desc]" -> Income received
- "appello [ExamName] [YYYY-MM-DD] [HH:MM]" -> University exam appeal
- "tassa [amount] [YYYY-MM-DD] [Title]" -> University tax deadline

Return ONLY a valid JSON object:
{ "commands": ["cmd 1", "cmd 2"] }`;

    let rawJson = await callGeminiWithFallback(
        [{ text: promptText }],
        { responseMimeType: "application/json", temperature: 0.1 }
    );
    rawJson = (rawJson || '{}').replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
    const parsed = JSON.parse(rawJson);
    return Array.isArray(parsed.commands) ? parsed.commands : [];
}

// ============================================================================
// PIPELINE SONY USB (VOICE/A/) + RECUPERO AUTOMATICO FILE PENDENTI IN SONYARCHIVE
// ============================================================================

async function checkAndSyncSonyUsbVoiceA(isManualClick = false) {
    if (isSonySyncInProgress) return false;
    if (!window.__TAURI__ || !window.__TAURI__.core || typeof window.__TAURI__.core.invoke !== 'function') {
        if (isManualClick) {
            document.getElementById('sony-folder-input')?.click();
        }
        return false;
    }

    const keys = getAvailableGeminiKeys();
    if (keys.length === 0) {
        if (isManualClick) {
            if (typeof showToast === 'function') showToast('[ERROR] Add a Gemini API Key in [SETTINGS] -> Sony Audio first!');
            if (typeof openSettingsModal === 'function') openSettingsModal('tab-ai');
        }
        return false;
    }

    try {
        const pendingFiles = await window.__TAURI__.core.invoke('poll_and_move_sony_audio', {
            customArchiveDir: sonyArchiveDir,
            processedSignatures: processedAudioFiles,
            includePendingArchive: isManualClick
        });

        if (!Array.isArray(pendingFiles) || pendingFiles.length === 0) {
            if (isManualClick) {
                if (typeof showToast === 'function') {
                    showToast('[SONY SYNC] No pending audio files in VOICE/A/ or SonyArchive.');
                }
            }
            return false;
        }

        isSonySyncInProgress = true;
        const statusEl = document.getElementById('sony-pipeline-status');
        let successCount = 0;

        const targetCat = 'Registrazioni';
        if (!noteCategories.includes(targetCat)) {
            noteCategories.push(targetCat);
        }

        // I file sono già stati spostati da VOICE/A/ a SonyArchive e caricati in RAM: il registratore può essere scollegato subito!
        if (typeof showToast === 'function') {
            showToast(`[SONY USB] Trasferimento completato (${pendingFiles.length} file) — Puoi staccare il registratore! Trascrizione in corso...`);
        }

        for (let i = 0; i < pendingFiles.length; i++) {
            const item = pendingFiles[i];
            const progressMsg = `[TRANSCRIBING ${i + 1}/${pendingFiles.length}: ${item.name}...]`;
            if (statusEl) statusEl.textContent = progressMsg;

            try {
                const transcribedText = await transcribeBase64AudioWithGemini(item.base64_data, item.name, '');
                if (transcribedText) {
                    const fileDate = formatDate(new Date(item.last_modified_ms || Date.now()));
                    const entryBlock = `=== [${fileDate} // ${item.name}] ===\n${transcribedText}`;
                    notesContent[targetCat] = (!notesContent[targetCat] || notesContent[targetCat].trim() === '')
                        ? entryBlock
                        : `${notesContent[targetCat]}\n\n${entryBlock}`;

                    const sigFull = `${item.name}_${item.size}_${item.last_modified_ms}`;
                    const sigNameSize = `${item.name}_${item.size}`;
                    if (!processedAudioFiles.includes(sigFull)) processedAudioFiles.push(sigFull);
                    if (!processedAudioFiles.includes(sigNameSize)) processedAudioFiles.push(sigNameSize);

                    saveData();
                    successCount++;

                    if (typeof openRegistrazioniInBrowseMode === 'function') {
                        openRegistrazioniInBrowseMode();
                    }
                }
            } catch (err) {
                if (typeof showToast === 'function') showToast(`[ERROR ${item.name}] ${err.message}`);
                if ((err.message || '').toLowerCase().includes('quota')) {
                    break;
                }
            }

            // Pausa di 2.5s tra un file e l'altro per evitare il blocco RPM gratuito di Google
            if (i < pendingFiles.length - 1) {
                await sleepMs(2500);
            }
        }

        if (statusEl) statusEl.textContent = '';
        isSonySyncInProgress = false;
        updateGeminiAudioKeyStatusUI();

        if (successCount > 0) {
            if (typeof openRegistrazioniInBrowseMode === 'function') openRegistrazioniInBrowseMode();
            if (typeof showToast === 'function') {
                showToast(`[SONY PIPELINE COMPLETE] Transcribed ${successCount}/${pendingFiles.length} files into "Registrazioni"!`);
            }
        }
        return true;
    } catch (e) {
        isSonySyncInProgress = false;
        if (isManualClick && typeof showToast === 'function') {
            showToast(`[SONY ERROR] ${e.message || e}`);
        }
        return false;
    }
}

function triggerSonyUsbOrFolderSync() {
    checkAndSyncSonyUsbVoiceA(true);
}

// Fallback per pulsante [+ AUDIO]
async function handleSonyAudioSelection(event) {
    const rawFiles = Array.from(event.target.files || []);
    event.target.value = '';
    if (rawFiles.length === 0) return;

    const keys = getAvailableGeminiKeys();
    if (keys.length === 0) {
        if (typeof showToast === 'function') showToast('[ERROR] Add a Gemini API Key in [SETTINGS] -> Sony Audio first!');
        if (typeof openSettingsModal === 'function') openSettingsModal('tab-ai');
        return;
    }

    const validExts = ['mp3', 'wav', 'm4a', 'ogg', 'aac', 'flac', 'webm'];
    const audioFiles = rawFiles.filter(f => {
        const ext = f.name.split('.').pop().toLowerCase();
        return validExts.includes(ext) || (f.type && f.type.startsWith('audio/'));
    }).sort((a, b) => a.lastModified - b.lastModified);

    const newFiles = audioFiles.filter(f =>
        !processedAudioFiles.includes(`${f.name}_${f.size}_${f.lastModified}`) &&
        !processedAudioFiles.includes(`${f.name}_${f.size}`)
    );

    if (newFiles.length === 0) {
        if (typeof showToast === 'function') showToast(`[AUDIO PIPELINE] All ${audioFiles.length} files already transcribed!`);
        if (typeof openRegistrazioniInBrowseMode === 'function') openRegistrazioniInBrowseMode();
        return;
    }

    isSonySyncInProgress = true;
    const statusEl = document.getElementById('sony-pipeline-status');
    let successCount = 0;

    const targetCat = 'Registrazioni';
    if (!noteCategories.includes(targetCat)) noteCategories.push(targetCat);

    for (let i = 0; i < newFiles.length; i++) {
        const file = newFiles[i];
        const progressMsg = `[TRANSCRIBING ${i + 1}/${newFiles.length}: ${file.name}...]`;
        if (statusEl) statusEl.textContent = progressMsg;

        try {
            const transcribedText = await transcribeSingleAudioWithGemini(file);
            if (transcribedText) {
                const fileDate = formatDate(new Date(file.lastModified || Date.now()));
                const entryBlock = `=== [${fileDate} // ${file.name}] ===\n${transcribedText}`;
                notesContent[targetCat] = (!notesContent[targetCat] || notesContent[targetCat].trim() === '')
                    ? entryBlock
                    : `${notesContent[targetCat]}\n\n${entryBlock}`;

                processedAudioFiles.push(`${file.name}_${file.size}_${file.lastModified}`);
                processedAudioFiles.push(`${file.name}_${file.size}`);
                saveData();
                successCount++;
            }
        } catch (err) {
            if (typeof showToast === 'function') showToast(`[ERROR ${file.name}] ${err.message}`);
            if ((err.message || '').toLowerCase().includes('quota')) break;
        }

        if (i < newFiles.length - 1) await sleepMs(2500);
    }

    if (statusEl) statusEl.textContent = '';
    isSonySyncInProgress = false;
    updateGeminiAudioKeyStatusUI();

    if (successCount > 0) {
        if (typeof openRegistrazioniInBrowseMode === 'function') openRegistrazioniInBrowseMode();
        if (typeof showToast === 'function') showToast(`[SONY PIPELINE] Transcribed ${successCount}/${newFiles.length} files!`);
    }
}

window.addEventListener('DOMContentLoaded', () => {
    updateGeminiKeyStatusUI();
    updateGeminiAudioKeyStatusUI();

    setInterval(() => {
        checkAndSyncSonyUsbVoiceA(false);
    }, 4000);
});