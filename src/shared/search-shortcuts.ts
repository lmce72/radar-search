import {RESULT_CATEGORIES} from '../search/result-categories.ts';
export interface ShortcutEvent {key:string;altKey:boolean;ctrlKey:boolean;metaKey:boolean;shiftKey:boolean;isComposing?:boolean}
const modifiers=['Ctrl','Alt','Meta','Shift'];
export const SHORTCUT_ACTIONS=[
 {id:'category.previous',label:'上一个搜索类别',group:'类别',reverse:'category.next'},
 {id:'category.next',label:'下一个搜索类别',group:'类别',reverse:'category.previous'},
 ...RESULT_CATEGORIES.map(category=>({id:`category.${category.id}` as const,label:'切换到'+category.label,group:'类别',reverse:'' as const})),
 {id:'result.previous',label:'上一条结果',group:'结果',reverse:'result.next'},
 {id:'result.next',label:'下一条结果',group:'结果',reverse:'result.previous'},
 {id:'result.activate',label:'打开选中结果',group:'结果',reverse:''},
 {id:'page.previous',label:'上一页',group:'分页',reverse:'page.next'},
 {id:'page.next',label:'下一页',group:'分页',reverse:'page.previous'},
 {id:'content.toggle',label:'展开或收起全部内容',group:'结果',reverse:''},
 {id:'filter.open',label:'打开过滤器',group:'工具',reverse:''},
 {id:'sort.open',label:'打开排序',group:'工具',reverse:''},
 {id:'options.toggle',label:'打开或关闭搜索选项',group:'工具',reverse:''},
 {id:'tool.back',label:'返回搜索结果',group:'工具',reverse:''},
 {id:'mode.vault',label:'切换到库内搜索',group:'搜索',reverse:''},
 {id:'mode.global',label:'切换到全局搜索',group:'搜索',reverse:''},
 {id:'mode.web',label:'切换到互联网搜索',group:'搜索',reverse:''},
 {id:'records.history',label:'显示搜索历史',group:'记录',reverse:'records.recent'},
 {id:'records.recent',label:'显示最近打开',group:'记录',reverse:'records.history'},
 {id:'search.execute',label:'执行当前搜索',group:'搜索',reverse:''},
 {id:'query.clear',label:'清空查询并显示记录',group:'搜索',reverse:''},
 {id:'view.page',label:'在搜索页打开当前结果',group:'搜索',reverse:''}
] as const;
export type ShortcutAction=typeof SHORTCUT_ACTIONS[number]['id'];
export interface SearchShortcut {id:string;action:ShortcutAction;shortcut:string;enabled:boolean;scope:'input'|'search';reverse:boolean}
export function canonicalShortcut(value:string):string {
 if(!value)return '';const parts=value.split('+'),key=parts.pop();return [...modifiers.filter(modifier=>parts.includes(modifier)),key].join('+');
}
export function shortcutFor(event:ShortcutEvent):string {
 if(event.isComposing||['Control','Alt','Meta','Shift','Dead','Process','Unidentified'].includes(event.key))return '';
 const key=event.key===' '?'Space':event.key==='+'?'Plus':event.key.length===1?event.key.toUpperCase():event.key;
 return [event.ctrlKey?'Ctrl':'',event.altKey?'Alt':'',event.metaKey?'Meta':'',event.shiftKey?'Shift':'',key].filter(Boolean).join('+');
}
export function validShortcut(value:string):boolean {
 if(!value)return true;const parts=value.split('+'),key=parts.pop();
 return !!key&&!['Tab','Escape','Control','Alt','Meta','Shift','Dead','Process','Unidentified'].includes(key)&&parts.length>0&&new Set(parts).size===parts.length&&parts.every(p=>modifiers.includes(p))&&parts.some(p=>p!=='Shift')&&/^(?:[A-Z0-9/.,;[\]\x27=\x60\\-]|Arrow(?:Left|Right|Up|Down)|F(?:[1-9]|1[0-2])|Enter|Home|End|PageUp|PageDown|Space|Plus|Backspace|Delete|Insert)$/.test(key);
}
export function validateSearchShortcuts(value:unknown):SearchShortcut[] {
 if(!Array.isArray(value))throw Error('快捷键需要配置列表');
 const ids=new Set<string>(),keys=new Set<string>(),result:SearchShortcut[]=[];
 for(const entry of value as unknown[]){
  if(!entry||typeof entry!=='object'||!('id' in entry)||typeof entry.id!=='string'||!entry.id||ids.has(entry.id)||!('action' in entry)||typeof entry.action!=='string'||!('shortcut' in entry)||typeof entry.shortcut!=='string'||!('enabled' in entry)||typeof entry.enabled!=='boolean'||!('scope' in entry)||(entry.scope!=='input'&&entry.scope!=='search')||!('reverse' in entry)||typeof entry.reverse!=='boolean')throw Error('快捷键配置格式无效或标识重复');
  const action=SHORTCUT_ACTIONS.find(action=>action.id===entry.action);if(!action)throw Error('请选择有效的快捷键动作');
  const shortcut=canonicalShortcut(entry.shortcut);
  if(!validShortcut(entry.shortcut)||entry.enabled&&!shortcut)throw Error('请录入 Ctrl、Alt 或 Meta 加按键，或停用此绑定');
  if(entry.reverse&&(!action.reverse||shortcut.split('+').includes('Shift')))throw Error('此动作不支持反向，或快捷键已使用 Shift');
  if(entry.enabled)for(const key of [shortcut,...(entry.reverse?[canonicalShortcut('Shift+'+shortcut)]:[])]){if(keys.has(key))throw Error('搜索快捷键重复，请修改或停用冲突绑定');keys.add(key);}
  ids.add(entry.id);result.push({id:entry.id,action:action.id,shortcut,enabled:entry.enabled,scope:entry.scope==='input'?'input':'search',reverse:entry.reverse});
 }
 return result;
}
export const DEFAULT_SEARCH_SHORTCUTS:SearchShortcut[]=[
 {id:'category-previous',action:'category.previous',shortcut:'Alt+ArrowLeft',enabled:true,scope:'input',reverse:false},
 {id:'category-next',action:'category.next',shortcut:'Alt+ArrowRight',enabled:true,scope:'input',reverse:false}
];
export function matchSearchShortcut(event:ShortcutEvent,bindings:readonly SearchShortcut[],inInput:boolean):ShortcutAction|undefined {
 const key=shortcutFor(event);if(!key)return;
 for(const binding of bindings){
  if(!binding.enabled||binding.scope==='input'&&!inInput)continue;
  if(key===binding.shortcut)return binding.action;
  if(binding.reverse&&key===canonicalShortcut('Shift+'+binding.shortcut))return SHORTCUT_ACTIONS.find(action=>action.id===binding.action)?.reverse||undefined;
 }
}
/** Migrate once; an explicit empty new list means all bindings were removed.
 * 旧配置仅迁移一次；新版空列表代表用户已删除全部绑定。 */
export function migrateSearchShortcuts(source:Record<string,unknown>):SearchShortcut[] {
 if(source.searchShortcuts!==undefined)return validateSearchShortcuts(source.searchShortcuts);
 const legacy=['categoryPreviousShortcut','categoryNextShortcut','categoryCycleShortcut'];
 if(!legacy.some(key=>source[key]!==undefined))return structuredClone(DEFAULT_SEARCH_SHORTCUTS);
 const result:SearchShortcut[]=[];
 for(const [index,key] of legacy.entries()){
  const shortcut=source[key]??(index<2?DEFAULT_SEARCH_SHORTCUTS[index].shortcut:'');
  if(typeof shortcut!=='string'||!validShortcut(shortcut))throw Error('旧快捷键无效');
  if(!shortcut)continue;
  result.push({id:key,action:index===0?'category.previous':'category.next',shortcut,enabled:true,scope:'input',reverse:index===2});
 }
 return validateSearchShortcuts(result);
}
