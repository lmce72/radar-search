import {mock} from 'bun:test';
import {strict as assert} from 'node:assert';
import type {App,PluginManifest,Component} from 'obsidian';
import type {SearchMountOptions,SearchSession} from '../../src/types.ts';
class Owner {
 callbacks:Array<()=>void>=[];
 register(callback:()=>void){this.callbacks.push(callback);}
 addChild(child:Owner){return child;}
 removeChild(child:Owner){child.unload();return child;}
 unload(){for(const callback of this.callbacks.splice(0))callback();}
}
const instances:Bar[]=[];
let renderPlan:()=>Promise<void>=async()=>{},sessionPlan:()=>Promise<void>=async()=>{},sessionCalls=0;
class Bar extends Owner {
 _disposed=false;
 _input=Object.assign(new EventTarget(),{value:'',focus(){}});
 restoreKey:string|undefined;
 constructor(_plugin:unknown,public container:HTMLElement,options:SearchMountOptions){super();this.restoreKey=options.restoreKey;instances.push(this);}
 async render(){await renderPlan();}
 async applySearchSession(){sessionCalls++;await sessionPlan();}
 getSearchSession(){return {query:''};}
 _doSearch(){}
 override unload(){this._disposed=true;super.unload();}
}
mock.module('obsidian',()=>({Plugin:Owner,ItemView:Owner,MarkdownRenderChild:Owner,Component:Owner,Notice:class {},Platform:{isMobile:false},normalizePath:(s:string)=>s}));
mock.module('../../src/ui/search-bar.ts',()=>({SearchBarComponent:Bar}));
mock.module('../../src/ui/floating-search.ts',()=>({FloatingSearch:class {}}));
mock.module('../../src/settings/tab.ts',()=>({SearchSettingTab:class {}}));
mock.module('../../src/ui/new-tab-entry.ts',()=>({NewTabEntry:class {}}));
mock.module('../../src/shared/plugin-icon.ts',()=>({PLUGIN_ICON_ID:'test',registerPluginIcon(){}}));
const {default:Plugin}=await import('../../src/main.ts');
const plugin=new Plugin({} as App,{} as PluginManifest);plugin.components=new Map();plugin._stopping=false;
const errors:unknown[][]=[];plugin.report=(_level,...args)=>{errors.push(args);};
const container={querySelectorAll:()=>[]} as unknown as HTMLElement,owner=new Owner() as unknown as Component;
function deferred(){let resolve!:()=>void,reject!:(error:Error)=>void;const promise=new Promise<void>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
const tick=async()=>{await Promise.resolve();await Promise.resolve();};
const scenario=process.argv[2];
if(scenario==='stale-failure'){
 const gate=deferred();let calls=0;renderPlan=()=>++calls===1?gate.promise:Promise.resolve();
 const first=plugin.mount(container,owner).catch(()=>null);await tick();const latest=await plugin.mount(container,owner);
 gate.reject(Error('Old render failed'));await first;
 assert.equal(plugin.components.get(container)?.component,latest);assert.equal(latest._disposed,false);assert.equal(errors.length,0);
}else if(scenario==='stale-session'){
 const gate=deferred();renderPlan=()=>gate.promise;
 const pending=plugin.mount(container,owner,{session:{} as SearchSession});await tick();plugin.unmount(container);gate.resolve();await pending;
 assert.equal(sessionCalls,0);assert.equal(plugin.components.size,0);
}else if(scenario==='session-owner'){
 const gate=deferred();sessionPlan=()=>gate.promise;
 const first=plugin.mount(container,owner,{restoreKey:'block',session:{} as SearchSession});await new Promise(resolve=>setTimeout(resolve,0));
 plugin.unmount(container);const latest=await plugin.mount(container,owner);gate.resolve();await first;
 assert.equal(instances[0].callbacks.length,0);assert.equal(plugin.components.get(container)?.component,latest);
}else if(scenario==='pending-owner'){
 const a=deferred(),b=deferred();let calls=0;renderPlan=()=>++calls===1?a.promise:b.promise;
 const first=plugin.mount(container,owner);await tick();const latest=plugin.mount(container,owner);await tick();a.resolve();await first;
 const state=plugin as unknown as {mounting:{has:(container:HTMLElement)=>boolean}};
 assert.equal(state.mounting.has(container),true);b.resolve();await latest;assert.equal(state.mounting.has(container),false);
}else if(scenario==='current-failure'){
 renderPlan=async()=>{throw Error('Current render failed');};await assert.rejects(plugin.mount(container,owner),/Current render failed/);
 assert.equal(plugin.components.size,0);assert.equal(instances[0]._disposed,true);assert.equal(errors.length,1);
}else throw Error('Unknown scenario');
