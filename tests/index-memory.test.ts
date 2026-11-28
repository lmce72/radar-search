import {test,expect} from 'bun:test';
import {createSearchIndexEngine} from '../src/search/index-engine.ts';
test('high-entropy corpora leave the index in a bounded fallback state',async()=>{
 const files=Array.from({length:8},(_,i)=>({path:`${i}.md`,basename:String(i),extension:'md'}));
 const engine=createSearchIndexEngine();await engine.init({listFiles:()=>files,fileFor:p=>files.find(f=>f.path===p)||null,
  readText:async p=>Array.from({length:90000},(_,i)=>`word${p.slice(0,1)}x${i}`).join(' '),getMeta:()=>null},{enabled:true,content:true,bigrams:false});
 expect(engine.state).toBe('degraded');expect(engine.search('word0x1').ready).toBe(false);engine.dispose();
});
test('large incremental edits cannot bypass the index memory budget',async()=>{
 const files=Array.from({length:8},(_,i)=>({path:`${i}.md`,basename:String(i),extension:'md'}));let large=false;
 const engine=createSearchIndexEngine();await engine.init({listFiles:()=>[files[0]],fileFor:p=>files.find(f=>f.path===p)||null,
 readText:async p=>large?Array.from({length:90000},(_,i)=>`delta${p.slice(0,1)}x${i}`).join(' '):'small',getMeta:()=>null},{enabled:true,content:true,bigrams:false});
 large=true;await engine.addPaths(files.map(file=>file.path));expect(engine.state).toBe('degraded');engine.dispose();
});

test('initial indexing bounds simultaneous full-text reads before vocabulary checks',async()=>{
 const files=Array.from({length:12},(_,i)=>({path:`batch-${i}.md`,basename:String(i),extension:'md',stat:{mtime:0,size:2*1024*1024}}));let active=0,peak=0;
 const engine=createSearchIndexEngine();await engine.init({listFiles:()=>files,fileFor:path=>files.find(file=>file.path===path)||null,
 readText:async()=>{active++;peak=Math.max(peak,active);await Promise.resolve();active--;return 'small';},getMeta:()=>null});
 try{expect(peak).toBeLessThanOrEqual(2);expect(engine.state).toBe('ready');}finally{engine.dispose();}
});
test('a failed read from a cancelled delta does not schedule the rest after degradation',async()=>{
 const files=['base.md','old-first.md','old-next.md','oversized.md'].map(path=>({path,basename:path,extension:'md'}));let laterReads=0,rejectOld!:(error:Error)=>void;
 const pending=new Promise<string>((_resolve,reject)=>{rejectOld=reject;});
 const engine=createSearchIndexEngine();await engine.init({listFiles:()=>[files[0]],fileFor:path=>files.find(file=>file.path===path)||null,
 readText:async path=>{if(path==='old-first.md')return pending;if(path==='old-next.md')laterReads++;return path==='oversized.md'?'x'.repeat(4*1024*1024+1):'small';},getMeta:()=>null});
 const old=engine.addPaths(['old-first.md','old-next.md']);await engine.addPaths(['oversized.md']);expect(engine.state).toBe('degraded');rejectOld(Error('old read failed'));await old;
 try{expect(laterReads).toBe(0);}finally{engine.dispose();}
});
test('disabling body indexing avoids body reads during initial and incremental indexing',async()=>{
 const files=[{path:'large.md',basename:'Large',extension:'md',stat:{mtime:0,size:40*1024*1024}}];let reads=0;
 const engine=createSearchIndexEngine();await engine.init({listFiles:()=>files,fileFor:()=>files[0],readText:async()=>{reads++;return 'body';},getMeta:()=>null},{content:false});
 await engine.addPaths(['large.md']);try{expect(engine.state).toBe('ready');expect(reads).toBe(0);expect(engine.search('Large').results).toHaveLength(1);}finally{engine.dispose();}
});
test('a large attachment never consumes the Markdown body read budget',async()=>{
 const files=[{path:'large.pdf',basename:'Large',extension:'pdf',stat:{mtime:0,size:100*1024*1024}}];let reads=0;
 const engine=createSearchIndexEngine();await engine.init({listFiles:()=>files,fileFor:()=>files[0],readText:async()=>{reads++;return '';},getMeta:()=>null});
 await engine.addPaths(['large.pdf']);try{expect(engine.state).toBe('ready');expect(reads).toBe(0);expect(engine.search('pdf').results).toHaveLength(1);}finally{engine.dispose();}
});
