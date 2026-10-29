import { test, expect, mock } from 'bun:test';
import moment from 'moment';
mock.module('obsidian',()=>({moment,normalizePath:value=>value.replaceAll('\\','/'),TFile:class TFile {},MarkdownView:class MarkdownView {},Platform:{isMobile:false},getIcon:()=>null,
  getFrontMatterInfo:()=>({exists:false,frontmatter:'',from:0,to:0,contentStart:0})}));
const {HistoryStore}=await import('../src/history/store.ts');
const {SettingsStore}=await import('../src/settings/store.ts');
const {DEFAULT_SETTINGS,normalizeSettings,validateSetting}=await import('../src/settings/schema.ts');
const {createSearchIndexEngine}=await import('../src/search/index-engine.ts');
const {makeTouchHandler}=await import('../src/shared/touch.ts');
const {withIndexIntegration}=await import('../src/search/index-integration.ts');
const {normalizeSuggestions}=await import('../src/search/web-search.ts');
const FakeBase = class {} as unknown as import('../src/ui/search-bar-host.ts').SearchBarCtor;

test('all matching tag files use the shared pager and stale searches discard partial results',async()=>{
  const {TFile}=await import('obsidian');
  const {withMetadataSearch}=await import('../src/search/metadata-search.ts');
  const {withSnippets}=await import('../src/search/snippets.ts');
  const {withResults}=await import('../src/ui/results.ts');
  const files=Array.from({length:25},(_,i)=>Object.assign(new TFile(),{path:`Note-${i}.md`,basename:`Note ${i}`,parent:{path:''}}));
  const opened=[];
  const matched=[];
  let textReads=0;
  let stale=false;
  const fixture=Object.assign(new (withMetadataSearch(withSnippets(FakeBase)))(),{
    app:{vault:{getMarkdownFiles:()=>files,cachedRead:async()=>{textReads++;return '#work';}},metadataCache:{getFileCache:()=>({tags:[{tag:'#work',position:{start:{offset:0},end:{offset:5}}}]})}},
    _fileLabel:file=>file.basename,_fileIconName:()=> 'file',_openVaultResult:path=>{opened.push(path);},
    _openMatchResult:async(path,label,hit)=>{matched.push({path,label,hit});},
    _log:()=>{throw Error('Unexpected tag search failure');}
  });
  const items=await fixture._buildTagItems('#work',()=>false,()=>stale);
  // Tag rows mirror content results: file name first, source summary second, expandable hits.
  // 标签结果与内容搜索同构：首行文件名、次行来源摘要、可展开命中。
  expect(items).toHaveLength(25);
  expect(items.every(item=>item.label.startsWith('Note ')&&item.sub==='正文 1'&&item.tagList?.join()==='#work'&&item.hits?.length===1&&item.terms?.join()==='#work')).toBe(true);
  expect(textReads).toBe(25);
  items[24].action();expect(opened).toEqual([]);expect(matched[0].path).toBe('Note-24.md');
  const element=()=>({setCssStyles(){},createDiv(){return element();},createSpan(){return element();},createEl(){return element();},appendText(){},empty(){},setAttribute(){}});
  let pager;
  const results=Object.assign(new (withResults(FakeBase))(),{
    _resultToolView:'results',_dropdownInner:element(),_groupPages:new Map(),_dropdownPageSize:10,_vaultSortMode:'relevance',
    _prepBar(){},_visibleResultGroups:all=>all,_showDropdown(){},_listen(){},_makeTouchHandler:()=>({}),_setIcon(){},_highlightText(){},
    _addQuickFilterButton:()=>({buttonEl:{addClass(){}}}),_mkPagerBar:(_parent,options)=>{pager=options;}
  });
  results._renderDropdown([{title:'标签匹配',items}]);
  expect(pager.totalPages).toBe(3);expect(results._itemEls).toHaveLength(10);
  pager.onNext();pager.onNext();expect(pager.page).toBe(3);expect(results._itemEls).toHaveLength(5);
  pager.onSize(7);expect(pager.page).toBe(1);expect(pager.totalPages).toBe(4);
  stale=true;
  expect(await fixture._buildTagItems('#work',()=>false,()=>stale)).toEqual([]);
});

test('shared match navigation selects the current occurrence after mode changes without focusing touch keyboards',async()=>{
  const {TFile,MarkdownView}=await import('obsidian');
  const {withHistory}=await import('../src/history/history-behavior.ts');
  const {extractContentMatches}=await import('../src/search/content-matches.ts');
  const text='first needle alpha\n'+'filler '.repeat(30)+'\nsecond needle beta';
  const hit=extractContentMatches(text,['needle'],10)[1];
  const edited='new paragraph\n'.repeat(8)+text;
  const file=Object.assign(new TFile(),{path:'Target.md'});
  let selection,scroll,openState,pane,focused=false,switched=false;
  const ViewCtor=MarkdownView as unknown as new () => Record<string, unknown>;
  const view=Object.assign(new ViewCtor(),{file,getMode:()=>switched?'source':'preview',editor:{getValue:()=>edited,setSelection:(from,to)=>{selection={from,to};},scrollIntoView:(range,center)=>{scroll={range,center};},focus:()=>{focused=true;}}});
  const leaf={view,openFile:async(_file,state)=>{openState=state;},setViewState:async()=>{switched=true;}};
  const fixture=Object.assign(new (withHistory(FakeBase))(),{
    presentation:'page',app:{vault:{getAbstractFileByPath:()=>file,cachedRead:async()=>text},workspace:{getLeaf:mode=>{pane=mode;return leaf;}}},
    plugin:{floatingSearch:{close(){}}},_recordHistory(){},_isTouchDevice:()=>true,
    _log:()=>{throw Error('Unexpected navigation failure');}
  });
  await fixture._openMatchResult(file.path,'Target',hit);
  expect(pane).toBe('tab');expect(openState.active).toBe(true);expect(openState.eState.startLoc.line).toBe(2);
  expect(switched).toBe(true);expect(selection).toEqual({from:{line:10,ch:7},to:{line:10,ch:13}});
  expect(scroll).toEqual({range:selection,center:true});expect(focused).toBe(false);
});

test('command results include all visible and hidden matches and preserve execution and copy actions',async()=>{
  const {withMetadataSearch}=await import('../src/search/metadata-search.ts');
  const visible=Array.from({length:10},(_,i)=>({id:`search-${i}`,name:`Unrelated ${i}`}));
  const hidden={id:'hidden',name:'Search'};
  const executed=[],copied=[];
  const fixture=Object.assign(new (withMetadataSearch(FakeBase))(),{
    internalApp:{commands:{commands:Object.fromEntries([...visible,hidden].map(command=>[command.id,command])),listCommands:()=>visible}},
    _runCommand:(id:string,name:string)=>executed.push([id,name]),_copyCommandId:async(id:string)=>{copied.push(id);},
    _log:()=>{throw new Error('Unexpected command search failure');}
  });
  const items=fixture._buildCommandItems('search',['search'],null);
  expect(items).toHaveLength(11);
  expect(items[0].sub).toBe('hidden');
  expect(items[0].icon).toBe('eye-off');
  expect(items[0].iconTitle).toContain('通常不在命令面板中显示');
  expect(items[1].icon).toBe('command');
  expect(items[1].iconTitle).toBeUndefined();
  items[0].action();items[0].trailing.onClick();
  expect(executed).toEqual([['hidden','Search']]);expect(copied).toEqual(['hidden']);

  const {withResults}=await import('../src/ui/results.ts');
  const element=()=>({setCssStyles(){},createDiv(){return element();},createSpan(){return element();},createEl(){return element();},appendText(){},empty(){},setAttribute(){}});
  let pager;
  const rendered=[];
  const results=Object.assign(new (withResults(FakeBase))(),{
    _resultToolView:'results',_dropdownInner:element(),_groupPages:new Map(),_dropdownPageSize:8,_vaultSortMode:'relevance',
    _prepBar(){rendered.length=0;},_visibleResultGroups:all=>all,_showDropdown(){},_listen(){},_makeTouchHandler:()=>({}),
    _setIcon(){},_mkTrailingBtn(){},_highlightText:(_el,label)=>rendered.push(label),
    _mkPagerBar:(_parent,options)=>{pager=options;}
  });
  results._renderDropdown([{title:'命令匹配',items}]);
  expect(pager.totalPages).toBe(2);expect(pager.page).toBe(1);
  expect(rendered).toHaveLength(8);expect(rendered[0]).toBe('Search');
  pager.onNext();
  expect(pager.page).toBe(2);expect(rendered).toEqual(['Unrelated 7','Unrelated 8','Unrelated 9']);
  pager.onSize(4);
  expect(pager.totalPages).toBe(3);expect(pager.page).toBe(1);expect(rendered).toHaveLength(4);
  pager.onNext();pager.onNext();
  expect(pager.page).toBe(3);expect(rendered).toEqual(['Unrelated 7','Unrelated 8','Unrelated 9']);
  expect(results._lastGroups[0].items).toHaveLength(11);
});

test('web suggestions reject non-text provider entries before rendering and sorting',()=>{
  expect(normalizeSuggestions(['one',null,12,{},'', 'two'])).toEqual(['one','two']);
  expect(normalizeSuggestions(null)).toEqual([]);
  expect(normalizeSuggestions(Array.from({length:10},(_,i)=>String(i)))).toHaveLength(6);
});

test('indexed content results preserve the file path used by per-item directory exclusions',async()=>{
  const {TFile}=await import('obsidian');
  const file=Object.assign(new TFile(),{path:'Work/Archive/note.md',basename:'note',parent:{path:'Work/Archive'}});
  const {withSnippets}=await import('../src/search/snippets.ts');
  const fixture=Object.assign(new (withIndexIntegration(withSnippets(FakeBase)))(),{
    app:{vault:{getAbstractFileByPath:()=>file,cachedRead:async()=> 'needle in note'}},
    _isVaultStale:()=>false,_extractAllSnippets:()=>[{text:'needle in note',start:0,end:6}],
    _fileLabel:()=>file.basename,_fileIconName:()=> 'file',_openVaultResult:()=>{},_openMatchResult:async()=>{}
  });
  const items=await fixture._contentItemsFromEngine([{path:file.path,basename:'note',mtime:0,tags:[],score:0,nameScore:0,contentScore:0}],['needle'],20,1);
  expect(items).toHaveLength(1);
  expect(items[0].path).toBe(file.path);
});

test('normalization preserves current settings and isolates defaults',async()=>{
  const input={...structuredClone(DEFAULT_SETTINGS),defaultMode:'web',searchPresets:[{name:'Example',mode:'白名单',excludeFolders:['Example'],icon:'files'}]};
  const normalized=normalizeSettings(input);
  for(const key of Object.keys(input))expect(normalized[key]).toEqual(input[key]);
  const copy=normalizeSettings({});copy.engines[0].enabled=false;
  expect(DEFAULT_SETTINGS.engines[0].enabled).toBe(true);
});

test('settings load only plugin data and save serially',async()=>{
  const snapshots=[];
  const plugin={loadData:async()=>({defaultMode:'web',searchIndex:{content:false}}),saveData:async data=>{await Promise.resolve();snapshots.push(data);},report:()=>{}};
  const store=new SettingsStore(plugin);await store.load();
  expect(store.settings.defaultMode).toBe('web');
  expect(store.settings.searchIndex).toEqual({enabled:true,content:false,bigrams:true,debug:false});
  await Promise.all([store.update('historyPageSize',20),store.update('dropdownPageSize',30)]);
  expect(snapshots.at(-1).historyPageSize).toBe(20);expect(snapshots.at(-1).dropdownPageSize).toBe(30);
});

test('obsolete fields are discarded without converting them into current state',async()=>{
  const snapshots=[];
  const store=new SettingsStore({loadData:async()=>({defaultMode:'web',expandedResultGroups:['标签匹配'],vaultContentSearchMaxFiles:15,resultGroupState:{'标签匹配':true}}),saveData:async data=>snapshots.push(data),report:()=>{}});
  await store.load();
  expect(store.settings.defaultMode).toBe('web');expect(store.settings).not.toHaveProperty('resultGroupState');
  expect(store.settings).not.toHaveProperty('expandedResultGroups');expect(store.settings).not.toHaveProperty('vaultContentSearchMaxFiles');
  expect(snapshots.at(-1)).toEqual(store.settings);
  expect(()=>validateSetting('expandedResultGroups',[])).toThrow('未知设置');
});

test('reject invalid JSON settings before replacing saved configuration',()=>{
  expect(()=>validateSetting('engines',[{id:'a',name:'A',url:'javascript:alert(1)',suggest:'',enabled:true}])).toThrow();
  expect(()=>validateSetting('historyPageSize',0)).toThrow();
  expect(()=>validateSetting('searchPresets',[{name:'a',mode:'白名单',excludeFolders:'a'}])).toThrow();
  expect(()=>validateSetting('resultGroupState',{x:'true'})).toThrow();
});

test('history preserves concurrent writes from independent search views',async()=>{
  const files=new Map();
  const adapter={mkdir:async()=>{},list:async()=>({files:[...files.keys()],folders:[]}),remove:async p=>{files.delete(p);},exists:async p=>files.has(p),read:async p=>files.get(p),write:async(p,data)=>{await Promise.resolve();files.set(p,data);}};
  const history=new HistoryStore({app:{vault:{configDir:'.obsidian',adapter}},manifest:{id:'primecore-search'},report:()=>{}});
  await Promise.all([history.prepend('2026-10-13',{q:'one',mode:'vault',ts:1}),history.prepend('2026-10-13',{q:'two',mode:'vault',ts:2})]);
  expect((await history.read(history.path('2026-10-13'))).map(item=>item.q)).toEqual(['two','one']);
  await Promise.all([history.removeRecord(history.path('2026-10-13'),{q:'one',mode:'vault',ts:1}),history.prepend('2026-10-13',{q:'three',mode:'web',ts:3})]);
  expect((await history.read(history.path('2026-10-13'))).map(item=>item.q)).toEqual(['three','two']);
});

test('touch scroll and mismatched fingers never trigger actions',()=>{
  let actions=0;const handler=makeTouchHandler(()=>actions++);
  const start=(x,y,id=1)=>handler.onTouchStart({touches:[{clientX:x,clientY:y,identifier:id}]});
  const end=(x,y,id=1)=>handler.onTouchEnd({preventDefault(){},stopPropagation(){},changedTouches:[{clientX:x,clientY:y,identifier:id}]});
  start(10,10);end(10,100);expect(actions).toBe(0);
  start(10,10);end(10,10,2);expect(actions).toBe(0);
  start(10,10);end(12,12);expect(actions).toBe(1);
});

test('bundled index finds Chinese content and isolates engine instances',async()=>{
  const docs=[{path:'alpha.md',basename:'Alpha',stat:{mtime:1}},{path:'beta.md',basename:'Beta',stat:{mtime:2}}];
  const content={'alpha.md':'中文检索与学习笔记','beta.md':'independent document'};
  const engine=createSearchIndexEngine(),other=createSearchIndexEngine();
  await engine.init({listFiles:()=>docs,fileFor:p=>docs.find(f=>f.path===p),readText:async p=>content[p],getMeta:()=>null},{enabled:true,content:true,bigrams:true});
  expect(engine.search('中文检索').results[0].path).toBe('alpha.md');
  expect(engine.search('Alpha').results[0].path).toBe('alpha.md');
  expect(other.search('Alpha').ready).toBe(false);
  engine.dispose();expect(engine.search('Alpha').ready).toBe(false);
});

test('incremental indexing preserves earlier content and matches when delta outgrows the base index',async()=>{
  const docs=[{path:'base.md',basename:'Base',stat:{mtime:1}}];
  const content=new Map([['base.md','baseline']]);
  const engine=createSearchIndexEngine();
  await engine.init({listFiles:()=>docs,fileFor:p=>docs.find(f=>f.path===p)||null,readText:async p=>content.get(p)||'',getMeta:()=>null},{enabled:true,content:true,bigrams:true});
  try {
    for(let i=0;i<12;i++) {
      const path=`Mobile-${i}.md`;docs.push({path,basename:`Mobile-${i}`,stat:{mtime:i+2}});
      content.set(path,`sharedbody 独有正文 ${i===0?'firstonly':''}`);
      await engine.addPaths([path]);
    }
    expect(engine.search('Mobile').results).toHaveLength(12);
    expect(engine.search('sharedbody').results).toHaveLength(12);
    expect(engine.search('独有正文').results).toHaveLength(12);
    expect(engine.search('firstonly').results.map(r=>r.path)).toEqual(['Mobile-0.md']);
    content.set('Mobile-0.md','replacementbody');await engine.addPaths(['Mobile-0.md']);
    expect(engine.search('firstonly').results).toHaveLength(0);
    expect(engine.search('replacementbody').results[0].path).toBe('Mobile-0.md');
    engine.removePaths(['Mobile-1.md']);
    expect(engine.search('sharedbody').results).toHaveLength(10);
    expect(engine.search('Mobile').results).toHaveLength(11);
  } finally {engine.dispose();}
});

test('disposing during an incremental read cannot restore or mutate a released index',async()=>{
  const docs=[{path:'base.md',basename:'Base',stat:{mtime:1}}];
  let finish:(text:string)=>void;
  const engine=createSearchIndexEngine();
  await engine.init({listFiles:()=>docs,fileFor:p=>docs.find(f=>f.path===p)||null,readText:async p=>p==='slow.md'?await new Promise<string>(resolve=>{finish=resolve;}):'base',getMeta:()=>null},{enabled:true,content:true,bigrams:true});
  docs.push({path:'slow.md',basename:'Slow',stat:{mtime:2}});
  const pending=engine.addPaths(['slow.md']);engine.dispose();finish('delayed content');await pending;
  expect(engine.state).toBe('idle');expect(engine.search('delayed').ready).toBe(false);
});

test('changing page size keeps non-selected result groups and resets stale page numbers',async()=>{
  const {withResults}=await import('../src/ui/results.ts');
  const element=()=>({setCssStyles(){},createDiv(){return element();},createSpan(){return element();},createEl(){return element();},appendText(){},empty(){},setAttribute(){}});
  const groups=[{title:'Vault 文件',items:Array.from({length:6},(_,i)=>({label:`File ${i}`,action(){}}))},{title:'标签匹配',items:[{label:'Tagged note',action(){}}]}];
  let pager;
  const fixture=Object.assign(new (withResults(FakeBase))(),{
    _resultToolView:'results',_dropdownInner:element(),_groupPages:new Map([['Vault 文件',2]]),_dropdownPageSize:2,_vaultSortMode:'relevance',
    app:{vault:{getAbstractFileByPath:()=>null}},_prepBar(){},_visibleResultGroups:all=>all.slice(0,1),_showDropdown(){},
    _listen(){},_makeTouchHandler:()=>({}),_mkPagerBar:(_parent,options)=>{pager=options;}
  });
  fixture._renderDropdown(groups);expect(pager.page).toBe(2);
  pager.onSize(3);
  expect(fixture._lastGroups).toBe(groups);expect(fixture._lastGroups).toHaveLength(2);
  expect(pager.page).toBe(1);expect(fixture._dropdownPageSize).toBe(3);
});
