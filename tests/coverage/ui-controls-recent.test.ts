import {test,expect} from 'bun:test';
import {createDOM} from '../helpers/dom-host.ts';
import {Component,sdkState} from '../helpers/obsidian-host.ts';
import {ChoiceMenu} from '../../src/ui/choice-menu.ts';
import {renderRecentFilters} from '../../src/ui/recent-filters.ts';
import type {SearchBarHost} from '../../src/ui/search-bar-host.ts';

const settle=()=>new Promise(resolve=>setTimeout(resolve,0));
test('recent filters keep shared chip/menu selection, roll back failed saves and add suffixes',async()=>{
 const dom=createDOM(),owner=new Component();owner.load();try{
  const cfg={recentFileTypes:['draw.json','pdf'],recentTypeFilter:[] as string[]},persisted={...cfg,recentTypeFilter:[] as string[],warnUnknownFileType:false};
  const errors:unknown[]=[],refreshes:unknown[]=[],saved:unknown[]=[];let fail=false;
  const bar={cfg,app:{},plugin:{settings:persisted,updateSetting:async(key:string,value:unknown)=>{if(fail)throw Error('disk');saved.push([key,value]);Reflect.set(persisted,key,structuredClone(value));}},_dropdownInner:dom.document.body.createDiv(),_recentMenu:null,_setIcon:()=>{},removeChild:(child:Component)=>owner.removeChild(child),_createChoiceMenu:(parent:HTMLElement,label:string)=>{const menu=new ChoiceMenu(parent,label,new Set());owner.addChild(menu as unknown as Component);return menu;},_showRecentFiles:(...args:unknown[])=>refreshes.push(args),_log:(...args:unknown[])=>errors.push(args)} as unknown as SearchBarHost;
  renderRecentFilters(bar,'2026-11-28');
  const root=bar._dropdownInner.querySelector<HTMLElement>('.primecore-recent-filters'),menu=bar._recentMenu;
  expect(root.querySelectorAll('[data-recent-type=pdf]')).toHaveLength(2);
  const pdf=root.querySelector<HTMLButtonElement>('[data-recent-type=pdf]');pdf.click();await settle();expect(cfg.recentTypeFilter).not.toContain('pdf');expect(pdf.getAttribute('aria-pressed')).toBe('false');
  menu.show();const custom=menu.popup.querySelector<HTMLButtonElement>('[data-choice="draw.json"]');custom.focus();custom.click();await settle();expect(menu.popup.hidden).toBe(false);expect(dom.document.activeElement===custom).toBe(true);
  fail=true;pdf.click();await settle();expect(pdf.getAttribute('aria-pressed')).toBe('false');expect(errors).toHaveLength(1);fail=false;
  const input=menu.popup.querySelector<HTMLInputElement>('input');input.value='.SVG';input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));menu.popup.querySelector<HTMLButtonElement>('.setting-item button').click();await settle();expect(cfg.recentFileTypes).toContain('svg');expect(saved.at(-1)).toEqual(['recentFileTypes',['draw.json','pdf','svg']]);expect(refreshes.at(-1)).toEqual([1,'2026-11-28']);
  const count=sdkState.notices.length;input.value='.pdf';input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));menu.popup.querySelector<HTMLButtonElement>('.setting-item button').click();await settle();expect(sdkState.notices).toHaveLength(count+1);expect(cfg.recentFileTypes.filter(ext=>ext==='pdf')).toHaveLength(1);
 }finally{owner.unload();await dom.cleanup();}
});
