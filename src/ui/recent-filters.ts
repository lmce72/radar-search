import {showElementHint} from './element-hint.ts';
import {Setting,Notice,Modal,type App} from 'obsidian';
import type {SearchBarHost} from './search-bar-host.ts';
import {type MenuChoice} from './choice-menu.ts';
import {RECENT_TYPES,normalizeExtension} from '../history/recent-types.ts';
import {FileHandlerModal,detectedHandler,openRecentFile} from './file-handler.ts';
import {raiseModalAboveLayers} from './modal-layer.ts';
class AddFileTypeModal extends Modal {
  constructor(app:App,private save:(value:string)=>Promise<void>){super(app);}
  onOpen():void {
    raiseModalAboveLayers(this);
    this.setTitle('添加文件类型');let value='';
    new Setting(this.contentEl).setName('文件后缀').setDesc('可填写普通后缀或复合后缀，加入最近打开的过滤候选。').addText(control=>{control.setPlaceholder('文件后缀').onChange(next=>{value=next;});control.inputEl.focus();});
    new Setting(this.contentEl).addButton(control=>control.setButtonText('取消').onClick(()=>this.close())).addButton(control=>control.setButtonText('添加').setCta().onClick(()=>{
      control.setDisabled(true);void this.save(value).then(()=>this.close()).catch(error=>{control.setDisabled(false);new Notice((error as Error).message);});
    }));
  }
  onClose():void {this.contentEl.empty();}
}

/** One state for wide chips, compact primary icons and the extra-types menu.
 * 宽屏按钮、窄屏常用图标与更多类型菜单共用筛选状态。 */
export function renderRecentFilters(bar:SearchBarHost,date:string):void {
  if(bar._recentMenu)bar.removeChild(bar._recentMenu);
  const root=bar._dropdownInner.createDiv({cls:'primecore-recent-filters'});
  // Static section label; mirrors the element filter caption on the other rail.
  // 静态栏目说明：与元素筛选栏的说明保持同一形式。
  const caption=root.createDiv({cls:'primecore-filter-caption',attr:{'aria-hidden':'true'}});
  bar._setIcon(caption.createSpan({cls:'primecore-filter-caption-icon'}),'list-filter',14);
  caption.createSpan({cls:'primecore-filter-caption-label',text:'类型筛选'});
  const chips=root.createDiv({cls:'primecore-recent-type-chips'});
  const compact=root.createDiv({cls:'primecore-recent-compact-chips',attr:{role:'group','aria-label':'最近打开类型'}});
  const menu=bar._createChoiceMenu(root,'其他与指定文件类型');menu.setLabel('其他类型','file-cog');bar._recentMenu=menu;
  const add=chips.createEl('button',{cls:'primecore-recent-type primecore-recent-add-type',attr:{type:'button'}});
  bar._setIcon(add.createSpan(),'plus',12);add.createSpan({cls:'primecore-recent-type-label',text:'添加文件类型'});add.setAttribute('aria-label','添加文件类型');add.addEventListener('mouseenter',()=>showElementHint(add));add.addEventListener('focus',()=>showElementHint(add));
  const addType=async(value:string)=>{
    const ext=normalizeExtension(value);if(bar.cfg.recentFileTypes.includes(ext))throw Error('此后缀已在过滤候选中');
    const next=[...bar.cfg.recentFileTypes,ext];await bar.plugin.updateSetting('recentFileTypes',next,false);
    bar.cfg.recentFileTypes=next;menu.close();bar._showRecentFiles(1,date);
    if(!detectedHandler(bar.app,ext)&&bar.plugin.settings.warnUnknownFileType)new FileHandlerModal(bar.plugin,ext).open();
  };
  add.addEventListener('click',event=>{event.stopPropagation();new AddFileTypeModal(bar.app,addType).open();});
  root.addEventListener('primecore-recent-filter-change',()=>bar._showRecentFiles(1,date,true));
  let selected=[...bar.cfg.recentTypeFilter],revision=0;
  const types=[...RECENT_TYPES,...bar.cfg.recentFileTypes.map(id=>({id,label:'.'+id.toUpperCase(),icon:'file-cog'}))];
  const primary=new Set<string>(RECENT_TYPES.filter(type=>type.id!=='other').map(type=>type.id));
  const controls:Array<{id:string;button:HTMLButtonElement}>=[];
  const appendChip=(parent:HTMLElement,choice:MenuChoice)=>{
    const button=parent.createEl('button',{cls:'primecore-recent-type',attr:{type:'button','data-recent-type':choice.id,'aria-label':choice.label}});
    bar._setIcon(button.createSpan(),choice.icon,12);button.createSpan({cls:'primecore-recent-type-label',text:choice.label});
    button.addEventListener('mouseenter',()=>showElementHint(button));button.addEventListener('focus',()=>showElementHint(button));
    button.addEventListener('click',event=>{event.stopPropagation();choice.onSelect();});controls.push({id:choice.id,button});
  };
  const refresh=()=>{
    const choices:MenuChoice[]=types.map(type=>({id:type.id,label:type.label,icon:type.icon,checked:!selected.length||selected.includes(type.id),keepOpen:true,onSelect:()=>{
      const version=++revision;
      const active=selected.length?selected:types.map(value=>value.id);
      selected=active.includes(type.id)?active.filter(id=>id!==type.id):[...active,type.id];
      // Explicit none differs from no constraint. / 明确全不选与不设约束使用不同值。
      if(!selected.length)selected=['none'];
      bar.cfg.recentTypeFilter=[...selected];refresh();
      void bar.plugin.updateSetting('recentTypeFilter',selected,false).catch(error=>{
        if(version===revision){selected=[...bar.plugin.settings.recentTypeFilter];bar.cfg.recentTypeFilter=[...selected];refresh();root.dispatchEvent(new CustomEvent('primecore-recent-filter-change',{detail:date}));}
        bar._log('error','最近打开过滤器保存失败',error);
      });
      // Keep the menu mounted while the list updates. / 只更新记录列表，保留菜单挂载。
      root.dispatchEvent(new CustomEvent('primecore-recent-filter-change',{detail:date}));
    }}));
    menu.setChoices(choices.filter(choice=>!primary.has(choice.id)));
    if(!controls.length){for(const choice of choices){appendChip(chips,choice);if(primary.has(choice.id))appendChip(compact,choice);}chips.appendChild(add);}
    for(const control of controls)control.button.setAttribute('aria-pressed',String(choices.find(choice=>choice.id===control.id)?.checked));
  };refresh();
  const row=new Setting(menu.popup).setName('添加文件类型');let extension='';
  row.addText(control=>control.setPlaceholder('文件后缀').onChange(value=>{extension=value;}));
  row.addButton(control=>control.setIcon('plus').setTooltip('加入过滤候选').onClick(()=>{
    void addType(extension).catch(error=>new Notice((error as Error).message));
  }));
}

export const withRecentFilters=<T extends import('./search-bar-host.ts').SearchBarCtor>(Base:T)=>class extends Base {
  _renderRecentFilters(date:string):void {renderRecentFilters(this,date);}
  _openRecentFile(file:import('obsidian').TFile):void {openRecentFile(this.plugin,file);}
};
