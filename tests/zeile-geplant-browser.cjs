// FotoKit 2.0 (früher 1.17.1 „Bildzeile“): Der geplante Name bleibt sichtbar – in der Fotokarte (#pvNew) für das gewählte Foto,
// auch bei langen Originalnamen und schmalen Fenstern; Konflikte („Name doppelt“) stehen vollständig in der Karte und als Hinweis
// „⚠ Dateiname doppelt“ auf der Kachel (.tnote.conflict). Lange Namen brechen um statt das Layout zu sprengen.
// Synthetisches OPFS-Projekt, nur ASCII-Ordnernamen.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const playwright = require('playwright');
const ui = require('./fk-ui.cjs');
const browserName = process.argv[2] || 'chromium';
const root = path.join(__dirname, '..');
let browser, server;
(async () => {
  server = http.createServer((req, res) => {
    const f = path.join(root, new URL(req.url, 'http://x').pathname.replace(/^\/+/, '') || 'index.html');
    if (!f.startsWith(root + path.sep) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html; charset=utf-8' : f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); res.end(fs.readFileSync(f));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  browser = await playwright[browserName].launch(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {});
  for (const width of [320, 390, 1280]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await ctx.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
    const ok = await page.evaluate(async () => {
      try {
        if (!('showDirectoryPicker' in window)) return false;
        const root = await navigator.storage.getDirectory();
        const put = async (d, n, data) => { const w = await (await d.getFileHandle(n, { create: true })).createWritable(); await w.write(data); await w.close(); };
        const p = await root.getDirectoryHandle('26.0902 Zeile ' + Math.random().toString(36).slice(2), { create: true });
        const d = await p.getDirectoryHandle('Fotos', { create: true });
        for (const name of ['IMG_20261026_101112_HDR_PORTRAIT_sehr_langer_Originalname_A.jpg', 'IMG_20261026_101113_HDR_PORTRAIT_sehr_langer_Originalname_B.jpg', 'IMG_3.jpg']) {
          const c = document.createElement('canvas'); c.width = 64; c.height = 48; c.getContext('2d').fillRect(0, 0, 64, 48);
          await put(d, name, await new Promise(r => c.toBlob(r, 'image/jpeg')));
        }
        await put(p, '_Projekt.json', JSON.stringify({ format: 'mosaik-projekt', version: 1, objekt: 'Zeile' }));
        window.showDirectoryPicker = async () => p; return true;
      } catch { return false; }
    });
    if (!ok) { console.log(`SKIP (${browserName}): kein Ordnerzugriff`); await ctx.close(); continue; }
    await ui.oeffnen(page);
    await page.waitForFunction(() => !document.body.inert && document.querySelectorAll('#list .row').length === 3);
    const rows = page.locator('#list .row');
    const desc = i => ui.feld(page, 'desc', i);
    await desc(0).fill('Kueche Decke'); await desc(1).fill('Flur Wand B');
    const mass = e => { const r = e.getBoundingClientRect(); return { w: r.width, right: r.right, cut: e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1, text: e.textContent, vis: !!(r.width && r.height) }; };
    // geplanter Name in der Karte für Foto i (Foto vorher wählen)
    const karte = async i => { await ui.foto(page, i); return page.locator('#pvNew').evaluate(mass); };
    const notiz = i => rows.nth(i).locator('.tnote.conflict').evaluate(mass);
    const kachelImFenster = i => rows.nth(i).evaluate((e, w) => e.getBoundingClientRect().right <= w + 1, width);
    // Breite der Seite ohne Kopfband/Fußleiste (die sind bei 320px unabhängig von den Namen etwas breiter – nicht Teil dieses Tests)
    const breite = () => page.evaluate(() => Math.max(document.querySelector('#app').scrollWidth, document.documentElement.scrollWidth));
    const breiteVorher = await breite();
    // Sichtbar und breit genug: geplanter Name trotz langem Originalnamen
    for (const i of [0, 1]) {
      const b = await karte(i);
      assert.match(b.text, /^Nach „Dateien umbenennen“: \S/); assert.ok(b.vis, `${width}px: geplanter Name sichtbar`);
      assert.match(b.text, i ? /Flur_Wand_B/ : /Kueche_Decke/, 'geplanter Name enthält die Beschreibung');
      assert.ok(b.w >= 100, `${width}px: geplanter Name sichtbar (Breite ${b.w})`); assert.ok(b.right <= width + 1); assert.equal(b.cut, false);
      assert.equal(await rows.nth(i).locator('.tnote.conflict').isVisible(), false, 'ohne Konflikt kein Hinweis auf der Kachel');
    }
    // Konflikt: ohne Dateinummer zwei gleiche Beschreibungen → Karte zeigt „Name doppelt“ vollständig, beide Kacheln den Hinweis
    await ui.namen(page); await page.locator('#oNum').uncheck(); await ui.namenZu(page);
    await desc(1).fill('Kueche Decke');
    for (const i of [0, 1]) {
      const b = await karte(i);
      assert.match(b.text, /^⚠ .+ \(Name doppelt \/ existiert\)$/); assert.equal(b.cut, false, `${width}px: Konflikt vollständig lesbar`); assert.ok(b.w >= 100);
      const n = await notiz(i);
      assert.ok(n.vis, `${width}px: Konflikt auf Kachel ${i} sichtbar`); assert.equal(n.text, '⚠ Dateiname doppelt'); assert.equal(n.cut, false);
      assert.equal(await rows.nth(i).evaluate(e => e.classList.contains('conflict')), true, 'Kachel als Konflikt markiert');
    }
    // Langer doppelter Name ohne Leerzeichen (werden zu „_“): muss umbrechen statt abgeschnitten zu werden oder das Layout zu sprengen
    const lang = 'Wohnzimmer Brandraum Decke verrusst Untersicht Nordwand oberhalb Fenster links neben Heizkoerper';
    await desc(0).fill(lang); await desc(1).fill(lang);
    for (const i of [0, 1]) {
      const b = await karte(i);
      assert.match(b.text, /Name doppelt/); assert.match(b.text, /Heizkoerper/, 'langer Name vollständig in der Karte');
      assert.equal(b.cut, false, `${width}px: langer Konfliktname vollständig lesbar`); assert.ok(b.right <= width + 1);
      const n = await notiz(i);
      assert.ok(n.vis); assert.equal(n.cut, false); assert.ok(n.right <= width + 1);
      assert.ok(await kachelImFenster(i), `${width}px: Kachel ${i} bleibt im Fenster`);
    }
    assert.ok(await breite() <= breiteVorher + 1, `${width}px: lange Namen machen die Seite nicht breiter`);
    assert.ok(await page.evaluate(w => document.querySelector('#app').scrollWidth <= w + 1, width), `${width}px: Fotobereich ohne waagerechten Bildlauf`);
    // unveränderter Name: in der Karte keine leere Zeile, auf der Kachel kein Hinweis
    assert.equal((await karte(2)).vis, false, 'unveränderter Name: keine leere Zeile');
    assert.equal(await rows.nth(2).locator('.tnote.conflict').isVisible(), false);
    assert.deepEqual(errors, []);
    console.log(`OK (${browserName}, ${width}px): geplanter Name und Konflikt in Fotokarte und Kachel sichtbar`);
    await ctx.close();
  }
  await browser.close(); server.close();
})().catch(async e => { console.error(e); console.log(`::error title=Browsertest Zeile ${browserName}::${String(e && e.message || e).split('\n')[0]}`); try { await browser?.close(); server?.close(); } catch {} process.exit(1); });
