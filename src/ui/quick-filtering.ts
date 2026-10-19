import {ActionButton} from '../settings/controls.ts';
import {QuickExclusionMenu} from './quick-exclusion-menu.ts';
import {toggleExclusion,hasExclusion,type ExclusionTarget} from '../search/quick-exclusions.ts';

export const withQuickFiltering=Base=>class extends Base {
  _addQuickFilterButton(parent:HTMLElement,path?:string) {
    const button=new ActionButton(parent,{icon:'list-filter',label:'多级排除',onClick:event=>{event.stopPropagation();this._openQuickExclusions(button.buttonEl,path);}});
    this._listen(button.buttonEl,'mousedown',event=>{event.stopPropagation();event.preventDefault();});
    this._listen(button.buttonEl,'touchstart',event=>event.stopPropagation(),{passive:true});
    this._listen(button.buttonEl,'touchend',event=>event.stopPropagation(),{passive:true});
    return button;
  }
  _openQuickExclusions(anchor:HTMLElement,path?:string) {
    this._quickFilterMenu?.close();
    const context=path||this.app.workspace.getActiveFile()?.path||this._lastGroups?.flatMap(g=>g.items).find(item=>item.path)?.path||'';
    const menu=new QuickExclusionMenu({anchor,path:context,activePreset:this._selectedPreset,presets:()=>this.plugin.settings.searchPresets,
      rules:(mode,name)=>mode==='temporary'?this._quickExcludedPaths:this.plugin.settings.searchPresets.find(p=>p.name===name)?.excludeFolders||[],
      toggle:async(target,mode,name)=>{
        if(mode==='temporary')this._quickExcludedPaths=toggleExclusion(this._quickExcludedPaths,target.rule);
        else {
          const presets=this.plugin.settings.searchPresets.map(p=>p.name===name?{...p,excludeFolders:toggleExclusion(p.excludeFolders,target.rule)}:p);
          const selected=presets.find(p=>p.name===name);
          if(!selected||selected.mode!=='黑名单')throw new Error('请选择黑名单预设');
          await this.plugin.updateSettings({searchPresets:presets},false);
          for(const {component} of this.plugin.components.values()){component.cfg.searchPresets=structuredClone(presets);component._rebuildPresetOptions?.();}
          this._quickExcludedPaths=hasExclusion(selected.excludeFolders,target.rule)?[...new Set([...this._quickExcludedPaths,target.rule])]:this._quickExcludedPaths.filter(p=>p!==target.rule);
        }
        this._groupPages.clear();const q=this._input.value.trim();if(q)this._doSearch(q);
      },
      create:(target:ExclusionTarget)=>{
        this._closePanel({restoreDropdown:false});
        this._filterDraft={mode:'黑名单',paths:[...new Set([...this._quickExcludedPaths,target.rule])]};
        this._openPresetNameView();
      },
      edit:()=>{this._closePanel({restoreDropdown:false});this._openFilterView();},
      onClose:()=>{if(this._quickFilterMenu===menu)this._quickFilterMenu=null;}
    });
    this._quickFilterMenu=menu;menu.open();
  }
};
