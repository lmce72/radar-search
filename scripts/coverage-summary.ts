import {readFile,readdir} from 'node:fs/promises';
import {join,relative} from 'node:path';
import ts from 'typescript';

// Coverage scope is explicit: never treat unloaded source as covered.
// 明确统计范围，未加载源码不能被误报为已覆盖。
const file=process.argv[2];
if(!file)throw Error('Usage: bun scripts/coverage-summary.ts <lcov.info>');
const source=(await readdir('src',{recursive:true,withFileTypes:true})).filter(entry=>entry.isFile()&&entry.name.endsWith('.ts')).map(entry=>relative('.',join(entry.parentPath,entry.name))).sort();
const records=(await readFile(file,'utf8')).split('end_of_record').flatMap(record=>{
 const path=record.match(/^SF:(.+)$/m)?.[1];if(!path?.startsWith('src/'))return [];
 const metric=(name:string)=>Number(record.match(new RegExp('^'+name+':(\\d+)$','m'))?.[1]||0);
 return [{path,lines:metric('LF'),hitLines:metric('LH'),functions:metric('FNF'),hitFunctions:metric('FNH')}];
});
const loaded=new Set(records.map(record=>record.path));
const typeOnly:string[]=[],unloaded:string[]=[];
for(const path of source){
 const output=ts.transpileModule(await readFile(path,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
 if(!output.replace(/export\s*\{\s*\};?/g,'').trim())typeOnly.push(path);
 else if(!loaded.has(path))unloaded.push(path);
}
const total=records.reduce((sum,record)=>({lines:sum.lines+record.lines,hitLines:sum.hitLines+record.hitLines,functions:sum.functions+record.functions,hitFunctions:sum.hitFunctions+record.hitFunctions}),{lines:0,hitLines:0,functions:0,hitFunctions:0});
const percent=(hits:number,all:number)=>all?(100*hits/all).toFixed(2)+'%':'n/a';
console.log(JSON.stringify({sourceFiles:source.length,typeOnly,executableSourceFiles:source.length-typeOnly.length,loadedExecutableSourceFiles:source.length-typeOnly.length-unloaded.length,unloaded,...total,lineCoverageLoaded:percent(total.hitLines,total.lines),functionCoverageLoaded:percent(total.hitFunctions,total.functions),lowest:records.filter(record=>record.lines).sort((a,b)=>a.hitLines/a.lines-b.hitLines/b.lines).slice(0,12).map(record=>({path:record.path,lines:percent(record.hitLines,record.lines)})),note:'Line/function percentages cover instrumented source only; no branch metric is emitted by Bun LCOV.'},null,2));
