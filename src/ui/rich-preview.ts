import {Component,MarkdownRenderer,type App} from 'obsidian';
import {boundedPreview} from '../search/preview-source.ts';
import {literalSearchOccurrences} from '../search/content-matches.ts';

/** Bounded render queue, scoped to a result page. / 限制并发解析，每页独立释放。 */
export class RichPreview extends Component {
  private pending:Array<()=>Promise<void>>=[];
  private running=0;
  private stopped=false;
  constructor(private app:App,private report:(error:unknown)=>void,private navigate:(target:string,external:boolean,path:string)=>void){super();}
  render(parent:HTMLElement,source:string,path:string,terms:string[]):void {
    parent.addClass('primecore-rich-preview','markdown-rendered','markdown-preview-view');parent.setText(source);
    this.registerDomEvent(parent,'click',event=>{
      const target=(event.target as Element).closest('a,button,input');if(!target)return;
      event.stopPropagation();
      if(target.matches('a')){event.preventDefault();const href=target.getAttribute('data-href')||target.getAttribute('href');if(href)this.navigate(href,/^(?:https?:|mailto:|obsidian:)/i.test(href),path);}
    });
    for(const event of ['touchstart','touchend'] as const)this.registerDomEvent(parent,event,ev=>{if((ev.target as Element).closest('a,button,input'))ev.stopPropagation();},{passive:true});
    this.pending.push(async()=>{
      if(this.stopped||!parent.isConnected)return;
      const staging=parent.createDiv();staging.remove();
      await MarkdownRenderer.render(this.app,boundedPreview(source),staging,path,this);
      if(this.stopped||!parent.isConnected)return;
      parent.replaceChildren(...Array.from(staging.childNodes));
      for(const input of parent.querySelectorAll<HTMLInputElement>('input')){input.disabled=true;input.tabIndex=-1;}
      // Highlight text nodes, never rewrite rendered markup. / 仅高亮文本，不改写渲染标记。
      const walker=parent.ownerDocument.createTreeWalker(parent,4);
      const nodes:Text[]=[];let node:Node|null;
      while((node=walker.nextNode()))if(node.nodeType===3&&!node.parentElement?.closest('script,style,mark'))nodes.push(node as Text);
      const wanted=[...new Set(terms.filter(Boolean))];
      for(const text of nodes){
        const value=text.data;
        // Match against original text: Unicode case folding can change string length.
        // 在原文上匹配，避免 Unicode 转小写改变长度后使高亮偏移。
        const streams=wanted.map(term=>{const iterator=literalSearchOccurrences(value,term);return {iterator,current:iterator.next()};});
        const fragment=createFragment();let at=0,changed=false;
        while(at<value.length){
          for(const stream of streams)while(stream.current.value&&stream.current.value.index<at)stream.current=stream.iterator.next();
          const found=streams.flatMap(stream=>stream.current.value?[stream.current.value]:[]).sort((a,b)=>a.index-b.index||b[0].length-a[0].length)[0];
          if(!found)break;
          fragment.append(value.slice(at,found.index));
          const mark=fragment.createEl('mark');mark.textContent=found[0];
          at=found.index+found[0].length;changed=true;
        }
        if(changed){fragment.append(value.slice(at));text.replaceWith(fragment);}
      }
    });this.pump();
  }
  private pump():void {
    while(!this.stopped&&this.running<2&&this.pending.length){
      const task=this.pending.shift();this.running++;
      void Promise.resolve().then(task).catch(this.report).finally(()=>{this.running--;this.pump();});
    }
  }
  onunload():void {this.stopped=true;this.pending=[];}
}
