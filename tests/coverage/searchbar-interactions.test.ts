import {test,expect} from 'bun:test';
import {searchbarFixture} from '../helpers/searchbar-fixture.ts';
import type {SearchGroup} from '../../src/types.ts';
const settle=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};

test('complete search bar restores sessions without persisting local options and opens a page snapshot',async()=>{
 const f=await searchbarFixture();try{
  const session=f.bar.getSearchSession();session.query='needle';session.category='content';session.temporaryOptions=true;
  session.settings.searchCommands=true;session.quickExcludedPaths=['Other'];
  await f.bar.applySearchSession(session);
  expect(f.bar._input.value).toBe('needle');expect(f.bar._searchCommands).toBe(true);
  expect(f.plugin.settings.searchCommands).toBe(false);expect(f.bar._resultCategory).toBe('content');
  const copy=f.bar.getSearchSession();copy.settings.searchCommands=false;copy.quickExcludedPaths.push('Docs');
  expect(f.bar._searchCommands).toBe(true);expect(f.bar._quickExcludedPaths).toEqual(['Other']);
  f.bar._openResultsPage();await settle();expect(f.opened).toHaveLength(1);
  expect(f.opened[0]).toMatchObject({query:'needle',temporaryOptions:true,category:'content'});expect(f.errors).toEqual([]);
 }finally{await f.cleanup();}
});

test('source choices persist when leaving temporary mode and keep a failed draft retryable',async()=>{
 const f=await searchbarFixture();try{
  await f.bar._setTemporarySearchOptions(true);await f.bar._setSourceEnabled('searchCommands',true);
  expect(f.plugin.settings.searchCommands).toBe(false);expect(f.bar._searchCommands).toBe(true);
  const save=f.plugin.updateSettings.bind(f.plugin);f.plugin.updateSettings=async()=>{throw Error('disk full');};
  await f.bar._setTemporarySearchOptions(false);expect(f.bar._temporarySearchOptions).toBe(true);expect(f.bar._searchCommands).toBe(true);
  f.plugin.updateSettings=save;await f.bar._setTemporarySearchOptions(false);
  expect(f.bar._temporarySearchOptions).toBe(false);expect(f.plugin.settings.searchCommands).toBe(true);
  await f.bar._setSourceEnabled('searchCommands',false);expect(f.plugin.settings.searchCommands).toBe(false);
 }finally{await f.cleanup();}
});

test('result navigation starts at absolute ends, loops, opens chosen row and ignores IME composition',async()=>{
 const f=await searchbarFixture();try{
  let chosen=-1;f.bar._input.value='result';
  const groups:SearchGroup[]=[{title:'Vault 文件',items:Array.from({length:3},(_,i)=>({label:'result '+i,twoLine:true,path:'doc'+i+'.md',action:()=>{chosen=i;}}))}];
  f.bar._renderDropdown(groups);expect(f.bar._itemEls).toHaveLength(3);
  const key=(name:string,options:KeyboardEventInit={})=>f.bar._handleKey(new f.env.window.KeyboardEvent('keydown',{key:name,...options}));
  key('ArrowDown',{isComposing:true});expect(f.bar._activeIdx).toBe(-1);
  key('ArrowUp');expect(f.bar._activeIdx).toBe(2);key('ArrowDown');expect(f.bar._activeIdx).toBe(0);
  key('ArrowDown');key('Enter');expect(chosen).toBe(1);expect(f.bar._dropdown.style.display).toBe('none');
  expect(f.errors).toEqual([]);
 }finally{await f.cleanup();}
});

test('sort and filter tool return preserves results and scroll; applying exclusions changes candidates',async()=>{
 const f=await searchbarFixture();try{
  f.bar._input.value='needle';await f.bar._doSearch('needle');const groups=f.bar._lastGroups;f.bar._dropdownInner.scrollTop=77;
  f.bar._openSortView();expect(f.bar._resultToolView).toBe('sort');expect(f.bar._dropdownInner.querySelectorAll('.primecore-sort-option').length).toBe(7);
  f.bar._returnToResults();expect(f.bar._lastGroups).toEqual(groups);expect(f.bar._dropdownInner.scrollTop).toBe(77);
  f.bar._openFilterView(false,'Docs/Note.md');expect(f.bar._resultToolView).toBe('filter');
  const exclude=f.bar._dropdownInner.querySelector<HTMLButtonElement>('button[aria-label="排除当前文件"]');expect(exclude).not.toBeNull();exclude!.click();
  expect(f.bar._filterDraft.paths).toContain('path:Docs/Note.md');
  f.bar._dropdownInner.querySelector<HTMLButtonElement>('button[aria-label="应用"]')!.click();await settle();
  expect(f.bar._temporaryFilter?.paths).toContain('path:Docs/Note.md');await f.bar._doSearch('needle');
  expect(f.bar._lastGroups.flatMap(group=>group.items).some(item=>item.path==='Docs/Note.md')).toBe(false);expect(f.errors).toEqual([]);
 }finally{await f.cleanup();}
});
