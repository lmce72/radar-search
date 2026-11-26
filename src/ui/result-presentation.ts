import {SPECIAL_SEARCH_OPTIONS,sourceOption,type SpecialSearchKey} from '../search/special-search-options.ts';
import {ALL_MARKDOWN_ELEMENTS,type MarkdownElementKind} from '../search/markdown-elements.ts';
import type {SearchSession, SearchGroup, SearchSettings} from '../types.ts';
import type {SearchBarCtor} from './search-bar-host.ts';
import {RESULT_CATEGORIES,resultCategoryStates,filterResultGroups} from '../search/result-categories.ts';
import {clearTimer} from '../shared/timers.ts';

const SESSION_FIELDS={_searchMarkdown:'searchMarkdown',_contentSearch:'vaultContentSearch',_searchTags:'searchTags',_searchWikiLinks:'searchWikiLinks',
  _searchMdLinks:'searchMdLinks',_searchBookmarks:'searchBookmarks',_searchProperties:'searchProperties',_searchCommands:'searchCommands',
  _searchNonMarkdown:'searchNonMarkdown',_extendedContext:'extendedContext',_selectedPreset:'defaultPreset',
  _limitContentResults:'limitContentResults',_vaultSortMode:'vaultSortMode',_activeEngineId:'activeEngineId'} as const;

export const withResultPresentation = <T extends SearchBarCtor>(Base: T) => class extends Base {
  getSearchSession():SearchSession {
    const settings=structuredClone(this.cfg);
    for(const [field,key] of Object.entries(SESSION_FIELDS))Reflect.set(settings,key,(this as unknown as Record<string, unknown>)[field]);
    return {...(this._temporarySearchOptions?{temporaryOptions:true}:{}),query:this._input?.value.trim()||'',mode:this._mode,category:this._resultCategory,quickExcludedPaths:[...this._quickExcludedPaths||[]],temporaryFilter:this._temporaryFilter?structuredClone(this._temporaryFilter):undefined,settings};
  }
  async applySearchSession(session:SearchSession) {
    ++this._historyVer;++this._vaultSearchVer;++this._webSearchVer;
    clearTimer(this._debounceTimer);this._debounceTimer=null;
    this._quickFilterMenu?.close();this._quickExcludedPaths=[...session.quickExcludedPaths||[]];
    this._resultToolView='results';this._toolListEditor?.dispose();
    this._temporaryFilter=session.temporaryFilter?structuredClone(session.temporaryFilter):null;
    this._temporarySearchOptions=!!session.temporaryOptions;
    this.cfg=structuredClone(session.settings);
    for(const [field,key] of Object.entries(SESSION_FIELDS))(this as unknown as Record<string, unknown>)[field]=this.cfg[key as keyof SearchSettings];
    this._groupPages.clear();this._lastGroups=null;
    this._input.value=session.query;this._syncClearBtn();
    this._selectMode(session.mode,false);
    this._resultCategory=session.category;this._preferredResultCategory=session.category;this._resultCategoryChosen=true;
    if(session.query)await this._doSearch(session.query);
  }
  _syncSearchAction() {
    this._goBtn.setCssStyles({display: this._mode==='web'?'flex':'none'});
    if(this._panelQuickFilterButton !== null && this._panelQuickFilterButton !== undefined)this._panelQuickFilterButton.buttonEl.setCssStyles({display: this._mode==='web'?'none':'inline-flex'});
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
  _setTemporarySearchOptions(value:boolean):void {
    this._temporarySearchOptions=value;
    if(!value){
      for(const option of SPECIAL_SEARCH_OPTIONS){this[option.field]=this.plugin.settings[option.key];this.cfg[option.key]=this.plugin.settings[option.key];}
      this.cfg.markdownElementTypes=[...this.plugin.settings.markdownElementTypes];
    }
    this._refreshSourceResults();
  }
  async _setSourceEnabled(key:SpecialSearchKey,value:boolean):Promise<void> {
    if(this._sourceSaving)return;
    const option=SPECIAL_SEARCH_OPTIONS.find(item=>item.key===key);if(!option)return;
    const previous=this[option.field],previousCfg=this.cfg[key];
    this._sourceSaving=true;this[option.field]=value;this.cfg[key]=value;
    if(this._barLeft)this._renderResultCategories();
    try{
      if(!this._temporarySearchOptions){
        await this.plugin.updateSetting(key,value,false);
        for(const {component} of this.plugin.components.values())if(component.container!==this.container&&!component._temporarySearchOptions){
          component[option.field]=value;component.cfg[key]=value;component._refreshSourceResults();
        }
      }
    }catch(error){this[option.field]=previous;this.cfg[key]=previousCfg;this._log('error','搜索来源保存失败',error);}
    finally{this._sourceSaving=false;this._refreshSourceResults();}
  }
  async _toggleMarkdownElement(kind:MarkdownElementKind):Promise<MarkdownElementKind[]> {
    if(!this._temporarySearchOptions)return this.plugin.toggleMarkdownElement(kind);
    const current=this.cfg.markdownElementTypes;
    const next=ALL_MARKDOWN_ELEMENTS.filter(type=>type===kind?!current.includes(type):current.includes(type));
    this.cfg.markdownElementTypes=next;this._groupPages.clear();
    const query=this._input.value.trim();if(query)await this._doSearch(query);return next;
  }
  _renderResultCategories() {
    const el:HTMLElement=this._barLeft;if(!el)return;
    const previousScroll=el.scrollLeft;
    const previousFocus=el.contains(el.ownerDocument.activeElement)?el.ownerDocument.activeElement?.getAttribute('data-category'):null;
    const idle=this._resultKind==='history'||!this._input.value.trim();
    el.empty();el.addClass('primecore-result-tabs');el.toggleClass('is-source-configuration',idle);
    el.setAttribute('role',idle?'group':'tablist');el.setAttribute('aria-label',idle?'搜索来源':'搜索结果分类');
    const groups=this._lastGroups||[];
    const states=resultCategoryStates(this.getSearchSession().settings,this._mode,this._input.value.trim(),groups,this._preferredResultCategory||this._resultCategory);
    if(!idle)this._resultCategory=states.find(category=>category.selected)?.id||this._resultCategory;
    const categories=RESULT_CATEGORIES.filter(category=>this._mode==='web'?category.id==='web':category.id!=='web'||this._mode==='global'&&this.cfg.engines.some(engine=>engine.enabled));
    if(this._temporaryControl)this._temporaryControl.setCssStyles({display:this._mode==='web'?'none':'inline-flex'});
    if(this._temporaryInput){this._temporaryInput.checked=!!this._temporarySearchOptions;this._temporaryInput.disabled=!!this._sourceSaving;}
    this._temporaryTrack?.toggleClass('is-enabled',!!this._temporarySearchOptions);
    for(const category of categories){
      const option=sourceOption(category.id);
      const enabled=option?this[option.field]:true;
      const state=states.find(value=>value.id===category.id);
      const count=state?.count||0;
      const selected=!idle&&(category.id===this._resultCategory||this._mode==='web');
      const disabled=!!this._sourceSaving||(idle?!option:!enabled||!!state?.disabled);
      const title=idle?(option?`${enabled?'关闭':'开启'}${category.label}${this._temporarySearchOptions?'（临时）':'（自动保存）'}`:'文件名搜索始终开启'):`${category.label}，${count} 项结果`;
      const button=el.createEl('button',{cls:'primecore-result-tab',attr:{type:'button','data-category':category.id,'data-enabled':String(enabled),title,'aria-label':title}});
      button.disabled=disabled;
      if(idle)button.setAttribute('aria-pressed',String(enabled));
      else{button.setAttribute('role','tab');button.setAttribute('aria-selected',String(selected));button.setAttribute('aria-disabled',String(disabled));button.tabIndex=selected?0:-1;button.setAttribute('aria-controls',this._dropdownInner.id);}
      this._setIcon(button.createSpan({cls:'primecore-result-tab-icon',attr:{'aria-hidden':'true'}}),category.icon,14);
      button.createSpan({cls:'primecore-result-tab-label',text:category.label});
      if(!idle)button.createSpan({cls:'primecore-result-tab-count',text:String(count)});
      this._listen(button,'mousedown',event=>event.preventDefault());
      this._listen(button,'click',event=>{
        event.stopPropagation();if(button.disabled)return;
        if(idle&&option){
          const focused=el.ownerDocument.activeElement===button;
          void this._setSourceEnabled(option.key,!this[option.field]).then(()=>{if(focused)Array.from(el.querySelectorAll<HTMLButtonElement>('button')).find(control=>control.dataset.category===category.id)?.focus();});
          return;
        }
        this._resultCategory=category.id;this._preferredResultCategory=category.id;this._resultCategoryChosen=true;this._activeIdx=-1;this._renderDropdown(this._lastGroups||[]);
      });
      this._listen(button,'keydown',event=>{
        if(idle||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
        event.preventDefault();event.stopPropagation();
        const tabs=Array.from(el.querySelectorAll<HTMLButtonElement>('[role=tab]:not(:disabled)'));if(!tabs.length)return;
        const index=tabs.indexOf(button),next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
        tabs[next].click();this._barLeft.querySelector<HTMLButtonElement>('[aria-selected=true]')?.focus();
      });
    }
    el.scrollLeft=previousScroll;
    if(!idle){
      this._dropdownInner.setAttribute('aria-label',categories.find(category=>category.id===this._resultCategory)?.label||'搜索结果');
      const selected=el.querySelector<HTMLButtonElement>('[aria-selected=true]');
      if(selected){const rail=el.getBoundingClientRect(),tab=selected.getBoundingClientRect();if(tab.left<rail.left)el.scrollLeft-=rail.left-tab.left;else if(tab.right>rail.right)el.scrollLeft+=tab.right-rail.right;}
    }
    if(previousFocus)Array.from(el.querySelectorAll<HTMLButtonElement>('button')).find(button=>button.dataset.category===previousFocus&&!button.disabled)?.focus();
  }
  _visibleResultGroups(groups: SearchGroup[]): SearchGroup[] {return this._mode==='web'?groups:filterResultGroups(groups,this._resultCategory);}
};
