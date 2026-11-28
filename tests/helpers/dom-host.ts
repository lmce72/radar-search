import {Window as HappyWindow} from 'happy-dom';

type Options={cls?:string|string[];text?:string;attr?:Record<string,string|number|boolean>;type?:string;value?:string;title?:string;href?:string};
/** A real DOM tree with the small extension surface Obsidian supplies.
 * 使用真实 DOM 树，并补充 Obsidian 注入的少量扩展。 */
export function createDOM(){
 const raw=new HappyWindow({url:'https://test.invalid',width:1000,height:800});
 const win=raw as unknown as Window&typeof globalThis,doc=win.document;
 const saved=new Map<string,PropertyDescriptor|undefined>();
 const expose=(name:string,value:unknown)=>{saved.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{value,writable:true,configurable:true});};
 const define=(target:object,name:string,value:unknown)=>Object.defineProperty(target,name,{value,writable:true,configurable:true});
 const options=(element:HTMLElement,opts?:Options|string)=>{
  if(typeof opts==='string')element.className=opts;
  else if(opts){if(opts.cls)element.className=Array.isArray(opts.cls)?opts.cls.join(' '):opts.cls;if(opts.text!==undefined)element.textContent=opts.text;
   for(const [key,value] of Object.entries(opts.attr||{}))element.setAttribute(key,String(value));
   for(const key of ['type','value','title','href'] as const)if(opts[key]!==undefined)element.setAttribute(key,opts[key]);
  }return element;
 };
 const element=(parent:Node,tag:string,opts?:Options|string,callback?:(el:HTMLElement)=>void)=>{const el=options(doc.createElement(tag),opts);parent.appendChild(el);callback?.(el);return el;};
 const node=win.Node.prototype,html=win.HTMLElement.prototype;
 define(node,'createEl',function(this:Node,tag:string,opts?:Options|string,callback?:(el:HTMLElement)=>void){return element(this,tag,opts,callback);});
 define(node,'createDiv',function(this:Node,opts?:Options|string,callback?:(el:HTMLElement)=>void){return element(this,'div',opts,callback);});
 define(node,'createSpan',function(this:Node,opts?:Options|string,callback?:(el:HTMLElement)=>void){return element(this,'span',opts,callback);});
 define(node,'appendText',function(this:Node,text:string){this.appendChild(doc.createTextNode(text));});
 define(node,'empty',function(this:Node){while(this.firstChild)this.removeChild(this.firstChild);});
 define(node,'setText',function(this:Node,text:string){this.textContent=text;});
 define(node,'instanceOf',function(this:Node,ctor:new(...args:never[])=>object){return this instanceof ctor;});
 define(html,'addClass',function(this:HTMLElement,...names:string[]){this.classList.add(...names);});
 define(html,'addClasses',function(this:HTMLElement,names:string[]){this.classList.add(...names);});
 define(html,'removeClass',function(this:HTMLElement,...names:string[]){this.classList.remove(...names);});
 define(html,'removeClasses',function(this:HTMLElement,names:string[]){this.classList.remove(...names);});
 define(html,'toggleClass',function(this:HTMLElement,name:string,on:boolean){this.classList.toggle(name,on);});
 define(html,'hasClass',function(this:HTMLElement,name:string){return this.classList.contains(name);});
 define(html,'setAttr',function(this:HTMLElement,name:string,value:string){this.setAttribute(name,value);});
 define(html,'getAttr',function(this:HTMLElement,name:string){return this.getAttribute(name);});
 define(html,'setAttrs',function(this:HTMLElement,values:Record<string,string>){for(const [name,value] of Object.entries(values))this.setAttribute(name,value);});
 define(win.Element.prototype,'setCssStyles',function(this:HTMLElement|SVGElement,styles:Partial<CSSStyleDeclaration>){Object.assign(this.style,styles);});
 define(html,'setCssProps',function(this:HTMLElement,values:Record<string,string>){for(const [name,value] of Object.entries(values))this.style.setProperty(name,value);});
 define(html,'hide',function(this:HTMLElement){this.style.display='none';});
 define(html,'show',function(this:HTMLElement){this.style.removeProperty('display');});
 define(html,'toggle',function(this:HTMLElement,on:boolean){if(on)this.show();else this.hide();});
 define(html,'detach',function(this:HTMLElement){this.remove();});
 define(html,'setPointerCapture',()=>{});define(html,'releasePointerCapture',()=>{});
 define(html,'scrollIntoView',()=>{});
 define(html,'getClientRects',function(this:HTMLElement){
  let current:HTMLElement|null=this;
  while(current){if(current.hidden||current.style.display==='none')return Object.assign([],{item:()=>null});current=current.parentElement;}
  if(!this.isConnected)return Object.assign([],{item:()=>null});
  const rect=this.getBoundingClientRect();return Object.assign([rect],{item:(index:number)=>index===0?rect:null});
 });
 for(const key of ['window','document','Node','Element','HTMLElement','HTMLInputElement','HTMLButtonElement','HTMLSelectElement','SVGElement','SVGSVGElement','Event','CustomEvent','MouseEvent','KeyboardEvent','PointerEvent','TouchEvent','MutationObserver','ResizeObserver','DOMRect','DocumentFragment','Text'] as const){
  const value=key==='window'?win:key==='document'?doc:Reflect.get(win,key);if(value!==undefined)expose(key,value);
 }
 expose('createDiv',(opts?:Options|string)=>options(doc.createElement('div'),opts));
 expose('createSpan',(opts?:Options|string)=>options(doc.createElement('span'),opts));
 expose('createEl',(tag:string,opts?:Options|string)=>options(doc.createElement(tag),opts));
 expose('createFragment',()=>doc.createDocumentFragment());
 expose('getComputedStyle',win.getComputedStyle.bind(win));
 return {window:win,document:doc,async cleanup(){await raw.happyDOM.close();for(const [name,descriptor] of saved){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else Reflect.deleteProperty(globalThis,name);}}};
}
