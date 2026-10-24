import {getIconIds,setIcon} from 'obsidian';
import {floatingGeometryForHeight,viewportBounds} from '../ui/floating-geometry.ts';
import {filterIconIds} from './icon-filter.ts';

export const ICON_CELL_SIZE=30;
export const ICON_GLYPH_SIZE=12;

interface IconPickerOptions {anchor:HTMLElement;value:string;onSelect:(icon:string)=>void;}

const pickers=new Set<IconPicker>();
export function closeIconPickers() {for(const picker of [...pickers])picker.close();}
export function openIconPicker(options:IconPickerOptions) {
  closeIconPickers();
  const picker=new IconPicker(options);
  pickers.add(picker);
  picker.open();
}

/** Floating icon picker: search field plus a dense 30×30 grid with 12px glyphs. */
class IconPicker {
  declare el:HTMLDivElement;
  declare grid:HTMLDivElement;
  declare search:HTMLInputElement;
  declare cells:Array<{id:string;cell:HTMLButtonElement}>;
  declare onOutside:(event:PointerEvent)=>void;
  declare onKey:(event:KeyboardEvent)=>void;
  declare reposition:()=>void;
  declare onResize:()=>void;
  declare naturalHeight:number;
  declare stableWidth:number;
  declare stableHeight:number;
  declare overlayMode:boolean;

  constructor(private options:IconPickerOptions) {}

  private get document() {return this.options.anchor.ownerDocument;}

  open() {
    const doc=this.document;
    this.el=doc.body.createDiv({cls:'primecore-icon-picker',attr:{role:'dialog','aria-label':'选择图标'}});
    const header=this.el.createDiv({cls:'primecore-icon-picker-header'});
    header.createSpan({cls:'primecore-icon-picker-title',text:'选择图标'});
    const clear=header.createEl('button',{cls:'primecore-icon-picker-action',text:'清除',attr:{type:'button'}});
    const close=header.createEl('button',{cls:'primecore-icon-picker-action',attr:{type:'button','aria-label':'关闭','title':'关闭'}});
    setIcon(close,'x');
    clear.addEventListener('click',()=>this.select(''));
    close.addEventListener('click',()=>this.close());

    this.search=this.el.createEl('input',{cls:'primecore-icon-picker-search',type:'search',attr:{placeholder:'搜索图标…','aria-label':'搜索图标',autocomplete:'off',spellcheck:'false'}});
    this.search.enterKeyHint='search';
    this.search.addEventListener('input',()=>this.filter());
    this.search.addEventListener('keydown',event=>{
      if(event.key!=='Enter')return;
      event.preventDefault();
      this.cells.find(item=>!item.cell.hasClass('is-hidden'))?.cell.click();
    });

    this.grid=this.el.createDiv({cls:'primecore-icon-picker-grid',attr:{role:'listbox','aria-label':'图标列表'}});
    this.cells=[...new Set(getIconIds())].map(id=>{
      const cell=this.grid.createEl('button',{cls:'primecore-icon-picker-cell',attr:{type:'button',role:'option','aria-label':id,title:id}});
      setIcon(cell,id);
      if(id===this.options.value||id===`lucide-${this.options.value}`)cell.addClass('is-selected');
      cell.addEventListener('click',()=>this.select(id));
      return {id,cell};
    });

    this.stableWidth=this.computeStableWidth();
    this.el.setCssStyles({width:this.stableWidth+'px',boxSizing:'border-box'});
    this.naturalHeight=this.measureNaturalHeight();
    this.stableHeight=this.computeStableHeight();
    this.position();
    const selected=this.cells.find(item=>item.id===this.options.value||item.id===`lucide-${this.options.value}`)?.cell;
    if(selected)doc.defaultView?.requestAnimationFrame(()=>selected.scrollIntoView({block:'nearest'}));
    if(doc.defaultView?.matchMedia?.('(pointer: fine)').matches)this.search.focus();

    this.onOutside=event=>{
      const target=event.target as Node;
      if(!this.el.contains(target)&&!this.options.anchor.contains(target))this.close();
    };
    doc.addEventListener('pointerdown',this.onOutside,true);
    this.onKey=event=>{
      if(event.key!=='Escape')return;
      event.preventDefault();event.stopPropagation();this.close();
    };
    doc.addEventListener('keydown',this.onKey,true);
    this.reposition=()=>this.position();
    const win=doc.defaultView;
    this.onResize=()=>{this.stableWidth=this.computeStableWidth();this.stableHeight=this.computeStableHeight();this.position();};
    win?.addEventListener('resize',this.onResize);
    win?.addEventListener('scroll',this.reposition,true);
    win?.visualViewport?.addEventListener('resize',this.onResize);
    win?.visualViewport?.addEventListener('scroll',this.reposition);
  }

  private filter() {
    const visible=new Set(filterIconIds(this.cells.map(item=>item.id),this.search.value));
    for(const {id,cell} of this.cells)cell.toggleClass('is-hidden',!visible.has(id));
    this.naturalHeight=this.measureNaturalHeight();
    this.stableHeight=this.computeStableHeight();
    this.position();
  }

  /** Measure the full content height; the clamped element height must never become the new natural height. */
  private measureNaturalHeight(): number {
    if(!this.el?.isConnected)return 420;
    const previous=this.el.style.maxHeight;
    this.el.setCssStyles({maxHeight:'none'});
    const height=this.el.scrollHeight;
    this.el.setCssStyles({maxHeight:previous||''});
    return height;
  }

  private computeStableWidth(): number {
    const win=this.document.defaultView;if(!win)return 320;
    const vp=viewportBounds(win),margin=Math.min(8,vp.width/4,vp.height/4);
    return Math.max(0,Math.min(320,vp.width-2*margin));
  }

  private computeStableHeight(): number {
    const win=this.document.defaultView;if(!win)return 420;
    const vp=viewportBounds(win),margin=Math.min(8,vp.width/4,vp.height/4),gap=6;
    const topEdge=vp.top+margin,bottomEdge=vp.top+vp.height-margin;
    const anchor=this.options.anchor.getBoundingClientRect();
    const below=Math.max(0,bottomEdge-Math.max(topEdge,anchor.bottom+gap));
    const above=Math.max(0,Math.min(bottomEdge,anchor.top-gap)-topEdge);
    const full=Math.max(0,bottomEdge-topEdge),maxSide=Math.max(above,below);
    const wanted=Math.min(this.naturalHeight||420,180);
    this.overlayMode=maxSide<wanted&&full>maxSide;
    return Math.min(this.naturalHeight||420,420,this.overlayMode?full:maxSide);
  }

  private position() {
    if(!this.el?.isConnected)return;
    if(!this.options.anchor.isConnected) {this.close();return;}
    const win=this.document.defaultView;if(!win)return;
    const anchor=this.options.anchor.getBoundingClientRect();
    if(this.overlayMode) {
      // A short window has no usable space above or below the anchor. Use the whole
      // viewport height and overlap the anchor instead of collapsing the grid.
      const vp=viewportBounds(win),margin=Math.min(8,vp.width/4,vp.height/4);
      const leftEdge=vp.left+margin,rightEdge=vp.left+vp.width-margin;
      const width=Math.max(0,Math.min(this.stableWidth,rightEdge-leftEdge));
      const left=Math.max(leftEdge,Math.min(anchor.left,rightEdge-width));
      this.el.setCssStyles({left:left+'px',top:(vp.top+margin)+'px',width:width+'px',maxHeight:this.stableHeight+'px',minWidth:'0',boxSizing:'border-box'});
      return;
    }
    const geometry=floatingGeometryForHeight(anchor,viewportBounds(win),this.stableWidth,this.stableHeight,420);
    this.el.setCssStyles({left:geometry.left+'px',top:geometry.top+'px',width:geometry.width+'px',maxHeight:geometry.maxHeight+'px',minWidth:'0',boxSizing:'border-box'});
  }

  private select(icon:string) {this.options.onSelect(icon);this.close();}

  close() {
    if(!this.el)return;
    const win=this.document.defaultView;
    this.document.removeEventListener('pointerdown',this.onOutside,true);
    this.document.removeEventListener('keydown',this.onKey,true);
    win?.removeEventListener('resize',this.onResize);
    win?.removeEventListener('scroll',this.reposition,true);
    win?.visualViewport?.removeEventListener('resize',this.onResize);
    win?.visualViewport?.removeEventListener('scroll',this.reposition);
    this.el.remove();
    this.el=null;
    pickers.delete(this);
  }
}
