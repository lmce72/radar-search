import {setIcon} from 'obsidian';
import {showElementHint} from './element-hint.ts';
import {MARKDOWN_ELEMENTS,MARKDOWN_GROUPS,ALL_MARKDOWN_ELEMENTS,type MarkdownElementKind} from '../search/markdown-elements.ts';
import {bindButtonActivation} from '../shared/button-activation.ts';
import type {ChoiceMenu} from './choice-menu.ts';
export type MarkdownMenuFactory=(parent:HTMLElement,label:string,activate?:()=>void)=>ChoiceMenu;

/** Stable group buttons; submenu choices update without closing or moving the rail.
 * 分类按钮保持稳定；子菜单原位多选，不关闭菜单或移动筛选栏。 */
export function renderMarkdownFilters(parent:HTMLElement,selected:readonly MarkdownElementKind[],save:(values:MarkdownElementKind[])=>Promise<MarkdownElementKind[]>,onError:(error:unknown)=>void,createMenu:MarkdownMenuFactory,getSelection:()=>readonly MarkdownElementKind[]):HTMLElement {
  const toolbar=parent.createDiv({cls:'primecore-markdown-toolbar'});
  // Static section label; describes the rail itself, unlike the interactive menus.
  // 静态栏目说明：描述这条筛选栏的用途，与右侧可交互菜单区分。
  const caption=toolbar.createDiv({cls:'primecore-filter-caption',attr:{'aria-hidden':'true'}});
  setIcon(caption.createSpan({cls:'primecore-filter-caption-icon'}),'list-filter');
  caption.createSpan({cls:'primecore-filter-caption-label',text:'元素筛选'});
  const rail=toolbar.createDiv({cls:'primecore-markdown-filters',attr:{role:'group','aria-label':'Markdown 元素类型'}});
  let current=[...selected],revision=0;
  const all=rail.createEl('button',{cls:'primecore-markdown-filter primecore-markdown-select-all',attr:{type:'button','aria-label':'全选 / 取消全选'}});
  all.addEventListener('mouseenter',()=>showElementHint(all));all.addEventListener('focus',()=>showElementHint(all));
  const menus:Array<{definition:typeof MARKDOWN_GROUPS[number];menu:ChoiceMenu}>=[];
  // Single-element groups (table, math) toggle directly instead of opening a menu.
  // 单元素分组（表格、公式）直接切换，不再弹出浮动菜单。
  const singles:Array<{definition:typeof MARKDOWN_GROUPS[number];kind:MarkdownElementKind;button:HTMLButtonElement}>=[];
  // Clicking any filter control dismisses every open group menu. / 点击任一筛选控件时关闭所有已展开分组菜单。
  const closeMenus=(except?:ChoiceMenu)=>{for(const {menu} of menus)if(menu!==except)menu.close();};
  // Clicks on the rail always resolve to exactly one menu: keep the clicked group's
  // menu open (or reopen it), and dismiss every other group's menu.
  // 点击筛选栏时始终只保留一个菜单：同一分组保持展开，切换分组只显示新菜单。
  const win=toolbar.ownerDocument.defaultView;
  toolbar.addEventListener('pointerdown',event=>{
    const target=(event.target as Element|null)?.closest<HTMLElement>('.primecore-markdown-group-trigger,.primecore-markdown-single,.primecore-markdown-select-all');
    if(!target)return;
    const group=menus.find(entry=>entry.menu.trigger===target)?.menu;
    closeMenus(group);
    if(group)win.setTimeout(()=>{closeMenus(group);group.show();},0);
  },true);
  let mobileGroup='all';
  let mobile:{menu:ChoiceMenu;all:HTMLButtonElement;groups:Array<{id:string;button:HTMLButtonElement;checkbox:HTMLInputElement}>;elements:Array<{id:MarkdownElementKind;group:string;row:HTMLElement;button:HTMLButtonElement}>;heading:HTMLElement}|null=null;
  const apply=(next:MarkdownElementKind[])=>{
    const version=++revision;current=next;sync();
    // Recover from committed state, not an earlier optimistic click.
    // 连续保存失败时回到真实设置，不能回到上一次尚未保存的点击状态。
    void save(next).catch(error=>{if(version===revision){current=[...getSelection()];sync();}onError(error);});
  };
  const sync=()=>{
    const active=current.length===ALL_MARKDOWN_ELEMENTS.length;
    all.setAttribute('aria-pressed',active?'true':current.length?'mixed':'false');setIcon(all,active?'square-check':current.length?'square-minus':'square');
    for(const {definition,menu} of menus){
      const elements=MARKDOWN_ELEMENTS.filter(element=>element.group===definition.id),count=elements.filter(element=>current.includes(element.id)).length;
      menu.trigger.toggleClass('is-active',count>0);menu.trigger.setAttribute('aria-pressed',count===elements.length?'true':count?'mixed':'false');
      menu.setChoices(elements.map(element=>({id:element.id,label:element.label,icon:element.icon,checked:current.includes(element.id),keepOpen:true,onSelect:()=>apply(ALL_MARKDOWN_ELEMENTS.filter(kind=>kind===element.id?!current.includes(kind):current.includes(kind)))})));
    }
    for(const {kind,button} of singles){
      const active=current.includes(kind);
      button.toggleClass('is-active',active);button.setAttribute('aria-pressed',String(active));
    }
    if(mobile){
      mobile.menu.setLabel('元素筛选 '+current.length+'/'+ALL_MARKDOWN_ELEMENTS.length,'text-select');
      mobile.all.setAttribute('aria-checked',active?'true':current.length?'mixed':'false');
      mobile.all.querySelector('.primecore-markdown-mobile-all-label').setText(active?'取消全选':'全选');
      for(const group of mobile.groups){
        group.button.setAttribute('aria-checked',String(group.id===mobileGroup));
        const kinds=MARKDOWN_ELEMENTS.filter(element=>group.id==='all'||element.group===group.id).map(element=>element.id),count=kinds.filter(kind=>current.includes(kind)).length;
        group.checkbox.checked=count===kinds.length;group.checkbox.indeterminate=count>0&&count<kinds.length;
        group.checkbox.setAttribute('aria-checked',group.checkbox.indeterminate?'mixed':String(group.checkbox.checked));
      }
      for(const element of mobile.elements){element.button.setAttribute('aria-checked',String(current.includes(element.id)));element.row.hidden=mobileGroup!=='all'&&mobileGroup!==element.group;}
      mobile.heading.setText(mobileGroup==='all'?'全部元素':MARKDOWN_GROUPS.find(group=>group.id===mobileGroup).label);
    }
  };
  bindButtonActivation(all,()=>{closeMenus();apply(current.length===ALL_MARKDOWN_ELEMENTS.length?[]:[...ALL_MARKDOWN_ELEMENTS]);});
  for(const definition of MARKDOWN_GROUPS){
    const members=MARKDOWN_ELEMENTS.filter(element=>element.group===definition.id);
    if(members.length===1){
      const kind=members[0].id;
      const button=rail.createEl('button',{cls:'primecore-markdown-filter primecore-markdown-single',attr:{type:'button','aria-label':definition.label,'aria-pressed':'false'}});
      setIcon(button.createSpan({cls:'primecore-markdown-filter-icon',attr:{'aria-hidden':'true'}}),members[0].icon);
      button.addEventListener('mouseenter',()=>showElementHint(button));button.addEventListener('focus',()=>showElementHint(button));
      bindButtonActivation(button,()=>{closeMenus();apply(ALL_MARKDOWN_ELEMENTS.filter(value=>value===kind?!current.includes(value):current.includes(value)));});
      singles.push({definition,kind,button});continue;
    }
    const slot=rail.createDiv({cls:'primecore-markdown-group'});
    let menu:ChoiceMenu;
    menu=createMenu(slot,definition.label,()=>{
      closeMenus(menu);
      const kinds=MARKDOWN_ELEMENTS.filter(element=>element.group===definition.id).map(element=>element.id);
      const enabled=kinds.every(kind=>current.includes(kind));
      apply(ALL_MARKDOWN_ELEMENTS.filter(kind=>kinds.includes(kind)?!enabled:current.includes(kind)));
    });
    menu.setLabel(definition.label,definition.icon);menu.trigger.addClass('primecore-markdown-group-trigger');menu.trigger.dataset.markdownGroup=definition.id;
    menu.trigger.addEventListener('mouseenter',()=>closeMenus(menu));
    menu.popup.addClass('primecore-markdown-element-menu');menu.popup.createDiv({cls:'primecore-choice-heading',text:definition.label,attr:{'aria-hidden':'true'}});
    menus.push({definition,menu});
  }
  // The compact picker shares state with the desktop rail; browsing a group does
  // not change the filter. / 紧凑选择器共用桌面筛选状态，浏览分类不改变勾选。
  const slot=toolbar.createDiv({cls:'primecore-markdown-mobile-slot'});
  const picker=createMenu(slot,'元素筛选');picker.popup.addClass('primecore-markdown-mobile-menu');
  const header=picker.popup.createDiv({cls:'primecore-markdown-mobile-header'});
  header.createSpan({text:'Markdown 元素'});
  const selectAll=header.createEl('button',{cls:'primecore-markdown-mobile-all',attr:{type:'button',role:'menuitemcheckbox','aria-label':'全选 / 取消全选'}});
  setIcon(selectAll.createSpan({attr:{'aria-hidden':'true'}}),'square-check');selectAll.createSpan({cls:'primecore-markdown-mobile-all-label'});
  picker.register(bindButtonActivation(selectAll,()=>apply(current.length===ALL_MARKDOWN_ELEMENTS.length?[]:[...ALL_MARKDOWN_ELEMENTS])));
  const columns=picker.popup.createDiv({cls:'primecore-markdown-mobile-columns'});
  const groups=columns.createDiv({cls:'primecore-markdown-mobile-groups',attr:{role:'group','aria-label':'元素分类'}});
  const elements=columns.createDiv({cls:'primecore-markdown-mobile-elements',attr:{role:'group','aria-label':'可选元素'}});
  const heading=elements.createDiv({cls:'primecore-choice-heading'});
  mobile={menu:picker,all:selectAll,groups:[],elements:[],heading};
  for(const group of [{id:'all',label:'全部',icon:'layers'},...MARKDOWN_GROUPS]){
    const row=groups.createDiv({cls:'primecore-markdown-mobile-category'});
    const button=row.createEl('button',{cls:'primecore-markdown-mobile-group',attr:{type:'button',role:'menuitemradio','data-element-category':group.id}});
    setIcon(button.createSpan({cls:'primecore-choice-icon',attr:{'aria-hidden':'true'}}),group.icon);button.createSpan({text:group.label});
    const label=row.createEl('label',{cls:'primecore-markdown-category-check',attr:{title:'全选 / 取消全选：'+group.label}});
    const checkbox=label.createEl('input',{type:'checkbox',attr:{role:'menuitemcheckbox','aria-label':'全选 / 取消全选：'+group.label,'data-category-check':group.id}});
    picker.registerDomEvent(checkbox,'change',()=>{
      const kinds=MARKDOWN_ELEMENTS.filter(element=>group.id==='all'||element.group===group.id).map(element=>element.id),enabled=kinds.every(kind=>current.includes(kind));
      apply(ALL_MARKDOWN_ELEMENTS.filter(kind=>kinds.includes(kind)?!enabled:current.includes(kind)));
    });
    picker.registerDomEvent(button,'click',()=>{mobileGroup=group.id;sync();elements.scrollTop=0;});mobile.groups.push({id:group.id,button,checkbox});
  }
  for(const element of MARKDOWN_ELEMENTS){
    const row=elements.createDiv({cls:'primecore-choice-row'});
    const button=row.createEl('button',{attr:{type:'button',role:'menuitemcheckbox','data-choice':element.id,'data-mobile-element':element.id}});
    setIcon(button.createSpan({cls:'primecore-choice-icon',attr:{'aria-hidden':'true'}}),element.icon);button.createSpan({text:element.label});
    picker.registerDomEvent(button,'click',()=>apply(ALL_MARKDOWN_ELEMENTS.filter(kind=>kind===element.id?!current.includes(kind):current.includes(kind))));
    mobile.elements.push({id:element.id,group:element.group,row,button});
  }
  picker.registerDomEvent(picker.popup,'keydown',event=>{
    if(!['ArrowLeft','ArrowRight'].includes(event.key))return;
    const target=event.target as HTMLElement;
    if(event.key==='ArrowRight'&&groups.contains(target)){
      event.preventDefault();event.stopPropagation();mobile.elements.find(element=>!element.row.hidden)?.button.focus();
    }else if(event.key==='ArrowLeft'&&elements.contains(target)){
      event.preventDefault();event.stopPropagation();mobile.groups.find(group=>group.id===mobileGroup)?.button.focus();
    }
  });
  toolbar.addEventListener('primecore-filter-sync',event=>{current=[...(event as CustomEvent<MarkdownElementKind[]>).detail];sync();});
  sync();return toolbar;
}
