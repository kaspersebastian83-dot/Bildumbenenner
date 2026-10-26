// Real UI actions and saved PDF/CSV/ZIP bytes, synthetic OPFS projects only.
// PDF assertions resolve the saved cross-reference table, page content and image
// objects. They do not call the app's pagination/numbering functions.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const playwright = require('playwright');
const browserName = process.argv[2] || 'chromium';
const root = path.join(__dirname, '..');
let browser, server;

function pdfPages(bytes) {
  const src = Buffer.from(bytes).toString('latin1');
  assert.ok(src.startsWith('%PDF-1.4'));
  const xref = Number(/startxref\n(\d+)\n%%EOF/.exec(src)[1]);
  const lines = src.slice(xref).split('\n');
  assert.equal(lines[0], 'xref');
  const count = Number(lines[1].split(' ')[1]);
  const offsets = Array.from({ length: count }, (_, i) => Number(lines[i + 2].slice(0, 10)));
  const obj = n => { const a = offsets[n]; assert.ok(src.startsWith(`${n} 0 obj\n`, a)); return src.slice(a, src.indexOf('\nendobj', a)); };
  const kids = /\/Kids \[([^\]]+)\]/.exec(obj(2))[1].match(/\d+ 0 R/g).map(s => Number(s.split(' ')[0]));
  return kids.map(n => {
    const page = obj(n), content = obj(Number(/\/Contents (\d+) 0 R/.exec(page)[1]));
    const ops = content.slice(content.indexOf('stream\n') + 7, content.lastIndexOf('\nendstream'));
    const text = [...ops.matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)].map(m => m[1].replace(/\\([0-7]{1,3}|.)/g, (_, x) => /^[0-7]+$/.test(x) ? String.fromCharCode(parseInt(x, 8)) : x));
    const refs = new Map([...page.matchAll(/\/Im(\d+) (\d+) 0 R/g)].map(m => [m[1], Number(m[2])]));
    const widths = [...ops.matchAll(/\/Im(\d+) Do/g)].map(m => Number(/\/Width (\d+)/.exec(obj(refs.get(m[1])))[1]));
    return { text, widths };
  });
}

// Stored ZIP entries (the app intentionally uses method 0), validated via the
// central directory rather than scanning JPEG bytes for local header signatures.
function zipFiles(bytes) {
  const b = Buffer.from(bytes), end = b.length - 22;
  assert.equal(b.readUInt32LE(end), 0x06054b50);
  const files = new Map(); let at = b.readUInt32LE(end + 16);
  for (let i = 0; i < b.readUInt16LE(end + 10); i++) {
    assert.equal(b.readUInt32LE(at), 0x02014b50); assert.equal(b.readUInt16LE(at + 10), 0);
    const size = b.readUInt32LE(at + 24), nl = b.readUInt16LE(at + 28), el = b.readUInt16LE(at + 30), cl = b.readUInt16LE(at + 32);
    const name = b.subarray(at + 46, at + 46 + nl).toString('utf8'), local = b.readUInt32LE(at + 42);
    const start = local + 30 + b.readUInt16LE(local + 26) + b.readUInt16LE(local + 28);
    files.set(name, b.subarray(start, start + size)); at += 46 + nl + el + cl;
  }
  return files;
}

(async () => {
  server = http.createServer((req, res) => {
    const file = path.join(root, new URL(req.url, 'http://x').pathname.replace(/^\/+/, '') || 'index.html');
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': file.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }); res.end(fs.readFileSync(file));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  browser = await playwright[browserName].launch();
  const url = `http://127.0.0.1:${server.address().port}/index.html`;
  const counts = process.argv[3] ? [Number(process.argv[3])] : [5, 50, 150];
  assert.ok(counts.every(n => [5, 50, 150].includes(n)));
  for (const count of counts) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    try {
      const page = await ctx.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('dialog', d => d.accept());
      await page.goto(url);
      const supported = await page.evaluate(async () => {
        if (!('showDirectoryPicker' in window) || !navigator.storage?.getDirectory) return false;
        try {
          const d = await navigator.storage.getDirectory(), f = await d.getFileHandle('probe', { create: true });
          return !!f.createWritable;
        } catch { return false; }
      });
      if (!supported) { assert.deepEqual(errors, []); console.log(`SKIP (${browserName}, ${count}): kein schreibbarer Ordnerzugriff; keine PDF-/Dateiprüfung`); continue; }
      await page.evaluate(async count => {
        const r = await navigator.storage.getDirectory(), p = await r.getDirectoryHandle('26.0995 Nummerierung', { create: true });
        const d = await p.getDirectoryHandle('Fotos', { create: true }); window.testFotos = d;
        const put = async (dir, name, data) => { const w = await (await dir.getFileHandle(name, { create: true })).createWritable(); await w.write(data); await w.close(); };
        const bilder = {}, reihenfolge = [];
        for (let i = 1; i <= count; i++) {
          const name = `IMG_${String(i).padStart(4, '0')}.jpg`; reihenfolge.push(name);
          const c = document.createElement('canvas'); c.width = 64 + i; c.height = 48;
          const g = c.getContext('2d'); g.fillStyle = `hsl(${i * 29},70%,50%)`; g.fillRect(0, 0, c.width, c.height);
          await put(d, name, await new Promise(r => c.toBlob(r, 'image/jpeg')));
          bilder[name] = { beschreibung: i === 2 ? '' : `Motiv ${String(i).padStart(3, '0')}`, abschnitt: i === 1 ? 'Raum A' : i === 3 ? 'Raum B' : '', probe: `P${i}` };
        }
        await put(p, '_Projekt.json', JSON.stringify({ format: 'mosaik-projekt', version: 1, objekt: 'Fiktives Testobjekt', notizen: 'erhalten' }));
        await put(d, '_Bildumbenenner.json', JSON.stringify({ app: 'Bildumbenenner', format: 1, version: '1.9.4', reihenfolge, bilder,
          benennung: { prefix: 'Test', date: false, num: true, start: 7, digits: 3, sep: '_', spaces: true, uml: false, lower: true, probe: true, discard: 'move', sort: 'name' } }));
        window.showDirectoryPicker = async () => p;
        window.showSaveFilePicker = async o => d.getFileHandle(o.suggestedName, { create: true });
      }, count);
      const rows = page.locator('#list .row'), active = page.locator('#list .row:not(.discarded)');
      const idle = () => page.waitForFunction(() => !document.body.inert && !document.querySelector('#overlay').classList.contains('show'));
      const open = async () => { await page.locator('#btnOpen').click(); await page.waitForFunction(n => !document.body.inert && document.querySelectorAll('#list .row').length === n, count); };
      const snapshot = (target = page) => target.locator('#list .row').evaluateAll(es => es.map(e => ({ name: e.querySelector('.orig').textContent.split(' · ')[0], nr: e.querySelector('.n').textContent, desc: e.querySelector('.desc').value, sec: e.querySelector('.sec').value, section: e.querySelector('.section-status').textContent, probe: e.querySelector('.probe').value, gone: e.classList.contains('discarded'), planned: e.querySelector('.res').title })));
      const readFiles = () => page.evaluate(async () => {
        const out = {}; for await (const [n, h] of window.testFotos.entries()) if (/\.jpg$/i.test(n)) out[n] = Array.from(new Uint8Array(await (await h.getFile()).arrayBuffer())); return out;
      });
      const generated = ext => page.evaluate(async ext => {
        const out = []; for await (const [n, h] of window.testFotos.entries()) if (n.endsWith(ext)) out.push({ name: n, bytes: Array.from(new Uint8Array(await (await h.getFile()).arrayBuffer())) }); return out;
      }, ext);
      const checkNumbers = async () => {
        const all = await snapshot(), used = all.filter(x => !x.gone);
        assert.deepEqual(used.map(x => x.nr), used.map((_, i) => String(i + 1)));
        assert.ok(all.filter(x => x.gone).every(x => x.nr === '–'));
        for (const i of [0, Math.floor(used.length / 2), used.length - 1]) {
          await active.nth(i).locator('.desc').click();
          assert.match(await page.locator('#pvInfo').textContent(), new RegExp(`^Bild ${i + 1} von ${used.length} ·`));
          assert.equal(await page.locator('#pvName').textContent(), used[i].name);
        }
        return used;
      };
      const pdf = async (onlyDesc = false, perPage = 2) => {
        const expected = (await snapshot()).filter(x => !x.gone && (!onlyDesc || x.desc));
        const before = new Set((await generated('.pdf')).map(f => f.name));
        await page.locator('#btnPdf').click(); await page.locator('#zOnly').setChecked(onlyDesc); await page.locator('#zShrink').uncheck();
        await page.locator('#pPer').selectOption(String(perPage));
        if (onlyDesc) assert.match(await page.locator('#zInfo').textContent(), /Bildnummern wie in der Liste/);
        await page.locator('#zOk').click();
        await page.waitForFunction(() => !document.querySelector('#overlay').classList.contains('show') && document.querySelector('#banner .pdfOpen'), null, { timeout: 60000 });
        const files = (await generated('.pdf')).filter(f => !before.has(f.name)); assert.equal(files.length, 1);
        const pages = pdfPages(files[0].bytes), imagePages = pages.filter(p => p.widths.length);
        const captions = imagePages.flatMap(p => p.text.filter(t => /^Bild \d+:?\s*$/.test(t)).map(t => Number(/\d+/.exec(t)[0])));
        assert.deepEqual(captions, expected.map(x => Number(x.nr)), 'Nummern aus der gespeicherten PDF stimmen mit der Liste überein');
        assert.deepEqual(imagePages.flatMap(p => p.widths), expected.map(x => 64 + Number(x.probe.slice(1))), 'Tatsächlich eingebettete Bildobjekte haben die richtige Reihenfolge');
        const descriptions = imagePages.flatMap(p => p.text.filter(t => /^(Motiv \d+|Serie)/.test(t)).map(t => /^(Motiv \d+|Serie)/.exec(t)[0]));
        assert.deepEqual(descriptions, expected.filter(x => x.desc).map(x => x.desc));
        assert.ok(imagePages.every(p => p.widths.length <= perPage));
        let currentSection = '', at = 0;
        for (const t of imagePages.flatMap(p => p.text)) {
          if (/^Raum [AB]( \(Fortsetzung\))?$/.test(t)) currentSection = t.replace(' (Fortsetzung)', '');
          if (/^Bild \d+:?\s*$/.test(t)) {
            const section = /^Abschnitt: (.*?) ·/.exec(expected[at++].section);
            assert.equal(currentSection, section ? section[1] : '', 'Abschnittswechsel im gespeicherten PDF');
          }
        }
        console.log(`PDF OK (${count}): ${expected.length} Bilder, ${perPage}/Seite, Auswahl=${onlyDesc}`);
      };
      await open(); const originals = await readFiles();
      await checkNumbers(); await pdf();
      // Undescribed image 2 keeps its physical name, image 3 uses position 3 + start 7 - 1.
      assert.equal((await snapshot())[2].planned, 'Test_009_P3_Motiv_003.jpg');
      const middle = Math.floor(count / 2); const discarded = (await snapshot())[middle];
      await active.nth(middle).locator('.x').click(); await checkNumbers(); await pdf();
      assert.deepEqual(await readFiles(), originals, 'Aussortieren allein verändert keine Originaldatei');
      await page.locator('#list .discarded .x').click(); await checkNumbers(); await pdf();
      assert.equal((await snapshot())[middle].probe, discarded.probe);
      await active.first().locator('.down').click(); await active.nth(1).locator('.down').click(); await active.nth(2).locator('.up').click();
      await checkNumbers(); await pdf(true); await pdf(false, 1);
      // Real XML input: laboratory references keep the filtered PDF's list numbers.
      await pdf(true);
      const labExpected = (await snapshot()).filter(x => !x.gone && x.desc);
      // Im Projekt kommen die Werte aus ResultKit („Laborergebnisse/_Ergebnisse.json“); erfundener Bericht.
      const ergebnisse = JSON.stringify({ format: 'spektron-ergebnisse', version: 1, projekt: '26.0995', uebernommen: '2026-10-26T10:00:00.000Z', vollstaendig: true, stand: '', offen: [],
        berichte: [{ id: 'b1', bericht: 'TEST-995', labor: 'Testlabor', auftragsreferenz: '26.0995', sources: { xml: 'Fiktiver-Bericht.xml' }, proben: [{ label: 'P1', ref: 'P1', desc: '', werte: [{ p: 'PAK', r: '2', u: 'mg/kg', loq: '0.1' }] }] }] });
      await page.evaluate(async text => { const p = await (await navigator.storage.getDirectory()).getDirectoryHandle('26.0995 Nummerierung'); const d = await p.getDirectoryHandle('Laborergebnisse', { create: true });
        const w = await (await d.getFileHandle('_Ergebnisse.json', { create: true })).createWritable(); await w.write(text); await w.close(); }, ergebnisse);
      await page.locator('#btnLab').click();
      assert.equal(await page.locator('#lFile').count(), 0, 'im Projekt keine XML direkt');
      await page.locator('#lPrev tbody tr').waitFor();
      assert.equal((await page.locator('#lPrev tbody tr td').last().textContent()).replace(/\s/g, ' '), `Bild ${labExpected.find(x => x.probe === 'P1').nr}`);
      await page.locator('#lClose').click();
      assert.deepEqual(await readFiles(), originals, 'Verschieben verändert keine Originaldatei');
      const beforeRename = await snapshot();
      await page.locator('#btnRename').click();
      for (const x of beforeRename.filter(x => x.name !== x.planned)) assert.ok((await page.locator('#dialog .list').textContent()).includes(`${x.name} → ${x.planned}`));
      await page.locator('#dOk').click(); await page.locator('#bUndo').waitFor({ timeout: 60000 }); await idle();
      const afterRename = await checkNumbers(), disk = await readFiles();
      assert.deepEqual(afterRename.map(x => x.name), beforeRename.map(x => x.planned));
      for (const x of beforeRename) assert.deepEqual(disk[x.planned], originals[x.name], 'Bildbytes nach Umbenennen erhalten');
      assert.equal(await page.locator('#btnRename').isDisabled(), true, 'Passende Namen werden nicht erneut umbenannt');
      assert.equal(await page.locator('#sort').inputValue(), 'manual'); await pdf(true);
      await page.locator('#bCsv').click(); await page.waitForFunction(() => /gespeichert/.test(document.getElementById('bCsv').textContent));
      const csv = Buffer.from((await generated('.csv'))[0].bytes).toString('utf8').trim().split('\r\n').slice(1);
      assert.deepEqual(csv.map(s => s.split(';')[0]), afterRename.map(x => x.nr));
      // ZIP's real saved archive includes the same numbers and image bytes.
      await page.locator('#btnZip').click(); await page.locator('#zOnly').uncheck(); await page.locator('#zShrink').uncheck(); await page.locator('#zRecord').uncheck();
      await page.locator('#zOk').click(); await page.waitForFunction(() => !document.querySelector('#overlay').classList.contains('show') && /ZIP/.test(document.querySelector('#banner').textContent), null, { timeout: 60000 });
      const zip = zipFiles((await generated('.zip'))[0].bytes), text = [...zip].find(([n]) => n.endsWith('.txt'))[1].toString('utf8');
      assert.deepEqual([...text.matchAll(/^Bild (\d+)\r?$/gm)].map(m => m[1]), afterRename.map(x => x.nr));
      for (const x of afterRename) assert.deepEqual(zip.get(x.name), Buffer.from(disk[x.name]));
      await active.first().locator('.down').click();
      assert.match(await page.locator('#stats').getAttribute('title'), /Dateinamen passen noch nicht zum Plan/);assert.match(await page.locator('#btnRename').textContent(), /Ausführen: \d+ umbenennen/);
      assert.deepEqual(await readFiles(), disk, 'Nach Umbenennen erneut sortieren ändert keine Dateien');
      await checkNumbers(); await pdf();
      const reordered = await snapshot();
      // Opening another window must read the saved order; Undo remains available
      // only in the original session, as before. Flush through the real export.
      const fresh = await ctx.newPage(); await fresh.goto(url);
      await fresh.evaluate(async () => { window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('26.0995 Nummerierung'); });
      await fresh.locator('#btnOpen').click();
      await fresh.waitForFunction(n => !document.body.inert && document.querySelectorAll('#list .row').length === n, count);
      assert.deepEqual(await snapshot(fresh), reordered, 'Wiederöffnen erhält Reihenfolge, Nummern und Metadaten');
      await fresh.close();
      await page.locator('#bUndo').click(); await idle();
      await page.waitForFunction(() => /Rückgängig gemacht/.test(document.querySelector('#banner').textContent));
      assert.deepEqual(await readFiles(), originals, 'Rückgängig erhält alle Originalbytes und Dateinamen');
      const undone = await checkNumbers();
      assert.deepEqual(undone.map(x => [x.desc, x.sec, x.probe]), beforeRename.map(x => [x.desc, x.sec, x.probe]));
      // Name sort with numbering disabled used to reorder renamed descriptions on reload.
      await page.locator('#btnNaming').click(); await page.locator('#oNum').uncheck(); await page.locator('#sort').selectOption('name');
      const nameOrder = (await snapshot()).map(x => x.probe);
      await page.locator('#btnRename').click(); await page.locator('#dOk').click(); await page.locator('#bUndo').waitFor({ timeout: 60000 });
      assert.deepEqual((await snapshot()).map(x => x.probe), nameOrder);
      await open(); assert.deepEqual((await snapshot()).map(x => x.probe), nameOrder);
      if (count === 5) {
        // Repeated descriptions cause real filename swaps, not just fresh targets.
        await page.locator('#oNum').check(); await page.locator('#oProbe').uncheck();
        for (let i = 0; i < count; i++) await active.nth(i).locator('.desc').fill('Serie');
        const rename = async () => {
          await page.locator('#btnRename').click(); await page.locator('#dOk').click();
          await page.waitForFunction(() => !document.querySelector('#overlay').classList.contains('show') && document.querySelector('#bUndo'), null, { timeout: 60000 });
        };
        await rename(); const diskBeforeSwap = await readFiles();
        const originalLabels = await active.evaluateAll(es => Object.fromEntries(es.map(e => [e.querySelector('.probe').value, e.querySelector('.orig').textContent])));
        await active.first().locator('.down').click(); const swapped = await snapshot();
        await rename(); await pdf();
        await page.locator('#bUndo').click();
        await page.waitForFunction(() => /Rückgängig gemacht/.test(document.querySelector('#banner').textContent));
        assert.deepEqual(await readFiles(), diskBeforeSwap, 'Namenskreislauf und Undo erhalten Bildbytes');
        assert.deepEqual((await snapshot()).map(x => [x.name, x.probe]), swapped.map(x => [x.name, x.probe]));
        const labelsAfter = await active.evaluateAll(es => Object.fromEntries(es.map(e => [e.querySelector('.probe').value, e.querySelector('.orig').textContent])));
        assert.deepEqual(labelsAfter, originalLabels, 'Originalreferenzen überleben Namenskreislauf und Undo');
      }
      assert.deepEqual(errors, []);
      console.log(`OK (${browserName}, ${count}): Nummern, Vorschau, PDF-Bytes/Bildobjekte, Dateiplan, Umbenennen, CSV/ZIP, Umsortieren, Wiederöffnen und Undo`);
    } finally { await ctx.close(); }
  }
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close(); if (server) await new Promise(r => server.close(r));
});
