import {test,expect} from 'bun:test';
import type {CachedMetadata,FrontMatterInfo} from 'obsidian';
import {matchingTagEntries,extractTagMatches,resolveTagMatch,tagQueryTerms} from '../src/search/tag-matches.ts';
import {offsetToPosition} from '../src/search/content-matches.ts';

const info=(text:string):FrontMatterInfo=>{
  const from=text.indexOf('\n')+1,to=text.indexOf('\n---',from)+1;
  return {exists:true,frontmatter:text.slice(from,to),from,to,contentStart:text.indexOf('\n',to)+1};
};
const inline=(text:string,value:string,at=text.indexOf(value))=>({tag:value,position:{start:{...offsetToPosition(text,at),col:offsetToPosition(text,at).ch,offset:at},end:{...offsetToPosition(text,at+value.length),col:offsetToPosition(text,at+value.length).ch,offset:at+value.length}}});

test('tag queries retain case-insensitive substring and same-tag multi-term semantics',()=>{
  const cache:CachedMetadata={frontmatter:{tags:['学习/Python','project/work'],tag:'legacy'}};
  expect(tagQueryTerms(' #PYTHON ')).toEqual(['python']);
  expect(matchingTagEntries(cache,['python']).map(entry=>entry.value)).toEqual(['学习/Python']);
  expect(matchingTagEntries(cache,['学习','python'])).toHaveLength(1);
  expect(matchingTagEntries(cache,['python','work'])).toEqual([]);
  expect(matchingTagEntries(cache,[])).toHaveLength(3);
});

test('tag locations come from actual metadata and isolate YAML tags from identical text in other fields',()=>{
  const text='---\ndescription: work\nnested:\n  tags: fake\ntags: [work, personal]\ntag: legacy\n---\nplain work and #work\n`#fake`';
  const cache:CachedMetadata={frontmatter:{tags:['work','personal'],tag:'legacy'},tags:[inline(text,'#work')]};
  const hits=extractTagMatches(text,matchingTagEntries(cache,['work']),info(text));
  expect(hits).toHaveLength(2);
  expect(hits[0].start).toBe(text.indexOf('work, personal'));
  expect(hits[0].location).toBe('笔记属性 · 第 5 行');
  expect(hits[1].match).toBe('#work');expect(hits[1].location).toBe('正文 · 第 8 行');
  expect(hits.every(hit=>hit.text.includes('#work'))).toBe(true);
  expect(matchingTagEntries(cache,['fake'])).toEqual([]);
});

test('block lists, quoted keys, CRLF and legacy tag fields keep exact offsets',()=>{
  const text="---\r\n\"tags\":\r\n- work:project\r\n- 学习/Python\r\nnext: other\r\n'tag': legacy\r\n---\r\n#work:project";
  const cache:CachedMetadata={frontmatter:{tags:['work:project','学习/Python'],tag:'legacy'},tags:[inline(text,'#work:project')]};
  const hits=extractTagMatches(text,matchingTagEntries(cache,[]),info(text));
  expect(hits).toHaveLength(4);
  for(const hit of hits)expect(text.slice(hit.start,hit.end)).toBe(hit.match);
  expect(hits[0].match).toBe('work:project');expect(hits[1].location).toContain('第 4 行');
  expect(hits[2].match).toBe('legacy');expect(hits[2].tag.field).toBe('tag');
});

test('escaped YAML values remain visible and fall back to the correct property key',()=>{
  const text='---\ndescription: 工作\ntags: ["\\u5de5\\u4f5c"]\n---\n#工作';
  const cache:CachedMetadata={frontmatter:{tags:['工作']}};
  const [hit]=extractTagMatches(text,matchingTagEntries(cache,['工作']),info(text));
  expect(hit.match).toBe('tags:');expect(hit.location).toBe('笔记属性 · 第 3 行');
  expect(hit.text).toContain('#工作');
});

test('tag rows summarize sources and highlight only #-prefixed tags',async()=>{
  const {withSnippets}=await import('../src/search/snippets.ts');
  const FakeBase=class {} as unknown as import('../src/ui/search-bar-host.ts').SearchBarCtor;
  const text='---\ntags: [work, personal]\n---\nplain work and #work';
  const cache:CachedMetadata={frontmatter:{tags:['work','personal']},tags:[inline(text,'#work')]};
  const hits=extractTagMatches(text,matchingTagEntries(cache,[]),info(text));
  const row=Object.assign(new (withSnippets(FakeBase))(),{_fileLabel:()=>'Note',_fileIconName:()=>'file',_openVaultResult(){},_openMatchResult:async()=>{}})
    ._buildTagItem({path:'Note.md',basename:'Note'} as never,hits);
  expect(row.label).toBe('Note');
  expect(row.sub).toBe('笔记属性 2 · 正文 1');
  expect(row.tagList).toEqual(['#work','#personal']);
  // 无 # 的正文文本不参与高亮。 / Plain text without # never participates in highlighting.
  expect(row.terms).toEqual(['#work','#personal']);
  expect(row.hits).toHaveLength(3);
});

test('tag navigation recomputes property bounds after edits and never jumps to another source',()=>{
  const text='---\ndescription: work\ntags: [work]\n---\n#work\nend';
  const cache:CachedMetadata={frontmatter:{tags:['work']},tags:[inline(text,'#work')]};
  const [yaml,body]=extractTagMatches(text,matchingTagEntries(cache,['work']),info(text));
  const edited=text.replace('description: work','description: '+ 'work '.repeat(30));
  expect(resolveTagMatch(edited,yaml,info(edited)).start).toBe(edited.indexOf('work]'));
  expect(resolveTagMatch(edited,body,info(edited)).start).toBe(edited.indexOf('#work'));
  const removed=edited.replace('tags: [work]','tags: [other]');
  expect(resolveTagMatch(removed,yaml,info(removed))).toBeNull();
  const removedBody=edited.replace('#work','plain work');
  expect(resolveTagMatch(removedBody,body,info(removedBody))).toBeNull();
});
