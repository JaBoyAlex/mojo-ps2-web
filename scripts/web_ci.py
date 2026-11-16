#!/usr/bin/env python3
"""Compile both real browser runtimes using independently authored MIPS only."""
import importlib.util
from pathlib import Path
import struct
import subprocess
import sys
import build_web as build

def main():
    root=build.ROOT
    engine=root/'userdata/ci-engine'
    build.fetch_engine(engine)
    build.apply_patches(engine)
    tools=engine/'build/tools'
    build.run(['cmake','-S',engine,'-B',tools,'-G','Ninja','-DCMAKE_BUILD_TYPE=Release','-DCMAKE_CXX_COMPILER=clang++-19','-DCMAKE_CXX_FLAGS=-stdlib=libc++'])
    build.run(['cmake','--build',tools,'--target','eerecomp','vurecomp','--parallel','4'])
    # A synthetic MIPS branch loop in an ELF. No commercial input is read.
    elf=bytearray(0x110);elf[:16]=bytes([127,69,76,70,1,1,1])+bytes(9)
    struct.pack_into('<HHIIIIIHHHHHH',elf,16,2,8,1,0x100000,52,0,0,52,32,1,0,0,0)
    struct.pack_into('<IIIIIIII',elf,52,1,0x100,0x100000,0x100000,16,16,5,16)
    struct.pack_into('<IIII',elf,0x100,0x1000ffff,0,0,0)
    fixture=engine/'synthetic.elf';fixture.write_bytes(elf)
    generated=engine/'generated/synthetic';generated.mkdir(parents=True,exist_ok=True)
    empty=engine/'synthetic-vu';empty.mkdir(exist_ok=True)
    build.run([tools/'eerecomp',fixture,'--out',generated])
    build.run([tools/'vurecomp',empty,generated])
    for variant in ('threaded','single'):
        out=engine/('build/ci-'+variant)
        build.run(['emcmake','cmake','-S',engine,'-B',out,'-G','Ninja','-DCMAKE_BUILD_TYPE=Release',
          '-DCMAKE_CXX_FLAGS_RELEASE=-O2 -DNDEBUG','-DPS2_GENERATED='+str(generated),
          '-DMOJO_WEB_CMAKE='+str(root/'web/target.cmake'),'-DMOJO_WEB_THREADS='+('ON' if variant=='threaded' else 'OFF')])
        build.run(['cmake','--build',out,'--target','ps2web','--parallel','4'])
        build.run(['node','-e',"const fs=require('fs');if(!WebAssembly.validate(fs.readFileSync(process.argv[1])))process.exit(1);",out/'ps2web.wasm'])
    print('PASS: both browser targets compile and validate with synthetic MIPS; no commercial data used')

if __name__=='__main__':main()
