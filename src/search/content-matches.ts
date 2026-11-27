import type {ContentMatch} from '../types.ts';
import {relevanceScore} from './proximity.ts';

type Occurrence={0:string;index:number};
function literalOccurrences(content:string,term:string,ignoreCase=false):Occurrence[] {
  const out:Occurrence[]=[];
  if(!term)return out;
  const hay=ignoreCase?content.toLowerCase():content;
  const needle=ignoreCase?term.toLowerCase():term;
  let from=0;
  while(from<=hay.length){
    const index=hay.indexOf(needle,from);
    if(index<0)break;
    out.push({0:term,index});
    from=index+Math.max(1,term.length);
  }
  return out;
}
function occurrences(content:string, term:string):Occurrence[] {
  if(!term)return [];
  try {
    const pattern=term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    return [...content.matchAll(new RegExp(pattern,'giu'))];
  } catch {
    // Arbitrary user text with invalid Unicode/escapes must still be searchable.
    // 用户文本可能包含无效转义或超大片段，回退到字面匹配。
    return literalOccurrences(content,term,true);
  }
}

// 内容与标签共享原文偏移、上下文和行号。 / Share source offsets, context and line numbers.
export function createContentMatch(content:string,start:number,end:number,context=35):ContentMatch {
  const left=Math.max(0,start-context),right=Math.min(content.length,end+context);
  // Render complete nearby lines so emphasis, links and list markers stay readable.
  // 使用完整相邻行保留强调、链接和列表等语法，不改变定位偏移。
  const previewStart=content.lastIndexOf('\n',left-1)+1;
  const nextLine=content.indexOf('\n',right);
  const previewEnd=nextLine<0?content.length:nextLine;
  return {start,end,match:content.slice(start,end),before:content.slice(Math.max(0,start-32),start),after:content.slice(end,end+32),
    preview:content.slice(previewStart,Math.min(previewEnd,previewStart+6000)),
    location:`第 ${offsetToPosition(content,start).line+1} 行`,
    text:(left?'…':'')+content.slice(left,right).replace(/\s+/g,' ')+(right<content.length?'…':'')};
}

// Keep source offsets; whitespace is collapsed only in the displayed excerpt.
// Cap matches per file: a common term in a long note must not create thousands of DOM rows.
// 每个文件的命中数设上限：常见词在长笔记里不能生成成千上万个 DOM 行。
export const MAX_CONTENT_MATCHES=20;
const MAX_CONTENT_CANDIDATES=200;
export function extractContentMatches(content:string,terms:string[],context=35):ContentMatch[] {
  const hits:ContentMatch[]=[];
  const seen=new Set<number>();
  const add=(found:Occurrence)=>{
    const start=found.index ?? 0, end=start+found[0].length;
    const bucket=Math.floor(start/Math.max(1,context*2));
    if(seen.has(bucket))return;
    seen.add(bucket);
    hits.push(createContentMatch(content,start,end,context));
  };
  const wanted=terms.map(term=>term.trim()).filter(Boolean);
  const phrase=wanted.length>1?wanted.join(' '):'';
  // 精确短语优先纳入候选，避免长文中大量单词命中把短语挤出候选上限。
  // Seed phrase hits first so a long note cannot crowd the phrase out of the candidate cap.
  if(phrase)for(const found of occurrences(content,phrase)) {
    add(found);
    if(hits.length>=MAX_CONTENT_CANDIDATES)break;
  }
  outer: for(const term of wanted)for(const found of occurrences(content,term)) {
    add(found);
    if(hits.length>=MAX_CONTENT_CANDIDATES)break outer;
  }
  return hits
    .map((hit,index)=>({hit,index,score:relevanceScore(hit.text,wanted)}))
    .sort((a,b)=>b.score-a.score||a.hit.start-b.hit.start||a.index-b.index)
    .slice(0,MAX_CONTENT_MATCHES)
    .map(entry=>entry.hit);
}

// Resolve against the current editor text: CRLF normalization and intervening edits
// must not send a click to a different occurrence of the same word.
export function resolveContentMatch(content:string,hit:ContentMatch,bounds={start:0,end:content.length}):{start:number;end:number}|null {
  const normalized=(value:string)=>value.replace(/\r\n?|\n/g,'\n');
  const before=normalized(hit.before),after=normalized(hit.after);
  // Resolve a literal snippet (may be an entire element) instead of compiling it as RegExp.
  // 定位匹配片段时使用字面搜索，避免把整段元素源码当正则编译。
  const exact=literalOccurrences(content,hit.match);
  const found=exact.length?exact:literalOccurrences(content,hit.match,true);
  const candidates=found.filter(found=>found.index>=bounds.start&&found.index+hit.match.length<=bounds.end).map(found=>{
    const start=found.index,end=start+hit.match.length;
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
