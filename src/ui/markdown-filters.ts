import {setIcon} from 'obsidian';
import {MARKDOWN_ELEMENTS,type MarkdownElementKind} from '../search/markdown-elements.ts';
import {bindButtonActivation} from '../shared/button-activation.ts';

/** Native toggle buttons keep mouse, touch and keyboard on one activation path.
 * 原生切换按钮让鼠标、触屏与键盘共用一次激活路径。 */
export function renderMarkdownFilters(parent:HTMLElement,selected:readonly MarkdownElementKind[],toggle:(kind:MarkdownElementKind)=>Promise<MarkdownElementKind[]>,onError:(error:unknown)=>void):HTMLElement {
  const group=parent.createDiv({cls:'primecore-markdown-filters',attr:{role:'group','aria-label':'Markdown 元素类型'}});
  const buttons=new Map<MarkdownElementKind,HTMLButtonElement>();
  const sync=(values:readonly MarkdownElementKind[])=>{
    for(const [kind,button] of buttons){const active=values.includes(kind);button.toggleClass('is-active',active);button.setAttribute('aria-pressed',String(active));}
  };
  for(const element of MARKDOWN_ELEMENTS){
    const button=group.createEl('button',{cls:'primecore-markdown-filter',attr:{type:'button',title:element.label,'aria-label':element.label,'data-markdown-kind':element.id}});
    setIcon(button.createSpan({attr:{'aria-hidden':'true'}}),element.icon);buttons.set(element.id,button);
    bindButtonActivation(button,()=>{
      for(const control of buttons.values())control.disabled=true;
      void toggle(element.id).then(sync).catch(onError).finally(()=>{for(const control of buttons.values())control.disabled=false;});
    });
  }
  sync(selected);return group;
}
