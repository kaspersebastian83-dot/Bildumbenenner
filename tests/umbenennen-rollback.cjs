// Umbenennen: Rücksetzen nach einem Fehler in Phase 2 auch bei getauschten Nummern (Kreis 01→03, 02→01, 03→02),
// Kopiermodus hinterlässt keine doppelte Datei, wenn das Original nicht entfernt werden kann. Node, synthetischer Ordner.
// node tests/umbenennen-rollback.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const a = html.indexOf('async function exists(dir, name)'), b = html.indexOf('const moveBetween =');
assert.ok(a > 0 && b > a, 'Block exists … runPairs in index.html');

function welt(start){
  const files = new Map(Object.entries(start)), locked = new Set(), noMove = new Set(), noCreate = new Set();
  const err = (name, msg) => Object.assign(new Error(msg), { name });
  const dir = {
    async getFileHandle(n, o = {}){
      if (!files.has(n)){
        if (!o.create) throw err('NotFoundError', 'fehlt');
        if (noCreate.has(n)) throw err('NoModificationAllowedError', 'Anlegen verweigert');
        files.set(n, '');
      }
      return { name: n,
        async move(to){
          if (locked.has(n) || noMove.has(n)) throw err('NoModificationAllowedError', 'gesperrt');
          if (files.has(to)) throw err('InvalidModificationError', 'existiert');
          files.set(to, files.get(n)); files.delete(n);
        },
        async getFile(){ const v = files.get(n); return { size: v.length, v, arrayBuffer: async () => new TextEncoder().encode(v).buffer }; },
        async createWritable(){ let buf = ''; return { async write(f){ buf = f.v; }, async close(){ files.set(n, buf); }, async abort(){} }; } };
    },
    async removeEntry(n){ if (locked.has(n)) throw err('NoModificationAllowedError', 'Datei gesperrt'); files.delete(n); }
  };
  const ctx = { S: { dir }, P: { readOnly: false }, TMP_PREFIX: 'umb-tmp_', extOf: n => n.slice(n.lastIndexOf('.')),
    PROTECTED_PROJECT: 'x', navigator: { userAgent: '' }, Date, Error, TypeError, TextEncoder, Uint8Array };
  vm.runInNewContext('function assertOriginalsWritable(){}\n' + html.slice(a, b) + ';this.runPairs = runPairs; this.renameFile = renameFile;', ctx);
  return { ...ctx, files, locked, noMove, noCreate, dir, stand: () => Object.fromEntries([...files].sort()) };
}
const START = { '01_Kueche.jpg': 'A', '02_Kueche.jpg': 'B', '03_Kueche.jpg': 'C', 'IMG_9.jpg': 'D' };
// erstes Foto ans Ende gezogen: 02→01, 03→02, 01→03; dazu IMG_9 → 04_Flur
const PAIRS = [{ from: '02_Kueche.jpg', to: '01_Kueche.jpg' }, { from: '03_Kueche.jpg', to: '02_Kueche.jpg' },
               { from: '01_Kueche.jpg', to: '03_Kueche.jpg' }, { from: 'IMG_9.jpg', to: '04_Flur.jpg' }];

(async () => {
  { // Phase 2 scheitert am 4. Paar, nachdem der Kreis schon umbenannt ist → alles wieder wie vorher
    const w = welt(START);
    let steps = 0;
    await assert.rejects(() => w.runPairs(PAIRS, () => { if (++steps === 4) for (const k of w.files.keys()) if (k.startsWith('umb-tmp_') && w.files.get(k) === 'D') { w.noMove.add(k); w.noCreate.add('04_Flur.jpg'); } }),
      e => !/nicht zurückbenannt/.test(e.message));
    assert.deepEqual(w.stand(), START, 'Kreis vollständig zurückgesetzt, keine Hilfsnamen übrig');
  }
  { // Hilfsdatei bleibt gesperrt: Kreis zurück, keine doppelte Kopie, Fehler nennt die nicht zurückbenannte Datei
    const w = welt(START);
    let steps = 0;
    await assert.rejects(() => w.runPairs(PAIRS, () => { if (++steps === 4) for (const k of w.files.keys()) if (k.startsWith('umb-tmp_') && w.files.get(k) === 'D') w.locked.add(k); }),
      /1 Datei\(en\) konnten nicht zurückbenannt werden, z\. B\. „umb-tmp_/);
    const s = w.stand();
    assert.deepEqual([s['01_Kueche.jpg'], s['02_Kueche.jpg'], s['03_Kueche.jpg']], ['A', 'B', 'C'], 'getauschte Nummern zurück');
    assert.equal(Object.values(s).filter(v => v === 'D').length, 1, 'Foto D genau einmal (keine Kopie unter 04_Flur oder IMG_9)');
    assert.ok(!('04_Flur.jpg' in s) && !('IMG_9.jpg' in s));
  }
  { // Kopiermodus: Original lässt sich nicht entfernen → Kopie wird wieder gelöscht, Original bleibt
    const w = welt({ 'IMG_1.jpg': 'X' });
    w.noMove.add('IMG_1.jpg'); w.locked.add('IMG_1.jpg');
    await assert.rejects(() => w.renameFile(w.dir, 'IMG_1.jpg', '01_Flur.jpg'), /gesperrt/);
    assert.deepEqual(w.stand(), { 'IMG_1.jpg': 'X' });
  }
  { // Kopiermodus: Entfernen scheitert und die Nachprüfung selbst schlägt fehl (z. B. Berechtigung entzogen) → kein Erfolg melden, Kopie weg
    const w = welt({ 'IMG_2.jpg': 'Y' });
    w.noMove.add('IMG_2.jpg'); w.locked.add('IMG_2.jpg');
    const get = w.dir.getFileHandle.bind(w.dir); let entfernt = false;
    const rm = w.dir.removeEntry.bind(w.dir);
    w.dir.removeEntry = async n => { if (n === 'IMG_2.jpg'){ entfernt = true; throw Object.assign(new Error('Datei gesperrt'), { name: 'NoModificationAllowedError' }); } return rm(n); };
    w.dir.getFileHandle = async (n, o) => { if (entfernt && n === 'IMG_2.jpg' && !(o && o.create)) throw Object.assign(new Error('keine Berechtigung'), { name: 'NotAllowedError' }); return get(n, o); };
    await assert.rejects(() => w.renameFile(w.dir, 'IMG_2.jpg', '02_Flur.jpg'), /gesperrt/);
    assert.deepEqual(w.stand(), { 'IMG_2.jpg': 'Y' }, 'keine doppelte Datei');
  }
  { // Kopiermodus: Kopie gleich groß, aber anderer Inhalt (Audit F04) → Fehler, Original bleibt, nichts gelöscht
    const w = welt({ 'IMG_3.jpg': 'QRST' });
    w.noMove.add('IMG_3.jpg');
    const get = w.dir.getFileHandle.bind(w.dir);
    w.dir.getFileHandle = async (n, o) => { const h = await get(n, o); if (n !== '03_Flur.jpg') return h; return { ...h, async createWritable(){ return { async write(){}, async close(){ w.files.set(n, 'QRSX'); }, async abort(){} }; } }; };
    await assert.rejects(() => w.renameFile(w.dir, 'IMG_3.jpg', '03_Flur.jpg'), /stimmt nicht mit dem Original/);
    assert.equal(w.files.get('IMG_3.jpg'), 'QRST', 'Original unverändert da');
    assert.equal(w.files.get('03_Flur.jpg'), 'QRSX', 'abweichende Kopie bleibt zur Prüfung liegen');
  }
  { // Ein anderer Rechner legt dasselbe Ziel zwischen Prüfung und Schreiben an (Audit F04) → sein Foto bleibt, unser Original auch
    const w = welt({ 'IMG_5.jpg': 'MEIN' });
    w.noMove.add('IMG_5.jpg');
    const get = w.dir.getFileHandle.bind(w.dir);
    w.dir.getFileHandle = async (n, o) => { const h = await get(n, o); if (n !== '05_Flur.jpg' || !(o && o.create)) return h; w.files.set(n, 'FREMD'); return h; };
    await assert.rejects(() => w.renameFile(w.dir, 'IMG_5.jpg', '05_Flur.jpg'), /anderen Rechner angelegt/);
    assert.deepEqual(w.stand(), { '05_Flur.jpg': 'FREMD', 'IMG_5.jpg': 'MEIN' }, 'nichts überschrieben, nichts gelöscht');
  }
  { // Zwei Umbenennungen nacheinander, nicht verschränkt: mit Web Locks läuft jede Übertragung unter „fotokit:originale“
    const w = welt({ 'IMG_4.jpg': 'U' }), namen = [];
    w.navigator.locks = { request: async (name, fn) => { namen.push(name); return fn(); } };
    await w.renameFile(w.dir, 'IMG_4.jpg', '04_Flur.jpg');
    assert.deepEqual(namen, ['fotokit:originale']); assert.deepEqual(w.stand(), { '04_Flur.jpg': 'U' });
  }
  console.log('OK Umbenennen: Rücksetzen bei getauschten Nummern, gesperrte Datei gemeldet, keine doppelte Kopie, abweichende Kopie erkannt');
})().catch(e => { console.error(e); process.exitCode = 1; });
