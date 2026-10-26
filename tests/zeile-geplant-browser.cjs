// FotoKit 1.17.1: In der Bildzeile bleibt der geplante Name sichtbar – auch bei langen Originalnamen und schmalen Fenstern;
// Konflikte („Name doppelt“) stehen vollständig in eigener Zeile. Synthetisches OPFS-Projekt, nur ASCII-Ordnernamen.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const playwright = require('playwright');
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
    await page.locator('#btnOpen').click();
    await page.waitForFunction(() => !document.body.inert && document.querySelectorAll('#list .row').length === 3);
    const desc = page.locator('#list .desc');
    await desc.nth(0).fill('Kueche Decke'); await desc.nth(1).fill('Flur Wand B');
    // Sichtbar und breit genug: geplanter Name trotz langem Originalnamen
    const box = async i => page.locator('#list .row').nth(i).locator('.res').evaluate(e => { const r = e.getBoundingClientRect(); return { w: r.width, right: r.right, cut: e.scrollWidth > e.clientWidth + 1, text: e.textContent }; });
    for (const i of [0, 1]) {
      const b = await box(i);
      assert.match(b.text, /^→ /); assert.ok(b.w >= 100, `${width}px: geplanter Name sichtbar (Breite ${b.w})`); assert.ok(b.right <= width + 1);
    }
    // Konflikt: ohne Dateinummer zwei gleiche Beschreibungen → beide Zeilen zeigen „Name doppelt“ vollständig
    await page.locator('#btnNaming').click(); await page.locator('#oNum').uncheck(); await page.locator('#btnNaming').click();
    await desc.nth(1).fill('Kueche Decke');
    for (const i of [0, 1]) {
      const b = await box(i);
      assert.match(b.text, /Name doppelt/); assert.equal(b.cut, false, `${width}px: Konflikt vollständig lesbar`); assert.ok(b.w >= 100);
    }
    assert.equal(await page.locator('#list .row').nth(2).locator('.res').isVisible(), false, 'unveränderter Name: keine leere Zeile');
    assert.deepEqual(errors, []);
    console.log(`OK (${browserName}, ${width}px): geplanter Name und Konflikt in der Bildzeile sichtbar`);
    await ctx.close();
  }
  await browser.close(); server.close();
})().catch(async e => { console.error(e); console.log(`::error title=Browsertest Zeile ${browserName}::${String(e && e.message || e).split('\n')[0]}`); try { await browser?.close(); server?.close(); } catch {} process.exit(1); });
