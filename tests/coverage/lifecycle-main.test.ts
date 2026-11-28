import {expect,test,spyOn} from 'bun:test';
import {Component,type App} from 'obsidian';
import RadarSearchPlugin from '../../src/main.ts';
import {HistoryStore} from '../../src/history/store.ts';
import {RecentFilesStore} from '../../src/history/recent-files.ts';
import {searchbarFixture} from '../helpers/searchbar-fixture.ts';

function deferred(){let resolve!:()=>void;const promise=new Promise<void>(done=>{resolve=done;});return {promise,resolve};}

for(const phase of ['settings','history','recent'] as const)test(`plugin unload during ${phase} initialization prevents later host registrations`,async()=>{
 const f=await searchbarFixture(),gate=deferred();
 const plugin=new RadarSearchPlugin(f.app as unknown as App,{id:'primecore-search',name:'Radar Search',version:'2.0.7',minAppVersion:'1.13.0',author:'Test',description:'Test plugin.',isDesktopOnly:false});
 const registrations:string[]=[];
 const command=spyOn(plugin,'addCommand').mockImplementation(value=>{registrations.push(value.id);return value;});
 let restore:()=>void=()=>{};
 if(phase==='settings')plugin.loadData=async()=>{await gate.promise;return {};};
 else if(phase==='history'){const initialize=HistoryStore.prototype.initialize;const spy=spyOn(HistoryStore.prototype,'initialize').mockImplementation(async function(this:HistoryStore){await gate.promise;return initialize.call(this);});restore=()=>spy.mockRestore();}
 else {const configure=RecentFilesStore.prototype.configure;const spy=spyOn(RecentFilesStore.prototype,'configure').mockImplementation(async function(this:RecentFilesStore){await gate.promise;return configure.call(this);});restore=()=>spy.mockRestore();}
 try{
  const onload=plugin.onload.bind(plugin);let loading!:Promise<void>;plugin.onload=()=>loading=onload();plugin.load();
  for(let at=0;at<30;at++)await Promise.resolve();plugin.unload();gate.resolve();await loading;
  expect(plugin._stopping).toBe(true);expect(registrations).toEqual([]);expect(plugin.newTabEntry).toBeUndefined();expect(plugin.components.size).toBe(0);
 }finally{gate.resolve();restore();command.mockRestore();plugin.unload();await f.cleanup();}
});

test('plugin unload cancels active-file recording after delayed quick-switcher backfill',async()=>{
 const f=await searchbarFixture(),gate=deferred();
 const plugin=new RadarSearchPlugin(f.app as unknown as App,{id:'primecore-search',name:'Radar Search',version:'2.0.7',minAppVersion:'1.13.0',author:'Test',description:'Test plugin.',isDesktopOnly:false});
 const synchronize=spyOn(RecentFilesStore.prototype,'syncQuickSwitcher').mockImplementation(async()=>{await gate.promise;return 0;});
 const record=spyOn(RecentFilesStore.prototype,'record').mockImplementation(()=>{});
 try{
  const onload=plugin.onload.bind(plugin);let loading!:Promise<void>;plugin.onload=()=>loading=onload();plugin.load();await loading;
  expect(synchronize).toHaveBeenCalledTimes(1);plugin.unload();gate.resolve();for(let at=0;at<20;at++)await Promise.resolve();expect(record).not.toHaveBeenCalled();
 }finally{gate.resolve();synchronize.mockRestore();record.mockRestore();plugin.unload();await f.cleanup();}
});

test('main mount restores embedded query, applies page session, refreshes and releases owned bars',async()=>{
 const f=await searchbarFixture(),owner=new Component();owner.load();
 const initialFloats=document.querySelectorAll('[data-sb-float]').length;
 const plugin=new RadarSearchPlugin(f.app as unknown as App,{id:'primecore-search',name:'Radar Search',version:'2.0.7',minAppVersion:'1.13.0',author:'Test',description:'Test plugin.',isDesktopOnly:false});
 plugin.loadData=async()=>f.plugin.settings;
 const onload=plugin.onload.bind(plugin);let loading!:Promise<void>;plugin.onload=()=>loading=onload();plugin.load();await loading;
 const container=document.body.createDiv(),page=document.body.createDiv();
 try{
  const first=await plugin.mount(container,owner,{restoreKey:'example:1'});first._input.value='needle';first._input.dispatchEvent(new Event('input'));await first._doSearch('needle');
  const session=first.getSearchSession();plugin.unmount(container);expect(first._disposed).toBe(true);expect(plugin.components.size).toBe(0);
  const restored=await plugin.mount(container,owner,{restoreKey:'example:1'});expect(restored._input.value).toBe('needle');expect(container.querySelectorAll(':scope > .primecore-search-root')).toHaveLength(1);
  const pageBar=await plugin.mount(page,owner,{presentation:'page',session});expect(pageBar.presentation).toBe('page');expect(pageBar._input.value).toBe('needle');expect(pageBar._lastGroups.length).toBeGreaterThan(0);
  await plugin.updateSettings({defaultExpandContent:true},true);expect(plugin.components.size).toBe(2);expect(restored._disposed).toBe(true);expect(pageBar._disposed).toBe(true);
  for(const {component} of plugin.components.values()){expect(component.cfg.defaultExpandContent).toBe(true);expect(component._input.value).toBe('needle');}
  plugin.unload();expect(plugin.components.size).toBe(0);expect(document.querySelectorAll('[data-sb-float]')).toHaveLength(initialFloats);
 }finally{owner.unload();plugin.unload();await f.cleanup();}
});
