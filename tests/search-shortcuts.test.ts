import {test,expect} from "bun:test";
import {shortcutFor,validShortcut,canonicalShortcut,matchSearchShortcut,validateSearchShortcuts,migrateSearchShortcuts,DEFAULT_SEARCH_SHORTCUTS,SHORTCUT_ACTIONS,type SearchShortcut} from "../src/shared/search-shortcuts.ts";
import {normalizeSettings} from "../src/settings/schema.ts";
const event=(key:string,extra={})=>({key,altKey:false,ctrlKey:false,metaKey:false,shiftKey:false,...extra});
const binding=(extra:Partial<SearchShortcut>={}):SearchShortcut=>({id:"a",action:"filter.open",shortcut:"Ctrl+K",enabled:true,scope:"input",reverse:false,...extra});
test("bindings map the same key to a freely selected action and support multiple keys for one action",()=>{
 expect(matchSearchShortcut(event("k",{ctrlKey:true}),[binding()],true)).toBe("filter.open");
 expect(matchSearchShortcut(event("k",{ctrlKey:true}),[binding({action:"sort.open"})],true)).toBe("sort.open");
 const list=validateSearchShortcuts([binding(),binding({id:"b",shortcut:"Alt+F"})]);
 expect(matchSearchShortcut(event("f",{altKey:true}),list,true)).toBe("filter.open");
 expect(matchSearchShortcut(event("k",{ctrlKey:true}),list,false)).toBeUndefined();
 expect(matchSearchShortcut(event("k",{ctrlKey:true}),[binding({scope:"search"})],false)).toBe("filter.open");
 expect(matchSearchShortcut(event("k",{ctrlKey:true,isComposing:true}),list,true)).toBeUndefined();
 expect(matchSearchShortcut(event("k",{ctrlKey:true}),[binding({enabled:false})],true)).toBeUndefined();
});
test("paired actions reverse with Shift using inherited native event properties",()=>{
 const pair=binding({action:"page.next",reverse:true});expect(matchSearchShortcut(Object.create(event("K",{ctrlKey:true,shiftKey:true})),[pair],true)).toBe("page.previous");
 expect(()=>validateSearchShortcuts([pair,binding({id:"b",shortcut:"Ctrl+Shift+K"})])).toThrow("重复");
 expect(()=>validateSearchShortcuts([binding({reverse:true})])).toThrow("不支持反向");
 expect(()=>validateSearchShortcuts([binding({action:"page.next",shortcut:"Ctrl+Shift+K",reverse:true})])).toThrow("Shift");
});
test("recording keeps typing, modifier-only and navigation keys out of bindings",()=>{
 expect(shortcutFor(event("Control",{ctrlKey:true}))).toBe("");expect(shortcutFor(event("/",{ctrlKey:true}))).toBe("Ctrl+/");expect(shortcutFor(event("+",{ctrlKey:true}))).toBe("Ctrl+Plus");
 for(const key of ["A","Shift+A","Ctrl+Tab","Alt+Escape","Alt+Alt+A","Alt+Unknown"])expect(validShortcut(key)).toBe(false);
 for(const key of ["","Ctrl+K","Ctrl+/","Alt+ArrowRight","Meta+Shift+F2","Ctrl+Plus"])expect(validShortcut(key)).toBe(true);
 expect(canonicalShortcut("Alt+Ctrl+K")).toBe("Ctrl+Alt+K");
});
test("invalid actions, duplicate IDs and enabled empty keys are rejected",()=>{
 expect(()=>validateSearchShortcuts([binding({action:"unknown" as SearchShortcut["action"]})])).toThrow("有效");
 expect(()=>validateSearchShortcuts([binding(),binding({shortcut:"Alt+K"})])).toThrow("重复");
 expect(()=>validateSearchShortcuts([binding({shortcut:""})])).toThrow("录入");
 expect(validateSearchShortcuts([binding({shortcut:"",enabled:false})])).toHaveLength(1);expect(new Set(SHORTCUT_ACTIONS.map(action=>action.id)).size).toBe(SHORTCUT_ACTIONS.length);
});
test("legacy bindings migrate once and explicit removal stays removed",()=>{
 expect(migrateSearchShortcuts({})).toEqual(DEFAULT_SEARCH_SHORTCUTS);
 const legacy={categoryPreviousShortcut:"",categoryNextShortcut:"Alt+ArrowRight",categoryCycleShortcut:"Ctrl+K"};
 const migrated=normalizeSettings(legacy);expect(migrated.searchShortcuts.map(item=>[item.action,item.shortcut,item.reverse])).toEqual([["category.next","Alt+ArrowRight",false],["category.next","Ctrl+K",true]]);
 expect(normalizeSettings({...legacy,searchShortcuts:[]}).searchShortcuts).toEqual([]);
 expect("categoryNextShortcut" in migrated).toBe(false);expect(normalizeSettings({categoryPreviousShortcut:"",categoryNextShortcut:"",categoryCycleShortcut:""}).searchShortcuts).toEqual([]);
});
