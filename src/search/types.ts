import type {IndexSettings} from '../types.ts';
export interface IndexFile {path:string;basename?:string;extension?:string;stat?:{mtime:number}}
export interface IndexMetadata {
  frontmatter?:Record<string,unknown>;tags?:{tag:string}[];aliases?:string|string[];
  headings?:{level:number;heading:string}[];
}
export interface IndexAdapter {
  listFiles():IndexFile[];fileFor(path:string):IndexFile|null;
  readText(path:string):Promise<string>;getMeta(path:string):IndexMetadata|null;isExcluded?(path:string):boolean;
}
export interface IndexDocument {
  path:string;basename:string;directory:string;mtime:number;aliases:string[];tags:string[];
  tagsText:string;aliasesText:string;headings1:string;headings2:string;headings3:string;content:string;
  contentTokens?:{words:Map<string,number>;bigrams:Map<number,number>|null};
}
export interface SearchHit {
  path:string;basename:string;mtime:number;tags:string[];score:number;nameScore:number;contentScore:number;
  isNameMatch?:boolean;isContentMatch?:boolean;isDelta?:boolean;
}
export interface IndexSearchOptions {limit?:number;nameLimit?:number;contentLimit?:number;prefix?:boolean;looseFallback?:boolean}
export interface IndexSearchResponse {ready:boolean;results:SearchHit[];queryMs?:number;total?:number;fallback?:boolean}
export type IndexConfig=Partial<IndexSettings>;
