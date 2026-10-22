// Mandatory old/new attack: REAL old HTML and REAL service-worker lifecycle.
// Shared synthetic disk handles, no real project data, no native Windows claim.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),http=require('node:http'),pw=require('playwright');
const bridge=require('./n3-disk-bridge.cjs');
const root=path.resolve(__dirname,'..'),old=path.resolve(process.env.N3_OLD_ROOT||''),engine=process.argv[2]||'chromium';
assert.ok(process.env.N3_OLD_ROOT,'N3_OLD_ROOT must be an unmodified pre-F6 checkout');
const PROJECT='26.0303 N3 Synthetisch',FILE=PROJECT+'/Fotos/_Bildumbenenner.json',ARCHIVE=PROJECT+'/Fotos/_FotoKit_Fassungen';
const hash=b=>require('node:crypto').createHash('sha256').update(b).digest('hex');
const initial={app:'Bildumbenenner',format:1,version:'1.9.5',projekt:{},benennung:{},reihenfolge:['a.jpg','b.jpg'],bilder:{'a.jpg':{beschreibung:'alt A'},'b.jpg':{beschreibung:'alt B'}}};
(async()=>{
const oldHTML=await fs.readFile(path.join(old,'index.html'),'utf8');
assert.ok(oldHTML.includes("const APP_VERSION = '1.9.5'"));assert.ok(!oldHTML.includes('const unknownFields'),'must be real pre-F6 code');
assert.ok(!oldHTML.includes('const APP_BUILD ='),'old client must not contain N3');
const pageErrors=[];
const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'n3-attack-')),contexts=[],evidence={engine,oldHTML:hash(oldHTML),events:[]};
await fs.mkdir(path.join(tmp,PROJECT,'Fotos'),{recursive:true});await fs.writeFile(path.join(tmp,FILE),JSON.stringify(initial));
const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
for(const n of ['a.jpg','b.jpg'])await fs.writeFile(path.join(tmp,PROJECT,'Fotos',n),image);
let serving=old,fenced=false,heldClose=null,releaseClose,networkDown=false;
const server=http.createServer(async(req,res)=>{if(networkDown){req.socket.destroy();return;}try{const name=new URL(req.url,'http://x').pathname.replace(/^\/+/, '')||'index.html',f=path.resolve(serving,name);if(!f.startsWith(serving+path.sep))throw Error('path');res.setHeader('Content-Type',f.endsWith('.html')?'text/html; charset=utf-8':f.endsWith('.js')?'application/javascript':'application/octet-stream');res.setHeader('Cache-Control','no-store');res.end(await fs.readFile(f));}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://localhost:'+server.address().port+'/index.html';
const browser=await pw[engine].launch();
async function until(fn){const end=Date.now()+20000;while(Date.now()<end){if(await fn())return;await new Promise(r=>setTimeout(r,40));}throw Error('condition timed out');}
const disk=()=>fs.readFile(path.join(tmp,FILE),'utf8'),json=async()=>JSON.parse(await disk());
async function page(openProject=true){
 const context=await browser.newContext({viewport:{width:1400,height:1000}});contexts.push(context);
 await context.exposeBinding('__n3io',async(_,arg)=>{
  const f=path.resolve(tmp,arg.rel||'.');if(f!==tmp&&!f.startsWith(tmp+path.sep))throw Error('outside synthetic folder');
  if(arg.op==='write'&&arg.rel===FILE&&heldClose){heldClose();await new Promise(r=>releaseClose=r);}
  // External storage authority, checked at commit too, including existing handles.
  if(fenced&&(['write','remove','move'].includes(arg.op)||arg.create))throw Error('External synthetic maintenance fence: AccessDenied');
  try{switch(arg.op){
   case'dir':if(arg.create)await fs.mkdir(f,{recursive:true});if(!(await fs.stat(f)).isDirectory())throw Error('not dir');return true;
   case'file':if(arg.create)await fs.appendFile(f,'');if(!(await fs.stat(f)).isFile())throw Error('not file');return true;
   case'list':return(await fs.readdir(f,{withFileTypes:true})).map(e=>({name:e.name,kind:e.isDirectory()?'directory':'file'}));
   case'read':return Array.from(await fs.readFile(f));
   case'before':return true;
   case'write':{const candidate=f+'.stream-'+require('node:crypto').randomUUID();await fs.writeFile(candidate,Buffer.from(arg.bytes));await fs.rename(candidate,f);return true;}
   case'remove':await fs.rm(f,{recursive:!!arg.recursive});return true;
  }}catch(e){if(e.code==='ENOENT')return{missing:true};throw e;}
 });
 await bridge(context,PROJECT);const p=await context.newPage();p.on('pageerror',e=>pageErrors.push(e.message));await p.goto(base);if(openProject){await p.locator('#btnOpen').click();await p.waitForFunction(()=>!document.body.inert&&!document.getElementById('btnMeta').disabled);}return{p,context};
}
async function openRecovery(p,exact){
 await p.locator('#btnVersions').click();await p.locator('[data-photo-version]').first().waitFor();let found=false;
 for(let i=0;i<await p.locator('[data-photo-version]').count();i++){
  const row=p.locator('[data-photo-version]').nth(i).locator('..');if(!/Nach dem Schreiben bestätigt/.test(await row.textContent()))continue;
  await row.locator('button').click();if(await p.locator('#vPreview').textContent()===exact){found=true;await p.locator('#vRestore').click();break;}
  await p.locator('#vBack').click();await p.locator('[data-photo-version]').first().waitFor();
 }
 assert.ok(found,'N2 complete confirmed B version discoverable after old overwrite');await p.locator('#overlay').waitFor({state:'hidden'});await until(async()=>await disk()===exact);
}
try{
const A=await page();await A.p.evaluate(async()=>{await navigator.serviceWorker.ready;});await A.p.waitForFunction(()=>!!navigator.serviceWorker.controller);
await A.p.locator('#list .desc').nth(0).fill('A initial save complete');
await until(async()=>(await json()).bilder['a.jpg'].beschreibung==='A initial save complete');
await A.p.evaluate(async()=>{const c=await caches.open('n3-unrelated-app');await c.put('/unrelated-proof',new Response('keep'));});
const aIdentity=await A.p.locator('#btnInfo').textContent();evidence.events.push({step:'A loaded before F6',aIdentity});
// Seed extension fields supplied by another suite producer, then B must write them.
const extended=structuredClone(initial);extended.extension={opaque:['F6',false,{value:42}]};extended.projekt.custom={keep:true};extended.benennung.custom=7;extended.bilder['a.jpg'].future={nested:['must survive',9]};extended.bilder['b.jpg'].original={name:'b.jpg',custom:9};
await fs.writeFile(path.join(tmp,FILE),JSON.stringify(extended));serving=root;
const B=await page();await B.p.locator('#list .desc').nth(1).fill('B F6 bestätigt');
let confirmedB;
await until(async()=>{for(const n of await fs.readdir(path.join(tmp,ARCHIVE)).catch(()=>[])){if(!n.startsWith('bestaetigt_'))continue;const text=await fs.readFile(path.join(tmp,ARCHIVE,n),'utf8');let value;try{value=JSON.parse(text);}catch(e){if(e instanceof SyntaxError)continue;throw e;}if(value.bilder['b.jpg'].beschreibung==='B F6 bestätigt'){confirmedB=text;return true;}}return false;});
const written=JSON.parse(confirmedB);assert.deepEqual(written.extension,extended.extension);assert.deepEqual(written.bilder['a.jpg'].future,extended.bilder['a.jpg'].future);evidence.confirmedB=hash(confirmedB);
// The real old registration fetches and activates the NEW sw.js; A stays open.
await A.p.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();window.n3ControllerChanges=0;navigator.serviceWorker.addEventListener('controllerchange',()=>window.n3ControllerChanges++);await r.update();});
await A.p.waitForFunction(()=>window.n3ControllerChanges>0);assert.equal(await A.p.locator('#btnInfo').textContent(),aIdentity);
assert.ok((await A.p.evaluate(()=>caches.keys())).includes('n3-unrelated-app'),'unrelated browser cache retained');
assert.ok((await A.p.evaluate(()=>caches.keys())).some(k=>k.endsWith(':v2')),'old own cache retained, no browser data cleanup');
assert.equal(await A.p.locator('#buildStatus').count(),0,'SW did not install new JS in old tab');
await A.p.locator('#list .desc').nth(0).fill('A nach Service-Worker-Update');
await until(async()=>(await json()).bilder['a.jpg'].beschreibung==='A nach Service-Worker-Update');
const damaged=await json();assert.equal(damaged.extension,undefined);assert.equal(damaged.bilder['a.jpg'].future,undefined);assert.equal(damaged.bilder['b.jpg'].original.custom,undefined);
evidence.afterOldSave=damaged;
evidence.beforeOldSave=written;
evidence.events.push({step:'A saved after actual SW activation',topFieldRemoved:true,imageFieldRemoved:true,originalExtensionRemoved:true,controllerChanges:await A.p.evaluate(()=>window.n3ControllerChanges)});
console.log('PASS N3 ATTACK: real pre-F6 tab survives SW update and removes unknown fields');
await B.context.close();const restarted=await page();await openRecovery(restarted.p,confirmedB);assert.equal(await disk(),confirmedB);
console.log('PASS N3 RECOVERY: confirmed B snapshot remains discoverable and restores exact bytes after restart');
// Hold an old-client writable until the authority denies commits, not only opens.
let arrived;const atCommit=new Promise(r=>arrived=r);heldClose=arrived;
await A.p.locator('#list .desc').nth(0).fill('A existing writable denied');await atCommit;const beforeFence=await disk();fenced=true;heldClose=null;releaseClose();
await A.p.locator('#banner').filter({hasText:/nicht gespeichert|konnte nicht gespeichert/}).waitFor();assert.equal(await disk(),beforeFence);
evidence.events.push({step:'external synthetic authority denies commit on existing stream',unchanged:true});
console.log('PASS N3 FENCE MODEL: external commit denial blocks existing old-client stream; native SMB still requires acceptance');
// Old offline cache in another, independent browser profile remains runnable.
serving=old;const C=await page(false);await C.p.evaluate(()=>navigator.serviceWorker.ready);await C.p.waitForFunction(()=>!!navigator.serviceWorker.controller);if(engine==='webkit')networkDown=true;else await C.context.setOffline(true);await C.p.reload();assert.equal(await C.p.locator('#buildStatus').count(),0);assert.equal(await C.p.locator('#btnInfo').textContent(),aIdentity);
console.log('PASS N3 OFFLINE OLD PROFILE: cached old app runs independently and has no N3 check');
networkDown=false;serving=root;const D=await page();assert.match(await D.p.locator('#btnInfo').textContent(),/sha256|[a-f0-9]{12}/);await D.p.locator('#btnCheckUpdate').click();await D.p.locator('#buildStatus').filter({hasText:/stimmt mit der Online-Antwort/}).waitFor();
console.log('PASS N3 NEW PROFILE: new tab loads current HTML build and verifies online response');
await D.p.locator('#list .desc').nth(0).fill('D unsaved during update');
await D.p.locator('#bSaveRetry').waitFor();await D.p.evaluate(()=>document.getElementById('btnUpd').hidden=false);
let navigations=0;D.p.on('framenavigated',()=>navigations++);await D.p.locator('#btnUpd').click();
await D.p.locator('#banner').filter({hasText:/Update wurde deshalb abgebrochen/}).waitFor();
assert.equal(navigations,0);assert.equal(await D.p.locator('#list .desc').nth(0).inputValue(),'D unsaved during update');assert.equal(await disk(),beforeFence);
console.log('PASS N3 UNSAVED: failed update retains actual typed input and primary bytes');
evidence.events.push({step:'offline old profile',method:engine==='webkit'?'origin sockets disconnected (WebKit offline emulation cannot navigate SW cache)':'browserContext.setOffline(true)'});
for(const n of ['a.jpg','b.jpg'])assert.deepEqual(await fs.readFile(path.join(tmp,PROJECT,'Fotos',n)),image);
assert.equal(await disk(),beforeFence);evidence.events.push({step:'originals and fenced primary unchanged',passed:true});
assert.deepEqual(pageErrors,[],'no uncaught browser errors');
if(process.env.N3_RESULTS){await fs.mkdir(process.env.N3_RESULTS,{recursive:true});await fs.writeFile(path.join(process.env.N3_RESULTS,'altclient-'+engine+'.json'),JSON.stringify(evidence,null,2));}
}finally{for(const c of contexts)await c.close().catch(()=>{});await browser.close();await new Promise(r=>server.close(r));await fs.rm(tmp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exit(1);});
