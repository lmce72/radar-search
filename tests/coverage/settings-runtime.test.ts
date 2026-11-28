import {afterEach,beforeEach,expect,test} from 'bun:test';
import type RadarSearchPlugin from '../../src/main.ts';
import {createDOM} from '../helpers/dom-host.ts';
import {installObsidianMock,sdkState,Scope} from '../helpers/obsidian-host.ts';
installObsidianMock();
const {RecordCleanupModal}=await import('../../src/settings/record-cleanup-modal.ts');
const {SettingsNavigation}=await import('../../src/settings/navigation.ts');
const {ActionButton,ActionToolbar,renderSettingTitle}=await import('../../src/settings/controls.ts');
const {ShortcutEditor}=await import('../../src/settings/shortcut-editor.ts');
const {DEFAULT_SEARCH_SHORTCUTS}=await import('../../src/shared/search-shortcuts.ts');
let dom:ReturnType<typeof createDOM>;
beforeEach(()=>{dom=createDOM();sdkState.notices.length=0;});
afterEach(async()=>{await dom.cleanup();});
const flush=async()=>{await Promise.resolve();await Promise.resolve();};
function fixture(clearRecords:RadarSearchPlugin['clearRecords']) {return {app:{},clearRecords,report:()=>{}} as unknown as RadarSearchPlugin;}
test('cleanup snapshots submitted scope while controls change during save',async()=>{
 let finish!:(value:{historyDays:number;recentRecords:number})=>void;
 const requests:unknown[]=[];
 const modal=new RecordCleanupModal(fixture(request=>{requests.push(request);return new Promise(resolve=>{finish=resolve;});}),'history');modal.open();
 const submit=Array.from(modal.contentEl.querySelectorAll('button')).find(button=>button.textContent==='清理所选范围')!;
 submit.click();expect(submit.disabled).toBe(true);submit.click();expect(requests).toHaveLength(1);
 const select=modal.contentEl.querySelector('select')!;select.value='recent';select.dispatchEvent(new Event('change'));
 finish({historyDays:2,recentRecords:0});await flush();
 expect(requests[0]).toMatchObject({scope:'history'});expect(sdkState.notices).toEqual(['已清理：搜索历史 2 天']);expect(modal.containerEl.isConnected).toBe(false);
});
test('cleanup validates dates and permits retry after rejection',async()=>{
 let calls=0;const modal=new RecordCleanupModal(fixture(async()=>{calls++;throw new Error('disk busy');}),'recent');modal.open();
 const dates=modal.contentEl.querySelectorAll('input');dates[0].value='2026-11-28';dates[1].value='2026-11-27';dates.forEach(input=>input.dispatchEvent(new Event('input')));
 const submit=Array.from(modal.contentEl.querySelectorAll('button')).find(button=>button.textContent==='清理所选范围')!;submit.click();await flush();expect(calls).toBe(0);expect(modal.contentEl.querySelector('[role=status]')!.textContent).not.toBe('');
 dates[0].value='2026-11-26';dates[0].dispatchEvent(new Event('input'));submit.click();await flush();expect(calls).toBe(1);expect(submit.disabled).toBe(false);expect(modal.contentEl.textContent).toContain('disk busy');modal.close();
});
test('settings navigation preserves parent draft focus and scroll, reports failed apply',async()=>{
 const root=document.body.createDiv();const nav=new SettingsNavigation(root);let input!:HTMLInputElement;
 nav.push({title:'设置',render:body=>{input=body.createEl('input');input.value='draft';}});input.focus();root.scrollTop=83;
 nav.push({title:'编辑',render:()=>{},apply:()=>{throw new Error('invalid draft');}});await nav.applyCurrent();expect(nav.stack).toHaveLength(2);expect(nav.current.status.textContent).toBe('invalid draft');expect(nav.current.applyButton!.buttonEl.disabled).toBe(false);
 nav.back();expect(input.value).toBe('draft');expect(document.activeElement).toBe(input);expect(root.scrollTop).toBe(83);nav.back();expect(nav.stack).toHaveLength(1);
});
test('async apply cannot pop a newer settings view',async()=>{
 const nav=new SettingsNavigation(document.body.createDiv());nav.push({title:'root',render:()=>{}});let finish!:()=>void;
 nav.push({title:'pending',render:()=>{},apply:()=>new Promise<void>(resolve=>{finish=resolve;})});const pending=nav.applyCurrent();nav.push({title:'newer',render:()=>{}});finish();await pending;expect(nav.current.title).toBe('newer');expect(nav.stack).toHaveLength(3);
});
test('toolbar uses labelled icon actions and title fallbacks',()=>{
 const parent=document.body.createDiv();const toolbar=new ActionToolbar(parent,'排除路径');let calls=0;
 const last=toolbar.add('save','保存',()=>calls++);const first=new ActionButton(parent,{icon:'check',label:'应用'});toolbar.prepend(first);last.buttonEl.click();last.setButtonText('已保存');
 expect(calls).toBe(1);expect(toolbar.actionsEl.firstElementChild).toBe(first.buttonEl);expect(last.buttonEl.getAttribute('aria-label')).toBe('已保存');expect(last.buttonEl.querySelector('svg')!.getAttribute('data-icon')).toBe('save');
 renderSettingTitle(toolbar.titleEl,'Demo · 过滤规则');expect(toolbar.titleEl.querySelector('svg')!.getAttribute('data-icon')).toBe('filter');renderSettingTitle(toolbar.titleEl,'');expect(toolbar.titleEl.childElementCount).toBe(0);
});
test('shortcut draft supports manual editing, failed save retry, reset and empty state',async()=>{
 const scopes:Scope[]=[];const app={scope:new Scope(),keymap:{pushScope:(scope:Scope)=>scopes.push(scope),popScope:(scope:Scope)=>scopes.splice(scopes.indexOf(scope),1)}};
 let fail=true;let saved=structuredClone(DEFAULT_SEARCH_SHORTCUTS.slice(0,1));let calls=0;
 const editor=new ShortcutEditor(app as never,document.body,()=>saved,async value=>{calls++;if(fail)return false;saved=value;return true;});editor.load();
 const manual=editor.el.querySelector<HTMLButtonElement>('[aria-label="绑定 1 切换手动输入"]')!;manual.click();const key=editor.el.querySelector<HTMLInputElement>('[aria-label="绑定 1 快捷键"]')!;expect(key.readOnly).toBe(false);key.value='Ctrl+Alt+F2';key.dispatchEvent(new Event('change'));
 const save=Array.from(editor.el.querySelectorAll('button')).find(button=>button.textContent==='保存修改')!;save.click();await flush();expect(editor.el.textContent).toContain('保存失败');expect(key.value).toBe('Ctrl+Alt+F2');fail=false;save.click();await flush();expect(calls).toBe(2);expect(saved[0].shortcut).toBe('Ctrl+Alt+F2');
 editor.el.querySelector<HTMLButtonElement>('[aria-label="绑定 1 删除"]')!.click();expect(editor.el.textContent).toContain('暂无绑定');Array.from(editor.el.querySelectorAll('button')).find(button=>button.textContent==='还原已保存')!.click();expect(editor.el.querySelector('tbody tr')).not.toBeNull();editor.unload();expect(editor.el.isConnected).toBe(false);expect(scopes).toHaveLength(0);
});
test('shortcut recording ignores composition and releases keyboard scope on unload',()=>{
 const scopes:Scope[]=[];const app={scope:new Scope(),keymap:{pushScope:(scope:Scope)=>scopes.push(scope),popScope:(scope:Scope)=>scopes.splice(scopes.indexOf(scope),1)}};
 const editor=new ShortcutEditor(app as never,document.body,()=>structuredClone(DEFAULT_SEARCH_SHORTCUTS.slice(0,1)),async()=>true);editor.load();
 const key=editor.el.querySelector<HTMLInputElement>('[aria-label="绑定 1 快捷键"]')!;const original=key.value;key.focus();expect(scopes).toHaveLength(1);scopes[0].keys[0].func(new KeyboardEvent('keydown',{key:'x',ctrlKey:true,isComposing:true}));expect(key.value).toBe(original);
 scopes[0].keys[0].func(new KeyboardEvent('keydown',{key:'F2',ctrlKey:true,altKey:true}));expect(key.value).toBe('Ctrl+Alt+F2');editor.unload();expect(scopes).toHaveLength(0);
});
