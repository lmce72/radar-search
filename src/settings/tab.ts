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
  private visible=false;

  hide() {this.visible=false;closeIconPickers();for(const view of this.navigation.stack){view.form?.dispose();view.dispose?.();}}

  /**
   * The tab renders a custom nested editor in `display()`. Returning an empty
   * declarative list keeps that editor intact; the method exists so Obsidian
   * 1.13+ discovers the tab without replacing the custom rendering.
   * 自定义嵌套编辑界面由 display() 渲染；返回空声明列表以保留原有渲染。
   */
  getSettingDefinitions() { return []; }

  display() {
    // Re-entering an active tab must retain nested drafts and keyboard focus.
    // 已打开的设置页重复刷新时保留子视图草稿与键盘焦点。
    if(this.visible&&this.navigation.current?.root.parentElement===this.containerEl){this.form.refreshVisibility();return;}
    this.visible=true;
    // Obsidian may re-display the tab after settings data changes; rebuilding must not
    // pull the window back to the top. / 宿主可能在设置保存后重新调用 display()；
    // 重建后恢复滚动位置，避免每改一项就跳回顶部。
    // Only a live tab keeps its position; a fresh open starts at the top.
    // 仅已打开的页保留位置；首次打开仍从顶部开始。
    const scrollTop=this.navigation.stack.length?this.containerEl.scrollTop||0:0;
    closeIconPickers();
    for(const view of this.navigation.stack){view.form?.dispose();view.dispose?.();}
    this.containerEl.empty();
    this.navigation=new SettingsNavigation(this.containerEl);
    this.navigation.push({title:'设置',showHeader:false,render:parent=>{
      this.form=new SettingsForm(this.plugin,parent,this.navigation);
      for(const [title,keys] of SETTINGS_GROUPS) {
        const heading=new Setting(parent).setName(title).setHeading();
        heading.settingEl.addClass('primecore-settings-section');
        renderSettingTitle(heading.nameEl,title);
        keys.forEach(key=>{
          this.form.addField(key);
          if(key==='recentFilesLimit'){this.form.addQuickSwitcherImport();this.form.addRecordCleanup('recent');}
          if(key==='historyPageSize')this.form.addRecordCleanup('history');
        });
      }
    }});
    this.containerEl.scrollTop=scrollTop;
    const win=this.containerEl.ownerDocument.defaultView;
    if(win)win.requestAnimationFrame(()=>{if(this.containerEl.isConnected)this.containerEl.scrollTop=scrollTop;});
  }
}
