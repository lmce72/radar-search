import type {SortMode} from '../types.ts';
export const SORT_OPTIONS:Record<SortMode,string>={
  relevance:'相关度（高→低）',
  'mtime-desc':'修改时间：新→旧',
  'mtime-asc':'修改时间：旧→新',
  'ctime-desc':'创建时间：新→旧',
  'ctime-asc':'创建时间：旧→新',
  'alpha-asc':'名称：A→Z',
  'alpha-desc':'名称：Z→A'
};
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
