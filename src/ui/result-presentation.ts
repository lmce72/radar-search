import {normalizeSettings} from '../settings/schema.ts';
import {showElementHint} from './element-hint.ts';
import type {MenuChoice} from './choice-menu.ts';
import {SPECIAL_SEARCH_OPTIONS,sourceOption,type SpecialSearchKey} from '../search/special-search-options.ts';
import {type MarkdownElementKind} from '../search/markdown-elements.ts';
import type {SearchSession, SearchGroup, SearchSettings,SettingsPatch,MarkdownResultMode} from '../types.ts';
import type {SearchBarCtor} from './search-bar-host.ts';
import {RESULT_CATEGORIES,resultCategoryStates,filterResultGroups} from '../search/result-categories.ts';
import {markdownElementGroups} from '../search/markdown-result-items.ts';
import {clearTimer} from '../shared/timers.ts';

const SESSION_FIELDS={_searchMarkdown:'searchMarkdown',_contentSearch:'vaultContentSearch',_searchTags:'searchTags',_searchWikiLinks:'searchWikiLinks',
  _searchMdLinks:'searchMdLinks',_searchBookmarks:'searchBookmarks',_searchProperties:'searchProperties',_searchCommands:'searchCommands',
  _searchNonMarkdown:'searchNonMarkdown',_extendedContext:'extendedContext',_selectedPreset:'defaultPreset',
  _limitContentResults:'limitContentResults',_vaultSortMode:'vaultSortMode',_activeEngineId:'activeEngineId'} as const;

export const withResultPresentation = <T extends SearchBarCtor>(Base: T) => class extends Base {
  getSearchSession():SearchSession {
    const settings=structuredClone(this.cfg);
    for(const [field,key] of Object.entries(SESSION_FIELDS))Reflect.set(settings,key,(this as unknown as Record<string, unknown>)[field]);
    return {temporaryFileTypes:this._temporaryFileTypes,markdownResultMode:this._markdownResultMode,...(this._temporarySearchOptions?{temporaryOptions:true}:{}),query:this._input?.value.trim()||'',mode:this._mode,category:this._resultCategory,quickExcludedPaths:[...this._quickExcludedPaths||[]],temporaryFilter:this._temporaryFilter?structuredClone(this._temporaryFilter):undefined,settings};
  }
  async applySearchSession(session:SearchSession) {
    ++this._historyVer;++this._vaultSearchVer;++this._webSearchVer;
    clearTimer(this._debounceTimer);this._debounceTimer=null;
    this._quickExcludedPaths=[...session.quickExcludedPaths||[]];
    this._resultToolView='results';this._toolListEditor?.dispose();
    this._temporaryFilter=session.temporaryFilter?structuredClone(session.temporaryFilter):null;
    this._temporarySearchOptions=!!session.temporaryOptions;
    this.cfg=normalizeSettings(session.settings);
    this._temporaryFileTypes=!!session.temporaryFileTypes;
    this._markdownResultMode=session.markdownResultMode==='elements'?'elements':session.markdownResultMode==='documents'?'documents':this.cfg.defaultMarkdownResultMode;
    for(const [field,key] of Object.entries(SESSION_FIELDS))(this as unknown as Record<string, unknown>)[field]=this.cfg[key as keyof SearchSettings];
    this._groupPages.clear();this._lastGroups=null;
    this._input.value=session.query;this._syncClearBtn();
    this._selectMode(session.mode,false);
    const category=session.category==='wikiLinks'||session.category==='mdLinks'?'markdown':session.category;
    this._resultCategory=category;this._preferredResultCategory=category;this._resultCategoryChosen=true;
    if(session.query)await this._doSearch(session.query);
  }
  _syncSearchAction() {
    this._goBtn.setCssStyles({display: this._mode==='web'?'flex':'none'});
    if(this._panelQuickFilterButton !== null && this._panelQuickFilterButton !== undefined)this._panelQuickFilterButton.setCssStyles({display: this._mode==='web'?'none':'inline-flex'});
    this._goBtn.setAttribute('aria-label','搜索互联网');
  }
  _openResultsPage() {
    const session=this.getSearchSession();
    if(!session.query)return;
    this.plugin.openSearchPage(session).catch(error=>this._log('error','打开搜索页失败',error));
  }
  _refreshSourceResults():void {
    if(this._disposed)return;
    const query=this._input?.value.trim();
    if(this._resultKind==='results'&&query)void this._doSearch(query);
    else if(this._barLeft)this._renderResultCategories();
  }
  async _setTemporarySearchOptions(value:boolean):Promise<void> {
    if(this._sourceModeSaving||this._sourcePending>0){if(this._temporaryInput)this._temporaryInput.checked=this._temporarySearchOptions;return;}
    if(value===this._temporarySearchOptions)return;
    if(value){this._temporarySearchOptions=true;this._refreshSourceResults();return;}
    const changes:SettingsPatch={markdownElementTypes:[...this.cfg.markdownElementTypes]};
    for(const option of SPECIAL_SEARCH_OPTIONS)changes[option.key]=this[option.field];
    this._sourceModeSaving=true;this._sourceSaving=true;this._refreshSourceResults();
    try{
      // Commit all local choices together before leaving temporary mode.
      // 先原子保存全部本地选择，再退出临时模式，失败时保留草稿。
      await this.plugin.updateSettings(changes,false);
      this._temporarySearchOptions=false;
      for(const {component} of this.plugin.components.values())if(component.container!==this.container&&!component._temporarySearchOptions){
        for(const option of SPECIAL_SEARCH_OPTIONS){component[option.field]=this[option.field];component.cfg[option.key]=this[option.field];}
        component.cfg.markdownElementTypes=[...this.cfg.markdownElementTypes];component._refreshSourceResults();
      }
    }catch(error){this._log('error','临时选项未能保存，仍保持临时模式，可重试',error);}
    finally{this._sourceModeSaving=false;this._sourceSaving=this._sourcePending>0;this._refreshSourceResults();}
  }
  async _setSourceEnabled(key:SpecialSearchKey,value:boolean):Promise<void> {
    if(this._sourceModeSaving)return;
    const option=SPECIAL_SEARCH_OPTIONS.find(item=>item.key===key);if(!option)return;
    this._sourceVersions??=new Map();
    const version=(this._sourceVersions.get(key)||0)+1;this._sourceVersions.set(key,version);
    this._sourcePending=(this._sourcePending||0)+1;this._sourceSaving=true;
    const previous=this[option.field],previousCfg=this.cfg[key];
    this[option.field]=value;this.cfg[key]=value;
    if(this._barLeft)this._renderResultCategories();
    try{
      if(!this._temporarySearchOptions){
        await this.plugin.updateSetting(key,value,false);
        for(const {component} of this.plugin.components.values())if(component.container!==this.container&&!component._temporarySearchOptions){
          component[option.field]=value;component.cfg[key]=value;component._refreshSourceResults();
        }
      }
    }catch(error){if(this._sourceVersions.get(key)===version){this[option.field]=this._temporarySearchOptions?previous:this.plugin.settings[key];this.cfg[key]=this._temporarySearchOptions?previousCfg:this.plugin.settings[key];}this._log('error','搜索来源保存失败',error);}
    finally{this._sourcePending--;this._sourceSaving=this._sourcePending>0;this._refreshSourceResults();}
  }
  _scheduleMarkdownRefresh():void {
    clearTimer(this._markdownFilterTimer);
    ++this._vaultSearchVer;
    this._markdownFilterTimer=this._later(()=>{
      this._markdownFilterTimer=null;this._groupPages.clear();
      const query=this._input?.value.trim();
      if(query&&this._searchMarkdown&&this._mode!=='web'&&this._resultToolView==='results')void this._doSearch(query);
    },2000);
  }
  _syncMarkdownResultMenu():void {
    const menu=this._markdownResultMenu;if(!menu)return;
    const choices=[{id:'documents',label:'按文档',icon:'files'},{id:'elements',label:'针对元素',icon:'list-tree'}] as const;
    const current=choices.find(choice=>choice.id===this._markdownResultMode);
    menu.setLabel(current.label,current.icon);menu.trigger.setAttribute('aria-label','元素结果显示模式：'+current.label);
    menu.setChoices(choices.map(choice=>({...choice,checked:choice.id===this._markdownResultMode,radio:true,onSelect:()=>this._setMarkdownResultMode(choice.id),defaultChoice:{
      selected:choice.id===this.cfg.defaultMarkdownResultMode,disabled:this._markdownDefaultSaving,onSelect:()=>{void this._setDefaultMarkdownResultMode(choice.id);}
    }})));
  }
  _setMarkdownResultMode(mode:MarkdownResultMode):void {
    if(mode===this._markdownResultMode)return;
    this._markdownResultMode=mode;this._groupPages.delete('Markdown 元素匹配');this._syncMarkdownResultMenu();
    if(this._lastGroups&&this._resultToolView==='results')this._renderDropdown(this._lastGroups);
  }
  async _setDefaultMarkdownResultMode(mode:MarkdownResultMode):Promise<void> {
    if(this._markdownDefaultSaving||mode===this.cfg.defaultMarkdownResultMode)return;
    this._markdownDefaultSaving=true;this._syncMarkdownResultMenu();
    try{
      await this.plugin.updateSetting('defaultMarkdownResultMode',mode,false);
      // Changing the default must not change another active search's display mode.
      // 默认值写入成功后只同步默认标记，不切换其它正在使用的搜索界面。
      for(const {component} of this.plugin.components.values()){component.cfg.defaultMarkdownResultMode=mode;component._syncMarkdownResultMenu();}
    }catch(error){this._log('error','元素结果默认显示模式未能保存，可重试',error);}
    finally{this._markdownDefaultSaving=false;this._syncMarkdownResultMenu();}
  }
  _setMarkdownElements(values:MarkdownElementKind[]):Promise<MarkdownElementKind[]> {
    this.cfg.markdownElementTypes=[...values];this._scheduleMarkdownRefresh();
    return this._temporarySearchOptions?Promise.resolve(values):this.plugin.setMarkdownElements(values).catch(error=>{if(JSON.stringify(this.cfg.markdownElementTypes)===JSON.stringify(values)){this.cfg.markdownElementTypes=[...this.plugin.settings.markdownElementTypes];this._scheduleMarkdownRefresh();}throw error;});
  }
  async _setDefaultExpandContent(value:boolean):Promise<void> {
    try{
      await this.plugin.updateSetting('defaultExpandContent',value,false);
      for(const {component} of this.plugin.components.values()){
        component.cfg.defaultExpandContent=value;component._contentAllExpanded=value;component._markdownExpanded=value;
        const input=component._vaultSearchPanel?.querySelector<HTMLInputElement>('[data-default-expand-content]');
        if(input){input.checked=value;input.closest('.checkbox-container')?.toggleClass('is-enabled',value);}
        if(component._resultToolView==='results'&&component._resultKind==='results'&&component._lastGroups)component._renderDropdown(component._lastGroups);
      }
    }catch(error){this._log('error','默认展开内容设置未能保存',error);}
  }
  _renderResultCategories() {
    const el:HTMLElement=this._barLeft;if(!el)return;
    this._temporaryControl?.setCssStyles({display:!this._input.value.trim()&&this._mode!=='web'?'inline-flex':'none'});
    this._temporaryControl?.setAttribute('aria-busy',String(!!this._sourceModeSaving));
    const ordered=this.cfg.sourceOrder.map(id=>RESULT_CATEGORIES.find(category=>category.id===id)).filter(Boolean);
    const categories=ordered.filter(category=>this._mode==='web'?category.id==='web':category.id!=='web'||this._mode==='global'&&this.cfg.engines.some(engine=>engine.enabled));
    const idleNow=this._resultKind==='history'||!this._input.value.trim();
    if(idleNow&&el.dataset.context==='idle'&&el.dataset.mode===this._mode&&this._sourceMenu){
      const choices=categories.map(category=>{
        const option=sourceOption(category.id);return {id:category.id,label:category.label,icon:category.icon,checked:option?this[option.field]:true,disabled:!option||this._sourceModeSaving,keepOpen:true,onSelect:()=>{if(option)void this._setSourceEnabled(option.key,!this[option.field]);}};
      });
      this._sourceMenu.setChoices(choices);
      for(const button of el.querySelectorAll<HTMLButtonElement>('[data-category]')){const option=sourceOption(button.dataset.category as import('../types.ts').ResultCategory);if(option){const active=this[option.field];button.setAttribute('aria-pressed',String(active));button.dataset.enabled=String(active);}button.disabled=!!this._sourceModeSaving;}
      if(this._temporaryInput){this._temporaryInput.checked=this._temporarySearchOptions;this._temporaryInput.disabled=!!this._sourceSaving;}
      this._temporaryTrack?.toggleClass('is-enabled',this._temporarySearchOptions);return;
    }
    for(const menu of [this._sourceMenu,this._categoryMenu])if(menu)this.removeChild(menu);
    this._sourceMenu=null;this._categoryMenu=null;
    el.dataset.context=idleNow?'idle':'results';el.dataset.mode=this._mode;
    const previousScroll=el.scrollLeft;
    const previousFocus=el.contains(el.ownerDocument.activeElement)?el.ownerDocument.activeElement?.getAttribute('data-category'):null;
    const idle=this._resultKind==='history'||!this._input.value.trim();
    el.empty();el.addClass('primecore-result-tabs');el.toggleClass('is-source-configuration',idle);
    el.setAttribute('role',idle?'group':'tablist');el.setAttribute('aria-label',idle?'搜索来源':'搜索结果分类');
    const groups=this._lastGroups||[];
    const countGroups=this._markdownResultMode==='elements'?groups.map(group=>group.title==='Markdown 元素匹配'?markdownElementGroups([group])[0]:group):groups;
    const states=resultCategoryStates(this.getSearchSession().settings,this._mode,this._input.value.trim(),countGroups,this._preferredResultCategory||this._resultCategory);
    if(!idle)this._resultCategory=states.find(category=>category.selected)?.id||this._resultCategory;
    if(this._temporaryInput){this._temporaryInput.checked=!!this._temporarySearchOptions;this._temporaryInput.disabled=!!this._sourceSaving;}
    this._temporaryTrack?.toggleClass('is-enabled',!!this._temporarySearchOptions);
    const menuChoices:MenuChoice[]=[];
    for(const category of categories){
      const option=sourceOption(category.id);
      const enabled=option?this[option.field]:true;
      const state=states.find(value=>value.id===category.id);
      const count=state?.count||0;
      const selected=!idle&&(category.id===this._resultCategory||this._mode==='web');
      const disabled=!!this._sourceModeSaving||!idle&&(!enabled||!!state?.disabled);
      const title=idle?(option?`${enabled?'关闭':'开启'}${category.label}${this._temporarySearchOptions?'（临时）':'（自动保存）'}`:category.id==='files'?'文件名搜索始终开启':'互联网来源请在搜索选项中配置'):`${category.label}，${count} 项结果`;
      menuChoices.push({id:category.id,label:category.label,icon:category.icon,checked:idle?enabled:undefined,disabled:disabled||idle&&!option,keepOpen:idle,onSelect:()=>{
        if(idle&&option)void this._setSourceEnabled(option.key,!this[option.field]);
        else{this._resultCategory=category.id;this._preferredResultCategory=category.id;this._resultCategoryChosen=true;this._renderDropdown(this._lastGroups||[]);if(this._mode==='global'&&category.id==='web'){const query=this._input.value.trim();if(query)void this._doSearch(query);}}
      }});
      const button=el.createEl('button',{cls:'primecore-result-tab',attr:{type:'button','data-category':category.id,'data-enabled':String(enabled),title,'aria-label':title}});
      button.draggable=true;
      button.addEventListener('dragstart',event=>{event.stopPropagation();el.addClass('is-reordering');if(event.dataTransfer){event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',category.id);}});
      button.addEventListener('dragenter',event=>{event.stopPropagation();event.preventDefault();});
      button.addEventListener('dragover',event=>{event.stopPropagation();event.preventDefault();if(event.dataTransfer)event.dataTransfer.dropEffect='move';});
      button.addEventListener('dragend',()=>el.removeClass('is-reordering'));
      button.addEventListener('drop',event=>{event.stopPropagation();event.preventDefault();const from=event.dataTransfer?.getData('text/plain');if(from)this._reorderSources(from,category.id);});
      button.disabled=disabled;
      if(idle)button.setAttribute('aria-pressed',String(enabled));
      else{button.setAttribute('role','tab');button.setAttribute('aria-selected',String(selected));button.setAttribute('aria-disabled',String(disabled));button.tabIndex=selected?0:-1;button.setAttribute('aria-controls',this._dropdownInner.id);}
      this._setIcon(button.createSpan({cls:'primecore-result-tab-icon',attr:{'aria-hidden':'true'}}),category.icon,14);
      button.createSpan({cls:'primecore-result-tab-label',text:category.label});
      if(!idle)button.createSpan({cls:'primecore-result-tab-count',text:String(count)});
      this._listen(button,'mouseenter',()=>showElementHint(button));
      this._listen(button,'focus',()=>showElementHint(button));
      this._listen(button,'mousedown',event=>event.stopPropagation());
      this._listen(button,'click',event=>{
        event.stopPropagation();if(button.disabled)return;
        if(idle){
          if(!option)return;
          const focused=el.ownerDocument.activeElement===button;
          void this._setSourceEnabled(option.key,!this[option.field]).then(()=>{if(focused)Array.from(el.querySelectorAll<HTMLButtonElement>('button')).find(control=>control.dataset.category===category.id)?.focus();});
          return;
        }
        this._resultCategory=category.id;this._preferredResultCategory=category.id;this._resultCategoryChosen=true;this._activeIdx=-1;this._renderDropdown(this._lastGroups||[]);if(this._mode==='global'&&category.id==='web'){const query=this._input.value.trim();if(query)void this._doSearch(query);}
      });
      this._listen(button,'keydown',event=>{
        if(event.altKey&&['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();const index=categories.findIndex(value=>value.id===category.id),target=categories[index+(event.key==='ArrowLeft'?-1:1)];if(target)this._reorderSources(category.id,target.id);return;}
        if(idle||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
        event.preventDefault();event.stopPropagation();
        const tabs=Array.from(el.querySelectorAll<HTMLButtonElement>('[role=tab]:not(:disabled)'));if(!tabs.length)return;
        const index=tabs.indexOf(button),next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
        tabs[next].click();this._barLeft.querySelector<HTMLButtonElement>('[aria-selected=true]')?.focus();
      });
    }
    const menuParent=el.createDiv({cls:idle?'primecore-source-menu-slot':'primecore-category-menu-slot'});
    const menu=this._createChoiceMenu(menuParent,idle?'定制搜索种类':categories.find(category=>category.id===this._resultCategory)?.label||'搜索种类',(from,to)=>this._reorderSources(from,to));
    menu.setChoices(menuChoices);if(idle)this._sourceMenu=menu;else this._categoryMenu=menu;
    el.scrollLeft=previousScroll;
    if(!idle){
      this._dropdownInner.setAttribute('aria-label',categories.find(category=>category.id===this._resultCategory)?.label||'搜索结果');
      const selected=el.querySelector<HTMLButtonElement>('[aria-selected=true]');
      if(selected){const rail=el.getBoundingClientRect(),tab=selected.getBoundingClientRect();if(tab.left<rail.left)el.scrollLeft-=rail.left-tab.left;else if(tab.right>rail.right)el.scrollLeft+=tab.right-rail.right;}
    }
    if(previousFocus)Array.from(el.querySelectorAll<HTMLButtonElement>('button')).find(button=>button.dataset.category===previousFocus&&!button.disabled)?.focus();
  }
  _reorderSources(from:string,to:string):void {
    const order=[...this.cfg.sourceOrder],index=order.indexOf(from as import('../types.ts').ResultCategory),target=order.indexOf(to as import('../types.ts').ResultCategory);
    if(index<0||target<0||index===target)return;
    order.splice(target,0,...order.splice(index,1));this.cfg.sourceOrder=order;
    // Move controls in place; leave the multi-select open. / 原位移动控件，保留多选菜单。
    const sync=()=>{
      const slot=this._barLeft.querySelector('.primecore-source-menu-slot,.primecore-category-menu-slot');
      for(const id of this.cfg.sourceOrder){const button=Array.from(this._barLeft.querySelectorAll<HTMLButtonElement>('[data-category]')).find(control=>control.dataset.category===id);if(button)this._barLeft.insertBefore(button,slot);}
      this._sourceMenu?.reorderChoices(this.cfg.sourceOrder);this._categoryMenu?.reorderChoices(this.cfg.sourceOrder);
    };sync();
    void this.plugin.updateSetting('sourceOrder',order,false).catch(error=>{this.cfg.sourceOrder=[...this.plugin.settings.sourceOrder];sync();this._log('error','搜索种类顺序保存失败',error);});
  }
  _visibleResultGroups(groups: SearchGroup[]): SearchGroup[] {return this._mode==='web'?groups:filterResultGroups(groups,this._resultCategory);}
};
