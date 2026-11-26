import type {SearchGroup} from '../types.ts';
/** Keep attachment matches separate in every presentation. / 所有视图统一拆分附件结果。 */
export function fileTypeLabel(path?:string):string {
  const name=path?.split('/').pop()||'';
  const extension=name.includes('.')?name.slice(name.lastIndexOf('.')+1):'';
  return /\.md$/i.test(name)||!path?'':extension.toUpperCase()||'FILE';
}
export function partitionFileGroups(groups:SearchGroup[]):SearchGroup[] {
  if(!groups.some(group=>group.title==='Vault 文件'&&group.items.some(item=>!!fileTypeLabel(item.path))))return groups;
  return groups.flatMap(group=>{
    if(group.title!=='Vault 文件')return [group];
    const files=group.items.filter(item=>!fileTypeLabel(item.path));
    const others=group.items.filter(item=>!!fileTypeLabel(item.path));
    return [{...group,items:files},...(others.length?[{title:'非 Markdown 文件',items:others}]:[])];
  });
}
