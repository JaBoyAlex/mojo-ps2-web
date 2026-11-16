import {ISO_SHA256} from './disc.mjs';
import {cameraAxis} from './input.mjs';
import {ensureFormattedCard} from './save-card.mjs';
import {LinkedSave} from './linked-save.mjs';
import {unpackRuntime,runtimeCache} from './runtime-package.mjs';
import {prepareIsolation} from './isolation.mjs';
const $=id=>document.getElementById(id),params=new URLSearchParams(location.search);
const buildConfig=await (await fetch('build-config.json',{cache:'no-cache'})).json();
if(buildConfig.localRuntime) await prepareIsolation();
// The worker host is the qualified audio path. Do not select the experimental
// serial host merely because a browser lacks cross-origin isolation.
let threaded=buildConfig.localRuntime?true:buildConfig.threaded;
let engineStarted=false;
let ready=false,disc=null,running=false,paused=false,audio=null,audioNode=null,lastBuffer=null,leaseRelease=null;
let initialized=false,starting=false,activeScale=null,activeHud=false,resolveInitialization;
const initialization=new Promise(resolve=>{resolveInitialization=resolve;});
let startTime=0,frameSamples=[],lastStat=0,lastFrames=0,underruns=0,importStarted=0,importMs=0;
const errors=[],keys=new Set(),bindings={ArrowUp:4,ArrowRight:5,ArrowDown:6,ArrowLeft:7,KeyZ:14,KeyX:13,KeyA:15,KeyS:12,KeyQ:10,KeyW:11,Digit1:8,Digit2:9,Enter:3,Backspace:0};
const hasJSPI=typeof WebAssembly.Suspending==='function';
function status(message,error=false) {$('status').textContent=message;$('status').classList.toggle('error',error);if(error) console.error(message);}
function fatal(error) {const message=error?.message||String(error);errors.push(message);status(message,true);$('game-status').textContent=message;$('game-status').classList.add('error');$('play').disabled=true;}
function updateReady() {$('play').disabled=starting||!(ready&&disc&&hasJSPI&&navigator.gpu&&(!threaded||crossOriginIsolated));}
function storageGet(key,otherwise) {try{return localStorage.getItem(key)??otherwise;}catch{return otherwise;}}
function storageSet(key,value) {try{localStorage.setItem(key,value);}catch{}}
const camera={x:storageGet('mojo.rightStickInvertX','false')==='true',y:storageGet('mojo.rightStickInvertY','false')==='true'};
const settings=document.createElement('section');settings.className='camera-settings';settings.setAttribute('aria-label','Camera settings');
settings.innerHTML='<span class="step">CAMERA</span><label><input id="invert-x" type="checkbox"> Invert right stick X</label><label><input id="invert-y" type="checkbox"> Invert right stick Y</label>';
document.querySelector('footer').before(settings);
for(const axis of ['x','y']) {const input=$('invert-'+axis);input.checked=camera[axis];input.onchange=()=>{camera[axis]=input.checked;storageSet('mojo.rightStickInvert'+axis.toUpperCase(),String(input.checked));};}
const supportsSaveFile=typeof window.showSaveFilePicker==='function'&&typeof window.showOpenFilePicker==='function';
const saveSettings=document.createElement('section');saveSettings.className='save-settings';saveSettings.setAttribute('aria-label','Save location');
saveSettings.innerHTML='<span class="step">SAVE LOCATION</span><p id="save-location">Automatic browser storage · progress is remembered on this device.</p><div><button id="link-save">Save current card to a file…</button><button id="open-save">Link existing save file…</button><button id="reconnect-save" hidden>Reconnect save file</button><button id="unlink-save" hidden>Use browser storage</button><button id="download-card">Download a backup copy</button></div>';
settings.before(saveSettings);
const resolutionSettings=document.createElement('section');resolutionSettings.className='resolution-settings';resolutionSettings.setAttribute('aria-label','Rendering resolution');
resolutionSettings.innerHTML='<span class="step">RESOLUTION</span><label for="render-scale">Game rendering</label><select id="render-scale"><option value="1">Original · 640 × 448</option><option value="2">Enhanced · 1280 × 896</option><option value="3">High · 1920 × 1344</option><option value="4">Ultra · 2560 × 1792</option></select><span id="resolution-note">Display size stays the same.</span>';
settings.before(resolutionSettings);
resolutionSettings.insertAdjacentHTML('beforeend','<div class="hud-option"><label><input id="upscale-hud" type="checkbox"> Upscale HUD / 2D artwork</label><span id="hud-note"></span></div>');
$('upscale-hud').checked=storageGet('mojo.upscaleHud','false')==='true';
function updateHudNote() {$('hud-note').textContent=Number($('render-scale').value)<2?'Requires Enhanced resolution or higher.':running?($('upscale-hud').checked===activeHud?'Active for this game.':'Saved · reload and Play to apply.'):'Applies when you start the game.';}
function updateResolutionNote() {
  $('resolution-note').textContent=running?`Active: ${640*activeScale} × ${448*activeScale}`+($('render-scale').value!==String(activeScale)?' · reload and Play to apply your new choice.':'. Display size stays the same.'):'Display size stays the same.';
  updateHudNote();
}
$('upscale-hud').onchange=()=>{storageSet('mojo.upscaleHud',String($('upscale-hud').checked));updateHudNote();};
const savedScale=storageGet('mojo.renderScale','1');$('render-scale').value=['1','2','3','4'].includes(savedScale)?savedScale:'1';
$('render-scale').onchange=()=>{storageSet('mojo.renderScale',$('render-scale').value);updateResolutionNote();};
updateHudNote();
const linkedSave=new LinkedSave({onChange:({name,connected,error,dirty})=>{
  $('save-location').textContent=name?(connected?`Automatically saving to ${name} · loaded here next time.`:`${name} needs reconnection. Your browser copy is kept.`):'Automatic browser storage · progress is remembered on this device.';
  if(error) $('save-location').textContent+=' '+error;
  else if(dirty) $('save-location').textContent+=' Newer browser progress is waiting to be written to this file.';
  $('save-location').classList.toggle('error',!!error);
  $('reconnect-save').hidden=!name||connected;$('unlink-save').hidden=!name;
  $('export').textContent=name?'Save to linked file':'Save card to file…';
}});
const linkedSaveReady=linkedSave.restore();
$('link-save').hidden=$('open-save').hidden=!supportsSaveFile;
if(!supportsSaveFile) $('save-location').textContent='Automatic browser storage · this browser supports manual backup downloads.';
function loadEmptyTemplate() {return fetch('empty-card.json').then(response=>{if(!response.ok) throw new Error('Empty-card template is missing. Rebuild the browser distribution.');return response.json();});}
function reportSaveError(error) {$('save-location').textContent=error.message;$('save-location').classList.add('error');}
async function mirrorSave() {
  await linkedSaveReady;
  if(!linkedSave.handle) return false;
  const saved=await linkedSave.save(Module.FS.readFile('/memcard/Mcd001.ps2'));
  if(!saved) $('game-status').textContent='Saved in browser · reconnect the save file to update it.';
  return saved;
}
function downloadCard() {
  try {const bytes=Module.FS.readFile('/memcard/Mcd001.ps2'),link=document.createElement('a');link.href=URL.createObjectURL(new Blob([bytes]));link.download='mojo.ps2';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),10000);}
  catch {reportSaveError(new Error('Start the game once to initialize the save card.'));}
}
async function chooseSaveFile() {
  if(!ready) throw new Error('Wait for the runtime to finish loading.');
  // The picker is invoked before other awaits to retain user activation.
  const handle=await window.showSaveFilePicker({suggestedName:'mojo.ps2',types:[{description:'PS2 memory card',accept:{'application/octet-stream':['.ps2']}}]});
  await ensureFormattedCard(Module.FS,loadEmptyTemplate,syncSaves);
  await linkedSave.attach(handle);await mirrorSave();
}
async function exportCard() {
  if(linkedSave.handle) {if(!linkedSave.granted&&!await linkedSave.reconnect()) return;await mirrorSave();}
  else if(supportsSaveFile) await chooseSaveFile();
  else downloadCard();
}
function saveAction(action) {return ()=>action().catch(error=>{if(error.name!=='AbortError') reportSaveError(error);});}
$('link-save').onclick=saveAction(chooseSaveFile);
$('open-save').onclick=saveAction(async()=>{
  if(!ready) throw new Error('Wait for the runtime to finish loading.');
  if(running) throw new Error('Reload the launcher before loading a different card.');
  const [handle]=await window.showOpenFilePicker({multiple:false,types:[{description:'PS2 memory card',accept:{'application/octet-stream':['.ps2']}}]});
  // Opening with a remembered file handle initially grants read access only.
  if(await handle.requestPermission({mode:'readwrite'})!=='granted') throw new Error('Choose read/write access to automatically save back to this file.');
  const file=await handle.getFile();
  if(file.size!==8650752) throw new Error('Choose a complete 8 MiB PS2 card with ECC (8,650,752 bytes).');
  const bytes=new Uint8Array(await file.arrayBuffer());
  await linkedSave.attach(handle);Module.FS.writeFile('/memcard/Mcd001.ps2',bytes);await syncSaves();
});
$('reconnect-save').onclick=saveAction(async()=>{if(await linkedSave.reconnect()) {if(running) await mirrorSave();else status('Save file reconnected. It will be loaded when you select Play.');}});
$('unlink-save').onclick=saveAction(()=>linkedSave.unlink());
$('download-card').onclick=downloadCard;

async function db(action,value) {
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open('mojo-local-disc-v1',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('disc');
    request.onerror=()=>reject(request.error);
    request.onsuccess=()=>{
      const database=request.result,tx=database.transaction('disc',action==='get'?'readonly':'readwrite'),store=tx.objectStore('disc');
      const op=action==='get'?store.get(ISO_SHA256):action==='delete'?store.delete(ISO_SHA256):store.put(value,ISO_SHA256);
      tx.oncomplete=()=>{database.close();resolve(op.result);};tx.onerror=()=>{database.close();reject(tx.error);};tx.onabort=()=>{database.close();reject(tx.error||new Error('Disc storage aborted'));};
    };
  });
}
async function validate(file,cache=true) {
  $('play').disabled=true;$('disc').disabled=true;$('progress').hidden=false;importStarted=performance.now();
  try {
    const result=await new Promise((resolve,reject)=>{
      const worker=new Worker(new URL('disc-worker.mjs',import.meta.url),{type:'module'});
      worker.onerror=e=>{worker.terminate();reject(new Error(e.message));};
      worker.onmessage=({data})=>{if(data.error) {worker.terminate();reject(new Error(data.error));}else if(data.result) {worker.terminate();resolve(data.result);}else {$('progress').value=data.value;status(data.message);}};
      worker.postMessage(file);
    });
    disc=result;importMs=performance.now()-importStarted;$('disc-name').textContent=`Verified USA disc · ${(disc.iso.size/1048576).toFixed(1)} MiB`;
    status('Disc verified. Ready to play.');
    if(cache&&$('remember').checked) {
      try {await db('put',disc.iso);navigator.storage?.persist?.().catch(()=>{});}
      catch {status('Disc verified. Storage is full or unavailable; select the disc again next time.');}
    }
  } catch(error) {disc=null;status(error.message,true);}
  finally {$('disc').disabled=false;$('progress').hidden=true;updateReady();}
}
let saving=false,saveAgain=false,saveWaiters=[];
function syncSaves() {
  return new Promise((resolve,reject)=>{
    saveWaiters.push({resolve,reject});
    if(saving) {saveAgain=true;return;}
    doSync();
  });
}
function doSync() {
  saving=true;const callbacks=saveWaiters;saveWaiters=[];
  Module.FS.syncfs(false,error=>{
    saving=false;callbacks.forEach(p=>error?p.reject(error):p.resolve());
    if(error) $('game-status').textContent='Save storage failed. Export your save card now.';
    if(saveAgain) {saveAgain=false;doSync();}
  });
}
function resize() {
  if(!running) return;
  const stage=$('stage'),rect=stage.getBoundingClientRect(),fullscreen=document.fullscreenElement===stage;
  const dpr=fullscreen?(devicePixelRatio||1):Math.min(devicePixelRatio||1,2);
  const width=Math.max(1,Math.round(rect.width*dpr));
  const height=Math.max(1,Math.round((fullscreen?rect.height:Math.min(innerHeight*.78,rect.width*.75))*dpr));
  if($('canvas').width!==width||$('canvas').height!==height) {$('canvas').width=width;$('canvas').height=height;Module._ps2web_resize(width,height);}
}
function pollInput() {
  let bits=0;for(const key of keys) if(key in bindings) bits|=1<<bindings[key];
  const pads=Array.from(navigator.getGamepads?.()||[]).filter(p=>p?.connected&&p.mapping==='standard');
  const map=[14,13,15,12,10,11,8,9,0,3,1,2,4,6,7,5];
  for(let p=0;p<2;p++) {
    const gamepad=pads[p];let buttons=p===0?bits:0,lx=128,ly=128,rx=128,ry=128;
    const axis=v=>Math.round((Math.abs(v||0)<.12?0:Math.max(-1,Math.min(1,v)))*127+128);
    if(gamepad) {for(let i=0;i<16;i++) if(gamepad.buttons[i]?.pressed) buttons|=1<<map[i];[lx,ly,rx,ry]=Array.from({length:4},(_,i)=>axis(gamepad.axes[i]));}
    if(p===0) {if(keys.has('KeyJ')) rx=0;if(keys.has('KeyL')) rx=255;if(keys.has('KeyI')) ry=0;if(keys.has('KeyK')) ry=255;}
    rx=cameraAxis(rx,camera.x);ry=cameraAxis(ry,camera.y);
    if(paused) {buttons=0;lx=ly=rx=ry=128;}
    Module._ps2web_pad_connected(p,p===0||!!gamepad?1:0);Module._ps2web_pad(p,buttons,lx,ly,rx,ry);
  }
}
async function startAudio() {
  if(!audio) {
    audio=new AudioContext({sampleRate:48000,latencyHint:'interactive'});
    await audio.audioWorklet.addModule('audio-worklet.js');
    const base=Module._ps2web_audio_ring();lastBuffer=Module.HEAPU8.buffer;
    audioNode=new AudioWorkletNode(audio,'mojo-audio',{outputChannelCount:[2],processorOptions:{shared:threaded,buffer:threaded?lastBuffer:undefined,base}});
    audioNode.port.onmessage=({data})=>{underruns=data.underrunSamples;Module.queuedAudioMs=data.queuedMs;};
    audioNode.connect(audio.destination);
    Module.pushAudio=samples=>{const copy=new Int16Array(samples);audioNode.port.postMessage({samples:copy},[copy.buffer]);};
  }
  await audio.resume();
}
async function setPaused(value) {
  paused=value;keys.clear();Module._ps2web_pause(value?1:0);pollInput();
  $('resume').hidden=!value;$('pause').textContent=value?'Resume':'Pause';
  if(value) {if(audio) await audio.suspend();if(threaded) Atomics.store(new Uint32Array(Module.HEAPU8.buffer,Module._ps2web_audio_ring(),4),3,0);syncSaves().catch(()=>{});}
  else {
    if(threaded) {const ring=new Uint32Array(Module.HEAPU8.buffer,Module._ps2web_audio_ring(),4);Atomics.store(ring,1,Atomics.load(ring,0));}
    else audioNode?.port.postMessage({clear:true});
    await startAudio();$('canvas').focus();
  }
}
function snapshot() {return {threaded,running,paused,renderScale:activeScale,hudUpscale:activeHud,frames:initialized?Module._ps2web_frames():0,heapBytes:Module.HEAPU8?.length,primitives:initialized?Module._ps2web_primitives():0,gpuMs:initialized?Module._ps2web_gpu_ms():0,vuInterpreted:initialized?Module._ps2web_vu_interpreted():0,audioState:audio?.state,underrunSamples:underruns,importMs,elapsedMs:running?performance.now()-startTime:0,errors:[...errors]};}
globalThis.mojoDiagnostics={snapshot};
globalThis.Module={
  canvas:$('canvas'),noInitialRun:true,discUrl:'local-disc',arguments:['/game/core.elf'],
  print:text=>console.log(text),printErr:text=>console.log(text),onAbort:fatal,
  setStatus:text=>{if(text&&!disc) status(text);},
  preRun:[()=>{
    // C++ constructors can cache libc's environment. Hold them until Play has
    // supplied the selected settings; changing Module.ENV afterward is too late.
    Module.addRunDependency('mojo-launch-settings');
    const FS=Module.FS;FS.mkdir('/game');FS.mkdir('/memcard');FS.mount(Module.IDBFS,{},'/memcard');
    Module.addRunDependency('mojo-save-load');
    FS.syncfs(true,error=>{if(error) status('Save storage unavailable. Export your card before leaving.',true);ready=true;if(!error) status(disc?'Disc verified. Ready to play.':'Choose your verified disc to begin.');updateReady();Module.removeRunDependency('mojo-save-load');});
  }],
  onRuntimeInitialized:()=>{initialized=true;resolveInitialization();},
  ps2CardSaved:()=>syncSaves().then(async()=>{const saved=await mirrorSave();$('game-status').textContent=saved?'Memory card saved to '+linkedSave.handle.name:linkedSave.handle?'Saved in browser · reconnect the save file.':'Memory card saved on this device';}).catch(reportSaveError),
  onHalt:reason=>{errors.push(reason);$('game-status').textContent='Stopped: '+reason;console.warn('Game stopped:',reason);},
  onFrame:()=>{
    const now=performance.now();frameSamples.push(now);if(frameSamples.length>240) frameSamples.shift();
    if(now-lastStat<1000) return;
    const f=Module._ps2web_frames(),span=now-lastStat;
    $('stats').textContent=`${((f-lastFrames)*1000/span).toFixed(1)} guest frames/s · ${(Module.HEAPU8.length/1048576).toFixed(0)} MiB heap · audio ${Module._ps2web_audio_queued_ms().toFixed(0)} ms · VU interpreted ${Module._ps2web_vu_interpreted()} · frame ${f}`;
    lastStat=now;lastFrames=f;
    if(threaded&&lastBuffer!==Module.HEAPU8.buffer) {lastBuffer=Module.HEAPU8.buffer;audioNode?.port.postMessage({buffer:lastBuffer,base:Module._ps2web_audio_ring()});}
  }
};
$('disc').onchange=()=>{const file=$('disc').files[0];if(file) validate(file);};
$('forget').onclick=async()=>{try{await db('delete');status('Cached disc removed. Saves are retained.');}catch(error){status(error.message,true);}};
$('play').onclick=async()=>{
  if(!disc||!ready||running||starting) return;
  starting=true;$('play').disabled=true;
  try {
    if(navigator.locks) {
      const acquired=await new Promise((resolve,reject)=>navigator.locks.request('mojo-save-writer',{ifAvailable:true},lock=>{resolve(!!lock);if(lock) return new Promise(r=>{leaseRelease=r;});}).catch(reject));
      if(!acquired) throw new Error('MOJO is already running in another tab. Close it to protect your save card.');
    }
    // Refresh after taking the writer lease: another tab may have saved since
    // this launcher was opened. Never replace a card containing data.
    await new Promise((resolve,reject)=>Module.FS.syncfs(true,error=>error?reject(error):resolve()));
    await linkedSaveReady;
    const linkedCard=await linkedSave.read();
    if(linkedCard) {Module.FS.writeFile('/memcard/Mcd001.ps2',linkedCard);await syncSaves();}
    await ensureFormattedCard(Module.FS,loadEmptyTemplate,syncSaves);
    if(linkedSave.handle&&linkedSave.granted&&linkedSave.dirty) await mirrorSave();
    Module.localDisc=disc.iso;Module.discSize=disc.iso.size;
    Module.FS.writeFile('/game/core.elf',disc.elf);Module.FS.writeFile('/game/boot.txt','cdrom0:\\SLUS_207.41;1\n');
    Module.ENV.PS2_SCALE=$('render-scale').value;
    Module.ENV.PS2_HUD_UPSCALE=$('upscale-hud').checked&&Number($('render-scale').value)>1?'1':'0';
    activeScale=Number(Module.ENV.PS2_SCALE);activeHud=Module.ENV.PS2_HUD_UPSCALE==='1';
    Module.removeRunDependency('mojo-launch-settings');
    await initialization;
    for(const press of params.getAll('press')) Module.arguments.push('--press',press);
    if(params.has('frames')) Module.arguments.push('--frames',params.get('frames'));
    await startAudio();
    running=true;Module.running=true;startTime=lastStat=performance.now();$('launcher').hidden=true;$('game').hidden=false;resize();$('canvas').focus();
    updateResolutionNote();
    $('open-save').disabled=true;
    $('game-status').textContent=threaded?'Running · WebGPU · EE/VU workers':'Running · WebGPU · single thread';
    const inputLoop=()=>{if(running) {pollInput();requestAnimationFrame(inputLoop);}};requestAnimationFrame(inputLoop);
    Promise.resolve(Module.callMain(Module.arguments)).catch(fatal);
  } catch(error) {leaseRelease?.();fatal(error);}
};
$('pause').onclick=()=>setPaused(!paused).catch(fatal);$('resume').onclick=()=>setPaused(false).catch(fatal);
$('mute').onclick=async()=>{if(!audio) return;if(audio.state==='running') {await audio.suspend();if(threaded) Atomics.store(new Uint32Array(Module.HEAPU8.buffer,Module._ps2web_audio_ring(),4),3,0);$('mute').textContent='Unmute';}else {await audio.resume();$('mute').textContent='Mute';}};
$('fullscreen').onclick=()=>{if(document.fullscreenElement) document.exitFullscreen();else $('stage').requestFullscreen().catch(fatal);};
$('export').onclick=saveAction(exportCard);
$('card').onchange=async()=>{
  const file=$('card').files[0];if(!file) return;
  if(running) {status('Reload the page, then import the card before starting the game.',true);$('game-status').textContent='Reload before importing a save card to protect the active card.';return;}
  if(file.size!==8650752) return fatal('Expected an 8 MiB PS2 memory card with ECC (8,650,752 bytes).');
  Module.FS.writeFile('/memcard/Mcd001.ps2',new Uint8Array(await file.arrayBuffer()));await syncSaves();await mirrorSave();status('Save card imported.');
};
// Save import is also available before boot, where replacement is safe.
const importCard=document.createElement('label');importCard.htmlFor='card';importCard.className='subtle';importCard.textContent='Import save card';$('forget').after(importCard);
addEventListener('resize',resize);document.addEventListener('fullscreenchange',resize);
addEventListener('keydown',event=>{
  if(!running||event.target instanceof HTMLInputElement) return;
  if(event.code==='Escape') {event.preventDefault();setPaused(!paused).catch(fatal);return;}
  if(event.code==='F11') {event.preventDefault();$('fullscreen').click();return;}
  if(event.code in bindings||['KeyI','KeyJ','KeyK','KeyL'].includes(event.code)) {event.preventDefault();if(!paused) keys.add(event.code);}
});
addEventListener('keyup',event=>keys.delete(event.code));
addEventListener('blur',()=>{keys.clear();if(running&&!paused) setPaused(true).catch(fatal);});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&running) {setPaused(true).catch(fatal);syncSaves().catch(()=>{});}});
addEventListener('pagehide',()=>{if(ready) syncSaves().catch(()=>{});});
const problems=[];
if(!isSecureContext) problems.push('Serve over HTTPS or localhost.');
if(!hasJSPI) problems.push('This browser needs WebAssembly JSPI. Use current Chrome/Edge, or a JSPI-enabled browser.');
if(!navigator.gpu) problems.push('WebGPU is unavailable. Update your browser and GPU driver.');
if(threaded&&!crossOriginIsolated) problems.push('The game needs browser isolation for its worker audio. Reload once; if this persists, use a current desktop Chrome or Edge with service workers enabled.');
$('backend').textContent=threaded?'WEBGPU / WORKERS':'WEBGPU / SINGLE THREAD';
if(problems.length) {status(problems.join(' '),true);$('disc').disabled=true;}
else {
  if(buildConfig.localRuntime) {
    const panel=document.createElement('div');panel.className='runtime-setup';
    panel.innerHTML='<span class="step">01 / YOUR PREPARED GAME</span><h2>Prepare once. Play here.</h2><p>Create your private runtime from your own disc using the <a href="prepare.html">local preparation guide</a>. Then import that file below. Your runtime and disc stay on this device.</p><label class="file" for="runtime-file">Choose prepared runtime <span>↗</span></label><input id="runtime-file" type="file" accept=".mojo" hidden><p id="runtime-status" role="status">Checking for your remembered runtime…</p>';
    const setup=document.querySelector('.setup');setup.querySelector('.step').textContent='02 / YOUR DISC';setup.prepend(panel);
    const loadRuntime=async(blob,remember)=>{
      if(engineStarted) throw new Error('Reload before selecting a different runtime.');
      $('runtime-status').textContent='Validating your private runtime…';
      const runtime=await unpackRuntime(blob,threaded);
      if(remember) {try{await runtimeCache('put',blob);}catch{status('Runtime ready; browser storage could not remember it.');}}
      const jsUrl=URL.createObjectURL(runtime.js),wasmUrl=URL.createObjectURL(runtime.wasm);
      Module.wasmBinary=new Uint8Array(await runtime.wasm.arrayBuffer());
      Module.locateFile=path=>path.endsWith('.wasm')?wasmUrl:new URL(path,location.href).href;
      engineStarted=true;$('runtime-file').disabled=true;
      const engine=document.createElement('script');engine.src=jsUrl;engine.onerror=()=>fatal('Your runtime could not start. Prepare a fresh package.');document.body.appendChild(engine);
      $('runtime-status').textContent='Private runtime ready · '+(threaded?'worker build':'single-thread fallback');
    };
    $('runtime-file').onchange=()=>{const file=$('runtime-file').files[0];if(file) loadRuntime(file,true).catch(error=>{$('runtime-status').textContent=error.message;$('runtime-status').classList.add('error');});};
    runtimeCache('get').then(blob=>blob?loadRuntime(blob,false):$('runtime-status').textContent='Choose your locally prepared .mojo file.').catch(error=>{$('runtime-status').textContent=error.message;});
    status('Import your prepared runtime and verified disc to begin.');
  } else {
    const engine=document.createElement('script');engine.src=$('engine').content.querySelector('script').getAttribute('src');engine.onerror=()=>fatal('Runtime download failed. Rebuild and serve the entire output directory.');document.body.appendChild(engine);
  }
  db('get').then(blob=>{if(blob) validate(blob,false);}).catch(()=>status('Disc cache unavailable. Choose your image for this session.'));
}
