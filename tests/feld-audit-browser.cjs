// FotoKit 2.5.0 – Audit 2026-11 Lauf 1 (Feldarbeit) im echten Browser: node tests/feld-audit-browser.cjs [chromium]
// A1: „Jetzt einlesen“ (neue Fotos, 2.4.0) liest nur den offenen Ordner – auch wenn vorher „In Spektron arbeitest du gerade an …“ kam
//     (vorher öffnete der Knopf dann das andere Projekt).
// A4: Zeile „In LabelKit sind noch keine Probennummern fest …“, solange keine Probe nrFest/storniert hat und Fotos Proben zugeordnet sind;
//     weg, sobald LabelKit Nummern festgelegt hat. Nummer, die es in LabelKit nicht gibt → Hinweis auf Kachel und in der Fotokarte. Nichts gesperrt.
// A9: Nach dem Tippen meldet die Fußzeile „Projekt gespeichert …“ (vorher blieb sie ohne gespeicherte Reihenfolge für immer bei
//     „Projektspeicherung noch nicht bestätigt“).
// Synthetisches OPFS-Projekt, nur erfundene Namen. LabelKit-Datei wird nur gelesen.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const playwright = require('playwright');
const ui = require('./fk-ui.cjs');
const browserName = process.argv[2] || 'chromium';
const root = path.join(__dirname, '..');
const A = '26.0903 Feldweg Teststadt Dr.Ka', B = '26.0904 Nebenweg Teststadt Dr.Ka';
const FEST = { am: '2026-11-20T08:00:00.000Z', anlass: 'Etiketten' };
const lk = fest => ({ version: '5.1.1', projekt: { nr: '26.0903' }, probenStartNr: 1,
  proben: [{ id: 1, _nr: 1, z2: 'EG Küche', z3: 'gereinigt', z4: 'Aufsicht', ...(fest ? { nrFest: FEST } : {}) },
           { id: 2, _nr: 2, z2: 'EG Flur', z3: 'gereinigt', z4: 'Aufsicht', ...(fest ? { nrFest: FEST } : {}) }],
  chloridProben: [{ id: 3, _nr: 3, z2: 'EG Küche Heizkörper', z3: 'gereinigt', z4: 'Ansicht' }], asbestProben: [], sonstigeProben: [] });
let browser, server;
(async () => {
  server = http.createServer((req, res) => {
    const f = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html');
    if (!f.startsWith(root + path.sep) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html; charset=utf-8' : f.endsWith('.js') ? 'application/javascript' : 'application/octet-stream' }); res.end(fs.readFileSync(f));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  browser = await playwright[browserName].launch(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {});
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', d => d.accept());
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  const canWrite = await page.evaluate(async () => {
    try { const d = await navigator.storage.getDirectory(), h = await d.getFileHandle('probe', { create: true });
      if (!('showDirectoryPicker' in window) || !h.createWritable) return false;
      const w = await h.createWritable(); await w.write('test'); await w.close(); return true;
    } catch { return false; }
  });
  if (!canWrite) { console.log(`SKIP (${browserName}): kein schreibbarer Ordnerzugriff`); assert.deepEqual(errors, []); await browser.close(); server.close(); return; }

  const bild = (name, i) => page.evaluate(async ([proj, name, i]) => {
    const p = await (await navigator.storage.getDirectory()).getDirectoryHandle(proj, { create: true });
    const d = await p.getDirectoryHandle('Fotos', { create: true });
    const c = document.createElement('canvas'); c.width = 64 + i; c.height = 48;
    const g = c.getContext('2d'); g.fillStyle = `hsl(${i * 67},70%,50%)`; g.fillRect(0, 0, c.width, c.height);
    const w = await (await d.getFileHandle(name, { create: true })).createWritable(); await w.write(await new Promise(r => c.toBlob(r, 'image/jpeg'))); await w.close();
  }, [A, name, i]);
  const lkSchreiben = o => page.evaluate(async ([proj, t]) => {
    const p = await (await navigator.storage.getDirectory()).getDirectoryHandle(proj, { create: true });
    const s = await (await p.getDirectoryHandle('_Spektron', { create: true })).getDirectoryHandle('LabelKit', { create: true });
    const w = await (await s.getFileHandle('26.0903_Daten.json', { create: true })).createWritable(); await w.write(t); await w.close();
  }, [A, JSON.stringify(o)]);
  const zuletzt = liste => page.evaluate(l => new Promise((res, rej) => { const q = indexedDB.open('mosaik-suite', 1); q.onupgradeneeded = () => q.result.createObjectStore('kv');
    q.onsuccess = () => { const t = q.result.transaction('kv', 'readwrite'); t.objectStore('kv').put(l, 'zuletzt'); t.oncomplete = () => { q.result.close(); res(); }; t.onerror = () => rej(t.error); }; }), liste);
  const fokus = async () => { await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await page.waitForTimeout(600); };

  for (let i = 0; i < 3; i++) await bild(`IMG_${1001 + i}.jpg`, i);
  await page.evaluate(async ([a, b]) => {
    const r = await navigator.storage.getDirectory();
    await (await r.getDirectoryHandle(b, { create: true })).getDirectoryHandle('Fotos', { create: true });
    const p = await r.getDirectoryHandle(a); window.showDirectoryPicker = async () => p;
  }, [A, B]);
  await lkSchreiben(lk(false));
  await ui.oeffnen(page);
  await page.waitForFunction(() => !document.body.inert && document.querySelectorAll('#list .row').length === 3);
  const row = name => page.locator(`#list .row[aria-label^="${name}"]`);
  const waehle = async name => { const r = row(name); if (!(await r.evaluate(e => e.classList.contains('active')))) await r.locator('.tinfo').click(); };
  const nrZeile = () => page.locator('#nrZeile').evaluate(e => e.hidden ? '' : e.textContent);
  // LabelKit-Datei wird im Hintergrund gelesen
  await page.waitForFunction(() => document.querySelectorAll('#probeList option').length === 3);

  // A4: ohne Zuordnung keine Zeile; Probe P1 zugeordnet → Zeile; P9 → Hinweis auf Kachel und in der Fotokarte
  assert.equal(await nrZeile(), '', 'ohne zugeordnete Probe keine Zeile');
  await waehle('IMG_1001'); await page.locator('#fProbe').fill('P1'); await page.locator('#fProbe').press('Tab');
  await page.waitForFunction(() => !document.getElementById('nrZeile').hidden);
  assert.match(await nrZeile(), /^⚠ In LabelKit sind noch keine Probennummern fest .*zeigen die Zuordnungen hier auf andere Proben\.$/);
  assert.equal(await row('IMG_1001').locator('.tnote.storno').evaluate(e => e.hidden), true, 'P1 gibt es: kein Hinweis');
  await waehle('IMG_1002'); await page.locator('#fProbe').fill('P9'); await page.locator('#fProbe').press('Tab');
  await page.waitForFunction(() => !document.querySelector('#list .row[aria-label^="IMG_1002"] .tnote.storno').hidden);
  assert.equal(await row('IMG_1002').locator('.tnote.storno').textContent(), '⚠ P9 nicht in LabelKit');
  await waehle('IMG_1002');
  assert.match(await page.locator('#fStorno').textContent(), /^⚠ P9 gibt es in LabelKit nicht – bitte die Nummer prüfen\./);
  assert.equal(await page.locator('#fProbe').inputValue(), 'P9', 'Zuordnung bleibt, wie sie ist');

  // A9: Speicherstand wird bestätigt
  await waehle('IMG_1003'); await page.locator('#fDesc').fill('Flur, Wand'); await page.locator('#fDesc').press('Enter');
  await page.locator('#recoveryStatus').filter({ hasText: /^Projekt gespeichert/ }).waitFor({ timeout: 10000 });

  // A4: LabelKit legt Nummern fest → nach „Fotos neu einlesen“ keine Zeile mehr
  await lkSchreiben(lk(true));
  await ui.mehr(page, 'mehrReload');
  await page.waitForFunction(() => document.getElementById('nrZeile').hidden, null, { timeout: 8000 });

  // A1: in einer anderen App wird Projekt B geöffnet → Hinweis; zurück zu A; neues Foto in A → „Jetzt einlesen“ bleibt bei A
  await zuletzt([B, A]); await fokus();
  assert.match(await page.locator('#banner').textContent(), /In Spektron arbeitest du gerade an .*26\.0904/);
  await page.evaluate(() => { const b = document.getElementById('banner'); b.className = ''; b.innerHTML = ''; });   // Hinweis weggeklickt
  await zuletzt([A, B]);
  await bild('IMG_2001.jpg', 7); await fokus();
  await page.locator('#bNeueFotos').click();
  await page.waitForFunction(() => document.querySelectorAll('#list .row').length === 4, null, { timeout: 8000 });
  assert.equal(await ui.projekt(page), '26.0903 · Feldweg Teststadt Dr.Ka', 'Projekt A bleibt offen');
  assert.equal(await row('IMG_2001').count(), 1, 'neues Foto eingelesen');
  await waehle('IMG_1001'); assert.equal(await page.locator('#fProbe').inputValue(), 'P1', 'Eingaben bleiben');

  assert.deepEqual(errors, []);
  console.log(`OK (${browserName}): „Jetzt einlesen“ bleibt im Projekt, Zeile „Nummern noch nicht fest“, unbekannte Probe, Speicherstand bestätigt`);
  await browser.close(); server.close();
})().catch(async e => { console.error(e); try { await browser?.close(); } catch {} server?.close(); process.exit(1); });
