// Compose only in a NEW disposable clone. No existing security branch is changed.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),dest=path.resolve(process.argv[2]),main='b616164f5ab24faa5371f4eb714276f6080a8bf3',n2='063b91d1f253c2c05fac221cd55b071be19fba59',f3='5617ff033cd29c0a3fa43bb4246be598830cbfcd',f6='9c7929b6aebca4dc7fe8d95d7b518ea0946a66d0';
assert.ok(!fs.existsSync(dest),'Destination must not exist');
const run=(cwd,cmd,args,opts={})=>cp.execFileSync(cmd,args,{cwd,encoding:'utf8',stdio:['pipe','pipe','inherit'],...opts});
run(root,'git',['clone','--no-hardlinks','--no-checkout',root,dest]);
run(dest,'git',['config','core.autocrlf','false']);run(dest,'git',['config','core.eol','lf']);
run(dest,'git',['fetch','https://github.com/kaspersebastian83-dot/Bildumbenenner.git',n2,f3,f6]);run(dest,'git',['checkout','--detach',n2]);
run(dest,process.execPath,['tests/n2-compose-compat.cjs']);
const before=fs.readFileSync(path.join(dest,'index.html'),'utf8'),{outside}=require('../tests/pdf-layout.cjs');
const patch=run(root,'git',['diff','--binary',main,'HEAD','--','index.html','assets/firmenlogo.png','tests/pdf-layout.cjs','tests/pdf-layout-browser.cjs']);
run(dest,'git',['apply','--check','-'],{input:patch});run(dest,'git',['apply','-'],{input:patch});
assert.equal(outside(before),outside(fs.readFileSync(path.join(dest,'index.html'),'utf8')),'Security and every non-PDF source byte unchanged by layout');
run(dest,'git',['add','index.html','assets/firmenlogo.png','tests/pdf-layout.cjs','tests/pdf-layout-browser.cjs','tests/unknown-fields.cjs']);run(dest,'git',['-c','user.name=PDF Compatibility','-c','user.email=pdf@example.invalid','commit','-m','TEMP: PDF layout with pinned F3 F6 N2; original security assertions']);
console.log(run(dest,'git',['rev-parse','HEAD']).trim());console.log('PDF '+run(root,'git',['rev-parse','HEAD']).trim()+'; F3 '+f3+'; F6 '+f6+'; N2 '+n2+'; non-PDF source bytes unchanged');
