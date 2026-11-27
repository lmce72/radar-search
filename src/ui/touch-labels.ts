import {showElementHint,hideElementHint} from './element-hint.ts';
/** Touch hints share one gesture lifecycle; scrolling cancels the hold.
 * 触控提示共用手势生命周期；滚动即取消长按。 */
export function bindTouchLabels(doc: Document, owns: (element: HTMLElement) => boolean): () => void {
  const win = doc.defaultView;
  let press: {button: HTMLElement; x: number; y: number; id: number; held: boolean} | null = null;
  let timer: number | undefined;
  let suppressed: HTMLElement | null = null;
  let suppressUntil = 0;
  const clear = () => { win.clearTimeout(timer); timer = undefined; };
  const start = (event: TouchEvent) => {
    cancel();
    suppressed = null; suppressUntil = 0;
    const target = event.target as Node | null;
    if (!target?.instanceOf(win.HTMLElement) || event.touches.length !== 1) return;
    const button = target.closest<HTMLElement>('.primecore-hover-action, .primecore-result-tab, .primecore-markdown-filter, .primecore-recent-type');
    if (!button || !owns(button)) return;
    button.addClass('primecore-touch-label');
    if (button.matches(':disabled')) return;
    const touch = event.touches[0];
    press = {button, x: touch.clientX, y: touch.clientY, id: touch.identifier, held: false};
    timer = win.setTimeout(() => {
      if (!press || !button.isConnected) return;
      press.held = true;
      button.addClass('is-label-visible');
      if(button.matches('.primecore-markdown-filter,.primecore-recent-type,.primecore-result-tab'))showElementHint(button);
    }, 300);
  };
  const move = (event: TouchEvent) => {
    const touch = Array.from(event.touches).find(touch => touch.identifier === press?.id);
    if (!touch || !press || Math.hypot(touch.clientX - press.x, touch.clientY - press.y) > 10) {
      cancel();
    }
  };
  const end = (event: TouchEvent) => {
    clear();
    if (press?.held) {
      suppressed = press.button; suppressUntil = Date.now() + 800;
      event.preventDefault(); event.stopImmediatePropagation();
      press.button.removeClass('is-label-visible');
      hideElementHint(doc,press.button);
    }
    press = null;
  };
  // Cancel and disposal release only this gesture's hint. / 取消与卸载只清理当前手势的提示。
  const cancel = () => { clear();if(press){press.button.removeClass('is-label-visible');hideElementHint(doc,press.button);}press = null; };
  const click = (event: MouseEvent) => {
    const target = event.target as Node | null;
    if (Date.now() < suppressUntil && target?.instanceOf(win.Node) && suppressed?.contains(target)) {
      event.preventDefault(); event.stopImmediatePropagation();
    }
  };
  const contextMenu = (event: MouseEvent) => {
    if (press) event.preventDefault();
  };
  doc.addEventListener('touchstart', start, {capture: true, passive: true});
  doc.addEventListener('touchmove', move, {capture: true, passive: true});
  doc.addEventListener('touchend', end, {capture: true, passive: false});
  doc.addEventListener('touchcancel', cancel, true);
  doc.addEventListener('click', click, true);
  doc.addEventListener('contextmenu', contextMenu, true);
  return () => {
    cancel();
    doc.removeEventListener('touchstart', start, true); doc.removeEventListener('touchmove', move, true);
    doc.removeEventListener('touchend', end, true); doc.removeEventListener('touchcancel', cancel, true);
    doc.removeEventListener('click', click, true);
    doc.removeEventListener('contextmenu', contextMenu, true);
  };
}
