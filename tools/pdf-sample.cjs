// Real export UI; generated images are copied only into an isolated synthetic OPFS project.
const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),images=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);
(async()=>{
 const server=http.createServer(async(req,res)=>{try{const name=decodeURIComponent(new URL(req.url,'http://local').pathname),base=name.startsWith('/__sample__/')?images:root;let file=path.resolve(base,name.startsWith('/__sample__/')?name.slice(12):'.'+name);if(file!==base&&!file.startsWith(base+path.sep))throw Error();if((await fs.stat(file)).isDirectory())file=path.join(file,'index.html');res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'application/javascript','.png':'image/png','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');res.end(await fs.readFile(file));}catch(e){res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch(),page=await browser.newPage();page.setDefaultTimeout(20000);page.setDefaultNavigationTimeout(20000);
 try{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port+'/index.html');
  const result=await page.evaluate(async()=>{
   const descriptions=[
    'Gesamtansicht des fiktiven Wohnhauses von der Gartenseite.',
    'Sockelzone am Gebäudeaußeneck. Örtlich begrenzte Abplatzungen der Putzoberfläche im Übergang zur befestigten Außenfläche.',
    'Detail eines feinen diagonalen Risses in der mineralischen Putzoberfläche. Die Aufnahme dient ausschließlich der Darstellung des neuen Dokumentlayouts.',
    'Fensterbank und seitlicher Anschluss an die verputzte Außenwand. Die schräge Ansicht zeigt sowohl die Oberfläche der Fensterbank als auch den Anschlussbereich unterhalb des Rahmens. Im unteren Wandbereich ist eine leichte Verfärbung erkennbar. Dieses vollständig synthetische Motiv zeigt beispielhaft, wie längere Beschreibungen mit Umlauten, Sonderzeichen und mehreren Aussagen in ruhigen, gut lesbaren Zeilen angeordnet werden. Aus dem Muster werden keine Aussagen über ein reales Bauwerk, eine Schadensursache oder erforderliche Maßnahmen abgeleitet.',
    'Übersicht eines fiktiven Kellerraums mit Wandanschluss, Leitung und Bodenfläche. Die weiß gestrichene Oberfläche zeigt im unteren Bereich beispielhafte Verfärbungen und Abplatzungen.',
    'Dachrand mit Rinne und Anschluss an das Fallrohr. Übersicht des Übergangs zwischen Dacheindeckung, Rinnenstoß und verputzter Fassade.'
   ];
   const sections=['01 · Außenansichten','01 · Außenansichten','02 · Bauteildetails','02 · Bauteildetails','03 · Innenräume','04 · Dachentwässerung'];
   const items=[];
   for(let i=1;i<=6;i++){const response=await fetch(`/__sample__/photo-${String(i).padStart(2,'0')}.png`);if(!response.ok)throw Error('Missing synthetic sample '+i);const data=await response.arrayBuffer(),name=`Musterbild_${String(i).padStart(2,'0')}.png`,file=new File([data],name,{type:'image/png'});
    items.push({name,final:name,ext:'.png',desc:descriptions[i-1],secEff:sections[i-1],probe:i>1&&i<6?`P${String(i-1).padStart(2,'0')}`:'',docNr:i,date:new Date('2026-10-22T09:30:00+02:00'),dateSrc:'Musterangabe',handle:{getFile:async()=>file}});
   }
   const meta={anlage:'Anlage B1 · Fotodokumentation',proj:'26.4201',objekt:'Fiktives Wohnhaus · Musterweg 12, 99999 Beispielstadt',ereignis:'Vollständig synthetisches Gestaltungsmuster. Kein Gutachten und kein reales Objekt.',sdatum:'2026-10-12',ort:'2026-10-22',sv:'Dipl.-Ing. Lea Beispiel',img:{shrink:true,edge:1600,q:90},pdf:{perPage:2,maxMB:14,secPage:true}};
   const root=await navigator.storage.getDirectory(),project=await root.getDirectoryHandle('26.4201 Gestaltungsmuster',{create:true}),photos=await project.getDirectoryHandle('Fotos',{create:true});window.samplePhotos=photos;
   const put=async(dir,name,data)=>{const w=await(await dir.getFileHandle(name,{create:true})).createWritable();await w.write(data);await w.close();};
   const bilder={};for(const item of items){await put(photos,item.name,await item.handle.getFile());bilder[item.name]={beschreibung:item.desc,abschnitt:item.secEff,probe:item.probe};}
   await put(project,'_Projekt.json',JSON.stringify({format:'mosaik-projekt',version:1,projektnummer:meta.proj,projektname:'Gestaltungsmuster',objekt:meta.objekt,sachverstaendiger:meta.sv}));
   await put(photos,'_Bildumbenenner.json',JSON.stringify({app:'Bildumbenenner',format:1,version:'1.9.4',reihenfolge:items.map(i=>i.name),bilder,benennung:{prefix:'Muster',date:false,num:true,start:1,digits:2,sep:'_',spaces:true,uml:false,lower:false,probe:false,discard:'move',sort:'manual'}}));
   window.showDirectoryPicker=async()=>project;return {meta};
  });
  page.on('dialog',d=>{console.log('Dialog:',d.message());d.accept();});console.log('Synthetic fixture ready');
  await page.locator('#btnOpen').click();await page.waitForFunction(()=>!document.body.inert&&document.querySelectorAll('#list .row').length===6,null,{timeout:20000});console.log('Project opened');
  const originals=await page.evaluate(async()=>{const a={};for await(const[n,h]of window.samplePhotos.entries())if(n.endsWith('.png'))a[n]=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await(await h.getFile()).arrayBuffer()))).map(x=>x.toString(16).padStart(2,'0')).join('');return a;});
  console.log('Before export:',await page.locator('#stats').textContent(),await page.locator('#btnPdf').isDisabled());await page.locator('#btnPdf').click();console.log('Export dialog');for(const key of ['anlage','proj','objekt','ereignis','sdatum','ort','sv'])await page.locator('#m_'+key).fill(result.meta[key]);
  if(await page.locator('#zOnly').isEnabled())await page.locator('#zOnly').uncheck();await page.locator('#zShrink').check();await page.locator('#zEdge').selectOption('1600');await page.locator('#zQ').selectOption('90');await page.locator('#pPer').selectOption('2');await page.locator('#pSecPage').check();await page.locator('#zOk').click();
  await page.waitForFunction(()=>!document.querySelector('#overlay').classList.contains('show')&&document.querySelector('#banner .pdfOpen'),null,{timeout:60000});
  result.parts=await page.evaluate(async()=>{const a=[];for await(const[n,h]of window.samplePhotos.entries())if(n.endsWith('.pdf')){const data=Array.from(new Uint8Array(await(await h.getFile()).arrayBuffer()));a.push({name:n,data});}return a;});
  const after=await page.evaluate(async()=>{const a={};for await(const[n,h]of window.samplePhotos.entries())if(n.endsWith('.png'))a[n]=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await(await h.getFile()).arrayBuffer()))).map(x=>x.toString(16).padStart(2,'0')).join('');return a;});assert.deepEqual(after,originals,'Original image bytes unchanged');
  assert.deepEqual(errors,[]);assert.equal(result.parts.length,1);result.parts[0].pages=Number(/\/Type \/Pages[^>]*\/Count (\d+)/.exec(Buffer.from(result.parts[0].data).toString('latin1'))[1]);assert.ok(result.parts[0].pages>=5);await fs.mkdir(out,{recursive:true});
  const file=path.join(out,'FotoKit_Muster_Bilddokumentation.pdf');await fs.writeFile(file,Buffer.from(result.parts[0].data));
  const sources=[];for(let i=1;i<=6;i++){const name=`photo-${String(i).padStart(2,'0')}.png`,b=await fs.readFile(path.join(images,name));sources.push({name,bytes:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex')});}
  const proof={file,pages:result.parts[0].pages,bytes:(await fs.stat(file)).size,meta:result.meta,sourceImages:sources,allInputDataPreserved:true,allImagesSynthetic:true};
  await fs.writeFile(path.join(out,'sample-manifest.json'),JSON.stringify(proof,null,2));console.log(JSON.stringify(proof,null,2));
 }catch(e){console.log((await page.locator('body').innerText()).slice(-6000));throw e;}finally{await page.close();await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
