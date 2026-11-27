import {test,expect} from "bun:test";
import {mapConcurrent} from "../src/shared/concurrent.ts";
test("bounded scan retains order and stops scheduling stale work",async()=>{
 let running=0,peak=0,stale=false,started=0;const jobs:Array<()=>void>=[];
 const promise=mapConcurrent([0,1,2,3,4],2,async value=>{started++;running++;peak=Math.max(peak,running);await new Promise<void>(resolve=>jobs.push(resolve));running--;return value*2;},()=>stale);
 expect(started).toBe(2);stale=true;jobs.forEach(resolve=>resolve());const result=await promise;expect(peak).toBe(2);expect(started).toBe(2);expect(result.slice(0,2)).toEqual([0,2]);
 expect(await mapConcurrent([3,2,1],2,async value=>value)).toEqual([3,2,1]);
});
