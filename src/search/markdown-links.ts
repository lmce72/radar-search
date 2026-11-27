export interface MarkdownLink {start:number;end:number;target:string;label:string;external:boolean;source?:string}
const unescape=(text:string)=>text.replace(/\\([()[\]<>\\ ])/g,'$1');
function escaped(text:string,index:number):boolean {let count=0;for(let i=index-1;i>=0&&text[i]==='\\';i--)count++;return count%2===1;}
export function referenceDefinitions(text:string):Map<string,string> {
  const result=new Map<string,string>();let fence:string|null=null,comment:string|null=null;
  let frontmatter=/^---[ \t]*(?:\r\n|\r|\n)/.test(text);
  for(const [index,raw] of text.split(/\r\n|\r|\n/).entries()){
    let line=raw;
    if(frontmatter){if(index>0&&/^(?:---|\.\.\.)[ \t]*$/.test(line))frontmatter=false;continue;}
    if(comment){const end=line.indexOf(comment);if(end<0)continue;line=line.slice(end+comment.length);comment=null;}
    const marker=line.match(/^ {0,3}(`{3,}|~{3,})/);
    if(marker){if(!fence){if(marker[1][0]!=='`'||!line.slice(marker[0].length).includes('`'))fence=marker[1];}else if(marker[1][0]===fence[0]&&marker[1].length>=fence.length&&!line.slice(marker[0].length).trim())fence=null;continue;}
    if(fence)continue;
    while(true){
      const marker=[{open:'%%',close:'%%'},{open:'<!--',close:'-->'}].map(value=>({...value,index:line.indexOf(value.open)})).filter(value=>value.index>=0).sort((a,b)=>a.index-b.index)[0];
      if(!marker)break;
      const end=line.indexOf(marker.close,marker.index+marker.open.length);
      if(end<0){comment=marker.close;line=line.slice(0,marker.index);break;}
      line=line.slice(0,marker.index)+line.slice(end+marker.close.length);
    }
    const match=line.match(/^ {0,3}\[([^\]^]+)\]:\s*(?:<([^>]+)>|(\S+))/);
    if(match)result.set(match[1].trim().toLowerCase(),unescape(match[2]||match[3]));
  }return result;
}
/** Balanced destinations and reference labels without a nested backtracking regex.
 * 线性读取平衡括号和引用标签，避免嵌套回溯正则。 */
export function inlineMarkdownLinks(text:string,references:ReadonlyMap<string,string>):MarkdownLink[] {
  const result:MarkdownLink[]=[];
  if(/^ {0,3}\[[^\]]+\]:/.test(text))return result;
  const add=(start:number,end:number,target:string,label:string,source?:string)=>{
    const clean=unescape(target.trim().replace(/^<|>$/g,''));
    result.push({start,end,target:clean,label:label||clean,external:/^(?:https?:|mailto:|obsidian:)/i.test(clean),source});
  };
  for(let i=0;i<text.length;i++){
    if(escaped(text,i))continue;
    const start=text[i]==='!'&&text[i+1]==='['?i+1:i;
    if(text.startsWith('[[',start)){
      const end=text.indexOf(']]',start+2);if(end<0)continue;
      const [target,label]=text.slice(start+2,end).split('|');add(i,end+2,target,label);i=end+1;continue;
    }
    if(text[start]==='['){
      let close=start+1;while(close<text.length&&(text[close]!==']'||escaped(text,close)))close++;
      if(close>=text.length)continue;
      const label=text.slice(start+1,close);if(label.startsWith('^'))continue;
      if(text[close+1]==='('){
        let depth=1,end=close+2;for(;end<text.length;end++){if(escaped(text,end))continue;if(text[end]==='(')depth++;if(text[end]===')'&&!--depth)break;}
        if(depth)continue;
        const target=text.slice(close+2,end).trim().replace(/\s+["'][\s\S]*$/,'');add(i,end+1,target,label);i=end;continue;
      }
      const refEnd=text[close+1]==='['?text.indexOf(']',close+2):-1;
      const ref=refEnd>=0?text.slice(close+2,refEnd)||label:label;
      const target=references.get(ref.trim().toLowerCase());
      if(target){const end=refEnd>=0?refEnd+1:close+1;add(i,end,target,label,'['+label+']('+target+')');i=end-1;continue;}
    }
    if(!['<','h','H'].includes(text[i]))continue;
    const rest=text.slice(i),auto=rest.match(/^<(https?:\/\/[^>]+|mailto:[^>]+)>/i);
    if(auto){add(i,i+auto[0].length,auto[1],auto[1]);i+=auto[0].length-1;continue;}
    if(/^https?:\/\//i.test(rest)){
      let value=rest.match(/^[^\s<>"`]+/)[0].replace(/[.,;:!?'，。；：！？]+$/g,'');
      while(value.endsWith(')')&&value.split(')').length>value.split('(').length)value=value.slice(0,-1);
      add(i,i+value.length,value,value);i+=value.length-1;
    }
  }return result;
}
