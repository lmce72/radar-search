import {expect,test} from 'bun:test';
import type {App} from 'obsidian';
import {SearchSettingTab} from '../../src/settings/tab.ts';
import {searchbarFixture} from '../helpers/searchbar-fixture.ts';
import {Component} from '../helpers/obsidian-host.ts';

test('settings tab retains active nested draft, focus and scroll; hide disposes nested editor',async()=>{
 const f=await searchbarFixture(),owner=new Component();owner.load();
 Object.assign(f.plugin,{addChild:owner.addChild.bind(owner),removeChild:owner.removeChild.bind(owner)});
 const tab=new SearchSettingTab(f.app as unknown as App,f.plugin);document.body.appendChild(tab.containerEl);
 try{
  tab.display();expect(tab.getSettingDefinitions()).toEqual([]);expect(tab.containerEl.querySelectorAll('.setting-item').length).toBeGreaterThan(20);
  let disposals=0;tab.navigation.push({title:'draft',render:(parent,view)=>{parent.createEl('input',{type:'text',value:'unsaved'});view.dispose=()=>disposals++;}});
  const input=tab.navigation.current.root.querySelector('input')!;input.focus();tab.containerEl.scrollTop=90;tab.display();
  expect(tab.navigation.current.title).toBe('draft');expect(input.value).toBe('unsaved');expect(document.activeElement).toBe(input);expect(tab.containerEl.scrollTop).toBe(90);
  tab.hide();expect(disposals).toBe(1);tab.display();expect(tab.navigation.stack).toHaveLength(1);expect(tab.navigation.current.title).toBe('设置');expect(tab.containerEl.scrollTop).toBe(90);
 }finally{tab.hide();owner.unload();await f.cleanup();}
});
