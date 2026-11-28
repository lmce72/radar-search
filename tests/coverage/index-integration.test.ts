import {test,expect} from 'bun:test';
import {searchbarFixture} from '../helpers/searchbar-fixture.ts';
import {createSearchIndexEngine} from '../../src/search/index-engine.ts';
import type {SearchHit} from '../../src/search/types.ts';

const settle=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
test('excluded oversized notes never consume initial or incremental body budgets',async()=>{
 const files=[{path:'skip/large.md',basename:'Large',extension:'md',stat:{mtime:0,size:64*1024*1024}},{path:'keep.md',basename:'Keep',extension:'md',stat:{mtime:0,size:100}}],reads:string[]=[];
 const engine=createSearchIndexEngine();try{
  await engine.init({listFiles:()=>files,fileFor:path=>files.find(file=>file.path===path)||null,isExcluded:path=>path.startsWith('skip/'),readText:async(path)=>{reads.push(path);return 'needle';},getMeta:()=>null});
  expect(engine.state).toBe('ready');expect(reads).toEqual(['keep.md']);expect(engine.search('needle').results.map(row=>row.path)).toEqual(['keep.md']);
  await engine.addPaths(['skip/large.md']);expect(engine.state).toBe('ready');expect(reads).toEqual(['keep.md']);
 }finally{engine.dispose();}
});

test('index queries reject disabled or failed engines and enforce current path filters',async()=>{
 const f=await searchbarFixture();try{
  expect(f.bar._indexEngine()).toBeNull();f.bar.cfg.searchIndex.enabled=true;
  expect(f.bar._indexQuery('needle')).toBeNull();
  await f.plugin.indexEngine.init({listFiles:()=>f.files,fileFor:path=>f.files.find(file=>file.path===path)||null,readText:async(path)=>f.text.get(path)||'',getMeta:()=>null});
  f.bar._temporaryFilter={mode:'黑名单',paths:['path:Docs/Note.md']};
  const result=f.bar._indexQuery('needle');expect(result?.results.map(row=>row.path)).toEqual(['Other/Second.md']);
  const search=f.plugin.indexEngine.search;f.plugin.indexEngine.search=()=>{throw Error('index failed');};
  expect(f.bar._indexQuery('needle')).toBeNull();expect(f.errors.at(-1)?.[0]).toContain('索引查询失败');f.plugin.indexEngine.search=search;
 }finally{await f.cleanup();}
});

test('engine hit conversion drops missing files and content summaries cancel queued reads',async()=>{
 const f=await searchbarFixture();try{
  const rows=f.files.map((file,index)=>({path:file.path,score:index+1,contentScore:10-index})) as SearchHit[];
  rows.push({path:'missing.md',score:1,contentScore:1} as SearchHit);
  const items=f.bar._itemsFromEngineHits(rows,['needle']);expect(items).toHaveLength(3);items[0].action();await settle();expect(f.opened).toHaveLength(1);
  f.bar._input.value='needle';const ver=++f.bar._vaultSearchVer;
  const contents=await f.bar._contentItemsFromEngine(rows,['needle'],35,ver);expect(contents).toHaveLength(2);expect(contents.every(item=>item.hits.length>0)).toBe(true);
  expect(contents[0].score).toBeGreaterThanOrEqual(contents[1].score);
  let reads=0;const original=f.app.vault.read;f.app.vault.read=async(file)=>{reads++;++f.bar._vaultSearchVer;return original(file);};
  expect(await f.bar._contentItemsFromEngine(rows,['needle'],35,f.bar._vaultSearchVer)).toEqual([]);expect(reads).toBe(1);
 }finally{await f.cleanup();}
});

test('adapter preserves uppercase Markdown bodies and blur flushes queued edits',async()=>{
 const f=await searchbarFixture();try{
  f.files[0].extension='MD';f.bar.cfg.searchIndex.enabled=true;f.bar._setupIndexEngine();
  const engine=f.plugin.indexEngine;
  while(engine.state==='building')await new Promise(resolve=>setTimeout(resolve,1));
  expect(engine.state).toBe('ready');expect(engine.search('needle').results.some(row=>row.path===f.files[0].path&&row.contentScore>0)).toBe(true);
  f.text.set(f.files[0].path,'freshword');engine.queueReindex([f.files[0].path]);f.env.window.dispatchEvent(new f.env.window.Event('blur'));await settle();
  expect(engine.pendingReindex).toBe(0);expect(engine.search('freshword').results.map(row=>row.path)).toEqual([f.files[0].path]);
  f.bar._teardownIndexFlush();engine.queueReindex([f.files[0].path]);f.env.window.dispatchEvent(new f.env.window.Event('blur'));await settle();expect(engine.pendingReindex).toBe(1);
 }finally{await f.cleanup();}
});

test('incremental metadata failures retain a retry so aliases can recover',async()=>{
 const file={path:'note.md',basename:'Note',extension:'md'};let fail=false;
 const engine=createSearchIndexEngine();try{
  await engine.init({listFiles:()=>[file],fileFor:()=>file,readText:async()=>'',getMeta:()=>{if(fail)throw Error('temporary metadata failure');return {frontmatter:{aliases:['RecoveredAlias']}};}});
  fail=true;await engine.addPaths([file.path]);expect(engine.pendingReindex).toBe(1);
  fail=false;await engine.flushReindex();expect(engine.search('RecoveredAlias').results).toHaveLength(1);
 }finally{engine.dispose();}
});

test('index flush failures remain contained and detached orphan bars clean up',async()=>{
 const f=await searchbarFixture();try{
  f.bar.cfg.searchIndex.enabled=true;f.bar._setupIndexEngine();
  while(f.plugin.indexEngine.state==='building')await new Promise(resolve=>setTimeout(resolve,1));
  const warnings:unknown[][]=[];f.bar._log=(...args)=>warnings.push(args);
  f.plugin.indexEngine.flushReindex=async()=>{throw Error('locked');};f.bar._indexBlurHandler!();await settle();expect(warnings.some(args=>args.includes('Index refresh failed'))).toBe(true);
  f.bar._wrap.remove();f.bar._indexBlurHandler!();expect(f.bar._cleanedUp).toBe(true);expect(f.bar._dropdown.isConnected).toBe(false);
 }finally{await f.cleanup();}
});
