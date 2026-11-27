const hints=new WeakMap<Document,{button:HTMLElement;hide:()=>void}>();
export function hideElementHint(doc:Document,button?:HTMLElement):boolean {const hint=hints.get(doc);if(!hint||button&&hint.button!==button)return false;hint.hide();return true;}
/** Short, focus-preserving hints with a top-layer enhancement and a fixed fallback.
 * 短标签不移动焦点；支持时进入顶层，否则使用固定定位回退。 */
export function showElementHint(button:HTMLElement):void {
  const doc=button.ownerDocument,win=doc.defaultView;hideElementHint(doc);
  const popup=doc.body.createDiv({cls:'primecore-element-tooltip',text:button.getAttribute('data-hint-label')||button.getAttribute('aria-label')||''});
  if('showPopover' in popup){popup.setAttribute('popover','hint');popup.showPopover();}
  const rect=button.getBoundingClientRect(),box=popup.getBoundingClientRect(),viewport=win.visualViewport;
  const left=viewport?.offsetLeft||0,top=viewport?.offsetTop||0,width=viewport?.width||win.innerWidth;
  // Wide hints align to the anchor's left edge instead of being clamped far away.
  // 宽气泡与锚点左缘对齐，避免居中后被挤到视口边缘。
  const preferred=Math.max(rect.left,rect.left+(rect.width-box.width)/2);
  popup.setCssStyles({left:Math.max(left+6,Math.min(preferred,left+width-box.width-6))+'px',top:(rect.top-box.height-6>=top?rect.top-box.height-6:rect.bottom+6)+'px'});
  let timer:number|undefined;
  const hide=()=>{
    win.clearTimeout(timer);popup.remove();hints.delete(doc);observer.disconnect();
    button.removeEventListener('mouseleave',leave);button.removeEventListener('blur',leave);
    win.removeEventListener('keydown',escape,true);doc.removeEventListener('scroll',hide,true);
  };
  if('showPopover' in popup)popup.addEventListener('toggle',()=>{if(popup.isConnected&&!popup.matches(':popover-open'))hide();});
  const leave=()=>{win.clearTimeout(timer);timer=win.setTimeout(()=>{if(!button.matches(':hover')&&!popup.matches(':hover')&&doc.activeElement!==button)hide();},100);};
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();hide();}};
  const observer=new win.MutationObserver(()=>{if(!button.isConnected)hide();});observer.observe(doc.body,{childList:true,subtree:true});
  button.addEventListener('mouseleave',leave);button.addEventListener('blur',leave);
  popup.addEventListener('mouseenter',()=>win.clearTimeout(timer));popup.addEventListener('mouseleave',leave);
  win.addEventListener('keydown',escape,true);doc.addEventListener('scroll',hide,{capture:true,passive:true});hints.set(doc,{button,hide});
  // The label repeats aria-label, so do not announce the same words twice.
  // 标签与 aria-label 相同，不重复添加描述朗读。
}
