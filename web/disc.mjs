// Bounded-memory validation shared by the import worker and Node regression tests.
export const ISO_SHA256 = 'bcfba449a662cc898868317c4bc415e9a2084a53ae8b92b7a4a19efbaa54f3c5';
export const ELF_SHA256 = 'b749b3765aa3c74d594ec502686246965b69e8492c49ac08f5283a245adc8a60';
export const BIN_BYTES = 130926432;
export const ISO_BYTES = BIN_BYTES / 2352 * 2048;
const K = new Uint32Array([
  0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
  0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
  0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
  0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
  0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
  0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
  0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
  0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
const rotr = (x,n) => (x>>>n)|(x<<(32-n));
export class Sha256 {
  constructor() {
    this.h = new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
    this.pending = new Uint8Array(64); this.used = 0; this.bytes = 0; this.w = new Uint32Array(64);
  }
  block(p,at) {
    const w=this.w,h=this.h;
    for(let i=0;i<16;i++) {const j=at+i*4;w[i]=(p[j]<<24)|(p[j+1]<<16)|(p[j+2]<<8)|p[j+3];}
    for(let i=16;i<64;i++) {const a=w[i-15],b=w[i-2];w[i]=w[i-16]+(rotr(a,7)^rotr(a,18)^(a>>>3))+w[i-7]+(rotr(b,17)^rotr(b,19)^(b>>>10));}
    let [a,b,c,d,e,f,g,hh]=h;
    for(let i=0;i<64;i++) {
      const t1=(hh+(rotr(e,6)^rotr(e,11)^rotr(e,25))+((e&f)^(~e&g))+K[i]+w[i])|0;
      const t2=((rotr(a,2)^rotr(a,13)^rotr(a,22))+((a&b)^(a&c)^(b&c)))|0;
      hh=g;g=f;f=e;e=(d+t1)|0;d=c;c=b;b=a;a=(t1+t2)|0;
    }
    const v=[a,b,c,d,e,f,g,hh];for(let i=0;i<8;i++) h[i]+=v[i];
  }
  update(p) {
    this.bytes+=p.length;let at=0;
    if(this.used) {const n=Math.min(64-this.used,p.length);this.pending.set(p.subarray(0,n),this.used);this.used+=n;at=n;if(this.used===64) {this.block(this.pending,0);this.used=0;}}
    for(;at+64<=p.length;at+=64) this.block(p,at);
    if(at<p.length) {this.pending.set(p.subarray(at));this.used=p.length-at;}
    return this;
  }
  digest() {
    const padding=new Uint8Array(this.used<56?64-this.used:128-this.used);padding[0]=128;
    const view=new DataView(padding.buffer);view.setUint32(padding.length-8,Math.floor(this.bytes/0x20000000));view.setUint32(padding.length-4,(this.bytes*8)>>>0);
    this.update(padding);return Array.from(this.h,x=>x.toString(16).padStart(8,'0')).join('');
  }
}
export async function hashBlob(blob, progress=()=>{}) {
  const hash=new Sha256();const chunk=1024*1024;
  for(let at=0;at<blob.size;at+=chunk) {hash.update(new Uint8Array(await blob.slice(at,at+chunk).arrayBuffer()));progress(Math.min(at+chunk,blob.size)/blob.size);}
  return hash.digest();
}
export function normalizeSectors(bytes) {
  if(bytes.length%2352) throw new Error('Incomplete raw CD sector.');
  const out=new Uint8Array(bytes.length/2352*2048);
  for(let at=0,to=0;at<bytes.length;at+=2352,to+=2048) {
    if(bytes[at]!==0 || bytes[at+11]!==0 || bytes[at+15]!==2 || bytes[at+18]&0x20) throw new Error('Expected single-track MODE2/2352 Form 1 CD data.');
    for(let i=1;i<=10;i++) if(bytes[at+i]!==255) throw new Error('Invalid CD sector sync.');
    out.set(bytes.subarray(at+24,at+24+2048),to);
  }
  return out;
}
export async function readIsoFile(iso,name) {
  const pvd=new Uint8Array(await iso.slice(16*2048,17*2048).arrayBuffer());
  if(pvd[0]!==1 || new TextDecoder().decode(pvd.subarray(1,6))!=='CD001') throw new Error('Invalid ISO9660 primary descriptor.');
  const view=new DataView(pvd.buffer),extent=view.getUint32(158,true),size=view.getUint32(166,true);
  if(size>1024*1024 || extent*2048+size>iso.size) throw new Error('Invalid ISO root directory.');
  const root=new Uint8Array(await iso.slice(extent*2048,extent*2048+size).arrayBuffer());
  for(let at=0;at<root.length;) {
    const n=root[at];if(!n) {at=(Math.floor(at/2048)+1)*2048;continue;}
    if(n<34 || at+n>root.length || 33+root[at+32]>n) throw new Error('Damaged ISO directory entry.');
    const entry=new DataView(root.buffer,at,n),fileName=new TextDecoder().decode(root.subarray(at+33,at+33+root[at+32])).replace(/;\d+$/,'');
    if(fileName===name) {const offset=entry.getUint32(2,true)*2048,length=entry.getUint32(10,true);if(offset+length>iso.size) throw new Error('Truncated ISO file.');return iso.slice(offset,offset+length);}
    at+=n;
  }
  throw new Error(`The disc has no ${name}.`);
}
export async function validateDisc(file,progress=()=>{}) {
  let iso=file;
  if(file.size===BIN_BYTES) {
    const parts=[],chunk=2352*512;
    for(let at=0;at<file.size;at+=chunk) {parts.push(normalizeSectors(new Uint8Array(await file.slice(at,at+chunk).arrayBuffer())));progress((at/file.size)*0.25,'Normalizing your CD sectors');}
    iso=new Blob(parts,{type:'application/octet-stream'});
  } else if(file.size!==ISO_BYTES) throw new Error('Unsupported image size. Use the verified MOJO! USA ISO or single-track BIN (not the CUE text file).');
  if(await hashBlob(iso,p=>progress(0.25+p*0.7,'Verifying the complete disc'))!==ISO_SHA256) throw new Error('Disc SHA-256 mismatch. Only the verified USA SLUS_207.41 disc is supported.');
  const cnf=await (await readIsoFile(iso,'SYSTEM.CNF')).text();
  if(!/BOOT2\s*=\s*cdrom0:\\SLUS_207\.41;1/i.test(cnf) || !/VER\s*=\s*1\.02\b/.test(cnf)) throw new Error('Unsupported SYSTEM.CNF region or revision.');
  const elf=await readIsoFile(iso,'SLUS_207.41');
  if(await hashBlob(elf)!==ELF_SHA256) throw new Error('Boot executable SHA-256 mismatch.');
  progress(1,'Disc verified');
  return {iso,elf:new Uint8Array(await elf.arrayBuffer())};
}
