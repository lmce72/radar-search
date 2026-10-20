import { ActionToolbar, ActionButton } from './controls.ts';
export interface SettingsView {
  title:string;apply?:()=>unknown;root:HTMLDivElement;toolbar:ActionToolbar;
  applyButton?:ActionButton;status:HTMLDivElement;body:HTMLDivElement;scrollTop?:number;focus?:HTMLElement;
  form?:import('./form.ts').SettingsForm;
}
interface ViewOptions {title:string;render:(parent:HTMLDivElement,view:SettingsView)=>void;apply?:()=>unknown;showHeader?:boolean}

// Keep parent DOM and drafts while a nested settings view is active.
// 子视图打开时保留父视图 DOM、草稿、滚动位置和焦点。
export class SettingsNavigation {
  declare container:HTMLElement;
  declare stack:SettingsView[];

  constructor(container:HTMLElement) {this.container=container;this.stack=[];}
  get current() {return this.stack[this.stack.length-1];}
  push({title,render,apply,showHeader=true}:ViewOptions) {
    const previous=this.current;
    if(previous) {
      previous.scrollTop=this.container.scrollTop;
      const active=this.container.ownerDocument.activeElement;
      previous.focus=active&&active.instanceOf(HTMLElement)&&previous.root.contains(active)?active:null;
      previous.root.hide();
    }
    const view={title,apply,root:this.container.createDiv({cls:'primecore-settings-view',attr:{'data-settings-view':title}})} as SettingsView;
    view.toolbar=new ActionToolbar(view.root,title);
    view.toolbar.el.toggle(showHeader);
    if(previous)new ActionButton(view.toolbar.leadingEl,{icon:'arrow-left',label:'返回',onClick:()=>this.back()});
    if(apply)view.applyButton=view.toolbar.add('check','应用',()=>this.applyCurrent());
    view.status=view.root.createDiv({cls:'setting-item-description',attr:{role:'status'}});
    view.body=view.root.createDiv();
    this.stack.push(view);render(view.body,view);
    this.container.scrollTop=0;return view;
  }
  back() {
    if(this.stack.length<2)return;
    this.stack.pop().root.remove();
    const previous=this.current;previous.root.show();
    this.container.scrollTop=previous.scrollTop||0;
    previous.focus?.focus({preventScroll:true});
  }
  async applyCurrent() {
    const view=this.current;if(!view?.apply)return;
    view.applyButton.setDisabled(true);
    try {await view.apply();if(this.current===view)this.back();}
    catch(error) {view.status.setText(error.message);view.applyButton.setDisabled(false);}
  }
}
