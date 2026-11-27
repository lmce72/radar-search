import {RESULT_CATEGORIES} from '../search/result-categories.ts';
import {ALL_MARKDOWN_ELEMENTS,isMarkdownElementKind} from '../search/markdown-elements.ts';
import {compilePathRule,validatePathFilter} from '../search/path-filter.ts';
import type {SearchSettings} from '../types.ts';
import {toText} from '../shared/text.ts';
import {normalizeExtension} from '../history/recent-types.ts';
export const DEFAULT_SETTINGS: SearchSettings = {
  excludePaths: [], defaultMode: 'vault', placeholderType: 'unified', placeholder: '',
  placeholder_global: '', placeholder_vault: '', placeholder_web: '',
  browserTarget: 'external', historyRetentionMode: 'forever', historyRetentionDays: 30,
  sourceOrder:RESULT_CATEGORIES.map(category=>category.id),recentFileTypes:[],recentTypeFilter:[],warnUnknownFileType:true,fileTypeHandlers:{},tagResultMode:'tags',defaultMarkdownResultMode:'documents',attachmentFileTypes:[],
  recentFilesEnabled: false, recentFilesDays: 1, recentFilesLimit: 50, newTabSearch: true, defaultRecordView: 'recent', searchMarkdown: false, markdownElementTypes:[...ALL_MARKDOWN_ELEMENTS],
  historyPageSize: 8, dropdownPageSize: 10, searchSheetBreakpoint: 768,
  vaultContentSearch: true, vaultContentSearchMaxResults: 10,
  searchWikiLinks: false, searchMdLinks: false, searchBookmarks: false, searchTags: true,
  searchCommands: true, searchNonMarkdown: false, searchProperties: false, extendedContext: true,defaultExpandContent:true,
  vaultSortMode: 'relevance', limitContentResults: false, searchPresets: [], defaultPreset: '',
  activeEngineId: null, webSources: [
    {label:'GitHub',domain:'github.com'}, {label:'Reddit',domain:'reddit.com'},
    {label:'StackOverflow',domain:'stackoverflow.com'}, {label:'Scholar',domain:'scholar.google.com'},
    {label:'YouTube',domain:'youtube.com'}, {label:'Hacker News',domain:'news.ycombinator.com'}
  ],
  engines: [
    {id:'google',name:'Google',url:'https://www.google.com/search?q={q}',suggest:'https://suggestqueries.google.com/complete/search?client=firefox&q={q}',enabled:true},
    {id:'bing',name:'Bing',url:'https://www.bing.com/search?q={q}',suggest:'https://api.bing.com/qsonhs.aspx?q={q}',enabled:true},
    {id:'yahoo',name:'Yahoo',url:'https://search.yahoo.com/search?p={q}',suggest:'',enabled:false},
    {id:'duckduckgo',name:'DuckDuckGo',url:'https://duckduckgo.com/?q={q}',suggest:'https://duckduckgo.com/ac/?q={q}&type=list',enabled:false},
    {id:'perplexity',name:'Perplexity AI',url:'https://www.perplexity.ai/search?q={q}',suggest:'',enabled:false}
  ],
  searchIndex: {enabled:true,content:true,bigrams:true,debug:false}, debug:false
};

export const CHOICES = {
  defaultMode: {vault:'Vault 内搜索',global:'全局搜索',web:'互联网搜索'},
  placeholderType: {unified:'统一占位文本',custom:'按搜索模式设置'},
  browserTarget: {external:'外部浏览器',internal:'Obsidian 标签页','internal-window':'Obsidian 独立窗口'},
  historyRetentionMode: {forever:'永久',custom:'指定天数',disabled:'不记录'},
  tagResultMode:{tags:'先列出标签，再显示关联文档',documents:'直接列出文档'},
  defaultMarkdownResultMode:{documents:'按文档',elements:'针对元素'},
  defaultRecordView: {recent:'最近打开',history:'搜索历史'},
  vaultSortMode: {relevance:'相关度（高→低）','mtime-desc':'修改时间：新→旧','mtime-asc':'修改时间：旧→新','ctime-desc':'创建时间：新→旧','ctime-asc':'创建时间：旧→新','alpha-asc':'名称：A→Z','alpha-desc':'名称：Z→A'}
};

function http(value: string): boolean { try { return ['https:','http:'].includes(new URL(value.replaceAll('{q}','test')).protocol); } catch { return false; } }
export function validateSetting(key: string, value: unknown): unknown {
  if (!(key in DEFAULT_SETTINGS)) throw new Error(`未知设置：${key}`);
  const choices = (CHOICES as Record<string, Record<string, string>>)[key];
  if (choices && !(toText(value) in choices)) throw new Error('请选择有效选项');
  const fallback = DEFAULT_SETTINGS[key as keyof SearchSettings];
  if (typeof fallback === 'boolean' && typeof value !== 'boolean') throw new Error('需要布尔值');
  const minimum=key==='recentFilesDays'||key==='recentFilesLimit'?0:1;
  if (typeof fallback === 'number' && (typeof value !== 'number' || !Number.isInteger(value) || value < minimum || value > 100000)) throw new Error(`请输入 ${minimum}–100000 的整数`);
  if (typeof fallback === 'string' && typeof value !== 'string') throw new Error('需要文本');
  if (Array.isArray(fallback) && !Array.isArray(value)) throw new Error('需要 JSON 数组');
  if(key==='sourceOrder'&&(!Array.isArray(value)||!value.every(id=>RESULT_CATEGORIES.some(category=>category.id===id))||new Set(value).size!==value.length))throw new Error('无效的搜索种类顺序');
  if(['recentFileTypes','recentTypeFilter'].includes(key)&&(!Array.isArray(value)||!value.every(item=>typeof item==='string'&&/^[a-z0-9._-]+$/i.test(item))))throw new Error('文件类型需要有效后缀');
  if(key==='fileTypeHandlers'&&(!value||typeof value!=='object'||Array.isArray(value)||!Object.entries(value).every(([ext,handler])=>/^[a-z0-9._-]+$/i.test(ext)&&typeof handler==='string')))throw new Error('文件处理方式需要后缀与视图类型');
  if(key==='markdownElementTypes'&&(!Array.isArray(value)||!value.every(isMarkdownElementKind)||new Set(value).size!==value.length))throw new Error('请选择有效且不重复的 Markdown 元素类型');
  if(key==='attachmentFileTypes'){
    if(!Array.isArray(value))throw Error('后缀标签需要数组');
    const seen=new Set<string>();
    for(const entry of value as unknown[]){
      if(!entry||typeof entry!=='object'||!('extension' in entry)||typeof entry.extension!=='string'||!('selected' in entry)||typeof entry.selected!=='boolean')throw Error('后缀标签需要后缀和选中状态');
      const extension=normalizeExtension(entry.extension);if(extension!==entry.extension||seen.has(extension))throw Error('后缀标签需要唯一的小写后缀');seen.add(extension);
    }
  }
  if (key==='excludePaths' && !(value as unknown[]).every(item=>typeof item==='string')) throw new Error('每项必须是文本');
  if(key==='excludePaths')(value as string[]).forEach(compilePathRule);
  if(key==='searchPresets')(value as Array<Record<string, unknown>>).forEach(p=>validatePathFilter({mode:p.mode as '白名单' | '黑名单',paths:p.excludeFolders as string[]}));
  if (key==='engines') {
    const ids = new Set<string>();
    for (const item of value as Array<Record<string, unknown>>) {
      if (!item || typeof item.id!=='string' || !item.id || ids.has(item.id) || typeof item.name!=='string' || !item.name || typeof item.url!=='string' || !http(item.url) || !item.url.includes('{q}') || typeof item.suggest!=='string' || (item.suggest && (!http(item.suggest) || !item.suggest.includes('{q}'))) || typeof item.enabled!=='boolean') throw new Error('引擎需要唯一 id、name、含 {q} 的 HTTP(S) url、suggest 和 enabled');
      ids.add(item.id);
    }
  }
  if (key==='searchPresets' && !(value as Array<Record<string, unknown>>).every(item=>item && typeof item.name==='string' && item.name && ['白名单','黑名单'].includes(toText(item.mode)) && Array.isArray(item.excludeFolders) && (item.excludeFolders as unknown[]).every(path=>typeof path==='string') && (item.icon===undefined || typeof item.icon==='string'))) throw new Error('预设需要 name、mode（白名单/黑名单）、excludeFolders 数组及可选 Lucide icon');
  if (key==='webSources' && !(value as Array<Record<string, unknown>>).every(item=>item && typeof item.label==='string' && item.label && typeof item.domain==='string' && /^[a-z0-9.-]+(?::\d+)?(?:\/[^\s]*)?$/i.test(item.domain))) throw new Error('信息源需要 label 和不含协议的 domain');
  if (key==='activeEngineId' && value!==null && typeof value!=='string') throw new Error('引擎 ID 必须是文本或 null');
  if (key==='searchIndex') {
    if (!value || typeof value!=='object' || Array.isArray(value) || !Object.values(value as Record<string, unknown>).every(item=>typeof item==='boolean')) throw new Error('需要布尔值组成的 JSON 对象');
    if (Object.keys(value).some(option=>!['enabled','content','bigrams','debug'].includes(option))) throw new Error('未知索引选项');
  }
  return structuredClone(value);
}

export function normalizeSettings(input: unknown, onInvalid: (key:string,error:Error)=>void = () => {}): SearchSettings {
  const result=structuredClone(DEFAULT_SETTINGS);
  const source = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  for (const key of Object.keys(DEFAULT_SETTINGS) as Array<keyof SearchSettings>) {
    if (source[key] === undefined) continue;
    try { const value=key==='markdownElementTypes'&&Array.isArray(source[key])?source[key].filter(type=>type!=='rule'):source[key];(result as unknown as Record<string, unknown>)[key]=validateSetting(key,value); } catch (error) { onInvalid(key,error as Error); }
  }
  if(source.searchWikiLinks===true||source.searchMdLinks===true){
    result.searchMarkdown=true;
    if(source.searchWikiLinks===true&&!result.markdownElementTypes.includes('internalLink'))result.markdownElementTypes.push('internalLink');
    if(source.searchMdLinks===true&&!result.markdownElementTypes.includes('externalLink'))result.markdownElementTypes.push('externalLink');
    result.searchWikiLinks=false;result.searchMdLinks=false;
  }
  result.sourceOrder=[...result.sourceOrder,...RESULT_CATEGORIES.map(category=>category.id).filter(id=>!result.sourceOrder.includes(id))];
  result.searchIndex={...DEFAULT_SETTINGS.searchIndex,...result.searchIndex};
  return result;
}
