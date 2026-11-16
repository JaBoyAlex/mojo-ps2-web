import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {openAsBlob} from 'node:fs';
import {Sha256,hashBlob,normalizeSectors,readIsoFile,validateDisc,ISO_BYTES} from '../web/disc.mjs';
const reference=b=>createHash('sha256').update(b).digest('hex');
for(const n of [0,1,55,56,63,64,65,127,128,1024,1048576]) {
  const data=randomBytes(n),hash=new Sha256();
  for(let at=0;at<n;at+=17) hash.update(data.subarray(at,at+17));
  assert.equal(hash.digest(),reference(data),`incremental SHA-256 length ${n}`);
  assert.equal(await hashBlob(new Blob([data])),reference(data));
}
const sector=new Uint8Array(2352);sector.fill(255,1,11);sector[15]=2;
for(let i=24;i<2072;i++) sector[i]=(i*7)&255;
assert.deepEqual(normalizeSectors(sector),sector.subarray(24,2072));
sector[18]=0x20;assert.throws(()=>normalizeSectors(sector),/Form 1/);
assert.throws(()=>normalizeSectors(new Uint8Array(2353)),/Incomplete/);
await assert.rejects(()=>validateDisc(new Blob(['not a disc'])),/Unsupported image size/);
await assert.rejects(()=>readIsoFile(new Blob([new Uint8Array(17*2048)]),'SLUS_207.41'),/descriptor/);
assert.equal(ISO_BYTES,114003968);
if(process.env.MOJO_TEST_DISC) {
  const started=performance.now(),result=await validateDisc(await openAsBlob(process.env.MOJO_TEST_DISC));
  console.log(JSON.stringify({validatedDisc:true,isoBytes:result.iso.size,elfBytes:result.elf.length,milliseconds:performance.now()-started}));
}
console.log('PASS: independent SHA-256 vectors/chunking, sector validation, malformed-disc rejection'+(process.env.MOJO_TEST_DISC?', owner-disc normalization and exact hashes':''));
