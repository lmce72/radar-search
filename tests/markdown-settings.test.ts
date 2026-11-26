import {test,expect} from 'bun:test';
import {normalizeSettings,validateSetting,DEFAULT_SETTINGS} from '../src/settings/schema.ts';
import {ALL_MARKDOWN_ELEMENTS} from '../src/search/markdown-elements.ts';
import {resultCategoryStates} from '../src/search/result-categories.ts';

test('element preferences persist partial and empty selections and initialize every type for existing settings',()=>{
 expect(normalizeSettings({}).markdownElementTypes).toEqual(ALL_MARKDOWN_ELEMENTS);
 expect(normalizeSettings({markdownElementTypes:['heading','bold']}).markdownElementTypes).toEqual(['heading','bold']);
 expect(normalizeSettings({markdownElementTypes:[]}).markdownElementTypes).toEqual([]);
 for(const value of [['unknown'],['bold','bold'],[null],'bold'])expect(()=>validateSetting('markdownElementTypes',value)).toThrow();
});
test('an empty Markdown category stays selectable so its filters can be re-enabled',()=>{
 const settings={...structuredClone(DEFAULT_SETTINGS),searchMarkdown:true,markdownElementTypes:[]};
 const category=resultCategoryStates(settings,'vault','needle',[],'markdown').find(value=>value.id==='markdown');
 expect(category.selected).toBe(true);expect(category.disabled).toBe(false);expect(category.count).toBe(0);
});
