import {MARKDOWN_ELEMENTS,ALL_MARKDOWN_ELEMENTS,type MarkdownElementKind} from './markdown-elements.ts';
import {createContentMatch,MAX_CONTENT_MATCHES} from './content-matches.ts';
import type {ContentMatch} from '../types.ts';

const ELEMENTS=Object.fromEntries(MARKDOWN_ELEMENTS.map(element=>[element.id,element.label]));
type ElementKind=MarkdownElementKind;
export interface MarkdownElement {kind:ElementKind;start:number;end:number}
const aliases:Record<string,ElementKind>={标题:'heading',任务:'task',引用:'quote',代码:'code',高亮:'highlight',列表:'list',表格:'table',注释:'comment',粗体:'bold',斜体:'italic',删除线:'strike',公式:'math',脚注:'footnote'};
export function markdownQuery(query:string):{kind?:ElementKind;terms:string[]} {
  const prefix=query.match(/^([^:\s]+):\s*(.*)$/s);
  const key=prefix?.[1];
  const kind=key&&(key in ELEMENTS?key as ElementKind:aliases[key]);
  return {kind:kind||undefined,terms:(kind?prefix[2]:query).toLowerCase().split(/\s+/).filter(Boolean)};
}

/** Preserve source offsets and ignore frontmatter and fenced-code contents as Markdown.
 * 保留源码偏移；属性区和围栏代码内容不再识别成其它 Markdown 元素。 */
export function markdownElements(text:string):MarkdownElement[] {
  const result:MarkdownElement[]=[];
  const lines=[...text.matchAll(/[^\r\n]*(?:\r\n|\r|\n|$)/g)].filter(line=>line[0]);
  const add=(kind:ElementKind,start:number,end:number)=>{if(end>start)result.push({kind,start,end});};
  let frontmatter=/^---\s*(?:\r\n|\r|\n)/.test(text);
  let fence:{marker:string;length:number;start:number}|null=null;
  let commentStart:number|null=null;
  let mathStart:number|null=null;
  for(let index=0;index<lines.length;index++) {
    const row=lines[index],start=row.index,line=row[0].replace(/[\r\n]+$/,'');
    if(frontmatter) {if(index>0&&/^(---|\.\.\.)\s*$/.test(line))frontmatter=false;continue;}
    if(commentStart!==null) {
      const close=line.indexOf('%%');
      if(close>=0){add('comment',commentStart,start+close+2);commentStart=null;}
      continue;
    }
    if(fence) {
      const close=line.match(/^ {0,3}(`+|~+)\s*$/);
      if(close&&close[1][0]===fence.marker&&close[1].length>=fence.length){add('code',fence.start,start+line.length);fence=null;}
      continue;
    }
    if(mathStart!==null) {if(/^\s*\$\$\s*$/.test(line)){add('math',mathStart,start+line.length);mathStart=null;}continue;}
    if(/^\s*\$\$\s*$/.test(line)){mathStart=start;continue;}
    const opening=line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if(opening&&!(opening[1][0]==='`'&&opening[2].includes('`'))) {fence={marker:opening[1][0],length:opening[1].length,start};continue;}
    if(/^ {0,3}#{1,6}(?:\s|$)/.test(line))add('heading',start,start+line.length);
    else if(index+1<lines.length&&line.trim()&&/^ {0,3}(?:=+|-+)\s*$/.test(lines[index+1][0].trimEnd())) {add('heading',start,lines[index+1].index+lines[index+1][0].trimEnd().length);index++;}
    else if(/^\s*(?:[-+*]|\d+[.)])\s+\[[^\]]\](?:\s|$)/.test(line))add('task',start,start+line.length);
    else if(/^ {0,3}>\s*\[![^\]]+\]/.test(line))add('callout',start,start+line.length);
    else if(/^ {0,3}>/.test(line))add('quote',start,start+line.length);
    else if(/^ {0,3}(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/.test(line))add('rule',start,start+line.length);
    else if(/^\s*(?:[-+*]|\d+[.)])\s+/.test(line))add('list',start,start+line.length);
    else if(/^\[\^[^\]]+\]:/.test(line))add('footnote',start,start+line.length);
    if(line.includes('|')&&index+1<lines.length&&/^\s*\|?\s*:?-{3,}:?\s*\|/.test(lines[index+1][0])) {
      let last=index+1;
      while(last+1<lines.length&&lines[last+1][0].includes('|'))last++;
      add('table',start,lines[last].index+lines[last][0].trimEnd().length);
    }
    // Inline code is opaque to all other inline markers. / 行内代码对其它标记保持不透明。
    const masked=line.split('');
    const scan=(pattern:RegExp,kind:ElementKind)=>{
      for(const match of masked.join('').matchAll(pattern)) {
        const offset=match.index;
        let escapes=0;for(let i=offset-1;i>=0&&line[i]==='\\';i--)escapes++;
        if(escapes%2)continue;
        if(kind==='italic'&&offset>0&&/[\w*_]/.test(line[offset-1]))continue;
        add(kind,start+offset,start+offset+match[0].length);
        masked.fill(' ',offset,offset+match[0].length);
      }
    };
    scan(/(`+)(?!`)(.+?)\1(?!`)/g,'inlineCode');
    scan(/%%[\s\S]*?%%/g,'comment');
    const unclosed=masked.join('').indexOf('%%');
    if(unclosed>=0){commentStart=start+unclosed;masked.fill(' ',unclosed);}
    scan(/==(?=\S)(.+?\S|\S)==/g,'highlight');
    scan(/\*\*(?=\S)(.+?\S|\S)\*\*|__(?=\S)(.+?\S|\S)__/g,'bold');
    scan(/~~(?=\S)(.+?\S|\S)~~/g,'strike');
    scan(/\*(?=\S)([^*]*?\S|\S)\*(?!\*)|_(?=\S)([^_]*?\S|\S)_(?!\w)/g,'italic');
    scan(/\$\$[^$]+\$\$|\$(?!\s)[^$\r\n]+\$/g,'math');
  }
  if(fence)add('code',fence.start,text.length);
  if(commentStart!==null)add('comment',commentStart,text.length);
  return result.sort((a,b)=>a.start-b.start||a.end-b.end);
}

export function extractMarkdownMatches(text:string,query:string,context=35,allowed:readonly MarkdownElementKind[]=ALL_MARKDOWN_ELEMENTS):ContentMatch[] {
  const {kind,terms}=markdownQuery(query);
  return markdownElements(text).filter(element=>allowed.includes(element.kind)&&(!kind||kind===element.kind)&&terms.every(term=>text.slice(element.start,element.end).toLowerCase().includes(term)))
    .slice(0,MAX_CONTENT_MATCHES).map(element=>{
      const hit=createContentMatch(text,element.start,element.end,context);
      hit.location=`${ELEMENTS[element.kind]} · ${hit.location}`;
      const raw=text.slice(element.start,element.end);
      const lines=raw.split(/\r\n|\r|\n/);
      const heading=element.kind==='heading'?(raw.match(/^ {0,3}(#{1,6})(?:\s|$)/)?.[1].length||(lines.at(-1).trim().startsWith('=')?1:2)):undefined;
      let display=raw.trim();
      if(heading)display=lines[0].replace(/^ {0,3}#{1,6}\s*/,'').replace(/\s+#+\s*$/,'').trim();
      else if(element.kind==='comment')display=display.slice(2,display.endsWith('%%')?-2:undefined);
      else if(['bold','highlight','strike'].includes(element.kind))display=display.slice(2,-2);
      else if(element.kind==='italic')display=display.slice(1,-1);
      else if(element.kind==='inlineCode')display=display.replace(/^\x60+|\x60+$/g,'');
      else if(element.kind==='task')display=display.replace(/^\s*(?:[-+*]|\d+[.)])\s+\[[^\]]\]\s*/,'');
      else if(element.kind==='quote')display=display.replace(/^ {0,3}>\s?/,'');
      else if(element.kind==='list')display=display.replace(/^\s*(?:[-+*]|\d+[.)])\s+/,'');
      else if(element.kind==='code')display=lines.slice(1,/^ {0,3}(?:\x60{3,}|~{3,})\s*$/.test(lines.at(-1))?-1:undefined).join(' ');
      hit.markdown={kind:element.kind,line:text.slice(0,element.start).split(/\r\n|\r|\n/).length,...(heading?{level:heading}:{}),text:display.replace(/\s+/g,' ').trim()};
      return hit;
    });
}
