import {test,expect} from 'bun:test';
import {createDOM} from '../helpers/dom-host.ts';
import {installObsidianMock} from '../helpers/obsidian-host.ts';
import type {ContentMatch} from '../../src/types.ts';
import type {MarkdownElementKind} from '../../src/search/markdown-elements.ts';
installObsidianMock();
const {ChoiceMenu}=await import('../../src/ui/choice-menu.ts');
const {renderMarkdownFilters}=await import('../../src/ui/markdown-filters.ts');
const {renderMarkdownHit}=await import('../../src/ui/markdown-hit.ts');
const {RichPreview}=await import('../../src/ui/rich-preview.ts');
const {ALL_MARKDOWN_ELEMENTS}=await import('../../src/search/markdown-elements.ts');
const settle=()=>new Promise(resolve=>setTimeout(resolve,0));

test('markdown filters synchronize group checkboxes, preserve browsing and roll back failed saves',async()=>{
 const dom=createDOM(),menus:InstanceType<typeof ChoiceMenu>[]=[];try{
  let saved:MarkdownElementKind[]=['heading'],fail=false;const errors:unknown[]=[];
  const toolbar=renderMarkdownFilters(dom.document.body,saved,async next=>{if(fail)throw Error('disk');saved=next;return next;},error=>errors.push(error),(parent,label,activate)=>{const menu=new ChoiceMenu(parent,label,new Set(),undefined,activate?{activate,hover:true}:undefined);menu.load();menus.push(menu);return menu;},()=>saved);
  const all=toolbar.querySelector<HTMLButtonElement>('.primecore-markdown-select-all');expect(all.getAttribute('aria-pressed')).toBe('mixed');
  const mobile=menus.at(-1),text=mobile.popup.querySelector<HTMLButtonElement>('[data-element-category=text]');
  text.click();expect(saved).toEqual(['heading']);expect(mobile.popup.querySelector<HTMLElement>('[data-mobile-element=code]').parentElement.hidden).toBe(true);
  const textCheck=mobile.popup.querySelector<HTMLInputElement>('[data-category-check=text]');expect(textCheck.indeterminate).toBe(true);
  textCheck.dispatchEvent(new dom.window.Event('change',{bubbles:true}));await settle();expect(saved).toContain('bold');expect(saved).toHaveLength(5);expect(textCheck.checked).toBe(true);
  text.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));expect(dom.document.activeElement).toBe(mobile.popup.querySelector('[data-mobile-element=heading]'));
  dom.document.activeElement.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true,cancelable:true}));expect(dom.document.activeElement).toBe(text);
  all.click();await settle();expect(saved).toEqual(ALL_MARKDOWN_ELEMENTS);expect(all.getAttribute('aria-pressed')).toBe('true');
  all.click();await settle();expect(saved).toEqual([]);expect(all.getAttribute('aria-pressed')).toBe('false');
  const table=toolbar.querySelector<HTMLButtonElement>('[aria-label=表格]');table.click();await settle();expect(saved).toEqual(['table']);
  fail=true;table.click();expect(table.getAttribute('aria-pressed')).toBe('false');await settle();expect(table.getAttribute('aria-pressed')).toBe('true');expect(errors).toHaveLength(1);
  toolbar.dispatchEvent(new dom.window.CustomEvent('primecore-filter-sync',{detail:['code']}));expect(mobile.popup.querySelector('[data-mobile-element=code]').getAttribute('aria-checked')).toBe('true');
 }finally{menus.forEach(menu=>menu.unload());await dom.cleanup();}
});

test('markdown hit metadata separates blocks from inline content and link activation from note navigation',async()=>{
 const dom=createDOM();try{
  const preview=new RichPreview({} as ConstructorParameters<typeof RichPreview>[0],()=>{},()=>{});preview.load();
  const base:ContentMatch={text:'needle',start:0,end:6,match:'needle',before:'',after:''};let opened=0;const links:unknown[]=[];
  const parent=dom.document.body.createDiv();
  for(const element of [
   {kind:'heading',level:2,line:2,text:'needle',source:'## needle'},
   {kind:'orderedList',line:3,text:'needle',source:'3. needle'},
   {kind:'code',line:4,text:'needle',source:'```ts\nneedle\n```',language:'ts'},
   {kind:'callout',line:5,text:'needle',source:'> [!note] needle',callout:'note'},
   {kind:'math',line:6,text:'needle',source:'$$needle$$'},
   {kind:'comment',line:7,text:'visible needle',source:'%%hidden%%'},
   {kind:'footnote',line:8,text:'needle',source:'[^demo]: needle',footnote:'demo'},
   {kind:'internalLink',line:9,text:'needle',source:'[[target]]',link:{target:'target',label:'Target',external:false}}
  ] satisfies NonNullable<ContentMatch['markdown']>[]){renderMarkdownHit(parent,{...base,markdown:element},['needle'],preview,'source.md',()=>{opened++;},(target,external)=>links.push([target,external]));}
  await settle();const rows=parent.querySelectorAll<HTMLElement>('.primecore-markdown-hit');expect(rows).toHaveLength(8);expect(rows[0].classList.contains('is-line')).toBe(true);expect(rows[2].classList.contains('is-block')).toBe(true);expect(rows[4].classList.contains('is-block')).toBe(true);expect(rows[1].style.getPropertyValue('--primecore-list-start')).toBe('2');
  expect(rows[0].querySelector('.primecore-markdown-hit-icon').getAttribute('title')).toBe('H2 标题');expect(rows[2].textContent).toContain('ts');expect(rows[5].textContent).toContain('visible needle');expect(rows[5].textContent).not.toContain('hidden');expect(rows[6].textContent).not.toContain('[^demo]:');
  rows[7].querySelector<HTMLButtonElement>('.primecore-element-link').click();expect(links).toEqual([['target',false]]);expect(opened).toBe(0);
  rows[0].querySelector<HTMLButtonElement>('.primecore-markdown-jump').click();expect(opened).toBe(1);rows[0].querySelector<HTMLElement>('.primecore-markdown-hit-text').click();expect(opened).toBe(2);
  renderMarkdownHit(parent,base,[],preview,'source.md',()=>{},()=>{});expect(parent.children).toHaveLength(8);preview.unload();
 }finally{await dom.cleanup();}
});
