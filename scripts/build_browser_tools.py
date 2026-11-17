#!/usr/bin/env python3
"""Build only independent host/translators. No disc or translated game input."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import build_web
import browser_compiler

ROOT=Path(__file__).resolve().parents[1]
SDK_PTHREAD_SHA='de9c71c105acf52d2f2f31a9659ae8071454815d47b6110403fb345732eb475a'

def write_manifest(output):
    files={p.relative_to(output).as_posix():hashlib.sha256(p.read_bytes()).hexdigest()
           for p in sorted(output.rglob('*')) if p.is_file() and p.name!='manifest.json'}
    preparer=hashlib.sha256((ROOT/'web/preparation-worker.mjs').read_text(encoding='utf-8').encode()).hexdigest()
    code={name:sha for name,sha in files.items() if not name.endswith('.txt')}
    version=hashlib.sha256(json.dumps({'files':code,'preparer':preparer},sort_keys=True).encode()).hexdigest()
    (output/'manifest.json').write_text(json.dumps({'version':version,'files':files,'preparer':preparer,'engine':build_web.PIN,
         'sdk':build_web.SDK_VERSION,'compiler':browser_compiler.PIN,'profile':{'vuCaptures':6}},indent=2)+'\n')

def patch_sdk(sdk):
    path=sdk/'upstream/emscripten/src/lib/libpthread.js'
    original=path.read_bytes()
    before='    __emscripten_dlsync_self();'
    after='''#if ASYNCIFY == 2
    await WebAssembly.promising(wasmExports['_emscripten_dlsync_self'])();
#else
    __emscripten_dlsync_self();
#endif'''
    text=original.decode()
    if after in text:
        restored=text.replace(after,before).encode()
        if hashlib.sha256(restored).hexdigest()!=SDK_PTHREAD_SHA: raise ValueError('Unrecognized SDK patch')
    else:
        if hashlib.sha256(original).hexdigest()!=SDK_PTHREAD_SHA or text.count(before)!=1:
            raise ValueError('Expected the pinned Emscripten 6.0.11 pthread source')
        path.write_bytes(text.replace(before,after).encode())

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sdk',type=Path,default=Path(os.environ.get('EMSDK',ROOT/'userdata/browser-sdk')))
    parser.add_argument('--engine',type=Path,default=ROOT/'userdata/public-browser-engine')
    parser.add_argument('--output',type=Path,default=ROOT/'userdata/browser-tools-public')
    args=parser.parse_args()
    sdk=args.sdk.resolve();engine=args.engine.resolve();output=args.output.resolve()
    patch_sdk(sdk)
    build_web.fetch_engine(engine);build_web.apply_patches(engine)
    if (engine/'games/mojo/disc.iso').exists() or (engine/'generated/mojo').exists():
        raise ValueError('Public tooling requires a separate engine with no commercial inputs')
    source=engine/'runtime/src/vu_micro.cpp';text=source.read_text()
    text=text.replace('if (!e.function && (!record.empty() || g_options.on_vu_program)) {',
                      'if ((!e.function || g_options.on_vu_program) && (!record.empty() || g_options.on_vu_program)) {')
    if text!=source.read_text(): source.write_text(text)
    # A hidden preparation frame must not depend on requestAnimationFrame.
    source=engine/'host/web.cpp';text=source.read_text()
    text=text.replace('requestAnimationFrame(() => Module.shownChannel.port2.postMessage(0));',
                      '(Module.prepareCapture ? (fn) => setTimeout(fn, 0) : requestAnimationFrame)(() => Module.shownChannel.port2.postMessage(0));')
    if text!=source.read_text(): source.write_text(text)
    registration=ROOT/'userdata/public-browser-registration';registration.mkdir(exist_ok=True)
    if any(p.name!='registration.cpp' for p in registration.iterdir()): raise ValueError('Unexpected registration input')
    shutil.copyfile(ROOT/'web/generic-host.cpp',registration/'registration.cpp')
    env={**os.environ,'EMCC_CORES':'2'}
    out=engine/'build/generic-browser'
    def run(command):subprocess.run([str(x) for x in command],check=True,env=env)
    run(['emcmake','cmake','-S',engine,'-B',out,'-G','Ninja','-DCMAKE_BUILD_TYPE=Release',
         '-DCMAKE_CXX_FLAGS_RELEASE=-O2 -DNDEBUG','-DPS2_GENERATED='+str(registration),
         '-DMOJO_WEB_CMAKE='+str(ROOT/'web/generic-target.cmake'),'-DMOJO_WEB_THREADS=ON'])
    run(['cmake','--build',out,'--target','ps2web','--parallel','2'])
    output.mkdir(parents=True,exist_ok=True)
    runtime=output/'runtime';runtime.mkdir(exist_ok=True)
    shutil.copyfile(out/'ps2web.js',runtime/'ps2web.js');shutil.copyfile(out/'ps2web.wasm',runtime/'ps2web.wasm')
    tools=output/'tools';tools.mkdir(exist_ok=True)
    common=['em++','-O2','-std=c++20','-fwasm-exceptions','-sWASM_LEGACY_EXCEPTIONS=0',
            '-sMODULARIZE','-sEXPORT_ES6','-sALLOW_MEMORY_GROWTH=1','-sFORCE_FILESYSTEM=1',
            '-sEXPORTED_RUNTIME_METHODS=FS,callMain','-sENVIRONMENT=web,worker','-I'+str(engine/'runtime/include')]
    sources=['main.cpp','r5900.cpp','elf.cpp','analysis.cpp','codegen.cpp','eerecomp_gen.cpp','snr2.cpp']
    run([*common,*[engine/'recomp'/name for name in sources],'-o',tools/'eerecomp.mjs'])
    run([*common,engine/'recomp/vurecomp.cpp',engine/'recomp/vurecomp_gen.cpp','-o',tools/'vurecomp.mjs'])
    headers={p.relative_to(engine/'runtime/include').as_posix():p.read_text() for p in sorted((engine/'runtime/include').rglob('*.hpp'))}
    (output/'headers.json').write_text(json.dumps(headers,separators=(',',':')))
    browser_compiler.fetch(output/'compiler',ROOT/'userdata/browser-compiler-cache')
    # Version every private cache against the actual public tools and ABI source.
    write_manifest(output)
    print('Built public generic tools without a disc, game executable or translated game source.',flush=True)

if __name__=='__main__':main()
