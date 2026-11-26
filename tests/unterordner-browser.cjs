// 2.7.0 (bis 2.6.0: „Fotos übernehmen“, entfällt – O11): Fotos in Unterordnern der Mitarbeiter in „Fotos“ erscheinen dort, wo sie
// liegen – eine Ebene, Schlüssel „Ordner/Datei“, nichts wird verschoben oder umbenannt, „_aussortiert“ und Ordner ohne Fotos zählen
// nicht. Außerdem: „Fotos neu einlesen“ nimmt das Projekt, an dem in Spektron gerade gearbeitet wird. Synthetische OPFS-Projekte,
// echte UI-Aktionen. (Mehrere Ortstermine, Projektzentrale daneben: tests/ortstermine-browser.cjs.)
// node tests/unterordner-browser.cjs [chromium]
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const playwright = require('playwright');
const ui = require('./fk-ui.cjs');
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
  // Chromium: eigenes (persistentes) Profil je Lauf – im Inkognito-Kontext stürzt Chromium 1243 (Playwright 1.63) beim Lesen eines
  // in IndexedDB abgelegten Ordner-Handles ab (SIGTRAP); echte Nutzer haben ein normales Profil.
  const profil = browserName === 'chromium' ? fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'fk-profil-')) : null;
  const ctx = profil ? await playwright.chromium.launchPersistentContext(profil, { viewport: { width: 1280, height: 900 } })
    : await (await playwright[browserName].launch()).newContext({ viewport: { width: 1280, height: 900 } });
  browser = profil ? { close: async () => { await ctx.close(); (() => { try { fs.rmSync(profil, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch (_) {} })(); } } : ctx.browser();
  const page = ctx.pages()[0] || await ctx.newPage(), errors = [];
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

  // Öffnen: oben liegt ein Foto, drei weitere in Unterordnern der Mitarbeiter – alle vier als Kacheln, an ihrem Platz
  await ui.oeffnen(page);
  await page.waitForFunction(() => !document.body.inert && document.querySelectorAll('#list .row').length === 4);
  assert.deepEqual(await page.locator('#list .row').evaluateAll(r => r.map(e => e.getAttribute('aria-label'))),
    ['IMG_0001.jpg', 'Begehung Ben/IMG_0001.jpg', 'Begehung Ben/IMG_0002.jpg', 'Ric/A.jpg'], '„_aussortiert“ und Ordner ohne Fotos zählen nicht');
  assert.deepEqual(await page.locator('#list .fk-ordner .o-name').allTextContents(), ['direkt in „Fotos“', 'Begehung Ben', 'Ric']);
  assert.equal(await page.locator('#importCard, #btnImport').count(), 0, 'keine Karte „Fotos übernehmen“ mehr');
  // Beschreiben eines Unterordner-Fotos: gespeichert unter seinem Weg; im Ordner bleibt alles, wo es war
  await ui.feld(page, 'desc', 1).fill('Keller Wand'); await page.locator('#fDesc').press('Tab');
  let gespeichert;
  for (let i = 0; i < 40; i++){
    // Projekt ab 26.0560 ohne bisherige Projektdatei: seit der Umstellung liegt sie in „_Spektron/FotoKit“ (spektron-ordner.js)
    gespeichert = await page.evaluate(async () => { try{ const d = await (await window.testProjekt.getDirectoryHandle('_Spektron')).getDirectoryHandle('FotoKit'); return JSON.parse(await (await (await d.getFileHandle('_Bildumbenenner.json')).getFile()).text()); }catch(e){ return null; } });
    if (gespeichert?.bilder?.['Begehung Ben/IMG_0001.jpg']) break; await page.waitForTimeout(150);
  }
  assert.equal(gespeichert.bilder['Begehung Ben/IMG_0001.jpg'].beschreibung, 'Keller Wand');
  assert.equal(gespeichert.fotoUebernahmen, undefined);
  const n = await namen();
  for (const f of ['IMG_0001.jpg']) assert.equal(n[f], 'file', f);
  for (const o of ['Begehung Ben', 'Ric', '_aussortiert', 'Notizen']) assert.equal(n[o], 'directory', o);
  assert.equal(n['IMG_0001_Ben.jpg'], undefined, 'nichts verschoben oder umbenannt');
  const drin = await page.evaluate(async () => { const o = {}; for (const name of ['Begehung Ben', 'Ric', '_aussortiert']){ const d = await window.testFotos.getDirectoryHandle(name); o[name] = []; for await (const k of d.keys()) o[name].push(k); o[name].sort(); } return o; });
  assert.deepEqual(drin, { 'Begehung Ben': ['IMG_0001.jpg', 'IMG_0002.jpg'], 'Ric': ['A.jpg'], '_aussortiert': ['X.jpg'] });
  console.log(`OK ${browserName}: Fotos in Unterordnern – an ihrem Platz gelesen, Schlüssel mit Weg, nichts verschoben, ohne „Fotos übernehmen“`);

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
    await ui.mehr(page, 'mehrReload');
    await page.waitForFunction(() => !document.body.inert && [...document.querySelectorAll('#list .row')].map(e => e.getAttribute('aria-label')).join() === 'ANDERS_1.jpg,ANDERS_2.jpg');
    console.log(`OK ${browserName}: „Fotos neu einlesen“ öffnet die Fotos des aktuellen Spektron-Projekts`);
  }
  assert.deepEqual(errors, []);
  await browser.close(); server.close();
})().catch(async e => { console.error(e); try{ await browser?.close(); server?.close(); }catch{} process.exit(1); });
