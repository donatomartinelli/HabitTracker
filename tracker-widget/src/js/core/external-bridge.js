// --- js/core/external-bridge.js ---
// 1. Unione Bidirezionale Eventi (Cortex <-> Google Calendar <-> Apple Calendar, SENZA Palestra)
// 2. Scanner Email Isybank calibrato sui template reali di "Comunicazioni isybank" (Pagamenti Carta, Accrediti, Versamenti ATM, Bonifici)

const DEFAULT_ISYBANK_QUERY = 'newer_than:60d isybank';

let bridgeWebAppUrl = (localStorage.getItem('cortex_bridge_url') || '').trim();
let icloudIcsUrl = (localStorage.getItem('cortex_icloud_ics_url') || '').trim();
let bankGmailQuery = (localStorage.getItem('cortex_bank_gmail_query') || '').trim();

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
            statusEl.textContent = `[ISYBANK ACTIVE // ${processedBankEmails.length} MAILS READ]`;
            statusEl.style.color = 'var(--accent-green)';
        }
    }
}

function buildEventDedupKey(title, dateStr) {
    const cleanTitle = (title || '').trim().toLowerCase().replace(/^\[cortex\]\s*/i, '');
    return `${dateStr || ''}::${cleanTitle}`;
}

function collectCortexEventsForExternalCalendar() {
    const out = [];
    const seenKeys = new Set();

    (specificEvents || []).forEach(ev => {
        if (!ev || !ev.date || !ev.title) return;
        if (ev.id === 'gym_start_evt' || ev.id === 'gym_end_evt' || ev.title.includes('🏋️')) return;
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
// PARSER NATIVO SUI TEMPLATE DELLE MAIL DI "COMUNICAZIONI ISYBANK"
// ============================================================================

function parseIsybankEmailFast(mail) {
    const fromStr = (mail.from || '').toLowerCase();
    const subjStr = (mail.subject || '').trim();
    const bodyClean = (mail.body || '')
        .replace(/Il team isybank[\s\S]*$/i, '')
        .replace(/\s+/g, ' ')
        .trim();
    const combined = `${subjStr} ${bodyClean}`;
    const lower = combined.toLowerCase();

    if (!fromStr.includes('isybank') && !lower.includes('isybank')) {
        return null;
    }

    // Estrae eventuale data "in data DD/MM" dal testo della mail (es. "in data 11/11 hai pagato...")
    let txDate = mail.date || todayStr;
    const inlineDateMatch = bodyClean.match(/in\s+data\s+(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/i);
    if (inlineDateMatch) {
        const dd = String(inlineDateMatch[1]).padStart(2, '0');
        const mm = String(inlineDateMatch[2]).padStart(2, '0');
        const yyyy = inlineDateMatch[3]
            ? (inlineDateMatch[3].length === 2 ? '20' + inlineDateMatch[3] : inlineDateMatch[3])
            : (txDate.slice(0, 4) || '2026');
        txDate = `${yyyy}-${mm}-${dd}`;
    }

    // TEMPLATE 1: "isybank: Accredito Importo"
    // Testo: "ti informiamo che hai ricevuto un accredito di 10,64 EUR sul conto associato alla carta 5341_*_*_0157 da KLAR*DMartinelli"
    const accreditoMatch = bodyClean.match(/hai\s+ricevuto\s+un\s+accredito\s+di\s+(\d{1,6}(?:[.,]\d{1,2})?)\s*EUR[\s\S]*?\bda\s+([^\n.]+?)$/i);
    if (accreditoMatch) {
        const amount = roundCurrency(parseFloat(accreditoMatch[1].replace(',', '.')));
        const sender = accreditoMatch[2].trim();
        if (amount > 0) {
            return {
                emailId: mail.id,
                date: txDate,
                type: 'in',
                subType: 'accredito',
                accounted: true,
                amount: amount,
                cat: 'Accrediti & Rimborsi',
                desc: `Accredito da ${sender}`
            };
        }
    }

    // TEMPLATE 2: "isybank: Pagamento con carta"
    // Testo: "ti informiamo che in data 11/11 hai pagato 34,99 EUR con la carta 5341_*_*_0157 presso Amazon.it ."
    const pagamentoCartaMatch = bodyClean.match(/hai\s+pagato\s+(\d{1,6}(?:[.,]\d{1,2})?)\s*EUR[\s\S]*?\bpresso\s+(.+?)(?:\s+\.|\.$|$)/i);
    if (pagamentoCartaMatch) {
        const amount = roundCurrency(parseFloat(pagamentoCartaMatch[1].replace(',', '.')));
        const merchant = pagamentoCartaMatch[2].replace(/\s*\.\s*$/, '').trim();
        if (amount > 0) {
            return normalizeIsybankTxRecord({
                emailId: mail.id,
                date: txDate,
                type: 'out',
                subType: 'pagamento',
                accounted: false, // Appena arriva la mail del pagamento carta è non contabilizzato finché non viene registrato
                amount: amount,
                cat: '',
                desc: merchant
            });
        }
    }

    // TEMPLATE 3: Versamento Contanti ATM / Bonifico ricevuto / BANCOMAT Pay / Altre notifiche Isybank
    const amtMatch = combined.match(/(\d{1,6}[.,]\d{2})\s*(?:EUR|€)|(?:€|EUR)\s*(\d{1,6}[.,]\d{2})/i);
    if (!amtMatch) return null;

    const amount = roundCurrency(parseFloat((amtMatch[1] || amtMatch[2]).replace(',', '.')));
    if (!amount || amount <= 0) return null;

    if (lower.includes('versamento')) {
        return {
            emailId: mail.id,
            date: txDate,
            type: 'in',
            subType: 'versamento',
            accounted: true,
            amount: amount,
            cat: 'Versamenti ATM',
            desc: 'Versamento Contanti Su Sportello Automatico'
        };
    }

    if (lower.includes('bonifico') && (lower.includes('ricevuto') || lower.includes('a tuo favore') || lower.includes('disposto da'))) {
        const senderMatch = bodyClean.match(/(?:da|ordinante)\s*[:.]?\s*([A-Za-z0-9À-ÿ\s.*&'-]{2,35})/i);
        const sender = senderMatch ? senderMatch[1].trim() : 'Ordinante';
        return {
            emailId: mail.id,
            date: txDate,
            type: 'in',
            subType: 'bonifico',
            accounted: true,
            amount: amount,
            cat: 'Bonifici ricevuti',
            desc: `Bonifico disposto da ${sender}`
        };
    }

    const isIncome = lower.includes('accredito') || lower.includes('hai ricevuto') || lower.includes('a tuo favore') || lower.includes('rimborso');
    const merchMatch = bodyClean.match(/(?:presso|da|a favore di)\s+([A-Za-z0-9À-ÿ\s.*&'/-]{2,35})/i);
    const desc = merchMatch ? merchMatch[1].replace(/\s*\.\s*$/, '').trim() : (subjStr.replace(/isybank\s*:\s*/i, '').trim() || 'Operazione Isybank');

    return normalizeIsybankTxRecord({
        emailId: mail.id,
        date: txDate,
        type: isIncome ? 'in' : 'out',
        subType: isIncome ? 'accredito' : (lower.includes('bancomat pay') ? 'bancomat_pay' : 'pagamento'),
        accounted: true,
        amount: amount,
        cat: '',
        desc: desc
    });
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
        showToast('[🏦 ISYBANK] Lettura mail Comunicazioni isybank...');
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
        // Quando premi manualmente [🏦 SCAN ISYBANK], ispeziona tutte le mail Isybank e usa il controllo anti-duplicati per data+importo+tipo
        const candidateEmails = isManual
            ? allEmails
            : allEmails.filter(m => m && m.id && !processedBankEmails.includes(m.id));

        const extractedTxs = candidateEmails
            .map(mail => parseIsybankEmailFast(mail))
            .filter(Boolean);

        let addedCount = 0;
        let enrichedCount = 0;

        extractedTxs.reverse().forEach(tx => {
            const amt = roundCurrency(parseFloat(tx.amount));
            if (!amt || amt <= 0) return;

            // Controlla se questo movimento esiste già tra le operazioni del PDF (stessa data, stesso tipo in/out e stesso importo al centesimo)
            const existingMatch = (mTransactions || []).find(existing =>
                existing.date === tx.date &&
                existing.type === tx.type &&
                Math.abs((parseFloat(existing.amount) || 0) - amt) < 0.01
            );

            if (existingMatch) {
                // Se nel PDF c'era solo "Accredito" generico e la mail dice "Accredito da KLAR*DMartinelli", arricchisce la descrizione!
                if (existingMatch.desc.toLowerCase() === 'accredito' && tx.desc.length > existingMatch.desc.length) {
                    existingMatch.desc = tx.desc;
                    enrichedCount++;
                }
                return;
            }

            const newEntry = normalizeIsybankTxRecord({
                id: 'mt_isy_' + Date.now() + '_' + Math.floor(Math.random() * 10000),
                date: tx.date || todayStr,
                type: tx.type,
                subType: tx.subType,
                accounted: tx.accounted !== undefined ? tx.accounted : false,
                amount: amt,
                cat: tx.cat,
                category: tx.cat,
                desc: tx.desc
            });

            mTransactions.unshift(newEntry);
            if (!mCategories.includes(newEntry.cat)) mCategories.push(newEntry.cat);

            if (newEntry.type === 'in') {
                mBalance = roundCurrency(mBalance + amt);
            } else {
                mBalance = roundCurrency(mBalance - amt);
            }
            addedCount++;
        });

        allEmails.forEach(m => {
            if (m && m.id && !processedBankEmails.includes(m.id)) {
                processedBankEmails.push(m.id);
            }
        });
        localStorage.setItem('cortex_processed_bank_emails', JSON.stringify(processedBankEmails));

        saveMoneyData();
        if (typeof renderMoneyDashboard === 'function') renderMoneyDashboard();
        updateExternalBridgeSettingsUI();

        isBridgeSyncRunning = false;
        if (typeof showToast === 'function') {
            if (addedCount > 0 || enrichedCount > 0) {
                showToast(`[🏦 ISYBANK] +${addedCount} nuovi movimenti (${enrichedCount} aggiornati da mail)!`);
            } else {
                showToast(`[🏦 ISYBANK] Tutte le mail Isybank sono già allineate coi movimenti!`);
            }
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