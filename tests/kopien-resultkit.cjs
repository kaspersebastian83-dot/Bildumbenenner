// Kopien gegen ResultKit (Audit 2026-11 Lauf 5, E4 #7/#8/#9): FotoKit hält drei Teile von ResultKit als Kopie –
//   LABZAHL (labNumber, labQualifier) und KORROSION-CHLORID v2 + VdS-Referenz (vdsSkala) wie ResultKit src/bewertung.ts,
//   SPEKTRON-SKALEN wörtlich wie ResultKit src/skalen-archiv.js (ohne „export“).
// Ändert jemand das Original in ResultKit, wird dieser Test rot – vorher fiel es niemandem auf.
// ResultKit muss daneben liegen (../resultkit, oder RESULTKIT_DIR). In der CI ist es Pflicht (RESULTKIT_PFLICHT=1), sonst SKIP.
// Node 22.6+ (TypeScript ohne Typen): node tests/kopien-resultkit.cjs
'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), { pathToFileURL } = require('node:url');
const rk = path.resolve(process.env.RESULTKIT_DIR || path.join(__dirname, '..', '..', 'resultkit'));
const bewertungTs = path.join(rk, 'src', 'bewertung.ts'), skalenJs = path.join(rk, 'src', 'skalen-archiv.js');
if (!fs.existsSync(bewertungTs) || !fs.existsSync(skalenJs)){
  if (process.env.RESULTKIT_PFLICHT === '1'){ console.error(`ResultKit fehlt unter ${rk} (RESULTKIT_PFLICHT=1)`); process.exit(1); }
  console.log(`SKIP Kopien ResultKit: ${rk} nicht gefunden`); process.exit(0);
}
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const block = (von, bis, mitEnde = false) => { const a = html.indexOf(von), b = html.indexOf(bis); assert.ok(a > 0 && b > a, `Block ${von.slice(0, 30)} in index.html`); return html.slice(a, mitEnde ? b + bis.length : b); };
let n = 0; const ok = was => { n++; console.log('OK Kopie ResultKit: ' + was); };
const ohneFarbe = s => s ? JSON.parse(JSON.stringify({ name: s.name, cats: s.cats.map(c => ({ name: c.name, from: c.from, ...(c.ueber ? { ueber: true } : {}) })) })) : null;   // JSON: Objekte aus vm haben eine andere Herkunft

(async () => {
  const R = await import(pathToFileURL(bewertungTs).href);

  // 1 · SPEKTRON-SKALEN: wörtlich gleich (ResultKit exportiert, FotoKit nicht)
  {
    const fk = block('/* SPEKTRON-SKALEN v1', '/* SPEKTRON-SKALEN-ENDE */', true);
    const orig = fs.readFileSync(skalenJs, 'utf8').replace(/export (const|async function|function) /g, '$1 ').replace(/\s+$/, '');
    if (fk !== orig){
      const a = fk.split('\n'), b = orig.split('\n'), j = a.findIndex((z, k) => z !== b[k]), i = j < 0 ? a.length : j;
      assert.fail(`SPEKTRON-SKALEN weicht ab ResultKit src/skalen-archiv.js ab Zeile ${i + 1}:\n  FotoKit:   ${a[i] ?? '(Ende)'}\n  ResultKit: ${b[i] ?? '(Ende)'}`);
    }
    ok('SPEKTRON-SKALEN wörtlich gleich');
  }

  // 2 · LABZAHL: gleiche Ergebnisse für dieselben Eingaben
  const L = {}; vm.runInNewContext(block('/* LABZAHL-START', '/* LABZAHL-ENDE */') + '\nthis.labNumber = labNumber; this.labQualifier = labQualifier;', L);
  const zahlen = ['1300', '0', '3,2', '3.2', '0.123', '0,123', '1.300,5', '1,300.5', '1.234.567', '1,234,567', '1 300,5', '1 300.5', '1 300', '1 300', '1 300,5',
    '1,2e3', '1.2E-3', '−2,5', '+4', '-0', '', ' ', '1.300', '1,300', '1.234', '1,234', '12.345', '12,345', '0,500', '0.500', '1000,5', '12.34,5', '12,34.5', '1 30', '1,2,3', '1.2.3',
    '1.234,5.6', '1.2 mg/kg', '> 5', 'NaN', 'Infinity', '0x10', '1e999', '1e', '--1', '007', '.5', '5.', ',5', null, undefined,
    '< 0,50', '<0,5', 'unter BG', ' UNTER bg ', 'n.n.', '(N. N.)', 'n.b.', '(n. b.)', '0,00', '<', '< kaputt', '< 1.2 mg/kg', '<< 0.50', '< NaN', '< Infinity', '< -1', '< 1.234',
    '< BG', 'n.n. Zusatz', '(n.b.', '(3,2)', '( < 0,5 )', 'nn', 'n. n.', 'N.B.', 'unterBG', 'unter  BG', 'Unter Bg', 'unter BG 5', 'n.n', 'nb', 'n.  b.'];
  for (const z of zahlen){
    const a = L.labNumber(z), b = R.labNumber(z);
    assert.ok(Object.is(a, b) || (Number.isNaN(a) && Number.isNaN(b)), `labNumber(${JSON.stringify(z)}): FotoKit ${a}, ResultKit ${b}`);
    assert.equal(L.labQualifier(z), R.labQualifier(z), `labQualifier(${JSON.stringify(z)})`);
  }
  ok(`labNumber und labQualifier gleich (${zahlen.length} Eingaben)`);

  // 3 · KORROSION-CHLORID v2 und VdS-Referenz: gleiche Skalen (ResultKit setzt zusätzlich Farben – die zählen hier nicht)
  const ctx = { store: { get: () => ({}) } };
  vm.runInNewContext(block('const scaleKey = ', 'async function loadSkalenregel(') + '\nthis.SK = SK; this.vdsSkala = vdsSkala; this.chloridSkala = chloridSkala; this.chloridEinheit = chloridEinheit; this.stufeErreicht = stufeErreicht; this.vdsRegel = vdsRegel;', ctx);
  const params = ['Chlorid', 'Chlorid (wasserlöslich)', ' chlorid ', 'CHLORID', 'Chloride', 'Chlorid-Ionen', 'Summe 16 EPA-PAK', 'Summe 16 EPA-PAK exkl. BG', 'Σ16 EPA-PAK', 'Σ 16 EPA–PAK',
    'Summe 16 EPA PAK', 'Summe 16 EPA-PAKs', 'summe 16 epa-pak', 'Summe 15 EPA-PAK', 'Benzo[a]pyren', 'Kohlenwasserstoffe C10-C40', ''];
  const units = ['µg/cm²', 'µg/cm2', 'μg/cm²', 'µg / cm²', 'mg/m²', 'mg/m2', 'MG/M²', 'µg/m²', 'mg/cm²', 'µg/100 cm²', 'µg/100cm²', 'mg/dm²', 'ng/m²', 'µg/Probe', 'mg/kg', ''];
  let faelle = 0;
  for (const [usage, nutzung] of [[undefined, ''], ['residential', 'Wohnen'], ['residential', 'Gesundheit & Labor'], ['industrial', 'Gewerbe/Industrie'], ['', 'Büro']]){
    ctx.SK.usage = usage; ctx.SK.nutzung = nutzung; R.setNutzung(nutzung);
    for (const p of params) for (const u of units){
      const fk = ohneFarbe(ctx.vdsSkala(p, u)), orig = ohneFarbe(R.chloridScale(p, u) || R.vdsScale(p, u, usage || undefined));
      assert.deepEqual(fk, orig, `vdsSkala(${JSON.stringify(p)}, ${JSON.stringify(u)}) bei Nutzung ${JSON.stringify(nutzung)}`);
      faelle++;
    }
  }
  R.setNutzung('');
  for (const u of units) assert.equal(ctx.chloridEinheit(u), R.chloridEinheit(u), `chloridEinheit(${JSON.stringify(u)})`);
  for (const c of [{ from: 5 }, { from: 10, ueber: true }, { from: 0 }]) for (const v of [0, 4.99, 5, 9.99, 10, 10.0001, 50]) assert.equal(ctx.stufeErreicht(c, v), R.stufeErreicht(c, v), `stufeErreicht(${JSON.stringify(c)}, ${v})`);
  const vds = R.chloridScale('Chlorid', 'µg/cm²');
  for (const eigen of [{ name: 'gleich', cats: [{ name: 'a', from: 0 }, { name: 'b', from: 5 }, { name: 'c', from: 10 }] }, { name: 'als Text', cats: [{ name: 'a', from: '0' }, { name: 'b', from: '5' }, { name: 'c', from: '10' }] },
    { name: 'andere', cats: [{ name: 'a', from: 0 }, { name: 'b', from: 6 }, { name: 'c', from: 10 }] }, { name: 'kürzer', cats: [{ name: 'a', from: 0 }, { name: 'b', from: 5 }] }])
    assert.deepEqual(JSON.parse(JSON.stringify(ctx.vdsRegel(eigen, vds))), JSON.parse(JSON.stringify(R.vdsRegel(eigen, vds))), `vdsRegel ${eigen.name}`);
  ok(`KORROSION-CHLORID v2 und VdS-Referenz gleich (${faelle} Fälle, chloridEinheit, stufeErreicht, vdsRegel)`);

  console.log(`${n} Vergleiche mit ResultKit grün (${rk})`);
})().catch(e => { console.error(e); process.exit(1); });
