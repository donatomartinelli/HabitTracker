// ============================================================================
// NOTES ⇄ MARKDOWN
// Export: a .zip with one Markdown file per folder (Notion, Obsidian, Bear,
// Apple Notes and Google Docs all read it). Import: .md / .txt files or a .zip
// (including Notion's "Markdown & CSV" export). Everything runs on the device.
// ============================================================================

(function () {
    const enc = new TextEncoder();
    const dec = new TextDecoder();

    // ---------- tiny ZIP writer (stored, no compression) ----------
    const CRC_TABLE = (() => {
        const t = new Uint32Array(256);
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
            t[n] = c >>> 0;
        }
        return t;
    })();
    function crc32(bytes) {
        let c = 0xFFFFFFFF;
        for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
        return (c ^ 0xFFFFFFFF) >>> 0;
    }
    function buildZip(files) {
        const chunks = [];
        const central = [];
        let offset = 0;
        const now = new Date();
        const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
        const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
        for (const f of files) {
            const name = enc.encode(f.path);
            const data = enc.encode(f.text);
            const crc = crc32(data);
            const local = new DataView(new ArrayBuffer(30));
            local.setUint32(0, 0x04034b50, true);
            local.setUint16(4, 20, true);
            local.setUint16(6, 0x0800, true); // UTF-8 names
            local.setUint16(8, 0, true);
            local.setUint16(10, dosTime, true);
            local.setUint16(12, dosDate, true);
            local.setUint32(14, crc, true);
            local.setUint32(18, data.length, true);
            local.setUint32(22, data.length, true);
            local.setUint16(26, name.length, true);
            local.setUint16(28, 0, true);
            chunks.push(new Uint8Array(local.buffer), name, data);

            const cen = new DataView(new ArrayBuffer(46));
            cen.setUint32(0, 0x02014b50, true);
            cen.setUint16(4, 20, true);
            cen.setUint16(6, 20, true);
            cen.setUint16(8, 0x0800, true);
            cen.setUint16(10, 0, true);
            cen.setUint16(12, dosTime, true);
            cen.setUint16(14, dosDate, true);
            cen.setUint32(16, crc, true);
            cen.setUint32(20, data.length, true);
            cen.setUint32(24, data.length, true);
            cen.setUint16(28, name.length, true);
            cen.setUint32(42, offset, true);
            central.push(new Uint8Array(cen.buffer), name);
            offset += 30 + name.length + data.length;
        }
        const cenSize = central.reduce((s, c) => s + c.length, 0);
        const end = new DataView(new ArrayBuffer(22));
        end.setUint32(0, 0x06054b50, true);
        end.setUint16(8, files.length, true);
        end.setUint16(10, files.length, true);
        end.setUint32(12, cenSize, true);
        end.setUint32(16, offset, true);
        return new Blob([...chunks, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
    }

    // ---------- tiny ZIP reader (stored + deflate) ----------
    async function inflateRaw(bytes) {
        if (typeof DecompressionStream !== 'function') throw new Error('This device cannot open compressed zip files');
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        return new Uint8Array(await new Response(stream).arrayBuffer());
    }
    async function readZip(buffer) {
        const view = new DataView(buffer);
        const bytes = new Uint8Array(buffer);
        let eocd = -1;
        for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 66000); i--) {
            if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
        }
        if (eocd < 0) throw new Error('Not a valid zip file');
        const count = view.getUint16(eocd + 10, true);
        let p = view.getUint32(eocd + 16, true);
        const out = [];
        for (let n = 0; n < count; n++) {
            if (view.getUint32(p, true) !== 0x02014b50) break;
            const method = view.getUint16(p + 10, true);
            const compSize = view.getUint32(p + 20, true);
            const nameLen = view.getUint16(p + 28, true);
            const extraLen = view.getUint16(p + 30, true);
            const commentLen = view.getUint16(p + 32, true);
            const localOff = view.getUint32(p + 42, true);
            const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
            p += 46 + nameLen + extraLen + commentLen;
            if (name.endsWith('/')) continue;
            const lNameLen = view.getUint16(localOff + 26, true);
            const lExtraLen = view.getUint16(localOff + 28, true);
            const start = localOff + 30 + lNameLen + lExtraLen;
            const raw = bytes.subarray(start, start + compSize);
            let data;
            if (method === 0) data = raw;
            else if (method === 8) data = await inflateRaw(raw);
            else continue;
            out.push({ name, data });
        }
        return out;
    }

    // ---------- Cortex notes ⇄ Markdown ----------
    const SAFE = s => String(s).replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim() || 'Untitled';

    function folderToMarkdown(folder) {
        const cards = parseCategoryIntoCards(notesContent[folder] || '');
        const title = folder.split(' / ').pop();
        const parts = cards.map(c => (c.isHeadered && c.headerLabel ? `## ${c.headerLabel}\n\n${c.body}` : c.body).trim()).filter(Boolean);
        return `# ${title}\n\n${parts.join('\n\n---\n\n')}\n`;
    }

    function exportNotesMarkdown() {
        if (typeof syncNotesCategoriesState === 'function') syncNotesCategoriesState();
        const folders = [...new Set([...(noteCategories || []), ...Object.keys(notesContent || {})])]
            .filter(f => String(notesContent[f] || '').trim());
        if (!folders.length) {
            if (typeof showToast === 'function') showToast('[NOTES] Nothing to export yet.');
            return;
        }
        const files = folders.map(f => ({ path: 'Cortex notes/' + f.split(' / ').map(SAFE).join('/') + '.md', text: folderToMarkdown(f) }));
        const blob = buildZip(files);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `cortex_notes_${formatDate(new Date())}.zip`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        if (typeof showToast === 'function') showToast(`[NOTES] Exported ${folders.length} folder${folders.length === 1 ? '' : 's'} as Markdown.`);
    }

    // Notion appends a 32-char id to every page name: "Ideas 1a2b…" → "Ideas"
    const cleanName = s => SAFE(s.replace(/\.(md|markdown|txt)$/i, '').replace(/\s+[0-9a-f]{32}$/i, ''));

    function markdownToCards(text, fallbackTitle) {
        let body = String(text).replace(/\r\n?/g, '\n').trim();
        let title = fallbackTitle;
        const h1 = body.match(/^#\s+(.+)\n?/);
        if (h1) { title = h1[1].trim(); body = body.slice(h1[0].length).trim(); }
        // A file exported by Cortex: cards separated by "---"
        const pieces = body.split(/\n\s*---\s*\n/).map(s => s.trim()).filter(Boolean);
        const cards = (pieces.length > 1 ? pieces : [body]).filter(Boolean).map(piece => {
            const h2 = piece.match(/^##\s+(.+)\n?/);
            if (h2) return { isHeadered: true, headerLabel: h2[1].trim(), body: piece.slice(h2[0].length).trim() };
            return pieces.length > 1
                ? { isHeadered: false, headerLabel: null, body: piece }
                : { isHeadered: true, headerLabel: title, body: piece };
        });
        return { title, cards };
    }

    function addCardsToFolder(folder, cards) {
        const existing = parseCategoryIntoCards(notesContent[folder] || '');
        const key = c => `${c.headerLabel || ''}
${(c.body || '').trim()}`;
        const seen = new Set(existing.map(key));
        // Skip notes that are already there (importing the same file twice)
        const fresh = cards.filter(c => (c.body || c.headerLabel) && !seen.has(key(c)));
        if (!fresh.length) return 0;
        if (!noteCategories.includes(folder)) noteCategories.push(folder);
        // Untitled notes go first: after a titled note they would merge into it
        const all = [...existing, ...fresh];
        const ordered = [...all.filter(c => !c.isHeadered), ...all.filter(c => c.isHeadered)];
        notesContent[folder] = rebuildCategoryFromCards(ordered);
        return fresh.length;
    }

    async function importNotesFiles(fileList) {
        const files = [...(fileList || [])];
        if (!files.length) return;
        let entries = [];
        try {
            for (const f of files) {
                if (/\.zip$/i.test(f.name)) {
                    const inner = await readZip(await f.arrayBuffer());
                    for (const e of inner) {
                        if (/\.zip$/i.test(e.name)) {
                            // Notion sometimes nests a second zip inside the first
                            (await readZip(e.data.buffer.slice(e.data.byteOffset, e.data.byteOffset + e.data.byteLength)))
                                .forEach(x => entries.push(x));
                        } else entries.push(e);
                    }
                } else {
                    entries.push({ name: f.name, data: new Uint8Array(await f.arrayBuffer()) });
                }
            }
        } catch (err) {
            if (typeof showToast === 'function') showToast(`[NOTES] Import failed: ${err.message || err}`);
            return;
        }
        entries = entries.filter(e => /\.(md|markdown|txt)$/i.test(e.name));
        if (!entries.length) {
            if (typeof showToast === 'function') showToast('[NOTES] No Markdown or text files found.');
            return;
        }
        let total = 0;
        const touched = new Set();
        for (const e of entries) {
            // Notion wraps everything in an "Export-<id>" folder: drop it
            const segs = e.name.split('/').filter(Boolean).filter((x, i) => !(i === 0 && /^Export-[0-9a-f-]+$/i.test(x)));
            const fileTitle = cleanName(segs.pop());
            // Cortex's own export: "Cortex notes/<folder>/<sub>.md" → back to that folder
            const fromCortex = segs[0] === 'Cortex notes';
            const dirs = (fromCortex ? segs.slice(1) : segs).map(cleanName);
            const { cards } = markdownToCards(dec.decode(e.data), fileTitle);
            const folder = fromCortex
                ? [...dirs, fileTitle].join(' / ')
                : ['Imported', ...dirs].join(' / ');
            total += addCardsToFolder(folder, cards);
            touched.add(folder);
        }
        if (typeof saveData === 'function') saveData();
        if (typeof renderNoteCategories === 'function') renderNoteCategories();
        if (typeof refreshNotesView === 'function') refreshNotesView();
        if (typeof renderNotesManager === 'function') renderNotesManager();
        if (typeof showToast === 'function') showToast(`[NOTES] Imported ${total} note${total === 1 ? '' : 's'} into ${touched.size} folder${touched.size === 1 ? '' : 's'}.`);
    }

    function pickNotesToImport() {
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.accept = '.md,.markdown,.txt,.zip,text/markdown,text/plain,application/zip';
        input.onchange = () => importNotesFiles(input.files);
        input.click();
    }

    window.exportNotesMarkdown = exportNotesMarkdown;
    window.pickNotesToImport = pickNotesToImport;
    window.importNotesFiles = importNotesFiles;
    window.__cortexZip = { buildZip, readZip, markdownToCards }; // for tests
})();
