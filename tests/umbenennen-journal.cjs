// FotoKit 1.33.0 – Journal für Umbenennen: ein unterbrochener Lauf (Browser/RDP beendet) wird beim nächsten Öffnen zurückgesetzt.
//  • Journal steht vor dem ersten verschobenen Foto im Datenordner (geprüft zurückgelesen); ohne Journal wird nichts verändert
//  • Phase 1 / Phase 2 (auch bei getauschten Nummern, Kreis 01→03, 02→01, 03→02) / fertig mit Datenstand / „hängt“ / unlesbar / ohne Journal
//  • sauberes Zurücksetzen im Lauf löscht das Journal; hängende Dateien lassen es stehen
// node tests/umbenennen-journal.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const a = html.indexOf('async function exists(dir, name)'), b = html.indexOf('const moveBetween =');
assert.ok(a > 0 && b > a, 'Block exists … umbenennenPruefen in index.html');

function welt(start, opts = {}){
  const files = new Map(Object.entries(start)), noCreate = new Set(), noMove = new Set(), locked = new Set();
  const w = { dead: false, moves: 0, crashNach: Infinity, vorMove: null };
  const err = (name, msg) => Object.assign(new Error(msg), { name });
  const lebt = () => { if (w.dead) throw err('InvalidStateError', 'Rechner aus'); };
  const dir = {
    name: opts.name || 'Fotos',
    async getFileHandle(n, o = {}){
      lebt();
      if (!files.has(n)){
        if (!o.create) throw err('NotFoundError', 'fehlt');
        if (noCreate.has(n)) throw err('NoModificationAllowedError', 'Anlegen verweigert');
        files.set(n, '');
      }
      return { name: n, kind: 'file',
        async move(to){
          lebt();
          if (noMove.has(n) || locked.has(n)) throw err('NoModificationAllowedError', 'gesperrt');
          if (files.has(to)) throw err('InvalidModificationError', 'existiert');
          if (w.vorMove) w.vorMove(n, to);
          files.set(to, files.get(n)); files.delete(n);
          if (++w.moves >= w.crashNach) w.dead = true;   // Stromausfall nach dem n-ten Verschieben
        },
        async getFile(){ lebt(); const v = files.get(n); return { size: v.length, v, arrayBuffer: async () => new TextEncoder().encode(v).buffer }; },
        async createWritable(){ lebt(); let buf = ''; return { async write(f){ buf = typeof f === 'string' ? f : f.v; }, async close(){ lebt(); files.set(n, buf); }, async abort(){} }; } };
    },
    async removeEntry(n){ lebt(); if (!files.has(n)) throw err('NotFoundError', 'fehlt'); if (locked.has(n)) throw err('NoModificationAllowedError', 'gesperrt'); files.delete(n); },
    async *values(){ lebt(); for (const n of [...files.keys()].sort()) yield { kind: 'file', name: n }; }
  };
  const ctx = { S: { dir, data: opts.data || dir }, P: { readOnly: !!opts.readOnly, data: { extensions: opts.extensions || {} } }, TMP_PREFIX: 'umb-tmp_', extOf: n => n.slice(n.lastIndexOf('.')),
    PROTECTED_PROJECT: 'geschützt', navigator: { userAgent: '' }, Date, Error, TypeError, TextEncoder, TextDecoder, Uint8Array, JSON, Set, Map, Number,
    fmtDate: d => `${d.getUTCDate()}.${d.getUTCMonth() + 1}.${d.getUTCFullYear()}`, fmtTime: d => `${d.getUTCHours()}:${String(d.getUTCMinutes()).padStart(2, '0')}`,
    esc: x => String(x), APP_VERSION: '1.33.0' };
  vm.runInNewContext('function assertOriginalsWritable(){ if (P.readOnly) throw new Error(PROTECTED_PROJECT); }\n' + html.slice(a, b) +
    ';this.runPairs = runPairs; this.umbenennenPruefen = umbenennenPruefen; this.journalWeg = journalWeg;', ctx);
  return { ...ctx, files, noCreate, noMove, locked, dir, w, stand: () => Object.fromEntries([...files].sort()),
    fotos: () => Object.fromEntries([...files].filter(([k]) => !k.startsWith('_Umbenennen-Journal_')).sort()),
    journal: () => [...files.keys()].filter(k => k.startsWith('_Umbenennen-Journal_')).sort() };
}
const START = { '01_Kueche.jpg': 'A', '02_Kueche.jpg': 'B', '03_Kueche.jpg': 'C', 'IMG_9.jpg': 'D' };
// Kreis 02→01, 03→02, 01→03 und ein neuer Name – 4 Fotos, 8 Verschiebungen
const PAIRS = [{ from: '02_Kueche.jpg', to: '01_Kueche.jpg' }, { from: '03_Kueche.jpg', to: '02_Kueche.jpg' },
               { from: '01_Kueche.jpg', to: '03_Kueche.jpg' }, { from: 'IMG_9.jpg', to: '04_Flur.jpg' }];
const ENDE = { '01_Kueche.jpg': 'B', '02_Kueche.jpg': 'C', '03_Kueche.jpg': 'A', '04_Flur.jpg': 'D' };
const JR = j => ({ journal: j });

(async () => {
  { // Journal steht vor dem ersten Verschieben im Datenordner; nach dem Lauf Journal + Phase-2-Marke, Löschen räumt alles weg
    const w = welt(START); let vorErstem = null;
    w.w.vorMove = () => { if (vorErstem === null) vorErstem = w.journal(); };
    const jr = await w.runPairs(PAIRS, () => {}, { dir: w.dir, ordner: 'Fotos', art: 'umbenennen' });
    assert.equal(vorErstem.length, 1, 'Journal vor dem ersten Foto geschrieben');
    assert.deepEqual(w.fotos(), ENDE, 'Endnamen');
    const j = JSON.parse(w.files.get(vorErstem[0]));
    assert.equal(j.app, 'FotoKit'); assert.equal(j.lauf, 'umbenennen'); assert.equal(j.paare.length, 4);
    assert.deepEqual(j.paare.map(p => [p.von, p.nach]), PAIRS.map(p => [p.from, p.to]));
    assert.ok(j.paare.every(p => p.vorlaeufig.startsWith('umb-tmp_')));
    assert.ok([...w.files.keys()].includes(jr.name.replace(/\.json$/, '.phase2')), 'Marke Phase 2 nach Schritt 1');
    await w.journalWeg(jr);
    assert.deepEqual(w.stand(), ENDE, 'Journal und Marke weg, sonst nichts');
  }
  { // Journal lässt sich nicht anlegen → nichts verändert
    const w = welt(START);
    w.noCreate.add('_Umbenennen-Journal_x.json');
    const orig = w.dir.getFileHandle.bind(w.dir);
    w.dir.getFileHandle = (n, o) => { if (/^_Umbenennen-Journal_/.test(n) && o && o.create) return Promise.reject(Object.assign(new Error('Anlegen verweigert'), { name: 'NoModificationAllowedError' })); return orig(n, o); };
    await assert.rejects(() => w.runPairs(PAIRS, () => {}, { dir: w.dir, ordner: 'Fotos' }), /Anlegen verweigert/);
    assert.deepEqual(w.stand(), START, 'kein Foto angefasst, kein Journal');
  }
  { // sauberes Zurücksetzen im Lauf (Phase 2 scheitert am 4. Foto) → Journal weg
    const w = welt(START); let steps = 0;
    await assert.rejects(() => w.runPairs(PAIRS, () => { if (++steps === 4){ for (const k of w.files.keys()) if (k.startsWith('umb-tmp_') && w.files.get(k) === 'D') w.noMove.add(k); w.noCreate.add('04_Flur.jpg'); } },
      { dir: w.dir, ordner: 'Fotos' }), /Anlegen verweigert/);
    assert.deepEqual(w.stand(), START, 'alles zurück, kein Journal, keine Marke, keine Hilfsnamen');
  }
  { // Phase 2 scheitert, Zurücksetzen hängt an gesperrter Datei → Journal bleibt (Marke „hängt“ statt „phase2“)
    const w = welt(START); let steps = 0;
    await assert.rejects(() => w.runPairs(PAIRS, () => { if (++steps === 4){ for (const k of w.files.keys()) if (k.startsWith('umb-tmp_') && w.files.get(k) === 'D') w.locked.add(k); } },
      { dir: w.dir, ordner: 'Fotos' }), /nicht zurückbenannt/);
    const j = w.journal().filter(k => k.endsWith('.json')), marken = [...w.files.keys()].filter(k => /\.(phase2|haengt)$/.test(k));
    assert.equal(j.length, 1, 'Journal bleibt'); assert.deepEqual(marken.map(k => k.split('.').pop()), ['haengt'], 'nur die Marke „hängt“');
  }
  // ---- Abbruch mitten im Lauf („Rechner aus“) und Öffnen danach ----
  async function abbruch(nachVerschiebungen, extra = {}){
    const w = welt(START, extra);
    w.w.crashNach = nachVerschiebungen;
    await assert.rejects(() => w.runPairs(PAIRS, () => {}, { dir: w.dir, ordner: 'Fotos', art: 'umbenennen' }));
    w.w.dead = false; w.w.crashNach = Infinity; w.w.moves = 0;
    return w;
  }
  for (const [n, was] of [[1, 'Phase 1, 1 Foto verschoben'], [3, 'Phase 1, 3 Fotos'], [4, 'Phase 1 fertig, Marke fehlt noch'], [5, 'Phase 2, 1 Foto am Ziel'], [6, 'Phase 2, 2 Fotos'], [7, 'Phase 2, 3 Fotos'], [8, 'alle am Ziel, Journal noch da']]){
    const w = await abbruch(n);
    assert.ok(w.journal().length >= 1, `${was}: Journal vorhanden`);
    const hinweis = await w.umbenennenPruefen();
    assert.deepEqual(w.stand(), START, `${was}: alle Fotos wieder unter den alten Namen, Journal und Marken weg`);
    if (n >= 1) assert.match(hinweis, /zurückgesetzt/, `${was}: Hinweis`);
  }
  { // alle am Ziel, Datenstand schon gespeichert („umbenennenFertig“) → Namen bleiben, Journal weg
    const w0 = await abbruch(8), stempel = w0.journal().find(k => k.endsWith('.json')).match(/_([0-9a-z]+)\.json$/)[1];
    const w = welt(START);
    for (const [k, v] of w0.files) w.files.set(k, v); for (const k of [...w.files.keys()]) if (!w0.files.has(k)) w.files.delete(k);
    w.P.data.extensions.umbenennenFertig = stempel;
    const hinweis = await w.umbenennenPruefen();
    assert.equal(hinweis, '', 'kein Hinweis');
    assert.deepEqual(w.stand(), ENDE, 'neue Namen bleiben, Journal und Marken weg');
  }
  { // Phase-2-Zustand mit fremdem Stempel zählt nicht: anderer Datenstand → zurücksetzen
    const w = await abbruch(8); w.P.data.extensions.umbenennenFertig = 'andererlauf';
    await w.umbenennenPruefen(); assert.deepEqual(w.stand(), START);
  }
  { // geschützter Projektmodus: nichts anfassen, Hinweis
    const w = await abbruch(6); w.P.readOnly = true; const vorher = w.stand();
    const hinweis = await w.umbenennenPruefen();
    assert.deepEqual(w.stand(), vorher); assert.match(hinweis, /geschützten Projektmodus/);
  }
  { // Zurücksetzen scheitert an einem Foto → Journal bleibt, beim nächsten Öffnen klappt es (nur vorläufige Namen, Endnamen unberührt)
    const w = await abbruch(6);
    const tmp = [...w.files.keys()].filter(k => k.startsWith('umb-tmp_'));
    w.locked.add(tmp[0]);
    const h1 = await w.umbenennenPruefen();
    assert.match(h1, /nicht vollständig zurücksetzen/); assert.ok(w.journal().some(k => k.endsWith('.json')), 'Journal bleibt');
    assert.ok(w.journal().some(k => k.endsWith('.haengt')), 'Marke „hängt“ gesetzt');
    w.locked.delete(tmp[0]);
    const h2 = await w.umbenennenPruefen();
    assert.deepEqual(w.stand(), START, 'zweiter Versuch: alles zurück'); assert.match(h2, /zurückgesetzt/);
  }
  { // „hängt“: Endnamen werden nicht angefasst – Foto 0 liegt noch unter seinem Endnamen, Foto 1 unter vorläufigem Namen
    const w = welt({ 'b.jpg': 'X', 'umb-tmp_x_1.jpg': 'Y' });
    const j = { app: 'FotoKit', art: 'umbenennen-journal', format: 1, stempel: 'x', am: '2026-10-31T10:00:00Z', ordner: 'Fotos',
      paare: [{ von: 'a.jpg', vorlaeufig: 'umb-tmp_x_0.jpg', nach: 'b.jpg' }, { von: 'c.jpg', vorlaeufig: 'umb-tmp_x_1.jpg', nach: 'd.jpg' }] };
    w.files.set('_Umbenennen-Journal_x.json', JSON.stringify(j)); w.files.set('_Umbenennen-Journal_x.haengt', '');
    const hinweis = await w.umbenennenPruefen();
    assert.equal(w.files.get('c.jpg'), 'Y', 'vorläufiges Foto zurück auf seinen alten Namen'); assert.equal(w.files.get('b.jpg'), 'X', 'Endname unberührt');
    assert.match(hinweis, /nicht vollständig zurücksetzen/); assert.match(hinweis, /„a\.jpg“ liegt nicht im Ordner \(vielleicht noch unter „b\.jpg“/);
    assert.ok(w.files.has('_Umbenennen-Journal_x.json'), 'Journal bleibt');
  }
  { // alter Name inzwischen von einem anderen Foto belegt → nichts überschrieben, Journal bleibt
    const w = welt({ 'umb-tmp_x_0.jpg': 'Y', 'a.jpg': 'FREMD' });
    const j = { app: 'FotoKit', art: 'umbenennen-journal', format: 1, stempel: 'x', am: '2026-10-31T10:00:00Z', ordner: 'Fotos', paare: [{ von: 'a.jpg', vorlaeufig: 'umb-tmp_x_0.jpg', nach: 'b.jpg' }] };
    w.files.set('_Umbenennen-Journal_x.json', JSON.stringify(j));
    const hinweis = await w.umbenennenPruefen();
    assert.equal(w.files.get('a.jpg'), 'FREMD'); assert.equal(w.files.get('umb-tmp_x_0.jpg'), 'Y'); assert.match(hinweis, /nicht vollständig zurücksetzen/);
    assert.ok(w.files.has('_Umbenennen-Journal_x.json'));
  }
  { // Journal unlesbar / ungültig: bleibt liegen, Hinweis, nichts verändert
    const w = welt({ ...START, '_Umbenennen-Journal_kaputt.json': '{ nicht json', '_Umbenennen-Journal_zwei.json': JSON.stringify({ app: 'FotoKit', art: 'umbenennen-journal', format: 1, stempel: 'zwei', paare: [{ von: '../x.jpg', vorlaeufig: 'umb-tmp_z.jpg', nach: 'y.jpg' }] }) });
    const hinweis = await w.umbenennenPruefen();
    assert.equal((hinweis.match(/nicht lesbar oder nicht gültig/g) || []).length, 2); assert.deepEqual(w.fotos(), START);
    assert.equal(w.journal().length, 2, 'beide bleiben liegen');
  }
  { // vorläufige Namen ohne Journal (vor 1.33 unterbrochen): Hinweis, nichts angefasst
    const w = welt({ ...START, 'umb-tmp_abc_0.jpg': 'X', 'umb-tmp_abc_1.jpg': 'Y' });
    const hinweis = await w.umbenennenPruefen();
    assert.match(hinweis, /2 Dateien mit vorläufigem Namen/); assert.equal(w.files.get('umb-tmp_abc_0.jpg'), 'X');
  }
  { // Marke ohne Journal (abgebrochenes Aufräumen) wird weggeräumt; Ordner ohne Journal: kein Hinweis
    const w = welt({ ...START, '_Umbenennen-Journal_q.phase2': '' });
    assert.equal(await w.umbenennenPruefen(), ''); assert.deepEqual(w.stand(), START);
  }
  { // Datenordner ≠ Fotoordner (_Spektron/FotoKit): Journal liegt dort, Fotos im Fotoordner
    const daten = welt({}, { name: 'FotoKit' }), foto = welt(START);
    foto.S.data = daten.dir;
    // Rechner aus = auch der Datenordner ist weg (sonst schriebe der Lauf nach dem „Absturz“ noch die Marke „hängt“)
    for (const m of ['getFileHandle', 'removeEntry']){ const orig = daten.dir[m].bind(daten.dir); daten.dir[m] = (...x) => foto.w.dead ? Promise.reject(new Error('Rechner aus')) : orig(...x); }
    foto.w.crashNach = 6;
    await assert.rejects(() => foto.runPairs(PAIRS, () => {}, { dir: daten.dir, ordner: 'Fotos' }));
    foto.w.dead = false; foto.w.crashNach = Infinity;
    assert.equal(daten.journal().filter(k => k.endsWith('.json')).length, 1, 'Journal im Datenordner'); assert.equal(foto.journal().length, 0, 'nicht im Fotoordner');
    await foto.umbenennenPruefen();
    assert.deepEqual(foto.stand(), START); assert.deepEqual(daten.stand(), {}, 'Datenordner aufgeräumt');
  }
  console.log('umbenennen-journal: ok');
})().catch(e => { console.error(e); process.exit(1); });
