"""Shared native fixes are fetched from an immutable source revision, not forked."""
import hashlib
from pathlib import Path
import urllib.request
import zipfile

PIN='f6c66e9e3c0a406f08e79ac25b0a66729320d4ee'
SHA256='52cdc20e359a8ab031d2b4bda01bcc8da4af5c9e7f9606b29505f0165512db67'
ROOT=Path(__file__).resolve().parents[1]

def get_native_source():
    cache=ROOT/'userdata';cache.mkdir(exist_ok=True)
    target=cache/'native-source'
    if (target/'.verified-pin').is_file() and (target/'.verified-pin').read_text()==PIN: return target
    archive=cache/'native-source.zip'
    if not archive.exists(): urllib.request.urlretrieve(f'https://codeload.github.com/JaBoyAlex/mojo-ps2-recomp/zip/{PIN}',archive)
    with archive.open('rb') as stream:
        if hashlib.file_digest(stream,'sha256').hexdigest()!=SHA256: raise ValueError('Native source archive checksum mismatch')
    if target.exists(): raise ValueError('Unverified native-source directory exists; choose a clean cache')
    with zipfile.ZipFile(archive) as z: z.extractall(cache)
    (cache/('mojo-ps2-recomp-'+PIN)).rename(target)
    (target/'.verified-pin').write_text(PIN)
    return target
