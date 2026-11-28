import {test,expect} from 'bun:test';
import {searchbarFixture} from '../helpers/searchbar-fixture.ts';
import {extractContentMatches} from '../../src/search/content-matches.ts';
import {extractMarkdownMatches} from '../../src/search/markdown-matches.ts';
import type {SearchGroup} from '../../src/types.ts';
const settle=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};

test('content previews build lazily, expand once, and activate the selected source hit',async()=>{
 const f=await searchbarFixture({defaultExpandContent:false});try{
  f.bar._input.value='needle';let opened=-1;const hits=extractContentMatches('first needle\nsecond needle',['needle']);
  const groups:SearchGroup[]=[{title:'内容匹配',items:[{label:'Note',path:'Docs/Note.md',icon:'file-text',hits,terms:['needle'],action:()=>opened=99,onMatch:hit=>opened=hits.indexOf(hit)}]}];
  f.bar._renderDropdown(groups);expect(f.bar._resultCategory).toBe('content');expect(f.bar._dropdownInner.querySelectorAll('.primecore-content-seq')).toHaveLength(0);
  f.bar._contentExpandBtn.click();expect(f.bar._contentHitControls[0].isExpanded()).toBe(true);expect(f.bar._dropdownInner.querySelectorAll('.primecore-content-seq')).toHaveLength(hits.length);
  f.bar._contentExpandBtn.click();expect(f.bar._contentHitControls[0].isExpanded()).toBe(false);f.bar._contentExpandBtn.click();expect(f.bar._dropdownInner.querySelectorAll('.primecore-content-seq')).toHaveLength(hits.length);
  f.bar._dropdownInner.querySelector('.primecore-content-seq')!.parentElement!.dispatchEvent(new f.env.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
  expect(opened).toBe(0);expect(f.bar._dropdown.style.display).toBe('none');expect(f.errors).toEqual([]);
 }finally{await f.cleanup();}
});

test('tag groups expand and navigate document children without firing container actions',async()=>{
 const f=await searchbarFixture({searchTags:true,defaultExpandContent:false});try{
  f.bar._input.value='#needle';let chosen=0;
  f.bar._renderDropdown([{title:'标签匹配',items:[{label:'#needle',action:()=>chosen=99,children:[{label:'Note',path:'Docs/Note.md',action:()=>chosen=1}]}]}]);
  const details=f.bar._dropdownInner.querySelector('details')!;expect(details.open).toBe(false);
  f.bar._toggleAllContentHits();expect(details.open).toBe(true);f.bar._toggleAllContentHits();expect(details.open).toBe(false);
  f.bar._dropdownInner.querySelector<HTMLButtonElement>('.primecore-tag-document')!.click();expect(chosen).toBe(1);expect(f.errors).toEqual([]);
 }finally{await f.cleanup();}
});

test('element view flattens Markdown hits before pagination and source activation keeps exact hit',async()=>{
 const f=await searchbarFixture({searchMarkdown:true,defaultMarkdownResultMode:'elements'});try{
  f.bar._input.value='needle';const hits=extractMarkdownMatches('# needle\n**needle**','needle');let opened=-1;
  f.bar._dropdownPageSize=1;f.bar._renderDropdown([{title:'Markdown 元素匹配',items:[{label:'Note',path:'Docs/Note.md',hits,action:()=>opened=99,onMatch:hit=>opened=hits.indexOf(hit)}]}]);
  expect(f.bar._itemEls).toHaveLength(1);expect(f.bar._dropdownInner.querySelector<HTMLInputElement>('[aria-label="页码"]')!.max).toBe('2');
  f.bar._dropdownInner.querySelector<HTMLButtonElement>('[aria-label="下一页"]')!.click();expect(f.bar._groupPages.get('Markdown 元素匹配')).toBe(2);
  f.bar._dropdownInner.querySelector<HTMLButtonElement>('.primecore-element-source')!.click();expect(opened).toBe(1);expect(f.errors).toEqual([]);
 }finally{await f.cleanup();}
});

test('attachment badges, trailing actions and normal rows remain independently actionable',async()=>{
 const f=await searchbarFixture({searchNonMarkdown:true});try{
  f.bar._input.value='image';let chosen=0,trailing=0;
  f.bar._renderDropdown([{title:'非 Markdown 文件',items:[{label:'image.png',path:'image.png',twoLine:true,icon:'image',iconTitle:'图片',sub:'folder',action:()=>chosen++,trailing:{icon:'copy',title:'复制',onClick:()=>trailing++}}]}]);
  expect(f.bar._dropdownInner.querySelector('.primecore-file-type')?.textContent).toBe('PNG');
  f.bar._dropdownInner.querySelector<HTMLButtonElement>('[aria-label="复制"]')!.click();expect(trailing).toBe(1);expect(chosen).toBe(0);
  f.bar._itemEls[0].click();expect(chosen).toBe(1);
  f.bar._mode='web';f.bar._renderDropdown([{title:'Web',items:[{label:'Plain',sub:'description',keepOpen:true,action:()=>chosen++}]}]);
  f.bar._itemEls[0].click();expect(chosen).toBe(2);expect(f.bar._dropdown.style.display).toBe('flex');expect(f.errors).toEqual([]);
 }finally{await f.cleanup();}
});

test('obsolete tag-mode save never starts a search after a newer view replaces its control',async()=>{
 const f=await searchbarFixture({searchTags:true});try{
  f.bar._input.value='#needle';f.bar._renderDropdown([{title:'标签匹配',items:[{label:'#needle',action:()=>{}}]}]);
  const before=f.bar._lastQuery;let release!:()=>void;f.plugin.updateSetting=()=>new Promise<void>(resolve=>release=resolve);
  const select=f.bar._dropdownInner.querySelector<HTMLSelectElement>('[aria-label="标签结果显示方式"]')!;select.value='documents';select.dispatchEvent(new f.env.window.Event('change'));
  f.bar._openSortView();release();await settle();expect(f.bar._resultToolView).toBe('sort');
  expect(f.bar._lastQuery).toBe(before);
 }finally{await f.cleanup();}
});

test('an old tag-mode failure cannot change a restored session setting',async()=>{
 const f=await searchbarFixture({searchTags:true});try{
  f.bar._input.value='#needle';f.bar._renderDropdown([{title:'标签匹配',items:[{label:'#needle',action:()=>{}}]}]);
  let reject!:(error:Error)=>void;f.plugin.updateSetting=()=>new Promise<void>((_resolve,fail)=>reject=fail);
  const select=f.bar._dropdownInner.querySelector<HTMLSelectElement>('[aria-label="标签结果显示方式"]')!;select.value='documents';select.dispatchEvent(new f.env.window.Event('change'));
  const session=f.bar.getSearchSession();session.query='';session.settings.tagResultMode='documents';await f.bar.applySearchSession(session);
  reject(Error('old failed save'));await settle();expect(f.bar.cfg.tagResultMode).toBe('documents');
 }finally{await f.cleanup();}
});
