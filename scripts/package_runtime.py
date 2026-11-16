"""Create an owner-only runtime import package. Never publish this output."""
import hashlib
import json
from pathlib import Path
import struct
import os
import shutil
import tempfile

MAGIC=b'MOJOWEB1\n'
ISO='bcfba449a662cc898868317c4bc415e9a2084a53ae8b92b7a4a19efbaa54f3c5'

def package_with_disc(runtime,disc,output):
    """Add an owner-verified disc, without changing any JS/Wasm component bytes."""
    runtime,disc,output=Path(runtime),Path(disc),Path(output)
    with disc.open('rb') as stream:
        if hashlib.file_digest(stream,'sha256').hexdigest()!=ISO: raise ValueError('The included disc must match the supported image.')
    with runtime.open('rb') as source:
        header=source.read(13)
        if header[:9]!=MAGIC: raise ValueError('Invalid private runtime')
        old_size=struct.unpack('<I',header[9:])[0]
        meta=json.loads(source.read(old_size))
        payload_size=meta.get('discImage',{}).get('offset',runtime.stat().st_size-13-old_size)
        if not isinstance(payload_size,int) or payload_size<1: raise ValueError('Invalid private runtime payload')
        meta['discImage']={'offset':payload_size,'size':disc.stat().st_size,'sha256':ISO}
        encoded=json.dumps(meta,separators=(',',':')).encode()
        output.parent.mkdir(parents=True,exist_ok=True)
        fd,temp=tempfile.mkstemp(prefix='.mojo-preparing-',dir=output.parent)
        try:
            with os.fdopen(fd,'wb') as dest:
                dest.write(MAGIC);dest.write(struct.pack('<I',len(encoded)));dest.write(encoded)
                remaining=payload_size
                while remaining:
                    data=source.read(min(1024*1024,remaining))
                    if not data: raise ValueError('Truncated private runtime payload')
                    dest.write(data);remaining-=len(data)
                with disc.open('rb') as image: shutil.copyfileobj(image,dest)
            source.close()
            os.replace(temp,output)
        finally:
            if os.path.exists(temp): os.unlink(temp)
def package_runtime(distribution,output,logo=None):
    parts=[];variants=[];offset=0
    for variant in ('threaded','single'):
        item={'name':variant}
        for kind in ('js','wasm'):
            data=(Path(distribution)/variant/('ps2web.'+kind)).read_bytes()
            item[kind]={'offset':offset,'size':len(data),'sha256':hashlib.sha256(data).hexdigest()}
            parts.append(data);offset+=len(data)
        variants.append(item)
    metadata={'version':1,'engine':'57ef1197c0b818b9a4e1dbb98b1588da38586ffb','disc':ISO,'variants':variants}
    if logo:
        data=Path(logo).read_bytes()
        if len(data)>2*1024*1024 or not data.startswith(bytes([137,80,78,71,13,10,26,10])): raise ValueError('Choose a PNG logo smaller than 2 MiB')
        metadata['logo']={'offset':offset,'size':len(data),'sha256':hashlib.sha256(data).hexdigest()};parts.append(data)
    meta=json.dumps(metadata,separators=(',',':')).encode()
    output=Path(output);output.parent.mkdir(parents=True,exist_ok=True)
    temp=output.with_suffix('.tmp')
    with temp.open('wb') as stream:
        stream.write(MAGIC);stream.write(struct.pack('<I',len(meta)));stream.write(meta)
        for part in parts: stream.write(part)
    temp.replace(output)
    print('Owner-only runtime package ready. Import it locally; never upload it.',flush=True)

if __name__=='__main__':
    import argparse
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('distribution',type=Path);p.add_argument('output',type=Path);p.add_argument('--logo',type=Path)
    args=p.parse_args();package_runtime(args.distribution,args.output,args.logo)
