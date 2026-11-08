// --- js/modules/notes.js ---
// ATOMIC MODULE 3: HIERARCHICAL CATEGORIES & SUBCATEGORIES (2B), RIGHT-CLICK SELECTION (4A),
// LENGTH SORTING, CENTRAL DARK MODAL EDITOR & QUICK CAPTURE (3A1-B1), GENERATE SUMMARY (1B) & AUTO-DELETE ON ACTION

let currentNoteMode = 'write';
let selectedNoteCardKeys = new Set(); // Chiavi formato "catKey::storageIdx"
let expandedNoteCardsSet = new Set();
let notesSortMode = 'newest'; // 'newest' | 'longest' | 'shortest'

let activeParentCategory = 'General';
let activeSubcategoryFilter = '__HOLDING__'; // '__HOLDING__' | '__ALL__' | 'Parent / Sub'

// ============================================================================
// GERARCHIA CATEGORIE PADRE & SOTTOCATEGORIE (es. "Università" -> "Università / Matematica")
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

// Restituisce la categoria effettiva in cui salvare una nuova nota scritta in WRITE mode
function getTargetCategoryForWrite() {
    if (activeSubcategoryFilter && activeSubcategoryFilter !== '__HOLDING__' && activeSubcategoryFilter !== '__ALL__') {
        return activeSubcategoryFilter;
    }
    return activeParentCategory || 'General';
}

function ensureBrowseContainerExists() {
    let browseCont = document.getElementById('notes-browse-container');
    if (!browseCont) {
        const textEl = document.getElementById('note-text');
        if (textEl && textEl.parentElement) {
            browseCont = document.createElement('div');
            browseCont.id = 'notes-browse-container';
            browseCont.className = 'notes-browse-container';
            browseCont.style.display = 'none';
            textEl.parentElement.appendChild(browseCont);
        }
    }
    return browseCont;
}

function ensureNoteCategoriesSynced() {
    if (!Array.isArray(noteCategories) || noteCategories.length === 0) {
        noteCategories = ['General', 'Registrazioni'];
    }
    // Rimuove definitivamente la vecchia categoria Extracted
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

    const select = document.getElementById('note-category');
    if (select) {
        select.innerHTML = '';
        parents.forEach(pCat => {
            const opt = document.createElement('option');
            opt.value = pCat;
            const totalCount = countNotesInParentTree(pCat);
            opt.textContent = totalCount > 0 ? `${pCat} (${totalCount})` : pCat;
            if (pCat === activeParentCategory) opt.selected = true;
            select.appendChild(opt);
        });
    }

    const catBadge = document.getElementById('notes-active-cat-badge');
    if (catBadge) {
        const subSuffix = (activeSubcategoryFilter !== '__HOLDING__' && activeSubcategoryFilter !== '__ALL__')
            ? ` / ${splitCategoryHierarchy(activeSubcategoryFilter).sub}`
            : '';
        catBadge.textContent = `// ${(activeParentCategory + subSuffix).toUpperCase()}`;
    }

    renderSubcategoriesBar();
    populateBatchMoveSelect();
    return getTargetCategoryForWrite();
}

function countNotesInParentTree(parentCat) {
    let total = parseCategoryIntoCards(notesContent[parentCat] || '').length;
    getSubcategoriesForParent(parentCat).forEach(s => {
        total += parseCategoryIntoCards(notesContent[s.full] || '').length;
    });
    return total;
}

function renderSubcategoriesBar() {
    const bar = document.getElementById('notes-subcategories-bar');
    if (!bar) return;

    const subs = getSubcategoriesForParent(activeParentCategory);
    if (subs.length > 0 && activeSubcategoryFilter !== '__HOLDING__' && activeSubcategoryFilter !== '__ALL__') {
        if (!subs.some(s => s.full === activeSubcategoryFilter)) {
            activeSubcategoryFilter = '__HOLDING__';
        }
    } else if (subs.length === 0) {
        activeSubcategoryFilter = '__HOLDING__';
    }

    bar.innerHTML = '';

    const holdingCount = parseCategoryIntoCards(notesContent[activeParentCategory] || '').length;
    const allCount = countNotesInParentTree(activeParentCategory);

    // 1. Pillola HOLDING (Zona di attesa della categoria padre)
    const holdBtn = document.createElement('button');
    holdBtn.type = 'button';
    holdBtn.className = `note-subcat-pill ${activeSubcategoryFilter === '__HOLDING__' ? 'active' : ''}`;
    holdBtn.textContent = `${activeParentCategory} (${holdingCount})`;
    holdBtn.onclick = () => {
        activeSubcategoryFilter = '__HOLDING__';
        selectedNoteCardKeys.clear();
        refreshNotesView();
    };
    bar.appendChild(holdBtn);

    // 2. Se ci sono sottocategorie, mostra anche [ALL] e ogni sottocategoria
    if (subs.length > 0) {
        const allBtn = document.createElement('button');
        allBtn.type = 'button';
        allBtn.className = `note-subcat-pill ${activeSubcategoryFilter === '__ALL__' ? 'active' : ''}`;
        allBtn.textContent = `ALL (${allCount})`;
        allBtn.onclick = () => {
            activeSubcategoryFilter = '__ALL__';
            selectedNoteCardKeys.clear();
            refreshNotesView();
        };
        bar.appendChild(allBtn);

        subs.forEach(s => {
            const sCount = parseCategoryIntoCards(notesContent[s.full] || '').length;
            const pill = document.createElement('button');
            pill.type = 'button';
            pill.className = `note-subcat-pill ${activeSubcategoryFilter === s.full ? 'active' : ''}`;
            pill.textContent = `${s.sub} (${sCount})`;
            pill.onclick = () => {
                activeSubcategoryFilter = s.full;
                selectedNoteCardKeys.clear();
                refreshNotesView();
            };
            bar.appendChild(pill);
        });
    }

    // 3. Pulsante [+ SUB] per aggiungere al volo una sottocategoria sotto la categoria padre attiva
    const addSubBtn = document.createElement('button');
    addSubBtn.type = 'button';
    addSubBtn.className = 'note-subcat-pill';
    addSubBtn.style.borderStyle = 'dashed';
    addSubBtn.textContent = '+ SUB';
    addSubBtn.onclick = () => {
        openSubcategoryCreatorInline(bar, addSubBtn);
    };
    bar.appendChild(addSubBtn);
}

function openSubcategoryCreatorInline(barEl, triggerBtn) {
    if (barEl.querySelector('.subcat-inline-inp')) return;
    triggerBtn.style.display = 'none';

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
        refreshNotesView();
    };

    inp.onkeydown = (e) => {
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        else if (e.key === 'Escape') { e.preventDefault(); refreshNotesView(); }
    };
    inp.onblur = commit;

    barEl.appendChild(inp);
    inp.focus();
}

// Popola la tendina [➔ MOVE...] SENZA la scritta "Move to:" prima del nome
function populateBatchMoveSelect() {
    const moveSel = document.getElementById('batch-move-select');
    if (!moveSel) return;
    moveSel.innerHTML = `<option value="">[➔ MOVE...]</option>`;

    const allOrderedCats = [];
    getAllParentCategories().forEach(p => {
        allOrderedCats.push(p);
        getSubcategoriesForParent(p).forEach(s => allOrderedCats.push(s.full));
    });

    allOrderedCats.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c;
        opt.textContent = c;
        moveSel.appendChild(opt);
    });
}

function onNoteCategoryChange() {
    const select = document.getElementById('note-category');
    if (select && select.value) {
        activeParentCategory = select.value;
    }
    activeSubcategoryFilter = '__HOLDING__';
    selectedNoteCardKeys.clear();
    expandedNoteCardsSet.clear();
    closeBatchAiDrawer();
    refreshNotesView();
}

// ============================================================================
// PARSING DELLE CARD E ORDINAMENTO PER LUNGHEZZA
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

function cycleNotesSortMode() {
    if (notesSortMode === 'newest') notesSortMode = 'longest';
    else if (notesSortMode === 'longest') notesSortMode = 'shortest';
    else notesSortMode = 'newest';

    const sortBtn = document.getElementById('btn-notes-sort');
    if (sortBtn) {
        const labels = {
            'newest': '[SORT: NEW]',
            'longest': '[SORT: LONG ↓]',
            'shortest': '[SORT: SHORT ↑]'
        };
        sortBtn.textContent = labels[notesSortMode];
    }

    const q = (document.getElementById('note-search-input')?.value || '').trim();
    renderBrowseCards(q);
}

function toggleNotesMode() {
    const checkbox = document.getElementById('notes-mode-checkbox');
    const nextMode = (checkbox && checkbox.checked) ? 'browse' : 'write';

    if (currentNoteMode === 'write' && nextMode === 'browse') {
        const textEl = document.getElementById('note-text');
        if (textEl && textEl.value.trim() !== '') {
            saveNote();
        }
    }

    currentNoteMode = nextMode;
    selectedNoteCardKeys.clear();
    closeBatchAiDrawer();
    refreshNotesView();
}

function refreshNotesView() {
    const checkbox = document.getElementById('notes-mode-checkbox');
    currentNoteMode = (checkbox && checkbox.checked) ? 'browse' : 'write';

    const targetWriteCat = ensureNoteCategoriesSynced();
    const textEl = document.getElementById('note-text');
    const browseCont = ensureBrowseContainerExists();
    const searchEl = document.getElementById('note-search-input');
    const sortBtn = document.getElementById('btn-notes-sort');
    if (!textEl) return;

    const activeFilter = searchEl ? searchEl.value.trim() : '';

    if (currentNoteMode === 'write') {
        if (browseCont) browseCont.style.display = 'none';
        if (sortBtn) sortBtn.style.display = 'none';
        selectedNoteCardKeys.clear();
        updateBatchSelectionBarUI();
        closeBatchAiDrawer();
        textEl.style.display = 'block';
        textEl.readOnly = false;
        textEl.value = '';
        textEl.placeholder = `Write in [${targetWriteCat}] and press Enter...`;
    } else {
        textEl.style.display = 'none';
        if (sortBtn) sortBtn.style.display = 'inline-block';
        if (browseCont) {
            browseCont.style.display = 'flex';
            renderBrowseCards(activeFilter);
        }
        updateBatchSelectionBarUI();
    }
}

function filterNotesView(query) {
    const checkbox = document.getElementById('notes-mode-checkbox');
    ensureNoteCategoriesSynced();
    const cleanQ = (query || '').trim();

    if (cleanQ && checkbox && !checkbox.checked) {
        checkbox.checked = true;
        currentNoteMode = 'browse';
    }

    if (currentNoteMode === 'browse') {
        const textEl = document.getElementById('note-text');
        const browseCont = ensureBrowseContainerExists();
        const sortBtn = document.getElementById('btn-notes-sort');
        if (textEl) textEl.style.display = 'none';
        if (sortBtn) sortBtn.style.display = 'inline-block';
        if (browseCont) {
            browseCont.style.display = 'flex';
            renderBrowseCards(cleanQ);
        }
        updateBatchSelectionBarUI();
    }
}

// ============================================================================
// SELEZIONE COL TASTO DESTRO (4A), UNIONE, SPOSTAMENTO & AUTO-DELETE DOPO AZIONE
// ============================================================================

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

function toggleNoteCardSelectionByKey(selectionKey) {
    if (selectedNoteCardKeys.has(selectionKey)) {
        selectedNoteCardKeys.delete(selectionKey);
    } else {
        selectedNoteCardKeys.add(selectionKey);
    }
    const q = (document.getElementById('note-search-input')?.value || '').trim();
    renderBrowseCards(q);
    updateBatchSelectionBarUI();
}

function selectAllVisibleNotes() {
    const q = (document.getElementById('note-search-input')?.value || '').trim();
    const visible = collectVisibleCardsList(q);
    visible.forEach(item => selectedNoteCardKeys.add(item.selectionKey));
    renderBrowseCards(q);
    updateBatchSelectionBarUI();
}

function clearNoteSelection() {
    selectedNoteCardKeys.clear();
    closeBatchAiDrawer();
    const q = (document.getElementById('note-search-input')?.value || '').trim();
    renderBrowseCards(q);
    updateBatchSelectionBarUI();
}

function updateBatchSelectionBarUI() {
    const bar = document.getElementById('notes-batch-bar');
    const countEl = document.getElementById('notes-selected-count');
    const btnMerge = document.getElementById('btn-batch-merge');
    const btnAi = document.getElementById('btn-batch-ai');
    const btnSum = document.getElementById('btn-batch-summary');

    const count = selectedNoteCardKeys.size;
    if (!bar) return;

    if (currentNoteMode !== 'browse' || count === 0) {
        bar.style.display = 'none';
        return;
    }

    bar.style.display = 'flex';
    if (countEl) countEl.textContent = `${count} SELECTED`;
    if (btnSum) btnSum.textContent = `[✦ GENERATE SUMMARY (${count})]`;
    if (btnAi) btnAi.textContent = `[✦ GENERATE ACTIONS (${count})]`;
    if (btnMerge) {
        btnMerge.disabled = count < 2;
        btnMerge.textContent = count >= 2 ? `[MERGE (${count})]` : `[MERGE]`;
    }
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

// Elimina definitivamente un insieme di note (usato da Delete, da -> Inbox e da Generate Actions Submit)
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
    ensureNoteCategoriesSynced();
    const q = (document.getElementById('note-search-input')?.value || '').trim();
    renderBrowseCards(q);
    updateBatchSelectionBarUI();
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

    // Rimuove tutte le card selezionate e inserisce la card unita nella categoria della prima nota
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
    ensureNoteCategoriesSynced();
    const q = (document.getElementById('note-search-input')?.value || '').trim();
    renderBrowseCards(q);
    updateBatchSelectionBarUI();
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
    ensureNoteCategoriesSynced();
    const q = (document.getElementById('note-search-input')?.value || '').trim();
    renderBrowseCards(q);
    updateBatchSelectionBarUI();
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

    // Elimina direttamente le note una volta messe a sistema
    removeNoteCardsBySelectionKeys(selectedNoteCardKeys);

    if (typeof showToast === 'function') {
        showToast(`[INBOX] Added ${count} item(s) & removed processed note(s)`);
    }
}

function deleteSelectedNoteCards() {
    if (selectedNoteCardKeys.size === 0) return;
    const count = selectedNoteCardKeys.size;
    removeNoteCardsBySelectionKeys(selectedNoteCardKeys);
    if (typeof showToast === 'function') showToast(`[DELETED] ${count} note(s)`);
}

// ============================================================================
// RENDERIZZAZIONE BROWSE CARDS: TASTO DESTRO = SELEZIONA, CLICK SINISTRO = ESPANDI
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
        const hasDateModule = activeSlots.some(m => ['calendar', 'tasks', 'planner'].includes(m));
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

    const searchEl = document.getElementById('note-search-input');
    renderBrowseCards(searchEl ? searchEl.value.trim() : '');
}

function isCardContentLong(bodyText) {
    const txt = (bodyText || '').trim();
    if (txt.length > 240) return true;
    return txt.split('\n').length > 5;
}

function renderBrowseCards(filterQuery = '') {
    const browseCont = ensureBrowseContainerExists();
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

        // TASTO DESTRO SULLA NOTA -> Seleziona / Deseleziona all'istante (4A)
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

        // CLICK SINISTRO -> Espande/Compatta sempre (indipendentemente dal fatto che ci siano note selezionate!)
        cardEl.onclick = (e) => {
            if (e.target.classList.contains('check-box') || e.target.classList.contains('note-date-tag')) return;
            if (isLong) toggleExpandCollapse(e);
        };

        // DOPPIO CLICK -> Apre il Modale Centrale Scuro di modifica (3B1)
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

// ============================================================================
// MODALE CENTRALE SCURO DI MODIFICA & QUICK CAPTURE (SCORCIATOIA: N / ALT+N)
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
                <div style="display: flex; gap: 6px;">
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

// Apre il Modale Centrale per modificare una nota esistente (3B1)
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
        ensureNoteCategoriesSynced();
        refreshNotesView();
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
        ensureNoteCategoriesSynced();
        refreshNotesView();
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
        ensureNoteCategoriesSynced();
        refreshNotesView();
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
        const selKey = `${sourceCat}::${storageIdx}`;
        selectedNoteCardKeys.clear();
        selectedNoteCardKeys.add(selKey);
        saveChanges();
        const cb = document.getElementById('notes-mode-checkbox');
        if (cb && !cb.checked) { cb.checked = true; currentNoteMode = 'browse'; }
        refreshNotesView();
        triggerBatchAiExtraction();
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

// Apre il Modale Centrale in modalità "Quick Note" da qualsiasi schermata (Scorciatoia: N / Alt+N)
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
        ensureNoteCategoriesSynced();
        refreshNotesView();
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

        if (typeof summonModule === 'function' && (!activeSlots || !activeSlots.includes('notes'))) {
            summonModule('notes');
        }
        const parsed = splitCategoryHierarchy(destCat);
        activeParentCategory = parsed.parent;
        activeSubcategoryFilter = parsed.sub ? destCat : '__HOLDING__';
        const cb = document.getElementById('notes-mode-checkbox');
        if (cb) cb.checked = true;
        currentNoteMode = 'browse';

        const cards = parseCategoryIntoCards(notesContent[destCat] || '');
        selectedNoteCardKeys.clear();
        selectedNoteCardKeys.add(`${destCat}::${cards.length - 1}`);
        refreshNotesView();
        triggerBatchAiExtraction();
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

// Scorciatoia globale 'N' (a input libero) e 'Alt+N' (ovunque) per Quick Note
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
// [✦ GENERATE SUMMARY] (1B) & [✦ GENERATE ACTIONS] (CON AUTO-DELETE DELLA NOTA)
// ============================================================================

function closeBatchAiDrawer() {
    const drawer = document.getElementById('notes-batch-ai-drawer');
    if (drawer) {
        drawer.style.display = 'none';
        drawer.innerHTML = '';
    }
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

// 1B. Genera un Summary strutturato / Riscrittura pronta per Prompt nel cassetto inline
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
        updateBatchSelectionBarUI();

        if (!structuredText) return;

        const drawer = document.getElementById('notes-batch-ai-drawer');
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
            ensureNoteCategoriesSynced();
            refreshNotesView();
            if (typeof showToast === 'function') showToast('[REPLACED] Original note(s) replaced with structured version');
        };
    } catch (err) {
        if (sumBtn) sumBtn.disabled = false;
        updateBatchSelectionBarUI();
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
        updateBatchSelectionBarUI();

        if (extractedCmds === null) return;

        const batchDrawer = document.getElementById('notes-batch-ai-drawer');
        if (batchDrawer) {
            renderSharedAiStagingDrawer(batchDrawer, extractedCmds, new Set(selectedNoteCardKeys), combinedText);
        }
    } catch (err) {
        if (batchBtn) batchBtn.disabled = false;
        updateBatchSelectionBarUI();
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
            // Elimina direttamente le note processate una volta messe a sistema!
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

// ============================================================================
// SCRITTURA NOTE & GESTIONE CATEGORIE / SOTTOCATEGORIE
// ============================================================================

function handleNoteKeyDown(event) {
    if (currentNoteMode === 'write' && event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        saveNote();
    }
}

function saveNote() {
    const cat = getTargetCategoryForWrite();
    const textEl = document.getElementById('note-text');
    if (!textEl) return;
    const text = textEl.value.trim();
    if (!text || !cat) return;

    if (!noteCategories.includes(cat)) noteCategories.push(cat);
    if (!notesContent[cat]) notesContent[cat] = "";
    notesContent[cat] += (notesContent[cat] === "" ? "" : "\n\n") + text;
    saveData();
    ensureNoteCategoriesSynced();

    textEl.value = '';
    if (typeof showToast === 'function') showToast(`[SAVED] ${cat}`);
}

function handleNoteInput() {}

function renderNoteCategories() {
    ensureNoteCategoriesSynced();
    refreshNotesView();
}

function openManageNotesModal() {
    renderNotesManager();
    closeModals();
    document.getElementById('manageNotesModal').style.display = 'flex';
}

function renderNotesManager() {
    const container = document.getElementById('notes-manager-list');
    if (!container) return;
    ensureNoteCategoriesSynced();
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
    if (typeof summonModule === 'function' && (!activeSlots || !activeSlots.includes('notes'))) {
        summonModule('notes');
    }

    activeParentCategory = 'Registrazioni';
    activeSubcategoryFilter = '__HOLDING__';
    ensureNoteCategoriesSynced();

    const checkbox = document.getElementById('notes-mode-checkbox');
    if (checkbox) checkbox.checked = true;
    currentNoteMode = 'browse';
    selectedNoteCardKeys.clear();
    refreshNotesView();

    const browseCont = document.getElementById('notes-browse-container');
    if (browseCont) browseCont.scrollTop = 0;
}

window.addEventListener('DOMContentLoaded', () => {
    renderNoteCategories();
});