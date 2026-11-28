import {afterEach,beforeEach,expect,test} from 'bun:test';
import type RadarSearchPlugin from '../../src/main.ts';
import {createDOM} from '../helpers/dom-host.ts';
import {installObsidianMock} from '../helpers/obsidian-host.ts';
installObsidianMock();
const {NewTabEntry}=await import('../../src/ui/new-tab-entry.ts');
let dom:ReturnType<typeof createDOM>;
beforeEach(()=>{dom=createDOM();});afterEach(async()=>{await dom.cleanup();});
test('new-tab entry reconciles host leaves, settings and removed buttons without duplicate listeners',()=>{
 const root=document.body.createDiv();root.createDiv({cls:'empty-state-container'}).createDiv({cls:'empty-state-action-list'});let type='empty',opens=0,off=0;
 let ready!:()=>void;let layout!:()=>void;
 const plugin={settings:{newTabSearch:true},openFloatingSearch:()=>opens++,app:{workspace:{on:(_event:string,callback:()=>void)=>{layout=callback;return {off:()=>off++};},onLayoutReady:(callback:()=>void)=>{ready=callback;},iterateAllLeaves:(callback:(leaf:unknown)=>void)=>callback({view:{getViewType:()=>type,containerEl:root}})}}} as unknown as RadarSearchPlugin;
 const entry=new NewTabEntry(plugin);entry.load();ready();layout();expect(root.querySelectorAll('button')).toHaveLength(1);
 const old=root.querySelector('button')!;old.click();expect(opens).toBe(1);old.remove();layout();old.click();expect(opens).toBe(1);expect(root.querySelectorAll('button')).toHaveLength(1);
 type='markdown';layout();expect(root.querySelector('button')).toBeNull();type='empty';layout();plugin.settings.newTabSearch=false;layout();expect(root.querySelector('button')).toBeNull();
 plugin.settings.newTabSearch=true;layout();const button=root.querySelector('button')!;entry.unload();button.click();expect(opens).toBe(1);expect(off).toBe(1);ready();expect(root.querySelector('button')).toBeNull();
});
