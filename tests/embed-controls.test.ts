import {test,expect} from 'bun:test';
import type {App} from 'obsidian';
import {bindButtonActivation} from '../src/shared/button-activation.ts';
import {openPluginSettings} from '../src/settings/open-settings.ts';

test('a touch sequence followed by its native click toggles a search button only once',()=>{
  const button=new EventTarget() as unknown as HTMLButtonElement;
  let open=false,activations=0;
  const dispose=bindButtonActivation(button,()=>{open=!open;activations++;});
  button.dispatchEvent(new Event('touchstart',{cancelable:true}));
  button.dispatchEvent(new Event('touchend',{cancelable:true}));
  expect(activations).toBe(0);
  button.dispatchEvent(new Event('click'));
  expect(open).toBe(true);expect(activations).toBe(1);
  // Keyboard activation also arrives as a click without a preceding pointer press.
  button.dispatchEvent(new Event('click'));
  expect(open).toBe(false);expect(activations).toBe(2);
  dispose();button.dispatchEvent(new Event('click'));expect(activations).toBe(2);
});
test('press isolation preserves default focus and scrolling behavior',()=>{
  const button=new EventTarget() as unknown as HTMLButtonElement;
  const dispose=bindButtonActivation(button,()=>{});
  for(const type of ['pointerdown','mousedown','touchstart']) {
    const event=new Event(type,{bubbles:true,cancelable:true});button.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  }
  dispose();
});
test('settings navigation targets the plugin tab and rejects an unavailable navigator before opening',()=>{
  const calls=[];
  const settings={open(){calls.push(this===settings?'open':'bad receiver');},openTabById(id:string){calls.push(id);}};
  openPluginSettings({setting:settings} as unknown as App,'primecore-search');
  expect(calls).toEqual(['open','primecore-search']);
  expect(()=>openPluginSettings({setting:{open:()=>calls.push('unexpected')}} as unknown as App,'primecore-search')).toThrow('无法打开插件设置');
  expect(calls).toHaveLength(2);
});
