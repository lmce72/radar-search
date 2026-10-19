import { Plugin, ItemView, MarkdownRenderChild, Notice, Component, Platform, type WorkspaceLeaf } from 'obsidian';
import { SearchBarComponent } from './ui/search-bar.ts';
import { FloatingSearch } from './ui/floating-search.ts';
import { createSearchIndexEngine } from './search/index-engine.ts';
import { SettingsStore } from './settings/store.ts';
import { SearchSettingTab } from './settings/tab.ts';
import { HistoryStore } from './history/store.ts';
import {openPluginSettings} from './settings/open-settings.ts';
import { PLUGIN_ICON_ID, registerPluginIcon } from './shared/plugin-icon.ts';
import type {SearchSettings,SettingsPatch,SearchMountOptions,SearchSession} from './types.ts';

const VIEW_TYPE='primecore-search';
class SearchView extends ItemView {
  declare plugin:RadarSearchPlugin;

  constructor(leaf:WorkspaceLeaf,plugin:RadarSearchPlugin) { super(leaf);this.plugin=plugin; }
  getViewType() {return VIEW_TYPE;}
  getDisplayText() {return 'Radar Search';}
  getIcon() {return PLUGIN_ICON_ID;}
  async onOpen() {this.contentEl.empty();this.contentEl.addClass('primecore-search-view');await this.plugin.mount(this.contentEl,this,{presentation:'page'});}
  async onClose() {this.plugin.unmount(this.contentEl);}
}

export default class RadarSearchPlugin extends Plugin {
  declare components:Map<HTMLElement,{component:SearchBarComponent;owner:Component}>;
  declare _stopping:boolean;
  declare _refreshQueue:Promise<void>;
  declare store:SettingsStore;
  declare settings:SearchSettings;
  declare indexEngine:ReturnType<typeof createSearchIndexEngine>;
  declare history:HistoryStore;
  declare floatingSearch:FloatingSearch|null;

  async onload() {
    registerPluginIcon();
    this.components=new Map();
    this._stopping=false;
    this._refreshQueue=Promise.resolve();
    this.store=new SettingsStore(this);
    this.settings=await this.store.load();
    this.indexEngine=createSearchIndexEngine();
    this.history=new HistoryStore(this);
    await this.history.initialize();
    this.addSettingTab(new SearchSettingTab(this.app,this));
    this.registerView(VIEW_TYPE,leaf=>new SearchView(leaf,this));
    this.addRibbonIcon(PLUGIN_ICON_ID,'打开浮动搜索框',()=>this.openFloatingSearch()).addClass('primecore-search-ribbon');
    this.addCommand({id:'open-floating-search',name:'打开浮动搜索框',callback:()=>this.openFloatingSearch()});
    this.addCommand({id:'open-search-page',name:'打开搜索页',callback:()=>this.openSearchPage()});
    this.addCommand({id:'rebuild-index',name:'重建搜索索引',callback:()=>this.refreshComponents(true)});
    this.registerMarkdownCodeBlockProcessor('primecore-search',async(_source,el,ctx)=>{
      const owner=new MarkdownRenderChild(el);ctx.addChild(owner);await this.mount(el,owner);
    });
  }
  report(level:'warn'|'error'|'log',...args:unknown[]) {
    if (this.settings?.debug) console[level]('[Radar Search]',...args);
    if (level==='error') new Notice(`Radar Search：${String(args[0])}`);
  }
  async updateSetting<K extends keyof SearchSettings>(key:K,value:SearchSettings[K],refresh=false) {
    await this.store.update(key,value);
    if (refresh) await this.refreshComponents(key==='searchIndex');
  }
  async updateSettings(changes:SettingsPatch,refresh=true) {
    await this.store.updateMany(changes);
    if(refresh)await this.refreshComponents('searchIndex' in changes);
  }
  async mount(container:HTMLElement,owner:Component,options:SearchMountOptions={}) {
    this.unmount(container);
    const component=new SearchBarComponent(this,container,options);
    const record={component,owner};
    this.components.set(container,record);
    component.register(()=>{if(this.components.get(container)===record)this.components.delete(container);});
    owner.addChild(component);
    try {
      await component.render();
      if(options.session)await component.applySearchSession(options.session);
      return component;
    } catch(error) {
      this.unmount(container);
      this.report('error','搜索栏加载失败',error);
      throw error;
    }
  }
  unmount(container:HTMLElement) {
    const record=this.components.get(container);
    if (!record) return;
    record.owner.removeChild(record.component);
    this.components.delete(container);
  }
  async refreshComponents(rebuildIndex=false) {
    const operation=this._refreshQueue.catch(error=>this.report('error','上次刷新失败',error)).then(()=>this.rebuildMountedComponents(rebuildIndex));
    this._refreshQueue=operation;return operation;
  }
  async rebuildMountedComponents(rebuildIndex=false) {
    if(this._stopping)return;
    const mounted=[...this.components.entries()].map(([container,record])=>({container,...record,session:{...record.component.getSearchSession(),settings:structuredClone(this.settings)},presentation:record.component.presentation}));
    // Keep one reference across the rebuild so unmounting the last search bar does
    // not dispose the index; only an explicit index refresh discards it.
    // 重建期间持有一份引用，避免最后一个搜索栏卸载时销毁索引；仅显式重建索引时丢弃。
    this.indexEngine.retain();
    try {
      mounted.forEach(({container})=>this.unmount(container));
      if(rebuildIndex)this.indexEngine.dispose();
      for (const {container,owner,session,presentation} of mounted) if(!this._stopping && container.isConnected) await this.mount(container,owner,{presentation,session});
    } finally {
      this.indexEngine.release();
    }
  }
  openFloatingSearch() {
    if(this.floatingSearch) {this.components.get(this.floatingSearch.contentEl)?.component._focusInput();return;}
    this.floatingSearch=new FloatingSearch(this);
    this.floatingSearch.open();
  }
  openSettings() {
    try {this.floatingSearch?.close();openPluginSettings(this.app,this.manifest.id);}
    catch(error) {this.report('error','打开插件设置失败',error);}
  }
  async openSearchPage(session?:SearchSession) {
    const leaves=this.app.workspace.getLeavesOfType(VIEW_TYPE);
    // Prefer the main area. On mobile a leaf parked in a collapsed side dock
    // stays invisible even after revealLeaf, which left only the closed floater.
    // 优先主区域；移动端停靠在收起侧栏的页面即使 revealLeaf 也不可见。
    let leaf=leaves.find(item=>item.getRoot()===this.app.workspace.rootSplit);
    if(!leaf&&!Platform.isMobile)leaf=leaves[0];
    if (!leaf) {leaf=this.app.workspace.getLeaf('tab');await leaf.setViewState({type:VIEW_TYPE,active:true});}
    await this.app.workspace.revealLeaf(leaf);
    if(leaf.view instanceof SearchView) {
      const component=this.components.get(leaf.view.contentEl)?.component;
      if(session&&component)await component.applySearchSession(session);
      component?._focusInput();
    }
    if(session)this.floatingSearch?.close();
  }
  onunload() {
    this._stopping=true;
    this.floatingSearch?.close();
    for (const container of [...this.components.keys()]) this.unmount(container);
    this.indexEngine?.dispose();
  }
}
