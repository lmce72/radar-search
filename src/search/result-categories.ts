import type {ResultCategory,SearchSettings,SearchMode} from '../types.ts';
export const RESULT_CATEGORIES: {id:ResultCategory;label:string;icon:string;titles:string[]}[]=[
  {id:'files',label:'文件',icon:'files',titles:['Vault 文件']},
  {id:'content',label:'内容',icon:'file-search',titles:['内容匹配']},
  {id:'tags',label:'标签',icon:'tag',titles:['标签匹配']},
  {id:'wikiLinks',label:'内链',icon:'brackets',titles:['内链匹配']},
  {id:'mdLinks',label:'外链',icon:'external-link',titles:['外链匹配']},
  {id:'bookmarks',label:'书签',icon:'bookmark',titles:['书签匹配']},
  {id:'properties',label:'属性',icon:'braces',titles:['属性匹配']},
  {id:'commands',label:'命令',icon:'command',titles:['命令匹配']},
  {id:'web',label:'互联网',icon:'globe',titles:[]}
];
export function availableCategories(settings:SearchSettings,mode:SearchMode,query:string) {
  if(mode==='web')return [];
  const enabled:Record<ResultCategory,boolean>={files:true,content:settings.vaultContentSearch,tags:settings.searchTags||query.startsWith('#'),
    wikiLinks:settings.searchWikiLinks,mdLinks:settings.searchMdLinks,bookmarks:settings.searchBookmarks,properties:settings.searchProperties,
    commands:settings.searchCommands,web:mode==='global'&&settings.engines.some(e=>e.enabled)};
  return RESULT_CATEGORIES.filter(c=>enabled[c.id]);
}
export function filterResultGroups<T extends {title?:string}>(groups:T[],category:ResultCategory):T[] {
  const titles=RESULT_CATEGORIES.find(c=>c.id===category)?.titles||[];
  if(category==='web')return groups.filter(g=>g.title&&!RESULT_CATEGORIES.some(c=>c.titles.includes(g.title)));
  return groups.filter(g=>titles.includes(g.title));
}
export function resultCategoryStates(settings:SearchSettings,mode:SearchMode,query:string,groups:{title?:string;items:unknown[]}[],selected:ResultCategory) {
  const categories=availableCategories(settings,mode,query).map(category=>{
    const count=filterResultGroups(groups,category.id).reduce((n,group)=>n+group.items.length,0);
    return {...category,count,disabled:count===0};
  });
  const active=categories.find(category=>category.id===selected&&!category.disabled)||categories.find(category=>!category.disabled);
  return categories.map(category=>({...category,selected:category===active}));
}
