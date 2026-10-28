// „Fotos übernehmen“: Unterordner der Mitarbeiter in „Fotos“ werden nach „Fotos“ verschoben (Namen bleiben, Kürzel nur
// bei gleichem Namen, Ordnername als Abschnitt, Herkunft in _Bildumbenenner.json). Außerdem: „Fotos neu einlesen“ nimmt
// das Projekt, an dem in Spektron gerade gearbeitet wird. Synthetische OPFS-Projekte, echte UI-Aktionen.
// node tests/fotos-uebernehmen-browser.cjs [chromium]
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const playwright = require('playwright');
const browserName = process.argv[2] || 'chromium';
const root = path.join(__dirname, '..');
let browser, server;

(async () => {
  server = http.createServer((req, res) => {
    const file = path.join(root, new URL(req.url, 'http://x').pathname.replace(/^\/+/, '') || 'index.html');
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': file.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }); res.end(fs.readFileSync(file));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  browser = await playwright[browserName].launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  const supported = await page.evaluate(async () => {
    if (!('showDirectoryPicker' in window) || !navigator.storage?.getDirectory) return false;
    try { const d = await navigator.storage.getDirectory(), f = await d.getFileHandle('probe', { create: true }); return !!f.createWritable; } catch { return false; }
  });
  if (!supported) { console.log(`SKIP (${browserName}): kein schreibbarer Ordnerzugriff`); await browser.close(); server.close(); return; }

  await page.evaluate(async () => {
    const r = await navigator.storage.getDirectory();
    const put = async (dir, name, data) => { const w = await (await dir.getFileHandle(name, { create: true })).createWritable(); await w.write(data); await w.close(); };
    const jpg = async i => { const c = document.createElement('canvas'); c.width = 40 + i; c.height = 30; const g = c.getContext('2d'); g.fillStyle = `hsl(${i * 47},70%,50%)`; g.fillRect(0, 0, c.width, c.height); return new Promise(res => c.toBlob(res, 'image/jpeg')); };
    const projekt = async (name, dateien) => {
      const p = await r.getDirectoryHandle(name, { create: true }), d = await p.getDirectoryHandle('Fotos', { create: true });
      await put(p, '_Projekt.json', JSON.stringify({ format: 'mosaik-projekt', version: 1, objekt: 'Fiktives Testobjekt' }));
      let i = 0; for (const [ordner, n] of dateien){ const z = ordner ? await d.getDirectoryHandle(ordner, { create: true }) : d; for (const x of n) await put(z, x, await jpg(++i)); }
      return { p, d };
    };
    const a = await projekt('26.0996 Import', [['', ['IMG_0001.jpg']], ['Begehung Ben', ['IMG_0001.jpg', 'IMG_0002.jpg']], ['Ric', ['A.jpg']], ['_aussortiert', ['X.jpg']]]);
    await put(await a.d.getDirectoryHandle('Notizen', { create: true }), 'liesmich.txt', 'kein Foto');
    await projekt('26.0997 Anders', [['', ['ANDERS_1.jpg', 'ANDERS_2.jpg']]]);
    window.testFotos = a.d; window.testProjekt = a.p;
    window.showDirectoryPicker = async () => a.p;
  });
  const idle = () => page.waitForFunction(() => !document.body.inert && !document.querySelector('#overlay').classList.contains('show'));
  const namen = () => page.evaluate(async () => { const o = {}; for await (const [n, h] of window.testFotos.entries()) o[n] = h.kind; return o; });

  // Öffnen: oben liegt nur ein Foto, drei weitere in Unterordnern der Mitarbeiter – Knopf mit Anzahl
  await page.locator('#btnOpen').click();
  await page.waitForFunction(() => !document.body.inert && document.querySelectorAll('#list .row').length === 1);
  await page.locator('#btnImport:not([hidden])').waitFor();
  assert.match(await page.locator('#btnImport').textContent(), /Fotos übernehmen \(3\)/, '„_aussortiert“ und Ordner ohne Fotos zählen nicht');

  // Dialog: zwei Unterordner, Kürzel aus dem Ordnernamen, alle angehakt
  await page.locator('#btnImport').click(); await page.locator('#impOk').waitFor();
  const zeilen = await page.locator('table.imp tbody tr').evaluateAll(rs => rs.map(r => [...r.querySelectorAll('td')].slice(1, 4).map(td => td.textContent)));
  assert.deepEqual(zeilen, [['Begehung Ben', 'Ben', '2'], ['Ric', 'Ric', '1']]);
  assert.equal(await page.locator('#impOk').textContent(), '3 Fotos übernehmen');
  await page.locator('#impOk').click(); await idle();
  await page.waitForFunction(() => document.querySelectorAll('#list .row').length === 4);

  // verschoben, nicht kopiert; Name bleibt, bei gleichem Namen mit Kürzel; Unterordner bleiben (leer) stehen
  const n = await namen();
  for (const f of ['IMG_0001.jpg', 'IMG_0001_Ben.jpg', 'IMG_0002.jpg', 'A.jpg']) assert.equal(n[f], 'file', f);
  for (const o of ['Begehung Ben', 'Ric', '_aussortiert', 'Notizen']) assert.equal(n[o], 'directory', o);
  const leer = await page.evaluate(async () => { const o = {}; for (const name of ['Begehung Ben', 'Ric', '_aussortiert']){ const d = await window.testFotos.getDirectoryHandle(name); o[name] = []; for await (const k of d.keys()) o[name].push(k); } return o; });
  assert.deepEqual(leer, { 'Begehung Ben': [], 'Ric': [], '_aussortiert': ['X.jpg'] });

  // Abschnitt = Ordnername (das vorhandene Foto bleibt ohne)
  const abschnitte = await page.locator('#list .row').evaluateAll(es => Object.fromEntries(es.map(e => [e.querySelector('.orig').textContent.split(' · ')[0], e.querySelector('.sec').value])));
  assert.deepEqual(abschnitte, { 'A.jpg': 'Ric', 'IMG_0001.jpg': '', 'IMG_0001_Ben.jpg': 'Begehung Ben', 'IMG_0002.jpg': 'Begehung Ben' });
  await page.locator('#btnImport[hidden]').waitFor({ state: 'attached' });

  // Herkunft je Datei in _Bildumbenenner.json
  let gespeichert;
  for (let i = 0; i < 40; i++){
    // Projekt ab 26.0560 ohne bisherige Projektdatei: seit der Umstellung liegt sie in „_Spektron/FotoKit“ (spektron-ordner.js)
    gespeichert = await page.evaluate(async () => { try{ const d = await (await window.testProjekt.getDirectoryHandle('_Spektron')).getDirectoryHandle('FotoKit'); return JSON.parse(await (await (await d.getFileHandle('_Bildumbenenner.json')).getFile()).text()); }catch(e){ return null; } });
    if (gespeichert?.fotoUebernahmen?.length === 2) break; await page.waitForTimeout(150);
  }
  assert.deepEqual(gespeichert.fotoUebernahmen.map(u => ({ ordner: u.ordner, kuerzel: u.kuerzel, dateien: u.dateien })), [
    { ordner: 'Begehung Ben', kuerzel: 'Ben', dateien: [{ datei: 'IMG_0001_Ben.jpg', vorher: 'IMG_0001.jpg' }, { datei: 'IMG_0002.jpg' }] },
    { ordner: 'Ric', kuerzel: 'Ric', dateien: [{ datei: 'A.jpg' }] }]);
  assert.equal(gespeichert.bilder['IMG_0002.jpg'].abschnitt, 'Begehung Ben');
  console.log(`OK ${browserName}: Fotos übernehmen – verschoben, Namen und Kürzel, Abschnitt, Herkunft, leere Ordner bleiben`);

  // „Fotos neu einlesen“ nimmt das Projekt, an dem gerade gearbeitet wird (in einer anderen App gewechselt)
  if (process.env.OHNE_ARCHIV){ console.log('SKIP Archivordner im Browser-Speicher (OHNE_ARCHIV)'); }
  else {
    await page.evaluate(async () => {
      const r = await navigator.storage.getDirectory();
      const db = await new Promise((res, rej) => { const q = indexedDB.open('mosaik-suite', 1); q.onupgradeneeded = () => q.result.createObjectStore('kv'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
      await new Promise((res, rej) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(r, 'archiv'); tx.objectStore('kv').put(['26.0997 Anders', '26.0996 Import'], 'zuletzt'); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
      db.close();
      window.dispatchEvent(new Event('focus'));
    });
    await page.locator('#bZuAktuell').waitFor();
    assert.match(await page.locator('#banner').textContent(), /gerade an 26\.0997 Anders/);
    await page.locator('#btnReload').click();
    await page.waitForFunction(() => !document.body.inert && [...document.querySelectorAll('#list .row .orig')].map(e => e.textContent.split(' · ')[0]).join() === 'ANDERS_1.jpg,ANDERS_2.jpg');
    console.log(`OK ${browserName}: „Fotos neu einlesen“ öffnet die Fotos des aktuellen Spektron-Projekts`);
  }
  assert.deepEqual(errors, []);
  await browser.close(); server.close();
})().catch(async e => { console.error(e); try{ await browser?.close(); server?.close(); }catch{} process.exit(1); });
