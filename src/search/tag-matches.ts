import type {CachedMetadata,FrontMatterInfo} from 'obsidian';
import type {ContentMatch} from '../types.ts';
import {createContentMatch,resolveContentMatch} from './content-matches.ts';

type TagField='tags'|'tag';
export interface TagEntry {value:string;field?:TagField;start?:number;end?:number}

export function tagQueryTerms(query:string):string[] {
  return query.trim().replace(/^#/,'').toLowerCase().split(/\s+/).filter(Boolean);
}

// 元数据决定标签是否存在；原文仅用于定位，避免把代码或普通文本当成标签。
// Metadata determines tag membership; source text is used only to locate real tags.
export function matchingTagEntries(cache:CachedMetadata|null,terms:string[]):TagEntry[] {
  const entries:TagEntry[]=[];
  const matches=(value:string)=>terms.every(term=>value.toLowerCase().replace(/^#/,'').includes(term));
  for(const field of ['tags','tag'] as const) {
    const raw:unknown=cache?.frontmatter?.[field];
    const values:unknown[]=Array.isArray(raw)?raw:[raw];
    for(const value of values)if(typeof value==='string'&&value.trim()&&matches(value))entries.push({value,field});
  }
  for(const tag of cache?.tags||[])if(matches(tag.tag))entries.push({value:tag.tag,start:tag.position.start.offset,end:tag.position.end.offset});
  return entries;
}

// 找到顶层属性的完整范围，包含缩进数组和无缩进列表；不扫描其它 YAML 属性。
// Locate the whole root property, including indented and indentless lists, excluding other fields.
function fieldRange(content:string,info:FrontMatterInfo,field:TagField) {
  if(!info.exists)return null;
  const yaml=content.slice(info.from,info.to);
  const keys=[...yaml.matchAll(/^([ \t]*)("[^"\r\n]+"|'[^'\r\n]+'|[^\s#:'"[\]{},-][^:\r\n]*?):/gm)];
  const indent=Math.min(...keys.map(key=>key[1].length));
  const roots=keys.filter(key=>key[1].length===indent);
  const index=roots.findIndex(key=>key[2].replace(/^['"]|['"]$/g,'').trim()===field);
  if(index<0)return null;
  const key=roots[index];
  return {start:info.from+key.index,end:index+1<roots.length?info.from+roots[index+1].index:info.to,keyEnd:info.from+key.index+key[0].length};
}

export function extractTagMatches(content:string,entries:TagEntry[],info:FrontMatterInfo,context=35):ContentMatch[] {
  const hits:ContentMatch[]=[];
  const seen=new Set<string>();
  for(const entry of entries) {
    let start=entry.start,end=entry.end;
    if(entry.field) {
      const range=fieldRange(content,info,entry.field);
      if(!range)continue;
      const value=entry.value.replace(/^#/,'');
      const at=content.toLowerCase().indexOf(value.toLowerCase(),range.keyEnd);
      // YAML 转义或锚点没有原样值时，定位对应属性键。 / Escapes and aliases fall back to the property key.
      start=at>=0&&at+value.length<=range.end?at:range.start;
      end=start===at?at+value.length:range.keyEnd;
    }
    if(start===undefined||end===undefined||start<0||end<=start||end>content.length)continue;
    const key=`${entry.field||'body'}:${start}:${end}:${entry.value}`;
    if(seen.has(key))continue;
    seen.add(key);
    const hit=createContentMatch(content,start,end,context);
    hit.tag={value:entry.value,field:entry.field};
    hit.location=`${entry.field?`属性 ${entry.field}`:'正文标签'} · ${hit.location}`;
    hit.text=`#${entry.value.replace(/^#/,'')} · ${hit.text}`;
    hits.push(hit);
  }
  return hits;
}

// 跳转时重算属性范围，避免编辑后定位到正文中的同名标签或其它属性。
// Recompute bounds on navigation so edits cannot redirect YAML hits to a different field or the body.
export function resolveTagMatch(content:string,hit:ContentMatch,info:FrontMatterInfo) {
  if(!hit.tag)return resolveContentMatch(content,hit);
  const bounds=hit.tag.field?fieldRange(content,info,hit.tag.field):{start:info.contentStart,end:content.length};
  return bounds?resolveContentMatch(content,hit,bounds):null;
}
