export type CleanupScope='recent'|'history'|'both';
export interface CleanupRequest {scope:CleanupScope;from:string;to:string}
export interface CleanupResult {historyDays:number;recentRecords:number}
export function localDateKey(now=Date.now()):string {
  const date=new Date(now);
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
function localDay(value:string):Date {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new Error('请选择完整的起止日期');
  const [year,month,day]=value.split('-').map(Number);
  const date=new Date(0);date.setFullYear(year,month-1,day);date.setHours(0,0,0,0);
  if(localDateKey(date.getTime())!==value)throw new Error('日期无效');
  return date;
}
/** Inclusive local dates become an exclusive timestamp upper bound, including DST days.
 * 起止日期均包含在内，时间戳上界取次日零点，兼容夏令时。 */
export function recordDateRange(from:string,to:string):{from:string;to:string;start:number;end:number} {
  const first=localDay(from),last=localDay(to);
  if(first>last)throw new Error('开始日期不能晚于结束日期');
  last.setDate(last.getDate()+1);
  return {from,to,start:first.getTime(),end:last.getTime()};
}
