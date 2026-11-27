/** Keep rendering bounded while navigation retains the complete source match.
 * 限制渲染片段长度，原文匹配和跳转仍保留完整来源。 */
export function boundedPreview(source:string,limit=8000):string {
  // Native rendering hides frontmatter, including the matched keyword. Show it as
  // YAML in excerpts without changing the source offsets used for navigation.
  // 原生渲染会隐藏属性中的命中；摘要改用 YAML 展示，跳转仍使用原文偏移。
  source=source.replace(/^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/,(_match:string,body:string)=>{
    const fence='`'.repeat(Math.max(3,...[...body.matchAll(/`+/g)].map(match=>match[0].length+1)));
    return `${fence}yaml\n${body}\n${fence}\n\n`;
  });
  if(source.length<=limit)return source;
  let snippet=source.slice(0,limit);
  const line=snippet.lastIndexOf('\n');if(line>limit/2)snippet=snippet.slice(0,line);
  // A fence can follow prose or be closed before the truncation point.
  // 围栏可能位于正文之后，也可能在截断前已闭合，不能只检查第一行。
  let fence='';
  for(const match of snippet.matchAll(/^ {0,3}(`{3,}|~{3,})([^\r\n]*)/gm)){
    if(!fence){if(match[1][0]!=='`'||!match[2].includes('`'))fence=match[1];}
    else if(match[1][0]===fence[0]&&match[1].length>=fence.length&&!match[2].trim())fence='';
  }
  return snippet+(fence?'\n'+fence:'')+'\n\n…';
}
