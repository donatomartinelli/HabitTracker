// --- js/modules/money.js ---
// Modulo Money ristrutturato su Conto Isybank 1000/80282860 & Carta 5341_*_*_0157
// Include la baseline reale delle 50 operazioni (13.10.2026 - 11.11.2026) con distinzione tra:
// - Versamenti Contanti ATM
// - Accrediti su Carta (es. KLAR*DMartinelli)
// - Bonifici Ricevuti (es. Mangopay / Famiglia)
// - Uscite Contabilizzate (SI) e Non Contabilizzate (NO)

const ISYBANK_ACCOUNT_LABEL = 'Conto 1000/80282860 · Carta 5341_*_*_0157';
const ISYBANK_BASELINE_VERSION = 'cortex_isybank_baseline_v2';

const ISYBANK_INITIAL_CATEGORIES = [
    'Trasporti FAL',
    'Ristoranti e bar',
    'Supermercato',
    'Carburanti',
    'BANCOMAT Pay',
    'Shopping & Online',
    'Rate (PayPal/Klarna)',
    'Palestra & Salute',
    'Casa & Istruzione',
    'Bonifici in uscita',
    'Versamenti ATM',
    'Bonifici ricevuti',
    'Accrediti & Rimborsi'
];

// Le 50 operazioni reali estratte da operazioni.pdf (13.10.2026 -> 11.11.2026)
const ISYBANK_BASELINE_MOVEMENTS = [
    { id: 'isy_01', date: '2026-11-11', type: 'out', subType: 'pagamento', accounted: false, amount: 34.99, cat: 'Shopping & Online', rawCat: 'Altre uscite', desc: 'Amazon.it' },
    { id: 'isy_02', date: '2026-11-10', type: 'out', subType: 'pagamento', accounted: false, amount: 14.30, cat: 'Rate (PayPal/Klarna)', rawCat: 'Altre uscite', desc: 'Paypal *paga In 3 Rate' },
    { id: 'isy_03', date: '2026-11-10', type: 'out', subType: 'bancomat_pay', accounted: true, amount: 10.00, cat: 'BANCOMAT Pay', rawCat: 'Addebiti vari', desc: 'Trasferimento Denaro BANCOMAT Pay' },
    { id: 'isy_04', date: '2026-11-09', type: 'out', subType: 'pagamento', accounted: true, amount: 3.00, cat: 'Ristoranti e bar', rawCat: 'Ristoranti e bar', desc: "Piper Cafe' S.r.l. Via Cami" },
    { id: 'isy_05', date: '2026-11-09', type: 'out', subType: 'bancomat_pay', accounted: true, amount: 5.80, cat: 'BANCOMAT Pay', rawCat: 'Altre uscite', desc: 'Pagamento BANCOMAT Pay' },
    { id: 'isy_06', date: '2026-11-08', type: 'out', subType: 'pagamento', accounted: true, amount: 15.11, cat: 'Carburanti', rawCat: 'Carburanti', desc: 'Stazione Ip Scotto Di Sa' },
    { id: 'isy_07', date: '2026-11-08', type: 'out', subType: 'pagamento', accounted: true, amount: 22.50, cat: 'Ristoranti e bar', rawCat: 'Ristoranti e bar', desc: 'Fandango Potenza Via Dei Mo' },
    { id: 'isy_08', date: '2026-11-07', type: 'in', subType: 'versamento', accounted: true, amount: 230.00, cat: 'Versamenti ATM', rawCat: 'Entrate varie', desc: 'Versamento Contanti Su Sportello Automatico' },
    { id: 'isy_09', date: '2026-11-06', type: 'out', subType: 'pagamento', accounted: true, amount: 11.42, cat: 'Rate (PayPal/Klarna)', rawCat: 'Tempo libero varie', desc: 'Klarna* gaglianogioie Paris' },
    { id: 'isy_10', date: '2026-11-06', type: 'in', subType: 'accredito', accounted: true, amount: 10.64, cat: 'Accrediti & Rimborsi', rawCat: 'Entrate', desc: 'Accredito da KLAR*DMartinelli' },
    { id: 'isy_11', date: '2026-11-06', type: 'out', subType: 'pagamento', accounted: true, amount: 3.10, cat: 'Trasporti FAL', rawCat: 'Treno, aereo, nave', desc: 'Ferrovie Appulo Lucane Avigliano' },
    { id: 'isy_12', date: '2026-11-06', type: 'out', subType: 'pagamento', accounted: true, amount: 1.00, cat: 'Shopping & Online', rawCat: 'Abbigliamento e accessori', desc: 'Grande China Srl Via Del Ba' },
    { id: 'isy_13', date: '2026-11-06', type: 'in', subType: 'bonifico', accounted: true, amount: 20.00, cat: 'Bonifici ricevuti', rawCat: 'Bonifici ricevuti', desc: 'Bonifico disposto da Mangopay' },
    { id: 'isy_14', date: '2026-11-05', type: 'out', subType: 'pagamento', accounted: true, amount: 3.10, cat: 'Trasporti FAL', rawCat: 'Treno, aereo, nave', desc: 'Ferrovie Appulo Lucane Avigliano' },
    { id: 'isy_15', date: '2026-11-04', type: 'out', subType: 'pagamento', accounted: true, amount: 1.55, cat: 'Trasporti FAL', rawCat: 'Treno, aereo, nave', desc: 'Ferrovie Appulo Lucane Avigliano' },
    { id: 'isy_16', date: '2026-11-04', type: 'out', subType: 'pagamento', accounted: true, amount: 7.00, cat: 'Ristoranti e bar', rawCat: 'Ristoranti e bar', desc: 'Bar 110 E Lode Bibl Via San' },
    { id: 'isy_17', date: '2026-11-04', type: 'out', subType: 'pagamento', accounted: true, amount: 5.80, cat: 'Ristoranti e bar', rawCat: 'Ristoranti e bar', desc: 'Fda Coffee Break Via Giovan' },
    { id: 'isy_18', date: '2026-11-03', type: 'out', subType: 'pagamento', accounted: true, amount: 2.99, cat: 'Supermercato', rawCat: 'Generi alimentari e supermercato', desc: 'D245 Potenza Potenza' },
    { id: 'isy_19', date: '2026-11-03', type: 'in', subType: 'bonifico', accounted: true, amount: 8.00, cat: 'Bonifici ricevuti', rawCat: 'Bonifici ricevuti', desc: 'Bonifico disposto da Mangopay' },
    { id: 'isy_20', date: '2026-11-02', type: 'out', subType: 'bancomat_pay', accounted: true, amount: 5.80, cat: 'BANCOMAT Pay', rawCat: 'Altre uscite', desc: 'Pagamento BANCOMAT Pay' },
    { id: 'isy_21', date: '2026-11-02', type: 'out', subType: 'bonifico_out', accounted: true, amount: 3.50, cat: 'Bonifici in uscita', rawCat: 'Bonifici in uscita', desc: 'Bonifico disposto a favore di Ivan Santangelo' },
    { id: 'isy_22', date: '2026-10-30', type: 'out', subType: 'pagamento', accounted: true, amount: 3.10, cat: 'Trasporti FAL', rawCat: 'Treno, aereo, nave', desc: 'Ferrovie Appulo Lucane Avigliano' },
    { id: 'isy_23', date: '2026-10-30', type: 'out', subType: 'pagamento', accounted: true, amount: 26.60, cat: 'Palestra & Salute', rawCat: 'Farmacia', desc: 'Farmacia Cornacchione Corso' },
    { id: 'isy_24', date: '2026-10-29', type: 'out', subType: 'pagamento', accounted: true, amount: 3.10, cat: 'Trasporti FAL', rawCat: 'Treno, aereo, nave', desc: 'Ferrovie Appulo Lucane Avigliano' },
    { id: 'isy_25', date: '2026-10-28', type: 'out', subType: 'pagamento', accounted: true, amount: 5.80, cat: 'Casa & Istruzione', rawCat: 'Istruzione', desc: 'Non Solo Scuola Avigliano' },
    { id: 'isy_26', date: '2026-10-28', type: 'in', subType: 'bonifico', accounted: true, amount: 26.00, cat: 'Bonifici ricevuti', rawCat: 'Bonifici ricevuti', desc: 'Bonifico disposto da Mangopay' },
    { id: 'isy_27', date: '2026-10-27', type: 'out', subType: 'pagamento', accounted: true, amount: 5.00, cat: 'Casa & Istruzione', rawCat: 'Manutenzione casa', desc: 'Di.a. Srl Cassano Delle' },
    { id: 'isy_28', date: '2026-10-27', type: 'out', subType: 'pagamento', accounted: true, amount: 3.10, cat: 'Trasporti FAL', rawCat: 'Treno, aereo, nave', desc: 'Ferrovie Appulo Lucane Avigliano' },
    { id: 'isy_29', date: '2026-10-26', type: 'out', subType: 'pagamento', accounted: true, amount: 3.10, cat: 'Trasporti FAL', rawCat: 'Treno, aereo, nave', desc: 'Ferrovie Appulo Lucane Avigliano' },
    { id: 'isy_30', date: '2026-10-25', type: 'out', subType: 'pagamento', accounted: true, amount: 3.50, cat: 'Ristoranti e bar', rawCat: 'Ristoranti e bar', desc: 'SumUp *Il Glera di Va Avigliano' },
    { id: 'isy_31', date: '2026-10-25', type: 'in', subType: 'versamento', accounted: true, amount: 20.00, cat: 'Versamenti ATM', rawCat: 'Entrate varie', desc: 'Versamento Contanti Su Sportello Automatico' },
    { id: 'isy_32', date: '2026-10-23', type: 'out', subType: 'pagamento', accounted: true, amount: 1.55, cat: 'Trasporti FAL', rawCat: 'Treno, aereo, nave', desc: 'Ferrovie Appulo Lucane Avigliano' },
    { id: 'isy_33', date: '2026-10-22', type: 'out', subType: 'pagamento', accounted: true, amount: 1.55, cat: 'Trasporti FAL', rawCat: 'Treno, aereo, nave', desc: 'Ferrovie Appulo Lucane Bari' },
    { id: 'isy_34', date: '2026-10-22', type: 'out', subType: 'pagamento', accounted: true, amount: 9.31, cat: 'Rate (PayPal/Klarna)', rawCat: 'Tempo libero varie', desc: 'Paypal *paga In 3 Rate 0689386461' },
    { id: 'isy_35', date: '2026-10-20', type: 'out', subType: 'pagamento', accounted: true, amount: 1.55, cat: 'Trasporti FAL', rawCat: 'Treno, aereo, nave', desc: 'Ferrovie Appulo Lucane Avigliano' },
    { id: 'isy_36', date: '2026-10-20', type: 'out', subType: 'pagamento', accounted: true, amount: 6.80, cat: 'Ristoranti e bar', rawCat: 'Ristoranti e bar', desc: 'Fda Coffee Break Poggiomarino' },
    { id: 'isy_37', date: '2026-10-20', type: 'out', subType: 'pagamento', accounted: true, amount: 0.90, cat: 'Ristoranti e bar', rawCat: 'Ristoranti e bar', desc: 'Fda Coffee Break Via Giovan' },
    { id: 'isy_38', date: '2026-10-20', type: 'out', subType: 'pagamento', accounted: true, amount: 23.74, cat: 'Supermercato', rawCat: 'Generi alimentari e supermercato', desc: 'Pickup Avigliano Fort.. Via' },
    { id: 'isy_39', date: '2026-10-20', type: 'in', subType: 'bonifico', accounted: true, amount: 5.00, cat: 'Bonifici ricevuti', rawCat: 'Bonifici ricevuti', desc: 'Bonifico disposto da Mangopay' },
    { id: 'isy_40', date: '2026-10-19', type: 'out', subType: 'pagamento', accounted: true, amount: 3.10, cat: 'Trasporti FAL', rawCat: 'Treno, aereo, nave', desc: 'Ferrovie Appulo Lucane Avigliano' },
    { id: 'isy_41', date: '2026-10-18', type: 'out', subType: 'bancomat_pay', accounted: true, amount: 7.50, cat: 'BANCOMAT Pay', rawCat: 'Addebiti vari', desc: 'Trasferimento Denaro BANCOMAT Pay' },
    { id: 'isy_42', date: '2026-10-18', type: 'in', subType: 'versamento', accounted: true, amount: 20.00, cat: 'Versamenti ATM', rawCat: 'Entrate varie', desc: 'Versamento Contanti Su Sportello Automatico' },
    { id: 'isy_43', date: '2026-10-17', type: 'out', subType: 'pagamento', accounted: true, amount: 6.95, cat: 'Shopping & Online', rawCat: 'Tempo libero varie', desc: 'AMZN Mktp IT*B83VC8RE4 LUXEMBOURG' },
    { id: 'isy_44', date: '2026-10-16', type: 'out', subType: 'pagamento', accounted: true, amount: 50.00, cat: 'Palestra & Salute', rawCat: 'Tempo libero varie', desc: 'Vrfitness Srl Via Degli Ole' },
    { id: 'isy_45', date: '2026-10-15', type: 'out', subType: 'pagamento', accounted: true, amount: 1.55, cat: 'Trasporti FAL', rawCat: 'Treno, aereo, nave', desc: 'Ferrovie Appulo Lucane Avigliano' },
    { id: 'isy_46', date: '2026-10-15', type: 'out', subType: 'pagamento', accounted: true, amount: 5.50, cat: 'Casa & Istruzione', rawCat: 'Casa varie', desc: 'Zou Shouyi Cont 6 Aviglian' },
    { id: 'isy_47', date: '2026-10-15', type: 'in', subType: 'bonifico', accounted: true, amount: 70.00, cat: 'Bonifici ricevuti', rawCat: 'Rimborsi spese e storni', desc: 'Bonifico disposto da MARTINELLI DOMENICANTONIO' },
    { id: 'isy_48', date: '2026-10-14', type: 'out', subType: 'pagamento', accounted: true, amount: 1.55, cat: 'Trasporti FAL', rawCat: 'Treno, aereo, nave', desc: 'Ferrovie Appulo Lucane Avigliano' },
    { id: 'isy_49', date: '2026-10-14', type: 'out', subType: 'bancomat_pay', accounted: true, amount: 5.80, cat: 'BANCOMAT Pay', rawCat: 'Altre uscite', desc: 'Pagamento BANCOMAT Pay' },
    { id: 'isy_50', date: '2026-10-13', type: 'in', subType: 'versamento', accounted: true, amount: 35.00, cat: 'Versamenti ATM', rawCat: 'Entrate varie', desc: 'Versamento Contanti Su Sportello Automatico' }
];

let moneyTxFilterMode = 'all'; // 'all' | 'out' | 'versamenti' | 'accrediti' | 'pending'
let moneyTxFilterCat = 'ALL';
let moneyTxSearchQuery = '';
let moneyQuickAddKind = 'pagamento'; // 'pagamento' | 'versamento' | 'accredito' | 'bonifico'

// Classifica automaticamente qualsiasi transazione (anche passata o importata da Gmail) nella sottocategoria Isybank
function normalizeIsybankTxRecord(tx) {
    if (!tx) return tx;
    const descLow = (tx.desc || tx.title || '').toLowerCase();
    const catStr = tx.cat || tx.category || '';

    if (tx.accounted === undefined) tx.accounted = true;
    if (!tx.desc && tx.title) tx.desc = tx.title;

    if (!tx.subType) {
        if (tx.type === 'in') {
            if (descLow.includes('versamento') || descLow.includes('sportello automatico') || catStr === 'Versamenti ATM') {
                tx.subType = 'versamento';
            } else if (descLow.includes('bonifico') || descLow.includes('mangopay') || catStr === 'Bonifici ricevuti') {
                tx.subType = 'bonifico';
            } else {
                tx.subType = 'accredito';
            }
        } else {
            if (descLow.includes('bancomat pay')) {
                tx.subType = 'bancomat_pay';
            } else if (descLow.includes('bonifico')) {
                tx.subType = 'bonifico_out';
            } else {
                tx.subType = 'pagamento';
            }
        }
    }

    if (!tx.cat && tx.category) tx.cat = tx.category;
    if (!tx.cat || tx.cat === 'Income' || tx.cat === 'Generale') {
        if (tx.subType === 'versamento') tx.cat = 'Versamenti ATM';
        else if (tx.subType === 'bonifico') tx.cat = 'Bonifici ricevuti';
        else if (tx.subType === 'accredito') tx.cat = 'Accrediti & Rimborsi';
        else if (descLow.includes('ferrovie appulo lucane')) tx.cat = 'Trasporti FAL';
        else if (descLow.includes('bancomat pay')) tx.cat = 'BANCOMAT Pay';
        else if (descLow.includes('amazon') || descLow.includes('amzn')) tx.cat = 'Shopping & Online';
        else if (descLow.includes('paypal') || descLow.includes('klarna')) tx.cat = 'Rate (PayPal/Klarna)';
        else if (descLow.includes('cafe') || descLow.includes('coffee') || descLow.includes('bar ') || descLow.includes('fandango') || descLow.includes('glera')) tx.cat = 'Ristoranti e bar';
        else tx.cat = tx.type === 'in' ? 'Accrediti & Rimborsi' : 'Shopping & Online';
    }
    tx.category = tx.cat;
    return tx;
}

// Inizializza automaticamente le 50 operazioni di operazioni.pdf come punto di partenza
function ensureIsybankBaselineSeeded(forceReset = false) {
    const alreadySeeded = localStorage.getItem(ISYBANK_BASELINE_VERSION) === 'true';
    if (alreadySeeded && !forceReset && Array.isArray(mTransactions) && mTransactions.length > 0) {
        mTransactions.forEach(normalizeIsybankTxRecord);
        return false;
    }

    mTransactions = JSON.parse(JSON.stringify(ISYBANK_BASELINE_MOVEMENTS)).map(normalizeIsybankTxRecord);

    const catSet = new Set([...ISYBANK_INITIAL_CATEGORIES, ...(mCategories || [])]);
    mCategories = Array.from(catSet);

    // Calcola il saldo netto dei 50 movimenti (+444.64 - 331.61 = +113.03) se mBalance è 0 o in forceReset
    const stats = computeIsybankFlowMetrics();
    if (forceReset || !mBalance || mBalance === 0) {
        mBalance = roundCurrency(stats.netFlow);
    }

    localStorage.setItem(ISYBANK_BASELINE_VERSION, 'true');
    if (typeof isStorageHydrated !== 'undefined' && isStorageHydrated) {
        saveMoneyData();
    }
    return true;
}

function resetToIsybankPdfBaseline() {
    ensureIsybankBaselineSeeded(true);
    renderMoneyDashboard();
    if (typeof showToast === 'function') {
        showToast('[🏦 ISYBANK] Caricate le 50 operazioni di operazioni.pdf (13.10 - 11.11)');
    }
}

function computeIsybankFlowMetrics() {
    let totalIn = 0;
    let versamentiIn = 0;
    let bonificiIn = 0;
    let accreditiIn = 0;
    let totalOut = 0;
    let pendingOut = 0;
    let accountedOut = 0;

    (mTransactions || []).forEach(rawTx => {
        const tx = normalizeIsybankTxRecord(rawTx);
        const amt = roundCurrency(parseFloat(tx.amount) || 0);
        if (tx.type === 'in') {
            totalIn = roundCurrency(totalIn + amt);
            if (tx.subType === 'versamento') versamentiIn = roundCurrency(versamentiIn + amt);
            else if (tx.subType === 'bonifico') bonificiIn = roundCurrency(bonificiIn + amt);
            else accreditiIn = roundCurrency(accreditiIn + amt);
        } else {
            totalOut = roundCurrency(totalOut + amt);
            if (tx.accounted === false) {
                pendingOut = roundCurrency(pendingOut + amt);
            } else {
                accountedOut = roundCurrency(accountedOut + amt);
            }
        }
    });

    const vaultsLocked = (mVaults || []).reduce((acc, v) => acc + (parseFloat(v.current) || 0), 0);
    return {
        totalIn,
        versamentiIn,
        bonificiIn,
        accreditiIn,
        totalOut,
        pendingOut,
        accountedOut,
        netFlow: roundCurrency(totalIn - totalOut),
        vaultsLocked: roundCurrency(vaultsLocked),
        spendable: roundCurrency((mBalance || 0) - vaultsLocked)
    };
}

function formatItDateShort(isoDate) {
    if (!isoDate || typeof isoDate !== 'string') return '';
    const p = isoDate.split('-');
    if (p.length !== 3) return isoDate;
    return `${p[2]}.${p[1]}.${p[0]}`;
}

// ============================================================================
// AZIONI UTENTE: SALDO, NUOVO MOVIMENTO (PAGAMENTO / VERSAMENTO / ACCREDITO), DELETE
// ============================================================================

function promptSetIsybankBalance() {
    const inp = document.getElementById('m-inline-balance-inp');
    if (!inp) return;
    const val = parseFloat(String(inp.value).replace(',', '.'));
    if (isNaN(val)) return;
    mBalance = roundCurrency(val);
    saveMoneyData();
    renderMoneyDashboard();
    if (typeof showToast === 'function') showToast(`[ISYBANK] Saldo aggiornato: €${mBalance.toFixed(2)}`);
}

function addIsybankManualMovement() {
    const amtEl = document.getElementById('m-quick-amt');
    const descEl = document.getElementById('m-quick-desc');
    const catEl = document.getElementById('m-quick-cat');
    const accEl = document.getElementById('m-quick-accounted');

    if (!amtEl) return;
    const rawAmt = parseFloat(String(amtEl.value).replace(',', '.'));
    if (isNaN(rawAmt) || rawAmt <= 0) {
        if (typeof showToast === 'function') showToast('[ERRORE] Inserisci un importo valido (> 0)');
        return;
    }

    const amt = roundCurrency(rawAmt);
    const kind = moneyQuickAddKind || 'pagamento';
    const isIncome = (kind === 'versamento' || kind === 'accredito' || kind === 'bonifico');
    const txType = isIncome ? 'in' : 'out';

    let defaultDesc = 'Pagamento Carta';
    let defaultCat = (catEl && catEl.value) ? catEl.value : 'Shopping & Online';

    if (kind === 'versamento') {
        defaultDesc = 'Versamento Contanti Su Sportello Automatico';
        defaultCat = 'Versamenti ATM';
    } else if (kind === 'accredito') {
        defaultDesc = 'Accredito su carta 5341_*_*_0157';
        defaultCat = 'Accrediti & Rimborsi';
    } else if (kind === 'bonifico') {
        defaultDesc = 'Bonifico disposto da ';
        defaultCat = 'Bonifici ricevuti';
    }

    const desc = (descEl && descEl.value.trim()) ? descEl.value.trim() : defaultDesc;
    const accounted = accEl ? Boolean(accEl.checked) : true;

    const newTx = normalizeIsybankTxRecord({
        id: 'isy_m_' + Date.now(),
        date: typeof selectedDateStr !== 'undefined' ? selectedDateStr : todayStr,
        type: txType,
        subType: kind,
        accounted: accounted,
        amount: amt,
        cat: defaultCat,
        category: defaultCat,
        desc: desc
    });

    mTransactions.unshift(newTx);
    if (!mCategories.includes(defaultCat)) mCategories.push(defaultCat);

    if (txType === 'in') {
        mBalance = roundCurrency(mBalance + amt);
    } else {
        mBalance = roundCurrency(mBalance - amt);
    }

    amtEl.value = '';
    if (descEl) descEl.value = '';

    saveMoneyData();
    renderMoneyDashboard();
    if (typeof showToast === 'function') {
        showToast(`[ISYBANK] ${txType === 'in' ? '+' : '-'}€${amt.toFixed(2)} (${desc})`);
    }
}

function toggleIsybankTxAccounted(txId) {
    const tx = (mTransactions || []).find(t => String(t.id) === String(txId));
    if (!tx) return;
    tx.accounted = !tx.accounted;
    saveMoneyData();
    renderMoneyDashboard();
}

function deleteMoneyTxItem(txId) {
    const idx = (mTransactions || []).findIndex(t => String(t.id) === String(txId));
    if (idx === -1) return;

    const tx = mTransactions[idx];
    const amt = roundCurrency(parseFloat(tx.amount) || 0);
    if (tx.type === 'in') {
        mBalance = roundCurrency(mBalance - amt);
    } else {
        mBalance = roundCurrency(mBalance + amt);
    }

    mTransactions.splice(idx, 1);
    saveMoneyData();
    renderMoneyDashboard();
}

// ============================================================================
// 1. ATOM: MONEY SUMMARY (CONTO ISYBANK, VERSAMENTI ATM, ACCREDITI, BONIFICI)
// ============================================================================

function renderMoneyAtomSummary() {
    const mod = document.getElementById('module-m-summary');
    if (!mod) return;
    const body = mod.querySelector('.module-body-padded') || mod;

    ensureIsybankBaselineSeeded(false);
    const m = computeIsybankFlowMetrics();
    const allCats = [...new Set([...ISYBANK_INITIAL_CATEGORIES, ...(mCategories || [])])];

    body.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:10px; height:100%; overflow-y:auto;">
            <!-- HEADER CONTO ISYBANK -->
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-color); padding-bottom:6px; flex-wrap:wrap; gap:6px;">
                <div>
                    <div class="section-label">ISYBANK // SUMMARY</div>
                    <div style="font-size:0.65rem; color:var(--text-muted); font-family:monospace;">${ISYBANK_ACCOUNT_LABEL}</div>
                </div>
                <div style="display:flex; gap:6px;">
                    <button type="button" class="btn btn-sm" style="border-color:var(--accent-gold); color:var(--accent-gold);" onclick="scanBankEmailsNow(true)">[🏦 SCAN MAIL]</button>
                    <button type="button" class="btn btn-sm" onclick="resetToIsybankPdfBaseline()" title="Ricarica le 50 operazioni del PDF Isybank">[↺ PDF 50]</button>
                </div>
            </div>

            <!-- SALDO DISPONIBILE & NON CONTABILIZZATO -->
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(135px, 1fr)); gap:8px;">
                <div class="cfg-box" style="padding:8px 10px; border-color:var(--border-bright);">
                    <div style="font-size:0.62rem; color:var(--text-dim); text-transform:uppercase;">Saldo Conto (€)</div>
                    <div style="display:flex; align-items:center; gap:6px; margin-top:4px;">
                        <input type="number" step="0.01" id="m-inline-balance-inp" class="form-control form-control-sm" style="font-size:0.95rem; font-weight:bold; color:var(--accent-green); width:95px; padding:2px 6px;" value="${(mBalance || 0).toFixed(2)}">
                        <button type="button" class="btn btn-sm" onclick="promptSetIsybankBalance()">[SET]</button>
                    </div>
                </div>
                <div class="cfg-box" style="padding:8px 10px;">
                    <div style="font-size:0.62rem; color:var(--text-dim); text-transform:uppercase;">Entrate (50 Mov)</div>
                    <div style="font-size:1rem; font-weight:bold; color:var(--accent-green); font-family:monospace; margin-top:4px;">+€${m.totalIn.toFixed(2)}</div>
                </div>
                <div class="cfg-box" style="padding:8px 10px;">
                    <div style="font-size:0.62rem; color:var(--text-dim); text-transform:uppercase;">Uscite Totali</div>
                    <div style="font-size:1rem; font-weight:bold; color:var(--accent-red); font-family:monospace; margin-top:4px;">-€${m.totalOut.toFixed(2)}</div>
                    <div style="font-size:0.6rem; color:var(--accent-gold);">Non Contab.: €${m.pendingOut.toFixed(2)}</div>
                </div>
            </div>

            <!-- SPACCATO ENTRATE ISYBANK: VERSAMENTI ATM vs BONIFICI vs ACCREDITI CARTA -->
            <div class="cfg-box" style="padding:8px 10px; display:flex; flex-direction:column; gap:6px;">
                <div style="font-size:0.65rem; color:var(--text-main); font-weight:bold; text-transform:uppercase;">Spaccato Entrate (Versamenti &amp; Accrediti)</div>
                <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:6px; text-align:center;">
                    <div style="border:1px solid var(--border-color); padding:6px 4px; background:#050505;">
                        <div style="font-size:0.58rem; color:var(--text-dim);">VERSAMENTI ATM</div>
                        <div style="font-size:0.82rem; font-weight:bold; color:var(--accent-green); font-family:monospace;">+€${m.versamentiIn.toFixed(2)}</div>
                    </div>
                    <div style="border:1px solid var(--border-color); padding:6px 4px; background:#050505;">
                        <div style="font-size:0.58rem; color:var(--text-dim);">BONIFICI / VINTED</div>
                        <div style="font-size:0.82rem; font-weight:bold; color:var(--accent-green); font-family:monospace;">+€${m.bonificiIn.toFixed(2)}</div>
                    </div>
                    <div style="border:1px solid var(--border-color); padding:6px 4px; background:#050505;">
                        <div style="font-size:0.58rem; color:var(--text-dim);">ACCREDITI CARTA</div>
                        <div style="font-size:0.82rem; font-weight:bold; color:var(--accent-green); font-family:monospace;">+€${m.accreditiIn.toFixed(2)}</div>
                    </div>
                </div>
            </div>

            <!-- INSERIMENTO RAPIDO OPERAZIONE ISYBANK -->
            <div class="cfg-box" style="padding:8px 10px; display:flex; flex-direction:column; gap:8px;">
                <div style="display:flex; gap:4px; flex-wrap:wrap;">
                    <button type="button" class="btn btn-sm ${moneyQuickAddKind === 'pagamento' ? 'btn-primary' : ''}" style="flex:1;" onclick="moneyQuickAddKind='pagamento'; renderMoneyAtomSummary();">[- PAGAMENTO]</button>
                    <button type="button" class="btn btn-sm ${moneyQuickAddKind === 'versamento' ? 'btn-primary' : ''}" style="flex:1;" onclick="moneyQuickAddKind='versamento'; renderMoneyAtomSummary();">[+ VERSAMENTO]</button>
                    <button type="button" class="btn btn-sm ${moneyQuickAddKind === 'accredito' ? 'btn-primary' : ''}" style="flex:1;" onclick="moneyQuickAddKind='accredito'; renderMoneyAtomSummary();">[+ ACCREDITO]</button>
                    <button type="button" class="btn btn-sm ${moneyQuickAddKind === 'bonifico' ? 'btn-primary' : ''}" style="flex:1;" onclick="moneyQuickAddKind='bonifico'; renderMoneyAtomSummary();">[+ BONIFICO]</button>
                </div>

                <div style="display:flex; gap:6px; flex-wrap:wrap;">
                    <input type="number" step="0.01" id="m-quick-amt" class="form-control form-control-sm" style="width:85px;" placeholder="€ 0.00">
                    <input type="text" id="m-quick-desc" class="form-control form-control-sm" style="flex:1; min-width:130px;" placeholder="${moneyQuickAddKind === 'versamento' ? 'Versamento Contanti ATM' : (moneyQuickAddKind === 'accredito' ? 'Accredito da KLAR*...' : (moneyQuickAddKind === 'bonifico' ? 'Bonifico disposto da...' : 'Esercente (es. Amazon.it, FAL...)'))}">
                </div>

                <div style="display:flex; justify-content:space-between; align-items:center; gap:6px; flex-wrap:wrap;">
                    <select id="m-quick-cat" class="form-control form-control-sm" style="flex:1; min-width:130px;">
                        ${allCats.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('')}
                    </select>
                    <label style="font-size:0.65rem; color:var(--text-dim); display:flex; align-items:center; gap:4px; cursor:pointer;">
                        <input type="checkbox" id="m-quick-accounted" checked> Contabilizzato (SI)
                    </label>
                    <button type="button" class="btn btn-primary btn-sm" onclick="addIsybankManualMovement()">[+ REGISTRA]</button>
                </div>
            </div>
        </div>
    `;
}

// ============================================================================
// 2. ATOM: LISTA MOVIMENTI ISYBANK (CON FILTRI VERSAMENTI / ACCREDITI / CONTAB.)
// ============================================================================

function renderMoneyAtomTransactions() {
    const mod = document.getElementById('module-m-tx');
    if (!mod) return;
    const body = mod.querySelector('.module-body-padded') || mod;

    ensureIsybankBaselineSeeded(false);

    const allCats = ['ALL', ...new Set([...ISYBANK_INITIAL_CATEGORIES, ...(mCategories || []), ...(mTransactions || []).map(t => t.cat || t.category || 'Altro')])];

    const filtered = (mTransactions || []).filter(rawTx => {
        if (!rawTx) return false;
        const tx = normalizeIsybankTxRecord(rawTx);
        const tCat = tx.cat || tx.category || '';
        const tDesc = (tx.desc || '').toLowerCase();

        if (moneyTxFilterMode === 'out' && tx.type !== 'out') return false;
        if (moneyTxFilterMode === 'versamenti' && tx.subType !== 'versamento') return false;
        if (moneyTxFilterMode === 'accrediti' && !(tx.type === 'in' && (tx.subType === 'accredito' || tx.subType === 'bonifico'))) return false;
        if (moneyTxFilterMode === 'pending' && tx.accounted !== false) return false;

        if (moneyTxFilterCat !== 'ALL' && tCat !== moneyTxFilterCat) return false;
        if (moneyTxSearchQuery) {
            const q = moneyTxSearchQuery.toLowerCase();
            if (!tDesc.includes(q) && !tCat.toLowerCase().includes(q) && !(tx.date || '').includes(q)) {
                return false;
            }
        }
        return true;
    });

    const rowsHtml = filtered.length === 0
        ? `<div class="empty-msg" style="padding:24px 0; text-align:center;">[ NESSUN MOVIMENTO TROVATO ]</div>`
        : filtered.map(tx => {
            const isIn = tx.type === 'in';
            const amt = roundCurrency(parseFloat(tx.amount) || 0).toFixed(2);
            const cat = escapeHtml(tx.cat || tx.category || '');
            const desc = escapeHtml(tx.desc || 'Operazione');
            const dateIt = escapeHtml(formatItDateShort(tx.date || todayStr));
            const sign = isIn ? '+' : '-';
            const col = isIn ? 'var(--accent-green)' : 'var(--accent-red)';

            let badgeType = '';
            if (tx.subType === 'versamento') {
                badgeType = `<span style="font-size:0.58rem; padding:1px 5px; background:#0d2615; border:1px solid var(--accent-green); color:var(--accent-green);">VERSAMENTO ATM</span>`;
            } else if (tx.subType === 'accredito') {
                badgeType = `<span style="font-size:0.58rem; padding:1px 5px; background:#0d2226; border:1px solid var(--accent-green); color:var(--accent-green);">ACCREDITO CARTA</span>`;
            } else if (tx.subType === 'bonifico') {
                badgeType = `<span style="font-size:0.58rem; padding:1px 5px; background:#142414; border:1px solid var(--accent-green); color:var(--accent-green);">BONIFICO IN</span>`;
            }

            const contabBadge = tx.accounted === false
                ? `<button type="button" class="btn btn-sm" style="font-size:0.55rem; padding:0px 4px; border-color:var(--accent-gold); color:var(--accent-gold);" onclick="toggleIsybankTxAccounted('${tx.id}')" title="Clicca per segnare Contabilizzato: SI">CONTAB: NO</button>`
                : `<span style="font-size:0.56rem; color:var(--text-muted); cursor:pointer;" onclick="toggleIsybankTxAccounted('${tx.id}')" title="Contabilizzato SI">SI</span>`;

            return `
                <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; padding:7px 8px; border-bottom:1px dotted var(--border-color); background:#060606;">
                    <div style="display:flex; flex-direction:column; gap:3px; min-width:0; flex:1;">
                        <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                            <span style="font-size:0.65rem; color:var(--text-muted); font-family:monospace;">${dateIt}</span>
                            ${contabBadge}
                            ${badgeType}
                            <span style="font-size:0.6rem; padding:1px 5px; border:1px solid var(--border-color); color:var(--text-dim);">${cat}</span>
                        </div>
                        <div style="font-size:var(--font-xs); color:var(--text-main); font-weight:bold; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${desc}</div>
                    </div>
                    <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
                        <span style="font-size:var(--font-sm); font-weight:bold; color:${col}; font-family:monospace;">${sign}€${amt}</span>
                        <button type="button" class="icon-btn delete" style="font-size:0.7rem; padding:2px 5px;" onclick="deleteMoneyTxItem('${tx.id}')" title="Elimina movimento">[x]</button>
                    </div>
                </div>
            `;
        }).join('');

    body.innerHTML = `
        <div style="display:flex; flex-direction:column; height:100%; min-height:0; gap:8px;">
            <div class="section-header-row" style="margin-bottom:0; flex-shrink:0;">
                <div>
                    <span class="section-label">Lista Movimenti Isybank</span>
                    <span style="font-size:var(--font-xs); color:var(--text-dim); margin-left:6px;">// ${filtered.length} DI ${(mTransactions || []).length}</span>
                </div>
                <button type="button" class="btn btn-sm" style="border-color:var(--accent-gold); color:var(--accent-gold);" onclick="scanBankEmailsNow(true)">[🏦 SCAN ISYBANK]</button>
            </div>

            <!-- PILLOLE FILTRO RAPIDO PER VERSAMENTI, ACCREDITI, USCITE E NON CONTABILIZZATI -->
            <div style="display:flex; gap:4px; flex-wrap:wrap; flex-shrink:0;">
                <button type="button" class="btn btn-sm ${moneyTxFilterMode === 'all' ? 'btn-primary' : ''}" onclick="moneyTxFilterMode='all'; renderMoneyAtomTransactions();">TUTTI</button>
                <button type="button" class="btn btn-sm ${moneyTxFilterMode === 'versamenti' ? 'btn-primary' : ''}" onclick="moneyTxFilterMode='versamenti'; renderMoneyAtomTransactions();">VERSAMENTI ATM</button>
                <button type="button" class="btn btn-sm ${moneyTxFilterMode === 'accrediti' ? 'btn-primary' : ''}" onclick="moneyTxFilterMode='accrediti'; renderMoneyAtomTransactions();">ACCREDITI &amp; BONIFICI</button>
                <button type="button" class="btn btn-sm ${moneyTxFilterMode === 'out' ? 'btn-primary' : ''}" onclick="moneyTxFilterMode='out'; renderMoneyAtomTransactions();">USCITE</button>
                <button type="button" class="btn btn-sm ${moneyTxFilterMode === 'pending' ? 'btn-primary' : ''}" onclick="moneyTxFilterMode='pending'; renderMoneyAtomTransactions();">NON CONTAB.</button>
            </div>

            <div style="display:flex; gap:6px; flex-wrap:wrap; flex-shrink:0;">
                <input type="text" class="form-control form-control-sm" style="flex:1; min-width:120px;" placeholder="Cerca esercente (es. FAL, Mangopay, Amazon...)" value="${escapeHtml(moneyTxSearchQuery)}" oninput="moneyTxSearchQuery=this.value; renderMoneyAtomTransactions();">
                <select class="form-control form-control-sm" style="width:auto; max-width:155px;" onchange="moneyTxFilterCat=this.value; renderMoneyAtomTransactions();">
                    ${allCats.map(c => `<option value="${escapeHtml(c)}" ${c === moneyTxFilterCat ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
                </select>
            </div>

            <div id="m-tx-list-mount" style="flex:1 1 0%; min-height:0; overflow-y:auto; border:1px solid var(--border-color); display:flex; flex-direction:column;">
                ${rowsHtml}
            </div>
        </div>
    `;
}

// ============================================================================
// 3. ATOM: CASHFLOW CHART & ANALYTICS PER CATEGORIA ISYBANK
// ============================================================================

function renderMoneyAtomChart() {
    const mod = document.getElementById('module-m-chart');
    if (!mod) return;
    const body = mod.querySelector('.module-body-padded') || mod;

    ensureIsybankBaselineSeeded(false);

    // Raggruppa per data e traccia l'andamento cumulativo
    const sorted = [...(mTransactions || [])].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const byDate = {};
    sorted.forEach(tx => {
        const d = tx.date || todayStr;
        if (!byDate[d]) byDate[d] = { in: 0, out: 0 };
        const amt = parseFloat(tx.amount) || 0;
        if (tx.type === 'in') byDate[d].in += amt;
        else byDate[d].out += amt;
    });

    const dates = Object.keys(byDate).sort();
    let running = 0;
    const points = dates.map(d => {
        running = roundCurrency(running + byDate[d].in - byDate[d].out);
        return { date: d, val: running, in: byDate[d].in, out: byDate[d].out };
    });

    const w = 520;
    const h = 170;
    const pad = 24;
    const vals = points.map(p => p.val);
    const minV = Math.min(0, ...vals);
    const maxV = Math.max(10, ...vals);
    const span = (maxV - minV) || 1;

    const polyPts = points.map((p, i) => {
        const x = pad + (points.length > 1 ? (i / (points.length - 1)) * (w - pad * 2) : (w / 2));
        const y = h - pad - ((p.val - minV) / span) * (h - pad * 2);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');

    body.innerHTML = `
        <div style="display:flex; flex-direction:column; height:100%; gap:8px;">
            <div class="section-header-row" style="margin-bottom:0;">
                <span class="section-label">Isybank Cashflow Trend</span>
                <span style="font-size:var(--font-xs); color:var(--accent-green); font-family:monospace;">NET: +€${running.toFixed(2)}</span>
            </div>
            <div style="flex:1; min-height:150px; border:1px solid var(--border-color); background:#050505; display:flex; align-items:center; justify-content:center; padding:6px;">
                <svg viewBox="0 0 ${w} ${h}" style="width:100%; height:100%; max-height:210px;">
                    <line x1="${pad}" y1="${h - pad}" x2="${w - pad}" y2="${h - pad}" stroke="#222" stroke-width="1"/>
                    ${points.length > 1 ? `<polyline fill="none" stroke="var(--accent-green)" stroke-width="2" points="${polyPts}"/>` : ''}
                    ${points.map((p, i) => {
                        const x = pad + (points.length > 1 ? (i / (points.length - 1)) * (w - pad * 2) : (w / 2));
                        const y = h - pad - ((p.val - minV) / span) * (h - pad * 2);
                        return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="#fff"><title>${formatItDateShort(p.date)}: €${p.val.toFixed(2)} (+€${p.in.toFixed(2)} / -€${p.out.toFixed(2)})</title></circle>`;
                    }).join('')}
                </svg>
            </div>
        </div>
    `;
}

function renderMoneyAtomCats() {
    const mod = document.getElementById('module-m-cats');
    if (!mod) return;
    const body = mod.querySelector('.module-body-padded') || mod;

    ensureIsybankBaselineSeeded(false);

    const catTotals = {};
    let totalSpent = 0;
    (mTransactions || []).forEach(tx => {
        if (tx.type !== 'out') return;
        const c = tx.cat || tx.category || 'Altro';
        const amt = parseFloat(tx.amount) || 0;
        catTotals[c] = roundCurrency((catTotals[c] || 0) + amt);
        totalSpent = roundCurrency(totalSpent + amt);
    });

    const sortedCats = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);

    body.innerHTML = `
        <div style="display:flex; flex-direction:column; height:100%; gap:8px; overflow-y:auto;">
            <div class="section-header-row" style="margin-bottom:0;">
                <span class="section-label">Spese per Categoria Isybank</span>
                <span style="font-size:var(--font-xs); color:var(--accent-red); font-family:monospace;">-€${totalSpent.toFixed(2)}</span>
            </div>
            <div style="display:flex; flex-direction:column; gap:6px;">
                ${sortedCats.map(([cName, val]) => {
                    const pct = totalSpent > 0 ? Math.round((val / totalSpent) * 100) : 0;
                    return `
                        <div class="cfg-box" style="padding:6px 8px;">
                            <div style="display:flex; justify-content:space-between; font-size:var(--font-xs); margin-bottom:4px;">
                                <span style="font-weight:bold;">${escapeHtml(cName)}</span>
                                <span style="font-family:monospace; color:var(--text-dim);">€${val.toFixed(2)} (${pct}%)</span>
                            </div>
                            <div style="width:100%; height:5px; background:#151515;">
                                <div style="width:${pct}%; height:100%; background:var(--text-main);"></div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}

// ============================================================================
// 4. ATOMS: VAULTS, RECURRING BILLS & WISHLIST INCUBATOR
// ============================================================================

function renderMoneyAtomVaults() {
    const mod = document.getElementById('module-m-vaults');
    if (!mod) return;
    const body = mod.querySelector('.module-body-padded') || mod;

    const listHtml = (mVaults || []).length === 0
        ? `<div class="empty-msg">[ NO CAPITAL VAULTS ]</div>`
        : (mVaults || []).map((v, idx) => {
            const cur = roundCurrency(parseFloat(v.current) || 0);
            const tgt = roundCurrency(parseFloat(v.target) || 1);
            const pct = Math.min(100, Math.round((cur / tgt) * 100));
            return `
                <div class="cfg-box" style="padding:8px; display:flex; flex-direction:column; gap:4px;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-size:var(--font-xs); font-weight:bold;">${escapeHtml(v.name || 'Vault')}</span>
                        <span style="font-size:var(--font-xs); font-family:monospace;">€${cur.toFixed(2)} / €${tgt.toFixed(2)}</span>
                    </div>
                    <div style="width:100%; height:5px; background:#151515;">
                        <div style="width:${pct}%; height:100%; background:var(--accent-gold);"></div>
                    </div>
                </div>
            `;
        }).join('');

    body.innerHTML = `
        <div style="display:flex; flex-direction:column; height:100%; gap:8px; overflow-y:auto;">
            <div class="section-header-row" style="margin-bottom:0;">
                <span class="section-label">Capital Vaults</span>
            </div>
            ${listHtml}
        </div>
    `;
}

function renderMoneyAtomBills() {
    const mod = document.getElementById('module-m-bills');
    if (!mod) return;
    const body = mod.querySelector('.module-body-padded') || mod;

    const listHtml = (mRecurring || []).length === 0
        ? `<div class="empty-msg">[ NO RECURRING BILLS ]</div>`
        : (mRecurring || []).map(r => `
            <div class="cfg-box" style="padding:7px 8px; display:flex; justify-content:space-between; align-items:center;">
                <span style="font-size:var(--font-xs); font-weight:bold;">${escapeHtml(r.name || r.desc || 'Bill')}</span>
                <span style="font-size:var(--font-xs); font-family:monospace; color:var(--accent-red);">-€${roundCurrency(parseFloat(r.amount) || 0).toFixed(2)}/mo</span>
            </div>
        `).join('');

    body.innerHTML = `
        <div style="display:flex; flex-direction:column; height:100%; gap:8px; overflow-y:auto;">
            <div class="section-header-row" style="margin-bottom:0;">
                <span class="section-label">Recurring Fixed Bills</span>
            </div>
            ${listHtml}
        </div>
    `;
}

function renderMoneyAtomWish() {
    const mod = document.getElementById('module-m-wish');
    if (!mod) return;
    const body = mod.querySelector('.module-body-padded') || mod;

    const listHtml = (mWishlist || []).length === 0
        ? `<div class="empty-msg">[ INCUBATOR EMPTY ]</div>`
        : (mWishlist || []).map(w => `
            <div class="cfg-box" style="padding:7px 8px; display:flex; justify-content:space-between; align-items:center;">
                <span style="font-size:var(--font-xs); font-weight:bold;">${escapeHtml(w.name || w.title || 'Item')}</span>
                <span style="font-size:var(--font-xs); font-family:monospace; color:var(--accent-gold);">€${roundCurrency(parseFloat(w.price || w.amount) || 0).toFixed(2)}</span>
            </div>
        `).join('');

    body.innerHTML = `
        <div style="display:flex; flex-direction:column; height:100%; gap:8px; overflow-y:auto;">
            <div class="section-header-row" style="margin-bottom:0;">
                <span class="section-label">Purchase Incubator</span>
            </div>
            ${listHtml}
        </div>
    `;
}

function renderMoneyDashboard() {
    ensureIsybankBaselineSeeded(false);
    renderMoneyAtomSummary();
    renderMoneyAtomTransactions();
    renderMoneyAtomChart();
    renderMoneyAtomCats();
    renderMoneyAtomVaults();
    renderMoneyAtomBills();
    renderMoneyAtomWish();
}

window.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        ensureIsybankBaselineSeeded(false);
        renderMoneyDashboard();
    }, 350);
});