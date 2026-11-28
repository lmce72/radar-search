// Independent cryptographic random content; Markdown punctuation is structural.
// 正文逐文件独立使用加密随机源；Markdown 标点属于结构，不复用正文。
const fs=require('node:fs'),crypto=require('node:crypto'),path=require('node:path');
const [directory,countArg='300',rowsArg='12001']=process.argv.slice(2),count=Number(countArg),rows=Number(rowsArg);
if(!directory||!Number.isInteger(count)||count<1||!Number.isInteger(rows)||rows<10001)throw Error('Usage: node generate.cjs isolated-directory [files=300] [rows=12001]');
const root=path.resolve(directory);fs.mkdirSync(root,{recursive:true});const report={count,rows,done:0,bytes:0,random:'crypto.randomBytes',samples:[]};
for(let file=0;file<count;file++){
 const disk=fs.statfsSync(root);if(disk.bavail*disk.bsize<24*1024**3)throw Error('Less than 24 GiB free; generation stopped');
 const bytes=crypto.randomBytes(rows*40).toString('hex'),lines=new Array(rows);let at=0;
 for(let row=0;row<rows;row++){
  const words=new Array(10);for(let w=0;w<10;w++){words[w]=bytes.slice(at,at+8);at+=8;}
  const text=words.join(' '),kind=parseInt(words[0].slice(0,2),16)%12;
  lines[row]=kind===0?'## '+text:kind===1?'**'+text+'**':kind===2?'*'+text+'*':kind===3?'=='+text+'==':kind===4?'- [ ] '+text:kind===5?'> '+text:kind===6?'- '+text:kind===7?'`'+text+'`':kind===8?'['+words[0]+'](https://example.invalid/'+words.slice(1).join('/')+')':kind===9?'<!-- '+text+' -->':kind===10?'```'+words[0]+'\n'+words.slice(1).join(' ')+'\n```':text;
 }
 const body=lines.join('\n')+'\n',folder=path.join(root,String(Math.floor(file/1000)).padStart(3,'0'));fs.mkdirSync(folder,{recursive:true});
 const name=String(file).padStart(6,'0')+'.md';fs.writeFileSync(path.join(folder,name),body,{flag:'wx'});report.done++;report.bytes+=Buffer.byteLength(body);
 if(report.samples.length<3)report.samples.push({file:name,sha256:crypto.createHash('sha256').update(body).digest('hex')});
 if(file%100===0||file===count-1)fs.writeFileSync(path.join(root,'generation.json'),JSON.stringify(report,null,2));
}
