import {afterEach,beforeEach,expect,test} from 'bun:test';
import type RadarSearchPlugin from '../../src/main.ts';
import {createDOM} from '../helpers/dom-host.ts';
import {installObsidianMock} from '../helpers/obsidian-host.ts';
installObsidianMock();
const {FloatingSearch}=await import('../../src/ui/floating-search.ts');
let dom:ReturnType<typeof createDOM>;
beforeEach(()=>{dom=createDOM();});afterEach(async()=>{await dom.cleanup();});
function fixture(){
 let focus=0,history=0,returned=0,unmounted=0;const component={_disposed:false,_popupRoots:new Set<HTMLElement>(),_choiceMenus:new Set<{popup:HTMLElement;trigger:HTMLElement;close:()=>void}>(),_idleMenu:null as {hide:()=>void}|null,_resultToolView:'results',_focusInput:()=>focus++,_recordHistory:()=>history++,_returnToResults:()=>{returned++;component._resultToolView='results';}};
 const components=new Map<HTMLElement,{component:typeof component}>();
 const plugin={app:{workspace:{getMostRecentLeaf:()=>null}},components,floatingSearch:null,async mount(container:HTMLElement){components.set(container,{component});return component;},unmount(container:HTMLElement){unmounted++;components.delete(container);}} as unknown as RadarSearchPlugin;
 const floating=new FloatingSearch(plugin);plugin.floatingSearch=floating;return {plugin,floating,component,counts:()=>({focus,history,returned,unmounted})};
}
test('floating search focuses after mount and backdrop dismissal releases DOM and history',async()=>{
 const {floating,plugin,counts}=fixture();await floating.open();expect(counts().focus).toBe(1);expect(document.body.classList.contains('primecore-floating-open')).toBe(true);
 floating.contentEl.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));expect(plugin.floatingSearch).toBe(floating);
 floating.backdropBackgroundEl.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));expect(plugin.floatingSearch).toBeNull();expect(counts()).toMatchObject({history:1,unmounted:1});expect(floating.contentEl.isConnected).toBe(false);expect(document.body.classList.contains('primecore-floating-open')).toBe(false);
});
test('Escape dismisses child menu and tool view before dismissing floating search',async()=>{
 const {floating,plugin,component,counts}=fixture();await floating.open();const popup=document.body.createDiv(),trigger=floating.contentEl.createEl('button');let closed=0;
 component._popupRoots.add(popup);component._choiceMenus.add({popup,trigger,close:()=>{closed++;popup.hidden=true;}});
 const escape=()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',cancelable:true}));escape();expect(closed).toBe(1);expect(document.activeElement).toBe(trigger);expect(plugin.floatingSearch).toBe(floating);
 component._idleMenu={hide:()=>{component._idleMenu=null;}};escape();expect(component._idleMenu).toBeNull();expect(plugin.floatingSearch).toBe(floating);
 component._resultToolView='filter';escape();expect(counts().returned).toBe(1);expect(plugin.floatingSearch).toBe(floating);escape();expect(plugin.floatingSearch).toBeNull();
});
test('directory suggestions retain floating search and outside pointer dismisses it',async()=>{
 const {floating,plugin}=fixture();await floating.open();const suggestion=document.body.createDiv({cls:'suggestion-container'});const folder=suggestion.createDiv({cls:'primecore-folder-suggestion'});
 folder.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));expect(plugin.floatingSearch).toBe(floating);window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',cancelable:true}));expect(plugin.floatingSearch).toBe(floating);suggestion.remove();document.body.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));expect(plugin.floatingSearch).toBeNull();
});
test('mount rejection removes floating search shell',async()=>{
 const {floating,plugin}=fixture();plugin.mount=async()=>{throw new Error('render failed');};await floating.open();expect(plugin.floatingSearch).toBeNull();expect(document.querySelector('.primecore-floating-search')).toBeNull();
});
