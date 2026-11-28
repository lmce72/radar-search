import {Component,setIcon} from 'obsidian';
import {exclusionTargets,hasExclusion,type ExclusionTarget} from '../search/quick-exclusions.ts';
import {positionFloatingElement} from './floating-geometry.ts';

interface QuickMenuOptions {
  anchor:HTMLElement;
  path:string;
  rules:()=>string[];
  toggle:(target:ExclusionTarget)=>Promise<void>;
  edit:()=>void;
  onClose:()=>void;
}

/** Lightweight quick-exclusion popover: pick a file or any parent directory and exclude it
 *  immediately, without opening the full filter editor.
 *  轻量多级排除浮层：选择文件或任意父目录后立即排除，不进入完整过滤器。 */
export class QuickExclusionMenu extends Component {
  el:HTMLDivElement|null=null;
  private targetsEl:HTMLDivElement|null=null;
  private status:HTMLDivElement|null=null;
  private busy=false;
  private lastFocused:Element|null=null;
  private initialRect:DOMRect|null=null;

  constructor(private options:QuickMenuOptions) {super();}
  open() {this.load();}

  onload() {
    const doc=this.options.anchor.ownerDocument;
    this.lastFocused=doc.activeElement;
    this.initialRect=this.options.anchor.getBoundingClientRect();
    const el=this.el=doc.body.createDiv({cls:'primecore-quick-exclusions',attr:{role:'dialog','aria-label':'多级排除'}});

    const top=el.createDiv({cls:'primecore-quick-filter-destination'});
    const heading=top.createDiv({cls:'primecore-quick-destination-items'});
    heading.createDiv({cls:'primecore-quick-context',text:'多级排除'});
    const close=top.createEl('button',{cls:'primecore-quick-close',attr:{type:'button','aria-label':'关闭','title':'关闭'}});
    setIcon(close,'x');
    this.registerDomEvent(close,'click',()=>this.close());

    const content=el.createDiv({cls:'primecore-quick-exclusion-content'});
    content.createDiv({cls:'primecore-quick-context',text:this.options.path});
    this.targetsEl=content.createDiv({attr:{role:'menu','aria-label':'排除目标'}});
    this.status=content.createDiv({cls:'setting-item-description',attr:{role:'status'}});
    const edit=this.menuItem(content,'sliders-horizontal','编辑过滤规则');
    this.registerDomEvent(edit,'click',()=>{this.close();this.options.edit();});

    this.registerDomEvent(el,'click',event=>event.stopPropagation());
    this.registerDomEvent(doc,'pointerdown',event=>{
      if(!el.contains(event.target as Node)&&!this.options.anchor.contains(event.target as Node))this.close();
    });
    this.registerDomEvent(doc,'keydown',event=>{
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();this.close();}
    });
    this.registerDomEvent(doc,'scroll',()=>this.reposition(),{capture:true,passive:true});
    this.registerDomEvent(doc.defaultView,'resize',()=>this.reposition());

    this.renderTargets();
    this.reposition();
    this.targetsEl.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({preventScroll:true});
  }

  private menuItem(parent:HTMLElement,icon:string,label:string):HTMLButtonElement {
    const item=parent.createEl('button',{cls:'primecore-quick-menu-item',attr:{type:'button'}});
    const iconEl=item.createSpan({cls:'primecore-quick-item-icon',attr:{'aria-hidden':'true'}});
    if(icon)setIcon(iconEl,icon);
    item.createSpan({cls:'primecore-quick-item-label',text:label});
    return item;
  }

  private renderTargets() {
    const el=this.targetsEl;if(!el)return;
    el.empty();
    const rules=this.options.rules();
    const targets=exclusionTargets(this.options.path);
    if(!targets.length){
      el.createDiv({cls:'setting-item-description',text:'没有可排除的文件或目录。'});
      return;
    }
    for(const target of targets){
      const active=hasExclusion(rules,target.rule);
      const label=target.kind==='file'
        ?(active?'恢复这篇笔记':'排除这篇笔记')
        :`${active?'恢复目录':'排除目录'}：${target.path}（第 ${target.level} 级）`;
      const button=this.menuItem(el,active?'rotate-ccw':target.kind==='file'?'eye-off':'folder-minus',label);
      button.setAttribute('role','menuitemcheckbox');
      button.setAttribute('aria-checked',String(active));
      button.disabled=this.busy;
      this.registerDomEvent(button,'click',async event=>{
        event.stopPropagation();
        if(this.busy)return;
        this.busy=true;this.renderTargets();
        try {
          await this.options.toggle(target);
          if(this.status)this.status.setText(hasExclusion(this.options.rules(),target.rule)?`已排除：${target.path}`:`已恢复：${target.path}`);
        } catch(error) {
          if(this.status)this.status.setText((error as Error).message);
        } finally {
          this.busy=false;
          if(this.el?.isConnected){this.renderTargets();this.reposition();}
        }
      });
    }
  }

  reposition() {
    if(!this.el)return;
    const anchor=this.options.anchor.isConnected?this.options.anchor.getBoundingClientRect():this.initialRect;
    if(!anchor)return;
    const natural=(this.el.scrollHeight||0)+2;
    positionFloatingElement(this.el,anchor,360,natural,460);
  }

  close() {this.unload();}
  onunload() {
    this.el?.remove();this.el=null;
    this.options.onClose();
    const focused=this.lastFocused;
    if(focused&&focused.instanceOf(HTMLElement)&&focused.isConnected)focused.focus({preventScroll:true});
  }
}
