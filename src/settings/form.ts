import {ChoiceMenu} from '../ui/choice-menu.ts';
import {AttachmentFilterEditor} from '../ui/attachment-filters.ts';
import {Component} from 'obsidian';
import {FileHandlerModal} from '../ui/file-handler.ts';
import {normalizeExtension} from '../history/recent-types.ts';
import {renderMarkdownFilters} from '../ui/markdown-filters.ts';
import type RadarSearchPlugin from '../main.ts';
import type {SettingsNavigation} from './navigation.ts';
import type {SearchSettings, SettingsPatch} from '../types.ts';
import {RecordCleanupModal} from './record-cleanup-modal.ts';
import type {CleanupScope} from '../history/date-range.ts';
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

  private menuOwners:Component[]=[];
  dispose():void {for(const owner of this.menuOwners)this.plugin.removeChild(owner);this.menuOwners=[];}
  constructor(plugin:RadarSearchPlugin,container:HTMLElement,navigation:SettingsNavigation) {
    this.plugin=plugin;this.app=plugin.app;this.containerEl=container;
    this.navigation=navigation;
    this.choiceControls=new Map();this.editors=new Map();this.fieldRows=new Map();
  }
  /** Scroll container shared with Obsidian's settings window. / 与宿主设置窗口共用的滚动容器。 */
  scrollHost():HTMLElement {
    return this.containerEl.closest<HTMLElement>('.vertical-tab-content,.modal-content')||this.containerEl;
  }
  async saveChanges(changes:SettingsPatch) {
    // Saving rebuilds mounted search bars; keep the settings view where the user left it.
    // 保存会重建已挂载搜索栏；保留设置页当前滚动位置，避免跳回顶部。
    const host=this.scrollHost();const scrollTop=host?.scrollTop||0;
    const restore=()=>{if(host?.isConnected)host.scrollTop=scrollTop;};
    try {
      await this.plugin.updateSettings(changes,true);
      this.refreshVisibility();restore();
      const win=this.containerEl.ownerDocument.defaultView;
      if(win)win.requestAnimationFrame(restore);
      return true;
    }
    catch(error) {new Notice(`设置未保存：${(error as Error).message}`);return false;}
  }
  async save<K extends keyof SearchSettings>(key: K,value: SearchSettings[K]): Promise<boolean> {return this.saveChanges({[key]:value});}
  openModel(key: ModelKey) {
    this.navigation.push({title:LABELS[key],render:(parent,view)=>{
      view.form=new SettingsForm(this.plugin,parent,this.navigation);
      view.form.editors.set(key,new CollectionEditor(view.form,key,parent,view.toolbar));
    }});
  }
  addQuickSwitcherImport() {
    const row=new Setting(this.containerEl).setName('导入快速切换条目').setDesc('读取快速切换的最近文件列表，已有记录跳过。原打开时间未知，保留与清理按导入日期计算。');
    const button=new ActionButton(row.controlEl,{icon:'history',label:'从快速切换导入',onClick:()=>{
      button.setDisabled(true);
      void this.plugin.importQuickSwitcher().then(count=>{new Notice(`已导入 ${count} 条最近打开记录`);})
        .catch(error=>this.plugin.report('error',(error as Error).message,error)).finally(()=>button.setDisabled(false));
    }});
  }
  addRecordCleanup(scope:CleanupScope) {
    const name=scope==='recent'?'清理最近打开记录':'清理搜索历史';
    const row=new Setting(this.containerEl).setName(name).setDesc('选择起止日期，清理该范围内的记录。');
    new ActionButton(row.controlEl,{icon:'trash-2',label:'按日期清理',onClick:()=>new RecordCleanupModal(this.plugin,scope).open()});
  }
  refreshVisibility() {
    this.fieldRows.get('historyRetentionDays')?.settingEl.toggle(this.plugin.settings.historyRetentionMode==='custom');
    for(const key of ['recentFilesDays','recentFilesLimit','defaultRecordView'])this.fieldRows.get(key)?.settingEl.toggle(this.plugin.settings.recentFilesEnabled);
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
    if(key==='attachmentFileTypes'){
      row.settingEl.addClass('primecore-setting-attachment-types');
      const editor=this.plugin.addChild(new AttachmentFilterEditor(row.controlEl,{getTypes:()=>this.plugin.settings.attachmentFileTypes,save:types=>this.save('attachmentFileTypes',types),notify:message=>new Notice(message)}));
      this.menuOwners.push(editor);return;
    }
    if(key==='recentFileTypes'){
      let extension='';row.setDesc('输入后缀即可加入最近打开的过滤候选，支持 .excalidraw.md 等复合后缀。');
      const list=this.containerEl.createDiv({cls:'primecore-file-type-settings'});
      const render=()=>{list.empty();for(const ext of this.plugin.settings.recentFileTypes){new Setting(list).setName('.'+ext).addButton(control=>control.setIcon('settings-2').setTooltip('设置处理方式').onClick(()=>new FileHandlerModal(this.plugin,ext).open())).addButton(control=>control.setIcon('x').setTooltip('移除此过滤类型').onClick(()=>{void this.save('recentFileTypes',this.plugin.settings.recentFileTypes.filter(value=>value!==ext)).then(render);}));}};
      row.addText(control=>control.setPlaceholder('文件后缀').onChange(value=>{extension=value;}));
      row.addButton(control=>control.setIcon('plus').onClick(()=>{try{const ext=normalizeExtension(extension);void this.save('recentFileTypes',[...new Set([...this.plugin.settings.recentFileTypes,ext])]).then(render);}catch(error){new Notice((error as Error).message);}}));render();return;
    }
    if(key==='fileTypeHandlers'){
      row.setDesc('选择后缀并设置处理视图；不提供跨平台指定任意外部程序的能力。');let extension='';
      row.addText(control=>control.setPlaceholder('文件后缀').onChange(value=>{extension=value;}));
      row.addButton(control=>control.setButtonText('设置').onClick(()=>{try{new FileHandlerModal(this.plugin,normalizeExtension(extension)).open();}catch(error){new Notice((error as Error).message);}}));return;
    }
    if(key==='markdownElementTypes'){const owner=this.plugin.addChild(new Component());this.menuOwners.push(owner);const roots=new Set<HTMLElement>();renderMarkdownFilters(row.controlEl,this.plugin.settings.markdownElementTypes,values=>this.plugin.setMarkdownElements(values),error=>this.plugin.report('error','Markdown 元素筛选保存失败',error),(parent,label,activate)=>owner.addChild(new ChoiceMenu(parent,label,roots,undefined,{hover:!!activate,activate})),()=>this.plugin.settings.markdownElementTypes);return;}
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
    if(choices) {row.settingEl.addClass('primecore-setting-choice');row.addDropdown(control=>control.addOptions(choices).setValue(toText(value ?? '')).onChange(next=>{void this.save(key as keyof SearchSettings,next);}));return;}
    if(['defaultPreset','activeEngineId'].includes(key)) {
      row.settingEl.addClass('primecore-setting-choice');
      row.addDropdown(control=>{
        this.choiceControls.set(key,control);this.refreshChoices();control.onChange(next=>{void this.save(key as keyof SearchSettings,next||(key==='activeEngineId'?null:''));});
      });return;
    }
    row.addText(control=>{
      control.setValue(toText(value)).setPlaceholder((PLACEHOLDERS as Record<string,string>)[key]||toText(DEFAULT_SETTINGS[key as keyof SearchSettings]));control.inputEl.setAttribute('aria-label',(LABELS as Record<string,string>)[key]);
      if(typeof value==='number') {control.inputEl.type='number';control.inputEl.min=key==='recentFilesDays'||key==='recentFilesLimit'?'0':'1';control.inputEl.step='1';}
      control.inputEl.addEventListener('change',()=>{void this.save(key as keyof SearchSettings,typeof value==='number'?Number(control.getValue()):control.getValue());});
    });
  }
}
