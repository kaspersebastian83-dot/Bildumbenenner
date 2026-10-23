// Only create a disposable checkout; never update any existing PR branch.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),dest=path.resolve(process.argv[2]||'');
const MAIN='b616164f5ab24faa5371f4eb714276f6080a8bf3',N2='063b91d1f253c2c05fac221cd55b071be19fba59',F3='5617ff033cd29c0a3fa43bb4246be598830cbfcd',F6='9c7929b6aebca4dc7fe8d95d7b518ea0946a66d0',PDF='67449ee989c27d975596c33e371bea8506470901';
assert.ok(process.argv[2]&&!fs.existsSync(dest),'explicit new destination required');
const run=(cwd,command,args,opts={})=>cp.execFileSync(command,args,{cwd,encoding:'utf8',stdio:['pipe','pipe','inherit'],...opts});
const git=(...args)=>run(dest,'git',args);
function commit(message){git('add','.');git('-c','user.name=N3 Compatibility','-c','user.email=n3@example.invalid','commit','-m',message);}
run(root,'git',['clone','--no-hardlinks','--no-checkout',root,dest]);
git('config','core.autocrlf','false');git('config','core.eol','lf');
git('fetch','https://github.com/kaspersebastian83-dot/Bildumbenenner.git',N2,F3,F6,PDF);git('checkout','--detach',N2);
run(dest,process.execPath,['tests/n2-compose-compat.cjs']);
const pdfPatch=git('diff','--binary',MAIN,PDF,'--','index.html','assets/firmenlogo.png','tests/pdf-layout.cjs','tests/pdf-layout-browser.cjs');
run(dest,'git',['apply','--check','-'],{input:pdfPatch});
run(dest,'git',['apply','-'],{input:pdfPatch});
commit('TEMP pinned F3 F6 N2 PDF before N3');

const before=fs.readFileSync(path.join(dest,'index.html'),'utf8');
const n3Patch=run(root,'git',['diff','--binary',MAIN,'HEAD','--','index.html','sw.js']);
try{run(dest,'git',['apply','--3way','-'],{input:n3Patch});}catch(e){
 assert.deepEqual(git('diff','--name-only','--diff-filter=U').trim().split('\n'),['sw.js']);
 const file=path.join(dest,'sw.js');let count=0;
 const resolved=fs.readFileSync(file,'utf8').replace(/^<<<<<<< .*\n([\s\S]*?)^=======\n([\s\S]*?)^>>>>>>> .*\n/gm,(_,ours,theirs)=>{
  count++;assert.ok(ours.includes("'./project-store.js'")&&theirs.includes("'v4-n3'"));
  return theirs.replace("'./index.html',", "'./index.html', './project-store.js',");
 });assert.equal(count,1);fs.writeFileSync(file,resolved);git('add','sw.js');
}
const after=fs.readFileSync(path.join(dest,'index.html'),'utf8');
const block=(s,a,b)=>s.slice(s.indexOf(a),s.indexOf(b,s.indexOf(a)));
// Only these reviewed recovery hooks may differ in the existing storage block.
const withoutRecovery = s => s.replace(/\/\* N3 session recovery begin \*\/[\s\S]*?\/\* N3 session recovery end \*\/\n\n/, '')
 .replace(/^  recoveryChanged\(\); \/\/ N3 recovery hook\n/gm, '')
 .replace(/^\s*await recoveryOpened\(\); \/\/ N3 recovery hook\n/gm, '')
 .replace('if (P.session === session){ P.writes--; completePendingSave(); recoverySaved(); } // N3 recovery hook','if (P.session === session){ P.writes--; completePendingSave(); }');
assert.equal(block(before,'const PROJ_FILE =','/* ---------- online version:'),block(withoutRecovery(after),'const PROJ_FILE =','/* ---------- online version:'),'storage/original/PDF logic unchanged apart from explicit recovery hooks');
// Keep N2's stricter inventory checks; replace only unsafe async wait constructs.
for(const file of fs.readdirSync(path.join(dest,'tests')).filter(n=>n.endsWith('-browser.cjs'))){
 const p=path.join(dest,'tests',file),text=fs.readFileSync(p,'utf8');
 if(text.includes('page.waitForFunction(async'))fs.writeFileSync(p,"const { waitForAsync } = require('./await-condition.cjs');\n"+text.replaceAll('page.waitForFunction(async','waitForAsync(page, async'));
}

for(const file of ['tools/build-identity.cjs','tests/await-condition.cjs',...fs.readdirSync(path.join(root,'tests')).filter(n=>n.startsWith('n3-')&&n.endsWith('.cjs')).map(n=>'tests/'+n)]){
 fs.mkdirSync(path.dirname(path.join(dest,file)),{recursive:true});fs.copyFileSync(path.join(root,file),path.join(dest,file));
}
run(dest,process.execPath,['tools/build-identity.cjs']);commit('TEMP N3 with pinned F3 F6 N2 PDF; unchanged security and PDF code');
console.log(JSON.stringify({main:MAIN,n3:run(root,'git',['rev-parse','HEAD']).trim(),f3:F3,f6:F6,n2:N2,pdf:PDF,combined:git('rev-parse','HEAD').trim()},null,2));
