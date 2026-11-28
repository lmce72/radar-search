import {test,expect} from 'bun:test';
import {markdownElements,extractMarkdownMatches,markdownQuery} from '../src/search/markdown-matches.ts';
import {partitionFileGroups,fileTypeLabel} from '../src/search/file-types.ts';
import {resolveContentMatch,createContentMatch} from '../src/search/content-matches.ts';

test('Markdown elements preserve CRLF offsets and keep frontmatter and code opaque',()=>{
  const text=['---','title: ==not-highlight==','---','# Heading needle','- [ ] task needle','> quote needle','```ts','# fake needle','==fake needle==','```','real ==needle== and `==ignored==`','%% needle comment %%','Title needle','---'].join('\r\n');
  const elements=markdownElements(text);
  expect(elements.filter(hit=>hit.kind==='heading').map(hit=>text.slice(hit.start,hit.end))).toEqual(['# Heading needle','Title needle\r\n---']);
  expect(elements.filter(hit=>hit.kind==='highlight').map(hit=>text.slice(hit.start,hit.end))).toEqual(['==needle==']);
  for(const kind of ['task','quote','code','inlineCode','comment'])expect(elements.some(hit=>hit.kind===kind)).toBe(true);
  const hit=extractMarkdownMatches(text,'highlight:needle')[0];
  expect(hit.location).toContain('高亮');expect(hit.match).toBe('==needle==');
  expect(resolveContentMatch('new line\n'+text,hit)?.start).toBe(hit.start+9);
});
test('element selectors allow empty terms, Chinese labels, case-insensitive multi-term matching and stale deletion',()=>{
  const text='# Alpha beta\n- [x] alpha done\n> Alpha beta\n**bold** ==highlight== ~~gone~~';
  expect(markdownQuery('标题: ALPHA beta')).toEqual({kind:'heading',terms:['alpha','beta']});
  expect(extractMarkdownMatches(text,'heading:')).toHaveLength(1);
  expect(extractMarkdownMatches(text,'ALPHA beta')).toHaveLength(2);
  expect(extractMarkdownMatches(text,'task:beta')).toHaveLength(0);
  const hit=extractMarkdownMatches(text,'task:')[0];
  expect(resolveContentMatch('# Alpha beta',hit)).toBeNull();
});
test('attachment groups and type labels preserve all existing actions without polluting note results',()=>{
  const items=['Note.md','Docs/report.pdf','Assets/raw.cUsToM','LICENSE'].map(path=>({path,label:path,action(){}}));
  const groups=partitionFileGroups([{title:'Vault 文件',items}]);
  expect(groups[0].items.map(item=>item.path)).toEqual(['Note.md']);
  expect(groups[1].items).toEqual(items.slice(1));
  expect(fileTypeLabel('Assets/raw.cUsToM')).toBe('CUSTOM');expect(fileTypeLabel('a.PDF')).toBe('PDF');
  expect(fileTypeLabel('README')).toBe('FILE');expect(fileTypeLabel('a.md')).toBe('');
  expect(partitionFileGroups(groups)).toEqual(groups);
});

test('multiline equations and comments remain opaque and escaped markers are ignored',()=>{
 const text='$$\n# equation\n==equation==\n$$\n%%\n# comment\n==comment==\n%%\n\\==literal== and ==real==\n';
 const elements=markdownElements(text);
 expect(elements.filter(element=>element.kind==='math')).toHaveLength(1);
 expect(elements.filter(element=>element.kind==='comment')).toHaveLength(1);
 expect(elements.filter(element=>element.kind==='heading')).toHaveLength(0);
 expect(elements.filter(element=>element.kind==='highlight').map(element=>text.slice(element.start,element.end))).toEqual(['==real==']);
});

test('element results expose heading levels, exact line numbers and element-only text',()=>{
 const text='# First needle\r\n\r\n## Second needle\r\n\r\n**Bold needle**\r\n\r\nSetext needle\r\n---\r\n';
 const hits=extractMarkdownMatches(text,'needle');
 expect(hits.map(hit=>hit.markdown)).toMatchObject([
   {kind:'heading',line:1,level:1,text:'First needle'},
   {kind:'heading',line:3,level:2,text:'Second needle'},
   {kind:'bold',line:5,text:'Bold needle'},
   {kind:'heading',line:7,level:2,text:'Setext needle'}
 ]);
 expect(hits[2].match).toBe('**Bold needle**');
 expect(resolveContentMatch('new line\n'+text,hits[2])?.start).toBe(hits[2].start+9);
});

test('type selection filters before the match cap and permits an empty selection',()=>{
 const text=Array.from({length:40},(_,i)=>`# heading needle ${i}`).join('\n')+'\n**bold needle**';
 const hits=extractMarkdownMatches(text,'needle',35,['bold']);
 expect(hits).toHaveLength(1);expect(hits[0].markdown).toMatchObject({kind:'bold',line:41,text:'bold needle'});
 expect(extractMarkdownMatches(text,'needle',35,[])).toEqual([]);
 expect(extractMarkdownMatches(text,'heading:needle',35,['bold'])).toEqual([]);
});

test('an unfinished comment keeps its final characters in the result label',()=>{
 expect(extractMarkdownMatches('%% unfinished needle','needle')[0].markdown?.text).toBe('unfinished needle');
});

test('ordered and unordered lists are separate element kinds',()=>{
  const text='- bullet\n1. first\n2. second\n- [ ] task';
  const elements=markdownElements(text);
  expect(elements.filter(element=>element.kind==='unorderedList')).toHaveLength(1);
  expect(elements.filter(element=>element.kind==='orderedList')).toHaveLength(2);
  expect(elements.filter(element=>element.kind==='task')).toHaveLength(1);
  expect(markdownQuery('有序列表:').kind).toBe('orderedList');
  expect(markdownQuery('无序列表:').kind).toBe('unorderedList');
});

test('a lone %% inside a quote is not a multi-line comment',()=>{
  const text='> %% 这里只是在引用里出现符号\n\n## 标题\n\n- 条目';
  const kinds=markdownElements(text).map(element=>element.kind);
  expect(kinds).not.toContain('comment');
  expect(kinds).toContain('heading');
  expect(kinds).toContain('unorderedList');
});

test('resolveContentMatch locates large multi-line snippets literally',()=>{
  const source='%% a+b [c] (d) \\^ $e$\n> flowchart LR\n> A --> B';
  const text='prefix\n'+source+'\nsuffix';
  const start=text.indexOf(source);
  const hit=createContentMatch(text,start,start+source.length);
  expect(resolveContentMatch(text,hit)).toEqual({start,end:start+source.length});
});
test('oversized code and callout results keep bounded keyword anchors near their ends',()=>{
 for(const kind of ['code','callout'] as const){
  const body=Array.from({length:2000},(_,i)=>'line '+i+' '+('abc'.repeat(20))).join('\n');
  const raw=kind==='code'?'```ts\n'+body+'\nTAIL needle\n```':'> [!warning] Long callout\n'+body.split('\n').map(line=>'> '+line).join('\n')+'\n> TAIL needle';
  const text='before\n\n'+raw+'\n\nafter',hit=extractMarkdownMatches(text,'needle',35,[kind])[0];
  expect(hit.start).toBe(text.indexOf(raw));expect(hit.end).toBe(hit.start+raw.length);expect(hit.anchor).toBeDefined();
  expect(hit.match.length).toBeLessThanOrEqual(2048);expect(hit.text.length).toBeLessThan(2200);expect(hit.preview.length).toBeLessThanOrEqual(6000);
  expect(hit.markdown.source.length).toBeLessThan(2400);expect(hit.markdown.text.length).toBeLessThan(2200);
  expect(hit.markdown.source).toContain('needle');expect(hit.markdown.text).toContain('needle');
  expect(hit.markdown.source.startsWith(kind==='code'?'```ts\n':'> [!warning]\n')).toBe(true);
  const moved='inserted\n'+text,location=resolveContentMatch(moved,hit);
  expect(location).not.toBeNull();expect(moved.slice(location.start,location.end)).toBe(hit.match);
  expect(location.start).toBe(hit.anchor.start+9);expect(location.end).toBe(hit.anchor.end+9);
 }
});
