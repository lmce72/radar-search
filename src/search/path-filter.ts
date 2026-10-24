import picomatch from 'picomatch/posix';
import type {PathFilter,SearchPreset} from '../types.ts';

export const FILTER_EXAMPLES=[
  {label:'排除 assets',mode:'黑名单',pattern:'glob:**/assets/**'},
  {label:'排除附件目录',mode:'黑名单',pattern:'glob:**/{assets,attachments,附件}/**'},
  {label:'排除隐藏目录',mode:'黑名单',pattern:'glob:**/.*/**'},
  {label:'仅 Markdown',mode:'白名单',pattern:'glob:**/*.md'},
  {label:'排除图片和 PDF',mode:'黑名单',pattern:'regex:/\\.(png|jpe?g|gif|webp|svg|pdf)$/i'}
] as const;
export const FILTER_HELP='每行一条：目录 Projects/Archive；glob:**/assets/** 匹配任意层级 assets；regex:/表达式/i 匹配完整仓库相对路径。同组多条规则为“任意一条命中”。';

/** Merge reused preset rules into the current list without changing the filter mode. */
export function mergeRulePaths(current:string[],incoming:string[]):string[] {
  return [...new Set([...current,...incoming.map(path=>path.trim()).filter(Boolean)])];
}
export function compilePathRule(raw:string):(path:string)=>boolean {
  const value=raw.trim();
  if(!value)throw new Error('请填写规则或删除空行');
  if(value.startsWith('exclude:'))return compilePathRule(value.slice(8));
  if(value.startsWith('regex:')) {
    let source=value.slice(6),flags='';
    if(source.startsWith('/')) {
      const end=source.lastIndexOf('/');
      if(end===0)throw new Error('正则表达式缺少结尾 /');
      flags=source.slice(end+1);source=source.slice(1,end);
    }
    if(!source)throw new Error('正则表达式不能为空');
    let regex:RegExp;
    try {regex=new RegExp(source,flags);}catch(error){throw new Error('正则表达式无效：'+(error as Error).message);}
    return path=>{regex.lastIndex=0;return regex.test(path);};
  }
  const explicitGlob=value.startsWith('glob:');
  const literal=value.startsWith('path:');
  const pattern=(explicitGlob||literal?value.slice(5):value).replaceAll('\\','/').replace(/^\.\//,'').replace(/\/+$/,'');
  if(!pattern) {if(value==='/')return ()=>true;throw new Error('过滤规则不能为空');}
  if(pattern.startsWith('/')||pattern.split('/').includes('..'))throw new Error('请使用仓库内的相对路径');
  if(!literal&&(explicitGlob||/[*?{[]/.test(pattern))) {
    let match:(input:string)=>boolean;
    try {match=picomatch(pattern,{dot:true,nonegate:true,strictBrackets:true});}catch(error){throw new Error('glob 规则无效：'+(error as Error).message);}
    return path=>{
      if(match(path))return true;
      const parts=path.split('/');
      for(let n=1;n<parts.length;n++)if(match(parts.slice(0,n).join('/')))return true;
      return false;
    };
  }
  return path=>path===pattern||path.startsWith(pattern+'/');
}
export function validatePathFilter(filter:PathFilter):PathFilter {
  if(!['白名单','黑名单'].includes(filter.mode))throw new Error('请选择过滤方式');
  const paths=filter.paths.map(path=>path.trim());
  if(new Set(paths).size!==paths.length)throw new Error('过滤规则重复，请合并或删除');
  paths.forEach(compilePathRule);
  if(filter.mode==='白名单'&&!paths.some(path=>!path.startsWith('exclude:')))throw new Error('仅搜索匹配项时，至少需要一条包含规则');
  return {mode:filter.mode,paths};
}
export function excludedByFilter(filter:PathFilter):(value:string|{path:string})=>boolean {
  const validated=validatePathFilter(filter),matchers=validated.paths.filter(p=>!p.startsWith('exclude:')).map(compilePathRule);
  const forced=validated.paths.filter(p=>p.startsWith('exclude:')).map(compilePathRule);
  return value=>{
    const path=(typeof value==='string'?value:value.path).replaceAll('\\','/');
    const match=matchers.some(test=>test(path));
    return forced.some(test=>test(path))||(validated.mode==='白名单'?!match:match);
  };
}
export function filterWithExclusions(filter:PathFilter,exclusions:string[]):PathFilter {
  return {mode:filter.mode,paths:[...new Set([...filter.paths,...exclusions.map(rule=>filter.mode==='白名单'?'exclude:'+rule:rule)])]};
}
export function presetFromFilter(filter:PathFilter,name:string,existing:SearchPreset[]):SearchPreset {
  const trimmed=name.trim();
  if(!trimmed)throw new Error('请填写预设名称');
  if(existing.some(p=>p.name.toLocaleLowerCase()===trimmed.toLocaleLowerCase()))throw new Error('已有同名预设，请换一个名称');
  const valid=validatePathFilter(filter);
  return {name:trimmed,mode:valid.mode,excludeFolders:valid.paths,icon:'filter'};
}
