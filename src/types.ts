export type SearchMode = 'vault' | 'global' | 'web';
export type SortMode = 'relevance' | 'mtime-desc' | 'mtime-asc' | 'ctime-desc' | 'ctime-asc' | 'alpha-asc' | 'alpha-desc';
export interface SearchEngine {id:string;name:string;url:string;suggest:string;enabled:boolean}
export interface WebSource {label:string;domain:string}
export interface SearchPreset {name:string;mode:'白名单'|'黑名单';excludeFolders:string[];icon?:string}
export interface IndexSettings {enabled:boolean;content:boolean;bigrams:boolean;debug:boolean}
export interface SearchSettings {
  excludePaths:string[];defaultMode:SearchMode;placeholderType:'unified'|'custom';placeholder:string;
  placeholder_global:string;placeholder_vault:string;placeholder_web:string;
  browserTarget:'external'|'internal'|'internal-window';historyRetentionMode:'forever'|'custom'|'disabled';historyRetentionDays:number;
  recentFilesEnabled:boolean;recentFilesDays:number;recentFilesLimit:number;newTabSearch:boolean;
  /** Which record view opens when the search bar is idle. / 空闲时默认显示哪种记录视图。 */
  defaultRecordView:'recent'|'history';
  searchMarkdown:boolean;historyPageSize:number;dropdownPageSize:number;searchSheetBreakpoint:number;
  vaultContentSearch:boolean;vaultContentSearchMaxResults:number;searchWikiLinks:boolean;searchMdLinks:boolean;
  searchBookmarks:boolean;searchTags:boolean;searchCommands:boolean;searchNonMarkdown:boolean;searchProperties:boolean;
  extendedContext:boolean;vaultSortMode:SortMode;limitContentResults:boolean;searchPresets:SearchPreset[];defaultPreset:string;
  activeEngineId:string|null;webSources:WebSource[];engines:SearchEngine[];
  searchIndex:IndexSettings;debug:boolean;
}
export type SettingsPatch=Partial<SearchSettings>;
export interface BookmarkTarget {type?:string;title?:string;path?:string;url?:string;query?:string;items?:BookmarkTarget[]}
export type HistoryTarget = {kind:'file';path:string;hit?:ContentMatch} | {kind:'command';id:string} | {kind:'url';url:string} | {kind:'bookmark';bookmark:BookmarkTarget};
export interface SearchHistoryRecord {q:string;mode:SearchMode;ts:number;file?:string;date?:string;target?:HistoryTarget}
/** One recently opened thing: a file path or an executed command id.
 * 一条最近打开记录：文件路径或已执行命令的 id。 */
export interface RecentFileRecord {
  /** File path; for command records this stores the command id.
   *  文件路径；命令记录在此存命令 id。 */
  path:string;
  ts:number;
  source?:'quick-switcher';
  /** Absent means a file record, preserving legacy entries.
   *  缺省视为文件记录，兼容旧数据。 */
  kind?:'file'|'command';
  /** Command display name captured when it ran. / 执行时记录的命令名称。 */
  label?:string;
}
export interface SearchItem {
  label:string;action:()=>void;icon?:string;iconTitle?:string;path?:string;sub?:string;snippet?:string;
  /** 别名标题指向原文件。 / Alias title pointing to the original file. */
  alias?:boolean;
  /** Relevance score; higher first when sorting by relevance. */
  score?:number;
  terms?:string[];hits?:ContentMatch[];onMatch?:(hit:ContentMatch)=>void;twoLine?:boolean;
  /** 次行以 Obsidian 原生标签胶囊显示的标签。 / Tags rendered as native pills on the second line. */
  tagList?:string[];
  trailing?:{icon:string;title:string;onClick:()=>void};
}
export interface SearchGroup {title:string;items:SearchItem[]}
export interface PersistenceHost {
  loadData():Promise<unknown>;
  saveData(settings:SearchSettings):Promise<unknown>;
  report(level:'warn'|'error'|'log',...args:unknown[]):void;
}

export type ResultCategory = 'files'|'nonMarkdown'|'markdown'|'content'|'tags'|'wikiLinks'|'mdLinks'|'bookmarks'|'properties'|'commands'|'web';
export interface PathFilter {mode:SearchPreset['mode'];paths:string[]}
export interface SearchSession { query:string; mode:SearchMode; category:ResultCategory; settings:SearchSettings; temporaryFilter?:PathFilter;quickExcludedPaths?:string[] }
export interface SearchMountOptions { presentation?:'floating'|'page'; session?:SearchSession; restoreKey?:string }
export interface ContentMatch {
  text:string; start:number; end:number; match:string; before:string; after:string;
  location?:string;
  tag?:{value:string;field?:'tags'|'tag'};
}
