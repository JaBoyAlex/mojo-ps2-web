import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {unpackRuntime} from '../web/runtime-package.mjs';
import {ISO_SHA256} from '../web/disc.mjs';
const wasm=Buffer.from([0,97,115,109,1,0,0,0]),js=Buffer.from('/* independently authored synthetic runtime */');
const hash=x=>createHash('sha256').update(x).digest('hex');
const metadata={version:1,engine:'57ef1197c0b818b9a4e1dbb98b1588da38586ffb',disc:ISO_SHA256,variants:['threaded','single'].map(name=>({name,js:{offset:0,size:js.length,sha256:hash(js)},wasm:{offset:js.length,size:wasm.length,sha256:hash(wasm)}}))};
const m=Buffer.from(JSON.stringify(metadata)),header=Buffer.alloc(13);header.write('MOJOWEB1\n');header.writeUInt32LE(m.length,9);
const blob=new Blob([header,m,js,wasm]);
for(const threaded of [false,true]) {const result=await unpackRuntime(blob,threaded);assert.equal(result.threaded,threaded);assert.equal(await result.js.text(),js.toString());}
await assert.rejects(()=>unpackRuntime(new Blob(['bad']),true),/size/);
await assert.rejects(()=>unpackRuntime(new Blob([header,m,js,Buffer.alloc(wasm.length)]),true),/checksum/);
console.log('PASS: local runtime variants, integrity checks and damaged-package rejection');
const disc=Buffer.from('independently authored synthetic disc');
const withDisc={...metadata,discImage:{offset:js.length+wasm.length,size:disc.length,sha256:ISO_SHA256}};
function packed(meta,payload) {const encoded=Buffer.from(JSON.stringify(meta)),head=Buffer.alloc(13);head.write('MOJOWEB1\n');head.writeUInt32LE(encoded.length,9);return new Blob([head,encoded,payload]);}
const prepared=await unpackRuntime(packed(withDisc,Buffer.concat([js,wasm,disc])),true);
assert.equal(await prepared.disc.text(),disc.toString());
assert.equal(prepared.runtimeBlob.size,blob.size);
const remembered=await unpackRuntime(prepared.runtimeBlob,true);
assert.equal(remembered.disc,undefined);assert.equal(await remembered.js.text(),js.toString());
assert.deepEqual(new Uint8Array(await remembered.wasm.arrayBuffer()),new Uint8Array(wasm));
await assert.rejects(()=>unpackRuntime(packed({...withDisc,discImage:{...withDisc.discImage,offset:0}},Buffer.concat([js,wasm,disc])),true),/disc/);
await assert.rejects(()=>unpackRuntime(packed({...withDisc,discImage:{...withDisc.discImage,sha256:'bad'}},Buffer.concat([js,wasm,disc])),true),/disc/);
console.log('PASS: single-import disc bundle, unchanged runtime components, separate cache without duplicate disc bytes, malformed disc descriptors rejected');
