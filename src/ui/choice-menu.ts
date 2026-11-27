import {Component,setIcon} from 'obsidian';

export interface MenuChoice {id:string;label:string;icon:string;checked?:boolean;radio?:boolean;disabled?:boolean;onSelect:()=>void;keepOpen?:boolean;pin?:boolean;defaultChoice?:{selected:boolean;disabled?:boolean;onSelect:()=>void}}
export interface ChoiceMenuInteraction {hover?:boolean;activate?:()=>void}
/** Reusable icon menu: native top layer where available, fixed-position fallback otherwise.
 * 共用图标菜单：优先使用原生顶层，否则使用视口内固定定位。 */
export class ChoiceMenu extends Component {
  readonly trigger:HTMLButtonElement;
  readonly popup:HTMLElement;
  private entries:MenuChoice[]=[];
  private open=false;
  constructor(parent:HTMLElement,label:string,private roots:Set<HTMLElement>,private reorder?:(from:string,to:string)=>void,interaction:ChoiceMenuInteraction={}){
    super();
    this.trigger=parent.createEl('button',{cls:'primecore-choice-trigger',attr:{type:'button','aria-haspopup':'menu','aria-expanded':'false','aria-label':label}});
    setIcon(this.trigger.createSpan(),'list-filter');this.trigger.createSpan({text:label});setIcon(this.trigger.createSpan(),'chevron-down');
    this.popup=parent.ownerDocument.body.createDiv({cls:'primecore-choice-menu',attr:{role:'menu','aria-label':label}});
    this.popup.hidden=true;roots.add(this.popup);
    const native='showPopover' in this.popup;
    if(native)this.popup.setAttribute('popover',interaction.activate?'manual':'auto');
    const win=parent.ownerDocument.defaultView;let hold:number|undefined,leave:number|undefined,suppressUntil=0,origin:{x:number;y:number}|null=null;
    const cancelHold=()=>{win.clearTimeout(hold);hold=undefined;origin=null;};
    this.registerDomEvent(this.trigger,'click',event=>{event.stopPropagation();if(Date.now()<suppressUntil){event.preventDefault();return;}if(interaction.activate){interaction.activate();this.show();}else{this.toggle();if(this.open&&event.detail===0)this.buttons()[0]?.focus();}});
    if(interaction.hover){
      this.registerDomEvent(this.trigger,'mouseenter',()=>{if(win.matchMedia('(hover: hover)').matches){win.clearTimeout(leave);this.show();}});
      const scheduleClose=()=>{win.clearTimeout(leave);leave=win.setTimeout(()=>{if(!this.popup.contains(parent.ownerDocument.activeElement))this.close();},120);};
      this.registerDomEvent(this.trigger,'mouseleave',scheduleClose);this.registerDomEvent(this.popup,'mouseleave',scheduleClose);
      this.registerDomEvent(this.popup,'mouseenter',()=>win.clearTimeout(leave));
      this.registerDomEvent(this.trigger,'pointerdown',event=>{if(event.pointerType!=='touch')return;cancelHold();origin={x:event.clientX,y:event.clientY};hold=win.setTimeout(()=>{suppressUntil=Date.now()+800;this.show();},300);});
      this.registerDomEvent(this.trigger,'pointermove',event=>{if(origin&&Math.hypot(event.clientX-origin.x,event.clientY-origin.y)>10)cancelHold();});
      this.registerDomEvent(this.trigger,'pointerup',cancelHold);this.registerDomEvent(this.trigger,'pointercancel',cancelHold);
    }
    this.registerDomEvent(this.trigger,'keydown',event=>{if(event.key==='ArrowDown'){event.preventDefault();event.stopPropagation();if(!this.open)this.toggle();this.buttons()[0]?.focus();}});
    this.registerDomEvent(this.popup,'click',event=>event.stopPropagation());
    this.registerDomEvent(this.popup,'pointerdown',event=>event.stopPropagation());
    this.registerDomEvent(this.popup,'keydown',event=>{
      if(event.key==='Escape'){event.stopPropagation();event.preventDefault();this.close();this.trigger.focus();return;}
      if(event.key==='Tab'){this.trigger.focus();this.close();return;}
      if((event.target as Element).matches('input:not([type=checkbox]),textarea,select'))return;
      if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
      event.preventDefault();event.stopPropagation();
      const items=this.buttons(),index=items.indexOf(this.popup.ownerDocument.activeElement as HTMLButtonElement);
      const next=event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowUp'?-1:1)+items.length)%items.length;
      items[next]?.focus();
    });
    if(native)this.registerDomEvent(this.popup,'toggle',()=>{this.open=this.popup.matches(':popover-open');this.popup.hidden=!this.open;this.trigger.setAttribute('aria-expanded',String(this.open));});
    this.registerDomEvent(parent.ownerDocument,'pointerdown',event=>{if(!this.popup.contains(event.target as Node)&&!this.trigger.contains(event.target as Node))this.close();},{capture:true});
    this.registerDomEvent(parent.ownerDocument.defaultView,'resize',()=>this.close());
    this.register(()=>{cancelHold();win.clearTimeout(leave);this.close();roots.delete(this.popup);this.popup.remove();});
  }
  private buttons():Array<HTMLButtonElement|HTMLInputElement>{return Array.from(this.popup.querySelectorAll<HTMLButtonElement|HTMLInputElement>('[role^=menuitem]:not(:disabled)')).filter(button=>button.getClientRects().length>0);}
  reorderChoices(ids:readonly string[]):void {this.setChoices([...this.entries].sort((a,b)=>ids.indexOf(a.id)-ids.indexOf(b.id)));}
  setLabel(label:string,icon='list-filter'):void {this.trigger.empty();setIcon(this.trigger.createSpan(),icon);this.trigger.createSpan({text:label});setIcon(this.trigger.createSpan(),'chevron-down');}
  setChoices(choices:MenuChoice[]):void {
    this.entries=choices;
    // Update existing rows in place so a multi-select never loses focus or closes.
    // 多选时原位更新，保留焦点和菜单的展开状态。
    if(this.popup.querySelectorAll('[data-choice]').length!==choices.length||choices.some((entry,index)=>this.popup.querySelectorAll<HTMLElement>('[data-choice]')[index]?.dataset.choice!==entry.id)){
      this.popup.querySelectorAll('[data-choice-row]').forEach(row=>row.remove());
      for(const entry of choices){
        const wrapper=this.popup.createDiv({cls:'primecore-choice-row',attr:{'data-choice-row':'1'}});
        const button=wrapper.createEl('button',{attr:{type:'button','data-choice':entry.id}});
        setIcon(button.createSpan({cls:'primecore-choice-icon',attr:{'aria-hidden':'true'}}),entry.icon);button.createSpan({text:entry.label});
        button.addEventListener('click',event=>{event.stopPropagation();const current=this.entries.find(item=>item.id===entry.id);if(!current||current.disabled)return;current.onSelect();if(!current.keepOpen){this.trigger.focus({preventScroll:true});this.close();}});
        if(entry.pin){const pin=button.createSpan({cls:'primecore-choice-pin',attr:{'aria-hidden':'true'}});setIcon(pin,'pin');button.addClass('has-pin');pin.addEventListener('pointerdown',event=>event.stopPropagation());pin.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();});}
        if(entry.defaultChoice){
          const radio=wrapper.createEl('button',{cls:'primecore-choice-default',attr:{type:'button',role:'menuitem','data-default-choice':entry.id}});
          radio.addEventListener('pointerdown',event=>event.stopPropagation());
          radio.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();const choice=this.entries.find(item=>item.id===entry.id)?.defaultChoice;if(choice&&!choice.disabled)choice.onSelect();});
        }
        if(this.reorder){
          const grip=wrapper.createEl('button',{cls:'primecore-reorder-grip',attr:{type:'button',title:'拖动排序；方向键配合修饰键也可排序','aria-label':'调整 '+entry.label+' 的顺序'}});setIcon(grip,'grip-vertical');
          grip.addEventListener('pointerdown',event=>{
            event.preventDefault();event.stopPropagation();grip.setPointerCapture(event.pointerId);wrapper.addClass('is-dragging');
            const done=(up:PointerEvent)=>{
              grip.removeEventListener('pointerup',done);grip.removeEventListener('pointercancel',cancel);wrapper.removeClass('is-dragging');
              const target=this.popup.ownerDocument.elementFromPoint(up.clientX,up.clientY)?.closest<HTMLElement>('[data-choice-row]')?.querySelector<HTMLElement>('[data-choice]')?.dataset.choice;
              if(target&&target!==entry.id)this.reorder(entry.id,target);
            };
            const cancel=()=>{grip.removeEventListener('pointerup',done);grip.removeEventListener('pointercancel',cancel);wrapper.removeClass('is-dragging');};
            grip.addEventListener('pointerup',done);grip.addEventListener('pointercancel',cancel);
          });
          grip.addEventListener('keydown',event=>{if(event.altKey&&['ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();const index=this.entries.findIndex(item=>item.id===entry.id),target=this.entries[index+(event.key==='ArrowUp'?-1:1)];if(target)this.reorder(entry.id,target.id);}});
        }
      }
    }
    for(const entry of choices){
      const button=Array.from(this.popup.querySelectorAll<HTMLButtonElement>('[data-choice]')).find(control=>control.dataset.choice===entry.id);if(!button)continue;
      button.disabled=!!entry.disabled;button.setAttribute('role',entry.checked===undefined?'menuitem':entry.radio?'menuitemradio':'menuitemcheckbox');
      if(entry.checked!==undefined)button.setAttribute('aria-checked',String(entry.checked));else button.removeAttribute('aria-checked');
      const radio=button.parentElement.querySelector<HTMLButtonElement>('[data-default-choice]'),choice=entry.defaultChoice;
      if(radio&&choice){radio.disabled=!!choice.disabled;radio.toggleClass('is-default',choice.selected);radio.setAttribute('aria-label',`${choice.selected?'当前默认':'设为默认'}：${entry.label}`);radio.title=radio.getAttribute('aria-label');setIcon(radio,choice.selected?'circle-dot':'circle');}
    }
  }
  private toggle():void {
    if(this.open){this.close();return;}
    this.show();
  }
  show():void {
    if(this.open)return;
    this.popup.hidden=false;this.popup.setCssStyles({zIndex:'1000000'});
    if('showPopover' in this.popup)this.popup.showPopover();
    this.open=true;this.trigger.setAttribute('aria-expanded','true');
    const rect=this.trigger.getBoundingClientRect(),win=this.trigger.ownerDocument.defaultView;
    const view=win.visualViewport,left=view?.offsetLeft||0,top=view?.offsetTop||0,width=view?.width||win.innerWidth,height=view?.height||win.innerHeight;
    const box=this.popup.getBoundingClientRect();
    this.popup.setCssStyles({left:Math.max(left+8,Math.min(rect.left,left+width-box.width-8))+'px',top:Math.max(top+8,rect.bottom+box.height<top+height-8?rect.bottom+4:rect.top-box.height-4)+'px'});
  }
  close():void {
    if(!this.open)return;
    // Move focus out before the native popover restores the previously focused
    // search input (which would open history). / 先移出焦点，防止宿主回到输入框并打开历史。
    if(this.popup.contains(this.popup.ownerDocument.activeElement)&&this.trigger.isConnected)this.trigger.focus({preventScroll:true});
    if('hidePopover' in this.popup)this.popup.hidePopover();this.open=false;this.popup.hidden=true;this.trigger.setAttribute('aria-expanded','false');
  }
}
