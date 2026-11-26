import {test,expect} from 'bun:test';
import {recentDateView} from '../src/history/recent-files.ts';

const today='2026-11-26';
const at=(day:number,hour=10)=>new Date(2026,10,day,hour).getTime();

test('recent date view locks to today when no record predates today',()=>{
  expect(recentDateView([],today,today,false)).toMatchObject({oldest:today,onlyToday:true,selected:today,showAll:true,records:[]});
  const todayOnly=[{path:'A.md',ts:at(26)},{path:'B.md',ts:at(26,9)}];
  const view=recentDateView(todayOnly,today,today,false);
  expect(view).toMatchObject({oldest:today,onlyToday:true,selected:today,showAll:true});
  expect(view.records).toHaveLength(2);
});

test('recent date view filters by day and clamps requests to the retained range',()=>{
  const records=[{path:'Today.md',ts:at(26)},{path:'Yesterday.md',ts:at(25)},{path:'Older.md',ts:at(20)}];
  expect(recentDateView(records,'2026-11-25',today,false)).toMatchObject({oldest:'2026-11-20',onlyToday:false,selected:'2026-11-25',showAll:false});
  expect(recentDateView(records,'2026-11-25',today,false).records.map(record=>record.path)).toEqual(['Yesterday.md']);
  expect(recentDateView(records,'2026-11-01',today,false).selected).toBe('2026-11-20');
  expect(recentDateView(records,'2026-12-01',today,false).selected).toBe(today);
  expect(recentDateView(records,'2026-11-25',today,true)).toMatchObject({showAll:true,records});
});
