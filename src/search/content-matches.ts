import type {ContentMatch} from '../types.ts';
import {relevanceScore} from './proximity.ts';

type Occurrence={0:string;index:number};
function* literalOccurrences(content:string,term:string,ignoreCase=false):Generator<Occurrence,void,unknown> {
  if(!term)return;
  const hay=ignoreCase?content.toLowerCase():content;
  const needle=ignoreCase?term.toLowerCase():term;
  let from=0;
  while(from<=hay.length){
    const index=hay.indexOf(needle,from);
    if(index<0)break;
    yield {0:term,index};
    from=index+Math.max(1,term.length);
  }
}
export function* literalSearchOccurrences(content:string, term:string):Generator<Occurrence,void,unknown> {
  if(!term)return;
  try {
    const pattern=term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const regex=new RegExp(pattern,'giu');let found:RegExpExecArray|null;
    while((found=regex.exec(content)))yield {0:found[0],index:found.index};
  } catch {
    // Arbitrary user text with invalid Unicode/escapes must still be searchable.
    // 用户文本可能包含无效转义或超大片段，回退到字面匹配。
    yield* literalOccurrences(content,term,true);
  }
}

/** Normalize newline spellings for matching, then map offsets back to raw text.
 * 匹配时统一换行形式，返回时仍保留原文偏移，供多行元素与历史跳转使用。 */
function* newlineOccurrences(content:string,term:string):Generator<Occurrence,void,unknown> {
  const removed:number[]=[];let count=0;
  const normalized=content.replace(/\r\n?/g,(newline:string,index:number)=>{if(newline.length===2){removed.push(index-count);count++;}return '\n';});
  const needle=term.replace(/\r\n?/g,'\n');
  const rawOffset=(offset:number)=>{
    let lo=0,hi=removed.length;
    while(lo<hi){const mid=(lo+hi)>>>1;if(removed[mid]<offset)lo=mid+1;else hi=mid;}
    return offset+lo;
  };
  const mapped=(found:Occurrence):Occurrence=>{
    const start=rawOffset(found.index),end=rawOffset(found.index+found[0].length);
    return {0:content.slice(start,end),index:start};
  };
  let exact=false;
  for(const found of literalOccurrences(normalized,needle)){exact=true;yield mapped(found);}
  if(!exact)for(const found of literalSearchOccurrences(normalized,needle))yield mapped(found);
}

// 内容与标签共享原文偏移、上下文和行号。 / Share source offsets, context and line numbers.
export function createContentMatch(content:string,start:number,end:number,context=35,focus=start):ContentMatch {
  // Small excerpts must not pin a multi-megabyte parent string. / 小摘要不能引用并滞留整篇大文档。
  const copy=(value:string)=>value.length<=6000?value.split('').join(''):value;
  // Keep the full element span, but retain only a small literal anchor for giant blocks.
  // 保留元素完整跨度；超大块仅驻留关键词附近的有限字面锚点。
  const anchorStart=end-start>6000?Math.max(start,Math.min(end-2048,focus-256)):start;
  const anchorEnd=end-start>6000?Math.min(end,anchorStart+2048):end;
  const anchor=anchorStart!==start||anchorEnd!==end?{start:anchorStart,end:anchorEnd}:undefined;
  const left=Math.max(0,anchorStart-context),right=Math.min(content.length,anchorEnd+context);
  // Render complete nearby lines so emphasis, links and list markers stay readable.
  // 使用完整相邻行保留强调、链接和列表等语法，不改变定位偏移。
  const previewStart=Math.max(content.lastIndexOf('\n',left-1)+1,left-2000);
  const previewLimit=Math.min(content.length,previewStart+6000);
  const nextLine=content.slice(right,previewLimit).indexOf('\n');
  const previewEnd=nextLine<0?previewLimit:right+nextLine;
  return {start,end,...(anchor?{anchor}:{}),match:copy(content.slice(anchorStart,anchorEnd)),before:copy(content.slice(Math.max(0,anchorStart-32),anchorStart)),after:copy(content.slice(anchorEnd,anchorEnd+32)),
    preview:copy(content.slice(previewStart,Math.min(previewEnd,previewStart+6000))),
    location:`第 ${offsetToPosition(content,anchorStart).line+1} 行`,
    text:(left?'…':'')+copy(content.slice(left,right).replace(/\s+/g,' '))+(right<content.length?'…':'')};
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
  if(phrase)for(const found of literalSearchOccurrences(content,phrase)) {
    add(found);
    if(hits.length>=MAX_CONTENT_CANDIDATES)break;
  }
  outer: for(const term of wanted)for(const found of literalSearchOccurrences(content,term)) {
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
  const expectedStart=hit.anchor?.start??hit.start,expectedEnd=hit.anchor?.end??hit.end;
  // Resolve a literal snippet (may be an entire element) instead of compiling it as RegExp.
  // 定位匹配片段时使用字面搜索，避免把整段元素源码当正则编译。
  if(expectedStart>=bounds.start&&expectedEnd<=bounds.end&&content.slice(expectedStart,expectedEnd)===hit.match&&
    normalized(content.slice(Math.max(0,expectedStart-hit.before.length),expectedStart))===before&&normalized(content.slice(expectedEnd,expectedEnd+hit.after.length))===after)return {start:expectedStart,end:expectedEnd};
  function* candidates():Generator<Occurrence,void,unknown>{
    const exact=literalOccurrences(content,hit.match),first=exact.next();
    if(first.done===false){yield first.value;yield* exact;}
    else yield* (/[\r\n]/.test(hit.match)?newlineOccurrences(content,hit.match):literalSearchOccurrences(content,hit.match));
  }
  let best:{start:number;end:number;context:number;distance:number}|null=null;
  for(const occurrence of candidates()){
    const start=occurrence.index,end=start+occurrence[0].length;
    if(start<bounds.start||end>bounds.end)continue;
    const left=normalized(content.slice(Math.max(0,start-hit.before.length-32),start));
    const right=normalized(content.slice(end,end+hit.after.length+32));let context=0;
    for(let i=1;i<=Math.min(before.length,left.length)&&before.at(-i)===left.at(-i);i++)context++;
    for(let i=0;i<Math.min(after.length,right.length)&&after[i]===right[i];i++)context++;
    const candidate={start,end,context,distance:Math.abs(start-expectedStart)};
    if(context===before.length+after.length&&candidate.distance===0)return {start,end};
    if(!best||context>best.context||context===best.context&&candidate.distance<best.distance)best=candidate;
  }
  return best?{start:best.start,end:best.end}:null;
}

export function offsetToPosition(content:string,offset:number) {
  const lines=content.slice(0,Math.max(0,Math.min(offset,content.length))).split(/\r\n|\r|\n/);
  return {line:lines.length-1,ch:lines.at(-1).length};
}
