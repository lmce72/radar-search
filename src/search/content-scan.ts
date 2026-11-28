import {setTimer} from '../shared/timers.ts';
import type {ContentMatch} from '../types.ts';
import {proximityScore} from './proximity.ts';
export const MAX_RETAINED_CONTENT_FILES=200;
export const CONTENT_READ_CONCURRENCY=2;

/** Yield across browsers, including iOS without Scheduler. / 兼容无 Scheduler 的 iOS。 */
export async function yieldSearchWork():Promise<void> {
 const host=typeof window==='undefined'?null:window;
 const scheduler=(host as (Window&{scheduler?:{yield?:()=>Promise<void>}})|null)?.scheduler;
 if(scheduler?.yield)await scheduler.yield();else await new Promise<void>(resolve=>setTimer(resolve,0));
}
/** Full-vault scans must not populate the host's full-text read cache.
 * 全库扫描不应把所有正文驻留到宿主读取缓存。 */
export function readSearchText<T>(vault:{read?:(file:T)=>Promise<string>;cachedRead:(file:T)=>Promise<string>},file:T):Promise<string> {
 return vault.read?vault.read(file):vault.cachedRead(file);
}
interface ScanOptions<T,R> {
 files:readonly T[];terms:string[];limit?:number;cancelled:()=>boolean;compareFiles?:(a:T,b:T)=>number;
 read:(file:T)=>Promise<string>;extract:(text:string,file:T)=>ContentMatch[];
 build:(file:T,hits:ContentMatch[],score:number)=>R;error:(file:T,error:unknown)=>void;
}
/** Retain only the best bounded set; never materialize every document's excerpts.
 * 只保留有界的最佳结果，避免先为全库文档生成摘要再截断。 */
export async function scanContentFiles<T,R>(options:ScanOptions<T,R>):Promise<{items:R[];matched:number}> {
 const cap=Math.min(MAX_RETAINED_CONTENT_FILES,Math.max(1,options.limit??MAX_RETAINED_CONTENT_FILES));
 const compare=(a:{file:T;score:number;index:number},b:{file:T;score:number;index:number})=>(options.compareFiles?options.compareFiles(a.file,b.file):b.score-a.score)||a.index-b.index;
 const retained:Array<{file:T;item:R;score:number;index:number}>=[];let cursor=0,matched=0;
 const worker=async()=>{let deadline=performance.now()+16;
  while(!options.cancelled()){
   const index=cursor++;if(index>=options.files.length)return;const file=options.files[index];
   try{
    const text=await options.read(file);if(options.cancelled())return;
    const lower=text.toLowerCase();
    if(options.terms.every(term=>lower.includes(term))){
     matched++;const score=proximityScore(text,options.terms),candidate={file,score,index},last=retained.at(-1);
     if(retained.length<cap||compare(candidate,last)<0){
      const hits=options.extract(text,file);if(hits.length){retained.push({...candidate,item:options.build(file,hits,score)});retained.sort(compare);if(retained.length>cap)retained.pop();}
     }
    }
   }catch(error){options.error(file,error);}
   if(performance.now()>=deadline){await yieldSearchWork();deadline=performance.now()+16;}
  }
 };
 await Promise.all(Array.from({length:Math.min(CONTENT_READ_CONCURRENCY,options.files.length)},worker));
 return {items:options.cancelled()?[]:retained.map(entry=>entry.item),matched};
}
