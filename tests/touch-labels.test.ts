import {test,expect} from 'bun:test';
import {bindTouchLabels} from '../src/ui/touch-labels.ts';
import {showElementHint,hideElementHint} from '../src/ui/element-hint.ts';

function fixture(){
 const timers=new Map<number,()=>void>();let serial=0;
 const doc=new EventTarget() as EventTarget&{defaultView:unknown;body:unknown;activeElement:null};
 const popups:Button[]=[];
 class Button extends EventTarget {
  ownerDocument=doc;isConnected=true;
  instanceOf(type:typeof Button){return this instanceof type;}
  closest(){return this;}
  addClass(){}removeClass(){}setCssStyles(){}
  matches(selector:string){return !selector.startsWith(':');}
  getAttribute(){return 'Label';}
  getBoundingClientRect(){return {left:10,top:50,bottom:70,width:20,height:20};}
  remove(){this.isConnected=false;}
 }
 doc.defaultView={Element:Button,HTMLElement:Button,Node:Button,innerWidth:500,
  setTimeout:(callback:()=>void)=>{timers.set(++serial,callback);return serial;},clearTimeout:(id:number)=>timers.delete(id),
  MutationObserver:class {observe(){}disconnect(){}},addEventListener(){},removeEventListener(){}};
 doc.body={createDiv:()=>{const popup=new Button();popups.push(popup);return popup;}};doc.activeElement=null;
 const button=new Button(),document=doc as unknown as Document;
 const dispose=bindTouchLabels(document,()=>true);
 const emit=(type:string)=>{const event=new Event(type,{cancelable:true});Object.defineProperty(event,'target',{value:button});Object.assign(event,{touches:type==='touchstart'?[{identifier:1,clientX:0,clientY:0}]:[]});doc.dispatchEvent(event);};
 const hold=()=>{emit('touchstart');const callbacks=[...timers.values()];timers.clear();callbacks.forEach(callback=>callback());};
 return {document,button,dispose,emit,hold,visible:()=>popups.filter(popup=>popup.isConnected).length,other:()=>new Button()};
}
test('touch cancellation and binding disposal remove an active long-press hint',()=>{
 for(const action of ['cancel','dispose']){
  const f=fixture();f.hold();expect(f.visible()).toBe(1);
  if(action==='cancel')f.emit('touchcancel');else f.dispose();
  expect(f.visible()).toBe(0);f.dispose();
 }
});
test('cancelling an old gesture preserves a newer hint owned by another button',()=>{
 const f=fixture();f.hold();showElementHint(f.other() as unknown as HTMLElement);
 f.emit('touchcancel');expect(f.visible()).toBe(1);hideElementHint(f.document);f.dispose();expect(f.visible()).toBe(0);
});
