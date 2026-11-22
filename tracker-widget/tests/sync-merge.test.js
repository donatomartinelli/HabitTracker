// Test del motore di unione della sincronizzazione.
// Esegui con:  node --test tracker-widget/tests
import test from 'node:test';
import assert from 'node:assert/strict';
// sync-merge.js è uno script da browser: si registra su globalThis.CortexMerge
await import('../src/js/core/sync-merge.js');
const { mergeStates } = globalThis.CortexMerge;

const m = (b, l, r, localWins = false) => mergeStates(b, l, r, { localWins });

test('modifica solo sul telefono → arriva sul PC', () => {
    const base = { todos: [{ id: 1, t: 'a' }] };
    const pc = { todos: [{ id: 1, t: 'a' }] };
    const phone = { todos: [{ id: 1, t: 'a' }, { id: 2, t: 'b' }] };
    assert.deepEqual(m(base, pc, phone).merged, phone);
});

test('aggiunte diverse sui due dispositivi → si tengono entrambe', () => {
    const base = { tx: [{ id: 'x', v: 1 }] };
    const pc = { tx: [{ id: 'x', v: 1 }, { id: 'pc', v: 2 }] };
    const phone = { tx: [{ id: 'x', v: 1 }, { id: 'ph', v: 3 }] };
    const out = m(base, pc, phone).merged.tx.map(e => e.id).sort();
    assert.deepEqual(out, ['pc', 'ph', 'x']);
});

test('cancellazione da una parte, nessuna modifica dall\'altra → resta cancellato', () => {
    const base = { tx: [{ id: 'x' }, { id: 'y' }] };
    const pc = { tx: [{ id: 'x' }] };                // y cancellato sul PC
    const phone = { tx: [{ id: 'x' }, { id: 'y' }, { id: 'z' }] };
    const out = m(base, pc, phone).merged.tx.map(e => e.id);
    assert.deepEqual(out, ['x', 'z']);
});

test('cancellato da una parte ma modificato dall\'altra → si tiene (nessuna perdita)', () => {
    const base = { tx: [{ id: 'y', v: 1 }] };
    const pc = { tx: [] };
    const phone = { tx: [{ id: 'y', v: 2 }] };
    assert.deepEqual(m(base, pc, phone).merged.tx, [{ id: 'y', v: 2 }]);
});

test('campi diversi dello stesso elemento → uniti', () => {
    const base = { t: [{ id: 1, title: 'A', done: false }] };
    const pc = { t: [{ id: 1, title: 'A rinominato', done: false }] };
    const phone = { t: [{ id: 1, title: 'A', done: true }] };
    assert.deepEqual(m(base, pc, phone).merged.t, [{ id: 1, title: 'A rinominato', done: true }]);
});

test('stesso campo cambiato da entrambi → vince il più recente, il perdente è registrato', () => {
    const base = { notes: { Idee: 'v0' } };
    const pc = { notes: { Idee: 'versione PC' } };
    const phone = { notes: { Idee: 'versione telefono' } };
    const remoteWins = m(base, pc, phone, false);
    assert.equal(remoteWins.merged.notes.Idee, 'versione telefono');
    assert.equal(remoteWins.conflicts.length, 1);
    assert.equal(remoteWins.conflicts[0].discarded, 'versione PC');
    const localWins = m(base, pc, phone, true);
    assert.equal(localWins.merged.notes.Idee, 'versione PC');
});

test('oggetti per data (log) → chiavi unite', () => {
    const base = { logs: { '2026-11-20': [1] } };
    const pc = { logs: { '2026-11-20': [1], '2026-11-21': [1, 0] } };
    const phone = { logs: { '2026-11-20': [1], '2026-11-22': [0] } };
    assert.deepEqual(Object.keys(m(base, pc, phone).merged.logs).sort(), ['2026-11-20', '2026-11-21', '2026-11-22']);
});

test('liste semplici (categorie) → unione come insieme, cancellazioni rispettate', () => {
    const base = { cats: ['A', 'B', 'C'] };
    const pc = { cats: ['A', 'C', 'D'] };            // tolto B, aggiunto D
    const phone = { cats: ['A', 'B', 'C', 'E'] };    // aggiunto E
    assert.deepEqual(m(base, pc, phone).merged.cats, ['A', 'C', 'D', 'E']);
});

test('prima sincronizzazione (nessuna base) → unione senza perdere né duplicare', () => {
    const pc = { cats: ['A', 'B'], tx: [{ id: 1 }], notes: { X: 'pc' } };
    const phone = { cats: ['B', 'C'], tx: [{ id: 2 }], notes: { Y: 'tel' } };
    const out = m(null, pc, phone).merged;
    assert.deepEqual(out.cats, ['A', 'B', 'C']);
    assert.deepEqual(out.tx.map(e => e.id).sort(), [1, 2]);
    assert.deepEqual(out.notes, { X: 'pc', Y: 'tel' });
});

test('log senza id (sessioni focus) → nessuna sessione persa', () => {
    const s1 = { date: '2026-11-20', min: 25 };
    const s2 = { date: '2026-11-21', min: 50 };
    const s3 = { date: '2026-11-21', min: 25 };
    const base = { focus: [s1] };
    const pc = { focus: [s1, s2] };
    const phone = { focus: [s1, s3] };
    assert.equal(m(base, pc, phone).merged.focus.length, 3);
});

test('il vecchio difetto: il telefono offline non cancella più il lavoro del PC', () => {
    // Il PC ha aggiunto 3 task mentre il telefono era offline e ha modificato solo il saldo.
    const base = { templates: [{ id: 't1' }], mBalance: 100 };
    const pc = { templates: [{ id: 't1' }, { id: 't2' }, { id: 't3' }, { id: 't4' }], mBalance: 100 };
    const phone = { templates: [{ id: 't1' }], mBalance: 87.5 };
    const out = m(base, phone, pc, true).merged; // il telefono sincronizza: locale = telefono
    assert.equal(out.templates.length, 4);
    assert.equal(out.mBalance, 87.5);
});
