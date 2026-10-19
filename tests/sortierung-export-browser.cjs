// FotoKit 1.8: Projekt für einen direkt gewählten „Fotos“-Ordner, Sortierung nach Abschnitt, PDF-Dateiname ohne Überschreiben.
// node tests/sortierung-export-browser.cjs [chromium|webkit]
//  • „Fotos“ direkt gewählt → Projekt über den Archivordner erkannt; ohne Archivordner „Projekt zuordnen …“ (Projektordner wählen)
//  • Projektdaten-Dialog zeigt Auftraggeber und Schaden-Nr. aus _Projekt.json (nur lesbar)
//  • „nach Abschnitt (Begehung)“: Abschnitte in der Reihenfolge ihres ersten Vorkommens, geerbte Abschnitte werden fest eingetragen,
//    Bildnummern laufen neu, Reihenfolge danach „manuell“, „Rückgängig“ stellt alles wieder her
//  • PDF: „Bilddokumentation_<Nr>_<Ort>_<JJJJ-MM-TT>.pdf“ im Ordner Fotos, zweites PDF am selben Tag → „… (2).pdf“
// Ordner werden im Origin Private File System nachgebildet, showDirectoryPicker wird ersetzt. WebKit kann keine Ordner beschreiben – dort nur Laden.
process.env.TZ = 'Europe/Berlin';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const playwright = require('playwright');

const name = process.argv[2] || 'chromium';
const root = path.join(__dirname, '..');
const PROJ = '26.0177 Bad Teststadt';

(async () => {
  const server = http.createServer((req, res) => {
    const f = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html');
    if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()){ res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }); res.end(fs.readFileSync(f));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/index.html`;
  const browser = await playwright[name].launch();
  const page = await (await browser.newContext({ viewport: { width: 1300, height: 900 } })).newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('dialog', d => d.accept());
  await page.goto(base);
  await page.waitForSelector('#btnOpen');

  const kann = await page.evaluate(async () => {
    if (!('showDirectoryPicker' in window) || !navigator.storage || !navigator.storage.getDirectory) return false;
    try{ const r = await navigator.storage.getDirectory(); const h = await r.getFileHandle('probe', { create: true }); if (!h.createWritable) return false; await r.removeEntry('probe'); return true; }catch(e){ return false; }
  });
  if (!kann){
    assert.deepEqual(errors, []);
    await browser.close(); server.close();
    console.log(`OK (${name}, ohne Ordnerzugriff: nur Laden geprüft)`);
    return;
  }

  // Archivordner › Projekt › Fotos mit 5 Bildern, _Projekt.json mit Auftraggeber und Schaden-Nr.
  const anlegen = (mitArchiv) => page.evaluate(async ([proj, mitArchiv]) => {
    const r = await navigator.storage.getDirectory();
    for await (const [n] of r.entries()) await r.removeEntry(n, { recursive: true });
    const archiv = await r.getDirectoryHandle('Archiv', { create: true });
    const p = await archiv.getDirectoryHandle(proj, { create: true });
    const fotos = await p.getDirectoryHandle('Fotos', { create: true });
    // 4×4 JPEG-fähiges PNG genügt für die Liste; für das PDF zählt nur, dass die Datei lesbar ist
    const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), c => c.charCodeAt(0));
    for (let i = 1; i <= 5; i++){ const w = await (await fotos.getFileHandle(`IMG_000${i}.png`, { create: true })).createWritable(); await w.write(png); await w.close(); }
    const w = await (await p.getFileHandle('_Projekt.json', { create: true })).createWritable();
    await w.write(JSON.stringify({ format: 'mosaik-projekt', version: 1, objekt: 'EFH, Badweg 5', auftraggeber: 'Muster Versicherung AG', schadennummer: 'S-4711' })); await w.close();
    await new Promise((res, rej) => { const q = indexedDB.open('mosaik-suite', 1); q.onupgradeneeded = () => q.result.createObjectStore('kv');
      q.onsuccess = () => { const t = q.result.transaction('kv', 'readwrite'); const st = t.objectStore('kv'); mitArchiv ? st.put(archiv, 'archiv') : st.delete('archiv');
        t.oncomplete = () => res(); t.onerror = () => rej(t.error); }; q.onerror = () => rej(q.error); });
  }, [PROJ, mitArchiv]);
  // the next showDirectoryPicker returns this folder (path below the OPFS root)
  const naechsterPicker = pfad => page.evaluate(pfad => {
    window.showDirectoryPicker = async () => { let d = await navigator.storage.getDirectory(); for (const n of pfad) d = await d.getDirectoryHandle(n); return d; };
  }, pfad);
  const badge = () => page.locator('#projBadge').evaluate(e => e.hidden ? '' : e.textContent.trim());

  // 1a) „Fotos“ direkt gewählt, Archivordner bekannt → Projekt erkannt
  await anlegen(true);
  await page.reload(); await page.waitForSelector('#btnOpen');
  await naechsterPicker(['Archiv', PROJ, 'Fotos']);
  await page.locator('#btnOpen').click();
  await page.waitForFunction(() => !document.getElementById('btnMeta').disabled);
  assert.equal((await badge()).replace(/\s+/g, ' '), '26.0177 Bad Teststadt', 'Projekt über den Archivordner erkannt');

  // 1b) ohne Archivordner: „Projekt zuordnen …“ → Projektordner wählen
  await anlegen(false);
  await page.reload(); await page.waitForSelector('#btnOpen');
  await naechsterPicker(['Archiv', PROJ, 'Fotos']);
  await page.locator('#btnOpen').click();
  await page.waitForSelector('#btnAssign');
  assert.equal(await badge(), '', 'Projekt zunächst unbekannt');
  // falscher Ordner wird abgelehnt
  await naechsterPicker(['Archiv']);
  await page.locator('#btnAssign').click();
  await page.waitForFunction(() => /nicht der Projektordner/.test(document.getElementById('banner').textContent));
  await naechsterPicker(['Archiv', PROJ]);
  await page.locator('#btnAssign').click();
  await page.waitForFunction(() => /zugeordnet/.test(document.getElementById('banner').textContent));
  assert.equal((await badge()).replace(/\s+/g, ' '), '26.0177 Bad Teststadt', 'Projekt zugeordnet');

  // Dialog: Projektdaten übernommen, Auftraggeber/Schaden-Nr. nur lesbar
  await page.locator('#btnMeta').click();
  assert.equal(await page.locator('#m_objekt').inputValue(), 'EFH, Badweg 5');
  assert.equal(await page.locator('#m_proj').inputValue(), '26.0177');
  assert.equal(await page.locator('#m_pz_auftraggeber').inputValue(), 'Muster Versicherung AG');
  assert.equal(await page.locator('#m_pz_schadennummer').inputValue(), 'S-4711');
  assert.equal(await page.locator('#m_pz_auftraggeber').getAttribute('readonly'), '');
  await page.locator('#zCancel').click();

  // 2) Abschnitte: 1 Flur · 2 (erbt Flur) · 3 Küche · 4 Flur · 5 (erbt Flur) → Flur 1,2,4,5 · Küche 3
  const rows = page.locator('#list .row');
  const secs = ['Flur', '', 'Küche', 'flur ', ''];
  for (let i = 0; i < 5; i++){
    await rows.nth(i).locator('.desc').fill(`Bild ${i + 1}`);
    if (secs[i]) await rows.nth(i).locator('.sec').fill(secs[i]);
  }
  const liste = () => page.evaluate(() => [...document.querySelectorAll('#list .row')].map(r => [r.querySelector('.desc').value, r.querySelector('.sec').value, r.querySelector('.n').textContent.trim()]));
  const vorher = await liste();
  await page.locator('#sort').selectOption('section');
  await page.waitForFunction(() => /Nach Abschnitt sortiert/.test(document.getElementById('banner').textContent));
  const nachher = await liste();
  assert.deepEqual(nachher.map(r => r[0]), ['Bild 1', 'Bild 2', 'Bild 4', 'Bild 5', 'Bild 3'], 'Reihenfolge der Begehung');
  assert.deepEqual(nachher.map(r => r[1]), ['Flur', 'Flur', 'flur ', 'flur', 'Küche'], 'geerbte Abschnitte fest eingetragen');
  assert.deepEqual(nachher.map(r => r[2]), vorher.map(r => r[2]), 'Bildnummern laufen fortlaufend weiter');
  assert.equal(await page.locator('#sort').inputValue(), 'manual', 'danach manuell (Drag & Drop bleibt)');
  assert.match(await page.locator('#banner').textContent(), /2 Abschnitte.*2 Bild\(er\)/);
  await page.locator('#bUndoSec').click();
  assert.deepEqual(await liste(), vorher, 'Rückgängig stellt Reihenfolge und Abschnitte wieder her');
  await page.locator('#sort').selectOption('section');
  await page.waitForFunction(() => /Nach Abschnitt sortiert/.test(document.getElementById('banner').textContent));

  // 3) PDF zweimal → zweiter Name mit „(2)“, nichts überschrieben
  const heute = await page.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
  const soll = `Bilddokumentation_26.0177_Bad Teststadt_${heute}`;
  const pdfs = () => page.evaluate(async proj => {
    const f = await (await (await (await navigator.storage.getDirectory()).getDirectoryHandle('Archiv')).getDirectoryHandle(proj)).getDirectoryHandle('Fotos');
    const out = []; for await (const [n, h] of f.entries()) if (/\.pdf$/.test(n)) out.push([n, (await h.getFile()).size]); return out.sort();
  }, PROJ);
  for (let k = 1; k <= 2; k++){
    await page.locator('#btnPdf').click();
    assert.match(await page.locator('#zInfo').textContent(), new RegExp(`Speicherort: „${PROJ} › Fotos“`));
    await page.locator('#zOk').click();
    await page.waitForFunction(n => [...document.querySelectorAll('#banner .pdfOpen')].length && document.getElementById('banner').textContent.includes(n), k === 1 ? '.pdf“' : '(2).pdf“', { timeout: 15000 });
  }
  const da = await pdfs();
  assert.deepEqual(da.map(x => x[0]), [`${soll} (2).pdf`, `${soll}.pdf`].sort(), 'zweites PDF bekommt „(2)“');
  assert.ok(da.every(x => x[1] > 1000), 'beide PDFs vollständig');

  assert.deepEqual(errors, []);
  await browser.close(); server.close();
  console.log(`OK (${name})`);
})().catch(e => { console.error(e); process.exit(1); });
