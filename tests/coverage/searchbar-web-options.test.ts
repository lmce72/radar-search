import {test,expect} from 'bun:test';
import {searchbarFixture} from '../helpers/searchbar-fixture.ts';
const settle=async()=>{for(let i=0;i<24;i++)await Promise.resolve();};
function tap(f:Awaited<ReturnType<typeof searchbarFixture>>,element:Element){
 const start=new f.env.window.Event('touchstart',{bubbles:true,cancelable:true}),end=new f.env.window.Event('touchend',{bubbles:true,cancelable:true});
 Object.defineProperty(start,'touches',{value:[{clientX:1,clientY:1,identifier:1}]});Object.defineProperty(end,'changedTouches',{value:[{clientX:1,clientY:1,identifier:1}]});element.dispatchEvent(start);element.dispatchEvent(end);
}

test('web operators toggle phrases without swallowing qualifiers or duplicating title operators',async()=>{
 const f=await searchbarFixture();try{
  const searches:string[]=[];f.bar._doSearch=async q=>{searches.push(q);};
  f.bar._input.value='alpha beta site:example.com filetype:pdf';
  f.bar._applyWebOperator('exact',null);expect(f.bar._input.value).toBe('"alpha beta" site:example.com filetype:pdf');
  f.bar._applyWebOperator('exact',null);expect(f.bar._input.value).toBe('alpha beta site:example.com filetype:pdf');
  f.bar._input.value='"alpha beta" site:example.com';
  f.bar._applyWebOperator('intitle',null);expect(f.bar._input.value).toBe('intitle:"alpha beta" site:example.com');
  f.bar._applyWebOperator('intitle',null);expect(f.bar._input.value).toBe('"alpha beta" site:example.com');
  expect(searches).toHaveLength(4);
 }finally{await f.cleanup();}
});

test('web qualifier replacement respects quoted literals and never joins adjacent words',async()=>{
 const f=await searchbarFixture();try{
  f.bar._doSearch=async()=>{};
  f.bar._input.value='before site:old.test after "site:literal"';f.bar._applyWebOperator('site','new.test');
  expect(f.bar._input.value).toBe('before after "site:literal" site:new.test');
  f.bar._applyWebOperator('site','');expect(f.bar._input.value).toBe('before after "site:literal"');
  f.bar._input.value='site:example.com';f.bar._applyWebOperator('exact',null);expect(f.bar._input.value).toBe('site:example.com');
 }finally{await f.cleanup();}
});

test('empty web sources stay empty after deleting the last source',async()=>{
 const f=await searchbarFixture({webSources:[{label:'Only',domain:'one.test'}]});try{
  const row=f.env.document.body.createDiv();f.bar._renderSourceChips(row);f.bar._deleteSource(0,row);await settle();
  expect(f.bar.cfg.webSources).toEqual([]);expect(f.plugin.settings.webSources).toEqual([]);expect(row.querySelectorAll('button')).toHaveLength(0);
 }finally{await f.cleanup();}
});

test('source editor keeps draft and error visible after failed save and does not submit IME Enter',async()=>{
 const f=await searchbarFixture({webSources:[]});try{
  let calls=0;f.plugin.updateSetting=async()=>{calls++;throw Error('disk full');};
  const row=f.env.document.body.createDiv(),anchor=row.createEl('button');f.bar._openSourceEditor(null,-1,anchor,row);
  const editor=f.bar._sourceEditor,inputs=editor.querySelectorAll('input');inputs[0].value='Test';inputs[1].value='test.example';
  inputs[0].dispatchEvent(new f.env.window.KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true}));await settle();expect(calls).toBe(0);
  editor.querySelector<HTMLButtonElement>('button[title="确认"]')!.click();await settle();
  expect(calls).toBe(1);expect(editor.isConnected).toBe(true);expect(f.bar.cfg.webSources).toEqual([]);
  expect(editor.querySelector('[role=status]')?.textContent).toContain('disk full');
 }finally{await f.cleanup();}
});

test('engine controls filter enabled engines, refresh current results and restore saved selection on failure',async()=>{
 const f=await searchbarFixture({engines:[{id:'a',name:'Engine A',url:'https://a.test/?q={q}',suggest:'',enabled:true},{id:'b',name:'Engine B',url:'https://b.test/?q={q}',suggest:'',enabled:true},{id:'hidden',name:'Hidden',url:'https://hidden.test/?q={q}',suggest:'',enabled:false}]});try{
  f.bar._selectMode('web',false);const searches:string[]=[];f.bar._doSearch=async q=>{searches.push(q);};f.bar._input.value='needle';
  const parent=f.env.document.body.createDiv();f.bar._buildWebOptionsSection(parent);
  expect(f.bar._engineChipEls.size).toBe(2);const a=f.bar._engineChipEls.get('a')!,b=f.bar._engineChipEls.get('b')!;
  a.dispatchEvent(new f.env.window.MouseEvent('mouseenter'));a.dispatchEvent(new f.env.window.MouseEvent('mouseleave'));a.click();await settle();
  expect(f.bar._activeEngineId).toBe('a');expect(f.plugin.settings.activeEngineId).toBe('a');expect(a.getAttribute('aria-pressed')).toBe('true');
  expect(f.bar._contentToggleLabelEl.textContent).toBe('Engine A');expect(searches).toEqual(['needle']);
  f.plugin.updateSetting=async()=>{throw Error('write rejected');};b.click();await settle();
  expect(f.bar._activeEngineId).toBe('a');expect(b.getAttribute('aria-pressed')).toBe('false');expect(f.bar._contentToggleLabelEl.textContent).toBe('Engine A');
 }finally{await f.cleanup();}
});

test('web syntax controls apply custom types, preserve composing text and clear stale empty results',async()=>{
 const f=await searchbarFixture({webSources:[{label:'Docs',domain:'docs.test'}]});try{
  f.bar._selectMode('web',false);const searches:string[]=[];f.bar._doSearch=async q=>{searches.push(q);};
  const parent=f.env.document.body.createDiv();f.bar._buildWebOptionsSection(parent);f.bar._input.value='needle';
  const buttons=[...parent.querySelectorAll('button')],exact=buttons.find(button=>button.textContent==='"..."')!,title=buttons.find(button=>button.textContent==='intitle:')!;
  exact.click();title.click();expect(f.bar._input.value).toBe('intitle:"needle"');
  const site=parent.querySelector<HTMLInputElement>('input[placeholder="example.com"]')!;site.value='docs.test';buttons.find(button=>button.textContent==='site:')!.click();expect(f.bar._input.value).toContain('site:docs.test');
  const select=parent.querySelector('select')!,custom=parent.querySelector<HTMLInputElement>('input[placeholder=Filetype]')!;
  select.value='custom';select.dispatchEvent(new f.env.window.Event('change'));expect(custom.style.display).toBe('inline-block');custom.value='svg';
  custom.dispatchEvent(new f.env.window.KeyboardEvent('keydown',{key:'Enter',isComposing:true}));expect(f.bar._input.value).not.toContain('filetype:svg');
  const compositionEnd=new f.env.window.Event('compositionend');Object.defineProperty(compositionEnd,'timeStamp',{value:100});custom.dispatchEvent(compositionEnd);
  const confirm=new f.env.window.KeyboardEvent('keydown',{key:'Enter'});Object.defineProperty(confirm,'timeStamp',{value:105});custom.dispatchEvent(confirm);expect(f.bar._input.value).not.toContain('filetype:svg');
  custom.dispatchEvent(new f.env.window.Event('blur'));expect(f.bar._input.value).toContain('filetype:svg');
  select.value='pdf';select.dispatchEvent(new f.env.window.Event('change'));expect(custom.style.display).toBe('none');expect(f.bar._input.value).toContain('filetype:pdf');
  f.bar._input.value='site:docs.test';f.bar._applyWebOperator('site','');expect(f.bar._input.value).toBe('');expect(searches.at(-1)).toBe('');
  expect(f.bar._clearBtn.style.display).toBe('none');
 }finally{await f.cleanup();}
});

test('source editor validates, retries, preserves normalized domains and closes cleanly',async()=>{
 const f=await searchbarFixture({webSources:[]});try{
  const row=f.env.document.body.createDiv(),anchor=row.createEl('button');f.bar._openSourceEditor(null,-1,anchor,row);
  const editor=f.bar._sourceEditor,inputs=editor.querySelectorAll('input'),save=editor.querySelector<HTMLButtonElement>('button[title="确认"]')!;
  save.click();await settle();expect(editor.querySelector('[role=status]')?.textContent).toContain('请填写');expect(editor.isConnected).toBe(true);
  inputs[0].value='Docs';inputs[1].value='not a domain';save.click();await settle();expect(editor.querySelector('[role=status]')?.textContent).toContain('有效域名');
  inputs[1].value='HTTPS://docs.test/path';save.click();await settle();
  expect(f.plugin.settings.webSources).toEqual([{label:'Docs',domain:'docs.test/path'}]);expect(editor.isConnected).toBe(false);expect(f.bar._sourceEditor).toBeNull();
  const chip=row.querySelector('button')!;f.bar._openSourceEditor(f.bar.cfg.webSources[0],0,chip,row);
  const editing=f.bar._sourceEditor,field=editing.querySelector('input')!;field.value='Updated';field.dispatchEvent(new f.env.window.KeyboardEvent('keydown',{key:'Enter'}));await settle();
  expect(f.plugin.settings.webSources[0].label).toBe('Updated');expect(editing.isConnected).toBe(false);
 }finally{await f.cleanup();}
});

test('source editor cancel, replacement, outside dismissal, disconnected anchor and unload release ownership',async()=>{
 const f=await searchbarFixture({webSources:[]});try{
  const row=f.env.document.body.createDiv(),anchor=row.createEl('button');f.bar._openSourceEditor(null,-1,anchor,row);const first=f.bar._sourceEditor;
  f.bar._openSourceEditor(null,-1,anchor,row);expect(first.isConnected).toBe(false);
  const second=f.bar._sourceEditor;second.querySelector<HTMLButtonElement>('button[title="取消"]')!.click();expect(second.isConnected).toBe(false);
  f.bar._openSourceEditor(null,-1,anchor,row);const third=f.bar._sourceEditor;
  third.dispatchEvent(new f.env.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));expect(third.isConnected).toBe(false);expect(f.env.document.activeElement).toBe(anchor);
  f.bar._openSourceEditor(null,-1,anchor,row);const outside=f.bar._sourceEditor;f.env.document.body.click();expect(outside.isConnected).toBe(false);
  f.bar._openSourceEditor(null,-1,anchor,row);const removed=f.bar._sourceEditor;anchor.remove();f.bar._positionSourceEditor();expect(removed.isConnected).toBe(false);
  f.bar._openSourceEditor(null,-1,anchor,row);expect(f.bar._sourceEditor).toBeNull();row.appendChild(anchor);f.bar._openSourceEditor(null,-1,anchor,row);const final=f.bar._sourceEditor;
  f.bar.unload();expect(final.isConnected).toBe(false);expect(f.bar._sourceEditor).toBeNull();f.env.document.body.click();
 }finally{await f.cleanup();}
});

test('deleting sources keeps rejected writes visible and serializes edits without stale array overwrites',async()=>{
 const f=await searchbarFixture({webSources:[{label:'A',domain:'a.test'},{label:'B',domain:'b.test'}]});try{
  const row=f.env.document.body.createDiv();f.bar._renderSourceChips(row);const save=f.plugin.updateSetting.bind(f.plugin);
  f.plugin.updateSetting=async()=>{throw Error('disk');};f.bar._deleteSource(0,row);await settle();expect(f.bar.cfg.webSources).toHaveLength(2);expect(row.textContent).toContain('A');expect(f.notices.at(-1)).toContain('未能删除');
  f.plugin.updateSetting=save;f.bar._deleteSource(0,row);f.bar._deleteSource(1,row);await settle();
  expect(f.plugin.settings.webSources).toEqual([]);expect(f.bar.cfg.webSources).toEqual([]);
 }finally{await f.cleanup();}
});

test('source chips support touch apply, edit, delete and add without closing the options panel',async()=>{
 const f=await searchbarFixture({webSources:[{label:'Docs',domain:'docs.test'},{label:'Guides',domain:'guides.test'}]});try{
  f.bar._doSearch=async()=>{};const parent=f.env.document.body.createDiv();f.bar._buildWebOptionsSection(parent);const row=f.bar._webSourceRowEl;
  f.bar._input.value='needle';tap(f,row.querySelector('button')!);expect(f.bar._input.value).toBe('needle site:docs.test');
  f.bar._sourceEditBtnEl.click();expect(f.bar._webEditMode).toBe(true);
  const chip=row.querySelector('button')!,edit=chip.children[1],remove=chip.children[2];edit.dispatchEvent(new f.env.window.MouseEvent('click',{bubbles:true}));
  expect(f.bar._sourceEditor.isConnected).toBe(true);f.bar._positionSourceEditor();expect(f.bar._sourceEditor.style.overflowY).toBe('auto');
  f.bar._sourceEditor.querySelector<HTMLButtonElement>('button[title="取消"]')!.click();tap(f,edit);expect(f.bar._sourceEditor.isConnected).toBe(true);
  f.bar._sourceEditor.querySelector<HTMLButtonElement>('button[title="取消"]')!.click();tap(f,remove);await settle();expect(f.bar.cfg.webSources).toEqual([{label:'Guides',domain:'guides.test'}]);
  row.querySelector('button')!.children[2].dispatchEvent(new f.env.window.MouseEvent('click',{bubbles:true}));await settle();expect(f.bar.cfg.webSources).toEqual([]);
  const add=row.querySelector<HTMLButtonElement>('[aria-label="添加信息源"]')!;tap(f,add);expect(f.bar._sourceEditor.isConnected).toBe(true);
  f.bar._sourceEditor.querySelector<HTMLButtonElement>('button[title="取消"]')!.click();add.click();expect(f.bar._sourceEditor.isConnected).toBe(true);
  f.bar._sourceEditor.querySelector<HTMLButtonElement>('button[title="取消"]')!.click();f.bar._sourceEditBtnEl.click();expect(f.bar._webEditMode).toBe(false);expect(row.querySelector('[aria-label="添加信息源"]')).toBeNull();
 }finally{await f.cleanup();}
});

test('source edits reject a deleted target, and pending save completion cannot resurrect an unloaded editor',async()=>{
 const f=await searchbarFixture({webSources:[{label:'Docs',domain:'docs.test'}]});try{
  const row=f.env.document.body.createDiv(),anchor=row.createEl('button');f.bar._openSourceEditor(f.bar.cfg.webSources[0],0,anchor,row);
  f.plugin.settings.webSources=[];const editor=f.bar._sourceEditor;editor.querySelector('input')!.value='Rename';editor.querySelector<HTMLButtonElement>('button[title="确认"]')!.click();await settle();
  expect(editor.querySelector('[role=status]')?.textContent).toContain('已修改或删除');expect(f.plugin.settings.webSources).toEqual([]);
  editor.querySelector<HTMLButtonElement>('button[title="取消"]')!.click();f.bar._openSourceEditor(null,-1,anchor,row);const pending=f.bar._sourceEditor,inputs=pending.querySelectorAll('input');inputs[0].value='New';inputs[1].value='new.test';
  let release:()=>void=()=>{};const save=f.plugin.updateSetting.bind(f.plugin);f.plugin.updateSetting=async(...args)=>{await new Promise<void>(resolve=>{release=resolve;});await save(...args);};
  const button=pending.querySelector<HTMLButtonElement>('button[title="确认"]')!;button.click();await settle();expect(button.disabled).toBe(true);f.bar.unload();release();await settle();
  expect(pending.isConnected).toBe(false);expect(f.bar._sourceEditor).toBeNull();expect(f.env.document.querySelector('[data-sb-source-editor]')).toBeNull();
 }finally{await f.cleanup();}
});

test('rebuilt engine controls keep newer selection when an older panel write fails',async()=>{
 const f=await searchbarFixture({engines:[{id:'a',name:'A',url:'https://a.test/{q}',suggest:'',enabled:true},{id:'b',name:'B',url:'https://b.test/{q}',suggest:'',enabled:true}]});try{
  f.bar._selectMode('web',false);const parent=f.env.document.body.createDiv();f.bar._buildWebOptionsSection(parent);
  const pending:Array<{resolve:()=>void;reject:(error:Error)=>void}>=[],save=f.plugin.updateSetting.bind(f.plugin);
  f.plugin.updateSetting=async(...args)=>{await new Promise<void>((resolve,reject)=>pending.push({resolve,reject}));await save(...args);};
  f.bar._engineChipEls.get('a')!.click();parent.empty();f.bar._buildWebOptionsSection(parent);f.bar._engineChipEls.get('b')!.click();
  pending[0].reject(Error('old panel save failed'));await settle();expect(f.bar._activeEngineId).toBe('b');expect(f.bar._engineChipEls.get('b')!.getAttribute('aria-pressed')).toBe('true');
  pending[1].resolve();await settle();expect(f.plugin.settings.activeEngineId).toBe('b');expect(f.bar._activeEngineId).toBe('b');
 }finally{await f.cleanup();}
});

test('an abandoned source save syncs data without disconnecting a newer editor draft',async()=>{
 const f=await searchbarFixture({webSources:[{label:'A',domain:'a.test'},{label:'B',domain:'b.test'}]});try{
  const parent=f.env.document.body.createDiv();f.bar._buildWebOptionsSection(parent);const row=f.bar._webSourceRowEl,anchors=row.querySelectorAll('button');
  f.bar._openSourceEditor(f.bar.cfg.webSources[0],0,anchors[0],row);const first=f.bar._sourceEditor;first.querySelector('input')!.value='Saved A';
  let release=()=>{};const save=f.plugin.updateSetting.bind(f.plugin);f.plugin.updateSetting=async(...args)=>{await new Promise<void>(resolve=>release=resolve);await save(...args);};
  first.querySelector<HTMLButtonElement>('button[title="确认"]')!.click();await settle();f.bar._closeSourceEditor();
  f.bar._openSourceEditor(f.bar.cfg.webSources[1],1,anchors[1],row);const second=f.bar._sourceEditor;second.querySelector('input')!.value='Draft B';
  release();await settle();expect(f.plugin.settings.webSources[0].label).toBe('Saved A');expect(second.isConnected).toBe(true);expect(f.bar._sourceEditorAnchor.isConnected).toBe(true);
  f.bar._positionSourceEditor();expect(second.querySelector('input')!.value).toBe('Draft B');expect(second.isConnected).toBe(true);
  await Bun.sleep(25);expect(second.isConnected).toBe(true);f.bar._closeSourceEditor();await Bun.sleep(25);expect(row.textContent).toContain('Saved A');
 }finally{await f.cleanup();}
});
