import { test, expect, mock } from 'bun:test';
import type {SearchGroup} from '../src/types.ts';
import moment from 'moment';
mock.module('obsidian',()=>({moment,normalizePath:value=>value.replaceAll('\\','/'),TFile:class TFile {},MarkdownView:class MarkdownView {},Platform:{isMobile:false},getIcon:()=>null,setIcon(){},
  getFrontMatterInfo:()=>({exists:false,frontmatter:'',from:0,to:0,contentStart:0})}));
const {HistoryStore}=await import('../src/history/store.ts');
const {SettingsStore}=await import('../src/settings/store.ts');
const {DEFAULT_SETTINGS,normalizeSettings,validateSetting}=await import('../src/settings/schema.ts');
const {createSearchIndexEngine}=await import('../src/search/index-engine.ts');
const {makeTouchHandler}=await import('../src/shared/touch.ts');
const {withIndexIntegration}=await import('../src/search/index-integration.ts');
const {normalizeSuggestions}=await import('../src/search/web-search.ts');
const FakeBase = class {} as unknown as import('../src/ui/search-bar-host.ts').SearchBarCtor;

test('vault and global searches include alias rows with and without the ready index', async () => {
  const {withVaultSearch} = await import('../src/search/vault-search.ts');
  const {withGlobalSearch} = await import('../src/search/global-search.ts');
  const file = {path:'Notes/Original.md',basename:'Original',parent:{path:'Notes'}};
  for (const behavior of [withVaultSearch,withGlobalSearch]) for (const indexed of [false,true]) {
    let groups: SearchGroup[] = [];
    const errors: unknown[][] = [];
    const fixture = Object.assign(new (behavior(FakeBase))(), {
      _vaultSearchVer:0,_vaultSortMode:'relevance',_contentSearch:false,
      _getSearchableFiles:()=>[file],_excludedPredicate:()=>()=>false,
      _indexQuery:()=>indexed?{results:[{isNameMatch:true,path:file.path}]}:null,
      _itemsFromEngineHits:()=>[{label:'Original',path:file.path,action(){}}],
      app:{metadataCache:{getFileCache:()=>({frontmatter:{aliases:['Different title']}})}},
      _fileLabel:()=>file.basename,_fileIconName:()=> 'file',_openVaultResult(){},
      _isVaultStale:()=>false,_renderDropdown:(next:SearchGroup[])=>{groups=next;},
      _resolveWebEngines:()=>[],_log:(...args:unknown[])=>{errors.push(args);}
    });
    if (behavior === withVaultSearch) await fixture._searchVault('different');
    else await fixture._searchGlobal('different');
    expect(errors).toEqual([]);
    const aliases = groups[0].items.filter(item=>item.alias);
    expect(aliases.map(item=>[item.label,item.path,item.sub])).toEqual([['Different title',file.path,file.path]]);
    if(indexed) expect(groups[0].items.some(item=>item.label==='Original'&&!item.alias)).toBe(true);
  }
});

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

test('typed history round-trips exact targets and deduplicates by location rather than display label',async()=>{
  const {parseHistoryRecords}=await import('../src/history/records.ts');
  const {createContentMatch}=await import('../src/search/content-matches.ts');
  const contents=new Map<string,string>();
  const adapter={exists:async path=>contents.has(path),read:async path=>contents.get(path),write:async(path,text)=>{contents.set(path,text);},mkdir:async()=>{},list:async()=>({files:[],folders:[]}),remove:async()=>{}};
  const store=new HistoryStore({app:{vault:{configDir:'.obsidian',adapter}},manifest:{id:'primecore-search'},report(){}});
  const base={q:'needle',mode:'vault' as const,ts:1,file:'same label'};
  const one={...base,target:{kind:'file' as const,path:'A/same.md',hit:createContentMatch('needle needle',0,6)}};
  const two={...base,target:{kind:'file' as const,path:'B/same.md',hit:createContentMatch('needle needle',7,13)}};
  await Promise.all([store.prepend('2026-11-26',one),store.prepend('2026-11-26',two)]);
  const records=await store.read(store.path('2026-11-26'));
  expect(records).toEqual([two,one]);
  await store.prepend('2026-11-26',two);expect(await store.read(store.path('2026-11-26'))).toHaveLength(2);
  expect(parseHistoryRecords([{...base,target:{kind:'url',url:'javascript:alert(1)'}},null,{q:4}])[0].target).toBeUndefined();
  expect(parseHistoryRecords([{...base,target:{kind:'command',id:'sample:run'}}])[0].target).toEqual({kind:'command',id:'sample:run'});
});

test('recent opens are opt-in, cover files and commands, and follow renamed files only',async()=>{
  const {RecentFilesStore,pruneRecentFiles}=await import('../src/history/recent-files.ts');
  const now=new Date(2026,10,26,10).getTime(),yesterday=new Date(2026,10,25,23).getTime();
  const records=[{path:'today.md',ts:now},{path:'old.md',ts:yesterday},{path:'today.md',ts:now-1000}];
  expect(pruneRecentFiles([...records],1,50,now).map(record=>record.path)).toEqual(['today.md']);
  expect(pruneRecentFiles([...records],2,50,now).map(record=>record.path)).toEqual(['today.md','old.md']);
  expect(pruneRecentFiles([...records],2,1,now)).toHaveLength(1);
  expect(pruneRecentFiles([{path:'same',ts:now,kind:'file'},{path:'same',ts:now-1,kind:'command',label:'Run'}],2,50,now)).toHaveLength(2);
  const saved=new Map<string,string>();let reads=0;
  const settings=structuredClone(DEFAULT_SETTINGS);
  const plugin={settings,manifest:{id:'primecore-search'},report(){},app:{vault:{configDir:'.obsidian',getFileByPath:()=>({}),adapter:{exists:async()=>{reads++;return false;},write:async(path,text)=>{saved.set(path,text);}}}}};
  const store=new RecentFilesStore(plugin as unknown as import('../src/main.ts').default);
  await store.configure();store.record('test.md');await store.pending;expect(reads).toBe(0);expect(saved.size).toBe(0);
  settings.recentFilesEnabled=true;await store.configure();store.record('A.md');store.record('B.md');store.record('A.md');store.record('image.png');store.recordCommand('app:open-settings','Open settings');await store.pending;
  // Non-Markdown files and commands share the timeline; the latest entry wins. / 非 md 与命令同列，最新在前。
  expect(store.list().map(record=>record.path)).toEqual(['app:open-settings','image.png','A.md','B.md']);
  expect(store.list()[0]).toMatchObject({kind:'command',label:'Open settings'});
  store.rename('A.md','Moved.md');await store.pending;
  expect(store.list().map(record=>record.path)).toContain('Moved.md');
  store.rename('app:open-settings','elsewhere');await store.pending;
  expect(store.list().some(record=>record.kind==='command'&&record.path==='app:open-settings')).toBe(true);
  settings.recentFilesLimit=1;await store.configure();expect(store.list()).toHaveLength(1);
  settings.recentFilesEnabled=false;store.record('No.md');store.recordCommand('app:no','No');await store.pending;expect(store.list()).toEqual([]);
});

test('history dispatch uses persisted IDs and paths and refuses removed files without creating notes',async()=>{
 const {withHistory}=await import('../src/history/history-behavior.ts');
 const calls:unknown[]=[];
 const fixture=Object.assign(new (withHistory(FakeBase))(),{
   _input:{value:''},_selectMode(){},_syncClearBtn(){},_recordHistory(){},
   app:{vault:{getAbstractFileByPath:()=>null}},plugin:{floatingSearch:{close(){}}},
   _notify:message=>calls.push(['notice',message]),_runCommand:(id,name)=>calls.push(['command',id,name]),
   _openVaultResult:path=>calls.push(['file',path]),_openUrl:url=>calls.push(['url',url]),
   _openBookmarkResult:item=>calls.push(['bookmark',item.type])
 });
 const base={q:'query',mode:'vault' as const,ts:1,file:'Display label'};
 fixture._openHistoryTarget({...base,target:{kind:'command',id:'plugin:actual-id'}});
 fixture._openHistoryTarget({...base,target:{kind:'url',url:'https://example.com'}});
 fixture._openHistoryTarget({...base,target:{kind:'bookmark',bookmark:{type:'folder',path:'Folder'}}});
 fixture._openHistoryTarget({...base,target:{kind:'file',path:'Deleted.md'}});
 expect(calls.slice(0,3)).toEqual([['command','plugin:actual-id','Display label'],['url','https://example.com'],['bookmark','folder']]);
 expect(calls[3][0]).toBe('notice');expect(calls.some(call=>call[0]==='file')).toBe(false);
});

test('unlimited recent documents retain older dates and more than fifty paths with newest-per-file deduplication',async()=>{
 const {pruneRecentFiles}=await import('../src/history/recent-files.ts');
 const now=new Date(2026,10,26,15).getTime();
 const records=Array.from({length:80},(_,i)=>({path:`Note-${i}.md`,ts:now-i*86400000}));
 records.push({path:'Note-0.md',ts:now-5000});
 expect(pruneRecentFiles(records,0,0,now)).toHaveLength(80);
 expect(pruneRecentFiles(records,0,0,now)[0]).toEqual({path:'Note-0.md',ts:now});
 expect(pruneRecentFiles(records,1,0,now)).toHaveLength(1);
 expect(pruneRecentFiles(records,0,2,now)).toHaveLength(2);
});
test('recent date cleanup works while capture is disabled and preserves dates outside the range',async()=>{
 const {RecentFilesStore}=await import('../src/history/recent-files.ts');
 const entries=[{path:'Before.md',ts:new Date(2026,10,24,23,59).getTime()},{path:'First.md',ts:new Date(2026,10,25).getTime()},{path:'Last.md',ts:new Date(2026,10,26,23,59,59,999).getTime()},{path:'After.md',ts:new Date(2026,10,27).getTime()}];
 let data=JSON.stringify(entries),writes=0;
 const plugin={settings:{...structuredClone(DEFAULT_SETTINGS),recentFilesEnabled:false},manifest:{id:'primecore-search'},report(){},app:{vault:{configDir:'.obsidian',getFileByPath:()=>({}),adapter:{exists:async()=>true,read:async()=>data,write:async(_path,text)=>{writes++;data=text;}}}}};
 const store=new RecentFilesStore(plugin as unknown as import('../src/main.ts').default);
 expect(await store.clearRange('2026-11-25','2026-11-26')).toBe(2);
 expect(JSON.parse(data)).toEqual([entries[0],entries[3]]);expect(plugin.settings.recentFilesEnabled).toBe(false);
 expect(await store.clearRange('2026-11-25','2026-11-26')).toBe(0);expect(writes).toBe(1);
 expect(()=>store.clearRange('2026-11-27','2026-11-26')).toThrow();
});
test('history cleanup serializes with writes and deletes only dated files within the inclusive range',async()=>{
 const files=new Map<string,string>();
 const adapter={exists:async path=>files.has(path),read:async path=>files.get(path),write:async(path,text)=>{files.set(path,text);},mkdir:async()=>{},list:async()=>({files:[...files.keys()],folders:[]}),remove:async path=>{files.delete(path);}};
 const store=new HistoryStore({app:{vault:{configDir:'.obsidian',adapter}},manifest:{id:'primecore-search'},report(){}});
 for(const date of ['2026-11-24','2026-11-25','2026-11-26','2026-11-27'])files.set(store.path(date),'[]');
 const unrelated=store.directory+'/notes.json';files.set(unrelated,'keep');
 const before=store.prepend('2026-11-25',{q:'latest',mode:'vault',ts:Date.now()});
 const clearing=store.clearRange('2026-11-25','2026-11-26');await before;
 expect(await clearing).toBe(2);
 expect([...files.keys()].sort()).toEqual([store.path('2026-11-24'),store.path('2026-11-27'),unrelated].sort());
 expect(()=>store.clearRange('invalid','2026-11-26')).toThrow();
});
test('disabled search history blocks result, close, submit, and direct asynchronous history writes',async()=>{
 const {withHistory}=await import('../src/history/history-behavior.ts');
 let writes=0;
 const bar=Object.assign(new (withHistory(FakeBase))(),{plugin:{settings:{historyRetentionMode:'disabled'},history:{prepend:async()=>{writes++;}}},_input:{value:'query'},_saveToHistory:async()=>{writes++;}});
 bar._recordHistory('Target',undefined,{kind:'file',path:'Target.md'});bar._recordHistory();
 expect(writes).toBe(0);
 const direct=Object.assign(new (withHistory(FakeBase))(),{plugin:{settings:{historyRetentionMode:'disabled'},history:{prepend:async()=>{writes++;}}}});
 await direct._saveToHistory('query','vault','Target');expect(writes).toBe(0);
});

test('unlimited retention survives an unavailable vault index and disabling capture before queued writes',async()=>{
 const {RecentFilesStore}=await import('../src/history/recent-files.ts');
 const original=[{path:'Original.md',ts:Date.now()-1000}];let data=JSON.stringify(original),indexed=false;
 const settings={...structuredClone(DEFAULT_SETTINGS),recentFilesEnabled:true,recentFilesDays:0,recentFilesLimit:0};
 const plugin={settings,manifest:{id:'primecore-search'},report(){},app:{vault:{configDir:'.obsidian',getFileByPath:()=>indexed?{}:null,adapter:{exists:async()=>true,read:async()=>data,write:async(_path,text)=>{data=text;}}}}};
 const store=new RecentFilesStore(plugin as unknown as import('../src/main.ts').default);
 await store.configure();expect(JSON.parse(data)).toEqual(original);expect(store.list()).toEqual([]);
 indexed=true;expect(store.list()).toEqual(original);
 store.record('Queued.md');settings.recentFilesEnabled=false;await store.pending;
 expect(JSON.parse(data)).toEqual(original);
 settings.recentFilesEnabled=true;await store.configure();expect(store.list()).toEqual(original);
});

test('Quick switcher imports keep their order, skip duplicates, and join the shared timeline',async()=>{
 const {RecentFilesStore}=await import('../src/history/recent-files.ts');
 const existing={path:'Existing.md',ts:Date.now()-86400000};let data=JSON.stringify([existing]);let writes=0,reads=0;
 const settings={...structuredClone(DEFAULT_SETTINGS),recentFilesEnabled:true,recentFilesDays:0,recentFilesLimit:0};
 const valid=new Set(['Existing.md','Older.md','Newest.md','image.png']);
 const plugin={settings,manifest:{id:'primecore-search'},report(){},app:{workspace:{getLastOpenFiles:()=>{reads++;return ['Older.md','Existing.md','Newest.md','Older.md','Missing.md','image.png'];}},vault:{configDir:'.obsidian',getFileByPath:path=>valid.has(path)?{}:null,adapter:{exists:async()=>true,read:async()=>data,write:async(_path,text)=>{writes++;data=text;}}}}};
 const store=new RecentFilesStore(plugin as unknown as import('../src/main.ts').default);await store.configure();
 // Imports carry the import time, so they simply join the normal newest-first list.
 // 导入项以导入时间进入常规时间线，不再单列「快速切换」分类。
 expect(await store.importQuickSwitcher()).toBe(3);
 expect(store.list().map(record=>record.path)).toEqual(['Older.md','Newest.md','image.png','Existing.md']);
 expect(store.list().filter(record=>record.source==='quick-switcher')).toHaveLength(3);
 expect(await store.importQuickSwitcher()).toBe(0);expect(writes).toBe(1);
 const reloaded=new RecentFilesStore(plugin as unknown as import('../src/main.ts').default);await reloaded.configure();
 expect(reloaded.list().filter(record=>record.source==='quick-switcher')).toHaveLength(3);
 reloaded.record('Older.md');await reloaded.pending;expect(reloaded.list()[0].path).toBe('Older.md');expect(reloaded.list()[0].source).toBeUndefined();
 settings.recentFilesEnabled=false;const previousReads=reads;await expect(reloaded.importQuickSwitcher()).rejects.toThrow('请先开启');expect(reads).toBe(previousReads);
});
