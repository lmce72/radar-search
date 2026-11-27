/** One ordered catalog for parsing, filters and result icons. / 解析、筛选和图标共用有序目录。 */
export const MARKDOWN_ELEMENTS=[
  {id:'heading',label:'标题',icon:'heading',group:'text'},
  {id:'bold',label:'粗体',icon:'bold',group:'text'},
  {id:'italic',label:'斜体',icon:'italic',group:'text'},
  {id:'strike',label:'删除线',icon:'strikethrough',group:'text'},
  {id:'highlight',label:'高亮',icon:'highlighter',group:'text'},
  {id:'orderedList',label:'有序列表',icon:'list-ordered',group:'list'},
  {id:'unorderedList',label:'无序列表',icon:'list',group:'list'},
  {id:'task',label:'任务',icon:'list-checks',group:'list'},
  {id:'quote',label:'引用',icon:'quote',group:'quote'},
  {id:'callout',label:'Callout',icon:'message-square',group:'quote'},
  {id:'inlineCode',label:'行内代码',icon:'code',group:'code'},
  {id:'code',label:'代码块',icon:'square-code',group:'code'},
  {id:'table',label:'表格',icon:'table',group:'table'},
  {id:'math',label:'公式',icon:'sigma',group:'math'},
  {id:'comment',label:'注释',icon:'message-square-text',group:'annotation'},
  {id:'footnote',label:'脚注',icon:'superscript',group:'annotation'},
  {id:'internalLink',label:'内链',icon:'brackets',group:'link'},
  {id:'externalLink',label:'外链',icon:'external-link',group:'link'},
  {id:'tag',label:'标签',icon:'tag',group:'link'}
] as const;
export type MarkdownElementKind=typeof MARKDOWN_ELEMENTS[number]['id'];
export const ALL_MARKDOWN_ELEMENTS:MarkdownElementKind[]=MARKDOWN_ELEMENTS.map(element=>element.id);
export function isMarkdownElementKind(value:unknown):value is MarkdownElementKind {
  return MARKDOWN_ELEMENTS.some(element=>element.id===value);
}
export function markdownElement(kind:MarkdownElementKind){return MARKDOWN_ELEMENTS.find(element=>element.id===kind);}
export const MARKDOWN_GROUPS=[
  {id:'text',label:'文本样式',icon:'type'},
  {id:'list',label:'列表与任务',icon:'list-checks'},
  {id:'quote',label:'引用与 Callout',icon:'quote'},
  {id:'code',label:'行内代码与代码块',icon:'square-code'},
  {id:'table',label:'表格',icon:'table'},
  {id:'math',label:'公式',icon:'sigma'},
  {id:'annotation',label:'注释与脚注',icon:'message-square-text'},
  {id:'link',label:'链接与标签',icon:'link'}
] as const;
