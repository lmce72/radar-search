import { test, expect, mock } from 'bun:test';
mock.module('obsidian',()=>({normalizePath:value=>value.replaceAll('\\','/'),TFile:class TFile {}}));
const {HistoryStore}=await import('../src/history/store.ts');
const {SettingsStore}=await import('../src/settings/store.ts');
const {DEFAULT_SETTINGS,normalizeSettings,validateSetting}=await import('../src/settings/schema.ts');
const {createSearchIndexEngine}=await import('../src/search/index-engine.ts');
const {makeTouchHandler}=await import('../src/shared/touch.ts');
const {withIndexIntegration}=await import('../src/search/index-integration.ts');
const {normalizeSuggestions}=await import('../src/search/web-search.ts');
const FakeBase = class {} as unknown as import('../src/ui/search-bar-host.ts').SearchBarCtor;

test('web suggestions reject non-text provider entries before rendering and sorting',()=>{
  expect(normalizeSuggestions(['one',null,12,{},'', 'two'])).toEqual(['one','two']);
  expect(normalizeSuggestions(null)).toEqual([]);
  expect(normalizeSuggestions(Array.from({length:10},(_,i)=>String(i)))).toHaveLength(6);
});

test('indexed content results preserve the file path used by per-item directory exclusions',async()=>{
  const {TFile}=await import('obsidian');
  const file=Object.assign(new TFile(),{path:'Work/Archive/note.md',basename:'note',parent:{path:'Work/Archive'}});
  const fixture=Object.assign(new (withIndexIntegration(FakeBase))(),{
    app:{vault:{getAbstractFileByPath:()=>file,cachedRead:async()=> 'needle in note'}},
    _isVaultStale:()=>false,_extractAllSnippets:()=>[{text:'needle in note',start:0,end:6}],
    _fileLabel:()=>file.basename,_fileIconName:()=> 'file',_openVaultResult:()=>{},_openContentResult:()=>{}
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
  const element=()=>({setCssStyles(){},createDiv(){return element();},createSpan(){return element();},appendText(){},empty(){},setAttribute(){}});
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
