const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),pw=require('playwright');
const root=path.resolve(__dirname,'..'),engine=process.argv[2]||'chromium';
(async()=>{let down=false;const requests=[];
const server=http.createServer((req,res)=>{
 requests.push({url:req.url,blocked:down});if(down){req.socket.destroy();return;}
 const f=path.resolve(root,'.'+new URL(req.url,'http://x').pathname);const file=f===root?path.join(root,'index.html'):f;
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404).end();return;}
 res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.html')?'text/html':'application/octet-stream');res.end(fs.readFileSync(file));
});await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await pw[engine].launch(),context=await browser.newContext(),page=await context.newPage(),url='http://localhost:'+server.address().port+'/index.html';
try{
 await page.goto(url);await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
 await page.locator('#btnCheckUpdate').click();await page.locator('#buildStatus').filter({hasText:/stimmt mit der Online-Antwort/}).waitFor();
 const identity=await page.locator('#btnInfo').textContent();const start=requests.length;down=true;
 await page.reload();assert.equal(await page.locator('#btnInfo').textContent(),identity);
 if(fs.existsSync(path.join(root,'project-store.js')))assert.equal(await page.evaluate(()=>typeof window.ProjectStore), 'object');
 await page.locator('#btnCheckUpdate').click();await page.locator('#buildStatus').filter({hasText:/nicht bestätigt/}).waitFor();
 assert.ok(requests.slice(start).every(r=>r.blocked),'all document/script/worker origin requests refused');
 assert.ok(requests.slice(start).some(r=>r.url.includes('fotokit-update')),'separate update network path exercised');
 const cold=await browser.newContext(),coldPage=await cold.newPage();let failed=false;
 try{await coldPage.goto(url,{timeout:8000});}catch(e){failed=true;}
 assert.equal(failed,true,'no cache and no origin must fail, never pass as offline-ready');await cold.close();
 console.log('PASS N3 OFFLINE '+engine+': actual origin disconnection, cached HTML/scripts, update unverified, uncached profile fails; '+JSON.stringify(requests.slice(start)));
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exit(1)});
