import {afterEach,beforeEach,expect,test} from 'bun:test';
import {createDOM} from '../helpers/dom-host.ts';
import {installObsidianMock,Scope} from '../helpers/obsidian-host.ts';
installObsidianMock();
const {openIconPicker,closeIconPickers}=await import('../../src/settings/icon-picker.ts');
let dom:ReturnType<typeof createDOM>;
beforeEach(()=>{dom=createDOM();});afterEach(async()=>{closeIconPickers();await dom.cleanup();});
function appFixture(){const scopes:Scope[]=[];return {scopes,app:{scope:new Scope(),keymap:{pushScope:(scope:Scope)=>scopes.push(scope),popScope:(scope:Scope)=>scopes.splice(scopes.indexOf(scope),1)}}};}
test('detached icon anchor never installs an orphan keyboard scope',()=>{
 const {app,scopes}=appFixture();const anchor=document.createElement('button');openIconPicker({app:app as never,anchor,value:'',onSelect:()=>{}});
 expect(document.querySelector('[role=dialog]')).toBeNull();expect(scopes).toHaveLength(0);
});
test('icon picker filters, ignores composing Enter and restores focus after selection',()=>{
 const {app,scopes}=appFixture();const anchor=document.body.createEl('button');const chosen:string[]=[];openIconPicker({app:app as never,anchor,value:'star',onSelect:value=>chosen.push(value)});
 const dialog=document.querySelector<HTMLElement>('[role=dialog]')!;expect(dialog.querySelector('.is-selected')!.getAttribute('aria-label')).toBe('star');
 const search=dialog.querySelector('input')!;search.value='bookmark';search.dispatchEvent(new Event('input'));expect(dialog.querySelectorAll('.primecore-icon-picker-cell:not(.is-hidden)')).toHaveLength(1);
 search.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true}));expect(chosen).toHaveLength(0);search.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter'}));expect(chosen).toEqual(['bookmark']);expect(scopes).toHaveLength(0);expect(document.activeElement).toBe(anchor);expect(dialog.isConnected).toBe(false);
});
test('icon picker singleton, clear, Escape and outside dismissal release scopes',()=>{
 const {app,scopes}=appFixture();const anchor=document.body.createEl('button');const chosen:string[]=[];const open=()=>openIconPicker({app:app as never,anchor,value:'',onSelect:value=>chosen.push(value)});
 open();open();expect(document.querySelectorAll('[role=dialog]')).toHaveLength(1);expect(scopes).toHaveLength(1);scopes[0].keys[0].func(new KeyboardEvent('keydown',{key:'Escape'}));expect(scopes).toHaveLength(0);
 open();Array.from(document.querySelectorAll('button')).find(button=>button.textContent==='清除')!.click();expect(chosen).toEqual(['']);
 open();document.body.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));expect(scopes).toHaveLength(0);expect(document.querySelector('[role=dialog]')).toBeNull();
 open();anchor.remove();window.dispatchEvent(new Event('resize'));expect(scopes).toHaveLength(0);
});
