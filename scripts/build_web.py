#!/usr/bin/env python3
"""Compile a private browser port from the owner's verified disc. No uploads."""
import argparse
import base64
import gzip
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time
import urllib.request
import zipfile
from native_source import get_native_source

ROOT = Path(__file__).resolve().parents[1]
PIN = '57ef1197c0b818b9a4e1dbb98b1588da38586ffb'
ARCHIVE_SHA = '12a78a14e2879c586e60239442ed5ef1b8a4d341ec0483bc2014f6988bb16930'
SDK_VERSION = '6.0.11'

def module(name):
    base=ROOT if name=='web_support' else get_native_source()
    spec = importlib.util.spec_from_file_location(name, base/'builder'/(name+'.py'))
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result

def run(command, cwd=None):
    print('Running '+str(command[0]), flush=True)
    subprocess.run([str(x) for x in command], cwd=cwd or ROOT, check=True)

def fetch_engine(engine):
    if (engine/'CMakeLists.txt').exists():
        if not (engine/'.mojo-pin').is_file() or (engine/'.mojo-pin').read_text().strip()!=PIN:
            raise ValueError('Use a fresh engine directory. Its verified source pin is missing.')
        return
    archive = ROOT/'userdata/engine.zip'
    archive.parent.mkdir(parents=True, exist_ok=True)
    if not archive.exists() or hashlib.file_digest(archive.open('rb'),'sha256').hexdigest()!=ARCHIVE_SHA:
        urllib.request.urlretrieve(f'https://codeload.github.com/exoteric33/ps2-native-recomp/zip/{PIN}', archive)
    with archive.open('rb') as stream:
        if hashlib.file_digest(stream,'sha256').hexdigest()!=ARCHIVE_SHA: raise ValueError('Engine archive checksum mismatch')
    with zipfile.ZipFile(archive) as z:
        # Only the pinned, hash-verified archive is extracted.
        z.extractall(engine.parent)
    (engine.parent/('ps2-native-recomp-'+PIN)).rename(engine)
    (engine/'.mojo-pin').write_text(PIN+'\n')

def prepare(args):
    native = module('build')
    engine=args.engine
    game=engine/'games/mojo'
    game.mkdir(parents=True, exist_ok=True)
    iso=game/'disc.iso'
    if not iso.is_file() or native.digest(iso)!=native.ISO_SHA256:
        if not args.game: raise ValueError('Pass --game with your legally obtained ISO, BIN or CUE.')
        if args.game.suffix.lower()=='.iso': shutil.copyfile(args.game,iso)
        elif args.game.suffix.lower() in ('.cue','.bin','.img'):
            run([sys.executable,'-I',engine/'scripts/disc.py','iso',args.game,iso])
        else: raise ValueError('Use ISO or BIN/CUE. Prepare CHD through the existing native importer first.')
    native.validate(iso,engine,game)
    if not (game/'disc/SYSTEM.CNF').is_file() or not (game/'disc'/native.SERIAL).is_file():
        run([sys.executable,'-I',engine/'scripts/disc.py','extract',iso,game/'disc','SYSTEM.CNF',native.SERIAL])
    if args.seed_engine:
        seed=args.seed_engine
        if native.digest(seed/'games/mojo/disc.iso')!=native.ISO_SHA256: raise ValueError('Exploration seed is from a different disc')
        for folder in ('vu0','vu1'):
            source=seed/'games/mojo'/folder
            if source.exists(): shutil.copytree(source,game/folder,dirs_exist_ok=True)
        source=seed/'games/mojo/entries.txt'
        if source.exists(): shutil.copyfile(source,game/'entries.txt')
    apply_patches(engine)
    return iso

def apply_patches(engine):
    # Older shared patchers write identical bytes on each application. Preserve
    # timestamps of unchanged sources so Ninja retains all compiled objects.
    sources=[engine/'CMakeLists.txt']
    for folder in ('host','runtime','scripts'):
        sources.extend(p for p in (engine/folder).rglob('*') if p.is_file())
    original={p:(p.read_bytes(),p.stat().st_atime_ns,p.stat().st_mtime_ns) for p in sources}
    for name in ('display_labels','camera_controls','hud_upscale','queue_offsets','fast_clear','platform_support','web_support'):
        module(name).apply(engine)
    for path,(contents,access,modified) in original.items():
        if path.read_bytes()==contents: os.utime(path,ns=(access,modified))

def translate_only(engine):
    game=engine/'games/mojo'
    inputs=[game/'disc/SLUS_207.41',game/'entries.txt']
    for folder in ('vu0','vu1'): inputs.extend(sorted((game/folder).glob('*.bin')))
    fingerprint=hashlib.sha256(PIN.encode())
    for path in inputs:
        if path.is_file(): fingerprint.update(path.name.encode());fingerprint.update(path.read_bytes())
    stamp=engine/'generated/mojo/.translation-inputs'
    expected=fingerprint.hexdigest()
    if stamp.is_file() and stamp.read_text()==expected:
        print('Reusing unchanged local EE/VU translation',flush=True)
        return
    tools=engine/'build/web-tools'
    run(['cmake','-S',engine,'-B',tools,'-G','Ninja','-DCMAKE_BUILD_TYPE=Release','-DCMAKE_CXX_COMPILER=clang++-19','-DCMAKE_CXX_FLAGS=-stdlib=libc++ -ffp-contract=off'])
    run(['cmake','--build',tools,'--target','eerecomp','vurecomp','--parallel','4'])
    entries=game/'entries.txt'
    if not entries.exists(): entries.touch()
    generated=engine/'generated/mojo'
    generated.mkdir(parents=True,exist_ok=True)
    run([tools/'eerecomp',game/'disc/SLUS_207.41','--entries',entries,'--out',generated])
    for folder in ('vu0','vu1'): (game/folder).mkdir(exist_ok=True)
    run([tools/'vurecomp',game/'vu1',generated,'--vu0-dir',game/'vu0'])
    stamp.write_text(expected)

def make_empty_card(engine):
    spec=importlib.util.spec_from_file_location('mojo_mcformat',engine/'scripts/mcformat.py')
    formatter=importlib.util.module_from_spec(spec);spec.loader.exec_module(formatter)
    card=formatter.make_card(time.strptime('2026-01-01 00:00:00','%Y-%m-%d %H:%M:%S'))
    # Preserve the exact native formatter output, storing only non-erased pages.
    return {'size':len(card),'pages':[[at//528,base64.b64encode(card[at:at+528]).decode('ascii')]
        for at in range(0,len(card),528) if card[at:at+528]!=b'\xff'*528]}

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--game',type=Path)
    parser.add_argument('--engine',type=Path,default=ROOT/'userdata/engine')
    parser.add_argument('--seed-engine',type=Path,help='Reuse only recorded entries/VU programs from an exact-disc native build')
    parser.add_argument('--skip-explore',action='store_true',help='Use existing exploration records; does not establish complete coverage')
    parser.add_argument('--variant',choices=('threaded','single','both'),default='both')
    parser.add_argument('--lto',action='store_true')
    parser.add_argument('--logo',type=Path,help='Optional owner-provided PNG stored only in the private runtime package')
    parser.add_argument('--jobs',type=int,default=min(6,os.cpu_count() or 2))
    args=parser.parse_args()
    if args.jobs<1: parser.error('--jobs must be positive')
    args.engine=args.engine.resolve()
    if args.seed_engine: args.seed_engine=args.seed_engine.resolve()
    if args.game: args.game=args.game.resolve()
    if not shutil.which('emcmake'): parser.error('Activate Emscripten 6.0.11 first (source /path/to/emsdk/emsdk_env.sh). Windows: run through WSL2.')
    version=subprocess.check_output(['emcc','--version'],text=True).splitlines()[0]
    if SDK_VERSION not in version: parser.error('Use the pinned Emscripten '+SDK_VERSION)
    fetch_engine(args.engine)
    iso=prepare(args)
    if args.skip_explore: translate_only(args.engine)
    else: run(['bash',args.engine/'scripts/port.sh','mojo',iso,'--native-only'],args.engine)
    distribution=ROOT/'userdata/web-dist'
    distribution.mkdir(parents=True,exist_ok=True)
    results=[]
    empty_card=make_empty_card(args.engine)
    variants=('threaded','single') if args.variant=='both' else (args.variant,)
    for variant in variants:
        started=time.monotonic()
        build=args.engine/('build/mojo-web-'+variant+('-lto' if args.lto else ''))
        run(['emcmake','cmake','-S',args.engine,'-B',build,'-G','Ninja','-DCMAKE_BUILD_TYPE=Release',
             '-DCMAKE_CXX_FLAGS_RELEASE=-O2 -DNDEBUG','-DCMAKE_CXX_FLAGS=-ffp-contract=off',
             '-DPS2_GENERATED='+str(args.engine/'generated/mojo'),'-DMOJO_WEB_CMAKE='+str(ROOT/'web/target.cmake'),
             '-DMOJO_WEB_THREADS='+('ON' if variant=='threaded' else 'OFF'),'-DMOJO_WEB_LTO='+('ON' if args.lto else 'OFF')])
        run(['cmake','--build',build,'--target','ps2web','--parallel',str(args.jobs)])
        out=distribution/variant
        out.mkdir(exist_ok=True)
        for path in build.glob('ps2web.*'):
            if path.suffix in ('.html','.js','.wasm'): shutil.copyfile(path,out/('index.html' if path.suffix=='.html' else path.name))
        for name in ('launcher.css','launcher.mjs','disc.mjs','disc-worker.mjs','audio-worklet.js','input.mjs','save-card.mjs','linked-save.mjs','mojo-logo.png','backdrop.svg'):
            shutil.copyfile(ROOT/'web'/name,out/name)
        (out/'build-config.json').write_text(json.dumps({'threaded':variant=='threaded'})+'\n')
        (out/'empty-card.json').write_text(json.dumps(empty_card,separators=(',',':'))+'\n')
        for path in out.iterdir():
            if path.suffix in ('.js','.mjs','.wasm','.html','.css','.json'):
                with path.open('rb') as source,(out/(path.name+'.gz')).open('wb') as raw:
                    with gzip.GzipFile(filename='',mode='wb',fileobj=raw,mtime=0,compresslevel=9) as dest: shutil.copyfileobj(source,dest)
        results.append({'variant':variant,'buildSeconds':time.monotonic()-started,'wasmBytes':(out/'ps2web.wasm').stat().st_size,'gzipBytes':(out/'ps2web.wasm.gz').stat().st_size,'lto':args.lto})
    # Only locally generated artifacts are in this ignored directory.
    (distribution/'index.html').write_text('''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>MOJO! Web</title><body style="background:#141b20;color:#d4ef63;font:24px system-ui;padding:10vw"><h1>MOJO!</h1><p>Select the browser build.</p><a style="color:inherit" href="threaded/">Worker build</a> · <a style="color:inherit" href="single/">Single-thread fallback</a><script>if(typeof WebAssembly.Suspending==='function') location.replace((crossOriginIsolated?'threaded/':'single/')+location.search);</script></body></html>''',encoding='utf-8')
    (distribution/'build-metrics.json').write_text(json.dumps({'engine':PIN,'sdk':SDK_VERSION,'results':results},indent=2)+'\n')
    from package_runtime import package_runtime
    if all((distribution/v/'ps2web.wasm').is_file() for v in ('threaded','single')):
        package_runtime(distribution,ROOT/'userdata/MOJO-runtime.mojo',args.logo)
    print('Private build ready in userdata/web-dist. Serve with: python scripts/serve_web.py')
    return 0

if __name__=='__main__':
    try: sys.exit(main())
    except (OSError,ValueError,subprocess.CalledProcessError) as error:
        print('Browser build failed: '+str(error),file=sys.stderr)
        sys.exit(1)
