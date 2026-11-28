import {test,expect} from 'bun:test';
import {searchbarFixture} from '../helpers/searchbar-fixture.ts';
import {moment} from '../../src/shared/moment.ts';
import {TFile} from '../helpers/obsidian-host.ts';
const settle=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
test('history views filter modes, sort newest first and preserve target navigation',async()=>{
 const f=await searchbarFixture();try{
  const today=moment().format('YYYY-MM-DD');
  f.disk.set(f.plugin.history.path(today),JSON.stringify([{q:'old',mode:'vault',ts:1},{q:'web only',mode:'web',ts:3},{q:'new',mode:'global',ts:2,file:'Note',target:{kind:'file',path:f.files[0].path}}]));
  f.bar._idleView='history';await f.bar._showHistory(today);
  expect(f.bar._itemEls.map(row=>row.textContent)).toEqual([expect.stringContaining('new'),expect.stringContaining('old')]);
  f.bar._itemEls[0].querySelector<HTMLButtonElement>('.primecore-history-target')!.click();await settle();expect(f.opened[0]).toMatchObject({file:f.files[0].path});
  f.bar._input.value='';f.bar._mode='web';await f.bar._showHistory(today);expect(f.bar._itemEls).toHaveLength(1);expect(f.bar._itemEls[0].textContent).toContain('web only');
 }finally{await f.cleanup();}
});

test('deleting a history row does not replace a newly selected recent view',async()=>{
 const f=await searchbarFixture({recentFilesEnabled:true});try{
  const today=moment().format('YYYY-MM-DD'),record={q:'old',mode:'vault' as const,ts:1};
  f.bar._idleView='history';f.bar._renderHistoryDropdown(today,[record]);
  let release!:()=>void;f.plugin.history.removeRecord=()=>new Promise<void>(resolve=>release=resolve);
  f.bar._dropdownInner.querySelector<HTMLButtonElement>('button[aria-label="删除搜索记录 old"]')!.click();
  f.bar._idleView='recent';f.bar._showRecentFiles();expect(f.bar._dropdownInner.querySelector('.primecore-recent-list')).not.toBeNull();
  release();await settle();expect(f.bar._dropdownInner.querySelector('.primecore-recent-list')).not.toBeNull();
 }finally{await f.cleanup();}
});

test('a failed default record view save restores the committed default',async()=>{
 const f=await searchbarFixture({recentFilesEnabled:true,defaultRecordView:'history'});try{
  f.bar._idleView='history';await f.bar._showHistory(moment().format('YYYY-MM-DD'));f.bar._recordHeader!.querySelector<HTMLButtonElement>('.primecore-idle-switch')!.click();
  f.plugin.updateSetting=async()=>{throw Error('read only');};f.bar._setDefaultRecordView('recent');await settle();
  expect(f.bar.cfg.defaultRecordView).toBe('history');expect(f.notices).toContain('默认记录视图保存失败，请重试');
  expect(f.bar._idleMenuEl?.querySelector('[data-record-view=history]')?.classList.contains('is-default')).toBe(true);
  expect(f.bar._idleMenuEl?.querySelector('[data-record-view=recent]')?.getAttribute('aria-checked')).toBe('false');
 }finally{await f.cleanup();}
});

test('all-history loading cancels queued days when the user starts a new search',async()=>{
 const f=await searchbarFixture();try{
  const dates=[1,2,3].map(days=>moment().subtract(days,'days').format('YYYY-MM-DD'));
  dates.forEach(date=>f.disk.set(f.plugin.history.path(date),JSON.stringify([{q:date,mode:'vault',ts:1}])));
  let reads=0;const read=f.app.vault.adapter.read;f.app.vault.adapter.read=async(path)=>{reads++;++f.bar._historyVer;return read(path);};
  f.bar._showAllHistory=true;await f.bar._loadAllHistory();expect(reads).toBe(1);
 }finally{await f.cleanup();}
});

test('date navigation rejects empty and out-of-range native input values',async()=>{
 const f=await searchbarFixture();try{
  const selected:string[]=[];const nav=f.bar._mkRecordDateNav({date:'2026-11-27',minDate:'2026-11-25',today:'2026-11-28',showAll:false,onToggleShowAll:()=>{},onSelectDate:date=>selected.push(date)});
  f.container.appendChild(nav);const input=nav.querySelector<HTMLInputElement>('input[type=date]')!;
  for(const value of ['', '2026-11-30','2026-11-24']){input.value=value;input.dispatchEvent(new f.env.window.Event('change'));}
  expect(selected).toEqual([]);expect(input.value).toBe('2026-11-27');input.value='2026-11-26';input.dispatchEvent(new f.env.window.Event('change'));expect(selected).toEqual(['2026-11-26']);
 }finally{await f.cleanup();}
});

test('record menu switches views and default radios persist without losing menu ownership',async()=>{
 const f=await searchbarFixture({recentFilesEnabled:true,defaultRecordView:'history'});try{
  const today=moment().format('YYYY-MM-DD');f.bar._idleView='history';await f.bar._showHistory(today);
  f.bar._recordHeader!.querySelector<HTMLButtonElement>('.primecore-idle-switch')!.click();
  const menu=f.bar._idleMenuEl!;expect(menu.isConnected).toBe(true);
  menu.querySelector<HTMLButtonElement>('[data-record-view=recent]')!.click();await settle();
  expect(f.plugin.settings.defaultRecordView).toBe('recent');expect(menu.isConnected).toBe(true);
  const recent=Array.from(menu.querySelectorAll<HTMLButtonElement>('.menu-item')).find(row=>row.querySelector('.menu-item-title')?.textContent==='最近打开')!;
  recent.click();await settle();const currentView=()=>f.bar._idleView;expect(currentView()).toBe('recent');expect(f.bar._dropdownInner.querySelector('.primecore-recent-list')).not.toBeNull();
 }finally{await f.cleanup();}
});

test('record clear rejection is reported and does not escape the click handler',async()=>{
 const f=await searchbarFixture();try{
  f.bar._bindClearRecordBtn(true,'test clear',async()=>{throw Error('locked');});f.bar._clearHistoryBtn.click();await settle();
  expect(f.notices).toContain('清理记录失败，请重试');expect(f.errors.at(-1)?.[0]).toBe('清理记录失败');
 }finally{await f.cleanup();}
});

test('failed history writes can be retried for the same query and target',async()=>{
 const f=await searchbarFixture();try{
  let calls=0;f.plugin.history.prepend=async()=>{calls++;if(calls===1)throw Error('locked');};
  f.bar._recordHistory('Note','needle',{kind:'file',path:f.files[0].path});await settle();
  f.bar._recordHistory('Note','needle',{kind:'file',path:f.files[0].path});await settle();expect(calls).toBe(2);
 }finally{await f.cleanup();}
});

test('history target dispatch supports legacy exact names and rejects ambiguous or removed files',async()=>{
 const f=await searchbarFixture();try{
  f.bar._openHistoryTarget({q:'needle',mode:'vault',ts:1,file:'Note'});await settle();expect(f.opened).toHaveLength(1);
  f.files.push(new TFile('Elsewhere/Note.md'));f.bar._openHistoryTarget({q:'needle',mode:'vault',ts:2,file:'Note'});expect(f.notices.at(-1)).toContain('未保存可确定');
  f.bar._openHistoryTarget({q:'needle',mode:'vault',ts:3,target:{kind:'file',path:'removed.md'}});expect(f.notices.at(-1)).toContain('已移动或删除');
  f.bar._openHistoryTarget({q:'command',mode:'global',ts:4,file:'Fixture command'});expect(f.commands).toEqual(['fixture:run']);
  const urls:string[]=[];f.bar._openUrl=url=>urls.push(url);f.bar._openHistoryTarget({q:'web',mode:'web',ts:5,target:{kind:'url',url:'https://example.com'}});expect(urls).toEqual(['https://example.com']);
 }finally{await f.cleanup();}
});

test('native and fallback browser navigation preserve requested destination',async()=>{
 const f=await searchbarFixture();try{
  const calls:unknown[]=[];Reflect.set(f.app.internalPlugins.plugins,'webviewer',{instance:{openUrl:(...args:unknown[])=>calls.push(args)}});
  f.bar.cfg.browserTarget='internal';f.bar._openUrl('https://example.com/one');
  f.bar.cfg.browserTarget='internal-window';f.bar._openUrl('https://example.com/two');
  expect(calls).toEqual([['https://example.com/one','tab',true],['https://example.com/two','window',true]]);
  Reflect.deleteProperty(f.app.internalPlugins.plugins,'webviewer');f.env.window.open=(...args:unknown[])=>{calls.push(args);return null;};
  f.bar._openUrl('https://example.com/fallback');expect(calls.at(-1)).toEqual(['https://example.com/fallback','_blank']);
  Reflect.set(f.app,'openUrl',(url:string)=>calls.push(['external',url]));f.bar.cfg.browserTarget='external';f.bar._openUrl('https://example.com/native');expect(calls.at(-1)).toEqual(['external','https://example.com/native']);
 }finally{await f.cleanup();}
});

test('date navigation enforces boundaries and read-only all-days or today-only views',async()=>{
 const f=await searchbarFixture();try{
  const selected:string[]=[];let toggles=0;
  const nav=f.bar._mkRecordDateNav({date:'2026-11-27',minDate:'2026-11-26',today:'2026-11-28',showAll:false,onToggleShowAll:()=>toggles++,onSelectDate:date=>selected.push(date)});f.container.appendChild(nav);
  const prev=nav.querySelector<HTMLButtonElement>('[aria-label="前一天"]')!,next=nav.querySelector<HTMLButtonElement>('[aria-label="后一天"]')!;
  prev.click();expect(prev.disabled).toBe(true);next.click();next.click();expect(next.disabled).toBe(true);expect(selected).toEqual(['2026-11-26','2026-11-27','2026-11-28']);
  const all=nav.querySelector<HTMLInputElement>('input[type=checkbox]')!;all.checked=true;all.dispatchEvent(new f.env.window.Event('change'));expect(toggles).toBe(1);expect(nav.querySelector<HTMLInputElement>('input[type=date]')!.readOnly).toBe(true);
  const today=f.bar._mkRecordDateNav({date:'2026-11-28',minDate:null,today:'2026-11-28',showAll:false,onlyToday:true,onToggleShowAll:()=>toggles++,onSelectDate:()=>{throw Error('locked');}});
  expect(today.querySelector<HTMLInputElement>('input[type=checkbox]')!.disabled).toBe(true);expect(today.textContent).toContain('仅今天');
 }finally{await f.cleanup();}
});
