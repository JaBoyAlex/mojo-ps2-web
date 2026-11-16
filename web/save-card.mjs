export const CARD_BYTES=8650752;
export function needsFormatting(bytes) {
  return !bytes||(bytes.length===CARD_BYTES&&bytes.every(value=>value===255));
}
export function decodeCardTemplate(template) {
  if(template.size!==CARD_BYTES||!Array.isArray(template.pages)) throw new Error('Invalid empty-card template. Rebuild the web distribution.');
  const card=new Uint8Array(CARD_BYTES);card.fill(255);const seen=new Set();
  for(const [index,encoded] of template.pages) {
    if(!Number.isInteger(index)||index<0||index>=16384||seen.has(index)) throw new Error('Invalid empty-card page.');
    seen.add(index);const page=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));
    if(page.length!==528) throw new Error('Invalid empty-card page size.');
    card.set(page,index*528);
  }
  if(!new TextDecoder().decode(card.subarray(0,32)).startsWith('Sony PS2 Memory '+'Card Format ')) throw new Error('Empty card has an invalid format header.');
  return card;
}
export async function ensureFormattedCard(FS,loadTemplate,persist) {
  let existing=null;
  try {existing=FS.readFile('/memcard/Mcd001.ps2');}
  catch(error) {if(FS.analyzePath('/memcard/Mcd001.ps2').exists) throw error;}
  if(!needsFormatting(existing)) return false;
  const card=decodeCardTemplate(await loadTemplate());
  FS.writeFile('/memcard/Mcd001.ps2',card);
  await persist();
  return true;
}
