import type {SearchBarFields} from './search-bar-host.ts';

type LayerHost=Pick<SearchBarFields,'container'|'_wrap'|'_dropdown'|'_scopeMenu'|'_vaultSearchPanel'|'_panelMask'|'_sourceEditor'|'_quickFilterMenu'|'_idleMenuEl'>;
/** Shared ownership for embedded and floating outside-press guards.
 * 嵌入栏与浮动搜索共用浮层归属，菜单点击不会被误判为外部操作。 */
export function ownsSearchTarget(host:LayerHost,target:Node):boolean {
  return [host.container,host._wrap,host._dropdown,host._scopeMenu,host._vaultSearchPanel,
    host._panelMask,host._sourceEditor,host._quickFilterMenu?.el,host._idleMenuEl].some(layer=>layer?.contains(target));
}
