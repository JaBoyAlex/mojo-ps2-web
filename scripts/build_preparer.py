"""Package only independent source/tools. Never reads a game or private runtime."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]
DOWNLOADS = ('prepare-mojo-windows.zip', 'prepare-mojo-linux.zip')
SOURCES = (
    'LICENSE', 'AGENTS.md', 'builder/web_support.py',
    'scripts/build_web.py', 'scripts/native_source.py', 'scripts/package_runtime.py', 'scripts/prepare_local.py',
    'web/target.cmake', 'web/single.cpp', 'web/shell.html', 'web/launcher.css', 'web/launcher.mjs',
    'web/disc.mjs', 'web/disc-worker.mjs', 'web/audio-worklet.js', 'web/input.mjs',
    'web/save-card.mjs', 'web/linked-save.mjs', 'web/runtime-package.mjs',
    'web/isolation.mjs', 'web/isolation-worker.js', 'web/backdrop.svg',
)
INSTRUCTIONS = '''PREPARE MOJO!

This helper contains independently authored preparation tools, not the game.
Use your own MOJO! USA PS2 image: SLUS_207.41, SYSTEM.CNF VER 1.02.

Windows 10/11 x64: extract this entire ZIP and open Prepare-MOJO.exe.
Choose your disc, choose where to save, then select Prepare my game.
Ubuntu 24.04 on WSL2 is required once. If it is missing, the helper offers the
official Windows installer. Finish Ubuntu's prompts and restart if Windows asks.
Then reopen the helper. Build tools are downloaded inside Ubuntu automatically.

Ubuntu 24.04 Linux: extract the Linux ZIP and run bash Prepare-MOJO.sh.
Enter your disc path and destination. sudo installs the required build tools.
Other preparation operating systems are not currently supported by this helper.

First-time downloads and compilation can take a while and need several GB of
free disk space. Preparation may perform the existing builder's automatic
headless code-discovery runs. Keep the helper open until it reports Ready.
The build cache remains on this computer so retries can reuse completed work.

Return to https://jaboyalex.github.io/mojo-ps2-web/ and import MOJO-runtime.mojo.
It includes the verified disc, so only this one import is needed. The browser
can remember the runtime and disc separately for later visits.
No disc, translated code, private runtime, save or private log is uploaded.
Keep the resulting .mojo file private. Existing gameplay/runtime code is used
without a new execution backend. This is not browser-only compilation.

The helper is unsigned. It does not turn off Windows security settings.
Source: https://github.com/JaBoyAlex/mojo-ps2-web/tree/main/preparer
Independent project code uses the included MIT license. Game rights are not granted.
'''


def write_zip(path, files):
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, data in sorted(files.items()):
            item = zipfile.ZipInfo(name, (2026, 1, 1, 0, 0, 0))
            item.compress_type = zipfile.ZIP_DEFLATED
            item.external_attr = 0o100644 << 16
            archive.writestr(item, data)


def prepare_sources(output):
    from verify_publication import inspect
    files = {}
    for name in SOURCES:
        path = ROOT/name
        if path.is_symlink() or not path.is_file(): raise ValueError('Missing/linked preparation source: ' + name)
        data = path.read_bytes().replace(b'\r\n', b'\n')
        inspect(name, data)
        files[name] = data
    manifest = {'version': 1, 'files': {name: hashlib.sha256(data).hexdigest() for name, data in files.items()}}
    files['source-manifest.json'] = json.dumps(manifest, sort_keys=True, separators=(',', ':')).encode()
    target = output/'sources.zip'
    write_zip(target, files)
    return target


def build(output, windows=False):
    output = Path(output); output.mkdir(parents=True, exist_ok=True)
    source = prepare_sources(output)
    script = (ROOT/'preparer/prepare.sh').read_bytes().replace(b'\r\n', b'\n')
    hashes = (hashlib.sha256(source.read_bytes()).hexdigest() + '\n' + hashlib.sha256(script).hexdigest() + '\n').encode()
    hashfile = output/'bundle-hashes.txt'; hashfile.write_bytes(hashes)
    common = {'sources.zip': source.read_bytes(), 'prepare.sh': script, 'README.txt': INSTRUCTIONS.encode(), 'LICENSE.txt': (ROOT/'LICENSE').read_bytes()}
    linux = {**common, 'Prepare-MOJO.sh': (ROOT/'preparer/launch-linux.sh').read_bytes().replace(b'\r\n', b'\n'), 'bundle-hashes.txt': hashes}
    write_zip(output/DOWNLOADS[1], linux)
    if windows:
        csc = Path(os.environ.get('WINDIR', 'C:/Windows'))/'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
        exe = output/'Prepare-MOJO.exe'
        subprocess.run([str(csc), '/nologo', '/target:winexe', '/optimize+', '/debug-', '/platform:x64',
                        '/reference:System.Windows.Forms.dll', '/reference:System.Drawing.dll',
                        '/resource:' + str(hashfile) + ',mojo.bundle-hashes', '/out:' + str(exe),
                        str(ROOT/'preparer/PrepareMojo.cs')], check=True)
        (output/'prepare.sh').write_bytes(script)
        subprocess.run([str(exe), '--self-test'], check=True)
        write_zip(output/DOWNLOADS[0], {**common, 'Prepare-MOJO.exe': exe.read_bytes()})
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--windows', action='store_true')
    parser.add_argument('--output', type=Path, default=ROOT/'userdata/preparer')
    args = parser.parse_args()
    build(args.output.resolve(), args.windows)
    print('Preparation downloads built from the explicit source list; no game inputs were read.')


if __name__ == '__main__': main()
