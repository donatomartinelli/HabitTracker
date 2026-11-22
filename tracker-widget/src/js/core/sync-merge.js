// --- js/core/sync-merge.js ---
// MOTORE DI UNIONE A TRE VIE (base / locale / remoto)
//
// Idea: ricordiamo com'erano i dati all'ultima sincronizzazione riuscita ("base").
// Confrontando base, locale e remoto capiamo CHI ha cambiato COSA:
//   - cambiato solo da una parte          → si prende quella modifica
//   - aggiunto/cancellato da una parte     → l'aggiunta/cancellazione viene rispettata
//   - cambiato in modo diverso da entrambe → vince la modifica più recente;
//                                            la versione perdente va nell'elenco dei conflitti
//
// Regole per le liste:
//   - liste di oggetti con "id" (task, spese, eventi...) → unione elemento per elemento
//   - altre liste (categorie, log senza id...)           → unione come insieme
//
// Funzioni pure, senza dipendenze: testabili anche fuori dal browser (node).

(function (root) {
    'use strict';

    const MISSING = undefined;

    function isPlainObject(v) {
        return v !== null && typeof v === 'object' && !Array.isArray(v);
    }

    function stableStringify(v) {
        if (v === undefined) return 'undefined';
        if (v === null || typeof v !== 'object') return JSON.stringify(v);
        if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
        const keys = Object.keys(v).sort();
        return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify(v[k])).join(',') + '}';
    }

    function same(a, b) {
        if (a === b) return true;
        if (a === undefined || b === undefined) return false;
        return stableStringify(a) === stableStringify(b);
    }

    function clone(v) {
        return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
    }

    function isIdArray(arr) {
        if (!Array.isArray(arr)) return false;
        const seen = new Set();
        for (const el of arr) {
            if (!isPlainObject(el)) return false;
            if (el.id === undefined || el.id === null || el.id === '') return false;
            const k = String(el.id);
            if (seen.has(k)) return false;
            seen.add(k);
        }
        return true;
    }

    // ctx: { localWins: boolean, conflicts: [] }
    function merge3(base, local, remote, path, ctx) {
        if (same(local, remote)) return clone(local);
        if (same(local, base)) return clone(remote);   // solo il remoto è cambiato
        if (same(remote, base)) return clone(local);   // solo il locale è cambiato

        // Entrambi cambiati in modo diverso
        if (isPlainObject(local) && isPlainObject(remote)) {
            return mergeObjects(isPlainObject(base) ? base : {}, local, remote, path, ctx);
        }
        if (Array.isArray(local) && Array.isArray(remote)) {
            const b = Array.isArray(base) ? base : [];
            if (isIdArray(local) && isIdArray(remote) && (b.length === 0 || isIdArray(b))) {
                return mergeIdArrays(b, local, remote, path, ctx);
            }
            return mergeSetArrays(Array.isArray(base) ? base : null, local, remote);
        }

        // Valori semplici (testi, numeri) o tipi diversi: vince il più recente
        const winner = ctx.localWins ? local : remote;
        const loser = ctx.localWins ? remote : local;
        if (loser !== MISSING) {
            ctx.conflicts.push({ path: path.join('.'), kept: clone(winner), discarded: clone(loser) });
        }
        return clone(winner);
    }

    function mergeObjects(base, local, remote, path, ctx) {
        const out = {};
        const keys = new Set([...Object.keys(local), ...Object.keys(remote), ...Object.keys(base)]);
        for (const k of keys) {
            const b = base[k], l = local[k], r = remote[k];
            const inL = Object.prototype.hasOwnProperty.call(local, k);
            const inR = Object.prototype.hasOwnProperty.call(remote, k);
            const inB = Object.prototype.hasOwnProperty.call(base, k);

            if (!inL && !inR) continue;                       // cancellato da entrambi
            if (inB && !inL && same(r, b)) continue;          // cancellato in locale, remoto invariato
            if (inB && !inR && same(l, b)) continue;          // cancellato in remoto, locale invariato
            if (inB && !inL && inR) {                         // cancellato in locale ma modificato in remoto
                out[k] = clone(r);                            // → si tiene la modifica (nessuna perdita)
                continue;
            }
            if (inB && !inR && inL) {
                out[k] = clone(l);
                continue;
            }
            if (!inR) { out[k] = clone(l); continue; }         // nuovo in locale
            if (!inL) { out[k] = clone(r); continue; }         // nuovo in remoto
            out[k] = merge3(inB ? b : MISSING, l, r, path.concat(k), ctx);
        }
        return out;
    }

    function mergeIdArrays(base, local, remote, path, ctx) {
        const byId = (arr) => new Map(arr.map(el => [String(el.id), el]));
        const B = byId(base), L = byId(local), R = byId(remote);
        const result = [];
        const emitted = new Set();

        const resolve = (id) => {
            const inL = L.has(id), inR = R.has(id), inB = B.has(id);
            const b = B.get(id), l = L.get(id), r = R.get(id);
            if (inL && inR) return merge3(inB ? b : MISSING, l, r, path.concat(id), ctx);
            if (inL && !inR) {
                if (inB && same(l, b)) return MISSING;         // cancellato in remoto
                return clone(l);                               // nuovo in locale (o modificato: si tiene)
            }
            if (!inL && inR) {
                if (inB && same(r, b)) return MISSING;         // cancellato in locale
                return clone(r);
            }
            return MISSING;
        };

        // Ordine: quello locale, poi gli elementi nuovi del remoto nella loro posizione relativa
        for (const el of local) {
            const id = String(el.id);
            const v = resolve(id);
            emitted.add(id);
            if (v !== MISSING) result.push(v);
        }
        let insertAt = 0;
        for (const el of remote) {
            const id = String(el.id);
            if (emitted.has(id)) {
                const idx = result.findIndex(x => String(x.id) === id);
                if (idx !== -1) insertAt = idx + 1;
                continue;
            }
            emitted.add(id);
            const v = resolve(id);
            if (v !== MISSING) {
                result.splice(insertAt, 0, v);
                insertAt++;
            }
        }
        return result;
    }

    function mergeSetArrays(base, local, remote) {
        const keyOf = stableStringify;
        const count = (arr) => {
            const m = new Map();
            for (const el of arr) m.set(keyOf(el), (m.get(keyOf(el)) || 0) + 1);
            return m;
        };
        const noBase = base === null;
        const B = count(base || []), L = count(local), R = count(remote);
        // Per ogni valore: quante copie tenere = base + aggiunte(locale) + aggiunte(remoto) - rimozioni.
        // Senza base (prima sincronizzazione) non si sa chi ha cancellato: si tiene tutto, senza duplicare.
        const target = new Map();
        const allKeys = new Set([...B.keys(), ...L.keys(), ...R.keys()]);
        for (const k of allKeys) {
            const b = B.get(k) || 0, l = L.get(k) || 0, r = R.get(k) || 0;
            target.set(k, noBase ? Math.max(l, r) : Math.max(0, l + r - b));
        }
        const result = [];
        const used = new Map();
        const take = (el) => {
            const k = keyOf(el);
            const u = used.get(k) || 0;
            if (u < (target.get(k) || 0)) {
                used.set(k, u + 1);
                result.push(clone(el));
            }
        };
        local.forEach(take);
        remote.forEach(take);
        return result;
    }

    /**
     * Unisce tre versioni dello stato completo.
     * @param {object|null} base   stato all'ultima sync riuscita (null = prima volta)
     * @param {object} local       stato di questo dispositivo
     * @param {object} remote      stato nel cloud
     * @param {object} opts        { localWins: boolean } chi vince nei conflitti veri
     * @returns {{ merged: object, conflicts: Array }}
     */
    function mergeStates(base, local, remote, opts = {}) {
        const ctx = { localWins: !!opts.localWins, conflicts: [] };
        const merged = mergeObjects(isPlainObject(base) ? base : {}, local || {}, remote || {}, [], ctx);
        return { merged, conflicts: ctx.conflicts };
    }

    const api = { mergeStates, stableStringify, same };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.CortexMerge = api;
})(typeof window !== 'undefined' ? window : globalThis);
