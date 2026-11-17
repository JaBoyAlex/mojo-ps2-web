// This disposable context discovers vector programs using a blank in-memory
// card. It never mounts the player's saves or sends game bytes over HTTP.
let active=false;
addEventListener('message',async event=>{
  if(active||event.source!==parent||event.origin!==location.origin||event.data.type!=='mojo-warmup')return;
  active=true;
  const {id,disc,ee,expected}=event.data;
  let host,timer,finished=false;
  const reply=(type,data)=>{if(finished)return;finished=true;clearInterval(timer);host?._ps2web_pause(1);parent.postMessage({type,id,...data},location.origin);};
  const fail=()=>reply('mojo-warmup-error',{message:'Automatic preparation could not finish. Try again with this tab open.'});
  addEventListener('error',fail);addEventListener('unhandledrejection',fail);
  try {
    const {default:create}=await import('./browser-tools/runtime/ps2web.js');
    const card=await(await fetch('empty-card.json')).json(),bytes=new Uint8Array(card.size);bytes.fill(255);
    for(const[page,base64]of card.pages){const raw=atob(base64);for(let i=0;i<raw.length;i++)bytes[page*528+i]=raw.charCodeAt(i);}
    const config={noInitialRun:true,canvas:new OffscreenCanvas(1,1),localDisc:disc.iso,discSize:disc.iso.size,
      discUrl:'local-disc',noSurface:true,prepareCapture:true,print:()=>{},printErr:()=>{},onAbort:fail,onHalt:fail,
      preRun:[()=>{
        config.FS.mkdir('/game');config.FS.mkdir('/memcard');config.FS.mkdir('/capture');
        config.FS.writeFile('/game/core.elf',disc.elf);config.FS.writeFile('/memcard/Mcd001.ps2',bytes);
        config.FS.writeFile('/game/boot.txt','cdrom0:\\SLUS_207.41;1\n');
      }],
    };
    host=await create(config);host.FS.writeFile('/prepared-ee.wasm',ee);
    if(!await host._mojo_load_game(0))throw new Error('Incompatible preparation module');
    host._mojo_render_options(1,0);
    Promise.resolve(host.callMain(['/game/core.elf','--frames','1800','--press','300:start','--press','600:cross','--press','900:cross','--press','1200:cross'])).catch(fail);
    const started=performance.now();let previous=0,lastChange=0;
    timer=setInterval(()=>{
      const frames=host._ps2web_frames(),names=host.FS.readdir('/capture').filter(name=>/^[0-9A-F]{16}_[0-9A-F]{4}\.bin$/.test(name));
      if(names.length!==previous){previous=names.length;lastChange=frames;}
      if(names.length===expected&&frames>=600&&frames-lastChange>=60){
        const captures={};for(const name of names)captures[name]=host.FS.readFile('/capture/'+name);
        reply('mojo-warmup-ready',{captures});
      }else if(performance.now()-started>90000||frames>=1800)fail();
    },100);
  }catch{fail();}
});
parent.postMessage({type:'mojo-warmup-listening'},location.origin);
