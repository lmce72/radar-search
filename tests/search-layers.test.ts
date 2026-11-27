import {test,expect} from 'bun:test';
import {ownsSearchTarget} from '../src/ui/search-layers.ts';
import type {SearchBarFields} from '../src/ui/search-bar-host.ts';

test('record-menu presses belong to the search interface while unrelated menus remain outside',()=>{
 const child={} as Node;const outside={} as Node;
 const menu={contains:(target:Node)=>target===child} as HTMLElement;
 const host={_idleMenuEl:menu} as SearchBarFields;
 expect(ownsSearchTarget(host,child)).toBe(true);expect(ownsSearchTarget(host,outside)).toBe(false);
 host._idleMenuEl=null;expect(ownsSearchTarget(host,child)).toBe(false);

});
