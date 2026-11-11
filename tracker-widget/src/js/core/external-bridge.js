// --- js/core/external-bridge.js ---
// 1. Unione Bidirezionale Eventi (Cortex <-> Google Calendar <-> Apple Calendar, SENZA Palestra)
// 2. Scanner Transazioni Istantaneo Esclusivo per Conto ISYBANK

const DEFAULT_ISYBANK_QUERY = 'newer_than:30d isybank';

let bridgeWebAppUrl = (localStorage.getItem('cortex_bridge_url') || '').trim();
let icloudIcsUrl = (localStorage.getItem('cortex_icloud_ics_url') || '').trim();
let bankGmailQuery = (localStorage.getItem('cortex_bank_gmail_query') || '').trim();

// Migra automaticamente la vecchia query lenta alla nuova query esclusiva per Isybank
if (!bankGmailQuery || bankGmailQuery.includes('intesasanpaolo') || bankGmailQuery.includes('paypal')) {
    bankGmailQuery = DEFAULT_ISYBANK_QUERY;
    localStorage.setItem('cortex_bank_gmail_query', bankGmailQuery);
}

let processedBankEmails = JSON.parse(localStorage.getItem('cortex_processed_bank_emails') || '[]');
let isBridgeSyncRunning = false;
let autoCalSyncDebounceTimer = null;
let lastCalendarEventsSignature = '';

function saveExternalBridgeConfigFromUI() {
    const urlInp = document.getElementById('bridge-webapp-url-inp');
    const icsInp = document.getElementById('bridge-icloud-ics-inp');
    const qInp = document.getElementById('bridge-bank-query-inp');

    if (urlInp) bridgeWebAppUrl = urlInp.value.trim();
    if (icsInp) icloudIcsUrl = icsInp.value.trim();
    if (qInp && qInp.value.trim()) bankGmailQuery = qInp.value.trim();

    localStorage.setItem('cortex_bridge_url', bridgeWebAppUrl);
    localStorage.setItem('cortex_icloud_ics_url', icloudIcsUrl);
    localStorage.setItem('cortex_bank_gmail_query', bankGmailQuery);
    localStorage.setItem('cortex_processed_bank_emails', JSON.stringify(processedBankEmails));

    updateExternalBridgeSettingsUI();
    if (typeof checkAndQueueLocalChangeForCloud === 'function') {
        checkAndQueueLocalChangeForCloud();
    }
}

function updateExternalBridgeSettingsUI() {
    const urlInp = document.getElementById('bridge-webapp-url-inp');
    const icsInp = document.getElementById('bridge-icloud-ics-inp');
    const qInp = document.getElementById('bridge-bank-query-inp');
    const statusEl = document.getElementById('bridge-settings-status');

    if (urlInp && urlInp !== document.activeElement) urlInp.value = bridgeWebAppUrl;
    if (icsInp && icsInp !== document.activeElement) icsInp.value = icloudIcsUrl;
    if (qInp && qInp !== document.activeElement) qInp.value = bankGmailQuery;

    if (statusEl) {
        if (!bridgeWebAppUrl) {
            statusEl.textContent = '[NOT CONFIGURED]';
            statusEl.style.color = 'var(--text-dim)';
        } else {
            statusEl.textContent = `[READY // ISYBANK FILTER ACTIVE]`;
            statusLblColor(statusEl, 'var(--accent-green)');
        }
    }
}

function statusLblColor(el, col) {
    if (el) el.style.color = col;
}

// Normalizza titolo + data per riconoscere lo stesso evento tra Apple, Google e Cortex senza creare doppioni
function buildEventDedupKey(title, dateStr) {
    const cleanTitle = (title || '').trim().toLowerCase().replace(/^\[cortex\]\s*/i, '');
    return `${dateStr || ''}::${cleanTitle}`;
}

// Raccoglie gli eventi da inviare a Google Calendar (Eventi Cortex + Eventi Apple Calendar per fare l'unione completa, ZERO Palestra)
function collectCortexEventsForExternalCalendar() {
    const out = [];
    const seenKeys = new Set();

    (specificEvents || []).forEach(ev => {
        if (!ev || !ev.date || !ev.title) return;
        // Ignora eventuali vecchi eventi automatici della palestra
        if (ev.id === 'gym_start_evt' || ev.id === 'gym_end_evt' || ev.title.includes('🏋️')) return;
        // Non rimanda indietro a Google Calendar ciò che proviene già da Google Calendar
        if (ev.extCalendarId && ev.extCalendarId.startsWith('gcal_')) return;

        const dedupKey = buildEventDedupKey(ev.title, ev.date);
        if (seenKeys.has(dedupKey)) return;
        seenKeys.add(dedupKey);

        out.push({
            id: `cx_ev_${ev.id}`,
            title: ev.title,
            date: ev.date,
            start: ev.start || null,
            end: ev.end || null,
            description: ev.extCalendarId ? 'Synced via Cortex Union (Apple Calendar)' : 'Synced from Cortex OS'
        });
    });

    return out;
}

// ============================================================================
// 1. UNIONE BIDIREZIONALE CALENDARI (GOOGLE <-> APPLE <-> CORTEX)
// ============================================================================

async function syncExternalCalendarsNow(isManual = true) {
    saveExternalBridgeConfigFromUI();
    if (!bridgeWebAppUrl) {
        if (isManual) {
            if (typeof showToast === 'function') showToast('[BRIDGE] Paste your Google Apps Script URL in Settings first!');
            if (typeof openSettingsModal === 'function') openSettingsModal('tab-system');
        }
        return false;
    }
    if (isBridgeSyncRunning) return false;
    isBridgeSyncRunning = true;

    if (isManual && typeof showToast === 'function') {
        showToast('[📅 CALENDAR] Merging Cortex, Google & Apple Calendar...');
    }

    try {
        const resp = await fetch(bridgeWebAppUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            redirect: 'follow',
            body: JSON.stringify({
                action: 'sync_calendar',
                icloudIcsUrl: icloudIcsUrl,
                cortexEvents: collectCortexEventsForExternalCalendar()
            })
        });

        const resJson = await resp.json();
        if (!resJson.ok) throw new Error(resJson.error || 'Bridge returned error');

        const extEvents = (resJson.data && resJson.data.calendar && resJson.data.calendar.externalEvents) || [];
        let importedCount = 0;

        extEvents.forEach(ext => {
            if (!ext || !ext.extId || !ext.date || !ext.title) return;
            if (ext.title.includes('🏋️')) return;

            const extKey = buildEventDedupKey(ext.title, ext.date);

            // Cerca se l'evento esiste già in Cortex (per ID esterno oppure per stesso Titolo + Data)
            const existing = specificEvents.find(e =>
                e.extCalendarId === ext.extId ||
                buildEventDedupKey(e.title, e.date) === extKey
            );

            if (existing) {
                if (!existing.extCalendarId) existing.extCalendarId = ext.extId;
                existing.title = ext.title;
                existing.date = ext.date;
                existing.start = ext.start || existing.start || null;
                existing.end = ext.end || existing.end || null;
            } else {
                specificEvents.push({
                    id: 'e_ext_' + Date.now() + '_' + Math.floor(Math.random() * 10000),
                    extCalendarId: ext.extId,
                    title: ext.title,
                    date: ext.date,
                    start: ext.start || null,
                    end: ext.end || null,
                    color: ext.source === 'apple' ? '#725b7a' : '#4c5b73'
                });
                importedCount++;
            }
        });

        lastCalendarEventsSignature = JSON.stringify(collectCortexEventsForExternalCalendar());
        saveData();

        if (typeof renderCalendar === 'function') renderCalendar();
        if (typeof renderWeeklyPlanner === 'function') renderWeeklyPlanner();
        if (typeof renderDayPlannerModule === 'function') renderDayPlannerModule();
        if (typeof renderTasks === 'function') renderTasks();

        isBridgeSyncRunning = false;
        if (isManual && typeof showToast === 'function') {
            showToast(`[📅 UNION OK] Calendars merged (${importedCount} new event(s))`);
        }
        return true;
    } catch (err) {
        isBridgeSyncRunning = false;
        console.error('[CALENDAR BRIDGE ERROR]', err);
        if (isManual && typeof showToast === 'function') {
            showToast(`[CALENDAR ERROR] ${err.message}`);
        }
        return false;
    }
}

// ============================================================================
// 2. PARSER ULTRA-RAPIDO ESCLUSIVO PER NOTIFICHE ISYBANK
// ============================================================================

function parseIsybankEmailFast(mail) {
    const fromStr = (mail.from || '').toLowerCase();
    const subjStr = (mail.subject || '').trim();
    const bodyStr = (mail.body || '').trim();
    const combined = `${subjStr} ${bodyStr}`;
    const lower = combined.toLowerCase();

    // 1. Accetta ESCLUSIVAMENTE email provenienti da o relative a Isybank
    if (!fromStr.includes('isybank') && !lower.includes('isybank')) {
        return null;
    }

    // 2. Scarta subito email informative non contabili (login, OTP, documenti, estratti conto, privacy)
    const ignoreKeywords = [
        'codice di sicurezza', 'otp', 'accesso', 'password', 'pin',
        'estratto conto', 'documento disponibile', 'archivio',
        'condizioni contrattuali', 'modifica unilaterale', 'promozione', 'benvenuto'
    ];
    if (ignoreKeywords.some(kw => lower.includes(kw)) && !lower.includes('hai effettuato') && !lower.includes('pagamento')) {
        return null;
    }

    // 3. Estrae l'importo in Euro (es. "12,50 EUR", "€ 12,50", "Euro 12,50", "importo di 12,50")
    const amtRegex = /(?:€|eur|euro|importo(?:\s+di)?|pari\s+a)\s*[:.]?\s*(\d{1,6}(?:[.,]\d{1,2})?)|(\d{1,6}[.,]\d{2})\s*(?:€|eur|euro)/i;
    const amtMatch = combined.match(amtRegex);
    if (!amtMatch) return null;

    const rawAmt = (amtMatch[1] || amtMatch[2] || '').replace(',', '.');
    const amount = roundCurrency(parseFloat(rawAmt));
    if (!amount || amount <= 0) return null;

    // 4. Determina se è un'entrata (Accredito / Bonifico ricevuto) o un'uscita (Pagamento carta / POS / Bonifico inviato / Addebito)
    const isIncome = lower.includes('accredito') ||
        lower.includes('a tuo favore') ||
        lower.includes('hai ricevuto') ||
        lower.includes('rimborso') ||
        lower.includes('storno');
    const type = isIncome ? 'in' : 'out';

    // 5. Estrae il nome dell'esercente o beneficiario dalla notifica Isybank
    let merchant = '';
    const merchPatterns = [
        /(?:presso|esercente|negozio)\s*[:.]?\s*([A-Za-z0-9À-ÿ\s.&'*/-]{2,35}?)(?:\s+in\s+data|\s+del\s+|\s+con\s+carta|\s+per\s+un|\.|,|$)/i,
        /(?:a favore di|beneficiario)\s*[:.]?\s*([A-Za-z0-9À-ÿ\s.&'-]{2,35}?)(?:\s+in\s+data|\s+del\s+|\s+di\s+importo|\.|,|$)/i,
        /(?:da|ordinante)\s*[:.]?\s*([A-Za-z0-9À-ÿ\s.&'-]{2,35}?)(?:\s+in\s+data|\s+del\s+|\.|,|$)/i
    ];

    for (const pat of merchPatterns) {
        const m = combined.match(pat);
        if (m && m[1] && m[1].trim().length >= 2) {
            merchant = m[1].trim();
            break;
        }
    }

    if (!merchant) {
        merchant = subjStr
            .replace(/isybank/gi, '')
            .replace(/^[\s\-:]+/, '')
            .trim() || (isIncome ? 'Accredito Isybank' : 'Pagamento Isybank');
    }

    // 6. Auto-categorizzazione intelligente in base al nome dell'esercente
    let category = 'Generale';
    const mLow = merchant.toLowerCase();
    if (mLow.includes('conad') || mLow.includes('coop') || mLow.includes('lidl') || mLow.includes('eurospin') || mLow.includes('md ') || mLow.includes('supermercato') || mLow.includes('carrefour') || mLow.includes('bar') || mLow.includes('pizz') || mLow.includes('sushi') || mLow.includes('mc ') || mLow.includes('mcdonald') || mLow.includes('poke')) {
        category = 'Cibo';
    } else if (mLow.includes('trenitalia') || mLow.includes('italo') || mLow.includes('cotrab') || mLow.includes('sita') || mLow.includes('fal ') || mLow.includes('eni') || mLow.includes('q8') || mLow.includes('ip ') || mLow.includes('tamoil') || mLow.includes('uber')) {
        category = 'Trasporti';
    } else if (mLow.includes('spotify') || mLow.includes('netflix') || mLow.includes('apple') || mLow.includes('google') || mLow.includes('iliad') || mLow.includes('tim') || mLow.includes('vodafone') || mLow.includes('openai')) {
        category = 'Abbonamenti';
    } else if (mLow.includes('unibas') || mLow.includes('universit') || mLow.includes('pago pa') || mLow.includes('pagopa')) {
        category = 'Tasse Uni';
    }

    return {
        emailId: mail.id,
        date: mail.date || todayStr,
        type: type,
        amount: amount,
        category: category,
        desc: `Isybank // ${merchant.slice(0, 38)}`
    };
}

async function scanBankEmailsNow(isManual = true) {
    saveExternalBridgeConfigFromUI();
    if (!bridgeWebAppUrl) {
        if (isManual) {
            if (typeof showToast === 'function') showToast('[BRIDGE] Paste your Google Apps Script URL in Settings first!');
            if (typeof openSettingsModal === 'function') openSettingsModal('tab-system');
        }
        return false;
    }
    if (isBridgeSyncRunning) return false;
    isBridgeSyncRunning = true;

    if (isManual && typeof showToast === 'function') {
        showToast('[🏦 ISYBANK] Scanning Isybank emails...');
    }

    try {
        const resp = await fetch(bridgeWebAppUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            redirect: 'follow',
            body: JSON.stringify({
                action: 'scan_bank',
                bankQuery: bankGmailQuery || DEFAULT_ISYBANK_QUERY
            })
        });

        const resJson = await resp.json();
        if (!resJson.ok) throw new Error(resJson.error || 'Bridge error');

        const allEmails = (resJson.data && resJson.data.bankEmails) || [];
        const newEmails = allEmails.filter(m => m && m.id && !processedBankEmails.includes(m.id));

        if (newEmails.length === 0) {
            isBridgeSyncRunning = false;
            if (isManual && typeof showToast === 'function') {
                showToast('[🏦 ISYBANK] No new Isybank transactions');
            }
            return true;
        }

        // Parsing locale istantaneo (< 5ms) specifico per Isybank
        const extractedTxs = newEmails
            .map(mail => parseIsybankEmailFast(mail))
            .filter(Boolean);

        let addedCount = 0;

        // Inserisce in ordine cronologico
        extractedTxs.reverse().forEach(tx => {
            const amt = roundCurrency(parseFloat(tx.amount));
            if (!amt || amt <= 0) return;

            const txType = tx.type === 'in' ? 'in' : 'out';
            const cat = (tx.category || 'Generale').trim();
            const desc = (tx.desc || 'Isybank').trim();
            const dateStr = tx.date || todayStr;

            // Evita duplicati se la stessa transazione (stessa data, importo e descrizione) è già presente
            const alreadyInList = (mTransactions || []).some(existing =>
                existing.date === dateStr &&
                Math.abs(existing.amount - amt) < 0.01 &&
                existing.desc === desc
            );
            if (alreadyInList) return;

            if (txType === 'in') {
                mBalance = roundCurrency(mBalance + amt);
                mTransactions.unshift({
                    id: 'mt_isy_' + Date.now() + '_' + Math.floor(Math.random() * 10000),
                    date: dateStr,
                    type: 'in',
                    amount: amt,
                    cat: 'Income',
                    category: 'Income',
                    desc: desc
                });
            } else {
                if (!mCategories.includes(cat)) mCategories.push(cat);
                mBalance = roundCurrency(mBalance - amt);
                mTransactions.unshift({
                    id: 'mt_isy_' + Date.now() + '_' + Math.floor(Math.random() * 10000),
                    date: dateStr,
                    type: 'out',
                    amount: amt,
                    cat: cat,
                    category: cat,
                    desc: desc
                });
            }
            addedCount++;
        });

        // Registra gli ID delle email controllate così le prossime scansioni sono immediate
        newEmails.forEach(m => {
            if (!processedBankEmails.includes(m.id)) {
                processedBankEmails.push(m.id);
            }
        });
        localStorage.setItem('cortex_processed_bank_emails', JSON.stringify(processedBankEmails));

        saveMoneyData();
        if (typeof renderMoneyDashboard === 'function') renderMoneyDashboard();
        if (typeof renderMoneyAtomTransactions === 'function') renderMoneyAtomTransactions();
        if (typeof renderMoneyAtomSummary === 'function') renderMoneyAtomSummary();
        if (typeof renderMoneyAtomChart === 'function') renderMoneyAtomChart();
        updateExternalBridgeSettingsUI();

        isBridgeSyncRunning = false;
        if (typeof showToast === 'function') {
            showToast(`[🏦 ISYBANK] Added ${addedCount} Isybank transaction(s)!`);
        }
        return true;
    } catch (err) {
        isBridgeSyncRunning = false;
        console.error('[ISYBANK SCAN ERROR]', err);
        if (isManual && typeof showToast === 'function') {
            showToast(`[ISYBANK ERROR] ${err.message}`);
        }
        return false;
    }
}

// Auto-Sync in background del Calendario quando aggiungi/modifichi un evento in Cortex
window.addEventListener('DOMContentLoaded', () => {
    updateExternalBridgeSettingsUI();

    setTimeout(() => {
        lastCalendarEventsSignature = JSON.stringify(collectCortexEventsForExternalCalendar());
    }, 1200);

    setInterval(() => {
        if (!bridgeWebAppUrl || !navigator.onLine || isBridgeSyncRunning) return;
        const curSig = JSON.stringify(collectCortexEventsForExternalCalendar());
        if (lastCalendarEventsSignature && curSig !== lastCalendarEventsSignature) {
            lastCalendarEventsSignature = curSig;
            clearTimeout(autoCalSyncDebounceTimer);
            autoCalSyncDebounceTimer = setTimeout(() => {
                syncExternalCalendarsNow(false);
            }, 2500);
        }
    }, 2000);
});