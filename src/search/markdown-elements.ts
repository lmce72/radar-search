/** One catalog for parsing, filters and result icons. / 解析、筛选与结果图标共用目录。 */
export const MARKDOWN_ELEMENTS=[
  {id:'heading',label:'标题',icon:'heading'}, {id:'task',label:'任务',icon:'list-checks'},
  {id:'quote',label:'引用',icon:'quote'}, {id:'code',label:'代码块',icon:'square-code'},
  {id:'highlight',label:'高亮',icon:'highlighter'}, {id:'list',label:'列表',icon:'list'},
  {id:'table',label:'表格',icon:'table'}, {id:'callout',label:'Callout',icon:'message-square'},
  {id:'comment',label:'注释',icon:'message-square-text'}, {id:'inlineCode',label:'行内代码',icon:'code'},
  {id:'bold',label:'粗体',icon:'bold'}, {id:'italic',label:'斜体',icon:'italic'},
  {id:'strike',label:'删除线',icon:'strikethrough'}, {id:'math',label:'公式',icon:'sigma'},
  {id:'footnote',label:'脚注',icon:'superscript'}, {id:'rule',label:'分隔线',icon:'minus'}
] as const;
export type MarkdownElementKind=typeof MARKDOWN_ELEMENTS[number]['id'];
export const ALL_MARKDOWN_ELEMENTS:MarkdownElementKind[]=MARKDOWN_ELEMENTS.map(element=>element.id);
export function isMarkdownElementKind(value:unknown):value is MarkdownElementKind {
  return MARKDOWN_ELEMENTS.some(element=>element.id===value);
}
export function markdownElement(kind:MarkdownElementKind){return MARKDOWN_ELEMENTS.find(element=>element.id===kind);}
