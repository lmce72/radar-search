import {test,expect} from 'bun:test';
import {searchbarFixture} from '../helpers/searchbar-fixture.ts';
import {RESULT_CATEGORIES} from '../../src/search/result-categories.ts';

const settle=async()=>{for(let at=0;at<30;at++)await Promise.resolve();};
test('shortcut actions select each enabled category, loop and activate/paginate real rendered rows',async()=>{
 const f=await searchbarFixture({searchNonMarkdown:true,searchMarkdown:true,searchTags:true,searchBookmarks:true,searchProperties:true,searchCommands:true,dropdownPageSize:1});try{
  let opened=-1;f.bar._input.value='result';
  const groups=RESULT_CATEGORIES.filter(category=>category.titles.length).map(category=>({title:category.titles[0],items:Array.from({length:2},(_,i)=>({label:'result '+i,action:()=>{opened=i;}}))}));
  f.bar._renderDropdown(groups);
  for(const category of RESULT_CATEGORIES.filter(category=>category.titles.length)){
   expect(f.bar._runShortcutAction('category.'+category.id as 'category.files')).toBe(true);expect(f.bar._resultCategory).toBe(category.id);
  }
  expect(f.bar._runShortcutAction('category.next')).toBe(true);expect(f.bar._resultCategory).toBe('files');
  expect(f.bar._runShortcutAction('category.previous')).toBe(true);expect(f.bar._resultCategory).toBe('commands');
  f.bar._runShortcutAction('category.files');expect(f.bar._runShortcutAction('page.previous')).toBe(false);
  expect(f.bar._runShortcutAction('page.next')).toBe(true);expect(f.bar._itemEls[0].textContent).toContain('result 1');
  expect(f.bar._runShortcutAction('page.next')).toBe(false);expect(f.bar._runShortcutAction('page.previous')).toBe(true);
  expect(f.bar._runShortcutAction('result.previous')).toBe(true);expect(f.bar._runShortcutAction('result.next')).toBe(true);
  expect(f.bar._runShortcutAction('result.activate')).toBe(true);expect(opened).toBe(0);expect(f.bar._runShortcutAction('result.next')).toBe(false);
  expect(f.errors).toEqual([]);
 }finally{await f.cleanup();}
});

test('tool and presentation shortcuts use existing content, options, sort and filter behaviors',async()=>{
 const f=await searchbarFixture();try{
  f.bar._input.value='needle';await f.bar._doSearch('needle');
  expect(f.bar._runShortcutAction('content.toggle')).toBe(true);expect(f.bar._contentHitControls.every(control=>!control.isExpanded())).toBe(true);
  expect(f.bar._runShortcutAction('content.toggle')).toBe(true);expect(f.bar._contentHitControls.every(control=>control.isExpanded())).toBe(true);
  expect(f.bar._runShortcutAction('view.page')).toBe(true);await settle();expect(f.opened).toHaveLength(1);
  expect(f.bar._runShortcutAction('sort.open')).toBe(true);expect(f.bar._resultToolView).toBe('sort');expect(f.bar._runShortcutAction('mode.web')).toBe(false);
  expect(f.bar._runShortcutAction('tool.back')).toBe(true);expect(f.bar._resultToolView).toBe('results');expect(f.bar._runShortcutAction('tool.back')).toBe(false);
  expect(f.bar._runShortcutAction('filter.open')).toBe(true);expect(f.bar._resultToolView).toBe('filter');f.bar._runShortcutAction('tool.back');
  expect(f.bar._runShortcutAction('options.toggle')).toBe(true);expect(f.bar._vaultPanelOpen).toBe(true);f.bar._runShortcutAction('options.toggle');expect(f.bar._vaultPanelOpen).toBe(false);
  expect(f.bar._runShortcutAction('search.execute')).toBe(true);await settle();expect(f.errors).toEqual([]);
 }finally{await f.cleanup();}
});

test('shortcut dispatch respects input/search scopes, modifiers, editable fields and open menus',async()=>{
 const f=await searchbarFixture({searchShortcuts:[{id:'next',action:'result.next',shortcut:'Ctrl+J',enabled:true,scope:'search',reverse:true},{id:'clear',action:'query.clear',shortcut:'Ctrl+K',enabled:true,scope:'input',reverse:false}]});try{
  f.bar._input.value='needle';await f.bar._doSearch('needle');f.bar._input.focus();await settle();
  const key=(value:string,options:KeyboardEventInit={})=>new f.env.window.KeyboardEvent('keydown',{key:value,ctrlKey:true,bubbles:true,cancelable:true,...options});
  const forward=key('j');f.bar._input.dispatchEvent(forward);expect(forward.defaultPrevented).toBe(true);expect(f.bar._activeIdx).toBe(0);
  const reverse=key('j',{shiftKey:true});f.bar._input.dispatchEvent(reverse);expect(reverse.defaultPrevented).toBe(true);expect(f.bar._activeIdx).toBe(1);
  const composing=key('j',{isComposing:true});expect(f.bar._dispatchShortcut(composing)).toBe(false);
  f.bar._sortButton.buttonEl.focus();const fromTool=key('j');f.bar._sortButton.buttonEl.dispatchEvent(fromTool);expect(fromTool.defaultPrevented).toBe(true);
  const inputOnly=key('k');f.bar._sortButton.buttonEl.dispatchEvent(inputOnly);expect(inputOnly.defaultPrevented).toBe(false);expect(f.bar._input.value).toBe('needle');
  const field=f.bar._dropdown.createEl('input');field.focus();expect(f.bar._dispatchShortcut(key('j'))).toBe(false);
  const outside=f.env.document.body.createEl('button');outside.focus();expect(f.bar._dispatchShortcut(key('j'))).toBe(false);
  f.bar._input.focus();await settle();f.bar._categoryMenu?.show();expect(f.bar._dispatchShortcut(key('j'))).toBe(false);f.bar._categoryMenu?.close();
  const consumed=key('j');consumed.preventDefault();expect(f.bar._dispatchShortcut(consumed)).toBe(false);
  f.bar._input.dispatchEvent(key('k'));await settle();expect(f.bar._input.value).toBe('');expect(f.bar._runShortcutAction('query.clear')).toBe(false);
  expect(f.errors).toEqual([]);
 }finally{await f.cleanup();}
});

test('idle and mode shortcuts reject unavailable state and change actual modes and record views',async()=>{
 const f=await searchbarFixture({recentFilesEnabled:true});try{
  expect(f.bar._runShortcutAction('records.recent')).toBe(true);await settle();expect(f.bar._idleView).toBe('recent');
  expect(f.bar._runShortcutAction('records.history')).toBe(true);await settle();expect(f.bar._idleView).toBe('history');
  expect(f.bar._runShortcutAction('search.execute')).toBe(false);expect(f.bar._runShortcutAction('view.page')).toBe(false);expect(f.bar._runShortcutAction('content.toggle')).toBe(false);
  for(const mode of ['web','global','vault'] as const){expect(f.bar._runShortcutAction('mode.'+mode as 'mode.web')).toBe(true);expect(f.bar._mode).toBe(mode);}
  f.bar._input.value='needle';expect(f.bar._runShortcutAction('records.history')).toBe(false);
  f.bar._selectMode('web',false);await f.bar._doSearch('needle');expect(f.bar._runShortcutAction('filter.open')).toBe(false);expect(f.bar._runShortcutAction('sort.open')).toBe(false);
  f.bar._hideDropdown();expect(f.bar._runShortcutAction('result.activate')).toBe(false);expect(f.bar._runShortcutAction('page.next')).toBe(false);
 }finally{await f.cleanup();}
});
