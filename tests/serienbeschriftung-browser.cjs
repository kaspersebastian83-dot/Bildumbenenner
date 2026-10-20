// Real keyboard/clicks on synthetic OPFS projects. Only pickers and filesystem
// latency/failures are controlled; no production test API or synthetic key events.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const playwright = require('playwright');
const browserName = process.argv[2] || 'chromium';
const root = path.join(__dirname, '..');
const counts = process.argv[3] ? [Number(process.argv[3])] : [5, 50, 150];
assert.ok(counts.every(n => [5, 50, 150].includes(n)), 'Bildanzahl: 5, 50 oder 150');
let browser, server;
(async () => {
  server = http.createServer((req, res) => {
    const f = path.join(root, new URL(req.url, 'http://x').pathname.replace(/^\/+/, '') || 'index.html');
    if (!f.startsWith(root + path.sep) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }); res.end(fs.readFileSync(f));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  browser = await playwright[browserName].launch();
  const url = `http://127.0.0.1:${server.address().port}/index.html`;
  const filename = i => `IMG_${String(i + 1).padStart(4, '0')}.jpg`;
  for (const count of counts) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    try {
      const page = await ctx.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      await page.goto(url);
      const canWrite = await page.evaluate(async () => {
        try { const d = await navigator.storage.getDirectory(), h = await d.getFileHandle('probe', { create: true });
          if (!('showDirectoryPicker' in window) || !h.createWritable) return false;
          const w = await h.createWritable(); await w.write('test'); await w.close(); return true;
        } catch { return false; }
      });
      if (!canWrite) { console.log(`SKIP (${browserName}, ${count} Bilder): kein schreibbarer Ordnerzugriff`); assert.deepEqual(errors, []); continue; }
      await page.evaluate(async count => {
        const root = await navigator.storage.getDirectory();
        const put = async (d, name, data) => { const w = await (await d.getFileHandle(name, { create: true })).createWritable(); await w.write(data); await w.close(); };
        for (const [key, n] of [['A', count], ['B', 5]]) {
          const p = await root.getDirectoryHandle(`26.080${key === 'A' ? 1 : 2} Serie ${key}`, { create: true });
          const d = await p.getDirectoryHandle('Fotos', { create: true }), bilder = {}, order = [];
          for (let i = 0; i < n; i++) {
            const name = `IMG_${String(i + 1).padStart(4, '0')}.jpg`; order.push(name);
            bilder[name] = { beschreibung: `Alt ${i + 1}`, abschnitt: i === 0 ? 'Küche' : i === 3 ? 'Wohnzimmer' : '', probe: i === 0 ? 'P1' : '' };
            const c = document.createElement('canvas'); c.width = 64 + i; c.height = 48;
            const g = c.getContext('2d'); g.fillStyle = `hsl(${i * 29},70%,50%)`; g.fillRect(0, 0, c.width, c.height);
            await put(d, name, await new Promise(r => c.toBlob(r, 'image/jpeg')));
          }
          await put(p, '_Projekt.json', JSON.stringify({ format: 'mosaik-projekt', version: 1, objekt: `Serie ${key}` }));
          await put(d, '_Bildumbenenner.json', JSON.stringify({ app: 'Bildumbenenner', format: 1, version: '1.9.1', projekt: { objekt: `Serie ${key}` },
            benennung: { prefix: '', date: false, num: true, start: 1, digits: 3, sep: '_', spaces: true, uml: false, lower: true, probe: true, discard: 'move', sort: 'manual' }, reihenfolge: order, bilder }));
        }
        window.nextProject = 'A';
        window.showDirectoryPicker = () => root.getDirectoryHandle(`26.080${window.nextProject === 'A' ? 1 : 2} Serie ${window.nextProject}`);
      }, count);
      const rows = page.locator('#list .row'), desc = page.locator('#list .desc');
      const open = async key => {
        await page.evaluate(key => { window.nextProject = key; }, key); await page.locator('#btnOpen').click();
        await page.waitForFunction(([n, key]) => !document.body.inert && document.querySelectorAll('#list .row').length === n && document.querySelector('#projBadge').textContent.includes(key === 'A' ? '26.0801' : '26.0802'), [key === 'A' ? count : 5, key]);
      };
      const json = async () => {
        const h = await page.waitForFunction(async () => {
          try { const p = await (await navigator.storage.getDirectory()).getDirectoryHandle('26.0801 Serie A'), d = await p.getDirectoryHandle('Fotos');
            return JSON.parse(await (await (await d.getFileHandle('_Bildumbenenner.json')).getFile()).text());
          } catch (e) { if (e.name === 'NotReadableError') return false; throw e; }
        });
        try { return await h.jsonValue(); } finally { await h.dispose(); }
      };
      const focused = async (i, image = i) => {
        assert.equal(await desc.nth(i).evaluate(e => e === document.activeElement), true, `Fokus bei Bild ${i + 1}`);
        assert.equal(await rows.nth(i).evaluate(e => e.classList.contains('active')), true);
        assert.equal(await page.locator('#pvName').textContent(), filename(image));
        assert.ok(await rows.nth(i).evaluate(e => { const a = e.getBoundingClientRect(), b = document.getElementById('listWrap').getBoundingClientRect(); return a.top >= b.top - 1 && a.bottom <= b.bottom + 1; }), 'Aktive Zeile vollständig sichtbar');
      };
      const preview = async i => {
        await page.waitForFunction(([name, width]) => { const img = document.getElementById('pvImg'); return img.alt === name && img.complete && img.naturalWidth === width && document.getElementById('pvImgWrap').getAttribute('aria-busy') === 'false'; }, [filename(i), 64 + i]);
      };
      await open('A'); await desc.first().click(); await preview(0);
      await page.keyboard.press('Shift+Enter'); await focused(0);
      await page.keyboard.press('ArrowDown'); await focused(1);
      await page.keyboard.press('ArrowUp'); await focused(0);
      await page.keyboard.press('Control+Enter'); await focused(0);
      await page.keyboard.press('Enter'); await focused(1);
      await page.keyboard.press('Control+d'); assert.equal(await desc.nth(1).inputValue(), 'Alt 1');
      await rows.nth(1).locator('.probe').click(); await page.keyboard.press('Control+d');
      assert.equal(await rows.nth(1).locator('.probe').inputValue(), 'P1');
      await rows.nth(1).locator('.sec').click(); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Escape');
      assert.equal(await rows.nth(1).locator('.sec').evaluate(e => e === document.activeElement), true, 'Abschnittspfeile navigieren nicht durch Bilder');
      await page.keyboard.press('Control+d'); assert.equal(await rows.nth(1).locator('.sec').inputValue(), 'Küche');
      await rows.nth(1).locator('.sec').fill('');
      await rows.first().locator('.sec').fill('Bad');
      assert.equal(await rows.nth(2).locator('.sec').inputValue(), '', 'Vererbung schreibt keine Raumwerte');
      assert.equal(await rows.nth(2).locator('.section-status').textContent(), 'Abschnitt: Bad · von vorherigem Bild übernommen');
      assert.equal(await rows.first().locator('.section-status').textContent(), 'Abschnitt: Bad · eingetragen');
      assert.equal(await rows.nth(4).locator('.section-status').textContent(), 'Abschnitt: Wohnzimmer · von vorherigem Bild übernommen');
      await rows.nth(2).locator('.sec').press('Enter'); await focused(3);
      await rows.nth(3).locator('.probe').press('Shift+Enter'); await focused(2);
      const beforeDialog = await desc.evaluateAll(es => es.map(e => e.value));
      await page.keyboard.press('F1');
      for (const key of ['Enter', 'Shift+Enter', 'ArrowDown', 'Control+d', 'Alt+x', 'Alt+r']) await page.keyboard.press(key);
      assert.equal(await page.locator('#pvName').textContent(), filename(2), 'Dialog verhindert Aktionen im Hintergrund');
      assert.equal(await page.locator('#list .discarded, #list .rotated').count(), 0);
      assert.deepEqual(await desc.evaluateAll(es => es.map(e => e.value)), beforeDialog);
      await page.locator('#hClose').click();
      await desc.nth(2).click(); await preview(2); await page.locator('#pvImgWrap').click();
      await page.keyboard.press('Enter'); await page.keyboard.press('Alt+x');
      assert.equal(await page.locator('#pvName').textContent(), filename(2), 'Vollbild verhindert Zeilenaktionen');
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#lightbox').isVisible(), false);
      const metadata = () => rows.evaluateAll(es => Object.fromEntries(es.map(e => [e.querySelector('.orig').textContent.split(' · ')[0], { sec: e.querySelector('.sec').value, probe: e.querySelector('.probe').value }])));
      const beforeMove = await metadata();
      await rows.first().locator('.down').click(); await focused(1, 0);
      assert.equal(await rows.first().locator('.section-status').textContent(), 'Abschnitt: nicht zugeordnet');
      assert.equal(await rows.nth(2).locator('.section-status').textContent(), 'Abschnitt: Bad · von vorherigem Bild übernommen');
      assert.deepEqual(await metadata(), beforeMove, 'Manuelles Verschieben verändert keine eingetragenen Räume/Proben');
      await rows.nth(1).locator('.up').click(); await focused(0);
      await page.locator('#sort').selectOption('name'); await page.locator('#sort').selectOption('manual');
      assert.deepEqual(await metadata(), beforeMove);

      if (count === 5) {
        // Wait for the nearby thumbnails before controlling only subsequent reads.
        await rows.nth(1).locator('.thumb img').waitFor(); await rows.nth(2).locator('.thumb img').waitFor();
        await page.evaluate(() => {
          window.previewIO = { hold: '', fail: false, reads: {}, release: null };
          const get = FileSystemFileHandle.prototype.getFile;
          FileSystemFileHandle.prototype.getFile = async function (...args) {
            const io = window.previewIO;
            if (this.name.endsWith('.jpg')) io.reads[this.name] = (io.reads[this.name] || 0) + 1;
            if (io.hold === this.name) {
              io.hold = ''; const fail = io.fail;
              await new Promise(r => { io.release = r; });
              if (fail) throw new Error('Synthetischer verspäteter Lesefehler');
            }
            return get.apply(this, args);
          };
        });
        for (const fail of [true, false]) {
          await desc.first().click(); await preview(0);
          await page.evaluate(fail => { window.previewIO.hold = 'IMG_0002.jpg'; window.previewIO.fail = fail; window.previewIO.release = null; window.previewIO.reads = {}; }, fail);
          await page.keyboard.press('Enter'); await page.waitForFunction(() => !!window.previewIO.release);
          await page.keyboard.press('Enter'); await preview(2);
          const old = await page.locator('#pvImg').getAttribute('src');
          await page.evaluate(() => window.previewIO.release());
          // Allow the deliberately delayed continuation to run, then verify pixel dimensions and URL.
          await page.waitForTimeout(100); await preview(2);
          assert.equal(await page.locator('#pvImg').getAttribute('src'), old);
          assert.deepEqual(await page.evaluate(() => window.previewIO.reads), { 'IMG_0002.jpg': 1, 'IMG_0003.jpg': 1 }, 'Ein Lesevorgang pro Auswahl, auch beim Fokussieren');
        }
      }
      await desc.first().click();
      const start = Date.now();
      for (let i = 0; i < count; i++) {
        await focused(i);
        await page.keyboard.press(process.platform === 'darwin' ? 'Meta+a' : 'Control+a'); await page.keyboard.insertText(`Serie ${i + 1}`); await page.keyboard.press('Enter');
      }
      await focused(count - 1); await page.keyboard.press('Enter'); await focused(count - 1); await preview(count - 1);
      assert.deepEqual(await desc.evaluateAll(es => es.map(e => e.value)), Array.from({ length: count }, (_, i) => `Serie ${i + 1}`));
      console.log(`INFO (${browserName}, ${count} Bilder): reale Eingabe/Navigationsserie ${Date.now() - start} ms`);
      // Hold one native write completion, keep typing, then request a project change.
      await page.evaluate(() => {
        const create = FileSystemFileHandle.prototype.createWritable;
        window.writeStarted = false; window.releaseWrite = null; let hold = true;
        FileSystemFileHandle.prototype.createWritable = async function (...args) {
          const w = await create.apply(this, args), close = w.close.bind(w);
          if (this.name === '_Bildumbenenner.json') w.close = async () => {
            if (hold) { hold = false; window.writeStarted = true; await new Promise(r => { window.releaseWrite = r; }); }
            return close();
          };
          return w;
        };
      });
      await desc.first().fill('Weiter während Autosave'); await page.waitForFunction(() => window.writeStarted);
      await desc.nth(1).fill('Letzte Eingabe vor Projektwechsel');
      await page.evaluate(() => { window.nextProject = 'B'; }); await page.locator('#btnOpen').click();
      await page.waitForFunction(() => document.body.inert);
      assert.match(await page.locator('#projBadge').textContent(), /26\.0801/);
      await page.evaluate(() => window.releaseWrite());
      await page.waitForFunction(() => !document.body.inert && document.querySelector('#projBadge').textContent.includes('26.0802'));
      const saved = await json();
      assert.equal(saved.format, 1); assert.equal(saved.bilder[filename(0)].beschreibung, 'Weiter während Autosave');
      assert.equal(saved.bilder[filename(1)].beschreibung, 'Letzte Eingabe vor Projektwechsel');
      for (let i = 2; i < count; i++) assert.equal(saved.bilder[filename(i)].beschreibung, `Serie ${i + 1}`);
      assert.equal(saved.bilder[filename(0)].abschnitt, 'Bad'); assert.ok(!saved.bilder[filename(1)].abschnitt);
      assert.equal(saved.bilder[filename(1)].probe, 'P1');
      await open('A');
      await desc.last().fill('Klickwechsel ohne Enter'); await desc.first().click();
      await page.locator('#btnReload').click(); await page.waitForFunction(() => !document.body.inert);
      assert.equal((await json()).bilder[filename(count - 1)].beschreibung, 'Klickwechsel ohne Enter');
      await page.reload();
      await page.evaluate(async () => { const r = await navigator.storage.getDirectory(); window.showDirectoryPicker = () => r.getDirectoryHandle('26.0801 Serie A'); });
      await page.locator('#btnOpen').click(); await page.waitForFunction(n => !document.body.inert && document.querySelectorAll('#list .row').length === n, count);
      assert.equal(await desc.first().inputValue(), 'Weiter während Autosave');
      assert.equal(await desc.nth(1).inputValue(), 'Letzte Eingabe vor Projektwechsel');
      assert.equal(await desc.last().inputValue(), 'Klickwechsel ohne Enter');
      assert.equal(await rows.nth(2).locator('.section-status').textContent(), 'Abschnitt: Bad · von vorherigem Bild übernommen');
      assert.deepEqual(errors, []);
      console.log(`OK (${browserName}, ${count} Bilder): Tastatur, Fokus, Vorschau, Vererbung, Sortierung, Autosave und erneutes Öffnen`);
    } finally { await ctx.close(); }
  }
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close(); if (server) await new Promise(r => server.close(r));
});
