import {test,expect} from 'bun:test';
import {extractMarkdownMatches,markdownQuery} from '../src/search/markdown-matches.ts';
import {inlineMarkdownLinks,referenceDefinitions} from '../src/search/markdown-links.ts';
import {splitTagQuery,hasQueryTags} from '../src/search/query.ts';
import {recentType,normalizeExtension} from '../src/history/recent-types.ts';
import {completeWebSyntax} from '../src/search/web-syntax.ts';
import {DEFAULT_SETTINGS,normalizeSettings,validateSetting} from '../src/settings/schema.ts';
import {MARKDOWN_ELEMENTS,MARKDOWN_GROUPS} from '../src/search/markdown-elements.ts';
import {boundedPreview} from '../src/search/preview-source.ts';

test('element links preserve balanced destinations, relative links and reference targets',()=>{
  const text='[[Note#Section|Alias needle]] [Local needle](Folder/Note.md) [Web needle](https://example.com/a_(b)) [Reference needle][ref]\n[ref]: https://example.com/ref';
  const hits=extractMarkdownMatches(text,'needle');
  expect(hits.map(hit=>[hit.markdown.kind,hit.markdown.link.target])).toEqual([
    ['internalLink','Note#Section'],['internalLink','Folder/Note.md'],['externalLink','https://example.com/a_(b)'],['externalLink','https://example.com/ref']
  ]);
  for(const hit of hits)expect(text.slice(hit.start,hit.end)).toBe(hit.match);
  expect(hits[3].markdown.source).toBe('[Reference needle](https://example.com/ref)');
  expect(extractMarkdownMatches(text,'externalLink:example.com/ref')).toHaveLength(1);
});
test('links in code and comments remain opaque, escaped links stay literal',()=>{
  const text='`[[ignored]]` %% [ignored](https://example.com) %% \\[[escaped]]\n```md\n[[ignored fenced]]\n```\n[[real]]';
  const hits=extractMarkdownMatches(text,'',35,['internalLink','externalLink']);
  expect(hits.map(hit=>hit.markdown.link.target)).toEqual(['real']);
  const source='[url](https://example.com/a_(b) "Title")';
  expect(inlineMarkdownLinks(source,new Map())[0].target).toBe('https://example.com/a_(b)');
  expect(referenceDefinitions('```md\n[bad]: https://bad.test\n```\n[good]: https://good.test').has('bad')).toBe(false);
  expect(referenceDefinitions('<!--\n[bad]: https://bad.test\n-->\n[good]: https://good.test').has('bad')).toBe(false);
  const nested='````md\n```\n[bad]: https://bad.test\n```not-a-close\n````\n[good]: https://good.test';
  expect([...referenceDefinitions(nested).keys()]).toEqual(['good']);
});
test('inline and fenced code retain distinct types and fence languages are searchable',()=>{
  const text='`single needle` and ``double ` needle``\n```python\nprint("needle")\n```\n~~~typescript\nconst needle = 1;\n~~~';
  const inline=extractMarkdownMatches(text,'inlineCode:needle');
  expect(inline).toHaveLength(2);expect(inline.every(hit=>hit.markdown.kind==='inlineCode'&&!hit.markdown.language)).toBe(true);
  const code=extractMarkdownMatches(text,'code:python');
  expect(code).toHaveLength(1);expect(code[0].markdown.language).toBe('python');expect(code[0].match).toContain('print("needle")');
  expect(markdownQuery('lang:typescript')).toEqual({kind:'code',terms:['typescript']});
  expect(extractMarkdownMatches(text,'lang:typescript')[0].markdown.language).toBe('typescript');
});
test('callout hits retain their complete block and expose their type',()=>{
  const text='before\n> [!warning] Title\n> Body needle\n> Second line\n\nafter';
  const [hit]=extractMarkdownMatches(text,'callout:needle');
  expect(hit.markdown.callout).toBe('warning');expect(hit.markdown.line).toBe(2);
  expect(hit.markdown.source).toBe('> [!warning] Title\n> Body needle\n> Second line');
  expect(extractMarkdownMatches(text,'quote:needle')).toEqual([]);
});
test('HTML comments do not leak links and remain readable as comment elements',()=>{
  const text='<!-- [ignored](https://example.com) -->\n<!--\n[[ignored]]\n-->\n[[real]]';
  expect(extractMarkdownMatches(text,'',35,['internalLink','externalLink']).map(hit=>hit.markdown.link.target)).toEqual(['real']);
  expect(extractMarkdownMatches('<!-- needle -->','comment:needle')[0].markdown.text).toBe('needle');
});
test('tag constraints match nested real tags and leave property or element syntax intact',()=>{
  expect(splitTagQuery('heading:needle #Work/Math #qa')).toEqual({text:'heading:needle',tags:['work/math','qa']});
  expect(splitTagQuery('topic:needle #qa').text).toBe('topic:needle');
  expect(hasQueryTags(['#work/math/limits','qa'],['work/math','qa'])).toBe(true);
  expect(hasQueryTags(['#work/mathematics','qa'],['work/math'])).toBe(false);
});
test('recent file filters support commands and compound suffixes before Markdown',()=>{
  const record=(path:string)=>({path,ts:0});
  expect(recentType(record('Drawing.excalidraw.md'),['excalidraw.md'])).toBe('excalidraw.md');
  expect(recentType(record('Note.md'),['excalidraw.md'])).toBe('markdown');
  expect(recentType({path:'my:command',kind:'command',ts:0},[])).toBe('command');
  for(const [path,type] of [['Report.PDF','pdf'],['a.canvas','canvas'],['b.SVG','image'],['raw.exclidraw','other']])expect(recentType(record(path),[])).toBe(type);
  expect(normalizeExtension(' .Excalidraw.md ')).toBe('excalidraw.md');
  expect(()=>normalizeExtension('../bad')).toThrow();
});
test('web completion replaces the last token and preserves the earlier query',()=>{
  expect(completeWebSyntax('needle si')[0].value).toBe('needle site:');
  expect(completeWebSyntax('site:example.com')).toEqual([]);
  expect(completeWebSyntax('needle unknown')).toEqual([]);
  const phrase=completeWebSyntax('"')[0];expect(phrase.value).toBe('""');expect(phrase.caret).toBe(1);
});
test('legacy link sources migrate into elements and invalid new settings are rejected',()=>{
  expect(normalizeSettings({searchWikiLinks:true}).searchMarkdown).toBe(true);
  expect(normalizeSettings({searchWikiLinks:true,searchMarkdown:false}).searchMarkdown).toBe(true);
  expect(normalizeSettings({markdownElementTypes:['bold','rule']}).markdownElementTypes).toEqual(['bold']);
  expect(normalizeSettings({sourceOrder:['tags','content']}).sourceOrder.slice(0,2)).toEqual(['tags','content']);
  expect(new Set(DEFAULT_SETTINGS.sourceOrder).size).toBe(DEFAULT_SETTINGS.sourceOrder.length);
  expect(()=>validateSetting('sourceOrder',['tags','tags'])).toThrow();
  expect(()=>validateSetting('fileTypeHandlers',{pdf:42})).toThrow();
});
test('element groups preserve the requested order and omit horizontal rules',()=>{
  expect(MARKDOWN_ELEMENTS.slice(0,5).map(element=>element.id)).toEqual(['heading','bold','italic','strike','highlight']);
  for(const [left,right] of [['quote','callout'],['inlineCode','code']])expect(MARKDOWN_ELEMENTS.findIndex(element=>element.id===right)).toBe(MARKDOWN_ELEMENTS.findIndex(element=>element.id===left)+1);
  expect(new Set(MARKDOWN_ELEMENTS.map(element=>element.group)).size).toBe(MARKDOWN_GROUPS.length);
  expect(extractMarkdownMatches('---\ntext\n***\n___','')).toEqual([]);
});
test('large rendered previews are bounded and retain the closing code fence',()=>{
  const text='```python\n'+Array.from({length:5000},(_,i)=>'print('+i+')').join('\n')+'\n```';
  const preview=boundedPreview(text);
  expect(preview.length).toBeLessThan(8100);expect(preview.startsWith('```python\n')).toBe(true);expect(preview.endsWith('\n```\n\n…')).toBe(true);
  expect(boundedPreview('**short**')).toBe('**short**');
});
test('default expansion is enabled, configurable and validated as a boolean',()=>{
  expect(normalizeSettings({}).defaultExpandContent).toBe(true);
  expect(normalizeSettings({defaultExpandContent:false}).defaultExpandContent).toBe(false);
  expect(()=>validateSetting('defaultExpandContent','false')).toThrow();
});
test('content previews keep frontmatter matches visible and bound fences after prose',()=>{
  expect(boundedPreview('---\ntopic: needle\n---\n# Heading needle')).toBe('```yaml\ntopic: needle\n```\n\n# Heading needle');
  expect(boundedPreview('---\n\nnot frontmatter')).toBe('---\n\nnot frontmatter');
  expect(boundedPreview('---\ntext: ```\n...\nbody')).toStartWith('````yaml\n');
  const open='intro\n\n~~~js\n'+('needle\n'.repeat(2000));
  expect(boundedPreview(open)).toEndWith('\n~~~\n\n…');
  const closed='```js\nneedle\n```\n'+('prose\n'.repeat(2000));
  expect(boundedPreview(closed)).not.toEndWith('\n```\n\n…');
});
