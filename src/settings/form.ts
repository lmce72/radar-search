import type RadarSearchPlugin from '../main.ts';
import type {SettingsNavigation} from './navigation.ts';
import type {SearchSettings, SettingsPatch} from '../types.ts';
import { Setting, Notice } from 'obsidian';
import { DEFAULT_SETTINGS, CHOICES } from './schema.ts';
import { MODEL_SPECS, type ModelKey } from './models.ts';
import { CollectionEditor, BooleanModelEditor } from './editors.ts';
import { ActionButton } from './controls.ts';
import { LABELS, DESCRIPTIONS, PLACEHOLDERS, VAULT_OPTION_KEYS } from './fields.ts';
import { toText } from '../shared/text.ts';

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
    catch(error) {new Notice(`设置未保存：${(error as Error).message}`);return false;}
  }
  async save<K extends keyof SearchSettings>(key: K,value: SearchSettings[K]): Promise<boolean> {return this.saveChanges({[key]:value});}
  openModel(key: ModelKey) {
    this.navigation.push({title:LABELS[key],render:(parent,view)=>{
      view.form=new SettingsForm(this.plugin,parent,this.navigation);
      view.form.editors.set(key,new CollectionEditor(view.form,key,parent,view.toolbar));
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
      if (key==='defaultPreset') this.plugin.settings.searchPresets.forEach(row=>{control.addOption(row.name,row.name);});
      else this.plugin.settings.engines.forEach(row=>{control.addOption(row.id,row.name);});
      control.setValue(toText(this.plugin.settings[key as keyof SearchSettings] || ''));
    }
  }
  addField(key: string) {
    if((MODEL_SPECS[key as ModelKey]&&key!=='excludePaths')||key==='searchIndex') {
      const editor = MODEL_SPECS[key as ModelKey] ? new CollectionEditor(this,key as ModelKey,this.containerEl) : new BooleanModelEditor(this,key as ModelKey,this.containerEl);
      this.editors.set(key,editor);return;
    }
    const row=new Setting(this.containerEl).setName((LABELS as Record<string,string>)[key]).setDesc((DESCRIPTIONS as Record<string,string>)[key]||'');
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
    const value=this.plugin.settings[key as keyof SearchSettings];
    if(typeof DEFAULT_SETTINGS[key as keyof SearchSettings]==='boolean') {row.addToggle(control=>control.setValue(Boolean(value)).onChange(next=>{void this.save(key as keyof SearchSettings,next);}));return;}
    const choices=(CHOICES as Record<string, Record<string,string>>)[key];
    if(choices) {row.addDropdown(control=>control.addOptions(choices).setValue(toText(value ?? '')).onChange(next=>{void this.save(key as keyof SearchSettings,next);}));return;}
    if(['defaultPreset','activeEngineId'].includes(key)) {
      row.addDropdown(control=>{
        this.choiceControls.set(key,control);this.refreshChoices();control.onChange(next=>{void this.save(key as keyof SearchSettings,next||(key==='activeEngineId'?null:''));});
      });return;
    }
    row.addText(control=>{
      control.setValue(toText(value)).setPlaceholder((PLACEHOLDERS as Record<string,string>)[key]||toText(DEFAULT_SETTINGS[key as keyof SearchSettings]));control.inputEl.setAttribute('aria-label',(LABELS as Record<string,string>)[key]);
      if(typeof value==='number') {control.inputEl.type='number';control.inputEl.min='1';control.inputEl.step='1';}
      control.inputEl.addEventListener('change',()=>{void this.save(key as keyof SearchSettings,typeof value==='number'?Number(control.getValue()):control.getValue());});
    });
  }
}
