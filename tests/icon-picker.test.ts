import {test,expect} from 'bun:test';
import {filterIconIds} from '../src/settings/icon-filter.ts';

test('icon picker search is case-insensitive, trimmed and keeps registration order',()=>{
  const ids=['folder','book-open','file-text','File-Code'];
  expect(filterIconIds(ids,'FILE')).toEqual(['file-text','File-Code']);
  expect(filterIconIds(ids,'  open ')).toEqual(['book-open']);
  expect(filterIconIds(ids,'')).toEqual(ids);
  expect(filterIconIds(ids,'missing')).toEqual([]);
});
