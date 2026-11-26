import {test,expect} from 'bun:test';
import {withResultPresentation} from '../src/ui/result-presentation.ts';
import {DEFAULT_SETTINGS} from '../src/settings/schema.ts';
import {SPECIAL_SEARCH_OPTIONS} from '../src/search/special-search-options.ts';
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
test('temporary source changes stay local and disabling temporary mode restores saved defaults',async()=>{
 const settings=structuredClone(DEFAULT_SETTINGS);let writes=0;
 const fixture=new (withResultPresentation(FakeBase))();
 Object.assign(fixture,{_searchTags:settings.searchTags,cfg:structuredClone(settings),_barLeft:null,_temporarySearchOptions:true,_sourceSaving:false,_refreshSourceResults(){},plugin:{settings,components:new Map(),updateSetting:async()=>{writes++;}},_log(){}});
 await fixture._setSourceEnabled('searchTags',!settings.searchTags);
 expect(writes).toBe(0);expect(fixture._searchTags).toBe(!settings.searchTags);expect(fixture.cfg.searchTags).toBe(!settings.searchTags);
 fixture._setTemporarySearchOptions(false);expect(fixture._searchTags).toBe(settings.searchTags);expect(fixture.cfg.searchTags).toBe(settings.searchTags);
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
