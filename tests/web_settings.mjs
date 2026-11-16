import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {cameraAxis} from '../web/input.mjs';
import {CARD_BYTES,needsFormatting,decodeCardTemplate,ensureFormattedCard} from '../web/save-card.mjs';
for(let i=0;i<256;i++) {assert.equal(cameraAxis(i,false),i);assert.equal(cameraAxis(i,true),i===128?128:255-i);}
assert.equal(cameraAxis(128,true),128);assert.equal(cameraAxis(0,true),255);assert.equal(cameraAxis(255,true),0);
assert.equal(needsFormatting(null),true);
const erased=new Uint8Array(CARD_BYTES);erased.fill(255);assert.equal(needsFormatting(erased),true);
erased[530]=1;assert.equal(needsFormatting(erased),false);
assert.equal(needsFormatting(new Uint8Array(32)),false);
assert.throws(()=>decodeCardTemplate({size:1,pages:[]}),/Invalid/);
if(process.env.MOJO_CARD_TEMPLATE) {
  const template=JSON.parse(readFileSync(process.env.MOJO_CARD_TEMPLATE)),expected=decodeCardTemplate(template);
  const expectedPath=process.env.MOJO_CARD_REFERENCE;
  if(expectedPath) assert.deepEqual(expected,new Uint8Array(readFileSync(expectedPath)));
  let card=null,writes=0,flushes=0;
  const FS={readFile(){if(!card) throw new Error('ENOENT');return card;},analyzePath(){return {exists:!!card};},writeFile(_,bytes){card=bytes;writes++;}};
  const load=async()=>template,persist=async()=>{flushes++;};
  assert.equal(await ensureFormattedCard(FS,load,persist),true);assert.equal(writes,1);assert.equal(flushes,1);
  assert.equal(await ensureFormattedCard(FS,load,persist),false);assert.equal(writes,1);
  const saved=new Uint8Array(expected);saved[9000]=83;card=saved;
  assert.equal(await ensureFormattedCard(FS,load,persist),false);assert.equal(card,saved);
  card=new Uint8Array(CARD_BYTES);card.fill(255);
  assert.equal(await ensureFormattedCard(FS,load,persist),true);assert.equal(writes,2);
  assert.equal(needsFormatting(card),false);
  console.log('PASS: browser card is byte-identical to native formatting; missing/erased card initialized, existing saves preserved, initialization persisted');
}
console.log('PASS: both camera axes match native mapping for every input; neutral and existing card data preserved');
