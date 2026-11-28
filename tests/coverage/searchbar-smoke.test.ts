import {test,expect} from 'bun:test';
import {searchbarFixture} from '../helpers/searchbar-fixture.ts';

test('complete search bar mounts, searches real fixture text and releases floating layers',async()=>{
 const f=await searchbarFixture();try{
  expect(f.bar._input.isConnected).toBe(true);f.bar._input.value='needle';await f.bar._doSearch('needle');
  expect(f.bar._lastGroups.find(group=>group.title==='内容匹配')?.items).toHaveLength(2);expect(f.errors).toEqual([]);
  f.bar.unload();expect(f.bar._disposed).toBe(true);expect(f.env.document.querySelector('[data-sb-float]')).toBeNull();
 }finally{await f.cleanup();}
});

test('page presentation keeps query results inline while child controls change',async()=>{
 const f=await searchbarFixture({},'page');try{
  f.bar._input.value='needle';await f.bar._doSearch('needle');
  expect(f.container.contains(f.bar._dropdown)).toBe(true);expect(f.bar._dropdown.hasClass('primecore-results-inline')).toBe(true);
  f.bar._hideDropdown();expect(f.bar._dropdown.style.display).toBe('flex');
  f.bar._openSortView();f.bar._returnToResults();expect(f.bar._resultToolView).toBe('results');expect(f.bar._lastGroups.some(group=>group.items.length)).toBe(true);
  expect(f.errors).toEqual([]);
 }finally{await f.cleanup();}
});
