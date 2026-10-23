"""Lossless PDF RGB/alpha streams from the unchanged original PNG; no runtime asset fetch."""
from pathlib import Path
from PIL import Image
import base64,hashlib,json,re,zlib

root=Path(__file__).resolve().parents[1]
asset=root/'assets'/'firmenlogo.png'
im=Image.open(asset).convert('RGBA')
rgb=im.convert('RGB').tobytes()
alpha=im.getchannel('A').tobytes()
data={'source':'reisekosten-pro/lib/assets/firmenlogo.png@30d74d63707b632c520f84032f3379c8f1c8ce74',
      'sha256':hashlib.sha256(asset.read_bytes()).hexdigest(),
      'width':im.width,'height':im.height,
      'rgb':base64.b64encode(zlib.compress(rgb,9)).decode(),
      'alpha':base64.b64encode(zlib.compress(alpha,9)).decode()}
source=root/'index.html'
text=source.read_text(encoding='utf-8')
literal='const PDF_BRAND_LOGO = '+json.dumps(data,separators=(',',':'))+';'
text,count=re.subn(r'const PDF_BRAND_LOGO = [^\n]*;',lambda _:literal,text)
if count!=1:raise RuntimeError('Expected one generated logo constant')
source.write_text(text,encoding='utf-8',newline='\n')
print(json.dumps({'sha256':data['sha256'],'originalBytes':asset.stat().st_size,
                  'pdfStreamBytes':len(zlib.compress(rgb,9))+len(zlib.compress(alpha,9))}))
