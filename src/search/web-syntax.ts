export const WEB_OPERATORS=[
  {syntax:'site:',label:'限定网站',example:'example.com'},
  {syntax:'intitle:',label:'标题包含',example:'关键词'},
  {syntax:'inurl:',label:'网址包含',example:'关键词'},
  {syntax:'filetype:',label:'文件类型',example:'pdf'},
  {syntax:'before:',label:'早于日期',example:'2026-01-01'},
  {syntax:'after:',label:'晚于日期',example:'2026-01-01'},
  {syntax:'""',label:'精确短语',example:'关键词'},
  {syntax:'-',label:'排除词',example:'关键词'}
];
/** Only the unfinished final token is replaced. / 只替换末尾未完成的语法词。 */
export function completeWebSyntax(query:string):Array<{label:string;value:string;caret:number}> {
  const token=query.match(/(?:^|\s)([^\s]*)$/)?.[1]??'';
  if(token.includes(':')&&token.split(':')[1])return [];
  return WEB_OPERATORS.filter(operator=>!token||operator.syntax.startsWith(token.toLowerCase())).map(operator=>{
    const prefix=query.slice(0,query.length-token.length);
    const value=prefix+operator.syntax;
    return {label:operator.syntax+' · '+operator.label+'（'+operator.example+'）',value,caret:value.length-(operator.syntax==='""'?1:0)};
  });
}
