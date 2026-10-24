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
assert.ok(/const scale = g\.unit \? skalaFuer\(p1, g\.unit\)\.scale : null;/.test(html), 'Ergebnistabelle nutzt die Regel');
console.log('OK Skalenregel: eigene, VdS (Wohnen/Industrie, Einheiten), MKW eigene, angepasst aus PlanKit');
