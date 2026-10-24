// --- js/ai/gemini-agent.js ---
// Cervello AI Conversazionale, Pipeline Vocale 2-Stadi, Estrattore Note & Pipeline Sony Recorder

let cachedGeminiModel = null;
let activeGeminiAbortController = null;
let isGeminiProcessing = false;

function abortActiveGeminiRequest() {
    if (activeGeminiAbortController) {
        try { activeGeminiAbortController.abort(); } catch (e) {}
        activeGeminiAbortController = null;
    }
    isGeminiProcessing = false;
    if (typeof bgIsEvaluating !== 'undefined') bgIsEvaluating = false;
    if (typeof updateAskStatusDot === 'function') updateAskStatusDot('standby');
}

function getSystemContextSnapshot() {
    const todayJS = new Date(todayStr).getDay();
    const tmwJS = new Date(tomorrowStr).getDay();

    const formatDaySchedule = (dateStr, dayIdx) => {
        const active = (typeof templates !== 'undefined' ? templates : []).filter(t => isTaskActiveOnDate(t, dateStr));
        return active.map(t => {
            let timeStr = 'Flexible';
            if (t.timeWindows && t.timeWindows.length > 0) {
                const tws = t.timeWindows.filter(w => w.days && w.days.includes(dayIdx));
                if (tws.length > 0) timeStr = tws.map(w => `${w.start}-${w.end}`).join(', ');
            }
            const curLog = (logs[dateStr] && logs[dateStr][t.id]) || Array(t.instances || 1).fill(false);
            const doneCount = curLog.filter(Boolean).length;
            const durMins = typeof getTaskDurationMinutes === 'function' ? getTaskDurationMinutes(t, dateStr) : (t.timerMinutes || 0);
            return {
                title: t.title,
                category: t.category,
                durationMinutes: durMins,
                schedule: timeStr,
                progress: `${doneCount}/${t.instances || 1}`
            };
        });
    };

    const getGhostSchedule = (dayIdx) => {
        const items = [];
        if (typeof referenceLayers !== 'undefined') {
            referenceLayers.forEach(ref => {
                if (ref && refToggles[ref.id] && ref.timeWindows) {
                    ref.timeWindows.forEach(tw => {
                        if (tw.days && tw.days.includes(dayIdx)) {
                            items.push(`${ref.title}: ${tw.start}-${tw.end}`);
                        }
                    });
                }
            });
        }
        return items;
    };

    const todayDiet = (typeof dietData !== 'undefined' ? dietData : []).map(meal => ({ meal: meal.type, food: meal[todayJS] || '' }));
    const tomorrowDiet = (typeof dietData !== 'undefined' ? dietData : []).map(meal => ({ meal: meal.type, food: meal[tmwJS] || '' }));
    const todayMacros = typeof calculateDayMacros === 'function' ? calculateDayMacros(todayJS) : null;

    const activeGymExercises = ((typeof gymPlan !== 'undefined' && gymPlan[nextWorkoutDay]) || []).map(ex => {
        const weights = [];
        for (let i = 0; i < (ex.sets || 0); i++) {
            const w = savedGymWeights[`gw_${ex.id}_${i}`];
            if (w) weights.push(`${w}kg`);
        }
        return `${ex.name} (${ex.repStr})${weights.length ? ' [Last: ' + weights.join(', ') + ']' : ''}`;
    });

    const moneyMetrics = typeof getMoneyAllocationMetrics === 'function'
        ? getMoneyAllocationMetrics()
        : { total: typeof mBalance !== 'undefined' ? mBalance : 0, spendable: typeof mBalance !== 'undefined' ? mBalance : 0, vaulted: 0, pendingBills: 0 };

    return {
        todayDate: todayStr,
        tomorrowDate: tomorrowStr,
        todayPriority: (typeof dailyPriorities !== 'undefined' && dailyPriorities[todayStr]) || 'None',
        tomorrowPriority: (typeof dailyPriorities !== 'undefined' && dailyPriorities[tomorrowStr]) || 'None',
        todayTasksAndLessons: formatDaySchedule(todayStr, todayJS),
        tomorrowTasksAndLessons: formatDaySchedule(tomorrowStr, tmwJS),
        todayGhostLayers: getGhostSchedule(todayJS),
        tomorrowGhostLayers: getGhostSchedule(tmwJS),
        todayEvents: (typeof specificEvents !== 'undefined' ? specificEvents : []).filter(e => e.date === todayStr),
        tomorrowEvents: (typeof specificEvents !== 'undefined' ? specificEvents : []).filter(e => e.date === tomorrowStr),
        inboxTodos: (typeof generalTodos !== 'undefined' ? generalTodos : []).map(t => t.title),
        dietToday: { meals: todayDiet, macros: todayMacros, rules: typeof dietRules !== 'undefined' ? dietRules : '' },
        dietTomorrow: tomorrowDiet,
        gymActiveSplit: { dayNumber: typeof nextWorkoutDay !== 'undefined' ? nextWorkoutDay : 1, exercises: activeGymExercises },
        finance: moneyMetrics,
        vaults: (typeof mVaults !== 'undefined' ? mVaults : []).map(v => ({ name: v.name, balance: v.balance, renewalDay: v.renewalDay })),
        existingCategories: {
            expenses: typeof mCategories !== 'undefined' ? mCategories : [],
            notes: typeof noteCategories !== 'undefined' ? noteCategories : [],
            habits: typeof categoryOrder !== 'undefined' ? categoryOrder : []
        }
    };
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

async function callGeminiJsonEndpoint(userParts, cleanKey, abortSignal = null) {
    const candidateModels = cachedGeminiModel
        ? [cachedGeminiModel, ...(await getAvailableFlashModels(cleanKey)).filter(m => m !== cachedGeminiModel)]
        : await getAvailableFlashModels(cleanKey);

    let lastErr = 'No compatible Gemini model found';
    let responseData = null;

    for (const modelPath of candidateModels) {
        if (abortSignal && abortSignal.aborted) {
            throw new DOMException('Aborted', 'AbortError');
        }
        const normalizedPath = modelPath.startsWith('models/') ? modelPath : `models/${modelPath}`;
        const url = `https://generativelanguage.googleapis.com/v1beta/${normalizedPath}:generateContent?key=${encodeURIComponent(cleanKey)}`;

        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: abortSignal,
            body: JSON.stringify({
                contents: [{ parts: userParts }],
                generationConfig: { responseMimeType: "application/json", temperature: 0.1 }
            })
        });

        if (res.ok) {
            cachedGeminiModel = normalizedPath;
            responseData = await res.json();
            break;
        } else {
            const errJson = await res.json().catch(() => ({}));
            lastErr = errJson.error?.message || `HTTP ${res.status}`;
            if (res.status === 400 && lastErr.toLowerCase().includes('api key')) break;
        }
    }

    if (!responseData) {
        cachedGeminiModel = null;
        throw new Error(lastErr);
    }

    let rawJsonText = responseData.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    rawJsonText = rawJsonText.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
    return JSON.parse(rawJsonText);
}

// STADIO 1: TRASCRIZIONE FLASH ISTANTANEA & CONTROLLO WAKE-WORD
async function fastTranscribeAudioStage(b64Audio, mimeType, isWakeWordCheck, cleanKey, abortSignal) {
    const fastPrompt = isWakeWordCheck
        ? `Listen to this audio. Determine if the user said the wake word "Hey Tracker" or "Hey Cortex" or "Cortex" (or phonetic equivalents like "Ehi Tracker", "Ei Cortex", "Ok Tracker", "Tracker").
- If NO wake word is present, return: {"wakeWordDetected": false, "wakeWordOnly": false, "transcript": ""}
- If the user ONLY said the wake word with no command after it, return: {"wakeWordDetected": true, "wakeWordOnly": true, "transcript": ""}
- If the user said the wake word followed by a question or command, strip the wake word and return the exact spoken text in "transcript": {"wakeWordDetected": true, "wakeWordOnly": false, "transcript": "..."}`
        : `Transcribe this spoken Italian/English audio verbatim and cleanly.
If the user only said "annulla", "cancella", or "ferma", set "abortRequested": true.
Return ONLY JSON: {"wakeWordDetected": true, "wakeWordOnly": false, "abortRequested": false, "transcript": "..."}`;

    const parts = [
        { text: fastPrompt },
        { inlineData: { mimeType: mimeType.split(';')[0] || 'audio/webm', data: b64Audio } }
    ];
    return await callGeminiJsonEndpoint(parts, cleanKey, abortSignal);
}

// 1. GESTIONE RICHIESTA PRINCIPALE (DOMANDE SUL SISTEMA, AZIONI E WAKE-WORD)
async function queryOrRefineWithGemini({ audioBlob = null, mimeType = 'audio/webm', rawText = null, isWakeWordCheck = false }) {
    const answerBox = document.getElementById('terminal-ai-answer');
    const inputEl = document.getElementById('terminal-input');
    const cleanKey = (geminiApiKey || '').trim();

    if (!cleanKey) {
        if (!isWakeWordCheck) {
            if (typeof showToast === 'function') showToast('Missing Gemini API Key. Open [SETTINGS] -> AI & Voice.');
            if (typeof openSettingsModal === 'function') openSettingsModal('tab-ai');
        }
        return null;
    }

    abortActiveGeminiRequest();
    activeGeminiAbortController = new AbortController();
    const signal = activeGeminiAbortController.signal;
    isGeminiProcessing = true;

    if (typeof updateAskStatusDot === 'function') {
        updateAskStatusDot('processing');
    }

    if (!isWakeWordCheck && answerBox) {
        answerBox.style.display = 'none';
        answerBox.innerHTML = '';
    }

    try {
        let finalQueryText = (rawText || '').trim();

        if (audioBlob) {
            const b64 = await blobToBase64(audioBlob);
            const stage1 = await fastTranscribeAudioStage(b64, mimeType, isWakeWordCheck, cleanKey, signal);

            if (signal.aborted) return null;

            if (isWakeWordCheck) {
                if (!stage1 || !stage1.wakeWordDetected) {
                    isGeminiProcessing = false;
                    if (typeof updateAskStatusDot === 'function') updateAskStatusDot('standby');
                    return { wakeWordDetected: false };
                }

                if (typeof bringAppWindowToFront === 'function') {
                    await bringAppWindowToFront();
                }

                if (stage1.wakeWordOnly || !stage1.transcript || !stage1.transcript.trim()) {
                    isGeminiProcessing = false;
                    openTerminal(true);
                    return { wakeWordDetected: true, wakeWordOnly: true };
                }

                openTerminal(false);
                if (typeof updateAskStatusDot === 'function') updateAskStatusDot('processing');
            }

            if (stage1 && stage1.abortRequested) {
                isGeminiProcessing = false;
                closeTerminal();
                if (typeof showToast === 'function') showToast('[ABORTED] Voice command cancelled');
                return null;
            }

            finalQueryText = (stage1 && stage1.transcript ? stage1.transcript : '').trim();

            if (inputEl && finalQueryText) {
                inputEl.value = finalQueryText;
            }
        } else if (inputEl && finalQueryText) {
            inputEl.value = finalQueryText;
        }

        if (!finalQueryText) {
            isGeminiProcessing = false;
            if (typeof updateAskStatusDot === 'function') updateAskStatusDot('standby');
            if (!isWakeWordCheck && typeof showToast === 'function') {
                showToast('[VOICE] No speech detected. Click dot or press [V] to retry.');
            }
            return null;
        }

        const snapshotJson = JSON.stringify(getSystemContextSnapshot());

        const systemPrompt = `You are the AI brain for a minimalist terminal Habit, Finance & Health Tracker.
The user speaks or writes in Italian (or English).

Here is the LIVE SYSTEM SNAPSHOT (JSON):
${snapshotJson}

User request: "${finalQueryText}"

You handle two types of requests:
TYPE A — QUESTIONS / VIEW REQUESTS (e.g. "Cosa devo mangiare oggi?", "Che devo fare in palestra?", "Che lezioni o task ho oggi/domani?", "Quanto posso spendere?"):
- Set "isQuestion": true.
- Write a clear, concise, well-structured answer in Italian inside "aiAnswer" using the exact data from the snapshot.
- Set "targetModule" to the most relevant module so the UI mounts it automatically: one of "diet", "gym", "tasks", "planner", "calendar", "notes", "money", "streak" (or null).

TYPE B — ACTIONS / LOGGING COMMANDS:
- Set "isQuestion": false.
- Translate all user intentions into 1 or more valid CLI commands inside "commands" from this exact DSL specification:
  1. "focus [Task Title or Category]" -> Start a Focus session on an existing task from todayTasksAndLessons (e.g. "focus Duolingo" or "focus French" WITHOUT inventing minutes: the system uses the task's configured durationMinutes and checks it off at the end!).
  2. "done [task title keyword]" -> Check off a task completed today (e.g. "done Duolingo").
  3. "out [amount] #[VaultOrCategory] [description]" -> Log expense (e.g. "out 20 #Amazon Cavo", "out 12 #Cibo Pizzeria").
  4. "in [amount] [description]" -> Log income (e.g. "in 500 Borsa di studio").
  5. "wish [item] [optional cost]" -> Add to purchase incubator.
  6. "todo [text]" -> Add general task to inbox.
  7. "task [title] [@oggi | @domani | @YYYY-MM-DD]" -> Schedule task on a date.
  8. "event [@oggi | @domani | @YYYY-MM-DD] [title]" -> Add calendar event.
  9. "note [CategoryName]: [clean polished text]" -> Add note in existing or brand-new category (remove stutters/fillers).
  10. "weight [kg] [optional note]" -> Log body weight.
  11. "gym done" -> Complete active workout split day.
  12. "red on" or "red off" or "red" -> Toggle Red Mode.
  13. "summon [calendar|tasks|notes|planner|diet|gym|money|streak]" or "zero" -> Open module or Zero-UI.

Return ONLY a valid JSON object with this exact structure (no markdown, no backticks):
{
  "wakeWordDetected": true,
  "wakeWordOnly": false,
  "isQuestion": true or false,
  "aiAnswer": "Direct answer in Italian if isQuestion is true, otherwise empty string",
  "targetModule": "diet|gym|tasks|planner|calendar|notes|money|streak or null",
  "transcript": "Clean transcription of what the user said or wrote",
  "commands": ["cmd 1", "cmd 2"]
}`;

        const parsed = await callGeminiJsonEndpoint([{ text: systemPrompt }], cleanKey, signal);
        if (signal.aborted) return null;

        isGeminiProcessing = false;
        const transcript = parsed.transcript || finalQueryText;
        const commands = Array.isArray(parsed.commands) ? parsed.commands : [];

        if (inputEl && transcript) {
            inputEl.value = transcript;
        }

        if (parsed.targetModule && typeof summonModule === 'function' && dashboardModules[parsed.targetModule]) {
            summonModule(parsed.targetModule);
        }

        if (parsed.isQuestion && parsed.aiAnswer && commands.length === 0) {
            if (answerBox) {
                answerBox.style.display = 'block';
                answerBox.innerHTML = `<div style="font-size:var(--font-xs); color:var(--text-dim); margin-bottom:6px; text-transform:uppercase;">QUERY // "${escapeHtml(transcript)}"</div><div>${escapeHtml(parsed.aiAnswer)}</div>`;
            }
            if (typeof updateAskStatusDot === 'function') updateAskStatusDot('standby');
            return parsed;
        }

        if (parsed.aiAnswer && answerBox) {
            answerBox.style.display = 'block';
            answerBox.innerHTML = `<div>${escapeHtml(parsed.aiAnswer)}</div>`;
        }

        openStagingArea(transcript, commands);
        return parsed;

    } catch (err) {
        isGeminiProcessing = false;
        if (err.name === 'AbortError') {
            if (typeof updateAskStatusDot === 'function') updateAskStatusDot('standby');
            return null;
        }
        if (typeof updateAskStatusDot === 'function') updateAskStatusDot('standby');
        if (!isWakeWordCheck && typeof showToast === 'function') {
            showToast(`[AI ERROR] ${err.message}`);
        }
        return null;
    }
}

// 2. INTERPRETE NATIVO DEL VERDETTO VOCALE NELLA STAGING AREA ("VA BENE" / "PROCEDI" / "RITENTA" / "ANNULLA")
async function evaluateSpokenStagingVerdict(audioBlob, mimeType = 'audio/webm') {
    const cleanKey = (geminiApiKey || '').trim();
    if (!cleanKey) return 'none';

    const promptText = `Listen to this short voice response from the user reviewing proposed actions in a confirmation dialog.
Classify what the user said into ONE of these exact verdicts:
- "confirm": if the user said "va bene", "procedi", "conferma", "sì", "si", "ok", "esegui", "perfetto", "vai".
- "retry": if the user said "ritenta", "riprova", "rifai", "no riprova", "sbagliato".
- "cancel": if the user said "annulla", "cancella", "chiudi", "esci", "ferma".
- "none": if it is just silence, noise, or unrelated.

Return ONLY valid JSON:
{ "verdict": "confirm" | "retry" | "cancel" | "none", "transcript": "what was heard" }`;

    try {
        const b64 = await blobToBase64(audioBlob);
        const userParts = [
            { text: promptText },
            { inlineData: { mimeType: mimeType.split(';')[0] || 'audio/webm', data: b64 } }
        ];
        const parsed = await callGeminiJsonEndpoint(userParts, cleanKey);
        return parsed.verdict || 'none';
    } catch (e) {
        return 'none';
    }
}

// ============================================================================
// 3. ESTRATTORE AZIONI DA SINGOLA SCHEDA NOTE (BROWSE MODE -> INLINE STAGING)
// ============================================================================

async function extractActionsFromNoteWithGemini(noteText) {
    const cleanKey = (geminiApiKey || '').trim();
    if (!cleanKey) {
        if (typeof showToast === 'function') showToast('[AI NOTES] Add your Gemini API Key in [SETTINGS] -> AI & Voice');
        if (typeof openSettingsModal === 'function') openSettingsModal('tab-ai');
        return null;
    }

    const snapshotJson = JSON.stringify(getSystemContextSnapshot());

    const promptText = `You are an action extractor for a personal Habit, Task, Finance & Health Tracker.
Analyze the following personal note written by the user and extract ONLY actionable items (things to buy, tasks to schedule on a specific day, general inbox todos, expenses/incomes, calendar events, or body weight logs).
Ignore pure reflections or non-actionable thoughts.

LIVE SYSTEM CONTEXT (for dates, existing categories, and vaults):
${snapshotJson}

NOTE TEXT TO ANALYZE:
"""
${noteText}
"""

Translate every actionable intention found in the note into valid CLI commands from this exact DSL specification:
- If the user mentions buying/getting an object or product (e.g. "devo comprare un pulisci lingua", "prendere cavo HDMI"):
  -> "wish [Item Name] [optional price]" (e.g. "wish Pulisci lingua")
- If the user mentions doing something on a specific day (e.g. "domani devo andare dai cinesi", "il 2026-10-28 consegnare report"):
  -> "task [Task Title] [@oggi | @domani | @YYYY-MM-DD]" (e.g. "task Andare dai cinesi @domani")
- If the user mentions a generic task without a specific date (e.g. "sistemare lo script python", "chiamare il medico"):
  -> "todo [Task Title]" (e.g. "todo Sistemare lo script Python")
- If the user mentions a calendar appointment/exam/event on a date:
  -> "event [@oggi | @domani | @YYYY-MM-DD] [title]"
- If the user mentions money spent or received:
  -> "out [amount] #[VaultOrCategory] [description]" OR "in [amount] [description]"
- If the user mentions body weight:
  -> "weight [kg] [optional note]"

Return ONLY a valid JSON object with this exact structure (no markdown, no backticks):
{
  "commands": ["cmd 1", "cmd 2"]
}`;

    const userParts = [{ text: promptText }];
    const parsed = await callGeminiJsonEndpoint(userParts, cleanKey);
    return Array.isArray(parsed.commands) ? parsed.commands : [];
}

// ============================================================================
// 4. PIPELINE REGISTRATORE VOCALE SONY -> EDITOR PROSA PULITA ("REGISTRAZIONI")
// ============================================================================

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
        if (typeof showToast === 'function') showToast('[ERROR] Add a Gemini API Key in [SETTINGS] first!');
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

window.addEventListener('DOMContentLoaded', updateGeminiAudioKeyStatusUI);