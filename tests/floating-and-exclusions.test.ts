import {test,expect} from 'bun:test';
import {floatingGeometry,unobstructedViewport} from '../src/ui/floating-geometry.ts';
import {exclusionTargets,toggleExclusion} from '../src/search/quick-exclusions.ts';
import {excludedByFilter,filterWithExclusions,presetFromFilter} from '../src/search/path-filter.ts';

test('floating panels stay within small, offset and ordinary viewports regardless of anchor position',()=>{
  for(const viewport of [{left:0,top:0,width:1200,height:720},{left:0,top:0,width:220,height:140},{left:10,top:250,width:360,height:230}]) {
    for(const top of [-40,30,300,700]) for(const natural of [50,2000]) {
      const g=floatingGeometry({left:900,top,bottom:top+40,width:700},viewport,700,natural);
      expect(g.left).toBeGreaterThanOrEqual(viewport.left);
      expect(g.left+g.width).toBeLessThanOrEqual(viewport.left+viewport.width);
      expect(g.top).toBeGreaterThanOrEqual(viewport.top);
      expect(g.top+g.maxHeight).toBeLessThanOrEqual(viewport.top+viewport.height);
    }
  }
});
test('menus flip above a low anchor and reserve the entire panel budget for header plus body',()=>{
  const g=floatingGeometry({left:50,top:620,bottom:660,width:600},{left:0,top:0,width:800,height:700},600,600);
  expect(g.upwards).toBe(true);expect(g.top+g.maxHeight).toBeLessThan(620);
});
test('bottom navigation and toolbar reserve space, including a floating navigation bar',()=>{
  const viewport={left:0,top:0,width:390,height:844};
  const bounds=unobstructedViewport(viewport,[{left:20,right:370,top:746,bottom:802},{left:0,right:390,top:702,bottom:746}]);
  expect(bounds.height).toBe(702);
  const menu=floatingGeometry({left:20,top:200,bottom:240,width:350},bounds,350,1000);
  expect(menu.top+menu.maxHeight).toBeLessThan(702);
});
test('keyboard viewport does not count hidden/offscreen navigation or subtract the keyboard twice',()=>{
  const viewport={left:0,top:50,width:390,height:350};
  expect(unobstructedViewport(viewport,[{left:0,right:390,top:746,bottom:802}])).toEqual(viewport);
  expect(unobstructedViewport(viewport,[{left:400,right:790,top:300,bottom:340}])).toEqual(viewport);
  expect(unobstructedViewport(viewport,[{left:0,right:390,top:350,bottom:390}]).height).toBe(300);
});
test('quick exclusions list the exact file and every parent level, never the vault root',()=>{
  const targets=exclusionTargets('Inbox/公众号/Linux/note.md');
  expect(targets.map(t=>[t.path,t.level])).toEqual([['Inbox/公众号/Linux/note.md',0],['Inbox/公众号/Linux',3],['Inbox/公众号',2],['Inbox',1]]);
  expect(exclusionTargets('root.md')).toHaveLength(1);
  expect(exclusionTargets('../outside.md')).toEqual([]);
});
test('temporary exclusions preserve whitelist constraints and can be saved as a complete preset',()=>{
  const filter=filterWithExclusions({mode:'白名单',paths:['Work']},['path:Work/assets']);
  const test=excludedByFilter(filter);
  expect(test('Work/note.md')).toBe(false);expect(test('Other/note.md')).toBe(true);expect(test('Work/assets/a.md')).toBe(true);
  const preset=presetFromFilter(filter,'Work without assets',[]);
  const saved=excludedByFilter({mode:preset.mode,paths:preset.excludeFolders});
  expect(saved('Other/note.md')).toBe(true);expect(saved('Work/assets/a.md')).toBe(true);
});
test('exact paths containing glob characters are not interpreted as patterns and toggles do not mutate saved data',()=>{
  const rule=exclusionTargets('Work/[notes]/a.md')[1].rule;
  const test=excludedByFilter({mode:'黑名单',paths:[rule]});
  expect(test('Work/[notes]/other.md')).toBe(true);expect(test('Work/n/other.md')).toBe(false);
  const saved=['path:Existing'];const added=toggleExclusion(saved,rule);
  expect(saved).toEqual(['path:Existing']);expect(toggleExclusion(added,rule)).toEqual(saved);
});

test('existing plain folder rules are recognized by exact quick-exclusion controls',()=>{
  expect(toggleExclusion(['Work/Archive'],'path:Work/Archive')).toEqual([]);
  expect(toggleExclusion(['Work/Archive/'],'path:Work/Archive')).toEqual([]);
});
