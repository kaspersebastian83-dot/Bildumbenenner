const { waitForAsync } = require('./await-condition.cjs');
// Actual clicks/keyboard/form interaction on the unchanged production app.
// Only folder/save pickers use synthetic OPFS handles. No internal test API.
// FotoKit 2.0: Kopfband oben, Raster aus Fotokacheln, Fotokarte #previewPane (rechts ab 761 px, darunter oben), Fußleiste mit
// „Mehr …“ (#btnMehr), Status (#stats) und einer Hauptaktion (#btnPdf). Dateinamen, Sortierung, Umbenennen, ZIP … unter „Mehr …“.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const playwright = require('playwright');
const ui = require('./fk-ui.cjs');
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
  // Ohne UTF-8-Locale (LANG leer, z. B. in CI-Containern) lehnt Chromium OPFS-Dateinamen mit Umlauten ab (TypeMismatchError) – der
  // PDF-Name enthält den Projektnamen „… Gebäudeteilen … Musterstraße …“. Kein App-Verhalten, deshalb eine UTF-8-Locale vorgeben.
  browser = await playwright[name].launch({ env: { ...process.env, LANG: process.env.LANG || 'C.UTF-8' } });
  const layouts = [];
  if (artifacts) fs.mkdirSync(artifacts, { recursive: true });

  async function run(width, protectedProject = false) {
    const height = width === 768 ? 1024 : 900;
    const ctx = await browser.newContext({ viewport: { width, height } });
    try {
      const page = await ctx.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
      // Startseite: eine Hauptaktion „Projekt öffnen …“, Kopfband oben, Einstellungen und „Mehr …“ erst mit geöffnetem Ordner.
      const start = page.getByRole('button', { name: 'Projekt öffnen …', exact: true });
      await start.waitFor();
      assert.equal(await start.evaluate(e => e.classList.contains('sp-haupt')), true);
      assert.equal(await page.locator('#mosaikLeiste').isVisible(), true);
      assert.equal(await page.locator('#btnMehr').isVisible(), false);
      assert.equal(await page.locator('#oPrefix').isVisible(), false);
      assert.equal(await page.locator('#example').isVisible(), false);
      await page.waitForFunction(() => { const b = document.querySelector('#mosaikLeiste'); return b && (b.scrollWidth <= b.clientWidth + 1 || b.classList.contains('ml-b3')); });
      // Bekannte Grenze der gemeinsamen Leiste v3: bei 320 px steht das Kopfband ein paar Pixel über – dort nur außerhalb des Kopfbands streng prüfen.
      if (width >= 380) assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Startseite ohne Überbreite bei ${width}px`);
      assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('body *')].filter(e => !e.closest('#mosaikLeiste') && e.getClientRects().length && e.getBoundingClientRect().right > innerWidth + 1).map(e => e.id || e.className)), [], `Startseite: außerhalb des Kopfbands nichts zu breit (${width}px)`);

      const canWrite = await page.evaluate(async () => {
        try { const r = await navigator.storage.getDirectory(), h = await r.getFileHandle('probe', { create: true });
          if (!('showDirectoryPicker' in window) || !h.createWritable) return false;
          const w = await h.createWritable(); await w.write('test'); await w.close(); await r.removeEntry('probe'); return true;
        } catch (e) { return false; }
      });
      if (!canWrite) {
        assert.deepEqual(errors, []);
        console.log(`SKIP (${name}, ${width}px): Dateifunktionen ohne Ordnerzugriff; nur Startseite geprüft`);
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
      // Ordner öffnen: Startseite „Projekt öffnen …“ (per Tastatur beim ersten Mal), danach „Mehr …“ › „Anderen Ordner öffnen …“.
      const open = async (key, keyboard = false) => {
        await page.evaluate(key => { window.testNext = key; }, key);
        if (keyboard) { await start.focus(); await page.keyboard.press('Enter'); } else await ui.oeffnen(page);
        await page.waitForFunction(nr => !document.body.inert && document.querySelectorAll('#list .row').length === 3 && (document.querySelector('#mosaikLeiste .ml-proj strong') || {}).textContent?.includes(nr), projects[key].split(' ')[0]);
      };
      const values = () => page.locator('#namingOptions input, #namingOptions select').evaluateAll(es => Object.fromEntries(es.map(e => [e.id, e.type === 'checkbox' ? e.checked : e.value])));
      // Geplanter Name je Foto steht in der Fotokarte (#pvNew) des gewählten Fotos – früher .res in jeder Zeile.
      const geplant = async () => { const r = []; for (let i = 0; i < await page.locator('#list .row').count(); i++) { await ui.foto(page, i); r.push(await page.locator('#pvNew').textContent()); } await ui.foto(page, 0); return r; };
      const beschreibungen = () => page.locator('#list .row .tdesc').allTextContents();
      // Element sichtbar und nicht von etwas anderem (z. B. der Fußleiste) überdeckt?
      const frei = sel => page.evaluate(sel => { const e = document.querySelector(sel); e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect();
        const t = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); return t && (t === e || e.contains(t)) ? '' : sel + ' überdeckt von ' + ((t && t.closest('[id]')) || {}).id; }, sel);
      const inspectLayout = async state => {
        await page.evaluate(() => scrollTo(0, 0));
        // Kopfband passt sich entprellt (100 ms) an die Breite an
        await page.waitForFunction(() => { const b = document.querySelector('#mosaikLeiste'); return b.scrollWidth <= b.clientWidth + 1 || b.classList.contains('ml-b3'); });
        const layout = await page.evaluate(() => {
          const rect = sel => { const b = document.querySelector(sel).getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height, right: b.right, bottom: b.bottom }; };
          const ausserhalbBand = [...document.querySelectorAll('body *')].filter(e => !e.closest('#mosaikLeiste') && e.getClientRects().length && e.getBoundingClientRect().right > innerWidth + 1).map(e => e.id || e.className);
          return { viewport: innerWidth, innerHeight, scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight, ausserhalbBand,
            listDisplay: getComputedStyle(document.getElementById('list')).display,
            band: rect('#mosaikLeiste'), app: rect('#app'), list: rect('#listWrap'), preview: rect('#previewPane'), footer: rect('#foot'),
            mehr: rect('#btnMehr'), stats: rect('#stats'), pdf: rect('#btnPdf'), tiles: [...document.querySelectorAll('#list .row')].map(e => { const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, right: b.right }; }) };
        });
        if (width >= 380) assert.ok(layout.scrollWidth <= width + 1, `Keine Seitenüberbreite: ${layout.scrollWidth}/${width}`);
        // Bekannte Grenze der gemeinsamen Leiste v3 (byte-gleich in allen Apps): bei 320 px bleibt die Kachelreihe im Kopfband einzeilig
        // (Stufe ml-b3, ~376 px). Deshalb bei < 380 px nur prüfen, dass außerhalb des Kopfbands nichts übersteht.
        assert.deepEqual(layout.ausserhalbBand, [], `Außerhalb des Kopfbands steht nichts über (${width}px)`);
        // Kopfband oben, Projekt darin
        assert.ok(Math.abs(layout.band.y) <= 1 && layout.band.bottom <= layout.app.y + 1, 'Kopfband steht oben über der Arbeitsfläche');
        assert.match(await ui.projekt(page), /^\d{2}\.\d{4} · /);
        // Raster aus Kacheln
        assert.equal(layout.listDisplay, 'grid');
        for (const t of layout.tiles) assert.ok(t.x >= -1 && t.right <= width + 1, 'Kachel passt in die Breite');
        // Trennzeilen je Abschnitt (.fk-abschnitt) beginnen eine neue Rasterzeile – IMG_0002/IMG_0003 liegen beide im Abschnitt „Flur“
        if (width >= 390) assert.ok(layout.tiles.some((t, i) => i && Math.abs(t.y - layout.tiles[i - 1].y) <= 3 && t.x >= layout.tiles[i - 1].right), 'Kacheln nebeneinander im Raster');
        // Fotokarte: rechts ab 761 px (380 px breit, bis 1100 px 320 px), darunter oben über den Kacheln in voller Breite
        if (width >= 761) {
          assert.ok(layout.preview.x >= layout.list.right - 1, 'Fotokarte rechts neben den Kacheln');
          assert.ok(Math.abs(layout.preview.width - (width > 1100 ? 380 : 320)) <= 1, `Fotokarte ${width > 1100 ? 380 : 320} px breit: ${layout.preview.width}`);
          assert.ok(layout.preview.right <= width + 1, 'Fotokarte passt in die Breite');
          assert.ok(layout.list.height >= 280, 'Kachelraster hat mindestens 280 px Arbeitshöhe');
          assert.ok(layout.preview.bottom <= layout.footer.y + 1 && layout.list.bottom <= layout.footer.y + 1, 'Fußleiste überlagert weder Karte noch Kacheln');
          assert.ok(layout.footer.bottom <= layout.innerHeight + 1, 'Fußleiste unten im Fenster');
        } else {
          assert.ok(layout.preview.bottom <= layout.list.y + 1, 'Schmale Ansicht: Fotokarte oben, Kacheln darunter');
          assert.ok(Math.abs(layout.preview.width - layout.list.width) <= 2, 'Schmale Ansicht: Fotokarte in voller Breite');
          assert.ok(layout.scrollHeight > layout.innerHeight, 'Schmale Ansicht: die ganze Seite scrollt');
        }
        // Fußleiste: „Mehr …“, Status, eine Hauptaktion
        for (const k of ['mehr', 'stats', 'pdf']) {
          const b = layout[k];
          assert.ok(b.x >= -1 && b.right <= width + 1, `#${k} passt in die Fensterbreite`);
          assert.ok(b.y >= layout.footer.y - 1 && b.bottom <= layout.footer.bottom + 1, `#${k} steht in der Fußleiste`);
        }
        assert.ok(layout.pdf.y >= 0 && layout.pdf.bottom <= layout.innerHeight + 1, 'Hauptaktion ohne Scrollen sichtbar');
        assert.equal(await page.locator('.sp-haupt:visible').count(), 1, 'genau eine Hauptaktion');
        for (const sel of ['#btnPdf', '#btnMehr']) assert.equal(await frei(sel), '');
        // Fußleiste (schmal: position:sticky) überdeckt keine Felder und Knöpfe der Fotokarte
        for (const sel of ['#fDesc', '#fProbe', '#fSec', '#pvRotR', '#pvDiscard', '#pvEarlier', '#pvLater']) assert.equal(await frei(sel), '');
        // Alles hinter „Mehr …“ erreichbar
        await page.evaluate(() => scrollTo(0, 0));
        await page.click('#btnMehr');
        const menu = await page.locator('#mosaikMehrPop').boundingBox();
        assert.ok(menu && menu.x >= 0 && menu.x + menu.width <= width + 1 && menu.y >= 0 && menu.y + menu.height <= layout.innerHeight + 1, 'Menü „Mehr …“ passt ins Fenster');
        for (const id of ['mehrNamen', 'mehrSort', 'mehrUmbenennen', 'mehrZip', 'mehrLab', 'mehrReload', 'mehrOrdner', 'mehrSicher', 'mehrHilfe']) assert.equal(await page.locator('#mosaikMehrPop #' + id).isVisible(), true, `#${id} im Menü`);
        await page.keyboard.press('Escape');
        await page.evaluate(() => scrollTo(0, 0));
        layouts.push({ width, protectedProject, state, ...layout });
        if (artifacts) await page.screenshot({ path: path.join(artifacts, `${width}-${protectedProject ? 'geschuetzt-' : ''}${state}.png`), fullPage: true });
      };
      const before = await snapshot('A'), beforeB = await snapshot('B');
      await open('A', true);
      assert.equal(await page.locator('#dlgNamen').isVisible(), false);
      assert.equal(await page.locator('#btnPdf').textContent(), 'Bilddokumentation erstellen →');
      assert.equal(await page.locator('#btnPdf').evaluate(e => e.classList.contains('sp-haupt')), true);
      assert.equal(await page.locator('#btnRename').isVisible(), false, 'Umbenennen ist keine Hauptaktion (unter „Mehr …“)');
      assert.equal(await page.getByRole('navigation', { name: 'Projekt und Arbeitsschritte', exact: true }).count(), 1);
      assert.equal(await page.getByRole('complementary', { name: 'Gewähltes Foto', exact: true }).count(), 1);
      assert.equal(await page.locator('#foot').evaluate(f => ['btnMehr', 'stats', 'btnPdf'].every(id => f.contains(document.getElementById(id)))), true);
      await inspectLayout('geoeffnet');
      // „Mehr …“ › „Dateinamen …“ mit der Tastatur: Fokus ins erste Feld, Tab bleibt im Dialog, Escape schließt, Fokus zurück auf „Mehr …“
      await page.locator('#btnMehr').focus(); await page.keyboard.press('Enter');
      assert.equal(await page.locator('#mehrNamen').evaluate(e => e === document.activeElement), true);
      await page.keyboard.press('Enter');
      await page.locator('#dlgNamen').waitFor();
      assert.equal(await page.locator('#oPrefix').evaluate(e => e === document.activeElement), true);
      await page.keyboard.press('Tab'); assert.equal(await page.locator('#namingOptions').evaluate(e => e.contains(document.activeElement)), true);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#dlgNamen').isVisible(), false);
      assert.equal(await page.locator('#btnMehr').evaluate(e => e === document.activeElement), true);
      await page.keyboard.press('Space'); assert.equal(await page.locator('#mosaikMehrPop').isVisible(), true);
      await page.keyboard.press('Escape'); assert.equal(await page.locator('#mosaikMehrPop').count(), 0);
      assert.equal(await page.locator('#namingOptions').evaluate(e => e.contains(document.activeElement)), false);
      await ui.namen(page);
      assert.equal(await page.locator('#namingOptions input, #namingOptions select').count(), 12, '11 Benennungsfelder + „Vorschläge beim Tippen“');
      const dlg = await page.locator('#dlgNamen').boundingBox();
      assert.ok(dlg.x >= 0 && dlg.x + dlg.width <= width + 1, 'Dialog „Dateinamen“ passt in die Breite');
      if (!protectedProject) {
        await page.locator('#oPrefix').fill('Test'); await page.locator('#oStart').fill('7'); await page.locator('#oDigits').fill('3');
        await page.locator('#oSep').selectOption('-'); await page.locator('#oSpaces').uncheck(); await page.locator('#oUml').check();
        await page.locator('#oDate').check(); await page.locator('#oDate').uncheck(); await page.locator('#oNum').check();
        await page.locator('#oLower').check(); await page.locator('#oProbe').check(); await page.locator('#oDiscard').selectOption('keep'); await page.locator('#oDiscard').selectOption('move');
      }
      const expected = await values(), example = await page.locator('#example').textContent();
      await ui.namenZu(page);
      await inspectLayout('nach-dateinamen');
      const names = await geplant();
      // Drain existing autosave via the real UI before checking that opening
      // the dialog alone leaves byte-identical files and personal/export settings.
      await ui.mehr(page, 'mehrReload');
      await page.waitForFunction(() => !document.body.inert && document.querySelectorAll('#list .row').length === 3);
      const settled = await snapshot('A'), storage = await page.evaluate(() => ({ settings: localStorage.getItem('bu-settings'), img: localStorage.getItem('bu-zipimg'), pdf: localStorage.getItem('bu-pdf') }));
      for (let i = 0; i < 2; i++) {
        await page.locator('#btnMehr').focus(); await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
        await page.locator('#dlgNamen').waitFor(); assert.deepEqual(await values(), expected);
        assert.equal(await page.locator('#example').textContent(), example);
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('#oPrefix').isVisible(), false);
        assert.deepEqual(await geplant(), names);
      }
      if (width <= 760) {
        // Schmale Ansicht: Karte oben; Enter / Shift+Enter in „Was ist zu sehen?“ wechselt das Foto, Fokus bleibt im Feld
        await ui.foto(page, 0);
        await page.locator('#pvImg').evaluate(img => img.decode());
        const selected = await page.locator('#pvName').textContent(), descriptions = await beschreibungen();
        await page.locator('#fDesc').press('Enter');
        assert.equal(await page.locator('#fDesc').evaluate(e => e === document.activeElement), true);
        assert.equal(await page.locator('#pvName').textContent(), 'IMG_0002.jpg');
        assert.equal(await page.locator('#list .row').nth(1).evaluate(e => e.classList.contains('active')), true);
        await page.waitForFunction(() => document.querySelector('#pvImg').clientHeight > 0);
        await page.locator('#fDesc').press('Shift+Enter');
        assert.equal(await page.locator('#pvName').textContent(), selected);
        assert.deepEqual(await beschreibungen(), descriptions);
        // Grenze 761/760 px und zurück: Karte wechselt zwischen rechts und oben
        for (const [w, rechts] of [[1280, true], [761, true], [760, false], [width, false]]) {
          await page.setViewportSize({ width: w, height });
          const [l, pv] = await Promise.all([page.locator('#listWrap').boundingBox(), page.locator('#previewPane').boundingBox()]);
          if (rechts) assert.ok(pv.x >= l.x + l.width - 1, `${w}px: Fotokarte rechts`); else assert.ok(pv.y + pv.height <= l.y + 1, `${w}px: Fotokarte oben`);
          assert.equal(await page.locator('#pvImg').isVisible(), true, `${w}px: Foto sichtbar`);
        }
        await inspectLayout('nach-fenstergroesse');
      }
      assert.deepEqual(await snapshot('A'), settled, 'Dialog „Dateinamen“ öffnen/schließen ändert keine gespeicherten Daten');
      assert.deepEqual(await page.evaluate(() => ({ settings: localStorage.getItem('bu-settings'), img: localStorage.getItem('bu-zipimg'), pdf: localStorage.getItem('bu-pdf') })), storage);
      if (protectedProject) {
        assert.equal(await page.locator('#btnRename').isDisabled(), true);
        assert.equal(await ui.mehrAus(page, 'mehrUmbenennen'), true);
        await ui.feld(page, 'desc', 0).fill('Nur Sitzung'); await page.locator('#fDesc').press('Alt+x');
        assert.equal(await page.locator('#btnRename').isDisabled(), true);
        assert.equal(await ui.mehrAus(page, 'mehrUmbenennen'), true);
        assert.deepEqual(await snapshot('A'), before, 'Geschütztes Projekt bleibt bytegenau erhalten');
      } else {
        await ui.feld(page, 'desc', 0).fill('Küche Decke'); await page.locator('#fDesc').press('Enter');
        assert.equal(await page.locator('#fDesc').evaluate(e => e === document.activeElement), true);
        assert.equal(await page.locator('#list .row').nth(1).evaluate(e => e.classList.contains('active')), true);
        await page.locator('#fDesc').press('Control+d');
        assert.equal(await page.locator('#fDesc').inputValue(), 'Küche Decke', 'Strg+D übernimmt vom vorigen Foto');
        await ui.foto(page, 1); await page.locator('#pvEarlier').click();
        assert.equal(await page.locator('#sort').inputValue(), 'manual');
        await ui.sortieren(page, 'name'); assert.equal(await page.locator('#sort').inputValue(), 'name');
        await ui.foto(page, 0); await page.locator('#pvLater').click(); await page.locator('#pvEarlier').click();   // „manuell“ entsteht durch Früher/Später
        assert.equal(await page.locator('#sort').inputValue(), 'manual');
        assert.deepEqual(await page.locator('#list .row').evaluateAll(es => es.map(e => e.querySelector('.tsub').textContent.split(' · ').at(-1))), ['IMG_0001.jpg', 'IMG_0002.jpg', 'IMG_0003.jpg']);
        await ui.foto(page, 2); await page.locator('#pvDiscard').click();
        assert.equal(await page.locator('#list .row').nth(2).evaluate(e => e.classList.contains('discarded')), true);
        await ui.mehr(page, 'mehrUmbenennen'); await page.locator('#dOk').click(); await page.locator('#bUndo').waitFor();
        let files = await snapshot('A');
        assert.deepEqual(files['Fotos/_aussortiert/IMG_0003.jpg'], before['Fotos/IMG_0003.jpg']);
        assert.equal(files['Fotos/IMG_0001.jpg'], undefined);
        await page.locator('#bCsv').click(); await page.waitForFunction(() => document.querySelector('#bCsv').textContent.includes('gespeichert'));
        assert.ok(Object.keys(await snapshot('A')).some(n => n.endsWith('.csv')));
        await page.locator('#bUndo').click(); await page.waitForFunction(() => document.querySelector('#banner').textContent.includes('Rückgängig gemacht'));
        files = await snapshot('A');
        for (let i = 1; i <= 3; i++) assert.deepEqual(files[`Fotos/IMG_000${i}.jpg`], before[`Fotos/IMG_000${i}.jpg`]);
        assert.equal(Object.keys(files).some(n => /umb-tmp_|~umb_/.test(n)), false);
        await page.getByRole('button', { name: 'Bilddokumentation erstellen →', exact: true }).click();
        assert.equal(await page.locator('#pPer').inputValue(), '1'); assert.equal(await page.locator('#pMax').inputValue(), '10'); assert.equal(await page.locator('#pSecPage').isChecked(), true);
        assert.equal(await page.locator('#pDpi').inputValue(), '220', 'PDF-Bildqualität: Standard');
        assert.equal(Object.keys(await snapshot('A')).some(n => n.endsWith('.pdf')), false, 'Kein automatischer Export');
        await page.locator('#zOk').click(); await page.locator('.pdfOpen').waitFor();
        await ui.mehr(page, 'mehrZip');
        assert.equal(await page.locator('#zEdge').inputValue(), '2500'); assert.equal(await page.locator('#zQ').inputValue(), '90');
        await page.locator('#zOk').click(); await page.waitForFunction(() => document.querySelector('#banner').textContent.includes('ZIP gespeichert'));
        // Directory enumeration is not a transaction while N2 snapshots are
        // appended. Require both exports in the same completed inspector scan;
        // the original byte/signature assertions below still run unchanged.
        files = await snapshot('A', ['.pdf', '.zip']);
        const pdf = Object.keys(files).find(n => n.endsWith('.pdf')), zip = Object.keys(files).find(n => n.endsWith('.zip'));
        assert.ok(pdf && zip); assert.equal(Buffer.from(files[pdf]).subarray(0, 4).toString(), '%PDF'); assert.equal(Buffer.from(files[zip]).readUInt32LE(), 0x04034b50);
        await ui.feld(page, 'desc', 0).fill('Letzte Eingabe vor Projektwechsel'); await open('B');
        const a = await snapshot('A'), json = JSON.parse(Buffer.from(a['Fotos/_Bildumbenenner.json']).toString());
        assert.equal(json.bilder['IMG_0001.jpg'].beschreibung, 'Letzte Eingabe vor Projektwechsel'); assert.equal(json.format, 1);
        assert.deepEqual(await snapshot('B'), beforeB, 'Keine A-Einstellungen/Daten im Projekt B');
        await open('A'); await ui.namen(page); assert.deepEqual(await values(), expected, 'Gespeicherte Einstellungen nach Projektwechsel erhalten');
        await ui.namenZu(page);
      }
      assert.deepEqual(errors, []);
      console.log(`OK (${name}, ${width}px${protectedProject ? ', geschützt' : ''}): Layout, Tastatur, Werterhalt und reale Bedienabläufe`);
      return true;
    } finally { await ctx.close(); }
  }
  await run(1280); await run(768); await run(390); await run(320); await run(1280, true);
  if (artifacts) fs.writeFileSync(path.join(artifacts, 'layout.json'), JSON.stringify(layouts, null, 2));
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close(); if (server) await new Promise(resolve => server.close(resolve));
});
