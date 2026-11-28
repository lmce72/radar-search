import {test,expect} from 'bun:test';
import {createDOM} from '../helpers/dom-host.ts';
import {bindTouchLabels} from '../../src/ui/touch-labels.ts';

const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
test('touch labels appear at 300ms, suppress the held activation and dispose only owned hints',async()=>{
 const dom=createDOM();let release:()=>void=()=>{};try{
  const root=dom.document.body.createDiv(),button=root.createEl('button',{cls:'primecore-recent-type',attr:{'aria-label':'PDF'}}),outside=dom.document.body.createEl('button',{cls:'primecore-recent-type'});
  release=bindTouchLabels(dom.document,element=>root.contains(element));let clicks=0;button.addEventListener('click',()=>{clicks++;});
  const touch=(target:Element,type:string,x=0,y=0)=>{const event=new dom.window.Event(type,{bubbles:true,cancelable:true});Object.defineProperty(event,'touches',{value:[{clientX:x,clientY:y,identifier:1}]});target.dispatchEvent(event);return event;};
  touch(outside,'touchstart');await pause(320);expect(outside.classList.contains('is-label-visible')).toBe(false);
  const icon=dom.document.createElementNS('http://www.w3.org/2000/svg','svg'),path=dom.document.createElementNS('http://www.w3.org/2000/svg','path');icon.append(path);button.append(icon);
  touch(path,'touchstart');expect(button.classList.contains('is-label-visible')).toBe(false);await pause(320);expect(button.classList.contains('is-label-visible')).toBe(true);expect(dom.document.querySelector('.primecore-element-tooltip')?.textContent).toBe('PDF');
  const end=touch(button,'touchend');expect(end.defaultPrevented).toBe(true);button.click();expect(clicks).toBe(0);expect(button.classList.contains('is-label-visible')).toBe(false);expect(!!dom.document.querySelector('.primecore-element-tooltip')).toBe(false);
  touch(button,'touchstart');touch(button,'touchmove',30);await pause(320);expect(button.classList.contains('is-label-visible')).toBe(false);touch(button,'touchend');button.click();expect(clicks).toBe(1);
  touch(button,'touchstart');release();await pause(320);expect(button.classList.contains('is-label-visible')).toBe(false);button.click();expect(clicks).toBe(2);
 }finally{release();await dom.cleanup();}
});
