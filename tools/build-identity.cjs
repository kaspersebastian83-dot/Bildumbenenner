// Identity of the HTML actually loaded, not a remote Git ref or a release approval.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const file=path.resolve(__dirname,'../index.html'),html=fs.readFileSync(file,'utf8');
const pattern=/const APP_BUILD = 'sha256:(?:[a-f0-9]{64}|BUILD)'/g;
assert.equal([...html.matchAll(pattern)].length,1,'exactly one build declaration');
const normalized=html.replace(pattern,"const APP_BUILD = 'sha256:BUILD'");
const build='sha256:'+crypto.createHash('sha256').update(normalized).digest('hex');
if(process.argv.includes('--check'))assert.ok(html.includes("const APP_BUILD = '"+build+"'"),'Build stale: run node tools/build-identity.cjs');
else fs.writeFileSync(file,html.replace(pattern,"const APP_BUILD = '"+build+"'"));
console.log('FotoKit HTML build '+build);
