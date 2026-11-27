import {matchSearchShortcut,type ShortcutAction} from '../shared/search-shortcuts.ts';
import {localDateKey} from '../history/date-range.ts';
import {ownsSearchTarget} from './search-layers.ts';
import type {SearchBarCtor} from './search-bar-host.ts';

/** Bindings select actions; UI methods remain the single implementation of each feature.
 * 绑定仅分发动作，功能仍由现有界面方法实现，不另写一套搜索行为。 */
export const withShortcuts=<T extends SearchBarCtor>(Base:T)=>class extends Base {
  _dispatchShortcut(event:KeyboardEvent):boolean {
    if(event.defaultPrevented||event.isComposing||this._disposed||this._cleanedUp)return false;
    const active=this.container.ownerDocument.activeElement;
    if(!active||!ownsSearchTarget(this,active)||Array.from(this._popupRoots).some(root=>!root.hidden))return false;
    const inInput=active===this._input;
    if(!inInput&&(active.matches('input,textarea,select')||(active as HTMLElement).isContentEditable))return false;
    const action=matchSearchShortcut(event,this.cfg.searchShortcuts,inInput);
    if(!action||!this._runShortcutAction(action))return false;
    event.preventDefault();event.stopPropagation();return true;
  }
  _moveResultSelection(direction:number):boolean {
    if(this._resultToolView!=='results'||this._dropdown.style.display==='none'||!this._itemEls.length)return false;
    const index=this._activeIdx<0?(direction>0?0:this._itemEls.length-1):(this._activeIdx+direction+this._itemEls.length)%this._itemEls.length;
    this._setActive(index);
    if(index===0)this._dropdownInner.scrollTop=0;
    else (this._itemEls[index]?.firstElementChild||this._itemEls[index])?.scrollIntoView({block:'nearest'});
    return true;
  }
  _runShortcutAction(action:ShortcutAction):boolean {
    const results=this._resultToolView==='results'&&this._resultKind==='results'&&this._dropdown.style.display!=='none';
    if(action.startsWith('category.')){
      if(!results)return false;
      const tabs=Array.from(this._barLeft.querySelectorAll<HTMLButtonElement>('[role=tab]:not(:disabled)'));
      if(!tabs.length)return false;
      if(action==='category.next'||action==='category.previous'){
        const index=tabs.findIndex(tab=>tab.getAttribute('aria-selected')==='true');
        tabs[(index+(action==='category.next'?1:-1)+tabs.length)%tabs.length].click();return true;
      }
      const target=tabs.find(tab=>tab.dataset.category===action.slice('category.'.length));if(!target)return false;target.click();return true;
    }
    if(action==='result.next'||action==='result.previous')return this._moveResultSelection(action==='result.next'?1:-1);
    if(action==='result.activate'){
      if(this._resultToolView!=='results'||this._dropdown.style.display==='none'||!this._itemEls[this._activeIdx])return false;
      this._itemEls[this._activeIdx].click();return true;
    }
    if(action==='page.previous'||action==='page.next'){
      if(this._resultToolView!=='results'||this._dropdown.style.display==='none')return false;
      let node=this._itemEls[this._activeIdx]?.nextElementSibling;
      while(node&&!node.hasClass('primecore-pagination'))node=node.nextElementSibling;
      const pager=node||this._dropdownInner.querySelector('.primecore-pagination');
      const button=pager?.querySelector<HTMLButtonElement>(action==='page.next'?'button[aria-label="下一页"]':'button[aria-label="上一页"]');
      if(!button||button.disabled)return false;button.click();return true;
    }
    if(action==='content.toggle'){if(!results||!this._contentHitControls.length)return false;this._toggleAllContentHits();return true;}
    if(action==='filter.open'||action==='sort.open'){
      if(!results||this._mode==='web')return false;
      if(action==='filter.open')this._openFilterView();else this._openSortView();return true;
    }
    if(action==='options.toggle'){this._contentToggleBtn.click();return true;}
    if(action==='tool.back'){if(this._resultToolView==='results')return false;this._returnToResults();return true;}
    if(action==='mode.vault'||action==='mode.global'||action==='mode.web'){
      if(this._resultToolView!=='results')return false;
      this._selectMode(action==='mode.vault'?'vault':action==='mode.global'?'global':'web');return true;
    }
    if(action==='records.history'||action==='records.recent'){
      if(this._input.value.trim()||this._resultToolView!=='results'||action==='records.recent'&&!this.cfg.recentFilesEnabled)return false;
      this._idleView=action==='records.history'?'history':'recent';void this._showHistory(localDateKey());return true;
    }
    if(action==='search.execute'){if(!this._input.value.trim()||this._resultToolView!=='results')return false;this._executeSearch();return true;}
    if(action==='query.clear'){if(!this._input.value||this._resultToolView!=='results')return false;this._clearSearchInput();return true;}
    if(action==='view.page'){if(!results)return false;this._openResultsPage();return true;}
    return false;
  }
};
