// --- js/core/prefs.js ---
// PERSONAL PREFERENCES (Settings → Appearance / Today / Focus & study)
//
// One object, saved under 'cortex_prefs' and synced with the account like the rest of the data.
//   dayStart / dayEnd   → where every timeline starts and ends (was fixed at 06:30–24:00)
//   accent              → colour of primary buttons, active tabs, the "now" line
//   width / density     → content centred or full width; compact or comfortable rows
//   todayCards          → which cards Today shows, in which order
//   studyLenPicks / studySplitMemo → what study windows learn from your choices (session length, split)
//   focusSound → a tone when a focus session ends
//   backdrop            → the vector field behind the app, on/off and its settings (js/modules/backdrop.js)
//   theme               → the colours (terminal, amber, phosphor, ice, graphite, glass)
//   transparent / glassLevel → desktop app: frosted-glass window on/off (T), and how much tint it keeps
//   hudCards / hudCompact → what the desktop HUD (H) shows, in which order; compact = timer and search only
// Loaded right after state.js, before the modules that draw timelines.

const PREFS_KEY = 'cortex_prefs';

const TODAY_CARD_DEFS = [
    { key: 'week',     label: 'Week priorities', desc: 'The three things you picked for this week' },
    { key: 'now',      label: 'Now / up next',   desc: 'Running timer, or what comes next' },
    { key: 'study',    label: 'Study windows',   desc: 'Where and when you study today, with the session plan' },
    { key: 'coming',   label: 'Coming up',       desc: 'Gym, exams and bills that are close' },
    { key: 'tasks',    label: 'Tasks',           desc: 'Everything active today' },
    { key: 'meals',    label: 'Meals',           desc: 'What to eat and when, with calories eaten' },
    { key: 'routines', label: 'Routines',        desc: 'Collapsible routine checklists' },
    { key: 'stats',    label: 'Numbers',         desc: 'Streak, focus hours and free money' },
    { key: 'timeline', label: 'Timeline',        desc: 'The day hour by hour (right column on a computer)' }
];

// What the HUD (the small always-on-top window, H) can show: the same cards as Today
const HUD_CARD_DEFS = [
    { key: 'now',      label: 'Timer / up next', desc: 'The running timer, or what comes next', def: true },
    { key: 'timeline', label: 'Timeline',        desc: 'The next hours: sessions, events, meals', def: true },
    { key: 'study',    label: 'Study windows',   desc: 'Where and when you study today, with how far you are', def: false },
    { key: 'tasks',    label: 'Tasks',           desc: 'Everything active today, with its progress', def: true },
    { key: 'meals',    label: 'Meals',           desc: 'Eaten or not, one meal at a time', def: false },
    { key: 'routines', label: 'Routines',        desc: 'Routine checklists', def: false }
];

// Themes: all dark, all terminal. accent = the accent colour the theme comes with
const THEMES = [
    { id: 'terminal', label: 'Terminal', bg: '#000000', fg: '#ffffff', dim: '#777777', accent: '#ffffff' },
    { id: 'amber',    label: 'Amber',    bg: '#0b0700', fg: '#ffb347', dim: '#8f6626', accent: '#ffb347' },
    { id: 'phosphor', label: 'Phosphor', bg: '#000a03', fg: '#7dffa3', dim: '#2f8a4c', accent: '#7dffa3' },
    { id: 'ice',      label: 'Ice',      bg: '#060d16', fg: '#dcecff', dim: '#5f7f9e', accent: '#6ec1ff' },
    { id: 'graphite', label: 'Graphite', bg: '#17181b', fg: '#e4e4e6', dim: '#7d7f87', accent: '#c9a24e' },
    { id: 'glass',    label: 'Glass',    bg: '#0b0e14', fg: '#f3f6fb', dim: '#8590a3', accent: '#ffffff', glass: true }
];

const ACCENT_PRESETS = [
    { id: 'white',  label: 'White',  color: '#ffffff' },
    { id: 'gold',   label: 'Gold',   color: '#c9a24e' },
    { id: 'green',  label: 'Green',  color: '#7fae84' },
    { id: 'blue',   label: 'Blue',   color: '#7a9fd6' },
    { id: 'violet', label: 'Violet', color: '#a58be0' },
    { id: 'red',    label: 'Coral',  color: '#e07a6a' }
];

const PREFS_DEFAULTS = {
    startScreen: 'last',        // 'last' | a section key (today, plan, notes, ...)
    dayStart: '06:30',
    dayEnd: '24:00',
    accent: '#ffffff',
    width: 'centered',          // 'centered' | 'full'
    density: 'comfortable',     // 'comfortable' | 'compact'
    todayCards: TODAY_CARD_DEFS.map(c => ({ key: c.key, on: true })),
    studyLenPicks: {},          // session length (30/45/60) → how many times you picked it (js/modules/study.js)
    studySplitMemo: {},         // set of tasks → how you split the time last time
    focusSound: true,
    hudCards: HUD_CARD_DEFS.map(c => ({ key: c.key, on: c.def })),
    hudCompact: false,
    theme: 'terminal',
    transparent: false,         // desktop app: frosted-glass window
    glassLevel: 0.55,           // how much of the theme's tint stays when transparent (0.25 – 0.9)
    backdrop: { on: false }     // the vector field behind the app (js/modules/backdrop.js fills in the rest)
};

// Where every timeline starts/ends, in decimal hours. planner.js and tasks.js read it.
var CORTEX_DAY = { start: 6.5, end: 24 };

let cortexPrefs = (function () {
    let saved = {};
    try { saved = JSON.parse(cortexStore.getItem(PREFS_KEY) || '{}') || {}; } catch (e) { saved = {}; }
    return normalizePrefs(Object.assign({}, PREFS_DEFAULTS, saved));
})();

function normalizePrefs(p) {
    const out = Object.assign({}, PREFS_DEFAULTS, p || {});
    // Today cards: keep the saved order, add cards that did not exist when it was saved
    const known = new Set(TODAY_CARD_DEFS.map(c => c.key));
    const list = Array.isArray(out.todayCards) ? out.todayCards.filter(c => c && known.has(c.key)) : [];
    TODAY_CARD_DEFS.forEach((def, i) => {
        if (!list.some(c => c.key === def.key)) {
            // new card: insert it after the card that precedes it in the default order
            const prevKey = i > 0 ? TODAY_CARD_DEFS[i - 1].key : null;
            const at = prevKey ? list.findIndex(c => c.key === prevKey) + 1 : 0;
            list.splice(Math.max(0, at), 0, { key: def.key, on: true });
        }
    });
    out.todayCards = list.map(c => ({ key: c.key, on: c.on !== false }));
    // HUD cards: same idea (new cards come in switched off unless they are on by default)
    const hudKnown = new Set(HUD_CARD_DEFS.map(c => c.key));
    const hud = Array.isArray(out.hudCards) ? out.hudCards.filter(c => c && hudKnown.has(c.key)) : [];
    HUD_CARD_DEFS.forEach(def => { if (!hud.some(c => c.key === def.key)) hud.push({ key: def.key, on: def.def }); });
    out.hudCards = hud.map(c => ({ key: c.key, on: c.on !== false }));
    out.hudCompact = out.hudCompact === true;
    if (!THEMES.some(t => t.id === out.theme)) out.theme = PREFS_DEFAULTS.theme;
    out.transparent = out.transparent === true;
    const gl = Number(out.glassLevel);
    out.glassLevel = Number.isFinite(gl) ? Math.max(0.25, Math.min(0.9, Math.round(gl * 100) / 100)) : PREFS_DEFAULTS.glassLevel;
    if (!/^#[0-9a-f]{6}$/i.test(String(out.accent || ''))) out.accent = PREFS_DEFAULTS.accent;
    if (!['centered', 'full'].includes(out.width)) out.width = PREFS_DEFAULTS.width;
    if (!['comfortable', 'compact'].includes(out.density)) out.density = PREFS_DEFAULTS.density;
    const plain = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.assign({}, v) : {});
    out.studyLenPicks = plain(out.studyLenPicks);
    out.studySplitMemo = plain(out.studySplitMemo);
    out.backdrop = plain(out.backdrop);
    // old study settings (fixed rhythms, plan styles) are gone: sessions follow the length you pick in each window
    ['studyRhythm', 'studyOrder', 'studyCustomWork', 'studyCustomBreak', 'studyStylePicks', 'studyLenShift'].forEach(k => delete out[k]);
    return out;
}

function getPref(key) {
    return cortexPrefs[key] !== undefined ? cortexPrefs[key] : PREFS_DEFAULTS[key];
}

function setPref(key, value, opts = {}) {
    cortexPrefs[key] = value;
    cortexPrefs = normalizePrefs(cortexPrefs);
    savePrefs();
    applyPrefs({ rerender: opts.rerender !== false });
}

function savePrefs() {
    cortexStore.setItem(PREFS_KEY, JSON.stringify(cortexPrefs));
    if (typeof markLocalChangeForCloud === 'function') markLocalChangeForCloud();
}

// Called by cloud sync when another device changed the preferences
function applySyncedPrefs(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
    cortexPrefs = normalizePrefs(Object.assign({}, cortexPrefs, obj));
    cortexStore.setItem(PREFS_KEY, JSON.stringify(cortexPrefs));
    applyPrefs({ rerender: true });
    if (window.CortexBackdrop) CortexBackdrop.apply();
}

function hhmmToDec(str, fallback) {
    if (str === '24:00') return 24;
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(str || ''));
    if (!m) return fallback;
    const v = parseInt(m[1], 10) + parseInt(m[2], 10) / 60;
    return v >= 0 && v <= 24 ? v : fallback;
}
function decToHHMM(dec) {
    if (dec >= 24) return '24:00';
    const h = Math.floor(dec);
    const m = Math.round((dec - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// The five day phases keep their boundaries; the first starts at dayStart, the last ends at dayEnd
const DAY_PHASES_BASE = (typeof DAY_PHASES !== 'undefined') ? DAY_PHASES.map(p => Object.assign({}, p)) : [];

function applyDayHours() {
    let start = hhmmToDec(getPref('dayStart'), 6.5);
    let end = hhmmToDec(getPref('dayEnd'), 24);
    if (end - start < 4) { start = 6.5; end = 24; }
    CORTEX_DAY.start = start;
    CORTEX_DAY.end = end;
    if (typeof DAY_PHASES === 'undefined' || !DAY_PHASES_BASE.length) return;
    const next = [];
    DAY_PHASES_BASE.forEach((ph, idx) => {
        const s = idx === 0 ? start : Math.max(ph.startDec, start);
        const e = idx === DAY_PHASES_BASE.length - 1 ? end : Math.min(ph.endDec, end);
        if (e - s > 0.01) next.push(Object.assign({}, ph, { startDec: s, endDec: e, start: decToHHMM(s), end: decToHHMM(e) }));
    });
    DAY_PHASES.length = 0;
    next.forEach(p => DAY_PHASES.push(p));
}

function inkFor(hex) {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    return lum > 0.55 ? '#000000' : '#ffffff';
}

const isDesktopApp = () => Boolean(window.__TAURI__);
// Transparent only means something in the desktop app (a web page has nothing behind it)
function isTransparentOn() { return isDesktopApp() && getPref('transparent') === true; }

let lastWindowEffect = null;
function applyWindowEffect(on) {
    if (!isDesktopApp() || lastWindowEffect === on) return;
    lastWindowEffect = on;
    try {
        const w = window.__TAURI__.window && window.__TAURI__.window.getCurrentWindow ? window.__TAURI__.window.getCurrentWindow() : null;
        if (!w) return;
        // Windows acrylic = frosted glass behind the window; off = nothing behind (the app is opaque)
        if (on && typeof w.setEffects === 'function') w.setEffects({ effects: ['acrylic'] }).catch(e => console.warn('[prefs] glass effect', e));
        if (!on && typeof w.clearEffects === 'function') w.clearEffects().catch(() => {});
    } catch (e) { console.warn('[prefs] glass effect', e); }
}

// T (or the ◐ button): normal ↔ transparent, at the level fixed in Settings
function toggleTransparent(force = null) {
    if (!isDesktopApp()) { if (typeof showToast === 'function') showToast('Transparency is for the desktop app'); return; }
    const next = force === null ? !getPref('transparent') : Boolean(force);
    setPref('transparent', next, { rerender: false });
}

// Picking a theme brings its accent colour (you can change it after); Glass also turns transparency on
function setTheme(id) {
    const t = THEMES.find(x => x.id === id);
    if (!t) return;
    cortexPrefs.theme = t.id;
    cortexPrefs.accent = t.accent;
    if (t.glass && isDesktopApp()) cortexPrefs.transparent = true;
    cortexPrefs = normalizePrefs(cortexPrefs);
    savePrefs();
    applyPrefs({ rerender: true });
}

function applyPrefs(opts = {}) {
    const root = document.documentElement;
    const theme = getPref('theme');
    if (theme && theme !== 'terminal') root.dataset.theme = theme; else delete root.dataset.theme;
    const glass = isTransparentOn();
    if (glass) root.dataset.transparent = '1'; else delete root.dataset.transparent;
    root.style.setProperty('--bg-opacity', glass ? String(getPref('glassLevel')) : '1');
    applyWindowEffect(glass);
    if (window.CortexBackdrop) CortexBackdrop.themeChanged();
    document.querySelectorAll('[data-glass-toggle]').forEach(b => {
        b.hidden = !isDesktopApp();
        b.classList.toggle('is-on', glass);
        b.setAttribute('aria-pressed', String(glass));
        b.title = glass ? 'Transparent: on (T)' : 'Transparent: off (T)';
    });
    const accent = getPref('accent');
    root.style.setProperty('--accent', accent);
    root.style.setProperty('--accent-ink', inkFor(accent));
    root.dataset.width = getPref('width');
    root.dataset.density = getPref('density');
    applyDayHours();
    if (opts.rerender) {
        ['renderWeeklyPlanner', 'renderDayPlannerModule', 'renderTodayModule', 'renderHudPod'].forEach(fn => {
            try { if (typeof window[fn] === 'function') window[fn](); } catch (e) { console.error('[prefs]', fn, e); }
        });
    }
}

window.getPref = getPref;
window.setPref = setPref;
window.applySyncedPrefs = applySyncedPrefs;
window.getCortexPrefs = () => cortexPrefs;
window.toggleTransparent = toggleTransparent;
window.setTheme = setTheme;

applyPrefs();
// the header buttons exist only once the page is built
window.addEventListener('DOMContentLoaded', () => applyPrefs());
