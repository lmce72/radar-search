import {Component,Setting,setIcon} from 'obsidian';
import {exclusionTargets,hasExclusion,type ExclusionTarget} from '../search/quick-exclusions.ts';
import {positionFloatingElement} from './floating-geometry.ts';
import type {SearchPreset} from '../types.ts';
export type ExclusionDestination='temporary'|'preset';
interface QuickMenuOptions {
  anchor:HTMLElement;path:string;presets:()=>SearchPreset[];activePreset:string;
  rules:(destination:ExclusionDestination,preset:string)=>string[];
  toggle:(target:ExclusionTarget,destination:ExclusionDestination,preset:string)=>Promise<void>;
  create:(target:ExclusionTarget)=>void;edit:()=>void;onClose:()=>void;
}
export class QuickExclusionMenu extends Component {
  declare el:HTMLDivElement;
  private destination:ExclusionDestination='temporary';
  private preset:string;
  private targetsEl:HTMLDivElement;
  private presetEl:HTMLDivElement;
  private status:HTMLDivElement;
  private busy=false;
  private initialRect:DOMRect;
  private lastFocused:Element|null;
  private destinationButtons=new Map<ExclusionDestination,HTMLButtonElement>();
  constructor(private options:QuickMenuOptions) {super();this.preset=options.presets().some(p=>p.name===options.activePreset&&p.mode==='黑名单')?options.activePreset:'';}
  open() {this.load();}
  onload() {
    const doc=this.options.anchor.ownerDocument;
    this.lastFocused=doc.activeElement;this.initialRect=this.options.anchor.getBoundingClientRect();
    this.el=doc.body.createDiv({cls:'primecore-quick-exclusions',attr:{role:'dialog','aria-label':'多级排除'}});
    const top=this.el.createDiv({cls:'primecore-quick-filter-destination'});
    const destinations=top.createDiv({cls:'primecore-quick-destination-items',attr:{role:'menu','aria-label':'排除规则保存位置'}});
    for(const [value,label] of [['temporary','临时过滤'],['preset','写入预设']] as const) {
      const option=this.menuItem(destinations,'',label);
      option.setAttribute('role','menuitemradio');
      this.destinationButtons.set(value,option);
      this.registerDomEvent(option,'click',()=>this.selectDestination(value));
      this.registerDomEvent(option,'keydown',event=>{
        if(!['ArrowUp','ArrowDown','Home','End'].includes(event.key))return;
        event.preventDefault();
        const next=event.key==='Home'?'temporary':event.key==='End'?'preset':value==='temporary'?'preset':'temporary';
        this.selectDestination(next);this.destinationButtons.get(next)?.focus({preventScroll:true});
      });
    }
    this.syncDestination();
    const close=top.createEl('button',{cls:'primecore-quick-close',attr:{type:'button','aria-label':'关闭','title':'关闭'}});
    setIcon(close,'x');this.registerDomEvent(close,'click',()=>this.close());
    const content=this.el.createDiv({cls:'primecore-quick-exclusion-content'});
    this.presetEl=content.createDiv();
    content.createDiv({cls:'primecore-quick-context',text:this.options.path||'请先打开笔记，或从搜索结果右侧选择过滤。'});
    this.targetsEl=content.createDiv({attr:{role:'menu','aria-label':'排除目标'}});
    this.status=content.createDiv({cls:'setting-item-description',attr:{role:'status'}});
    const edit=this.menuItem(content,'sliders-horizontal','编辑过滤规则');
    this.registerDomEvent(edit,'click',()=>{this.close();this.options.edit();});
    this.registerDomEvent(this.el,'click',event=>event.stopPropagation());
    this.registerDomEvent(doc,'pointerdown',event=>{if(!this.el.contains(event.target as Node)&&!this.options.anchor.contains(event.target as Node))this.close();});
    this.registerDomEvent(doc,'keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();this.close();}});
    this.registerDomEvent(doc,'scroll',()=>this.reposition(),{capture:true,passive:true});
    this.registerDomEvent(doc.defaultView,'resize',()=>this.reposition());
    const viewport=doc.defaultView.visualViewport;
    if(viewport) {
      const reposition=()=>this.reposition();
      viewport.addEventListener('resize',reposition);viewport.addEventListener('scroll',reposition);
      this.register(()=>{viewport.removeEventListener('resize',reposition);viewport.removeEventListener('scroll',reposition);});
    }
    this.renderPreset();this.renderTargets();this.reposition();
    this.destinationButtons.get(this.destination)?.focus({preventScroll:true});
  }
  private menuItem(parent:HTMLElement,icon:string,label:string):HTMLButtonElement {
    const item=parent.createEl('button',{cls:'primecore-quick-menu-item',attr:{type:'button'}});
    const iconEl=item.createSpan({cls:'primecore-quick-item-icon',attr:{'aria-hidden':'true'}});
    if(icon)setIcon(iconEl,icon);
    item.createSpan({cls:'primecore-quick-item-label',text:label});
    return item;
  }
  private syncDestination() {
    for(const [value,button] of this.destinationButtons) {
      const active=value===this.destination;
      button.setAttribute('aria-checked',String(active));button.tabIndex=active?0:-1;
      const icon=button.querySelector<HTMLElement>('.primecore-quick-item-icon');
      icon.empty();if(active)setIcon(icon,'check');
    }
  }
  private selectDestination(value:ExclusionDestination) {
    this.destination=value;this.syncDestination();this.renderPreset();this.renderTargets();this.reposition();
  }
  private renderPreset() {
    this.presetEl.empty();if(this.destination!=='preset')return;
    new Setting(this.presetEl).setName('写入预设').setDesc('选择黑名单预设；新建时进入名称填写视图。').addDropdown(control=>{
      control.addOption('','新建预设…');
      this.options.presets().filter(p=>p.mode==='黑名单').forEach(p=>{control.addOption(p.name,p.name);});
      control.setValue(this.preset).onChange(value=>{this.preset=value;this.renderTargets();});
    });
  }
  private renderTargets() {
    this.targetsEl.empty();
    const rules=this.options.rules(this.destination,this.preset);
    for(const target of exclusionTargets(this.options.path)) {
      const active=hasExclusion(rules,target.rule);
      const label=target.kind==='file'?(active?'恢复这篇笔记':'排除这篇笔记'):`${active?'恢复目录':'排除目录'}：${target.path}（第 ${target.level} 级）`;
      const button=this.menuItem(this.targetsEl,active?'rotate-ccw':target.kind==='file'?'eye-off':'folder-minus',label);
      button.setAttribute('role','menuitemcheckbox');button.setAttribute('aria-checked',String(active));button.disabled=this.busy;
      this.registerDomEvent(button,'click',async event=>{
        event.stopPropagation();if(this.busy)return;
        if(this.destination==='preset'&&this.preset===''){this.close();this.options.create(target);return;}
        this.busy=true;this.renderTargets();
        try {await this.options.toggle(target,this.destination,this.preset);if(this.el.isConnected)this.status.setText(this.destination==='temporary'?'已更新临时排除条件':'已更新预设并用于当前搜索');}
        catch(error){if(this.el.isConnected)this.status.setText(error.message);}
        finally{this.busy=false;if(this.el.isConnected){this.renderTargets();this.reposition();}}
      });
    }
  }
  reposition() {
    if(!this.el)return;
    const anchor=this.options.anchor.isConnected?this.options.anchor.getBoundingClientRect():this.initialRect;
    const natural=(this.el.firstElementChild?.scrollHeight||0)+(this.el.lastElementChild?.scrollHeight||0)+2;
    positionFloatingElement(this.el,anchor,420,natural,480);
  }
  close() {this.unload();}
  onunload() {this.el?.remove();this.options.onClose();const focused=this.lastFocused;if(focused&&focused.instanceOf(HTMLElement)&&focused.isConnected)focused.focus({preventScroll:true});}
}
