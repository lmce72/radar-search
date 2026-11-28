import {test,expect} from 'bun:test';
import type {SearchBarCtor} from '../../src/ui/search-bar-host.ts';
import type {TFile} from 'obsidian';
import {withSnippets} from '../../src/search/snippets.ts';
import {createContentMatch} from '../../src/search/content-matches.ts';
const Base=class {} as unknown as SearchBarCtor;
const file={path:'Note.md',basename:'Note',parent:{path:'Folder'}} as TFile;
function fixture(){const events:unknown[]=[];const bar=Object.assign(new (withSnippets(Base))(),{_fileLabel:()=> 'Visible note',_fileIconName:()=> 'file',_openVaultResult:(...args)=>events.push(['file',...args]),_openMatchResult:async(...args)=>{events.push(['hit',...args]);}});return {bar,events};}
function container(){const text:string[]=[],marks:string[]=[];return {text,marks,appendText:(value:string)=>text.push(value),createSpan:({text:value}:{text:string})=>{text.push(value);marks.push(value);return {setCssStyles(){}};}};}
test('plain and contextual excerpt generation handles missing queries and frontmatter-only notes',()=>{
 const {bar}=fixture();expect(bar._extractAllSnippets('',[])).toEqual([]);expect(bar._extractAllSnippets('---\ntags: [work]\n---\n',[])).toEqual([]);
 const preview=bar._extractAllSnippets('---\ntags: [work]\n---\nBody begins here',[],10);expect(preview[0].match).toBe('Body begins here');expect(preview[0].start).toBe(21);
 expect(bar._extractSnippet('Alpha \n beta\t gamma','beta',2)).toBe('…a beta g…');
 expect(bar._extractSnippet('No matching words','absent',2)).toBe('No m');
 expect(bar._extractSnippet('needle beginning','needle',40)).toBe('needle beginning');
});
test('match and tag rows preserve actions including no-hit fallback and case-normalized tags',async()=>{
 const {bar,events}=fixture(),hit=createContentMatch('needle',0,6);const row=bar._buildMatchItem(file,['needle'],[hit],12);row.action();row.onMatch(hit);
 const empty=bar._buildMatchItem(file,[],[]);empty.action();
 const tags=bar._buildTagItem(file,[{...hit,tag:{value:'#Work',field:'tags'}},{...hit,tag:{value:'work'}},{...hit,match:'#other'}]);
 expect(row).toMatchObject({label:'Visible note',path:file.path,sub:'Folder',score:12});expect(tags.sub).toBe('笔记属性 1 · 正文 2');expect(tags.tagList).toEqual(['#Work','#work','#other']);expect(tags.terms).toEqual(['#work','#work','#other']);tags.action();tags.onMatch(hit);await Promise.resolve();
 expect(events.filter(item=>item[0]==='hit')).toHaveLength(4);expect(events.find(item=>item[0]==='file')).toEqual(['file','Note.md','Note']);
 const emptyTags=bar._buildTagItem(file,[]);emptyTags.action();expect(events.at(-1)).toEqual(['file','Note.md','Note']);expect(emptyTags.sub).toBe('');
});
test('highlighting merges overlapping literals and preserves original source text',()=>{
 const {bar}=fixture(),node=container();bar._highlightText(node as unknown as HTMLElement,'banana + banana',['ana','banana','+']);expect(node.text.join('')).toBe('banana + banana');expect(node.marks).toEqual(['banana','+','banana']);
 const plain=container();bar._highlightText(plain as unknown as HTMLElement,'literal');expect(plain.text).toEqual(['literal']);
 const missing=container();bar._highlightText(missing as unknown as HTMLElement,'literal',['absent']);expect(missing.marks).toEqual([]);expect(missing.text.join('')).toBe('literal');
});
test('highlighting keeps offsets after Unicode case expansion and accepts uppercase terms',()=>{
 const {bar}=fixture(),node=container();bar._highlightText(node as unknown as HTMLElement,'İ heading NEEDLE',['NEEDLE']);expect(node.text.join('')).toBe('İ heading NEEDLE');expect(node.marks).toEqual(['NEEDLE']);
});
test('empty highlight terms cannot keep rediscovering the end of a string',()=>{
 const {bar}=fixture(),node=container(),original=String.prototype.indexOf;let calls=0;
 String.prototype.indexOf=function(value,from){if(value===''&&++calls>20)throw Error('Empty-term search failed to terminate');return original.call(this,value,from);};
 try{bar._highlightText(node as unknown as HTMLElement,'text',['']);expect(node.text.join('')).toBe('text');expect(node.marks).toEqual([]);}finally{String.prototype.indexOf=original;}
});
test('plain snippets preserve original offsets after Unicode lowercase expansion',()=>{
 const {bar}=fixture();
 expect(bar._extractSnippet('İ'.repeat(20)+' needle tail','needle',4)).toContain('needle');
});
