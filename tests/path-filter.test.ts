import {test,expect} from 'bun:test';
import {compilePathRule,excludedByFilter,presetFromFilter,FILTER_EXAMPLES,validatePathFilter,mergeRulePaths} from '../src/search/path-filter.ts';
import {validateSetting} from '../src/settings/schema.ts';
import {sortSearchItems} from '../src/search/sort.ts';

test('glob assets rules cover root and every nested directory without excluding assets-like names',()=>{
  for(const pattern of ['glob:**/assets/**','**/assets/**','glob:**/assets']) {
    const excluded=excludedByFilter({mode:'黑名单',paths:[pattern]});
    for(const path of ['assets/a.md','Projects/assets/a.md','Projects/Deep/assets/images/a.png'])expect(excluded(path)).toBe(true);
    for(const path of ['assets-notes/a.md','Projects/my-assets/a.md','Projects/assets.md'])expect(excluded(path)).toBe(false);
  }
});
test('regex flags, repeated calls, braces and directory boundaries are supported',()=>{
  const regex=compilePathRule('regex:/\\.(png|pdf)$/ig');
  expect(regex('folder/a.PNG')).toBe(true);expect(regex('folder/a.PNG')).toBe(true);expect(regex('folder/a.md')).toBe(false);
  const braces=compilePathRule('glob:**/{assets,attachments,附件}/**');
  expect(braces('资料/附件/test.md')).toBe(true);expect(braces('attachments/photo.png')).toBe(true);
  const literal=compilePathRule('Work');expect(literal('Work/a.md')).toBe(true);expect(literal('Workspace/a.md')).toBe(false);
  expect(excludedByFilter({mode:'白名单',paths:['glob:**/*.md']})('Folder/a.png')).toBe(true);
  expect(excludedByFilter({mode:'白名单',paths:['glob:**/*.md']})('Folder/a.md')).toBe(false);
});
test('invalid filters are rejected before updating temporary or saved configuration',()=>{
  for(const pattern of ['regex:/[/','regex:/abc/z','glob:**/[abc','../outside',''])expect(()=>compilePathRule(pattern)).toThrow();
  expect(()=>validatePathFilter({mode:'白名单',paths:[]})).toThrow();
  expect(()=>validatePathFilter({mode:'黑名单',paths:['Work','Work']})).toThrow();
  expect(()=>validateSetting('excludePaths',['regex:/[/'])).toThrow();
  expect(()=>validateSetting('searchPresets',[{name:'Bad',mode:'黑名单',excludeFolders:['glob:**/[abc']}])).toThrow();
});
test('built-in examples are valid and a named preset is independent of its temporary draft',()=>{
  for(const example of FILTER_EXAMPLES)expect(()=>validatePathFilter({mode:example.mode,paths:[example.pattern]})).not.toThrow();
  const draft={mode:'黑名单' as const,paths:['glob:**/assets/**']};
  const preset=presetFromFilter(draft,'  Assets filter  ',[]);
  expect(preset.name).toBe('Assets filter');expect(preset.excludeFolders).toEqual(draft.paths);expect(preset.excludeFolders).not.toBe(draft.paths);
  expect(()=>presetFromFilter(draft,' ',[])).toThrow('名称');
  expect(()=>presetFromFilter(draft,'assets FILTER',[preset])).toThrow('同名');
  expect(validateSetting('searchPresets',[preset])).toEqual([preset]);
});
test('result sorting respects label and file timestamps while relevance preserves ranking',()=>{
  const items=[{label:'Beta',path:'b.md'},{label:'Alpha',path:'a.md'}];
  const fileFor=(p:string)=>({stat:{mtime:p==='b.md'?1:2,ctime:p==='b.md'?4:3}});
  expect(sortSearchItems(items,'alpha-asc',fileFor)[0].label).toBe('Alpha');
  expect(sortSearchItems(items,'mtime-desc',fileFor)[0].label).toBe('Alpha');
  expect(sortSearchItems(items,'ctime-desc',fileFor)[0].label).toBe('Beta');
  expect(sortSearchItems(items,'relevance',fileFor)).toBe(items);
  expect(items[0].label).toBe('Beta');
});

test('reusing another preset copies trimmed unique rules without its mode',()=>{
  expect(mergeRulePaths(['Docs'],[' Work ','Docs','','Assets'])).toEqual(['Docs','Work','Assets']);
});
