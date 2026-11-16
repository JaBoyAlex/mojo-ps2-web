import hashlib
import importlib.util
import io
import json
from pathlib import Path
import struct
import sys
import tempfile
import unittest
from unittest.mock import patch
import zipfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'scripts'))
import build_preparer
import package_runtime
import prepare_local
from verify_publication import verify_preparer


def runtime_bytes():
    js = b'/* independently authored test runtime */'
    wasm = bytes([0, 97, 115, 109, 1, 0, 0, 0])
    parts, variants, offset = [], [], 0
    for name in ('threaded', 'single'):
        variant = {'name': name}
        for kind, data in (('js', js), ('wasm', wasm)):
            variant[kind] = {'offset': offset, 'size': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
            parts.append(data); offset += len(data)
        variants.append(variant)
    metadata = {'version': 1, 'engine': prepare_local.build_web.PIN, 'disc': package_runtime.ISO, 'variants': variants}
    encoded = json.dumps(metadata).encode()
    return b'MOJOWEB1\n' + struct.pack('<I', len(encoded)) + encoded + b''.join(parts)


class PreparationTests(unittest.TestCase):
    def test_reuse_verifies_components_and_preserves_previous_output(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); runtime = root/'previous.mojo'; output = root/'output.mojo'
            runtime.write_bytes(runtime_bytes()); output.write_bytes(b'previous output')
            self.assertTrue(prepare_local.valid_runtime(runtime))
            damaged = bytearray(runtime.read_bytes()); damaged[-1] ^= 1; runtime.write_bytes(damaged)
            self.assertFalse(prepare_local.valid_runtime(runtime))
            self.assertEqual(output.read_bytes(), b'previous output')
            runtime.write_bytes(runtime_bytes()); prepare_local.export_runtime(runtime, output)
            self.assertEqual(runtime.read_bytes(), output.read_bytes())
            prepare_local.export_runtime(output, output)
            runtime.write_bytes(b'MOJOWEB1\n' + struct.pack('<I', 16) + b'[]' + b' '*14)
            self.assertFalse(prepare_local.valid_runtime(runtime))

    def test_single_import_keeps_runtime_bytes_and_refuses_invalid_disc(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); runtime = root/'old.mojo'; disc = root/'test.iso'; output = root/'prepared.mojo'
            original = runtime_bytes(); runtime.write_bytes(original); disc.write_bytes(b'independent synthetic disc')
            output.write_bytes(b'previous prepared file')
            with self.assertRaisesRegex(ValueError, 'supported'): package_runtime.package_with_disc(runtime, disc, output)
            self.assertEqual(output.read_bytes(), b'previous prepared file')
            with patch.object(package_runtime, 'ISO', hashlib.sha256(disc.read_bytes()).hexdigest()):
                package_runtime.package_with_disc(runtime, disc, output)
            packed = output.read_bytes(); old_size = struct.unpack('<I', original[9:13])[0]; new_size = struct.unpack('<I', packed[9:13])[0]
            meta = json.loads(packed[13:13+new_size]); descriptor = meta['discImage']
            self.assertEqual(packed[13+new_size:13+new_size+descriptor['offset']], original[13+old_size:])
            self.assertEqual(packed[13+new_size+descriptor['offset']:], disc.read_bytes())
            self.assertEqual(runtime.read_bytes(), original)

    def test_public_download_has_only_approved_sources_and_rejects_extra_content(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); build_preparer.build(root)
            archive = root/'prepare-mojo-linux.zip'; verify_preparer(archive)
            with zipfile.ZipFile(root/'sources.zip') as source:
                self.assertEqual(set(source.namelist()), set(build_preparer.SOURCES)|{'source-manifest.json'})
                self.assertFalse(any(name.startswith('userdata/') for name in source.namelist()))
            with zipfile.ZipFile(archive, 'a') as changed: changed.writestr('unexpected.txt', 'must reject')
            with self.assertRaisesRegex(ValueError, 'Unexpected'): verify_preparer(archive)

    def test_source_manifest_tampering_is_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); build_preparer.build(root)
            archive = root/'prepare-mojo-linux.zip'
            with zipfile.ZipFile(archive) as packed: outer = {name: packed.read(name) for name in packed.namelist()}
            with zipfile.ZipFile(io.BytesIO(outer['sources.zip'])) as packed: inner = {name: packed.read(name) for name in packed.namelist()}
            inner['scripts/build_web.py'] += b'\n# tampered\n'
            changed = root/'changed.zip'; build_preparer.write_zip(changed, inner); outer['sources.zip'] = changed.read_bytes()
            build_preparer.write_zip(archive, outer)
            with self.assertRaisesRegex(ValueError, 'Damaged'): verify_preparer(archive)


if __name__ == '__main__': unittest.main()
