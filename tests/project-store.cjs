// Independent V8 sessions, real temporary disk files, synthetic File System Access.
// No claim about Windows/SMB atomicity, durability or power-loss behavior.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const root=path.resolve(__dirname,'..'), peer=process.argv[2]&&path.resolve(process.argv[2]);
const name='26.0101 Fiktives Projekt', initial={format:'mosaik-projekt',version:1,projektnummer:'26.0101',objekt:'ALT',sachverstaendiger:'ALT',unbekannt:{tief:[1,'bleibt']}};
const defer=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
const missing=()=>Object.assign(Error('missing'),{name:'NotFoundError'});
let checks=0;
class Directory{
  constructor(dir,io={}){this.dir=dir;this.io=io;this.kind='directory';this.name=path.basename(dir);}
  async getDirectoryHandle(n,o={}){const d=path.join(this.dir,n);if(o.create)await fs.mkdir(d,{recursive:true});try{if(!(await fs.stat(d)).isDirectory())throw Error('not directory');}catch(e){if(e.code==='ENOENT')throw missing();throw e;}return new Directory(d,this.io);}
  async getFileHandle(n,o={}){
    const f=path.join(this.dir,n),io=this.io;
    if(o.create)await fs.appendFile(f,'');
    try{await fs.access(f);}catch(e){if(e.code==='ENOENT')throw missing();throw e;}
    return {name:n,kind:'file',getFile:async()=>{
      if(io.read)await io.read(n,f);
      let bytes=await fs.readFile(f); if(io.bytes)bytes=await io.bytes(n,bytes);
      return {size:bytes.length,arrayBuffer:async()=>Uint8Array.from(bytes).buffer,text:async()=>bytes.toString()};
    },createWritable:async()=>{
      if(io.open)await io.open(n,f);
      let value;return {write:async(v)=>{if(io.write)await io.write(n,f);value=v;},close:async()=>{if(io.close)await io.close(n,f);await fs.writeFile(f,value);if(io.after)await io.after(n,f);},abort:async()=>{}};
    }};
  }
  async *entries(){for(const e of await fs.readdir(this.dir,{withFileTypes:true}))yield[e.name,e.isDirectory()?new Directory(path.join(this.dir,e.name),this.io):await this.getFileHandle(e.name)];}
}
async function session(source=root){
  const html=await fs.readFile(path.join(source,'index.html'),'utf8'),helper=await fs.readFile(path.join(source,'project-store.js'),'utf8');
  const c=vm.createContext({crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,console,navigator:{},setTimeout,clearTimeout});
  vm.runInContext(helper,c);
  if(html.includes('function patchPJ(')){
    c.PJ_HINWEIS='Hinweis';c.PJ_FIELDS=[];c.APP_VERSION='test';c.parseProjName=()=>({nr:'26.0101',ort:'Fiktives Projekt'});
    vm.runInContext(html.slice(html.indexOf('function patchPJ('),html.indexOf('/* ---------- state ---------- */')),c);
    c.save=async(dir,patch,expected)=>c.patchPJ(dir,name,patch,expected);
    c.app='Projektzentrale';
  }else{
    c.PJ_HINWEIS='Hinweis';c.APP_VERSION='test';c.APP_NAME='FotoKit';c.PJ_FILE='_Projekt.json';c.P={loading:false};c.S={};
    c.completePendingSave=()=>{};c.esc=s=>s;c.hideBanner=()=>{};c.saveError=s=>{c.error=s;};
    vm.runInContext(html.slice(html.indexOf('function flushPJ('),html.indexOf('// A failed file operation')),c);
    c.save=async(dir,patch,expected)=>{c.S.proj={name,dir,nr:'26.0101',ort:'Fiktives Projekt'};c.PJ={data:expected,pending:patch,writing:Promise.resolve(true),writes:0,failed:false};const ok=await c.flushPJ();if(!ok)throw Error(c.error);return c.PJ.data;};
    c.app='FotoKit';
  }
  return c;
}
async function fixture(run){const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'spektron-f3-'));try{const dir=path.join(tmp,name);await fs.mkdir(dir);await fs.writeFile(path.join(dir,'_Projekt.json'),JSON.stringify(initial));await run(dir);checks++;}finally{await fs.rm(tmp,{recursive:true,force:true});}}
const bytes=d=>fs.readFile(path.join(d,'_Projekt.json'));
async function all(d){const r={};async function walk(p){for(const e of await fs.readdir(p,{withFileTypes:true})){const f=path.join(p,e.name);if(e.isDirectory())await walk(f);else r[path.relative(d,f)]=(await fs.readFile(f)).toString('base64');}}await walk(d);return r;}
(async()=>{
 const app=await session();
 await fixture(async d=>{
   const extra=JSON.parse('{"__proto__":{"synthetisch":true},"constructor":"bleibt"}');await fs.writeFile(path.join(d,'_Projekt.json'),JSON.stringify({...initial,...extra}));
   await app.save(new Directory(d),{objekt:'NEU'});
   const current=JSON.parse(await bytes(d));assert.equal(current.objekt,'NEU');assert.deepEqual(current.unbekannt,initial.unbekannt);assert.deepEqual(current.__proto__,extra.__proto__);assert.equal(current.constructor,'bleibt');
   const v=await app.ProjectStore.versions(new Directory(d));assert.equal(v.items.length,1);assert.equal(v.items[0].data.objekt,'ALT');
   const saved=Object.keys(await all(d)).filter(n=>n.includes('kandidat_'));assert.equal(saved.length,1,'confirmed candidate remains');
 });
 // Mandatory interleaving: BOTH streams reach write(), after the LAST revision
 // comparison, BEFORE A replaces the main file. A reports success before B resumes.
 await fixture(async d=>{
   await fs.writeFile(path.join(d,'_Projekt.json'),JSON.stringify({...initial,objekt:'EXTERN'}));const before=await all(d);
   await assert.rejects(()=>app.save(new Directory(d),{objekt:'EIGEN'},initial),/geändert/);assert.deepEqual(await all(d),before,'stale displayed field is blocked');
 });
 await fixture(async d=>{
   await fs.writeFile(path.join(d,'_Projekt.json'),JSON.stringify({...initial,sachverstaendiger:'EXTERN'}));
   await app.save(new Directory(d),{objekt:'EIGEN'},initial);
   const data=JSON.parse(await bytes(d));assert.equal(data.objekt,'EIGEN');assert.equal(data.sachverstaendiger,'EXTERN','existing disjoint field-patch behavior stays intact');
 });
 for(const source of [root,...(peer?[peer]:[])])await fixture(async d=>{
   const A=await session(),B=await session(source),a=defer(),b=defer(),goA=defer(),goB=defer();
   const da=new Directory(d,{write:async n=>{if(n==='_Projekt.json'){a.resolve();await goA.promise;}}});
   const db=new Directory(d,{write:async n=>{if(n==='_Projekt.json'){b.resolve();await goB.promise;}}});
   const pa=A.save(da,{objekt:'NEU A'}),pb=B.save(db,{sachverstaendiger:'NEU B'});
   await Promise.all([a.promise,b.promise]);goA.resolve();await pa;
   assert.equal(JSON.parse(await bytes(d)).objekt,'NEU A');
   goB.resolve();await pb;const main=JSON.parse(await bytes(d));assert.equal(main.sachverstaendiger,'NEU B');assert.equal(main.objekt,'ALT');
   const reopened=await session(source),v=await reopened.ProjectStore.versions(new Directory(d));
   const aChoice=v.items.find(x=>x.data.objekt==='NEU A');assert.ok(aChoice,'A survives B confirmation and restart');
   const before=await all(d);await reopened.ProjectStore.restore(new Directory(d),name,aChoice,v.current);
   const restored=JSON.parse(await bytes(d));assert.equal(restored.objekt,'NEU A');assert.equal(restored.sachverstaendiger,'ALT','no automatic merge');
   for(const [file,raw]of Object.entries(before))if(file!=='_Projekt.json')assert.equal((await all(d))[file],raw,'no snapshot cleanup');
   assert.ok((await reopened.ProjectStore.versions(new Directory(d))).items.some(x=>x.data.sachverstaendiger==='NEU B'),'B survives explicit restore');
   console.log('OK independent final-check race:',A.app,'→',B.app);
 });
 await fixture(async d=>{
   let read=0;const foreign=JSON.stringify({...initial,objekt:'EXTERN'}),io={read:async(n,f)=>{if(n==='_Projekt.json'&&++read===2)await fs.writeFile(f,foreign);}};
   await assert.rejects(()=>app.save(new Directory(d,io),{objekt:'EIGEN'}),/geändert/);assert.equal((await bytes(d)).toString(),foreign);
   assert.ok((await app.ProjectStore.versions(new Directory(d))).items.some(x=>x.data.objekt==='EIGEN'),'candidate survives detected prewrite conflict');
 });
 await fixture(async d=>{
   const foreign=JSON.stringify({...initial,objekt:'NACHHER'}),io={after:async(n,f)=>{if(n==='_Projekt.json')await fs.writeFile(f,foreign);}};
   await assert.rejects(()=>app.save(new Directory(d,io),{objekt:'EIGEN'}),/geändert/);assert.equal((await bytes(d)).toString(),foreign);
   assert.ok((await app.ProjectStore.versions(new Directory(d))).items.some(x=>x.data.objekt==='EIGEN'));
 });
 for(const text of ['', '{broken', 'null','[]',JSON.stringify({...initial,version:2}),JSON.stringify({format:'foreign',version:1}),Buffer.from([0xff,0xfe])])await fixture(async d=>{
   await fs.writeFile(path.join(d,'_Projekt.json'),text);const before=await all(d);await assert.rejects(()=>app.save(new Directory(d),{objekt:'NEU'}));assert.deepEqual(await all(d),before,'invalid source never touched');
 });
 await fixture(async d=>{
   const before=await bytes(d);await assert.rejects(()=>app.save(new Directory(d,{read:async n=>{if(n==='_Projekt.json')throw Error('SYNTHETIC permission denied');}}),{objekt:'NEU'}),/permission denied/);assert.deepEqual(await bytes(d),before);
 });
 for(const fail of ['vorher','kandidat','_Projekt.json'])await fixture(async d=>{
   const before=await bytes(d);await assert.rejects(()=>app.save(new Directory(d,{close:async n=>{if(n.startsWith(fail))throw Error('SYNTHETIC interrupted close');}}),{objekt:'NEU'}),/interrupted close/);assert.deepEqual(await bytes(d),before);
   if(fail==='_Projekt.json')assert.ok((await app.ProjectStore.versions(new Directory(d))).items.some(x=>x.data.objekt==='NEU'),'candidate survives main close failure');
 });
 await fixture(async d=>{
   const before=await bytes(d);await assert.rejects(()=>app.save(new Directory(d,{after:async(n,f)=>{if(n.startsWith('kandidat'))await fs.writeFile(f,'{}');}}),{objekt:'NEU'}),/Sicherung/);assert.deepEqual(await bytes(d),before);
 });
 await fixture(async d=>{
   await app.save(new Directory(d),{objekt:'NEU'});let v=await app.ProjectStore.versions(new Directory(d));
   const choice=v.items[0],archive=path.join(d,'_Projekt_Sicherungen');await fs.writeFile(path.join(archive,choice.name),'{}');
   const before=await bytes(d);await assert.rejects(()=>app.ProjectStore.restore(new Directory(d),name,choice,v.current),/geändert/);assert.deepEqual(await bytes(d),before);
 });
 await fixture(async d=>{
   // Legacy plain objects and UTF-8 BOM retain all raw predecessor bytes.
   const old=Buffer.from('\uFEFF'+JSON.stringify({objekt:'ALT',unbekannt:initial.unbekannt}));await fs.writeFile(path.join(d,'_Projekt.json'),old);
   await app.save(new Directory(d),{objekt:'NEU'});const files=await all(d);assert.ok(Object.entries(files).some(([n,v])=>n.includes('vorher_')&&v===old.toString('base64')));
   await fs.writeFile(path.join(d,'_Projekt.json'),Buffer.from([0xff,0xfe]));const v=await app.ProjectStore.versions(new Directory(d));assert.ok(v.items.length);
   await app.ProjectStore.restore(new Directory(d),name,v.items.find(x=>x.data.objekt==='NEU'),v.current);assert.equal(JSON.parse(await bytes(d)).objekt,'NEU');
   assert.ok(Object.entries(await all(d)).some(([n,b])=>n.includes('vorher_')&&b===Buffer.from([0xff,0xfe]).toString('base64')),'explicit recovery preserves corrupt bytes too');
 });
 await fixture(async d=>{
   await fs.unlink(path.join(d,'_Projekt.json'));await app.save(new Directory(d),{objekt:'ERST'});assert.equal(JSON.parse(await bytes(d)).objekt,'ERST');
 });
 await fixture(async d=>{
   for(let i=0;i<42;i++)await app.save(new Directory(d),{objekt:'Stand '+i});
   const v=await app.ProjectStore.versions(new Directory(d));assert.equal(v.items.length,42,'all old distinct versions found, no arbitrary truncation/deletion');
 });
 console.log('OK',checks,'F3 synthetic filesystem cases for',app.app);
})().catch(e=>{console.error(e);process.exitCode=1;});
