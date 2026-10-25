// --- js/modules/notes.js ---
// ATOMIC MODULE 3: STANDALONE NOTES, MULTI-SELECT, MERGE, SPLIT AT CURSOR, CATEGORY ROUTING & AUTO-ARCHIVE TO "EXTRACTED"

let currentNoteMode = 'write';
let selectedNoteStorageIndices = new Set();

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

// Garantisce che General, Registrazioni ed Extracted esistano sempre, senza resuscitare categorie eliminate
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

    populateBatchMoveSelect(select.value);
    return select.value || 'General';
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
    closeBatchAiDrawer();
    refreshNotesView();
}

// Parsing in card: mantiene i blocchi header === [data // file] === e separa per \n\n+
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
    selectedNoteStorageIndices.clear();
    closeBatchAiDrawer();
    refreshNotesView();
}

function refreshNotesView() {
    const checkbox = document.getElementById('notes-mode-checkbox');
    currentNoteMode = (checkbox && checkbox.checked) ? 'browse' : 'write';

    const cat = ensureNoteCategoriesSynced();
    const textEl = document.getElementById('note-text');
    const browseCont = ensureBrowseContainerExists();
    const searchEl = document.getElementById('note-search-input');
    if (!textEl) return;

    const activeFilter = searchEl ? searchEl.value.trim() : '';

    if (currentNoteMode === 'write') {
        if (browseCont) browseCont.style.display = 'none';
        updateBatchSelectionBarUI();
        closeBatchAiDrawer();
        textEl.style.display = 'block';
        textEl.readOnly = false;
        textEl.value = '';
        textEl.placeholder = `Write a new note in [${cat}] and press Enter (Shift+Enter for new line)... Use - for lists, [ ] for checkboxes, @YYYY-MM-DD or @domani for date links.`;
    } else {
        textEl.style.display = 'none';
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
        if (textEl) textEl.style.display = 'none';
        if (browseCont) {
            browseCont.style.display = 'flex';
            renderBrowseCards(cat, cleanQ);
        }
        updateBatchSelectionBarUI();
    }
}

// ============================================================================
// SELEZIONE MULTIPLA CELLE (1A), UNIONE PULITA (2A) & SPOSTAMENTO CATEGORIE (4A)
// ============================================================================

function toggleNoteCardSelection(storageIdx, forceState = null) {
    const shouldSelect = forceState !== null ? Boolean(forceState) : !selectedNoteStorageIndices.has(storageIdx);
    if (shouldSelect) selectedNoteStorageIndices.add(storageIdx);
    else selectedNoteStorageIndices.delete(storageIdx);

    const cat = document.getElementById('note-category')?.value || 'General';
    const searchEl = document.getElementById('note-search-input');
    renderBrowseCards(cat, searchEl ? searchEl.value.trim() : '');
    updateBatchSelectionBarUI();
}

function selectAllVisibleNotes() {
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
    const cat = document.getElementById('note-category')?.value || 'General';
    const q = (document.getElementById('note-search-input')?.value || '').trim();
    renderBrowseCards(cat, q);
    updateBatchSelectionBarUI();
}

function updateBatchSelectionBarUI() {
    const bar = document.getElementById('notes-batch-bar');
    const countEl = document.getElementById('notes-selected-count');
    const btnMerge = document.getElementById('btn-batch-merge');
    const btnAi = document.getElementById('btn-batch-ai');
    const topBtnAi = document.getElementById('btn-top-generate-actions');

    const count = selectedNoteStorageIndices.size;

    if (topBtnAi) {
        topBtnAi.textContent = count > 0 ? `[✦ GENERATE ACTIONS (${count})]` : `[✦ GENERATE ACTIONS]`;
        topBtnAi.classList.toggle('btn-primary', count > 0);
    }

    if (!bar) return;
    if (currentNoteMode !== 'browse' || count === 0) {
        bar.style.display = 'none';
        return;
    }

    bar.style.display = 'flex';
    if (countEl) countEl.textContent = `${count} SELECTED`;
    if (btnMerge) {
        btnMerge.disabled = count < 2;
        btnMerge.textContent = `[MERGE (${count})]`;
    }
    if (btnAi) {
        btnAi.textContent = `[✦ GENERATE ACTIONS (${count})]`;
    }
}

// 2A. Unione pulita di più celle selezionate in una sola cella
function mergeSelectedNoteCards() {
    if (selectedNoteStorageIndices.size < 2) {
        if (typeof showToast === 'function') showToast('[MERGE] Select at least 2 notes to merge');
        return;
    }

    const cat = document.getElementById('note-category')?.value || 'General';
    const allCards = parseCategoryIntoCards(notesContent[cat] || '');

    // Ordina gli indici in ordine cronologico crescente
    const sortedIndices = Array.from(selectedNoteStorageIndices)
        .filter(idx => idx >= 0 && idx < allCards.length)
        .sort((a, b) => a - b);

    if (sortedIndices.length < 2) return;

    const firstIdx = sortedIndices[0];
    const firstCard = allCards[firstIdx];

    // Unisce solo i corpi puliti separati da una riga vuota, rimuovendo eventuali header intermedi
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

    // Rimuove le altre card unite partendo dal fondo
    for (let i = sortedIndices.length - 1; i >= 1; i--) {
        allCards.splice(sortedIndices[i], 1);
    }

    notesContent[cat] = rebuildCategoryFromCards(allCards);
    selectedNoteStorageIndices.clear();
    saveData();

    ensureNoteCategoriesSynced();
    const q = (document.getElementById('note-search-input')?.value || '').trim();
    renderBrowseCards(cat, q);
    updateBatchSelectionBarUI();

    if (typeof showToast === 'function') {
        showToast(`[NOTES] Merged ${sortedIndices.length} cards into 1`);
    }
}

// 4A. Sposta una o più card dalla categoria corrente verso un'altra categoria (o ne crea una nuova al volo)
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

    // Aggiunge le card in coda alla categoria di destinazione
    validAsc.forEach(idx => {
        targetCards.push(sourceCards[idx]);
    });

    // Rimuove le card dalla categoria sorgente partendo dall'indice più alto
    for (let i = validAsc.length - 1; i >= 0; i--) {
        sourceCards.splice(validAsc[i], 1);
    }

    notesContent[sourceCat] = rebuildCategoryFromCards(sourceCards);
    notesContent[targetCat] = rebuildCategoryFromCards(targetCards);
    selectedNoteStorageIndices.clear();

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
// RENDERIZZAZIONE BROWSE CARDS
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

function renderBrowseCards(cat, filterQuery = '') {
    const browseCont = ensureBrowseContainerExists();
    if (!browseCont) return;
    browseCont.innerHTML = '';

    const allCards = parseCategoryIntoCards(notesContent[cat] || '');
    const q = (filterQuery || '').trim().toLowerCase();

    if (allCards.length === 0) {
        browseCont.innerHTML = `<div class="empty-state" style="text-align:center; padding-top:30px;">[ NO NOTES IN "${escapeHtml(cat.toUpperCase())}" — SWITCH TO WRITE OR SYNC SONY ]</div>`;
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
        browseCont.innerHTML = `<div class="empty-state" style="text-align:center; padding-top:30px;">[ NO MATCHES FOUND FOR "${escapeHtml(filterQuery)}" IN ${escapeHtml(cat.toUpperCase())} ]</div>`;
        return;
    }

    const frag = document.createDocumentFragment();

    indexedCards.forEach(({ card, storageIdx }) => {
        const isSelected = selectedNoteStorageIndices.has(storageIdx);
        const cardEl = document.createElement('div');
        cardEl.className = `note-card ${isSelected ? 'is-selected' : ''}`;

        // HEADER DELLA CARD CON CHECKBOX DI SELEZIONE SEMPRE VISIBILE (1A)
        const headerEl = document.createElement('div');
        headerEl.className = 'note-card-header';

        const metaEl = document.createElement('div');
        metaEl.className = 'note-card-meta';
        metaEl.style.cursor = 'pointer';
        metaEl.onclick = () => toggleNoteCardSelection(storageIdx);

        const selBox = document.createElement('div');
        selBox.className = `check-box ${isSelected ? 'checked' : ''}`;
        selBox.title = 'Select card for batch actions (Generate Actions, Merge, Move, Delete)';

        const titleSpan = document.createElement('span');
        titleSpan.innerHTML = card.isHeadered && card.headerLabel
            ? `🎙 ${escapeHtml(card.headerLabel)}`
            : `NOTE #${storageIdx + 1} // ${escapeHtml(cat)}`;

        metaEl.appendChild(selBox);
        metaEl.appendChild(titleSpan);

        const actionsEl = document.createElement('div');
        actionsEl.className = 'note-card-actions';

        // 4A. Menu rapido spostamento singola nota verso qualsiasi categoria o "+ New Category..."
        const moveSelect = document.createElement('select');
        moveSelect.className = 'note-move-select';
        moveSelect.title = 'Move this note to another category';
        moveSelect.innerHTML = `<option value="">[➔ MOVE ▼]</option>`;
        noteCategories.forEach(c => {
            if (c !== cat) {
                const opt = document.createElement('option');
                opt.value = c;
                opt.textContent = `➔ ${c}`;
                moveSelect.appendChild(opt);
            }
        });
        const newCatOpt = document.createElement('option');
        newCatOpt.value = '__NEW__';
        newCatOpt.textContent = '+ New Category...';
        moveSelect.appendChild(newCatOpt);
        moveSelect.onchange = () => {
            if (moveSelect.value) {
                const dest = moveNoteCardsToCategory(cat, [storageIdx], moveSelect.value);
                if (dest && typeof showToast === 'function') {
                    showToast(`[NOTES] Moved note to "${dest}"`);
                }
            }
        };

        // 4A. Bottone [-> INBOX] (invia a Inbox e sposta la nota in Extracted)
        const btnInbox = document.createElement('button');
        btnInbox.type = 'button';
        btnInbox.className = 'btn btn-sm';
        btnInbox.textContent = '[-> INBOX]';
        btnInbox.title = 'Send to General To-Do Inbox and archive note into Extracted';
        btnInbox.onclick = () => sendNoteCardToInbox(cat, storageIdx);

        // Bottone [✦ GENERATE ACTIONS] sulla singola card
        const btnAi = document.createElement('button');
        btnAi.type = 'button';
        btnAi.className = 'btn btn-sm';
        btnAi.textContent = '[✦ GENERATE ACTIONS]';
        btnAi.title = 'Extract actionable commands with Gemini (then archives note to Extracted)';

        // 3A. Bottone [✎ / ✂] Inline Edit & Split at Cursor
        const btnEdit = document.createElement('button');
        btnEdit.type = 'button';
        btnEdit.className = 'icon-btn';
        btnEdit.textContent = '[✎ / ✂]';
        btnEdit.title = 'Edit note or Split at cursor (Ctrl+Shift+S)';

        // Bottone [×] Delete
        const btnDel = document.createElement('button');
        btnDel.type = 'button';
        btnDel.className = 'icon-btn delete';
        btnDel.textContent = '[×]';
        btnDel.title = 'Delete this note card';
        btnDel.onclick = () => deleteNoteCard(cat, storageIdx);

        actionsEl.appendChild(moveSelect);
        actionsEl.appendChild(btnInbox);
        actionsEl.appendChild(btnAi);
        actionsEl.appendChild(btnEdit);
        actionsEl.appendChild(btnDel);

        headerEl.appendChild(metaEl);
        headerEl.appendChild(actionsEl);
        cardEl.appendChild(headerEl);

        // CORPO RENDERIZZATO DELLA CARD
        const bodyEl = document.createElement('div');
        bodyEl.className = 'note-card-body';
        bodyEl.title = 'Double-click to edit or split at cursor (Ctrl+Shift+S)';
        renderFormattedCardBody(bodyEl, card, cat, storageIdx);

        bodyEl.ondblclick = (e) => {
            if (e.target.classList.contains('check-box') || e.target.classList.contains('note-date-tag')) return;
            startNoteCardInlineEdit(bodyEl, cat, storageIdx);
        };
        btnEdit.onclick = () => startNoteCardInlineEdit(bodyEl, cat, storageIdx);

        cardEl.appendChild(bodyEl);

        // CASSETTO INLINE PER REVISIONE AZIONI ESTRATTE DALLA SINGOLA CARD
        const aiDrawer = document.createElement('div');
        aiDrawer.className = 'note-ai-drawer';
        aiDrawer.style.display = 'none';
        cardEl.appendChild(aiDrawer);

        btnAi.onclick = () => triggerNoteCardAiExtraction(card, cat, storageIdx, btnAi, aiDrawer);

        frag.appendChild(cardEl);
    });

    browseCont.appendChild(frag);
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
// 3A. EDITOR INLINE CON [✂ SPLIT AT CURSOR // CTRL+SHIFT+S]
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
        <span style="font-size:0.65rem; color:var(--text-dim);">PLACE CURSOR &amp; CLICK SPLIT (OR PRESS <strong>CTRL+SHIFT+S</strong>)</span>
        <div style="display:flex; gap:6px;">
            <button type="button" class="btn btn-sm btn-split-cursor" style="border-color:var(--accent-gold); color:var(--accent-gold);">[✂ SPLIT AT CURSOR]</button>
            <button type="button" class="btn btn-primary btn-sm btn-save-inline">[SAVE // CTRL+ENTER]</button>
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
                showToast('[SPLIT] Place the cursor inside the text (not at the very start or end)!');
            }
            ta.focus();
            return;
        }

        finished = true;
        // La prima metà mantiene l'eventuale header originale
        const cardPart1 = {
            isHeadered: targetCard.isHeadered,
            headerLabel: targetCard.headerLabel,
            body: firstHalf,
            raw: targetCard.isHeadered && targetCard.headerLabel
                ? `=== [${targetCard.headerLabel}] ===\n${firstHalf}`
                : firstHalf
        };

        // La seconda metà diventa una nuova card subito successiva
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
            showToast('[SPLIT] Note split into 2 cards at cursor position!');
        }
    };

    // Usa onmousedown con preventDefault sui bottoni della toolbar per non far scattare onblur prima del click
    const btnSplit = toolbar.querySelector('.btn-split-cursor');
    btnSplit.onmousedown = (e) => {
        e.preventDefault();
        splitAtCursor();
    };

    const btnSave = toolbar.querySelector('.btn-save-inline');
    btnSave.onmousedown = (e) => {
        e.preventDefault();
        commitEdit();
    };

    const btnCancel = toolbar.querySelector('.btn-cancel-inline');
    btnCancel.onmousedown = (e) => {
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

function deleteNoteCard(cat, storageIdx) {
    const allCards = parseCategoryIntoCards(notesContent[cat] || '');
    if (storageIdx < 0 || storageIdx >= allCards.length) return;

    allCards.splice(storageIdx, 1);
    notesContent[cat] = rebuildCategoryFromCards(allCards);
    selectedNoteStorageIndices.delete(storageIdx);
    saveData();
    ensureNoteCategoriesSynced();

    const searchEl = document.getElementById('note-search-input');
    renderBrowseCards(cat, searchEl ? searchEl.value.trim() : '');
    updateBatchSelectionBarUI();
    if (typeof showToast === 'function') showToast('[NOTES] Card deleted');
}

// ============================================================================
// 4A. ESTRAZIONE AZIONI (SINGOLA E MULTI-CELLA) -> SPOSTAMENTO IN "EXTRACTED"
// ============================================================================

function sendNoteCardToInbox(cat, storageIdx) {
    const allCards = parseCategoryIntoCards(notesContent[cat] || '');
    const card = allCards[storageIdx];
    if (!card || !card.body) return;

    const cleanLine = card.body.replace(/\s+/g, ' ').trim();
    if (!cleanLine) return;

    if (cleanLine.toLowerCase().startsWith('comprare ')) {
        const itemTitle = cleanLine.substring(9).trim();
        mWishlist.push({ id: 'mw_' + Date.now(), title: itemTitle, cost: '', order: mWishlist.length });
        saveMoneyData();
        if (typeof renderMoneyDashboard === 'function') renderMoneyDashboard();
    } else {
        generalTodos.push({ id: 'todo_' + Date.now(), title: cleanLine });
        saveData();
        if (typeof renderGeneralTodos === 'function') renderGeneralTodos();
    }

    // Sposta automaticamente la nota nella categoria archivio "Extracted"
    if (cat !== 'Extracted') {
        moveNoteCardsToCategory(cat, [storageIdx], 'Extracted');
        if (typeof showToast === 'function') showToast(`[INBOX + ARCHIVED] Sent to Inbox & moved to "Extracted"`);
    } else {
        if (typeof showToast === 'function') showToast(`[NOTES -> INBOX] Added "${cleanLine}"`);
    }
}

async function triggerNoteCardAiExtraction(card, cat, storageIdx, btnAi, aiDrawer) {
    if (typeof extractActionsFromNoteWithGemini !== 'function') return;

    const originalBtnText = btnAi.textContent;
    btnAi.disabled = true;
    btnAi.textContent = '[◈ ANALYZING...]';
    btnAi.style.color = 'var(--accent-gold)';
    btnAi.style.borderColor = 'var(--accent-gold)';

    try {
        const extractedCmds = await extractActionsFromNoteWithGemini(card.body);
        btnAi.disabled = false;
        btnAi.textContent = originalBtnText;
        btnAi.style.color = '';
        btnAi.style.borderColor = '';

        if (extractedCmds === null) return;
        renderSharedAiStagingDrawer(aiDrawer, extractedCmds, cat, [storageIdx], card.body);
    } catch (err) {
        btnAi.disabled = false;
        btnAi.textContent = originalBtnText;
        btnAi.style.color = '';
        btnAi.style.borderColor = '';
        if (typeof showToast === 'function') showToast(`[AI EXTRACTOR ERROR] ${err.message}`);
    }
}

function closeBatchAiDrawer() {
    const drawer = document.getElementById('notes-batch-ai-drawer');
    if (drawer) {
        drawer.style.display = 'none';
        drawer.innerHTML = '';
    }
}

// 1A. Estrazione multi-cella dal bottone in alto [✦ GENERATE ACTIONS]
async function triggerBatchAiExtraction() {
    const checkbox = document.getElementById('notes-mode-checkbox');
    if (checkbox && !checkbox.checked) {
        checkbox.checked = true;
        currentNoteMode = 'browse';
        refreshNotesView();
    }

    if (selectedNoteStorageIndices.size === 0) {
        if (typeof showToast === 'function') {
            showToast('[SELECT CELLS] Check the boxes on the notes you want to extract actions from!');
        }
        return;
    }

    const cat = document.getElementById('note-category')?.value || 'General';
    const allCards = parseCategoryIntoCards(notesContent[cat] || '');
    const sortedIndices = Array.from(selectedNoteStorageIndices)
        .filter(idx => idx >= 0 && idx < allCards.length)
        .sort((a, b) => a - b);

    if (sortedIndices.length === 0) return;

    const combinedText = sortedIndices
        .map((idx, n) => `--- NOTE ${n + 1} ---\n${allCards[idx].body}`)
        .join('\n\n');

    const topBtn = document.getElementById('btn-top-generate-actions');
    const batchBtn = document.getElementById('btn-batch-ai');
    if (topBtn) { topBtn.disabled = true; topBtn.textContent = '[◈ ANALYZING...]'; }
    if (batchBtn) { batchBtn.disabled = true; batchBtn.textContent = '[◈ ANALYZING...]'; }

    try {
        const extractedCmds = await extractActionsFromNoteWithGemini(combinedText);
        if (topBtn) topBtn.disabled = false;
        if (batchBtn) batchBtn.disabled = false;
        updateBatchSelectionBarUI();

        if (extractedCmds === null) return;

        const batchDrawer = document.getElementById('notes-batch-ai-drawer');
        if (batchDrawer) {
            renderSharedAiStagingDrawer(batchDrawer, extractedCmds, cat, sortedIndices, allCards[sortedIndices[0]].body);
        }
    } catch (err) {
        if (topBtn) topBtn.disabled = false;
        if (batchBtn) batchBtn.disabled = false;
        updateBatchSelectionBarUI();
        if (typeof showToast === 'function') showToast(`[BATCH AI ERROR] ${err.message}`);
    }
}

// Staging Area per revisionare i comandi estratti (1 o N celle) e spostare automaticamente le note in "Extracted"
function renderSharedAiStagingDrawer(drawerEl, commandsArray, sourceCat, storageIndicesArray, fallbackFirstLineText = '') {
    drawerEl.style.display = 'flex';
    let localCmds = (commandsArray || []).map(c => c.trim()).filter(Boolean);

    const drawList = () => {
        drawerEl.innerHTML = '';

        const topRow = document.createElement('div');
        topRow.style.cssText = 'display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;';
        topRow.innerHTML = `
            <span style="font-size:var(--font-xs); color:var(--text-main); font-weight:bold; text-transform:uppercase;">
                Staging Extracted Actions (${localCmds.length} cmds from ${storageIndicesArray.length} note${storageIndicesArray.length > 1 ? 's' : ''})
                <span style="color:var(--accent-green); margin-left:6px;">[AUTO-MOVES TO "EXTRACTED" ON SUBMIT]</span>
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
        btnSubmit.textContent = `[SUBMIT ALL & ARCHIVE TO "EXTRACTED"]`;
        btnSubmit.onclick = () => {
            let count = 0;
            localCmds.forEach(cmd => {
                if (cmd && typeof executeTerminalCommand === 'function' && executeTerminalCommand(cmd)) {
                    count++;
                }
            });

            drawerEl.style.display = 'none';
            drawerEl.innerHTML = '';

            // 4A. Sposta automaticamente tutte le note elaborate nella categoria "Extracted"
            if (sourceCat !== 'Extracted') {
                moveNoteCardsToCategory(sourceCat, storageIndicesArray, 'Extracted');
            } else {
                selectedNoteStorageIndices.clear();
                const q = (document.getElementById('note-search-input')?.value || '').trim();
                renderBrowseCards(sourceCat, q);
                updateBatchSelectionBarUI();
            }

            if (typeof showToast === 'function') {
                showToast(`[EXTRACTED] Executed ${count} action(s) & archived ${storageIndicesArray.length} note(s) to "Extracted"!`);
            }
        };

        footer.appendChild(btnCancel);
        footer.appendChild(btnSubmit);
        drawerEl.appendChild(footer);
    };

    drawList();
}

// ============================================================================
// SCRITTURA NOTE & GESTIONE CATEGORIE (CON ELIMINAZIONE DEFINITIVA)
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

// Fix definitivo: elimina sia la categoria da noteCategories sia la chiave da notesContent
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
    selectedNoteStorageIndices.clear();
    refreshNotesView();

    const browseCont = document.getElementById('notes-browse-container');
    if (browseCont) browseCont.scrollTop = 0;
}

window.addEventListener('DOMContentLoaded', () => {
    renderNoteCategories();
});