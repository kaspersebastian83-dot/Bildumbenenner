// FotoKit 2.0: „in der Doku“ / Weg – ein Zustand statt zwei (ersetzt die Haken-Auswahl aus 1.28). Haken auf der Kachel = in der Doku,
// ohne Haken = Weg (gespeichert wie früher ✕), dasselbe wie „Weg“ in der Fotokarte; Weg-Fotos bleiben an ihrem Platz;
// Alle/Keine/Umkehren wirken sofort und sind rückgängig zu machen; keine Nachfrage „nicht angehakt“ vor PDF. node tests/auswahl-browser.cjs [chromium|webkit]
// Ordner im Origin Private File System, showDirectoryPicker wird ersetzt. WebKit kann keine Ordner beschreiben – dort nur Laden.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const playwright = require('playwright');
const ui = require('./fk-ui.cjs');

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
  await page.waitForSelector('#btnOpen2');
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
  await ui.oeffnen(page);
  await page.waitForFunction(() => document.querySelectorAll('#list .row').length === 10, null, { timeout: 15000 });

  const count = () => page.locator('#pickCount').textContent();
  const rows = page.locator('#list .row');
  const weg = () => page.locator('#list .row.discarded').count();
  const gespeichertWeg = n => page.evaluate(async n => {
    for (let i = 0; i < 40; i++){
      const such = async d => { for await (const [nm, h] of d.entries()){ if (h.kind === 'file' && nm === '_Bildumbenenner.json') return h; if (h.kind === 'directory'){ const x = await such(h); if (x) return x; } } return null; };
      try{ const f = await such(await navigator.storage.getDirectory());
        if (f){ const t = await (await f.getFile()).text(); const k = (t.match(/"aussortiert":\s*true/g) || []).length; if (k === n) return k; } }catch(e){}
      await new Promise(r => setTimeout(r, 100));
    }
    return -1;
  }, n);
  assert.equal(await page.locator('#pickBar').isVisible(), true);
  assert.match(await count(), /In der Doku: 10 von 10/);
  assert.equal(await page.locator('#pickAll').isDisabled(), true, 'alle schon in der Doku');
  assert.equal(await page.locator('#list .row .x, #list .row .up, #list .row .down').count(), 0, 'keine ▲▼✕-Mikroknöpfe mehr');

  // 3 von 10 behalten: Keine → drei anhaken. Weg wirkt sofort und bleibt an seinem Platz.
  await page.click('#pickNone');
  assert.match(await count(), /In der Doku: 0 von 10/);
  assert.equal(await weg(), 10);
  assert.match(await page.locator('#banner').textContent(), /Alle auf „Weg“/);
  for (const i of [0, 3, 7]) await rows.nth(i).locator('.pick input').check();
  assert.match(await count(), /In der Doku: 3 von 10/);
  const reihe = await page.$$eval('#list .row', es => es.map(e => (e.classList.contains('discarded') ? '-' : '+') + e.getAttribute('aria-label')));
  assert.deepEqual(reihe.map(x => x[0]).join(''), '+--+---+--', 'Weg-Fotos bleiben an ihrem Platz');
  assert.deepEqual(await page.$$eval('#list .row:not(.discarded) .bildnr', es => es.map(e => e.textContent)), ['Bild 1', 'Bild 2', 'Bild 3'], 'Bildnummern ohne Weg-Fotos');
  assert.equal(await gespeichertWeg(7), 7, '7 Fotos in _Bildumbenenner.json als aussortiert (wie früher ✕)');

  // Umkehren hin und zurück; Rückgängig stellt den Stand vor dem Klick wieder her
  await page.click('#pickInvert'); assert.match(await count(), /7 von 10/);
  await page.click('#bPickUndo'); assert.match(await count(), /3 von 10/);

  // „Weg“ in der Fotokarte = derselbe Zustand; danach geht es mit dem nächsten Foto weiter
  await ui.foto(page, 0);
  await page.click('#pvDiscard');
  assert.equal(await rows.nth(0).locator('.pick input').isChecked(), false, 'Karte „Weg“ nimmt den Haken');
  assert.equal(await rows.nth(1).evaluate(e => e.classList.contains('active')), true, 'nächstes Foto gewählt');
  await ui.foto(page, 0);
  assert.equal(await page.locator('#pvDiscard').textContent(), '↺ Zurückholen');
  assert.equal(await page.locator('#fDesc').isEditable(), false, 'Weg-Foto: Beschreibung nur lesen');
  await page.click('#pvDiscard');
  assert.equal(await rows.nth(0).locator('.pick input').isChecked(), true);
  // Tastatur auf der Kachel: Leertaste = in der Doku / Weg
  await rows.nth(1).focus(); await page.keyboard.press('Space');
  assert.match(await count(), /4 von 10/);
  await page.keyboard.press('Space');
  assert.match(await count(), /3 von 10/);

  // PDF: keine Nachfrage „nicht angehakt“ mehr – der Dialog öffnet direkt mit dem Deckblatt
  await page.click('#btnPdf');
  await page.waitForSelector('#overlay.show #zOk');
  assert.match(await page.locator('#dialog h3').textContent(), /Bilddokumentation erstellen/);
  assert.match(await page.locator('#zInfo').textContent(), /Deckblatt \+ 3 Bilder/);
  await page.click('#zCancel');

  // Reihenfolge ohne ▲▼: „Später ▸“ in der Fotokarte, Alt+← auf der Kachel – über Weg-Fotos hinweg, damit die Bildnummer sich ändert
  await ui.foto(page, 0);
  const name0 = await rows.nth(0).getAttribute('aria-label');
  const bildVon = n => page.locator(`#list .row[aria-label="${n}"] .bildnr`).textContent();
  assert.equal(await bildVon(name0), 'Bild 1');
  await page.click('#pvLater');
  assert.equal(await bildVon(name0), 'Bild 2', 'Später ▸ – hinter das nächste Foto in der Doku (Weg-Fotos übersprungen)');
  await page.locator(`#list .row[aria-label="${name0}"]`).focus(); await page.keyboard.press('Alt+ArrowLeft');
  assert.equal(await bildVon(name0), 'Bild 1', 'Alt+← schiebt zurück');

  assert.deepEqual(errors, []);
  await browser.close(); server.close();
  console.log(`OK (${name})`);
})().catch(e => { console.error(e); process.exit(1); });
