"""Fetch an exact, pinned, game-independent browser compiler and its RPC helper."""
import hashlib
import io
from pathlib import Path
import tarfile
import urllib.request

PIN='9f45133748f5e7d935f0e6dc43f60a5a34f6ce7a'
FILES={
    'emception.worker.bundle.worker.js':('ab2342445673954174cde435ce24a0ac79695d65',530681),
    'cecdfcda360457a8f204.br':('02ae57ef29cbcc0bbbf0e541b120c6ae92bad3cb',23510428),
    'f0283badd42fe745cbe4.wasm':('8c82dfa7782a4c0724a20c78af09db6a42fbd52d',804447),
    '9d1e542b80004e27297f.wasm':('85c1628b199420e82b08e594b8e255f999c4bc9c',146837),
}
RPC_SHA256='f284ae64b58e3fd543bb32635cdfad7d6244543b2e453661abf711a97f1faa37'
RPC_FILES={'comlink.mjs':'fdb3f83c25419b16f256ad1eceb444ee3dff412e7734e50f0b29e052a31fc568',
           'COMLINK-LICENSE.txt':'bcf29b4fd3ec2cb5f9d40a0866da446f6da62170d2ccedf4aeca9cf9406dd20c'}

def fetch(output,cache):
    output.mkdir(parents=True,exist_ok=True);cache.mkdir(parents=True,exist_ok=True)
    for name,(sha,size) in FILES.items():
        target=cache/name
        if not target.is_file():
            urllib.request.urlretrieve(f'https://raw.githubusercontent.com/jprendes/emception/{PIN}/{name}',target)
        data=target.read_bytes()
        if len(data)!=size or hashlib.sha1(b'blob '+str(size).encode()+b'\0'+data).hexdigest()!=sha:
            raise ValueError('Browser compiler checksum mismatch: '+name)
        if name.endswith('.js'):
            # Preserve worker failures in its result so setup can report and retry.
            old=b'e.status:-42';new=b'e.status:(s.push(String(e.stack||e)),-42)'
            if data.count(old)!=1: raise ValueError('Unexpected compiler error handler')
            data=data.replace(old,new)
        (output/name).write_bytes(data)
    archive=cache/'comlink-4.3.1.tgz'
    if not archive.is_file(): urllib.request.urlretrieve('https://registry.npmjs.org/comlink/-/comlink-4.3.1.tgz',archive)
    data=archive.read_bytes()
    if hashlib.sha256(data).hexdigest()!=RPC_SHA256: raise ValueError('RPC helper checksum mismatch')
    with tarfile.open(fileobj=io.BytesIO(data)) as tar:
        for source,target in [('package/dist/esm/comlink.mjs','comlink.mjs'),('package/LICENSE','COMLINK-LICENSE.txt')]:
            (output/target).write_bytes(tar.extractfile(source).read())
