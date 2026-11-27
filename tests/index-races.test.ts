import {test,expect} from 'bun:test';
import {createSearchIndexEngine} from '../src/search/index-engine.ts';
import type {IndexFile} from '../src/search/types.ts';

function deferred<T>() {let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return {promise,resolve};}
function fixture(){
  const files=new Map<string,IndexFile>([['base.md',{path:'base.md',basename:'Base'}]]);
  let read=(path:string)=>Promise.resolve(path==='base.md'?'baseline':'originalbody');
  const events=new Map<string,(file:{path?:string},oldPath?:string)=>void>();
  const engine=createSearchIndexEngine();
  engine.attachApp({vault:{on:(name,fn)=>{events.set(name,fn);return fn;},offref:()=>{}}});
  const adapter={listFiles:()=>[...files.values()],fileFor:(path:string)=>files.get(path)||null,readText:(path:string)=>read(path),getMeta:()=>null};
  return {engine,files,events,adapter,setRead:(fn:typeof read)=>{read=fn;}};
}
test('a late incremental read cannot overwrite a newer edit',async()=>{
  const f=fixture();await f.engine.init(f.adapter);const old=deferred<string>();
  f.files.set('edit.md',{path:'edit.md',basename:'Edit'});f.setRead(()=>old.promise);
  const first=f.engine.addPaths(['edit.md']);f.setRead(async()=> 'newestbody');await f.engine.addPaths(['edit.md']);
  old.resolve('obsoletebody');await first;
  try{expect(f.engine.search('newestbody').results).toHaveLength(1);expect(f.engine.search('obsoletebody').results).toHaveLength(0);}finally{f.engine.dispose();}
});
test('delete during incremental reading cannot resurrect a document',async()=>{
  const f=fixture();await f.engine.init(f.adapter);const pending=deferred<string>();f.files.set('gone.md',{path:'gone.md',basename:'Gone'});f.setRead(()=>pending.promise);
  const read=f.engine.addPaths(['gone.md']);f.files.delete('gone.md');f.engine.removePaths(['gone.md']);pending.resolve('ghostbody');await read;
  try{expect(f.engine.search('ghostbody').results).toHaveLength(0);}finally{f.engine.dispose();}
});
test('delete during the initial build cannot publish a stale base document',async()=>{
  const f=fixture(),pending=deferred<string>();f.setRead(()=>pending.promise);const build=f.engine.init(f.adapter);
  f.files.delete('base.md');f.engine.removePaths(['base.md']);pending.resolve('ghostbody');await build;
  try{expect(f.engine.search('ghostbody').results).toHaveLength(0);}finally{f.engine.dispose();}
});
test('failed incremental reads remain queued and recover on the next flush',async()=>{
  const f=fixture();await f.engine.init(f.adapter);f.setRead(async()=>{throw Error('temporarily unavailable');});f.engine.queueReindex(['base.md']);await f.engine.flushReindex();
  try{expect(f.engine.pendingReindex).toBe(1);f.setRead(async()=> 'recoveredbody');await f.engine.flushReindex();expect(f.engine.pendingReindex).toBe(0);expect(f.engine.search('recoveredbody').results).toHaveLength(1);}finally{f.engine.dispose();}
});
test('folder rename and delete invalidate every indexed descendant',async()=>{
  const f=fixture();f.files.set('Folder/Child.md',{path:'Folder/Child.md',basename:'Child'});await f.engine.init(f.adapter);
  f.files.delete('Folder/Child.md');f.files.set('Renamed/Child.md',{path:'Renamed/Child.md',basename:'Child'});f.events.get('rename')({path:'Renamed'},'Folder');
  // Wait only for the synthetic read and delta freeze, not wall-clock I/O.
  await new Promise(resolve=>setTimeout(resolve,10));
  try{expect(f.engine.search('Child').results.map(hit=>hit.path)).toEqual(['Renamed/Child.md']);f.files.delete('Renamed/Child.md');f.events.get('delete')({path:'Renamed'});expect(f.engine.search('Child').results).toHaveLength(0);}finally{f.engine.dispose();}
});
test('scheduled delta compaction cannot rebuild after disposal',async()=>{
  const f=fixture();await f.engine.init(f.adapter);const paths=Array.from({length:201},(_,i)=>'new-'+i+'.md');for(const path of paths)f.files.set(path,{path,basename:path});
  await f.engine.addPaths(paths);f.engine.dispose();await new Promise(resolve=>setTimeout(resolve,20));
  expect(f.engine.state).toBe('idle');expect(f.engine.search('originalbody').ready).toBe(false);
});
