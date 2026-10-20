import { setIcon, getIcon } from 'obsidian';
import { PLUGIN_ICON_ID } from './plugin-icon.ts';
import { toText } from './text.ts';

export class IconRenderer {
  static name(value: unknown): string {
    const name=toText(value).trim().toLowerCase();
    return name==='search'?PLUGIN_ICON_ID:name||'files';
  }
  static setIcon(element: HTMLElement, value: unknown, size?: number): void {
    const name = this.name(value);
    setIcon(element, getIcon(name) ? name : 'files');
    const svg = element.querySelector('svg');
    if (svg && size) svg.setCssStyles({width:`${size}px`,height:`${size}px`});
  }
}
