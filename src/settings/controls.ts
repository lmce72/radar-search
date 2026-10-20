import { ButtonComponent, setIcon } from 'obsidian';
import { PLUGIN_ICON_ID } from '../shared/plugin-icon.ts';

const TITLE_ICONS = {
  '设置':'settings-2','搜索栏':PLUGIN_ICON_ID,'Vault 搜索':'vault','互联网搜索':'globe','历史与索引':'history',
  '搜索预设':'sliders-horizontal','搜索引擎':'compass','互联网信息源':'rss','索引选项':'database',
  '临时过滤器':'filter','结果排序':'arrow-down-up','保存搜索预设':'save','排除路径':'folder-minus','Vault 搜索选项':'sliders-horizontal','路径列表':'folder'
};
export function renderSettingTitle(element:HTMLElement,title:string) {
  element.empty();if(!title)return;
  const icon=element.createSpan({cls:'primecore-settings-title-icon',attr:{'aria-hidden':'true'}});
  setIcon(icon,(TITLE_ICONS as Record<string,string>)[title]||(title.endsWith(' · 路径')?'folder':title.endsWith(' · 过滤规则')?'filter':'settings-2'));
  element.createSpan({text:title});
}

export class ActionButton extends ButtonComponent {
  declare icon: string;

  constructor(parent:HTMLElement,{icon,label,onClick}:{icon:string;label:string;onClick?:(event:MouseEvent)=>unknown}) {
    super(parent);this.icon=icon;this.buttonEl.addClasses(['primecore-settings-action','primecore-hover-action']);
    this.setButtonText(label);if(onClick)this.onClick(onClick);
  }
  setButtonText(label: string) {
    this.buttonEl.empty();
    const icon=this.buttonEl.createSpan({cls:'primecore-settings-action-icon',attr:{'aria-hidden':'true'}});
    setIcon(icon,this.icon);
    this.buttonEl.createSpan({cls:'primecore-action-label',text:label});
    this.buttonEl.setAttribute('aria-label',label);this.buttonEl.setAttribute('title',label);return this;
  }
}

export class ActionToolbar {
  declare el:HTMLDivElement;
  declare leadingEl:HTMLDivElement;
  declare titleEl:HTMLSpanElement;
  declare actionsEl:HTMLDivElement;

  constructor(parent:HTMLElement,title='') {
    this.el=parent.createDiv({cls:'primecore-settings-toolbar',attr:{role:'toolbar','aria-label':title||'编辑操作'}});
    this.leadingEl=this.el.createDiv({cls:'primecore-settings-toolbar-leading'});
    this.titleEl=this.el.createSpan({cls:'primecore-settings-toolbar-title'});
    renderSettingTitle(this.titleEl,title);
    this.actionsEl=this.el.createDiv({cls:'primecore-settings-toolbar-actions'});
  }
  add(icon:string,label:string,onClick:(event:MouseEvent)=>unknown) {return new ActionButton(this.actionsEl,{icon,label,onClick});}
  prepend(button:ActionButton) {this.actionsEl.prepend(button.buttonEl);}
}
