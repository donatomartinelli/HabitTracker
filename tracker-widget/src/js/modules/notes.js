// --- ATOMIC MODULE 3: STANDALONE NOTES, BROWSE CARDS, @DATE TAGS & AI EXTRACTOR ---

let currentNoteMode = 'write';
let extractedNoteHashes = new Set(JSON.parse(localStorage.getItem('tracker_extracted_notes') || '[]'));

function saveExtractedNoteHashes() {
    localStorage.setItem('tracker_extracted_notes', JSON.stringify(Array.from(extractedNoteHashes)));
}

function computeNoteHash(rawStr) {
    const clean = (rawStr || '').trim();
    let h = 0;
    for (let i = 0; i < clean.length; i++) {
        h = ((h << 5) - h) + clean.charCodeAt(i);
        h |= 0;
    }
    return 'nh_' + Math.abs(h) + '_' + clean.length;
}

function isNoteCardExtracted(rawStr) {
    return extractedNoteHashes.has(computeNoteHash(rawStr));
}

function markNoteCardExtracted(rawStr) {
    if (!rawStr || !rawStr.trim()) return;
    extractedNoteHashes.add(computeNoteHash(rawStr));
    saveExtractedNoteHashes();
}

// 1A. Split intelligente: mantiene uniti i blocchi Sony === [data // file] === e divide il resto per \n\n
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
            // Se fa parte di una trascrizione multi-paragrafo sotto un header === [...] ===, resta nella stessa card
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
    return cardsArray
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
    currentNoteMode = (checkbox && checkbox.checked) ? 'browse' : 'write';
    refreshNotesView();
}

function refreshNotesView() {
    const checkbox = document.getElementById('notes-mode-checkbox');
    currentNoteMode = (checkbox && checkbox.checked) ? 'browse' : 'write';

    const catEl = document.getElementById('note-category');
    const textEl = document.getElementById('note-text');
    const browseCont = document.getElementById('notes-browse-container');
    const searchEl = document.getElementById('note-search-input');
    if (!catEl || !textEl) return;

    const cat = catEl.value;
    const activeFilter = searchEl ? searchEl.value.trim() : '';

    if (currentNoteMode === 'write') {
        if (browseCont) browseCont.style.display = 'none';
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
    }
}

function filterNotesView(query) {
    const checkbox = document.getElementById('notes-mode-checkbox');
    const catEl = document.getElementById('note-category');
    if (!catEl) return;

    const cleanQ = (query || '').trim();

    if (cleanQ && checkbox && !checkbox.checked) {
        checkbox.checked = true;
        currentNoteMode = 'browse';
    }

    if (currentNoteMode === 'browse') {
        const textEl = document.getElementById('note-text');
        const browseCont = document.getElementById('notes-browse-container');
        if (textEl) textEl.style.display = 'none';
        if (browseCont) {
            browseCont.style.display = 'flex';
            renderBrowseCards(catEl.value, cleanQ);
        }
    }
}

// 3A. Formattazione testo inline con @YYYY-MM-DD, @oggi, @domani, @ieri cliccabili
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

    if (typeof jumpToDate === 'function') {
        jumpToDate(resolvedDate);
    }

    // Se nessuno tra Calendar, Tasks o Planner è visibile nel workspace, monta Tasks
    if (typeof activeSlots !== 'undefined' && Array.isArray(activeSlots)) {
        const hasDateModule = activeSlots.some(m => ['calendar', 'tasks', 'planner'].includes(m));
        if (!hasDateModule && typeof summonModule === 'function') {
            summonModule('tasks');
        }
    }

    if (typeof showToast === 'function') {
        showToast(`[NOTES -> DATE] Jumped to ${resolvedDate}`);
    }
}

// Toggle di una checkbox [ ] / [x] direttamente dentro una scheda in BROWSE
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

// 1A + 2A + 3A + 4A + 5A: Renderizzazione schede in ordine cronologico inverso
function renderBrowseCards(cat, filterQuery = '') {
    const browseCont = document.getElementById('notes-browse-container');
    if (!browseCont) return;
    browseCont.innerHTML = '';

    const allCards = parseCategoryIntoCards(notesContent[cat] || '');
    const q = (filterQuery || '').trim().toLowerCase();

    if (allCards.length === 0) {
        browseCont.innerHTML = `<div class="empty-state" style="text-align:center; padding-top:30px;">[ NO NOTES IN "${escapeHtml(cat.toUpperCase())}" — SWITCH TO WRITE TO ADD ONE ]</div>`;
        return;
    }

    // Mantiene l'indice reale di storage ma ordina dal più recente al più vecchio (1A)
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

    indexedCards.forEach(({ card, storageIdx }, displayIdx) => {
        const extracted = isNoteCardExtracted(card.raw);
        const cardEl = document.createElement('div');
        cardEl.className = `note-card ${extracted ? 'is-extracted' : ''}`;

        // HEADER DELLA CARD
        const headerEl = document.createElement('div');
        headerEl.className = 'note-card-header';

        const metaEl = document.createElement('div');
        metaEl.className = 'note-card-meta';
        const titleLabel = card.isHeadered && card.headerLabel
            ? `🎙 ${escapeHtml(card.headerLabel)}`
            : `NOTE #${storageIdx + 1} // ${escapeHtml(cat)}`;
        metaEl.innerHTML = `<span>${titleLabel}</span>`;

        if (extracted) {
            const badge = document.createElement('span');
            badge.className = 'note-extracted-badge';
            badge.textContent = '[✓ EXTRACTED]';
            metaEl.appendChild(badge);
        }

        const actionsEl = document.createElement('div');
        actionsEl.className = 'note-card-actions';

        // 4A. Bottone [-> INBOX]
        const btnInbox = document.createElement('button');
        btnInbox.type = 'button';
        btnInbox.className = 'btn btn-sm';
        btnInbox.textContent = '[-> INBOX]';
        btnInbox.title = 'Send this note directly to General To-Do Inbox (or Wishlist if "comprare ...")';
        btnInbox.onclick = () => sendNoteCardToInbox(cat, storageIdx);

        // 4A. Bottone [✦ GENERATE ACTIONS]
        const btnAi = document.createElement('button');
        btnAi.type = 'button';
        btnAi.className = 'btn btn-sm';
        btnAi.textContent = '[✦ GENERATE ACTIONS]';
        btnAi.title = 'Ask Gemini to extract actionable tasks, wishlist items or events from this note';

        // 2A. Bottone [✎] Inline Edit
        const btnEdit = document.createElement('button');
        btnEdit.type = 'button';
        btnEdit.className = 'icon-btn';
        btnEdit.textContent = '[✎]';
        btnEdit.title = 'Edit this note (or double-click note text)';

        // 2A. Bottone [×] Delete
        const btnDel = document.createElement('button');
        btnDel.type = 'button';
        btnDel.className = 'icon-btn delete';
        btnDel.textContent = '[×]';
        btnDel.title = 'Delete this note card';
        btnDel.onclick = () => deleteNoteCard(cat, storageIdx);

        actionsEl.appendChild(btnInbox);
        actionsEl.appendChild(btnAi);
        actionsEl.appendChild(btnEdit);
        actionsEl.appendChild(btnDel);

        headerEl.appendChild(metaEl);
        headerEl.appendChild(actionsEl);
        cardEl.appendChild(headerEl);

        // CORPO RENDERIZZATO DELLA CARD (Liste, Checkbox, @Date Tags)
        const bodyEl = document.createElement('div');
        bodyEl.className = 'note-card-body';
        bodyEl.title = 'Double-click to edit note';
        renderFormattedCardBody(bodyEl, card, cat, storageIdx);

        bodyEl.ondblclick = (e) => {
            if (e.target.classList.contains('check-box') || e.target.classList.contains('note-date-tag')) return;
            startNoteCardInlineEdit(bodyEl, cat, storageIdx);
        };
        btnEdit.onclick = () => startNoteCardInlineEdit(bodyEl, cat, storageIdx);

        cardEl.appendChild(bodyEl);

        // CASSETTO INLINE PER REVISIONE AZIONI ESTRATTE DA GEMINI (4A)
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
        // 1. Checkbox interattiva: [ ] o [x] (anche preceduta da - o *)
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

        // 2. Punto elenco: - testo oppure * testo
        const listMatch = line.match(/^\s*[-*]\s+(.*)$/);
        if (listMatch) {
            const row = document.createElement('div');
            row.className = 'note-md-list-item';
            row.innerHTML = `<span class="note-md-bullet">•</span><span>${formatInlineNoteTokens(listMatch[1])}</span>`;
            bodyContainer.appendChild(row);
            return;
        }

        // 3. Riga di testo normale
        const lineDiv = document.createElement('div');
        if (line.trim() === '') {
            lineDiv.style.height = '8px';
        } else {
            lineDiv.innerHTML = formatInlineNoteTokens(line);
        }
        bodyContainer.appendChild(lineDiv);
    });
}

// 2A. Editor inline sulla singola scheda (Ctrl+Enter o blur per salvare, Esc per annullare)
function startNoteCardInlineEdit(bodyEl, cat, storageIdx) {
    if (bodyEl.querySelector('textarea')) return;

    const allCards = parseCategoryIntoCards(notesContent[cat] || '');
    const targetCard = allCards[storageIdx];
    if (!targetCard) return;

    const originalBody = targetCard.body;
    bodyEl.innerHTML = '';

    const ta = document.createElement('textarea');
    ta.className = 'note-inline-editor';
    ta.value = originalBody;

    let cancelled = false;

    const commitEdit = () => {
        if (cancelled) return;
        const newVal = ta.value.trim();
        if (!newVal) {
            // Se svuotata completamente, elimina la scheda
            allCards.splice(storageIdx, 1);
        } else {
            allCards[storageIdx].body = newVal;
        }
        notesContent[cat] = rebuildCategoryFromCards(allCards);
        saveData();

        const searchEl = document.getElementById('note-search-input');
        renderBrowseCards(cat, searchEl ? searchEl.value.trim() : '');
        if (typeof showToast === 'function') showToast('[NOTES] Card updated');
    };

    ta.onblur = commitEdit;
    ta.onkeydown = (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            ta.blur();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            cancelled = true;
            const searchEl = document.getElementById('note-search-input');
            renderBrowseCards(cat, searchEl ? searchEl.value.trim() : '');
        }
    };

    bodyEl.appendChild(ta);
    ta.focus();
}

function deleteNoteCard(cat, storageIdx) {
    const allCards = parseCategoryIntoCards(notesContent[cat] || '');
    if (storageIdx < 0 || storageIdx >= allCards.length) return;

    allCards.splice(storageIdx, 1);
    notesContent[cat] = rebuildCategoryFromCards(allCards);
    saveData();

    const searchEl = document.getElementById('note-search-input');
    renderBrowseCards(cat, searchEl ? searchEl.value.trim() : '');
    if (typeof showToast === 'function') showToast('[NOTES] Card deleted');
}

// 4A + 5A: Invio rapido a Inbox (o Wishlist se inizia con "comprare ") e marcatura [✓ EXTRACTED]
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
        if (typeof showToast === 'function') showToast(`[NOTES -> WISHLIST] Added "${itemTitle}"`);
    } else {
        generalTodos.push({ id: 'todo_' + Date.now(), title: cleanLine });
        saveData();
        if (typeof renderGeneralTodos === 'function') renderGeneralTodos();
        if (typeof showToast === 'function') showToast(`[NOTES -> INBOX] Added "${cleanLine}"`);
    }

    markNoteCardExtracted(card.raw);
    const searchEl = document.getElementById('note-search-input');
    renderBrowseCards(cat, searchEl ? searchEl.value.trim() : '');
}

// 4A + 5A: Estrazione Azioni tramite Gemini e revisione inline dentro la scheda
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

        renderNoteCardAiDrawer(aiDrawer, extractedCmds, card, cat);
    } catch (err) {
        btnAi.disabled = false;
        btnAi.textContent = originalBtnText;
        btnAi.style.color = '';
        btnAi.style.borderColor = '';
        if (typeof showToast === 'function') showToast(`[AI EXTRACTOR ERROR] ${err.message}`);
    }
}

function renderNoteCardAiDrawer(aiDrawer, commandsArray, card, cat) {
    aiDrawer.style.display = 'flex';
    let localCmds = (commandsArray || []).map(c => c.trim()).filter(Boolean);

    const drawList = () => {
        aiDrawer.innerHTML = '';

        const topRow = document.createElement('div');
        topRow.style.cssText = 'display:flex; justify-content:space-between; align-items:center;';
        topRow.innerHTML = `
            <span style="font-size:var(--font-xs); color:var(--text-dim); font-weight:bold; text-transform:uppercase;">Proposed Actions from Note (${localCmds.length}):</span>
            <button type="button" class="btn btn-sm" id="add-inline-cmd-btn">[+ ADD ACTION]</button>
        `;
        aiDrawer.appendChild(topRow);

        topRow.querySelector('#add-inline-cmd-btn').onclick = () => {
            localCmds.push('todo ' + card.body.split('\n')[0].trim());
            drawList();
        };

        if (localCmds.length === 0) {
            const emptyMsg = document.createElement('div');
            emptyMsg.className = 'empty-state';
            emptyMsg.style.padding = '4px 0';
            emptyMsg.textContent = '[ NO SPECIFIC ACTIONS DETECTED — CLICK "+ ADD ACTION" OR CANCEL ]';
            aiDrawer.appendChild(emptyMsg);
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
                aiDrawer.appendChild(itemBox);
            });
        }

        const footer = document.createElement('div');
        footer.style.cssText = 'display:flex; justify-content:flex-end; gap:8px; padding-top:6px; border-top:1px dotted #222;';

        const btnCancel = document.createElement('button');
        btnCancel.type = 'button';
        btnCancel.className = 'btn btn-sm';
        btnCancel.textContent = '[CANCEL]';
        btnCancel.onclick = () => {
            aiDrawer.style.display = 'none';
            aiDrawer.innerHTML = '';
        };

        const btnSubmit = document.createElement('button');
        btnSubmit.type = 'button';
        btnSubmit.className = 'btn btn-primary btn-sm';
        btnSubmit.disabled = localCmds.length === 0;
        btnSubmit.textContent = '[SUBMIT TO SYSTEM]';
        btnSubmit.onclick = () => {
            let count = 0;
            localCmds.forEach(cmd => {
                if (cmd && typeof executeTerminalCommand === 'function' && executeTerminalCommand(cmd)) {
                    count++;
                }
            });
            markNoteCardExtracted(card.raw);
            aiDrawer.style.display = 'none';
            const searchEl = document.getElementById('note-search-input');
            renderBrowseCards(cat, searchEl ? searchEl.value.trim() : '');
            if (typeof showToast === 'function') {
                showToast(`[NOTES AI] Submitted ${count} action(s) to system!`);
            }
        };

        footer.appendChild(btnCancel);
        footer.appendChild(btnSubmit);
        aiDrawer.appendChild(footer);
    };

    drawList();
}

function handleNoteKeyDown(event) {
    if (currentNoteMode === 'write' && event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        saveNote();
    }
}

function saveNote() {
    const cat = document.getElementById('note-category').value;
    const textEl = document.getElementById('note-text');
    const text = textEl.value.trim();
    if (!text || !cat) return;

    if (!notesContent[cat]) notesContent[cat] = "";
    notesContent[cat] += (notesContent[cat] === "" ? "" : "\n\n") + text;
    saveData();

    textEl.value = '';
    textEl.placeholder = `[OK] Saved in ${cat}!`;
    setTimeout(() => {
        if (currentNoteMode === 'write') {
            textEl.placeholder = `Write a new note in [${cat}] and press Enter...`;
        }
    }, 1400);
}

function handleNoteInput() {
    // In modalità WRITE il salvataggio avviene premendo Invio; in BROWSE tramite inline-edit sulla singola card
}

function renderNoteCategories() {
    if (!noteCategories || noteCategories.length === 0) {
        noteCategories = ['General', 'Registrazioni'];
        saveData();
    }

    const select = document.getElementById('note-category');
    const focusSelect = document.getElementById('focus-note-category');
    const prevVal = select ? select.value : null;

    if (select) select.innerHTML = '';
    if (focusSelect) focusSelect.innerHTML = '';

    noteCategories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.textContent = cat;
        if (select) select.appendChild(opt);

        const optFocus = document.createElement('option');
        optFocus.value = cat;
        optFocus.textContent = cat;
        if (focusSelect) focusSelect.appendChild(optFocus);
    });

    if (select && prevVal && noteCategories.includes(prevVal)) {
        select.value = prevVal;
    }

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
    container.innerHTML = '';

    noteCategories.forEach(cat => {
        const row = document.createElement('div');
        row.className = 'manager-task';

        const span = document.createElement('span');
        span.textContent = cat;

        const actions = document.createElement('div');
        actions.className = 'action-btns';
        actions.style.display = 'flex';

        const delBtn = document.createElement('button');
        delBtn.className = 'icon-btn delete';
        delBtn.textContent = '[X]';
        delBtn.onclick = () => removeNoteCategory(cat);

        actions.appendChild(delBtn);
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
    noteCategories = noteCategories.filter(c => c !== cat);
    if (noteCategories.length === 0) noteCategories = ['General'];
    saveData();
    renderNotesManager();
    renderNoteCategories();
}

function openRegistrazioniInBrowseMode() {
    if (activeLeft !== 'notes' && activeRight !== 'notes' && typeof switchModule === 'function') {
        switchModule('right', 'notes');
    }

    renderNoteCategories();
    const select = document.getElementById('note-category');
    if (select) select.value = 'Registrazioni';

    const checkbox = document.getElementById('notes-mode-checkbox');
    if (checkbox) checkbox.checked = true;
    toggleNotesMode();

    const browseCont = document.getElementById('notes-browse-container');
    if (browseCont) browseCont.scrollTop = 0;
}