import {Component,Scope,TextComponent,DropdownComponent,ToggleComponent,ButtonComponent,type App} from 'obsidian';
import {SHORTCUT_ACTIONS,DEFAULT_SEARCH_SHORTCUTS,shortcutFor,validShortcut,validateSearchShortcuts,type SearchShortcut} from '../shared/search-shortcuts.ts';

/** Draft-based binding editor; changing a key never silently changes its action.
 * 草稿式绑定编辑：动作与按键独立选择，保存失败保留编辑现场。 */
export class ShortcutEditor extends Component {
  readonly el:HTMLDivElement;
  private list:HTMLDivElement;
  private status:HTMLDivElement;
  private draft:SearchShortcut[];
  private busy=false;
  private dirty=false;
  private scope:Scope|null=null;
  private saveButton:HTMLButtonElement;
  private resetButton:HTMLButtonElement;
  constructor(private app:App,parent:HTMLElement,private saved:()=>SearchShortcut[],private save:(bindings:SearchShortcut[])=>Promise<boolean>){
    super();this.draft=structuredClone(saved());this.el=parent.createDiv({cls:'primecore-shortcut-editor'});
    this.el.createDiv({cls:'setting-item-description',text:'每条绑定分别选择功能与按键。同一功能可绑定多组按键；支持成对动作的 Shift 反向切换。修改后点击保存。'});
    this.el.createDiv({cls:'setting-item-description',text:'仅在 Radar Search 内生效，其他输入框与弹出菜单保留自己的按键行为。全局打开搜索的快捷键请在 Obsidian 快捷键设置中配置。'});
    this.el.createDiv({cls:'setting-item-description',text:'点击按键框录入，铅笔图标切换手动输入；取消键结束录入，制表键离开。组合键需包含控制键、选项键或系统键。'});
    const toolbar=this.el.createDiv({cls:'primecore-shortcut-toolbar'});
    this.saveButton=toolbar.createEl('button',{text:'保存修改',cls:'mod-cta',attr:{type:'button'}});
    this.resetButton=toolbar.createEl('button',{text:'还原已保存',attr:{type:'button'}});
    const add=toolbar.createEl('button',{text:'添加绑定',attr:{type:'button','data-shortcut-add':'1'}});
    const defaults=toolbar.createEl('button',{text:'使用默认绑定',attr:{type:'button'}});
    this.status=this.el.createDiv({cls:'setting-item-description',attr:{role:'status'}});
    this.list=this.el.createDiv({cls:'primecore-shortcut-list'});
    this.registerDomEvent(add,'click',()=>{if(this.busy)return;this.draft.push({id:crypto.randomUUID(),action:'category.next',shortcut:'',enabled:false,scope:'input',reverse:false});this.render();this.changed();this.list.querySelector<HTMLInputElement>('tbody tr:last-child input[type=text]')?.focus();});
    this.registerDomEvent(defaults,'click',()=>{if(this.busy)return;this.draft=structuredClone(DEFAULT_SEARCH_SHORTCUTS);this.render();this.changed();});
    this.registerDomEvent(this.resetButton,'click',()=>{if(this.busy)return;this.draft=structuredClone(saved());this.render();this.dirty=false;this.sync();this.status.setText('已还原保存的绑定');});
    this.registerDomEvent(this.saveButton,'click',()=>{void this.commit();});
    this.register(()=>{this.stopRecording();this.el.remove();});
    this.render();this.sync();
  }
  private stopRecording():void {if(this.scope){this.app.keymap.popScope(this.scope);this.scope=null;}}
  private changed():void {this.dirty=true;this.status.setText('有未保存修改');this.sync();}
  private sync():void {
    this.saveButton.disabled=this.busy||!this.dirty;this.resetButton.disabled=this.busy||!this.dirty;
    this.saveButton.setText(this.busy?'保存中…':'保存修改');
  }
  private render():void {
    this.stopRecording();this.list.empty();
    if(!this.draft.length)this.list.createDiv({cls:'setting-item-description',text:'暂无绑定。添加一条绑定，或使用默认绑定。'});
    if(!this.draft.length)return;
    const scroll=this.list.createDiv({cls:'primecore-settings-table-scroll primecore-shortcut-scroll',attr:{role:'region','aria-label':'快捷键绑定表格',tabindex:'0'}});
    const table=scroll.createEl('table',{cls:'primecore-settings-table primecore-shortcut-table'});
    table.createEl('caption',{text:'快捷键绑定'});
    const header=table.createEl('thead').createEl('tr');
    for(const label of ['启用','执行功能','快捷键','Shift 反向','生效范围','操作'])header.createEl('th',{text:label,attr:{scope:'col'}});
    const body=table.createEl('tbody');
    for(const [index,binding] of this.draft.entries()){
      const row=body.createEl('tr',{attr:{'data-shortcut-id':binding.id}}),label='绑定 '+(index+1);
      const enabled=new ToggleComponent(row.createEl('td')).setValue(binding.enabled).onChange(value=>{binding.enabled=value;this.changed();});
      enabled.toggleEl.setAttribute('aria-label',label+' 启用');
      const action=new DropdownComponent(row.createEl('td'));
      for(const group of new Set(SHORTCUT_ACTIONS.map(action=>action.group))){const options=action.selectEl.createEl('optgroup',{attr:{label:group}});for(const entry of SHORTCUT_ACTIONS.filter(action=>action.group===group))options.createEl('option',{value:entry.id,text:entry.label});}
      action.selectEl.setAttribute('aria-label',label+' 执行功能');
      const keyCell=row.createEl('td').createDiv({cls:'primecore-shortcut-key'});
      const key=new TextComponent(keyCell).setValue(binding.shortcut).setPlaceholder('点击后按组合键');
      key.inputEl.readOnly=true;key.inputEl.setAttribute('aria-label',label+' 快捷键');
      let syncReverse=()=>{};
      action.setValue(binding.action).onChange(value=>{const entry=SHORTCUT_ACTIONS.find(action=>action.id===value);if(!entry)return;binding.action=entry.id;if(!entry.reverse)binding.reverse=false;syncReverse();this.changed();});
      key.inputEl.addEventListener('focus',()=>{
        this.stopRecording();if(this.busy||!key.inputEl.readOnly)return;
        this.scope=new Scope(this.app.scope);this.scope.register(null,null,event=>{
          if(event.isComposing||event.key==='Tab')return;
          if(event.key==='Escape'){event.preventDefault();event.stopPropagation();key.inputEl.blur();return false;}
          event.preventDefault();event.stopPropagation();
          const combo=shortcutFor(event);if(!combo)return false;
          if(!validShortcut(combo)){this.status.setText('请使用 ctrl、alt 或 meta 加按键；tab 和 escape 保留给界面导航。');return false;}
          binding.shortcut=combo;if(combo.split('+').includes('Shift'))binding.reverse=false;
          key.setValue(combo);syncReverse();this.changed();return false;
        });this.app.keymap.pushScope(this.scope);
      });
      key.inputEl.addEventListener('blur',()=>this.stopRecording());
      key.inputEl.addEventListener('change',()=>{if(!key.inputEl.readOnly){binding.shortcut=key.getValue().trim();if(binding.shortcut.split('+').includes('Shift'))binding.reverse=false;syncReverse();this.changed();}});
      const manual=new ButtonComponent(keyCell).setIcon('pencil').setTooltip('切换手动输入或按键录入').onClick(()=>{this.stopRecording();key.inputEl.readOnly=!key.inputEl.readOnly;manual.setIcon(key.inputEl.readOnly?'pencil':'keyboard');key.inputEl.focus({preventScroll:true});});
      manual.buttonEl.setAttribute('aria-label',label+' 切换手动输入');
      const reverse=new ToggleComponent(row.createEl('td'));reverse.toggleEl.setAttribute('aria-label',label+' Shift 反向');
      let syncingReverse=false;
      syncReverse=()=>{const paired=SHORTCUT_ACTIONS.find(action=>action.id===binding.action)?.reverse;syncingReverse=true;reverse.setValue(binding.reverse).setDisabled(!paired||binding.shortcut.split('+').includes('Shift'));syncingReverse=false;reverse.toggleEl.title=paired?'额外按住反向键执行：'+SHORTCUT_ACTIONS.find(action=>action.id===paired)?.label:'此功能没有反向动作';};
      reverse.onChange(value=>{if(syncingReverse)return;binding.reverse=value;this.changed();});syncReverse();
      const scope=new DropdownComponent(row.createEl('td')).addOptions({input:'搜索框',search:'搜索界面'}).setValue(binding.scope).onChange(value=>{binding.scope=value==='search'?'search':'input';this.changed();});
      scope.selectEl.setAttribute('aria-label',label+' 生效范围');
      const remove=new ButtonComponent(row.createEl('td')).setIcon('trash-2').setTooltip('删除此绑定').onClick(()=>{if(this.busy)return;this.stopRecording();this.draft=this.draft.filter(item=>item!==binding);const next=row.nextElementSibling||row.previousElementSibling;row.remove();this.changed();if(!this.draft.length)this.render();(next?.querySelector<HTMLButtonElement>('button')||this.el.querySelector<HTMLButtonElement>('[data-shortcut-add]'))?.focus({preventScroll:true});});
      remove.buttonEl.setAttribute('aria-label',label+' 删除');
    }
  }
  private async commit():Promise<void> {
    if(this.busy)return;
    let bindings:SearchShortcut[];
    try{bindings=validateSearchShortcuts(this.draft);}catch(error){this.status.setText((error as Error).message);return;}
    this.stopRecording();this.busy=true;this.list.inert=true;this.sync();
    const controls=Array.from(this.el.querySelectorAll<HTMLInputElement|HTMLButtonElement|HTMLSelectElement>('input,button,select'));
    const disabled=controls.map(control=>control.disabled);controls.forEach(control=>{control.disabled=true;});
    try{if(await this.save(bindings)){this.dirty=false;this.status.setText('已保存；新的动作绑定立即生效');}else this.status.setText('保存失败，修改已保留，可重试');}
    catch(error){this.status.setText('保存失败：'+(error as Error).message);}
    finally{this.busy=false;this.list.inert=false;controls.forEach((control,index)=>{control.disabled=disabled[index];});this.sync();}
  }
}
