/** Keep I/O bounded and stop scheduling obsolete query work.
 * 限制并发读取；查询过期后不再调度新文件，保留输入顺序。 */
export async function mapConcurrent<T,R>(items:readonly T[],limit:number,run:(item:T)=>Promise<R>,cancelled:()=>boolean=()=>false):Promise<Array<R|undefined>> {
 const result=new Array<R|undefined>(items.length);let cursor=0;
 const worker=async()=>{while(!cancelled()){const index=cursor++;if(index>=items.length)return;result[index]=await run(items[index]);}};
 await Promise.all(Array.from({length:Math.min(items.length,Math.max(1,Math.floor(limit)))},worker));return result;
}
