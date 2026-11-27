import {normalizeExtension} from '../history/recent-types.ts';
import type {AttachmentFileType} from '../types.ts';

/** Labels are uppercase; stored suffixes and comparisons are case-insensitive.
 * 标签使用大写；保存及匹配均归一化为小写，不修改文件名。 */
export function addAttachmentTypes(current:readonly AttachmentFileType[],input:string):AttachmentFileType[] {
  const values=input.split(/[\s,;，；]+/).filter(Boolean).map(normalizeExtension);
  if(!values.length)throw Error('请输入文件后缀，例如 .pdf .canvas');
  const result=current.map(value=>({...value})),seen=new Set(current.map(value=>value.extension));
  for(const extension of values)if(!seen.has(extension)){result.push({extension,selected:true});seen.add(extension);}
  return result;
}
export function matchesAttachmentTypes(path:string,types:readonly AttachmentFileType[]):boolean {
  const lower=path.toLowerCase();return !types.length||types.some(type=>type.selected&&lower.endsWith('.'+type.extension.toLowerCase()));
}
