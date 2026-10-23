// --- js/ai/gemini-agent.js ---
// Pipeline Esclusiva Registratore Vocale Sony -> Editor Prosa Pulita nella categoria "Registrazioni"

let cachedGeminiModel = null;

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

async function getAvailableFlashModels(apiKey) {
    const defaults = [
        'models/gemini-2.5-flash',
        'models/gemini-2.0-flash',
        'models/gemini-flash-latest'
    ];
    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`);
        if (!res.ok) return defaults;
        const data = await res.json();
        if (!data.models || !Array.isArray(data.models)) return defaults;

        const valid = data.models.filter(m => {
            const name = (m.name || '').toLowerCase();
            const methods = m.supportedGenerationMethods || [];
            const isExcluded = name.includes('tts') || name.includes('image') || name.includes('embedding') || name.includes('vision') || name.includes('aqa');
            return methods.includes('generateContent') && !isExcluded && name.includes('gemini');
        }).map(m => m.name);

        const flash = valid.filter(n => n.toLowerCase().includes('flash')).reverse();
        const other = valid.filter(n => !n.toLowerCase().includes('flash')).reverse();
        const combined = [...flash, ...other];
        return combined.length > 0 ? combined : defaults;
    } catch (e) {
        return defaults;
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

function getAudioMimeType(filename, fileType) {
    if (fileType && fileType.startsWith('audio/')) return fileType;
    const ext = filename.split('.').pop().toLowerCase();
    const map = { 'mp3': 'audio/mp3', 'wav': 'audio/wav', 'm4a': 'audio/mp4', 'aac': 'audio/aac', 'ogg': 'audio/ogg', 'flac': 'audio/flac', 'webm': 'audio/webm' };
    return map[ext] || 'audio/mp3';
}

async function transcribeSingleAudioWithGemini(file, apiKey) {
    const b64 = await blobToBase64(file);
    const mimeType = getAudioMimeType(file.name, file.type);

    const promptText = `Sei un editor professionista di appunti personali.
Ascolta questa registrazione vocale e trasformala in un testo scritto in italiano scorrevole, pulito e piacevole da rileggere, mantenendo il 100% dei concetti, delle idee e dei dettagli espressi dall'autore.
Regole rigorose di pulizia:
1. ZERO INTERCALARI E FILLER WORDS: Elimina completamente "ehm", "uhm", "eh", "cioè", "nel senso", "praticamente", "diciamo", "aspetta", "come si chiama", "vabbè", "capito?", "ok?" quando usati come intercalari del parlato.
2. ZERO RIPETIZIONI O BALBETTII: Se una parola o preposizione viene ripetuta due volte ("del del", "non non", "che che", "su su", "la la"), scrivila una sola volta.
3. ZERO FALSE PARTENZE: Se l'autore inizia una frase, si interrompe e la riformula subito dopo, conserva solo la formulazione finale corretta e scorrevole.
4. COMPLETEZZA E FEDELTÀ: Non riassumere e non omettere nessun ragionamento o esempio. Struttura il testo con punteggiatura curata e capoversi logici come se fosse stato scritto direttamente a tastiera.
5. Restituisci SOLO il testo pulito finale, senza alcuna premessa o commento.`;

    const userParts = [
        { text: promptText },
        { inlineData: { mimeType, data: b64 } }
    ];

    const candidateModels = cachedGeminiModel
        ? [cachedGeminiModel, ...(await getAvailableFlashModels(apiKey)).filter(m => m !== cachedGeminiModel)]
        : await getAvailableFlashModels(apiKey);

    let lastErr = 'No model available';

    for (const modelPath of candidateModels) {
        const normalizedPath = modelPath.startsWith('models/') ? modelPath : `models/${modelPath}`;
        const url = `https://generativelanguage.googleapis.com/v1beta/${normalizedPath}:generateContent?key=${encodeURIComponent(apiKey)}`;

        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: userParts }],
                generationConfig: { temperature: 0.1 }
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