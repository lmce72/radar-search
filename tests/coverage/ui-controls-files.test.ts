import {test,expect} from 'bun:test';
import {createDOM} from '../helpers/dom-host.ts';
import {installObsidianMock,TFile,sdkState} from '../helpers/obsidian-host.ts';
import type {AttachmentFileType} from '../../src/types.ts';
installObsidianMock();
const {AttachmentFilterEditor}=await import('../../src/ui/attachment-filters.ts');
const {FileHandlerModal,openRecentFile,registeredHandlers,detectedHandler,extensionFor}=await import('../../src/ui/file-handler.ts');
const {showElementHint,hideElementHint}=await import('../../src/ui/element-hint.ts');
const settle=()=>new Promise(resolve=>setTimeout(resolve,0));

test('attachment chips retain nodes, validate entry, toggle selection and remove only in delete mode',async()=>{
 const dom=createDOM();try{
  let types:AttachmentFileType[]=[{extension:'pdf',selected:true}],temporary=false,locked=false;const notices:string[]=[];
  const editor=new AttachmentFilterEditor(dom.document.body,{getTypes:()=>types,save:async value=>{types=value;return true;},notify:value=>notices.push(value),locked:()=>locked,temporary:{get:()=>temporary,set:async value=>{temporary=value;}}});editor.load();
  expect(editor.el.open).toBe(false);const pdf=editor.el.querySelector<HTMLButtonElement>('[data-extension=pdf]');expect(pdf.textContent).toBe('.PDF');pdf.focus();pdf.click();await settle();expect(types[0].selected).toBe(false);expect(editor.el.querySelector('[data-extension=pdf]')).toBe(pdf);
  const input=editor.el.querySelector<HTMLInputElement>('[aria-label=添加后缀标签]');input.value='.CANVAS .png';input.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));await settle();expect(types.map(type=>type.extension)).toEqual(['pdf','canvas','png']);expect(input.value).toBe('');
  input.value='/bad';input.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));expect(notices).toHaveLength(1);
  const toggle=editor.el.querySelector<HTMLInputElement>('[aria-label=临时设定]');toggle.checked=true;toggle.dispatchEvent(new dom.window.Event('change'));await settle();expect(temporary).toBe(true);
  const deleting=editor.el.querySelector<HTMLInputElement>('[aria-label=删除模式]');deleting.checked=true;deleting.dispatchEvent(new dom.window.Event('change'));pdf.click();await settle();expect(types.some(type=>type.extension==='pdf')).toBe(false);expect(pdf.isConnected).toBe(false);
  locked=true;editor.sync();expect(input.disabled).toBe(true);expect(deleting.disabled).toBe(true);editor.unload();expect(editor.el.isConnected).toBe(false);
 }finally{await dom.cleanup();}
});

test('file handlers resolve host capabilities, persist manual choices and recover save errors',async()=>{
 const dom=createDOM();try{
  const opened:unknown[]=[],reports:unknown[]=[],saved:unknown[]=[];let fail=false,closed=0;
  const app={viewRegistry:{typeByExtension:{pdf:'pdf'},viewByType:{canvas:{},pdf:{}}},workspace:{getLeaf:()=>({openFile:async(file:unknown)=>{opened.push(file);},setViewState:async(value:unknown)=>{opened.push(value);}})},openWithDefaultApp:async(path:string)=>{opened.push(path);}};
  const plugin={app,settings:{recentFileTypes:['draw.json'],fileTypeHandlers:{} as Record<string,string>,warnUnknownFileType:true},floatingSearch:{close:()=>{closed++;}},report:(...args:unknown[])=>reports.push(args),updateSettings:async(value:object)=>{if(fail)throw Error('disk unavailable');saved.push(value);Object.assign(plugin.settings,value);}} as unknown as ConstructorParameters<typeof FileHandlerModal>[0];
  expect(registeredHandlers(plugin.app)).toEqual(['canvas','pdf']);expect(detectedHandler(plugin.app,'pdf')).toBe('pdf');expect(detectedHandler(plugin.app,'abc')).toBeNull();expect(extensionFor('a.DRAW.JSON',['draw.json'])).toBe('draw.json');
  const file=new TFile('note.pdf');openRecentFile(plugin,file as Parameters<typeof openRecentFile>[1]);await settle();expect(opened[0]).toEqual({type:'pdf',state:{file:'note.pdf'},active:true});expect(closed).toBe(1);
  const unknown=new TFile('note.xyz');openRecentFile(plugin,unknown as Parameters<typeof openRecentFile>[1]);expect(dom.document.querySelector('.modal-container')).not.toBeNull();dom.document.querySelector<HTMLButtonElement>('.modal-container button').click();expect(opened).toHaveLength(1);
  const modal=new FileHandlerModal(plugin,'xyz',unknown as ConstructorParameters<typeof FileHandlerModal>[2]);modal.open();expect(modal.containerEl.style.zIndex).toBe('1000002');const select=modal.contentEl.querySelector('select');select.value='external';select.dispatchEvent(new dom.window.Event('change'));const skip=modal.contentEl.querySelector<HTMLInputElement>('input[type=checkbox]');skip.checked=true;skip.dispatchEvent(new dom.window.Event('change'));
  const save=modal.contentEl.querySelector<HTMLButtonElement>('.mod-cta');fail=true;save.click();await settle();expect(save.disabled).toBe(false);expect(sdkState.notices.at(-1)).toBe('disk unavailable');expect(reports).toHaveLength(1);
  fail=false;save.click();await settle();expect(saved).toEqual([{fileTypeHandlers:{xyz:'external'},warnUnknownFileType:false}]);expect(opened.at(-1)).toBe('note.xyz');expect(modal.containerEl.isConnected).toBe(false);
 }finally{await dom.cleanup();}
});

test('element hints preserve focus and dismiss on escape, scroll or removed anchor',async()=>{
 const dom=createDOM();try{
  const button=dom.document.body.createEl('button',{attr:{'aria-label':'Filter'}});button.focus();showElementHint(button);expect(dom.document.activeElement).toBe(button);expect(dom.document.querySelector('.primecore-element-tooltip').textContent).toBe('Filter');expect(hideElementHint(dom.document,dom.document.body)).toBe(false);
  dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',cancelable:true}));expect(dom.document.querySelector('.primecore-element-tooltip')).toBeNull();
  button.setAttribute('data-hint-label','Custom');showElementHint(button);dom.document.dispatchEvent(new dom.window.Event('scroll'));expect(hideElementHint(dom.document)).toBe(false);
  showElementHint(button);button.remove();await settle();expect(dom.document.querySelector('.primecore-element-tooltip')).toBeNull();
 }finally{await dom.cleanup();}
});

test('a stale hover callback on a detached anchor does not create a hint',async()=>{
 const dom=createDOM();try{
  const button=dom.document.createElement('button');button.setAttribute('aria-label','Stale');showElementHint(button);
  expect(!!dom.document.querySelector('.primecore-element-tooltip')).toBe(false);expect(hideElementHint(dom.document)).toBe(false);
 }finally{await dom.cleanup();}
});
