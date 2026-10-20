import type {SearchSession, SearchGroup, SearchSettings} from '../types.ts';
import type {SearchBarCtor} from './search-bar-host.ts';
import {resultCategoryStates,filterResultGroups} from '../search/result-categories.ts';
import {clearTimer} from '../shared/timers.ts';

const SESSION_FIELDS={_contentSearch:'vaultContentSearch',_searchTags:'searchTags',_searchWikiLinks:'searchWikiLinks',
  _searchMdLinks:'searchMdLinks',_searchBookmarks:'searchBookmarks',_searchProperties:'searchProperties',_searchCommands:'searchCommands',
  _searchNonMarkdown:'searchNonMarkdown',_extendedContext:'extendedContext',_selectedPreset:'defaultPreset',
  _limitContentResults:'limitContentResults',_vaultSortMode:'vaultSortMode',_activeEngineId:'activeEngineId'} as const;

export const withResultPresentation = <T extends SearchBarCtor>(Base: T) => class extends Base {
  getSearchSession():SearchSession {
    const settings=structuredClone(this.cfg);
    for(const [field,key] of Object.entries(SESSION_FIELDS))Reflect.set(settings,key,(this as unknown as Record<string, unknown>)[field]);
    return {query:this._input?.value.trim()||'',mode:this._mode,category:this._resultCategory,quickExcludedPaths:[...this._quickExcludedPaths||[]],temporaryFilter:this._temporaryFilter?structuredClone(this._temporaryFilter):undefined,settings};
  }
  async applySearchSession(session:SearchSession) {
    ++this._historyVer;++this._vaultSearchVer;++this._webSearchVer;
    clearTimer(this._debounceTimer);this._debounceTimer=null;
    this._quickFilterMenu?.close();this._quickExcludedPaths=[...session.quickExcludedPaths||[]];
    this._resultToolView='results';this._toolListEditor?.dispose();
    this._temporaryFilter=session.temporaryFilter?structuredClone(session.temporaryFilter):null;
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
  _renderResultCategories() {
    const el:HTMLElement=this._barLeft;
    const restoreFocus=el.contains(el.ownerDocument.activeElement);
    el.empty();el.addClass('primecore-result-tabs');el.setAttribute('role','tablist');el.setAttribute('aria-label','搜索结果分类');
    const groups:{title?:string;items:unknown[]}[]=this._lastGroups||[];
    const categories=resultCategoryStates(this.getSearchSession().settings,this._mode,this._input.value.trim(),groups,this._preferredResultCategory||this._resultCategory);
    this._resultCategory=categories.find(category=>category.selected)?.id||this._resultCategory;
    for(const category of categories) {
      const active=category.selected;
      const button=el.createEl('button',{cls:'primecore-result-tab',attr:{role:'tab','aria-selected':String(active),'aria-disabled':String(category.disabled),'data-category':category.id,'aria-label':`${category.label}，${category.count} 项结果`}});
      button.disabled=category.disabled;
      button.tabIndex=active?0:-1;
      button.setAttribute('aria-controls',this._dropdownInner.id);
      this._setIcon(button.createSpan({cls:'primecore-result-tab-icon'}),category.icon,14);button.createSpan({cls:'primecore-result-tab-label',text:category.label});
      button.createSpan({cls:'primecore-result-tab-count',text:String(category.count)});
      this._listen(button,'mousedown',event=>event.preventDefault());
      const select=()=>{if(button.disabled)return;this._resultCategory=category.id;this._preferredResultCategory=category.id;this._resultCategoryChosen=true;this._activeIdx=-1;this._renderDropdown(this._lastGroups||[]);};
      const handler=this._makeTouchHandler(event=>{event.stopPropagation();select();});
      this._listen(button,'touchstart',handler.onTouchStart,{passive:true});
      this._listen(button,'touchend',event=>{event.stopPropagation();handler.onTouchEnd(event);});
      this._listen(button,'click',event=>{event.stopPropagation();select();});
      this._listen(button,'keydown',event=>{
        if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
        event.preventDefault();event.stopPropagation();
        const tabs=Array.from(el.querySelectorAll<HTMLButtonElement>('[role=tab]:not(:disabled)'));
        if(!tabs.length)return;
        const index=tabs.indexOf(button);
        const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
        tabs[next].click();this._barLeft.querySelector<HTMLButtonElement>('[aria-selected=true]')?.focus();
      });
    }
    if(!categories.length) {el.removeAttribute('role');el.createSpan({text:'搜索结果'});}
    this._dropdownInner.setAttribute('aria-label',categories.find(c=>c.id===this._resultCategory)?.label||'搜索结果');
    if(restoreFocus)el.querySelector<HTMLButtonElement>('[aria-selected=true]')?.focus();
  }
  _visibleResultGroups(groups: SearchGroup[]): SearchGroup[] {return this._mode==='web'?groups:filterResultGroups(groups,this._resultCategory);}
};
