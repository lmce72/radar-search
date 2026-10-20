import { PluginSettingTab, Setting } from 'obsidian';
import { SettingsForm } from './form.ts';
import { SETTINGS_GROUPS } from './fields.ts';
import { SettingsNavigation } from './navigation.ts';
import { renderSettingTitle } from './controls.ts';
import { closeIconPickers } from './icon-picker.ts';
import type RadarSearchPlugin from '../main.ts';

export class SearchSettingTab extends PluginSettingTab {
  constructor(app:import('obsidian').App,public plugin:RadarSearchPlugin) {super(app,plugin);this.navigation=new SettingsNavigation(this.containerEl);this.form=new SettingsForm(plugin,this.containerEl,this.navigation);}
  navigation: SettingsNavigation;
  form: SettingsForm;

  hide() {closeIconPickers();}

  /**
   * The tab renders a custom nested editor in `display()`. Returning an empty
   * declarative list keeps that editor intact; the method exists so Obsidian
   * 1.13+ discovers the tab without replacing the custom rendering.
   * 自定义嵌套编辑界面由 display() 渲染；返回空声明列表以保留原有渲染。
   */
  getSettingDefinitions() { return []; }

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
