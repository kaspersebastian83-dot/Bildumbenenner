// Apply only to the disposable, pinned integration test checkout. Product sources stay unchanged.
// N2 intentionally adds immutable metadata snapshots during failed retries. Preserve
// every previous byte assertion and reject all added paths except valid N2 records.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(process.argv[2]||''),p=path.join(root,'tests/integration/security.mjs');
const text=fs.readFileSync(p,'utf8'),old='    assert.deepEqual(await files(inspector,F.project),failed);';
assert.equal(text.split(old).length,2,'exactly one known inventory assertion is adapted');
const replacement=`    const retried=await files(inspector,F.project);
    for(const [name,bytes] of Object.entries(failed))assert.deepEqual(retried[name],bytes,'Retry preserves every existing byte: '+name);
    for(const name of Object.keys(retried).filter(n=>!(n in failed))){
      assert.match(name,/^Fotos\\/_FotoKit_Fassungen\\/(ausgang|vorher|kandidat|bestaetigt)_\\d{8}T\\d{9}Z_[0-9a-f-]{36}\\.json$/,'Only N2 snapshots may be added');
      const version=json(retried,name);assert.equal(version.app,'Bildumbenenner');assert.equal(version.format,1);assert.ok(version.bilder&&typeof version.bilder==='object');
    }`;
fs.writeFileSync(p,text.replace(old,replacement));
console.log('Adapted only the expected N2 archive additions; all existing-file byte assertions retained.');
