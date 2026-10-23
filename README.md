# FotoKit (früher Bildumbenenner)

Projektfotos beschreiben, sortieren und umbenennen – und daraus eine Bilddokumentation als PDF (oder ein ZIP für eine KI) erstellen.

**App öffnen:** https://kaspersebastian83-dot.github.io/Bildumbenenner/ · aktuelle Version **1.9.5**

Schritt ② der Büro-App-Suite **Spektron** (Projektzentrale, LabelKit, FotoKit, PlanKit, BelegKit, SpesenKit; Übersicht im [README der Projektzentrale](https://github.com/kaspersebastian83-dot/Projektzentrale#readme)).

Die Webadresse, die Projektdatei `_Bildumbenenner.json` und die gespeicherten Einstellungen behalten den alten Namen – so funktionieren bestehende Projekte, Lesezeichen und installierte Apps weiter. Die aktuelle Version steht oben links in der blauen Kopfzeile (Klick darauf: Änderungen, Problem melden). Daneben öffnet „? Kurzanleitung“ (oder F1) die Kurzanleitung – auch zum Ausdrucken.

## Neu in 1.9.5 · 21.10.2026

Alle aktiven Bilder erhalten in Listenreihenfolge eine **Dokumentationsnummer ab 1**, auch Bilder ohne Beschreibung. Aussortierte Bilder zählen nicht mit. Liste, Vorschau, PDF, ZIP-Bildverzeichnis, CSV und Fotoreferenzen der Labortabelle verwenden dieselben Nummern. Die Auswahl „nur Bilder mit Beschreibung“ behält die Listennummern bei und kann deshalb Lücken enthalten.

Die **Dateinummer** beginnt weiterhin bei der eingestellten Startnummer; Stellenzahl, Präfix und die übrigen Benennungsoptionen bleiben erhalten. Sie folgt der Position in der aktiven Liste (Startnummer + Bildnummer − 1). Ohne Beschreibung bleibt der Dateiname unverändert. Beispiel: Bild 3 mit Startnummer 7 erhält die Dateinummer 009 bei drei Stellen, auch wenn Bild 2 keine Beschreibung hat.

Aktueller Dateiname, gegebenenfalls Originalname und geplanter Dateiname sind sichtbar. Sortieren und Aussortieren ändern keine physischen Dateinamen. Stimmen Dateinamen und Plan nicht überein, zeigt FotoKit dies an; erst **„Ausführen“** und **„Jetzt ausführen“** bestätigen die Dateiaktion. Nach dem Umbenennen bleibt die Dokumentationsreihenfolge als manuelle Sortierung erhalten, auch nach erneutem Öffnen. Rückgängig bleibt wie bisher in der laufenden Sitzung verfügbar.

Für die Analyse des bisherigen Verhaltens und den Prüfnachweis siehe [Bildnummerierung 1.9.5](docs/bildnummerierung-1.9.5.md).

## Neu in 1.9.4 · 20.10.2026

Projektzentrale und Spektron-Leiste übergeben Projekte jetzt über #projekt im Fragment. Sonderzeichen bleiben erhalten; alte ?projekt-Links funktionieren weiterhin und werden nach dem Laden bereinigt. Projektwechsel laden auch bereits geöffnete App-Fenster neu; eine Warnung vor ungesicherten Eingaben kann den Wechsel abbrechen.

## Datenschutz in einem Satz

Die App läuft vollständig im Browser auf dem eigenen Rechner. **Fotos, Projektordner, PDFs und Projektdaten werden nicht hochgeladen** – GitHub liefert nur den Programmcode der App aus (dabei sieht GitHub, wie bei jeder Website, die IP-Adresse des Aufrufs). Eine strenge Content Security Policy (`<meta>` in `index.html`) sorgt zusätzlich dafür, dass die Seite weder fremden Code lädt noch Daten an andere Server senden kann (`connect-src 'self'`).

## Voraussetzungen

- **Google Chrome oder Microsoft Edge** (Firefox und Safari unterstützen den Ordnerzugriff nicht).
- Beim ersten Öffnen eines Ordners fragt der Browser nach Schreibzugriff → „Änderungen speichern“ erlauben.
- Nach dem ersten Aufruf funktioniert die App **auch offline**. Über das Browser-Menü → „App installieren“ bekommt sie ein eigenes Fenster und Symbol.

## Ablauf

1. **Projekt öffnen …** (oder den Ordner hineinziehen) – oder das Projekt in der [Projektzentrale](https://kaspersebastian83-dot.github.io/Projektzentrale/) anklicken: „Fotos bearbeiten“ öffnet direkt den Ordner `Fotos`. Wird ein ganzer Projektordner gewählt (`26.0123 Köln`), arbeitet die App ebenfalls in dessen `Fotos`. Wird nur `Fotos` gewählt, findet die App das Projekt über den Archivordner der Projektzentrale – sonst oben „Projekt zuordnen …“ (ab 1.8). Neue Fotos wie bisher in diesen Ordner kopieren und mit **„Fotos neu einlesen“** einlesen.
2. Pro Bild **Beschreibung** eingeben, optional **Abschnitt** (z. B. „Küche“ – gilt für die folgenden Bilder mit) und **Probe-Nr.** (z. B. „P1“). `Enter` springt zum nächsten Bild.
3. Unbrauchbare Bilder **aussortieren** (`Alt+X`), Reihenfolge per **Drag & Drop** oder Sortierung **„nach Abschnitt (Begehung)“** (Abschnitte in der Reihenfolge ihres ersten Vorkommens, Bildnummern passen sich an), schiefe Bilder **drehen** (`Alt+R`).
4. **Projektdaten** eintragen (Projektnummer, Anlage, Objekt, Schadenereignis, Ortstermin …) – aus der Projektzentrale vorbelegt, Auftraggeber und Schaden-Nr. werden zur Ansicht angezeigt.
5. **Bilddokumentation erstellen …** öffnet die bisherigen PDF-Optionen (Deckblatt, 2 Bilder pro Seite, Probenahmestellen-Tabelle, Aufteilung in Dateien ≤ 14 MB). **Umbenennen** bleibt eine eigene Aktion für Originaldateien; **ZIP exportieren** erzeugt Bilder + Anweisung für eine KI + Prüfsummen. Dateiname: `Bilddokumentation_<Projektnummer>_<Ort>_<JJJJ-MM-TT>.pdf` (Teile `…_Teil_1_von_2.pdf`, ZIP gleich); gibt es die Datei schon, wird `(2)` angehängt statt überschrieben.

Die bisherigen Benennungsoptionen liegen unter **„Dateibenennung und weitere Einstellungen“**. Der Bereich startet eingeklappt und lässt sich per Klick, Enter oder Leertaste öffnen. Alle Werte bleiben beim Ein-/Ausklappen erhalten; die Dateinamen-Vorschau bleibt sichtbar. Die Ergebnistabelle steht zusammen mit PDF und ZIP in der Exportgruppe. Bildliste und Vorschau bleiben unverändert.

## Leiste mit Projekt und Arbeitsschritten (ab 1.7)

Oben steht dieselbe schmale Leiste wie in LabelKit, PlanKit und BelegKit: das geöffnete Projekt mit Wechsel zu den zuletzt geöffneten, die vier Arbeitsschritte (LabelKit, FotoKit, PlanKit, BelegKit) mit Haken bei erledigten Schritten und „Weiter: …“ zum nächsten offenen Schritt im selben Projekt. Die Leiste liest den Projektordner nur und schreibt nie hinein. Projektdaten aus `_Projekt.json` werden beim Zurückkehren ins Fenster neu gelesen (ab 1.6.3), damit Änderungen aus der Projektzentrale auch in PDF und ZIP landen.

## Eindeutiger Projektkontext (ab 1.9.3)

Nach einem erfolgreichen Öffnen oder Wechsel verwenden FotoKit, die Spektron-Leiste und der URL-Parameter `projekt` denselben tatsächlich geöffneten Projektordner. Andere URL-Parameter und der Anker bleiben erhalten; die Aktualisierung lädt die Seite nicht neu. Ein Projekt aus der Projektzentrale wird erst nach erfolgreichem Öffnen als aktives Projekt in der Leiste angezeigt.

Während ausstehende Änderungen gespeichert oder die neuen Fotos gelesen werden, bleibt die bisherige Projektanzeige bestehen. Schlägt die Speicherung oder das Öffnen fehl, bleiben das bisherige Projekt, seine Eingaben und seine Zuordnung erhalten. Die Speicherabsicherung aus 1.8.2 und der geschützte Projektmodus aus 1.8.3 gelten weiterhin.

Bei einem nicht zuordenbaren **Fotos**-Ordner verschwindet die alte aktive Projektkennung aus Leiste und URL. FotoKit zeigt **Projekt unbekannt** und bietet weiterhin **Projekt zuordnen …**. Nach erfolgreicher Zuordnung stimmen die Anzeigen wieder überein; Beschreibungen und weitere Bildinformationen bleiben erhalten. Eine Zuordnung nur aus einem alten URL-Parameter oder aus manuell eingetragenen Projektdaten wird nicht erfunden.

Zum erneuten Öffnen über die URL benötigen die Apps wie bisher den passenden Projektordner im gemeinsamen Archiv und dessen Zugriffsberechtigung. Ein manuell außerhalb des Archivs geöffnetes Projekt wird dadurch nicht ins Archiv kopiert.

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

Ordnerwechsel, „Neu einlesen“ und App-Updates warten auf die Speicherung aller ausstehenden Änderungen, einschließlich der gemeinsamen Projektdaten. Schlägt sie fehl, bleibt das bisherige Projekt mit den Eingaben geöffnet. Nach Prüfen des Projektordners mit **„Erneut speichern“** wiederholen und anschließend den Wechsel erneut auslösen. Beim Schließen oder Neuladen über den Browser warnt FotoKit auch vor noch laufenden Schreibvorgängen; ein erzwungenes Schließen oder das Bestätigen von „Seite verlassen“ kann ungesicherte Änderungen weiterhin verwerfen.

Nach Umbenennen oder Rückgängig werden Speicherfehler ebenfalls angezeigt. Die Dateinamen können dann bereits geändert sein; die zugehörigen Bildinformationen bleiben in der geöffneten Sitzung erhalten. **„Erneut speichern“** sichert sie unter den aktuellen Dateinamen, ohne die Dateiaktion zu wiederholen. Erst nach erfolgreicher Speicherung erscheint die Erfolgsmeldung.

Bei einem unbekannten Projektformat oder einer beschädigten/nicht lesbaren Projektdatei arbeitet FotoKit im **geschützten Modus**: Originalfotos können weder umbenannt noch verschoben werden, auch nicht über Rückgängig. Beide Projektdateien bleiben unverändert. Ansicht und sichere PDF-/ZIP-Ausgaben sind weiterhin möglich; Anpassungen für eine Ausgabe gelten nur in dieser Sitzung. Eine kompatible FotoKit-Version beziehungsweise eine lesbare Projektdatei ist erforderlich, um das Projekt wieder dauerhaft zu bearbeiten.

## Bekannte Grenzen

- **HEIC-Fotos (iPhone-Standard)** kann Chrome nicht lesen → iPhone: Einstellungen › Kamera › Formate › „Maximale Kompatibilität“ (oder Fotos per WhatsApp übertragen).
- Im PDF werden einzelne Sonderzeichen ersetzt (→ wird „->“, CO₂ wird „CO2“). Umlaute, ß, µ, ², € funktionieren.
- Möglichst nicht zu zweit **gleichzeitig** im selben Projektordner arbeiten. Passiert es doch, führt die App die Änderungen Bild für Bild zusammen; nur wenn beide dasselbe Feld unterschiedlich geändert haben, bleibt die eigene Fassung und die App zeigt den Konflikt an. Hat jemand anderes inzwischen umbenannt, fordert die App zum „Neu einlesen“ auf.

## Wenn etwas nicht klappt

**„Problem melden“** (im Fehlerhinweis oder im Info-Fenster über die Versionsnummer) kopiert einen kurzen Bericht in die Zwischenablage: Version, Browser, Ordner/Projekt, letzte Meldungen – keine Bilder, keine Beschreibungen. Einfach in eine E-Mail einfügen und kurz beschreiben, was passiert ist.

## Programmstand und sichere Umstellung (N3)

Die Kopfzeile zeigt die geladene Version und den kurzen HTML-Build; das Infofenster und der Problembericht enthalten den vollständigen SHA-256-Build. „Programmstand prüfen“ vergleicht mit der Online-Antwort, auch bei gleicher Versionsnummer. Offline/ungültige Antworten bestätigen keinen aktuellen Stand. Ein Service-Worker-Wechsel lädt offene Seiten nicht automatisch neu. „Sicher neu laden“ wartet auf die vorhandene Speicherabsicherung und bricht bei Fehlern oder geschütztem Projektmodus ab.

**Ein Update sperrt keine alten Clients.** Für die spätere Einführung ist die [verbindliche Büro-Umstellung](docs/N3-Buero-Umstellung.md) einschließlich tatsächlich geprüfter Schreibsperre, aller Browser-/RDP-Profile und externer Vollsicherung erforderlich. [Befund, Angriff und Testgrenzen](docs/N3-Pruefbericht.md). Die gesamte SPEKTRON-Suite bleibt NO-GO bis zum unabhängigen Audit und zur praktischen Windows-/SMB-/RDP-Abnahme.

Für Betreuer: Nach jeder HTML-Änderung `node tools/build-identity.cjs` ausführen, mit `--check` prüfen und den endgültigen Kombinationsstand samt Commit/HTML-/Worker-/Helferhash dokumentieren. Der HTML-Build ist eine Artefaktkennung, keine digitale Signatur oder Bürofreigabe. Dieser Draft führt kein Merge/Deployment aus. Bei einer später autorisierten Veröffentlichung gelten zunächst die Schritte der Umstellungsanleitung. Alte Offlinecaches und Browserdaten werden durch N3 nicht automatisch gelöscht.

## Dateien

- `index.html` – die komplette App (eine Datei, keine externen Bibliotheken)
- `sw.js` – Service Worker: Offline-Nutzung, immer neueste Version wenn online
- `manifest.webmanifest`, `icon*.{svg,png}` – Installation als App

## Tests

```sh
node tests/laborwerte.cjs   # Laborwerte der Ergebnistabelle: Zahlen und Qualifikatoren wie in PlanKit
node tests/bildnummerierung-browser.cjs [chromium|webkit]   # 5/50/150 Bilder: echte Aktionen und gespeicherte PDF-/CSV-/ZIP-Inhalte
node tests/projektdaten-browser.cjs [chromium|webkit]   # _Projekt.json: Neu-Lesen beim Fensterwechsel, Sperre beim Speichern (braucht Playwright)
node tests/projektkontext-browser.cjs [chromium|webkit]   # Zentrale, manuelle Wechsel, Fehler/Verzögerungen, unbekannter Ordner, Zuordnung und URL/Navigation
node tests/leiste-browser.cjs [chromium|webkit]   # Leiste mit Projekt, Arbeitsschritten und „Weiter“ (braucht Playwright)
node tests/sortierung-export-browser.cjs [chromium|webkit]   # Projektzuordnung, Abschnittssortierung, PDF-Dateinamen
node tests/sicherer-projektwechsel-browser.cjs [chromium|webkit]   # Speicherfehler, Retry, verzögerte Writes, Einlesen/Update/Browser-Reload
node tests/geschuetzter-projektmodus-browser.cjs [chromium|webkit]   # Schutz von Originalen/JSON, direkte Dateiaktionen, sichere Exporte
node tests/oberflaeche-browser.cjs [chromium|webkit]   # Einstellungsbereich, Tastatur, Dateifunktionen/Exporte, 1280, 768, 390 und 320 px; Vorschau, Überbreite und Tastatur
node tests/serienbeschriftung-browser.cjs [chromium|webkit]   # 5/50/150 Bilder: Tastatur, Fokus, Vorschau, Vererbung und Autosave
```

GitHub führt alle Tests bei jedem Pull Request aus (`.github/workflows/tests.yml`, Chromium; die WebKit-Aufrufe sind lokal optional). Es gibt nur diesen einen Test-Workflow; zusätzliche Kompatibilitäts- und Integrations-Workflows wurden am 23.10.2026 entfernt.
