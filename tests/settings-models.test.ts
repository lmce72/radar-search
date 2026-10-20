import {test,expect} from 'bun:test';
import {CollectionDraft,booleanFields} from '../src/settings/models.ts';
import {DEFAULT_SETTINGS} from '../src/settings/schema.ts';
import {SettingsStore} from '../src/settings/store.ts';
import {SETTINGS_GROUPS,VAULT_OPTION_KEYS} from '../src/settings/fields.ts';

test('rename selected preset preserves its default reference and nested paths',()=>{
  const settings=structuredClone(DEFAULT_SETTINGS);
  settings.searchPresets=[{name:'Work',mode:'白名单',excludeFolders:['Projects'],icon:'folder'}];settings.defaultPreset='Work';
  const draft=new CollectionDraft('searchPresets',settings.searchPresets);(draft.rows[0].value as Record<string, unknown>).name=' Research ';
  const changes=draft.changes(settings);
  expect(changes.defaultPreset).toBe('Research');expect(changes.searchPresets[0].excludeFolders).toEqual(['Projects']);
  expect(settings.searchPresets[0].name).toBe('Work');
  draft.remove(draft.rows[0]);expect(draft.changes(settings).defaultPreset).toBe('');
});
test('editing an engine ID updates selection; deleting it restores all-engine selection',()=>{
  const settings=structuredClone(DEFAULT_SETTINGS);settings.activeEngineId='google';
  const draft=new CollectionDraft('engines',settings.engines);(draft.rows[0].value as Record<string, unknown>).id='google-work';
  expect(draft.changes(settings).activeEngineId).toBe('google-work');
  draft.remove(draft.rows[0]);expect(draft.changes(settings).activeEngineId).toBeNull();
});
test('invalid rows are blocked and draft changes never mutate saved settings',()=>{
  const settings=structuredClone(DEFAULT_SETTINGS);
  const sources=new CollectionDraft('webSources',settings.webSources);
  const row=sources.add();(row.value as Record<string, unknown>).label='Docs';(row.value as Record<string, unknown>).domain='https://example.com';
  expect(()=>sources.collect()).toThrow('不要包含 https://');
  sources.remove(row);expect(sources.collect()).toEqual(settings.webSources);
  const paths=new CollectionDraft('excludePaths',['Archive']);paths.add();expect(()=>paths.collect()).toThrow('删除空行');
  paths.rows[1].value='Archive';expect(()=>paths.collect()).toThrow('重复');
});
test('boolean editor is limited to the active index model',()=>{
  expect(booleanFields('searchIndex',{})).toHaveLength(4);
  expect(()=>booleanFields('resultGroupState',{})).toThrow('未知开关模型');
});
test('consolidated settings keep every current field reachable exactly once',()=>{
  const main=SETTINGS_GROUPS.flatMap(([,keys])=>keys);
  expect(main).toContain('vaultOptions');
  expect(VAULT_OPTION_KEYS).toHaveLength(13);
  expect(main.filter(key=>VAULT_OPTION_KEYS.includes(key))).toHaveLength(0);
  const all=main.filter(key=>key!=='vaultOptions').concat(VAULT_OPTION_KEYS);
  expect(new Set(all).size).toBe(all.length);
  expect([...all].sort()).toEqual(Object.keys(DEFAULT_SETTINGS).sort());
});
test('batch validates every field before mutating and persists related values together',async()=>{
  const saved=[];const store=new SettingsStore({loadData:async()=>null,saveData:async value=>saved.push(value),report:()=>{}});store.settings=structuredClone(DEFAULT_SETTINGS);
  expect(()=>store.updateMany({defaultPreset:'New',historyPageSize:0})).toThrow();expect(store.settings.defaultPreset).toBe('');
  await store.updateMany({searchPresets:[{name:'New',mode:'黑名单',excludeFolders:[]}],defaultPreset:'New'});
  expect(saved).toHaveLength(1);expect(saved[0].searchPresets[0].name).toBe(saved[0].defaultPreset);
});
test('failed settings writes leave committed state intact and queued writes can recover',async()=>{
  let attempts=0;const saved=[];
  const store=new SettingsStore({loadData:async()=>null,saveData:async value=>{if(++attempts===1)throw new Error('disk full');saved.push(structuredClone(value));},report:()=>{}});
  store.settings=structuredClone(DEFAULT_SETTINGS);
  const failed=store.update('defaultMode','web');
  const recovered=store.update('historyPageSize',12);
  expect(store.settings.defaultMode).toBe('vault');
  await expect(failed).rejects.toThrow('disk full');await recovered;
  expect(store.settings.defaultMode).toBe('vault');expect(store.settings.historyPageSize).toBe(12);
  expect(saved).toHaveLength(1);expect(saved[0].defaultMode).toBe('vault');
});
