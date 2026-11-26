import {getIcon,setIcon} from 'obsidian';
import {markdownElement} from '../search/markdown-elements.ts';
import {bindButtonActivation} from '../shared/button-activation.ts';
import type {ContentMatch} from '../types.ts';

/** Compact source-aware row; navigation still uses the untouched source match.
 * 紧凑元素行仅改变展示，跳转继续使用原始源码匹配。 */
export function renderMarkdownHit(parent:HTMLElement,hit:ContentMatch,terms:string[],highlight:(parent:HTMLElement,text:string,terms:string[])=>void,open:()=>void):void {
  const element=hit.markdown;if(!element)return;
  const kind=markdownElement(element.kind);
  const label=element.level?`H${element.level} 标题`:kind.label;
  const button=parent.createEl('button',{cls:'primecore-markdown-hit',attr:{type:'button','aria-label':`${label}，第 ${element.line} 行：${element.text}`}});
  const icon=button.createSpan({cls:'primecore-markdown-hit-icon',attr:{title:label,'aria-hidden':'true','data-markdown-kind':element.kind}});
  const headingIcon=element.level?`heading-${element.level}`:null;
  if(headingIcon&&getIcon(headingIcon))setIcon(icon,headingIcon);
  else if(element.level)icon.setText(`H${element.level}`);
  else setIcon(icon,kind.icon);
  button.createSpan({cls:'primecore-markdown-line',text:`第 ${element.line} 行`});
  highlight(button.createSpan({cls:'primecore-markdown-hit-text'}),element.text,terms);
  // Listeners are owned by the ephemeral result DOM. / 监听随临时结果 DOM 一起回收。
  bindButtonActivation(button,()=>open());
}
