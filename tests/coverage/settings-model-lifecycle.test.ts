import {afterEach,beforeEach,expect,test,spyOn} from 'bun:test';
import type RadarSearchPlugin from '../../src/main.ts';
import {createDOM} from '../helpers/dom-host.ts';
import {installObsidianMock,Component,TFolder} from '../helpers/obsidian-host.ts';
installObsidianMock();
const {SettingsForm}=await import('../../src/settings/form.ts');
const {SettingsNavigation}=await import('../../src/settings/navigation.ts');
const {CollectionEditor}=await import('../../src/settings/editors.ts');
const {DirectorySuggest}=await import('../../src/ui/directory-suggest.ts');
const {DEFAULT_SETTINGS}=await import('../../src/settings/schema.ts');
let dom:ReturnType<typeof createDOM>;
beforeEach(()=>{dom=createDOM();});afterEach(async()=>{await dom.cleanup();});
function makeForm(){
 const parent=document.body.createDiv({cls:'vertical-tab-content'}),owner=new Component();owner.load();
 const plugin=Object.assign(owner,{app:{vault:{getAllLoadedFiles:()=>[new TFolder('Projects')]}},settings:structuredClone(DEFAULT_SETTINGS),updateSettings:async(patch:unknown)=>Object.assign(plugin.settings,patch)}) as unknown as RadarSearchPlugin;
 plugin.settings.excludePaths=['Archive'];const navigation=new SettingsNavigation(parent),form=new SettingsForm(plugin,parent,navigation);return {form,parent,plugin,navigation};
}
test('model re-render and form disposal close directory suggestion overlays',()=>{
 const {form,parent}=makeForm();const editor=new CollectionEditor(form,'excludePaths',parent);form.editors.set('excludePaths',editor);
 const old=editor.listEditor.suggesters[0];old.open();const previousOverlay=document.body.lastElementChild!;expect(previousOverlay.isConnected).toBe(true);editor.render();expect(previousOverlay.isConnected).toBe(false);
 const current=editor.listEditor.suggesters[0];current.open();const currentOverlay=document.body.lastElementChild!;form.dispose();expect(currentOverlay.isConnected).toBe(false);form.dispose();
});
test('nested path editor disposes suggestions when navigating back',()=>{
 const {form,parent,plugin,navigation}=makeForm();plugin.settings.searchPresets=[{name:'Test',mode:'黑名单',excludeFolders:['Archive'],icon:'files'}];
 navigation.push({title:'root',render:()=>{}});const editor=new CollectionEditor(form,'searchPresets',parent);
 const button=Array.from(editor.body.querySelectorAll('button')).find(button=>button.textContent?.includes('编辑规则'))!;button.click();
 expect(navigation.current.title).toContain('过滤规则');const close=spyOn(DirectorySuggest.prototype,'close');navigation.back();expect(close).toHaveBeenCalledTimes(1);close.mockRestore();expect(navigation.stack).toHaveLength(1);
});
test('settings form refreshes conditional visibility, choices and saves without losing scroll',async()=>{
 const {form,parent,plugin}=makeForm();for(const key of ['historyRetentionDays','recentFilesDays','placeholder_global','defaultPreset','activeEngineId'])form.addField(key);
 plugin.settings.historyRetentionMode='custom';plugin.settings.recentFilesEnabled=false;plugin.settings.placeholderType='custom';form.refreshVisibility();
 expect(form.fieldRows.get('historyRetentionDays')!.settingEl.style.display).toBe('');expect(form.fieldRows.get('recentFilesDays')!.settingEl.style.display).toBe('none');expect(form.fieldRows.get('placeholder_global')!.settingEl.style.display).toBe('');
 plugin.settings.searchPresets=[{name:'Added'}] as typeof plugin.settings.searchPresets;form.refreshChoices();expect(form.choiceControls.get('defaultPreset')!.selectEl.textContent).toContain('Added');
 parent.scrollTop=104;expect(await form.saveChanges({recentFilesEnabled:true})).toBe(true);expect(parent.scrollTop).toBe(104);expect(form.fieldRows.get('recentFilesDays')!.settingEl.style.display).toBe('');form.dispose();
});
