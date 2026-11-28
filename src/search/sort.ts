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
interface SortItem {label:string;path?:string;score?:number}
interface FileDates {stat?:{mtime?:number;ctime?:number}}
export function compareSearchItems(a:SortItem,b:SortItem,mode:SortMode,fileFor:(path:string)=>FileDates|null):number {
  if(mode==='relevance')return (b.score??0)-(a.score??0);
  if(mode.startsWith('alpha'))return (mode==='alpha-asc'?1:-1)*a.label.localeCompare(b.label);
  const key=mode.startsWith('mtime')?'mtime':'ctime',direction=mode.endsWith('asc')?1:-1;
  return direction*((a.path?fileFor(a.path)?.stat?.[key]||0:0)-(b.path?fileFor(b.path)?.stat?.[key]||0:0));
}
export function compareSearchFiles<T extends FileDates&{path:string;basename:string}>(a:T,b:T,mode:SortMode,labelA=a.basename,labelB=b.basename):number {
  return compareSearchItems({label:labelA,path:a.path},{label:labelB,path:b.path},mode,path=>path===a.path?a:b);
}
export function sortSearchItems<T extends SortItem>(items:T[],mode:SortMode,fileFor:(path:string)=>FileDates|null):T[] {
  if(mode==='relevance'&&!items.some(item=>typeof item.score==='number'))return items;
  return [...items].sort((a,b)=>compareSearchItems(a,b,mode,fileFor));
}
