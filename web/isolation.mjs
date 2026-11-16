// GitHub Pages cannot set arbitrary response headers. A same-origin service
// worker applies them locally; no game content is cached or transmitted by it.
export async function prepareIsolation() {
  if(crossOriginIsolated||!navigator.serviceWorker||!isSecureContext) return;
  try {
    await navigator.serviceWorker.register(new URL('isolation-worker.js',import.meta.url),{scope:'./',updateViaCache:'none'});
    await navigator.serviceWorker.ready;
    const key='mojo-isolation-reload:'+location.pathname;
    if(!sessionStorage.getItem(key)) {sessionStorage.setItem(key,'1');location.reload();await new Promise(()=>{});}
  } catch(error) {console.warn('Browser isolation could not be enabled.',error);}
}
