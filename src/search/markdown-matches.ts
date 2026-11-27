import {inlineMarkdownLinks,referenceDefinitions,type MarkdownLink} from './markdown-links.ts';
import {MARKDOWN_ELEMENTS,ALL_MARKDOWN_ELEMENTS,type MarkdownElementKind} from './markdown-elements.ts';
import {createContentMatch,MAX_CONTENT_MATCHES} from './content-matches.ts';
import type {ContentMatch} from '../types.ts';

const ELEMENTS=Object.fromEntries(MARKDOWN_ELEMENTS.map(element=>[element.id,element.label]));
type ElementKind=MarkdownElementKind;
export interface MarkdownElement {kind:ElementKind;start:number;end:number;link?:MarkdownLink}
const aliases:Record<string,ElementKind>={标题:'heading',任务:'task',引用:'quote',代码:'code',高亮:'highlight',列表:'list',表格:'table',注释:'comment',粗体:'bold',斜体:'italic',删除线:'strike',公式:'math',脚注:'footnote',内链:'internalLink',外链:'externalLink',标签:'tag',代码块:'code'};
export function markdownQuery(query:string):{kind?:ElementKind;terms:string[]} {
  query=query.replace(/\blang(?:uage)?:([^\s]+)/i,'code: $1');
  const prefix=query.match(/^([^:\s]+):\s*(.*)$/s);
  const key=prefix?.[1];
  const kind=key&&(MARKDOWN_ELEMENTS.find(element=>element.id.toLowerCase()===key.toLowerCase())?.id||aliases[key]);
  return {kind:kind||undefined,terms:(kind?prefix[2]:query).toLowerCase().split(/\s+/).filter(Boolean)};
}

/** Preserve source offsets and ignore frontmatter and fenced-code contents as Markdown.
 * 保留源码偏移；属性区和围栏代码内容不再识别成其它 Markdown 元素。 */
export function markdownElements(text:string):MarkdownElement[] {
  const result:MarkdownElement[]=[];
  const references=referenceDefinitions(text);
  const lines=[...text.matchAll(/[^\r\n]*(?:\r\n|\r|\n|$)/g)].filter(line=>line[0]);
  const add=(kind:ElementKind,start:number,end:number)=>{if(end>start)result.push({kind,start,end});};
  let frontmatter=/^---\s*(?:\r\n|\r|\n)/.test(text);
  let fence:{marker:string;length:number;start:number}|null=null;
  let commentStart:{start:number;close:string}|null=null;
  let calloutEnd=0;
  let mathStart:number|null=null;
  for(let index=0;index<lines.length;index++) {
    const row=lines[index],start=row.index,line=row[0].replace(/[\r\n]+$/,'');
    if(frontmatter) {if(index>0&&/^(---|\.\.\.)\s*$/.test(line))frontmatter=false;continue;}
    if(commentStart!==null) {
      const close=line.indexOf(commentStart.close);
      if(close>=0){add('comment',commentStart.start,start+close+commentStart.close.length);commentStart=null;}
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
    else if(/^ {0,3}>\s*\[![^\]]+\]/.test(line)) {
      let last=index;
      while(last+1<lines.length&&/^ {0,3}>/.test(lines[last+1][0])&&!/^ {0,3}>\s*\[![^\]]+\]/.test(lines[last+1][0]))last++;
      calloutEnd=lines[last].index+lines[last][0].trimEnd().length;
      add('callout',start,calloutEnd);
    }
    else if(/^ {0,3}>/.test(line)&&start>=calloutEnd)add('quote',start,start+line.length);
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
    scan(/<!--[\s\S]*?-->/g,'comment');
    const remaining=masked.join(''),markers=[{open:'%%',close:'%%'},{open:'<!--',close:'-->'}].map(marker=>({...marker,index:remaining.indexOf(marker.open)})).filter(marker=>marker.index>=0).sort((a,b)=>a.index-b.index);
    const unclosed=markers[0];
    if(unclosed){commentStart={start:start+unclosed.index,close:unclosed.close};masked.fill(' ',unclosed.index);}
    for(const link of inlineMarkdownLinks(masked.join(''),references)){
      result.push({kind:link.external?'externalLink':'internalLink',start:start+link.start,end:start+link.end,link});masked.fill(' ',link.start,link.end);
    }
    scan(/(?:^|\s)#[\p{L}\p{N}_/-]+/gu,'tag');
    scan(/==(?=\S)(.+?\S|\S)==/g,'highlight');
    scan(/\*\*(?=\S)(.+?\S|\S)\*\*|__(?=\S)(.+?\S|\S)__/g,'bold');
    scan(/~~(?=\S)(.+?\S|\S)~~/g,'strike');
    scan(/\*(?=\S)([^*]*?\S|\S)\*(?!\*)|_(?=\S)([^_]*?\S|\S)_(?!\w)/g,'italic');
    scan(/\$\$[^$]+\$\$|\$(?!\s)[^$\r\n]+\$/g,'math');
  }
  if(fence)add('code',fence.start,text.length);
  if(commentStart!==null)add('comment',commentStart.start,text.length);
  return result.sort((a,b)=>a.start-b.start||a.end-b.end);
}

export function extractMarkdownMatches(text:string,query:string,context=35,allowed:readonly MarkdownElementKind[]=ALL_MARKDOWN_ELEMENTS):ContentMatch[] {
  const {kind,terms}=markdownQuery(query);
  return markdownElements(text).filter(element=>allowed.includes(element.kind)&&(!kind||kind===element.kind)&&terms.every(term=>(text.slice(element.start,element.end)+(element.link?.target||'')).toLowerCase().includes(term)))
    .slice(0,MAX_CONTENT_MATCHES).map(element=>{
      const hit=createContentMatch(text,element.start,element.end,context);
      hit.location=`${ELEMENTS[element.kind]} · ${hit.location}`;
      const raw=text.slice(element.start,element.end);
      const lines=raw.split(/\r\n|\r|\n/);
      const heading=element.kind==='heading'?(raw.match(/^ {0,3}(#{1,6})(?:\s|$)/)?.[1].length||(lines.at(-1).trim().startsWith('=')?1:2)):undefined;
      let display=raw.trim();
      if(heading)display=lines[0].replace(/^ {0,3}#{1,6}\s*/,'').replace(/\s+#+\s*$/,'').trim();
      else if(element.kind==='comment')display=display.startsWith('<!--')?display.slice(4,display.endsWith('-->')?-3:undefined):display.slice(2,display.endsWith('%%')?-2:undefined);
      else if(['bold','highlight','strike'].includes(element.kind))display=display.slice(2,-2);
      else if(element.kind==='italic')display=display.slice(1,-1);
      else if(element.kind==='inlineCode')display=display.replace(/^\x60+|\x60+$/g,'');
      else if(element.kind==='task')display=display.replace(/^\s*(?:[-+*]|\d+[.)])\s+\[[^\]]\]\s*/,'');
      else if(element.kind==='quote')display=display.replace(/^ {0,3}>\s?/,'');
      else if(element.kind==='list')display=display.replace(/^\s*(?:[-+*]|\d+[.)])\s+/,'');
      else if(element.kind==='code')display=lines.slice(1,/^ {0,3}(?:\x60{3,}|~{3,})\s*$/.test(lines.at(-1))?-1:undefined).join(' ');
      const language=element.kind==='code'?lines[0].replace(/^ {0,3}(?:`{3,}|~{3,})/,'').trim().split(/\s+/)[0]:undefined;
      const callout=element.kind==='callout'?raw.match(/\[!([^\]]+)\]/)?.[1]:undefined;
      const footnote=element.kind==='footnote'?raw.match(/^\[\^([^\]]+)\]:/)?.[1]:undefined;
      const link=element.link?{target:element.link.target,label:element.link.label,external:element.link.external}:undefined;
      hit.markdown={kind:element.kind,line:text.slice(0,element.start).split(/\r\n|\r|\n/).length,...(heading?{level:heading}:{}),source:element.link?.source||raw,language,callout,footnote,link,text:display.replace(/\s+/g,' ').trim()};
      return hit;
    });
}
