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
      if (this.plugin.floatingSearch === this) component._focusInput();
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
    this.registerDomEvent(this.document, 'keydown', event => {
      if (event.key !== 'Escape') return;
      const component=this.plugin.components.get(this.contentEl)?.component;
      if(component?._quickFilterMenu){event.preventDefault();event.stopPropagation();component._quickFilterMenu.close();return;}
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
      const layers = [this.contentEl, component?._dropdown, component?._scopeMenu,
        component?._vaultSearchPanel, component?._panelMask, component?._sourceEditor,component?._quickFilterMenu?.el];
      if (!layers.some(element => element?.contains(target))) this.close();
    });
    this.register(() => {
      this.backdropEl.remove();
      this.contentEl.remove();
      this.document.body.removeClass('primecore-floating-open');
      if (this.plugin.floatingSearch === this) this.plugin.floatingSearch = null;
    });
  }

  close() {
    this.plugin.unmount(this.contentEl);
    this.unload();
  }
}
