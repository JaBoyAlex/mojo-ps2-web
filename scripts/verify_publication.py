"""Fail-closed source and Pages artifact gate. Never scans private game files."""
import argparse
import json
from pathlib import Path
import re
import subprocess
import hashlib
import io
import stat
import zipfile

ROOT=Path(__file__).resolve().parents[1]
PATTERNS=[
    (b'\0asm','compiled Wasm'),
    (bytes([127])+b'ELF'+bytes([1,1,1]),'PS2 executable'),
    (b'PS2 Memory '+b'Card Format','memory-card bytes'),
]
SECRETS=re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|sk-proj-[A-Za-z0-9_-]{30,}')
HOME_PATH=re.compile(rb'[A-Za-z]:[/\\]Users[/\\][^\s\x00"<>]+|/ho' rb'me/[^/\s"\x27\x00<>]+/|/Us' rb'ers/[^/\s"\x27\x00<>]+/')

def inspect(name,data,*,tool=False,third_party=False):
    if len(data)>(26000000 if tool else 500000): raise ValueError('Unexpected large publication file: '+name)
    for marker,description in PATTERNS:
        if tool and description=='compiled Wasm': continue
        if marker in data: raise ValueError(description+' in '+name)
    if SECRETS.search(data) or (not third_party and HOME_PATH.search(data)): raise ValueError('Private content in '+name)

def verify_browser_tools(directory):
    from browser_compiler import FILES,PIN,RPC_FILES
    expected={'runtime/ps2web.js','runtime/ps2web.wasm','tools/eerecomp.mjs','tools/eerecomp.wasm',
              'tools/vurecomp.mjs','tools/vurecomp.wasm','headers.json','manifest.json',
              'compiler/comlink.mjs','compiler/COMLINK-LICENSE.txt',*('compiler/'+name for name in FILES)}
    actual={p.relative_to(directory).as_posix() for p in directory.rglob('*') if p.is_file()}
    if directory.is_symlink() or any(p.is_symlink() for p in directory.rglob('*')): raise ValueError('Linked browser tooling entry')
    if actual!=expected: raise ValueError('Browser tooling differs from exact independent-tool allowlist')
    manifest=json.loads((directory/'manifest.json').read_text())
    from build_web import PIN as ENGINE,SDK_VERSION
    if manifest.get('engine')!=ENGINE or manifest.get('sdk')!=SDK_VERSION or manifest.get('compiler')!=PIN or manifest.get('profile')!={'vuCaptures':6}:
        raise ValueError('Unrecognized generic tool provenance')
    if set(manifest.get('files',{}))!=expected-{'manifest.json'}: raise ValueError('Incomplete browser tool manifest')
    preparer=hashlib.sha256((ROOT/'web/preparation-worker.mjs').read_text(encoding='utf-8').encode()).hexdigest()
    if manifest.get('preparer')!=preparer: raise ValueError('Mismatched browser preparation source')
    code={name:sha for name,sha in manifest['files'].items() if not name.endswith('.txt')}
    version=hashlib.sha256(json.dumps({'files':code,'preparer':preparer},sort_keys=True).encode()).hexdigest()
    if manifest.get('version')!=version: raise ValueError('Invalid browser tool cache version')
    for name in expected:
        path=directory/name
        if path.is_symlink() or not path.is_file(): raise ValueError('Linked browser tool')
        data=path.read_bytes()
        if name!='manifest.json' and hashlib.sha256(data).hexdigest()!=manifest['files'][name]: raise ValueError('Damaged browser tool: '+name)
        if name.startswith('compiler/') and name[9:] in FILES:
            original=data
            if name.endswith('.js'):
                original=data.replace(b'e.status:(s.push(String(e.stack||e)),-42)',b'e.status:-42')
            sha,size=FILES[name[9:]]
            if len(original)!=size or hashlib.sha1(b'blob '+str(size).encode()+b'\0'+original).hexdigest()!=sha: raise ValueError('Unrecognized third-party compiler payload')
        elif name.startswith('compiler/'):
            if hashlib.sha256(data).hexdigest()!=RPC_FILES.get(name[9:]): raise ValueError('Unrecognized RPC helper')
        inspect(name,data,tool=True,third_party=name.startswith('compiler/'))
    host=(directory/'runtime/ps2web.wasm').read_bytes()
    if b'_ZN3gen9unit_' in host or b'gen::unit_' in host: raise ValueError('Translated game code in generic host')
    print('PASS: exact generic tools, pinned compiler payloads and no linked game units')

def verify_preparer(path):
    from build_preparer import SOURCES
    windows=path.name=='prepare-mojo-windows.zip'
    expected={'sources.zip','prepare.sh','README.txt','LICENSE.txt'}|({'Prepare-MOJO.exe'} if windows else {'Prepare-MOJO.sh','bundle-hashes.txt'})
    with zipfile.ZipFile(path) as archive:
        if set(archive.namelist())!=expected or len(archive.namelist())!=len(expected): raise ValueError('Unexpected preparation download entries')
        if sum(e.file_size for e in archive.infolist())>2000000: raise ValueError('Preparation download is unexpectedly large')
        for entry in archive.infolist():
            if stat.S_ISLNK(entry.external_attr>>16): raise ValueError('Linked preparation download entry')
            inspect(entry.filename,archive.read(entry))
        if windows and not archive.read('Prepare-MOJO.exe').startswith(b'MZ'): raise ValueError('Missing Windows helper executable')
        source_data=archive.read('sources.zip')
        with zipfile.ZipFile(io.BytesIO(source_data)) as source:
            allowed=set(SOURCES)|{'source-manifest.json'}
            if set(source.namelist())!=allowed or len(source.namelist())!=len(allowed): raise ValueError('Preparation sources differ from exact allowlist')
            manifest=json.loads(source.read('source-manifest.json'))
            if manifest.get('version')!=1 or set(manifest['files'])!=set(SOURCES): raise ValueError('Invalid preparation source manifest')
            for entry in source.infolist():
                if stat.S_ISLNK(entry.external_attr>>16): raise ValueError('Linked preparation source')
                data=source.read(entry);inspect(entry.filename,data)
                if entry.filename!='source-manifest.json' and hashlib.sha256(data).hexdigest()!=manifest['files'][entry.filename]: raise ValueError('Damaged preparation source')
        if not windows:
            hashes=archive.read('bundle-hashes.txt').decode().splitlines()
            if hashes!=[hashlib.sha256(source_data).hexdigest(),hashlib.sha256(archive.read('prepare.sh')).hexdigest()]: raise ValueError('Damaged Linux preparation bundle')

def verify_site(directory):
    from build_site import PUBLIC_FILES
    from build_preparer import DOWNLOADS
    expected={'index.html','build-config.json','empty-card.json','.nojekyll',*PUBLIC_FILES,*DOWNLOADS}
    actual={p.name for p in directory.iterdir() if p.name!='browser-tools'}
    if actual!=expected: raise ValueError('Pages output differs from exact public allowlist')
    for p in directory.iterdir():
        if p.name=='browser-tools':
            if p.is_symlink() or not p.is_dir(): raise ValueError('Unsafe browser tooling directory')
            verify_browser_tools(p);continue
        if not p.is_file() or p.is_symlink(): raise ValueError('Unsafe Pages entry')
        if p.name in DOWNLOADS: verify_preparer(p)
        else: inspect(p.name,p.read_bytes())
    if json.loads((directory/'build-config.json').read_text())!={'localRuntime':True,'browserPreparation':True}: raise ValueError('Pages must use browser-private game preparation')
    if not (directory/'browser-tools').is_dir(): raise ValueError('Missing generic browser tools')
    print('PASS: Pages contains only independent code/tools, with no game runtime or assets')

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--git',action='store_true');args=parser.parse_args()
    allowed=set(json.loads((ROOT/'publication-files.json').read_text()))
    for name in allowed:
        path=ROOT/name
        if not path.is_file() or path.is_symlink(): raise ValueError('Missing/linked source: '+name)
        inspect(name,path.read_bytes())
    if args.git:
        def git(*args):return subprocess.check_output(['git','-C',str(ROOT),*args])
        for name in git('ls-files').decode().splitlines():
            if name not in allowed: raise ValueError('Unapproved tracked file: '+name)
            inspect(name,git('show',':'+name))
        for commit in git('rev-list','--all').decode().splitlines():
            for row in git('ls-tree','-r',commit).decode().splitlines():
                left,name=row.split('\t',1);mode,kind,oid=left.split()
                if name not in allowed or mode not in ('100644','100755') or kind!='blob': raise ValueError('Unsafe history entry')
                inspect(name,git('cat-file','blob',oid))
    if (ROOT/'dist').is_dir(): verify_site(ROOT/'dist')
    print('PASS: explicit source allowlist and private/proprietary content gate')

if __name__=='__main__':main()
