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
    teil('let draftTimer;', 'let thumbQueue') + '\n' + teil('function saveOrder(names){', '/* ---------- rows ---------- */') +
    '\nfunction applyMergedToItems(){}\nthis.api = { P, S, projSet, projGet, flushProject, loadProject, projToJson, projFromJson, mergeExternal, flushDrafts, saveExtra, saveDiscards, saveOrder, dokuGeaendert, bilddokuVermerken, terminVon };', ctx);
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

  console.log(`OK Unterordner: ${n} Fälle bestanden.`);
})().catch(e => { console.error(e); process.exit(1); });
