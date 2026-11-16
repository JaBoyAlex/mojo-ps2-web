class MojoAudio extends AudioWorkletProcessor {
  constructor({processorOptions}) {
    super();this.shared=processorOptions.shared;this.queue=[];this.offset=0;this.tick=0;this.under=0;
    if(this.shared) this.bind(processorOptions);
    this.port.onmessage=({data})=>{
      if(data.buffer && this.shared) this.bind(data);
      else if(data.samples) {if(this.queue.length<24) this.queue.push(data.samples);}
      else if(data.clear) {this.queue=[];this.offset=0;}
    };
  }
  bind({buffer,base}) {this.ring=new Uint32Array(buffer,base,4);this.samples=new Int16Array(buffer,base+16,this.ring[2]*2);}
  process(_,outputs) {
    const [l,r]=outputs[0];
    if(this.shared) {
      const write=Atomics.load(this.ring,0),mask=this.ring[2]-1;let read=Atomics.load(this.ring,1);
      for(let i=0;i<l.length;i++) {
        if(read!==write) {const at=(read&mask)*2;l[i]=this.samples[at]/32768;r[i]=this.samples[at+1]/32768;read=(read+1)>>>0;}
        else this.under++;
      }
      Atomics.store(this.ring,1,read);Atomics.store(this.ring,3,1);
    } else {
      for(let i=0;i<l.length;i++) {
        if(this.queue.length) {const p=this.queue[0];l[i]=p[this.offset++]/32768;r[i]=p[this.offset++]/32768;if(this.offset===p.length) {this.queue.shift();this.offset=0;}}
        else this.under++;
      }
    }
    if(++this.tick%64===0) this.port.postMessage({underrunSamples:this.under,queuedMs:this.queue.reduce((n,p)=>n+p.length,0)/96-this.offset/96});
    return true;
  }
}
registerProcessor('mojo-audio',MojoAudio);
