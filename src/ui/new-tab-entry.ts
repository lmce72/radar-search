import {Component,setIcon} from 'obsidian';
import type RadarSearchPlugin from '../main.ts';
import {PLUGIN_ICON_ID} from '../shared/plugin-icon.ts';

/** Own only our entry, leaving the host empty view intact. / 仅管理插件入口，保留宿主空白页。 */
export class NewTabEntry extends Component {
  private stopped=false;
  private entries=new Map<HTMLElement,{button:HTMLButtonElement;owner:Component}>();
  constructor(private plugin:RadarSearchPlugin){super();}
  onload() {
    const workspace=this.plugin.app.workspace;
    this.registerEvent(workspace.on('layout-change',()=>this.refresh()));
    workspace.onLayoutReady(()=>this.refresh());
    this.register(()=>{this.stopped=true;for(const {button} of this.entries.values())button.remove();this.entries.clear();});
  }
  refresh() {
    if(this.stopped)return;
    const roots=new Set<HTMLElement>();
    if(this.plugin.settings.newTabSearch) this.plugin.app.workspace.iterateAllLeaves(leaf=>{
      if(leaf.view.getViewType()==='empty')roots.add(leaf.view.containerEl);
    });
    for(const [root,{button,owner}] of this.entries)if(!roots.has(root)||!root.contains(button)){
      this.removeChild(owner);button.remove();this.entries.delete(root);
    }
    for(const root of roots) {
      if(this.entries.has(root))continue;
      const host=root.querySelector<HTMLElement>('.empty-state-container')||root.querySelector<HTMLElement>('.empty-state')||root;
      const parent=root.querySelector<HTMLElement>('.empty-state-action-list')||host.createDiv({cls:'empty-state-action-list'});
      const button=parent.createEl('button',{cls:'text-icon-button tappable mod-pill empty-state-action primecore-new-tab-entry'});
      setIcon(button.createSpan({cls:'text-button-icon',attr:{'aria-hidden':'true'}}),PLUGIN_ICON_ID);
      button.createSpan({cls:'text-button-label',text:'Radar Search'});
      const owner=new Component();this.addChild(owner);
      owner.registerDomEvent(button,'click',()=>this.plugin.openFloatingSearch());
      this.entries.set(root,{button,owner});
    }
  }
}
