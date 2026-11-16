import {validateDisc} from './disc.mjs';
self.onmessage=async ({data})=>{
  try {const result=await validateDisc(data,(value,message)=>self.postMessage({value,message}));self.postMessage({result},[result.elf.buffer]);}
  catch(error) {self.postMessage({error:error.message});}
};
