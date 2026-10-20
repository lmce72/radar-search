import {getIconIds,setIcon} from 'obsidian';
import {positionFloatingElement} from '../ui/floating-geometry.ts';
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
    win?.addEventListener('resize',this.reposition);
    win?.addEventListener('scroll',this.reposition,true);
    win?.visualViewport?.addEventListener('resize',this.reposition);
    win?.visualViewport?.addEventListener('scroll',this.reposition);
  }

  private filter() {
    const visible=new Set(filterIconIds(this.cells.map(item=>item.id),this.search.value));
    for(const {id,cell} of this.cells)cell.toggleClass('is-hidden',!visible.has(id));
    this.position();
  }

  private position() {
    if(!this.el?.isConnected)return;
    if(!this.options.anchor.isConnected) {this.close();return;}
    positionFloatingElement(this.el,this.options.anchor.getBoundingClientRect(),320,this.el.scrollHeight,420);
  }

  private select(icon:string) {this.options.onSelect(icon);this.close();}

  close() {
    if(!this.el)return;
    const win=this.document.defaultView;
    this.document.removeEventListener('pointerdown',this.onOutside,true);
    this.document.removeEventListener('keydown',this.onKey,true);
    win?.removeEventListener('resize',this.reposition);
    win?.removeEventListener('scroll',this.reposition,true);
    win?.visualViewport?.removeEventListener('resize',this.reposition);
    win?.visualViewport?.removeEventListener('scroll',this.reposition);
    this.el.remove();
    this.el=null;
    pickers.delete(this);
  }
}
