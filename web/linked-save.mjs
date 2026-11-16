import {CARD_BYTES} from './save-card.mjs';

// File handles are structured-cloned into IndexedDB; no file paths or save bytes
// are uploaded. Access can only be granted by the browser's own picker/prompt.
export function handleStore(action,handle) {
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open('mojo-save-file-v1',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('handles');
    request.onerror=()=>reject(request.error);
    request.onsuccess=()=>{
      const db=request.result,tx=db.transaction('handles',action==='get'?'readonly':'readwrite'),store=tx.objectStore('handles');
      const op=action==='get'?store.get('card'):action==='delete'?store.delete('card'):store.put(handle,'card');
      tx.oncomplete=()=>{db.close();resolve(op.result);};
      tx.onerror=tx.onabort=()=>{db.close();reject(tx.error||new Error('File location could not be remembered'));};
    };
  });
}

export class LinkedSave {
  constructor({store=handleStore,onChange=()=>{}}={}) {
    this.store=store;this.onChange=onChange;this.handle=null;this.granted=false;
    this.pending=null;this.waiters=[];this.busy=false;this.lastError='';this.dirty=false;
  }
  notify() {this.onChange({name:this.handle?.name,connected:this.granted,error:this.lastError,dirty:this.dirty});}
  async restore() {
    try {const record=await this.store('get');this.handle=record?.handle||record||null;this.dirty=!!record?.dirty;if(this.handle) this.granted=await this.handle.queryPermission({mode:'readwrite'})==='granted';}
    catch(error) {this.lastError=error.message;}
    this.notify();
  }
  async attach(handle) {
    // Attaching never silently discards a failed old save operation.
    if(this.busy) throw new Error('Wait for the current save to finish before changing its location.');
    if(await handle.queryPermission({mode:'readwrite'})!=='granted') throw new Error('Read/write access was not granted. Browser saves remain available.');
    this.handle=handle;this.granted=true;this.lastError='';this.dirty=false;
    try {await this.store('put',{handle,dirty:false});}catch {this.lastError='Location works for this session but could not be remembered.';}
    this.notify();
  }
  async reconnect() {
    // Call directly from a click handler so requestPermission has user activation.
    if(!this.handle) return false;
    try {this.granted=await this.handle.requestPermission({mode:'readwrite'})==='granted';this.lastError='';}
    catch(error) {this.granted=false;this.lastError=error.message;}
    this.notify();return this.granted;
  }
  async read() {
    // A failed mirror must never let an older disk copy replace newer progress.
    if(!this.handle||this.dirty) return null;
    try {
      if(await this.handle.queryPermission({mode:'readwrite'})!=='granted') {this.granted=false;this.notify();return null;}
      const file=await this.handle.getFile();
      if(file.size!==CARD_BYTES) throw new Error('The linked file is not a complete PS2 card. Your browser copy has been preserved.');
      return new Uint8Array(await file.arrayBuffer());
    } catch(error) {this.granted=false;this.lastError=error.message;this.notify();return null;}
  }
  save(bytes) {
    if(!this.handle) return Promise.resolve(false);
    if(bytes.length!==CARD_BYTES) return Promise.reject(new Error('Refusing to write an incomplete memory card.'));
    // readFile supplies an owned snapshot. Coalesce pending snapshots so slow
    // storage cannot build an unbounded queue of full-card copies.
    this.pending=bytes;
    const completion=new Promise(resolve=>this.waiters.push(resolve));
    if(!this.busy) this.drain();
    return completion;
  }
  async drain() {
    this.busy=true;
    while(this.pending) {
      const bytes=this.pending,waiters=this.waiters;this.pending=null;this.waiters=[];
      let writable=null,ok=false;
      try {
        this.dirty=true;
        await this.store('put',{handle:this.handle,dirty:true});
        if(await this.handle.queryPermission({mode:'readwrite'})!=='granted') throw new Error('Reconnect the linked save file. Progress is still saved in this browser.');
        writable=await this.handle.createWritable();
        await writable.write(bytes);await writable.close();writable=null;
        this.granted=true;this.lastError='';ok=true;
        if(!this.pending) {await this.store('put',{handle:this.handle,dirty:false});this.dirty=false;}
      } catch(error) {
        if(writable) {try {await writable.abort();}catch{}}
        this.granted=false;this.lastError=error.message;
      }
      waiters.forEach(resolve=>resolve(ok));this.notify();
      if(!ok) {
        this.pending=null;this.waiters.splice(0).forEach(resolve=>resolve(false));break;
      }
    }
    this.busy=false;
  }
  async unlink() {
    if(this.busy) throw new Error('Wait for the current save to finish.');
    await this.store('delete');this.handle=null;this.granted=false;this.lastError='';this.dirty=false;this.notify();
  }
}
