const { waitForAsync } = require('./await-condition.cjs');
// FotoKit 1.33.0 – unterbrochenes Umbenennen im echten Browser (nur synthetische OPFS-Projekte):
//  • Abbruch in Phase 2 (ein Foto schon am Ziel, eins unter „umb-tmp_…“): Öffnen setzt beide auf die alten Namen zurück, Journal weg,
//    Beschreibungen hängen wieder an den richtigen Fotos (Inhalte unterscheiden sich → keine vertauschten Namen)
//  • Abbruch in Phase 1 und Datenstand schon gespeichert („umbenennenFertig“): neue Namen bleiben, Journal weg
//  • „umb-tmp_…“ ohne Journal: Hinweis statt stillem Ausblenden
//  • echtes Umbenennen über die Oberfläche hinterlässt weder Journal noch Marken
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const playwright = require('playwright');
const name = process.argv[2] || 'chromium';
const root = path.join(__dirname, '..');
const archiveName = 'Journal-Testarchiv';
const projNr = '26.0803 Journal';
let browser, server;

(async () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  server = http.createServer((req, res) => {
    const f = path.join(root, new URL(req.url, 'http://x').pathname.replace(/^\/+/, '') || 'index.html');
    if (!f.startsWith(root + path.sep) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
    res.end(f.endsWith('index.html') ? html : fs.readFileSync(f));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/index.html`;
  browser = await playwright[name].launch();

  // Zustand je Szenario: Dateien im Fotoordner (Name → 'A'|'B'), optional Journal-Dateien, Projektdaten
  async function scenario(title, setup, check) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    try {
      const page = await ctx.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      await page.goto(base);
      const supported = await page.evaluate(async () => {
        try { const r = await navigator.storage.getDirectory(), h = await r.getFileHandle('probe', { create: true });
          if (!('showDirectoryPicker' in window) || !h.createWritable) return false;
          const w = await h.createWritable(); await w.write('test'); await w.close(); await r.removeEntry('probe'); return true;
        } catch (e) { return false; }
      });
      if (!supported) { assert.deepEqual(errors, []); console.log(`SKIP (${name}): ${title} – kein schreibbarer Ordnerzugriff`); return; }
      await page.evaluate(async ({ archiveName, projNr, setup }) => {
        const r = await navigator.storage.getDirectory(), a = await r.getDirectoryHandle(archiveName, { create: true });
        const put = async (d, n, data) => { const w = await (await d.getFileHandle(n, { create: true })).createWritable(); await w.write(data); await w.close(); };
        const dec = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
        const pad = (u, n) => { const o = new Uint8Array(u.length + n); o.set(u); return o; };   // Anhang nach IEND ändert nur die Größe
        const bytes = { A: dec('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAE0lEQVR4nGP4z8DwnwGM/zMwAAAf7gP9NRsAMwAAAABJRU5ErkJggg=='), B: pad(dec('iVBORw0KGgoAAAANSUhEUgAAAAYAAAAGCAIAAABvrngfAAAAEklEQVR4nGP4z8CAhtD5VBYCACDCI91DmLRuAAAAAElFTkSuQmCC'), 300) };   // verschieden große Bilder – Inhalt entscheidet, welches Foto welches ist
        const p = await a.getDirectoryHandle(projNr, { create: true }), f = await p.getDirectoryHandle('Fotos', { create: true });
        await put(p, '_Projekt.json', JSON.stringify({ format: 'mosaik-projekt', version: 1, objekt: 'Objekt', sachverstaendiger: 'Testperson' }, null, 2));
        const data = { app: 'FotoKit', format: 1, version: '1.32.0', projekt: { proj: projNr.split(' ')[0], objekt: 'Objekt' },
          benennung: { prefix: '', date: false, num: true, start: 1, digits: 2, sep: '_', spaces: true, uml: false, lower: true, probe: true, discard: 'move', sort: 'manual' },
          reihenreihenfolge: undefined, ...setup.daten };
        delete data.reihenreihenfolge;
        await put(f, '_Bildumbenenner.json', JSON.stringify(data, null, 2) + '\n');
        for (const [n, k] of Object.entries(setup.fotos)) await put(f, n, bytes[k]);
        for (const [n, text] of Object.entries(setup.dazu || {})) await put(f, n, text);
        window.showDirectoryPicker = () => a.getDirectoryHandle(projNr);
      }, { archiveName, projNr, setup });
      const snapshot = async () => {
        const h = await waitForAsync(page, async ({ archiveName, projNr }) => {
          const f = await (await (await (await navigator.storage.getDirectory()).getDirectoryHandle(archiveName)).getDirectoryHandle(projNr)).getDirectoryHandle('Fotos');
          const out = {};
          for await (const [n, e] of f.entries()) if (e.kind === 'file') { const file = await e.getFile(); out[n] = file.size; }
          return out;
        }, { archiveName, projNr });
        try { return await h.jsonValue(); } finally { await h.dispose(); }
      };
      await page.locator('#btnOpen').click();
      await page.waitForFunction(nr => !document.body.inert && document.querySelector('#projBadge') && document.querySelector('#projBadge').textContent.includes(nr), projNr.split(' ')[0]);
      await check({ page, snapshot });
      assert.deepEqual(errors, [], 'Keine JavaScript-/Konsolenfehler');
      console.log(`OK (${name}): ${title}`);
    } finally { await ctx.close(); }
  }

  const SIZE = { A: null, B: null };   // Bildgrößen werden beim ersten Szenario ermittelt (Canvas-JPEG je Browser verschieden)
  const rows = page => page.evaluate(() => [...document.querySelectorAll('#list .row')].map(r => ({ desc: r.querySelector('.desc').value, name: (r.querySelector('.nm') || r.querySelector('.name') || { textContent: '' }).textContent })));
  const JOURNAL = (stempel, paare) => JSON.stringify({ app: 'FotoKit', art: 'umbenennen-journal', format: 1, version: '1.33.0', lauf: 'umbenennen', stempel, am: '2026-10-31T10:00:00.000Z', ordner: 'Fotos',
    paare: paare.map(([von, nach], i) => ({ von, vorlaeufig: `umb-tmp_${stempel}_${i}.png`, nach })) }, null, 2) + '\n';

  // 1) Abbruch in Phase 2: IMG_0001 (A) schon als 01_P1_Decke.png, IMG_0002 (B) noch unter vorläufigem Namen
  await scenario('Abbruch in Phase 2: beim Öffnen alte Namen zurück, Beschreibungen am richtigen Foto', {
    daten: { reihenfolge: ['IMG_0001.png', 'IMG_0002.png'],
      bilder: { 'IMG_0001.png': { beschreibung: 'Decke', abschnitt: 'Küche', probe: 'P1' }, 'IMG_0002.png': { beschreibung: 'Wand', abschnitt: 'Flur' } } },
    fotos: { '01_P1_Decke.png': 'A', 'umb-tmp_abc1_1.png': 'B' },
    dazu: { '_Umbenennen-Journal_abc1.json': JOURNAL('abc1', [['IMG_0001.png', '01_P1_Decke.png'], ['IMG_0002.png', '02_Wand.png']]), '_Umbenennen-Journal_abc1.phase2': '' }
  }, async ({ page, snapshot }) => {
    await page.waitForFunction(() => document.querySelectorAll('#list .row').length === 2);
    assert.match(await page.locator('#banner').textContent(), /zurückgesetzt: 2 Fotos haben wieder den alten Namen/);
    const files = await snapshot();
    assert.deepEqual(Object.keys(files).filter(n => n !== '_Bildumbenenner.json').sort(), ['IMG_0001.png', 'IMG_0002.png'], 'alte Namen, kein Journal, keine Marke, kein Hilfsname');
    assert.ok(files['IMG_0001.png'] < files['IMG_0002.png'], 'Foto A (kleinere Datei) liegt wieder unter IMG_0001, Foto B unter IMG_0002');
    const r = await rows(page); assert.deepEqual(r.map(x => x.desc), ['Decke', 'Wand'], 'Beschreibungen stehen am richtigen Foto');
  });

  // 2) Datenstand schon gespeichert (umbenennenFertig) → neue Namen bleiben, Journal wird nur aufgeräumt
  await scenario('Datenstand schon gespeichert: neue Namen bleiben, Journal weg', {
    daten: { umbenennenFertig: 'abc2', reihenfolge: ['01_P1_Decke.png', '02_Wand.png'],
      bilder: { '01_P1_Decke.png': { beschreibung: 'Decke', probe: 'P1' }, '02_Wand.png': { beschreibung: 'Wand' } } },
    fotos: { '01_P1_Decke.png': 'A', '02_Wand.png': 'B' },
    dazu: { '_Umbenennen-Journal_abc2.json': JOURNAL('abc2', [['IMG_0001.png', '01_P1_Decke.png'], ['IMG_0002.png', '02_Wand.png']]), '_Umbenennen-Journal_abc2.phase2': '' }
  }, async ({ page, snapshot }) => {
    await page.waitForFunction(() => document.querySelectorAll('#list .row').length === 2);
    assert.doesNotMatch(await page.locator('#banner').textContent(), /zurückgesetzt/);
    const files = await snapshot();
    assert.deepEqual(Object.keys(files).filter(n => n !== '_Bildumbenenner.json').sort(), ['01_P1_Decke.png', '02_Wand.png']);
    assert.deepEqual((await rows(page)).map(x => x.desc), ['Decke', 'Wand']);
  });

  // 3) Hilfsnamen ohne Journal → sichtbarer Hinweis, nichts angefasst
  await scenario('umb-tmp_ ohne Journal: Hinweis statt stillem Ausblenden', {
    daten: { reihenfolge: ['IMG_0001.png'], bilder: { 'IMG_0001.png': { beschreibung: 'Decke' } } },
    fotos: { 'IMG_0001.png': 'A', 'umb-tmp_zzz_0.png': 'B' }
  }, async ({ page, snapshot }) => {
    await page.waitForFunction(() => document.querySelectorAll('#list .row').length === 1);
    assert.match(await page.locator('#banner').textContent(), /1 Datei mit vorläufigem Namen \(z\. B\. „umb-tmp_zzz_0\.png“\)/);
    assert.deepEqual(Object.keys(await snapshot()).sort(), ['IMG_0001.png', '_Bildumbenenner.json', 'umb-tmp_zzz_0.png']);
  });

  // 4) echtes Umbenennen über die Oberfläche: danach weder Journal noch Marken im Ordner
  await scenario('Umbenennen über die Oberfläche hinterlässt kein Journal', {
    daten: { reihenfolge: ['IMG_0001.png', 'IMG_0002.png'],
      bilder: { 'IMG_0001.png': { beschreibung: 'Decke', abschnitt: 'Küche', probe: 'P1' }, 'IMG_0002.png': { beschreibung: 'Wand', abschnitt: 'Flur' } } },
    fotos: { 'IMG_0001.png': 'A', 'IMG_0002.png': 'B' }
  }, async ({ page, snapshot }) => {
    await page.waitForFunction(() => document.querySelectorAll('#list .row').length === 2);
    await page.locator('#btnRename').click(); await page.locator('#dOk').click(); await page.locator('#bUndo').waitFor();
    let files = await snapshot();
    assert.deepEqual(Object.keys(files).filter(n => n !== '_Bildumbenenner.json' && !n.startsWith('_FotoKit')).sort(), ['01_P1_Decke.png', '02_Wand.png'], 'neue Namen, kein Journal, keine Marke');
    await page.locator('#bUndo').click(); await page.waitForFunction(() => document.querySelector('#banner').textContent.includes('Rückgängig gemacht'));
    files = await snapshot();
    assert.deepEqual(Object.keys(files).filter(n => n !== '_Bildumbenenner.json').sort(), ['IMG_0001.png', 'IMG_0002.png'], 'nach Rückgängig: alte Namen, kein Journal');
  });
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); if (server) server.close(); });
