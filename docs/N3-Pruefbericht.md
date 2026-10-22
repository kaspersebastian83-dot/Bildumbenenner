# N3 – Nach-Audit: Altclients, Befund und Nachweise

Stand: 22.10.2026. **SPEKTRON bleibt NO-GO** bis unabhängigem Gesamtaudit und praktischer Windows-/SMB-/RDP-Abnahme. Kein Merge, kein Deployment, ausschließlich synthetische Daten.

## Geprüfte Ausgangsstände

`main` ist unverändert `b616164f5ab24faa5371f4eb714276f6080a8bf3` (FotoKit 1.9.5). Separater Branch `fix/n3-altclient-umstellung` startet dort. Bestehende Draft-PRs bleiben unverändert:

| Korrektur | PR | festgeschriebener Commit |
|---|---|---|
| F3 | #31 | `5617ff033cd29c0a3fa43bb4246be598830cbfcd` |
| F6 | #32 | `9c7929b6aebca4dc7fe8d95d7b518ea0946a66d0` |
| N2 | #33 | `063b91d1f253c2c05fac221cd55b071be19fba59` |
| PDF | #34 | `67449ee989c27d975596c33e371bea8506470901` |

Die Korrekturen werden ausschließlich in einem neuen temporären Checkout kombiniert (`tools/n3-compose-compat.cjs`). Der N3-Einzelbranch enthält F6/N2/F3/PDF absichtlich nicht erneut; er ist **kein allein nutzbarer Produktionsstand**. Die Kombination erhält den gesamten Quellbereich von `const PROJ_FILE` bis zum Updateblock einschließlich Speicher-/Originaldatei-/Wiederherstellungs-/PDF-Logik bytegleich. F3-Helfer wird mit der Projektzentrale verglichen. F6-Testassertions bleiben unverändert; der bereits geprüfte N2-Adapter ergänzt dessen synthetisches Dateisystem um Byte-/Verzeichniszugriff.

## Technische Bestandsaufnahme

- Bisherige geladene Kennung: `APP_VERSION = '1.9.5'`, Versionsknopf und Problembericht. Die vier Audit-PRs tragen dieselbe Version. Ein Vergleich nur der semantischen Versionsnummer erkennt ihre Unterschiede nicht. Die Projektdatei-Version ist keine eindeutige Build-Identität.
- Bisherige Updateprüfung: liest `index.html` alle 30 Minuten und nach Start, zeigt nur bei größerer Versionsnummer einen Knopf. Lokale HTML-Dateien besitzen keine Onlineprüfung. Eine gecachte Antwort konnte als aktuelle Antwort erscheinen.
- Worker: Installation mit `skipWaiting()`, Aktivierung mit `clients.claim()`. Beides wechselt den Netzwerkcontroller; laufende JavaScript-Closures, Eingaben und Dateihandles bleiben bestehen. Kein serverseitiger Schreibendpunkt: Projektdateien laufen nicht durch den Worker.
- Cache: Netz zuerst, nach vier Sekunden/offline eigener Cache. Ein Offlineprofil kann über längere Zeit alten Code starten; Profile und Browser haben getrennte Worker/Caches. Auch nach neuer Installation kann ein alter Tab weiter schreiben.
- Handles: Ordnerzugriff wird im Browser erteilt, gemeinsame Archivhandles liegen in IndexedDB. Kein Protokoll entzieht einem anderen Profil dessen Recht. Schon geöffnete Writable-Streams erfordern eine Sperre beim tatsächlichen Abschluss, nicht nur beim Öffnen. Windows/SMB-Verbindungen können bestehende Zugriffe behalten; eine bloße ACL-Änderung muss praktisch geprüft werden.
- Altclient auf `b616164`: `projFromJson()` übernimmt nur bekannte Top-Level-/Bildfelder und bekannte `original`-/`sha256`-Unterfelder; `projToJson()` schreibt daraus eine neue reduzierte Datei. Ein erneutes Lesen/Mergen vor dem Schreiben rettet verworfene Felder nicht. Zusätzliche Projekt-/Benennungsfelder können zufällig erhalten bleiben; das ersetzt keinen allgemeinen Erhalt.
- F6 erhält die unbekannten JSON-Werte. N2 bewahrt vollständige, verifizierte Fassungen. Beide können bereits laufenden alten Code nicht nachrüsten.

## Verbindlicher Angriff – tatsächlicher Altclient

`tests/n3-altclient-browser.cjs` verlangt ausdrücklich einen separaten unveränderten pre-F6-Checkout. Es verwendet dessen echtes HTML und dessen echten Worker, keine nachgebaute Altclient-Schreibfunktion. Browserkontexte besitzen getrennte Profile; die Dateihandles sind ein gemeinsamer synthetischer Festplattenadapter. Der Service Worker und sein Controllerwechsel sind echt. Chromium prüft den Offline-Start mit `browserContext.setOffline(true)`. WebKit kann mit dieser Playwright-Emulation nicht aus dem Worker-Cache navigieren; dort unterbricht der lokale Testserver tatsächlich alle Origin-Verbindungen (Sockets schließen), während der reale Worker seinen Offlinefallback ausführt. Dieser Unterschied wird in der Evidenzdatei vermerkt.

1. Sitzung A startet `b616164`, öffnet das synthetische Projekt und schließt einen initialen Autosave ab; Versionsanzeige `v1.9.5`. SHA-256 des unveränderten alten HTML: `44392a52502b309ccd1e5d211929220a1e03e590ef4edac2c5fb1670e14a7a78`.
2. Erweiterte synthetische Felder eines Suite-Produzenten werden bereitgestellt: Top-Level `extension`, `bilder['a.jpg'].future`, `bilder['b.jpg'].original.custom`, außerdem Projekt-/Benennungserweiterungen. B startet den F6-/N2-kompatiblen Kombinationsstand, bearbeitet ein anderes Bild und speichert. Die Assertions verlangen die vollständigen unbekannten Werte in der bestätigten B-Fassung.
3. Der Test schaltet dieselbe lokale Origin auf das neue `sw.js` und ruft die reale alte Registrierung `update()` auf. A bleibt durchgehend geöffnet. `controllerchange` wird abgewartet. A zeigt weiterhin seine alte Version und hat kein N3-UI. Fremde Caches und alter eigener Cache bleiben erhalten.
4. A bearbeitet sein Bild und speichert. **Tatsächliches Ergebnis:** `extension`, `future` und `original.custom` fehlen anschließend in der Hauptdatei. Der Angriffstest besteht nur, wenn dieser ursprüngliche Datenverlust nachgewiesen ist; er meldet keinen erfolgreichen Altclient-Schutz.
5. B wird geschlossen. Eine neue Sitzung entdeckt die bestätigte vollständige B-Fassung in `_FotoKit_Fassungen/`, zeigt sie an und stellt sie ausdrücklich bytegenau wieder her. Die Originalbildbytes bleiben identisch.
6. Eine externe synthetische Speicherautorität sperrt anschließend den Abschluss eines schon geöffneten A-Schreibstreams. Der alte Speicherversuch scheitert, Hauptdatei bleibt bytegleich. Das ist ein Nachweis des erforderlichen Sperrmodells, **kein Nachweis einer bereits eingerichteten Bürosperre**.
7. Ein weiteres Profil startet die alte Anwendung offline aus seinem Cache. Ein frisches Onlineprofil lädt dagegen den aktuellen Build. Das beweist die notwendige getrennte Behandlung aller Profile.

Reproduzierbare Befehle (neue lokale Verzeichnisse; Playwright 1.56.1 und Browser müssen installiert sein):

```sh
git worktree add --detach /tmp/n3-old b616164f5ab24faa5371f4eb714276f6080a8bf3
node tools/n3-compose-compat.cjs /tmp/n3-combined
cd /tmp/n3-combined
N3_OLD_ROOT=/tmp/n3-old N3_RESULTS=/tmp/n3-results node tests/n3-altclient-browser.cjs chromium
N3_OLD_ROOT=/tmp/n3-old N3_RESULTS=/tmp/n3-results node tests/n3-altclient-browser.cjs webkit
```

`altclient-<engine>.json` enthält Alt-HTML-Hash, Controllerereignis, vollständige synthetische Vorher-/Nachherwerte und Hash der bestätigten B-Fassung. Keine echten Projektdaten.

## Maßnahmen und ihre tatsächliche Wirkung

| Maßnahme | Was sie leistet | Was sie nicht durchsetzt |
|---|---|---|
| `APP_BUILD` und Generator | SHA-256-Kennung des HTML mit normalisiertem Buildwert; Kurzkennung in Kopfzeile, Vollkennung in Info/Problembericht. CI prüft Aktualität. | Keine digitale Signatur; umfasst keine separat geladene `project-store.js` und keinen anderen Tab. Vollständiges Manifest bleibt erforderlich. |
| Updatevergleich über gesonderte Netzabfrage | Erkennt abweichende Builds auch bei gleicher Version und bei Rollbacks. Neuer Worker liefert für die Updateabfrage keinen Offlinefallback; Fehler/Timeout/ungültige Antwort bleiben unbestätigt. | Kein Versionsverbot, kein vollständiger Nachweis der veröffentlichten Freigabe. Alter Worker/Altclient enthält diese Prüfung nicht. |
| Bewusstes sicheres Neuladen | Bestehendes `withSavedProject` wartet auf Foto-/Gemeinschaftsdaten und laufende Writes, Fehler brechen ab. Geschützter Modus bricht zusätzlich ab, damit Sitzungseingaben nicht still verworfen werden. Kein Auto-Reload durch Controllerwechsel. | Erzwungenes Browserbeenden/„Seite verlassen“ kann Eingaben weiterhin verwerfen. |
| Worker `v4-n3` | `updateViaCache: none`; keine automatische Cache-/Browserdatenlöschung. F3-Helfer bleibt im kombinierten Offline-Assetbestand. | Kein Entzug von Datei-/SMB-Rechten und kein Beenden alter RDP-Prozesse. |
| F6 + N2 in Kombination | Erhält unbekannte Felder bei neuen Schreibern; bestätigte B-Vollfassung bleibt nach Altclient-Überschreiben auffindbar und ausdrücklich wiederherstellbar. | Keine nachträgliche Sicherung nie archivierter Altclient-Änderungen; kein gegen Löschung geschütztes externes Backup. |
| Externe Wartungssperre und Vollsicherung | Kann alte Schreiber tatsächlich blockieren, wenn sie alle Pfade/Streams erfasst und negativ getestet ist. | Ist durch diesen Browser-PR nicht am Büroserver eingerichtet oder praktisch bestätigt. |

**Verbindlicher Ablauf:** [N3-Buero-Umstellung.md](N3-Buero-Umstellung.md). Jeder Schritt trennt technische Evidenz von organisatorischer Vollständigkeit; Fehlprüfung hält die Sperre aufrecht.

## Übrige SPEKTRON-Anwendungen – nur lesende Prüfung

Geprüft wurden die festgeschriebenen Suite-Stände aus der vorhandenen Integration; keine Änderungen oder PRs in anderen Repositories. Das ist eine Architekturprüfung, kein separater Angriffsnachweis für jede Anwendung.

| Anwendung / Stand | Beobachtung / vergleichbares Risiko |
|---|---|
| Projektzentrale, F3 `e7b8c4e3819a4ce54fe2dc2ac91bb731e040896f` | `index.html` Updateprüfung über `APP_VERSION`; `sw.js` aktiviert/beansprucht sofort. Direkte Dateischreiber und gemeinsames `_Projekt.json`-Protokoll. Ein älterer offener Schreiber kann F3 ignorieren; sichere Fassungen und externe Umstellung bleiben nötig. |
| LabelKit (`labelkit`) `9495e373aa897577171c921e6b65b676e1a7c663` | Einzel-HTML mit `APP_VERSION` und mehreren `createWritable()`-Pfaden, kein Worker in diesem Stand gefunden. Schon geladener Code wird trotzdem nicht durch neue HTML-Dateien beendet. Direkte Projekt-/Exportwrites in Inventar und Sperre einbeziehen. |
| PlanKit (`Probenplan`) `5f577e702a430ac4614a4b77c13cd1f9d38e4b15` | Generierter Worker mit `skipWaiting`/`claim`; `src/folder.ts`, `annex-run.ts` schreiben über Dateihandles. Hashassets schützen die Bündelzuordnung, nicht gegen bereits laufende alte Schreiber. |
| BelegKit (`aufwandkit`) `51cafe37dd80f7d08c753ab5c4ea2959e2557d55` | `index.html` 1.4.1, `schreibJson`/weitere direkte Dateischreiber und sofort aktivierender Worker. Gleiche Grenze bei geöffneten Seiten und Offlineprofilen. |
| SpesenKit (`reisekosten-pro`) `30d74d63707b632c520f84032f3379c8f1c8ce74` | Buildbezogener Cache und Bereitschaftsabfrage sämtlicher bekannter Workerfenster vor aktiviertem Update. Besserer Eingabeschutz für teilnehmende Clients, aber weder profilübergreifender Nachweis noch Entzug alter Speicher-/Exportrechte. Reparaturpfad kann Fenster navigieren; gesondert abnehmen. Lokale Daten-/Exportpfade und alle Profile inventarisieren. |

Diese Befunde begründen suiteweite Umstellung und Prüfung. Sie behaupten nicht, dass alle Anwendungen denselben unbekannte-Felder-Fehler haben.

## Teststand und Grenzen

Reproduzierbare Prüfungen stehen in `.github/workflows/tests.yml` und `.github/workflows/n3-compatibility.yml`. [Aktuelle PR-Prüfungen](https://github.com/kaspersebastian83-dot/Bildumbenenner/pull/35/checks) enthalten die tatsächlichen Commit-/Laufzuordnungen; abgeschlossene Ergebnisse und Artefaktlinks werden im PR-Abschlussbericht geführt. Laufende Jobs sind kein bestandener Nachweis.

Lokal nachgewiesen: 22 F3-, 29 F6-, 21 N2- und 9 PDF-Node-Fälle; Laborwerte; Altclient-Angriff mit Feldverlust, bytegenaue N2-Wiederherstellung, bestehender gesperrter Stream, getrennte Profile, alter Offlinecache und tatsächliche ungespeicherte Eingaben bei abgebrochenem Update in Chromium und WebKit. Die sechs N3-Update-UX-Fälle je Engine prüfen außerdem gleiche Version/anderer Build, unveränderte geladene Identität, ungültige Antwort/503, Offlinehinweis und geschützten Modus. F6 umfasst zehn vollständige UI-Szenarien, PDF sieben je Engine ohne native API-Skips. Vollständige vorhandene Browsersuites laufen auf Einzelbranch und Kombination; native WebKit-Skips werden separat ausgewiesen. Gemeinsames F3-Protokoll ist bytegleich zur gepinnten Projektzentrale, die Cross-App-Wiederherstellung und die vollständige SPEKTRON-Produzenten-/Konsumenten-/Sicherheitsintegration wurden zusätzlich ausgeführt.

Die erste N3-CI fand einen Fehler im WebKit-Offline-Testaufbau (Playwright-Offlinemodus mit Worker-Navigation). Die korrigierte Prüfung trennt Netzverbindungen tatsächlich am Testserver, ohne Worker/Cache zu mocken oder die Altclient-Assertions zu überspringen. Lokal wurde außerdem der N3-Testserver korrigiert, damit er den unveränderten F3-Helfer als JavaScript ausliefert; synthetische bestätigte Fassungen werden erst nach vollständiger JSON-Lesbarkeit ausgewertet. Die folgende CI deckte zusätzlich einen unvollständigen Test-Dateifilter (temporäre Streamdatei als bestätigte JSON-Fassung erfasst) und eine noch laufende Ladenormalisierung beim Wiederherstellen auf. Temporäre Streamdateien tragen nun eigene versteckte Namen; die echte UI-Aktion „Fotos neu einlesen“ schließt Speicherqueues vor Angriff und Wiederherstellung ab. Zusätzliche Quellhash-Assertions erzwingen bytegleiches altes HTML und altes `sw.js`. Das sind Testfixture-Korrekturen; Produkt-Speicherlogik und bestehende F3/F6/N2/PDF-Assertions bleiben unverändert.

Lokale Chromiumläufe verwenden den vorhandenen System-Chromium; entfernte CI installiert die zu Playwright 1.56.1 gehörenden Browser. Lokal wird WebKit 2215 mit isoliert entpackten Systembibliotheken ausgeführt (keine Änderung des Browsercodes). Die globale `ldconfig`-Vorprüfung wird dort ausgelassen, weil die Bibliotheken nur im isolierten Browserverzeichnis liegen; echte Browserläufe bleiben verpflichtend. CI nutzt regulär installierte Systemabhängigkeiten.

Vorhandene Suites bleiben erhalten. N3 aktualisiert keine Speicherformate und verändert keine bestehenden PRs.

Nicht durch Cloudtests abgedeckt: reale Windows-Dateisperren, SMB-/DFS-/CSC-Caches, getrennte RDP-Sitzungen, Netzabbrüche am Büroserver, Stromverlust/physisches `fsync`, Vollständigkeit des Geräte-/Benutzerinventars. Neue Browsertests verwenden synthetische Dateihandles; bestehende Chromium-Fälle zusätzlich OPFS. WebKit besitzt weiterhin dokumentierte Skips bei nativen Ordner-/Exportfunktionen. Die N3-Angriffstests dürfen deswegen nicht übersprungen werden.
