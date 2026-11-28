import {test,expect} from 'bun:test';
import {createDOM} from '../helpers/dom-host.ts';
import {sdkState} from '../helpers/obsidian-host.ts';
import {RichPreview} from '../../src/ui/rich-preview.ts';
import type {App} from 'obsidian';

const settle=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
test('rich previews retain Unicode source offsets and rendered markup while highlighting',async()=>{
 const env=createDOM(),previous=sdkState.render;
 const preview=new RichPreview({} as App,error=>{throw error;},()=>{});preview.load();
 try{
  sdkState.render=async(_app,source,parent)=>{parent.createEl('strong',{text:source});parent.createEl('input',{type:'checkbox'});};
  const parent=env.document.body.createDiv();preview.render(parent,'İ before NEEDLE','', ['NEEDLE','']);await settle();
  expect(parent.querySelector('strong')?.textContent).toBe('İ before NEEDLE');
  expect(parent.querySelector('mark')?.textContent).toBe('NEEDLE');
  expect(parent.querySelector('input')?.disabled).toBe(true);
 }finally{preview.unload();sdkState.render=previous;await env.cleanup();}
});

test('rich preview queue is bounded and unload cancels pending renders',async()=>{
 const env=createDOM(),previous=sdkState.render;let active=0,peak=0,calls=0;
 const releases:Array<()=>void>=[],failures:unknown[]=[];
 const preview=new RichPreview({} as App,error=>failures.push(error),()=>{});preview.load();
 try{
  sdkState.render=async(_app,source,parent)=>{calls++;active++;peak=Math.max(peak,active);await new Promise<void>(resolve=>releases.push(resolve));active--;parent.setText(source+' rendered');};
  const parents=Array.from({length:5},()=>env.document.body.createDiv());
  parents.forEach(parent=>preview.render(parent,'source','',[]));await settle();
  expect(calls).toBe(2);expect(peak).toBe(2);preview.unload();releases.forEach(release=>release());await settle();
  expect(calls).toBe(2);expect(parents.every(parent=>parent.textContent==='source')).toBe(true);expect(failures).toEqual([]);
 }finally{preview.unload();sdkState.render=previous;await env.cleanup();}
});

test('rich preview failures release queue slots and detached targets never render',async()=>{
 const env=createDOM(),previous=sdkState.render,failures:unknown[]=[],calls:string[]=[],links:unknown[]=[];
 const preview=new RichPreview({} as App,error=>failures.push(error),(...args)=>links.push(args));preview.load();
 try{
  sdkState.render=async(_app,source,parent)=>{calls.push(source);if(source==='broken')throw Error('renderer failure');parent.createEl('a',{text:'target',attr:{'data-href':'Other/Note'}});};
  const broken=env.document.body.createDiv(),okay=env.document.body.createDiv(),detached=env.document.createElement('div');
  preview.render(broken,'broken','Docs/Source.md',[]);preview.render(detached,'detached','',[]);preview.render(okay,'okay','Docs/Source.md',[]);await settle();
  expect(calls).toEqual(['broken','okay']);expect(failures).toHaveLength(1);expect(broken.textContent).toBe('broken');
  const event=new env.window.MouseEvent('click',{bubbles:true,cancelable:true});okay.querySelector('a')!.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);expect(links).toEqual([['Other/Note',false,'Docs/Source.md']]);
 }finally{preview.unload();sdkState.render=previous;await env.cleanup();}
});
