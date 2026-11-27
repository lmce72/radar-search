import {ActionButton} from '../settings/controls.ts';
import type {SearchBarCtor} from './search-bar-host.ts';
/** All entry points share one filter editor. / 所有入口共用同一过滤器。 */
export const withQuickFiltering = <T extends SearchBarCtor>(Base:T)=>class extends Base {
  _addQuickFilterButton(parent:HTMLElement,path?:string) {
    const button=new ActionButton(parent,{icon:'list-filter',label:'多级排除',onClick:event=>{event.stopPropagation();this._openFilterView(false,path);}});
    this._listen(button.buttonEl,'mousedown',event=>{event.stopPropagation();event.preventDefault();});
    return button;
  }
};
