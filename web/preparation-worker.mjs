import {preparationCache,digest} from './preparation-cache.mjs';
let compiler,compilerWorker,compilerPin;
const compileFlags=['-O2','-ffp-contract=off','-std=c++20','-pthread','-msimd128','-mtail-call','-fwasm-exceptions','-fPIC','-I/working/include','-I/working/generated'];
const report=(value,message)=>postMessage({type:'progress',value,message});
const decode=bytes=>new TextDecoder().decode(bytes);
async function translator(kind,input) {
  const {default:create}=await import(new URL(`browser-tools/tools/${kind==='ee'?'eerecomp':'vurecomp'}.mjs`,import.meta.url));
  const tool=await create({noInitialRun:true,print:()=>{},printErr:()=>{}});
  tool.FS.mkdir('/input');tool.FS.mkdir('/output');
  if(kind==='ee') {
    tool.FS.writeFile('/input/game.elf',input);tool.FS.writeFile('/input/entries.txt','');
    await tool.callMain(['/input/game.elf','--entries','/input/entries.txt','--out','/output']);
  } else {
    for(const [name,bytes] of Object.entries(input)) {
      if(!/^[0-9A-F]{16}_[0-9A-F]{4}\.bin$/.test(name)||bytes.byteLength!==16384)throw new Error('Invalid local vector capture');
      tool.FS.writeFile('/input/'+name,bytes);
    }
    await tool.callMain(['/input','/output']);
  }
  const files={};
  for(const name of tool.FS.readdir('/output'))if(/^[A-Za-z0-9_]+\.(cpp|hpp)$/.test(name))files[name]=tool.FS.readFile('/output/'+name);
  if(!Object.keys(files).length)throw new Error('Your game could not be translated');
  return files;
}
async function initializeCompiler() {
  if(compiler)return;
  const Comlink=await import('./browser-tools/compiler/comlink.mjs');
  compilerWorker=new Worker(new URL('browser-tools/compiler/emception.worker.bundle.worker.js',import.meta.url));
  compiler=Comlink.wrap(compilerWorker);await compiler.init();
}
function bridge(kind) {
  return `#include "ps2/generated.hpp"
#include <cstddef>
#include <initializer_list>
extern void mojo_register_prepared_${kind}();
extern "C" void mojo_install_${kind}(){mojo_register_prepared_${kind}();}
extern "C" unsigned mojo_prepared_layout(){
 unsigned value=2166136261u;
 for(unsigned part:{sizeof(ps2::Cpu),alignof(ps2::Cpu),sizeof(ps2::Reg128),sizeof(ps2::Vu0Regs),sizeof(ps2::UnitInfo),offsetof(ps2::Cpu,pc),offsetof(ps2::Cpu,f),offsetof(ps2::Cpu,vu0),offsetof(ps2::Cpu,cop0)})value=(value^part)*16777619u;
 return value;
}
// Generated processor code has no thread-local objects. The newer host expects
// a TLS initializer; zero explicitly declares that this module owns no TLS.
extern "C" unsigned _emscripten_tls_init(){return 0;}
`;
}
async function compile(files,kind,headers) {
  await initializeCompiler();
  const objectVersion=await digest(new TextEncoder().encode(JSON.stringify({compiler:compilerPin,headers,flags:compileFlags})));
  for(const [name,text] of Object.entries(headers)) {
    await compiler.fileSystem.mkdirTree('/working/include/'+name.slice(0,name.lastIndexOf('/')));
    await compiler.fileSystem.writeFile('/working/include/'+name,text);
  }
  await compiler.fileSystem.mkdirTree('/working/generated');
  for(const [name,bytes] of Object.entries(files)) {
    const text=decode(bytes).replace(/\bregister_generated_code\b/g,'mojo_register_prepared_ee').replace(/\bregister_generated_vu\b/g,'mojo_register_prepared_vu');
    if(/\bthread_local\b|__thread\b/.test(text))throw new Error('Unsupported thread-local game module');
    await compiler.fileSystem.writeFile('/working/generated/'+name,text);
  }
  await compiler.fileSystem.writeFile('/working/generated/bridge.cpp',bridge(kind));
  const names=[...Object.keys(files).filter(n=>n.endsWith('.cpp')),'bridge.cpp'],objects=[];
  for(let index=0;index<names.length;index++) {
    const name=names[index],path='/working/generated/'+name,output=path+'.o';
    const key=objectVersion+'/'+kind+'/'+name+'/'+await digest(new TextEncoder().encode(await compiler.fileSystem.readFile(path,{encoding:'utf8'})));
    let object;
    try{object=await preparationCache('get',key,undefined,'parts');}catch{}
    if(object)await compiler.fileSystem.writeFile(output,object);
    else {
      const result=await compiler.run('em++',path,...compileFlags,'-c','-o',output);
      if(result.returncode!==0)throw new Error('The local compiler could not prepare this game. '+String(result.stderr||'').slice(-700));
      try{await preparationCache('put',key,await compiler.fileSystem.readFile(output),'parts');}catch{}
    }
    objects.push(output);report((index+1)/(names.length+1),'Preparing your game…');
  }
  const output='/working/'+kind+'.wasm';
  // Direct linking needs no CRT or packaged system libraries. This also avoids
  // an upstream Python subprocess bug in this pinned browser toolchain.
  const result=await compiler._run_process_impl(['/usr/bin/wasm-ld','--shared','--import-memory','--shared-memory','--allow-undefined',
    '--export=mojo_install_'+kind,'--export=mojo_prepared_layout','--export=_emscripten_tls_init','-o',output,...objects]);
  if(result.returncode!==0)throw new Error('Your game could not be linked locally');
  const bytes=await compiler.fileSystem.readFile(output),module=await WebAssembly.compile(bytes);
  if(WebAssembly.Module.imports(module).some(entry=>entry.name.includes('mojo_register_prepared')))throw new Error('Incomplete local game registration');
  if(WebAssembly.Module.exports(module).some(entry=>entry.name==='__tls_size'||entry.name==='__tls_align'))throw new Error('Unexpected thread-local game module');
  return bytes;
}
self.onmessage=async({data})=>{
  try {
    compilerPin=data.compiler;
    const headers=await(await fetch(new URL('browser-tools/headers.json',import.meta.url))).json();
    report(0,'Preparing your game…');
    const files=await translator(data.kind,data.input),bytes=await compile(files,data.kind,headers);
    compilerWorker?.terminate();compilerWorker=null;compiler=null;
    postMessage({type:'result',bytes},[bytes.buffer]);
  }catch(error){compilerWorker?.terminate();postMessage({type:'error',message:error.message});}
};
