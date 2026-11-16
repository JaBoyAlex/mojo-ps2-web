import {ISO_SHA256} from './disc.mjs';
const text=new TextDecoder();
export async function unpackRuntime(blob,threaded) {
  if(blob.size<13||blob.size>100*1024*1024) throw new Error('Invalid runtime package size. Prepare it locally using the documented build.');
  const header=new Uint8Array(await blob.slice(0,13).arrayBuffer());
  if(text.decode(header.subarray(0,9))!=='MOJOWEB1\n') throw new Error('Choose your locally prepared .mojo runtime package.');
  const size=new DataView(header.buffer).getUint32(9,true);
  if(size<16||size>16384||13+size>blob.size) throw new Error('Invalid runtime package header.');
  const meta=JSON.parse(await blob.slice(13,13+size).text());
  if(meta.version!==1||meta.disc!==ISO_SHA256||meta.engine!=='57ef1197c0b818b9a4e1dbb98b1588da38586ffb') throw new Error('This runtime was not prepared for the supported MOJO! disc and engine.');
  const variant=meta.variants?.find(v=>v.name===(threaded?'threaded':'single'));
  if(!variant) throw new Error('This package lacks the required browser variant. Rebuild both variants.');
  const result={threaded};
  for(const kind of ['js','wasm',...(meta.logo?['logo']:[])]) {
    const entry=kind==='logo'?meta.logo:variant[kind];
    if(!entry||!Number.isSafeInteger(entry.offset)||!Number.isSafeInteger(entry.size)||entry.offset<0||entry.size<1||13+size+entry.offset+entry.size>blob.size) throw new Error('Truncated runtime package.');
    const bytes=await blob.slice(13+size+entry.offset,13+size+entry.offset+entry.size).arrayBuffer();
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
    if(digest!==entry.sha256) throw new Error('Runtime checksum mismatch. Prepare a fresh local package.');
    if(kind==='wasm'&&!WebAssembly.validate(bytes)) throw new Error('This browser cannot validate the required Wasm features.');
    result[kind]=new Blob([bytes],{type:kind==='js'?'text/javascript':kind==='logo'?'image/png':'application/wasm'});
  }
  return result;
}
export function runtimeCache(action,blob) {
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open('mojo-runtime-v1',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('runtime');request.onerror=()=>reject(request.error);
    request.onsuccess=()=>{
      const db=request.result,tx=db.transaction('runtime',action==='get'?'readonly':'readwrite'),store=tx.objectStore('runtime');
      const op=action==='get'?store.get('owner-build'):store.put(blob,'owner-build');
      tx.oncomplete=()=>{db.close();resolve(op.result);};tx.onerror=tx.onabort=()=>{db.close();reject(tx.error);};
    };
  });
}
