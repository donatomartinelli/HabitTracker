// --- js/modules/notes.js ---
// ATOMIC MODULE 3: CLEAN 2-COLUMN MASONRY NOTES, ON-DEMAND SELECTION, COLLAPSIBLE LONG CARDS, INLINE SPLIT & AUTO-ARCHIVE

let currentNoteMode = 'write';
let isNoteSelectMode = false;
let selectedNoteStorageIndices = new Set();
let expandedNoteCardsSet = new Set();

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
        noteCategories = ['General', 'Registrazioni', 'Extracted'];
    }
    if (!noteCategories.includes('General')) noteCategories.unshift('General');
    if (!noteCategories.includes('Registrazioni')) noteCategories.push('Registrazioni');
    if (!noteCategories.includes('Extracted')) {
        const regIdx = noteCategories.indexOf('Registrazioni');
        if (regIdx !== -1) noteCategories.splice(regIdx + 1, 0, 'Extracted');
        else noteCategories.push('Extracted');
    }

    const select = document.getElementById('note-category');
    if (!select) return 'General';

    const prevVal = select.value;
    select.innerHTML = '';
    noteCategories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        const count = parseCategoryIntoCards(notesContent[cat] || '').length;
        opt.textContent = count > 0 ? `${cat} (${count})` : cat;
        select.appendChild(opt);
    });

    if (prevVal && noteCategories.includes(prevVal)) {
        select.value = prevVal;
    } else {
        select.value = noteCategories[0] || 'General';
    }

    const activeCat = select.value || 'General';
    const catBadge = document.getElementById('notes-active-cat-badge');
    if (catBadge) {
        catBadge.textContent = `// ${activeCat.toUpperCase()}`;
    }

    populateBatchMoveSelect(activeCat);
    return activeCat;
}

function populateBatchMoveSelect(currentCat) {
    const moveSel = document.getElementById('batch-move-select');
    if (!moveSel) return;
    moveSel.innerHTML = `<option value="">[➔ MOVE TO...]</option>`;
    noteCategories.forEach(c => {
        if (c !== currentCat) {
            const opt = document.createElement('option');
            opt.value = c;
            opt.textContent = `Move to: ${c}`;
            moveSel.appendChild(opt);
        }
    });
    const newOpt = document.createElement('option');
    newOpt.value = '__NEW__';
    newOpt.textContent = '+ New Category...';
    moveSel.appendChild(newOpt);
}

function onNoteCategoryChange() {
    selectedNoteStorageIndices.clear();
    expandedNoteCardsSet.clear();
    isNoteSelectMode = false;
    closeBatchAiDrawer();
    refreshNotesView();
}

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
    isNoteSelectMode = false;
    selectedNoteStorageIndices.clear();
    closeBatchAiDrawer();
    refreshNotesView();
}

function toggleNoteSelectionMode(forceState = null) {
    isNoteSelectMode = forceState !== null ? Boolean(forceState) : !isNoteSelectMode;
    if (!isNoteSelectMode) {
        selectedNoteStorageIndices.clear();
        closeBatchAiDrawer();
    }
    const cat = document.getElementById('note-category')?.value || 'General';
    const q = (document.getElementById('note-search-input')?.value || '').trim();
    renderBrowseCards(cat, q);
    updateBatchSelectionBarUI();
}

function refreshNotesView() {
    const checkbox = document.getElementById('notes-mode-checkbox');
    currentNoteMode = (checkbox && checkbox.checked) ? 'browse' : 'write';

    const cat = ensureNoteCategoriesSynced();
    const textEl = document.getElementById('note-text');
    const browseCont = ensureBrowseContainerExists();
    const searchEl = document.getElementById('note-search-input');
    const selectBtn = document.getElementById('btn-notes-select-mode');
    if (!textEl) return;

    const activeFilter = searchEl ? searchEl.value.trim() : '';

    if (currentNoteMode === 'write') {
        if (browseCont) browseCont.style.display = 'none';
        if (selectBtn) selectBtn.style.display = 'none';
        isNoteSelectMode = false;
        selectedNoteStorageIndices.clear();
        updateBatchSelectionBarUI();
        closeBatchAiDrawer();
        textEl.style.display = 'block';
        textEl.readOnly = false;
        textEl.value = '';
        textEl.placeholder = `Write a new note in [${cat}] and press Enter (Shift+Enter for new line)... Use - for lists, [ ] for checkboxes, @YYYY-MM-DD or @domani for date links.`;
    } else {
        textEl.style.display = 'none';
        if (selectBtn) selectBtn.style.display = 'inline-block';
        if (browseCont) {
            browseCont.style.display = 'flex';
            renderBrowseCards(cat, activeFilter);
        }
        updateBatchSelectionBarUI();
    }
}

function filterNotesView(query) {
    const checkbox = document.getElementById('notes-mode-checkbox');
    const cat = ensureNoteCategoriesSynced();
    const cleanQ = (query || '').trim();

    if (cleanQ && checkbox && !checkbox.checked) {
        checkbox.checked = true;
        currentNoteMode = 'browse';
    }

    if (currentNoteMode === 'browse') {
        const textEl = document.getElementById('note-text');
        const browseCont = ensureBrowseContainerExists();
        const selectBtn = document.getElementById('btn-notes-select-mode');
        if (textEl) textEl.style.display = 'none';
        if (selectBtn) selectBtn.style.display = 'inline-block';
        if (browseCont) {
            browseCont.style.display = 'flex';
            renderBrowseCards(cat, cleanQ);
        }
        updateBatchSelectionBarUI();
    }
}

// ============================================================================
// SELEZIONE MULTIPLA ON-DEMAND, MERGE, INBOX & MOVE
// ============================================================================

function toggleNoteCardSelection(storageIdx, forceState = null) {
    const shouldSelect = forceState !== null ? Boolean(forceState) : !selectedNoteStorageIndices.has(storageIdx);
    if (shouldSelect) {
        selectedNoteStorageIndices.add(storageIdx);
        isNoteSelectMode = true;
    } else {
        selectedNoteStorageIndices.delete(storageIdx);
    }

    const cat = document.getElementById('note-category')?.value || 'General';
    const searchEl = document.getElementById('note-search-input');
    renderBrowseCards(cat, searchEl ? searchEl.value.trim() : '');
    updateBatchSelectionBarUI();
}

function selectAllVisibleNotes() {
    isNoteSelectMode = true;
    const cat = document.getElementById('note-category')?.value || 'General';
    const allCards = parseCategoryIntoCards(notesContent[cat] || '');
    const q = (document.getElementById('note-search-input')?.value || '').trim().toLowerCase();

    allCards.forEach((card, idx) => {
        if (!q || card.raw.toLowerCase().includes(q)) {
            selectedNoteStorageIndices.add(idx);
        }
    });
    renderBrowseCards(cat, q);
    updateBatchSelectionBarUI();
}

function clearNoteSelection() {
    selectedNoteStorageIndices.clear();
    isNoteSelectMode = false;
    closeBatchAiDrawer();
    const cat = document.getElementById('note-category')?.value || 'General';
    const q = (document.getElementById('note-search-input')?.value || '').trim();
    renderBrowseCards(cat, q);
    updateBatchSelectionBarUI();
}

function updateBatchSelectionBarUI() {
    const bar = document.getElementById('notes-batch-bar');
    const countEl = document.getElementById('notes-selected-count');
    const selectModeBtn = document.getElementById('btn-notes-select-mode');
    const btnMerge = document.getElementById('btn-batch-merge');
    const btnAi = document.getElementById('btn-batch-ai');
    const btnInbox = document.getElementById('btn-batch-inbox');
    const btnDel = document.getElementById('btn-batch-del');
    const moveSel = document.getElementById('batch-move-select');

    const count = selectedNoteStorageIndices.size;
    const showBar = currentNoteMode === 'browse' && (isNoteSelectMode || count > 0);

    if (selectModeBtn) {
        selectModeBtn.textContent = showBar ? '[DONE]' : '[SELECT]';
        selectModeBtn.classList.toggle('btn-primary', showBar);
    }

    if (!bar) return;
    if (!showBar) {
        bar.style.display = 'none';
        return;
    }

    bar.style.display = 'flex';
    if (countEl) countEl.textContent = count > 0 ? `${count} SELECTED` : 'CLICK CARDS TO SELECT';
    if (btnAi) {
        btnAi.disabled = count === 0;
        btnAi.textContent = count > 0 ? `[✦ GENERATE ACTIONS (${count})]` : `[✦ GENERATE ACTIONS]`;
    }
    if (btnInbox) btnInbox.disabled = count === 0;
    if (btnMerge) {
        btnMerge.disabled = count < 2;
        btnMerge.textContent = count >= 2 ? `[MERGE (${count})]` : `[MERGE]`;
    }
    if (moveSel) moveSel.disabled = count === 0;
    if (btnDel) btnDel.disabled = count === 0;
}

function mergeSelectedNoteCards() {
    if (selectedNoteStorageIndices.size < 2) {
        if (typeof showToast === 'function') showToast('[MERGE] Select at least 2 notes to merge');
        return;
    }

    const cat = document.getElementById('note-category')?.value || 'General';
    const allCards = parseCategoryIntoCards(notesContent[cat] || '');

    const sortedIndices = Array.from(selectedNoteStorageIndices)
        .filter(idx => idx >= 0 && idx < allCards.length)
        .sort((a, b) => a - b);

    if (sortedIndices.length < 2) return;

    const firstIdx = sortedIndices[0];
    const firstCard = allCards[firstIdx];

    const mergedBody = sortedIndices
        .map(idx => (allCards[idx].body || '').trim())
        .filter(Boolean)
        .join('\n\n');

    allCards[firstIdx] = {
        isHeadered: firstCard.isHeadered,
        headerLabel: firstCard.headerLabel,
        body: mergedBody,
        raw: firstCard.isHeadered && firstCard.headerLabel
            ? `=== [${firstCard.headerLabel}] ===\n${mergedBody}`
            : mergedBody
    };

    for (let i = sortedIndices.length - 1; i >= 1; i--) {
        allCards.splice(sortedIndices[i], 1);
    }

    notesContent[cat] = rebuildCategoryFromCards(allCards);
    selectedNoteStorageIndices.clear();
    isNoteSelectMode = false;
    saveData();

    ensureNoteCategoriesSynced();
    const q = (document.getElementById('note-search-input')?.value || '').trim();
    renderBrowseCards(cat, q);
    updateBatchSelectionBarUI();

    if (typeof showToast === 'function') {
        showToast(`[NOTES] Merged ${sortedIndices.length} cards into 1`);
    }
}

function moveNoteCardsToCategory(sourceCat, indicesArray, targetCatRaw) {
    if (!sourceCat || !Array.isArray(indicesArray) || indicesArray.length === 0) return false;

    let targetCat = (targetCatRaw || '').trim();
    if (targetCat === '__NEW__') {
        const entered = prompt('Enter name for the new Note Category:');
        if (!entered || !entered.trim()) return false;
        targetCat = entered.trim();
    }
    if (!targetCat || targetCat === sourceCat) return false;

    if (!noteCategories.includes(targetCat)) {
        noteCategories.push(targetCat);
    }

    const sourceCards = parseCategoryIntoCards(notesContent[sourceCat] || '');
    const targetCards = parseCategoryIntoCards(notesContent[targetCat] || '');

    const validAsc = Array.from(new Set(indicesArray))
        .filter(idx => idx >= 0 && idx < sourceCards.length)
        .sort((a, b) => a - b);

    if (validAsc.length === 0) return false;

    validAsc.forEach(idx => {
        targetCards.push(sourceCards[idx]);
    });

    for (let i = validAsc.length - 1; i >= 0; i--) {
        sourceCards.splice(validAsc[i], 1);
    }

    notesContent[sourceCat] = rebuildCategoryFromCards(sourceCards);
    notesContent[targetCat] = rebuildCategoryFromCards(targetCards);
    selectedNoteStorageIndices.clear();
    isNoteSelectMode = false;

    saveData();
    ensureNoteCategoriesSynced();

    const activeCat = document.getElementById('note-category')?.value || sourceCat;
    const q = (document.getElementById('note-search-input')?.value || '').trim();
    renderBrowseCards(activeCat, q);
    updateBatchSelectionBarUI();
    return targetCat;
}

function moveSelectedNoteCardsTo(targetCatRaw) {
    const cat = document.getElementById('note-category')?.value || 'General';
    const indices = Array.from(selectedNoteStorageIndices);
    const dest = moveNoteCardsToCategory(cat, indices, targetCatRaw);
    if (dest && typeof showToast === 'function') {
        showToast(`[NOTES] Moved ${indices.length} card(s) to "${dest}"`);
    }
}

function sendSelectedNoteCardsToInbox() {
    if (selectedNoteStorageIndices.size === 0) return;
    const cat = document.getElementById('note-category')?.value || 'General';
    const allCards = parseCategoryIntoCards(notesContent[cat] || '');
    const sortedIndices = Array.from(selectedNoteStorageIndices)
        .filter(idx => idx >= 0 && idx < allCards.length)
        .sort((a, b) => a - b);

    if (sortedIndices.length === 0) return;

    const dayIndex = parseLocalDate(selectedDateStr).getDay();
    const todoCatName = 'General To-Do';
    if (!categoryOrder.includes(todoCatName)) categoryOrder.push(todoCatName);

    sortedIndices.forEach(idx => {
        const cleanLine = (allCards[idx].body || '').replace(/\s+/g, ' ').trim();
        if (!cleanLine) return;

        if (cleanLine.toLowerCase().startsWith('comprare ')) {
            const itemTitle = cleanLine.substring(9).trim();
            mWishlist.push({ id: 'mw_' + Date.now() + '_' + idx, title: itemTitle, cost: '', order: mWishlist.length });
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
    });

    saveMoneyData();
    saveData();
    if (typeof renderMoneyDashboard === 'function') renderMoneyDashboard();
    if (typeof renderTasks === 'function') renderTasks();

    if (cat !== 'Extracted') {
        moveNoteCardsToCategory(cat, sortedIndices, 'Extracted');
    } else {
        clearNoteSelection();
    }

    if (typeof showToast === 'function') {
        showToast(`[TO-DO + ARCHIVED] Added ${sortedIndices.length} item(s) to To-Do & moved to "Extracted"`);
    }
}

function deleteSelectedNoteCards() {
    if (selectedNoteStorageIndices.size === 0) return;
    const cat = document.getElementById('note-category')?.value || 'General';
    const allCards = parseCategoryIntoCards(notesContent[cat] || '');

    const sortedDesc = Array.from(selectedNoteStorageIndices)
        .filter(idx => idx >= 0 && idx < allCards.length)
        .sort((a, b) => b - a);

    sortedDesc.forEach(idx => allCards.splice(idx, 1));
    notesContent[cat] = rebuildCategoryFromCards(allCards);
    selectedNoteStorageIndices.clear();
    isNoteSelectMode = false;

    saveData();
    ensureNoteCategoriesSynced();
    const q = (document.getElementById('note-search-input')?.value || '').trim();
    renderBrowseCards(cat, q);
    updateBatchSelectionBarUI();

    if (typeof showToast === 'function') {
        showToast(`[NOTES] Deleted ${sortedDesc.length} card(s)`);
    }
}

// ============================================================================
// RENDERIZZAZIONE BROWSE CARDS: MOSAICO A 2 COLONNE, PURO TESTO & HOVER [i] [✎]
// ============================================================================

function formatInlineNoteTokens(lineStr) {
    const escaped = escapeHtml(lineStr);
    return escaped.replace(/@(\d{4}-\d{2}-\d{2}|oggi|today|domani|tomorrow|tmw|ieri|yesterday)\b/gi, (fullMatch, token) => {
        return `<span class="note-date-tag" onclick="handleNoteDateTagClick(event, '${escapeHtml(token)}')" title="Jump to date @${escapeHtml(token)}">@${escapeHtml(token)}</span>`;
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
    if (typeof showToast === 'function') showToast(`[NOTES -> DATE] Jumped to ${resolvedDate}`);
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
    renderBrowseCards(cat, searchEl ? searchEl.value.trim() : '');
}

function isCardContentLong(bodyText) {
    const txt = (bodyText || '').trim();
    if (txt.length > 240) return true;
    return txt.split('\n').length > 5;
}

function renderBrowseCards(cat, filterQuery = '') {
    const browseCont = ensureBrowseContainerExists();
    if (!browseCont) return;
    browseCont.innerHTML = '';

    const allCards = parseCategoryIntoCards(notesContent[cat] || '');
    const q = (filterQuery || '').trim().toLowerCase();

    if (allCards.length === 0) {
        browseCont.innerHTML = `<div class="empty-state" style="text-align:center; padding-top:30px; width:100%;">[ EMPTY — SWITCH TO WRITE ]</div>`;
        return;
    }

    const indexedCards = allCards
        .map((card, storageIdx) => ({ card, storageIdx }))
        .reverse()
        .filter(item => {
            if (!q) return true;
            return item.card.raw.toLowerCase().includes(q);
        });

    if (indexedCards.length === 0) {
        browseCont.innerHTML = `<div class="empty-state" style="text-align:center; padding-top:30px; width:100%;">[ NO MATCHES FOR "${escapeHtml(filterQuery)}" ]</div>`;
        return;
    }

    // Costruisce 2 colonne indipendenti a mosaico (pari a sinistra, dispari a destra)
    const colLeft = document.createElement('div');
    colLeft.className = 'notes-masonry-col';
    const colRight = document.createElement('div');
    colRight.className = 'notes-masonry-col';

    indexedCards.forEach(({ card, storageIdx }, visualIdx) => {
        const isSelected = selectedNoteStorageIndices.has(storageIdx);
        const cardKey = `${cat}_${storageIdx}`;
        const isLong = isCardContentLong(card.body);
        const isExpanded = expandedNoteCardsSet.has(cardKey);

        const cardEl = document.createElement('div');
        cardEl.className = `note-card ${isSelected ? 'is-selected' : ''}`;

        // Metadato nascosto (data / nome file mp3 / indice) visibile solo cliccando [i]
        const metaInfoText = card.isHeadered && card.headerLabel
            ? `🎙 ${card.headerLabel}`
            : `NOTE #${storageIdx + 1} // ${cat}`;

        const infoPopover = document.createElement('div');
        infoPopover.className = 'note-info-popover';
        infoPopover.textContent = metaInfoText;
        cardEl.appendChild(infoPopover);

        // Micro-pillola in alto a destra visibile SOLO in hover: [i] e [✎]
        const hoverTools = document.createElement('div');
        hoverTools.className = 'note-card-hover-tools';

        const btnInfo = document.createElement('button');
        btnInfo.type = 'button';
        btnInfo.className = 'icon-btn';
        btnInfo.style.fontSize = '0.68rem';
        btnInfo.textContent = '[i]';
        btnInfo.title = metaInfoText;
        btnInfo.onclick = (e) => {
            e.stopPropagation();
            infoPopover.classList.toggle('show');
        };

        const btnEdit = document.createElement('button');
        btnEdit.type = 'button';
        btnEdit.className = 'icon-btn';
        btnEdit.style.fontSize = '0.68rem';
        btnEdit.textContent = '[✎]';
        btnEdit.title = 'Edit or Split at cursor (Ctrl+Shift+S)';

        hoverTools.appendChild(btnInfo);
        hoverTools.appendChild(btnEdit);
        cardEl.appendChild(hoverTools);

        // Corpo della nota
        const bodyEl = document.createElement('div');
        bodyEl.className = `note-card-body ${(isLong && !isExpanded) ? 'is-collapsed' : ''}`;
        renderFormattedCardBody(bodyEl, card, cat, storageIdx);

        btnEdit.onclick = (e) => {
            e.stopPropagation();
            expandedNoteCardsSet.add(cardKey);
            bodyEl.classList.remove('is-collapsed');
            startNoteCardInlineEdit(bodyEl, cat, storageIdx);
        };

        // Gestione click sulla card:
        // - Shift+Click o modalità [SELECT] attiva -> seleziona/deseleziona la card
        // - Click normale su nota lunga -> espande/compatta la nota
        cardEl.onclick = (e) => {
            if (e.target.closest('textarea') || e.target.closest('.note-inline-toolbar') || e.target.classList.contains('check-box') || e.target.classList.contains('note-date-tag')) {
                return;
            }
            if (e.shiftKey || isNoteSelectMode) {
                e.preventDefault();
                toggleNoteCardSelection(storageIdx);
                return;
            }
            if (isLong) {
                if (expandedNoteCardsSet.has(cardKey)) {
                    expandedNoteCardsSet.delete(cardKey);
                    bodyEl.classList.add('is-collapsed');
                    if (expandHint) expandHint.textContent = '[+ EXPAND]';
                } else {
                    expandedNoteCardsSet.add(cardKey);
                    bodyEl.classList.remove('is-collapsed');
                    if (expandHint) expandHint.textContent = '[- COLLAPSE]';
                }
            }
        };

        // Doppio click sul testo -> apre l'editor inline (con Split at cursor)
        bodyEl.ondblclick = (e) => {
            if (e.target.classList.contains('check-box') || e.target.classList.contains('note-date-tag')) return;
            e.stopPropagation();
            expandedNoteCardsSet.add(cardKey);
            bodyEl.classList.remove('is-collapsed');
            startNoteCardInlineEdit(bodyEl, cat, storageIdx);
        };

        cardEl.appendChild(bodyEl);

        let expandHint = null;
        if (isLong) {
            expandHint = document.createElement('div');
            expandHint.className = 'note-expand-hint';
            expandHint.textContent = isExpanded ? '[- COLLAPSE]' : '[+ EXPAND]';
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
// EDITOR INLINE CON [✂ SPLIT AT CURSOR // CTRL+SHIFT+S]
// ============================================================================

function startNoteCardInlineEdit(bodyEl, cat, storageIdx) {
    if (bodyEl.querySelector('textarea')) return;

    const allCards = parseCategoryIntoCards(notesContent[cat] || '');
    const targetCard = allCards[storageIdx];
    if (!targetCard) return;

    const originalBody = targetCard.body;
    bodyEl.innerHTML = '';

    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex; flex-direction:column; gap:6px;';

    const toolbar = document.createElement('div');
    toolbar.className = 'note-inline-toolbar';
    toolbar.innerHTML = `
        <span style="font-size:0.62rem; color:var(--text-dim);">CTRL+SHIFT+S TO SPLIT</span>
        <div style="display:flex; gap:6px;">
            <button type="button" class="btn btn-sm btn-split-cursor" style="border-color:var(--accent-gold); color:var(--accent-gold);">[✂ SPLIT]</button>
            <button type="button" class="btn btn-primary btn-sm btn-save-inline">[SAVE]</button>
            <button type="button" class="btn btn-sm btn-cancel-inline">[ESC]</button>
        </div>
    `;

    const ta = document.createElement('textarea');
    ta.className = 'note-inline-editor';
    ta.value = originalBody;

    let finished = false;

    const commitEdit = () => {
        if (finished) return;
        finished = true;
        const newVal = ta.value.trim();
        if (!newVal) {
            allCards.splice(storageIdx, 1);
        } else {
            allCards[storageIdx].body = newVal;
        }
        notesContent[cat] = rebuildCategoryFromCards(allCards);
        saveData();
        ensureNoteCategoriesSynced();

        const searchEl = document.getElementById('note-search-input');
        renderBrowseCards(cat, searchEl ? searchEl.value.trim() : '');
        if (typeof showToast === 'function') showToast('[NOTES] Card updated');
    };

    const splitAtCursor = () => {
        if (finished) return;
        const pos = ta.selectionStart;
        const fullText = ta.value;
        const firstHalf = fullText.slice(0, pos).trim();
        const secondHalf = fullText.slice(pos).trim();

        if (!firstHalf || !secondHalf) {
            if (typeof showToast === 'function') {
                showToast('[SPLIT] Place the cursor inside the text!');
            }
            ta.focus();
            return;
        }

        finished = true;
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

        allCards.splice(storageIdx, 1, cardPart1, cardPart2);
        notesContent[cat] = rebuildCategoryFromCards(allCards);
        selectedNoteStorageIndices.clear();
        saveData();
        ensureNoteCategoriesSynced();

        const searchEl = document.getElementById('note-search-input');
        renderBrowseCards(cat, searchEl ? searchEl.value.trim() : '');
        updateBatchSelectionBarUI();
        if (typeof showToast === 'function') {
            showToast('[SPLIT] Note split into 2 cards!');
        }
    };

    toolbar.querySelector('.btn-split-cursor').onmousedown = (e) => {
        e.preventDefault();
        splitAtCursor();
    };
    toolbar.querySelector('.btn-save-inline').onmousedown = (e) => {
        e.preventDefault();
        commitEdit();
    };
    toolbar.querySelector('.btn-cancel-inline').onmousedown = (e) => {
        e.preventDefault();
        finished = true;
        const searchEl = document.getElementById('note-search-input');
        renderBrowseCards(cat, searchEl ? searchEl.value.trim() : '');
    };

    ta.onblur = () => {
        setTimeout(() => {
            if (!finished) commitEdit();
        }, 120);
    };

    ta.onkeydown = (e) => {
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 's' || e.key === 'S')) {
            e.preventDefault();
            e.stopPropagation();
            splitAtCursor();
            return;
        }
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            commitEdit();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            finished = true;
            const searchEl = document.getElementById('note-search-input');
            renderBrowseCards(cat, searchEl ? searchEl.value.trim() : '');
        }
    };

    wrap.appendChild(toolbar);
    wrap.appendChild(ta);
    bodyEl.appendChild(wrap);
    ta.focus();
}

// ============================================================================
// ESTRAZIONE AZIONI CON GEMINI -> ARCHIVIAZIONE AUTOMATICA IN "EXTRACTED"
// ============================================================================

function closeBatchAiDrawer() {
    const drawer = document.getElementById('notes-batch-ai-drawer');
    if (drawer) {
        drawer.style.display = 'none';
        drawer.innerHTML = '';
    }
}

async function triggerBatchAiExtraction() {
    if (selectedNoteStorageIndices.size === 0) return;

    const cat = document.getElementById('note-category')?.value || 'General';
    const allCards = parseCategoryIntoCards(notesContent[cat] || '');
    const sortedIndices = Array.from(selectedNoteStorageIndices)
        .filter(idx => idx >= 0 && idx < allCards.length)
        .sort((a, b) => a - b);

    if (sortedIndices.length === 0) return;

    const combinedText = sortedIndices
        .map((idx, n) => `--- NOTE ${n + 1} ---\n${allCards[idx].body}`)
        .join('\n\n');

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
            renderSharedAiStagingDrawer(batchDrawer, extractedCmds, cat, sortedIndices, allCards[sortedIndices[0]].body);
        }
    } catch (err) {
        if (batchBtn) batchBtn.disabled = false;
        updateBatchSelectionBarUI();
        if (typeof showToast === 'function') showToast(`[BATCH AI ERROR] ${err.message}`);
    }
}

function renderSharedAiStagingDrawer(drawerEl, commandsArray, sourceCat, storageIndicesArray, fallbackFirstLineText = '') {
    drawerEl.style.display = 'flex';
    let localCmds = (commandsArray || []).map(c => c.trim()).filter(Boolean);

    const drawList = () => {
        drawerEl.innerHTML = '';

        const topRow = document.createElement('div');
        topRow.style.cssText = 'display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;';
        topRow.innerHTML = `
            <span style="font-size:var(--font-xs); color:var(--text-main); font-weight:bold; text-transform:uppercase;">
                Staging Actions (${localCmds.length} cmds from ${storageIndicesArray.length} note${storageIndicesArray.length > 1 ? 's' : ''})
                <span style="color:var(--accent-green); margin-left:6px;">[AUTO-MOVES TO "EXTRACTED"]</span>
            </span>
            <button type="button" class="btn btn-sm" id="add-staged-cmd-btn">[+ ADD ACTION]</button>
        `;
        drawerEl.appendChild(topRow);

        topRow.querySelector('#add-staged-cmd-btn').onclick = () => {
            const sample = (fallbackFirstLineText || '').split('\n')[0].trim();
            localCmds.push('todo ' + sample);
            drawList();
        };

        if (localCmds.length === 0) {
            const emptyMsg = document.createElement('div');
            emptyMsg.className = 'empty-state';
            emptyMsg.style.padding = '4px 0';
            emptyMsg.textContent = '[ NO SPECIFIC ACTIONS DETECTED — CLICK "+ ADD ACTION" OR CANCEL ]';
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
        btnCancel.onclick = () => {
            drawerEl.style.display = 'none';
            drawerEl.innerHTML = '';
        };

        const btnSubmit = document.createElement('button');
        btnSubmit.type = 'button';
        btnSubmit.className = 'btn btn-primary btn-sm';
        btnSubmit.disabled = localCmds.length === 0;
        btnSubmit.textContent = `[SUBMIT ALL & ARCHIVE]`;
        btnSubmit.onclick = () => {
            let count = 0;
            localCmds.forEach(cmd => {
                if (cmd && typeof executeTerminalCommand === 'function' && executeTerminalCommand(cmd)) {
                    count++;
                }
            });

            drawerEl.style.display = 'none';
            drawerEl.innerHTML = '';

            if (sourceCat !== 'Extracted') {
                moveNoteCardsToCategory(sourceCat, storageIndicesArray, 'Extracted');
            } else {
                clearNoteSelection();
            }

            if (typeof showToast === 'function') {
                showToast(`[EXTRACTED] Executed ${count} action(s) & archived to "Extracted"!`);
            }
        };

        footer.appendChild(btnCancel);
        footer.appendChild(btnSubmit);
        drawerEl.appendChild(footer);
    };

    drawList();
}

// ============================================================================
// SCRITTURA NOTE & GESTIONE CATEGORIE
// ============================================================================

function handleNoteKeyDown(event) {
    if (currentNoteMode === 'write' && event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        saveNote();
    }
}

function saveNote() {
    const cat = ensureNoteCategoriesSynced();
    const textEl = document.getElementById('note-text');
    if (!textEl) return;
    const text = textEl.value.trim();
    if (!text || !cat) return;

    if (!notesContent[cat]) notesContent[cat] = "";
    notesContent[cat] += (notesContent[cat] === "" ? "" : "\n\n") + text;
    saveData();
    ensureNoteCategoriesSynced();

    textEl.value = '';
    textEl.placeholder = `[OK] Saved in ${cat}!`;
    if (typeof showToast === 'function') showToast(`[NOTES] Saved in "${cat}"`);
    setTimeout(() => {
        if (currentNoteMode === 'write') {
            textEl.placeholder = `Write a new note in [${cat}] and press Enter...`;
        }
    }, 1400);
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

    const protectedCats = ['General', 'Registrazioni', 'Extracted'];

    noteCategories.forEach(cat => {
        const row = document.createElement('div');
        row.className = 'manager-task';

        const count = parseCategoryIntoCards(notesContent[cat] || '').length;
        const span = document.createElement('span');
        span.textContent = `${cat} (${count} notes)`;

        const actions = document.createElement('div');
        actions.className = 'action-btns';
        actions.style.display = 'flex';

        if (!protectedCats.includes(cat)) {
            const delBtn = document.createElement('button');
            delBtn.className = 'icon-btn delete';
            delBtn.textContent = '[X]';
            delBtn.title = 'Delete category and its notes permanently';
            delBtn.onclick = () => removeNoteCategory(cat);
            actions.appendChild(delBtn);
        } else {
            const sysBadge = document.createElement('span');
            sysBadge.style.cssText = 'font-size:0.65rem; color:var(--text-dim);';
            sysBadge.textContent = '[SYSTEM]';
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
        if (newCat && !noteCategories.includes(newCat)) {
            noteCategories.push(newCat);
            saveData();
            event.target.value = '';
            renderNotesManager();
            renderNoteCategories();
        }
    }
}

function removeNoteCategory(cat) {
    if (['General', 'Registrazioni', 'Extracted'].includes(cat)) return;
    noteCategories = noteCategories.filter(c => c !== cat);
    delete notesContent[cat];
    selectedNoteStorageIndices.clear();
    saveData();
    renderNotesManager();
    renderNoteCategories();
    if (typeof showToast === 'function') showToast(`[NOTES] Category "${cat}" permanently deleted`);
}

function openRegistrazioniInBrowseMode() {
    if (typeof summonModule === 'function' && (!activeSlots || !activeSlots.includes('notes'))) {
        summonModule('notes');
    }

    ensureNoteCategoriesSynced();
    const select = document.getElementById('note-category');
    if (select) select.value = 'Registrazioni';

    const checkbox = document.getElementById('notes-mode-checkbox');
    if (checkbox) checkbox.checked = true;
    currentNoteMode = 'browse';
    isNoteSelectMode = false;
    selectedNoteStorageIndices.clear();
    refreshNotesView();

    const browseCont = document.getElementById('notes-browse-container');
    if (browseCont) browseCont.scrollTop = 0;
}

window.addEventListener('DOMContentLoaded', () => {
    renderNoteCategories();
});