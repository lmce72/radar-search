// One contract for session switches and persisted defaults. / 会话开关与持久默认值共用契约。
export const SPECIAL_SEARCH_OPTIONS = [
  {key: 'vaultContentSearch', field: '_contentSearch', label: '内容搜索', icon: 'file-search'},
  {key: 'searchWikiLinks', field: '_searchWikiLinks', label: '内部链接', icon: 'brackets'},
  {key: 'searchMdLinks', field: '_searchMdLinks', label: '外部链接', icon: 'external-link'},
  {key: 'searchBookmarks', field: '_searchBookmarks', label: '书签', icon: 'bookmark'},
  {key: 'searchTags', field: '_searchTags', label: '标签', icon: 'tag'},
  {key: 'searchProperties', field: '_searchProperties', label: '属性', icon: 'braces'},
  {key: 'searchCommands', field: '_searchCommands', label: '命令', icon: 'command'},
  {key: 'searchNonMarkdown', field: '_searchNonMarkdown', label: '非 md 文件', icon: 'files'},
] as const;
export type SpecialSearchKey = typeof SPECIAL_SEARCH_OPTIONS[number]['key'];
