// FotoKit 2.7.0 – Fotos in Unterordnern und mehrere Ortstermine (Plan fotokit-ortstermine 4.2, Entscheidungen O1–O13), im echten
// Browser mit der echten Projektzentrale daneben (gleicher Ursprung, gleiches Archiv im privaten Dateisystem des Browsers).
//   1. Testprojekt aus dem Plan (Bilder A, Fotos B, Fotos B 20.08): Kacheln mit Weg als Schlüssel, Kopfzeile je Ordner, tiefere
//      Ordner nur als Hinweis, „Fotos übernehmen“ gibt es nicht mehr, kein Umbenennen-Angebot (O5).
//   2. Projektzentrale legt Termin 2 an → FotoKit fragt je Ordner (nie still), „Ja“/„anderer …“, Auswahl Termin 1 · 2 · Alle.
//   3. Kennungen (O13): FotoKit „Anlegen“ → t3; Projektzentrale danach → t4; Projektzentrale entfernt t4; FotoKit legt an → t5;
//      Projektzentrale und FotoKit legen gleichzeitig an → Widerspruch in FotoKit, nichts überschrieben. Deckblatt speichern lässt
//      ortsterminZaehler und weitereOrtstermine stehen.
//   4. Bilddokumentation je Termin: Termindatum im Namen, Deckblatt-Datum nicht nach „ortstermin“, bilddokus je Termin,
//      BerichtKits anlagen.js meldet die Doku nicht „veraltet“.
//   4b. Review #95: Projektzentrale ändert das Datum von Termin 2 → FotoKit zeigt es sofort, nur die Doku von Termin 2 gilt als
//      geändert (in die Datei mit dem nächsten Speichern), Termin 1 bleibt aktuell; BerichtKits anlagen.js meldet „veraltet“.
//   4c. Review #95: Termin entfernt – (b) t3 mit Doku entfernt, t2 besteht → nur t3 geändert; (a) eigenes Projekt, Doku für t2, t2
//      entfernt (wieder ein Termin) → Hinweis „Termin entfernt“, nach dem Speichern t2 geändert, BerichtKit „veraltet“; danach mit
//      einem Termin: ordnerTermine/bilddokus/dokuGeaendertJe bleiben lesbar und erhalten, neue Doku ohne Frage nach dem Termin (E5).
//   5. R2: Unterordner nicht lesbar → gelbe Zeile, seine Einträge bleiben in der Projektdatei.
//   6. Bestand (O8): Herkunft aus fotoUebernahmen → Rückfrage je Herkunft, Termin je Foto, nichts verschoben.
//   6b. Review #95: Fotos aus zwei Herkunftsordnern, danach (zweimal) umbenannt → je Herkunft eine Rückfrage mit dem richtigen
//      Vorschlag, nicht sicher zuzuordnen → „Herkunft unbekannt“; Vorschlag aus dem häufigsten Aufnahmetag (EXIF, erfundenes
//      Testfoto tests/fixtures/exif-aufnahme-2026-08-20.jpg), nur Dateidatum → „unsicher“.
//   6c. Review #95 (P2): Dialog „Bilddokumentation erstellen“ – Termin im Dialog wechseln (t1 alle beschrieben, t2 nur teils, Alle)
//      → „nur Fotos mit Beschreibung“, Zusammenfassung, Dateiname neu gerechnet (nie negativ); die PDF nimmt die Fotos des gewählten.
//   6d. Review #95 (P2, zweite Runde): (a) Rückfrage „iPhone-Fotos umwandeln“ vor der Doku zählt und wandelt nur die gezeigte Auswahl
//      (Termin 1) ohne „Weg“-Fotos, nicht das iPhone-Foto von Termin 2 und nicht das aussortierte; (b) Datum von Termin 1 im Dialog geändert → Dateiname, Zeile „Deckblatt: …“ und
//      PDF sofort mit dem neuen Datum (nicht erst nach dem Schreiben von _Projekt.json); (c) „Dateien umbenennen“ mit einem „Weg“-Foto
//      direkt in „Fotos“ (wird verschoben) und einem im Unterordner (bleibt liegen) → das im Unterordner bleibt in der Reihenfolge.
//   7. Link mit unbekanntem Teil (mitteilung=2): übergangen und erhalten.
//   8. FotoKit 2.6.0 (Commit c74418a) fasst eine Datei von 2.7.0 nicht an (R1); ein Projekt ohne Unterordner mit einem Termin
//      ergibt mit 2.6.0 und 2.7.0 dieselbe Projektdatei (bis auf Version und Zeitstempel).
// Ohne Projektzentrale daneben (../projektzentrale) wird der Teil mit ihr übersprungen – in der CI nie (ORTSTERMINE_PFLICHT).
// node tests/ortstermine-browser.cjs [chromium]
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const playwright = require('playwright');
const browserName = process.argv[2] || 'chromium';
const root = path.join(__dirname, '..');
const pzRoot = path.join(root, '..', 'projektzentrale'), bkAnlagen = path.join(root, '..', 'berichtkit', 'anlagen.js');
const MIT_PZ = fs.existsSync(path.join(pzRoot, 'index.html'));
if (!MIT_PZ && process.env.ORTSTERMINE_PFLICHT) throw new Error('Projektzentrale nicht neben dem Repo: ' + pzRoot);
const ALT = 'c74418a';   // FotoKit 2.6.0
let altHtml = null; try { altHtml = execFileSync('git', ['show', ALT + ':index.html'], { cwd: root, maxBuffer: 64 << 20 }); } catch (_) {}
if (!altHtml && process.env.ORTSTERMINE_PFLICHT) throw new Error('FotoKit 2.6.0 (' + ALT + ') nicht in der Git-Historie');
const TYP = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.css': 'text/css', '.webmanifest': 'application/manifest+json' };
const HAUPT = '26.0501 Teststadt Ka', BESTAND = '26.0502 Bestand Teststadt', EINFACH = '26.0503 Einfach Teststadt', HERKUNFT = '26.0504 Herkunft Teststadt', ENTFERNT = '26.0505 Entfernt Teststadt', WECHSEL = '26.0506 Wechsel Teststadt', BEFUNDE = '26.0507 Befunde Teststadt';
let browser, server, schritt = 'Start';

(async () => {
  server = http.createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.startsWith('/teamkit/')){ res.writeHead(200, { 'content-type': TYP['.html'] }); return res.end('<!doctype html><title>TeamKit Testziel</title>'); }
    let base, rel;
    if (p.startsWith('/fk/')){ base = root; rel = p.slice(4); }
    else if (p.startsWith('/fk26/')){ base = root; rel = p.slice(6); if (!rel || rel === 'index.html'){ res.writeHead(200, { 'content-type': TYP['.html'] }); return res.end(altHtml); } }
    else if (p.startsWith('/pz/')){ base = pzRoot; rel = p.slice(4); }
    else { res.writeHead(404); return res.end(); }
    const f = path.join(base, rel || 'index.html');
    if (!f.startsWith(base) || !fs.existsSync(f) || fs.statSync(f).isDirectory()){ res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': TYP[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = p => `http://127.0.0.1:${server.address().port}${p}`;
  const profil = fs.mkdtempSync(path.join(os.tmpdir(), 'fk-ortstermine-'));
  const ctx = await playwright.chromium.launchPersistentContext(profil, { viewport: { width: 1400, height: 950 }, locale: 'de-DE', timezoneId: 'Europe/Berlin', serviceWorkers: 'block' });
  browser = { close: async () => { await ctx.close(); try { fs.rmSync(profil, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch (_) {} } };
  await ctx.addInitScript(() => {
    window.SPEKTRON_START_TEST = '00.0000';   // Projektzentrale: Testprojekte unter 26.0560 in der Liste (wie in ihren Tests)
    try { localStorage.setItem('willkommen-gelesen', '1'); } catch (_) {}
    const archiv = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('Mosaik Archivordner');
    window.showDirectoryPicker = async () => location.pathname.startsWith('/pz/') ? archiv() : (await archiv()).getDirectoryHandle(sessionStorage.getItem('testProjekt'));
  });
  const fehler = [];
  const seite = async (pfad, projekt) => {
    const page = await ctx.newPage();
    page.on('pageerror', e => fehler.push(pfad + ': ' + e.message));
    page.on('dialog', d => { fehler.push('natives Dialogfenster: ' + d.message()); d.dismiss(); });
    if (projekt) await page.addInitScript(n => sessionStorage.setItem('testProjekt', n), projekt);
    await page.goto(url(pfad));
    return page;
  };
  const fk = await seite('/fk/index.html', HAUPT);
  const kann = await fk.evaluate(async () => { try { const d = await navigator.storage.getDirectory(), f = await d.getFileHandle('probe', { create: true }); await d.removeEntry('probe'); return !!f.createWritable; } catch { return false; } });
  if (!kann){ console.log(`SKIP (${browserName}): kein schreibbarer Ordnerzugriff`); await browser.close(); server.close(); return; }

  // ---------- Archiv mit erfundenen Projekten ----------
  await fk.evaluate(async ([HAUPT, BESTAND, EINFACH]) => {
    const r = await navigator.storage.getDirectory();
    for await (const [n] of r.entries()) await r.removeEntry(n, { recursive: true });
    const archiv = await r.getDirectoryHandle('Mosaik Archivordner', { create: true });
    const put = async (d, n, x) => { const w = await (await d.getFileHandle(n, { create: true })).createWritable(); await w.write(x); await w.close(); };
    const sub = async (d, ...ns) => { for (const n of ns) d = await d.getDirectoryHandle(n, { create: true }); return d; };
    const jpg = async i => { const c = document.createElement('canvas'); c.width = 40 + i; c.height = 30; const g = c.getContext('2d'); g.fillStyle = `hsl(${i * 47},70%,50%)`; g.fillRect(0, 0, c.width, c.height); return new Promise(res => c.toBlob(res, 'image/jpeg')); };
    const pj = { format: 'mosaik-projekt', version: 1, hinweis: 'Gemeinsame Projektdaten', objekt: 'EFH, Testweg 1', auftraggeber: 'Muster Versicherung AG', ortstermin: '2026-08-12' };
    let i = 0;
    const h = await sub(archiv, HAUPT), hf = await sub(h, 'Fotos');
    await put(h, '_Projekt.json', JSON.stringify({ ...pj, ortsterminBezeichnung: 'Erstbegehung' }, null, 2) + '\n');
    for (const [o, ns] of [['Bilder A', ['IMG_0001.jpg', 'IMG_0002.jpg']], ['Fotos B', ['IMG_0001.jpg']], ['Fotos B 20.08', ['IMG_0001.jpg', 'IMG_0003.jpg']],
      ['_aussortiert', ['IMG_0009.jpg']], ['.versteckt', ['IMG_0008.jpg']], ['Bilder A/Tiefer', ['IMG_0007.jpg']]]){ const d = await sub(hf, ...o.split('/')); for (const n of ns) await put(d, n, await jpg(++i)); }
    await put(await sub(hf, 'Notizen'), 'liesmich.txt', 'kein Foto');
    // Bestand: Fotos schon mit „Fotos übernehmen“ (bis 2.6.0) nach „Fotos“ geholt – Herkunft in fotoUebernahmen
    const b = await sub(archiv, BESTAND), bf = await sub(b, 'Fotos');
    await put(b, '_Projekt.json', JSON.stringify({ ...pj, weitereOrtstermine: [{ id: 't2', datum: '2026-08-20', bezeichnung: 'Nachbeprobung', wer: 'Ka' }], ortsterminZaehler: 2 }));
    for (const n of ['IMG_0001.jpg', 'IMG_0002.jpg', 'IMG_0003.jpg', 'IMG_0009.jpg']) await put(bf, n, await jpg(++i));
    await put(bf, '_Bildumbenenner.json', JSON.stringify({ app: 'Bildumbenenner', format: 1, version: '2.6.0', projekt: {}, benennung: {}, reihenfolge: [],
      bilder: { 'IMG_0003.jpg': { beschreibung: 'Flur Wand' } },
      fotoUebernahmen: [{ zeit: '2026-11-20T10:00:00.000Z', ordner: 'Bilder A', dateien: [{ datei: 'IMG_0001.jpg' }, { datei: 'IMG_0002.jpg' }] },
        { zeit: '2026-11-21T10:00:00.000Z', ordner: 'fotos ka 20.08', dateien: [{ datei: 'IMG_0003.jpg', vorher: 'IMG_0001.jpg' }] }] }, null, 2));
    const e = await sub(archiv, EINFACH);
    await put(e, '_Projekt.json', JSON.stringify(pj)); await sub(e, 'Fotos');
    // Archivordner für FotoKit-Links (#projekt=…): dieselbe Datenbank wie die Projektzentrale
    const db = await new Promise((res, rej) => { const q = indexedDB.open('mosaik-suite', 1); q.onupgradeneeded = () => q.result.createObjectStore('kv'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
    await new Promise((res, rej) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(archiv, 'archiv'); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); db.close();
  }, [HAUPT, BESTAND, EINFACH]);

  // ---------- Hilfen ----------
  const lies = async (pg, projekt, ...weg) => { for (let i = 0; ; i++){ try { return await pg.evaluate(async ([projekt, weg]) => {
    let d = await (await (await navigator.storage.getDirectory()).getDirectoryHandle('Mosaik Archivordner')).getDirectoryHandle(projekt);
    for (const n of weg.slice(0, -1)) d = await d.getDirectoryHandle(n);
    return await (await (await d.getFileHandle(weg[weg.length - 1])).getFile()).text(); }, [projekt, weg]); }
    catch (e){ if (i > 30 || !/NotReadable|NotFound/.test(e.message)) throw e; await pg.waitForTimeout(100); } } };
  const fkDatei = async (pg, projekt) => { try { return JSON.parse(await lies(pg, projekt, 'Fotos', '_Bildumbenenner.json')); } catch (e){ if (/NotFound/.test(e.message)) return null; throw e; } };
  const pjDatei = async (pg, projekt) => JSON.parse(await lies(pg, projekt, '_Projekt.json'));
  const bis = async (pg, fn, was) => { for (let i = 0; i < 80; i++){ const v = await fn(); if (v) return v; await pg.waitForTimeout(100); } assert.fail('zu lange gewartet: ' + was + ' (' + schritt + ')'); };
  const ruhig = pg => pg.waitForFunction(() => !document.body.inert && !document.querySelector('#overlay').classList.contains('show') && !/Lese Ordner/.test(document.getElementById('banner').textContent));
  const kacheln = pg => pg.locator('#list .row').evaluateAll(r => r.map(e => e.getAttribute('aria-label')));
  const koepfe = pg => pg.locator('#list .fk-ordner').evaluateAll(r => r.map(e => (e.classList.contains('offen') ? '[gelb] ' : '') + e.querySelector('.o-name').textContent + (e.querySelector('.o-frage') ? ' ' + e.querySelector('.o-frage').textContent.replace(/\s+/g, ' ').trim() : '')));
  const kopf = (pg, name) => pg.locator('#list .fk-ordner').filter({ has: pg.locator('.o-name', { hasText: new RegExp('^' + name.replace(/[.]/g, '\\.') + '$') }) });
  const anlegen = async (pg, name) => { await kopf(pg, name).locator('button', { hasText: 'Anlegen' }).click();
    await bis(pg, async () => new RegExp('angelegt und „' + name.replace(/[.]/g, '\\.') + '“ zugeordnet').test(await pg.locator('#banner').textContent()), 'Anlegen fertig'); };
  /** Startseite „Projekt öffnen …“ oder – wenn FotoKit schon das aktuelle Spektron-Projekt geöffnet hat – „Mehr …“ › „Anderen Ordner öffnen …“ */
  const oeffnen = async pg => { await pg.waitForFunction(() => !document.body.inert); await pg.waitForTimeout(300);
    if (await pg.locator('#btnOpen2').isVisible()) return pg.click('#btnOpen2');
    await pg.click('#btnMehr'); await pg.locator('#mosaikMehrPop #mehrOrdner').click(); };
  const fokus = async pg => { await pg.bringToFront(); await pg.evaluate(() => window.dispatchEvent(new Event('focus'))); };
  const beschreiben = async (pg, key, text) => { await pg.locator(`#list .row[aria-label="${key}"] .tinfo`).click(); await pg.locator('#fDesc').fill(text); await pg.locator('#fDesc').press('Tab'); };

  // ---------- 1. Testprojekt, ein Termin ----------
  schritt = '1 ein Termin';
  await fk.click('#btnOpen2'); await ruhig(fk);
  await fk.waitForFunction(() => document.querySelectorAll('#list .row').length === 5);
  assert.deepEqual(await kacheln(fk), ['Bilder A/IMG_0001.jpg', 'Bilder A/IMG_0002.jpg', 'Fotos B/IMG_0001.jpg', 'Fotos B 20.08/IMG_0001.jpg', 'Fotos B 20.08/IMG_0003.jpg'],
    'eine Ebene, ohne _…/.…, Schlüssel = Ordner/Datei, gleiche Dateinamen in zwei Ordnern');
  assert.deepEqual(await koepfe(fk), ['Bilder A', 'Fotos B', 'Fotos B 20.08'], 'Kopfzeile je Ordner, bei einem Termin ohne Frage');
  assert.equal(await fk.locator('#terminWahl').isHidden(), true, 'ein Termin: keine Auswahl');
  assert.match(await fk.locator('#ordnerZeile').textContent(), /In „Bilder A“ liegen weitere Ordner \(„Tiefer“\) – FotoKit liest nur eine Ebene/);
  assert.equal(await fk.locator('#importCard, #btnImport').count(), 0, '„Fotos übernehmen“ entfällt (O11)');
  assert.equal(await fk.locator('#list .row.ohne-termin').count(), 0);
  await beschreiben(fk, 'Bilder A/IMG_0001.jpg', 'Küche Decke verrußt');
  await beschreiben(fk, 'Fotos B/IMG_0001.jpg', 'Flur Wand');
  await fk.locator('#fProbe').fill('P1'); await fk.locator('#fProbe').press('Tab');
  let j = await bis(fk, async () => { const x = await fkDatei(fk, HAUPT); return x && x.bilder['Fotos B/IMG_0001.jpg']?.probe === 'P1' && x; }, 'gespeichert');
  assert.equal(j.version, '2.7.0');
  assert.equal(j.bilder['Bilder A/IMG_0001.jpg'].beschreibung, 'Küche Decke verrußt');
  assert.equal(j.bilder['Fotos B/IMG_0001.jpg'].beschreibung, 'Flur Wand', 'gleicher Dateiname in anderem Ordner = eigener Eintrag');
  for (const k of ['ordnerTermine', 'bilddokus', 'dokuGeaendertJe']) assert.equal(j[k], undefined, k + ' nur bei mehr als einem Termin');
  assert.equal(await fk.locator('#btnRename').isDisabled(), true, 'im Unterordner nichts umzubenennen (O5)');
  console.log(`OK ${browserName}: Unterordner gelesen (eine Ebene, Schlüssel mit Weg), Kopfzeilen, Hinweis tiefere Ordner, ohne „Fotos übernehmen“`);

  if (!MIT_PZ){ console.log('SKIP Projektzentrale nicht daneben – Teile 2–5 übersprungen'); }
  else {
    // ---------- 2. Projektzentrale legt Termin 2 an; FotoKit fragt je Ordner ----------
    schritt = '2 Termin 2';
    const pz = await seite('/pz/index.html');
    const pzOeffnen = async (name = HAUPT) => {
      await pz.reload(); await pz.waitForSelector('#btnInfo');
      await pz.locator('#btnStart, #btnArchive').first().click(); await pz.locator(`.proj[data-name="${name}"]`).click();
      await pz.waitForFunction(n => document.querySelector('.proj.active')?.dataset.name === n && document.getElementById('otBlock'), name);
      if (!await pz.locator('#pjBox').evaluate(d => d.open)) await pz.locator('#pjBox > summary').click();
    };
    const pzNeu = async (id, datum, bez) => {
      await pz.bringToFront(); await pz.locator('#otNeu').click(); await pz.locator(`#pj_ot_${id}_datum`).waitFor();
      if (bez) await pz.locator(`#pj_ot_${id}_bezeichnung`).fill(bez);
      await pz.locator(`#pj_ot_${id}_datum`).fill(datum);
      await bis(pz, async () => (await pjDatei(pz, HAUPT)).weitereOrtstermine?.some(t => t.id === id), 'Projektzentrale hat ' + id + ' gespeichert');
    };
    await pzOeffnen();
    await pzNeu('t2', '2026-08-20', 'Nachbeprobung');
    assert.equal((await pjDatei(pz, HAUPT)).ortsterminZaehler, 2);
    await fokus(fk); await bis(fk, async () => !(await fk.locator('#terminWahl').isHidden()), 'FotoKit sieht Termin 2');
    assert.deepEqual(await fk.locator('#terminWahl button').evaluateAll(b => b.map(x => x.textContent.trim())), ['Termin 1 · 12.08. (0)', 'Termin 2 · 20.08. (0)', 'Alle (5)']);
    const fragen = await koepfe(fk);
    assert.equal(fragen.length, 3); assert.ok(fragen.every(f => f.startsWith('[gelb] ')), 'alle Ordner gelb – nichts still zugeordnet');
    assert.match(fragen[2], /^\[gelb\] Fotos B 20\.08 – Ortstermin am 20\.08\.2026 \(Nachbeprobung\)\? \(Datum im Ordnernamen\) Ja$/);
    assert.match(fragen[0], /^\[gelb\] Bilder A – Neuer Ortstermin am \d\d\.\d\d\.\d{4}\? \(Dateidatum der Fotos – unsicher – passt zu keinem Termin des Projekts\) Anlegen$/, 'ohne Datum im Namen: Aufnahme-/Dateidatum, „unsicher“');
    assert.equal(await fk.locator('#list .row.ohne-termin').count(), 5);
    assert.match(await fk.locator('#terminZeile').textContent(), /Noch ohne Ortstermin \(gelb\): „Bilder A“, „Fotos B“, „Fotos B 20\.08“/);
    await fk.waitForTimeout(700);
    assert.equal((await fkDatei(fk, HAUPT)).ordnerTermine, undefined, 'ohne Klick keine Zuordnung in der Datei');
    await kopf(fk, 'Fotos B 20.08').locator('button', { hasText: 'Ja' }).click();
    await kopf(fk, 'Bilder A').locator('select').selectOption('t1');
    await kopf(fk, 'Fotos B').locator('select').selectOption('t1');
    j = await bis(fk, async () => { const x = await fkDatei(fk, HAUPT); return x && Object.keys(x.ordnerTermine || {}).length === 3 && x; }, 'Zuordnung gespeichert');
    assert.deepEqual(Object.fromEntries(Object.entries(j.ordnerTermine).map(([k, v]) => [k, [v.termin, v.vorschlag]])),
      { 'Fotos B 20.08': ['t2', 'datum-im-namen'], 'Bilder A': ['t1', 'hand'], 'Fotos B': ['t1', 'hand'] });
    assert.equal(await fk.locator('#list .row.ohne-termin').count(), 0);
    assert.equal(await fk.locator('#terminZeile').isHidden(), true);
    await fk.locator('#terminWahl [data-ansicht="t2"]').click();
    assert.deepEqual(await kacheln(fk), ['Fotos B 20.08/IMG_0001.jpg', 'Fotos B 20.08/IMG_0003.jpg']);
    assert.deepEqual(await fk.locator('#list .row .bildnr').allTextContents(), ['Bild 1', 'Bild 2'], 'Bildnummern je Termin');
    console.log(`OK ${browserName}: Termin aus der Projektzentrale, Rückfrage je Ordner (Datum im Namen / Dateidatum unsicher), nie still, Auswahl je Termin`);

    // ---------- 3. Kennungen (O13) ----------
    schritt = '3 Kennungen';
    const neuerOrdner = async (name, datei) => { await fk.evaluate(async ([p, o, n]) => {
      const d = await (await (await (await (await navigator.storage.getDirectory()).getDirectoryHandle('Mosaik Archivordner')).getDirectoryHandle(p)).getDirectoryHandle('Fotos')).getDirectoryHandle(o, { create: true });
      const c = document.createElement('canvas'); c.width = 33; c.height = 22; const w = await (await d.getFileHandle(n, { create: true })).createWritable(); await w.write(await new Promise(r => c.toBlob(r, 'image/jpeg'))); await w.close(); }, [HAUPT, name, datei]); };
    await neuerOrdner('fotos ka 03.09', 'IMG_0101.jpg');
    await fk.locator('#terminWahl [data-ansicht="alle"]').click();
    await fk.click('#btnMehr'); await fk.locator('#mosaikMehrPop #mehrReload').click(); await ruhig(fk);
    assert.match((await koepfe(fk)).find(k => k.includes('fotos ka 03.09')), /Neuer Ortstermin am 03\.09\.2026\? \(Datum im Ordnernamen – passt zu keinem Termin des Projekts\) Anlegen/);
    await anlegen(fk, 'fotos ka 03.09');
    assert.match(await fk.locator('#banner').textContent(), /Ortstermin am 03\.09\.2026 als Termin 3 in den Projektdaten angelegt und „fotos ka 03\.09“ zugeordnet/);
    let p = await pjDatei(fk, HAUPT);
    assert.deepEqual(p.weitereOrtstermine.map(t => [t.id, t.datum]), [['t2', '2026-08-20'], ['t3', '2026-09-03']]);
    assert.equal(p.ortsterminZaehler, 3, 'Zähler im selben Patch'); assert.equal(p.ortstermin, '2026-08-12');
    assert.equal(p.weitereOrtstermine[1].bezeichnung, '', 'FotoKit legt nur den Termin an');
    assert.equal(p.weitereMitteilungen, undefined, 'keine Zuordnung zu einer Mitteilung (O9)');
    assert.equal((await bis(fk, async () => (await fkDatei(fk, HAUPT)).ordnerTermine?.['fotos ka 03.09'], 'Zuordnung')).termin, 't3');
    // Projektzentrale danach: nächste Kennung t4
    await pzOeffnen();
    await pzNeu('t4', '2026-09-10', 'Freimessung');
    assert.equal((await pjDatei(pz, HAUPT)).ortsterminZaehler, 4);
    // Projektzentrale entfernt t4 (Rückfrage) – der Zähler bleibt
    await pz.locator('[data-ot-weg="t4"]').click(); await pz.locator('#dlgBack.show #dYes').click();
    await bis(pz, async () => !(await pjDatei(pz, HAUPT)).weitereOrtstermine.some(t => t.id === 't4'), 't4 entfernt');
    assert.equal((await pjDatei(pz, HAUPT)).ortsterminZaehler, 4, 'Zähler sinkt nicht');
    // FotoKit legt wieder an → t5, nie die entfernte t4
    await neuerOrdner('Nachtrag 2026-10-01', 'IMG_0102.jpg');
    await fokus(fk); await fk.click('#btnMehr'); await fk.locator('#mosaikMehrPop #mehrReload').click(); await ruhig(fk);
    await anlegen(fk, 'Nachtrag 2026-10-01');
    p = await pjDatei(fk, HAUPT);
    assert.deepEqual(p.weitereOrtstermine.map(t => t.id), ['t2', 't3', 't5'], 'entfernte Kennung t4 wird nicht neu vergeben');
    assert.equal(p.ortsterminZaehler, 5);
    // Gleichzeitig: FotoKit hat die Projektdaten zuletzt ohne den neuen Termin der Projektzentrale gelesen → Widerspruch
    await neuerOrdner('Nachtrag 2026-10-08', 'IMG_0103.jpg');
    await fk.click('#btnMehr'); await fk.locator('#mosaikMehrPop #mehrReload').click(); await ruhig(fk);
    await pzOeffnen(); await pzNeu('t6', '2026-10-09', '');
    const vorWiderspruch = await lies(pz, HAUPT, '_Projekt.json');
    await fk.evaluate(() => [...document.querySelectorAll('#list .fk-ordner [data-anlegen]')].find(b => b.dataset.anlegen === 'o:Nachtrag 2026-10-08').click());   // ohne Fensterwechsel: FotoKit liest vorher nicht neu
    await bis(fk, async () => /nicht angelegt/.test(await fk.locator('#banner').textContent()), 'Widerspruch gemeldet');
    assert.match(await fk.locator('#banner').textContent(), /Ortstermin am 08\.10\.2026 nicht angelegt: Die Ortstermine wurden inzwischen in einem anderen Fenster geändert \(z\. B\. in der Projektzentrale\)\. Nichts wurde überschrieben\./);
    assert.equal(await lies(fk, HAUPT, '_Projekt.json'), vorWiderspruch, 'nichts überschrieben');
    assert.equal((await fkDatei(fk, HAUPT)).ordnerTermine['Nachtrag 2026-10-08'], undefined, 'ohne Termin keine Zuordnung');
    // danach neu gelesen: der Termin der Projektzentrale ist da, ein zweiter Klick legt t7 an
    await bis(fk, async () => (await fk.locator('#terminWahl button').count()) === 6, 'FotoKit hat neu gelesen');
    await anlegen(fk, 'Nachtrag 2026-10-08');
    p = await pjDatei(fk, HAUPT);
    assert.deepEqual(p.weitereOrtstermine.map(t => t.id), ['t2', 't3', 't5', 't6', 't7']); assert.equal(p.ortsterminZaehler, 7);
    // Deckblatt speichern (FotoKit schreibt „objekt“) lässt Liste und Zähler stehen
    await fk.click('#btnPdf'); await fk.locator('#zOk').waitFor();
    await fk.locator('#m_objekt').fill('EFH, Testweg 1 (Anbau)'); await fk.locator('#zCancel').click(); await ruhig(fk);
    p = await bis(fk, async () => { const x = await pjDatei(fk, HAUPT); return x.objekt === 'EFH, Testweg 1 (Anbau)' && x; }, 'Deckblatt gespeichert');
    assert.equal(p.ortsterminZaehler, 7); assert.deepEqual(p.weitereOrtstermine.map(t => t.id), ['t2', 't3', 't5', 't6', 't7']);
    console.log(`OK ${browserName}: Kennungen wie die Projektzentrale (t3 FotoKit, t4 PZ, t4 entfernt, t5 FotoKit), gleichzeitiges Anlegen → Widerspruch, Zähler bleibt beim Deckblatt`);

    // ---------- 4. Bilddokumentation je Termin ----------
    schritt = '4 Bilddokus';
    await fokus(fk);
    const pdf = async (wahl, renameErwartet = false) => {
      await fk.click('#btnPdf'); await fk.locator('#zOk').waitFor();
      await fk.locator('#pTermin').selectOption(wahl);
      assert.equal(await fk.locator('#pRename').count(), renameErwartet ? 1 : 0, 'Umbenennen-Angebot nur, wenn etwas umzubenennen ist (O5)');
      const r = { ort: await fk.locator('#m_ort').inputValue(), aus: await fk.locator('#m_ort').isDisabled(), info: await fk.locator('#pTerminInfo').textContent() };
      await fk.click('#zOk'); await ruhig(fk); return r;
    };
    let d = await pdf('t2');
    assert.deepEqual([d.ort, d.aus], ['2026-08-20', true]); assert.match(d.info, /Deckblatt: Termin 2 · 20\.08\.2026 · Nachbeprobung \(Datum aus den Projektdaten, hier nicht änderbar\)/);
    assert.equal((await pjDatei(fk, HAUPT)).ortstermin, '2026-08-12', 'Termin ≥ 2 wird nicht nach „ortstermin“ geschrieben');
    d = await pdf('t1');
    assert.deepEqual([d.ort, d.aus], ['2026-08-12', false]);
    const pdfs = await fk.evaluate(async p => { const o = []; const f = await (await (await (await navigator.storage.getDirectory()).getDirectoryHandle('Mosaik Archivordner')).getDirectoryHandle(p)).getDirectoryHandle('Fotos');
      for await (const h of f.values()) if (h.kind === 'file' && h.name.endsWith('.pdf')) o.push(h.name); return o.sort(); }, HAUPT);
    assert.deepEqual(pdfs, ['Bilddokumentation_26.0501_Teststadt Ka_2026-08-12.pdf', 'Bilddokumentation_26.0501_Teststadt Ka_2026-08-20.pdf'], 'Termindatum im Namen (O4)');
    j = await bis(fk, async () => { const x = await fkDatei(fk, HAUPT); return x.bilddokus?.t1 && x; }, 'bilddokus');
    assert.deepEqual(j.bilddokus.t2.dateien, ['Bilddokumentation_26.0501_Teststadt Ka_2026-08-20.pdf']);
    assert.deepEqual(j.bilddokus.t2.bestand, ['Fotos B 20.08/IMG_0001.jpg', 'Fotos B 20.08/IMG_0003.jpg']);
    assert.deepEqual(j.bilddokus.t2.termin, { datum: '2026-08-20', bezeichnung: 'Nachbeprobung' });
    assert.deepEqual(j.bilddokus.t1.bestand, ['Bilder A/IMG_0001.jpg', 'Bilder A/IMG_0002.jpg', 'Fotos B/IMG_0001.jpg']);
    assert.ok(!(j.dokuGeaendertJe.t2 > j.bilddokus.t2.erstellt), 'Doku für Termin 1 lässt die von Termin 2 aktuell');
    assert.deepEqual(j.bilddoku.dateien, ['Bilddokumentation_26.0501_Teststadt Ka_2026-08-12.pdf'], 'bilddoku = zuletzt erstellte (BerichtKit bis Stufe 4)');
    assert.deepEqual(j.bilddoku.bestand, [], 'bestand nur Fotos direkt in „Fotos“');
    assert.equal(j.bilddoku.termin, 't1');
    if (fs.existsSync(bkAnlagen)){
      const BA = require(bkAnlagen);
      const { fotos, bilder } = await fk.evaluate(async p => { const f = await (await (await (await navigator.storage.getDirectory()).getDirectoryHandle('Mosaik Archivordner')).getDirectoryHandle(p)).getDirectoryHandle('Fotos');
        const fotos = [], bilder = []; for await (const h of f.values()) if (h.kind === 'file'){ bilder.push({ name: h.name }); if (h.name.endsWith('.pdf')) fotos.push({ name: h.name, t: (await h.getFile()).lastModified }); } return { fotos, bilder }; }, HAUPT);
      const k = BA.bilddokuFinden(fotos, j, '26.0501', [], bilder, await pjDatei(fk, HAUPT));
      assert.equal(k.dateien[0], 'Fotos/Bilddokumentation_26.0501_Teststadt Ka_2026-08-12.pdf');
      assert.equal(k.veraltet, false, 'BerichtKit: nicht veraltet (' + k.grund + ')');
      console.log(`OK ${browserName}: BerichtKits anlagen.js – Bilddoku aktuell, nicht „veraltet“`);
    } else if (process.env.ORTSTERMINE_PFLICHT) assert.fail('BerichtKit nicht neben dem Repo: ' + bkAnlagen);
    console.log(`OK ${browserName}: Bilddokumentation je Termin – Termindatum im Namen, Deckblatt-Datum ohne Schreiben, bilddokus, alte Felder`);

    // ---------- 4b. Review #95: Termin in der Projektzentrale geändert ----------
    schritt = '4b Termin geändert';
    await pdf('t2');   // Doku für Termin 2 noch einmal – jetzt die zuletzt erstellte (bilddoku, das BerichtKit liest)
    j = await bis(fk, async () => { const x = await fkDatei(fk, HAUPT); return x.bilddoku?.termin === 't2' && x; }, 'Doku Termin 2 zuletzt erstellt');
    const vor4b = j;
    assert.ok(!(j.dokuGeaendertJe?.t2 > j.bilddokus.t2.erstellt) && !(j.dokuGeaendertJe?.t1 > j.bilddokus.t1.erstellt), 'beide Dokus aktuell');
    assert.equal(await fk.locator('#terminZeile').isHidden(), true);
    await pzOeffnen(); await pz.locator('#pj_ot_t2_datum').fill('2026-08-21');
    await bis(pz, async () => (await pjDatei(pz, HAUPT)).weitereOrtstermine.find(t => t.id === 't2').datum === '2026-08-21', 'Projektzentrale hat das neue Datum gespeichert');
    await fokus(fk);
    await bis(fk, async () => /Bilddokumentation für Termin 2 nennt noch Datum oder Bezeichnung von vorher \(in der Projektzentrale geändert\) – bitte neu erstellen/.test(await fk.locator('#terminZeile').textContent()), 'FotoKit zeigt es sofort');
    assert.doesNotMatch(await fk.locator('#terminZeile').textContent(), /Termin 1/, 'nur Termin 2');
    await fk.waitForTimeout(700);
    assert.deepEqual((await fkDatei(fk, HAUPT)).dokuGeaendertJe, vor4b.dokuGeaendertJe, 'in die Datei erst mit dem nächsten Speichern');
    await fk.locator('#terminWahl [data-ansicht="alle"]').click();
    await kopf(fk, 'Nachtrag 2026-10-08').locator('select').selectOption('t5');   // nächstes Speichern – betrifft weder Termin 1 noch 2
    j = await bis(fk, async () => { const x = await fkDatei(fk, HAUPT); return x.ordnerTermine['Nachtrag 2026-10-08'].termin === 't5' && x; }, 'gespeichert');
    assert.ok(j.dokuGeaendertJe.t2 > j.bilddokus.t2.erstellt, 'Doku Termin 2 geändert');
    assert.equal(j.dokuGeaendertJe.t1, vor4b.dokuGeaendertJe.t1, 'Doku Termin 1 unberührt'); assert.ok(!(j.dokuGeaendertJe.t1 > j.bilddokus.t1.erstellt));
    assert.ok(j.dokuGeaendert > j.bilddoku.erstellt, 'zuletzt erstellte Doku (Termin 2) auch im alten Feld geändert');
    assert.deepEqual(j.bilddokus.t2.termin, { datum: '2026-08-20', bezeichnung: 'Nachbeprobung' }, 'Vermerk der Doku bleibt, wie sie erstellt wurde');
    if (fs.existsSync(bkAnlagen)){
      const BA = require(bkAnlagen);
      const { fotos, bilder } = await fk.evaluate(async p => { const f = await (await (await (await navigator.storage.getDirectory()).getDirectoryHandle('Mosaik Archivordner')).getDirectoryHandle(p)).getDirectoryHandle('Fotos');
        const fotos = [], bilder = []; for await (const h of f.values()) if (h.kind === 'file'){ bilder.push({ name: h.name }); if (h.name.endsWith('.pdf')) fotos.push({ name: h.name, t: (await h.getFile()).lastModified }); } return { fotos, bilder }; }, HAUPT);
      const k = BA.bilddokuFinden(fotos, j, '26.0501', [], bilder, await pjDatei(fk, HAUPT));
      assert.equal(k.dateien[0], 'Fotos/' + j.bilddoku.dateien[0]);
      assert.equal(k.veraltet, true, 'BerichtKit: Doku Termin 2 veraltet');
      assert.match(k.grund, /nach dem Erstellen in FotoKit geändert/);
      const k0 = BA.bilddokuFinden(fotos, vor4b, '26.0501', [], bilder, await pjDatei(fk, HAUPT));   // dieselben Eingaben, aber FotoKit hat noch nicht gespeichert
      assert.equal(k0.veraltet, false, 'BerichtKit sieht das geänderte Datum von Termin 2 erst nach dem Speichern in FotoKit (eigene Prüfung nur „ortstermin“ = Termin 1)');
      console.log(`OK ${browserName}: BerichtKits anlagen.js – Doku Termin 2 nach dem Speichern „veraltet“`);
    } else if (process.env.ORTSTERMINE_PFLICHT) assert.fail('BerichtKit nicht neben dem Repo: ' + bkAnlagen);
    console.log(`OK ${browserName}: Termin 2 in der Projektzentrale geändert → FotoKit zeigt es sofort, nur Doku Termin 2 geändert, in der Datei mit dem nächsten Speichern`);

    // ---------- 4c. Review #95: Termin entfernt ----------
    schritt = '4c (b) t3 entfernt';
    const bkPruefen = async (pg, projekt, nr, fkJson) => {
      const BA = require(bkAnlagen);
      const { fotos, bilder } = await pg.evaluate(async p => { const f = await (await (await (await navigator.storage.getDirectory()).getDirectoryHandle('Mosaik Archivordner')).getDirectoryHandle(p)).getDirectoryHandle('Fotos');
        const fotos = [], bilder = []; for await (const h of f.values()) if (h.kind === 'file'){ bilder.push({ name: h.name }); if (h.name.endsWith('.pdf')) fotos.push({ name: h.name, t: (await h.getFile()).lastModified }); } return { fotos, bilder }; }, projekt);
      return BA.bilddokuFinden(fotos, fkJson, nr, [], bilder, await pjDatei(pg, projekt));
    };
    const entferntPz = async (projekt, id) => { await pz.bringToFront(); await pz.locator(`[data-ot-weg="${id}"]`).click(); await pz.locator('#dlgBack.show #dYes').click();
      await bis(pz, async () => !((await pjDatei(pz, projekt)).weitereOrtstermine || []).some(t => t.id === id), id + ' in der Projektzentrale entfernt'); };
    await fokus(fk);
    await pdf('t3');
    j = await bis(fk, async () => { const x = await fkDatei(fk, HAUPT); return x.bilddoku?.termin === 't3' && x; }, 'Doku Termin 3');
    const vor4c = j;
    assert.deepEqual(j.bilddokus.t3.termin, { datum: '2026-09-03', bezeichnung: '' });
    await pzOeffnen(); await entferntPz(HAUPT, 't3');
    await fokus(fk);
    await bis(fk, async () => /Termin entfernt: Die Bilddokumentation für den Ortstermin am 03\.09\.2026 gehört zu einem Termin, den es in den Projektdaten nicht mehr gibt – sie gilt als veraltet\. Die PDF bleibt liegen\./.test(await fk.locator('#terminZeile').textContent()), 'Hinweis Termin entfernt');
    await fk.waitForTimeout(700);
    assert.deepEqual((await fkDatei(fk, HAUPT)).dokuGeaendertJe, vor4c.dokuGeaendertJe, 'in die Datei erst mit dem nächsten Speichern');
    await fk.locator('#terminWahl [data-ansicht="alle"]').click();
    await kopf(fk, 'Nachtrag 2026-10-08').locator('select').selectOption('t7');   // nächstes Speichern – betrifft weder t1, t2 noch t3
    j = await bis(fk, async () => { const x = await fkDatei(fk, HAUPT); return x.ordnerTermine['Nachtrag 2026-10-08'].termin === 't7' && x; }, 'gespeichert');
    assert.ok(j.dokuGeaendertJe.t3 > j.bilddokus.t3.erstellt, 'Doku Termin 3 geändert');
    assert.equal(j.dokuGeaendertJe.t1, vor4c.dokuGeaendertJe.t1, 't1 unberührt'); assert.equal(j.dokuGeaendertJe.t2, vor4c.dokuGeaendertJe.t2, 't2 unberührt');
    assert.ok(j.dokuGeaendert > j.bilddoku.erstellt, 'zuletzt erstellte (t3) auch im alten Feld');
    assert.deepEqual(j.bilddokus.t3, vor4c.bilddokus.t3, 'Eintrag bleibt unter t3 (O12)');
    assert.equal(j.ordnerTermine['fotos ka 03.09'].termin, 't3', 'Zuordnung bleibt in der Datei');
    assert.match((await koepfe(fk)).find(k => k.includes('fotos ka 03.09')), /^\[gelb\] /, 'Ordner des entfernten Termins wieder gelb');
    if (fs.existsSync(bkAnlagen)) assert.equal((await bkPruefen(fk, HAUPT, '26.0501', j)).veraltet, true, 'BerichtKit: Doku Termin 3 veraltet');
    console.log(`OK ${browserName}: t3 mit Doku in der Projektzentrale entfernt (t2 besteht) → Hinweis „Termin entfernt“, nur t3 geändert, Eintrag bleibt, BerichtKit „veraltet“`);

    schritt = '4c (a) letzter weiterer Termin entfernt';
    await fk.evaluate(async ENTFERNT => {
      const a = await (await navigator.storage.getDirectory()).getDirectoryHandle('Mosaik Archivordner'), p = await a.getDirectoryHandle(ENTFERNT, { create: true }), f = await p.getDirectoryHandle('Fotos', { create: true });
      const put = async (d, n, x) => { const w = await (await d.getFileHandle(n, { create: true })).createWritable(); await w.write(x); await w.close(); };
      const jpg = i => { const c = document.createElement('canvas'); c.width = 36 + i; c.height = 24; c.getContext('2d').fillRect(0, 0, i * 3, i); return new Promise(r => c.toBlob(r, 'image/jpeg')); };
      await put(p, '_Projekt.json', JSON.stringify({ format: 'mosaik-projekt', version: 1, objekt: 'EFH, Testweg 5', ortstermin: '2026-08-12',
        weitereOrtstermine: [{ id: 't2', datum: '2026-08-20', bezeichnung: 'Nachbeprobung', wer: 'Ka' }], ortsterminZaehler: 2 }));
      await put(f, 'IMG_0001.jpg', await jpg(1)); await put(await f.getDirectoryHandle('fotos ka 20.08', { create: true }), 'IMG_0002.jpg', await jpg(2));
    }, ENTFERNT);
    const fe = await seite('/fk/index.html', ENTFERNT);
    await oeffnen(fe); await ruhig(fe); await fe.waitForFunction(() => document.querySelectorAll('#list .row').length === 2);
    await kopf(fe, 'fotos ka 20.08').locator('button', { hasText: 'Ja' }).click();
    await kopf(fe, 'direkt in „Fotos“').locator('select').selectOption('t1');
    await bis(fe, async () => Object.keys((await fkDatei(fe, ENTFERNT))?.ordnerTermine || {}).length === 2, 'zugeordnet');
    await fe.click('#btnPdf'); await fe.locator('#zOk').waitFor(); await fe.locator('#pTermin').selectOption('t2'); await fe.click('#zOk'); await ruhig(fe);
    j = await bis(fe, async () => { const x = await fkDatei(fe, ENTFERNT); return x.bilddokus?.t2 && x; }, 'Doku Termin 2');
    const vorA = j;
    assert.equal(j.bilddoku.termin, 't2');
    await pzOeffnen(ENTFERNT); await entferntPz(ENTFERNT, 't2');
    assert.equal((await pjDatei(pz, ENTFERNT)).ortsterminZaehler, 2);
    await fokus(fe);
    await bis(fe, async () => /Termin entfernt: Die Bilddokumentation für den Ortstermin am 20\.08\.2026 gehört zu einem Termin, den es in den Projektdaten nicht mehr gibt/.test(await fe.locator('#terminZeile').textContent()), 'Hinweis bei einem Termin');
    assert.equal(await fe.locator('#terminWahl').isHidden(), true, 'wieder ein Termin: keine Auswahl');
    assert.deepEqual(await koepfe(fe), ['direkt in „Fotos“', 'fotos ka 20.08'], 'Kopfzeilen ohne Frage, nichts gelb');
    await fe.waitForTimeout(700);
    j = await fkDatei(fe, ENTFERNT);
    assert.deepEqual(j.dokuGeaendertJe, vorA.dokuGeaendertJe, 'erst mit dem nächsten Speichern');
    if (fs.existsSync(bkAnlagen)) assert.equal((await bkPruefen(fe, ENTFERNT, '26.0505', j)).veraltet, false, 'BerichtKit sieht es erst nach dem Speichern in FotoKit');
    await beschreiben(fe, 'IMG_0001.jpg', 'Küche Decke');   // nächstes Speichern
    j = await bis(fe, async () => { const x = await fkDatei(fe, ENTFERNT); return x.bilder?.['IMG_0001.jpg']?.beschreibung && x; }, 'gespeichert');
    assert.ok(j.dokuGeaendertJe.t2 > j.bilddokus.t2.erstellt, 'Doku Termin 2 geändert');
    assert.ok(j.dokuGeaendert > j.bilddoku.erstellt);
    assert.deepEqual(j.bilddokus.t2, vorA.bilddokus.t2, 'Eintrag bleibt unter t2 (O12)');
    assert.deepEqual(j.ordnerTermine, vorA.ordnerTermine, 'ordnerTermine bleibt in der Datei');
    if (fs.existsSync(bkAnlagen)){ const k = await bkPruefen(fe, ENTFERNT, '26.0505', j); assert.equal(k.dateien[0], 'Fotos/' + vorA.bilddoku.dateien[0]); assert.equal(k.veraltet, true, 'BerichtKit: Doku des entfernten Termins veraltet'); }
    // E5: mit einem Termin keine Frage nach dem Termin; neue Doku gilt Termin 1, alte Einträge bleiben
    await fe.click('#btnPdf'); await fe.locator('#zOk').waitFor();
    assert.equal(await fe.locator('#pTermin').count(), 0, 'keine Frage nach dem Termin (E5)');
    assert.equal(await fe.locator('#m_ort').inputValue(), '2026-08-12');
    await fe.click('#zOk'); await ruhig(fe);
    j = await bis(fe, async () => { const x = await fkDatei(fe, ENTFERNT); return x.bilddoku?.termin === 't1' && x; }, 'neue Doku');
    assert.deepEqual(j.bilddokus.t1.dateien, j.bilddoku.dateien); assert.deepEqual(j.bilddokus.t1.termin, { datum: '2026-08-12', bezeichnung: '' });
    assert.deepEqual(j.bilddokus.t2, vorA.bilddokus.t2); assert.deepEqual(j.ordnerTermine, vorA.ordnerTermine);
    assert.equal(await fe.locator('#terminZeile').isHidden(), true, 'Hinweis entfällt – die Doku des entfernten Termins ist nicht mehr die zuletzt erstellte');
    assert.doesNotMatch(await fe.locator('#banner').textContent(), /Fehler|nicht/i);
    if (fs.existsSync(bkAnlagen)) assert.equal((await bkPruefen(fe, ENTFERNT, '26.0505', j)).veraltet, false, 'BerichtKit: neue Doku aktuell');
    await fe.close();
    console.log(`OK ${browserName}: letzter weiterer Termin entfernt → Hinweis, t2 geändert, BerichtKit „veraltet“; mit einem Termin bleibt alles lesbar, neue Doku ohne Terminfrage (E5)`);

    // ---------- 5. R2: Unterordner nicht lesbar ----------
    schritt = '5 R2';
    await fk.evaluate(() => { const orig = FileSystemDirectoryHandle.prototype.values; window.testValues = orig;
      FileSystemDirectoryHandle.prototype.values = function(){ if (this.name === 'Fotos B') throw new DOMException('synthetisch nicht lesbar', 'NotReadableError'); return orig.apply(this, arguments); }; });
    await fk.click('#btnMehr'); await fk.locator('#mosaikMehrPop #mehrReload').click(); await ruhig(fk);
    assert.match(await fk.locator('#ordnerZeile').textContent(), /Der Ordner „Fotos B“ in „Fotos“ ist gerade nicht lesbar/);
    assert.equal((await kacheln(fk)).includes('Fotos B/IMG_0001.jpg'), false);
    await beschreiben(fk, 'Bilder A/IMG_0002.jpg', 'Küche Fenster');
    await fk.locator('#list .row[aria-label="Bilder A/IMG_0001.jpg"] .pick input').uncheck();   // Weg: baut „aussortiert“ neu auf
    j = await bis(fk, async () => { const x = await fkDatei(fk, HAUPT); return x.bilder['Bilder A/IMG_0001.jpg']?.aussortiert && x.bilder['Bilder A/IMG_0002.jpg']?.beschreibung && x; }, 'gespeichert');
    assert.deepEqual([j.bilder['Fotos B/IMG_0001.jpg'].beschreibung, j.bilder['Fotos B/IMG_0001.jpg'].probe], ['Flur Wand', 'P1'], 'Einträge des nicht lesbaren Ordners bleiben');
    assert.equal(j.ordnerTermine['Fotos B'].termin, 't1');
    assert.ok(j.reihenfolge.length === 0 || j.reihenfolge.includes('Fotos B/IMG_0001.jpg'));
    await fk.evaluate(() => { FileSystemDirectoryHandle.prototype.values = window.testValues; });
    await fk.click('#btnMehr'); await fk.locator('#mosaikMehrPop #mehrReload').click(); await ruhig(fk);
    assert.equal(await fk.locator('#ordnerZeile').textContent().then(t => /nicht lesbar/.test(t)), false);
    await fk.locator('#list .row[aria-label="Fotos B/IMG_0001.jpg"] .tinfo').click();
    assert.equal(await fk.locator('#fDesc').inputValue(), 'Flur Wand');
    // „Weg“ im Unterordner ist nur eine Markierung: nichts wird nach _aussortiert verschoben
    const imOrdner = await fk.evaluate(async p => { const f = await (await (await (await navigator.storage.getDirectory()).getDirectoryHandle('Mosaik Archivordner')).getDirectoryHandle(p)).getDirectoryHandle('Fotos');
      const o = []; for await (const n of (await f.getDirectoryHandle('Bilder A')).keys()) o.push(n); return o.sort(); }, HAUPT);
    assert.deepEqual(imOrdner, ['IMG_0001.jpg', 'IMG_0002.jpg', 'Tiefer']);
    console.log(`OK ${browserName}: Unterordner nicht lesbar → gelbe Zeile, Einträge bleiben; „Weg“ im Unterordner nur Markierung`);
    await pz.close();
  }

  // ---------- 6. Bestand (O8) ----------
  schritt = '6 Bestand';
  const fb = await seite('/fk/index.html', BESTAND);
  await oeffnen(fb); await ruhig(fb);
  await fb.waitForFunction(() => [...document.querySelectorAll('#list .row')].map(e => e.getAttribute('aria-label')).join() === 'IMG_0009.jpg,IMG_0001.jpg,IMG_0002.jpg,IMG_0003.jpg');   // je Herkunft zusammen, „direkt“ zuerst
  assert.deepEqual(await koepfe(fb), ['[gelb] direkt in „Fotos“ – Neuer Ortstermin am ' + (await koepfe(fb))[0].match(/\d\d\.\d\d\.\d{4}/)[0] + '? (Dateidatum der Fotos – unsicher – passt zu keinem Termin des Projekts) Anlegen',
    (await koepfe(fb))[1], '[gelb] übernommen aus „fotos ka 20.08“ – Ortstermin am 20.08.2026 (Nachbeprobung)? (Datum im Ordnernamen) Ja']);
  assert.match((await koepfe(fb))[1], /^\[gelb\] übernommen aus „Bilder A“ – /);
  await kopf(fb, 'übernommen aus „fotos ka 20.08“').locator('button', { hasText: 'Ja' }).click();
  await kopf(fb, 'übernommen aus „Bilder A“').locator('select').selectOption('t1');
  j = await bis(fb, async () => { const x = await fkDatei(fb, BESTAND); return x.bilder['IMG_0001.jpg']?.termin && x; }, 'Termin je Foto');
  assert.deepEqual(['IMG_0001.jpg', 'IMG_0002.jpg', 'IMG_0003.jpg'].map(n => j.bilder[n].termin), ['t1', 't1', 't2']);
  assert.equal(j.bilder['IMG_0003.jpg'].beschreibung, 'Flur Wand');
  assert.equal(j.ordnerTermine, undefined, 'Herkunft: je Foto, nicht als Ordner');
  assert.equal(j.fotoUebernahmen.length, 2, 'fotoUebernahmen bleibt');
  assert.equal(await fb.locator('#list .row.ohne-termin').count(), 1, 'IMG_0009 (ohne Herkunft) noch gelb');
  const bestandDateien = await fb.evaluate(async p => { const f = await (await (await (await navigator.storage.getDirectory()).getDirectoryHandle('Mosaik Archivordner')).getDirectoryHandle(p)).getDirectoryHandle('Fotos');
    const o = []; for await (const [n, h] of f.entries()) o.push(n + (h.kind === 'directory' ? '/' : '')); return o.sort(); }, BESTAND);
  assert.deepEqual(bestandDateien, ['IMG_0001.jpg', 'IMG_0002.jpg', 'IMG_0003.jpg', 'IMG_0009.jpg', '_Bildumbenenner.json', '_FotoKit_Fassungen/'], 'nichts zurückverschoben');
  console.log(`OK ${browserName}: Bestand – Rückfrage je Herkunft (fotoUebernahmen), Termin je Foto, nichts verschoben`);
  await fb.close();

  // ---------- 6b. Review #95: Herkunft nach dem Umbenennen; Vorschlag aus dem Aufnahmedatum (EXIF) ----------
  schritt = '6b Herkunft umbenannt';
  await fk.evaluate(async HERKUNFT => {
    const archiv = await (await navigator.storage.getDirectory()).getDirectoryHandle('Mosaik Archivordner');
    const put = async (d, n, x) => { const w = await (await d.getFileHandle(n, { create: true })).createWritable(); await w.write(x); await w.close(); };
    const vorlage = new Uint8Array(await (await fetch('/fk/tests/fixtures/exif-aufnahme-2026-08-20.jpg')).arrayBuffer());
    let sek = 0;
    const exif = tag => { const b = vorlage.slice(), alt = new TextEncoder().encode('2026:08:20 10:42:17'), neu = new TextEncoder().encode(tag.replace(/-/g, ':') + ' 10:42:' + String(++sek).padStart(2, '0'));   // erfunden; je Foto eine Sekunde weiter (keine gleichen Dateien)
      for (let i = 0; i + alt.length <= b.length; i++) if (alt.every((x, k) => b[i + k] === x)) b.set(neu, i); return new Blob([b], { type: 'image/jpeg' }); };
    const ohne = i => { const c = document.createElement('canvas'); c.width = 30 + i; c.height = 24; c.getContext('2d').fillRect(0, 0, i, i); return new Promise(r => c.toBlob(r, 'image/jpeg')); };
    const p = await archiv.getDirectoryHandle(HERKUNFT, { create: true }), f = await p.getDirectoryHandle('Fotos', { create: true });
    await put(p, '_Projekt.json', JSON.stringify({ format: 'mosaik-projekt', version: 1, objekt: 'EFH, Testweg 4', ortstermin: '2026-08-12' }));
    await put(f, 'IMG_0001.jpg', exif('2026-08-12')); await put(f, 'IMG_0002.jpg', exif('2026-08-12'));
    await put(f, 'IMG_0001_fotos_ka_20_08.jpg', exif('2026-08-20'));
    await put(f, 'IMG_0009.jpg', await ohne(1)); await put(f, 'IMG_0050.jpg', await ohne(2));
    const st = await f.getDirectoryHandle('Bilder Stefan', { create: true });
    await put(st, 'DSC_1.jpg', exif('2026-08-20')); await put(st, 'DSC_2.jpg', exif('2026-08-20')); await put(st, 'DSC_3.jpg', exif('2026-08-12'));
    const oe = await f.getDirectoryHandle('Ohne Exif', { create: true });
    await put(oe, 'X_1.jpg', await ohne(3)); await put(oe, 'X_2.jpg', await ohne(4));
    await put(f, '_Bildumbenenner.json', JSON.stringify({ app: 'Bildumbenenner', format: 1, version: '2.6.0', projekt: {}, benennung: {}, reihenfolge: [],
      bilder: { 'IMG_0001.jpg': { beschreibung: 'Küche Decke' }, 'IMG_0002.jpg': { beschreibung: 'Küche Wand' }, 'IMG_0001_fotos_ka_20_08.jpg': { beschreibung: 'Flur Wand' }, 'IMG_0009.jpg': { beschreibung: 'Keller Boden' } },
      fotoUebernahmen: [{ zeit: '2026-11-20T10:00:00.000Z', ordner: 'Bilder A', dateien: [{ datei: 'IMG_0001.jpg' }, { datei: 'IMG_0002.jpg' }, { datei: 'IMG_0009.jpg' }] },
        { zeit: '2026-11-21T10:00:00.000Z', ordner: 'fotos ka 20.08', kuerzel: 'Ka', dateien: [{ datei: 'IMG_0001_fotos_ka_20_08.jpg', vorher: 'IMG_0001.jpg' }, { datei: 'IMG_0009.jpg' }] }] }, null, 2));
  }, HERKUNFT);
  const uebVorher = JSON.parse(await lies(fk, HERKUNFT, 'Fotos', '_Bildumbenenner.json')).fotoUebernahmen;
  const fh = await seite('/fk/index.html', HERKUNFT);
  await oeffnen(fh); await ruhig(fh);
  await fh.waitForFunction(() => document.querySelectorAll('#list .row').length === 10);
  await fh.locator('#list .row[aria-label="Bilder Stefan/DSC_1.jpg"] .tinfo').click();
  assert.match(await fh.locator('#pvInfo').textContent(), /20\.08\.2026/, 'Aufnahmedatum aus dem erfundenen EXIF gelesen');
  const umbenennen = async () => { await fh.click('#btnMehr'); await fh.locator('#mosaikMehrPop #mehrUmbenennen').click(); await fh.locator('#dOk').click();
    await fh.waitForFunction(() => !document.querySelector('#overlay').classList.contains('show') && document.querySelector('#bUndo'), null, { timeout: 60000 }); await ruhig(fh); };
  const nachOriginal = async () => { const x = await fkDatei(fh, HERKUNFT), m = {}; for (const [k, v] of Object.entries(x.bilder)) if (!k.includes('/') && v.original) m[v.original.name] = k; return m; };
  await umbenennen();
  let neu = await bis(fh, async () => { const m = await nachOriginal(); return Object.keys(m).length >= 4 && m; }, 'umbenannt');
  for (const n of ['IMG_0001.jpg', 'IMG_0002.jpg', 'IMG_0001_fotos_ka_20_08.jpg', 'IMG_0009.jpg']) assert.notEqual(neu[n], n, n + ' umbenannt');
  // zweites Umbenennen: der gemerkte erste Name bleibt
  await beschreiben(fh, neu['IMG_0001_fotos_ka_20_08.jpg'], 'Flur Wand links'); await beschreiben(fh, neu['IMG_0002.jpg'], 'Küche Wand Fenster');
  const erst = neu;
  await umbenennen();
  neu = await bis(fh, async () => { const m = await nachOriginal(); return m['IMG_0002.jpg'] && m['IMG_0002.jpg'] !== erst['IMG_0002.jpg'] && m['IMG_0001_fotos_ka_20_08.jpg'] !== erst['IMG_0001_fotos_ka_20_08.jpg'] && m; }, 'zweimal umbenannt');
  // Termin 2 in _Projekt.json (wie aus der Projektzentrale), dann neu lesen
  await fh.evaluate(async HERKUNFT => { const p = await (await (await navigator.storage.getDirectory()).getDirectoryHandle('Mosaik Archivordner')).getDirectoryHandle(HERKUNFT);
    const w = await (await p.getFileHandle('_Projekt.json')).createWritable(); await w.write(JSON.stringify({ format: 'mosaik-projekt', version: 1, objekt: 'EFH, Testweg 4', ortstermin: '2026-08-12',
      weitereOrtstermine: [{ id: 't2', datum: '2026-08-20', bezeichnung: 'Nachbeprobung', wer: 'Ka' }], ortsterminZaehler: 2 })); await w.close(); }, HERKUNFT);
  await fh.click('#btnMehr'); await fh.locator('#mosaikMehrPop #mehrReload').click(); await ruhig(fh);
  await bis(fh, async () => !(await fh.locator('#terminWahl').isHidden()), 'zwei Termine');
  const k6 = await koepfe(fh), unsicherFrage = name => new RegExp('^\\[gelb\\] ' + name + ' – Neuer Ortstermin am \\d\\d\\.\\d\\d\\.\\d{4}\\? \\(Dateidatum der Fotos – unsicher – passt zu keinem Termin des Projekts\\) Anlegen$');
  assert.equal(k6.length, 6, k6.join(' | '));
  assert.match(k6[0], unsicherFrage('direkt in „Fotos“'), 'nur IMG_0050 (nie übernommen) direkt');
  assert.equal(k6[1], '[gelb] übernommen aus „Bilder A“ – Ortstermin am 12.08.2026? (Aufnahmedatum der Fotos) Ja', 'Herkunft trotz Umbenennen, Vorschlag aus dem Aufnahmedatum');
  assert.equal(k6[2], '[gelb] Bilder Stefan – Ortstermin am 20.08.2026 (Nachbeprobung)? (Aufnahmedatum der Fotos) Ja', 'ohne Datum im Namen: häufigster Aufnahmetag (2× 20.08., 1× 12.08.)');
  assert.equal(k6[3], '[gelb] übernommen aus „fotos ka 20.08“ – Ortstermin am 20.08.2026 (Nachbeprobung)? (Datum im Ordnernamen) Ja', 'Herkunft nach zweimal Umbenennen, Name mit Zusatz aus der Übernahme');
  assert.match(k6[4], /^\[gelb\] übernommen, Herkunft unbekannt – /, 'Name in beiden Übernahmen → nicht still zu einer');
  assert.match(k6[5], unsicherFrage('Ohne Exif'), 'nur Dateidatum → „unsicher“');
  const inGruppe = async titel => kopf(fh, titel).evaluate(k => { const o = []; for (let e = k.nextElementSibling; e && !e.classList.contains('fk-ordner'); e = e.nextElementSibling) if (e.classList.contains('row')) o.push(e.getAttribute('aria-label')); return o.sort(); });
  assert.deepEqual(await inGruppe('übernommen aus „Bilder A“'), [neu['IMG_0001.jpg'], neu['IMG_0002.jpg']].sort());
  assert.deepEqual(await inGruppe('übernommen aus „fotos ka 20.08“'), [neu['IMG_0001_fotos_ka_20_08.jpg']]);
  assert.deepEqual(await inGruppe('übernommen, Herkunft unbekannt'), [neu['IMG_0009.jpg']]);
  await kopf(fh, 'übernommen aus „Bilder A“').locator('button', { hasText: 'Ja' }).click();
  await kopf(fh, 'übernommen aus „fotos ka 20.08“').locator('button', { hasText: 'Ja' }).click();
  await kopf(fh, 'Bilder Stefan').locator('button', { hasText: 'Ja' }).click();
  j = await bis(fh, async () => { const x = await fkDatei(fh, HERKUNFT); return x.bilder[neu['IMG_0001_fotos_ka_20_08.jpg']]?.termin && x.ordnerTermine?.['Bilder Stefan'] && x; }, 'Zuordnung gespeichert');
  assert.deepEqual(['IMG_0001.jpg', 'IMG_0002.jpg', 'IMG_0001_fotos_ka_20_08.jpg', 'IMG_0009.jpg'].map(n => j.bilder[neu[n]].termin), ['t1', 't1', 't2', undefined]);
  assert.deepEqual([j.ordnerTermine['Bilder Stefan'].termin, j.ordnerTermine['Bilder Stefan'].vorschlag], ['t2', 'aufnahmedatum']);
  assert.deepEqual(j.fotoUebernahmen, uebVorher, 'fotoUebernahmen nicht umgeschrieben');
  assert.equal(await fh.locator('#list .row.ohne-termin').count(), 4, 'Herkunft unbekannt, IMG_0050 und „Ohne Exif“ noch gelb');
  console.log(`OK ${browserName}: Herkunft nach (zweimal) Umbenennen über den gemerkten Originalnamen, unsicher → „Herkunft unbekannt“; Vorschlag aus dem Aufnahmedatum (EXIF), nur Dateidatum → „unsicher“`);
  await fh.close();

  // ---------- 7. Link mit unbekanntem Teil ----------
  // ---------- 6c. Review #95 (P2): Termin im Dialog „Bilddokumentation erstellen“ wechseln ----------
  schritt = '6c Terminwechsel im Dialog';
  await fk.evaluate(async WECHSEL => {
    const a = await (await navigator.storage.getDirectory()).getDirectoryHandle('Mosaik Archivordner'), p = await a.getDirectoryHandle(WECHSEL, { create: true }), f = await p.getDirectoryHandle('Fotos', { create: true });
    const put = async (d, n, x) => { const w = await (await d.getFileHandle(n, { create: true })).createWritable(); await w.write(x); await w.close(); };
    const jpg = i => { const c = document.createElement('canvas'); c.width = 40 + i; c.height = 30; const g = c.getContext('2d'); g.fillStyle = `rgb(${i * 30},90,120)`; g.fillRect(0, 0, 40 + i, 30); return new Promise(r => c.toBlob(r, 'image/jpeg')); };
    await put(p, '_Projekt.json', JSON.stringify({ format: 'mosaik-projekt', version: 1, objekt: 'EFH, Testweg 6', ortstermin: '2026-08-12',
      weitereOrtstermine: [{ id: 't2', datum: '2026-08-20', bezeichnung: 'Nachbeprobung', wer: 'Ka' }], ortsterminZaehler: 2 }));
    const b = await f.getDirectoryHandle('fotos ka 20.08', { create: true }), bilder = {};
    for (let i = 1; i <= 3; i++){ await put(f, `A${i}.jpg`, await jpg(i)); bilder[`A${i}.jpg`] = { beschreibung: 'Küche ' + i }; }   // t1: 3 Fotos, alle beschrieben
    for (let i = 1; i <= 5; i++) await put(b, `B${i}.jpg`, await jpg(3 + i));                                                     // t2: 5 Fotos, 1 beschrieben
    bilder['fotos ka 20.08/B1.jpg'] = { beschreibung: 'Keller Wand' };
    await put(f, '_Bildumbenenner.json', JSON.stringify({ app: 'Bildumbenenner', format: 1, version: '2.7.0', projekt: {}, benennung: {}, reihenfolge: [], bilder,
      ordnerTermine: { '': { termin: 't1', am: '2026-11-26T08:00:00.000Z', vorschlag: 'hand' }, 'fotos ka 20.08': { termin: 't2', am: '2026-11-26T08:00:00.000Z', vorschlag: 'datum-im-namen' } } }, null, 2));
  }, WECHSEL);
  const fw = await seite('/fk/index.html', WECHSEL);
  await oeffnen(fw); await ruhig(fw); await fw.waitForFunction(() => document.querySelectorAll('#list .row').length === 8);
  await fw.locator('#terminWahl [data-ansicht="t1"]').click();
  await fw.click('#btnPdf'); await fw.locator('#zOk').waitFor();
  await fw.locator('#pEinst summary').click();   // „nur Fotos mit Beschreibung“ steht unter „Einstellungen“
  const stand = async () => ({ wahl: await fw.locator('#pTermin').inputValue(), nurAus: await fw.locator('#zOnly').isDisabled(), nur: await fw.locator('#zOnly').isChecked(),
    info: (await fw.locator('#zInfo').textContent()).replace(/\s+/g, ' '), termin: await fw.locator('#pTerminInfo').textContent(), ort: await fw.locator('#m_ort').inputValue() });
  const nieNegativ = x => assert.doesNotMatch(x.info, /(^|[^\d.:])-\d/, 'keine negativen Zahlen: ' + x.info);
  let w = await stand();
  assert.equal(w.wahl, 't1'); assert.equal(w.nurAus, true, 't1: alle beschrieben → „nur mit Beschreibung“ gesperrt');
  assert.match(w.info, /Inhalt: Deckblatt \+ 3 Bilder \(2 pro Seite\)/); assert.doesNotMatch(w.info, /ohne Beschreibung/); assert.match(w.info, /_2026-08-12\.pdf/); nieNegativ(w);
  await fw.locator('#pTermin').selectOption('t2'); w = await stand();
  assert.equal(w.nurAus, false, 't2: nur teils beschrieben → „nur mit Beschreibung“ frei');
  assert.match(w.info, /Inhalt: Deckblatt \+ 5 Bilder \(2 pro Seite\) · 4 ohne Beschreibung \(kommen ohne Beschriftung mit\)/); assert.match(w.info, /_2026-08-20\.pdf/); nieNegativ(w);
  assert.deepEqual([w.ort, w.termin.startsWith('Deckblatt: Termin 2 · 20.08.2026 · Nachbeprobung')], ['2026-08-20', true]);
  await fw.locator('label:has(#zOnly)').click(); w = await stand();
  assert.match(w.info, /Inhalt: Deckblatt \+ 1 Bilder \(2 pro Seite\) · 4 ohne Beschreibung nicht enthalten/); nieNegativ(w);
  await fw.locator('#pTermin').selectOption('t1'); w = await stand();
  assert.deepEqual([w.nurAus, w.nur], [true, false], 'zurück auf t1: wieder gesperrt (und nicht still angehakt)');
  assert.match(w.info, /Inhalt: Deckblatt \+ 3 Bilder \(2 pro Seite\)/); assert.doesNotMatch(w.info, /ohne Beschreibung/); assert.match(w.info, /_2026-08-12\.pdf/); nieNegativ(w);
  await fw.locator('#pTermin').selectOption('alle'); w = await stand();
  assert.equal(w.nurAus, false); assert.match(w.info, /Inhalt: Deckblatt \+ 8 Bilder \(2 pro Seite\) · 4 ohne Beschreibung \(kommen ohne Beschriftung mit\)/);
  assert.match(w.info, / - alle Termine\.pdf/); nieNegativ(w);
  await fw.locator('label:has(#zOnly)').click(); w = await stand(); assert.match(w.info, /Deckblatt \+ 4 Bilder .* · 4 ohne Beschreibung nicht enthalten/); nieNegativ(w);
  await fw.locator('label:has(#zOnly)').click();
  // PDF nach dem Wechsel: Fotos des gewählten Termins (t2: 5 Bilder), nicht die beim Öffnen gezeigten (t1: 3)
  await fw.locator('#pTermin').selectOption('t2');
  await fw.click('#zOk'); await ruhig(fw);
  const jw = await bis(fw, async () => { const x = await fkDatei(fw, WECHSEL); return x.bilddokus?.t2 && x; }, 'Doku Termin 2');
  assert.equal(jw.bilddoku.termin, 't2'); assert.match(jw.bilddoku.dateien[0], /_2026-08-20\.pdf$/);
  const bilderImPdf = await fw.evaluate(async ([p, n]) => { const f = await (await (await (await navigator.storage.getDirectory()).getDirectoryHandle('Mosaik Archivordner')).getDirectoryHandle(p)).getDirectoryHandle('Fotos');
    const t = new TextDecoder('latin1').decode(await (await (await f.getFileHandle(n)).getFile()).arrayBuffer()); return [...t.matchAll(/\/Subtype\s*\/Image\s*\/Width (\d+) \/Height 30 [^>]*\/DCTDecode/g)].map(m => +m[1]).sort((x, y) => x - y); }, [WECHSEL, jw.bilddoku.dateien[0]]);
  assert.deepEqual(bilderImPdf, [44, 45, 46, 47, 48], 'PDF enthält genau die 5 Fotos von Termin 2 (B1–B5, 44–48 px breit), keins von Termin 1 (41–43 px)');
  assert.deepEqual(jw.bilddoku.bestandUnterordner?.slice().sort(), ['fotos ka 20.08/B1.jpg', 'fotos ka 20.08/B2.jpg', 'fotos ka 20.08/B3.jpg', 'fotos ka 20.08/B4.jpg', 'fotos ka 20.08/B5.jpg']);
  assert.equal(await fw.locator('#terminWahl [data-ansicht="t2"]').getAttribute('aria-pressed'), 'true', 'Liste zeigt danach Termin 2');
  console.log(`OK ${browserName}: Terminwechsel im Dialog – „nur mit Beschreibung“, Zusammenfassung und Dateiname je Termin neu gerechnet, nie negativ; PDF mit den Fotos des gewählten Termins`);
  await fw.close();

  // ---------- 6d. Review #95 (P2, zweite Runde): iPhone-Rückfrage je Auswahl, Dateiname mit geändertem Datum, Reihenfolge nach „Weg“ ----------
  schritt = '6d iPhone-Rückfrage, Datum im Dateinamen, Reihenfolge';
  const heicB = [...fs.readFileSync(path.join(__dirname, 'fixtures', 'testbild.heic'))];
  await fk.evaluate(async ([BEFUNDE, heicB]) => {
    const a = await (await navigator.storage.getDirectory()).getDirectoryHandle('Mosaik Archivordner'), p = await a.getDirectoryHandle(BEFUNDE, { create: true }), f = await p.getDirectoryHandle('Fotos', { create: true });
    const put = async (d, n, x) => { const w = await (await d.getFileHandle(n, { create: true })).createWritable(); await w.write(x); await w.close(); };
    const jpg = i => { const c = document.createElement('canvas'); c.width = 40 + i; c.height = 30; const g = c.getContext('2d'); g.fillStyle = `rgb(${i * 30},120,90)`; g.fillRect(0, 0, 40 + i, 30); return new Promise(r => c.toBlob(r, 'image/jpeg')); };
    await put(p, '_Projekt.json', JSON.stringify({ format: 'mosaik-projekt', version: 1, objekt: 'EFH, Testweg 7', ortstermin: '2026-08-12',
      weitereOrtstermine: [{ id: 't2', datum: '2026-08-20', bezeichnung: 'Nachbeprobung', wer: 'Ka' }], ortsterminZaehler: 2 }));
    const b = await f.getDirectoryHandle('fotos ka 20.08', { create: true }), heic = new Uint8Array(heicB), bilder = {};
    for (let i = 1; i <= 3; i++){ await put(f, `A${i}.jpg`, await jpg(i)); bilder[`A${i}.jpg`] = { beschreibung: 'Küche ' + i }; }            // t1: 3 JPG + 1 iPhone-Foto
    for (let i = 1; i <= 3; i++){ await put(b, `B${i}.jpg`, await jpg(3 + i)); bilder[`fotos ka 20.08/B${i}.jpg`] = { beschreibung: 'Keller ' + i }; }   // t2: 3 JPG + 1 iPhone-Foto
    await put(f, 'A4.heic', heic); await put(f, 'A5.heic', heic); await put(b, 'B4.heic', heic);
    bilder['A2.jpg'].aussortiert = true; bilder['fotos ka 20.08/B2.jpg'].aussortiert = true;   // je ein „Weg“-Foto: direkt in „Fotos“ und im Unterordner
    bilder['A5.heic'] = { aussortiert: true };                                                   // und ein iPhone-Foto, das „Weg“ ist (kommt nicht in die Doku)
    await put(f, '_Bildumbenenner.json', JSON.stringify({ app: 'Bildumbenenner', format: 1, version: '2.7.0', projekt: {}, benennung: {}, reihenfolge: [], bilder,
      ordnerTermine: { '': { termin: 't1', am: '2026-11-26T08:00:00.000Z', vorschlag: 'hand' }, 'fotos ka 20.08': { termin: 't2', am: '2026-11-26T08:00:00.000Z', vorschlag: 'datum-im-namen' } } }, null, 2));
  }, [BEFUNDE, heicB]);
  const fbef = await seite('/fk/index.html', BEFUNDE);
  await oeffnen(fbef); await ruhig(fbef); await fbef.waitForFunction(() => document.querySelectorAll('#list .row').length === 9);
  const imOrdnerB = () => fbef.evaluate(async p => { const f = await (await (await (await navigator.storage.getDirectory()).getDirectoryHandle('Mosaik Archivordner')).getDirectoryHandle(p)).getDirectoryHandle('Fotos');
    const o = []; for await (const [n, h] of f.entries()){ if (h.kind === 'file') o.push(n); else for await (const m of h.keys()) o.push(n + '/' + m); } return o.filter(n => !/^_Bildumbenenner|^_FotoKit_Fassungen\/|\.pdf$/.test(n)).sort(); }, BEFUNDE);   // ohne Projektdatei, Fassungen und PDFs
  // (a) Rückfrage vor der Doku: nur die iPhone-Fotos der gezeigten Auswahl
  await fbef.locator('#terminWahl [data-ansicht="t1"]').click();
  await fbef.click('#btnPdf'); await fbef.locator('#dHeic').waitFor();
  assert.match(await fbef.locator('#dHeic').textContent(), /^\s*Ein Foto in der Doku ist im iPhone-Format/, 'Termin 1 gezeigt: nur sein iPhone-Foto in der Doku zählt – nicht das von Termin 2, nicht das aussortierte');
  assert.equal(await fbef.locator('#dOk').textContent(), '1 iPhone-Foto umwandeln');
  await fbef.click('#dCancel'); await ruhig(fbef);
  await fbef.locator('#terminWahl [data-ansicht="alle"]').click();
  await fbef.click('#btnPdf'); await fbef.locator('#dHeic').waitFor();
  assert.match(await fbef.locator('#dHeic').textContent(), /2 Fotos in der Doku sind im iPhone-Format/, '„Alle“: beide');
  await fbef.click('#dCancel'); await ruhig(fbef);
  await fbef.locator('#terminWahl [data-ansicht="t1"]').click();
  await fbef.click('#btnPdf'); await fbef.locator('#dHeic').waitFor(); await fbef.click('#dOk');
  await fbef.locator('#zOk').waitFor({ timeout: 60000 });   // umgewandelt, danach öffnet sich der Dialog „Bilddokumentation erstellen“
  assert.match(await fbef.locator('#banner').textContent(), /1 iPhone-Foto in JPG umgewandelt/);
  let obef = await imOrdnerB();
  assert.deepEqual(obef, ['A1.jpg', 'A2.jpg', 'A3.jpg', 'A4.jpg', 'A5.heic', '_Originale/A4.heic', 'fotos ka 20.08/B1.jpg', 'fotos ka 20.08/B2.jpg', 'fotos ka 20.08/B3.jpg', 'fotos ka 20.08/B4.heic'],
    'nur das eine gezählte iPhone-Foto umgewandelt – das von Termin 2 und das aussortierte (A5) liegen unverändert da');
  // (b) Datum von Termin 1 im Dialog ändern: Dateiname und „Deckblatt: …“ sofortB (im selben Schritt gelesen – _Projekt.json wird erst verzögert geschrieben)
  assert.equal(await fbef.locator('#pTermin').inputValue(), 't1'); assert.equal(await fbef.locator('#m_ort').inputValue(), '2026-08-12');
  assert.match(await fbef.locator('#zInfo').textContent(), /_2026-08-12\.pdf/);
  const sofortB = await fbef.evaluate(() => { const f = document.getElementById('m_ort'); f.value = '2026-08-14'; f.dispatchEvent(new Event('input', { bubbles: true }));
    return { info: document.getElementById('zInfo').textContent, termin: document.getElementById('pTerminInfo').textContent }; });
  assert.match(sofortB.info, /_2026-08-14\.pdf/, 'Dateiname mit dem eben eingetragenen Datum: ' + sofortB.info.replace(/\s+/g, ' '));
  assert.doesNotMatch(sofortB.info, /_2026-08-12\.pdf/);
  assert.ok(sofortB.termin.startsWith('Deckblatt: Termin 1 · 14.08.2026'), sofortB.termin);
  if (await fbef.locator('#pRename').count()) await fbef.locator('#pRename').uncheck();   // hier nur die PDF, kein Umbenennen
  await fbef.click('#zOk'); await ruhig(fbef);
  let jbef = await bis(fbef, async () => { const x = await fkDatei(fbef, BEFUNDE); return x.bilddokus?.t1 && x; }, 'Doku Termin 1');
  assert.match(jbef.bilddokus.t1.dateien[0], /_2026-08-14\.pdf$/, 'PDF heißt nach dem neuen Datum (wie das Deckblatt)');
  assert.equal(jbef.bilddokus.t1.termin.datum, '2026-08-14');
  await bis(fbef, async () => (await pjDatei(fbef, BEFUNDE)).ortstermin === '2026-08-14', '_Projekt.json mit dem neuen Datum');
  assert.deepEqual((await pjDatei(fbef, BEFUNDE)).weitereOrtstermine, [{ id: 't2', datum: '2026-08-20', bezeichnung: 'Nachbeprobung', wer: 'Ka' }]);
  // (c) „Dateien umbenennen“ in „Alle“: A2 (Weg, direkt in „Fotos“) wird verschoben, B2 (Weg, Unterordner) bleibt liegen – und in der Reihenfolge
  await fbef.locator('#terminWahl [data-ansicht="alle"]').click();
  await fbef.click('#btnMehr'); await fbef.locator('#mosaikMehrPop #mehrUmbenennen').click();
  assert.match(await fbef.locator('#dialog .list').textContent(), /Nach _aussortiert\/ verschieben \(2\)\s*A2\.jpg\s*A5\.heic/);
  await fbef.locator('#dOk').click(); await fbef.locator('#bUndo').waitFor({ timeout: 60000 });
  jbef = await bis(fbef, async () => { const x = await fkDatei(fbef, BEFUNDE); return x.reihenfolge.length && x; }, 'Umbenennen gespeichert');
  obef = await imOrdnerB();
  assert.ok(obef.includes('_aussortiert/A2.jpg') && !obef.includes('A2.jpg') && obef.includes('_aussortiert/A5.heic'), 'A2 und A5 verschoben: ' + obef.join(', '));
  assert.ok(obef.includes('fotos ka 20.08/B2.jpg'), 'B2 bleibt im Unterordner');
  assert.equal(jbef.bilder['fotos ka 20.08/B2.jpg'].aussortiert, true);
  assert.ok(jbef.reihenfolge.includes('fotos ka 20.08/B2.jpg'), 'das „Weg“-Foto im Unterordner bleibt in der gespeicherten Reihenfolge: ' + jbef.reihenfolge.join(', '));
  assert.ok(!jbef.reihenfolge.includes('A2.jpg'), 'das verschobene Foto steht nicht mehr in der Reihenfolge');
  assert.deepEqual(jbef.reihenfolge.slice().sort(), (await kacheln(fbef)).slice().sort(), 'Reihenfolge = genau die Fotos, die noch da sind');
  console.log(`OK ${browserName}: iPhone-Rückfrage nur für die gezeigte Auswahl ohne „Weg“-Fotos; geändertes Datum von Termin 1 sofort im Dateinamen und im PDF; „Weg“-Foto im Unterordner bleibt in der Reihenfolge`);
  await fbef.close();

  schritt = '7 Link';
  const fl = await ctx.newPage(); fl.on('pageerror', e => fehler.push('Link: ' + e.message));
  await fl.goto(url('/fk/index.html#projekt=' + encodeURIComponent(BESTAND) + '&mitteilung=2'));
  await fl.waitForFunction(() => document.querySelectorAll('#list .row').length === 4);
  assert.match(decodeURIComponent(new URL(fl.url()).hash), /mitteilung=2/, 'unbekannter Teil bleibt im Link');
  assert.match(decodeURIComponent(new URL(fl.url()).hash), new RegExp('projekt=' + BESTAND));
  console.log(`OK ${browserName}: Link „#projekt=…&mitteilung=2“ – unbekannter Teil übergangen und erhalten`);
  await fl.close();

  // ---------- 8. FotoKit 2.6.0: Versionssperre; ohne Unterordner byte-gleich ----------
  if (!altHtml) console.log('SKIP FotoKit 2.6.0 nicht in der Git-Historie (flacher Klon)');
  else {
    schritt = '8 2.6.0';
    const vorher = await lies(fk, BESTAND, 'Fotos', '_Bildumbenenner.json');
    const alt = await seite('/fk26/index.html', BESTAND);
    assert.match(await alt.title(), /FotoKit 2\.6\.0/);
    await oeffnen(alt); await alt.waitForFunction(() => !document.body.inert && document.querySelectorAll('#list .row').length === 4 && /2\.7\.0/.test(document.getElementById('banner').textContent));
    assert.match(await alt.locator('#banner').textContent(), /neuere oder nicht unterstützte FotoKit-Version \(2\.7\.0\)/);
    await alt.locator('#list .row').nth(0).locator('.tinfo').click(); await alt.locator('#fDesc').fill('darf nicht ankommen'); await alt.locator('#fDesc').press('Tab');
    await alt.waitForTimeout(1200);
    assert.equal(await lies(alt, BESTAND, 'Fotos', '_Bildumbenenner.json'), vorher, 'FotoKit 2.6.0 schreibt die Datei von 2.7.0 nicht (R1)');
    await alt.close();
    console.log(`OK ${browserName}: FotoKit 2.6.0 fasst eine Datei von 2.7.0 nicht an (Versionssperre)`);
    // Dieselben Schritte mit 2.6.0 und 2.7.0 in einem Projekt ohne Unterordner mit einem Termin → gleiche Dateien
    const lauf = async pfad => {
      await fk.evaluate(async p => {
        const a = await (await navigator.storage.getDirectory()).getDirectoryHandle('Mosaik Archivordner'), e = await a.getDirectoryHandle(p);
        await e.removeEntry('Fotos', { recursive: true }); const f = await e.getDirectoryHandle('Fotos', { create: true });
        await (async () => { const w = await (await e.getFileHandle('_Projekt.json', { create: true })).createWritable(); await w.write(JSON.stringify({ format: 'mosaik-projekt', version: 1, objekt: 'EFH, Testweg 1', ortstermin: '2026-08-12' })); await w.close(); })();
        for (let i = 1; i <= 3; i++){ const c = document.createElement('canvas'); c.width = 30 + i; c.height = 20; c.getContext('2d').fillRect(0, 0, i, i);
          const w = await (await f.getFileHandle(`IMG_000${i}.jpg`, { create: true })).createWritable(); await w.write(await new Promise(r => c.toBlob(r, 'image/jpeg'))); await w.close(); }
      }, EINFACH);
      const pg = await seite(pfad, EINFACH);
      await oeffnen(pg); await pg.waitForFunction(() => !document.body.inert && [...document.querySelectorAll('#list .row')].map(e => e.getAttribute('aria-label')).join() === 'IMG_0001.jpg,IMG_0002.jpg,IMG_0003.jpg');
      await beschreiben(pg, 'IMG_0001.jpg', 'Küche Decke'); await pg.locator('#fSec').fill('Küche'); await pg.locator('#fSec').press('Tab');
      await pg.locator('#list .row').nth(2).locator('.pick input').uncheck();
      await pg.click('#btnPdf'); await pg.locator('#zOk').waitFor(); if (await pg.locator('#pRename').count()) await pg.locator('#pRename').uncheck();
      await pg.click('#zOk'); await pg.waitForFunction(() => /PDF erstellt/.test(document.getElementById('banner').textContent));
      await pg.waitForTimeout(1200);
      const norm = t => t.replace(/"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z"/g, '"<Zeit>"').replace(/"version": "2\.[67]\.0"/g, '"version": "<Version>"').replace(/FotoKit 2\.[67]\.0/g, 'FotoKit <Version>');
      const r = { fk: norm(await lies(pg, EINFACH, 'Fotos', '_Bildumbenenner.json')), pj: norm(await lies(pg, EINFACH, '_Projekt.json')) };
      await pg.close(); return r;
    };
    const a26 = await lauf('/fk26/index.html'), a27 = await lauf('/fk/index.html');
    assert.equal(a27.fk, a26.fk, '_Bildumbenenner.json wie mit 2.6.0 (bis auf Version und Zeitstempel)');
    assert.equal(a27.pj, a26.pj, '_Projekt.json wie mit 2.6.0');
    assert.ok(!/ordnerTermine|bilddokus|dokuGeaendertJe|bestandUnterordner|"termin"/.test(a27.fk), 'keine neuen Felder');
    console.log(`OK ${browserName}: Projekt ohne Unterordner, ein Termin – Projektdateien wie mit FotoKit 2.6.0`);
  }
  assert.deepEqual(fehler, []);
  await browser.close(); server.close();
})().catch(async e => { console.error('Schritt:', schritt); console.error(e); try { await browser?.close(); server?.close(); } catch {} process.exit(1); });
