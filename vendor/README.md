# Fremde Dateien (unverändert)

## libheif-bundle.js

- Herkunft: npm-Paket `libheif-js` **1.23.5**, Datei `libheif-wasm/libheif-bundle.js`
  (https://registry.npmjs.org/libheif-js/-/libheif-js-1.23.5.tgz,
  Integrität `sha512-umXZPthnWZtF3iG/5mQG+AZ2V6i0UeYpo3z2CkggTEgL8dKmIIwJT6TDuAMuabXa1yTW8uJ1ZAgR+CxNTklYYw==`).
- SHA-256 der Datei: `074b2b55ef3de477ba9f794ca381f3f0324c1cba8c91b4af07395f39c22d54cc`
  (geprüft von `tests/heic-umwandeln.cjs`).
- Inhalt: libheif (HEIF-Container) und libde265 (HEVC-Decoder) als WebAssembly, eingebettet.
- Lizenz: LGPL-3.0 – Texte in `LICENSE` (libheif/libde265) und `LICENSE-libheif-js` (Paket).
  Die Datei bleibt bytegleich und eigenständig; wer sie durch eine andere Fassung ersetzen will,
  tauscht nur diese Datei (FotoKit lädt sie über `heic-worker.js`).
- Wird nur geladen, wenn im Fotoordner HEIC/HEIF-Dateien liegen und umgewandelt werden.
  `sw.js` legt sie für den Offline-Betrieb mit in den Cache.
