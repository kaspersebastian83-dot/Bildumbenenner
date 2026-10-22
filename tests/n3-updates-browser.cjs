// Advisory update UX. Real SW/offline lifecycle is covered by n3-altclient-browser.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),pw=require('playwright');
const root=path.resolve(__dirname,'..'),engine=process.argv[2]||'chromium',html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const build=/const APP_BUILD = '(sha256:[a-f0-9]{64})'/.exec(html)[1];
const other='sha256:'+(build.endsWith('0')?'1':'0').repeat(64);let mode='same',browser,server;
(async()=>{
server=http.createServer((req,res)=>{const u=new URL(req.url,'http://x');if(!['/','/index.html'].includes(u.pathname)){const f=path.resolve(root,'.'+u.pathname);if(!f.startsWith(root+path.sep)||!fs.existsSync(f)){res.statusCode=404;return res.end();}res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':'application/octet-stream');return res.end(fs.readFileSync(f));}res.setHeader('Content-Type','text/html; charset=utf-8');if(u.searchParams.has('fotokit-update')){if(mode==='error'){res.statusCode=503;return res.end('offline');}if(mode==='invalid')return res.end('no build');return res.end(mode==='different'?html.replace(build,other):html);}res.end(html);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await pw[engine].launch();const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1400,height:1000}}),p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
try{
await p.goto('http://localhost:'+server.address().port+'/index.html');// Keep the loaded identity across update checks.
assert.match(await p.locator('#btnInfo').textContent(),new RegExp(build.slice(7,19)));await p.locator('#btnInfo').click();assert.ok((await p.locator('#dialog').textContent()).includes(build));await p.locator('#iClose').click();
console.log('PASS N3 UPDATE: actual loaded build visible in header and full info');
const check=async text=>{await p.locator('#btnCheckUpdate').click();await p.locator('#buildStatus').filter({hasText:text}).waitFor();};
await check(/stimmt mit der Online-Antwort/);assert.equal(await p.locator('#btnUpd').isVisible(),false);
console.log('PASS N3 UPDATE: matching online build is advisory, no reload');
mode='different';await check(/Anderer Online-Programmstand verfügbar/);assert.equal(await p.locator('#btnUpd').isVisible(),true);assert.match(await p.locator('#btnUpd').textContent(),/1\.9\.5/);assert.match(await p.locator('#btnInfo').textContent(),new RegExp(build.slice(7,19)));
console.log('PASS N3 UPDATE: different build with same version detected, loaded identity unchanged');
for(mode of ['error','invalid']){await check(/nicht bestätigt/);assert.equal(await p.locator('#btnUpd').isVisible(),true);}
console.log('PASS N3 UPDATE: HTTP failure and invalid response do not confirm currentness or erase known update');
await p.evaluate(()=>window.dispatchEvent(new Event('offline')));assert.match(await p.locator('#buildStatus').textContent(),/Offline.*nicht bestätigt/);
console.log('PASS N3 UPDATE: offline explicitly unverified');
// Instrument only a protected-project entry point, retain actual update handler.
const protectedHTML=html.replace('/* ---------- wiring ---------- */',"window.n3Protected = () => { S.dir = {}; P.readOnly = true; };\n/* ---------- wiring ---------- */");
await p.route('**/index.html',r=>r.fulfill({contentType:'text/html',body:protectedHTML}));await p.reload();await p.evaluate(()=>{window.n3Protected();document.getElementById('btnUpd').hidden=false;});let navigations=0;p.on('framenavigated',()=>navigations++);await p.locator('#btnUpd').click();await p.locator('#banner').filter({hasText:/Neuladen abgebrochen/}).waitFor();assert.equal(navigations,0);
console.log('PASS N3 UPDATE: protected-session input cannot be discarded by app update');
assert.deepEqual(errors,[]);
}finally{await context.close();await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exit(1);});
