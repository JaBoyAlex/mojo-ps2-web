// Private game modules and resumable object files never leave IndexedDB.
export function preparationCache(action,key,value,store='modules') {
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open('mojo-browser-preparation-v1',1);
    request.onupgradeneeded=()=>{request.result.createObjectStore('modules');request.result.createObjectStore('parts');};
    request.onerror=()=>reject(request.error);
    request.onsuccess=()=>{
      const db=request.result,tx=db.transaction(store,action==='get'?'readonly':'readwrite'),table=tx.objectStore(store);
      const op=action==='get'?table.get(key):action==='delete'?table.delete(key):table.put(value,key);
      tx.oncomplete=()=>{db.close();resolve(op.result);};
      tx.onerror=tx.onabort=()=>{db.close();reject(tx.error||new Error('Private storage is unavailable'));};
    };
  });
}
export async function digest(bytes) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
}
