const { waitForAsync } = require('./await-condition.cjs');
// Actual clicks/keyboard/form interaction on the unchanged production app.
// Only folder/save pickers use synthetic OPFS handles. No internal test API.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const playwright = require('playwright');
const name = process.argv[2] || 'chromium';
const root = path.join(__dirname, '..');
const artifacts = process.env.FOTOKIT_ARTIFACT_DIR;
const projects = { A: '26.0701 Sehr langer Projektname mit mehreren Gebäudeteilen und einer ausführlichen Adresse Musterstraße 123 in Teststadt', B: '26.0702 UX-Test B' };
let browser, server;

(async () => {
  server = http.createServer((req, res) => {
    const f = path.join(root, new URL(req.url, 'http://x').pathname.replace(/^\/+/, '') || 'index.html');
    if (!f.startsWith(root + path.sep) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }); res.end(fs.readFileSync(f));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  browser = await playwright[name].launch();
  const layouts = [];
  if (artifacts) fs.mkdirSync(artifacts, { recursive: true });

  async function run(width, protectedProject = false) {
    const ctx = await browser.newContext({ viewport: { width, height: width === 768 ? 1024 : 900 } });
    try {
      const page = await ctx.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
      const toggle = page.getByRole('button', { name: 'Dateibenennung und weitere Einstellungen', exact: true });
      assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
      assert.equal(await toggle.getAttribute('aria-controls'), 'namingOptions');
      assert.equal(await page.locator('#oPrefix').isVisible(), false);
      assert.equal(await page.locator('#example').isVisible(), true);
      // Native button activation and tab order, including browsers without picker support.
      await toggle.focus(); await page.keyboard.press('Enter');
      assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
      await page.keyboard.press('Tab'); assert.equal(await page.locator('#oPrefix').evaluate(e => e === document.activeElement), true);
      await toggle.focus(); await page.keyboard.press('Space');
      assert.equal(await page.locator('#oPrefix').isVisible(), false);
      await page.keyboard.press('Tab'); assert.equal(await page.locator('#namingOptions').evaluate(e => e.contains(document.activeElement)), false);

      const canWrite = await page.evaluate(async () => {
        try { const r = await navigator.storage.getDirectory(), h = await r.getFileHandle('probe', { create: true });
          if (!('showDirectoryPicker' in window) || !h.createWritable) return false;
          const w = await h.createWritable(); await w.write('test'); await w.close(); await r.removeEntry('probe'); return true;
        } catch (e) { return false; }
      });
      if (!canWrite) {
        assert.deepEqual(errors, []);
        console.log(`SKIP (${name}, ${width}px): Dateifunktionen ohne Ordnerzugriff; nur Einklappen und Tastatur geprüft`);
        return false;
      }
      await page.evaluate(async ({ projects, protectedProject }) => {
        const r = await navigator.storage.getDirectory();
        const put = async (d, n, data) => { const w = await (await d.getFileHandle(n, { create: true })).createWritable(); await w.write(data); await w.close(); };
        const canvas = document.createElement('canvas'); canvas.width = 400; canvas.height = 300;
        const g = canvas.getContext('2d'); g.fillStyle = '#4179b2'; g.fillRect(0, 0, 400, 300); g.fillStyle = 'white'; g.font = '20px sans-serif'; g.fillText('Synthetisches UX-Testbild', 30, 150);
        const jpg = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg'));
        for (const [key, n] of Object.entries(projects)) {
          const p = await r.getDirectoryHandle(n, { create: true }), f = await p.getDirectoryHandle('Fotos', { create: true });
          await put(p, '_Projekt.json', JSON.stringify({ format: 'mosaik-projekt', version: 1, objekt: 'Synthetisches Objekt ' + key, sachverstaendiger: 'Testperson' }));
          await put(f, '_Bildumbenenner.json', JSON.stringify({ app: 'Bildumbenenner', format: protectedProject && key === 'A' ? 2 : 1, version: '1.8.3',
            projekt: { proj: n.split(' ')[0], objekt: 'Synthetisches Objekt ' + key },
            benennung: { prefix: key, date: false, num: true, start: 1, digits: 2, sep: '_', spaces: true, uml: false, lower: true, probe: true, discard: 'move', sort: 'manual' },
            reihenfolge: ['IMG_0001.jpg', 'IMG_0002.jpg', 'IMG_0003.jpg'],
            bilder: { 'IMG_0001.jpg': { beschreibung: 'Decke', abschnitt: 'Küche', probe: 'P1' }, 'IMG_0002.jpg': { beschreibung: 'Wand', abschnitt: 'Flur' }, 'IMG_0003.jpg': { beschreibung: 'Boden' } } }));
          for (let i = 1; i <= 3; i++) await put(f, `IMG_000${i}.jpg`, jpg);
        }
        localStorage.setItem('bu-zipimg', JSON.stringify({ shrink: false, edge: 2500, q: 90, record: false }));
        localStorage.setItem('bu-pdf', JSON.stringify({ perPage: 1, maxMB: 10, secPage: true }));
        window.testNext = 'A'; window.showDirectoryPicker = () => r.getDirectoryHandle(projects[window.testNext]);
        window.showSaveFilePicker = async opts => (await (await r.getDirectoryHandle(projects[window.testNext])).getDirectoryHandle('Fotos')).getFileHandle(opts.suggestedName, { create: true });
      }, { projects, protectedProject });
      const snapshot = async (key, required = []) => {
        // Playwright 1.56.1 treats an async predicate's Promise as truthy before
        // it resolves. A false result from a transient read is not polled again.
        // Await each complete scan explicitly and retry under a bounded deadline.
        const deadline = Date.now() + 30000;
        while (Date.now() < deadline) {
          const value = await page.evaluate(async ([key, projects, required]) => {
            try { const p = await (await navigator.storage.getDirectory()).getDirectoryHandle(projects[key]), files = {};
              const walk = async (d, prefix) => { for await (const [n, entry] of d.entries()) {
                if (entry.kind === 'directory') { files[prefix + n + '/'] = 'directory'; await walk(entry, prefix + n + '/'); }
                else files[prefix + n] = Array.from(new Uint8Array(await (await entry.getFile()).arrayBuffer()));
              } }; await walk(p, '');
              if (required.some(ext => !Object.keys(files).some(n => n.endsWith(ext)))) return false;
              return files;
            } catch (e) { if (e.name === 'NotReadableError' || e.name === 'NotFoundError') return false; throw e; }
          }, [key, projects, required]);
          if (value) return value;
          await page.waitForTimeout(25);
        }
        throw new Error('No complete readable project snapshot within 30 seconds: ' + key);
      };
      const open = async key => {
        await page.evaluate(key => { window.testNext = key; }, key); await page.getByRole('button', { name: 'Projekt öffnen …', exact: true }).first().click();
        await page.waitForFunction(nr => !document.body.inert && document.querySelectorAll('#list .row').length === 3 && document.querySelector('#projBadge').textContent.includes(nr), projects[key].split(' ')[0]);
      };
      const values = () => page.locator('#namingOptions input, #namingOptions select').evaluateAll(es => Object.fromEntries(es.map(e => [e.id, e.type === 'checkbox' ? e.checked : e.value])));
      const inspectLayout = async state => {
        const layout = await page.evaluate(() => {
          const rect = id => { const b = document.getElementById(id).getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height, right: b.right, bottom: b.bottom }; };
          return { viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth, header: rect('btnNaming'), pdf: rect('btnPdf'), list: rect('listWrap'), preview: rect('previewPane'), footer: rect('foot') };
        });
        assert.ok(layout.scrollWidth <= width + 1, `Keine Seitenüberbreite: ${layout.scrollWidth}/${width}`);
        assert.ok(layout.list.height >= 280, 'Bildliste hat mindestens 280 px Arbeitshöhe');
        for (const selector of ['#btnOpen','#btnReload','#btnMeta','#sort','#btnNaming','#projBadge','#btnRename','#btnPdf','#btnZip','#btnLab','#pvPrev','#pvNext','#pvDiscard','#mosaikLeiste']) {
          const b = await page.locator(selector).boundingBox();
          assert.ok(b && b.x >= -1 && b.x + b.width <= width + 1, `${selector} passt in die Fensterbreite`);
        }
        if (width > 860) assert.ok(layout.preview.x >= layout.list.right - 1, 'Desktop bleibt nebeneinander');
        else assert.ok(layout.preview.y >= layout.list.bottom - 1, 'Schmale Ansicht bleibt untereinander');
        assert.ok(layout.header.x >= 0 && layout.header.right <= width + 1, 'Neuer Einstellungsbutton passt in die Breite');
        assert.ok(layout.pdf.x >= 0 && layout.pdf.right <= width + 1, 'PDF-Aktion passt in die Breite');
        assert.ok(layout.preview.bottom <= layout.footer.y + 1, 'Vorschau wird nicht von der Aktionsleiste überlagert');
        layouts.push({ width, protectedProject, state, ...layout });
        if (artifacts) await page.screenshot({ path: path.join(artifacts, `${width}-${protectedProject ? 'geschuetzt-' : ''}${state}.png`), fullPage: true });
      };
      const before = await snapshot('A'), beforeB = await snapshot('B');
      await open('A');
      assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
      assert.equal(await page.locator('#btnPdf').textContent(), 'Bilddokumentation erstellen …');
      assert.equal(await page.locator('#btnPdf').evaluate(e => e.classList.contains('primary')), true);
      assert.equal(await page.locator('#btnRename').evaluate(e => e.classList.contains('primary')), false);
      assert.equal(await page.getByRole('group', { name: 'Projekt und Fotos', exact: true }).count(), 1);
      assert.equal(await page.getByRole('group', { name: 'Bilddokumentation und Export', exact: true }).count(), 1);
      await inspectLayout('eingeklappt');
      await toggle.click();
      assert.equal(await page.locator('#namingOptions input, #namingOptions select').count(), 11);
      if (!protectedProject) {
        await page.locator('#oPrefix').fill('Test'); await page.locator('#oStart').fill('7'); await page.locator('#oDigits').fill('3');
        await page.locator('#oSep').selectOption('-'); await page.locator('#oSpaces').uncheck(); await page.locator('#oUml').check();
        await page.locator('#oDate').check(); await page.locator('#oDate').uncheck(); await page.locator('#oNum').check();
        await page.locator('#oLower').check(); await page.locator('#oProbe').check(); await page.locator('#oDiscard').selectOption('keep'); await page.locator('#oDiscard').selectOption('move');
      }
      await inspectLayout('aufgeklappt');
      const expected = await values(), example = await page.locator('#example').textContent(), names = await page.locator('#list .res').allTextContents();
      // Drain existing autosave via the real UI before checking that disclosure
      // alone leaves byte-identical files and personal/export settings.
      await toggle.click(); await page.getByRole('button', { name: 'Fotos neu einlesen', exact: true }).click();
      await page.waitForFunction(() => !document.body.inert);
      const settled = await snapshot('A'), storage = await page.evaluate(() => ({ settings: localStorage.getItem('bu-settings'), img: localStorage.getItem('bu-zipimg'), pdf: localStorage.getItem('bu-pdf') }));
      for (let i = 0; i < 2; i++) {
        await toggle.click(); assert.deepEqual(await values(), expected);
        await toggle.focus(); await page.keyboard.press('Space');
        assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
        assert.equal(await page.locator('#oPrefix').isVisible(), false);
        assert.equal(await page.locator('#example').textContent(), example);
        assert.deepEqual(await page.locator('#list .res').allTextContents(), names);
      }
      if (width <= 860) {
        const previewToggle = page.locator('#btnPreview');
        await page.locator('#list .desc').first().click();
        await page.locator('#pvImg').evaluate(img => img.decode());
        const selected = await page.locator('#pvName').textContent();
        const descriptions = await page.locator('#list .desc').evaluateAll(es => es.map(e => e.value));
        const listHeight = await page.locator('#listWrap').evaluate(e => e.clientHeight);
        await previewToggle.focus(); await page.keyboard.press('Enter');
        assert.equal(await previewToggle.getAttribute('aria-expanded'), 'false');
        assert.equal(await page.locator('#pvImg').isVisible(), false);
        assert.ok(await page.locator('#listWrap').evaluate(e => e.clientHeight) >= listHeight, 'Einklappen vergrößert die Liste');
        await page.locator('#list .desc').first().press('Enter');
        assert.equal(await page.locator('#list .desc').nth(1).evaluate(e => e === document.activeElement), true);
        assert.notEqual(await page.locator('#pvName').textContent(), selected);
        await previewToggle.focus(); await page.keyboard.press('Space');
        assert.equal(await previewToggle.getAttribute('aria-expanded'), 'true');
        assert.equal(await page.locator('#pvName').textContent(), 'IMG_0002.jpg');
        await page.waitForFunction(() => document.querySelector('#pvImg').clientHeight > 0);
        await page.locator('#list .desc').nth(1).press('Shift+Enter');
        assert.equal(await page.locator('#pvName').textContent(), selected);
        assert.deepEqual(await page.locator('#list .desc').evaluateAll(es => es.map(e => e.value)), descriptions);
        assert.ok(await page.locator('#listWrap').evaluate(e => e.scrollHeight > e.clientHeight), 'Liste ist scrollbar');
        await page.locator('#list .desc').last().click();
        assert.equal(await page.locator('#list .desc').last().evaluate(e => e === document.activeElement), true);
        await previewToggle.click();
        await page.setViewportSize({ width:1280, height:900 });
        assert.equal(await page.locator('#pvImg').isVisible(), true, 'Desktop zeigt Vorschau auch nach mobilem Einklappen');
        await page.setViewportSize({ width, height: width === 768 ? 1024 : 900 });
        assert.equal(await page.locator('#pvImg').isVisible(), false);
        await previewToggle.click();
        await inspectLayout('vorschau-wieder-offen');
      }
      assert.deepEqual(await snapshot('A'), settled, 'Disclosure ändert keine gespeicherten Daten');
      assert.deepEqual(await page.evaluate(() => ({ settings: localStorage.getItem('bu-settings'), img: localStorage.getItem('bu-zipimg'), pdf: localStorage.getItem('bu-pdf') })), storage);
      if (protectedProject) {
        assert.equal(await page.locator('#btnRename').isDisabled(), true);
        await page.locator('#list .desc').first().fill('Nur Sitzung'); await page.locator('#list .desc').first().press('Alt+x');
        assert.equal(await page.locator('#btnRename').isDisabled(), true);
        assert.deepEqual(await snapshot('A'), before, 'Geschütztes Projekt bleibt bytegenau erhalten');
      } else {
        await page.locator('#list .desc').first().fill('Küche Decke'); await page.locator('#list .desc').first().press('Enter');
        assert.equal(await page.locator('#list .desc').nth(1).evaluate(e => e === document.activeElement), true);
        await page.locator('#list .desc').nth(1).press('Control+d');
        await page.locator('#list .row').nth(1).locator('.up').click();
        await page.locator('#sort').selectOption('name'); await page.locator('#sort').selectOption('manual');
        await page.locator('#list .row').nth(2).locator('.x').click();
        await page.locator('#btnRename').click(); await page.locator('#dOk').click(); await page.locator('#bUndo').waitFor();
        let files = await snapshot('A');
        assert.deepEqual(files['Fotos/_aussortiert/IMG_0003.jpg'], before['Fotos/IMG_0003.jpg']);
        assert.equal(files['Fotos/IMG_0001.jpg'], undefined);
        await page.locator('#bCsv').click(); await page.waitForFunction(() => document.querySelector('#bCsv').textContent.includes('gespeichert'));
        assert.ok(Object.keys(await snapshot('A')).some(n => n.endsWith('.csv')));
        await page.locator('#bUndo').click(); await page.waitForFunction(() => document.querySelector('#banner').textContent.includes('Rückgängig gemacht'));
        files = await snapshot('A');
        for (let i = 1; i <= 3; i++) assert.deepEqual(files[`Fotos/IMG_000${i}.jpg`], before[`Fotos/IMG_000${i}.jpg`]);
        assert.equal(Object.keys(files).some(n => /umb-tmp_|~umb_/.test(n)), false);
        await page.getByRole('button', { name: 'Bilddokumentation erstellen …', exact: true }).click();
        assert.equal(await page.locator('#pPer').inputValue(), '1'); assert.equal(await page.locator('#pMax').inputValue(), '10'); assert.equal(await page.locator('#pSecPage').isChecked(), true);
        assert.equal(await page.locator('#zShrink').isChecked(), false);
        assert.equal(Object.keys(await snapshot('A')).some(n => n.endsWith('.pdf')), false, 'Kein automatischer Export');
        await page.locator('#zOk').click(); await page.locator('.pdfOpen').waitFor();
        await page.getByRole('button', { name: 'ZIP exportieren …', exact: true }).click();
        assert.equal(await page.locator('#zEdge').inputValue(), '2500'); assert.equal(await page.locator('#zQ').inputValue(), '90');
        await page.locator('#zOk').click(); await page.waitForFunction(() => document.querySelector('#banner').textContent.includes('ZIP gespeichert'));
        // Directory enumeration is not a transaction while N2 snapshots are
        // appended. Require both exports in the same completed inspector scan;
        // the original byte/signature assertions below still run unchanged.
        files = await snapshot('A', ['.pdf', '.zip']);
        const pdf = Object.keys(files).find(n => n.endsWith('.pdf')), zip = Object.keys(files).find(n => n.endsWith('.zip'));
        assert.ok(pdf && zip); assert.equal(Buffer.from(files[pdf]).subarray(0, 4).toString(), '%PDF'); assert.equal(Buffer.from(files[zip]).readUInt32LE(), 0x04034b50);
        await page.locator('#list .desc').first().fill('Letzte Eingabe vor Projektwechsel'); await open('B');
        const a = await snapshot('A'), json = JSON.parse(Buffer.from(a['Fotos/_Bildumbenenner.json']).toString());
        assert.equal(json.bilder['IMG_0001.jpg'].beschreibung, 'Letzte Eingabe vor Projektwechsel'); assert.equal(json.format, 1);
        assert.deepEqual(await snapshot('B'), beforeB, 'Keine A-Einstellungen/Daten im Projekt B');
        await open('A'); await toggle.click(); assert.deepEqual(await values(), expected, 'Gespeicherte Einstellungen nach Projektwechsel erhalten');
        await toggle.click();
      }
      assert.deepEqual(errors, []);
      console.log(`OK (${name}, ${width}px${protectedProject ? ', geschützt' : ''}): Disclosure/Tastatur, Werterhalt und reale Bedienabläufe`);
      return true;
    } finally { await ctx.close(); }
  }
  await run(1280); await run(768); await run(390); await run(320); await run(1280, true);
  if (artifacts) fs.writeFileSync(path.join(artifacts, 'layout.json'), JSON.stringify(layouts, null, 2));
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close(); if (server) await new Promise(resolve => server.close(resolve));
});
