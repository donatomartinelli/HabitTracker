// --- js/core/motion.js ---
// MOTION: small, quick animations that show what just happened.
//
// Cortex redraws its views from scratch (Today every minute, after every action), so nothing could
// move: things simply jumped. These helpers make the changes visible without making the page dance:
//   transition(fn)   → runs fn (which redraws) as a view transition: rows that move slide to their
//                      new place (a ticked task goes to the bottom), the rest stays still
//   mark(kind, id)   → "this just changed": the next drawing gives it its one-off animation
//                      (the box pops, the line strikes through, the meal flashes green)
//   snapshot(root) / replay(root, snap) → around a redraw: bars glide from their old width and
//                      numbers count up from their old value, instead of jumping
// Only real changes animate: the automatic redraw every minute keeps everything still.
// With "reduce motion" on in the system, none of this runs (base.css also stops CSS animations).

(function () {
    'use strict';

    const mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    const reduced = () => Boolean(mq && mq.matches);

    // ------------------------------------------------------------------
    // Slide what moved (View Transitions, where the browser has them)
    // ------------------------------------------------------------------
    let busy = false;
    function transition(fn) {
        if (reduced() || busy || typeof document.startViewTransition !== 'function' || document.visibilityState !== 'visible') {
            fn();
            return;
        }
        busy = true;
        // The change must happen even when the browser paints nothing (window minimised, hidden):
        // if the transition has not started within 150 ms, it is applied right away
        let ran = false;
        const once = () => { if (ran) return; ran = true; fn(); };
        const safety = setTimeout(() => { once(); busy = false; }, 150);
        try {
            const vt = document.startViewTransition(() => { clearTimeout(safety); once(); });
            vt.finished.finally(() => { clearTimeout(safety); busy = false; });
        } catch (e) {
            clearTimeout(safety);
            busy = false;
            once();
        }
    }
    // A name for view-transition-name (letters, digits, - and _ only)
    const vtName = (kind, id) => `${kind}-${String(id).replace(/[^a-zA-Z0-9_-]/g, '_')}`;

    // ------------------------------------------------------------------
    // "Just changed" marks, read by the next drawing
    // ------------------------------------------------------------------
    const marks = new Map();
    function mark(kind, id) { marks.set(`${kind}:${id}`, Date.now()); }
    function isJust(kind, id) {
        const at = marks.get(`${kind}:${id}`);
        if (!at) return false;
        if (Date.now() - at > 1500) { marks.delete(`${kind}:${id}`); return false; }
        return true;
    }

    // ------------------------------------------------------------------
    // Bars that glide, numbers that count
    // ------------------------------------------------------------------
    // Bars:    an element with data-glide="key" whose first child (or itself, with data-glide-self) has a width in %
    // Numbers: an element with data-count="key" data-count-to="123" data-count-fmt="dur|num"
    function snapshot(root) {
        const snap = { bars: new Map(), counts: new Map() };
        if (!root) return snap;
        root.querySelectorAll('[data-glide]').forEach(el => {
            const fill = el.hasAttribute('data-glide-self') ? el : el.firstElementChild;
            if (fill && fill.style.width) snap.bars.set(el.dataset.glide, fill.style.width);
        });
        root.querySelectorAll('[data-count]').forEach(el => {
            const v = parseFloat(el.dataset.countTo);
            if (Number.isFinite(v)) snap.counts.set(el.dataset.count, v);
        });
        return snap;
    }

    const fmtDur = (m) => {
        m = Math.max(0, Math.round(m));
        if (m < 60) return `${m}m`;
        const h = Math.floor(m / 60), r = m % 60;
        return r ? `${h}h${String(r).padStart(2, '0')}` : `${h}h`;
    };
    const fmtNum = (n) => Math.round(n).toLocaleString('en-US');

    function replay(root, snap) {
        if (!root || !snap || reduced()) return;
        root.querySelectorAll('[data-glide]').forEach(el => {
            const fill = el.hasAttribute('data-glide-self') ? el : el.firstElementChild;
            const from = snap.bars.get(el.dataset.glide);
            if (!fill || !from || from === fill.style.width) return;
            const to = fill.style.width;
            fill.style.transition = 'none';
            fill.style.width = from;
            void fill.offsetWidth;                       // start from the old width
            fill.style.transition = '';
            fill.classList.add('is-gliding');
            fill.style.width = to;
            setTimeout(() => fill.classList.remove('is-gliding'), 700);
        });
        root.querySelectorAll('[data-count]').forEach(el => {
            const from = snap.counts.get(el.dataset.count);
            const to = parseFloat(el.dataset.countTo);
            if (!Number.isFinite(from) || !Number.isFinite(to) || from === to) return;
            const fmt = el.dataset.countFmt === 'dur' ? fmtDur : fmtNum;
            const final = el.textContent;
            const t0 = performance.now();
            const step = (t) => {
                if (!el.isConnected) return;
                const k = Math.min(1, (t - t0) / 600);
                const v = from + (to - from) * (1 - Math.pow(1 - k, 3));
                el.textContent = k < 1 ? fmt(v) : final;
                if (k < 1) requestAnimationFrame(step);
            };
            requestAnimationFrame(step);
        });
    }

    // Redraw a view with all of the above: what moved slides, bars glide, numbers count
    function redraw(root, draw) {
        const snap = snapshot(root);
        draw();
        replay(root, snap);
    }

    window.CortexMotion = { reduced, transition, vtName, mark, isJust, snapshot, replay, redraw };
})();
