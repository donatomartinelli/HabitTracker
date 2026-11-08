// --- js/modules/notes.js ---
// ATOMIC MODULE 3 & 3 INDEPENDENT SUB-MODULES:
// 1. notes_write (#module-notes-write): Scrittura rapida + Registrazione Microfono [● REC] -> Gemini Verbatim -> Modale Centrale (2A)
// 2. notes_browse (#module-notes-browse): Mosaico a 2 colonne, Gerarchia Categorie/Sottocategorie, Right-Click Select, Summary & Actions
// 3. notes_graph (#module-notes-graph): Grafo Force-Directed interattivo (Categorie -> Sottocategorie -> Note + #tag/[[link]]) con Card di Anteprima (3)

let selectedNoteCardKeys = new Set(); // "catKey::storageIdx"
let expandedNoteCardsSet = new Set();
let notesSortMode = 'newest'; // 'newest' | 'longest' | 'shortest'

let activeParentCategory = 'General';
let activeSubcategoryFilter = '__HOLDING__'; // '__HOLDING__' | '__ALL__' | 'Parent / Sub'

// Stato Registrazione Microfono Live (2A)
let mediaRecorderInstance = null;
let recordedAudioChunks = [];
let isMicRecording = false;
let micRecordStartTimeMs = 0;
let micRecordTimerInterval = null;

// Stato Grafo Interattivo (3)
let graphFilterParentCat = 'ALL';
let graphSelectedNode = null;
let graphAnimFrameId = null;

// ============================================================================
// 1. GERARCHIA CATEGORIE PADRE & SOTTOCATEGORIE
// ============================================================================

function splitCategoryHierarchy(fullCatName) {
    const raw = (fullCatName || 'General').trim();
    const slashIdx = raw.indexOf('/');
    if (slashIdx === -1) {
        return { parent: raw, sub: null, full: raw };
    }
    const parent = raw.slice(0, slashIdx).trim() || 'General';
    const sub = raw.slice(slashIdx + 1).trim() || null;
    return { parent, sub, full: sub ? `${parent} / ${sub}` : parent };
}

function getAllParentCategories() {
    const parents = [];
    (noteCategories || []).forEach(c => {
        if (c === 'Extracted') return;
        const { parent } = splitCategoryHierarchy(c);
        if (parent && !parents.includes(parent)) parents.push(parent);
    });
    if (!parents.includes('General')) parents.unshift('General');
    if (!parents.includes('Registrazioni')) parents.push('Registrazioni');
    return parents;
}

function getSubcategoriesForParent(parentCat) {
    const subs = [];
    (noteCategories || []).forEach(c => {
        if (c === 'Extracted') return;
        const parsed = splitCategoryHierarchy(c);
        if (parsed.parent.toLowerCase() === (parentCat || '').toLowerCase() && parsed.sub) {
            if (!subs.some(s => s.full === parsed.full)) {
                subs.push(parsed);
            }
        }
    });
    return subs;
}

function getTargetCategoryForWrite() {
    if (activeSubcategoryFilter && activeSubcategoryFilter !== '__HOLDING__' && activeSubcategoryFilter !== '__ALL__') {
        return activeSubcategoryFilter;
    }
    return activeParentCategory || 'General';
}

function countNotesInParentTree(parentCat) {
    let total = parseCategoryIntoCards(notesContent[parentCat] || '').length;
    getSubcategoriesForParent(parentCat).forEach(s => {
        total += parseCategoryIntoCards(notesContent[s.full] || '').length;
    });
    return total;
}

function syncNotesCategoriesState() {
    if (!Array.isArray(noteCategories) || noteCategories.length === 0) {
        noteCategories = ['General', 'Registrazioni'];
    }
    noteCategories = noteCategories.filter(c => c !== 'Extracted');
    if (notesContent && notesContent['Extracted']) {
        delete notesContent['Extracted'];
    }
    if (!noteCategories.includes('General')) noteCategories.unshift('General');
    if (!noteCategories.includes('Registrazioni')) noteCategories.push('Registrazioni');

    const parents = getAllParentCategories();
    if (!parents.includes(activeParentCategory)) {
        activeParentCategory = parents[0] || 'General';
    }

    const subs = getSubcategoriesForParent(activeParentCategory);
    if (subs.length > 0 && activeSubcategoryFilter !== '__HOLDING__' && activeSubcategoryFilter !== '__ALL__') {
        if (!subs.some(s => s.full === activeSubcategoryFilter)) {
            activeSubcategoryFilter = '__HOLDING__';
        }
    } else if (subs.length === 0) {
        activeSubcategoryFilter = '__HOLDING__';
    }
}

function buildParentCategorySelectOptionsHtml() {
    const parents = getAllParentCategories();
    return parents.map(pCat => {
        const totalCount = countNotesInParentTree(pCat);
        const label = totalCount > 0 ? `${pCat} (${totalCount})` : pCat;
        return `<option value="${escapeHtml(pCat)}" ${pCat === activeParentCategory ? 'selected' : ''}>${escapeHtml(label)}</option>`;
    }).join('');
}

function renderSubcategoriesBarInto(barEl) {
    if (!barEl) return;
    barEl.innerHTML = '';

    const subs = getSubcategoriesForParent(activeParentCategory);
    const holdingCount = parseCategoryIntoCards(notesContent[activeParentCategory] || '').length;
    const allCount = countNotesInParentTree(activeParentCategory);

    const holdBtn = document.createElement('button');
    holdBtn.type = 'button';
    holdBtn.className = `note-subcat-pill ${activeSubcategoryFilter === '__HOLDING__' ? 'active' : ''}`;
    holdBtn.textContent = `${activeParentCategory} (${holdingCount})`;
    holdBtn.onclick = () => {
        activeSubcategoryFilter = '__HOLDING__';
        selectedNoteCardKeys.clear();
        renderNoteCategories();
    };
    barEl.appendChild(holdBtn);

    if (subs.length > 0) {
        const allBtn = document.createElement('button');
        allBtn.type = 'button';
        allBtn.className = `note-subcat-pill ${activeSubcategoryFilter === '__ALL__' ? 'active' : ''}`;
        allBtn.textContent = `ALL (${allCount})`;
        allBtn.onclick = () => {
            activeSubcategoryFilter = '__ALL__';
            selectedNoteCardKeys.clear();
            renderNoteCategories();
        };
        barEl.appendChild(allBtn);

        subs.forEach(s => {
            const sCount = parseCategoryIntoCards(notesContent[s.full] || '').length;
            const pill = document.createElement('button');
            pill.type = 'button';
            pill.className = `note-subcat-pill ${activeSubcategoryFilter === s.full ? 'active' : ''}`;
            pill.textContent = `${s.sub} (${sCount})`;
            pill.onclick = () => {
                activeSubcategoryFilter = s.full;
                selectedNoteCardKeys.clear();
                renderNoteCategories();
            };
            barEl.appendChild(pill);
        });
    }

    const addSubBtn = document.createElement('button');
    addSubBtn.type = 'button';
    addSubBtn.className = 'note-subcat-pill';
    addSubBtn.style.borderStyle = 'dashed';
    addSubBtn.textContent = '+ SUB';
    addSubBtn.onclick = () => {
        if (barEl.querySelector('.subcat-inline-inp')) return;
        addSubBtn.style.display = 'none';

        const inp = document.createElement('input');
        inp.type = 'text';
        inp.className = 'form-control form-control-sm subcat-inline-inp';
        inp.style.cssText = 'width: 130px; height: 22px; padding: 2px 6px; font-size: 0.65rem;';
        inp.placeholder = `Sub in ${activeParentCategory}...`;

        const commit = () => {
            const val = inp.value.trim().replace(/\//g, '');
            if (val) {
                const fullCat = `${activeParentCategory} / ${val}`;
                if (!noteCategories.includes(fullCat)) {
                    noteCategories.push(fullCat);
                    saveData();
                }
                activeSubcategoryFilter = fullCat;
            }
            renderNoteCategories();
        };

        inp.onkeydown = (e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit(); }
            else if (e.key === 'Escape') { e.preventDefault(); renderNoteCategories(); }
        };
        inp.onblur = commit;

        barEl.appendChild(inp);
        inp.focus();
    };
    barEl.appendChild(addSubBtn);
}

// ============================================================================
// 2. REGISTRAZIONE VOCALE DIRETTA DA MICROFONO ([● REC] -> GEMINI -> MODALE 2A)
// ============================================================================

function getMicRecButtonLabel() {
    if (!isMicRecording) return '[● REC]';
    const elapsedSec = Math.max(0, Math.floor((Date.now() - micRecordStartTimeMs) / 1000));
    const m = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
    const s = String(elapsedSec % 60).padStart(2, '0');
    return `[■ STOP ${m}:${s}]`;
}

function updateAllMicRecButtonsUI() {
    document.querySelectorAll('.btn-notes-mic-rec').forEach(btn => {
        btn.textContent = getMicRecButtonLabel();
        btn.classList.toggle('btn-rec-active', isMicRecording);
    });
}

async function toggleLiveMicRecording() {
    if (isMicRecording && mediaRecorderInstance) {
        mediaRecorderInstance.stop();
        return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        if (typeof showToast === 'function') showToast('[MIC ERROR] Microphone not supported in this environment');
        return;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        recordedAudioChunks = [];
        mediaRecorderInstance = new MediaRecorder(stream);

        mediaRecorderInstance.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) recordedAudioChunks.push(e.data);
        };

        mediaRecorderInstance.onstop = async () => {
            clearInterval(micRecordTimerInterval);
            isMicRecording = false;
            updateAllMicRecButtonsUI();
            stream.getTracks().forEach(track => track.stop());

            if (recordedAudioChunks.length === 0) return;
            const audioBlob = new Blob(recordedAudioChunks, { type: mediaRecorderInstance.mimeType || 'audio/webm' });

            if (typeof showToast === 'function') {
                showToast('[🎙 MIC] Audio captured — Transcribing verbatim with Gemini...');
            }
            document.querySelectorAll('.sony-pipeline-status-lbl').forEach(el => {
                el.textContent = '[◈ TRANSCRIBING MIC...]';
            });

            try {
                const res = await transcribeAndArchiveMicAudioBlob(audioBlob);
                document.querySelectorAll('.sony-pipeline-status-lbl').forEach(el => { el.textContent = ''; });

                if (res && res.text) {
                    const targetCat = getTargetCategoryForWrite();
                    if (!noteCategories.includes(targetCat)) noteCategories.push(targetCat);

                    const entryBlock = `=== [${res.dateStr} // ${res.fileName}] ===\n${res.text}`;
                    notesContent[targetCat] = (!notesContent[targetCat] || notesContent[targetCat].trim() === '')
                        ? entryBlock
                        : `${notesContent[targetCat]}\n\n${entryBlock}`;

                    saveData();
                    renderNoteCategories();

                    // 2A: Apre direttamente il Modale Centrale sulla nota appena trascritta, pronta per Summary o Actions!
                    const allCards = parseCategoryIntoCards(notesContent[targetCat] || '');
                    const newIdx = allCards.length - 1;
                    if (newIdx >= 0) {
                        openCentralNoteEditorModal(targetCat, newIdx);
                    }
                    if (typeof showToast === 'function') {
                        showToast(`[MIC TRANSCRIBED] Saved in "${targetCat}" & opened for review!`);
                    }
                }
            } catch (err) {
                document.querySelectorAll('.sony-pipeline-status-lbl').forEach(el => { el.textContent = ''; });
                if (typeof showToast === 'function') showToast(`[MIC ERROR] ${err.message}`);
            }
        };

        mediaRecorderInstance.start();
        isMicRecording = true;
        micRecordStartTimeMs = Date.now();
        updateAllMicRecButtonsUI();
        clearInterval(micRecordTimerInterval);
        micRecordTimerInterval = setInterval(updateAllMicRecButtonsUI, 500);
        if (typeof showToast === 'function') showToast('[● REC] Recording voice note... Click [■ STOP] when done');
    } catch (err) {
        if (typeof showToast === 'function') showToast(`[MIC PERMISSION] ${err.message || 'Cannot access microphone'}`);
    }
}

// ============================================================================
// 3. PARSING DELLE CARD E RENDER MASTER DEI 3 SOTTO-MODULI
// ============================================================================

function parseCategoryIntoCards(rawText) {
    const text = (rawText || '').trim();
    if (!text) return [];

    const chunks = text.split(/\n\n+/);
    const cards = [];

    chunks.forEach(chunk => {
        const trimmed = chunk.trim();
        if (!trimmed) return;

        const headerMatch = trimmed.match(/^===\s*\[(.*?)\]\s*===\s*\n?([\s\S]*)$/);
        if (headerMatch) {
            cards.push({
                isHeadered: true,
                headerLabel: headerMatch[1].trim(),
                body: (headerMatch[2] || '').trim(),
                raw: trimmed
            });
        } else if (cards.length > 0 && cards[cards.length - 1].isHeadered) {
            const prev = cards[cards.length - 1];
            prev.body = prev.body ? `${prev.body}\n\n${trimmed}` : trimmed;
            prev.raw = `=== [${prev.headerLabel}] ===\n${prev.body}`;
        } else {
            cards.push({
                isHeadered: false,
                headerLabel: null,
                body: trimmed,
                raw: trimmed
            });
        }
    });

    return cards;
}

function rebuildCategoryFromCards(cardsArray) {
    return (cardsArray || [])
        .map(c => {
            const cleanBody = (c.body || '').trim();
            if (!cleanBody && !c.headerLabel) return '';
            if (c.isHeadered && c.headerLabel) {
                return `=== [${c.headerLabel}] ===\n${cleanBody}`;
            }
            return cleanBody;
        })
        .filter(Boolean)
        .join('\n\n');
}

function renderNoteCategories() {
    syncNotesCategoriesState();
    renderNotesAtomWrite();
    renderNotesAtomBrowse();
    renderNotesAtomGraph();

    const legacyRoot = document.getElementById('module-notes');
    if (legacyRoot) {
        renderNotesAtomBrowse(legacyRoot);
    }
}

function refreshNotesView() {
    renderNoteCategories();
}

// ============================================================================
// SOTTO-MODULO 1: NOTES: WRITE (#module-notes-write)
// ============================================================================

function renderNotesAtomWrite(customContainer = null) {
    const root = customContainer || document.getElementById('module-notes-write');
    if (!root) return;

    syncNotesCategoriesState();
    const targetWriteCat = getTargetCategoryForWrite();

    root.innerHTML = `
        <div class="module-body-padded" style="flex:1; display:flex; flex-direction:column; gap:8px; overflow:hidden; height:100%;">
            <div class="section-header-row" style="margin-bottom:0; flex-wrap:wrap; gap:8px; flex-shrink:0;">
                <div>
                    <span class="section-label">Notes Write</span>
                    <span style="font-size:var(--font-xs); color:var(--text-dim); margin-left:6px; text-transform:uppercase;">// ${escapeHtml(targetWriteCat)}</span>
                    <span class="sony-pipeline-status-lbl" style="font-size:var(--font-xs); color:var(--accent-gold); font-weight:bold; margin-left:6px;"></span>
                </div>
                <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
                    <button type="button" class="btn btn-sm btn-notes-mic-rec ${isMicRecording ? 'btn-rec-active' : ''}" onclick="toggleLiveMicRecording()">${getMicRecButtonLabel()}</button>
                    <select class="form-control form-control-sm nw-cat-select" style="width:135px; font-weight:bold;">
                        ${buildParentCategorySelectOptionsHtml()}
                    </select>
                    <button type="button" class="btn btn-sm" onclick="openQuickNoteModal()">[+]</button>
                    <button type="button" class="btn btn-sm" onclick="openManageNotesModal()">[⚙]</button>
                </div>
            </div>

            <div class="notes-subcategories-bar nw-subbar"></div>

            <textarea id="note-write-atom-textarea" class="form-control" style="flex:1; height:100%; resize:none; line-height:1.55; padding:14px;" placeholder="Write in [${escapeHtml(targetWriteCat)}] and press Enter (Shift+Enter for new line)... Use #tags or [[Links]] to connect nodes in Graph."></textarea>
        </div>
    `;

    root.querySelector('.nw-cat-select').onchange = (e) => {
        activeParentCategory = e.target.value;
        activeSubcategoryFilter = '__HOLDING__';
        selectedNoteCardKeys.clear();
        renderNoteCategories();
    };

    renderSubcategoriesBarInto(root.querySelector('.nw-subbar'));

    const ta = root.querySelector('#note-write-atom-textarea');
    ta.onkeydown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            const text = ta.value.trim();
            if (!text) return;
            const cat = getTargetCategoryForWrite();
            if (!noteCategories.includes(cat)) noteCategories.push(cat);
            if (!notesContent[cat]) notesContent[cat] = '';
            notesContent[cat] += (notesContent[cat] === '' ? '' : '\n\n') + text;
            ta.value = '';
            saveData();
            renderNoteCategories();
            if (typeof showToast === 'function') showToast(`[SAVED] ${cat}`);
        }
    };
}

// ============================================================================
// SOTTO-MODULO 2: NOTES: BROWSE (#module-notes-browse)
// ============================================================================

let currentBrowseFilterQuery = '';

function renderNotesAtomBrowse(customContainer = null) {
    const root = customContainer || document.getElementById('module-notes-browse');
    if (!root) return;

    syncNotesCategoriesState();
    const targetCatLabel = getTargetCategoryForWrite();
    const sortLabels = {
        'newest': '[SORT: NEW]',
        'longest': '[SORT: LONG ↓]',
        'shortest': '[SORT: SHORT ↑]'
    };

    const allOrderedMoveCats = [];
    getAllParentCategories().forEach(p => {
        allOrderedMoveCats.push(p);
        getSubcategoriesForParent(p).forEach(s => allOrderedMoveCats.push(s.full));
    });
    const moveOptsHtml = `<option value="">[➔ MOVE...]</option>` + allOrderedMoveCats.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');

    const selCount = selectedNoteCardKeys.size;

    root.innerHTML = `
        <div class="module-body-padded" style="flex:1; display:flex; flex-direction:column; gap:8px; overflow:hidden; height:100%;">
            <div class="section-header-row" style="margin-bottom:0; flex-wrap:wrap; gap:8px; flex-shrink:0;">
                <div>
                    <span class="section-label">Notes Browse</span>
                    <span style="font-size:var(--font-xs); color:var(--text-dim); margin-left:6px; text-transform:uppercase;">// ${escapeHtml(targetCatLabel)}</span>
                    <span class="sony-pipeline-status-lbl" style="font-size:var(--font-xs); color:var(--accent-gold); font-weight:bold; margin-left:6px;"></span>
                </div>

                <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
                    <input type="text" class="form-control form-control-sm nb-search-inp" style="width:110px;" placeholder="Filter..." value="${escapeHtml(currentBrowseFilterQuery)}">
                    <button type="button" class="btn btn-sm nb-sort-btn">${sortLabels[notesSortMode]}</button>
                    <button type="button" class="btn btn-sm btn-notes-mic-rec ${isMicRecording ? 'btn-rec-active' : ''}" onclick="toggleLiveMicRecording()">${getMicRecButtonLabel()}</button>
                    <select class="form-control form-control-sm nb-cat-select" style="width:130px; font-weight:bold;">
                        ${buildParentCategorySelectOptionsHtml()}
                    </select>
                    <button type="button" class="btn btn-sm" onclick="openQuickNoteModal()">[+]</button>
                    <button type="button" class="btn btn-sm" onclick="openManageNotesModal()">[⚙]</button>
                </div>
            </div>

            <div class="notes-subcategories-bar nb-subbar"></div>

            <!-- BARRA OPERAZIONI (Compare selezionando col Tasto Destro) -->
            <div class="note-batch-bar nb-batch-bar" style="display:${selCount > 0 ? 'flex' : 'none'};">
                <div style="display:flex; align-items:center; gap:8px;">
                    <strong style="color:var(--text-main); font-size:var(--font-xs);">${selCount} SELECTED</strong>
                    <button type="button" class="btn btn-sm" onclick="selectAllVisibleNotes()">[ALL]</button>
                    <button type="button" class="btn btn-sm" onclick="clearNoteSelection()">[CLEAR]</button>
                </div>
                <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                    <button type="button" id="btn-batch-summary" class="btn btn-sm" style="border-color:var(--accent-gold); color:var(--accent-gold);" onclick="triggerBatchSummaryGeneration()">[✦ SUMMARY (${selCount})]</button>
                    <button type="button" id="btn-batch-ai" class="btn btn-primary btn-sm" onclick="triggerBatchAiExtraction()">[✦ ACTIONS (${selCount})]</button>
                    <button type="button" class="btn btn-sm" onclick="sendSelectedNoteCardsToInbox()">[-> INBOX]</button>
                    <button type="button" class="btn btn-sm" onclick="mergeSelectedNoteCards()" ${selCount < 2 ? 'disabled' : ''}>[MERGE]</button>
                    <select class="form-control form-control-sm" style="width:135px;" onchange="if(this.value){ moveSelectedNoteCardsTo(this.value); this.value=''; }">
                        ${moveOptsHtml}
                    </select>
                    <button type="button" class="btn btn-danger btn-sm" onclick="deleteSelectedNoteCards()">[DELETE]</button>
                </div>
            </div>

            <div id="notes-batch-ai-drawer" class="note-ai-drawer" style="display:none; flex-shrink:0; max-height:52%; overflow-y:auto;"></div>

            <div class="notes-browse-container nb-cards-mount" style="display:flex; flex:1; min-height:0;"></div>
        </div>
    `;

    root.querySelector('.nb-cat-select').onchange = (e) => {
        activeParentCategory = e.target.value;
        activeSubcategoryFilter = '__HOLDING__';
        selectedNoteCardKeys.clear();
        renderNoteCategories();
    };

    root.querySelector('.nb-sort-btn').onclick = () => {
        if (notesSortMode === 'newest') notesSortMode = 'longest';
        else if (notesSortMode === 'longest') notesSortMode = 'shortest';
        else notesSortMode = 'newest';
        renderNotesAtomBrowse(customContainer);
    };

    const searchInp = root.querySelector('.nb-search-inp');
    searchInp.oninput = () => {
        currentBrowseFilterQuery = searchInp.value;
        populateBrowseMasonryDom(root.querySelector('.nb-cards-mount'), currentBrowseFilterQuery);
    };

    renderSubcategoriesBarInto(root.querySelector('.nb-subbar'));
    populateBrowseMasonryDom(root.querySelector('.nb-cards-mount'), currentBrowseFilterQuery);
}

function getVisibleCategoriesForCurrentFilter() {
    if (activeSubcategoryFilter === '__ALL__') {
        return [activeParentCategory, ...getSubcategoriesForParent(activeParentCategory).map(s => s.full)];
    }
    if (activeSubcategoryFilter === '__HOLDING__') {
        return [activeParentCategory];
    }
    return [activeSubcategoryFilter];
}

function collectVisibleCardsList(filterQuery = '') {
    const q = (filterQuery || '').trim().toLowerCase();
    const catsToRead = getVisibleCategoriesForCurrentFilter();
    const collected = [];

    catsToRead.forEach(catKey => {
        const cards = parseCategoryIntoCards(notesContent[catKey] || '');
        for (let i = cards.length - 1; i >= 0; i--) {
            const card = cards[i];
            if (!q || card.raw.toLowerCase().includes(q)) {
                collected.push({
                    catKey: catKey,
                    storageIdx: i,
                    selectionKey: `${catKey}::${i}`,
                    card: card
                });
            }
        }
    });

    if (notesSortMode === 'longest') {
        collected.sort((a, b) => (b.card.body || '').length - (a.card.body || '').length);
    } else if (notesSortMode === 'shortest') {
        collected.sort((a, b) => (a.card.body || '').length - (b.card.body || '').length);
    }

    return collected;
}

function populateBrowseMasonryDom(browseCont, filterQuery = '') {
    if (!browseCont) return;
    browseCont.innerHTML = '';

    const visibleItems = collectVisibleCardsList(filterQuery);
    if (visibleItems.length === 0) {
        browseCont.innerHTML = `<div class="empty-state" style="text-align:center; padding-top:30px; width:100%;">[ EMPTY ]</div>`;
        return;
    }

    const colLeft = document.createElement('div');
    colLeft.className = 'notes-masonry-col';
    const colRight = document.createElement('div');
    colRight.className = 'notes-masonry-col';

    visibleItems.forEach(({ catKey, storageIdx, selectionKey, card }, visualIdx) => {
        const isSelected = selectedNoteCardKeys.has(selectionKey);
        const isLong = isCardContentLong(card.body);
        const isExpanded = expandedNoteCardsSet.has(selectionKey);

        const cardEl = document.createElement('div');
        cardEl.className = `note-card ${isSelected ? 'is-selected' : ''}`;

        const parsedHierarchy = splitCategoryHierarchy(catKey);
        const subBadgeText = (activeSubcategoryFilter === '__ALL__' && parsedHierarchy.sub)
            ? `[${parsedHierarchy.sub}] `
            : '';

        const metaInfoText = card.isHeadered && card.headerLabel
            ? `${subBadgeText}🎙 ${card.headerLabel} (${(card.body || '').length} chars)`
            : `${subBadgeText}NOTE #${storageIdx + 1} // ${catKey} (${(card.body || '').length} chars)`;

        const infoPopover = document.createElement('div');
        infoPopover.className = 'note-info-popover';
        infoPopover.textContent = metaInfoText;
        cardEl.appendChild(infoPopover);

        const hoverTools = document.createElement('div');
        hoverTools.className = 'note-card-hover-tools';

        const btnInfo = document.createElement('button');
        btnInfo.type = 'button';
        btnInfo.className = 'icon-btn';
        btnInfo.style.fontSize = '0.68rem';
        btnInfo.textContent = '[i]';
        btnInfo.onclick = (e) => {
            e.stopPropagation();
            infoPopover.classList.toggle('show');
        };

        const btnEdit = document.createElement('button');
        btnEdit.type = 'button';
        btnEdit.className = 'icon-btn';
        btnEdit.style.fontSize = '0.68rem';
        btnEdit.textContent = '[✎]';
        btnEdit.onclick = (e) => {
            e.stopPropagation();
            openCentralNoteEditorModal(catKey, storageIdx);
        };

        hoverTools.appendChild(btnInfo);
        hoverTools.appendChild(btnEdit);
        cardEl.appendChild(hoverTools);

        const bodyEl = document.createElement('div');
        bodyEl.className = `note-card-body ${(isLong && !isExpanded) ? 'is-collapsed' : ''}`;
        renderFormattedCardBody(bodyEl, card, catKey, storageIdx);

        cardEl.oncontextmenu = (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleNoteCardSelectionByKey(selectionKey);
        };

        let expandHint = null;
        const toggleExpandCollapse = (e) => {
            if (e) e.stopPropagation();
            if (!isLong) return;
            if (expandedNoteCardsSet.has(selectionKey)) {
                expandedNoteCardsSet.delete(selectionKey);
                bodyEl.classList.add('is-collapsed');
                if (expandHint) expandHint.textContent = '[+ EXPAND]';
            } else {
                expandedNoteCardsSet.add(selectionKey);
                bodyEl.classList.remove('is-collapsed');
                if (expandHint) expandHint.textContent = '[- COLLAPSE]';
            }
        };

        cardEl.onclick = (e) => {
            if (e.target.classList.contains('check-box') || e.target.classList.contains('note-date-tag')) return;
            if (isLong) toggleExpandCollapse(e);
        };

        bodyEl.ondblclick = (e) => {
            if (e.target.classList.contains('check-box') || e.target.classList.contains('note-date-tag')) return;
            e.stopPropagation();
            openCentralNoteEditorModal(catKey, storageIdx);
        };

        cardEl.appendChild(bodyEl);

        if (isLong) {
            expandHint = document.createElement('div');
            expandHint.className = 'note-expand-hint';
            expandHint.textContent = isExpanded ? '[- COLLAPSE]' : '[+ EXPAND]';
            expandHint.onclick = toggleExpandCollapse;
            cardEl.appendChild(expandHint);
        }

        if (visualIdx % 2 === 0) colLeft.appendChild(cardEl);
        else colRight.appendChild(cardEl);
    });

    browseCont.appendChild(colLeft);
    browseCont.appendChild(colRight);
}

// ============================================================================
// SOTTO-MODULO 3: NOTES: GRAPH (#module-notes-graph) CON PREVIEW INTERATTIVA
// ============================================================================

function extractNoteSemanticTags(bodyText) {
    const tags = new Set();
    const txt = (bodyText || '');
    // 1. Hashtags (#math, #idea)
    const hashMatches = txt.match(/#([a-zA-Z0-9_À-ÿ]{2,})/g) || [];
    hashMatches.forEach(h => tags.add(h.toLowerCase()));
    // 2. Wiki-links ([[Teorema]], [[Cortex]])
    const wikiMatches = txt.match(/\[\[(.*?)\]\]/g) || [];
    wikiMatches.forEach(w => tags.add(w.slice(2, -2).trim().toLowerCase()));
    // 3. Date tags (@2026-11-10)
    const dateMatches = txt.match(/@(\d{4}-\d{2}-\d{2}|oggi|domani)/gi) || [];
    dateMatches.forEach(d => tags.add(d.toLowerCase()));
    return Array.from(tags);
}

function buildNotesGraphTopology(filterParent = 'ALL') {
    const nodes = [];
    const links = [];
    const nodeMap = new Map();

    const parents = getAllParentCategories().filter(p => filterParent === 'ALL' || p === filterParent);

    parents.forEach((pCat, pIdx) => {
        const pId = `parent::${pCat}`;
        const angle = (pIdx / Math.max(1, parents.length)) * Math.PI * 2;
        const pNode = {
            id: pId,
            kind: 'parent',
            label: pCat.toUpperCase(),
            x: Math.cos(angle) * 140,
            y: Math.sin(angle) * 140,
            vx: 0, vy: 0,
            radius: 9,
            color: '#ffffff'
        };
        nodes.push(pNode);
        nodeMap.set(pId, pNode);

        // Note nella Holding Zone della categoria padre
        const holdingCards = parseCategoryIntoCards(notesContent[pCat] || '');
        holdingCards.forEach((card, idx) => {
            const nId = `note::${pCat}::${idx}`;
            const firstLine = (card.body || '').split('\n')[0].replace(/^[#\-*\s]+/, '').slice(0, 26) || `Note #${idx + 1}`;
            const nNode = {
                id: nId,
                kind: 'note',
                catKey: pCat,
                storageIdx: idx,
                card: card,
                label: firstLine,
                tags: extractNoteSemanticTags(card.body),
                x: pNode.x + (Math.random() - 0.5) * 90,
                y: pNode.y + (Math.random() - 0.5) * 90,
                vx: 0, vy: 0,
                radius: Math.min(7.5, Math.max(4, 3.5 + Math.log10((card.body || '').length + 10))),
                color: '#999999'
            };
            nodes.push(nNode);
            nodeMap.set(nId, nNode);
            links.push({ source: pNode, target: nNode, kind: 'hierarchy' });
        });

        // Sottocategorie e relative Note
        const subs = getSubcategoriesForParent(pCat);
        subs.forEach((sObj, sIdx) => {
            const sId = `sub::${sObj.full}`;
            const sAngle = angle + ((sIdx - (subs.length - 1) / 2) * 0.45);
            const sNode = {
                id: sId,
                kind: 'sub',
                label: sObj.sub.toUpperCase(),
                x: Math.cos(sAngle) * 230,
                y: Math.sin(sAngle) * 230,
                vx: 0, vy: 0,
                radius: 6.5,
                color: '#b08d43'
            };
            nodes.push(sNode);
            nodeMap.set(sId, sNode);
            links.push({ source: pNode, target: sNode, kind: 'hierarchy' });

            const subCards = parseCategoryIntoCards(notesContent[sObj.full] || '');
            subCards.forEach((card, idx) => {
                const nId = `note::${sObj.full}::${idx}`;
                const firstLine = (card.body || '').split('\n')[0].replace(/^[#\-*\s]+/, '').slice(0, 26) || `Note #${idx + 1}`;
                const nNode = {
                    id: nId,
                    kind: 'note',
                    catKey: sObj.full,
                    storageIdx: idx,
                    card: card,
                    label: firstLine,
                    tags: extractNoteSemanticTags(card.body),
                    x: sNode.x + (Math.random() - 0.5) * 80,
                    y: sNode.y + (Math.random() - 0.5) * 80,
                    vx: 0, vy: 0,
                    radius: Math.min(7.5, Math.max(4, 3.5 + Math.log10((card.body || '').length + 10))),
                    color: '#bbbbbb'
                };
                nodes.push(nNode);
                nodeMap.set(nId, nNode);
                links.push({ source: sNode, target: nNode, kind: 'hierarchy' });
            });
        });
    });

    // Collegamenti semantici trasversali tra note che condividono #tag, [[wiki-links]] o citazioni dirette
    const noteNodes = nodes.filter(n => n.kind === 'note');
    for (let i = 0; i < noteNodes.length; i++) {
        for (let j = i + 1; j < noteNodes.length; j++) {
            const a = noteNodes[i];
            const b = noteNodes[j];
            const sharedTag = a.tags.find(t => b.tags.includes(t));
            if (sharedTag) {
                links.push({ source: a, target: b, kind: 'semantic', tag: sharedTag });
            }
        }
    }

    return { nodes, links };
}

function renderNotesAtomGraph() {
    const root = document.getElementById('module-notes-graph');
    if (!root) return;

    if (graphAnimFrameId) {
        cancelAnimationFrame(graphAnimFrameId);
        graphAnimFrameId = null;
    }

    const parents = getAllParentCategories();
    const filterOptsHtml = `<option value="ALL" ${graphFilterParentCat === 'ALL' ? 'selected' : ''}>ALL CATEGORIES</option>` +
        parents.map(p => `<option value="${escapeHtml(p)}" ${graphFilterParentCat === p ? 'selected' : ''}>${escapeHtml(p.toUpperCase())}</option>`).join('');

    const { nodes, links } = buildNotesGraphTopology(graphFilterParentCat);
    const noteCount = nodes.filter(n => n.kind === 'note').length;

    // Assegna a ogni nodo una fase unica per il movimento perpetuo fluido
    nodes.forEach((n, idx) => {
        n.phase = idx * 1.37;
    });

    root.innerHTML = `
        <div class="module-body-padded" style="flex:1; display:flex; flex-direction:column; gap:8px; overflow:hidden; height:100%;">
            <div class="section-header-row" style="margin-bottom:0; flex-wrap:wrap; gap:8px; flex-shrink:0;">
                <div>
                    <span class="section-label">Notes Graph</span>
                    <span style="font-size:var(--font-xs); color:var(--text-dim); margin-left:6px;">// ${noteCount} NOTES · ${links.filter(l => l.kind === 'semantic').length} LINKS</span>
                </div>
                <div style="display:flex; gap:6px; align-items:center;">
                    <select class="form-control form-control-sm ng-filter-sel" style="width:145px; font-weight:bold;">
                        ${filterOptsHtml}
                    </select>
                    <button type="button" class="btn btn-sm ng-reset-cam">[CENTER]</button>
                </div>
            </div>

            <div class="notes-graph-stage" id="ng-stage">
                <canvas class="notes-graph-canvas" id="ng-canvas"></canvas>
                <div id="ng-preview-card" class="graph-node-preview-card" style="display:none;"></div>
            </div>
        </div>
    `;

    root.querySelector('.ng-filter-sel').onchange = (e) => {
        graphFilterParentCat = e.target.value;
        graphSelectedNode = null;
        renderNotesAtomGraph();
    };

    const stage = root.querySelector('#ng-stage');
    const canvas = root.querySelector('#ng-canvas');
    const previewCard = root.querySelector('#ng-preview-card');
    const ctx = canvas.getContext('2d');

    let camX = 0, camY = 0, camZoom = 1.0;
    let isPanning = false;
    let panStartX = 0, panStartY = 0;
    let draggedNode = null;
    let dragStartScreenPos = { x: 0, y: 0 };
    let hoveredNode = null;
    let dropTargetCatNode = null;
    let tickTime = 0;

    const resizeCanvas = () => {
        const rect = stage.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resizeCanvas();

    root.querySelector('.ng-reset-cam').onclick = () => {
        camX = 0;
        camY = 0;
        camZoom = 1.0;
    };

    const screenToWorld = (sx, sy) => {
        const rect = canvas.getBoundingClientRect();
        const cx = rect.width / 2;
        const cy = rect.height / 2;
        return {
            x: (sx - cx - camX) / camZoom,
            y: (sy - cy - camY) / camZoom
        };
    };

    const findNodeAtScreenPos = (sx, sy, excludeNode = null) => {
        const w = screenToWorld(sx, sy);
        for (let i = nodes.length - 1; i >= 0; i--) {
            const n = nodes[i];
            if (n === excludeNode) continue;
            const hitR = (n.radius + 6) / Math.min(1, camZoom);
            if (Math.hypot(w.x - n.x, w.y - n.y) <= hitR) {
                return n;
            }
        }
        return null;
    };

    // Restituisce il nome completo della categoria rappresentata da un nodo 'parent' o 'sub'
    const getCategoryNameFromCatNode = (catNode) => {
        if (!catNode) return null;
        if (catNode.kind === 'parent') {
            const rawId = catNode.id.replace(/^parent::/, '');
            return rawId;
        }
        if (catNode.kind === 'sub') {
            return catNode.id.replace(/^sub::/, '');
        }
        return null;
    };

    // Sposta una singola nota in un'altra categoria/sottocategoria quando la rilasci sopra un nodo nel grafo
    const moveSingleNoteFromGraphDrop = (noteNode, targetCatFull) => {
        if (!noteNode || !targetCatFull || noteNode.catKey === targetCatFull) return;
        const srcCat = noteNode.catKey;
        const srcIdx = noteNode.storageIdx;

        const srcCards = parseCategoryIntoCards(notesContent[srcCat] || '');
        if (srcIdx < 0 || srcIdx >= srcCards.length) return;

        const [movedCard] = srcCards.splice(srcIdx, 1);
        notesContent[srcCat] = rebuildCategoryFromCards(srcCards);

        if (!noteCategories.includes(targetCatFull)) {
            noteCategories.push(targetCatFull);
        }
        const destCards = parseCategoryIntoCards(notesContent[targetCatFull] || '');
        destCards.push(movedCard);
        notesContent[targetCatFull] = rebuildCategoryFromCards(destCards);

        saveData();
        graphSelectedNode = null;
        renderNoteCategories();
        if (typeof showToast === 'function') {
            showToast(`[GRAPH MOVE] Note moved to "${targetCatFull}"`);
        }
    };

    // Rinomina una Categoria Padre o una Sottocategoria direttamente dal Grafo (Doppio Click sul nodo)
    const renameCategoryNodeFromGraph = (catNode) => {
        const oldFull = getCategoryNameFromCatNode(catNode);
        if (!oldFull || oldFull === 'General' || oldFull === 'Registrazioni') {
            if (typeof showToast === 'function') showToast('[SYSTEM] Core category cannot be renamed');
            return;
        }

        const parsed = splitCategoryHierarchy(oldFull);
        const promptLabel = catNode.kind === 'sub' ? parsed.sub : parsed.parent;
        const entered = prompt(`Rename "${promptLabel}" to:`, promptLabel);
        if (!entered || !entered.trim()) return;
        const cleanNew = entered.trim().replace(/\//g, '');
        if (cleanNew === promptLabel) return;

        if (catNode.kind === 'sub') {
            const newFull = `${parsed.parent} / ${cleanNew}`;
            noteCategories = noteCategories.map(c => c === oldFull ? newFull : c);
            if (notesContent[oldFull] !== undefined) {
                notesContent[newFull] = notesContent[oldFull];
                delete notesContent[oldFull];
            }
        } else {
            // Rinomina sia la Categoria Padre sia tutte le sue Sottocategorie
            noteCategories = noteCategories.map(c => {
                if (c === oldFull) return cleanNew;
                if (c.startsWith(oldFull + ' / ')) return cleanNew + c.slice(oldFull.length);
                return c;
            });
            Object.keys(notesContent).forEach(k => {
                if (k === oldFull) {
                    notesContent[cleanNew] = notesContent[oldFull];
                    delete notesContent[oldFull];
                } else if (k.startsWith(oldFull + ' / ')) {
                    const newK = cleanNew + k.slice(oldFull.length);
                    notesContent[newK] = notesContent[k];
                    delete notesContent[k];
                }
            });
            if (activeParentCategory === oldFull) activeParentCategory = cleanNew;
            if (graphFilterParentCat === oldFull) graphFilterParentCat = cleanNew;
        }

        saveData();
        renderNoteCategories();
        if (typeof showToast === 'function') showToast(`[GRAPH] Renamed to "${cleanNew}"`);
    };

    // Card di anteprima pulita (senza barra superiore grigia)
    const renderGraphPreviewCard = (n) => {
        if (!n || n.kind !== 'note') {
            previewCard.style.display = 'none';
            previewCard.innerHTML = '';
            return;
        }

        previewCard.style.display = 'flex';

        const allOrderedMoveCats = [];
        getAllParentCategories().forEach(p => {
            allOrderedMoveCats.push(p);
            getSubcategoriesForParent(p).forEach(s => allOrderedMoveCats.push(s.full));
        });
        const moveOpts = allOrderedMoveCats.map(c =>
            `<option value="${escapeHtml(c)}" ${c === n.catKey ? 'selected' : ''}>${escapeHtml(c)}</option>`
        ).join('');

        previewCard.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; gap:6px;">
                <select id="ng-prev-cat-sel" class="form-control form-control-sm" style="flex:1; padding:2px 6px; font-size:0.65rem; font-weight:bold;">
                    ${moveOpts}
                </select>
                <button type="button" class="icon-btn" id="ng-prev-close">[×]</button>
            </div>
            <div style="font-size:var(--font-xs); color:var(--text-main); line-height:1.5; max-height:190px; overflow-y:auto; white-space:pre-wrap; word-break:break-word; padding:4px 0;">${escapeHtml(n.card.body)}</div>
            <div style="display:flex; gap:6px; justify-content:flex-end; padding-top:4px; flex-wrap:wrap;">
                <button type="button" class="btn btn-sm" id="ng-prev-edit">[✎ EDIT]</button>
                <button type="button" class="btn btn-sm" style="border-color:var(--accent-gold); color:var(--accent-gold);" id="ng-prev-sum">[✦ SUMMARY]</button>
                <button type="button" class="btn btn-primary btn-sm" id="ng-prev-act">[✦ ACTIONS]</button>
            </div>
        `;

        previewCard.querySelector('#ng-prev-cat-sel').onchange = (e) => {
            moveSingleNoteFromGraphDrop(n, e.target.value);
        };

        previewCard.querySelector('#ng-prev-close').onclick = () => {
            graphSelectedNode = null;
            renderGraphPreviewCard(null);
        };

        previewCard.querySelector('#ng-prev-edit').onclick = () => {
            openCentralNoteEditorModal(n.catKey, n.storageIdx);
        };

        previewCard.querySelector('#ng-prev-sum').onclick = () => {
            openCentralNoteEditorModal(n.catKey, n.storageIdx);
            setTimeout(() => document.getElementById('ncm-btn-summary')?.click(), 60);
        };

        previewCard.querySelector('#ng-prev-act').onclick = () => {
            selectedNoteCardKeys.clear();
            selectedNoteCardKeys.add(`${n.catKey}::${n.storageIdx}`);
            if (!activeSlots.includes('notes_browse')) {
                addModuleToTilingLayout('notes_browse');
            } else {
                renderNotesAtomBrowse();
            }
            setTimeout(() => triggerBatchAiExtraction(), 60);
        };
    };

    if (graphSelectedNode) {
        const match = nodes.find(x => x.id === graphSelectedNode.id);
        if (match) renderGraphPreviewCard(match);
    }

    canvas.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        const rect = canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const hit = findNodeAtScreenPos(sx, sy);

        if (hit) {
            draggedNode = hit;
            dragStartScreenPos = { x: sx, y: sy };
        } else {
            isPanning = true;
            panStartX = e.clientX - camX;
            panStartY = e.clientY - camY;
        }
    });

    canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;

        if (draggedNode) {
            const w = screenToWorld(sx, sy);
            draggedNode.x = w.x;
            draggedNode.y = w.y;
            draggedNode.vx = 0;
            draggedNode.vy = 0;

            // Se stai trascinando una nota sopra un nodo Categoria o Sottocategoria, evidenzialo come bersaglio di drop!
            if (draggedNode.kind === 'note') {
                const candidate = findNodeAtScreenPos(sx, sy, draggedNode);
                dropTargetCatNode = (candidate && (candidate.kind === 'parent' || candidate.kind === 'sub')) ? candidate : null;
            }
            return;
        }

        if (isPanning) {
            camX = e.clientX - panStartX;
            camY = e.clientY - panStartY;
            return;
        }

        hoveredNode = findNodeAtScreenPos(sx, sy);
        canvas.style.cursor = hoveredNode ? 'pointer' : 'grab';
    });

    window.addEventListener('mouseup', (e) => {
        if (draggedNode) {
            const rect = canvas.getBoundingClientRect();
            const sx = e.clientX - rect.left;
            const sy = e.clientY - rect.top;
            const moveDist = Math.hypot(sx - dragStartScreenPos.x, sy - dragStartScreenPos.y);

            // Se hai rilasciato una nota sopra un nodo Categoria/Sottocategoria -> sposta la nota!
            if (draggedNode.kind === 'note' && dropTargetCatNode) {
                const destCatFull = getCategoryNameFromCatNode(dropTargetCatNode);
                dropTargetCatNode = null;
                const nodeToMove = draggedNode;
                draggedNode = null;
                moveSingleNoteFromGraphDrop(nodeToMove, destCatFull);
                return;
            }

            // Se è stato un click rapido (senza trascinare lontano)
            if (moveDist < 6) {
                if (draggedNode.kind === 'note') {
                    graphSelectedNode = draggedNode;
                    renderGraphPreviewCard(draggedNode);
                } else {
                    const catFull = getCategoryNameFromCatNode(draggedNode);
                    const parsed = splitCategoryHierarchy(catFull);
                    activeParentCategory = parsed.parent;
                    activeSubcategoryFilter = parsed.sub ? parsed.full : '__HOLDING__';
                    renderNotesAtomWrite();
                    renderNotesAtomBrowse();
                }
            }
        }
        draggedNode = null;
        dropTargetCatNode = null;
        isPanning = false;
    });

    // Doppio click su Categoria/Sottocategoria -> Rinomina; Doppio click su Nota -> Apri Modale Centrale
    canvas.addEventListener('dblclick', (e) => {
        const rect = canvas.getBoundingClientRect();
        const hit = findNodeAtScreenPos(e.clientX - rect.left, e.clientY - rect.top);
        if (!hit) return;
        if (hit.kind === 'note') {
            openCentralNoteEditorModal(hit.catKey, hit.storageIdx);
        } else {
            renameCategoryNodeFromGraph(hit);
        }
    });

    // Tasto Destro nel Grafo:
    // - Su una Nota -> Seleziona/Deseleziona per Batch Actions
    // - Su una Categoria Padre -> Crea subito una nuova Sottocategoria figlia!
    canvas.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const hit = findNodeAtScreenPos(e.clientX - rect.left, e.clientY - rect.top);
        if (!hit) return;

        if (hit.kind === 'note') {
            const selKey = `${hit.catKey}::${hit.storageIdx}`;
            toggleNoteCardSelectionByKey(selKey);
        } else if (hit.kind === 'parent') {
            const pName = getCategoryNameFromCatNode(hit);
            const entered = prompt(`New Subcategory inside "${pName}":`);
            if (entered && entered.trim()) {
                const cleanSub = entered.trim().replace(/\//g, '');
                const full = `${pName} / ${cleanSub}`;
                if (!noteCategories.includes(full)) {
                    noteCategories.push(full);
                    saveData();
                    renderNoteCategories();
                    if (typeof showToast === 'function') showToast(`[SUBCATEGORY] Created "${full}"`);
                }
            }
        }
    });

    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.12 : 0.89;
        camZoom = Math.max(0.35, Math.min(3.2, camZoom * factor));
    }, { passive: false });

    // MOTORE FISICO CONTINUO (MOVIMENTO PERPETUO + REATTIVITÀ ELASTICA)
    const stepPhysicsAndDraw = () => {
        if (!document.body.contains(canvas)) return;

        const rect = stage.getBoundingClientRect();
        if (rect.width > 0 && Math.abs(canvas.width - rect.width * (window.devicePixelRatio || 1)) > 4) {
            resizeCanvas();
        }

        tickTime += 0.018;

        // 1. Repulsione Coulombiana continua tra tutti i nodi
        for (let i = 0; i < nodes.length; i++) {
            for (let j = i + 1; j < nodes.length; j++) {
                const a = nodes[i];
                const b = nodes[j];
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const distSq = dx * dx + dy * dy + 1;
                if (distSq < 22000) {
                    const dist = Math.sqrt(distSq);
                    const repStrength = (a.kind !== 'note' && b.kind !== 'note') ? 950 : 480;
                    const force = repStrength / distSq;
                    const fx = (dx / dist) * force;
                    const fy = (dy / dist) * force;
                    if (a !== draggedNode) { a.vx -= fx; a.vy -= fy; }
                    if (b !== draggedNode) { b.vx += fx; b.vy += fy; }
                }
            }
        }

        // 2. Attrazione elastica di Hooke lungo i collegamenti
        links.forEach(l => {
            const a = l.source;
            const b = l.target;
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const dist = Math.hypot(dx, dy) || 1;
            const targetLen = l.kind === 'semantic' ? 115 : (a.kind === 'parent' && b.kind === 'sub' ? 92 : 54);
            const k = l.kind === 'semantic' ? 0.016 : 0.048;
            const force = (dist - targetLen) * k;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            if (a !== draggedNode) { a.vx += fx; a.vy += fy; }
            if (b !== draggedNode) { b.vx -= fx; b.vy -= fy; }
        });

        // 3. Micro-turbolenza perpetua (mantiene il grafo sempre vivo e in leggero movimento) + Gravità centrale
        nodes.forEach(n => {
            if (n === draggedNode) return;
            const driftAmp = n.kind === 'note' ? 0.055 : 0.025;
            n.vx += Math.cos(tickTime + n.phase) * driftAmp - n.x * 0.0035;
            n.vy += Math.sin(tickTime * 0.85 + n.phase) * driftAmp - n.y * 0.0035;
            n.vx *= 0.86;
            n.vy *= 0.86;
            n.x += n.vx;
            n.y += n.vy;
        });

        // 4. Rendering Canvas Brutalista
        const w = rect.width;
        const h = rect.height;
        ctx.clearRect(0, 0, w, h);

        ctx.save();
        ctx.translate(w / 2 + camX, h / 2 + camY);
        ctx.scale(camZoom, camZoom);

        // Archi
        links.forEach(l => {
            const isConnectedToActive = (hoveredNode && (l.source === hoveredNode || l.target === hoveredNode)) ||
                (graphSelectedNode && (l.source === graphSelectedNode || l.target === graphSelectedNode)) ||
                (draggedNode && (l.source === draggedNode || l.target === draggedNode));

            ctx.beginPath();
            ctx.moveTo(l.source.x, l.source.y);
            ctx.lineTo(l.target.x, l.target.y);

            if (l.kind === 'semantic') {
                ctx.strokeStyle = isConnectedToActive ? '#ffffff' : 'rgba(176, 141, 67, 0.55)';
                ctx.setLineDash([3, 3]);
                ctx.lineWidth = isConnectedToActive ? 1.8 : 1.1;
            } else {
                ctx.strokeStyle = isConnectedToActive ? 'rgba(255, 255, 255, 0.75)' : 'rgba(255, 255, 255, 0.16)';
                ctx.setLineDash([]);
                ctx.lineWidth = isConnectedToActive ? 1.6 : 1.0;
            }
            ctx.stroke();
        });
        ctx.setLineDash([]);

        // Nodi (ZERO testo per le note, etichetta bianca solo per Categorie e Sottocategorie)
        nodes.forEach(n => {
            const isSel = (graphSelectedNode && graphSelectedNode.id === n.id) ||
                (n.kind === 'note' && selectedNoteCardKeys.has(`${n.catKey}::${n.storageIdx}`));
            const isHov = hoveredNode && hoveredNode.id === n.id;
            const isDropTarget = dropTargetCatNode && dropTargetCatNode.id === n.id;

            ctx.beginPath();
            if (n.kind === 'parent') {
                const s = n.radius * 1.8;
                ctx.rect(n.x - s / 2, n.y - s / 2, s, s);
            } else {
                ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
            }

            ctx.fillStyle = (isSel || isHov || isDropTarget) ? '#ffffff' : n.color;
            ctx.fill();

            if (isSel || isHov || isDropTarget || n.kind !== 'note') {
                ctx.strokeStyle = isDropTarget ? '#5f7a61' : '#ffffff';
                ctx.lineWidth = (isSel || isDropTarget) ? 2.5 : 1;
                ctx.stroke();
            }

            // Anello esterno per drop target o nota selezionata col tasto destro
            if (isDropTarget || (n.kind === 'note' && selectedNoteCardKeys.has(`${n.catKey}::${n.storageIdx}`))) {
                ctx.beginPath();
                ctx.arc(n.x, n.y, n.radius + 4, 0, Math.PI * 2);
                ctx.strokeStyle = isDropTarget ? '#ffffff' : 'rgba(255, 255, 255, 0.85)';
                ctx.lineWidth = 1.2;
                ctx.stroke();
            }

            // Mostra il titolo SOLO per Categorie Padre e Sottocategorie (mai per le singole note!)
            if (n.kind === 'parent' || n.kind === 'sub') {
                ctx.font = `${n.kind === 'parent' ? 'bold 10px' : 'bold 9px'} ui-monospace, monospace`;
                ctx.fillStyle = (isHov || isDropTarget || n.kind === 'parent') ? '#ffffff' : '#bbbbbb';
                const suffix = isDropTarget ? ' [DROP TO MOVE]' : '';
                ctx.fillText(n.label + suffix, n.x + n.radius + 6, n.y + 3);
            }
        });

        ctx.restore();
        graphAnimFrameId = requestAnimationFrame(stepPhysicsAndDraw);
    };

    graphAnimFrameId = requestAnimationFrame(stepPhysicsAndDraw);
}

// ============================================================================
// FUNZIONI CONDIVISE (FORMATTAZIONE TESTO, BATCH ACTIONS, SUMMARY & MODALE CENTRALE)
// ============================================================================

function formatInlineNoteTokens(lineStr) {
    const escaped = escapeHtml(lineStr);
    return escaped.replace(/@(\d{4}-\d{2}-\d{2}|oggi|today|domani|tomorrow|tmw|ieri|yesterday)\b/gi, (fullMatch, token) => {
        return `<span class="note-date-tag" onclick="handleNoteDateTagClick(event, '${escapeHtml(token)}')">@${escapeHtml(token)}</span>`;
    });
}

function handleNoteDateTagClick(event, rawToken) {
    event.stopPropagation();
    const resolvedDate = typeof resolveDateToken === 'function' ? resolveDateToken(rawToken) : null;
    if (!resolvedDate) return;

    if (typeof jumpToDate === 'function') jumpToDate(resolvedDate);
    if (typeof activeSlots !== 'undefined' && Array.isArray(activeSlots)) {
        const hasDateModule = activeSlots.some(m => ['calendar', 'cal_grid', 'tasks', 'planner'].includes(m));
        if (!hasDateModule && typeof summonModule === 'function') {
            summonModule('tasks');
        }
    }
    if (typeof showToast === 'function') showToast(`[DATE] ${resolvedDate}`);
}

function toggleNoteCardCheckbox(cat, storageIndex, lineIndex) {
    const cards = parseCategoryIntoCards(notesContent[cat] || '');
    const target = cards[storageIndex];
    if (!target) return;

    const lines = target.body.split('\n');
    if (lineIndex < 0 || lineIndex >= lines.length) return;

    lines[lineIndex] = lines[lineIndex].replace(/^(\s*(?:[-*]\s+)?)\[([ xX])\](\s+.*)$/, (m, prefix, state, rest) => {
        const nextState = (state.toLowerCase() === 'x') ? ' ' : 'x';
        return `${prefix}[${nextState}]${rest}`;
    });

    target.body = lines.join('\n');
    notesContent[cat] = rebuildCategoryFromCards(cards);
    saveData();
    renderNotesAtomBrowse();
}

function isCardContentLong(bodyText) {
    const txt = (bodyText || '').trim();
    if (txt.length > 240) return true;
    return txt.split('\n').length > 5;
}

function renderFormattedCardBody(bodyContainer, card, cat, storageIdx) {
    bodyContainer.innerHTML = '';
    const lines = (card.body || '').split('\n');

    lines.forEach((line, lineIdx) => {
        const checkMatch = line.match(/^\s*(?:[-*]\s+)?\[([ xX])\]\s+(.*)$/);
        if (checkMatch) {
            const isChecked = checkMatch[1].toLowerCase() === 'x';
            const textContent = checkMatch[2];

            const row = document.createElement('div');
            row.className = 'note-md-check-row';

            const cb = document.createElement('div');
            cb.className = `check-box ${isChecked ? 'checked' : ''}`;
            cb.onclick = (e) => {
                e.stopPropagation();
                toggleNoteCardCheckbox(cat, storageIdx, lineIdx);
            };

            const txt = document.createElement('span');
            txt.className = `note-md-check-text ${isChecked ? 'checked' : ''}`;
            txt.innerHTML = formatInlineNoteTokens(textContent);

            row.appendChild(cb);
            row.appendChild(txt);
            bodyContainer.appendChild(row);
            return;
        }

        const listMatch = line.match(/^\s*[-*]\s+(.*)$/);
        if (listMatch) {
            const row = document.createElement('div');
            row.className = 'note-md-list-item';
            row.innerHTML = `<span class="note-md-bullet">•</span><span>${formatInlineNoteTokens(listMatch[1])}</span>`;
            bodyContainer.appendChild(row);
            return;
        }

        const lineDiv = document.createElement('div');
        if (line.trim() === '') {
            lineDiv.style.height = '8px';
        } else {
            lineDiv.innerHTML = formatInlineNoteTokens(line);
        }
        bodyContainer.appendChild(lineDiv);
    });
}

function toggleNoteCardSelectionByKey(selectionKey) {
    if (selectedNoteCardKeys.has(selectionKey)) {
        selectedNoteCardKeys.delete(selectionKey);
    } else {
        selectedNoteCardKeys.add(selectionKey);
    }
    renderNotesAtomBrowse();
}

function selectAllVisibleNotes() {
    const visible = collectVisibleCardsList(currentBrowseFilterQuery);
    visible.forEach(item => selectedNoteCardKeys.add(item.selectionKey));
    renderNotesAtomBrowse();
}

function clearNoteSelection() {
    selectedNoteCardKeys.clear();
    closeBatchAiDrawer();
    renderNotesAtomBrowse();
}

function parseSelectionKeysToGroupMap(keysSet) {
    const byCat = {};
    Array.from(keysSet).forEach(k => {
        const sepIdx = k.lastIndexOf('::');
        if (sepIdx === -1) return;
        const cat = k.slice(0, sepIdx);
        const idx = parseInt(k.slice(sepIdx + 2), 10);
        if (!isNaN(idx)) {
            if (!byCat[cat]) byCat[cat] = [];
            if (!byCat[cat].includes(idx)) byCat[cat].push(idx);
        }
    });
    return byCat;
}

function removeNoteCardsBySelectionKeys(keysArrayOrSet) {
    const byCat = parseSelectionKeysToGroupMap(keysArrayOrSet);
    for (const [cat, indices] of Object.entries(byCat)) {
        const allCards = parseCategoryIntoCards(notesContent[cat] || '');
        indices.sort((a, b) => b - a).forEach(idx => {
            if (idx >= 0 && idx < allCards.length) {
                allCards.splice(idx, 1);
            }
        });
        notesContent[cat] = rebuildCategoryFromCards(allCards);
    }
    selectedNoteCardKeys.clear();
    saveData();
    renderNoteCategories();
}

function mergeSelectedNoteCards() {
    if (selectedNoteCardKeys.size < 2) return;

    const byCat = parseSelectionKeysToGroupMap(selectedNoteCardKeys);
    const mergedBodies = [];
    let targetCat = null;
    let firstCardMeta = null;

    for (const [cat, indices] of Object.entries(byCat)) {
        const allCards = parseCategoryIntoCards(notesContent[cat] || '');
        indices.sort((a, b) => a - b).forEach(idx => {
            if (allCards[idx]) {
                if (!targetCat) {
                    targetCat = cat;
                    firstCardMeta = allCards[idx];
                }
                mergedBodies.push((allCards[idx].body || '').trim());
            }
        });
    }

    if (!targetCat || mergedBodies.length < 2) return;

    const byCatDesc = parseSelectionKeysToGroupMap(selectedNoteCardKeys);
    for (const [cat, indices] of Object.entries(byCatDesc)) {
        const allCards = parseCategoryIntoCards(notesContent[cat] || '');
        indices.sort((a, b) => b - a).forEach(idx => {
            if (idx >= 0 && idx < allCards.length) allCards.splice(idx, 1);
        });
        notesContent[cat] = rebuildCategoryFromCards(allCards);
    }

    const destCards = parseCategoryIntoCards(notesContent[targetCat] || '');
    const combinedBody = mergedBodies.filter(Boolean).join('\n\n');
    destCards.push({
        isHeadered: firstCardMeta ? firstCardMeta.isHeadered : false,
        headerLabel: firstCardMeta ? firstCardMeta.headerLabel : null,
        body: combinedBody,
        raw: (firstCardMeta && firstCardMeta.isHeadered && firstCardMeta.headerLabel)
            ? `=== [${firstCardMeta.headerLabel}] ===\n${combinedBody}`
            : combinedBody
    });
    notesContent[targetCat] = rebuildCategoryFromCards(destCards);

    selectedNoteCardKeys.clear();
    saveData();
    renderNoteCategories();
    if (typeof showToast === 'function') showToast(`[MERGED] Combined into "${targetCat}"`);
}

function moveSelectedNoteCardsTo(targetCatRaw) {
    const targetCat = (targetCatRaw || '').trim();
    if (!targetCat || selectedNoteCardKeys.size === 0) return;

    if (!noteCategories.includes(targetCat)) {
        noteCategories.push(targetCat);
    }

    const byCat = parseSelectionKeysToGroupMap(selectedNoteCardKeys);
    const cardsToMove = [];

    for (const [cat, indices] of Object.entries(byCat)) {
        if (cat === targetCat) continue;
        const srcCards = parseCategoryIntoCards(notesContent[cat] || '');
        indices.sort((a, b) => a - b).forEach(idx => {
            if (srcCards[idx]) cardsToMove.push(srcCards[idx]);
        });
        indices.sort((a, b) => b - a).forEach(idx => {
            if (idx >= 0 && idx < srcCards.length) srcCards.splice(idx, 1);
        });
        notesContent[cat] = rebuildCategoryFromCards(srcCards);
    }

    if (cardsToMove.length > 0) {
        const destCards = parseCategoryIntoCards(notesContent[targetCat] || '');
        destCards.push(...cardsToMove);
        notesContent[targetCat] = rebuildCategoryFromCards(destCards);
    }

    selectedNoteCardKeys.clear();
    saveData();
    renderNoteCategories();
    if (typeof showToast === 'function') showToast(`[MOVED] ➔ ${targetCat}`);
}

function sendSelectedNoteCardsToInbox() {
    if (selectedNoteCardKeys.size === 0) return;
    const byCat = parseSelectionKeysToGroupMap(selectedNoteCardKeys);
    const dayIndex = parseLocalDate(selectedDateStr).getDay();
    const todoCatName = 'General To-Do';
    if (!categoryOrder.includes(todoCatName)) categoryOrder.push(todoCatName);

    let count = 0;
    for (const [cat, indices] of Object.entries(byCat)) {
        const allCards = parseCategoryIntoCards(notesContent[cat] || '');
        indices.sort((a, b) => a - b).forEach(idx => {
            if (!allCards[idx]) return;
            const cleanLine = (allCards[idx].body || '').replace(/\s+/g, ' ').trim();
            if (!cleanLine) return;

            if (cleanLine.toLowerCase().startsWith('comprare ')) {
                const itemTitle = cleanLine.substring(9).trim();
                mWishlist.push({ id: 'mw_' + Date.now() + '_' + count, title: itemTitle, cost: '', order: mWishlist.length });
            } else {
                templates.push({
                    id: 't_' + Date.now() + '_' + Math.floor(Math.random() * 10000),
                    isTodo: true,
                    category: todoCatName,
                    title: cleanLine,
                    instances: 1,
                    timerMinutes: 15,
                    noTimer: true,
                    frequency: 'specific',
                    daysOfWeek: [dayIndex],
                    startDate: selectedDateStr,
                    endDate: selectedDateStr,
                    color: '#ffffff',
                    type: 'untimed',
                    timeWindows: []
                });
            }
            count++;
        });
    }

    saveMoneyData();
    if (typeof renderMoneyDashboard === 'function') renderMoneyDashboard();
    if (typeof renderTasks === 'function') renderTasks();

    removeNoteCardsBySelectionKeys(selectedNoteCardKeys);
    if (typeof showToast === 'function') showToast(`[INBOX] Added ${count} item(s)`);
}

function deleteSelectedNoteCards() {
    if (selectedNoteCardKeys.size === 0) return;
    const count = selectedNoteCardKeys.size;
    removeNoteCardsBySelectionKeys(selectedNoteCardKeys);
    if (typeof showToast === 'function') showToast(`[DELETED] ${count} note(s)`);
}

// ============================================================================
// MODALE CENTRALE SCURO DI MODIFICA & QUICK CAPTURE (CON [● REC] INTEGRATO)
// ============================================================================

function ensureCentralNoteModalExists() {
    let modal = document.getElementById('noteCentralEditorModal');
    if (modal) return modal;

    const root = document.getElementById('modals-root') || document.body;
    modal = document.createElement('div');
    modal.id = 'noteCentralEditorModal';
    modal.className = 'modal-overlay';
    modal.onclick = (e) => { if (e.target === modal) closeModals(); };

    modal.innerHTML = `
        <div class="modal-content" style="width: 720px; max-width: 95%; display: flex; flex-direction: column; gap: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); padding-bottom: 10px;">
                <h2 id="ncm-title" style="margin: 0; border: none; padding: 0;">Note</h2>
                <div style="display: flex; gap: 6px; align-items: center;">
                    <select id="ncm-parent-cat" class="form-control form-control-sm" style="width: 140px; font-weight: bold;"></select>
                    <select id="ncm-sub-cat" class="form-control form-control-sm" style="width: 140px;"></select>
                    <button type="button" class="btn btn-sm" onclick="closeModals()">[ESC]</button>
                </div>
            </div>

            <div style="display: flex; justify-content: space-between; align-items: center; gap: 6px; flex-wrap: wrap;">
                <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                    <button type="button" class="btn btn-sm btn-notes-mic-rec" onclick="toggleLiveMicRecording()">[● REC]</button>
                    <button type="button" id="ncm-btn-split" class="btn btn-sm" style="border-color: var(--accent-gold); color: var(--accent-gold);">[✂ SPLIT AT CURSOR]</button>
                    <button type="button" id="ncm-btn-summary" class="btn btn-sm">[✦ GENERATE SUMMARY]</button>
                    <button type="button" id="ncm-btn-actions" class="btn btn-sm">[✦ GENERATE ACTIONS]</button>
                </div>
                <span id="ncm-status" style="font-size: var(--font-xs); color: var(--accent-gold);"></span>
            </div>

            <textarea id="ncm-textarea" class="note-inline-editor" style="min-height: 260px; font-size: var(--font-sm); line-height: 1.55;" placeholder="Write note..."></textarea>

            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px;">
                <button type="button" id="ncm-btn-delete" class="btn btn-danger btn-sm" style="display: none;">[DELETE]</button>
                <div style="display: flex; gap: 8px; margin-left: auto;">
                    <button type="button" class="btn" onclick="closeModals()">Cancel</button>
                    <button type="button" id="ncm-btn-save" class="btn btn-primary">[SAVE // CTRL+ENTER]</button>
                </div>
            </div>
        </div>
    `;

    root.appendChild(modal);
    return modal;
}

function populateCentralModalCategorySelects(initialFullCat) {
    const parentSel = document.getElementById('ncm-parent-cat');
    const subSel = document.getElementById('ncm-sub-cat');
    if (!parentSel || !subSel) return;

    const parsed = splitCategoryHierarchy(initialFullCat || getTargetCategoryForWrite());
    const parents = getAllParentCategories();
    if (!parents.includes(parsed.parent)) parents.push(parsed.parent);

    parentSel.innerHTML = '';
    parents.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p;
        opt.textContent = p;
        if (p === parsed.parent) opt.selected = true;
        parentSel.appendChild(opt);
    });
    const newParentOpt = document.createElement('option');
    newParentOpt.value = '__NEW_PARENT__';
    newParentOpt.textContent = '+ New Category...';
    parentSel.appendChild(newParentOpt);

    const updateSubOptions = (parentName, selectedSubName = null) => {
        subSel.innerHTML = `<option value="">[Holding Zone]</option>`;
        getSubcategoriesForParent(parentName).forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.sub;
            opt.textContent = `/ ${s.sub}`;
            if (selectedSubName && s.sub === selectedSubName) opt.selected = true;
            subSel.appendChild(opt);
        });
        const newSubOpt = document.createElement('option');
        newSubOpt.value = '__NEW_SUB__';
        newSubOpt.textContent = '+ New Subcategory...';
        subSel.appendChild(newSubOpt);
    };

    updateSubOptions(parsed.parent, parsed.sub);

    parentSel.onchange = () => {
        if (parentSel.value === '__NEW_PARENT__') {
            const entered = prompt('New Category Name:');
            if (entered && entered.trim()) {
                const clean = entered.trim().replace(/\//g, '');
                if (!noteCategories.includes(clean)) noteCategories.push(clean);
                populateCentralModalCategorySelects(clean);
            } else {
                parentSel.value = parsed.parent;
            }
            return;
        }
        updateSubOptions(parentSel.value, null);
    };

    subSel.onchange = () => {
        if (subSel.value === '__NEW_SUB__') {
            const entered = prompt(`New Subcategory inside "${parentSel.value}":`);
            if (entered && entered.trim()) {
                const cleanSub = entered.trim().replace(/\//g, '');
                const full = `${parentSel.value} / ${cleanSub}`;
                if (!noteCategories.includes(full)) noteCategories.push(full);
                updateSubOptions(parentSel.value, cleanSub);
            } else {
                subSel.value = '';
            }
        }
    };
}

function getCentralModalSelectedFullCategory() {
    const p = document.getElementById('ncm-parent-cat')?.value || 'General';
    const s = document.getElementById('ncm-sub-cat')?.value || '';
    const full = (s && s !== '__NEW_SUB__') ? `${p} / ${s}` : p;
    if (!noteCategories.includes(full)) noteCategories.push(full);
    return full;
}

function openCentralNoteEditorModal(sourceCat, storageIdx) {
    const allCards = parseCategoryIntoCards(notesContent[sourceCat] || '');
    const targetCard = allCards[storageIdx];
    if (!targetCard) return;

    const modal = ensureCentralNoteModalExists();
    if (typeof setHudTemporaryExpansion === 'function') setHudTemporaryExpansion(true);
    closeModals();
    if (typeof setHudTemporaryExpansion === 'function') setHudTemporaryExpansion(true);

    document.getElementById('ncm-title').textContent = 'Edit Note';
    populateCentralModalCategorySelects(sourceCat);

    const ta = document.getElementById('ncm-textarea');
    const statusEl = document.getElementById('ncm-status');
    const btnSplit = document.getElementById('ncm-btn-split');
    const btnSummary = document.getElementById('ncm-btn-summary');
    const btnActions = document.getElementById('ncm-btn-actions');
    const btnDel = document.getElementById('ncm-btn-delete');
    const btnSave = document.getElementById('ncm-btn-save');

    ta.value = targetCard.body || '';
    statusEl.textContent = '';
    btnSplit.style.display = 'inline-block';
    btnDel.style.display = 'inline-block';

    const saveChanges = () => {
        const newBody = ta.value.trim();
        const destCat = getCentralModalSelectedFullCategory();
        const currentSrcCards = parseCategoryIntoCards(notesContent[sourceCat] || '');

        if (!newBody) {
            currentSrcCards.splice(storageIdx, 1);
            notesContent[sourceCat] = rebuildCategoryFromCards(currentSrcCards);
        } else if (destCat === sourceCat) {
            currentSrcCards[storageIdx].body = newBody;
            notesContent[sourceCat] = rebuildCategoryFromCards(currentSrcCards);
        } else {
            const movedCard = currentSrcCards.splice(storageIdx, 1)[0];
            movedCard.body = newBody;
            notesContent[sourceCat] = rebuildCategoryFromCards(currentSrcCards);

            const destCards = parseCategoryIntoCards(notesContent[destCat] || '');
            destCards.push(movedCard);
            notesContent[destCat] = rebuildCategoryFromCards(destCards);
        }

        saveData();
        closeModals();
        renderNoteCategories();
        if (typeof showToast === 'function') showToast('[NOTES] Saved');
    };

    const splitAtCursor = () => {
        const pos = ta.selectionStart;
        const fullText = ta.value;
        const firstHalf = fullText.slice(0, pos).trim();
        const secondHalf = fullText.slice(pos).trim();

        if (!firstHalf || !secondHalf) {
            if (typeof showToast === 'function') showToast('[SPLIT] Place cursor inside text');
            ta.focus();
            return;
        }

        const currentSrcCards = parseCategoryIntoCards(notesContent[sourceCat] || '');
        const cardPart1 = {
            isHeadered: targetCard.isHeadered,
            headerLabel: targetCard.headerLabel,
            body: firstHalf,
            raw: targetCard.isHeadered && targetCard.headerLabel
                ? `=== [${targetCard.headerLabel}] ===\n${firstHalf}`
                : firstHalf
        };
        const cardPart2 = {
            isHeadered: targetCard.isHeadered,
            headerLabel: targetCard.headerLabel ? `${targetCard.headerLabel} // PART 2` : null,
            body: secondHalf,
            raw: targetCard.isHeadered && targetCard.headerLabel
                ? `=== [${targetCard.headerLabel} // PART 2] ===\n${secondHalf}`
                : secondHalf
        };

        currentSrcCards.splice(storageIdx, 1, cardPart1, cardPart2);
        notesContent[sourceCat] = rebuildCategoryFromCards(currentSrcCards);
        saveData();
        closeModals();
        renderNoteCategories();
        if (typeof showToast === 'function') showToast('[SPLIT] Split into 2 notes');
    };

    btnSplit.onclick = splitAtCursor;
    btnSave.onclick = saveChanges;

    btnDel.onclick = () => {
        const currentSrcCards = parseCategoryIntoCards(notesContent[sourceCat] || '');
        currentSrcCards.splice(storageIdx, 1);
        notesContent[sourceCat] = rebuildCategoryFromCards(currentSrcCards);
        saveData();
        closeModals();
        renderNoteCategories();
        if (typeof showToast === 'function') showToast('[DELETED] Note removed');
    };

    btnSummary.onclick = async () => {
        if (!ta.value.trim() || typeof summarizeAndStructureNoteWithGemini !== 'function') return;
        statusEl.textContent = '[◈ GENERATING SUMMARY...]';
        btnSummary.disabled = true;
        try {
            const rewritten = await summarizeAndStructureNoteWithGemini(ta.value.trim());
            if (rewritten) ta.value = rewritten;
            statusEl.textContent = '[✓ STRUCTURED FOR PROMPT]';
        } catch (err) {
            statusEl.textContent = `[ERROR] ${err.message}`;
        }
        btnSummary.disabled = false;
    };

    btnActions.onclick = async () => {
        const destCat = getCentralModalSelectedFullCategory();
        saveChanges();
        const cards = parseCategoryIntoCards(notesContent[destCat] || '');
        const targetIdx = destCat === sourceCat ? storageIdx : (cards.length - 1);
        selectedNoteCardKeys.clear();
        selectedNoteCardKeys.add(`${destCat}::${targetIdx}`);
        if (!activeSlots.includes('notes_browse')) {
            addModuleToTilingLayout('notes_browse');
        } else {
            renderNotesAtomBrowse();
        }
        setTimeout(() => triggerBatchAiExtraction(), 60);
    };

    ta.onkeydown = (e) => {
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 's' || e.key === 'S')) {
            e.preventDefault();
            splitAtCursor();
        } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            saveChanges();
        }
    };

    modal.style.display = 'flex';
    setTimeout(() => ta.focus(), 25);
}

function openQuickNoteModal() {
    const modal = ensureCentralNoteModalExists();
    if (typeof setHudTemporaryExpansion === 'function') setHudTemporaryExpansion(true);
    closeModals();
    if (typeof setHudTemporaryExpansion === 'function') setHudTemporaryExpansion(true);

    document.getElementById('ncm-title').textContent = 'Quick Note';
    populateCentralModalCategorySelects(getTargetCategoryForWrite());

    const ta = document.getElementById('ncm-textarea');
    const statusEl = document.getElementById('ncm-status');
    const btnSplit = document.getElementById('ncm-btn-split');
    const btnSummary = document.getElementById('ncm-btn-summary');
    const btnActions = document.getElementById('ncm-btn-actions');
    const btnDel = document.getElementById('ncm-btn-delete');
    const btnSave = document.getElementById('ncm-btn-save');

    ta.value = '';
    statusEl.textContent = '';
    btnSplit.style.display = 'none';
    btnDel.style.display = 'none';

    const saveQuickNote = () => {
        const body = ta.value.trim();
        if (!body) { closeModals(); return; }
        const destCat = getCentralModalSelectedFullCategory();
        if (!notesContent[destCat]) notesContent[destCat] = '';
        notesContent[destCat] += (notesContent[destCat] === '' ? '' : '\n\n') + body;
        saveData();
        closeModals();
        renderNoteCategories();
        if (typeof showToast === 'function') showToast(`[NOTE SAVED] ➔ ${destCat}`);
    };

    btnSave.onclick = saveQuickNote;

    btnSummary.onclick = async () => {
        if (!ta.value.trim() || typeof summarizeAndStructureNoteWithGemini !== 'function') return;
        statusEl.textContent = '[◈ GENERATING SUMMARY...]';
        btnSummary.disabled = true;
        try {
            const rewritten = await summarizeAndStructureNoteWithGemini(ta.value.trim());
            if (rewritten) ta.value = rewritten;
            statusEl.textContent = '[✓ STRUCTURED FOR PROMPT]';
        } catch (err) {
            statusEl.textContent = `[ERROR] ${err.message}`;
        }
        btnSummary.disabled = false;
    };

    btnActions.onclick = async () => {
        const body = ta.value.trim();
        if (!body) return;
        const destCat = getCentralModalSelectedFullCategory();
        if (!notesContent[destCat]) notesContent[destCat] = '';
        notesContent[destCat] += (notesContent[destCat] === '' ? '' : '\n\n') + body;
        saveData();
        closeModals();

        const parsed = splitCategoryHierarchy(destCat);
        activeParentCategory = parsed.parent;
        activeSubcategoryFilter = parsed.sub ? destCat : '__HOLDING__';

        const cards = parseCategoryIntoCards(notesContent[destCat] || '');
        selectedNoteCardKeys.clear();
        selectedNoteCardKeys.add(`${destCat}::${cards.length - 1}`);
        if (!activeSlots.includes('notes_browse')) {
            addModuleToTilingLayout('notes_browse');
        } else {
            renderNotesAtomBrowse();
        }
        setTimeout(() => triggerBatchAiExtraction(), 60);
    };

    ta.onkeydown = (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            saveQuickNote();
        }
    };

    modal.style.display = 'flex';
    setTimeout(() => ta.focus(), 25);
}

document.addEventListener('keydown', (e) => {
    if (e.altKey && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault();
        openQuickNoteModal();
        return;
    }

    const activeTag = document.activeElement ? document.activeElement.tagName : '';
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(activeTag) || (document.activeElement && document.activeElement.isContentEditable)) return;
    if (e.ctrlKey || e.altKey || e.metaKey) return;

    const termOverlay = document.getElementById('terminalOverlay');
    if (termOverlay && termOverlay.classList.contains('show')) return;

    const anyModalOpen = Array.from(document.querySelectorAll('.modal-overlay')).some(m => m.style.display === 'flex');
    if (anyModalOpen) return;

    if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        openQuickNoteModal();
    }
});

// ============================================================================
// DRAWER INLINE PER SUMMARY (1B) E ACTIONS
// ============================================================================

function closeBatchAiDrawer() {
    document.querySelectorAll('#notes-batch-ai-drawer').forEach(drawer => {
        drawer.style.display = 'none';
        drawer.innerHTML = '';
    });
}

function getCombinedTextFromSelectedNotes() {
    const byCat = parseSelectionKeysToGroupMap(selectedNoteCardKeys);
    const blocks = [];
    let firstCat = getTargetCategoryForWrite();

    for (const [cat, indices] of Object.entries(byCat)) {
        if (!firstCat) firstCat = cat;
        const allCards = parseCategoryIntoCards(notesContent[cat] || '');
        indices.sort((a, b) => a - b).forEach(idx => {
            if (allCards[idx] && allCards[idx].body) {
                blocks.push(allCards[idx].body.trim());
            }
        });
    }
    return { combinedText: blocks.join('\n\n'), firstCat };
}

async function triggerBatchSummaryGeneration() {
    if (selectedNoteCardKeys.size === 0 || typeof summarizeAndStructureNoteWithGemini !== 'function') return;

    const { combinedText, firstCat } = getCombinedTextFromSelectedNotes();
    if (!combinedText) return;

    const sumBtn = document.getElementById('btn-batch-summary');
    if (sumBtn) {
        sumBtn.disabled = true;
        sumBtn.textContent = '[◈ SUMMARIZING...]';
    }

    try {
        const structuredText = await summarizeAndStructureNoteWithGemini(combinedText);
        if (sumBtn) sumBtn.disabled = false;

        if (!structuredText) return;

        const drawer = document.querySelector('#module-notes-browse #notes-batch-ai-drawer') || document.getElementById('notes-batch-ai-drawer');
        if (!drawer) return;

        drawer.style.display = 'flex';
        drawer.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-size:var(--font-xs); color:var(--accent-gold); font-weight:bold; text-transform:uppercase;">
                    ✦ Structured Summary &amp; Prompt-Ready Rewrite
                </span>
                <button type="button" class="icon-btn" id="btn-close-sum-drawer">[×]</button>
            </div>
            <textarea id="sum-drawer-textarea" class="note-inline-editor" style="min-height: 140px;"></textarea>
            <div style="display:flex; justify-content:flex-end; gap:8px; flex-wrap:wrap;">
                <button type="button" class="btn btn-sm" id="btn-sum-copy">[COPY FOR PROMPT]</button>
                <button type="button" class="btn btn-sm" id="btn-sum-save-new">[SAVE AS NEW]</button>
                <button type="button" class="btn btn-primary btn-sm" id="btn-sum-replace">[REPLACE ORIGINAL]</button>
            </div>
        `;

        const ta = drawer.querySelector('#sum-drawer-textarea');
        ta.value = structuredText;

        drawer.querySelector('#btn-close-sum-drawer').onclick = closeBatchAiDrawer;

        drawer.querySelector('#btn-sum-copy').onclick = () => {
            navigator.clipboard.writeText(ta.value.trim());
            if (typeof showToast === 'function') showToast('[COPIED] Ready to paste into prompt!');
        };

        drawer.querySelector('#btn-sum-save-new').onclick = () => {
            const val = ta.value.trim();
            if (!val) return;
            const dest = firstCat || getTargetCategoryForWrite();
            if (!notesContent[dest]) notesContent[dest] = '';
            notesContent[dest] += (notesContent[dest] === '' ? '' : '\n\n') + val;
            saveData();
            closeBatchAiDrawer();
            clearNoteSelection();
            renderNoteCategories();
            if (typeof showToast === 'function') showToast(`[SAVED NEW] Added in "${dest}"`);
        };

        drawer.querySelector('#btn-sum-replace').onclick = () => {
            const val = ta.value.trim();
            if (!val) return;
            const dest = firstCat || getTargetCategoryForWrite();
            removeNoteCardsBySelectionKeys(selectedNoteCardKeys);
            if (!notesContent[dest]) notesContent[dest] = '';
            notesContent[dest] += (notesContent[dest] === '' ? '' : '\n\n') + val;
            saveData();
            closeBatchAiDrawer();
            renderNoteCategories();
            if (typeof showToast === 'function') showToast('[REPLACED] Updated with structured version');
        };
    } catch (err) {
        if (sumBtn) sumBtn.disabled = false;
        if (typeof showToast === 'function') showToast(`[SUMMARY ERROR] ${err.message}`);
    }
}

async function triggerBatchAiExtraction() {
    if (selectedNoteCardKeys.size === 0) return;

    const { combinedText } = getCombinedTextFromSelectedNotes();
    if (!combinedText) return;

    const batchBtn = document.getElementById('btn-batch-ai');
    if (batchBtn) {
        batchBtn.disabled = true;
        batchBtn.textContent = '[◈ ANALYZING...]';
    }

    try {
        const extractedCmds = await extractActionsFromNoteWithGemini(combinedText);
        if (batchBtn) batchBtn.disabled = false;

        if (extractedCmds === null) return;

        const batchDrawer = document.querySelector('#module-notes-browse #notes-batch-ai-drawer') || document.getElementById('notes-batch-ai-drawer');
        if (batchDrawer) {
            renderSharedAiStagingDrawer(batchDrawer, extractedCmds, new Set(selectedNoteCardKeys), combinedText);
        }
    } catch (err) {
        if (batchBtn) batchBtn.disabled = false;
        if (typeof showToast === 'function') showToast(`[AI ERROR] ${err.message}`);
    }
}

function renderSharedAiStagingDrawer(drawerEl, commandsArray, keysToRemoveOnSubmit, fallbackText = '') {
    drawerEl.style.display = 'flex';
    let localCmds = (commandsArray || []).map(c => c.trim()).filter(Boolean);

    const drawList = () => {
        drawerEl.innerHTML = '';

        const topRow = document.createElement('div');
        topRow.style.cssText = 'display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;';
        topRow.innerHTML = `
            <span style="font-size:var(--font-xs); color:var(--text-main); font-weight:bold; text-transform:uppercase;">
                Staging Actions (${localCmds.length})
            </span>
            <button type="button" class="btn btn-sm" id="add-staged-cmd-btn">[+ ADD ACTION]</button>
        `;
        drawerEl.appendChild(topRow);

        topRow.querySelector('#add-staged-cmd-btn').onclick = () => {
            const sample = (fallbackText || '').split('\n')[0].trim();
            localCmds.push('todo ' + sample);
            drawList();
        };

        if (localCmds.length === 0) {
            const emptyMsg = document.createElement('div');
            emptyMsg.className = 'empty-state';
            emptyMsg.style.padding = '4px 0';
            emptyMsg.textContent = '[ NO ACTIONS DETECTED ]';
            drawerEl.appendChild(emptyMsg);
        } else {
            localCmds.forEach((cmdStr, idx) => {
                const itemBox = document.createElement('div');
                itemBox.className = 'note-ai-cmd-row';

                const line = document.createElement('div');
                line.style.cssText = 'display:flex; align-items:center; gap:8px;';

                const badge = document.createElement('span');
                badge.style.cssText = 'font-size:var(--font-xs); color:var(--text-dim); font-weight:bold;';
                badge.textContent = `[${idx + 1}]`;

                const inp = document.createElement('input');
                inp.type = 'text';
                inp.className = 'staging-cmd-input';
                inp.value = cmdStr;

                const preview = document.createElement('div');
                preview.className = 'staging-cmd-preview';
                preview.textContent = typeof getCommandPreview === 'function' ? getCommandPreview(cmdStr) : cmdStr;

                inp.oninput = () => {
                    localCmds[idx] = inp.value.trim();
                    if (typeof getCommandPreview === 'function') {
                        preview.textContent = getCommandPreview(localCmds[idx]);
                    }
                };

                const delBtn = document.createElement('button');
                delBtn.type = 'button';
                delBtn.className = 'icon-btn delete';
                delBtn.textContent = '[X]';
                delBtn.onclick = () => {
                    localCmds.splice(idx, 1);
                    drawList();
                };

                line.appendChild(badge);
                line.appendChild(inp);
                line.appendChild(delBtn);
                itemBox.appendChild(line);
                itemBox.appendChild(preview);
                drawerEl.appendChild(itemBox);
            });
        }

        const footer = document.createElement('div');
        footer.style.cssText = 'display:flex; justify-content:flex-end; gap:8px; padding-top:6px; border-top:1px dotted #222;';

        const btnCancel = document.createElement('button');
        btnCancel.type = 'button';
        btnCancel.className = 'btn btn-sm';
        btnCancel.textContent = '[CANCEL]';
        btnCancel.onclick = closeBatchAiDrawer;

        const btnSubmit = document.createElement('button');
        btnSubmit.type = 'button';
        btnSubmit.className = 'btn btn-primary btn-sm';
        btnSubmit.disabled = localCmds.length === 0;
        btnSubmit.textContent = `[SUBMIT & DELETE NOTE]`;
        btnSubmit.onclick = () => {
            let count = 0;
            localCmds.forEach(cmd => {
                if (cmd && typeof executeTerminalCommand === 'function' && executeTerminalCommand(cmd)) {
                    count++;
                }
            });

            closeBatchAiDrawer();
            removeNoteCardsBySelectionKeys(keysToRemoveOnSubmit);

            if (typeof showToast === 'function') {
                showToast(`[EXECUTED] ${count} action(s) added & source note(s) deleted`);
            }
        };

        footer.appendChild(btnCancel);
        footer.appendChild(btnSubmit);
        drawerEl.appendChild(footer);
    };

    drawList();
}

function openManageNotesModal() {
    renderNotesManager();
    closeModals();
    document.getElementById('manageNotesModal').style.display = 'flex';
}

function renderNotesManager() {
    const container = document.getElementById('notes-manager-list');
    if (!container) return;
    syncNotesCategoriesState();
    container.innerHTML = '';

    const protectedCats = ['General', 'Registrazioni'];

    noteCategories.forEach(cat => {
        const row = document.createElement('div');
        row.className = 'manager-task';

        const count = parseCategoryIntoCards(notesContent[cat] || '').length;
        const span = document.createElement('span');
        span.textContent = `${cat} (${count})`;

        const actions = document.createElement('div');
        actions.className = 'action-btns';
        actions.style.display = 'flex';

        if (!protectedCats.includes(cat)) {
            const delBtn = document.createElement('button');
            delBtn.className = 'icon-btn delete';
            delBtn.textContent = '[X]';
            delBtn.onclick = () => removeNoteCategory(cat);
            actions.appendChild(delBtn);
        } else {
            const sysBadge = document.createElement('span');
            sysBadge.style.cssText = 'font-size:0.65rem; color:var(--text-dim);';
            sysBadge.textContent = '[SYS]';
            actions.appendChild(sysBadge);
        }

        row.appendChild(span);
        row.appendChild(actions);
        container.appendChild(row);
    });
}

function quickAddNoteCategory(event) {
    if (event.key === 'Enter') {
        const newCat = event.target.value.trim();
        if (newCat && newCat !== 'Extracted' && !noteCategories.includes(newCat)) {
            noteCategories.push(newCat);
            saveData();
            event.target.value = '';
            renderNotesManager();
            renderNoteCategories();
        }
    }
}

function removeNoteCategory(cat) {
    if (['General', 'Registrazioni'].includes(cat)) return;
    noteCategories = noteCategories.filter(c => c !== cat && !c.startsWith(cat + ' /'));
    delete notesContent[cat];
    selectedNoteCardKeys.clear();
    saveData();
    renderNotesManager();
    renderNoteCategories();
    if (typeof showToast === 'function') showToast(`[DELETED] "${cat}"`);
}

function openRegistrazioniInBrowseMode() {
    activeParentCategory = 'Registrazioni';
    activeSubcategoryFilter = '__HOLDING__';
    selectedNoteCardKeys.clear();

    if (typeof activeSlots !== 'undefined' && !activeSlots.includes('notes_browse')) {
        if (typeof summonModule === 'function') summonModule('notes_browse');
    } else {
        renderNoteCategories();
    }
}

window.addEventListener('DOMContentLoaded', () => {
    renderNoteCategories();
});