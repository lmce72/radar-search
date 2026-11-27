import type {Modal} from 'obsidian';

/** Keep plugin modals above the floating search layers (results, menus, hints).
 *  让插件弹窗位于搜索浮层（结果、菜单、提示）之上，避免被下拉遮挡。 */
export function raiseModalAboveLayers(modal:Modal):void {
  modal.containerEl.addClass('primecore-modal-above-layers');
  // Inline value wins over the host's modal stacking style. / 内联值优先于宿主的弹窗层级。
  modal.containerEl.setCssStyles({zIndex:'1000002'});
}
