import {test,expect} from 'bun:test';
import {createSearchIndexEngine} from '../src/search/index-engine.ts';

test('attachment names include extensions in both full and incremental indexes',async()=>{
  const files=[{path:'附件/知识图.canvas',basename:'知识图',stat:{mtime:1}},{path:'附件/说明.TXT',basename:'说明',stat:{mtime:1}},{path:'note.md',basename:'note',stat:{mtime:1}}];
  const engine=createSearchIndexEngine();
  await engine.init({listFiles:()=>files,fileFor:path=>files.find(file=>file.path===path)||null,readText:async()=>'',getMeta:()=>null},{enabled:true,content:true,bigrams:true});
  try{
    for(const query of ['canvas','.canvas','知识图.canvas'])expect(engine.search(query).results.find(hit=>hit.path===files[0].path)?.isNameMatch).toBe(true);
    expect(engine.search('txt').results[0].path).toBe(files[1].path);
    expect(engine.search('canvas').results[0].basename).toBe('知识图');
    expect(engine.search('canvas').results[0].isContentMatch).toBe(false);
    const pdf={path:'附件/报告.pdf',basename:'报告',stat:{mtime:2}};files.push(pdf);engine.queueReindex([pdf.path]);await engine.flushReindex();
    expect(engine.search('pdf').results[0].path).toBe(pdf.path);
    const old=files[0].path;engine.removePaths([old]);files[0]={...files[0],path:'附件/重命名.canvas',basename:'重命名'};engine.queueReindex([files[0].path]);await engine.flushReindex();
    expect(engine.search('canvas').results.map(hit=>hit.path)).toEqual([files[0].path]);
  }finally{engine.dispose();}
});
test('suffix constraints are applied before the ranked candidate limit',async()=>{
  const files=Array.from({length:100},(_,index)=>({path:'needle-'+index+'.md',basename:'needle-'+index,stat:{mtime:1}}));
  files.push({path:'weak-needle.canvas',basename:'weak-needle',stat:{mtime:1}});
  const engine=createSearchIndexEngine();await engine.init({listFiles:()=>files,fileFor:path=>files.find(file=>file.path===path)||null,readText:async()=>'',getMeta:()=>null},{enabled:true,content:true,bigrams:true});
  try{const result=engine.search('needle',{limit:1,acceptPath:path=>path.endsWith('.canvas')});expect(result.results.map(hit=>hit.path)).toEqual(['weak-needle.canvas']);expect(result.total).toBe(1);}finally{engine.dispose();}
});
