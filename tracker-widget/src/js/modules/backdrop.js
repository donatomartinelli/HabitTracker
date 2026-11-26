// --- js/modules/backdrop.js ---
// BACKGROUND: the vector field ("campo vettoriale") behind the whole app.
//
// Particles follow a vector field (pendulum, Van der Pol, dipole, vortices… or your own x' and y'),
// leaving trails. It lives on a canvas under everything; when it is on, the app's surfaces turn into
// veils so it shows through (same look as the transparent window, see css/base.css).
// Everything is set in Settings → Background (prefs.backdrop, synced). Off by default.
// The cursor can stir the field (vortex, attractor…); clicks can scatter it. It pauses when the
// window is hidden and does not run at all with "reduce motion" on.
// Adapted from the Lively wallpaper "Campo vettoriale" (same fields, same options).

(function () {
    'use strict';
    const { sin, cos, hypot, tanh, atan2, PI, min, max, random } = Math;

    // ------------------------------------------------------------------ fields
    // world coordinates, y up; each field returns a new [vx, vy]
    const newton = (x, y) => {                                  // z' = -p(z)/p'(z), p(z) = z^3 - 1
        const x2 = x * x - y * y, y2 = 2 * x * y;
        const px = x2 * x - y2 * y - 1, py = x2 * y + y2 * x;
        const qx = 3 * x2, qy = 3 * y2, d = qx * qx + qy * qy + 1e-9;
        return [-(px * qx + py * qy) / d, -(py * qx - px * qy) / d];
    };
    const vtx = (x, y, a, b, s) => { const dx = x - a, dy = y - b, r = dx * dx + dy * dy + 0.08; return [-s * dy / r, s * dx / r]; };

    const FIELDS = {
        pendolo:       { eq: "x' = y   y' = -sin x - 0.15 y",           f: (x, y) => [y, -sin(x * 1.4) - 0.15 * y] },
        'van-der-pol': { eq: "x' = y   y' = (1 - x²) y - x",             f: (x, y) => [y, (1 - x * x) * y - x] },
        dipolo:        { eq: 'E = q r₊/|r₊|³ - q r₋/|r₋|³',             f: (x, y) => {
            const g = (a, s) => { const dx = x - a, r = Math.pow(dx * dx + y * y + 0.03, 1.5); return [s * dx / r, s * y / r]; };
            const p = g(-0.9, 1), m = g(0.9, -1); return [p[0] + m[0], p[1] + m[1]];
        } },
        sella:         { eq: "x' = x   y' = -y",                        f: (x, y) => [x, -y] },
        spirale:       { eq: "x' = -0.2x - y   y' = x - 0.2y",          f: (x, y) => [-0.2 * x - y, x - 0.2 * y] },
        lineare:       { eq: "x' = A x,  A = [[0.3, -1], [1.2, -0.4]]", f: (x, y) => [0.3 * x - y, 1.2 * x - 0.4 * y] },
        kepler:        { eq: "r'' = -r/|r|³  (central field)",          f: (x, y) => { const r = Math.pow(x * x + y * y + 0.05, 0.75); return [-y / r - 0.08 * x, x / r - 0.08 * y]; } },
        newton:        { eq: "z' = -p(z)/p'(z),  p(z) = z³ - 1",         f: newton },
        vortici:       { eq: 'three point vortices',                   f: (x, y) => {
            const a = vtx(x, y, -1.2, 0.4, 0.8), b = vtx(x, y, 1.1, -0.3, -0.9), c = vtx(x, y, 0, 1.1, 0.6);
            return [a[0] + b[0] + c[0] + 0.15, a[1] + b[1] + c[1]];
        } },
        onde:          { eq: "x' = sin(y + t)   y' = cos(x - t)",        f: (x, y, t) => [sin(y + t * 0.6), cos(x - t * 0.4)] },
        duffing:       { eq: "x' = y   y' = x - x³ - 0.2 y",            f: (x, y) => [y, x - x * x * x - 0.2 * y] },
        'lotka-volterra': { eq: "x' = x(1 - y)   y' = y(x - 1)",        f: (x, y) => { const u = x + 1, v = y + 1; return [u * (1 - v), v * (u - 1)]; } },
        personalizzato: { eq: '', f: null }
    };
    const FIELD_NAMES = Object.keys(FIELDS);
    const CYCLE_NAMES = FIELD_NAMES.filter(n => n !== 'personalizzato');

    // ------------------------------------------------------------------ settings (the shape of prefs.backdrop)
    const DEFAULTS = {
        on: false,
        field: 'pendolo', fx: 'sin(y) - 0.1*x', fy: '-sin(x) + 0.4*cos(t)',
        particles: 1200, speed: 1, life: 200, fade: 0.06, width: 1, alpha: 0.75, zoom: 0.16,
        themeColor: true, colorMode: 'mono', color: '#ffffff', color2: '#4da3ff', arrows: false,
        mouse: 'vortice', strength: 1.6, radius: 0.25, click: 'nessuno',
        label: false, cycle: 0, fps: 45, show: 0.55
    };
    // What Settings → Background shows, in order (sec = a group title)
    const SCHEMA = [
        { sec: 'Field' },
        { k: 'field', t: 'select', l: 'Field', o: FIELD_NAMES },
        { k: 'fx', t: 'text', l: "x' =", d: 'Your own field. Use x, y, t, numbers and sin, cos, exp, sqrt…', show: (c) => c.field === 'personalizzato' },
        { k: 'fy', t: 'text', l: "y' =", show: (c) => c.field === 'personalizzato' },
        { k: 'cycle', t: 'range', l: 'Change field every', d: 'Seconds; 0 = never.', min: 0, max: 300, step: 5, unit: 's' },
        { k: 'label', t: 'check', l: 'Show the equation', d: 'Small, in the bottom right corner.' },
        { sec: 'Particles' },
        { k: 'particles', t: 'range', l: 'How many', min: 100, max: 6000, step: 100 },
        { k: 'speed', t: 'range', l: 'Speed', min: 0.1, max: 4, step: 0.05 },
        { k: 'life', t: 'range', l: 'Life', d: 'In frames.', min: 20, max: 800, step: 10 },
        { k: 'fade', t: 'range', l: 'Trail fade', min: 0.01, max: 0.4, step: 0.005 },
        { k: 'width', t: 'range', l: 'Line width', min: 0.5, max: 4, step: 0.1 },
        { k: 'alpha', t: 'range', l: 'Line opacity', min: 0.1, max: 1, step: 0.05 },
        { k: 'zoom', t: 'range', l: 'Scale', min: 0.04, max: 0.5, step: 0.01 },
        { sec: 'Colours' },
        { k: 'show', t: 'range', l: 'How much it shows', d: 'Behind your cards: low keeps the text easy to read.', min: 0.15, max: 1, step: 0.05, pct: true },
        { k: 'themeColor', t: 'check', l: 'Theme colour', d: 'Lines in the colour of your theme.' },
        { k: 'colorMode', t: 'select', l: 'Colouring', o: ['mono', 'velocità', 'direzione'], show: (c) => !c.themeColor },
        { k: 'color', t: 'color', l: 'Colour', show: (c) => !c.themeColor },
        { k: 'color2', t: 'color', l: 'Colour (fast)', show: (c) => !c.themeColor && c.colorMode === 'velocità' },
        { k: 'arrows', t: 'check', l: 'Arrow grid' },
        { sec: 'Cursor' },
        { k: 'mouse', t: 'select', l: 'Cursor effect', o: ['vortice', 'vortice inverso', 'attrattore', 'repulsore', 'nessuno'] },
        { k: 'strength', t: 'range', l: 'Strength', min: 0, max: 6, step: 0.1, show: (c) => c.mouse !== 'nessuno' },
        { k: 'radius', t: 'range', l: 'Radius', min: 0.05, max: 1.5, step: 0.05, show: (c) => c.mouse !== 'nessuno' },
        { k: 'click', t: 'select', l: 'On click', o: ['esplosione', 'inverti verso', 'nessuno'] },
        { sec: 'Performance' },
        { k: 'fps', t: 'range', l: 'Max frames per second', min: 15, max: 144, step: 1 }
    ];

    function normalize(raw) {
        const c = Object.assign({}, DEFAULTS, raw && typeof raw === 'object' ? raw : {});
        c.on = c.on === true;
        if (!FIELD_NAMES.includes(c.field)) c.field = DEFAULTS.field;
        SCHEMA.forEach(it => {
            if (!it.k) return;
            if (it.t === 'range') { const v = Number(c[it.k]); c[it.k] = Number.isFinite(v) ? max(it.min, min(it.max, v)) : DEFAULTS[it.k]; }
            if (it.t === 'select' && !it.o.includes(c[it.k])) c[it.k] = DEFAULTS[it.k];
            if (it.t === 'check') c[it.k] = Boolean(c[it.k]);
            if (it.t === 'color' && !/^#[0-9a-f]{6}$/i.test(String(c[it.k]))) c[it.k] = DEFAULTS[it.k];
            if (it.t === 'text') c[it.k] = String(c[it.k] || '').slice(0, 160);
        });
        return c;
    }
    const prefCfg = () => normalize(typeof getPref === 'function' ? getPref('backdrop') : null);
    const reduced = () => Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    // ------------------------------------------------------------------ state
    let cfg = prefCfg();
    let canvas = null, ctx = null, labelEl = null;
    let W = 0, H = 0, U = 1, t = 0, last = 0, cycleT = 0, running = false, rafId = 0;
    let field = FIELDS.pendolo.f, fieldErr = '';
    let particles = [], palette = [], NB = 1;
    let ptrScreen = null, ptr = null, ptrK = 0, sign = 1;

    const toWorld = (px, py) => [(px - W / 2) / U, -(py - H / 2) / U];
    const hexRgb = h => { const n = parseInt(String(h).replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
    // the theme's text colour as #rrggbb
    function themeHex() {
        const probe = document.createElement('span');
        probe.style.color = 'var(--text-main)';
        document.body.appendChild(probe);
        const rgb = getComputedStyle(probe).color.match(/\d+(\.\d+)?/g) || ['255', '255', '255'];
        probe.remove();
        return '#' + rgb.slice(0, 3).map(v => Math.round(Number(v)).toString(16).padStart(2, '0')).join('');
    }
    const lineColor = () => (cfg.themeColor ? themeHex() : cfg.color);

    // Your own field: only numbers, x, y, t, operators and Math functions (the text is synced, so nothing else runs)
    const ALLOWED = new Set(['x', 'y', 't', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2', 'sinh', 'cosh', 'tanh', 'exp', 'log', 'sqrt', 'cbrt', 'abs', 'pow', 'min', 'max', 'sign', 'floor', 'ceil', 'round', 'hypot', 'PI', 'E']);
    function compileCustom() {
        const src = [cfg.fx, cfg.fy].map(s => String(s).replace(/\^/g, '**'));
        src.forEach(s => {
            if (!/^[\w\s+\-*/().,]*$/.test(s)) throw new Error('only numbers, x, y, t and maths');
            (s.match(/[A-Za-z_]\w*/g) || []).forEach(w => { if (!ALLOWED.has(w)) throw new Error(`unknown: ${w}`); });
        });
        // eslint-disable-next-line no-new-func
        const fn = new Function('x', 'y', 't', `with (Math) { return [(${src[0]}), (${src[1]})]; }`);
        const r = fn(0.3, -0.2, 0);
        if (!Array.isArray(r) || r.some(v => typeof v !== 'number')) throw new Error('the result is not a number');
        return (x, y, tt) => { const v = fn(x, y, tt); return [+v[0] || 0, +v[1] || 0]; };
    }
    function setField() {
        fieldErr = '';
        if (cfg.field === 'personalizzato') {
            try { field = compileCustom(); } catch (e) { fieldErr = e.message; field = () => [0, 0]; }
        } else field = (FIELDS[cfg.field] || FIELDS.pendolo).f;
        clear();
        particles.forEach(respawn);
        updateLabel();
    }
    function updateLabel() {
        if (!labelEl) return;
        labelEl.hidden = !cfg.label || !cfg.on;
        const eq = cfg.field === 'personalizzato' ? `x' = ${cfg.fx}   y' = ${cfg.fy}` : FIELDS[cfg.field].eq;
        labelEl.textContent = `$ field --${cfg.field}   ${eq}`;
    }
    function buildPalette() {
        const a = cfg.alpha, c1 = hexRgb(lineColor()), c2 = hexRgb(cfg.color2);
        const mode = cfg.themeColor ? 'mono' : cfg.colorMode;
        if (mode === 'mono') { NB = 1; palette = [`rgba(${c1},${a})`]; return; }
        NB = 16;
        palette = Array.from({ length: NB }, (_, i) => {
            const s = i / (NB - 1);
            if (mode === 'velocità') return `rgba(${c1.map((v, j) => Math.round(v + (c2[j] - v) * s))},${a})`;
            return `hsla(${Math.round(i * 360 / NB)},85%,66%,${a})`;
        });
    }
    function resize() {
        if (!canvas) return;
        const d = min(window.devicePixelRatio || 1, 2);
        W = innerWidth; H = innerHeight;
        canvas.width = Math.round(W * d); canvas.height = Math.round(H * d);
        ctx.setTransform(d, 0, 0, d, 0, 0);
        U = min(W, H) * cfg.zoom;
        particles.forEach(respawn);
        clear();
    }
    function respawn(p) {
        p.x = (random() - 0.5) * (W + 20) / U;
        p.y = (random() - 0.5) * (H + 20) / U;
        p.life = cfg.life * (0.2 + 0.8 * random());
        return p;
    }
    function setCount() {
        const n = cfg.particles | 0;
        if (particles.length > n) particles.length = n;
        while (particles.length < n) particles.push(respawn({}));
    }
    function clear() { if (ctx && W) ctx.clearRect(0, 0, W, H); }

    // the field + what the cursor does to it
    function F(x, y) {
        const v = field(x, y, t);
        if (ptr && ptrK > 0 && cfg.mouse !== 'nessuno') {
            const dx = x - ptr[0], dy = y - ptr[1], r = dx * dx + dy * dy + cfg.radius * cfg.radius;
            const s = cfg.strength * ptrK * sign;
            switch (cfg.mouse) {
                case 'vortice':         v[0] -= s * dy / r; v[1] += s * dx / r; break;
                case 'vortice inverso': v[0] += s * dy / r; v[1] -= s * dx / r; break;
                case 'attrattore':      v[0] -= s * dx / r; v[1] -= s * dy / r; break;
                case 'repulsore':       v[0] += s * dx / r; v[1] += s * dy / r; break;
            }
        }
        return v;
    }

    function drawArrows(alpha) {
        const step = 30;
        ctx.strokeStyle = `rgba(${hexRgb(lineColor())},${alpha})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = step / 2; i < W; i += step) for (let j = step / 2; j < H; j += step) {
            const [x, y] = toWorld(i, j);
            const v = F(x, y), m = hypot(v[0], v[1]);
            if (!m || !Number.isFinite(m)) continue;
            const l = 6 + 4 * tanh(m), ux = v[0] / m, uy = -v[1] / m;
            ctx.moveTo(i - ux * l / 2, j - uy * l / 2);
            ctx.lineTo(i + ux * l / 2, j + uy * l / 2);
            ctx.lineTo(i + ux * l / 2 - (ux * 3 - uy * 2), j + uy * l / 2 - (uy * 3 + ux * 2));
        }
        ctx.stroke();
    }

    function frame(now) {
        if (!running) return;
        rafId = requestAnimationFrame(frame);
        if (document.hidden || !W) { last = now; return; }
        if (now - last < 1000 / cfg.fps - 1) return;
        const dt = min(0.05, (now - last) / 1000);
        last = now; t += dt;

        // cursor: followed softly, its effect fades in and out
        if (ptrScreen) {
            const target = toWorld(ptrScreen[0], ptrScreen[1]);
            if (!ptr) ptr = target;
            else { ptr[0] += (target[0] - ptr[0]) * 0.3; ptr[1] += (target[1] - ptr[1]) * 0.3; }
            ptrK = min(1, ptrK + dt * 3);
        } else { ptrK = max(0, ptrK - dt * 1.5); if (!ptrK) ptr = null; }

        if (cfg.cycle > 0 && (cycleT += dt) >= cfg.cycle) {
            cycleT = 0;
            const i = CYCLE_NAMES.indexOf(cfg.field);
            set('field', CYCLE_NAMES[(i + 1) % CYCLE_NAMES.length], { save: false });
        }

        // trails fade
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = `rgba(0,0,0,${cfg.fade})`;
        ctx.fillRect(0, 0, W, H);
        ctx.globalCompositeOperation = 'source-over';
        if (cfg.arrows) drawArrows(0.16);

        const h = 0.6 * dt * cfg.speed, mode = cfg.themeColor ? 'mono' : cfg.colorMode;
        const paths = palette.map(() => new Path2D());
        for (const p of particles) {
            const v1 = F(p.x, p.y);
            let m = hypot(v1[0], v1[1]);
            const k = m > 4 ? 4 / m : 1;                         // shorter step near singularities
            const v2 = F(p.x + 0.5 * h * v1[0] * k, p.y + 0.5 * h * v1[1] * k);
            m = hypot(v2[0], v2[1]);
            const k2 = m > 4 ? 4 / m : 1;
            const nx = p.x + h * v2[0] * k2, ny = p.y + h * v2[1] * k2;
            const sx = W / 2 + p.x * U, sy = H / 2 - p.y * U, ex = W / 2 + nx * U, ey = H / 2 - ny * U;
            let b = 0;
            if (mode === 'velocità') b = min(NB - 1, (tanh(m / 2.5) * NB) | 0);
            else if (mode === 'direzione') b = min(NB - 1, (((atan2(v2[1], v2[0]) + PI) / (2 * PI)) * NB) | 0);
            const path = paths[b] || paths[0];
            path.moveTo(sx, sy); path.lineTo(ex, ey);
            p.x = nx; p.y = ny;
            if (--p.life < 0 || ex < -10 || ex > W + 10 || ey < -10 || ey > H + 10 || !Number.isFinite(nx) || !Number.isFinite(ny)) respawn(p);
        }
        ctx.lineWidth = cfg.width;
        ctx.lineCap = 'round';
        paths.forEach((pa, i) => { ctx.strokeStyle = palette[i]; ctx.stroke(pa); });
    }

    // ------------------------------------------------------------------ on / off
    function ensureCanvas() {
        if (canvas) return;
        canvas = document.createElement('canvas');
        canvas.id = 'cx-backdrop';
        canvas.setAttribute('aria-hidden', 'true');
        ctx = canvas.getContext('2d');
        labelEl = document.createElement('span');
        labelEl.id = 'cx-backdrop-label';
        labelEl.setAttribute('aria-hidden', 'true');
        document.body.prepend(labelEl);
        document.body.prepend(canvas);
        window.addEventListener('resize', resize);
        document.addEventListener('pointermove', (e) => { ptrScreen = [e.clientX, e.clientY]; }, { passive: true });
        document.addEventListener('pointerdown', onClick, { passive: true });
        document.addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse') ptrScreen = null; });
        document.documentElement.addEventListener('mouseleave', () => { ptrScreen = null; });
        window.addEventListener('blur', () => { ptrScreen = null; });
    }
    function onClick(e) {
        if (!running) return;
        // clicks on buttons and fields are for the app, not the field
        if (e.target.closest && e.target.closest('button, a, input, select, textarea, label, [contenteditable], [role="button"]')) return;
        ptrScreen = [e.clientX, e.clientY];
        if (cfg.click === 'inverti verso') sign = -sign;
        else if (cfg.click === 'esplosione') {
            const [wx, wy] = toWorld(e.clientX, e.clientY), n = min(particles.length, 220);
            for (let i = 0; i < n; i++) {
                const p = particles[(random() * particles.length) | 0], a = random() * 2 * PI, r = random() * 0.35;
                p.x = wx + r * cos(a); p.y = wy + r * sin(a); p.life = cfg.life * (0.5 + 0.5 * random());
            }
        }
    }

    function apply() {
        cfg = prefCfg();
        const want = cfg.on && !reduced();
        document.documentElement.toggleAttribute('data-backdrop', want);
        if (!want) {
            running = false;
            cancelAnimationFrame(rafId);
            if (canvas) { canvas.hidden = true; clear(); }
            updateLabel();
            return;
        }
        ensureCanvas();
        canvas.hidden = false;
        canvas.style.opacity = String(cfg.show);
        buildPalette(); resize(); setCount(); setField();
        if (!running) {
            running = true;
            last = performance.now();
            rafId = requestAnimationFrame(frame);
        }
    }

    // One setting changed (Settings → Background): applied at once, saved with the other prefs
    function set(k, v, opts = {}) {
        const next = normalize(Object.assign({}, cfg, { [k]: v }));
        if (opts.save !== false && typeof setPref === 'function') setPref('backdrop', next, { rerender: false });
        cfg = next;
        if (k === 'on') { apply(); return; }
        if (!running) return;
        switch (k) {
            case 'field': case 'fx': case 'fy': setField(); cycleT = 0; break;
            case 'particles': setCount(); break;
            case 'life': particles.forEach(respawn); break;
            case 'zoom': resize(); break;
            case 'color': case 'color2': case 'colorMode': case 'alpha': case 'themeColor': buildPalette(); break;
            case 'label': updateLabel(); break;
            case 'cycle': cycleT = 0; break;
            case 'show': canvas.style.opacity = String(cfg.show); break;
        }
    }

    // The theme changed: lines in its colour
    function themeChanged() { if (running && cfg.themeColor) { buildPalette(); } }

    window.CortexBackdrop = {
        SCHEMA, DEFAULTS, FIELD_NAMES, apply, set, themeChanged, normalize,
        get: () => Object.assign({}, cfg),
        error: () => fieldErr,
        equation: (name) => (FIELDS[name] ? FIELDS[name].eq : '')
    };
    window.addEventListener('DOMContentLoaded', apply);
})();
