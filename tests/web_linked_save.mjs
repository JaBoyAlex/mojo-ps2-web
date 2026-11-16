import assert from 'node:assert/strict';
import {LinkedSave} from '../web/linked-save.mjs';
import {CARD_BYTES} from '../web/save-card.mjs';

function fixture(permission='granted') {
  let record=null,bytes=new Uint8Array(CARD_BYTES),opens=0,closed=0,active=0,maxActive=0,requests=0,aborted=0,fail=false;
  const handle={name:'mojo.ps2',
    async queryPermission(){return permission;},
    async requestPermission(){requests++;permission='granted';return permission;},
    async getFile(){return new Blob([bytes]);},
    async createWritable(){
      opens++;active++;maxActive=Math.max(maxActive,active);let pending=null;
      return {async write(value){if(fail) throw new Error('Disk full');await Promise.resolve();pending=value;},async close(){bytes=new Uint8Array(pending);closed++;active--;},async abort(){aborted++;active--;}};
    }
  };
  const store=async(action,value)=>{if(action==='get')return record;if(action==='delete')record=null;else record=value;};
  return {handle,store,get bytes(){return bytes;},get record(){return record;},get counters(){return {opens,closed,maxActive,requests,aborted};},set permission(value){permission=value;},set fail(value){fail=value;}};
}
const f=fixture(),link=new LinkedSave({store:f.store});
await link.attach(f.handle);assert.equal(link.granted,true);assert.equal(f.record.handle,f.handle);
const one=new Uint8Array(CARD_BYTES);one[0]=1;
assert.equal(await link.save(one),true);assert.equal(f.bytes[0],1);assert.equal(f.record.dirty,false);
const restored=new LinkedSave({store:f.store});await restored.restore();assert.equal(restored.handle,f.handle);assert.equal((await restored.read())[0],1);
const two=new Uint8Array(CARD_BYTES);two[0]=2;const three=new Uint8Array(CARD_BYTES);three[0]=3;
assert.deepEqual(await Promise.all([link.save(two),link.save(three)]),[true,true]);assert.equal(f.bytes[0],3);assert.equal(f.counters.maxActive,1);
f.permission='prompt';assert.equal(await link.save(one),false);assert.equal(f.record.dirty,true);assert.equal(f.bytes[0],3);assert.equal(f.counters.requests,0);
const dirtyReload=new LinkedSave({store:f.store});await dirtyReload.restore();assert.equal(dirtyReload.dirty,true);assert.equal(await dirtyReload.read(),null,'never overwrite newer browser progress with an older file');
assert.equal(await dirtyReload.reconnect(),true);assert.equal(f.counters.requests,1);assert.equal(await dirtyReload.save(one),true);assert.equal(f.bytes[0],1);
f.fail=true;assert.equal(await dirtyReload.save(two),false);assert.equal(f.bytes[0],1);assert.equal(f.counters.aborted,1);assert.equal(f.record.dirty,true);
f.fail=false;assert.equal(await dirtyReload.reconnect(),true);assert.equal(await dirtyReload.save(two),true);assert.equal(f.bytes[0],2);
await assert.rejects(()=>dirtyReload.save(new Uint8Array(1)),/incomplete/);
await dirtyReload.unlink();assert.equal(f.record,null);assert.equal(dirtyReload.handle,null);assert.equal(f.bytes[0],2,'unlink never deletes the chosen file');
console.log('PASS: remembered file handle, automatic overwrite, serialized/coalesced saves, permission loss/reconnect, disk-write failure recovery, newer-browser-copy protection, unlink preserves disk file');
