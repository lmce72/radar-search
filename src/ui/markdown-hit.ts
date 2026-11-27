import {getIcon,setIcon} from 'obsidian';
import {markdownElement} from '../search/markdown-elements.ts';
import {bindButtonActivation} from '../shared/button-activation.ts';
import type {ContentMatch} from '../types.ts';
import type {RichPreview} from './rich-preview.ts';

/** Metadata precedes a full-width rendered block. / 元信息在前，渲染块占满下一行。 */
export function renderMarkdownHit(parent:HTMLElement,hit:ContentMatch,terms:string[],preview:RichPreview,path:string,open:()=>void,openLink:(target:string,external:boolean)=>void):void {
  const element=hit.markdown;if(!element)return;
  const kind=markdownElement(element.kind);
  const label=element.level?'H'+element.level+' 标题':kind.label;
  const row=parent.createDiv({cls:'primecore-markdown-hit',attr:{role:'group'}});
  row.addClass((['callout','code','table','quote'].includes(element.kind)||element.kind==='math'&&element.source?.trim().startsWith('$$'))?'is-block':'is-line');
  if(element.kind==='list'){const start=element.source?.match(/^\s*(\d+)[.)]/)?.[1];if(start)row.setCssProps({'--primecore-list-start':String(Number(start)-1)});}
  const meta=row.createDiv({cls:'primecore-markdown-meta'});
  const icon=meta.createSpan({cls:'primecore-markdown-hit-icon',attr:{title:label,'aria-hidden':'true','data-markdown-kind':element.kind}});
  const headingIcon=element.level?'heading-'+element.level:null;
  if(headingIcon&&getIcon(headingIcon))setIcon(icon,headingIcon);
  else if(element.level)icon.setText('H'+element.level);
  else setIcon(icon,kind.icon);
  if(element.link){
    const link=meta.createEl('button',{cls:'primecore-element-link',attr:{type:'button',title:element.link.target,'aria-label':'打开链接 '+element.link.label}});
    setIcon(link.createSpan({attr:{'aria-hidden':'true'}}),'link');link.createSpan({text:element.link.label});
    bindButtonActivation(link,()=>{const target=element.link;if(target)openLink(target.target,target.external);});
  }
  const location=meta.createEl('button',{cls:'primecore-markdown-line primecore-markdown-jump',text:'第 '+element.line+' 行',attr:{type:'button','aria-label':label+'，定位到第 '+element.line+' 行'}});
  bindButtonActivation(location,()=>open());
  if(element.language||element.callout||element.footnote)meta.createSpan({cls:'primecore-markdown-line',text:element.language||element.callout||element.footnote});
  const content=row.createDiv({cls:'primecore-markdown-hit-text'});
  const source=element.footnote?(element.source||element.text).replace(/^\[\^[^\]]+\]:\s*/,''):element.kind==='comment'?element.text:element.source||element.text;
  preview.render(content,source,path,terms);
  row.addEventListener('click',event=>{event.stopPropagation();if((event.target as Element).closest('a,button,input'))return;open();});
}
