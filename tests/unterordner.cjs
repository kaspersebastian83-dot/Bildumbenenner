// FotoKit 2.7.0 (Plan fotokit-ortstermine 4.2): Schlüssel mit Weg („Ordner/Datei“) in projFromJson/projToJson/mergeExternal, zwei
// Fenster mit verschiedenen Ordner-Zuordnungen, Bilddokus je Termin, „Doku geändert“ je Termin, und der Neuaufbau aus den Fotos
// (flushDrafts, saveExtra, saveDiscards, saveOrder) verliert nichts, wenn ein Unterordner nicht lesbar war (R2).
// Echte FotoKit-Funktionen aus index.html, synthetisches Dateisystem (disk aus n2-speichersicherheit.cjs). node tests/unterordner.cjs
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const { disk } = require('./n2-speichersicherheit.cjs');
const Ortstermine = require('../ortstermine.js');
const source = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const teil = (a, b) => { const i = source.indexOf(a), j = source.indexOf(b, i); assert.ok(i >= 0 && j > i, 'Abschnitt fehlt: ' + a); return source.slice(i, j); };
const tick = () => new Promise(r => setTimeout(r, 3));
const gleich = (a, b, m) => assert.deepEqual(JSON.parse(JSON.stringify(a)), b, m);   // Objekte aus dem vm-Kontext (anderer Realm)

const ZWEI = { format: 'mosaik-projekt', version: 1, ortstermin: '2026-08-12', weitereOrtstermine: [{ id: 't2', datum: '2026-08-20', bezeichnung: 'Nachbeprobung', wer: '' }], ortsterminZaehler: 2 };
const datei = () => ({ app: 'Bildumbenenner', format: 1, version: '2.7.0', projekt: {}, benennung: {}, reihenfolge: ['Bilder A/IMG_0001.jpg', 'Fotos B/IMG_0001.jpg', 'IMG_0001.jpg'],
  bilder: { 'Bilder A/IMG_0001.jpg': { beschreibung: 'Küche', zukunft: { x: 1 } }, 'Fotos B/IMG_0001.jpg': { beschreibung: 'Flur', probe: 'P1', abschnitt: 'EG' },
    'Fotos B 20.08/IMG_0001.jpg': { beschreibung: 'Nachbeprobung Flur' }, 'IMG_0001.jpg': { beschreibung: 'direkt', termin: 't1' } },
  ordnerTermine: { 'Bilder A': { termin: 't1', am: '2026-11-26T10:00:00.000Z', vorschlag: 'hand' } }, fotoUebernahmen: [{ ordner: 'Alt', dateien: [{ datei: 'IMG_0001.jpg' }] }] });
const foto = key => { const i = key.indexOf('/'); return { name: key, ordner: i < 0 ? '' : key.slice(0, i), datei: i < 0 ? key : key.slice(i + 1), desc: '', sec: '', probe: '', discard: false }; };

function sitzung(d, pj = ZWEI){
  const element = { classList: { contains: () => false }, disabled: false, value: '', textContent: '', innerHTML: '' };
  const ctx = { recoveryChanged(){}, recoverySaved(){}, console, localStorage: { getItem(){ return null; }, setItem(){} }, TextEncoder, TextDecoder, Uint8Array, crypto: webcrypto, DOMException,
    setTimeout: () => 0, clearTimeout(){}, window: { addEventListener(){}, Ortstermine }, document: { addEventListener(){} }, navigator: {},
    S: { dir: d.dir, proj: { nr: '26.0501', name: '26.0501 Teststadt' }, items: [], view: [], busy: false, changing: false, unlesbar: new Set(), herkunft: new Map() },
    APP_VERSION: '2.7.0', PROTECTED_PROJECT: 'protected', PJ: { failed: false, data: pj }, cfg: {}, defaults: {}, $: () => element, esc: String, applyCfgToUI(){},
    banner(){}, hideBanner(){}, saveError(){}, logProblem(){}, completePendingSave(){}, lkMerken(){}, verCmp: (a, b) => a.localeCompare(b, undefined, { numeric: true }) };
  vm.createContext(ctx);
  vm.runInContext(teil('const PROJ_FILE =', "document.addEventListener('visibilitychange'") + '\n' + teil('let EXTRA = {}, ORIG = {};', 'function moveRotKeys(') + '\n' +
    teil('let draftTimer;', 'let thumbQueue') + '\n' + teil('function saveOrder(names, plaetze){', '/* ---------- rows ---------- */') +
    `\nfunction applyMergedToItems(){}\nthis.api = { P, S, projSet, projGet, flushProject, loadProject, projToJson, projFromJson, mergeExternal, flushDrafts, saveExtra, saveDiscards, saveOrder, dokuGeaendert, bilddokuVermerken, terminVon, herkunftLesen: typeof herkunftLesen === 'function' ? herkunftLesen : null, dokuTerminPruefen: typeof dokuTerminPruefen === 'function' ? dokuTerminPruefen : () => {}, dokuBestandPruefen, HERKUNFT_UNBEKANNT: typeof HERKUNFT_UNBEKANNT === 'string' ? HERKUNFT_UNBEKANNT : null };`, ctx);
  return { ...ctx.api, ctx, async open(){ await ctx.api.loadProject(d.dir); } };
}

(async () => {
  let n = 0; const test = async (name, fn) => { await fn(); console.log('OK Unterordner:', name); n++; };

  await test('Schlüssel mit Weg: projFromJson/projToJson behalten Einträge, Weg, Termin je Foto und unbekannte Felder', async () => {
    const d = disk(datei()), s = sitzung(d); await s.open();
    assert.equal(s.P.data.drafts['Fotos B/IMG_0001.jpg'], 'Flur');
    gleich(s.P.data.extra['Fotos B/IMG_0001.jpg'], { sec: 'EG', probe: 'P1' });
    assert.equal(s.P.data.imageExtensions['IMG_0001.jpg'].termin, 't1', 'Termin je Foto (Bestand) als Bildfeld');
    s.projSet('drafts', { ...s.P.data.drafts, 'Bilder A/IMG_0001.jpg': 'Küche Decke' });
    assert.equal(await s.flushProject(), true);
    const j = d.json();
    assert.deepEqual(Object.keys(j.bilder), ['Bilder A/IMG_0001.jpg', 'Fotos B 20.08/IMG_0001.jpg', 'Fotos B/IMG_0001.jpg', 'IMG_0001.jpg'], 'sortiert wie bisher (localeCompare)');
    assert.equal(j.bilder['Bilder A/IMG_0001.jpg'].beschreibung, 'Küche Decke');
    assert.deepEqual(j.bilder['Bilder A/IMG_0001.jpg'].zukunft, { x: 1 });
    assert.equal(j.bilder['IMG_0001.jpg'].termin, 't1');
    assert.deepEqual(j.ordnerTermine, datei().ordnerTermine); assert.deepEqual(j.fotoUebernahmen, datei().fotoUebernahmen);
    assert.deepEqual(j.reihenfolge, datei().reihenfolge);
  });

  await test('zwei Fenster ordnen verschiedene Ordner zu → beide Zuordnungen, kein Widerspruch; Bilddokus je Termin bleiben beide', async () => {
    const d = disk(datei()), a = sitzung(d), b = sitzung(d); await a.open(); await b.open();
    const zuordnen = (s, ordner, termin) => { s.P.data.extensions = { ...s.P.data.extensions, ordnerTermine: { ...s.P.data.extensions.ordnerTermine, [ordner]: { termin, am: new Date().toISOString(), vorschlag: 'hand' } } }; s.projSet('discard', [...s.P.data.discard]); s.P.dirty = true; };
    zuordnen(a, 'Fotos B', 't1'); a.P.data.extensions.bilddokus = { t1: { dateien: ['A.pdf'], erstellt: '2026-11-26T10:00:00.000Z' } };
    zuordnen(b, 'Fotos B 20.08', 't2'); b.P.data.extensions.bilddokus = { t2: { dateien: ['B.pdf'], erstellt: '2026-11-26T10:00:01.000Z' } };
    assert.equal(await a.flushProject(), true); assert.equal(await b.flushProject(), true, 'B führt zusammen statt Widerspruch');
    const j = d.json();
    assert.deepEqual(Object.fromEntries(Object.entries(j.ordnerTermine).map(([k, v]) => [k, v.termin])), { 'Bilder A': 't1', 'Fotos B': 't1', 'Fotos B 20.08': 't2' });
    assert.deepEqual(Object.keys(j.bilddokus).sort(), ['t1', 't2']);
  });

  await test('zwei Fenster ordnen denselben Ordner verschieden zu → Widerspruch, nichts überschrieben', async () => {
    const d = disk(datei()), a = sitzung(d), b = sitzung(d); await a.open(); await b.open();
    a.P.data.extensions.ordnerTermine = { ...a.P.data.extensions.ordnerTermine, 'Fotos B': { termin: 't1', am: 'x' } }; a.P.dirty = true;
    b.P.data.extensions.ordnerTermine = { ...b.P.data.extensions.ordnerTermine, 'Fotos B': { termin: 't2', am: 'y' } }; b.P.dirty = true;
    assert.equal(await a.flushProject(), true); const nachA = d.text();
    assert.equal(await b.flushProject(), false, 'Widerspruch'); assert.equal(d.text(), nachA);
    // gleicher Termin, nur anderer Zeitpunkt: kein Widerspruch
    const c = sitzung(d); await c.open(); const e = sitzung(d); await e.open();
    c.P.data.extensions.ordnerTermine = { ...c.P.data.extensions.ordnerTermine, 'Fotos B 20.08': { termin: 't2', am: '1' } }; c.P.dirty = true;
    e.P.data.extensions.ordnerTermine = { ...e.P.data.extensions.ordnerTermine, 'Fotos B 20.08': { termin: 't2', am: '2' } }; e.P.dirty = true;
    assert.equal(await c.flushProject(), true); assert.equal(await e.flushProject(), true);
  });

  await test('Neuaufbau aus den Fotos: Einträge eines nicht lesbaren Unterordners bleiben (R2); ohne Schutz wären sie weg', async () => {
    for (const geschuetzt of [true, false]){
      const d = disk(datei()), s = sitzung(d); await s.open();
      s.S.items = ['Bilder A/IMG_0001.jpg', 'Fotos B 20.08/IMG_0001.jpg', 'IMG_0001.jpg'].map(foto);   // „Fotos B“ fehlt beim Einlesen
      s.S.items[0].desc = 'Küche neu'; s.S.items[1].desc = 'Nachbeprobung Flur'; s.S.items[2].desc = 'direkt'; s.S.items[1].discard = true;
      s.S.view = s.S.items.slice();
      if (geschuetzt) s.S.unlesbar = new Set(['Fotos B']); else s.S.unlesbar = new Set();
      s.flushDrafts(); s.saveExtra(); s.saveDiscards(); s.saveOrder();
      assert.equal(await s.flushProject(), true);
      const b = d.json().bilder['Fotos B/IMG_0001.jpg'];
      if (geschuetzt){
        assert.deepEqual([b.beschreibung, b.probe, b.abschnitt], ['Flur', 'P1', 'EG'], 'Beschreibung, Probe, Abschnitt bleiben');
        assert.ok(d.json().reihenfolge.includes('Fotos B/IMG_0001.jpg'), 'Reihenfolge behält den Eintrag');
        assert.equal(d.json().bilder['Bilder A/IMG_0001.jpg'].beschreibung, 'Küche neu');
        assert.equal(d.json().bilder['Fotos B 20.08/IMG_0001.jpg'].aussortiert, true);
      } else assert.ok(!b || !b.beschreibung, 'Gegenprobe: ohne Schutz verliert der Neuaufbau die Beschreibung');
    }
  });

  await test('Reihenfolge: Einträge eines nicht lesbaren Unterordners bleiben an ihrem Platz, nicht ans Ende gehängt (Review #95)', async () => {
    const d = disk(datei()), s = sitzung(d); await s.open();
    const A = 'Bilder A/IMG_0001.jpg', B = 'Fotos B/IMG_0001.jpg', D = 'IMG_0001.jpg', N = 'Fotos B 20.08/IMG_0001.jpg';
    gleich(s.projGet('order', []), [A, B, D], 'Ausgang');
    s.S.unlesbar = new Set(['Fotos B']);
    s.S.items = [A, D].map(foto); s.S.view = s.S.items.slice();   // „Fotos B“ fehlt beim Einlesen
    s.saveOrder();
    gleich(s.projGet('order', []), [A, B, D], 'nichts an den gezeigten Fotos geändert → Reihenfolge genau wie vorher');
    s.S.items = [D, A, N].map(foto); s.S.view = s.S.items.slice();   // umsortiert, ein neues Foto dazu
    s.saveOrder();
    assert.equal(await s.flushProject(), true);
    assert.deepEqual(d.json().reihenfolge, [D, A, B, N], 'der Eintrag des nicht lesbaren Ordners bleibt hinter seinem bisherigen Vorgänger');
    s.S.unlesbar = new Set();   // Gegenprobe: ohne nicht lesbaren Ordner ist die Liste genau die gezeigte
    s.saveOrder(); gleich(s.projGet('order', []), [D, A, N]);
  });

  await test('Doku geändert je Termin: Änderung in Termin 2 lässt Termin 1 und die zuletzt erstellte Doku (Termin 1) aktuell', async () => {
    const d = disk(datei()), s = sitzung(d); await s.open();
    s.S.items = ['Bilder A/IMG_0001.jpg', 'Fotos B 20.08/IMG_0001.jpg'].map(foto);
    s.P.data.extensions.ordnerTermine['Fotos B 20.08'] = { termin: 't2' };
    assert.equal(s.terminVon(s.S.items[1]), 't2'); assert.equal(s.terminVon(foto('Fotos B/IMG_0001.jpg')), null, 'ohne Zuordnung: kein Termin');
    s.bilddokuVermerken(['T1.pdf'], 'Anlage 2', 't1'); await tick(); s.bilddokuVermerken(['T2.pdf'], 'Anlage 2', 't2'); await tick();
    s.bilddokuVermerken(['T1b.pdf'], 'Anlage 2', 't1'); await tick();
    const vorher = { ...s.P.data.extensions };
    s.projSet('drafts', { ...s.P.data.drafts, 'Fotos B 20.08/IMG_0001.jpg': 'geändert' });
    const e = s.P.data.extensions;
    assert.ok(e.dokuGeaendertJe.t2 > e.bilddokus.t2.erstellt, 'Doku Termin 2 veraltet');
    assert.ok(!(e.dokuGeaendertJe.t1 > e.bilddokus.t1.erstellt), 'Doku Termin 1 bleibt aktuell');
    assert.equal(e.dokuGeaendert, vorher.dokuGeaendert, 'altes Feld (zuletzt erstellte Doku = Termin 1) unberührt');
    gleich(e.bilddoku.dateien, ['T1b.pdf']); gleich(e.bilddoku.bestand, [], 'bestand: nur direkt in „Fotos“');
    gleich(e.bilddoku.bestandUnterordner, ['Bilder A/IMG_0001.jpg', 'Fotos B 20.08/IMG_0001.jpg']);
    s.projSet('meta', { anlage: 'Anlage 3' });
    assert.ok(s.P.data.extensions.dokuGeaendertJe.t1 > e.bilddokus.t1.erstellt && s.P.data.extensions.dokuGeaendert > e.bilddoku.erstellt, 'Projektdaten betreffen alle');
  });

  await test('Bestand je Termin (Review #95): neues Foto in Termin 2 macht die zuletzt erstellte Doku von Termin 1 nicht „geändert“', async () => {
    const d = disk(datei()), s = sitzung(d); await s.open();
    s.S.items = ['Bilder A/IMG_0001.jpg', 'Fotos B 20.08/IMG_0001.jpg'].map(foto);
    s.P.data.extensions.ordnerTermine['Fotos B 20.08'] = { termin: 't2' };
    s.bilddokuVermerken(['T2.pdf'], 'Anlage 2', 't2'); await tick(); s.bilddokuVermerken(['T1.pdf'], 'Anlage 2', 't1'); await tick();   // zuletzt erstellt: Termin 1
    const alt = e => !!(e.dokuGeaendert && e.dokuGeaendert > e.bilddoku.erstellt), je = (e, id) => !!(e.dokuGeaendertJe && e.dokuGeaendertJe[id] > e.bilddokus[id].erstellt);
    s.dokuBestandPruefen();
    let e = s.P.data.extensions;
    assert.deepEqual([alt(e), je(e, 't1'), je(e, 't2')], [false, false, false], 'nichts geändert: alles aktuell');
    gleich(e.bilddoku.bestandUnterordner, ['Bilder A/IMG_0001.jpg', 'Fotos B 20.08/IMG_0001.jpg'], 'bestand der zuletzt erstellten Doku nennt weiter alle Fotos (BerichtKit)');
    s.S.items.push(foto('Fotos B 20.08/IMG_0002.jpg'));   // neues Foto im Ordner von Termin 2
    s.dokuBestandPruefen(); e = s.P.data.extensions;
    assert.deepEqual([alt(e), je(e, 't1'), je(e, 't2')], [false, false, true], 'nur die Doku von Termin 2 geändert – das alte Feld (Doku Termin 1) bleibt');
    s.S.items.push(foto('Bilder A/IMG_0002.jpg'));        // neues Foto im Ordner von Termin 1
    s.dokuBestandPruefen(); e = s.P.data.extensions;
    assert.deepEqual([alt(e), je(e, 't1'), je(e, 't2')], [true, true, true], 'jetzt auch Termin 1 und damit das alte Feld');
    // zuletzt erstellt „Alle Termine“: jedes neue Foto betrifft sie (Vergleich mit allen Fotos wie bisher)
    const d2 = disk(datei()), s2 = sitzung(d2); await s2.open();
    s2.S.items = ['Bilder A/IMG_0001.jpg', 'Fotos B 20.08/IMG_0001.jpg'].map(foto);
    s2.P.data.extensions.ordnerTermine['Fotos B 20.08'] = { termin: 't2' };
    s2.bilddokuVermerken(['Alle.pdf'], 'Anlage 2', 'alle'); await tick();
    s2.S.items.push(foto('Fotos B 20.08/IMG_0002.jpg')); s2.dokuBestandPruefen();
    assert.equal(alt(s2.P.data.extensions), true, '„Alle Termine“ zuletzt erstellt: geändert');
  });

  await test('ein Termin: „Doku geändert“ wie bis 2.6.0, keine neuen Felder', async () => {
    const d = disk({ app: 'Bildumbenenner', format: 1, version: '2.6.0', projekt: {}, benennung: {}, reihenfolge: [], bilder: { 'a.jpg': { beschreibung: 'x' } } });
    const s = sitzung(d, { format: 'mosaik-projekt', version: 1, ortstermin: '2026-08-12' }); await s.open();
    s.S.items = [foto('a.jpg')];
    s.bilddokuVermerken(['D.pdf'], 'Anlage 2', 't1'); await tick();
    s.projSet('drafts', { 'a.jpg': 'y' });
    const e = s.P.data.extensions;
    assert.ok(e.dokuGeaendert > e.bilddoku.erstellt);
    gleich(Object.keys(e.bilddoku), ['dateien', 'erstellt', 'anlage', 'version', 'bestand'], 'bilddoku wie bisher');
    for (const k of ['bilddokus', 'dokuGeaendertJe', 'ordnerTermine']) assert.equal(e[k], undefined);
  });

  await test('Review #95 (1): Herkunft nach dem Umbenennen über den gemerkten Originalnamen, auch mehrfach; unsicher → „Herkunft unbekannt“', async () => {
    const ueb = [{ ordner: 'Bilder A', dateien: [{ datei: 'IMG_0001.jpg' }, { datei: 'IMG_0009.jpg' }] },
      { ordner: 'fotos ka 20.08', dateien: [{ datei: 'IMG_0001_fotos_ka_20_08.jpg', vorher: 'IMG_0001.jpg' }, { datei: 'IMG_0009.jpg' }, { datei: 'IMG_0007_Ka.jpg', vorher: 'IMG_0007.jpg' }] }];
    const d = disk({ app: 'Bildumbenenner', format: 1, version: '2.6.0', projekt: {}, benennung: {}, reihenfolge: [], fotoUebernahmen: ueb, bilder: {
      '01_Kueche.jpg': { beschreibung: 'Küche', original: { name: 'IMG_0001.jpg' } },                       // einmal umbenannt
      '02_Flur_Wand.jpg': { beschreibung: 'Flur Wand', original: { name: 'IMG_0001_fotos_ka_20_08.jpg' } },   // zweimal umbenannt (erster Name bleibt)
      '03_Keller.jpg': { original: { name: 'IMG_0009.jpg' } },                                                // Name in zwei Übernahmen
      '04_Bad.jpg': { original: { name: 'IMG_0007.jpg' } },                                                   // nur der Name vor dem Zusatz
      'IMG_0003.jpg': { beschreibung: 'nie übernommen' } } });
    const s = sitzung(d); await s.open();
    assert.ok(s.herkunftLesen, 'herkunftLesen fehlt');
    s.S.items = ['01_Kueche.jpg', '02_Flur_Wand.jpg', '03_Keller.jpg', '04_Bad.jpg', 'IMG_0003.jpg', 'Bilder B/IMG_0001.jpg'].map(foto);
    const h = s.herkunftLesen();
    gleich(Object.fromEntries([...h].map(([k, v]) => [k, v === s.HERKUNFT_UNBEKANNT ? '?' : v])),
      { '01_Kueche.jpg': 'Bilder A', '02_Flur_Wand.jpg': 'fotos ka 20.08', '03_Keller.jpg': '?', '04_Bad.jpg': 'fotos ka 20.08' });
    // ein später direkt abgelegtes Foto mit dem Namen, den ein umbenanntes schon für sich hat: nicht still zu dessen Herkunft
    s.S.items.push(foto('IMG_0001.jpg'));
    assert.equal(s.herkunftLesen().get('IMG_0001.jpg'), s.HERKUNFT_UNBEKANNT);
    assert.equal(s.herkunftLesen().get('01_Kueche.jpg'), 'Bilder A');
    assert.equal(await s.flushProject(), true); gleich(d.json().fotoUebernahmen, ueb, 'fotoUebernahmen unverändert');
  });

  await test('Review #95 (2): Termin in der Projektzentrale geändert (auch während FotoKit zu war) → nur die Doku dieses Termins geändert', async () => {
    const erstellt = { t1: '2026-11-26T10:00:00.000Z', t2: '2026-11-26T11:00:00.000Z' };
    const datei2 = { ...datei(), dokuGeaendert: '2026-11-26T09:00:00.000Z', dokuGeaendertJe: { t1: '2026-11-26T09:00:00.000Z', t2: '2026-11-26T09:00:00.000Z', alle: '2026-11-26T09:00:00.000Z' },
      bilddoku: { dateien: ['T2.pdf'], erstellt: erstellt.t2, anlage: 'Anlage 2', version: '2.7.0', bestand: [], termin: 't2' },
      bilddokus: { t1: { dateien: ['T1.pdf'], erstellt: erstellt.t1, termin: { datum: '2026-08-12', bezeichnung: '' } }, t2: { dateien: ['T2.pdf'], erstellt: erstellt.t2, termin: { datum: '2026-08-20', bezeichnung: 'Nachbeprobung' } } } };
    const pj = { ...ZWEI, weitereOrtstermine: [{ id: 't2', datum: '2026-08-21', bezeichnung: 'Nachbeprobung', wer: '' }] };   // Datum von t2 geändert, FotoKit war zu
    const d = disk(datei2), s = sitzung(d, pj); await s.open();
    s.dokuTerminPruefen();   // wie beim Einlesen
    let e = s.P.data.extensions;
    assert.ok(e.dokuGeaendertJe.t2 > erstellt.t2, 'Doku Termin 2 geändert');
    assert.equal(e.dokuGeaendertJe.t1, '2026-11-26T09:00:00.000Z', 'Termin 1 unberührt');
    assert.ok(e.dokuGeaendert > erstellt.t2, 'zuletzt erstellte Doku (t2) auch für BerichtKit geändert');
    gleich(s.S.dokuTerminAnders.map(x => x.id), ['t2']);
    assert.equal(d.json().dokuGeaendertJe.t2, '2026-11-26T09:00:00.000Z', 'nur im Speicher – erst mit dem nächsten Speichern in der Datei');
    // Termin 1: Bezeichnung in der Projektzentrale geändert → nur t1; das alte Feld bleibt (zuletzt erstellt ist t2)
    const d1 = disk(datei2), s1 = sitzung(d1, { ...ZWEI, ortsterminBezeichnung: 'Erstbegehung' }); await s1.open();
    s1.dokuTerminPruefen(); e = s1.P.data.extensions;
    assert.ok(e.dokuGeaendertJe.t1 > erstellt.t1); assert.equal(e.dokuGeaendertJe.t2, '2026-11-26T09:00:00.000Z'); assert.equal(e.dokuGeaendert, '2026-11-26T09:00:00.000Z');
    // unverändert: nichts
    const d0 = disk(datei2), s0 = sitzung(d0); await s0.open(); s0.dokuTerminPruefen();
    gleich(s0.P.data.extensions.dokuGeaendertJe, datei2.dokuGeaendertJe); gleich(s0.S.dokuTerminAnders, []);
  });

  const mitDokus = (zuletzt, termin) => ({ ...datei(), dokuGeaendert: '2026-11-26T09:00:00.000Z',
    dokuGeaendertJe: { t1: '2026-11-26T09:00:00.000Z', t2: '2026-11-26T09:00:00.000Z', t3: '2026-11-26T09:00:00.000Z', alle: '2026-11-26T09:00:00.000Z' },
    ordnerTermine: { 'Fotos B 20.08': { termin: 't2', am: '2026-11-26T08:00:00.000Z', vorschlag: 'datum-im-namen' } },
    bilddoku: { dateien: [zuletzt + '.pdf'], erstellt: '2026-11-26T12:00:00.000Z', anlage: 'Anlage 2', version: '2.7.0', bestand: [], termin },
    bilddokus: { t1: { dateien: ['T1.pdf'], erstellt: '2026-11-26T10:00:00.000Z', termin: { datum: '2026-08-12', bezeichnung: '' } },
      t2: { dateien: ['T2.pdf'], erstellt: '2026-11-26T11:00:00.000Z', termin: { datum: '2026-08-20', bezeichnung: 'Nachbeprobung' } },
      t3: { dateien: ['T3.pdf'], erstellt: '2026-11-26T12:00:00.000Z', termin: { datum: '2026-09-03', bezeichnung: '' } } } });
  const EINER = { format: 'mosaik-projekt', version: 1, ortstermin: '2026-08-12', ortsterminZaehler: 3 };

  await test('Review #95 (3): letzter weiterer Termin entfernt (wieder ein Termin) → Doku t2 geändert, Eintrag bleibt, Hinweis „entfernt“', async () => {
    const f = mitDokus('T2', 't2'); delete f.bilddokus.t3;
    const d = disk(f), s = sitzung(d, EINER); await s.open();
    s.dokuTerminPruefen();
    const e = s.P.data.extensions;
    assert.ok(e.dokuGeaendertJe.t2 > f.bilddokus.t2.erstellt, 'Doku des entfernten Termins geändert');
    assert.ok(e.dokuGeaendert > f.bilddoku.erstellt, 'zuletzt erstellte (t2) auch für BerichtKit geändert');
    assert.equal(e.dokuGeaendertJe.t1, '2026-11-26T09:00:00.000Z', 'Termin 1 unberührt');
    gleich(e.bilddokus.t2, f.bilddokus.t2, 'Eintrag bleibt unter seiner Kennung (O12)'); gleich(e.ordnerTermine, f.ordnerTermine);
    gleich(s.S.dokuTerminAnders, [{ id: 't2', entfernt: true, datum: '2026-08-20' }]);
    assert.equal(d.json().dokuGeaendertJe.t2, '2026-11-26T09:00:00.000Z', 'nur im Speicher');
    // neue Doku bei einem Termin: ohne Frage für Termin 1, bilddokus.t1 mitgeführt; der Hinweis zum entfernten Termin entfällt (nicht mehr die zuletzt erstellte)
    s.bilddokuVermerken(['Neu.pdf'], 'Anlage 2');
    const e2 = s.P.data.extensions;
    assert.equal(e2.bilddoku.termin, 't1'); gleich(e2.bilddokus.t1.dateien, ['Neu.pdf']); gleich(e2.bilddokus.t1.termin, { datum: '2026-08-12', bezeichnung: '' });
    gleich(e2.bilddokus.t2, f.bilddokus.t2); assert.ok(e2.dokuGeaendertJe.t2 > e2.bilddokus.t2.erstellt, 't2 bleibt geändert');
    gleich(s.S.dokuTerminAnders, []);
  });

  await test('Review #95 (4): t2 und t3, Doku für t3, t3 entfernt → nur t3 geändert', async () => {
    const f = mitDokus('T3', 't3'), d = disk(f), s = sitzung(d, { ...ZWEI, ortsterminZaehler: 3 }); await s.open();
    s.dokuTerminPruefen();
    const e = s.P.data.extensions;
    assert.ok(e.dokuGeaendertJe.t3 > f.bilddokus.t3.erstellt, 't3 geändert'); assert.ok(e.dokuGeaendert > f.bilddoku.erstellt);
    assert.equal(e.dokuGeaendertJe.t1, '2026-11-26T09:00:00.000Z'); assert.equal(e.dokuGeaendertJe.t2, '2026-11-26T09:00:00.000Z');
    gleich(s.S.dokuTerminAnders, [{ id: 't3', entfernt: true, datum: '2026-09-03' }]);
    gleich(e.bilddokus.t3, f.bilddokus.t3);
    // nicht die zuletzt erstellte: geändert vermerkt, aber kein Dauer-Hinweis
    const f2 = mitDokus('T2', 't2'), s2 = sitzung(disk(f2), { ...ZWEI, ortsterminZaehler: 3 }); await s2.open(); s2.dokuTerminPruefen();
    assert.ok(s2.P.data.extensions.dokuGeaendertJe.t3 > f2.bilddokus.t3.erstellt); assert.equal(s2.P.data.extensions.dokuGeaendert, '2026-11-26T09:00:00.000Z');
    gleich(s2.S.dokuTerminAnders, []);
  });

  console.log(`OK Unterordner: ${n} Fälle bestanden.`);
})().catch(e => { console.error(e); process.exit(1); });
