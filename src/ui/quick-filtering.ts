import {ActionButton} from '../settings/controls.ts';
import type {SearchBarCtor} from './search-bar-host.ts';
import {QuickExclusionMenu} from './quick-exclusion-menu.ts';
import {toggleExclusion,type ExclusionTarget} from '../search/quick-exclusions.ts';
/** All entry points share one filter editor. / 所有入口共用同一过滤器。 */
export const withQuickFiltering = <T extends SearchBarCtor>(Base:T)=>class extends Base {
  _addQuickFilterButton(parent:HTMLElement,path?:string) {
    const button=new ActionButton(parent,{icon:'list-filter',label:'多级排除'});
    button.onClick(event=>{event.stopPropagation();this._openQuickExclusions(button.buttonEl,path);});
    this._listen(button.buttonEl,'mousedown',event=>{event.stopPropagation();event.preventDefault();});
    return button;
  }

  _openQuickExclusions(anchor:HTMLElement,path?:string):void {
    this._quickExclusionMenu?.close();
    const menu=this.addChild(new QuickExclusionMenu({
      anchor,path:path||'',
      rules:()=>this._quickExcludedPaths,
      toggle:async (target:ExclusionTarget)=>{
        this._quickExcludedPaths=toggleExclusion(this._quickExcludedPaths,target.rule);
        this._groupPages.clear();
        this._rerunResults();
      },
      edit:()=>this._openFilterView(false,path),
      onClose:()=>{
        if(menu.el)this._popupRoots.delete(menu.el);
        if(this._quickExclusionMenu===menu)this._quickExclusionMenu=null;
      }
    }));
    this._quickExclusionMenu=menu;
    this.addChild(menu);
    menu.open();
    if(menu.el)this._popupRoots.add(menu.el);
  }
};
