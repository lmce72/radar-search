import {mock} from 'bun:test';
import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';
const [sourceRoot,vaultRoot,mode,reportPath]=process.argv.slice(2);
if(!sourceRoot||!vaultRoot||!reportPath)throw Error('Usage: worker.ts source-root corpus-root scan|index report.json');
class File {path='';basename='';extension='md';name='';parent={path:''};stat={mtime:0,size:0};}
mock.module('obsidian',()=>({TFile:File,Platform:{isMobile:true},normalizePath:(value:string)=>value}));
const load=(file:string)=>import(pathToFileURL(path.join(sourceRoot,'src','search',file)).href);
const files:File[]=[];for(const folder of fs.readdirSync(vaultRoot,{withFileTypes:true})){
 const names=folder.isDirectory()&&/^\d{3}$/.test(folder.name)?fs.readdirSync(path.join(vaultRoot,folder.name)).map(name=>folder.name+'/'+name):folder.isFile()?[folder.name]:[];
 for(const name of names)if(name.endsWith('.md'))files.push(Object.assign(new File(),{path:name,name:path.basename(name),basename:path.basename(name,'.md')}));
}files.sort((a,b)=>a.path.localeCompare(b.path));const byPath=new Map(files.map(file=>[file.path,file]));
const state={mode,files:files.length,reads:0,activeReads:0,peakReads:0,heartbeat:0,started:Date.now(),elapsed:0,done:false,items:0,error:'',indexState:'',peakRSS:0};
const record=()=>{state.peakRSS=Math.max(state.peakRSS,process.memoryUsage().rss);state.elapsed=Date.now()-state.started;fs.writeFileSync(reportPath,JSON.stringify({...state,rss:process.memoryUsage().rss},null,2));};
const timer=setInterval(()=>{state.heartbeat++;record();},1000);record();
const read=async(file:File)=>{state.reads++;if(state.reads%128===0)record();state.activeReads++;state.peakReads=Math.max(state.peakReads,state.activeReads);try{return await fs.promises.readFile(path.join(vaultRoot,file.path),'utf8');}finally{state.activeReads--;}};
try{
 if(mode==='index'){
  const {createSearchIndexEngine}=await load('index-engine.ts');const engine=createSearchIndexEngine();await engine.init({listFiles:()=>files,fileFor:(p:string)=>byPath.get(p),readText:(p:string)=>read(byPath.get(p)!),getMeta:()=>null},{enabled:true,content:true,bigrams:true,debug:false});state.indexState=engine.state;state.items=engine.stats.docs;engine.dispose();
 }else{
  const {withVaultSearch}=await load('vault-search.ts'),{withSnippets}=await load('snippets.ts');
  const Base=class {},bar=Object.assign(new (withVaultSearch(withSnippets(Base)))(),{
   app:{vault:{getMarkdownFiles:()=>files,getFiles:()=>files,getAbstractFileByPath:(p:string)=>byPath.get(p),read,cachedRead:read},metadataCache:{getFileCache:()=>null}},
   cfg:{searchIndex:{enabled:false},vaultContentSearchMaxResults:30},_mode:'vault',_vaultSearchVer:0,_vaultSortMode:'relevance',_contentSearch:true,_limitContentResults:false,
   _getSearchableFiles:()=>files,_excludedPredicate:()=>()=>false,_indexQuery:()=>null,_isVaultStale:()=>false,_fileLabel:(f:File)=>f.basename,_fileIconName:()=> 'file',
   _renderDropdown:(groups:Array<{title:string;items:unknown[]}>)=>{state.items=groups.find(group=>group.title==='内容匹配')?.items.length||0;},_notify(){},_log:(level:string,...args:unknown[])=>{if(level==='error')state.error=String(args[0]);}
  });await bar._searchVault('a');
 }
 state.done=true;
}catch(error){state.error=String(error);process.exitCode=1;}finally{clearInterval(timer);record();}
