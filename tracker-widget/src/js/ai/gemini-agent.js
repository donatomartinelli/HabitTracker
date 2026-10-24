// --- js/ai/gemini-agent.js ---
// 1. Pipeline Registratore Vocale Sony -> Trascrizione Verbatim (Parola per Parola, rimuove solo "ehm" e parole ripetute due volte)
// 2. Estrattore Azioni dalle Note ([✦ GENERATE ACTIONS] nelle Browse Cards)

let cachedGeminiModel = 'models/gemini-2.0-flash';

const FAST_AUDIO_MODELS = [
    'models/gemini-2.0-flash',
    'models/gemini-2.5-flash',
    'models/gemini-flash-latest'
];

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
        countEl.textContent = `${processedAudioFiles.length} audio files already transcribed`;
    }
}

function resetProcessedAudioHistory() {
    processedAudioFiles = [];
    saveData();
    updateGeminiAudioKeyStatusUI();
    if (typeof showToast === 'function') showToast('[AUDIO PIPELINE] History cleared.');
}

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

function getAudioMimeType(filename, fileType) {
    if (fileType && fileType.startsWith('audio/')) return fileType;
    const ext = filename.split('.').pop().toLowerCase();
    const map = { 'mp3': 'audio/mp3', 'wav': 'audio/wav', 'm4a': 'audio/mp4', 'aac': 'audio/aac', 'ogg': 'audio/ogg', 'flac': 'audio/flac', 'webm': 'audio/webm' };
    return map[ext] || 'audio/mp3';
}

// 1. TRASCRIZIONE AUDIO SONY PAROLA PER PAROLA (SOLO RIMOZIONE "EHM" E PAROLE DOPPIE)
async function transcribeSingleAudioWithGemini(file, apiKey) {
    const b64 = await blobToBase64(file);
    const mimeType = getAudioMimeType(file.name, file.type);

    const promptText = `Trascrivi questa registrazione audio in italiano PAROLA PER PAROLA (verbatim).
Segui rigorosamente ed esclusivamente queste regole:
1. FEDELTÀ PAROLA PER PAROLA: Scrivi esattamente tutte le parole pronunciate nell'audio nell'ordine esatto in cui vengono dette. NON riassumere, NON parafrasare, NON riformulare le frasi, NON cambiare i vocaboli e NON tagliare alcun concetto o frase.
2. RIMUOVI SOLO I SUONI DI ESITAZIONE: Elimina esclusivamente i suoni vocali di esitazione pura come "ehm", "uhm", "eh", "mmh".
3. RIMUOVI SOLO LE PAROLE RIPETUTE DUE VOLTE DI FILA: Se una stessa identica parola viene ripetuta immediatamente due volte per inceppamento (es. "del del", "che che", "la la", "non non", "io io"), scrivila una sola volta.
4. PUNTEGGIATURA: Inserisci la punteggiatura e i capoversi solo per rendere leggibile il flusso delle frasi senza alterare alcuna parola.
5. Restituisci SOLO il testo trascritto, senza alcuna introduzione, titolo o commento.`;

    const userParts = [
        { text: promptText },
        { inlineData: { mimeType, data: b64 } }
    ];

    const candidateModels = cachedGeminiModel
        ? [cachedGeminiModel, ...FAST_AUDIO_MODELS.filter(m => m !== cachedGeminiModel)]
        : FAST_AUDIO_MODELS;

    let lastErr = 'No model available';

    for (const modelPath of candidateModels) {
        const normalizedPath = modelPath.startsWith('models/') ? modelPath : `models/${modelPath}`;
        const url = `https://generativelanguage.googleapis.com/v1beta/${normalizedPath}:generateContent?key=${encodeURIComponent(apiKey)}`;

        const genConfig = { temperature: 0.0 };
        if (normalizedPath.includes('2.5-flash')) {
            genConfig.thinkingConfig = { thinkingBudget: 0 };
        }

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
            lastErr = errJson.error?.message || `HTTP ${res.status}`;
            if (res.status === 400 && lastErr.toLowerCase().includes('api key')) break;
        }
    }

    throw new Error(lastErr);
}

// 2. ESTRATTORE AZIONI DA SINGOLA NOTA ([✦ GENERATE ACTIONS] NELLE BROWSE CARDS)
async function extractActionsFromNoteWithGemini(noteBodyText) {
    const activeKey = (geminiApiKey || geminiAudioApiKey || '').trim();
    if (!activeKey) {
        if (typeof showToast === 'function') showToast('[ERROR] Add a Gemini API Key in [SETTINGS] -> Sony Audio first!');
        if (typeof openSettingsModal === 'function') openSettingsModal('tab-ai');
        return null;
    }

    const promptText = `Analyze this personal note (in Italian) and extract any actionable items into valid Cortex DSL commands.
Today's date is ${todayStr} and tomorrow is ${tomorrowStr}.

Note text:
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

    const candidateModels = cachedGeminiModel
        ? [cachedGeminiModel, ...FAST_AUDIO_MODELS.filter(m => m !== cachedGeminiModel)]
        : FAST_AUDIO_MODELS;

    let lastErr = 'No model available';

    for (const modelPath of candidateModels) {
        const normalizedPath = modelPath.startsWith('models/') ? modelPath : `models/${modelPath}`;
        const url = `https://generativelanguage.googleapis.com/v1beta/${normalizedPath}:generateContent?key=${encodeURIComponent(activeKey)}`;

        const genConfig = { responseMimeType: "application/json", temperature: 0.1 };
        if (normalizedPath.includes('2.5-flash')) {
            genConfig.thinkingConfig = { thinkingBudget: 0 };
        }

        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: promptText }] }],
                generationConfig: genConfig
            })
        });

        if (res.ok) {
            cachedGeminiModel = normalizedPath;
            const data = await res.json();
            let rawJson = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
            rawJson = rawJson.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
            const parsed = JSON.parse(rawJson);
            return Array.isArray(parsed.commands) ? parsed.commands : [];
        } else {
            const errJson = await res.json().catch(() => ({}));
            lastErr = errJson.error?.message || `HTTP ${res.status}`;
            if (res.status === 400 && lastErr.toLowerCase().includes('api key')) break;
        }
    }

    throw new Error(lastErr);
}

async function handleSonyAudioSelection(event) {
    const rawFiles = Array.from(event.target.files || []);
    event.target.value = '';
    if (rawFiles.length === 0) return;

    const activeKey = (geminiAudioApiKey || geminiApiKey || '').trim();
    if (!activeKey) {
        if (typeof showToast === 'function') showToast('[ERROR] Add a Gemini API Key in [SETTINGS] -> Sony Audio first!');
        if (typeof openSettingsModal === 'function') openSettingsModal('tab-ai');
        return;
    }

    const validExts = ['mp3', 'wav', 'm4a', 'ogg', 'aac', 'flac', 'webm'];
    const audioFiles = rawFiles.filter(f => {
        const ext = f.name.split('.').pop().toLowerCase();
        return validExts.includes(ext) || (f.type && f.type.startsWith('audio/'));
    }).sort((a, b) => a.lastModified - b.lastModified);

    if (audioFiles.length === 0) {
        if (typeof showToast === 'function') showToast('[AUDIO PIPELINE] No audio files found.');
        return;
    }

    const newFiles = audioFiles.filter(f => !processedAudioFiles.includes(`${f.name}_${f.size}_${f.lastModified}`));
    if (newFiles.length === 0) {
        if (typeof showToast === 'function') showToast(`[AUDIO PIPELINE] All ${audioFiles.length} files already transcribed!`);
        if (typeof openRegistrazioniInBrowseMode === 'function') openRegistrazioniInBrowseMode();
        return;
    }

    const statusEl = document.getElementById('sony-pipeline-status');
    let successCount = 0;

    const targetCat = 'Registrazioni';
    if (!noteCategories.includes(targetCat)) {
        noteCategories.push(targetCat);
        saveData();
        if (typeof renderNoteCategories === 'function') renderNoteCategories();
    }

    for (let i = 0; i < newFiles.length; i++) {
        const file = newFiles[i];
        const progressMsg = `[TRANSCRIBING ${i + 1}/${newFiles.length}: ${file.name}...]`;
        if (statusEl) statusEl.textContent = progressMsg;
        if (typeof showToast === 'function') showToast(progressMsg);

        try {
            const transcribedText = await transcribeSingleAudioWithGemini(file, activeKey);
            if (transcribedText) {
                const fileDate = formatDate(new Date(file.lastModified || Date.now()));
                const entryBlock = `=== [${fileDate} // ${file.name}] ===\n${transcribedText}`;
                notesContent[targetCat] = (!notesContent[targetCat] || notesContent[targetCat].trim() === '')
                    ? entryBlock
                    : `${notesContent[targetCat]}\n\n${entryBlock}`;

                processedAudioFiles.push(`${file.name}_${file.size}_${file.lastModified}`);
                saveData();
                successCount++;
            }
        } catch (err) {
            if (typeof showToast === 'function') showToast(`[ERROR ${file.name}] ${err.message}`);
        }
    }

    if (statusEl) statusEl.textContent = '';
    updateGeminiAudioKeyStatusUI();

    if (successCount > 0) {
        if (typeof openRegistrazioniInBrowseMode === 'function') openRegistrazioniInBrowseMode();
        if (typeof showToast === 'function') showToast(`[SONY PIPELINE] Transcribed ${successCount}/${newFiles.length} files!`);
    }
}

window.addEventListener('DOMContentLoaded', () => {
    updateGeminiKeyStatusUI();
    updateGeminiAudioKeyStatusUI();
});