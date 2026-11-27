import {test,expect} from 'bun:test';
import {markdownElementGroups} from '../src/search/markdown-result-items.ts';
import {extractMarkdownMatches} from '../src/search/markdown-matches.ts';
import {normalizeSettings,validateSetting} from '../src/settings/schema.ts';
import type {ContentMatch,SearchGroup} from '../src/types.ts';

test('element-first results preserve every exact match, source, and navigation action without mutating document groups',()=>{
  const hits=extractMarkdownMatches('# Heading needle\n**Bold needle**\n`code needle`','needle');
  const opened:ContentMatch[]=[];
  const groups:SearchGroup[]=[{title:'Markdown 元素匹配',items:[{path:'Folder/Note.md',label:'Note',terms:['needle'],hits,onMatch:hit=>opened.push(hit),action:()=>{throw Error('Wrong first-hit action');}}]}];
  const result=markdownElementGroups(groups);
  expect(result[0].items).toHaveLength(3);
  expect(groups[0].items).toHaveLength(1);expect(groups[0].items[0].hits).toBe(hits);
  for(const [index,item] of result[0].items.entries()){
    expect(item.path).toBe('Folder/Note.md');expect(item.elementHit).toBe(hits[index]);expect(item.hits).toBeUndefined();item.action();
  }
  expect(opened).toEqual(hits);
  expect(markdownElementGroups([{title:'Markdown 元素匹配',items:[]}])[0].items).toEqual([]);
});
test('default element display mode preserves existing grouping and rejects unsupported values',()=>{
  expect(normalizeSettings({}).defaultMarkdownResultMode).toBe('documents');
  expect(normalizeSettings({defaultMarkdownResultMode:'elements'}).defaultMarkdownResultMode).toBe('elements');
  expect(()=>validateSetting('defaultMarkdownResultMode','unknown')).toThrow();
});
