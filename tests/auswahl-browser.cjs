// FotoKit 1.28: Bilder für die Doku auswählen – Haken je Zeile, „Alle“/„Keine“/„Umkehren“, „… nicht angehakte aussortieren“,
// Nachfrage vor PDF/ZIP/Umbenennen bei nicht angehakten Bildern. node tests/auswahl-browser.cjs [chromium|webkit]
// Ordner im Origin Private File System, showDirectoryPicker wird ersetzt. WebKit kann keine Ordner beschreiben – dort nur Laden.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const playwright = require('playwright');

const name = process.argv[2] || 'chromium';
const root = path.join(__dirname, '..');

(async () => {
  const server = http.createServer((req, res) => {
    const f = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html');
    if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()){ res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html; charset=utf-8' : f.endsWith('.js') ? 'application/javascript' : 'application/octet-stream' }); res.end(fs.readFileSync(f));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/index.html`;
  const browser = await playwright[name].launch();
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('willkommen-gelesen', '1'); } catch (e) {} });
  const page = await ctx.newPage();
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
  if (!kann){ assert.deepEqual(errors, []); await browser.close(); server.close(); console.log(`OK (${name}, ohne Ordnerzugriff: nur Laden geprüft)`); return; }

  // 10 Bilder in einem „Fotos“-Ordner
  await page.evaluate(async () => {
    const r = await navigator.storage.getDirectory();
    for await (const [n] of r.entries()) await r.removeEntry(n, { recursive: true });
    const fotos = await (await r.getDirectoryHandle('26.0999 Teststadt', { create: true })).getDirectoryHandle('Fotos', { create: true });
    const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), c => c.charCodeAt(0));
    for (let i = 1; i <= 10; i++){ const w = await (await fotos.getFileHandle(`IMG_${String(i).padStart(4, '0')}.png`, { create: true })).createWritable(); await w.write(png); await w.close(); }
    window.showDirectoryPicker = async () => (await (await navigator.storage.getDirectory()).getDirectoryHandle('26.0999 Teststadt'));
  });
  await page.click('#btnOpen');
  await page.waitForFunction(() => document.querySelectorAll('#list .row').length === 10, null, { timeout: 15000 });

  const count = () => page.locator('#pickCount').textContent();
  const apply = page.locator('#pickApply');
  assert.equal(await page.locator('#pickBar').isVisible(), true);
  assert.match(await count(), /10 von 10 angehakt/);
  assert.equal(await apply.isDisabled(), true, 'alles angehakt → nichts auszusortieren');

  // 3 von 10 behalten: Keine → drei anhaken
  await page.evaluate(() => { window.__seitenEingaben = 0; for (const t of ['input', 'change']) document.addEventListener(t, () => window.__seitenEingaben++); });
  await page.click('#pickNone');
  assert.match(await count(), /0 von 10/);
  assert.equal(await page.locator('#list .row.unpicked').count(), 10);
  const rows = page.locator('#list .row');
  for (const i of [0, 3, 7]) await rows.nth(i).locator('.pick input').check();
  assert.match(await count(), /3 von 10/);
  assert.equal(await apply.textContent(), '7 nicht angehakte aussortieren');
  assert.equal(await page.evaluate(() => window.__seitenEingaben), 0, 'Haken zählen nicht als ungesicherte Eingabe (Wiederherstellung)');

  // Umkehren hin und zurück
  await page.click('#pickInvert'); assert.match(await count(), /7 von 10/);
  await page.click('#pickInvert'); assert.match(await count(), /3 von 10/);

  // PDF mit nicht angehakten Bildern → Nachfrage; Abbrechen ändert nichts
  await page.click('#btnPdf');
  await page.waitForSelector('#overlay.show #dAll');
  assert.match(await page.locator('#dialog h3').textContent(), /7 Bilder sind nicht angehakt/);
  await page.click('#dCancel');
  assert.equal(await page.locator('#list .row.discarded').count(), 0);

  // Sammelknopf: Rückfrage nennt beide Zahlen, danach 7 aussortiert, 3 aktiv, alle wieder angehakt
  await apply.click();
  await page.waitForSelector('#overlay.show #dOk');
  const txt = await page.locator('#dialog').textContent();
  assert.match(txt, /7 Bilder aussortieren\?/); assert.match(txt, /3\s*bleiben in der Doku/);
  await page.click('#dOk');
  await page.waitForFunction(() => document.querySelectorAll('#list .row.discarded').length === 7);
  const aktiv = await page.$$eval('#list .row:not(.discarded) .orig', es => es.map(e => e.textContent.split(' ')[0]));
  assert.deepEqual(aktiv, ['IMG_0001.png', 'IMG_0004.png', 'IMG_0008.png']);
  assert.match(await count(), /3 von 3 angehakt/);
  assert.equal(await apply.isDisabled(), true);
  assert.equal(await page.locator('#list .row.unpicked').count(), 0);
  // aussortiert ist gespeichert wie mit ✕ (Projektdatei), Dateien liegen noch im Ordner
  const gespeichert = await page.evaluate(async () => {
    for (let i = 0; i < 40; i++){
      const such = async d => { for await (const [n, h] of d.entries()){ if (h.kind === 'file' && n === '_Bildumbenenner.json') return h; if (h.kind === 'directory'){ const x = await such(h); if (x) return x; } } return null; };
      try{ const f = await such(await navigator.storage.getDirectory());
        if (f){ const t = await (await f.getFile()).text(); const n = (t.match(/"aussortiert":\s*true/g) || []).length; if (n === 7) return n; } }catch(e){}
      await new Promise(r => setTimeout(r, 100));
    }
    return -1;
  });
  assert.equal(gespeichert, 7, '7 Bilder in _Bildumbenenner.json als aussortiert');

  // ↺ holt ein Bild zurück – angehakt
  await page.locator('#list .row.discarded .x').first().click();
  assert.match(await count(), /4 von 4 angehakt/);

  // „Alle mitnehmen“ entfernt nur die Haken-Markierung und öffnet den PDF-Dialog
  await rows.nth(0).locator('.pick input').uncheck();
  await page.click('#btnPdf');
  await page.waitForSelector('#overlay.show #dAll');
  await page.click('#dAll');
  assert.match(await count(), /4 von 4 angehakt/);
  assert.equal(await page.locator('#overlay').evaluate(e => e.classList.contains('show')), true, 'PDF-Dialog offen');

  assert.deepEqual(errors, []);
  await browser.close(); server.close();
  console.log(`OK (${name})`);
})().catch(e => { console.error(e); process.exit(1); });
