import type {App} from 'obsidian';
import type RadarSearchPlugin from '../main.ts';
import type {FuzzyFn} from '../ui/search-bar-host.ts';
import type {SearchItem} from '../types.ts';
import {externalLinks} from './external-links.ts';

/** Link results are the links themselves; the source note is only context.
 *  链接结果即链接本身，来源笔记只作上下文。 */
const MAX_LINK_ITEMS=5;

interface LinkItemHost {
  app:App;
  plugin:RadarSearchPlugin;
  presentation:'floating'|'page';
  _log(level:'log'|'warn'|'error',...args:unknown[]):void;
  _openUrl(url:string):void;
}

function matches(text:string,terms:string[],fuzzy:FuzzyFn|null):boolean {
  return fuzzy?!!fuzzy(text):terms.every(term=>text.toLowerCase().includes(term));
}

function openInternalLink(host:LinkItemHost,target:string,sourcePath:string):void {
  host.plugin.floatingSearch?.close();
  void host.app.workspace.openLinkText(target,sourcePath,host.presentation==='page').catch(error=>host._log('error','打开内链失败',error));
}

function openExternalLink(host:LinkItemHost,url:string):void {
  host.plugin.floatingSearch?.close();
  host._openUrl(url);
}

/** Wikilink occurrences, deduplicated by resolved target. / 内链出现位置，按解析目标去重。 */
export function buildWikiLinkResultItems(host:LinkItemHost,terms:string[],fuzzy:FuzzyFn|null,isExcluded:(path:string)=>boolean):SearchItem[] {
  const items:SearchItem[]=[];
  const seen=new Set<string>();
  try {
    for(const file of host.app.vault.getMarkdownFiles()) {
      if(isExcluded(file.path))continue;
      const links=host.app.metadataCache.getFileCache(file)?.links??[];
      for(const link of links) {
        const target=link.link;
        if(!target||!matches(`${target} ${link.displayText??''}`,terms,fuzzy))continue;
        const resolved=host.app.metadataCache.getFirstLinkpathDest(target.split('#')[0],file.path);
        const key=resolved?.path??`${file.path}\u0000${target.split('#')[0]}`;
        if(seen.has(key))continue;
        seen.add(key);
        items.push({label:link.displayText||target,sub:file.path,twoLine:true,icon:'link',action:()=>openInternalLink(host,target,file.path)});
        if(items.length>=MAX_LINK_ITEMS)return items;
      }
    }
  } catch(error) {host._log('warn','[SearchBar] 内链搜索失败:',error);}
  return items;
}

/** External URLs, deduplicated across notes. / 外链 URL，跨笔记去重。 */
export async function buildExternalLinkResultItems(host:LinkItemHost,terms:string[],fuzzy:FuzzyFn|null,isExcluded:(path:string)=>boolean,isStale:()=>boolean):Promise<SearchItem[]> {
  const items:SearchItem[]=[];
  const seen=new Set<string>();
  for(const file of host.app.vault.getMarkdownFiles()) {
    if(isStale())return [];
    if(isExcluded(file.path))continue;
    try {
      const text=await host.app.vault.cachedRead(file);
      if(isStale())return [];
      for(const url of externalLinks(text)) {
        if(seen.has(url)||!matches(url,terms,fuzzy))continue;
        seen.add(url);
        items.push({label:url,sub:file.path,twoLine:true,icon:'external-link',action:()=>openExternalLink(host,url)});
        if(items.length>=MAX_LINK_ITEMS)return items;
      }
    } catch(error) {host._log('warn',`[SearchBar] 外链读取失败 (${file.path}):`,error);}
  }
  return items;
}
