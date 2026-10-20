import { validateSetting } from './schema.ts';
import type {SearchSettings, SettingsPatch} from '../types.ts';
import {toText} from '../shared/text.ts';

export type ModelKey = 'engines' | 'webSources' | 'searchPresets' | 'excludePaths';
export type ModelValue = Record<string, unknown> | string;
export interface FieldSpec {
  key: string;
  label: string;
  placeholder?: string;
  type?: 'toggle' | 'select' | 'paths' | 'icon' | 'fields';
  options?: Record<string, string>;
  fields?: FieldSpec[];
}
export interface ModelSpec {
  singular: string;
  create: () => ModelValue;
  strings?: boolean;
  placeholder?: string;
  fields?: FieldSpec[];
  options?: Record<string, string>;
}
export type Row = {original: ModelValue | null; value: ModelValue};

export const MODEL_SPECS: Record<ModelKey, ModelSpec> = {
  engines: {
    singular:'引擎',create:()=>({id:`engine-${crypto.randomUUID().slice(0,8)}`,name:'',url:'',suggest:'',enabled:true}),
    fields:[
      {key:'name',label:'名称',placeholder:'例如：Google'},
      {key:'url',label:'搜索网址',placeholder:'https://www.google.com/search?q={q}'},
      {key:'enabled',label:'启用',type:'toggle'},
      {key:'advanced',label:'更多选项',type:'fields',fields:[
        {key:'id',label:'标识',placeholder:'自动生成，一般无需修改'},
        {key:'suggest',label:'建议词接口',placeholder:'选填，留空关闭建议词'}
      ]}
    ]
  },
  webSources: {
    singular:'信息源',create:()=>({label:'',domain:''}),
    fields:[{key:'label',label:'名称',placeholder:'例如：GitHub'},{key:'domain',label:'域名',placeholder:'例如：github.com，不含 https://'}]
  },
  searchPresets: {
    singular:'预设',create:()=>({name:'',mode:'黑名单',excludeFolders:[],icon:'sliders-horizontal'}),
    fields:[
      {key:'name',label:'名称',placeholder:'例如：工作笔记'},
      {key:'mode',label:'筛选方式',type:'select',options:{'白名单':'仅搜索所选路径','黑名单':'排除所选路径'}},
      {key:'excludeFolders',label:'过滤规则',type:'paths'},
      {key:'icon',label:'图标',type:'icon',placeholder:'例如：folder、book-open'}
    ]
  },
  excludePaths:{singular:'路径',strings:true,placeholder:'例如：Projects/Archive、glob:**/assets/**、regex:/表达式/i',create:()=>''}
};
export const INDEX_FIELDS: Array<{key:string;label:string;description:string;default:boolean}> = [
  {key:'enabled',label:'启用搜索索引',description:'在后台建立索引，减少逐次扫描文件。',default:true},
  {key:'content',label:'索引笔记正文',description:'将 Markdown 正文纳入全文索引。',default:true},
  {key:'bigrams',label:'中文双字索引',description:'改善中文和其他 CJK 文字的搜索召回。',default:true},
  {key:'debug',label:'索引调试日志',description:'排查索引问题时开启。',default:false}
];
export function booleanFields(key: string, _value: unknown): typeof INDEX_FIELDS {
  if(key!=='searchIndex')throw new Error('未知开关模型：'+key);
  return INDEX_FIELDS;
}
// Stable row identities preserve default selections through edits.
// 稳定行标识保留重命名或删除前后的默认选择对应关系。
export class CollectionDraft {
  key: ModelKey;
  spec: ModelSpec;
  rows: Row[] = [];

  constructor(key: ModelKey,value: unknown) {this.key=key;this.spec=MODEL_SPECS[key];this.reset(value);}
  reset(value: unknown) {
    const items = Array.isArray(value) ? structuredClone(value) as ModelValue[] : [];
    this.rows=items.map(item=>({original:structuredClone(item),value:item}));
  }
  add() {const row: Row={original:null,value:this.spec.create()};this.rows.push(row);return row;}
  remove(row: Row) {this.rows=this.rows.filter(item=>item!==row);}
  collect(): unknown {
    const value=this.rows.map(({value})=>{
      if(this.spec.strings)return toText(value).trim();
      const clone=structuredClone(value) as Record<string, unknown>;
      for(const field of (this.spec.fields||[]).flatMap(field=>field.fields||[field]))if(typeof clone[field.key]==='string')clone[field.key]=(clone[field.key] as string).trim();
      if(Array.isArray(clone.excludeFolders))clone.excludeFolders=clone.excludeFolders.map(path=>String(path).trim());
      return clone;
    });
    if(this.spec.strings) {
      const strings = value as string[];
      if(strings.some(item=>!item))throw new Error('请填写每行内容，或删除空行。');
      if(new Set(strings).size!==strings.length)throw new Error('列表中有重复条目，请合并或删除。');
    }
    if(this.key==='searchPresets') {
      const presets = value as Array<Record<string, unknown>>;
      if(new Set(presets.map(item=>item.name)).size!==presets.length)throw new Error('预设名称不能重复。');
      if(presets.some(item=>(item.excludeFolders as string[]).some(path=>!path.trim())))throw new Error('预设路径不能为空，请填写路径或删除空行。');
      if(presets.some(item=>item.mode==='白名单'&&!(item.excludeFolders as string[]).length))throw new Error('仅搜索所选路径的预设，需要至少添加一个路径。');
    }
    if(this.key==='engines')(value as Array<Record<string, unknown>>).forEach((item,index)=>{
      if(!item.name)throw new Error(`第 ${index+1} 个引擎：请填写名称。`);
      if(!toText(item.url).includes('{q}'))throw new Error(`第 ${index+1} 个引擎：搜索网址需包含 {q}，用它表示输入的关键词。`);
    });
    if(this.key==='webSources')(value as Array<Record<string, unknown>>).forEach((item,index)=>{
      if(!item.label)throw new Error(`第 ${index+1} 个信息源：请填写名称。`);
      if(!item.domain||toText(item.domain).includes('://'))throw new Error(`第 ${index+1} 个信息源：填写域名（例如 github.com），不要包含 https://。`);
    });
    return validateSetting(this.key,value);
  }
  changes(settings: SearchSettings): SettingsPatch {
    const value=this.collect();
    const changes=({[this.key]:value}) as SettingsPatch;
    if(this.key==='searchPresets'&&settings.defaultPreset) {
      const index=this.rows.findIndex(row=>(row.original as Record<string, unknown> | null)?.name===settings.defaultPreset);
      changes.defaultPreset=index<0?'':(value as Array<Record<string, unknown>>)[index].name as string;
    }
    if(this.key==='engines'&&settings.activeEngineId) {
      const index=this.rows.findIndex(row=>(row.original as Record<string, unknown> | null)?.id===settings.activeEngineId);
      changes.activeEngineId=index<0?null:(value as Array<Record<string, unknown>>)[index].id as string;
    }
    return changes;
  }
}
