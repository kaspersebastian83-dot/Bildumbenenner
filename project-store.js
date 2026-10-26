/* Spektron _Projekt.json protection protocol 1. Keep byte-identical in FotoKit and Projektzentrale.
   Web Locks coordinate cooperating tabs only. Verified, retained full snapshots protect the
   final compare/write race across independent profiles; this is not a filesystem transaction. */
(function(root){
  'use strict';
  const FILE = '_Projekt.json', ARCHIVE = '_Projekt_Sicherungen';
  const pattern = /^(kandidat|vorher)_\d{8}T\d{9}Z_[0-9a-f-]{36}\.json$/;
  const enc = new TextEncoder();
  const equal = (a,b) => a.length === b.length && a.every((v,i) => v === b[i]);
  const conflict = () => Error('Die Projektdaten wurden während des Speicherns geändert. Nicht erneut überschreiben: gespeicherte Fassungen prüfen und das Projekt neu öffnen. Vollständige verifizierte Sicherungen bleiben erhalten.');
  async function snapshot(dir, name = FILE){
    let handle;
    try{ handle = await dir.getFileHandle(name); }
    catch(e){ if(e.name === 'NotFoundError') return {exists:false, bytes:new Uint8Array(), revision:'missing'}; throw e; }
    const bytes = new Uint8Array(await (await handle.getFile()).arrayBuffer());
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    return {exists:true, bytes, revision:Array.from(new Uint8Array(hash), b=>b.toString(16).padStart(2,'0')).join('')};
  }
  function parse(s){
    if(!s.exists) return {};
    const text = new TextDecoder('utf-8', {fatal:true, ignoreBOM:true}).decode(s.bytes).replace(/^\uFEFF/, '');
    const o = JSON.parse(text);
    if(!o || typeof o !== 'object' || Array.isArray(o)) throw Error('Keine gültigen gemeinsamen Projektdaten.');
    if(('format' in o && o.format !== 'mosaik-projekt') || ('version' in o && o.version !== 1))
      throw Error('Unbekanntes oder neueres Projektformat. Bitte die Anwendung aktualisieren; die Datei wird nicht überschrieben.');
    return o;
  }
  async function read(dir){ const s = await snapshot(dir); return {...s, data:parse(s)}; }
  async function requireSame(dir, expected){ if((await snapshot(dir)).revision !== expected.revision) throw conflict(); }
  async function put(handle, bytes){
    let w;
    try{
      w = await handle.createWritable();
      // Valid UTF-8 is written as text (also supported by filesystem bridges). For an
      // explicitly restored damaged original, preserve the undecodable bytes exactly.
      let value = bytes;
      try{ const t = new TextDecoder('utf-8', {fatal:true, ignoreBOM:true}).decode(bytes); if(equal(enc.encode(t),bytes)) value=t; }catch(_){}
      await w.write(value); await w.close(); w = null;
    }finally{ if(w) try{ await w.abort(); }catch(_){} }
  }
  async function backup(dir, kind, bytes){
    const archive = await dir.getDirectoryHandle(ARCHIVE, {create:true});
    const stamp = new Date().toISOString().replace(/[-:.]/g,'');
    const name = kind+'_'+stamp+'_'+crypto.randomUUID()+'.json';
    try{ await archive.getFileHandle(name); throw Error('Sicherungsname bereits belegt; bitte erneut versuchen.'); }
    catch(e){ if(e.name !== 'NotFoundError') throw e; }
    await put(await archive.getFileHandle(name, {create:true}), bytes);
    const saved = await snapshot(archive, name);
    if(!saved.exists || !equal(saved.bytes,bytes)) throw Error('Die Sicherung konnte nicht vollständig geprüft werden. Hauptdatei nicht ersetzt.');
    return name;
  }
  async function commit(dir, base, data){
    const bytes = enc.encode(JSON.stringify(data,null,2)+'\n');
    parse({exists:true,bytes});
    // Both complete versions must be durable and read-verified before touching FILE.
    if(base.exists) await backup(dir,'vorher',base.bytes);
    await backup(dir,'kandidat',bytes);
    await requireSame(dir,base);
    const handle = await dir.getFileHandle(FILE, {create:true});
    let w;
    try{
      w = await handle.createWritable();
      // Creation may create an empty, previously absent file. That is the sole
      // allowed change; another nonempty version must still block this write.
      const current = await snapshot(dir);
      if(current.revision !== base.revision && !(base.revision === 'missing' && current.exists && !current.bytes.length)) throw conflict();
      await w.write(new TextDecoder().decode(bytes)); await w.close(); w=null;
    }finally{ if(w) try{ await w.abort(); }catch(_){} }
    const after = await snapshot(dir);
    if(!after.exists || !equal(after.bytes,bytes)) throw conflict();
    await prune(dir);
    return data;
  }
  // Keep the project folder tidy: only the files of the last ~5 saves stay (2 files per save).
  const KEEP = 10;
  async function prune(dir){
    try{
      const archive = await dir.getDirectoryHandle(ARCHIVE), names = [];
      for await (const h of archive.values()) if(h.kind === 'file' && pattern.test(h.name)) names.push(h.name);
      const stamp = n => n.slice(n.indexOf('_')+1);
      names.sort((a,b) => stamp(b).localeCompare(stamp(a)));
      for(const n of names.slice(KEEP)) { try{ await archive.removeEntry(n); }catch(_){} }
    }catch(_){ /* tidying is best-effort; the main file is already saved */ }
  }
  function locked(name, fn){ return root.navigator?.locks ? root.navigator.locks.request('mosaik:projekt:'+name,fn) : fn(); }
  async function update(dir,name,build,expected){
    return locked(name,async()=>{
      const base=await read(dir);
      // Preserve the existing field-patch workflow, including fresh unrelated
      // fields from cooperating apps. An edited field changed since it was shown
      // to the user is a conflict, never a silent last-writer-wins replacement.
      if(expected?.data && expected.keys.some(k=>JSON.stringify(base.data[k]??'')!==JSON.stringify(expected.data[k]??''))) throw conflict();
      const data=build(base.data);
      return commit(dir,base,data);
    });
  }
  async function versions(dir){
    const current = await snapshot(dir), items=[], invalid=[];
    let archive;
    try{ archive=await dir.getDirectoryHandle(ARCHIVE); }
    catch(e){ if(e.name==='NotFoundError') return {current,items,invalid}; throw e; }
    const seen=new Set([current.revision]);
    for await(const [name,handle] of archive.entries()){
      if(handle.kind!=='file' || !pattern.test(name)) continue;
      try{
        const s=await snapshot(archive,name), data=parse(s);
        if(!s.exists) throw Error('Datei fehlt');
        if(!seen.has(s.revision)){ seen.add(s.revision); items.push({name,revision:s.revision,data}); }
      }catch(e){ invalid.push(name+': '+e.message); }
    }
    items.sort((a,b)=>b.name.localeCompare(a.name));
    return {current,items,invalid};
  }
  async function restore(dir,name,choice,expected){
    return locked(name,async()=>{
      const base=await snapshot(dir);
      if(base.revision!==expected.revision) throw conflict();
      // Damaged old bytes may be restored over only by explicit choice; incompatible
      // newer/foreign formats remain protected even in this recovery workflow.
      try{ parse(base); }catch(e){ if(/Projektformat/.test(e.message)) throw e; }
      const archive=await dir.getDirectoryHandle(ARCHIVE);
      if(!pattern.test(choice.name)) throw Error('Ungültiger Sicherungsname.');
      const selected=await readNamed(archive,choice.name);
      if(selected.revision!==choice.revision) throw Error('Die ausgewählte Sicherung wurde geändert. Bitte erneut prüfen.');
      const nr=/^\d{2}\.\d{2,6}(?=[\s_-]|$)/.exec(name)?.[0];
      if(nr && selected.data.projektnummer && selected.data.projektnummer!==nr) throw Error('Die Sicherung gehört zu einer anderen Projektnummer.');
      return commit(dir,base,selected.data);
    });
  }
  async function readNamed(dir,name){ const s=await snapshot(dir,name); if(!s.exists) throw Error('Sicherung fehlt.'); return {...s,data:parse(s)}; }
  // The recovery surface is deliberately independent of each application's existing
  // dialogs. No candidate is loaded or merged automatically, and every version is reachable.
  function recoveryButton(host,dir,name,{before=async()=>{},after=async()=>{}}={}){
    const button=document.createElement('button'); button.type='button'; button.textContent='Gespeicherte Projektfassungen prüfen';
    button.dataset.pjRecovery=''; host.replaceChildren(button);
    async function count(){
      try{ const v=await versions(dir); button.textContent='Projektfassungen prüfen'+(v.items.length?' ('+v.items.length+' abweichend)':'')+(v.invalid.length?' · beschädigte Sicherungen':''); }
      catch(e){ button.textContent='Projektfassungen prüfen · Lesen fehlgeschlagen'; button.title=e.message; }
    }
    button.onclick=async()=>{
      const dlg=document.createElement('dialog'); dlg.dataset.pjRecoveryDialog=''; dlg.style.cssText='max-width:850px;width:90%;max-height:85vh;overflow:auto';
      const title=document.createElement('h3'); title.textContent='Gespeicherte Projektfassungen – '+name;
      const note=document.createElement('p'); note.textContent='Abweichende Fassungen können frühere, überschriebene oder unterbrochene Speicherungen enthalten. Jede Fassung wird vollständig übernommen; Inhalte werden nicht zusammengeführt. Sicherungen bleiben erhalten.';
      const content=document.createElement('div'), close=document.createElement('button'); close.textContent='Schließen'; close.onclick=()=>dlg.close();
      dlg.append(title,note,content,close); document.body.append(dlg); dlg.addEventListener('close',()=>dlg.remove()); dlg.showModal();
      try{
        await before(); const found=await versions(dir);
        const status=document.createElement('p'); status.textContent=found.items.length+' abweichende Fassung(en). '+(found.invalid.length?found.invalid.length+' beschädigte oder inkompatible Sicherung(en) bleiben erhalten: '+found.invalid.join('; '):''); content.append(status);
        let page=0;
        const list=document.createElement('div'), prev=document.createElement('button'), next=document.createElement('button'); prev.textContent='Zurück'; next.textContent='Weitere Fassungen'; content.append(list,prev,next);
        const draw=()=>{
          list.replaceChildren(); prev.disabled=!page; next.disabled=(page+1)*20>=found.items.length;
          for(const choice of found.items.slice(page*20,page*20+20)){
            const row=document.createElement('div'), check=document.createElement('button'); check.textContent='Fassung prüfen: '+choice.name;
            check.onclick=()=>{
              row.replaceChildren(check); const preview=document.createElement('textarea'); preview.readOnly=true; preview.value=JSON.stringify(choice.data,null,2); preview.style.cssText='width:100%;height:240px'; preview.setAttribute('aria-label','Vollständige gespeicherte Projektfassung');
              const apply=document.createElement('button'); apply.textContent='Diese vollständige Fassung wiederherstellen'; apply.dataset.pjRestore='';
              apply.onclick=async()=>{
                apply.disabled=true;
                try{ await before(); const data=await restore(dir,name,choice,found.current); await after(data); dlg.close(); await count(); }
                catch(e){ status.textContent='Nicht wiederhergestellt: '+e.message; apply.disabled=false; }
              };
              row.append(preview,apply);
            };
            row.append(check); list.append(row);
          }
        }; prev.onclick=()=>{page--;draw();};next.onclick=()=>{page++;draw();};draw();
      }catch(e){ content.textContent='Fassungen können nicht geprüft werden: '+e.message; }
    };
    count(); return count;
  }
  root.ProjectStore=Object.freeze({read,update,versions,restore,recoveryButton,FILE,ARCHIVE});
  if(typeof module!=='undefined') module.exports=root.ProjectStore;
})(globalThis);
