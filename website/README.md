# Cortex landing page

Public page: https://donatomartinelli.github.io/cortex/
(served from the portfolio repo: `donatomartinelli.github.io/static/cortex/index.html`)

- `template.html` — the page source. The live command-bar demo runs the app's real
  parser: `/*NL_PARSER*/` is replaced with `tracker-widget/src/js/core/nl-parser.js` at build time.
- `build.py` — builds the public page (full HTML head, Tally waitlist, parser inlined).

Rebuild after editing the template or the parser (from this folder):

    python build.py . ../tracker-widget/src/js/core/nl-parser.js ../../donatomartinelli.github.io/static/cortex/index.html

Then commit and push `static/cortex/index.html` in the portfolio repo.

Waitlist: Tally form `e5a75x` (https://tally.so/r/e5a75x), opened as a popup.
