import {ownsSearchTarget} from './search-layers.ts';
import {hideElementHint} from './element-hint.ts';
import {isDirectorySuggestion} from './directory-suggest.ts';
import { Component } from 'obsidian';
import type RadarSearchPlugin from '../main.ts';

export class FloatingSearch extends Component {
  declare plugin:RadarSearchPlugin;
  declare document:Document;
  declare backdropEl:HTMLDivElement;
  declare backdropBackgroundEl:HTMLDivElement;
  declare contentEl:HTMLDivElement;

  constructor(plugin:RadarSearchPlugin) {
    super();
    this.plugin = plugin;
    this.document = plugin.app.workspace.getMostRecentLeaf()?.view.containerEl.ownerDocument || document;
  }

  async open() {
    this.backdropEl = this.document.body.createDiv({ cls: 'modal-container mod-dim primecore-floating-search-backdrop' });
    this.backdropEl.setAttribute('aria-hidden', 'true');
    this.backdropEl.setCssStyles({
      position: 'fixed',
      inset: '0',
      zIndex: '8999',
      touchAction: 'none'
    });
    // Reuse the command palette's backdrop CSS, including theme overrides.
    // 复用命令面板遮罩样式，包含主题对颜色、透明度和模糊效果的覆盖。
    this.backdropBackgroundEl = this.backdropEl.createDiv({ cls: 'modal-bg' });
    this.backdropBackgroundEl.setCssStyles({opacity: '0.85'});
    this.contentEl = this.document.body.createDiv({ cls: 'primecore-floating-search' });
    this.contentEl.setCssStyles({
      position: 'fixed',
      top: '30%',
      left: '15%',
      width: '70%',
      zIndex: '9000'
    });
    // While this overlay is open, host modals and notices must render above it.
    // 浮层打开期间，宿主弹窗与通知必须显示在它上方。
    this.document.body.addClass('primecore-floating-open');
    this.load();
    try {
      const component = await this.plugin.mount(this.contentEl, this);
      if (this.plugin.floatingSearch === this&&!component._disposed&&this.plugin.components.get(this.contentEl)?.component===component) component._focusInput(true,true);
    } catch {
      // mount already reports the failure and removes its partial component.
      this.close();
    }
  }

  onload() {
    this.registerDomEvent(this.backdropEl, 'pointerdown', event => {
      event.preventDefault();
      event.stopPropagation();
      this.close();
    });
    // Run before the host document handler can dismiss and forget a child menu.
    // 先于宿主 document 处理 Escape，避免菜单关闭后同一事件又关闭整个搜索框。
    const window=this.document.defaultView;
    if(window)this.registerDomEvent(window, 'keydown', event => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if(hideElementHint(this.document)){event.preventDefault();event.stopPropagation();return;}
      const component=this.plugin.components.get(this.contentEl)?.component;
      if(component&&Array.from(component._popupRoots).some(root=>!root.hidden)){event.preventDefault();event.stopPropagation();const trigger=Array.from(component._choiceMenus).find(menu=>!menu.popup.hidden)?.trigger;for(const menu of component._choiceMenus)menu.close();trigger?.focus();return;}
      if(component?._idleMenu){event.preventDefault();event.stopPropagation();component._idleMenu.hide();return;}
      if(this.document.querySelector('.suggestion-container:has(.primecore-folder-suggestion)'))return;
      event.preventDefault();event.stopPropagation();
      if(component?._resultToolView&&component._resultToolView!=='results')component._returnToResults();
      else this.close();
    }, true);
    this.registerDomEvent(this.document, 'pointerdown', event => {
      if(isDirectorySuggestion(event.target))return;
      const target = event.target instanceof Node ? event.target : null;
      if (!target) return;
      const component = this.plugin.components.get(this.contentEl)?.component;
      if (!this.contentEl.contains(target) && !(component&&ownsSearchTarget(component,target))) this.close();
    });
    this.register(() => {
      this.backdropEl.remove();
      this.contentEl.remove();
      this.document.body.removeClass('primecore-floating-open');
      if (this.plugin.floatingSearch === this) this.plugin.floatingSearch = null;
    });
  }

  close() {
    const component = this.plugin.components.get(this.contentEl)?.component;
    component?._recordHistory();
    this.plugin.unmount(this.contentEl);
    this.unload();
  }
}
