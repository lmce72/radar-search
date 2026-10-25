import type {SortMode} from '../types.ts';
export const SORT_OPTIONS:Record<SortMode,string>={relevance:'相关度','mtime-desc':'最近编辑','mtime-asc':'最早编辑','alpha-asc':'名称 A→Z','alpha-desc':'名称 Z→A','ctime-desc':'最近创建','ctime-asc':'最早创建'};
export function sortSearchItems<T extends {label:string;path?:string;score?:number}>(items:T[],mode:SortMode,fileFor:(path:string)=>{stat?:{mtime:number;ctime:number}}|null):T[] {
  if(mode==='relevance') {
    if(!items.some(item=>typeof item.score==='number')) return items;
    return [...items].sort((a,b)=>(b.score??0)-(a.score??0));
  }
  const sorted=[...items];
  if(mode.startsWith('alpha'))return sorted.sort((a,b)=>(mode==='alpha-asc'?1:-1)*a.label.localeCompare(b.label));
  const key=mode.startsWith('mtime')?'mtime':'ctime',direction=mode.endsWith('asc')?1:-1;
  return sorted.sort((a,b)=>direction*((a.path?fileFor(a.path)?.stat?.[key]||0:0)-(b.path?fileFor(b.path)?.stat?.[key]||0:0)));
}
