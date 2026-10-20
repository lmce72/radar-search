import {test,expect} from 'bun:test';

import {extractContentMatches,resolveContentMatch,offsetToPosition} from '../src/search/content-matches.ts';
import {availableCategories,filterResultGroups,resultCategoryStates} from '../src/search/result-categories.ts';
import {DEFAULT_SETTINGS} from '../src/settings/schema.ts';

const FakeBase = class {} as unknown as import('../src/ui/search-bar-host.ts').SearchBarCtor;

test('snippets retain raw source offsets across whitespace, Unicode and CRLF',()=>{
  const text='İ title\r\n\r\n    中文目标   first\r\n'+ '说明 '.repeat(40)+'\r\n第二处 中文目标 end';
  const hits=extractContentMatches(text,['中文目标'],16);
  expect(hits).toHaveLength(2);
  for(const hit of hits)expect(text.slice(hit.start,hit.end)).toBe('中文目标');
  expect(hits[0].text).not.toContain('\r');
  expect(offsetToPosition(text,hits[0].start)).toEqual({line:2,ch:4});
  const editorText=text.replaceAll('\r\n','\n');
  const range=resolveContentMatch(editorText,hits[1]);
  expect(range.start).toBe(editorText.lastIndexOf('中文目标'));
  expect(offsetToPosition(editorText,range.start)).toEqual({line:4,ch:4});
});

test('clicked occurrence is relocated after edits rather than jumping to the first repeated word',()=>{
  const text='first needle alpha\n'+'filler '.repeat(30)+'\nsecond needle beta';
  const hit=extractContentMatches(text,['needle'],10)[1];
  const edited='new paragraph\n'.repeat(10)+text;
  const range=resolveContentMatch(edited,hit);
  expect(range.start).toBe(edited.lastIndexOf('needle'));
  expect(edited.slice(range.start,range.end)).toBe('needle');
  expect(resolveContentMatch(edited.replaceAll('needle','removed'),hit)).toBeNull();
});

test('literal queries escape regex syntax and ignore empty terms',()=>{
  const text='Before a+b (test) [value] $after';
  for(const term of ['a+b','(test)','[value]','$after']) {
    const [hit]=extractContentMatches(text,[term],2);
    expect(text.slice(hit.start,hit.end)).toBe(term);
  }
  expect(extractContentMatches(text,[''])).toEqual([]);
});

test('result categories remain available with zero matches and honor enabled sources',()=>{
  const cfg={...structuredClone(DEFAULT_SETTINGS),vaultContentSearch:true,searchTags:false,searchProperties:false,searchWikiLinks:false,searchMdLinks:false};
  const ids=availableCategories(cfg,'vault','query').map(c=>c.id);
  expect(ids).toContain('content');expect(ids).not.toContain('tags');expect(ids).not.toContain('wikiLinks');expect(ids).not.toContain('mdLinks');expect(ids).not.toContain('web');
  expect(availableCategories(cfg,'vault','#tag').map(c=>c.id)).toContain('tags');
  expect(availableCategories(cfg,'web','query')).toEqual([]);
  expect(filterResultGroups([{title:'Vault 文件'},{title:'内容匹配'}],'tags')).toEqual([]);
});

test('each result group has its own tab, including hidden commands and link types',()=>{
  const groups=[{title:'Vault 文件'},{title:'内容匹配'},{title:'标签匹配'},{title:'命令匹配'},{title:'隐藏命令'},{title:'内链匹配'},{title:'外链匹配'},{title:'DuckDuckGo'}];
  expect(filterResultGroups(groups,'content')).toEqual([{title:'内容匹配'}]);
  expect(filterResultGroups(groups,'commands')).toEqual([{title:'命令匹配'}]);
  expect(filterResultGroups(groups,'hiddenCommands')).toEqual([{title:'隐藏命令'}]);
  expect(filterResultGroups(groups,'wikiLinks')).toEqual([{title:'内链匹配'}]);
  expect(filterResultGroups(groups,'mdLinks')).toEqual([{title:'外链匹配'}]);
  expect(filterResultGroups(groups,'web')).toEqual([{title:'DuckDuckGo'}]);
  expect(groups).toHaveLength(8);
});

test('empty result categories are disabled and selection moves to an available result category',()=>{
  const cfg={...structuredClone(DEFAULT_SETTINGS),vaultContentSearch:true,searchTags:true};
  const groups=[{title:'Vault 文件',items:[]},{title:'内容匹配',items:[{}]},{title:'标签匹配',items:[{}]}];
  const states=resultCategoryStates(cfg,'vault','query',groups,'files');
  expect(states.find(c=>c.id==='files').disabled).toBe(true);
  expect(states.find(c=>c.id==='content').selected).toBe(true);
  expect(states.find(c=>c.id==='tags').disabled).toBe(false);
  expect(resultCategoryStates(cfg,'vault','query',groups,'tags').find(c=>c.id==='tags').selected).toBe(true);
  const empty=resultCategoryStates(cfg,'vault','query',[],'content');
  expect(empty.every(c=>c.disabled)).toBe(true);
  expect(empty.some(c=>c.selected)).toBe(false);
});

test('page handoff carries local filters and clones settings without persisting them',async()=>{
  const {withResultPresentation}=await import('../src/ui/result-presentation.ts');
  const fixture=Object.assign(new (withResultPresentation(FakeBase))(),{
    _quickExcludedPaths:['path:Work/assets'],_temporaryFilter:{mode:'黑名单',paths:['glob:**/assets/**']},cfg:structuredClone(DEFAULT_SETTINGS),_mode:'vault',_resultCategory:'content',_input:{value:'query'},
    _contentSearch:true,_searchTags:true,_searchWikiLinks:false,_searchMdLinks:false,_searchBookmarks:false,_searchProperties:true,
    _searchCommands:false,_searchNonMarkdown:false,_extendedContext:true,_selectedPreset:'preset',_limitContentResults:false,
    _vaultSortMode:'alpha-asc',_activeEngineId:null,_groupPages:new Map([['Vault 文件',2]]),_historyVer:0,_vaultSearchVer:0,_webSearchVer:0,
    _syncClearBtn(){},_selectMode(mode:string){this._mode=mode;this._resultCategory='files';},_doSearch:async(q:string)=>{queried=q;}
  });
  let queried='';
  const session=fixture.getSearchSession();
  expect(session.quickExcludedPaths).toEqual(['path:Work/assets']);
  expect(session.quickExcludedPaths).not.toBe(fixture._quickExcludedPaths);
  expect(session.temporaryFilter.paths).toEqual(['glob:**/assets/**']);
  expect(session.temporaryFilter).not.toBe(fixture._temporaryFilter);
  expect(session.settings.searchProperties).toBe(true);
  expect(session.settings.defaultPreset).toBe('preset');
  expect(session.settings.vaultSortMode).toBe('alpha-asc');
  session.settings.excludePaths.push('private/');
  expect(fixture.cfg.excludePaths).not.toContain('private/');
  await fixture.applySearchSession(session);
  expect(fixture._temporaryFilter).toEqual(session.temporaryFilter);
  expect(fixture._resultCategory).toBe('content');
  expect(fixture._preferredResultCategory).toBe('content');
  expect(fixture._groupPages.size).toBe(0);
  expect(queried).toBe('query');
  expect(fixture.cfg).not.toBe(session.settings);
});
test('web-only results do not pass through vault category filtering',async()=>{
  const {withResultPresentation}=await import('../src/ui/result-presentation.ts');
  const fixture=Object.assign(new (withResultPresentation(FakeBase))(),{_mode:'web',_resultCategory:'files'});
  const groups=[{title:'Example',items:[{label:'query',action(){}}]}];
  expect(fixture._visibleResultGroups(groups)).toEqual(groups);
  fixture._mode='vault';expect(fixture._visibleResultGroups(groups)).toEqual([]);
});
