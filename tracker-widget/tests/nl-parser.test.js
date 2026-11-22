// Test del traduttore frasi → comandi. Esegui con: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
await import('../src/js/core/nl-parser.js');
const { interpret } = globalThis.CortexNL;

// Domenica 22 novembre 2026
const T = { today: '2026-11-22', noteCategories: ['Ideas', 'Math', 'General'] };
const first = (s) => (interpret(s, T)[0] || {}).cmd;

test('evento in italiano con data, ora e durata', () => {
    assert.equal(first("dentista domani alle 15 per un'ora"), 'event @2026-11-23 15:00-16:00 dentista');
    assert.equal(first('riunione lunedì dalle 9 alle 10:30 con Marco'), 'event @2026-11-23 09:00-10:30 riunione con Marco');
    assert.equal(first('cena con Giulia sabato alle 20:30'), 'event @2026-11-28 20:30-21:30 cena con Giulia');
    assert.equal(first('esame analisi 15/01 alle 9'), 'event @2027-01-15 09:00-10:00 esame analisi');
});

test('evento in inglese', () => {
    assert.equal(first('dentist tomorrow at 3pm for 2 hours'), 'event @2026-11-23 15:00-17:00 dentist');
    assert.equal(first('call with Anna friday 10-11'), 'event @2026-11-27 10:00-11:00 call with Anna');
    assert.equal(first('gym next monday at 18'), 'event @2026-11-23 18:00-19:00 gym');
});

test('verbo esplicito "appuntamento" → evento anche senza ora', () => {
    assert.equal(first('appuntamento commercialista 3 dicembre'), 'event @2026-12-03 commercialista');
});

test('data senza ora → to-do (con evento come alternativa)', () => {
    const r = interpret('chiamare la nonna venerdì', T);
    assert.equal(r[0].cmd, 'todo @2026-11-27 chiamare la nonna');
    assert.equal(r[1].kind, 'event');
    assert.equal(first('pay rent in 3 days'), 'todo @2026-11-25 pay rent');
    assert.equal(first('ricordami di comprare il latte domani'), 'todo @2026-11-23 comprare il latte');
    assert.equal(first('remind me to call mum tomorrow'), 'todo @2026-11-23 call mum');
});

test('spese e entrate', () => {
    assert.equal(first('12€ pranzo'), 'out 12 pranzo');
    assert.equal(first('€4,50 caffè #food'), 'out 4.50 #food caffè');
    assert.equal(first('spesa 30 benzina'), 'out 30 benzina');
    assert.equal(first('spent 9.99 on netflix'), 'out 9.99 netflix');
    assert.equal(first('stipendio 1200€'), 'in 1200 stipendio');
    assert.equal(interpret('stipendio 1200€', T)[0].kind, 'income');
    assert.equal(first('ricevuto 50 da Luca'), 'in 50 Luca');
});

test('peso, note, fatto, focus', () => {
    assert.equal(first('peso 72,4'), 'weight 72.4');
    assert.equal(first('72.4 kg'), 'weight 72.4');
    assert.equal(first('Ideas: app per la sveglia'), 'note Ideas: app per la sveglia');
    assert.equal(first('nota Progetti: nuovo widget'), 'note Progetti: nuovo widget');
    assert.equal(first('fatto palestra'), 'done palestra');
    assert.equal(first('focus analisi'), 'focus analisi');
});

test('navigazione', () => {
    assert.equal(first('vai a soldi'), '@nav money');
    assert.equal(first('open health'), '@nav health');
});

test('frasi senza azione → nessuna interpretazione (va alla ricerca)', () => {
    assert.deepEqual(interpret('analisi', T), []);
    assert.deepEqual(interpret('come sto andando', T), []);
});
