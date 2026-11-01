// Bedienung der Oberfläche ab FotoKit 2.0 („einfache Oberfläche“) für die Browsertests – echte Klicks, keine Test-API.
// Fotos sind Kacheln (#list .row); Eingaben stehen nur in der Fotokarte (#fDesc, #fProbe, #fSec) für das gewählte Foto.
// Selten Gebrauchtes liegt unter „Mehr …“ (#btnMehr → Menü #mosaikMehrPop der Spektron-Leiste).
'use strict';

const FELD = { desc: '#fDesc', probe: '#fProbe', sec: '#fSec' };

/** Ordner öffnen: Startseite „Projekt öffnen …“, sonst „Mehr …“ › „Anderen Ordner öffnen …“ (showDirectoryPicker ist im Test ersetzt). */
async function oeffnen(page) {
  if (await page.locator('#btnOpen2').isVisible()) return page.click('#btnOpen2');
  return mehr(page, 'mehrOrdner');
}
/** Eintrag im Menü „Mehr …“ anklicken (id wie mehrNamen, mehrSort, mehrUmbenennen, mehrZip, mehrLab, mehrReload, mehrOrdner, mehrSicher, mehrHilfe). */
async function mehr(page, id) {
  if (!(await page.locator('#mosaikMehrPop').isVisible().catch(() => false))) await page.click('#btnMehr');
  await page.locator('#mosaikMehrPop #' + id).click();
}
/** Ist der Menüeintrag abgeschaltet? (Menü wird dafür kurz geöffnet und wieder geschlossen) */
async function mehrAus(page, id) {
  await page.click('#btnMehr');
  const aus = await page.locator('#mosaikMehrPop #' + id).isDisabled();
  await page.keyboard.press('Escape');
  return aus;
}
/** Foto n wählen (Klick auf die Kachel, nicht auf den Haken); schon gewählt → nichts tun. */
async function foto(page, i) {
  const t = page.locator('#list .row').nth(i);
  if (!(await t.evaluate(e => e.classList.contains('active')))) await t.locator('.tinfo').click();
  return t;
}
/** Feld der Fotokarte für Foto n wie früher die Zeilenfelder: feld(page, 'desc', 3).fill('…'), .press('Enter'), .inputValue() … */
function feld(page, name, i) {
  const f = page.locator(FELD[name] || name);
  return new Proxy({}, { get: (_, m) => async (...a) => { await foto(page, i); return f[m](...a); } });
}
/** Haken „in der Doku“ auf der Kachel n setzen (true) oder nehmen (false = Weg). */
async function inDoku(page, i, an) {
  const c = page.locator('#list .row').nth(i).locator('.pick input');
  return an ? c.check() : c.uncheck();
}
/** Sortierung über „Mehr …“ › „Sortierung …“: 'name' | 'date' | 'section' */
async function sortieren(page, wert) {
  await mehr(page, 'mehrSort');
  await page.click(`#dialog [data-sort="${wert}"]`);
}
/** Projekt im Kopfband (ersetzt das frühere #projBadge) */
const projekt = page => page.locator('#mosaikLeiste .ml-proj strong').first().textContent();
/** „Dateinamen …“ öffnen / schließen (Präfix, Nummer … – Felder #oPrefix usw.) */
async function namen(page) { await mehr(page, 'mehrNamen'); await page.locator('#dlgNamen').waitFor(); }
async function namenZu(page) { await page.click('#dlgNamenZu'); }
/** „Sicherungen und Programmstand …“ öffnen (früher #btnMore/#morePanel) */
async function sicher(page) { await mehr(page, 'mehrSicher'); await page.locator('#dlgSicher #morePanel').waitFor(); }
async function sicherZu(page) { if (await page.locator('#dlgSicher').isVisible()) await page.click('#dlgSicherZu'); }

module.exports = { oeffnen, mehr, mehrAus, foto, feld, inDoku, sortieren, projekt, namen, namenZu, sicher, sicherZu };
