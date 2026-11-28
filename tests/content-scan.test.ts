import {test,expect} from 'bun:test';
import {scanContentFiles,MAX_RETAINED_CONTENT_FILES} from '../src/search/content-scan.ts';
import {createContentMatch} from '../src/search/content-matches.ts';
test('large-vault scans bound reads and excerpts while retaining later higher-scored documents',async()=>{
 const files=Array.from({length:1200},(_,i)=>i);let active=0,peak=0,built=0;
 const result=await scanContentFiles({files,terms:['alpha','beta'],cancelled:()=>false,
  read:async file=>{active++;peak=Math.max(peak,active);await Promise.resolve();active--;return file===1199?'alpha beta':'alpha '+'.'.repeat(100)+' beta';},
  extract:text=>{built++;return [createContentMatch(text,0,5)];},build:(file)=>file,error:()=>{throw Error('read failed');}});
 expect(result.matched).toBe(1200);expect(result.items).toHaveLength(MAX_RETAINED_CONTENT_FILES);expect(result.items[0]).toBe(1199);expect(peak).toBeLessThanOrEqual(2);expect(built).toBe(MAX_RETAINED_CONTENT_FILES+1);
});
test('cancelled scans stop scheduling and release partial results',async()=>{
 let stale=false,reads=0;const result=await scanContentFiles({files:Array.from({length:100000},(_,i)=>i),terms:['a'],cancelled:()=>stale,
 read:async()=>{reads++;stale=true;return 'a';},extract:()=>[],build:file=>file,error:()=>{}});
 expect(result.items).toEqual([]);expect(reads).toBeLessThanOrEqual(2);
});
