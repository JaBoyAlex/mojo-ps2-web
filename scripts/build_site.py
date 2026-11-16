#!/usr/bin/env python3
"""Assemble a public site from an exact list. Never reads a game/runtime build."""
import json
import hashlib
from pathlib import Path
import shutil
import build_web

ROOT=Path(__file__).resolve().parents[1]
PUBLIC_FILES=('launcher.css','launcher.mjs','disc.mjs','disc-worker.mjs','input.mjs','save-card.mjs','linked-save.mjs','audio-worklet.js','runtime-package.mjs','isolation.mjs','isolation-worker.js','prepare.html','backdrop.svg')

def main():
    # mcformat.py is independently authored upstream formatter code. No ELF,
    # translated unit or game executable is an input to this command.
    engine=ROOT/'userdata/public-format-source'
    build_web.fetch_engine(engine)
    out=ROOT/'dist';out.mkdir(exist_ok=True)
    allowed={'index.html','build-config.json','empty-card.json','.nojekyll',*PUBLIC_FILES}
    if any(p.name not in allowed or not p.is_file() for p in out.iterdir()):
        raise ValueError('Unexpected file in public output. Use a clean dist directory.')
    for name in PUBLIC_FILES: shutil.copyfile(ROOT/'web'/name,out/name)
    shell=(ROOT/'web/shell.html').read_text(encoding='utf-8')
    shell=shell.replace('{{{ SCRIPT }}}','')
    version=hashlib.sha256(b''.join((ROOT/'web'/name).read_bytes() for name in PUBLIC_FILES)).hexdigest()[:12]
    shell=shell.replace('src="launcher.mjs"','src="launcher.mjs?v='+version+'"')
    (out/'index.html').write_text(shell,encoding='utf-8')
    (out/'build-config.json').write_text('{"localRuntime":true}\n')
    (out/'empty-card.json').write_text(json.dumps(build_web.make_empty_card(engine),separators=(',',':'))+'\n')
    (out/'.nojekyll').touch()
    from verify_publication import verify_site
    verify_site(out)
    print('Public site built: no game code, disc, runtime package or compiled game module.',flush=True)

if __name__=='__main__':main()
