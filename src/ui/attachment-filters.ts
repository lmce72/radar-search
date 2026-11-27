import {Component,setIcon} from 'obsidian';
import {addAttachmentTypes} from '../search/attachment-types.ts';
import type {AttachmentFileType} from '../types.ts';
import type {SearchBarCtor} from './search-bar-host.ts';

interface AttachmentEditorOptions {
  getTypes:()=>readonly AttachmentFileType[];
  save:(types:AttachmentFileType[])=>Promise<boolean>;
  notify:(message:string)=>void;
  busy?:()=>boolean;
  locked?:()=>boolean;
  temporary?:{get:()=>boolean;set:(value:boolean)=>Promise<void>};
}
/** A stable chip editor shared by results and settings. / 结果与设置共用稳定的后缀胶囊编辑器。 */
export class AttachmentFilterEditor extends Component {
  readonly el:HTMLDetailsElement;
  private count:HTMLElement;
  private chips:HTMLElement;
  private status:HTMLElement;
  private deleting=false;
  private buttons=new Map<string,HTMLButtonElement>();
  private deleteInput:HTMLInputElement;
  private temporaryInput:HTMLInputElement|null=null;
  private input:HTMLInputElement;
  private add:HTMLButtonElement;
  constructor(parent:HTMLElement,private options:AttachmentEditorOptions){
    super();this.el=parent.createEl('details',{cls:'primecore-attachment-filters'});
    const summary=this.el.createEl('summary',{cls:'primecore-attachment-summary',attr:{'aria-label':'后缀过滤'}});
    setIcon(summary.createSpan({cls:'primecore-attachment-chevron',attr:{'aria-hidden':'true'}}),'chevron-right');
    const title=summary.createSpan({cls:'primecore-attachment-filter-title'});setIcon(title.createSpan({attr:{'aria-hidden':'true'}}),'list-filter');title.createSpan({text:'后缀过滤'});
    this.count=summary.createSpan({cls:'primecore-attachment-count'});
    const body=this.el.createDiv({cls:'primecore-attachment-body'});
    const header=summary.createSpan({cls:'primecore-attachment-filter-header'});
    this.registerDomEvent(header,'click',event=>event.stopPropagation());
    const toggle=(text:string,change:(value:boolean)=>void)=>{
      const label=header.createEl('label',{cls:'primecore-attachment-toggle'});label.createSpan({text});
      const track=label.createSpan({cls:'checkbox-container'}),input=track.createEl('input',{type:'checkbox',attr:{'aria-label':text}});
      this.registerDomEvent(input,'change',()=>change(input.checked));return input;
    };
    this.deleteInput=toggle('删除模式',value=>{this.deleting=value;this.sync();});
    if(options.temporary)this.temporaryInput=toggle('临时设定',value=>{void options.temporary.set(value).then(()=>this.sync());});
    this.chips=body.createDiv({cls:'primecore-attachment-chips',attr:{role:'group','aria-label':'后缀标签'}});
    this.status=body.createDiv({cls:'primecore-attachment-status',attr:{role:'status'}});
    const entry=this.chips.createDiv({cls:'primecore-attachment-entry'});
    this.input=entry.createEl('input',{type:'text',attr:{placeholder:'.pdf .canvas .png','aria-label':'添加后缀标签',spellcheck:'false',autocapitalize:'none'}});
    this.add=entry.createEl('button',{cls:'clickable-icon',attr:{type:'button','aria-label':'添加后缀标签'}});setIcon(this.add,'plus');
    const add=()=>{
      const value=this.input.value;let next:AttachmentFileType[];
      try{next=addAttachmentTypes(options.getTypes(),value);}catch(error){options.notify((error as Error).message);return;}
      this.add.disabled=true;
      void options.save(next).then(saved=>{if(saved&&this.input.value===value)this.input.value='';this.add.disabled=false;this.sync();});
    };
    this.registerDomEvent(this.add,'click',event=>{event.stopPropagation();add();});
    this.registerDomEvent(this.input,'keydown',event=>{if(event.key==='Enter'){event.preventDefault();event.stopPropagation();if(!this.add.disabled)add();}});
    this.registerDomEvent(this.el,'click',event=>event.stopPropagation());
    this.register(()=>this.el.remove());this.sync();
  }
  sync():void {
    const types=this.options.getTypes(),locked=!!this.options.locked?.();
    this.count.setText(types.length?'已选 '+types.filter(type=>type.selected).length+' / '+types.length:'全部后缀');
    this.el.querySelector('summary').setAttribute('aria-label','后缀过滤，'+this.count.textContent);
    this.el.toggleClass('is-deleting',this.deleting);
    this.deleteInput.checked=this.deleting;this.deleteInput.closest('.checkbox-container').toggleClass('is-enabled',this.deleting);
    this.deleteInput.disabled=locked;
    if(this.temporaryInput){this.temporaryInput.checked=this.options.temporary.get();this.temporaryInput.disabled=!!this.options.busy?.();this.temporaryInput.closest('.checkbox-container').toggleClass('is-enabled',this.temporaryInput.checked);this.temporaryInput.title='开启仅作用于当前搜索栏；关闭保存当前标签和选中状态。';}
    for(const [extension,button] of this.buttons)if(!types.some(type=>type.extension===extension)){button.remove();this.buttons.delete(extension);}
    for(const [index,type] of types.entries()){
      let button=this.buttons.get(type.extension);
      if(!button){
        button=this.chips.createEl('button',{cls:'primecore-attachment-chip',attr:{type:'button','data-extension':type.extension}});
        button.createSpan({text:'.'+type.extension.toUpperCase()});setIcon(button.createSpan({cls:'primecore-attachment-delete-icon',attr:{'aria-hidden':'true'}}),'trash-2');
        button.addEventListener('click',()=>{
          const current=this.options.getTypes();
          const next=this.deleting?current.filter(value=>value.extension!==type.extension):current.map(value=>value.extension===type.extension?{...value,selected:!value.selected}:{...value});
          void this.options.save(next).then(()=>this.sync());
        });this.buttons.set(type.extension,button);
      }
      if(this.chips.children[index]!==button)this.chips.insertBefore(button,this.chips.children[index]||null);
      button.disabled=locked;button.setAttribute('aria-pressed',String(type.selected));button.setAttribute('aria-label',(this.deleting?'删除后缀 ':'后缀 ')+'.'+type.extension.toUpperCase());
    }
    this.input.disabled=locked;
    this.status.setText(!types.length?'未添加标签：显示全部后缀':!types.some(type=>type.selected)?'未选中后缀：不显示附件':this.deleting?'删除模式：点击标签将移除它':'点击标签切换选中，可同时选中多个后缀');
  }
}

export const withAttachmentFilters=<T extends SearchBarCtor>(Base:T)=>class extends Base {
  _buildAttachmentFilters():void {
    this._attachmentFilterEditor=this.addChild(new AttachmentFilterEditor(this._dropdown,{
      getTypes:()=>this.cfg.attachmentFileTypes,save:types=>this._setAttachmentTypes(types),notify:message=>this._notify(message),
      busy:()=>this._attachmentModeSaving||this._attachmentPending>0,locked:()=>this._attachmentModeSaving,
      temporary:{get:()=>this._temporaryFileTypes,set:value=>this._setTemporaryFileTypes(value)}
    }));
    this._dropdown.insertBefore(this._attachmentFilterEditor.el,this._dropdownInner);
  }
  _refreshAttachmentResults():void {
    this._attachmentFilterEditor?.sync();
    if(!this._disposed&&this._input?.value.trim()&&this._resultToolView==='results')void this._doSearch(this._input.value.trim());
  }
  async _setAttachmentTypes(types:AttachmentFileType[]):Promise<boolean> {
    if(this._attachmentModeSaving)return false;
    const version=++this._attachmentVersion;this.cfg.attachmentFileTypes=structuredClone(types);this._attachmentPending++;
    this._attachmentFilterEditor?.sync();
    try{
      if(!this._temporaryFileTypes){
        await this.plugin.updateSetting('attachmentFileTypes',types,false);
        for(const {component} of this.plugin.components.values())if(component!==this&&!component._temporaryFileTypes){component.cfg.attachmentFileTypes=structuredClone(this.plugin.settings.attachmentFileTypes);component._refreshAttachmentResults();}
      }
      return true;
    }catch(error){
      if(version===this._attachmentVersion)this.cfg.attachmentFileTypes=structuredClone(this.plugin.settings.attachmentFileTypes);
      this._log('error','后缀标签未能保存，可重试',error);return false;
    }finally{this._attachmentPending--;this._refreshAttachmentResults();}
  }
  async _setTemporaryFileTypes(value:boolean):Promise<void> {
    if(this._attachmentModeSaving||this._attachmentPending)return;
    if(value===this._temporaryFileTypes)return;
    if(value){this._temporaryFileTypes=true;this._attachmentFilterEditor?.sync();return;}
    this._attachmentModeSaving=true;this._attachmentFilterEditor?.sync();
    try{
      await this.plugin.updateSetting('attachmentFileTypes',this.cfg.attachmentFileTypes,false);
      this._temporaryFileTypes=false;
      for(const {component} of this.plugin.components.values())if(component!==this&&!component._temporaryFileTypes){component.cfg.attachmentFileTypes=structuredClone(this.plugin.settings.attachmentFileTypes);component._refreshAttachmentResults();}
    }catch(error){this._log('error','后缀标签未能保存，仍保持临时设定，可重试',error);}
    finally{this._attachmentModeSaving=false;this._attachmentFilterEditor?.sync();}
  }
};
