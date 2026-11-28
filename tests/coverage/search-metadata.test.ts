import {test,expect} from 'bun:test';
import {installObsidianMock,TFile as MockTFile} from '../helpers/obsidian-host.ts';
import type {TFile} from 'obsidian';
import type {SearchBarCtor} from '../../src/ui/search-bar-host.ts';
import type {SearchItem,ContentMatch} from '../../src/types.ts';
installObsidianMock();
const {withMetadataSearch}=await import('../../src/search/metadata-search.ts');
const Base=class {} as unknown as SearchBarCtor;
const Metadata=withMetadataSearch(Base);
const makeFile=(path:string)=>new MockTFile(path) as unknown as TFile;
function fixture(files:TFile[]=[]){const events:unknown[][]=[];const bar=Object.assign(new Metadata(),{app:{vault:{getMarkdownFiles:()=>files,getFiles:()=>files,getAbstractFileByPath:(path:string)=>files.find(f=>f.path===path),cachedRead:async()=> '#work',read:async()=> '#work'},metadataCache:{getFileCache:()=>({tags:[{tag:'#work',position:{start:{offset:0},end:{offset:5}}}]})}},cfg:{tagResultMode:'tags',attachmentFileTypes:[{extension:'pdf',selected:true}]},plugin:{recentFiles:{recordCommand:(...args:unknown[])=>events.push(['recent',...args])},floatingSearch:{close:()=>events.push(['close'])}},internalApp:{commands:{commands:{},listCommands:()=>[],executeCommandById:()=>true}},_excludedPredicate:()=>()=>false,_log:(...args:unknown[])=>events.push(['log',...args]),_recordHistory:(...args:unknown[])=>events.push(['history',...args]),_openVaultResult:(...args:unknown[])=>events.push(['file',...args]),_openUrl:(...args:unknown[])=>events.push(['url',...args]),_notify:(...args:unknown[])=>events.push(['notice',...args]),_buildTagItem:(file:TFile,hits:ContentMatch[]):SearchItem=>({label:file.basename,path:file.path,hits,action(){}})}) as InstanceType<typeof Metadata>;return {bar,events};}
const tick=async()=>{await Promise.resolve();await Promise.resolve();};
test('tag scans bound reads and skip obsolete queued work instead of caching every candidate',async()=>{
 const files=Array.from({length:7},(_,i)=>makeFile(i+'.md'));const {bar}=fixture(files);let active=0,peak=0,cached=0,stale=false;const release:Array<()=>void>=[];
 bar.app.vault.cachedRead=async()=>{cached++;return '#work';};bar.app.vault.read=()=>new Promise<string>(resolve=>{active++;peak=Math.max(peak,active);release.push(()=>{active--;resolve('#work');});});
 const pending=bar._buildTagItems('work',()=>false,()=>stale);await tick();expect(peak).toBe(2);expect(cached).toBe(0);stale=true;for(const done of release)done();expect(await pending).toEqual([]);expect(release).toHaveLength(2);
});
test('tag results switch between grouped tags and matching documents and isolate read failures',async()=>{
 const files=[makeFile('Good.md'),makeFile('Missing.md')];const {bar,events}=fixture(files);bar.app.vault.read=async file=>{if(file.path==='Missing.md')throw Error('missing');return '#work';};bar.app.vault.cachedRead=bar.app.vault.read;
 const groups=await bar._buildTagItems('work',()=>false,()=>false);expect(groups).toHaveLength(1);expect(groups[0]).toMatchObject({label:'#work',sub:'1 篇关联文档'});expect(groups[0].children[0].hits[0].match).toBe('#work');expect(events.some(e=>e[0]==='log')).toBe(true);
 bar.cfg.tagResultMode='documents';expect((await bar._buildTagItems('work',path=>path==='Missing.md',()=>false))[0].path).toBe('Good.md');expect(await bar._buildTagItems('absent',()=>false,()=>false)).toEqual([]);expect(await bar._buildTagItems('work',()=>false,()=>true)).toEqual([]);
});
test('tag scans bound retained documents and per-document excerpts before building result rows',async()=>{
 const files=Array.from({length:205},(_,i)=>makeFile(String(i).padStart(3,'0')+'.md'));
 const {bar,events}=fixture(files);const source=Array(30).fill('#work').join('\n');
 bar.app.vault.read=async()=>source;bar.cfg.tagResultMode='documents';bar._vaultSortMode='alpha-desc';
 bar.app.metadataCache.getFileCache=()=>({tags:Array.from({length:30},(_,i)=>({tag:'#work',position:{start:{offset:i*6,line:i,col:0},end:{offset:i*6+5,line:i,col:5}}}))});
 const rows=await bar._buildTagItems('work',()=>false,()=>false);
 expect(rows).toHaveLength(200);expect(rows[0].path).toBe('204.md');expect(rows.at(-1).path).toBe('005.md');
 expect(rows.every(row=>row.hits.length===20)).toBe(true);expect(events.some(e=>e[0]==='notice'&&String(e[1]).includes('200'))).toBe(true);
});
test('Markdown scans avoid the host cache and retain the currently sorted bounded document set',async()=>{
 const files=Array.from({length:205},(_,i)=>makeFile(String(i).padStart(3,'0')+'.md'));
 const {bar,events}=fixture(files);let cached=0;bar.app.vault.cachedRead=async()=>{cached++;return '# needle';};bar.app.vault.read=async()=> '# needle';
 bar.cfg.markdownElementTypes=['heading'];bar._vaultSortMode='alpha-desc';
 bar._buildMatchItem=(file,terms,hits)=>({label:file.basename,path:file.path,terms,hits,action(){}});
 const rows=await bar._buildMarkdownItems('needle',()=>false,()=>false);
 expect(rows).toHaveLength(200);expect(rows[0].path).toBe('204.md');expect(rows.at(-1).path).toBe('005.md');expect(cached).toBe(0);
 expect(events.some(e=>e[0]==='notice'&&String(e[1]).includes('Markdown'))).toBe(true);
});
test('file enumeration applies attachment filters and gracefully falls back to Markdown files',()=>{
 const md=makeFile('Note.md'),pdf=makeFile('Book.PDF'),png=makeFile('Image.png');const {bar,events}=fixture([md]);bar.app.vault.getFiles=()=>[md,pdf,png];expect(bar._getSearchableFiles()).toEqual([md]);bar._searchNonMarkdown=true;expect(bar._getSearchableFiles()).toEqual([md,pdf]);bar.app.vault.getFiles=()=>{throw Error('unavailable');};expect(bar._getSearchableFiles()).toEqual([md]);expect(events[0][0]).toBe('log');expect(bar._fileLabel(pdf)).toBe('Book.PDF');expect(bar._fileLabel(md)).toBe('Note');expect(bar._fileIconName({path:''} as TFile)).toBe('files');
});
test('commands include hidden registry entries and execution closes the floater before dispatch',()=>{
 const {bar,events}=fixture();const visible={id:'visible',name:'Run command'},hidden={id:'hidden',name:'Hidden command'};bar.internalApp.commands.commands=new Map([['visible',visible],['hidden',hidden]]);bar.internalApp.commands.listCommands=()=>[visible];bar.internalApp.commands.executeCommandById=()=>{events.push(['execute']);return false;};expect(bar._commandCandidates()).toEqual({visible:[visible],hidden:[hidden]});const rows=bar._buildCommandItems('command',['command'],null);expect(rows).toHaveLength(2);expect(rows.find(r=>r.sub==='hidden').icon).toBe('eye-off');rows[0].action();expect(events.map(e=>e[0])).toEqual(['history','recent','close','execute','notice']);
});
test('bookmark search handles exclusions, native URL navigation, missing targets and unsupported kinds',async()=>{
 const note=makeFile('Note.md');const {bar,events}=fixture([note]);const bookmarks=[{type:'group',title:'group'},{type:'file',path:'Skip.md'},{type:'url',title:'Site',url:'https://example.com'},{type:'file',path:'Note.md'}];bar._getBookmarksInstance=()=>({items:bookmarks});bar._flattenBookmarks=items=>items;
 const rows=await bar._buildBookmarkItems([],null,path=>path==='Skip.md',1);expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({label:'Site',sub:'https://example.com',icon:'external-link'});rows[0].action();expect(events.at(-1)).toEqual(['url','https://example.com']);bar._openBookmarkResult({type:'file',path:'Missing.md'},'Missing');expect(events.at(-1)[0]).toBe('log');bar._openBookmarkResult({type:'file',path:'Note.md'},'Note');expect(events.at(-1)).toEqual(['file','Note.md','Note']);bar._openBookmarkResult({type:'folder',path:'Folder'},'Folder');expect(events.at(-1)[0]).toBe('log');expect(bar._bookmarkSub({type:'graph'})).toBe('图谱');expect(bar._bookmarkSub({type:'search'})).toBe('搜索');expect(bar._bookmarkTitle(null)).toBe('');
});
