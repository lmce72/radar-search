import {test,expect} from 'bun:test';
import {parseHistoryRecords,parseHistoryTarget,sameHistoryTarget} from '../../src/history/records.ts';

const hit={text:'needle',match:'needle',before:'',after:'',start:0,end:6};
test('history parsing preserves valid rich destinations and drops malformed hit metadata only',()=>{
 const markdown={kind:'heading' as const,text:'needle',line:1,level:2,source:'## needle',language:'',callout:'',footnote:'',link:{target:'Other',label:'Other',external:false}};
 const target={kind:'file' as const,path:'Note.md',hit:{...hit,markdown,location:'第 1 行',preview:'needle',tag:{value:'work',field:'tags' as const}}};
 expect(parseHistoryTarget(target)).toEqual(target);
 for(const changes of [{markdown:{...markdown,line:0}},{markdown:{...markdown,level:7}},{markdown:{...markdown,source:123}},{markdown:{...markdown,link:{target:'Other',label:1,external:false}}},{preview:12},{location:{}},{tag:{value:2}},{tag:{value:'work',field:'title'}}]){
  expect(parseHistoryTarget({kind:'file',path:'Note.md',hit:{...hit,...changes}})).toEqual({kind:'file',path:'Note.md'});
 }
 for(const value of [null,[],{},'file',{kind:'file',path:''},{kind:'command',id:''},{kind:'url',url:'javascript:alert(1)'},{kind:'bookmark',bookmark:null}])expect(parseHistoryTarget(value)).toBeUndefined();
});
test('history ranges must describe actual forward integer source spans',()=>{
 for(const [start,end] of [[-1,4],[0,-1],[2,2],[3,2],[0.1,4],[0,4.1],[NaN,6],[0,Infinity]]){
  expect(parseHistoryTarget({kind:'file',path:'Note.md',hit:{...hit,start,end}})).toEqual({kind:'file',path:'Note.md'});
 }
});
test('bounded source anchors survive persistence and cannot escape the saved element span',()=>{
 const target={kind:'file' as const,path:'Note.md',hit:{...hit,start:0,end:10000,anchor:{start:9000,end:9006}}};
 expect(parseHistoryTarget(target)).toEqual(target);
 for(const anchor of [{start:-1,end:4},{start:10,end:9},{start:10,end:10},{start:0,end:10001},{start:1.5,end:6},{start:0,end:Infinity}])expect(parseHistoryTarget({...target,hit:{...target.hit,anchor}})).toEqual({kind:'file',path:'Note.md'});
});
test('bookmark groups retain safe children and stop at excessive recursion',()=>{
 const group={kind:'bookmark' as const,bookmark:{type:'group',title:'Group',items:[{type:'url',url:'https://example.com'},{path:'Note.md'},null,{}]}};
 expect(parseHistoryTarget(group)).toEqual({kind:'bookmark',bookmark:{type:'group',title:'Group',items:[{type:'url',url:'https://example.com'},{path:'Note.md'}]}});
 let nested:{type:string;items?:unknown[]}={type:'group'};for(let i=0;i<15;i++)nested={type:'group',items:[nested]};
 const parsed=parseHistoryTarget({kind:'bookmark',bookmark:nested});
 expect(JSON.stringify(parsed).match(/"type"/g)?.length).toBe(11);
});
test('records reject invalid containers but retain legacy query-only history with typed targets',()=>{
 expect(()=>parseHistoryRecords({})).toThrow('历史文件必须是数组');
 const valid={q:'query',mode:'vault' as const,ts:12,file:'Note',date:'2026-11-27',target:{kind:'command' as const,id:'plugin:command'}};
 expect(parseHistoryRecords([null,{q:'bad',mode:'other',ts:1},{...valid,ts:Infinity},valid,{q:'legacy',mode:'global',ts:0}])).toEqual([valid,{q:'legacy',mode:'global',ts:0,target:undefined}]);
 const first={q:'q',mode:'vault' as const,ts:1,target:{kind:'file' as const,path:'One.md'}};
 expect(sameHistoryTarget(first,{...first,ts:2})).toBe(true);expect(sameHistoryTarget(first,{...first,target:{kind:'file',path:'Two.md'}})).toBe(false);
});
