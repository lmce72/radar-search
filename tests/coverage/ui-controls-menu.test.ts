import {test,expect} from 'bun:test';
import {createDOM} from '../helpers/dom-host.ts';
import {installObsidianMock} from '../helpers/obsidian-host.ts';
installObsidianMock();
const {ChoiceMenu}=await import('../../src/ui/choice-menu.ts');
const settle=()=>new Promise(resolve=>setTimeout(resolve,0));

test('delayed menu activation cannot reopen an unloaded or detached control',async()=>{
 const dom=createDOM();try{
  const root=dom.document.body.createDiv(),menu=new ChoiceMenu(root,'Group',new Set());menu.load();
  menu.unload();menu.show();expect(menu.trigger.getAttribute('aria-expanded')).toBe('false');expect(menu.popup.hidden).toBe(true);
  const detached=new ChoiceMenu(root,'Detached',new Set());detached.load();detached.trigger.remove();detached.show();expect(detached.popup.hidden).toBe(true);detached.unload();
 }finally{await dom.cleanup();}
});

test('choice menus retain multiselect focus, support keyboard navigation and release owned roots',async()=>{
 const dom=createDOM();try{
  const root=dom.document.body.createDiv(),roots=new Set<HTMLElement>();let selected=0;
  const menu=new ChoiceMenu(root,'Types',roots);menu.load();
  menu.setChoices([{id:'a',label:'Alpha',icon:'file',checked:false,keepOpen:true,onSelect:()=>{selected++;}},{id:'b',label:'Beta',icon:'star',checked:true,disabled:true,onSelect:()=>{throw Error('disabled');}},{id:'c',label:'Gamma',icon:'tag',onSelect:()=>{selected+=10;}}]);
  menu.trigger.click();expect(menu.popup.hidden).toBe(false);expect(roots.has(menu.popup)).toBe(true);
  const a=menu.popup.querySelector<HTMLButtonElement>('[data-choice=a]');a.focus();a.click();expect(selected).toBe(1);expect(menu.popup.hidden).toBe(false);
  menu.setChoices([{id:'a',label:'Alpha',icon:'file',checked:true,keepOpen:true,onSelect:()=>{}},{id:'b',label:'Beta',icon:'star',checked:true,disabled:true,onSelect:()=>{}},{id:'c',label:'Gamma',icon:'tag',onSelect:()=>{selected+=10;}}]);
  expect(dom.document.activeElement).toBe(a);expect(a.getAttribute('aria-checked')).toBe('true');
  a.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));expect(dom.document.activeElement).toBe(menu.popup.querySelector('[data-choice=c]'));
  menu.popup.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Home',bubbles:true,cancelable:true}));expect(dom.document.activeElement).toBe(a);
  a.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'End',bubbles:true,cancelable:true}));expect(dom.document.activeElement).toBe(menu.popup.querySelector('[data-choice=c]'));
  menu.popup.querySelector<HTMLButtonElement>('[data-choice=c]').click();expect(selected).toBe(11);expect(menu.popup.hidden).toBe(true);
  menu.show();menu.popup.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));expect(menu.popup.hidden).toBe(true);expect(dom.document.activeElement).toBe(menu.trigger);
  menu.trigger.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));expect(menu.popup.hidden).toBe(false);menu.popup.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Tab',bubbles:true}));expect(menu.popup.hidden).toBe(true);
  menu.show();dom.document.body.dispatchEvent(new dom.window.PointerEvent('pointerdown',{bubbles:true}));expect(menu.popup.hidden).toBe(true);
  menu.show();dom.window.dispatchEvent(new dom.window.Event('resize'));expect(menu.popup.hidden).toBe(true);
  menu.unload();expect(roots.size).toBe(0);expect(menu.popup.isConnected).toBe(false);
 }finally{await dom.cleanup();}
});
test('choice menus keep default actions separate and support keyboard and pointer reordering',async()=>{
 const dom=createDOM();try{
  const root=dom.document.body.createDiv(),moves:string[][]=[];let defaults=0,selected=0;const menu=new ChoiceMenu(root,'Order',new Set(),(a,b)=>moves.push([a,b]));menu.load();
  const choices=[{id:'a',label:'A',icon:'file',pin:true,onSelect:()=>{selected++;},defaultChoice:{selected:true,onSelect:()=>{defaults++;}}},{id:'b',label:'B',icon:'tag',onSelect:()=>{},defaultChoice:{selected:false,onSelect:()=>{defaults++;}}}];menu.setChoices(choices);
  menu.popup.querySelector<HTMLButtonElement>('[data-default-choice=a]').click();expect(defaults).toBe(1);expect(selected).toBe(0);
  menu.popup.querySelector<HTMLElement>('.primecore-choice-pin').dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true,cancelable:true}));expect(selected).toBe(0);
  const grip=menu.popup.querySelector<HTMLButtonElement>('.primecore-reorder-grip');grip.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowDown',altKey:true,bubbles:true,cancelable:true}));expect(moves).toEqual([['a','b']]);
  const target=menu.popup.querySelector<HTMLElement>('[data-choice=b]');Object.defineProperty(dom.document,'elementFromPoint',{value:()=>target,configurable:true});
  grip.dispatchEvent(new dom.window.PointerEvent('pointerdown',{pointerId:1,bubbles:true,cancelable:true}));grip.dispatchEvent(new dom.window.PointerEvent('pointerup',{pointerId:1,bubbles:true,clientX:2,clientY:2}));expect(moves).toEqual([['a','b'],['a','b']]);
  grip.dispatchEvent(new dom.window.PointerEvent('pointerdown',{pointerId:2,bubbles:true,cancelable:true}));grip.dispatchEvent(new dom.window.PointerEvent('pointercancel',{pointerId:2,bubbles:true}));expect(grip.parentElement.classList.contains('is-dragging')).toBe(false);
  menu.reorderChoices(['b','a']);expect([...menu.popup.querySelectorAll<HTMLElement>('[data-choice]')].map(el=>el.dataset.choice)).toEqual(['b','a']);menu.setLabel('New label','star');expect(menu.trigger.textContent).toContain('New label');menu.unload();
 }finally{await dom.cleanup();}
});
test('hover activation does not toggle a menu closed and moving cancels a long press',async()=>{
 const dom=createDOM();try{
  const root=dom.document.body.createDiv();let activated=0;const menu=new ChoiceMenu(root,'Group',new Set(),undefined,{hover:true,activate:()=>{activated++;}});menu.load();
  menu.setChoices([{id:'a',label:'A',icon:'file',onSelect(){}}]);menu.trigger.click();menu.trigger.click();expect(activated).toBe(2);expect(menu.popup.hidden).toBe(false);
  menu.close();menu.trigger.dispatchEvent(new dom.window.PointerEvent('pointerdown',{pointerType:'touch',clientX:0,clientY:0}));menu.trigger.dispatchEvent(new dom.window.PointerEvent('pointermove',{pointerType:'touch',clientX:20,clientY:0}));await settle();expect(menu.popup.hidden).toBe(true);
  menu.trigger.dispatchEvent(new dom.window.PointerEvent('pointerup',{pointerType:'touch'}));menu.unload();
 }finally{await dom.cleanup();}
});
