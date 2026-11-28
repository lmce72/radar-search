import {requestUrl} from 'obsidian';
import type {SearchSettings} from '../types.ts';

export interface AiSource {title:string;url:string}
export interface AiSearchResult {answer:string;sources:AiSource[];provider:string;note?:string}
export type AiProvider = SearchSettings['aiProvider'];

export const AI_PROVIDERS: Record<AiProvider,{label:string;free:string;endpoint:string}> = {
  tavily:{label:'Tavily',free:'每月约 1,000 次免费额度；直接返回 AI 摘要与来源。',endpoint:'https://api.tavily.com/search'},
  exa:{label:'Exa',free:'注册赠送免费额度；返回神经搜索来源，不保证生成摘要。',endpoint:'https://api.exa.ai/search'},
  jina:{label:'Jina AI Search',free:'提供免费额度/限速；返回网页摘要 Markdown。',endpoint:'https://s.jina.ai/'},
  custom:{label:'自定义 / 其它 API',free:'可接入 Brave Search、Serper、Perplexity 或 OpenAI 兼容接口；需填写完整地址。',endpoint:''}
};

const AI_REQUEST_TIMEOUT_MS=20000;
function withTimeout<T>(promise:Promise<T>,ms=AI_REQUEST_TIMEOUT_MS):Promise<T> {
  return new Promise<T>((resolve,reject)=>{
    const timer=window.setTimeout(()=>reject(new Error('请求超时，请检查网络、代理或 API 配额')),ms);
    promise.then(value=>{window.clearTimeout(timer);resolve(value);},error=>{window.clearTimeout(timer);reject(error instanceof Error?error:new Error(String(error)));});
  });
}
type AiSettings = Pick<SearchSettings,'aiProvider'|'aiApiKey'|'aiEndpoint'|'aiModel'>;
type Json = Record<string,unknown>;
function asObject(value:unknown):Json {return value&&typeof value==='object'&&!Array.isArray(value)?value as Json:{};}
function text(value:unknown):string {return typeof value==='string'?value:'';}
function sources(value:unknown):AiSource[] {
  if(!Array.isArray(value))return [];
  const seen=new Set<string>();
  return value.flatMap(item=>{
    if(typeof item==='string'){
      if(!/^https?:\/\//i.test(item)||seen.has(item))return [];
      seen.add(item);return [{title:item,url:item}];
    }
    const row=asObject(item);
    const url=text(row.url)||text(row.link)||text(row.href);
    if(!/^https?:\/\//i.test(url)||seen.has(url))return [];
    seen.add(url);
    return [{title:text(row.title)||text(row.name)||text(row.label)||url,url}];
  });
}
function answerFrom(data:unknown):string {
  const row=asObject(data);
  const choices=Array.isArray(row.choices)?row.choices:[];
  const choice=asObject(choices[0]);
  return text(row.answer)||text(row.content)||text(row.output)||text(row.text)
    ||text(asObject(choice.message).content)||'';
}
function sourceListFrom(data:unknown):AiSource[] {
  const row=asObject(data);
  return sources(row.results).concat(sources(row.sources),sources(row.citations),sources(row.data));
}
async function readBody(response:{json:unknown;text:string}):Promise<unknown> {
  try {return response.json;} catch {return response.text;}
}
function endpointFor(settings:AiSettings):string {
  if(settings.aiProvider==='custom')return settings.aiEndpoint.trim();
  return AI_PROVIDERS[settings.aiProvider].endpoint;
}

/** Preview: ask a search API for an answer and sources. API keys stay in data.json. */
export async function requestAiSearch(settings:AiSettings,query:string):Promise<AiSearchResult> {
  const provider=settings.aiProvider;
  const key=settings.aiApiKey.trim();
  const endpoint=endpointFor(settings);
  if(!endpoint)throw new Error('请先在设置中填写自定义 API 地址');
  if(!key&&provider!=='jina')throw new Error(`请先在设置中填写 ${AI_PROVIDERS[provider].label} 的 API Key`);
  const send=(params:Parameters<typeof requestUrl>[0])=>withTimeout(requestUrl(params));
  try {
    if(provider==='tavily'){
      const response=await send({
        url:endpoint,method:'POST',throw:false,
        headers:{'Content-Type':'application/json',Authorization:`Bearer ${key}`},
        body:JSON.stringify({query,include_answer:'basic',max_results:6,search_depth:'basic'})
      });
      if(response.status>=400)throw new Error(`Tavily 返回 ${response.status}`);
      const data=await readBody(response);
      return {provider:AI_PROVIDERS[provider].label,answer:answerFrom(data),sources:sourceListFrom(data)};
    }
    if(provider==='exa'){
      const response=await send({
        url:endpoint,method:'POST',throw:false,
        headers:{'Content-Type':'application/json','x-api-key':key},
        body:JSON.stringify({query,numResults:6,contents:{text:{maxCharacters:700}}})
      });
      if(response.status>=400)throw new Error(`Exa 返回 ${response.status}`);
      const data=await readBody(response);
      const rows=asObject(data).results;
      const first=Array.isArray(rows)?asObject(rows[0]):{};
      return {provider:AI_PROVIDERS[provider].label,answer:text(first.text),sources:sources(rows),note:'Exa 返回搜索结果摘要，不是生成式回答。'};
    }
    if(provider==='jina'){
      const response=await send({
        url:endpoint+encodeURIComponent(query),method:'GET',throw:false,
        headers:{Accept:'application/json',...(key?{Authorization:`Bearer ${key}`}:{})}
      });
      if(response.status>=400)throw new Error(`Jina 返回 ${response.status}`);
      const data=await readBody(response);
      const row=asObject(data);
      const rows=Array.isArray(row.data)?row.data:[];
      return {provider:AI_PROVIDERS[provider].label,answer:answerFrom(data)||text(asObject(rows[0]).content),sources:sources(rows),note:'Jina Search 返回网页摘要。'};
    }
    const response=await send({
      url:endpoint,method:'POST',throw:false,
      headers:{'Content-Type':'application/json',...(key?{Authorization:`Bearer ${key}`}:{})},
      body:JSON.stringify({query,model:settings.aiModel||undefined})
    });
    if(response.status>=400)throw new Error(`API 返回 ${response.status}`);
    const data=await readBody(response);
    const answer=answerFrom(data);
    const list=sourceListFrom(data);
    if(!answer&&!list.length)throw new Error('响应中没有可识别的 answer/sources/choices');
    return {provider:AI_PROVIDERS[provider].label,answer,sources:list,note:'自定义接口按 { query, model } 发送，兼容 answer/sources、results 或 OpenAI choices。'};
  } catch(error) {
    if(error instanceof Error&&/返回 \d{3}/.test(error.message))throw error;
    if(error instanceof Error&&/请先在设置/.test(error.message))throw error;
    const message=error instanceof Error?error.message:String(error);
    if(/net::|ERR_|Failed to fetch|NetworkError/i.test(message))throw new Error('网络连接失败：请检查网络或代理后重试。');
    if(/\b(401|403)\b/.test(message))throw new Error('API Key 无效或没有权限，请在 AI 设置中更新。');
    if(/\b429\b/.test(message))throw new Error('请求过于频繁或免费额度已用尽，请稍后重试或更换平台。');
    throw new Error(`${AI_PROVIDERS[provider].label} 请求失败：${message}`);
  }
}

/** Platforms with free allowances, shown in settings and the preview dialog. */
export const AI_FREE_PLATFORMS = [
  'Tavily：约 1,000 次/月免费额度，返回摘要与来源',
  'Exa：注册赠送免费额度，返回搜索来源',
  'Jina AI Search：免费额度/限速，返回网页摘要',
  'Brave Search API：约 2,000 次/月免费，可通过“自定义”接入',
  'Serper：约 2,500 次免费查询，可通过“自定义”接入',
  'Perplexity API：通常为付费，可通过“自定义”接入'
] as const;
