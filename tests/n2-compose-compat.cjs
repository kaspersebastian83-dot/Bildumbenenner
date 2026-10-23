// Run ONLY inside a disposable integration checkout. Pinned PR branches are read-only.
const cp=require('node:child_process'),fs=require('node:fs'),assert=require('node:assert/strict');
const F3='5617ff033cd29c0a3fa43bb4246be598830cbfcd',F6='9c7929b6aebca4dc7fe8d95d7b518ea0946a66d0';
const git=(...args)=>cp.execFileSync('git',args,{encoding:'utf8'});
assert.equal(git('status','--porcelain').trim(),'','integration checkout must start clean');
if ([F3,F6].every(sha=>cp.spawnSync('git',['merge-base','--is-ancestor',sha,'HEAD']).status===0)){ console.log('Pinned F3/F6 already contained; retain exact integrated HEAD'); process.exit(0); }
function resolve(file,choose,expected=1){
 const text=fs.readFileSync(file,'utf8');let count=0;
 const resolved=text.replace(/^<<<<<<< .*\n([\s\S]*?)^=======\n([\s\S]*?)^>>>>>>> .*\n/gm,(_,ours,theirs)=>{count++;return choose(ours,theirs);});
 assert.equal(count,expected,'reviewed composition conflict count in '+file);fs.writeFileSync(file,resolved);git('add',file);
}
function commit(message){git('-c','user.name=N2 Compatibility','-c','user.email=n2@example.invalid','commit','-m',message);}
try{git('-c','user.name=N2 Compatibility','-c','user.email=n2@example.invalid','merge','--no-commit','--no-ff',F6);}catch(e){
 assert.deepEqual(git('diff','--name-only','--diff-filter=U').trim().split('\n').sort(),['.github/workflows/tests.yml','index.html']);
 resolve('index.html',(ours,theirs)=>{if(!ours.trim()){assert.equal(theirs.trim(),"else if (kind === 'hash') v = t[k];            // checksum cache: either one is fine");return ours;}assert.ok((ours.includes('photoCommit(')||ours.includes("photoBackup(dir, 'ausgang'"))&&theirs.includes('requireWritableProject(o)'));return ours;},3);
 resolve('.github/workflows/tests.yml',(ours,theirs)=>{assert.ok(ours.includes('n2-speichersicherheit.cjs')&&theirs.includes('unknown-fields.cjs'));return ours+theirs;});
}
commit('TEMP integration: retain N2 and pinned F6');
try{git('-c','user.name=N2 Compatibility','-c','user.email=n2@example.invalid','merge','--no-commit','--no-ff',F3);}catch(e){
 assert.deepEqual(git('diff','--name-only','--diff-filter=U').trim().split('\n').sort(),['.github/workflows/tests.yml','index.html']);
 resolve('index.html',(ours,theirs)=>{assert.ok(ours.includes('btnVersions')&&theirs.includes('pjRecovery'));return ours.replace('</button>\n','</button><span id="pjRecovery"></span>\n');});
 resolve('.github/workflows/tests.yml',(ours,theirs)=>{assert.ok(theirs.includes('project-store'));return ours+theirs;},2);
}
commit('TEMP integration: retain N2, F6 and pinned F3');
// The F6 unit fixture originally exposes only getFile().text(), no directories or
// byte reads. Replace that filesystem fixture with N2's byte-capable synthetic disk.
// All F6 test cases and assertions below run() remain byte-for-byte unchanged.
const test='tests/unknown-fields.cjs',text=fs.readFileSync(test,'utf8'),a=text.indexOf('function harness('),b=text.indexOf('\nasync function run()',a);
assert.ok(a>0&&b>a);fs.writeFileSync(test,text.slice(0,a)+`function harness(input = fixture()) {
  const {disk,session,encode}=require('./n2-speichersicherheit.cjs');
  const d=disk(JSON.stringify(input)),s=session(d);
  return {...s,dir:d.dir,read:()=>d.json(),text:()=>d.text(),writes:()=>d.writes(),
    external:value=>d.files.set('_Bildumbenenner.json',encode(JSON.stringify(value))),
    fail:value=>Object.assign(d.fail,{path:'_Bildumbenenner.json',stage:value?'write':''})};
}
`+text.slice(b));
console.log('Composed pinned F3 '+F3+' and F6 '+F6+'; F6 assertions unchanged.');
