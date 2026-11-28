import {test,expect} from 'bun:test';
import {searchbarFixture} from '../helpers/searchbar-fixture.ts';
const settle=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
const deferred=()=>{let resolve!:()=>void;const promise=new Promise<void>(done=>resolve=done);return {promise,resolve};};

for(const kind of ['filter','presetName'] as const)test(`${kind} save completes without replacing a newer result view`,async()=>{
 const f=await searchbarFixture({searchPresets:[{name:'Existing',mode:'黑名单',excludeFolders:[],icon:'filter'}]});try{
  f.bar._input.value='needle';await f.bar._doSearch('needle');f.bar._openFilterView(false,'Docs/Note.md');
  f.bar._filterDraft.paths=['Docs/Note.md'];f.bar._filterWriteToPreset=true;f.bar._filterPresetName='Existing';
  if(kind==='presetName'){
   f.bar._openPresetNameView();const input=f.bar._dropdownInner.querySelector<HTMLInputElement>('[aria-label="预设名称"]')!;
   input.value='New preset';input.dispatchEvent(new f.env.window.Event('input',{bubbles:true}));
  }
  const gate=deferred(),save=f.plugin.updateSettings.bind(f.plugin);f.plugin.updateSettings=async values=>{await gate.promise;await save(values);};
  f.bar._dropdownInner.querySelector<HTMLButtonElement>(`[aria-label="${kind==='filter'?'应用':'保存预设'}"]`)!.click();
  await settle();f.bar._returnToResults();f.bar._selectedPreset='';f.bar._input.value='newer';await f.bar._doSearch('newer');
  const next=f.bar._lastGroups;gate.resolve();await settle();
  expect(f.bar._selectedPreset).toBe('');expect(f.bar._lastQuery).toBe('newer');expect(f.bar._lastGroups).toEqual(next);
  expect(f.plugin.settings.searchPresets.some(preset=>preset.name===(kind==='filter'?'Existing':'New preset'))).toBe(true);
 }finally{await f.cleanup();}
});

test('pager clamps page numbers and does not submit an IME confirmation',async()=>{
 const f=await searchbarFixture();try{
  const pages:number[]=[],sizes:number[]=[];
  const pager=f.bar._mkPagerBar(f.env.document.body,{page:2,totalPages:5,pageSize:10,onSize:value=>sizes.push(value),onPage:value=>pages.push(value),onPrev:()=>pages.push(1),onNext:()=>pages.push(3)})!;
  const page=pager.querySelector<HTMLInputElement>('[aria-label="页码"]')!;
  page.value='4';page.dispatchEvent(new f.env.window.KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true}));expect(pages).toEqual([]);
  page.dispatchEvent(new f.env.window.Event('compositionend'));page.dispatchEvent(new f.env.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));expect(pages).toEqual([]);
  page.value='100';page.dispatchEvent(new f.env.window.Event('change'));expect(pages).toEqual([5]);
  page.value='-3';page.dispatchEvent(new f.env.window.Event('change'));expect(pages).toEqual([5,1]);
  page.value='';page.dispatchEvent(new f.env.window.Event('change'));expect(page.value).toBe('2');
  const size=pager.querySelector<HTMLInputElement>('[aria-label="每页条数"]')!;size.value='0';pager.querySelector<HTMLButtonElement>('[aria-label="应用每页条数"]')!.click();expect(sizes).toEqual([10]);
  pager.querySelector<HTMLButtonElement>('[aria-label="上一页"]')!.click();pager.querySelector<HTMLButtonElement>('[aria-label="下一页"]')!.click();expect(pages.slice(-2)).toEqual([1,3]);
 }finally{await f.cleanup();}
});
