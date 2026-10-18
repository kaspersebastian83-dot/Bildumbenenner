# FotoKit (früher Bildumbenenner)

Projektfotos beschreiben, sortieren und umbenennen – und daraus eine Bilddokumentation als PDF (oder ein ZIP für eine KI) erstellen.

**App öffnen:** https://kaspersebastian83-dot.github.io/Bildumbenenner/ · aktuelle Version **1.7.1**

Schritt ② der Büro-App-Suite **Spektron** (Projektzentrale, LabelKit, FotoKit, PlanKit, BelegKit, SpesenKit; Übersicht im [README der Projektzentrale](https://github.com/kaspersebastian83-dot/Projektzentrale#readme)).

Die Webadresse, die Projektdatei `_Bildumbenenner.json` und die gespeicherten Einstellungen behalten den alten Namen – so funktionieren bestehende Projekte, Lesezeichen und installierte Apps weiter. Die aktuelle Version steht oben links in der blauen Kopfzeile (Klick darauf: Änderungen, Problem melden). Daneben öffnet „? Kurzanleitung“ (oder F1) die Kurzanleitung – auch zum Ausdrucken.

## Datenschutz in einem Satz

Die App läuft vollständig im Browser auf dem eigenen Rechner. **Fotos, Projektordner, PDFs und Projektdaten werden nicht hochgeladen** – GitHub liefert nur den Programmcode der App aus (dabei sieht GitHub, wie bei jeder Website, die IP-Adresse des Aufrufs). Eine strenge Content Security Policy (`<meta>` in `index.html`) sorgt zusätzlich dafür, dass die Seite weder fremden Code lädt noch Daten an andere Server senden kann (`connect-src 'self'`).

## Voraussetzungen

- **Google Chrome oder Microsoft Edge** (Firefox und Safari unterstützen den Ordnerzugriff nicht).
- Beim ersten Öffnen eines Ordners fragt der Browser nach Schreibzugriff → „Änderungen speichern“ erlauben.
- Nach dem ersten Aufruf funktioniert die App **auch offline**. Über das Browser-Menü → „App installieren“ bekommt sie ein eigenes Fenster und Symbol.

## Ablauf

1. **Ordner wählen** (oder hineinziehen) – oder das Projekt in der [Projektzentrale](https://kaspersebastian83-dot.github.io/Projektzentrale/) anklicken: „Fotos bearbeiten“ öffnet direkt den Ordner `Fotos`. Wird ein ganzer Projektordner gewählt (`26.0123 Köln`), arbeitet die App ebenfalls in dessen `Fotos`.
2. Pro Bild **Beschreibung** eingeben, optional **Abschnitt** (z. B. „Küche“ – gilt für die folgenden Bilder mit) und **Probe-Nr.** (z. B. „P1“). `Enter` springt zum nächsten Bild.
3. Unbrauchbare Bilder **aussortieren** (`Alt+X`), Reihenfolge per **Drag & Drop**, schiefe Bilder **drehen** (`Alt+R`).
4. **Projektdaten** eintragen (Projektnummer, Anlage, Objekt, Schadenereignis, Ortstermin …).
5. **Umbenennen** – oder direkt **PDF erstellen** (Deckblatt, 2 Bilder pro Seite, Probenahmestellen-Tabelle, Aufteilung in Dateien ≤ 14 MB) bzw. **ZIP exportieren** (Bilder + Anweisung für eine KI + Prüfsummen).

## Leiste mit Projekt und Arbeitsschritten (ab 1.7)

Oben steht dieselbe schmale Leiste wie in LabelKit, PlanKit und BelegKit: das geöffnete Projekt mit Wechsel zu den zuletzt geöffneten, die vier Arbeitsschritte (LabelKit, FotoKit, PlanKit, BelegKit) mit Haken bei erledigten Schritten und „Weiter: …“ zum nächsten offenen Schritt im selben Projekt. Die Leiste liest den Projektordner nur und schreibt nie hinein. Projektdaten aus `_Projekt.json` werden beim Zurückkehren ins Fenster neu gelesen (ab 1.6.3), damit Änderungen aus der Projektzentrale auch in PDF und ZIP landen.

## Ergebnistabelle für das Gutachten

„Ergebnistabelle …“ liest den **XML-Export des Prüfberichts** (Eurofins liefert ihn mit der PDF; bei Projekten aus dem Archivordner wird er automatisch im Unterordner `Laborergebnisse` gefunden). Die Proben werden über die Probe-Nr. den Fotos zugeordnet (`Probe 3` = `P3`), ein Wert (Standard: Σ16 EPA-PAK, dazu BaP) wird nach einer **eigenen Bewertungsskala** eingestuft. „Tabelle kopieren“ legt eine fertige Tabelle mit Fußnoten (BG, Prüfbericht, Skala) in die Zwischenablage – in Word mit Strg+V einfügen. Alternativ „Alle Einzelwerte“. Fehlende Werte, Fotos ohne Probe im Bericht und ein Bericht zu einem anderen Projekt werden als Prüfhinweis angezeigt. Grenzwerte sind nicht eingebaut – die Skala legt ihr selbst fest (gespeichert im Browser).

## Wo liegen die Daten?

| Was | Wo |
|---|---|
| Beschreibungen, Abschnitte, Proben, Drehungen, Reihenfolge, Originalnamen, Prüfsummen, Projektdaten | `_Bildumbenenner.json` **im Projektordner** – wandert mit dem Ordner, Kollegen können weiterarbeiten. **Nicht löschen oder umbenennen.** |
| Objekt, Schadenereignis, Schadendatum, Ortstermin, Sachverständiger (bei Projekten aus dem Archivordner) | zusätzlich in `_Projekt.json` im Projektordner – gemeinsam mit der Projektzentrale. Projektnummer kommt aus dem Ordnernamen. |
| Sachverständiger, Standardanweisung für die KI, Export-Einstellungen, Bewertungsskalen der Ergebnistabelle | im Browser (persönlich, je Windows-Profil) |
| Archivordner, zuletzt geöffnete Projekte | gemeinsamer Browser-Speicher der Suite (IndexedDB `mosaik-suite`, Schlüssel `archiv` und `zuletzt`) |

Originalbilder werden **nur umbenannt** bzw. nach `_aussortiert/` verschoben – nie verändert. Drehen und Verkleinern betrifft nur die Kopien im ZIP/PDF. Rückgängig ist nach jedem Umbenennen möglich.

## Bekannte Grenzen

- **HEIC-Fotos (iPhone-Standard)** kann Chrome nicht lesen → iPhone: Einstellungen › Kamera › Formate › „Maximale Kompatibilität“ (oder Fotos per WhatsApp übertragen).
- Im PDF werden einzelne Sonderzeichen ersetzt (→ wird „->“, CO₂ wird „CO2“). Umlaute, ß, µ, ², € funktionieren.
- Möglichst nicht zu zweit **gleichzeitig** im selben Projektordner arbeiten. Passiert es doch, führt die App die Änderungen Bild für Bild zusammen; nur wenn beide dasselbe Feld unterschiedlich geändert haben, bleibt die eigene Fassung und die App zeigt den Konflikt an. Hat jemand anderes inzwischen umbenannt, fordert die App zum „Neu einlesen“ auf.

## Wenn etwas nicht klappt

**„Problem melden“** (im Fehlerhinweis oder im Info-Fenster über die Versionsnummer) kopiert einen kurzen Bericht in die Zwischenablage: Version, Browser, Ordner/Projekt, letzte Meldungen – keine Bilder, keine Beschreibungen. Einfach in eine E-Mail einfügen und kurz beschreiben, was passiert ist.

## Neue Version veröffentlichen (für den Betreuer)

1. In `index.html` `APP_VERSION` erhöhen und einen Eintrag in `CHANGELOG` ergänzen.
2. Änderung auf `main` bringen (Pull Request mergen) und mit `vX.Y.Z` taggen.
3. GitHub Pages veröffentlicht automatisch. Geöffnete Apps zeigen innerhalb von 30 Minuten „Update verfügbar – neu laden“; beim nächsten Start wird die neue Version ohnehin geladen.

Ältere Versionen bleiben über die Tags abrufbar. Die App funktioniert auch weiterhin als einzelne lokale Datei (`index.html` herunterladen und in Chrome/Edge öffnen) – dann ohne Offline-Cache und Update-Hinweis.

## Dateien

- `index.html` – die komplette App (eine Datei, keine externen Bibliotheken)
- `sw.js` – Service Worker: Offline-Nutzung, immer neueste Version wenn online
- `manifest.webmanifest`, `icon*.{svg,png}` – Installation als App

## Tests

```sh
node tests/laborwerte.cjs   # Laborwerte der Ergebnistabelle: Zahlen und Qualifikatoren wie in PlanKit
node tests/projektdaten-browser.cjs [chromium|webkit]   # _Projekt.json: Neu-Lesen beim Fensterwechsel, Sperre beim Speichern (braucht Playwright)
node tests/leiste-browser.cjs [chromium|webkit]   # Leiste mit Projekt, Arbeitsschritten und „Weiter“ (braucht Playwright)
```

GitHub führt alle Tests bei jedem Pull Request aus (`.github/workflows/tests.yml`, Chromium und WebKit; ab 1.7.1).
