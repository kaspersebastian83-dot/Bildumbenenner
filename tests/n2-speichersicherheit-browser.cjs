// Two isolated browser contexts, real FotoKit UI, shared SYNTHETIC disk bridge.
// Browser handle semantics here are a test double, not proof of SMB durability.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),http=require('node:http'),pw=require('playwright');
const {fixture}=require('./n2-speichersicherheit.cjs');
const root=path.resolve(__dirname,'..'),browserName=process.argv[2]||'chromium';
const PROJECT='26.0202 N2 Synthetisch',FILE=PROJECT+'/Fotos/_Bildumbenenner.json',ARCHIVE=PROJECT+'/Fotos/_FotoKit_Fassungen';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
(async()=>{
const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'n2-browser-')),contexts=[],errors=[];
await fs.mkdir(path.join(tmp,PROJECT,'Fotos'),{recursive:true});
const initial=fixture();initial.projekt.proj='26.0202';
await fs.writeFile(path.join(tmp,FILE),JSON.stringify(initial));
const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
for(const n of ['a.jpg','b.jpg'])await fs.writeFile(path.join(tmp,PROJECT,'Fotos',n),image);
const server=http.createServer(async(req,res)=>{try{const f=path.resolve(root,'.'+new URL(req.url,'http://x').pathname);if(!f.startsWith(root+path.sep))throw Error('path');res.setHeader('Content-Type',f.endsWith('.html')?'text/html; charset=utf-8':f.endsWith('.js')?'application/javascript':'application/octet-stream');res.end(await fs.readFile(f));}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port+'/index.html';
const browser=await pw[browserName].launch();
try{
async function page(){
 const context=await browser.newContext({viewport:{width:1400,height:1000},serviceWorkers:'block'});contexts.push(context);
 const barrier={arrived:deferred(),release:deferred(),hold:false};
 await context.exposeBinding('__n2io',async(_,arg)=>{
  const f=path.resolve(tmp,arg.rel||'.');if(f!==tmp&&!f.startsWith(tmp+path.sep))throw Error('outside synthetic folder');
  try{switch(arg.op){
   case'dir':if(arg.create)await fs.mkdir(f,{recursive:true});if(!(await fs.stat(f)).isDirectory())throw Error('not directory');return true;
   case'file':if(arg.create)await fs.appendFile(f,'');if(!(await fs.stat(f)).isFile())throw Error('not file');return true;
   case'list':return(await fs.readdir(f,{withFileTypes:true})).map(e=>({name:e.name,kind:e.isDirectory()?'directory':'file'}));
   case'read':return Array.from(await fs.readFile(f));
   case'before':if(barrier.hold&&arg.rel===FILE){barrier.arrived.resolve();await barrier.release.promise;barrier.hold=false;}return true;
   case'write':await fs.writeFile(f,Buffer.from(arg.bytes));return true;
   case'remove':await fs.rm(f,{recursive:!!arg.recursive});return true;
   case'move':{const to=path.resolve(tmp,arg.to);if(!to.startsWith(tmp+path.sep))throw Error('outside synthetic folder');try{await fs.stat(to);throw Error('target exists');}catch(e){if(e.code!=='ENOENT')throw e;}await fs.rename(f,to);return true;}
  }}catch(e){if(e.code==='ENOENT')return{missing:true};throw e;}
 });
 await context.addInitScript(({PROJECT})=>{
  const io=async a=>{const r=await window.__n2io(a);if(r?.missing)throw new DOMException('Missing','NotFoundError');return r;};
  class Handle{constructor(rel,kind){this.rel=rel;this.kind=kind;this.name=rel.split('/').at(-1)||'N2 Testarchiv';}async queryPermission(){return'granted';}async requestPermission(){return'granted';}async isSameEntry(h){return h.rel===this.rel;}}
  class FH extends Handle{constructor(rel){super(rel,'file');}async getFile(){return new File([Uint8Array.from(await io({op:'read',rel:this.rel}))],this.name,{lastModified:1});}async move(dst,name){const parent=typeof dst==='string'?this.rel.split('/').slice(0,-1).join('/'):dst.rel;name=typeof dst==='string'?dst:name;const to=parent+'/'+name;await io({op:'move',rel:this.rel,to});this.rel=to;this.name=name;}async createWritable(){let bytes;return{write:async v=>{await io({op:'before',rel:this.rel});bytes=typeof v==='string'?new TextEncoder().encode(v):v instanceof Blob?new Uint8Array(await v.arrayBuffer()):new Uint8Array(v);},close:async()=>io({op:'write',rel:this.rel,bytes:Array.from(bytes)}),abort:async()=>{}};}}
  class DH extends Handle{constructor(rel){super(rel,'directory');}child(n){return(this.rel?this.rel+'/':'')+n;}async getDirectoryHandle(n,o={}){const rel=this.child(n);await io({op:'dir',rel,create:o.create});return new DH(rel);}async getFileHandle(n,o={}){const rel=this.child(n);await io({op:'file',rel,create:o.create});return new FH(rel);}async removeEntry(n,o={}){return io({op:'remove',rel:this.child(n),recursive:o.recursive});}async *entries(){for(const e of await io({op:'list',rel:this.rel}))yield[e.name,e.kind==='directory'?new DH(this.child(e.name)):new FH(this.child(e.name))];}async *values(){for await(const[,h]of this.entries())yield h;}async resolve(h){const prefix=this.rel?this.rel+'/':'';return h.rel.startsWith(prefix)?h.rel.slice(prefix.length).split('/'):null;}}
  window.showDirectoryPicker=async()=>new DH(PROJECT);
 },{PROJECT});
 const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(base);await p.locator('#btnOpen').click();await p.waitForFunction(()=>!document.body.inert&&!document.getElementById('btnMeta').disabled);return{p,context,barrier};
}
async function confirmed(description){
 const deadline=Date.now()+15000;
 while(Date.now()<deadline){
  for(const n of await fs.readdir(path.join(tmp,ARCHIVE)).catch(()=>[]))if(n.startsWith('bestaetigt_')){
   const bytes=await fs.readFile(path.join(tmp,ARCHIVE,n));try{const value=JSON.parse(bytes);if(Object.values(value.bilder).some(v=>v.beschreibung===description))return bytes;}catch{}
  }
  await new Promise(r=>setTimeout(r,30));
 }
 throw Error('No confirmed complete version for '+description);
}
const A=await page(),B=await page();A.barrier.hold=B.barrier.hold=true;
await A.p.locator('#list .desc').nth(0).fill('N2 A bestätigt');await B.p.locator('#list .desc').nth(1).fill('N2 B bestätigt');
await Promise.all([A.barrier.arrived.promise,B.barrier.arrived.promise]);
A.barrier.release.resolve();const aBytes=await confirmed('N2 A bestätigt');assert.equal(JSON.parse(await fs.readFile(path.join(tmp,FILE))).bilder['a.jpg'].beschreibung,'N2 A bestätigt');
B.barrier.release.resolve();const bBytes=await confirmed('N2 B bestätigt');assert.equal(JSON.parse(await fs.readFile(path.join(tmp,FILE))).bilder['a.jpg'].beschreibung,'alt A');
await A.context.close();await B.context.close();
const restarted=await page();
async function restore(description,exact){
 await restarted.p.locator('#btnVersions').click();await restarted.p.locator('[data-photo-version]').first().waitFor();
 const total=await restarted.p.locator('[data-photo-version]').count();let selected=false;
 for(let i=0;i<total;i++){
  const row=restarted.p.locator('[data-photo-version]').nth(i).locator('..');
  if(!/Nach dem Schreiben bestätigt/.test(await row.textContent()))continue;
  await row.locator('button').click();const data=JSON.parse(await restarted.p.locator('#vPreview').textContent());
  if(Object.values(data.bilder).some(v=>v.beschreibung===description)){selected=true;await restarted.p.locator('#vRestore').click();break;}
  await restarted.p.locator('#vBack').click();await restarted.p.locator('[data-photo-version]').first().waitFor();
 }
 assert.ok(selected,'confirmed version selectable after restart');
 await restarted.p.locator('#overlay').waitFor({state:'hidden'});
 await restarted.p.locator('#banner').filter({hasText:/bytegenau wiederhergestellt/}).waitFor();
 assert.deepEqual(await fs.readFile(path.join(tmp,FILE)),exact,'explicit recovery writes exact full snapshot');
 for(const n of ['a.jpg','b.jpg'])assert.deepEqual(await fs.readFile(path.join(tmp,PROJECT,'Fotos',n)),image,'original image untouched');
}
await restore('N2 A bestätigt',aBytes);await restore('N2 B bestätigt',bBytes);
const data=JSON.parse(await fs.readFile(path.join(tmp,FILE)));assert.deepEqual(data.extension,initial.extension);assert.deepEqual(data.bilder['a.jpg'].future,initial.bilder['a.jpg'].future);assert.equal(data.bilder['b.jpg'].original.custom,9);
await restarted.context.close();
// A second interleaving performs real UI rename operations on disjoint images.
// Both original byte sequences and both remapped full metadata proposals must survive.
const empty=fixture();empty.projekt.proj='26.0202';empty.bilder['a.jpg'].beschreibung='';empty.bilder['b.jpg'].beschreibung='';
await fs.writeFile(path.join(tmp,FILE),JSON.stringify(empty));
const C=await page(),D=await page();C.barrier.hold=D.barrier.hold=true;
await C.p.locator('#list .desc').nth(0).fill('N2 Umbenennung A');await D.p.locator('#list .desc').nth(1).fill('N2 Umbenennung B');
await Promise.all([C.barrier.arrived.promise,D.barrier.arrived.promise]);
await C.p.locator('#btnRename').click();await C.p.locator('#dOk').click();
await D.p.locator('#btnRename').click();await D.p.locator('#dOk').click();
async function until(check){const end=Date.now()+15000;while(Date.now()<end){if(await check())return;await new Promise(r=>setTimeout(r,30));}throw Error('Synthetic rename did not finish');}
const newA='01_N2_Umbenennung_A.jpg',newB='02_N2_Umbenennung_B.jpg';
await until(async()=>{try{await fs.stat(path.join(tmp,PROJECT,'Fotos',newA));await fs.stat(path.join(tmp,PROJECT,'Fotos',newB));return true;}catch{return false;}});
C.barrier.release.resolve();await confirmed('N2 Umbenennung A');D.barrier.release.resolve();await confirmed('N2 Umbenennung B');
await until(async()=>{
 const candidates=[];
 for(const n of await fs.readdir(path.join(tmp,ARCHIVE)))try{candidates.push(JSON.parse(await fs.readFile(path.join(tmp,ARCHIVE,n))));}catch{}
 return candidates.some(v=>v.bilder[newA]?.beschreibung==='N2 Umbenennung A'&&v.bilder[newA]?.future?.x===1)&&candidates.some(v=>v.bilder[newB]?.beschreibung==='N2 Umbenennung B'&&v.bilder[newB]?.original?.custom===9);
});
for(const n of [newA,newB])assert.deepEqual(await fs.readFile(path.join(tmp,PROJECT,'Fotos',n)),image,'concurrent renames preserve original bytes');
console.log('PASS N2 '+browserName+': simultaneous disjoint image renames retain both original images and full remapped proposals');
assert.deepEqual(errors,[]);
console.log('PASS N2 '+browserName+': independent sessions, deterministic overlap, both full confirmed versions explicitly restored through UI after restart; F6 fields and originals retained');
}finally{await Promise.all(contexts.map(c=>c.close().catch(()=>{})));await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));await fs.rm(tmp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
