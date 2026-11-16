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
