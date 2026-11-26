import type {BookmarkTarget,ContentMatch,HistoryTarget,SearchHistoryRecord} from '../types.ts';
function object(value:unknown):value is Record<string,unknown> {return !!value&&typeof value==='object'&&!Array.isArray(value);}
function match(value:unknown):value is ContentMatch {
  return object(value)&&['text','match','before','after'].every(key=>typeof value[key]==='string')&&
    typeof value.start==='number'&&Number.isFinite(value.start)&&typeof value.end==='number'&&Number.isFinite(value.end)&&
    (value.location===undefined||typeof value.location==='string')&&
    (value.tag===undefined||(object(value.tag)&&typeof value.tag.value==='string'&&(value.tag.field===undefined||value.tag.field==='tags'||value.tag.field==='tag')));
}
function bookmark(value:unknown,depth=0):BookmarkTarget|null {
  if(!object(value)||depth>10)return null;
  const result:BookmarkTarget={};
  for(const key of ['type','title','path','url','query'] as const)if(typeof value[key]==='string')result[key]=value[key];
  if(Array.isArray(value.items))result.items=value.items.map(item=>bookmark(item,depth+1)).filter(item=>item!==null);
  return result.type||result.path?result:null;
}
export function parseHistoryTarget(value:unknown):HistoryTarget|undefined {
  if(!object(value))return;
  if(value.kind==='file'&&typeof value.path==='string'&&value.path)return {kind:'file',path:value.path,...(match(value.hit)?{hit:value.hit}:{})};
  if(value.kind==='command'&&typeof value.id==='string'&&value.id)return {kind:'command',id:value.id};
  if(value.kind==='url'&&typeof value.url==='string'&&/^https?:\/\//i.test(value.url))return {kind:'url',url:value.url};
  if(value.kind==='bookmark') {const item=bookmark(value.bookmark);if(item)return {kind:'bookmark',bookmark:item};}
}
/** Accept legacy query-only records without inventing missing targets. / 兼容旧查询历史，不臆造缺失目标。 */
export function parseHistoryRecords(value:unknown):SearchHistoryRecord[] {
  if(!Array.isArray(value))throw new Error('历史文件必须是数组');
  return value.filter((item):item is Record<string,unknown>=>object(item)&&typeof item.q==='string'&&['vault','global','web'].includes(typeof item.mode==='string'?item.mode:'')&&typeof item.ts==='number'&&Number.isFinite(item.ts))
    .map(item=>({q:item.q as string,mode:item.mode as SearchHistoryRecord['mode'],ts:item.ts as number,
      ...(typeof item.file==='string'?{file:item.file}:{}),...(typeof item.date==='string'?{date:item.date}:{}),target:parseHistoryTarget(item.target)}));
}
export function sameHistoryTarget(a:SearchHistoryRecord,b:SearchHistoryRecord):boolean {
  return a.q===b.q&&a.mode===b.mode&&a.file===b.file&&JSON.stringify(a.target)===JSON.stringify(b.target);
}
