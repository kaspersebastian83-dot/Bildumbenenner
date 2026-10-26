// Real app UIs and independent browser contexts over shared synthetic disk handles.
// Works in Chromium and WebKit; bridged filesystem properties are NOT native SMB evidence.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),http=require('node:http'),pw=require('playwright');
const root=path.resolve(__dirname,'..'),browserName=process.argv[2]||'chromium',peer=process.argv[3]&&path.resolve(process.argv[3]);
const PROJECT='26.0101 Fiktives Projekt',initial={format:'mosaik-projekt',version:1,projektnummer:'26.0101',objekt:'ALT',sachverstaendiger:'ALT',unknown:{deep:['erhalten']}};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
(async()=>{
const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'f3-browser-')),project=path.join(tmp,PROJECT),contexts=[],errors=[];
await fs.mkdir(path.join(project,'Fotos'),{recursive:true});
await fs.writeFile(path.join(project,'Fotos','IMG_0001.png'),Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64'));
const sources=[root,...(peer?[peer]:[])],central=await Promise.all(sources.map(async s=>(await fs.readFile(path.join(s,'index.html'),'utf8')).includes('function patchPJ(')));
const server=http.createServer(async(req,res)=>{try{
 const parts=decodeURIComponent(new URL(req.url,'http://x').pathname).split('/').filter(Boolean),i=Number(parts.shift()),src=sources[i];if(!src)throw Error('source');
 const f=path.resolve(src,parts.join('/')||'index.html');if(!f.startsWith(src+path.sep))throw Error('path');
 res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'})[path.extname(f)]||'application/octet-stream');res.end(await fs.readFile(f));
}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await pw[browserName].launch();
try{
async function page(source){
 const context=await browser.newContext({viewport:{width:1450,height:1100},serviceWorkers:'block'});contexts.push(context);
 const barrier={arrived:deferred(),release:deferred(),hold:false};
 await context.exposeBinding('__f3io',async(_,arg)=>{
  const f=path.resolve(tmp,arg.rel||'.');if(f!==tmp&&!f.startsWith(tmp+path.sep))throw Error('outside synthetic archive');
  try{switch(arg.op){
   case'dir':if(arg.create)await fs.mkdir(f,{recursive:true});if(!(await fs.stat(f)).isDirectory())throw Error('not directory');return true;
   case'file':if(arg.create)await fs.appendFile(f,'');if(!(await fs.stat(f)).isFile())throw Error('not file');return true;
   case'list':return(await fs.readdir(f,{withFileTypes:true})).map(e=>({name:e.name,kind:e.isDirectory()?'directory':'file'}));
   case'read':return Array.from(await fs.readFile(f));
   case'before':if(barrier.hold&&arg.rel===PROJECT+'/_Projekt.json'){barrier.arrived.resolve();await barrier.release.promise;}return true;
   case'write':await fs.writeFile(f,Buffer.from(arg.bytes));return true;
  }}catch(e){if(e.code==='ENOENT')return {missing:true};throw e;}
 });
 await context.addInitScript(({PROJECT,isCentral})=>{
  const io=async a=>{const r=await window.__f3io(a);if(r?.missing)throw new DOMException('Missing','NotFoundError');return r;};
  class Handle{constructor(rel,kind){this.rel=rel;this.kind=kind;this.name=rel.split('/').at(-1)||'F3 Testarchiv';}async queryPermission(){return'granted';}async requestPermission(){return'granted';}async isSameEntry(h){return h.rel===this.rel;}}
  class FH extends Handle{constructor(rel){super(rel,'file');}async getFile(){return new File([Uint8Array.from(await io({op:'read',rel:this.rel}))],this.name,{lastModified:1});}async createWritable(){let bytes;return{write:async v=>{await io({op:'before',rel:this.rel});bytes=typeof v==='string'?new TextEncoder().encode(v):v instanceof Blob?new Uint8Array(await v.arrayBuffer()):new Uint8Array(v);},close:async()=>io({op:'write',rel:this.rel,bytes:Array.from(bytes)}),abort:async()=>{}};}}
  class DH extends Handle{constructor(rel){super(rel,'directory');}child(n){return(this.rel?this.rel+'/':'')+n;}async getDirectoryHandle(n,o={}){const rel=this.child(n);await io({op:'dir',rel,create:o.create});return new DH(rel);}async getFileHandle(n,o={}){const rel=this.child(n);await io({op:'file',rel,create:o.create});return new FH(rel);}async *entries(){for(const e of await io({op:'list',rel:this.rel}))yield[e.name,e.kind==='directory'?new DH(this.child(e.name)):new FH(this.child(e.name))];}async *values(){for await(const[,h]of this.entries())yield h;}async resolve(h){const p=this.rel?this.rel+'/':'';return h.rel.startsWith(p)?h.rel.slice(p.length).split('/'):null;}}
  window.showDirectoryPicker=async()=>new DH(isCentral?'':PROJECT);
 },{PROJECT,isCentral:central[source]});
 const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
 const open=async()=>{
  await p.goto(base+'/'+source+'/index.html');
  if(central[source]){await p.locator('#btnStart, #btnArchive').first().click();await p.locator('.proj[data-name="'+PROJECT+'"]').click();await p.locator('#pj_objekt').waitFor({state:'attached'});}
  else{await p.locator('#btnOpen').click();await p.waitForFunction(()=>!document.getElementById('btnMeta').disabled);}
 };
 await open();return{p,context,barrier,open,source};
}
async function edit(s,key,value){
 if(central[s.source]){if(!await s.p.locator('#pjBox').evaluate(e=>e.open))await s.p.locator('#pjBox > summary').click();await s.p.locator('#pj_'+key).fill(value);}
 else{await s.p.locator('#btnMeta').click();await s.p.locator('#m_'+(key==='sachverstaendiger'?'sv':'objekt')).fill(value);await s.p.locator('#zCancel').click();}
}
for(const other of [0,...(peer?[1]:[])]){
 await fs.writeFile(path.join(project,'_Projekt.json'),JSON.stringify(initial));
 // A/B are separate storage partitions, not two tabs sharing a Web Lock.
 const A=await page(0),B=await page(other);A.barrier.hold=B.barrier.hold=true;
 await edit(A,'objekt','NEU A');await edit(B,'sachverstaendiger','NEU B');
 await Promise.all([A.barrier.arrived.promise,B.barrier.arrived.promise]);
 A.barrier.release.resolve();
 await A.p.locator('#moreDot').waitFor();   // 1.17: roter Punkt am „⋯ Mehr“-Knopf
 (await A.p.locator('#morePanel').isHidden()&&await A.p.locator('#btnMore').click());
 await A.p.locator('[data-pj-recovery]').filter({hasText:/abweichend/}).waitFor();
 // The recovery count is refreshed by the app only after the verified save returns.
 if(central[0])await A.p.locator('#pjSave.ok').waitFor();
 assert.equal(JSON.parse(await fs.readFile(path.join(project,'_Projekt.json'),'utf8')).objekt,'NEU A');
 B.barrier.release.resolve();
 (await B.p.locator('#morePanel').isHidden()&&await B.p.locator('#btnMore').click());await B.p.locator('[data-pj-recovery]').filter({hasText:/abweichend/}).waitFor();
 if(central[other])await B.p.locator('#pjSave.ok').waitFor();
 const main=JSON.parse(await fs.readFile(path.join(project,'_Projekt.json'),'utf8'));assert.equal(main.objekt,'ALT');assert.equal(main.sachverstaendiger,'NEU B');assert.deepEqual(main.unknown,initial.unknown);
 await A.context.close();await B.context.close();
 // A new browser context has no memory of either writer. Discover and explicitly
 // inspect A's full candidate through the application's actual recovery UI.
 const reopened=await page(other);
 (await reopened.p.locator('#morePanel').isHidden()&&await reopened.p.locator('#btnMore').click());await reopened.p.locator('[data-pj-recovery]').click();
 await reopened.p.locator('[data-pj-recovery-dialog]').waitFor();
 const choices=reopened.p.locator('[data-pj-recovery-dialog] button').filter({hasText:/Fassung prüfen:/});
 await choices.first().waitFor();
 let restored=false;
 for(let i=0;i<await choices.count();i++){
  await choices.nth(i).click();const row=choices.nth(i).locator('..');
  const candidate=JSON.parse(await row.locator('textarea').inputValue());
  if(candidate.objekt==='NEU A'){assert.equal(candidate.sachverstaendiger,'ALT');await row.locator('[data-pj-restore]').click();restored=true;break;}
 }
 assert.ok(restored,'A candidate is discoverable and selectable after restart');
 await reopened.p.locator('[data-pj-recovery-dialog]').waitFor({state:'detached'});
 const now=JSON.parse(await fs.readFile(path.join(project,'_Projekt.json'),'utf8'));assert.equal(now.objekt,'NEU A');assert.equal(now.sachverstaendiger,'ALT','no semantic merge on recovery');
 const saved=await fs.readdir(path.join(project,'_Projekt_Sicherungen'));assert.ok(saved.filter(n=>n.startsWith('kandidat_')).length>=3);
 await reopened.context.close();
 console.log('OK',browserName,'actual UI independent race and recovery:',central[0]?'Projektzentrale':'FotoKit','→',central[other]?'Projektzentrale':'FotoKit');
 // Keep each interleaving independent.
 await fs.rm(path.join(project,'_Projekt_Sicherungen'),{recursive:true});
}
assert.deepEqual(errors,[]);
}finally{await Promise.all(contexts.map(c=>c.close().catch(()=>{})));await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));await fs.rm(tmp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exit(1);});
