// Deterministic independent sessions, synthetic byte-addressed filesystem only.
// The primary write barrier is AFTER the last revision read: no Web Lock assumption.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const source = fs.readFileSync(require('node:path').join(__dirname, '..', 'index.html'), 'utf8');
const encode = s => new TextEncoder().encode(s);
const copy = x => JSON.parse(JSON.stringify(x));
const fixture = () => ({app:'Bildumbenenner',format:1,version:'1.9.5',extension:{opaque:['F6',false]},projekt:{custom:{keep:1}},benennung:{custom:7},reihenfolge:['a.jpg','b.jpg'],bilder:{'a.jpg':{beschreibung:'alt A',future:{x:1}},'b.jpg':{beschreibung:'alt B',original:{name:'b.jpg',custom:9}}}});
const deferred = () => { let resolve; const promise = new Promise(r => resolve=r); return {promise,resolve}; };
function disk(initial=fixture()) {
  const files=new Map(initial===null?[]:[['_Bildumbenenner.json',encode(typeof initial==='string'?initial:JSON.stringify(initial))]]), dirs=new Set();
  let primaryWrites=0;
  const gates=new Map(); const fail={stage:'',path:''};
  const missing=()=>new DOMException('synthetic missing','NotFoundError');
  function directory(prefix='') { return {
    name:prefix||'Fotos',
    async getDirectoryHandle(name,opts={}) { const path=prefix+name+'/'; if(!dirs.has(path)){if(!opts.create)throw missing();dirs.add(path);}return directory(path); },
    async getFileHandle(name,opts={}) { const path=prefix+name;if(!files.has(path)&&!opts.create)throw missing();return {
      name,
      async getFile(){if(!files.has(path))throw missing();const bytes=files.get(path).slice();return {size:bytes.length,text:async()=>new TextDecoder().decode(bytes),arrayBuffer:async()=>bytes.buffer};},
      async createWritable(){if((fail.path===path||fail.path==='archive'&&prefix)&&fail.stage==='create')throw Error('synthetic create');let buffer;return {
        async write(value){if((fail.path===path||fail.path==='archive'&&prefix)&&fail.stage==='write')throw Error('synthetic write');buffer=typeof value==='string'?encode(value):new Uint8Array(value);const gate=gates.get(path)||prefix&&gates.get('archive');if(gate){gates.delete(path);if(prefix)gates.delete('archive');gate.started.resolve();await gate.release.promise;}},
        async close(){if((fail.path===path||fail.path==='archive'&&prefix)&&fail.stage==='close')throw Error('synthetic close');if(path==='_Bildumbenenner.json')primaryWrites++;files.set(path,fail.path==='archive'&&prefix&&fail.stage==='truncate'?buffer.slice(0,3):buffer.slice());}, async abort(){}
      };}
    };},
    async *values(){for(const path of dirs)if(path.startsWith(prefix)&&!path.slice(prefix.length,-1).includes('/'))yield {kind:'directory',name:path.slice(prefix.length,-1)};for(const path of files.keys())if(path.startsWith(prefix)&&!path.slice(prefix.length).includes('/'))yield {kind:'file',name:path.slice(prefix.length)};}
  };}
  return {files,dirs,fail,writes:()=>primaryWrites,dir:directory(),hold(path='_Bildumbenenner.json'){const gate={started:deferred(),release:deferred()};gates.set(path,gate);return gate;},text:()=>new TextDecoder().decode(files.get('_Bildumbenenner.json')),json(){return JSON.parse(this.text());}};
}
function session(d) {
  const element={classList:{contains:()=>false},disabled:false,value:'',textContent:'',innerHTML:''};
  const ctx={console,localStorage:{getItem(){return null;},setItem(){}},TextEncoder,TextDecoder,Uint8Array,crypto:webcrypto,DOMException, setTimeout:()=>0, clearTimeout(){}, window:{addEventListener(){}},document:{addEventListener(){}},navigator:{},
    S:{dir:d.dir,proj:{},items:[],view:[],busy:false,changing:false},APP_VERSION:'1.9.5',PROTECTED_PROJECT:'protected',PJ:{failed:false},cfg:{},defaults:{},$:()=>element,esc:String,applyCfgToUI(){},banner(){},hideBanner(){},saveError(){},logProblem(){},completePendingSave(){},flushDrafts(){},saveExtra(){},verCmp:(a,b)=>a.localeCompare(b,undefined,{numeric:true})};
  vm.createContext(ctx);
  vm.runInContext(source.slice(source.indexOf("const PROJ_FILE ="),source.indexOf("document.addEventListener('visibilitychange'"))+`\nfunction applyMergedToItems(){};function flushDrafts(){};function saveExtra(){};this.api={P,store,loadProject,flushProject,projSet,projToJson,projFromJson,checkExternal,${source.includes('async function photoVersions(')?'photoVersions,restorePhotoVersion,':''}};`,ctx);
  return {...ctx.api,ctx,async open(){await ctx.api.loadProject(d.dir);},edit(image,value){ctx.api.projSet('drafts',{...ctx.api.P.data.drafts,[image]:value});}};
}
async function race(initial=fixture()) {
  const d=disk(initial),a=session(d),b=session(d);await a.open();await b.open();
  a.edit('a.jpg','Sitzung A bestätigt');b.edit('b.jpg','Sitzung B bestätigt');
  const ga=d.hold(),pa=a.flushProject();await ga.started.promise;
  const gb=d.hold(),pb=b.flushProject();await gb.started.promise;
  ga.release.resolve();assert.equal(await pa,true,'A reports successful save');const confirmedA=d.text();
  gb.release.resolve();assert.equal(await pb,true,'B reports successful save');const confirmedB=d.text();
  assert.notEqual(confirmedA,confirmedB);
  // Restart: no in-memory session state is used to discover either full version.
  const restarted=session(d);await restarted.open();
  const retained=[...d.files.values()].map(bytes=>new TextDecoder().decode(bytes));
  assert.ok(retained.includes(confirmedA),'N2: confirmed full version A must survive B and restart');
  assert.ok(retained.includes(confirmedB),'N2: confirmed full version B must survive restart');
  return {d,a,b,restarted,confirmedA,confirmedB};
}
async function run(){
  let count=0;
  async function test(name,fn){await fn();console.log('PASS N2:',name);count++;}
  await test('deterministic overlap, fresh discovery and explicit restoration of A and B',async()=>{
    const {d,restarted,confirmedA,confirmedB}=await race();
    for(const text of [confirmedA,confirmedB]){
      const list=await restarted.photoVersions(d.dir),version=list.items.find(v=>v.name.startsWith('bestaetigt_')&&new TextDecoder().decode(v.snapshot.bytes)===text);
      assert.ok(version,'complete confirmed version discovered after restart');
      await restarted.restorePhotoVersion(d.dir,version,list.current);assert.equal(d.text(),text,'restore exact bytes, no merge');
    }
    for(const text of [confirmedA,confirmedB])assert.ok([...d.files.values()].some(b=>new TextDecoder().decode(b)===text));
    const original=fixture(),a=JSON.parse(confirmedA),b=JSON.parse(confirmedB);
    for(const v of [a,b]){assert.deepEqual(v.extension,original.extension);assert.deepEqual(v.projekt.custom,original.projekt.custom);assert.equal(v.benennung.custom,7);assert.deepEqual(v.bilder['a.jpg'].future,original.bilder['a.jpg'].future);assert.equal(v.bilder['b.jpg'].original.custom,9);}
  });
  await test('simultaneous first creation preserves both full candidates',async()=>{await race(null);});
  for(const stage of ['create','write','close','truncate'])await test('archive '+stage+' failure blocks primary and supports retry',async()=>{
    const d=disk(),s=session(d);await s.open();const before=d.text();s.edit('a.jpg','retry');Object.assign(d.fail,{path:'archive',stage});
    assert.equal(await s.flushProject(),false);assert.equal(d.text(),before);d.fail.stage='';assert.equal(await s.flushProject(),true);assert.equal(d.json().bilder['a.jpg'].beschreibung,'retry');
  });
  for(const stage of ['create','write','close'])await test('primary '+stage+' failure retains candidate, retry completes',async()=>{
    const d=disk(),s=session(d);await s.open();const before=d.text();s.edit('a.jpg','retry');Object.assign(d.fail,{path:'_Bildumbenenner.json',stage});
    assert.equal(await s.flushProject(),false);assert.equal(d.text(),before);assert.ok((await s.photoVersions(d.dir)).items.some(v=>v.data.bilder['a.jpg']?.beschreibung==='retry'));d.fail.stage='';assert.equal(await s.flushProject(),true);
  });
  for(const invalid of ['', '{broken',JSON.stringify({...fixture(),format:2}),JSON.stringify({...fixture(),version:'99.0.0'})])await test('damaged/unsupported primary is never automatically overwritten: '+invalid.slice(0,30),async()=>{
    const d=disk(),s=session(d);await s.open();d.files.set('_Bildumbenenner.json',encode(invalid));s.edit('a.jpg','not written');assert.equal(await s.flushProject(),false);assert.equal(d.text(),invalid);
  });
  await test('contradictory descriptions are not silently merged',async()=>{
    const d=disk(),a=session(d),b=session(d);await a.open();await b.open();a.edit('a.jpg','first');assert.equal(await a.flushProject(),true);b.edit('a.jpg','conflicting');assert.equal(await b.flushProject(),false);assert.equal(d.json().bilder['a.jpg'].beschreibung,'first');assert.equal(b.P.data.drafts['a.jpg'],'conflicting');assert.ok((await b.photoVersions(d.dir)).items.some(v=>v.data.bilder['a.jpg']?.beschreibung==='conflicting'));
  });
  await test('conflicting checksum metadata also requires an explicit choice',async()=>{
    const d=disk(),a=session(d),b=session(d);await a.open();await b.open();a.projSet('hash',{'a.jpg':{h:'A',s:1,m:1}});await a.flushProject();b.projSet('hash',{'a.jpg':{h:'B',s:1,m:2}});assert.equal(await b.flushProject(),false);assert.equal(d.json().bilder['a.jpg'].sha256.wert,'A');
  });
  await test('conflicting image orders require an explicit choice',async()=>{
    const d=disk(),a=session(d),b=session(d);await a.open();await b.open();a.projSet('order',['b.jpg','a.jpg']);await a.flushProject();b.projSet('order',['a.jpg']);assert.equal(await b.flushProject(),false);assert.deepEqual(d.json().reihenfolge,['b.jpg','a.jpg']);
  });
  await test('project switch while backup is pending never writes a different project',async()=>{
    const d=disk(),s=session(d);await s.open();s.edit('a.jpg','pending');const before=d.text(),gate=d.hold('archive'),p=s.flushProject();await gate.started.promise;s.P.session={};gate.release.resolve();assert.equal(await p,false);assert.equal(d.text(),before);
  });
  await test('existing unique snapshots and invalid snapshots remain unchanged',async()=>{
    const d=disk(),s=session(d);await s.open();s.edit('a.jpg','first');await s.flushProject();
    const invalid='_FotoKit_Fassungen/kandidat_20261022T000000000Z_00000000-0000-0000-0000-000000000001.json';d.files.set(invalid,encode('{bad'));
    const before=new Map([...d.files].map(([k,v])=>[k,v.slice()]));s.edit('b.jpg','next');await s.flushProject();for(const [k,v]of before)if(k!=='_Bildumbenenner.json')assert.deepEqual(d.files.get(k),v);assert.ok((await s.photoVersions(d.dir)).invalid.some(v=>invalid.endsWith(v.name)));
  });
  await test('selected backup tampering and changed primary block restoration',async()=>{
    const {d,restarted:s}=await race();const list=await s.photoVersions(d.dir),version=list.items.find(v=>v.data.bilder['a.jpg']?.beschreibung==='Sitzung A bestätigt');d.files.set('_Bildumbenenner.json',encode(JSON.stringify(fixture())));await assert.rejects(s.restorePhotoVersion(d.dir,version,list.current));const fresh=await s.photoVersions(d.dir);d.files.set('_FotoKit_Fassungen/'+version.name,encode(JSON.stringify(fixture())));await assert.rejects(s.restorePhotoVersion(d.dir,version,fresh.current));
  });
  await test('explicit recovery from damaged primary preserves its original bytes',async()=>{
    const {d,restarted:s}=await race();d.files.set('_Bildumbenenner.json',new Uint8Array([255,0,128]));const list=await s.photoVersions(d.dir);await s.restorePhotoVersion(d.dir,list.items[0],list.current);assert.ok([...d.files.values()].some(b=>b.length===3&&b[0]===255&&b[1]===0&&b[2]===128));
  });
  await test('older valid file is retained verbatim and remains restorable',async()=>{
    const original=fixture();delete original.format;delete original.version;const d=disk(original),s=session(d),text=d.text();await s.open();s.edit('a.jpg','new');await s.flushProject();const list=await s.photoVersions(d.dir),old=list.items.find(v=>new TextDecoder().decode(v.snapshot.bytes)===text);assert.ok(old);await s.restorePhotoVersion(d.dir,old,list.current);assert.equal(d.text(),text);
  });
  console.log('N2: '+count+' regression cases passed');
}
module.exports={disk,session,fixture,race,copy,encode};
if(require.main===module)run().catch(e=>{console.error(e);process.exitCode=1;});
