import type {ContentMatch} from '../types.ts';

function occurrences(content:string, term:string) {
  if(!term)return [];
  const pattern=term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  return [...content.matchAll(new RegExp(pattern,'giu'))];
}

// Keep source offsets; whitespace is collapsed only in the displayed excerpt.
// Cap matches per file: a common term in a long note must not create thousands of DOM rows.
// 每个文件的命中数设上限：常见词在长笔记里不能生成成千上万个 DOM 行。
export const MAX_CONTENT_MATCHES=20;
export function extractContentMatches(content:string,terms:string[],context=35):ContentMatch[] {
  const hits:ContentMatch[]=[];
  const seen=new Set<number>();
  outer: for(const term of terms)for(const found of occurrences(content,term)) {
    const start=found.index, end=start+found[0].length;
    const bucket=Math.floor(start/Math.max(1,context*2));
    if(seen.has(bucket))continue;
    seen.add(bucket);
    const left=Math.max(0,start-context),right=Math.min(content.length,end+context);
    hits.push({start,end,match:found[0],before:content.slice(Math.max(0,start-32),start),after:content.slice(end,end+32),
      text:(left?'…':'')+content.slice(left,right).replace(/\s+/g,' ')+(right<content.length?'…':'')});
    if(hits.length>=MAX_CONTENT_MATCHES)break outer;
  }
  return hits.sort((a,b)=>a.start-b.start);
}

// Resolve against the current editor text: CRLF normalization and intervening edits
// must not send a click to a different occurrence of the same word.
export function resolveContentMatch(content:string,hit:ContentMatch):{start:number;end:number}|null {
  const normalized=(value:string)=>value.replace(/\r\n?|\n/g,'\n');
  const before=normalized(hit.before),after=normalized(hit.after);
  const candidates=occurrences(content,hit.match).map(found=>{
    const start=found.index,end=start+found[0].length;
    const left=normalized(content.slice(Math.max(0,start-hit.before.length-32),start));
    const right=normalized(content.slice(end,end+hit.after.length+32));
    let context=0;
    for(let i=1;i<=Math.min(before.length,left.length)&&before.at(-i)===left.at(-i);i++)context++;
    for(let i=0;i<Math.min(after.length,right.length)&&after[i]===right[i];i++)context++;
    return {start,end,context,distance:Math.abs(start-hit.start)};
  });
  candidates.sort((a,b)=>b.context-a.context||a.distance-b.distance);
  return candidates[0] ? {start:candidates[0].start,end:candidates[0].end} : null;
}

export function offsetToPosition(content:string,offset:number) {
  const lines=content.slice(0,Math.max(0,Math.min(offset,content.length))).split(/\r\n|\r|\n/);
  return {line:lines.length-1,ch:lines.at(-1).length};
}
