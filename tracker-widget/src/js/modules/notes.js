// --- ATOMIC MODULE 3: STANDALONE NOTES & SONY AUDIO PIPELINE ---

let currentNoteMode = 'write';
let notesAutosaveTimer;

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
    const searchEl = document.getElementById('note-search-input');
    if (!catEl || !textEl) return;

    if (searchEl) searchEl.value = '';
    const cat = catEl.value;

    if (currentNoteMode === 'write') {
        textEl.readOnly = false;
        textEl.value = '';
        textEl.placeholder = `Write a new note in [${cat}] and press Enter (Shift+Enter for new line)...`;
    } else {
        textEl.readOnly = false;
        textEl.value = notesContent[cat] || '';
        textEl.placeholder = `[${cat}] is empty. Switch to WRITE or type directly here...`;
    }
}

function filterNotesView(query) {
    const catEl = document.getElementById('note-category');
    const textEl = document.getElementById('note-text');
    const checkbox = document.getElementById('notes-mode-checkbox');
    if (!catEl || !textEl) return;

    const cat = catEl.value;
    const fullText = notesContent[cat] || '';
    const cleanQ = (query || '').trim().toLowerCase();

    if (!cleanQ) {
        if (currentNoteMode === 'browse') {
            textEl.readOnly = false;
            textEl.value = fullText;
        }
        return;
    }

    // Passa automaticamente in visualizzazione filtrata (sola lettura finché c'è il filtro attivo)
    if (checkbox && !checkbox.checked) {
        checkbox.checked = true;
        currentNoteMode = 'browse';
    }

    const paragraphs = fullText.split(/\n\n+/);
    const matched = paragraphs.filter(p => p.toLowerCase().includes(cleanQ));
    textEl.readOnly = true;
    textEl.value = matched.length > 0
        ? matched.join('\n\n')
        : `[ NO MATCHES FOUND FOR "${query}" IN ${cat.toUpperCase()} ]`;
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
    const searchEl = document.getElementById('note-search-input');
    if (searchEl && searchEl.value.trim() !== '') return; // Non sovrascrivere mentre si filtra

    if (currentNoteMode === 'browse') {
        clearTimeout(notesAutosaveTimer);
        notesAutosaveTimer = setTimeout(() => {
            const cat = document.getElementById('note-category').value;
            const textEl = document.getElementById('note-text');
            if (cat && textEl) {
                notesContent[cat] = textEl.value;
                saveData();
            }
        }, 400);
    }
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
    // Se NOTES non è montato in nessuno dei 2 pannelli, lo monta automaticamente a destra
    if (activeLeft !== 'notes' && activeRight !== 'notes' && typeof switchModule === 'function') {
        switchModule('right', 'notes');
    }

    renderNoteCategories();
    const select = document.getElementById('note-category');
    if (select) select.value = 'Registrazioni';

    const checkbox = document.getElementById('notes-mode-checkbox');
    if (checkbox) checkbox.checked = true;
    toggleNotesMode();

    const textArea = document.getElementById('note-text');
    if (textArea) {
        textArea.scrollTop = textArea.scrollHeight;
        textArea.focus();
    }
}