import {Component,MarkdownRenderer,Modal,Setting} from 'obsidian';
import {raiseModalAboveLayers} from './modal-layer.ts';
import {AI_FREE_PLATFORMS,AI_PROVIDERS,requestAiSearch,type AiSearchResult} from '../search/ai-search.ts';
import type RadarSearchPlugin from '../main.ts';

/** Preview AI answer dialog with an editable question and source list.
 *  AI 搜索预览弹窗：可编辑问题、查看摘要与来源。 */
export class AiSearchModal extends Modal {
  private renderer=new Component();
  private status!:HTMLElement;
  private answerEl!:HTMLElement;
  private sourcesEl!:HTMLElement;
  private input!:HTMLInputElement;
  private askButton!:HTMLButtonElement;
  private busy=false;

  constructor(private plugin:RadarSearchPlugin,private initialQuery:string){super(plugin.app);}

  onOpen():void {
    this.renderer.load();
    raiseModalAboveLayers(this);
    this.modalEl.addClass('primecore-ai-modal');
    this.setTitle('AI 搜索 · preview');
    const provider=AI_PROVIDERS[this.plugin.settings.aiProvider];
    const key=this.plugin.settings.aiApiKey.trim();
    const configured=this.plugin.settings.aiProvider==='jina'||!!key||(this.plugin.settings.aiProvider==='custom'&&!!this.plugin.settings.aiEndpoint.trim());

    this.contentEl.createDiv({cls:'setting-item-description',text:`当前平台：${provider.label}${key?' · 已配置 API Key':' · 未配置 API Key'}。${provider.free}`});
    const ask=this.contentEl.createDiv({cls:'primecore-ai-ask'});
    this.input=ask.createEl('input',{type:'text',attr:{placeholder:'向 AI 提问…','aria-label':'AI 问题',spellcheck:'false',autocapitalize:'none'}});
    this.input.value=this.initialQuery;
    this.askButton=ask.createEl('button',{cls:'primecore-ai-submit',attr:{type:'button'},text:'提问'});
    this.status=this.contentEl.createDiv({cls:'setting-item-description',attr:{role:'status'}});
    this.answerEl=this.contentEl.createDiv({cls:'primecore-rich-preview markdown-rendered'});
    this.sourcesEl=this.contentEl.createDiv({cls:'primecore-ai-sources'});

    const actions=new Setting(this.contentEl);
    actions.addButton(control=>control.setButtonText('打开 AI 设置').onClick(()=>{this.close();this.plugin.openSettings();}));
    actions.addButton(control=>control.setButtonText('关闭').onClick(()=>this.close()));
    const free=this.contentEl.createDiv({cls:'primecore-ai-free'});
    free.createDiv({cls:'setting-item-description',text:'常见免费额度平台（以平台政策为准）：'});
    for(const line of AI_FREE_PLATFORMS)free.createDiv({cls:'setting-item-description',text:'· '+line});

    this.input.addEventListener('keydown',event=>{
      if(event.key!=='Enter'||event.isComposing)return;
      event.preventDefault();void this.ask();
    });
    this.askButton.addEventListener('click',()=>{void this.ask();});
    if(!configured){
      this.status.setText('尚未配置 API key，请先点击“打开 AI 设置”选择平台并填写密钥。');
      this.input.focus();
      return;
    }
    if(this.initialQuery.trim())void this.ask();
    else this.input.focus();
  }

  private async ask():Promise<void> {
    if(this.busy)return;
    const query=this.input.value.trim();
    if(!query){this.status.setText('请输入要问 AI 的问题。');this.input.focus();return;}
    this.busy=true;this.askButton.disabled=true;
    this.answerEl.empty();this.sourcesEl.empty();
    this.status.setText('正在请求…（最多 20 秒）');
    try {
      const result=await requestAiSearch(this.plugin.settings,query);
      if(!this.contentEl.isConnected)return;
      this.status.setText(`${result.provider}${result.note?' · '+result.note:''}`);
      if(result.answer)await MarkdownRenderer.render(this.app,result.answer,this.answerEl,'',this.renderer);
      else this.answerEl.createDiv({cls:'setting-item-description',text:'平台未返回摘要，仅返回以下来源。'});
      this.renderSources(result);
    } catch(error) {
      if(!this.contentEl.isConnected)return;
      this.status.setText((error as Error).message);
    } finally {
      this.busy=false;this.askButton.disabled=false;
    }
  }

  private renderSources(result:AiSearchResult):void {
    if(!result.sources.length)return;
    this.sourcesEl.createDiv({cls:'setting-item-description',text:'来源'});
    for(const source of result.sources){
      const button=this.sourcesEl.createEl('button',{cls:'primecore-ai-source',attr:{type:'button'}});
      button.createSpan({cls:'primecore-ai-source-title',text:source.title});
      button.createSpan({cls:'primecore-ai-source-url',text:source.url});
      button.addEventListener('click',()=>{window.open(source.url,'_blank','noopener,noreferrer');});
    }
  }

  onClose():void {this.renderer.unload();this.contentEl.empty();}
}
