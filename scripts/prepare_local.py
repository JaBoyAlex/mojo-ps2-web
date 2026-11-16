"""Prepare an owner-local import using the existing, unchanged browser builder."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import struct
import subprocess
import sys
import tempfile

import build_web


def valid_runtime(path):
    """Verify every packaged component before reusing any previous local build."""
    try:
        with Path(path).open('rb') as stream:
            header = stream.read(13)
            if len(header) != 13 or header[:9] != b'MOJOWEB1\n': return False
            size = struct.unpack('<I', header[9:])[0]
            if not 16 <= size <= 16384: return False
            meta = json.loads(stream.read(size))
            if not isinstance(meta, dict) or Path(path).stat().st_size > 256*1024*1024: return False
            if meta.get('version') != 1 or meta.get('engine') != build_web.PIN: return False
            from package_runtime import ISO
            if meta.get('disc') != ISO: return False
            variants = meta.get('variants', [])
            if not isinstance(variants, list) or len(variants) != 2: return False
            if {v['name'] for v in variants} != {'threaded', 'single'}: return False
            entries = [v[k] for v in variants for k in ('js', 'wasm')]
            if meta.get('logo'): entries.append(meta['logo'])
            length = Path(path).stat().st_size
            if meta.get('discImage'):
                image=meta['discImage']
                if image['sha256'] != ISO or 13+size+image['offset']+image['size'] != length: return False
                if any(entry['offset']+entry['size']>image['offset'] for entry in entries): return False
                entries.append(image)
            for entry in entries:
                offset, count = entry['offset'], entry['size']
                if type(offset) is not int or type(count) is not int or offset < 0 or count < 1 or 13 + size + offset + count > length: return False
                stream.seek(13 + size + offset)
                digest=hashlib.sha256()
                while count:
                    chunk=stream.read(min(count,1024*1024))
                    if not chunk: return False
                    digest.update(chunk);count-=len(chunk)
                if digest.hexdigest() != entry['sha256']: return False
        return True
    except (OSError, ValueError, KeyError, TypeError):
        return False


def export_runtime(source, output, disc=None):
    if disc is not None:
        from package_runtime import package_with_disc
        package_with_disc(source, disc, output)
        return
    source, output = Path(source).resolve(), Path(output).resolve()
    if source == output: return
    output.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix='.mojo-preparing-', dir=output.parent)
    try:
        with os.fdopen(fd, 'wb') as dest, source.open('rb') as stream:
            shutil.copyfileobj(stream, dest)
        os.replace(temporary, output)
    finally:
        if os.path.exists(temporary): os.unlink(temporary)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--game', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--engine', type=Path, default=build_web.ROOT/'userdata/engine')
    parser.add_argument('--existing-runtime', type=Path, default=build_web.ROOT/'userdata/MOJO-runtime.mojo')
    parser.add_argument('--reuse-only', action='store_true', help='Exit 3 if compilation is needed')
    args = parser.parse_args()
    game, engine = args.game.resolve(), args.engine.resolve()
    if args.output.suffix.lower() != '.mojo' or args.output.resolve() == game:
        raise ValueError('Save the prepared file as a separate .mojo file. Your original disc is never replaced.')
    if not game.is_file() or game.suffix.lower() not in ('.iso', '.bin', '.cue', '.img'):
        raise ValueError('Choose your MOJO! USA ISO or single-track BIN/CUE image.')
    print('Checking your disc locally. No game files are uploaded.', flush=True)
    build_web.fetch_engine(engine)
    native = build_web.module('build')
    private = build_web.ROOT/'userdata/preparation'
    private.mkdir(parents=True, exist_ok=True)
    # Always validate the newly selected image, even when a cached engine already
    # has a valid disc. Never let a previous import mask an invalid selection.
    if game.suffix.lower() == '.iso':
        iso = game
    else:
        iso = private/'selected.iso'
        subprocess.run([sys.executable, '-I', str(engine/'scripts/disc.py'), 'iso', str(game), str(iso)], check=True)
    try: native.validate(iso, engine, private)
    except native.Failure as error: raise ValueError(error.message) from None
    if valid_runtime(args.existing_runtime):
        print('Reusing your verified local runtime.', flush=True)
        export_runtime(args.existing_runtime, args.output, iso)
        print('READY: Your private MOJO-runtime.mojo is ready to import.', flush=True)
        return 0
    if args.reuse_only: return 3
    print('Preparing the same browser runtime used by the player. This may take a while.', flush=True)
    jobs=2
    try:
        available=next(int(line.split()[1])*1024 for line in Path('/proc/meminfo').read_text().splitlines() if line.startswith('MemAvailable:'))
        jobs=max(1,min(4,os.cpu_count() or 1,available//(2*1024*1024*1024)))
    except (OSError, StopIteration, ValueError): pass
    env={**os.environ,'PS2_JOBS':str(jobs),'CMAKE_BUILD_PARALLEL_LEVEL':str(jobs)}
    subprocess.run([sys.executable, str(build_web.ROOT/'scripts/build_web.py'), '--game', str(iso), '--engine', str(engine), '--jobs', str(jobs)], env=env, check=True)
    result = build_web.ROOT/'userdata/MOJO-runtime.mojo'
    if not valid_runtime(result): raise ValueError('Preparation did not produce a complete, verified runtime. Your previous output is retained.')
    export_runtime(result, args.output, iso)
    print('READY: Your private MOJO-runtime.mojo is ready to import.', flush=True)
    return 0


if __name__ == '__main__':
    try: sys.exit(main())
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        print('Preparation stopped: ' + str(error), file=sys.stderr)
        sys.exit(1)
