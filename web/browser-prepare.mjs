import {preparationCache} from './preparation-cache.mjs';
import {ISO_SHA256} from './disc.mjs';
let manifest;
export async function preparationManifest(){return manifest??=await(await fetch('browser-tools/manifest.json')).json();}
const key=version=>version+'/'+ISO_SHA256;
export async function rememberedPreparation(){
  const info=await preparationManifest();
  const value=await preparationCache('get',key(info.version));
  return value?.version===info.version&&value.ee instanceof Uint8Array&&value.vu instanceof Uint8Array?value:null;
}
function compile(kind,input,info,onProgress) {
  return new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('preparation-worker.mjs',import.meta.url),{type:'module'});
    worker.onmessage=({data})=>{
      if(data.type==='progress')onProgress(data.value,data.message);
      else {worker.terminate();data.type==='result'?resolve(data.bytes):reject(new Error(data.message));}
    };
    worker.onerror=()=>{worker.terminate();reject(new Error('Browser preparation stopped. Keep this tab open and try again.'));};
    worker.postMessage({kind,input,compiler:info.compiler});
  });
}
function capture(disc,ee,expected) {
  return new Promise((resolve,reject)=>{
    const frame=document.createElement('iframe'),id=crypto.randomUUID();frame.hidden=true;frame.title='Private game preparation';
    const finish=(error,value)=>{clearTimeout(timeout);removeEventListener('message',receive);frame.remove();error?reject(error):resolve(value);};
    const receive=event=>{
      if(event.source!==frame.contentWindow||event.origin!==location.origin)return;
      if(event.data.type==='mojo-warmup-listening')frame.contentWindow.postMessage({type:'mojo-warmup',id,disc,ee,expected},location.origin);
      else if(event.data.id===id){
        if(event.data.type==='mojo-warmup-ready')finish(null,event.data.captures);
        else if(event.data.type==='mojo-warmup-error')finish(new Error(event.data.message));
      }
    };
    const timeout=setTimeout(()=>finish(new Error('Preparation timed out. Keep this tab open and try again.')),120000);
    addEventListener('message',receive);frame.src=new URL('preparation-frame.html',import.meta.url);document.body.append(frame);
  });
}
export async function prepareInBrowser(disc,onProgress=()=>{}) {
  const info=await preparationManifest(),cacheKey=key(info.version);
  const existing=await rememberedPreparation().catch(()=>null);if(existing)return existing;
  let ee=await preparationCache('get',cacheKey+'/ee').catch(()=>null);
  if(!ee){ee=await compile('ee',disc.elf,info,(value,message)=>onProgress(.05+.65*value,message));await preparationCache('put',cacheKey+'/ee',ee).catch(()=>{});}
  onProgress(.72,'Finishing your private game setup…');
  let captures=await preparationCache('get',cacheKey+'/vectors').catch(()=>null);
  if(!captures){captures=await capture(disc,ee,info.profile.vuCaptures);await preparationCache('put',cacheKey+'/vectors',captures).catch(()=>{});}
  const vu=await compile('vu',captures,info,(value,message)=>onProgress(.8+.19*value,message));
  const runtime={version:info.version,ee,vu};
  // A successful session can play even if the device declines persistent storage.
  let remembered=true;
  try{await preparationCache('put',cacheKey,runtime);navigator.storage?.persist?.().catch(()=>{});}catch{remembered=false;}
  onProgress(1,remembered?'Ready. Your game is remembered on this device.':'Ready. Storage is unavailable; setup may be needed next time.');
  return runtime;
}
