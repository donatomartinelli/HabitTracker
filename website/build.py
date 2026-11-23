import sys, os
src_dir, parser_path, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
t = open(os.path.join(src_dir, 'template.html'), encoding='utf-8').read()
p = open(parser_path, encoding='utf-8').read()

def rep(old, new):
    global t
    assert t.count(old) == 1, old[:70]
    t = t.replace(old, new)

# 1. Full standalone document head (no artifact skeleton on GitHub Pages)
rep('<meta charset="utf-8">\n<title>Cortex Landing</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n', '''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Cortex — From idea to done</title>
<meta name="description" content="Cortex is a keyboard-first personal operating system: tasks, day plan, focus, habits, notes and money in one fast, offline place. Type what you mean.">
<meta name="theme-color" content="#000000">
<meta property="og:type" content="website">
<meta property="og:title" content="Cortex — From idea to done">
<meta property="og:description" content="One keyboard-first system for your days. Plan, focus, track habits and money, review your week. Offline first.">
<meta property="og:url" content="https://donatomartinelli.github.io/cortex/">
<meta name="twitter:card" content="summary">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' fill='%23000'/%3E%3Ctext x='16' y='23' font-family='monospace' font-size='20' font-weight='700' text-anchor='middle' fill='%23f4f3ee'%3E%E2%80%BA%3C/text%3E%3C/svg%3E">
''')
rep('</style>\n\n<header class="bar">', '''html { padding-top: env(safe-area-inset-top, 0px); padding-bottom: env(safe-area-inset-bottom, 0px); }
body { margin: 0; }
.join-cta { display: flex; flex-direction: column; gap: .8rem; align-items: flex-start; }
.join-note { font-family: var(--mono); font-size: .75rem; color: var(--dim); }
</style>
</head>
<body>

<header class="bar">''')

# 2. Waitlist: open the Tally form in a popup
start = t.index('        <form id="wait" novalidate>')
end = t.index('        <div class="ok" id="ok" hidden></div>') + len('        <div class="ok" id="ok" hidden></div>')
t = t[:start] + '''        <div class="join-cta">
          <button class="btn" type="button" id="join-btn">[JOIN THE WAITLIST]</button>
          <span class="join-note" id="join-note">Opens a short form: your email and one question.</span>
        </div>''' + t[end:]

# 3. Footer without signature
rep('<div class="wrap"><span>CORTEX · personal operating system</span><span>Made by Donato Martinelli</span></div>',
    '<div class="wrap"><span>CORTEX · personal operating system</span><span><a href="privacy/">Privacy</a> · © 2026</span></div>')

# 4. Script: Tally instead of the draft form handler
s0 = t.index('  // Waitlist (draft)')
s1 = t.index("  $('#email').addEventListener('input', () => { $('#err').textContent = ''; });") + len("  $('#email').addEventListener('input', () => { $('#err').textContent = ''; });")
t = t[:s0] + '''  // Waitlist: Tally form in a popup (falls back to opening the form page)
  const TALLY_FORM_ID = 'e5a75x';
  const joinBtn = $('#join-btn');
  function openWaitlist() {
    if (!TALLY_FORM_ID || TALLY_FORM_ID.startsWith('__')) {
      $('#join-note').textContent = 'The waitlist opens in a few days.';
      return;
    }
    if (window.Tally && typeof window.Tally.openPopup === 'function') {
      window.Tally.openPopup(TALLY_FORM_ID, { layout: 'modal', width: 480, overlay: true, autoClose: 4000 });
    } else {
      window.open('https://tally.so/r/' + TALLY_FORM_ID, '_blank', 'noopener');
    }
  }
  joinBtn.addEventListener('click', openWaitlist);
  document.querySelectorAll('a[href="#join"]').forEach(a => a.addEventListener('click', (e) => {
    if (TALLY_FORM_ID && !TALLY_FORM_ID.startsWith('__')) { e.preventDefault(); openWaitlist(); }
  }));''' + t[s1:]

# 5. Parser + Tally script + close document
t = t.replace('/*NL_PARSER*/', p)
t = t.rstrip() + '\n<script async src="https://tally.so/widgets/embed.js"></script>\n</body>\n</html>\n'

os.makedirs(os.path.dirname(out_path), exist_ok=True)
open(out_path, 'w', encoding='utf-8').write(t)
print('written', len(t))
