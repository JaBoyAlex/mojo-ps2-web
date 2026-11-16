import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
let Processor;
class Base {constructor(){this.port={postMessage(){},onmessage:null};}}
vm.runInNewContext(readFileSync(new URL('../web/audio-worklet.js',import.meta.url),'utf8'),{
  AudioWorkletProcessor:Base,registerProcessor:(name,type)=>{assert.equal(name,'mojo-audio');Processor=type;},Uint32Array,Int16Array,Atomics
});
const heap=new SharedArrayBuffer(16+8*2*2),ring=new Uint32Array(heap,0,4),samples=new Int16Array(heap,16);
ring[2]=8;ring[0]=2;samples.set([32767,-32768,16384,-16384]);
const shared=new Processor({processorOptions:{shared:true,buffer:heap,base:0}});
const left=new Float32Array(4),right=new Float32Array(4);
assert.equal(shared.process([],[[left,right]]),true);
assert.deepEqual([...left],[32767/32768,.5,0,0]);assert.deepEqual([...right],[-1,-.5,0,0]);assert.equal(ring[1],2);assert.equal(ring[3],1);
ring[1]=0xffffffff;ring[0]=1;samples[14]=8192;samples[15]=-8192;samples[0]=4096;samples[1]=-4096;
shared.process([],[[left,right]]);assert.equal(ring[1],1);assert.equal(left[0],.25);assert.equal(left[1],.125);
const single=new Processor({processorOptions:{shared:false}});
single.port.onmessage({data:{samples:new Int16Array([16384,-16384,8192,-8192])}});
left.fill(0);right.fill(0);single.process([],[[left,right]]);
assert.deepEqual([...left],[.5,.25,0,0]);assert.deepEqual([...right],[-.5,-.25,0,0]);
single.port.onmessage({data:{samples:new Int16Array([1,2])}});single.port.onmessage({data:{clear:true}});assert.equal(single.queue.length,0);
console.log('PASS: shared and copied stereo audio, underflow silence, 32-bit ring wrap, pause clearing');
