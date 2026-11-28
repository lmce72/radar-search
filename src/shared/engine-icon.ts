/** Resolve an engine favicon from its search URL origin; fall back to the host icon.
 *  从搜索引擎 URL 的源取 favicon；失败时回退到宿主图标。 */
export function engineFaviconUrl(engine:{url?:unknown}):string|null {
  try {
    const raw=typeof engine.url==='string'?engine.url:'';
    const url=new URL(raw.replace('{q}',''));
    return `${url.origin}/favicon.ico`;
  } catch {
    return null;
  }
}

export function applyEngineFavicon(
  target:HTMLElement,
  engine:{url?:unknown}|null|undefined,
  size:number,
  fallback:()=>void,
):void {
  target.empty();
  const src=engine?engineFaviconUrl(engine):null;
  if(!src){fallback();return;}
  const img=target.createEl('img',{cls:'primecore-engine-favicon',attr:{src,alt:'','aria-hidden':'true',referrerpolicy:'no-referrer'}});
  img.setCssStyles({inlineSize:`${size}px`,blockSize:`${size}px`,borderRadius:'3px',objectFit:'contain',display:'block'});
  img.addEventListener('error',()=>{target.empty();fallback();},{once:true});
}
