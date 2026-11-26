import {test,expect} from 'bun:test';
import {markdownElements,extractMarkdownMatches,markdownQuery} from '../src/search/markdown-matches.ts';
import {partitionFileGroups,fileTypeLabel} from '../src/search/file-types.ts';
import {resolveContentMatch} from '../src/search/content-matches.ts';

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
