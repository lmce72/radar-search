import {Setting} from 'obsidian';
import type {SearchBarCtor} from './search-bar-host.ts';
import {ActionButton,ActionToolbar} from '../settings/controls.ts';
import {StringListEditor} from '../settings/editors.ts';
import {validatePathFilter,presetFromFilter,filterWithExclusions} from '../search/path-filter.ts';
import {exclusionTargets,hasExclusion,toggleExclusion} from '../search/quick-exclusions.ts';
import {SORT_OPTIONS} from '../search/sort.ts';
import type {PathFilter,SortMode} from '../types.ts';
import {localDateKey} from '../history/date-range.ts';

export const withResultTools = <T extends SearchBarCtor>(Base: T) => class extends Base {
  _buildResultTools(parent:HTMLElement) {
    this._resultToolsEl=parent.createDiv({cls:'primecore-result-tools'});
    this._sortButton=new ActionButton(this._resultToolsEl,{icon:'arrow-down-up',label:'排序',onClick:event=>{event.stopPropagation();this._openSortView();}});
    this._filterButton=new ActionButton(this._resultToolsEl,{icon:'filter',label:'过滤器',onClick:event=>{event.stopPropagation();this._openFilterView();}});
    this._resultToolView='results';this._temporaryFilter=null;
    this.register(()=>{this._toolListEditor?.dispose();});
  }
  _syncResultTools(history=false) {
    this._resultToolsEl.setCssStyles({display: history||this._mode==='web'?'none':'flex'});
    this._filterButton.buttonEl.toggleClass('is-active',!!this._temporaryFilter||!!this._quickExcludedPaths.length);
    this._filterButton.buttonEl.setAttribute('aria-pressed',String(!!this._temporaryFilter||!!this._quickExcludedPaths.length));
    this._sortButton.buttonEl.title=SORT_OPTIONS[this._vaultSortMode]||'相关度';
    this._filterButton.buttonEl.title=this._temporaryFilter||this._quickExcludedPaths.length?'当前搜索正在使用临时过滤条件':'设置当前搜索的过滤规则';
  }
  _openToolView(kind:'sort'|'filter'|'presetName',title:string,onBack:()=>void) {
    this._attachmentFilterEditor?.el.hide();
    ++this._historyVer;this._markdownFilterEl?.hide();if(this._richPreview){this.removeChild(this._richPreview);this._richPreview=null;}
    for(const menu of this._choiceMenus)menu?.close();
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
    if(this._input.value.trim())void this._doSearch(this._input.value.trim());
    else void this._showHistory(localDateKey());
  }
  _rerunResults() {
    this._returnToResults();
  }
  _openSortView() {
    const {body}=this._openToolView('sort','结果排序',()=>this._returnToResults());
    body.createDiv({cls:'setting-item-description',text:'相关度固定高→低；修改/创建时间默认新→旧；名称默认 A→Z。可选择升序或倒序。'});
    for(const [mode,label] of Object.entries(SORT_OPTIONS)) {
      const descending=mode==='relevance'||mode.endsWith('-desc');
      const icon=this._vaultSortMode===mode?'check':(descending?'arrow-down':'arrow-up');
      const button=new ActionButton(body,{icon,label,onClick:event=>{
        event.stopPropagation();this._vaultSortMode=mode as SortMode;this._groupPages.clear();
        void this._saveCfgKey('vaultSortMode',this._vaultSortMode);this._rerunResults();
      }});
      button.buttonEl.addClass('primecore-sort-option');button.buttonEl.setAttribute('aria-pressed',String(this._vaultSortMode===mode));
    }
  }
  _openFilterView(keepDraft=false,path?:string) {
    this._closePanel({restoreDropdown:false});this._closeScopeMenu();
    if(!keepDraft) {
      const selected=this.cfg.searchPresets.find(p=>p.name===this._selectedPreset);
      this._filterDraft=filterWithExclusions(this._temporaryFilter||{mode:selected?.mode||'黑名单',paths:selected?.excludeFolders||this.cfg.excludePaths},this._quickExcludedPaths);
      this._filterWriteToPreset=false;this._filterPresetName=selected?.name||'';
      this._filterContextPath=path||this.app.workspace.getActiveFile()?.path||this._lastGroups?.flatMap(group=>group.items).find(item=>item.path)?.path||'';
    }
    const draft:PathFilter=this._filterDraft;
    const {view,toolbar,status,body}=this._openToolView('filter','过滤器',()=>this._returnToResults());
    const destination=toolbar.actionsEl.createEl('label',{cls:'primecore-filter-destination'});
    const destinationLabel=destination.createSpan();
    const track=destination.createSpan({cls:'checkbox-container'});
    const input=track.createEl('input',{type:'checkbox',attr:{'aria-label':'写入预设'}});
    input.checked=this._filterWriteToPreset;
    const presetSetting=new Setting(body).setName('目标预设').setDesc('应用时保存当前规则；选择新建预设后填写名称。').addDropdown(control=>{
      control.addOption('','新建预设…');this.plugin.settings.searchPresets.forEach(preset=>{control.addOption(preset.name,preset.name);});
      control.setValue(this._filterPresetName).onChange(value=>{this._filterPresetName=value;});
    });
    const syncDestination=()=>{destinationLabel.setText(this._filterWriteToPreset?'写入预设':'临时过滤');track.toggleClass('is-enabled',this._filterWriteToPreset);presetSetting.settingEl.setCssStyles({display:this._filterWriteToPreset?'flex':'none'});};
    this._listen(input,'change',()=>{this._filterWriteToPreset=input.checked;syncDestination();});syncDestination();
    let saving=false;
    const apply=toolbar.add('check','应用',async()=>{
      if(saving)return;
      try{
        const validated=validatePathFilter(draft);
        if(this._filterWriteToPreset&&!this._filterPresetName){this._filterDraft=validated;this._openPresetNameView();return;}
        saving=true;apply.setDisabled(true);input.disabled=true;
        if(this._filterWriteToPreset){
          const name=this._filterPresetName;
          if(!this.plugin.settings.searchPresets.some(preset=>preset.name===name))throw Error('目标预设已被删除，请重新选择');
          const presets=this.plugin.settings.searchPresets.map(preset=>preset.name===name?{...preset,mode:validated.mode,excludeFolders:validated.paths}:preset);
          await this.plugin.updateSettings({searchPresets:presets},false);
          for(const {component} of this.plugin.components.values()){component.cfg.searchPresets=structuredClone(presets);component._rebuildPresetOptions?.();}
          this._selectedPreset=name;this._temporaryFilter=null;this._refreshContentToggleStatus();
        }else this._temporaryFilter=validated;
        if(this._disposed)return;
        this._quickExcludedPaths=[];this._groupPages.clear();this._rerunResults();
      }catch(error){if(view.isConnected)status.setText((error as Error).message);}
      finally{saving=false;if(view.isConnected){apply.setDisabled(false);input.disabled=false;}}
    });
    toolbar.add('rotate-ccw','清除临时过滤',()=>{this._temporaryFilter=null;this._quickExcludedPaths=[];this._groupPages.clear();this._rerunResults();});
    new Setting(body).setName('过滤方式').setDesc('点击应用才生效；返回不会应用草稿。').addDropdown(control=>control.addOptions({'黑名单':'排除匹配项','白名单':'仅搜索匹配项'}).setValue(draft.mode).onChange(value=>{draft.mode=value as PathFilter['mode'];renderTargets();}));
    const quick=body.createDiv({cls:'primecore-filter-targets'});
    const renderTargets=()=>{
      quick.empty();
      if(!this._filterContextPath){quick.createDiv({cls:'setting-item-description',text:'打开笔记或从结果旁进入，可选择文件和各级父目录。'});return;}
      // One compact row: truncated context on the left, target actions on the right.
      // 单行紧凑布局：左侧截断显示路径，右侧排列排除操作，超出时横向滚动。
      const row=quick.createDiv({cls:'primecore-filter-target-row'});
      const context=row.createSpan({cls:'primecore-filter-context',text:this._filterContextPath});
      context.setAttribute('title',this._filterContextPath);
      context.setAttribute('aria-label',`当前过滤目标：${this._filterContextPath}`);
      for(const target of exclusionTargets(this._filterContextPath)){
        // Whitelist exclusions remain subtractive. / 白名单中的快捷排除仍为减去目标。
        const rule=draft.mode==='白名单'?'exclude:'+target.rule:target.rule;
        const selected=hasExclusion(draft.paths,rule);
        const label=target.kind==='file'?'排除当前文件':`排除第 ${target.level} 级目录：${target.path}`;
        const button=new ActionButton(row,{icon:target.kind==='file'?'file-minus':'folder-minus',label,onClick:()=>{
          draft.paths=toggleExclusion(draft.paths,rule);
          if(this._toolListEditor){this._toolListEditor.value=[...draft.paths];this._toolListEditor.render();}renderTargets();
        }});
        button.buttonEl.addClass('primecore-filter-target');button.buttonEl.setAttribute('aria-pressed',String(selected));
      }
    };
    renderTargets();
    const reusePresets=this.cfg.searchPresets.filter(preset=>preset.name!==this._selectedPreset).map(preset=>({name:preset.name,paths:preset.excludeFolders}));
    this._toolListEditor=new StringListEditor(body,{app:this.app,value:draft.paths,onChange:(paths: string[])=>{draft.paths=paths;renderTargets();},onExample:(example: {mode: PathFilter['mode']; pattern: string; label: string})=>{ draft.mode=example.mode;this._openFilterView(true);},placeholder:'目录、glob:**/assets/** 或 regex:/表达式/i',reusePresets});
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
        this._refreshContentToggleStatus();
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
