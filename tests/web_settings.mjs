import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import vm from 'node:vm';
import {cameraAxis} from '../web/input.mjs';
import {CARD_BYTES,needsFormatting,decodeCardTemplate,ensureFormattedCard} from '../web/save-card.mjs';
for(let i=0;i<256;i++) {assert.equal(cameraAxis(i,false),i);assert.equal(cameraAxis(i,true),i===128?128:255-i);}
assert.equal(cameraAxis(128,true),128);assert.equal(cameraAxis(0,true),255);assert.equal(cameraAxis(255,true),0);
assert.equal(needsFormatting(null),true);
const erased=new Uint8Array(CARD_BYTES);erased.fill(255);assert.equal(needsFormatting(erased),true);
erased[530]=1;assert.equal(needsFormatting(erased),false);
assert.equal(needsFormatting(new Uint8Array(32)),false);
assert.throws(()=>decodeCardTemplate({size:1,pages:[]}),/Invalid/);
if(process.env.MOJO_CARD_TEMPLATE) {
  const template=JSON.parse(readFileSync(process.env.MOJO_CARD_TEMPLATE)),expected=decodeCardTemplate(template);
  const expectedPath=process.env.MOJO_CARD_REFERENCE;
  if(expectedPath) assert.deepEqual(expected,new Uint8Array(readFileSync(expectedPath)));
  let card=null,writes=0,flushes=0;
  const FS={readFile(){if(!card) throw new Error('ENOENT');return card;},analyzePath(){return {exists:!!card};},writeFile(_,bytes){card=bytes;writes++;}};
  const load=async()=>template,persist=async()=>{flushes++;};
  assert.equal(await ensureFormattedCard(FS,load,persist),true);assert.equal(writes,1);assert.equal(flushes,1);
  assert.equal(await ensureFormattedCard(FS,load,persist),false);assert.equal(writes,1);
  const saved=new Uint8Array(expected);saved[9000]=83;card=saved;
  assert.equal(await ensureFormattedCard(FS,load,persist),false);assert.equal(card,saved);
  card=new Uint8Array(CARD_BYTES);card.fill(255);
  assert.equal(await ensureFormattedCard(FS,load,persist),true);assert.equal(writes,2);
  assert.equal(needsFormatting(card),false);
  console.log('PASS: browser card is byte-identical to native formatting; missing/erased card initialized, existing saves preserved, initialization persisted');
}
console.log('PASS: both camera axes match native mapping for every input; neutral and existing card data preserved');

// Exercise the actual launcher callbacks against Emscripten's ordering: preRun,
// dependencies, C++ constructors (which cache ENV), onRuntimeInitialized, main.
const launcher=readFileSync(new URL('../web/launcher.mjs',import.meta.url),'utf8');
for(const browserPrepared of [false,true]) for(const scale of ['1','2','3','4']) {
  const elements=new Map(),element=id=>{if(!elements.has(id)) elements.set(id,{value:scale,checked:true,focus(){}});return elements.get(id);};
  let cachedEnv=null,mainCalled=false,audioStarted=false;
  const dependencies=new Set(),events=[];
  const context=vm.createContext({
    $:element,console,threaded:true,disc:{iso:{size:1},elf:new Uint8Array()},ready:false,running:false,starting:false,initialized:false,
    activeScale:null,activeHud:false,leaseRelease:null,startTime:0,lastStat:0,params:new URLSearchParams(),navigator:{},browserModules:browserPrepared?{ee:new Uint8Array(),vu:new Uint8Array()}:null,
    linkedSaveReady:Promise.resolve(),linkedSave:{read:async()=>null},
    ensureFormattedCard:async()=>{},loadEmptyTemplate(){},syncSaves(){},mirrorSave(){},
    status(){},updateReady(){},resize(){assert.equal(audioStarted,true);},updateResolutionNote(){},pollInput(){},requestAnimationFrame(){},
    fatal:error=>{throw error;},performance:{now:()=>1},
    startAudio:async()=>{assert.ok(cachedEnv);audioStarted=true;events.push('audio');},
  });
  vm.runInContext('const initialization=new Promise(resolve=>{globalThis.resolveInitialization=resolve;});',context);
  const moduleBlock=launcher.slice(launcher.indexOf('globalThis.Module={'),launcher.indexOf("$('disc').onchange"));
  vm.runInContext(moduleBlock,context);
  const module=context.Module;
  module.ENV={};module.FS={mkdir(){},mount(){},writeFile(){},syncfs(_,callback){queueMicrotask(()=>callback(null));}};
  module.addRunDependency=name=>dependencies.add(name);
  module.removeRunDependency=name=>{
    assert.equal(dependencies.delete(name),true);
    if(!dependencies.size) {cachedEnv={...module.ENV};events.push('constructors');module.onRuntimeInitialized();}
  };
  module.callMain=()=>{assert.equal(audioStarted,true);mainCalled=true;events.push('main');};
  module._mojo_load_game=async kind=>{assert.ok(cachedEnv);assert.equal(audioStarted,false);events.push(kind?'vu':'ee');return 1;};
  module.preRun[0]();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(context.ready,true);assert.equal(cachedEnv,null);assert.deepEqual([...dependencies],['mojo-launch-settings']);
  // Change the choice after runtime loading. It must still reach native getenv.
  element('render-scale').value=scale;
  const playBlock=launcher.slice(launcher.indexOf("$('play').onclick="),launcher.indexOf("$('pause').onclick="));
  vm.runInContext(playBlock,context);await element('play').onclick();
  assert.equal(cachedEnv.PS2_SCALE,scale);assert.equal(cachedEnv.PS2_HUD_UPSCALE,scale==='1'?'0':'1');
  assert.equal(mainCalled,true);assert.deepEqual(events,browserPrepared?['constructors','ee','vu','audio','main']:['constructors','audio','main']);
  assert.equal(context.activeScale,Number(scale));
}
console.log('PASS: every resolution reaches the native environment before constructors, audio and game start; HUD requires scaling');
