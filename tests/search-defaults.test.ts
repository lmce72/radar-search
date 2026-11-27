import {test,expect} from 'bun:test';
import {withResultPresentation} from '../src/ui/result-presentation.ts';
import {DEFAULT_SETTINGS} from '../src/settings/schema.ts';
import {SPECIAL_SEARCH_OPTIONS,refreshedSearchSettings} from '../src/search/special-search-options.ts';
import type {SearchBarCtor} from '../src/ui/search-bar-host.ts';
const FakeBase=class {} as unknown as SearchBarCtor;

test('source changes save by default and wait for persistence before committing shared defaults',async()=>{
 for(const option of SPECIAL_SEARCH_OPTIONS){
  const settings=structuredClone(DEFAULT_SETTINGS),original=settings[option.key];let release:()=>void=()=>{};
  const pending=new Promise<void>(resolve=>{release=resolve;});
  const fixture=new (withResultPresentation(FakeBase))();
  Object.assign(fixture,{[option.field]:original,cfg:structuredClone(settings),_barLeft:null,_temporarySearchOptions:false,_sourceSaving:false,_refreshSourceResults(){},plugin:{settings,components:new Map(),updateSetting:async(key,value)=>{await pending;settings[key]=value;}},_log(){throw Error('Unexpected save failure');}});
  const saving=fixture._setSourceEnabled(option.key,!original);
  expect(fixture._sourceSaving).toBe(true);expect(settings[option.key]).toBe(original);
  release();await saving;expect(settings[option.key]).toBe(!original);expect(fixture[option.field]).toBe(!original);expect(fixture._sourceSaving).toBe(false);
 }
});
test('temporary source changes stay local and disabling temporary mode commits current choices together',async()=>{
 const settings=structuredClone(DEFAULT_SETTINGS);let writes=0;
 const fixture=new (withResultPresentation(FakeBase))();
 Object.assign(fixture,{_searchTags:settings.searchTags,cfg:structuredClone(settings),_barLeft:null,_temporarySearchOptions:true,_sourceSaving:false,_refreshSourceResults(){},plugin:{settings,components:new Map(),updateSetting:async()=>{writes++;},updateSettings:async changes=>{writes++;Object.assign(settings,changes);}},_log(){}});
 for(const option of SPECIAL_SEARCH_OPTIONS)fixture[option.field]=settings[option.key];
 await fixture._setSourceEnabled('searchTags',!settings.searchTags);
 expect(writes).toBe(0);expect(fixture._searchTags).toBe(!settings.searchTags);expect(fixture.cfg.searchTags).toBe(!settings.searchTags);
 fixture.cfg.markdownElementTypes=['bold','code'];
 await fixture._setTemporarySearchOptions(false);
 expect(writes).toBe(1);expect(fixture._temporarySearchOptions).toBe(false);expect(settings.searchTags).toBe(false);expect(settings.markdownElementTypes).toEqual(['bold','code']);
 expect(fixture._searchTags).toBe(false);expect(fixture.cfg.searchTags).toBe(false);
});
test('failed promotion remains temporary and keeps the draft for a successful retry',async()=>{
 const settings=structuredClone(DEFAULT_SETTINGS),before=structuredClone(settings);let fail=true;const errors:unknown[]=[];
 const fixture=new (withResultPresentation(FakeBase))();
 Object.assign(fixture,{cfg:structuredClone(settings),_temporarySearchOptions:true,_sourceSaving:false,_sourcePending:0,_refreshSourceResults(){},plugin:{settings,components:new Map(),updateSettings:async changes=>{if(fail)throw Error('Disk unavailable');Object.assign(settings,changes);}},_log:(...args)=>errors.push(args)});
 for(const option of SPECIAL_SEARCH_OPTIONS)fixture[option.field]=settings[option.key];
 fixture._searchTags=false;fixture.cfg.searchTags=false;fixture.cfg.markdownElementTypes=['callout'];
 await fixture._setTemporarySearchOptions(false);
 expect(settings).toEqual(before);expect(fixture._temporarySearchOptions).toBe(true);expect(fixture.cfg.markdownElementTypes).toEqual(['callout']);expect(fixture._sourceSaving).toBe(false);expect(errors).toHaveLength(1);
 fail=false;await fixture._setTemporarySearchOptions(false);expect(fixture._temporarySearchOptions).toBe(false);expect(settings.searchTags).toBe(false);expect(settings.markdownElementTypes).toEqual(['callout']);
});
test('promotion waits for storage, prevents duplicate commits and syncs only permanent peers',async()=>{
 const settings=structuredClone(DEFAULT_SETTINGS);let release:()=>void=()=>{};let writes=0;
 const pending=new Promise<void>(resolve=>{release=resolve;});
 const peer={container:{},_temporarySearchOptions:false,cfg:structuredClone(settings),_refreshSourceResults(){}},temporary={container:{},_temporarySearchOptions:true,cfg:structuredClone(settings),_refreshSourceResults(){}};
 const fixture=new (withResultPresentation(FakeBase))();
 Object.assign(fixture,{container:{},cfg:structuredClone(settings),_temporarySearchOptions:true,_sourcePending:0,_refreshSourceResults(){},plugin:{settings,components:new Map([[peer.container,{component:peer}],[temporary.container,{component:temporary}]]),updateSettings:async changes=>{writes++;await pending;Object.assign(settings,changes);}},_log(){throw Error('Unexpected persistence error');}});
 for(const option of SPECIAL_SEARCH_OPTIONS)fixture[option.field]=settings[option.key];
 fixture._searchTags=false;fixture.cfg.searchTags=false;fixture.cfg.markdownElementTypes=['bold'];
 const saving=fixture._setTemporarySearchOptions(false);await fixture._setTemporarySearchOptions(false);
 expect(writes).toBe(1);expect(fixture._temporarySearchOptions).toBe(true);expect(fixture._sourceModeSaving).toBe(true);expect(settings.searchTags).toBe(true);
 release();await saving;expect(fixture._temporarySearchOptions).toBe(false);expect(peer.cfg.searchTags).toBe(false);expect(peer.cfg.markdownElementTypes).toEqual(['bold']);expect(peer.cfg.markdownElementTypes).not.toBe(fixture.cfg.markdownElementTypes);expect(temporary.cfg.searchTags).toBe(true);expect(temporary.cfg.markdownElementTypes).toEqual(DEFAULT_SETTINGS.markdownElementTypes);
});
test('refreshing unrelated global preferences preserves temporary source and element choices',()=>{
 const settings={...structuredClone(DEFAULT_SETTINGS),browserTarget:'internal' as const};
 const local={...structuredClone(DEFAULT_SETTINGS),searchTags:false,markdownElementTypes:['callout'] as const};
 const session={temporaryOptions:true,settings:{...local,markdownElementTypes:[...local.markdownElementTypes]}};
 const next=refreshedSearchSettings(settings,session);
 expect(next.browserTarget).toBe('internal');expect(next.searchTags).toBe(false);expect(next.markdownElementTypes).toEqual(['callout']);expect(next.markdownElementTypes).not.toBe(session.settings.markdownElementTypes);
 expect(refreshedSearchSettings(settings,{...session,temporaryOptions:false})).toEqual(settings);
});
test('failed source persistence rolls back and a later retry can succeed',async()=>{
 const settings=structuredClone(DEFAULT_SETTINGS);const errors:unknown[]=[];let fail=true;
 const fixture=new (withResultPresentation(FakeBase))();
 Object.assign(fixture,{_searchTags:true,cfg:structuredClone(settings),_barLeft:null,_temporarySearchOptions:false,_sourceSaving:false,_refreshSourceResults(){},plugin:{settings,components:new Map(),updateSetting:async(key,value)=>{if(fail)throw Error('Disk unavailable');settings[key]=value;}},_log:(...args)=>{errors.push(args);}});
 await fixture._setSourceEnabled('searchTags',false);expect(fixture._searchTags).toBe(true);expect(fixture.cfg.searchTags).toBe(true);expect(fixture._sourceSaving).toBe(false);expect(errors).toHaveLength(1);
 fail=false;await fixture._setSourceEnabled('searchTags',false);expect(settings.searchTags).toBe(false);expect(fixture._searchTags).toBe(false);
});

test('saved source changes reach persistent peers while temporary peers retain their local choices',async()=>{
 const settings=structuredClone(DEFAULT_SETTINGS);
 const peer={container:{},_temporarySearchOptions:false,_searchTags:true,cfg:structuredClone(settings),_refreshSourceResults(){}},temporary={...peer,container:{},_temporarySearchOptions:true,cfg:structuredClone(settings)};
 const fixture=new (withResultPresentation(FakeBase))();
 Object.assign(fixture,{container:{},_searchTags:true,cfg:structuredClone(settings),_barLeft:null,_temporarySearchOptions:false,_sourceSaving:false,_refreshSourceResults(){},plugin:{settings,components:new Map([[peer.container,{component:peer}],[temporary.container,{component:temporary}]]),updateSetting:async(key,value)=>{settings[key]=value;}},_log(){}});
 await fixture._setSourceEnabled('searchTags',false);
 expect(peer._searchTags).toBe(false);expect(peer.cfg.searchTags).toBe(false);
 expect(temporary._searchTags).toBe(true);expect(temporary.cfg.searchTags).toBe(true);
});
