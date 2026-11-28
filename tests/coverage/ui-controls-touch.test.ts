import {test,expect} from 'bun:test';
import {createDOM} from '../helpers/dom-host.ts';
import {bindTouchLabels} from '../../src/ui/touch-labels.ts';

test('touch labels appear at 300ms, suppress the held activation and dispose only owned hints',async()=>{
 const dom=createDOM();let release:()=>void=()=>{};
 const originalSet=dom.window.setTimeout,originalClear=dom.window.clearTimeout;
 const pending=new Map<number,{at:number;run:()=>void}>();let clock=0,next=0;
 dom.window.setTimeout=((run:()=>void,delay:number)=>{const id=++next;pending.set(id,{at:clock+delay,run});return id;}) as typeof dom.window.setTimeout;
 dom.window.clearTimeout=((id:number)=>{pending.delete(id);}) as typeof dom.window.clearTimeout;
 const advance=(ms:number)=>{clock+=ms;for(const [id,task] of [...pending])if(task.at<=clock){pending.delete(id);task.run();}};
 try{
  const root=dom.document.body.createDiv(),button=root.createEl('button',{cls:'primecore-recent-type',attr:{'aria-label':'PDF'}}),outside=dom.document.body.createEl('button',{cls:'primecore-recent-type'});
  release=bindTouchLabels(dom.document,element=>root.contains(element));let clicks=0;button.addEventListener('click',()=>{clicks++;});
  const touch=(target:Element,type:string,x=0,y=0)=>{const event=new dom.window.Event(type,{bubbles:true,cancelable:true});Object.defineProperty(event,'touches',{value:[{clientX:x,clientY:y,identifier:1}]});target.dispatchEvent(event);return event;};
  touch(outside,'touchstart');advance(320);expect(outside.classList.contains('is-label-visible')).toBe(false);
  const icon=dom.document.createElementNS('http://www.w3.org/2000/svg','svg'),path=dom.document.createElementNS('http://www.w3.org/2000/svg','path');icon.append(path);button.append(icon);
  touch(path,'touchstart');expect(button.classList.contains('is-label-visible')).toBe(false);advance(299);expect(button.classList.contains('is-label-visible')).toBe(false);advance(1);expect(button.classList.contains('is-label-visible')).toBe(true);expect(dom.document.querySelector('.primecore-element-tooltip')?.textContent).toBe('PDF');
  const end=touch(button,'touchend');expect(end.defaultPrevented).toBe(true);button.click();expect(clicks).toBe(0);expect(button.classList.contains('is-label-visible')).toBe(false);expect(!!dom.document.querySelector('.primecore-element-tooltip')).toBe(false);
  touch(button,'touchstart');touch(button,'touchmove',30);advance(320);expect(button.classList.contains('is-label-visible')).toBe(false);touch(button,'touchend');button.click();expect(clicks).toBe(1);
  touch(button,'touchstart');release();advance(320);expect(button.classList.contains('is-label-visible')).toBe(false);button.click();expect(clicks).toBe(2);
 }finally{release();dom.window.setTimeout=originalSet;dom.window.clearTimeout=originalClear;await dom.cleanup();}
});
