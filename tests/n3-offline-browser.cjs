const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),pw=require('playwright');
const ui=require('./fk-ui.cjs');
const root=path.resolve(__dirname,'..'),engine=process.argv[2]||'chromium';
// FotoKit 2.0: „Programmstand prüfen“ steht unter „Mehr …“ › „Sicherungen und Programmstand …“ (#dlgSicher). „Mehr …“ sitzt in der
// Fußleiste, die erst mit geöffnetem Ordner erscheint – deshalb wird vorher ein synthetischer OPFS-Projektordner geöffnet (lokal, kein Netz).
const picker=()=>{window.showDirectoryPicker=async()=>{const r=await navigator.storage.getDirectory(),p=await r.getDirectoryHandle('26.0301 N3 Offline',{create:true}),f=await p.getDirectoryHandle('Fotos',{create:true});
 const png=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='),c=>c.charCodeAt(0));
 try{await f.getFileHandle('IMG_0001.png');}catch(e){const w=await (await f.getFileHandle('IMG_0001.png',{create:true})).createWritable();await w.write(png);await w.close();}return p;};};
async function programmstand(page){
 if(!(await page.locator('#btnMehr').isVisible())){await ui.oeffnen(page);await page.waitForFunction(()=>!document.body.inert&&document.querySelectorAll('#list .row').length===1);}
 if(!(await page.locator('#dlgSicher').isVisible()))await ui.sicher(page);
 await page.locator('#btnCheckUpdate').click();
}
(async()=>{let down=false;const requests=[];
const server=http.createServer((req,res)=>{
 requests.push({url:req.url,blocked:down});if(down){req.socket.destroy();return;}
 const f=path.resolve(root,'.'+new URL(req.url,'http://x').pathname);const file=f===root?path.join(root,'index.html'):f;
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404).end();return;}
 res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.html')?'text/html':'application/octet-stream');res.end(fs.readFileSync(file));
});await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await pw[engine].launch(),context=await browser.newContext();await context.addInitScript(picker);const page=await context.newPage(),url='http://localhost:'+server.address().port+'/index.html';
try{
 await page.goto(url);await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
 await programmstand(page);await page.locator('#buildStatus').filter({hasText:/stimmt mit der Online-Antwort/}).waitFor();
 const identity=await page.locator('#btnInfo').textContent();const start=requests.length;down=true;
 await page.reload();assert.equal(await page.locator('#btnInfo').textContent(),identity);
 if(fs.existsSync(path.join(root,'project-store.js')))assert.equal(await page.evaluate(()=>typeof window.ProjectStore), 'object');
 await programmstand(page);await page.locator('#buildStatus').filter({hasText:/nicht bestätigt/}).waitFor();
 assert.ok(requests.slice(start).every(r=>r.blocked),'all document/script/worker origin requests refused');
 assert.ok(requests.slice(start).some(r=>r.url.includes('fotokit-update')),'separate update network path exercised');
 const cold=await browser.newContext(),coldPage=await cold.newPage();let failed=false;
 try{await coldPage.goto(url,{timeout:8000});}catch(e){failed=true;}
 assert.equal(failed,true,'no cache and no origin must fail, never pass as offline-ready');await cold.close();
 console.log('PASS N3 OFFLINE '+engine+': actual origin disconnection, cached HTML/scripts, update unverified, uncached profile fails; '+JSON.stringify(requests.slice(start)));
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exit(1)});
