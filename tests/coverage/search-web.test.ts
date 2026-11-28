import {test,expect} from 'bun:test';
import {installObsidianMock,sdkState} from '../helpers/obsidian-host.ts';
import type {SearchBarCtor} from '../../src/ui/search-bar-host.ts';
import type {SearchEngine,SearchGroup} from '../../src/types.ts';
installObsidianMock();
const {withWebSearch}=await import('../../src/search/web-search.ts');
const Base=class {} as unknown as SearchBarCtor;
const engine=(id:string,suggest=''):SearchEngine=>({id,name:id,url:'https://example.com/{q}?again={q}',suggest,enabled:true});
function fixture(){const opened:string[]=[],history:unknown[]=[],renders:SearchGroup[][]=[];const input={value:'',focus(){},setSelectionRange(){}};const bar=Object.assign(new (withWebSearch(Base))(),{cfg:{engines:[]},_mode:'global',_preferredResultCategory:'files',_input:input,_recordHistory:(...args:unknown[])=>history.push(args),_openUrl:(url:string)=>opened.push(url),_syncClearBtn(){},_onInput(){},_log(){},_isWebStale:()=>false,_renderDropdown:(groups:SearchGroup[])=>renders.push(groups)});return {bar,opened,history,renders,input};}
const settle=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve();};
test('engine selection ignores disabled and unknown engines; empty search clears existing groups',async()=>{
 const {bar,renders}=fixture();bar.cfg.engines=[engine('a'),{...engine('b'),enabled:false}];expect(bar._resolveWebEngines().map(e=>e.id)).toEqual(['a']);bar._activeEngineId='b';expect(bar._resolveWebEngines()).toEqual([]);await bar._searchWeb('q');expect(renders).toEqual([[]]);expect(bar._webSearchVer).toBe(1);
});
test('late suggestions preserve configured provider order and navigate using encoded literals',async()=>{
 const {bar,opened,history,input}=fixture();const pending=new Map<string,(response:{json:unknown})=>void>();sdkState.requestUrl=request=>new Promise(resolve=>pending.set((request as {url:string}).url,resolve));const updates:SearchGroup[][]=[];
 bar._buildWebGroups('a&中',[engine('google','https://google.test/{q}'),engine('bing','https://bing.test/{q}')],()=>false,groups=>updates.push(groups));
 pending.get('https://bing.test/a%26%E4%B8%AD')({json:{AS:{Results:[{Suggests:[{Txt:'second'},null,{}]}]}}});await settle();expect(updates.at(-1).map(g=>g.title)).toEqual(['bing']);
 pending.get('https://google.test/a%26%E4%B8%AD')({json:['q',['first',null,'',5]]});await settle();expect(updates.at(-1).map(g=>g.title)).toEqual(['google','bing']);updates.at(-1)[0].items[0].action();expect(input.value).toBe('first');expect(opened).toEqual(['https://example.com/first?again=first']);expect(history).toEqual([['google','first',{kind:'url',url:opened[0]}]]);
});
test('failed, empty and text-only suggestion payloads fall back without hiding direct search',async()=>{
 for(const response of [async()=>{throw Error('offline');},async()=>({json:['q',[]]}),async()=>({text:'invalid json'}),async()=>({text:JSON.stringify(['q',['text-only']])})]){
  sdkState.requestUrl=response;const {bar,opened}=fixture(),updates:SearchGroup[][]=[];bar._buildWebGroups('a b',[engine('custom','https://suggest/{q}')],()=>false,g=>updates.push(g));await settle();expect(updates.at(-1)).toHaveLength(1);updates.at(-1)[0].items[0].action();expect(opened[0]).toContain('https://example.com/');expect(opened[0]).not.toContain(' ');
 }
});
test('obsolete provider responses never render a stale list',async()=>{
 const {bar}=fixture();let resolve:(response:{json:unknown})=>void;let stale=false;let called=0;sdkState.requestUrl=()=>new Promise(done=>{resolve=done;});bar._buildWebGroups('q',[engine('google','https://suggest/{q}')],()=>stale,()=>called++);stale=true;resolve({json:['q',['answer']]});await settle();expect(called).toBe(0);
});
test('syntax completion only appears when Web category is active and keeps search open',()=>{
 const {bar,input}=fixture();const updates:SearchGroup[][]=[];bar._buildWebGroups('site:',[engine('plain')],()=>false,g=>updates.push(g));expect(updates.at(-1).some(g=>g.title==='Web 语法补全')).toBe(false);bar._mode='web';bar._buildWebGroups('sit',[engine('plain')],()=>false,g=>updates.push(g));const syntax=updates.at(-1).find(g=>g.title==='Web 语法补全');expect(syntax?.items.length).toBeGreaterThan(0);expect(syntax.items[0].keepOpen).toBe(true);syntax.items[0].action();expect(input.value).toContain('site:');expect(bar._suppressHistoryFocus).toBe(true);
});
