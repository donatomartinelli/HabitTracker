// Test dell'apprendimento della command bar: scelte, orari abituali,
// scorciatoie e frasi frequenti. Esegui con: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
await import('../src/js/core/nl-parser.js');
const { interpret, learn, suggestPhrases, emptyLearning } = globalThis.CortexNL;

// Domenica 22 novembre 2026, ore 9:20, giornata libera
const base = { today: '2026-11-22', now: 9 * 60 + 20, noteCategories: [] };
const withL = (learning, extra = {}) => Object.assign({}, base, { learning }, extra);

// Simula: scrivo `text` e scelgo l'interpretazione di tipo `kind`
function use(L, text, kind) {
    const offered = interpret(text, withL(L));
    const i = offered.findIndex(r => r.kind === kind);
    assert.ok(i >= 0, `"${text}" non offre ${kind}`);
    return learn(L, text, offered, i);
}

test('senza niente imparato il comportamento non cambia', () => {
    assert.deepEqual(
        interpret('palestra domani', withL(emptyLearning())).map(r => r.cmd),
        interpret('palestra domani', base).map(r => r.cmd)
    );
});

test('una scelta sola non basta, due sì: l\'alternativa passa prima', () => {
    let L = emptyLearning();
    L = use(L, 'chiamare banca domani', 'event');
    assert.equal(interpret('chiamare banca venerdì', withL(L))[0].kind, 'todo');
    L = use(L, 'chiamare banca lunedì', 'event');
    const r = interpret('chiamare banca venerdì', withL(L));
    assert.equal(r[0].kind, 'event');
    assert.equal(r[0].learned, true);
});

test('vale anche per titoli che iniziano con la stessa parola', () => {
    let L = emptyLearning();
    L = use(L, 'palestra domani', 'event');
    L = use(L, 'palestra martedì', 'event');
    assert.equal(interpret('palestra gambe sabato', withL(L))[0].kind, 'event');
});

test('orario abituale: dopo due volte alle 18 per 90 min, "palestra domani" va alle 18', () => {
    let L = emptyLearning();
    L = use(L, 'palestra domani dalle 18 alle 19:30', 'event');
    L = use(L, 'palestra giovedì dalle 18 alle 19:30', 'event');
    const r = interpret('palestra sabato', withL(L));
    assert.equal(r[0].cmd, 'event @2026-11-28 18:00-19:30 palestra');
    assert.match(r[0].label, /usual time/);
    // con un orario dato, si usa la durata abituale
    assert.equal(interpret('palestra sabato alle 17', withL(L))[0].cmd, 'event @2026-11-28 17:00-18:30 palestra');
    // con una durata data, vince la tua durata
    assert.equal(interpret('palestra sabato alle 17 per 1 ora', withL(L))[0].cmd, 'event @2026-11-28 17:00-18:00 palestra');
});

test('orario abituale occupato → resta come alternativa, non come prima scelta', () => {
    let L = emptyLearning();
    L = use(L, 'palestra domani alle 18', 'event');
    L = use(L, 'palestra giovedì alle 18', 'event');
    const busy = { busyOn: d => d === '2026-11-28' ? [[1080, 1140]] : [] };
    const r = interpret('palestra sabato', withL(L, busy));
    assert.equal(r[0].kind, 'todo');
    assert.ok(r.some(x => x.cmd === 'event @2026-11-28 18:00-19:00 palestra' && /busy/.test(x.label)));
});

test('un orario molto diverso riparte da zero invece di fare la media', () => {
    let L = emptyLearning();
    L = use(L, 'corsa domani alle 7', 'event');
    L = use(L, 'corsa giovedì alle 19', 'event');
    assert.equal(L.habits.corsa.start, 19 * 60);
    assert.equal(L.habits.corsa.n, 1);
});

test('scorciatoie: definire, usare, rimuovere', () => {
    assert.equal(interpret('scorciatoia pal = palestra', base)[0].cmd, 'shortcut pal = palestra');
    assert.equal(interpret('quando scrivo ff intendo fare la spesa', base)[0].cmd, 'shortcut ff = fare la spesa');
    assert.equal(interpret('shortcut gm gym', base)[0].cmd, 'shortcut gm = gym');
    assert.equal(interpret('rimuovi scorciatoia pal', base)[0].cmd, 'shortcut -pal');
    assert.equal(interpret('scorciatoie', base)[0].cmd, 'shortcut');
    const L = Object.assign(emptyLearning(), { shortcuts: { pal: 'palestra', ff: 'fare la spesa' } });
    assert.equal(interpret('pal domani alle 18', withL(L))[0].cmd, 'event @2026-11-23 18:00-19:00 palestra');
    assert.equal(interpret('ff sabato', withL(L))[0].cmd, 'todo @2026-11-28 fare la spesa');
    // solo parole intere: "palla" non diventa "palestrala"
    assert.equal(interpret('palla domani', withL(L))[0].cmd, 'todo @2026-11-23 palla');
});

test('frasi frequenti come completamento', () => {
    let L = emptyLearning();
    L = use(L, 'palestra domani alle 18', 'event');
    assert.deepEqual(suggestPhrases(L, 'pal'), []); // una volta sola non basta
    L = use(L, 'palestra domani alle 18', 'event');
    assert.deepEqual(suggestPhrases(L, 'pal'), [{ text: 'palestra domani alle 18', n: 2 }]);
    assert.deepEqual(suggestPhrases(L, 'xyz'), []);
});

test('i dati imparati restano piccoli', () => {
    let L = emptyLearning();
    for (let i = 0; i < 350; i++) {
        const offered = interpret(`attivita${i} domani`, withL(L));
        L = learn(L, `attivita${i} domani`, offered, 1);
    }
    assert.ok(Object.keys(L.choices).length <= 300);
    assert.ok(Object.keys(L.phrases).length <= 120);
});

test('learn non modifica l\'oggetto originale', () => {
    const L = emptyLearning();
    use(L, 'palestra domani alle 18', 'event');
    assert.deepEqual(L, emptyLearning());
});
