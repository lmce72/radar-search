import type RadarSearchPlugin from '../main.ts';
import type {SettingsNavigation} from './navigation.ts';
import type {SettingsPatch} from '../types.ts';
import { Setting, Notice } from 'obsidian';
import { DEFAULT_SETTINGS, CHOICES } from './schema.ts';
import { MODEL_SPECS } from './models.ts';
import { CollectionEditor, BooleanModelEditor } from './editors.ts';
import { ActionButton } from './controls.ts';
import { LABELS, DESCRIPTIONS, PLACEHOLDERS, VAULT_OPTION_KEYS } from './fields.ts';

export class SettingsForm {
  declare plugin:RadarSearchPlugin;
  declare app:import("obsidian").App;
  declare containerEl:HTMLElement;
  declare navigation:SettingsNavigation;
  declare choiceControls:Map<string,import("obsidian").DropdownComponent>;
  declare editors:Map<string,CollectionEditor|BooleanModelEditor>;
  declare fieldRows:Map<string,Setting>;

  constructor(plugin:RadarSearchPlugin,container:HTMLElement,navigation:SettingsNavigation) {
    this.plugin=plugin;this.app=plugin.app;this.containerEl=container;
    this.navigation=navigation;
    this.choiceControls=new Map();this.editors=new Map();this.fieldRows=new Map();
  }
  async saveChanges(changes:SettingsPatch) {
    try {await this.plugin.updateSettings(changes,true);this.refreshVisibility();return true;}
    catch(error) {new Notice(`设置未保存：${error.message}`);return false;}
  }
  async save(key,value) {return this.saveChanges({[key]:value});}
  openModel(key) {
    this.navigation.push({title:LABELS[key],render:(parent,view)=>{
      view.form=new SettingsForm(this.plugin,parent,this.navigation);
      const Editor=CollectionEditor;
      view.form.editors.set(key,new Editor(view.form,key,parent,view.toolbar));
    }});
  }
  refreshVisibility() {
    const perMode=this.plugin.settings.placeholderType==='custom';
    for(const key of ['placeholder_global','placeholder_vault','placeholder_web']) {
      this.fieldRows.get(key)?.settingEl.toggle(perMode);
    }
  }
  refreshChoices() {
    for(const [key,control] of this.choiceControls) {
      control.selectEl.empty();control.addOption('',key==='defaultPreset'?'不使用预设':'所有已启用引擎');
      const rows=key==='defaultPreset'?this.plugin.settings.searchPresets:this.plugin.settings.engines;
      rows.forEach(row=>{control.addOption(key==='defaultPreset'?row.name:row.id,row.name);});
      control.setValue(this.plugin.settings[key]||'');
    }
  }
  addField(key) {
    if((MODEL_SPECS[key]&&key!=='excludePaths')||key==='searchIndex') {
      const Editor=MODEL_SPECS[key]?CollectionEditor:BooleanModelEditor;
      this.editors.set(key,new Editor(this,key,this.containerEl));return;
    }
    const row=new Setting(this.containerEl).setName(LABELS[key]).setDesc(DESCRIPTIONS[key]||'');
    this.fieldRows.set(key,row);this.refreshVisibility();
    if(key==='vaultOptions') {
      new ActionButton(row.controlEl,{icon:'sliders-horizontal',label:'配置搜索选项',onClick:()=>{
        this.navigation.push({title:'Vault 搜索选项',render:(parent,view)=>{
          view.form=new SettingsForm(this.plugin,parent,this.navigation);VAULT_OPTION_KEYS.forEach(option=>view.form.addField(option));
        }});
      }});return;
    }
    if(key==='excludePaths') {
      new ActionButton(row.controlEl,{icon:'folder-minus',label:'配置',onClick:()=>this.openModel(key)});return;
    }
    const value=this.plugin.settings[key];
    if(typeof DEFAULT_SETTINGS[key]==='boolean') {row.addToggle(control=>control.setValue(value).onChange(next=>{void this.save(key,next);}));return;}
    if(CHOICES[key]) {row.addDropdown(control=>control.addOptions(CHOICES[key]).setValue(value).onChange(next=>{void this.save(key,next);}));return;}
    if(['defaultPreset','activeEngineId'].includes(key)) {
      row.addDropdown(control=>{
        this.choiceControls.set(key,control);this.refreshChoices();control.onChange(next=>{void this.save(key,next||(key==='activeEngineId'?null:''));});
      });return;
    }
    row.addText(control=>{
      control.setValue(String(value)).setPlaceholder(PLACEHOLDERS[key]||String(DEFAULT_SETTINGS[key]));control.inputEl.setAttribute('aria-label',LABELS[key]);
      if(typeof value==='number') {control.inputEl.type='number';control.inputEl.min='1';control.inputEl.step='1';}
      control.inputEl.addEventListener('change',()=>{void this.save(key,typeof value==='number'?Number(control.getValue()):control.getValue());});
    });
  }
}
