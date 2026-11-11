// --- js/core/external-bridge.js ---
// 1. Unione Bidirezionale Eventi (Cortex <-> Google Calendar <-> Apple Calendar, senza Palestra)
// 2. Parser Email Isybank (Pagamenti Carta, BANCOMAT Pay, Versamenti, Accrediti, Bonifici) integrato col modulo Money originale

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
            statusEl.textContent = '[READY // ISYBANK PARSER ACTIVE]';
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
// PARSER EMAIL ISYBANK (CALIBRATO SU PAGAMENTI CARTA, ACCREDITI, VERSAMENTI E BONIFICI)
// ============================================================================

function inferExpenseCategoryFromMerchant(merchant) {
    const m = (merchant || '').toLowerCase();

    // Se hai un Vault il cui nome coincide con l'esercente/categoria, usa quello
    if (typeof findMatchingVaultForExpense === 'function') {
        const vMatch = findMatchingVaultForExpense('', merchant);
        if (vMatch) return vMatch.name;
    }

    if (m.includes('ferrovie appulo lucane') || m.includes('trenitalia') || m.includes('italo') || m.includes('stazione ip') || m.includes('eni') || m.includes('q8') || m.includes('tamoil')) {
        return 'Trasporti';
    }
    if (m.includes('cafe') || m.includes('coffee') || m.includes('bar ') || m.includes('fandango') || m.includes('glera') || m.includes('pickup') || m.includes('d245') || m.includes('conad') || m.includes('lidl') || m.includes('supermercato')) {
        return 'Cibo';
    }
    if (m.includes('unibas') || m.includes('pagopa') || m.includes('pago pa')) {
        return 'Tasse Uni';
    }
    return 'Generale';
}

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

    // Scarta email non transazionali (codici OTP, login, documenti/estratti conto in archivio)
    const ignoreKeywords = [
        'codice di sicurezza', 'otp', 'accesso effettuato', 'password', 'pin',
        'estratto conto', 'documento disponibile', 'condizioni contrattuali', 'modifica unilaterale'
    ];
    if (ignoreKeywords.some(kw => lower.includes(kw)) && !lower.includes('hai pagato') && !lower.includes('hai ricevuto')) {
        return null;
    }

    // Estrae la data operazione ("in data 11/11" o "11.11.2026") oppure usa la data della mail
    let txDate = mail.date || todayStr;
    const inlineDateMatch = bodyClean.match(/(?:in\s+data|del)\s+(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?/i);
    if (inlineDateMatch) {
        const dd = String(inlineDateMatch[1]).padStart(2, '0');
        const mm = String(inlineDateMatch[2]).padStart(2, '0');
        const yyyy = inlineDateMatch[3]
            ? (inlineDateMatch[3].length === 2 ? '20' + inlineDateMatch[3] : inlineDateMatch[3])
            : (txDate.slice(0, 4) || '2026');
        txDate = `${yyyy}-${mm}-${dd}`;
    }

    // 1. TEMPLATE "isybank: Accredito Importo"
    // Esempio: "ti informiamo che hai ricevuto un accredito di 10,64 EUR sul conto associato alla carta 5341_*_*_0157 da ..."
    // Registra semplicemente "Accredito" (senza salvare il mittente)
    const accreditoMatch = bodyClean.match(/hai\s+ricevuto\s+un\s+accredito\s+di\s+(\d{1,6}(?:[.,]\d{1,2})?)\s*(?:EUR|€)/i);
    if (accreditoMatch) {
        const amount = roundCurrency(parseFloat(accreditoMatch[1].replace(',', '.')));
        if (amount > 0) {
            return {
                emailId: mail.id,
                date: txDate,
                type: 'in',
                amount: amount,
                category: 'Entrata',
                desc: 'Accredito'
            };
        }
    }

    // 2. TEMPLATE "isybank: Pagamento con carta"
    // Esempio: "ti informiamo che in data 11/11 hai pagato 34,99 EUR con la carta 5341_*_*_0157 presso Amazon.it ."
    const pagamentoCartaMatch = bodyClean.match(/(?:hai\s+pagato|pagamento\s+di)\s+(\d{1,6}(?:[.,]\d{1,2})?)\s*(?:EUR|€)[\s\S]*?\bpresso\s+(.+?)(?:\s+\.|\.$|$)/i);
    if (pagamentoCartaMatch) {
        const amount = roundCurrency(parseFloat(pagamentoCartaMatch[1].replace(',', '.')));
        const merchant = pagamentoCartaMatch[2].replace(/\s*\.\s*$/, '').trim();
        if (amount > 0) {
            return {
                emailId: mail.id,
                date: txDate,
                type: 'out',
                amount: amount,
                category: inferExpenseCategoryFromMerchant(merchant),
                desc: merchant
            };
        }
    }

    // 3. Estrazione importo per Versamenti Contanti ATM, Bonifici e BANCOMAT Pay
    const amtMatch = combined.match(/(\d{1,6}[.,]\d{2})\s*(?:EUR|€|euro)|(?:€|EUR|euro|importo(?:\s+di)?)\s*[:.]?\s*(\d{1,6}[.,]\d{2})/i);
    if (!amtMatch) return null;

    const amount = roundCurrency(parseFloat((amtMatch[1] || amtMatch[2]).replace(',', '.')));
    if (!amount || amount <= 0) return null;

    // 3A. Versamento Contanti Su Sportello Automatico
    if (lower.includes('versamento')) {
        return {
            emailId: mail.id,
            date: txDate,
            type: 'in',
            amount: amount,
            category: 'Entrata',
            desc: 'Versamento Contanti Su Sportello Automatico'
        };
    }

    // 3B. Bonifico o Accredito in entrata (senza salvare il mittente)
    const isIncome = lower.includes('accredito') ||
        lower.includes('hai ricevuto') ||
        lower.includes('a tuo favore') ||
        lower.includes('bonifico disposto da') ||
        lower.includes('rimborso') ||
        lower.includes('storno');

    if (isIncome) {
        const descIn = lower.includes('bonifico') ? 'Bonifico' : 'Accredito';
        return {
            emailId: mail.id,
            date: txDate,
            type: 'in',
            amount: amount,
            category: 'Entrata',
            desc: descIn
        };
    }

    // 3C. BANCOMAT Pay in uscita
    if (lower.includes('bancomat pay')) {
        const descBp = lower.includes('trasferimento') ? 'Trasferimento Denaro BANCOMAT Pay' : 'Pagamento BANCOMAT Pay';
        return {
            emailId: mail.id,
            date: txDate,
            type: 'out',
            amount: amount,
            category: inferExpenseCategoryFromMerchant(descBp),
            desc: descBp
        };
    }

    // 3D. Bonifico in uscita o altro addebito
    if (lower.includes('bonifico')) {
        return {
            emailId: mail.id,
            date: txDate,
            type: 'out',
            amount: amount,
            category: 'Generale',
            desc: 'Bonifico in uscita'
        };
    }

    const merchMatch = bodyClean.match(/\bpresso\s+(.+?)(?:\s+\.|\.$|$)/i);
    const fallbackDesc = merchMatch
        ? merchMatch[1].replace(/\s*\.\s*$/, '').trim()
        : (subjStr.replace(/^isybank\s*:\s*/i, '').trim() || 'Pagamento Isybank');

    return {
        emailId: mail.id,
        date: txDate,
        type: 'out',
        amount: amount,
        category: inferExpenseCategoryFromMerchant(fallbackDesc),
        desc: fallbackDesc
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
        const extractedTxs = allEmails
            .map(mail => parseIsybankEmailFast(mail))
            .filter(Boolean);

        let addedCount = 0;

        // Inserisce dal più vecchio al più recente controllando che l'emailId non sia già in mTransactions
        extractedTxs.reverse().forEach(tx => {
            const amt = roundCurrency(parseFloat(tx.amount));
            if (!amt || amt <= 0) return;

            const alreadyExists = (mTransactions || []).some(existing =>
                (tx.emailId && existing.emailId === tx.emailId) ||
                (existing.date === tx.date && existing.type === tx.type && Math.abs((parseFloat(existing.amount) || 0) - amt) < 0.01 && existing.desc === tx.desc)
            );
            if (alreadyExists) return;

            if (tx.type === 'in') {
                mBalance = roundCurrency(mBalance + amt);
                if (typeof applyIncomeVaultRules === 'function') {
                    applyIncomeVaultRules(amt);
                }
                mTransactions.push({
                    id: 'mt_' + Date.now() + '_' + Math.floor(Math.random() * 10000),
                    emailId: tx.emailId,
                    type: 'in',
                    amount: amt,
                    category: 'Entrata',
                    desc: tx.desc || 'Accredito',
                    date: tx.date || todayStr
                });
            } else {
                if (typeof recordExpenseWithVaultCheck === 'function') {
                    recordExpenseWithVaultCheck({
                        amount: amt,
                        category: tx.category || 'Generale',
                        desc: tx.desc || 'Pagamento',
                        dateStr: tx.date || todayStr,
                        emailId: tx.emailId
                    });
                } else {
                    const cat = tx.category || 'Generale';
                    if (!mCategories.includes(cat)) mCategories.push(cat);
                    mBalance = roundCurrency(mBalance - amt);
                    mTransactions.push({
                        id: 'mt_' + Date.now() + '_' + Math.floor(Math.random() * 10000),
                        emailId: tx.emailId,
                        type: 'out',
                        amount: amt,
                        category: cat,
                        desc: tx.desc || 'Pagamento',
                        date: tx.date || todayStr
                    });
                }
            }
            addedCount++;
        });

        saveMoneyData();
        if (typeof renderMoneyAllActivePanes === 'function') {
            renderMoneyAllActivePanes();
        } else if (typeof renderMoneyDashboard === 'function') {
            renderMoneyDashboard();
        }
        updateExternalBridgeSettingsUI();

        isBridgeSyncRunning = false;
        if (typeof showToast === 'function') {
            showToast(addedCount > 0
                ? `[🏦 ISYBANK] Imported ${addedCount} transaction(s)!`
                : `[🏦 ISYBANK] No new transactions to import`);
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