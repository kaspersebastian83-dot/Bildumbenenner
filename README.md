# Bildumbenenner

Projektfotos beschreiben, sortieren und umbenennen – und daraus eine Bilddokumentation als PDF (oder ein ZIP für eine KI) erstellen.

**App öffnen:** https://kaspersebastian83-dot.github.io/Bildumbenenner/

## Datenschutz in einem Satz

Die App läuft vollständig im Browser auf dem eigenen Rechner. **Fotos, Projektordner, PDFs und Projektdaten werden nicht hochgeladen** – GitHub liefert nur den Programmcode der App aus (dabei sieht GitHub, wie bei jeder Website, die IP-Adresse des Aufrufs).

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

## Wo liegen die Daten?

| Was | Wo |
|---|---|
| Beschreibungen, Abschnitte, Proben, Drehungen, Reihenfolge, Originalnamen, Prüfsummen, Projektdaten | `_Bildumbenenner.json` **im Projektordner** – wandert mit dem Ordner, Kollegen können weiterarbeiten. **Nicht löschen oder umbenennen.** |
| Objekt, Schadenereignis, Schadendatum, Ortstermin, Sachverständiger (bei Projekten aus dem Archivordner) | zusätzlich in `_Projekt.json` im Projektordner – gemeinsam mit der Projektzentrale. Projektnummer kommt aus dem Ordnernamen. |
| Sachverständiger, Standardanweisung für die KI, Export-Einstellungen | im Browser (persönlich, pro Rechner) |

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
