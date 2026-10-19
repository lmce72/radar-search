export interface ViewportBounds {left:number;top:number;width:number;height:number}
export interface AnchorBounds {left:number;top:number;bottom:number;width:number}
/** Reserve visible bottom app controls without subtracting the keyboard twice. */
export function unobstructedViewport(viewport:ViewportBounds,controls:ReadonlyArray<{left:number;right:number;top:number;bottom:number}>):ViewportBounds {
  const bottom=viewport.top+viewport.height;
  const edge=controls.reduce((edge,rect)=>rect.right>viewport.left&&rect.left<viewport.left+viewport.width&&rect.bottom>viewport.top&&rect.top>=viewport.top+viewport.height/2&&rect.top<bottom?Math.min(edge,rect.top):edge,bottom);
  return {...viewport,height:Math.max(0,edge-viewport.top)};
}
export function viewportBounds(win:Window):ViewportBounds {
  const visual=win.visualViewport;
  const bounds={left:visual?.offsetLeft||0,top:visual?.offsetTop||0,width:visual?.width||win.innerWidth,height:visual?.height||win.innerHeight};
  const controls=[...win.document.querySelectorAll<HTMLElement>('.mobile-navbar, .mobile-toolbar')].filter(el=>{
    const style=win.getComputedStyle(el);return style.display!=='none'&&style.visibility!=='hidden'&&Number(style.opacity)!==0;
  }).map(el=>el.getBoundingClientRect()).filter(rect=>rect.width>0&&rect.height>0);
  const safeBottom=parseFloat(win.getComputedStyle(win.document.documentElement).getPropertyValue('--safe-area-inset-bottom'))||0;
  return unobstructedViewport({...bounds,height:Math.max(0,bounds.height-safeBottom)},controls);
}
/** All sizes use the anchor document's CSS pixels, including zoom/keyboard viewport offsets. */
export function floatingGeometry(anchor:AnchorBounds,viewport:ViewportBounds,desiredWidth:number,naturalHeight:number,limit=480) {
  const margin=Math.min(8,viewport.width/4,viewport.height/4),gap=6;
  const leftEdge=viewport.left+margin,rightEdge=viewport.left+viewport.width-margin;
  const topEdge=viewport.top+margin,bottomEdge=viewport.top+viewport.height-margin;
  const width=Math.max(0,Math.min(desiredWidth,rightEdge-leftEdge));
  const left=Math.max(leftEdge,Math.min(anchor.left,rightEdge-width));
  const below=Math.max(0,bottomEdge-Math.max(topEdge,anchor.bottom+gap));
  const above=Math.max(0,Math.min(bottomEdge,anchor.top-gap)-topEdge);
  const upwards=below<Math.min(160,naturalHeight)&&above>below;
  const budget=Math.max(0,Math.min(limit,upwards?above:below));
  const height=Math.min(Math.max(0,naturalHeight),budget);
  const maxHeight=upwards?height:budget;
  const top=upwards?Math.max(topEdge,Math.min(bottomEdge,anchor.top-gap)-height):Math.min(bottomEdge,Math.max(topEdge,anchor.bottom+gap));
  return {left,top,width,maxHeight,upwards};
}
export function positionFloatingElement(el:HTMLElement,anchor:AnchorBounds,desiredWidth:number,naturalHeight:number,limit=480) {
  const geometry=floatingGeometry(anchor,viewportBounds(el.ownerDocument.defaultView),desiredWidth,naturalHeight,limit);
  el.setCssStyles({left:geometry.left+'px',top:geometry.top+'px',width:geometry.width+'px',maxHeight:geometry.maxHeight+'px',minWidth:'0',boxSizing:'border-box'});
  return geometry;
}
export function positionBottomSheet(el:HTMLElement) {
  const win=el.ownerDocument.defaultView,bounds=viewportBounds(win);
  el.setCssStyles({left:bounds.left+12+'px',right:Math.max(0,win.innerWidth-bounds.left-bounds.width)+12+'px',bottom:Math.max(0,win.innerHeight-bounds.top-bounds.height)+16+'px',maxHeight:Math.max(0,bounds.height*.7)+'px',boxSizing:'border-box'});
}
