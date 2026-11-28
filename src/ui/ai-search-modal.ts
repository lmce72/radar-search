import {Component,MarkdownRenderer,Modal} from 'obsidian';
import {raiseModalAboveLayers} from './modal-layer.ts';
import {AI_FREE_PLATFORMS,AI_PROVIDERS,requestAiSearch,type AiSearchResult} from '../search/ai-search.ts';
import type RadarSearchPlugin from '../main.ts';

/** Preview AI answer dialog; the search UI itself stays unchanged for now.
 *  AI 搜索预览弹窗；当前不改变搜索结果界面。 */
export class AiSearchModal extends Modal {
  private renderer=new Component();
  constructor(private plugin:RadarSearchPlugin,private query:string){super(plugin.app);}
  onOpen():void {
    this.renderer.load();
    raiseModalAboveLayers(this);
    this.modalEl.addClass('primecore-ai-modal');
    this.setTitle('AI 搜索 · preview');
    const status=this.contentEl.createDiv({cls:'setting-item-description',attr:{role:'status'},text:'正在请求…'});
    const answerEl=this.contentEl.createDiv({cls:'primecore-rich-preview markdown-rendered'});
    const sourcesEl=this.contentEl.createDiv({cls:'primecore-ai-sources'});
    const platform=AI_PROVIDERS[this.plugin.settings.aiProvider];
    status.setText(`正在向 ${platform.label} 请求：${this.query}`);
    void this.run(answerEl,sourcesEl,status);
  }
  private async run(answerEl:HTMLElement,sourcesEl:HTMLElement,status:HTMLElement):Promise<void> {
    try {
      const result=await requestAiSearch(this.plugin.settings,this.query);
      if(!this.contentEl.isConnected)return;
      status.setText(`${result.provider}${result.note?' · '+result.note:''}`);
      if(result.answer)await MarkdownRenderer.render(this.app,result.answer,answerEl,'',this.renderer);
      else answerEl.createDiv({cls:'setting-item-description',text:'平台未返回摘要，仅返回以下来源。'});
      this.renderSources(sourcesEl,result);
    } catch(error) {
      if(!this.contentEl.isConnected)return;
      status.setText((error as Error).message);
      const free=this.contentEl.createDiv({cls:'primecore-ai-free'});
      free.createDiv({cls:'setting-item-description',text:'可在 设置 → AI 搜索 · Preview 配置平台。常见免费额度平台：'});
      for(const line of AI_FREE_PLATFORMS)free.createDiv({cls:'setting-item-description',text:'· '+line});
    }
  }
  private renderSources(parent:HTMLElement,result:AiSearchResult):void {
    if(!result.sources.length)return;
    parent.empty();
    parent.createDiv({cls:'setting-item-description',text:'来源'});
    for(const source of result.sources){
      const button=parent.createEl('button',{cls:'primecore-ai-source',attr:{type:'button'}});
      button.createSpan({cls:'primecore-ai-source-title',text:source.title});
      button.createSpan({cls:'primecore-ai-source-url',text:source.url});
      button.addEventListener('click',()=>{window.open(source.url,'_blank','noopener,noreferrer');});
    }
  }
  onClose():void {this.renderer.unload();this.contentEl.empty();}
}
