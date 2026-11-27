import type {RecentFileRecord} from '../types.ts';
export const RECENT_TYPES=[
  {id:'markdown',label:'Markdown 文档',icon:'file-text'},
  {id:'command',label:'命令',icon:'command'},
  {id:'pdf',label:'PDF',icon:'file-type'},
  {id:'canvas',label:'Canvas',icon:'layout-dashboard'},
  {id:'image',label:'图片',icon:'image'},
  {id:'other',label:'其他',icon:'file'}
] as const;
export function normalizeExtension(value:string):string {
  const extension=value.trim().toLowerCase().replace(/^\.+/,'');
  if(!/^[a-z0-9_-]+(?:\.[a-z0-9_-]+)*$/.test(extension))throw new Error('请输入文件后缀，例如 .excalidraw 或 .excalidraw.md');
  return extension;
}
/** Longest compound suffix wins before built-in classification.
 * 复合后缀按最长匹配，优先于内置分类。 */
export function recentType(record:RecentFileRecord,custom:readonly string[]):string {
  if(record.kind==='command')return 'command';
  const path=record.path.toLowerCase();
  const extension=[...custom].sort((a,b)=>b.length-a.length).find(type=>path.endsWith('.'+type));
  if(extension)return extension;
  if(path.endsWith('.md'))return 'markdown';
  if(path.endsWith('.pdf'))return 'pdf';
  if(path.endsWith('.canvas'))return 'canvas';
  if(/\.(?:avif|bmp|gif|jpe?g|png|svg|webp|heic)$/i.test(path))return 'image';
  return 'other';
}
