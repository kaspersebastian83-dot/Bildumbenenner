// Advisory update validation. Real SW/offline lifecycle is covered separately.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto'),pw=require('playwright');
const {waitForAsync}=require('./await-condition.cjs');
const root=path.resolve(__dirname,'..'),engine=process.argv[2]||'chromium',html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const VER=html.match(/const APP_VERSION = '([^']+)'/)[1];   // aktuelle Version aus index.html, damit der Test eine Versionserhöhung übersteht
const build=/const APP_BUILD = '(sha256:[a-f0-9]{64})'/.exec(html)[1];
function stamped(text){const re=/const APP_BUILD = 'sha256:[a-f0-9]{64}'/g;const normalized=text.replace(re,"const APP_"+"BUILD = 'sha256:BUILD'");return text.replace(re,"const APP_"+"BUILD = 'sha256:"+crypto.createHash('sha256').update(normalized).digest('hex')+"'");}
const different=stamped(html.replace('</body>','<!-- synthetic alternate complete build -->\n</body>'));
let mode='same',browser,server;
(async()=>{
server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://x');if(!['/','/index.html'].includes(u.pathname)){
  const f=path.resolve(root,'.'+u.pathname);if(!f.startsWith(root+path.sep)||!fs.existsSync(f)){res.statusCode=404;return res.end();}
  res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':'application/octet-stream');return res.end(fs.readFileSync(f));
 }
 res.setHeader('Content-Type','text/html; charset=utf-8');if(!u.searchParams.has('fotokit-update'))return res.end(html);
 if(mode==='error'){res.statusCode=503;return res.end('offline');}if(mode==='network'){req.socket.destroy();return;}if(mode==='timeout')return;
 if(mode==='invalid')return res.end('no build');
 if(mode==='declarations')return res.end("const APP_VERSION = '"+VER+"'; const APP_BUILD = '"+build+"';");
 if(mode==='truncated')return res.end(html.slice(0,-80));
 if(mode==='tampered')return res.end(html.replace('<title>','<title>tampered '));
 if(mode==='duplicate')return res.end(stamped(html.replace('</body>',"<script>const APP_VERSION = '"+VER+"';</script></body>")));
 if(mode==='ambiguous')return res.end(stamped(html.replace('</body>',"<script>const APP_BUILD  = 'ambiguous';</script></body>")));
 if(mode==='wrong-type'){res.setHeader('Content-Type','text/plain');return res.end(html);}
 if(mode==='rollback')return res.end(stamped(html.replace("const APP_VERSION = '"+VER+"'","const APP_VERSION = '1.0.0'")));
 if(mode==='newer')return res.end(stamped(html.replace("const APP_VERSION = '"+VER+"'","const APP_VERSION = '99.0.0'")));
 res.end(mode==='different'?different:html);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await pw[engine].launch();const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1400,height:1000}}),p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
try{
 await p.goto('http://localhost:'+server.address().port+'/index.html');
 assert.ok((await p.locator('#btnInfo').textContent()).includes(build.slice(7,19)));await p.locator('#btnInfo').click();assert.ok((await p.locator('#dialog').textContent()).includes(build));await p.locator('#iClose').click();
 const check=async expected=>{await p.locator('#btnCheckUpdate').click();await p.locator('#buildStatus').filter({hasText:expected}).waitFor();};
 await check(/stimmt mit der Online-Antwort/);assert.equal(await p.locator('#btnUpd').isVisible(),false);
 console.log('PASS N3 UPDATE: complete current HTML digest matches; actual loaded identity visible');
 for(mode of ['different','rollback','newer']){
  await check(/Anderer Online-Programmstand verfügbar/);assert.equal(await p.locator('#btnUpd').isVisible(),true);assert.ok((await p.locator('#btnInfo').textContent()).includes(build.slice(7,19)));
  console.log('PASS N3 UPDATE: verified complete differing build '+mode);
 }
 for(mode of ['error','invalid','declarations','truncated','tampered','duplicate','ambiguous','wrong-type','network','timeout']){
  const start=Date.now();await check(/nicht bestätigt/);assert.equal(await p.locator('#btnUpd').isVisible(),true,'uncertainty retains known update');
  if(mode==='timeout')assert.ok(Date.now()-start>=5500,'actual abort deadline exercised');
  console.log('PASS N3 UPDATE: invalid or unreachable response unverified: '+mode);
 }
 mode='same';await check(/stimmt mit der Online-Antwort/);assert.equal(await p.locator('#btnUpd').isVisible(),false);
 await p.evaluate(()=>window.dispatchEvent(new Event('offline')));assert.match(await p.locator('#buildStatus').textContent(),/Offline.*nicht bestätigt/);
 const protectedHTML=html.replace('/* ---------- wiring ---------- */',"window.n3Protected = () => { S.dir = {}; P.readOnly = true; };\n/* ---------- wiring ---------- */");
 await p.route('**/index.html',r=>r.fulfill({contentType:'text/html',body:protectedHTML}));await p.reload();await p.evaluate(()=>{window.n3Protected();document.getElementById('btnUpd').hidden=false;});let navigations=0;p.on('framenavigated',()=>navigations++);await p.locator('#btnUpd').click();await p.locator('#banner').filter({hasText:/Neuladen abgebrochen/}).waitFor();assert.equal(navigations,0);
 console.log('PASS N3 UPDATE: protected mode blocks app update; real input recovery tested separately');
 await assert.rejects(waitForAsync(p,async()=>false,undefined,{timeout:100}),/without a positive result/);
 await assert.rejects(waitForAsync(p,async()=>new Promise(()=>{}),undefined,{timeout:100}),/without a positive result/);
 console.log('PASS N3 NEGATIVE: actual browser async false and hanging conditions reliably reject');
 assert.deepEqual(errors,[]);
}finally{await context.close();await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exit(1);});
