import {DirectorySuggest} from '../ui/directory-suggest.ts';
import {FILTER_EXAMPLES,FILTER_HELP,compilePathRule} from '../search/path-filter.ts';
import type {SettingsForm} from './form.ts';
import { Setting, TextComponent, DropdownComponent, ToggleComponent, TFolder, type App } from 'obsidian';
import { IconRenderer } from '../shared/icons.ts';
import { openIconPicker } from './icon-picker.ts';
import { CollectionDraft, booleanFields, type FieldSpec, type ModelKey, type Row } from './models.ts';
import { ActionButton, ActionToolbar } from './controls.ts';
import { LABELS, DESCRIPTIONS } from './fields.ts';
import { toText } from '../shared/text.ts';
import type {SearchSettings, SettingsPatch} from '../types.ts';

type FilterExample = typeof FILTER_EXAMPLES[number];
const labels = LABELS as Record<string, string>;
const descriptions = DESCRIPTIONS as Record<string, string>;

// Shared draft/save/reset behavior for every structured model.
// 所有结构化模型统一使用草稿、保存与还原交互。
abstract class ModelEditor {
  abstract reset():void;
  abstract render():void;
  abstract changes():SettingsPatch;
  tab:SettingsForm;
  key:string;
  root:HTMLDivElement;
  toolbar:ActionToolbar;
  saveButton:ActionButton;
  resetButton:ActionButton;
  body:HTMLDivElement;
  status:HTMLDivElement;
  dirty:boolean;

  constructor(tab:SettingsForm,key:string,parent:HTMLElement,toolbar:ActionToolbar|undefined = undefined) {
    this.tab=tab;this.key=key;
    this.root=parent.createDiv({cls:'primecore-settings-model'});this.root.dataset.settingsModel=key;
    this.toolbar=toolbar||new ActionToolbar(this.root,labels[key]);
    this.saveButton=this.toolbar.add('save','保存修改',()=>this.commit()).setDisabled(true);
    this.resetButton=this.toolbar.add('rotate-ccw','还原',()=>{this.reset();this.render();this.setDirty(false);}).setDisabled(true);
    if(descriptions[key])this.root.createDiv({cls:'setting-item-description primecore-settings-model-description',text:descriptions[key]});
    this.body=this.root.createDiv();
    this.status=this.root.createDiv({cls:'setting-item-description'});this.status.setAttribute('role','status');
    this.dirty=false;
  }
  setDirty(dirty=true) {
    this.dirty=dirty;this.saveButton.setDisabled(!dirty);this.resetButton.setDisabled(!dirty);
    this.status.setText(dirty?'有未保存的修改，点击“保存修改”应用。':'');
  }
  async commit() {
    this.saveButton.setDisabled(true);this.resetButton.setDisabled(true);
    try {
      if(await this.tab.saveChanges(this.changes())) {
        this.reset();this.render();this.setDirty(false);this.status.setText('已保存');this.tab.refreshChoices();
      } else this.setDirty();
    } catch(error) {this.setDirty();this.status.setText((error as Error).message);}
  }
}
export interface StringListOptions {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  options?: Record<string, string>;
  folders?: string[];
  toolbar?: ActionToolbar;
  showToolbar?: boolean;
  app?: App;
  onExample?: (example: FilterExample) => void;
}
export class StringListEditor {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder: string;
  options?: Record<string, string>;
  folders: string[];
  root: HTMLDivElement;
  toolbar?: ActionToolbar;
  body: HTMLDivElement;
  app?: App;
  onExample?: (example: FilterExample) => void;
  suggesters:DirectorySuggest[];

  dispose(){this.suggesters?.forEach(s=>s.close());this.suggesters=[];}
  constructor(parent:HTMLElement,{value,onChange,placeholder='例如：Projects/Archive',options=undefined,folders=[],toolbar=undefined,showToolbar=true,app=undefined,onExample=undefined}:StringListOptions) {
    this.app=app;this.onExample=onExample;this.suggesters=[];
    this.value=structuredClone(value);this.onChange=onChange;this.placeholder=placeholder;this.options=options;this.folders=folders;
    this.root=parent.createDiv();
    if(showToolbar) {
      this.toolbar=toolbar||new ActionToolbar(this.root,'路径列表');
      this.toolbar.prepend(this.toolbar.add('plus','添加一项',()=>this.add()));
    }
    if(!options) {
      this.root.createDiv({cls:'setting-item-description',text:FILTER_HELP});
      new Setting(this.root).setName('添加常用规则').addDropdown(control=>{
        control.addOption('','选择规则示例…');FILTER_EXAMPLES.forEach((example,i)=>{control.addOption(String(i),example.label);});
        control.onChange(value=>{if(value==='')return;const example=FILTER_EXAMPLES[Number(value)];this.value.push(example.pattern);this.onChange([...this.value]);control.setValue('');this.render();this.onExample?.(example);});
      });
    }
    this.body=this.root.createDiv();this.render();
  }
  add() {
    this.value.push(this.options?Object.keys(this.options).find(key=>!this.value.includes(key))||Object.keys(this.options)[0]:'');
    this.onChange([...this.value]);this.render();
    const inputs=this.body.querySelectorAll('input');inputs[inputs.length-1]?.focus();
  }
  render() {
    this.dispose();this.body.empty();const listId=`primecore-paths-${crypto.randomUUID()}`;
    if(!this.options&&this.folders.length) {
      const list=this.body.createEl('datalist',{attr:{id:listId}});
      this.folders.forEach(folder=>list.createEl('option',{attr:{value:folder}}));
    }
    this.value.forEach((value,index)=>{
      const row=new Setting(this.body).setName(`第 ${index+1} 项`);
      const change=(next: string)=>{this.value[index]=next;this.onChange([...this.value]);};
      if(this.options)row.addDropdown(control=>{
        control.addOptions(this.options);if(!(value in this.options))control.addOption(value,value);control.setValue(value).onChange(change);
      });
      else row.addText(control=>{
        control.setValue(value).setPlaceholder(this.placeholder).onChange(change);
        control.inputEl.setAttribute('aria-label',`第 ${index+1} 项路径`);
        if(this.app)this.suggesters.push(new DirectorySuggest(this.app,control.inputEl,change));
        else if(this.folders.length)control.inputEl.setAttribute('list',listId);
      });
      new ActionButton(row.controlEl,{icon:'trash-2',label:'删除',onClick:()=>{this.value.splice(index,1);this.onChange([...this.value]);this.render();}});
    });
    if(!this.value.length)this.body.createDiv({text:'尚无条目，点击上方按钮添加。',cls:'setting-item-description'});
  }
}
export class CollectionEditor extends ModelEditor {
  draft: CollectionDraft;
  listEditor: StringListEditor;

  constructor(tab:SettingsForm,key:ModelKey,parent:HTMLElement,toolbar:ActionToolbar|undefined = undefined) {
    super(tab,key,parent,toolbar);this.reset();
    const add=this.toolbar.add('plus',`添加${this.draft.spec.singular}`,()=>{
      if(this.draft.spec.strings)this.listEditor.add();
      else {this.draft.add();this.setDirty();this.render();this.body.querySelector<HTMLInputElement>('tbody tr:last-child input')?.focus();}
    });
    this.toolbar.prepend(add);
    if(key==='searchPresets') {const common=new Setting(this.root).setName('添加常用预设').addDropdown(control=>{
      control.addOption('','选择常用预设…');FILTER_EXAMPLES.forEach((example,i)=>{control.addOption(String(i),example.label);});
      control.onChange(value=>{if(value==='')return;const example=FILTER_EXAMPLES[Number(value)],row=this.draft.add();row.value={name:example.label,mode:example.mode,excludeFolders:[example.pattern],icon:'filter'};control.setValue('');this.setDirty();this.render();});
    });this.root.insertBefore(common.settingEl,this.body);}
    this.render();
  }
  reset() {this.draft=new CollectionDraft(this.key as ModelKey,this.tab.plugin.settings[this.key as keyof SearchSettings]);}
  changes():SettingsPatch {return this.draft.changes(this.tab.plugin.settings);}
  folders():string[] {return this.tab.app.vault.getAllLoadedFiles().filter(file=>file instanceof TFolder&&file.path!=='/').map(folder=>folder.path);}
  render() {
    this.body.empty();const spec=this.draft.spec;
    if(spec.strings) {
      this.listEditor=new StringListEditor(this.body,{value:this.draft.rows.map(row=>toText(row.value)),app:this.tab.app,placeholder:spec.placeholder,options:spec.options,folders:spec.options?[]:this.folders(),showToolbar:false,onChange:value=>{this.draft.rows=value.map((item: string): Row=>({original:null,value:item}));this.setDirty();}});return;
    }
    const scroll=this.body.createDiv({cls:'primecore-settings-table-scroll'});
    const table=scroll.createEl('table',{cls:'primecore-settings-table'});
    const head=table.createEl('thead').createEl('tr');
    (spec.fields||[]).forEach(field=>head.createEl('th',{text:field.label,attr:{scope:'col'}}));head.createEl('th',{text:'操作',attr:{scope:'col'}});
    const body=table.createEl('tbody');
    this.draft.rows.forEach((row,index)=>{
      const tr=body.createEl('tr');(spec.fields||[]).forEach(field=>this.renderCell(tr.createEl('td'),field,row,index));
      new ActionButton(tr.createEl('td'),{icon:'trash-2',label:'删除',onClick:()=>{this.draft.remove(row);this.setDirty();this.render();}});
    });
    if(!this.draft.rows.length)this.body.createDiv({text:`尚无${spec.singular}，点击上方按钮添加。`,cls:'setting-item-description'});
  }
  renderCell(cell:HTMLElement,field:FieldSpec,row:Row,index:number) {
    const rowValue=row.value as Record<string, unknown>;
    const change=(value: unknown)=>{rowValue[field.key]=value;this.setDirty();};
    const label=`${this.draft.spec.singular} ${index+1}：${field.label}`;
    if(field.type==='icon') {this.renderIconChoice(cell,field,row,label,(next: string)=>change(next));return;}
    if(field.type==='fields') {
      new ActionButton(cell,{icon:'pencil',label:'编辑',onClick:()=>{
        const draft={value:structuredClone(rowValue)};
        this.tab.navigation.push({
          title:`${toText(rowValue.name||this.draft.spec.singular)} · ${field.label}`,
          render:(parent: HTMLElement)=>field.fields?.forEach(nested=>{
            const setting=new Setting(parent).setName(nested.label);
            this.renderScalar(setting.controlEl,nested,draft.value[nested.key],(value: string)=>{draft.value[nested.key]=value;},label+'：'+nested.label);
          }),
          apply:()=>{field.fields?.forEach(nested=>{rowValue[nested.key]=draft.value[nested.key];});this.setDirty();}
        });
      }});return;
    }
    if(field.type==='toggle') {
      const control=new ToggleComponent(cell).setValue(Boolean(rowValue[field.key])).onChange(change);control.toggleEl.setAttribute('aria-label',label);return;
    }
    if(field.type==='select') {
      const control=new DropdownComponent(cell).addOptions(field.options||{}).setValue(toText(rowValue[field.key])).onChange(change);control.selectEl.setAttribute('aria-label',label);return;
    }
    if(field.type==='paths') {
      const paths=rowValue[field.key] as string[];
      const button=new ActionButton(cell,{icon:'folder',label:`编辑规则（${paths.length}）`});
      button.onClick(()=>{
        let draft=structuredClone(paths);
        this.tab.navigation.push({
          title:`${toText(rowValue.name||'搜索预设')} · 过滤规则`,
          render:(parent: HTMLElement,view: {toolbar: ActionToolbar})=>new StringListEditor(parent,{app:this.tab.app,value:draft,toolbar:view.toolbar,folders:this.folders(),onChange:value=>{draft=value;}}),
          apply:()=>{
            const nextPaths=draft.map(path=>path.trim());
            if(nextPaths.some(path=>!path))throw new Error('请填写路径或删除空行。');
            if(new Set(nextPaths).size!==nextPaths.length)throw new Error('路径重复，请合并或删除。');
            nextPaths.forEach(compilePathRule);
            change(nextPaths);button.setButtonText(`编辑规则（${nextPaths.length}）`);
          }
        });
      });return;
    }
    this.renderScalar(cell,field,rowValue[field.key],(value: string)=>change(value),label);
  }
  renderIconChoice(cell:HTMLElement,field:FieldSpec,row:Row,label:string,change:(value: string)=>void) {
    let value=toText((row.value as Record<string, unknown>)[field.key]);
    const button=cell.createEl('button',{cls:'primecore-icon-choice',attr:{type:'button'}});
    const iconEl=button.createSpan({cls:'primecore-icon-choice-icon',attr:{'aria-hidden':'true'}});
    const nameEl=button.createSpan({cls:'primecore-icon-choice-name'});
    const sync=(next: string)=>{
      value=next;
      IconRenderer.setIcon(iconEl,next||'files',16);
      nameEl.setText(next||'未选择');
      button.setAttribute('title',next?`选择图标：${next}`:'选择图标');
      button.setAttribute('aria-label',`${label}：${next||'未选择'}`);
    };
    sync(value);
    button.addEventListener('click',()=>openIconPicker({anchor:button,value,onSelect:(next: string)=>{change(next);sync(next);}}));
  }

  renderScalar(cell:HTMLElement,field:FieldSpec,value:unknown,change:(value: string)=>void,label:string) {
    const control=new TextComponent(cell).setValue(toText(value ?? '')).setPlaceholder(field.placeholder||'').onChange(change);
    control.inputEl.setAttribute('aria-label',label);control.inputEl.title=field.placeholder||'';
    control.inputEl.addClass('primecore-settings-text');
    if(field.key==='url'||field.key==='suggest')control.inputEl.addClass('primecore-settings-url');
    // Obsidian themes style TextComponent's text input; retain it for URL templates too.
    if(field.key==='url'||field.key==='suggest') {
      control.inputEl.inputMode='url';control.inputEl.spellcheck=false;control.inputEl.setAttribute('autocapitalize','off');
    }
  }
}
export class BooleanModelEditor extends ModelEditor {
  fields: ReturnType<typeof booleanFields>;
  value: Record<string, boolean>;

  constructor(tab:SettingsForm,key:ModelKey,parent:HTMLElement,toolbar:ActionToolbar|undefined = undefined) {super(tab,key,parent,toolbar);this.reset();this.render();}
  reset() {
    this.fields=booleanFields(this.key,this.tab.plugin.settings[this.key as keyof SearchSettings]);
    this.value={...(this.tab.plugin.settings[this.key as keyof SearchSettings] as unknown as Record<string, boolean>)};
    this.fields.forEach(field=>{if(this.value[field.key]===undefined)this.value[field.key]=field.default;});
  }
  changes():SettingsPatch {
    return {[this.key]:structuredClone(this.value)};
  }
  render() {
    this.body.empty();this.fields.forEach(field=>{new Setting(this.body).setName(field.label).setDesc(field.description).addToggle(control=>{control.setValue(this.value[field.key]).onChange(value=>{this.value[field.key]=value;this.setDirty();});});});
  }
}
