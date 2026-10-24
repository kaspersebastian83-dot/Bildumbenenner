const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm'),zlib=require('node:zlib'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const marker='/* ---------- PDF annex:',start=html.indexOf(marker),end=html.indexOf('async function doPdf(meta)',start);
assert.ok(start>0&&end>start);
const outside=s=>s.slice(0,s.indexOf(marker))+s.slice(s.indexOf('async function doPdf(meta)',s.indexOf(marker)));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function parse(data){
 const b=Buffer.from(data),s=b.toString('latin1'),at=Number(/startxref\n(\d+)\n%%EOF/.exec(s)[1]),lines=s.slice(at).split('\n');assert.equal(lines[0],'xref');
 const offsets=Array.from({length:Number(lines[1].split(' ')[1])},(_,i)=>Number(lines[i+2].slice(0,10)));
 const obj=n=>{assert.ok(s.startsWith(`${n} 0 obj\n`,offsets[n]));return s.slice(offsets[n],s.indexOf('\nendobj',offsets[n]));};
 const stream=o=>{const a=o.indexOf('stream\n')+7;return Buffer.from(o.slice(a,a+Number(/\/Length (\d+)/.exec(o)[1])),'latin1');};
 const texts=o=>[...o.matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)].map(m=>m[1].replace(/\\([0-7]{1,3}|.)/g,(_,x)=>/^[0-7]+$/.test(x)?String.fromCharCode(parseInt(x,8)):x));
 const pages=/\/Kids \[([^\]]+)\]/.exec(obj(2))[1].match(/\d+ 0 R/g).map(r=>{const p=obj(Number(r.split(' ')[0])),ops=stream(obj(Number(/\/Contents (\d+) 0 R/.exec(p)[1]))).toString('latin1');return{p,ops,text:texts(ops)};});
 const objects=offsets.slice(1).map((_,i)=>obj(i+1));return{b,s,obj,stream,pages,objects,photos:objects.filter(o=>o.includes('/DCTDecode')).map(stream)};
}
function check(data,expected){
 const pdf=parse(data);assert.ok(pdf.pages.length>=2);
 const logos=new Set();pdf.pages.forEach((p,i)=>{
  assert.ok(p.text.includes('Bilddokumentation'));assert.ok(p.text.includes('Dr. Schiffers & Partner'));assert.ok(p.text.includes(`Seite ${i+1} von ${pdf.pages.length}`));
  // Kopf-Logo auf jeder Seite; das helle Firmenzeichen (Wasserzeichen) nur auf dem Deckblatt.
  assert.equal((p.ops.match(/\/BrandLogo Do/g)||[]).length,i===0?2:1);if(i===0)assert.match(p.ops,/^q \/Watermark gs /);else assert.doesNotMatch(p.ops,/\/Watermark gs/);logos.add(/\/BrandLogo (\d+) 0 R/.exec(p.p)[1]);
  const photoRefs=new Map([...p.p.matchAll(/\/Im(\d+) (\d+) 0 R/g)].map(m=>[m[1],pdf.obj(Number(m[2]))]));
  for(const m of p.ops.matchAll(/([\d.]+) 0 0 ([\d.]+) ([\d.]+) ([\d.]+) cm \/Im(\d+) Do/g)){
   const[w,h,x,y]=m.slice(1,5).map(Number),o=photoRefs.get(m[5]),iw=Number(/\/Width (\d+)/.exec(o)[1]),ih=Number(/\/Height (\d+)/.exec(o)[1]);
   assert.ok(Math.abs(w/h-iw/ih)<.002,'Photo aspect preserved');assert.ok(x>=56&&x+w<=540&&y>=76&&y+h<=750,'Photo stays in body');
  }
  for(const m of p.ops.matchAll(/([\d.-]+) ([\d.-]+) Td/g)){const[x,y]=m.slice(1).map(Number);assert.ok(x>=50&&x<=540&&y>=28&&y<=810,'Text remains within page');}
 });
 assert.equal(logos.size,1,'Logo embedded once, shared by all pages');
 const logo=pdf.obj(Number([...logos][0])),alpha=pdf.obj(Number(/\/SMask (\d+) 0 R/.exec(logo)[1]));
 const rgb=zlib.inflateSync(pdf.stream(logo)),a=zlib.inflateSync(pdf.stream(alpha)),rgba=Buffer.alloc(a.length*4);for(let i=0;i<a.length;i++){rgb.copy(rgba,i*4,i*3,i*3+3);rgba[i*4+3]=a[i];}
 assert.equal(hash(rgba),'3919168f0ec0f684f8f434bc94beb1c99be3551db1aec833a425ec965307a54e','Lossless original logo incl. alpha');assert.ok(pdf.s.includes('/ca 0.035 /CA 0.035'));
 const numbers=pdf.pages.flatMap(p=>p.text.filter(t=>/^Bild \d+$/.test(t)).map(t=>Number(t.slice(5))));
 // Sampling rows repeat numbers; the photo badge appears first before its description.
 const badges=pdf.pages.filter(p=>/\/Im\d+ Do/.test(p.ops)).flatMap(p=>p.text.filter(t=>/^Bild \d+$/.test(t)).map(t=>Number(t.slice(5))));assert.deepEqual(badges,expected);
 return pdf;
}
const meta=()=>({anlage:'Anlage B1',proj:'26.0101',objekt:'Fiktives Objekt \u00c4\u00d6\u00dc \u00df \u20ac',ereignis:'Synthetischer Test',sdatum:'2026-10-12',ort:'2026-10-22',sv:'Dipl.-Ing. Beispiel',img:{shrink:false,edge:1600,q:90},pdf:{perPage:2,maxMB:14,secPage:false}});
const items=n=>Array.from({length:n},(_,i)=>({name:`Bild_${i}.jpg`,final:`Bild_${i}.jpg`,ext:'.jpg',desc:`Motiv ${i+1} \u00e4\u00f6\u00fc \u00df \u20ac (Details)`,secEff:i<2?'Au\u00dfen':'Innen',probe:'',docNr:i+1,date:new Date('2026-10-22T09:30:00Z'),dateSrc:'Datei',handle:{getFile:async()=>({i})}}));
function harness(renderJpeg){const c={Blob,TextEncoder,Uint8Array,atob,APP_NAME:'FotoKit',APP_VERSION:'1.9.4',store:{get:()=>({})},docBaseName:()=> 'Muster',fmtDate:()=> '22.10.2026',fmtTime:()=> '09:30',deDate:x=>x,renderJpeg,canRotate:()=>true,rotOf:()=>0};vm.runInNewContext(html.slice(start,end)+'\nthis.build=buildAnnex;',c);return c.build;}
const LONG_TEXT_MARKERS = ['ENDEBILD', 'ENDEABSCHNITT', 'ENDEOBJEKT'];
function assertLongText(text){
 for(const marker of LONG_TEXT_MARKERS)assert.ok(text.includes(marker),`Missing long-text marker: ${marker}`);
 // Independent from the completeness assertions above.
 assert.ok(text.includes('\u00c4\u00d6\u00dc'),'German special characters retained');
}
async function run(){
 const jpeg=Buffer.from([255,216,255,217]);let calls=[];
 const build=harness(async(f,r,e,q)=>{calls.push([f.i,r,e,q]);return{data:jpeg,w:f.i%2?600:1200,h:f.i%2?1200:600};});let cases=0;
 const test=async(title,fn)=>{await fn();cases++;console.log('OK PDF: '+title);};
 for(const n of[1,5,50,150])await test(n+' photos; two orientations, shared logo, page numbers, original JPEG bytes',async()=>{const m=meta(),its=items(n),before=JSON.stringify(its),r=await build(m,its,()=>{});assert.equal(r.parts.length,1);const p=check(await r.parts[0].blob.arrayBuffer(),its.map(i=>i.docNr));assert.equal(p.photos.length,n);for(const b of p.photos)assert.deepEqual(b,jpeg);assert.equal(JSON.stringify(its),before);assert.ok(p.b.length<60000+n*8000,'Bounded logo and layout overhead');});
 await test('Selected document numbers and one photo per page',async()=>{const m=meta();m.pdf.perPage=1;const a=items(3);a.forEach((i,k)=>i.docNr=[1,3,7][k]);const r=await build(m,a,()=>{});const p=check(await r.parts[0].blob.arrayBuffer(),[1,3,7]);assert.ok(p.pages.every(p=>(p.ops.match(/\/Im\d+ Do/g)||[]).length<=1));});
 await test('Long captions, project fields and section names flow without losing final markers',async()=>{const m=meta(),a=items(2);a[0].desc=('Lange Beschreibung \u00c4\u00d6\u00dc \u00df \u20ac '.repeat(500))+'ENDEBILD';a[0].secEff=('Abschnitt '.repeat(80))+'ENDEABSCHNITT';a[0].probe='P1';m.objekt=('Objektadresse '.repeat(200))+'ENDEOBJEKT';const r=await build(m,a,()=>{}),p=check(await r.parts[0].blob.arrayBuffer(),[1,2]),t=p.pages.flatMap(p=>p.text).join(' ');assertLongText(t);
 for(const marker of LONG_TEXT_MARKERS){
  const incomplete=t.replaceAll(marker,'');
  for(const other of LONG_TEXT_MARKERS.filter(value=>value!==marker))assert.ok(incomplete.includes(other));
  assert.ok(incomplete.includes('\u00c4\u00d6\u00dc'),'Mutation retains special characters');
  assert.throws(()=>assertLongText(incomplete),{code:'ERR_ASSERTION',message:`Missing long-text marker: ${marker}`});
  console.log(`OK PDF mutation: removing ${marker} from exported text triggers its own assertion`);
 }
});
 await test('Existing image preparation options unchanged',async()=>{calls=[];const m=meta();m.img={shrink:true,edge:2000,q:80};await build(m,items(1),()=>{});assert.deepEqual(calls,[[0,0,2000,.8]]);calls=[];m.img.shrink=false;await build(m,items(1),()=>{});assert.deepEqual(calls,[[0,0,null,.92]]);});
 await test('Unreadable image produces visible placeholder and preserves list number',async()=>{const a=items(1);a[0].final='X'.repeat(5000)+'ENDEDATENAME';const r=await harness(async()=>null)(meta(),a,()=>{});assert.equal(r.failed.length,1);const p=check(await r.parts[0].blob.arrayBuffer(),[]);assert.ok(p.pages.flatMap(p=>p.text).join(' ').includes('Bilddatei'));assert.ok(p.pages.flatMap(p=>p.text).includes('Bild 1'));assert.ok(p.pages.flatMap(p=>p.text).join(' ').includes('ENDEDATENAME'),'Full filename retained in flowing details');});
 await test('Real byte limit splits parts; no photo lost',async()=>{const m=meta();m.pdf.maxMB=1;const a=items(8),r=await harness(async()=>({data:Buffer.alloc(240000),w:800,h:600}))(m,a,()=>{});assert.ok(r.parts.length>1);let total=0;for(const p of r.parts){assert.ok(p.blob.size<=1e6);total+=parse(await p.blob.arrayBuffer()).photos.length;}assert.equal(total,8);});
 console.log(cases+' PDF Node regressions passed');
}
module.exports={parse,check,meta,items,root,html,start,end,outside,hash};if(require.main===module)run().catch(e=>{console.error(e);process.exitCode=1;});
