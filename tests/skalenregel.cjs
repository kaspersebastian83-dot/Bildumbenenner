// Skalenregel wie PlanKit: VdS-Referenz bei gewählter Nutzung (auch in PlanKit angepasst), sonst eigene Skala. node tests/skalenregel.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const a = html.indexOf('const scaleKey = '), b = html.indexOf('async function loadSkalenregel(');
assert.ok(a > 0 && b > a, 'Block Skalenregel in index.html');
const own = { 'Summe 16 EPA-PAK exkl. BG|µg/100 cm²': { name: 'eigene PAK-Skala', cats: [{ name: 'gering', from: 0 }, { name: 'hoch', from: 5 }] },
              'Kohlenwasserstoffe C10-C40|mg/kg TS': { name: 'eigene MKW-Skala', cats: [{ name: 'gering', from: 0 }, { name: 'erhöht', from: 1000 }] } };
const ctx = { store: { get: () => JSON.parse(JSON.stringify(own)) } };
vm.runInNewContext(html.slice(a, b) + '\nthis.SK = SK; this.skalaFuer = skalaFuer;', ctx);
const { SK, skalaFuer } = ctx, PAK = 'Summe 16 EPA-PAK exkl. BG', MKW = 'Kohlenwasserstoffe C10-C40';

assert.equal(skalaFuer(PAK, 'µg/100 cm²').scale.name, 'eigene PAK-Skala', 'ohne Nutzung: eigene Skala');
SK.usage = 'residential';
const v = skalaFuer(PAK, 'µg/100 cm²');
assert.match(v.scale.name, /^VdS 2357 · Wohn-\/Büroräume/); assert.equal(v.scale.cats[1].from, 0.1, '10 µg/m² = 0,1 µg/100 cm²'); assert.equal(v.angepasst, false);
assert.equal(skalaFuer(PAK, 'µg/m²').scale.cats[1].from, 10);
SK.usage = 'industrial'; assert.equal(skalaFuer(PAK, 'µg/m²').scale.cats[1].from, 100);
assert.equal(skalaFuer(MKW, 'mg/kg TS').scale.name, 'eigene MKW-Skala', 'keine VdS-Referenz für MKW: eigene Skala auch bei gewählter Nutzung');
assert.equal(skalaFuer('Benzo[a]pyren', 'µg/m²').scale, null, 'keine erfunden');
SK.vds = { [`${PAK}|µg/m²`]: { name: 'VdS angepasst', cats: [{ name: 'a', from: 0, color: '#4caf50' }, { name: 'b', from: 20, color: '#e0453a' }] } };
const ang = skalaFuer(PAK, 'µg/m²'); assert.equal(ang.angepasst, true); assert.equal(ang.scale.cats[1].from, 20, 'in PlanKit angepasste Referenz gilt');
SK.nutzung = 'Gesundheit & Labor'; SK.usage = 'residential'; SK.vds = {}; assert.match(skalaFuer(PAK, 'µg/m²').scale.name, /Gesundheit & Labor/);
assert.ok(html.includes("chloridSkala(r.p1, u) ? 'gilt für Chlorid unabhängig von der Nutzung'"), 'Hinweis bei Chlorid ohne Nutzung');
assert.ok(/const scale = g\.unit \? skalaFuer\(p1, g\.unit\)\.scale : null;/.test(html), 'Ergebnistabelle nutzt die Regel');
// Chlorid nach VdS 2357 (5–10 µg/cm², KORROSION-CHLORID v1): ohne Nutzung, Grenzen in die Berichtseinheit umgerechnet
ctx.SK.usage = ''; ctx.SK.vds = {};
{ const r = ctx.skalaFuer('Chlorid', 'µg/cm²'); assert.ok(r.vds, 'Chlorid-Referenz ohne Nutzung'); assert.deepEqual([...r.scale.cats.map(c => c.from)], [0, 5, 10]);
  assert.deepEqual([...ctx.skalaFuer('Chlorid', 'mg/m²').scale.cats.map(c => c.from)], [0, 50, 100], 'mg/m²: 1 µg/cm² = 10 mg/m²');
  assert.equal(ctx.skalaFuer('Chlorid', 'mg/kg').vds, null, 'Feststoff: keine Oberflächenreferenz');
  assert.match(r.scale.cats[1].name, /im Bereich der korrosionschemisch relevanten Größenordnung/); }
// Kategorie ohne „ab“-Wert (leeres Feld, in JSON als null gespeichert) bewertet keine Werte und wird nicht gespeichert
{ const ra = html.indexOf('function rate(scale, v){'), rb = html.indexOf('function photoNumbers()'); assert.ok(ra > 0 && rb > ra, 'rate() in index.html');
  const rc = {}; vm.runInNewContext(html.slice(ra, rb) + '\nthis.rate = rate;', rc);
  const kaputt = JSON.parse(JSON.stringify({ name: 'x', cats: [{ name: 'niedrig', from: 0 }, { name: 'hoch', from: NaN }, { name: 'sehr hoch', from: 10 }] }));
  assert.equal(kaputt.cats[1].from, null);
  assert.deepEqual([0.1, 3, 50].map(v => rc.rate(kaputt, v)), ['niedrig', 'niedrig', 'sehr hoch'], 'from:null bewertet nicht jeden Wert');
  assert.ok(html.includes(".filter((c, i) => (c.name || i === 0) && (i === 0 || Number.isFinite(c.from)))"), 'Skaleneditor speichert keine Kategorie ohne „ab“-Wert'); }
console.log('OK Skalenregel: eigene, VdS (Wohnen/Industrie, Einheiten), MKW eigene, angepasst aus PlanKit, Chlorid VdS 2357, Kategorie ohne „ab“');
