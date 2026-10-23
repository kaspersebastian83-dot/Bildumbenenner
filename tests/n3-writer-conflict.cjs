// Run in the pinned F3/F6/N2/PDF combination. Independent synthetic sessions.
const assert=require('node:assert/strict');
const {disk,session,encode,fixture}=require('./n2-speichersicherheit.cjs');
(async()=>{
 const d=disk(),A=session(d),B=session(d);await A.open();await B.open();
 B.edit('a.jpg','NEW FULL B');assert.equal(await B.flushProject(),true);const confirmedB=d.text();
 A.edit('a.jpg','STALE A');assert.equal(await A.flushProject(),false);assert.equal(d.text(),confirmedB);
 assert.deepEqual(d.json().extension,fixture().extension);
 console.log('PASS N3 WRITERS: stale cooperating A cannot replace contradictory full B');
 // Simulate already incurred loss; the real unchanged pre-F6 attack runs in browser.
 d.files.set('_Bildumbenenner.json',encode(JSON.stringify(fixture())));
 const restart=session(d);await restart.open();const versions=await restart.photoVersions(d.dir);
 const chosen=versions.items.find(v=>v.name.startsWith('bestaetigt_')&&new TextDecoder().decode(v.snapshot.bytes)===confirmedB);assert.ok(chosen);
 await restart.restorePhotoVersion(d.dir,chosen,versions.current);assert.equal(d.text(),confirmedB);
 assert.equal(await A.flushProject(),false);assert.equal(d.text(),confirmedB);
 console.log('PASS N3 WRITERS: explicit B restoration survives another contradictory stale cooperating write');
})().catch(e=>{console.error(e);process.exitCode=1});
