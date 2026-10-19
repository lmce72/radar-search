import { PluginSettingTab, Setting } from 'obsidian';
import { SettingsForm } from './form.ts';
import { SETTINGS_GROUPS } from './fields.ts';
import { SettingsNavigation } from './navigation.ts';
import { renderSettingTitle } from './controls.ts';
import { closeIconPickers } from './icon-picker.ts';
import type RadarSearchPlugin from '../main.ts';

export class SearchSettingTab extends PluginSettingTab {
  constructor(app:import('obsidian').App,public plugin:RadarSearchPlugin) {super(app,plugin);}
  declare navigation;
  declare form;

  hide() {closeIconPickers();}

  display() {
    closeIconPickers();
    this.containerEl.empty();
    this.navigation=new SettingsNavigation(this.containerEl);
    this.navigation.push({title:'设置',showHeader:false,render:parent=>{
      this.form=new SettingsForm(this.plugin,parent,this.navigation);
      for(const [title,keys] of SETTINGS_GROUPS) {
        const heading=new Setting(parent).setName(title).setHeading();
        heading.settingEl.addClass('primecore-settings-section');
        renderSettingTitle(heading.nameEl,title);
        keys.forEach(key=>this.form.addField(key));
      }
    }});
  }
}
