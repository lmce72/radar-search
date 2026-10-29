import {test,expect} from 'bun:test';
import {rankCommandCandidates} from '../src/search/command-matches.ts';

test('description matches outrank IDs even when registered after many ID matches',()=>{
  const ids=Array.from({length:10},(_,i)=>({id:`search-${i}`,name:`Unrelated ${i}`}));
  const visible=[...ids,{id:'find-more',name:'Search all notes'},{id:'find',name:'Search'}];
  const ranked=rankCommandCandidates(visible,[],'search',['search'],null);
  expect(ranked.slice(0,2).map(match=>match.command.id)).toEqual(['find','find-more']);
  expect(ranked).toHaveLength(12);
  expect(ranked[1].score).toBeGreaterThan(ranked[2].score);
  expect(visible[0]).toBe(ids[0]);
});

test('literal description phrases outrank dispersed and fuzzy matches',()=>{
  const commands=[{id:'fuzzy',name:'O p e n n o t e'},{id:'terms',name:'Open the selected note'},{id:'phrase',name:'Editor: open note'},{id:'exact',name:'Open note'}];
  const fuzzy=()=>({score:-1000,matches:[]});
  expect(rankCommandCandidates(commands,[],'open note',['open','note'],fuzzy).map(match=>match.command.id)).toEqual(['exact','phrase','terms','fuzzy']);
});

test('fuzzy description scores stay above even exact ID matches',()=>{
  const commands=[{id:'search',name:'No match'},{id:'weak',name:'Sparse match'},{id:'strong',name:'Close match'}];
  const fuzzy=(text:string)=>text==='Sparse match'?{score:-1000,matches:[]}:text==='Close match'?{score:-1,matches:[]}:null;
  const ranked=rankCommandCandidates(commands,[],'search',['search'],fuzzy);
  expect(ranked.map(match=>match.command.id)).toEqual(['strong','weak','search']);
});

test('hidden and visible commands use one ranking with deduplication and stable ties',()=>{
  const visible=[{id:'visible',name:'插件：打开笔记'},{id:'duplicate',name:'打开笔记'}];
  const hidden=[{id:'hidden',name:'打开笔记'},visible[1],{id:'',name:'打开笔记'},{id:'unnamed',name:''}];
  const ranked=rankCommandCandidates(visible,hidden,'打开笔记',['打开笔记'],null);
  expect(ranked.map(match=>[match.command.id,match.hidden])).toEqual([['duplicate',false],['hidden',true],['visible',false]]);
});

test('literal fallback preserves ID-only and mixed-field queries and rejects empty input',()=>{
  const commands=[{id:'editor:open',name:'New document'}];
  expect(rankCommandCandidates(commands,[],'EDITOR:OPEN',['EDITOR:OPEN'],null)).toHaveLength(1);
  expect(rankCommandCandidates(commands,[],'new editor',['new','editor'],null)).toHaveLength(1);
  expect(rankCommandCandidates(commands,[],'unknown',['unknown'],null)).toEqual([]);
  expect(rankCommandCandidates(commands,[],' ',[],null)).toEqual([]);
});
