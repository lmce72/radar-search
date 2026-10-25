import {Setting} from 'obsidian';
import type {SearchBarCtor} from './search-bar-host.ts';
import {ActionButton,ActionToolbar} from '../settings/controls.ts';
import {StringListEditor} from '../settings/editors.ts';
import {validatePathFilter,presetFromFilter,filterWithExclusions} from '../search/path-filter.ts';
import {SORT_OPTIONS} from '../search/sort.ts';
import type {PathFilter,SortMode} from '../types.ts';

export const withResultTools = <T extends SearchBarCtor>(Base: T) => class extends Base {
  _buildResultTools(parent:HTMLElement) {
    this._resultToolsEl=parent.createDiv({cls:'primecore-result-tools'});
    this._sortButton=new ActionButton(this._resultToolsEl,{icon:'arrow-down-up',label:'排序',onClick:event=>{event.stopPropagation();this._openSortView();}});
    this._filterButton=new ActionButton(this._resultToolsEl,{icon:'filter',label:'临时过滤',onClick:event=>{event.stopPropagation();this._openFilterView();}});
    this._resultToolView='results';this._temporaryFilter=null;
    this.register(()=>{this._toolListEditor?.dispose();this._quickFilterMenu?.close();});
  }
  _syncResultTools(history=false) {
    this._resultToolsEl.setCssStyles({display: history||this._mode==='web'?'none':'flex'});
    this._filterButton.buttonEl.toggleClass('is-active',!!this._temporaryFilter||!!this._quickExcludedPaths.length);
    this._filterButton.buttonEl.setAttribute('aria-pressed',String(!!this._temporaryFilter||!!this._quickExcludedPaths.length));
    this._sortButton.buttonEl.title=SORT_OPTIONS[this._vaultSortMode]||'相关度';
    this._filterButton.buttonEl.title=this._temporaryFilter||this._quickExcludedPaths.length?'当前搜索正在使用临时过滤条件':'设置当前搜索的过滤规则';
  }
  _openToolView(kind:'sort'|'filter'|'presetName',title:string,onBack:()=>void) {
    ++this._historyVer;
    this._toolListEditor?.dispose();this._toolListEditor=null;
    this._resultToolView=kind;this._dropdownInner.empty();
    this._dropdownInner.scrollTop=0;
    this._contentHitControls=[];this._syncContentExpandButton();
    const view=this._dropdownInner.createDiv({cls:'primecore-result-tool-view',attr:{'data-result-view':kind}});
    this._listen(view,'click',event=>event.stopPropagation());
    this._listen(view,'keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onBack();}});
    const toolbar=new ActionToolbar(view,title);
    new ActionButton(toolbar.leadingEl,{icon:'arrow-left',label:'返回',onClick:event=>{event.stopPropagation();onBack();}});
    const status=view.createDiv({cls:'setting-item-description',attr:{role:'status'}});
    const body=view.createDiv();
    this._showDropdown();return {view,toolbar,status,body};
  }
  _returnToResults() {
    this._toolListEditor?.dispose();this._toolListEditor=null;
    this._resultToolView='results';
    this._renderDropdown(this._lastGroups||[]);
  }
  _rerunResults() {
    this._returnToResults();
    const query=this._input.value.trim();
    if(query)void this._doSearch(query);
  }
  _openSortView() {
    const {body}=this._openToolView('sort','结果排序',()=>this._returnToResults());
    for(const [mode,label] of Object.entries(SORT_OPTIONS)) {
      const button=new ActionButton(body,{icon:this._vaultSortMode===mode?'check':'arrow-down-up',label,onClick:event=>{
        event.stopPropagation();this._vaultSortMode=mode as SortMode;this._groupPages.clear();
        void this._saveCfgKey('vaultSortMode',this._vaultSortMode);this._rerunResults();
      }});
      button.buttonEl.addClass('primecore-sort-option');button.buttonEl.setAttribute('aria-pressed',String(this._vaultSortMode===mode));
    }
  }
  _openFilterView(keepDraft=false) {
    if(!keepDraft) {
      const selected=this.cfg.searchPresets.find(p=>p.name===this._selectedPreset);
      this._filterDraft=filterWithExclusions(this._temporaryFilter||{mode:selected?.mode||'黑名单',paths:selected?.excludeFolders||this.cfg.excludePaths},this._quickExcludedPaths);
    }
    const draft:PathFilter=this._filterDraft;
    const {toolbar,status,body}=this._openToolView('filter','临时过滤器',()=>this._returnToResults());
    toolbar.add('check','应用',()=>{try{this._temporaryFilter=validatePathFilter(draft);this._quickExcludedPaths=[];this._groupPages.clear();this._rerunResults();}catch(error){status.setText((error as Error).message);}});
    toolbar.add('save','保存为预设',()=>{try{this._filterDraft=validatePathFilter(draft);this._openPresetNameView();}catch(error){status.setText((error as Error).message);}});
    toolbar.add('rotate-ccw','清除临时过滤',()=>{this._temporaryFilter=null;this._quickExcludedPaths=[];this._groupPages.clear();this._rerunResults();});
    new Setting(body).setName('过滤方式').setDesc('临时覆盖当前预设；仅影响仓库文件结果，返回不应用草稿。').addDropdown(control=>control.addOptions({'黑名单':'排除匹配项','白名单':'仅搜索匹配项'}).setValue(draft.mode).onChange(value=>draft.mode=value as PathFilter['mode']));
    const reusePresets=this.cfg.searchPresets.filter(preset=>preset.name!==this._selectedPreset).map(preset=>({name:preset.name,paths:preset.excludeFolders}));
    this._toolListEditor=new StringListEditor(body,{app:this.app,value:draft.paths,onChange:(paths: string[])=>{draft.paths=paths;},onExample:(example: {mode: PathFilter['mode']; pattern: string; label: string})=>{ draft.mode=example.mode;this._openFilterView(true);},placeholder:'目录、glob:**/assets/** 或 regex:/表达式/i',reusePresets});
  }
  _openPresetNameView() {
    const {view,toolbar,status,body}=this._openToolView('presetName','保存搜索预设',()=>this._openFilterView(true));
    let name='';let saving=false;
    const save=toolbar.add('save','保存预设',async()=>{
      if(saving)return;
      try {
        const preset=presetFromFilter(this._filterDraft,name,this.plugin.settings.searchPresets);
        saving=true;save.setDisabled(true);
        await this.plugin.updateSettings({searchPresets:[...this.plugin.settings.searchPresets,preset]},false);
        if(this._disposed)return;
        this.cfg.searchPresets=structuredClone(this.plugin.settings.searchPresets);
        for(const {component} of this.plugin.components.values()) {
          component.cfg.searchPresets=structuredClone(this.plugin.settings.searchPresets);
          component._rebuildPresetOptions?.();
        }
        this._selectedPreset=preset.name;this._temporaryFilter=null;this._quickExcludedPaths=[];
        this._rebuildPresetOptions?.();
        if(this._contentToggleLabelEl)this._contentToggleLabelEl.setText(preset.name);
        if(this._contentToggleIconEl)this._setIcon(this._contentToggleIconEl,'filter',16);
        this._rerunResults();
      }catch(error){if(!this._disposed&&view.isConnected)status.setText((error as Error).message);}
      finally{saving=false;if(!this._disposed&&view.isConnected)save.setDisabled(false);}
    });
    new Setting(body).setName('预设名称').setDesc('保存后用于当前搜索，不改变默认预设。').addText(control=>{
      control.setPlaceholder('例如：排除附件与 assets').onChange(value=>name=value);
      control.inputEl.setAttribute('aria-label','预设名称');control.inputEl.focus();
      this._listen(control.inputEl,'keydown',event=>{if(event.key==='Enter'&&!event.isComposing){event.preventDefault();save.buttonEl.click();}});
    });
    body.createDiv({cls:'setting-item-description',text:`${this._filterDraft.mode==='黑名单'?'排除':'仅搜索'}：${this._filterDraft.paths.join('；')||'无规则'}`});
  }
};
