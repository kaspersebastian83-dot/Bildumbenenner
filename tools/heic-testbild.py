# Künstliches HEIC für die Tests (kein Kundenfoto): python3 tools/heic-testbild.py tests/fixtures/testbild.heic
# Braucht: pip install pillow-heif piexif. Gespeichert 128 × 96 (quer) mit EXIF-Ausrichtung 6 – pillow-heif legt dafür
# im Container eine Drehung (irot) an, ein HEIF-Leser zeigt das Bild also hochkant (96 × 128).
# Vier Farbfelder, damit die Drehung prüfbar ist: gespeichert oben links rot, oben rechts grün, unten links blau, unten rechts weiß
# → nach der Drehung oben links blau, oben rechts rot, unten rechts grün, unten links weiß.
# EXIF: Hersteller „FotoKit-Test“, Modell „Kunstbild 1“, Aufnahme 03.11.2026 10:42:17, GPS (Aachen, erfunden); Farbprofil sRGB.
import sys, piexif
from PIL import Image, ImageCms
import pillow_heif
pillow_heif.register_heif_opener()

W, H = 128, 96
im = Image.new('RGB', (W, H))
px = im.load()
for y in range(H):
    for x in range(W):
        oben, links = y < H // 2, x < W // 2
        px[x, y] = (220, 30, 30) if oben and links else (30, 200, 30) if oben else (30, 30, 220) if links else (240, 240, 240)
exif = {'0th': {piexif.ImageIFD.Make: b'FotoKit-Test', piexif.ImageIFD.Model: b'Kunstbild 1', piexif.ImageIFD.Orientation: 6},
        'Exif': {piexif.ExifIFD.DateTimeOriginal: b'2026:11:03 10:42:17'},
        'GPS': {piexif.GPSIFD.GPSLatitudeRef: b'N', piexif.GPSIFD.GPSLatitude: ((50, 1), (46, 1), (1234, 100)),
                piexif.GPSIFD.GPSLongitudeRef: b'E', piexif.GPSIFD.GPSLongitude: ((6, 1), (5, 1), (5678, 100))}}
icc = ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB')).tobytes()
im.save(sys.argv[1], format='HEIF', exif=piexif.dump(exif), icc_profile=icc, quality=95)
print(sys.argv[1], 'geschrieben')
