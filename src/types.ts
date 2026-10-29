export type SearchMode = 'vault' | 'global' | 'web';
export type SortMode = 'relevance' | 'mtime-desc' | 'mtime-asc' | 'ctime-desc' | 'ctime-asc' | 'alpha-asc' | 'alpha-desc';
export interface SearchEngine {id:string;name:string;url:string;suggest:string;enabled:boolean}
export interface WebSource {label:string;domain:string}
export interface SearchPreset {name:string;mode:'白名单'|'黑名单';excludeFolders:string[];icon?:string}
export interface IndexSettings {enabled:boolean;content:boolean;bigrams:boolean;debug:boolean}
export interface SearchSettings {
  excludePaths:string[];defaultMode:SearchMode;placeholderType:'unified'|'custom';placeholder:string;
  placeholder_global:string;placeholder_vault:string;placeholder_web:string;
  browserTarget:'external'|'internal'|'internal-window';historyRetentionMode:'forever'|'custom';historyRetentionDays:number;
  historyPageSize:number;dropdownPageSize:number;searchSheetBreakpoint:number;
  vaultContentSearch:boolean;vaultContentSearchMaxResults:number;searchWikiLinks:boolean;searchMdLinks:boolean;
  searchBookmarks:boolean;searchTags:boolean;searchCommands:boolean;searchNonMarkdown:boolean;searchProperties:boolean;
  extendedContext:boolean;vaultSortMode:SortMode;limitContentResults:boolean;searchPresets:SearchPreset[];defaultPreset:string;
  activeEngineId:string|null;webSources:WebSource[];engines:SearchEngine[];
  searchIndex:IndexSettings;debug:boolean;
}
export type SettingsPatch=Partial<SearchSettings>;
export interface SearchHistoryRecord {q:string;mode:SearchMode;ts:number;file?:string;date?:string}
export interface SearchItem {
  label:string;action:()=>void;icon?:string;iconTitle?:string;path?:string;sub?:string;snippet?:string;
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

export type ResultCategory = 'files'|'content'|'tags'|'wikiLinks'|'mdLinks'|'bookmarks'|'properties'|'commands'|'web';
export interface PathFilter {mode:SearchPreset['mode'];paths:string[]}
export interface SearchSession { query:string; mode:SearchMode; category:ResultCategory; settings:SearchSettings; temporaryFilter?:PathFilter;quickExcludedPaths?:string[] }
export interface SearchMountOptions { presentation?:'floating'|'page'; session?:SearchSession; restoreKey?:string }
export interface ContentMatch {
  text:string; start:number; end:number; match:string; before:string; after:string;
  location?:string;
  tag?:{value:string;field?:'tags'|'tag'};
}
