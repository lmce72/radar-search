import {test,expect,spyOn} from 'bun:test';
import {searchbarFixture} from '../helpers/searchbar-fixture.ts';

const settle=async()=>{for(let at=0;at<30;at++)await Promise.resolve();};
const delay=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
test('refocusing or clicking a nonempty query restores search results instead of an idle no-op',async()=>{
 const f=await searchbarFixture();try{
  f.bar._input.value='needle';await f.bar._doSearch('needle');f.bar._hideDropdown();
  f.bar._input.focus();await settle();expect(f.bar._resultKind).toBe('results');expect(f.bar._dropdown.style.display).toBe('flex');
  f.bar._hideDropdown();f.bar._input.click();await settle();expect(f.bar._dropdown.style.display).toBe('flex');expect(f.errors).toEqual([]);
 }finally{await f.cleanup();}
});

test('removing a nested host releases floating layers instead of leaking an orphan search bar',async()=>{
 const f=await searchbarFixture();try{
  f.container.remove();await delay(200);
  expect(f.bar._disposed).toBe(true);expect(f.env.document.querySelector('[data-sb-float]')).toBeNull();expect(f.plugin.components.size).toBe(0);
 }finally{await f.cleanup();}
});

test('observer tracks reparented hosts and tolerates temporarily detached Markdown views',async()=>{
 const f=await searchbarFixture();try{
  const view=f.app.workspace.getActiveViewOfType().containerEl,host=f.env.document.body.createDiv();host.append(view);view.append(f.container);await delay(20);
  view.remove();await delay(190);expect(f.bar._disposed).toBe(false);expect(f.bar._dropdown.style.display).toBe('none');
  host.append(view);await delay(20);f.bar._input.focus();await settle();expect(f.bar._dropdown.style.display).toBe('flex');
  f.container.remove();await delay(190);expect(f.bar._disposed).toBe(true);expect(f.env.document.querySelector('[data-sb-float]')).toBeNull();
 }finally{await f.cleanup();}
});

test('layout, activation and focus rebind the observer after an asynchronously detached view moves into an existing host',async()=>{
 for(const restore of ['layout','activation','focus'] as const){
  const f=await searchbarFixture();try{
   const view=f.app.workspace.getActiveViewOfType().containerEl,existing=f.env.document.body.createDiv();view.append(f.container);await delay(20);
   view.remove();await delay(180);expect(f.bar._disposed).toBe(false);
   existing.append(view);
   if(restore==='layout')f.emit('layout-change');
   else if(restore==='activation')f.emit('active-leaf-change');
   else f.bar._input.focus();
   await delay(20);f.container.remove();await delay(180);
   expect(f.bar._disposed).toBe(true);expect(f.env.document.querySelector('[data-sb-float]')).toBeNull();
  }finally{await f.cleanup();}
 }
});

test('layout jitter preserves focused records across width changes and dead inputs request recovery',async()=>{
 const f=await searchbarFixture();try{
  f.bar._input.focus();await settle();expect(f.bar._resultKind).toBe('history');
  f.bar._dropdownInner.scrollTop=43;
  Object.defineProperty(f.env.window,'innerWidth',{value:390,configurable:true});f.env.window.dispatchEvent(new f.env.window.Event('resize'));await delay(30);
  expect(f.bar._dropdown.style.display).toBe('flex');expect(f.bar._dropdownInner.scrollTop).toBe(43);
  Object.defineProperty(f.env.window,'innerWidth',{value:1200,configurable:true});f.emit('layout-change');await delay(30);expect(f.bar._dropdown.style.display).toBe('flex');
  f.bar._hideDropdown();f.bar._input.click();await settle();expect(f.bar._dropdown.style.display).toBe('flex');
  const recovery=spyOn(f.plugin,'recoverSearchBars');f.bar._dropdown.remove();f.bar._input.click();expect(recovery).toHaveBeenCalledWith(f.container);
 }finally{await f.cleanup();}
});

test('open panel keeps responsive presentation and mask synchronized when positioning wins the resize race',async()=>{
 const f=await searchbarFixture();try{
  f.bar._contentToggleBtn.click();expect(f.bar._vaultPanelOpen).toBe(true);
  Object.defineProperty(f.env.window,'innerWidth',{value:390,configurable:true});f.bar._repositionFloats();f.env.window.dispatchEvent(new f.env.window.Event('resize'));await delay(30);
  expect(f.bar._bottomSheet).toBe(true);expect(f.bar._panelMask.style.display).toBe('block');
  expect(Number(f.bar._vaultSearchPanel.style.zIndex)).toBeGreaterThan(Number(f.bar._panelMask.style.zIndex));
  const maskZ=f.bar._panelMask.style.zIndex;f.bar._repositionFloats();expect(f.bar._panelMask.style.zIndex).toBe(maskZ);
  Object.defineProperty(f.env.window,'innerWidth',{value:1200,configurable:true});f.bar._repositionFloats();f.env.window.dispatchEvent(new f.env.window.Event('resize'));await delay(30);
  expect(f.bar._bottomSheet).toBe(false);expect(f.bar._panelMask.style.display).toBe('none');expect(f.bar._vaultSearchPanel.style.bottom).toBe('auto');
  f.bar._scopeBtn.click();Object.defineProperty(f.env.window,'innerWidth',{value:390,configurable:true});f.bar._repositionFloats();
  expect(f.bar._panelMask.style.display).toBe('block');Object.defineProperty(f.env.window,'innerWidth',{value:1200,configurable:true});f.bar._repositionFloats();
  expect(f.bar._panelMask.style.display).toBe('none');expect(f.bar._scopeMenu.style.bottom).toBe('auto');
  expect(f.errors).toEqual([]);
 }finally{await f.cleanup();}
});

test('active note restores hidden query results even when tab switching retained input focus',async()=>{
 const f=await searchbarFixture();try{
  f.app.workspace.getActiveViewOfType().containerEl.append(f.container);
  f.bar._input.value='needle';await f.bar._doSearch('needle');f.bar._input.focus();await settle();f.bar._hideDropdown();
  f.emit('active-leaf-change');await settle();expect(f.bar._dropdown.style.display).toBe('flex');expect(f.bar._resultKind).toBe('results');
  f.bar._disposed=true;const recover=spyOn(f.plugin,'recoverSearchBars');f.bar._input.click();expect(recover).toHaveBeenCalledWith(f.container);
  expect(f.errors).toEqual([]);
 }finally{await f.cleanup();}
});

test('touch focus is opt-in, layer presses dismiss keyboard and trailing actions do not activate the parent',async()=>{
 const f=await searchbarFixture();try{
  f.bar._sawTouchInput=true;f.bar._focusInput(false);expect(f.env.document.activeElement).not.toBe(f.bar._input);
  f.bar._focusInput(false,true);expect(f.env.document.activeElement).toBe(f.bar._input);
  f.bar._dropdown.dispatchEvent(new f.env.window.TouchEvent('touchstart',{bubbles:true}));expect(f.env.document.activeElement).not.toBe(f.bar._input);
  let parent=0,trailing=0;const row=f.bar._dropdownInner.createDiv();row.addEventListener('click',()=>parent++);
  const button=f.bar._mkTrailingBtn(row,{label:'row',action:()=>{},trailing:{icon:'x',title:'Remove',onClick:()=>trailing++}});
  expect(button.getAttribute('aria-label')).toBe('Remove');button.dispatchEvent(new f.env.window.MouseEvent('mouseenter'));button.dispatchEvent(new f.env.window.MouseEvent('mouseleave'));button.click();
  expect(trailing).toBe(1);expect(parent).toBe(0);expect(f.bar._isTouchDevice()).toBe(true);expect(f.errors).toEqual([]);
 }finally{await f.cleanup();}
});

test('IME composition cancels queries and commits once; Android keyup fallback avoids duplicate input',async()=>{
 const f=await searchbarFixture();try{
  const input=spyOn(f.bar,'_onInput'),key=spyOn(f.bar,'_handleKey');
  f.bar._input.dispatchEvent(new f.env.window.Event('compositionstart'));
  f.bar._input.value='中';f.bar._input.dispatchEvent(new f.env.window.Event('input'));
  f.bar._input.dispatchEvent(new f.env.window.KeyboardEvent('keydown',{key:'Enter',isComposing:true}));
  expect(input).not.toHaveBeenCalled();expect(key).not.toHaveBeenCalled();
  const compositionEnd=new f.env.window.Event('compositionend');f.bar._input.dispatchEvent(compositionEnd);expect(input).toHaveBeenCalledTimes(1);
  const safariCommit=new f.env.window.KeyboardEvent('keydown',{key:'Enter',isComposing:false});Object.defineProperty(safariCommit,'timeStamp',{value:compositionEnd.timeStamp+1});f.bar._input.dispatchEvent(safariCommit);expect(key).not.toHaveBeenCalled();
  const explicitSubmit=new f.env.window.KeyboardEvent('keydown',{key:'Enter'});Object.defineProperty(explicitSubmit,'timeStamp',{value:compositionEnd.timeStamp+60});f.bar._input.dispatchEvent(explicitSubmit);expect(key).toHaveBeenCalledTimes(1);
  f.bar._input.dispatchEvent(new f.env.window.KeyboardEvent('keyup',{key:'中'}));expect(input).toHaveBeenCalledTimes(1);
  f.bar._input.value='中文';f.bar._input.dispatchEvent(new f.env.window.KeyboardEvent('keyup',{key:'文'}));expect(input).toHaveBeenCalledTimes(2);
  expect(f.bar._clearBtn.style.display).toBe('inline-flex');f.bar._clearBtn.click();await settle();
  expect(f.bar._input.value).toBe('');expect(f.bar._clearBtn.style.display).toBe('none');expect(f.bar._resultKind).toBe('history');
 }finally{await f.cleanup();}
});

test('scope/options ownership and outside pointer keep child controls usable and dismiss only owned layers',async()=>{
 const f=await searchbarFixture();try{
  f.bar._scopeBtn.click();expect(f.bar._isScopeMenuOpen()).toBe(true);
  f.bar._contentToggleBtn.click();expect(f.bar._vaultPanelOpen).toBe(true);expect(f.bar._isScopeMenuOpen()).toBe(false);
  f.bar._vaultSearchPanel.dispatchEvent(new f.env.window.PointerEvent('pointerdown',{bubbles:true}));expect(f.bar._vaultPanelOpen).toBe(true);
  f.env.document.body.dispatchEvent(new f.env.window.PointerEvent('pointerdown',{bubbles:true}));expect(f.bar._vaultPanelOpen).toBe(false);
  f.bar._input.focus();await settle();expect(f.bar._dropdown.style.display).toBe('flex');
  f.bar._dropdown.dispatchEvent(new f.env.window.PointerEvent('pointerdown',{bubbles:true}));expect(f.bar._dropdown.style.display).toBe('flex');
  f.env.document.body.dispatchEvent(new f.env.window.PointerEvent('pointerdown',{bubbles:true}));expect(f.bar._dropdown.style.display).toBe('none');
  expect(f.errors).toEqual([]);
 }finally{await f.cleanup();}
});

test('web execution uses selected/fallback engines, records literal URLs and ignores empty submissions',async()=>{
 const f=await searchbarFixture({engines:[{id:'first',name:'First',url:'https://first.invalid/?q={q}',suggest:'',enabled:true},{id:'second',name:'Second',url:'https://second.invalid/?q={q}',suggest:'',enabled:true}]});try{
  const urls:string[]=[];spyOn(f.bar,'_openUrl').mockImplementation(url=>{urls.push(url);});const records=spyOn(f.bar,'_recordHistory');
  f.bar._selectMode('web',false);f.bar._input.value='x & 中文';f.bar._activeEngineId='second';f.bar._goBtn.click();await settle();
  expect(urls).toEqual(['https://second.invalid/?q=x%20%26%20%E4%B8%AD%E6%96%87']);expect(records).toHaveBeenCalledWith('Second','x & 中文',{kind:'url',url:urls[0]});
  f.bar._activeEngineId='missing';f.bar._executeSearch();expect(urls[1]).toContain('first.invalid');
  f.bar._activeEngineId=null;f.bar._executeSearch();expect(urls[2]).toContain('first.invalid');
  f.bar.cfg.engines=[];f.bar._executeSearch();expect(urls).toHaveLength(3);
  f.bar._input.value=' ';const count=records.mock.calls.length;f.bar._executeSearch();expect(records.mock.calls).toHaveLength(count);expect(f.errors).toEqual([]);
 }finally{await f.cleanup();}
});

test('narrow sheet controls, theme events and hover feedback retain interactive ownership',async()=>{
 const f=await searchbarFixture();try{
  Object.defineProperty(f.env.window,'innerWidth',{value:390,configurable:true});f.bar._scopeBtn.click();expect(f.bar._scopeMenu.style.display).toBe('flex');expect(f.bar._panelMask.style.display).toBe('block');f.bar._scopeBtn.click();expect(f.bar._isScopeMenuOpen()).toBe(false);
  f.bar._contentToggleBtn.click();expect(f.bar._vaultPanelOpen).toBe(true);expect(f.bar._vaultSearchPanel.style.display).toBe('block');
  for(const button of [f.bar._clearBtn,f.bar._contentToggleBtn]){button.dispatchEvent(new f.env.window.MouseEvent('mouseenter'));button.dispatchEvent(new f.env.window.MouseEvent('mouseleave'));}
  f.env.window.dispatchEvent(new f.env.window.Event('theme:apply'));expect(f.bar._input.style.color).toBe('var(--text-normal)');expect(f.bar._vaultPanelOpen).toBe(true);
  const press=new f.env.window.MouseEvent('mousedown',{cancelable:true});f.bar._clearBtn.dispatchEvent(press);expect(press.defaultPrevented).toBe(true);
  f.bar._input.focus();await settle();expect(f.bar._vaultPanelOpen).toBe(false);expect(f.bar._dropdown.style.display).toBe('flex');expect(f.errors).toEqual([]);
 }finally{await f.cleanup();}
});
