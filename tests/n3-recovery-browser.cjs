// Real UI in both engines; synthetic shared file handles. No Windows/SMB claim.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),pw=require('playwright');
const bridge=require('./n3-disk-bridge.cjs'),alternateHTML=require('./n3-test-html.cjs');
const os=require('node:os');
const root=path.resolve(__dirname,'..'),engine=process.argv[2]||'chromium',project='26.0401 Recovery Test',other='26.0402 Other Test',primary=project+'/Fotos/_Bildumbenenner.json';
const fixture=version=>({app:'Bildumbenenner',format:version==='99.0.0'?2:1,version,projekt:{},benennung:{},reihenfolge:['a.jpg','b.jpg'],bilder:{'a.jpg':{beschreibung:'Disk A'},'b.jpg':{beschreibung:'Disk B'}},extension:{must:['remain',42]}});
(async()=>{
 const files=new Map(),dirs=new Set(['',project,project+'/Fotos',other,other+'/Fotos']);let deny=false,offerUpdate=false;
 const put=(n,v)=>files.set(n,Buffer.from(Buffer.isBuffer(v)||typeof v==='string'?v:JSON.stringify(v)));
 const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
 for(const p of [project,other]){put(p+'/Fotos/_Bildumbenenner.json',fixture('99.0.0'));for(const n of ['a.jpg','b.jpg'])put(p+'/Fotos/'+n,image);}
 const server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+new URL(req.url,'http://x').pathname);const file=f===root?path.join(root,'index.html'):f;if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404).end();return;}res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.html')?'text/html':'application/octet-stream');res.end(offerUpdate&&new URL(req.url,'http://x').searchParams.has('fotokit-update')?alternateHTML(fs.readFileSync(file,'utf8')):fs.readFileSync(file));});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await pw[engine].launch(),errors=[];let context=await browser.newContext({serviceWorkers:'block',viewport:{width:1400,height:1000}});
 async function prepare(context){
 await context.exposeBinding('__n3io',async(_,a)=>{
  const rel=a.rel||'';
  if(deny&&a.op==='write')throw Error('Synthetic commit failure');
  if(a.op==='dir'){if(a.create)dirs.add(rel);return dirs.has(rel)?true:{missing:true};}
  if(a.op==='file'){if(a.create&&!files.has(rel))put(rel,'');return files.has(rel)?true:{missing:true};}
  if(a.op==='list'){const prefix=rel?rel+'/':'';return [...[...dirs].filter(p=>p!==rel&&p.startsWith(prefix)&&!p.slice(prefix.length).includes('/')).map(p=>({name:p.slice(prefix.length),kind:'directory'})),...[...files.keys()].filter(p=>p.startsWith(prefix)&&!p.slice(prefix.length).includes('/')).map(p=>({name:p.slice(prefix.length),kind:'file'}))];}
  if(a.op==='read')return files.has(rel)?Array.from(files.get(rel)):{missing:true};
  if(a.op==='write'){files.set(rel,Buffer.from(a.bytes));return true;}
  if(a.op==='before')return true;
  throw Error('Unexpected synthetic operation '+a.op);
 });
 await bridge(context,project);
 await context.addInitScript(({other})=>{const original=window.showDirectoryPicker;window.showDirectoryPicker=async()=>{const d=await original();return window.pickOther?new d.constructor(other,'directory'):d;};},{other});
 }
 await prepare(context);
 const url='http://localhost:'+server.address().port+'/index.html';
 async function page(){const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(url);return p;}
 async function open(p){await p.locator('#btnOpen').click();await p.locator('#list .desc').nth(1).waitFor();await p.waitForFunction(()=>!document.body.inert);await p.locator('#recoveryStatus').filter({hasText:/bereit|Zuordnung/}).waitFor();}
 async function choose(p,text){(await p.locator('#morePanel').isHidden()&&await p.locator('#btnMore').click());await p.locator('#btnSessionRecovery').click();const buttons=p.locator('[data-session-recovery]');let found=false;for(let i=0;i<await buttons.count();i++){await buttons.nth(i).click();if((await p.locator('#rPreview').textContent()).includes(text)){found=true;break;}await p.locator('#rBack').click();}assert.ok(found,'actual persisted draft discoverable: '+text);}
 const original=Buffer.from(files.get(primary));
 try{
  let p=await page();await open(p);await p.locator('#list .desc').first().fill('Protected input survives RELOAD');await p.locator('#recoveryStatus').filter({hasText:/lokal gesichert/}).waitFor();
  let warnings=0;const dismiss=async d=>{warnings++;await d.dismiss();};p.on('dialog',dismiss);await p.reload({timeout:2000}).catch(e=>assert.match(e.message,/ERR_ABORTED|navigation|Timeout|beforeunload/i));assert.ok(warnings>0,'manual reload warns');assert.equal(await p.locator('#list .desc').first().inputValue(),'Protected input survives RELOAD');p.off('dialog',dismiss);
  p.on('dialog',d=>d.accept());await p.reload();await open(p);assert.equal(await p.locator('#list .desc').first().inputValue(),'Disk A');await p.evaluate(()=>localStorage.setItem('fotokit-recovery-v1:bad-header',JSON.stringify({format:1,id:'bad-header',project:'synthetic',folder:'Fotos',time:{invalid:true},pending:true,state:{}})));(await p.locator('#morePanel').isHidden()&&await p.locator('#btnMore').click());await p.locator('#btnSessionRecovery').click();await p.locator('#dialog').filter({hasText:/Nicht lesbare Kopien bleiben erhalten/}).waitFor();await p.locator('#rClose').click();await choose(p,'Protected input survives RELOAD');await p.locator('#rApply').click();await p.locator('#overlay').waitFor({state:'hidden'});assert.equal(await p.locator('#list .desc').first().inputValue(),'Protected input survives RELOAD');assert.deepEqual(files.get(primary),original);
  console.log('PASS N3 RECOVERY: reload warns; accepted reload keeps local draft; explicit recovery leaves protected bytes unchanged');
  await p.locator('#list .desc').first().fill('Protected input survives TAB CLOSE');await p.close({runBeforeUnload:true});
  p=await page();await open(p);await choose(p,'Protected input survives TAB CLOSE');await p.locator('#rApply').click();await p.locator('#overlay').waitFor({state:'hidden'});assert.equal(await p.locator('#list .desc').first().inputValue(),'Protected input survives TAB CLOSE');
  console.log('PASS N3 RECOVERY: closed tab, fresh tab, retained profile storage and explicit resume');
  p.on('dialog',d=>d.accept());await p.close({runBeforeUnload:true});
  const newer=fixture('99.0.0');newer.bilder['b.jpg'].beschreibung='NEWER B MUST SURVIVE';put(primary,newer);const newerBytes=Buffer.from(files.get(primary));
  p=await page();await open(p);await choose(p,'Protected input survives TAB CLOSE');await p.locator('#rApply').click();await p.locator('#rProblem').filter({hasText:/Konflikt.*geändert/}).waitFor();assert.deepEqual(files.get(primary),newerBytes);assert.equal(await p.locator('#list .desc').nth(1).inputValue(),'NEWER B MUST SURVIVE');assert.equal(await p.locator('#rDownload').isEnabled(),true);
  console.log('PASS N3 CONFLICT: newer saved B unchanged, no automatic journal replay; retained copy downloadable');
  await p.close();p=await page();await p.evaluate(()=>window.pickOther=true);await open(p);await choose(p,'Protected input survives TAB CLOSE');await p.locator('#rApply').click();await p.locator('#rProblem').filter({hasText:/Anderer.*Ordner/}).waitFor();assert.deepEqual(files.get(primary),newerBytes);
  console.log('PASS N3 ISOLATION: matching filenames and bytes in a different folder do not permit recovery');
  await p.locator('#rBack').click();await p.locator('#rClose').click();
  const count=await p.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('fotokit-recovery-v1:')).length);
  await p.evaluate(()=>{const set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k.startsWith('fotokit-recovery-v1:'))throw new DOMException('Synthetic quota full','QuotaExceededError');return set.call(this,k,v);};});
  await p.locator('#list .desc').first().fill('LOCAL STORAGE FAILURE');await p.locator('#recoveryStatus').filter({hasText:/NICHT lokal gesichert/}).waitFor();assert.equal(await p.evaluate(()=>{const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented;}),true);assert.equal(await p.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('fotokit-recovery-v1:')).length),count);
  console.log('PASS N3 FAILURE: local journal write failure visible, warning retained, previous copies not deleted');
  await p.close();put(primary,fixture('1.9.5'));deny=true;p=await page();await open(p);await p.locator('#list .desc').first().fill('FAILED PROJECT WRITE');await p.locator('#bSaveRetry').waitFor();offerUpdate=true;(await p.locator('#morePanel').isHidden()&&await p.locator('#btnMore').click());await p.locator('#btnCheckUpdate').click();await p.locator('#btnUpd').waitFor();let nav=0;p.on('framenavigated',()=>nav++);await p.locator('#btnUpd').click();await p.locator('#banner').filter({hasText:/Update wurde deshalb abgebrochen/}).waitFor();assert.equal(nav,0);assert.equal(await p.locator('#list .desc').first().inputValue(),'FAILED PROJECT WRITE');
  console.log('PASS N3 FAILURE: failed project write blocks update, actual input retained locally');
  deny=false;await p.locator('#bSaveRetry').click();await p.locator('#recoveryStatus').filter({hasText:/Projekt gespeichert/}).waitFor();assert.equal(JSON.parse(files.get(primary)).bilder['a.jpg'].beschreibung,'FAILED PROJECT WRITE');
  console.log('PASS N3 RETRY: successful project commit distinguished from local-only recovery copy');
  offerUpdate=false;
  // Real browser-process restart with a persistent synthetic profile, same origin.
  await context.close();
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'n3-recovery-profile-'));
  const options={serviceWorkers:'block',viewport:{width:1400,height:1000},...(process.env.N3_BROWSER_EXECUTABLE?{executablePath:process.env.N3_BROWSER_EXECUTABLE}:{})};
  context=await pw[engine].launchPersistentContext(profile,options);await prepare(context);
  put(primary,fixture('99.0.0'));p=await page();await open(p);await p.locator('#list .desc').first().fill('BROWSER PROCESS RESTART');await context.close();
  context=await pw[engine].launchPersistentContext(profile,options);await prepare(context);p=await page();await open(p);
  await choose(p,'BROWSER PROCESS RESTART');await p.locator('#rApply').click();await p.locator('#overlay').waitFor({state:'hidden'});assert.equal(await p.locator('#list .desc').first().inputValue(),'BROWSER PROCESS RESTART');
  console.log('PASS N3 PERSISTENCE: actual browser process restarted, journal and folder identity retained, explicit resume');
  await p.evaluate(()=>{for(const k of Object.keys(localStorage).filter(k=>k.startsWith('fotokit-recovery-v1:'))){const v=JSON.parse(localStorage.getItem(k));if(v.state.drafts['a.jpg']==='BROWSER PROCESS RESTART'){v.state.drafts=[];v.state.meta.notes='MALFORMED RECOVERY CASE';localStorage.setItem(k,JSON.stringify(v));break;}}});
  await context.close();context=await pw[engine].launchPersistentContext(profile,options);await prepare(context);p=await page();await open(p);
  const beforeMalformed=Buffer.from(files.get(primary));await choose(p,'MALFORMED RECOVERY CASE');await p.locator('#rApply').click();await p.locator('#rProblem').filter({hasText:/Beschädigte Sitzungseingaben/}).waitFor();assert.deepEqual(files.get(primary),beforeMalformed);assert.equal(await p.locator('#list .desc').first().inputValue(),'Disk A');
  console.log('PASS N3 CORRUPTION: malformed persisted draft rejected before changing session or project data');
  await context.close();put(project+'/_Projekt.json',{format:'mosaik-projekt',version:1,objekt:'NEW SHARED DATA'});
  context=await pw[engine].launchPersistentContext(profile,options);await prepare(context);p=await page();await open(p);
  // The unmodified second copy from explicit resume still contains this input.
  await choose(p,'BROWSER PROCESS RESTART');await p.locator('#rApply').click();await p.locator('#rProblem').filter({hasText:/Gemeinsame Projektdaten wurden geändert/}).waitFor();assert.deepEqual(files.get(primary),beforeMalformed);assert.equal(JSON.parse(files.get(project+'/_Projekt.json')).objekt,'NEW SHARED DATA');
  console.log('PASS N3 SHARED CONFLICT: newer shared project data blocks recovery and both project files remain unchanged');
  for(const q of [project,other])for(const n of ['a.jpg','b.jpg'])assert.deepEqual(files.get(q+'/Fotos/'+n),image);
  assert.deepEqual(errors,[]);
 }finally{await context.close();await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exit(1)});
