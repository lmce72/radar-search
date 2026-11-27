import type {ResultCategory,SearchSettings,SearchSession} from '../types.ts';
// One contract for session switches and persisted defaults. / 会话开关与持久默认值共用契约。
export const SPECIAL_SEARCH_OPTIONS = [
  {key: 'vaultContentSearch', field: '_contentSearch', label: '内容搜索', icon: 'file-search'},
  {key: 'searchBookmarks', field: '_searchBookmarks', label: '书签', icon: 'bookmark'},
  {key: 'searchMarkdown', field: '_searchMarkdown', label: 'Markdown 元素', icon: 'text-select'},
  {key: 'searchTags', field: '_searchTags', label: '标签', icon: 'tag'},
  {key: 'searchProperties', field: '_searchProperties', label: '属性', icon: 'braces'},
  {key: 'searchCommands', field: '_searchCommands', label: '命令', icon: 'command'},
  {key: 'searchNonMarkdown', field: '_searchNonMarkdown', label: '非 md 文件', icon: 'files'},
] as const;
export type SpecialSearchKey = typeof SPECIAL_SEARCH_OPTIONS[number]['key'];

const CATEGORY_BY_KEY:Record<SpecialSearchKey,ResultCategory>={vaultContentSearch:'content',searchBookmarks:'bookmarks',searchTags:'tags',searchMarkdown:'markdown',searchProperties:'properties',searchCommands:'commands',searchNonMarkdown:'nonMarkdown'};
export function sourceOption(category:ResultCategory){return SPECIAL_SEARCH_OPTIONS.find(option=>CATEGORY_BY_KEY[option.key]===category);}
/** Refresh global preferences without discarding this bar's unsaved source choices.
 * 更新全局配置时，保留当前栏尚未保存的临时来源选择。 */
export function refreshedSearchSettings(settings:SearchSettings,session:Pick<SearchSession,'settings'|'temporaryOptions'|'temporaryFileTypes'>):SearchSettings {
  const result=structuredClone(settings);
  if(session.temporaryOptions){
    for(const option of SPECIAL_SEARCH_OPTIONS)result[option.key]=session.settings[option.key];
    result.markdownElementTypes=[...session.settings.markdownElementTypes];
  }
  if(session.temporaryFileTypes)result.attachmentFileTypes=structuredClone(session.settings.attachmentFileTypes);
  return result;
}
