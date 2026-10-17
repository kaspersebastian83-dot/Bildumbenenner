// FotoKit ↔ Projektzentrale: gemeinsame Projektdaten (_Projekt.json) im echten Browser. node tests/projektdaten-browser.cjs [chromium|webkit]
//  • Ändert sich _Projekt.json außerhalb (Projektzentrale, Kollege), liest FotoKit sie beim Zurückkehren ins Fenster neu
//  • Speichern der Projektdaten läuft unter der Sperre „mosaik:projekt:<Ordner>“ (dieselbe nimmt Projektzentrale) und schreibt den einheitlichen Hinweistext
// Der Archivordner wird im Origin Private File System nachgebildet und in „mosaik-suite“ hinterlegt. WebKit kann keine Ordner beschreiben – dort wird nur das Laden geprüft.
process.env.TZ = 'Europe/Berlin';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const playwright = require('playwright');

const name = process.argv[2] || 'chromium';
const root = path.join(__dirname, '..');
const PROJ = '26.0142 Teststadt';

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

  // Archivordner mit Projekt „Fotos“ und _Projekt.json anlegen und in der gemeinsamen Datenbank hinterlegen
  await page.evaluate(async proj => {
    const r = await navigator.storage.getDirectory();
    for await (const [n] of r.entries()) await r.removeEntry(n, { recursive: true });
    const archiv = await r.getDirectoryHandle('Mosaik Archivordner', { create: true });
    const p = await archiv.getDirectoryHandle(proj, { create: true });
    const fotos = await p.getDirectoryHandle('Fotos', { create: true });
    const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), c => c.charCodeAt(0));
    const wf = await (await fotos.getFileHandle('IMG_0001.png', { create: true })).createWritable(); await wf.write(png); await wf.close();
    const w = await (await p.getFileHandle('_Projekt.json', { create: true })).createWritable();
    await w.write(JSON.stringify({ format: 'mosaik-projekt', version: 1, hinweis: 'alt', objekt: 'EFH, Altweg 1', sachverstaendiger: 'Dr. A', ortstermin: '2026-10-01', notizen: 'bleibt' }, null, 2)); await w.close();
    await new Promise((res, rej) => { const q = indexedDB.open('mosaik-suite', 1); q.onupgradeneeded = () => q.result.createObjectStore('kv');
      q.onsuccess = () => { const t = q.result.transaction('kv', 'readwrite'); t.objectStore('kv').put(archiv, 'archiv'); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }; q.onerror = () => rej(q.error); });
  }, PROJ);
  await page.goto(base + '?projekt=' + encodeURIComponent(PROJ));
  await page.waitForFunction(() => !document.getElementById('btnMeta').disabled, null, { timeout: 8000 });
  // Projektdaten-Dialog öffnen, Werte lesen, schließen (die App-Interna sind gekapselt – geprüft wird, was man sieht)
  const meta = async () => {
    await page.locator('#btnMeta').click();
    const m = { objekt: await page.locator('#m_objekt').inputValue(), sv: await page.locator('#m_sv').inputValue() };
    await page.locator('#zCancel').click();
    return m;
  };
  const datei = () => page.evaluate(async proj => {
    const p = await (await (await navigator.storage.getDirectory()).getDirectoryHandle('Mosaik Archivordner')).getDirectoryHandle(proj);
    return JSON.parse(await (await (await p.getFileHandle('_Projekt.json')).getFile()).text());
  }, PROJ);
  const aendereDatei = f => page.evaluate(async ([proj, patch]) => {
    const p = await (await (await navigator.storage.getDirectory()).getDirectoryHandle('Mosaik Archivordner')).getDirectoryHandle(proj);
    const h = await p.getFileHandle('_Projekt.json'); const o = JSON.parse(await (await h.getFile()).text());
    const w = await h.createWritable(); await w.write(JSON.stringify(Object.assign(o, patch), null, 2)); await w.close();
  }, [PROJ, f]);

  assert.deepEqual(await meta(), { objekt: 'EFH, Altweg 1', sv: 'Dr. A' }, 'Projektdaten beim Öffnen gelesen');

  // 1) Projektdaten werden außerhalb geändert (Projektzentrale / Kollege) → beim Zurückkehren ins Fenster neu gelesen
  await aendereDatei({ objekt: 'EFH, Neuweg 2' });
  assert.equal((await meta()).objekt, 'EFH, Altweg 1', 'ohne Fensterwechsel noch der alte Stand');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForFunction(() => /neu übernommen/.test(document.getElementById('banner').textContent));
  assert.equal((await meta()).objekt, 'EFH, Neuweg 2', 'nach Fensterwechsel der neue Stand');
  const nachLesen = await datei();
  assert.equal(nachLesen.objekt, 'EFH, Neuweg 2');
  assert.equal(nachLesen.hinweis, 'alt', 'reines Neu-Lesen verändert die Datei nicht');

  // 2) Speichern unter der Sperre je Projekt: solange ein anderer Tab sie hält, wird nicht geschrieben; danach mit einheitlichem Hinweistext
  await page.evaluate(proj => new Promise(frei => { window.__freigeben = null; navigator.locks.request('mosaik:projekt:' + proj, () => new Promise(r => { window.__freigeben = r; frei(); })); }), PROJ);
  await page.locator('#btnMeta').click();
  await page.locator('#m_objekt').fill('EFH, Lokal 3');
  await page.locator('#zCancel').click();
  await page.waitForTimeout(1500);
  assert.equal((await datei()).objekt, 'EFH, Neuweg 2', 'unter fremder Sperre wird nicht geschrieben');
  await page.evaluate(() => window.__freigeben());
  await page.waitForFunction(async proj => {
    const p = await (await (await navigator.storage.getDirectory()).getDirectoryHandle('Mosaik Archivordner')).getDirectoryHandle(proj);
    return JSON.parse(await (await (await p.getFileHandle('_Projekt.json')).getFile()).text()).objekt === 'EFH, Lokal 3';
  }, PROJ);
  const d = await datei();
  assert.equal(d.hinweis, 'Gemeinsame Projektdaten (Projektzentrale, FotoKit, PlanKit, LabelKit). Bitte nicht löschen oder umbenennen.');
  assert.equal(d.notizen, 'bleibt', 'unbekannte Felder bleiben');
  assert.match(d.geaendertMit, /^FotoKit 1\.7\.0$/);

  assert.deepEqual(errors, []);
  await browser.close(); server.close();
  console.log(`OK (${name})`);
})().catch(e => { console.error(e); process.exit(1); });
