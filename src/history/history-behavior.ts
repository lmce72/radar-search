import * as Obsidian from 'obsidian';
import type {SearchBarCtor} from '../ui/search-bar-host.ts';
import { moment } from '../shared/moment.ts';
import { clearTimer } from '../shared/timers.ts';
import {resolveContentMatch,offsetToPosition} from '../search/content-matches.ts';
import {resolveTagMatch} from '../search/tag-matches.ts';
import {fileTypeLabel} from '../search/file-types.ts';
import {parseHistoryRecords} from './records.ts';
import {recentDateView} from './recent-files.ts';
import type {ContentMatch, HistoryTarget, SearchHistoryRecord} from '../types.ts';

interface RecordDateNavOptions {
  date:string;
  minDate:string|null;
  today:string;
  showAll:boolean;
  /** Every record falls on today: lock the date input and force show-all on.
   *  全部记录都在今天：锁定日期输入并强制开启「显示所有」。 */
  onlyToday?:boolean;
  onToggleShowAll:()=>void;
  onSelectDate:(date:string)=>void;
}

// One cohesive behavior; shared state belongs to SearchBarComponent.
export const withHistory = <T extends SearchBarCtor>(Base: T) => class extends Base {
_openHistoryTarget(record:SearchHistoryRecord):void {
            let target=record.target;
            // Old records only stored labels: use an exact, unambiguous file/command match.
            // 旧记录只有名称，仅恢复唯一且精确匹配的文件或命令。
            if(!target&&record.file) {
                const files=this.app.vault.getFiles().filter(file=>file.path===record.file||file.basename===record.file||file.name===record.file);
                const commands=this._commandCandidates();
                const matches=[...commands.visible,...commands.hidden].filter(command=>command.name===record.file);
                if(files.length===1&&matches.length===0)target={kind:'file',path:files[0].path};
                else if(files.length===0&&matches.length===1)target={kind:'command',id:matches[0].id};
            }
            if(!target){this._notify('旧记录未保存可确定的跳转目标，请重新搜索');return;}
            if(target.kind==='file'&&!(this.app.vault.getAbstractFileByPath(target.path) instanceof Obsidian.TFile)){this._notify('历史目标已移动或删除，请重新搜索');return;}
            this._selectMode(record.mode,false);this._input.value=record.q;this._syncClearBtn();
            if(target.kind==='file') {
                if(target.hit)void this._openMatchResult(target.path,record.file||target.path,target.hit);
                else this._openVaultResult(target.path,record.file);
            } else if(target.kind==='command')this._runCommand(target.id,record.file||target.id);
            else if(target.kind==='url'){this._recordHistory(record.file,record.q,target);this.plugin.floatingSearch?.close();this._openUrl(target.url);}
            else this._openBookmarkResult(target.bookmark,record.file||target.bookmark.title||'书签');
        }

_appendIdleSwitch():void {
            if(!this._barLeft)return;
            const choices=[{id:'recent',label:'最近打开',icon:'clock-3'},{id:'history',label:'搜索历史',icon:'history'}] as const;
            const current=choices.find(choice=>choice.id===this._idleView)||choices[1];
            const button=this._barLeft.createEl('button',{cls:'primecore-idle-switch',attr:{'aria-haspopup':'menu','aria-expanded':'false','aria-label':`记录类型：${current.label}`}});
            this._setIcon(button.createSpan({cls:'primecore-idle-switch-icon',attr:{'aria-hidden':'true'}}),current.icon,14);
            button.createSpan({cls:'primecore-idle-switch-label',text:current.label});
            this._setIcon(button.createSpan({cls:'primecore-idle-switch-icon',attr:{'aria-hidden':'true'}}),'chevron-down',12);
            const open=()=>{
                if(this._idleMenu){this._idleMenu.hide();return;}
                // Use the host's DOM menu, with icons and keyboard navigation. / 复用宿主 DOM 菜单的图标与键盘交互。
                const document=button.ownerDocument;
                const existingMenus=new Set(document.querySelectorAll('.menu'));
                const menu=new Obsidian.Menu().setUseNativeMenu(false);this._idleMenu=menu;
                for(const choice of choices)menu.addItem(item=>item.setTitle(choice.label).setIcon(choice.icon).setChecked(choice.id===this._idleView).setDisabled(choice.id==='recent'&&!this.plugin.settings.recentFilesEnabled).onClick(()=>{
                    this._idleView=choice.id;void this._showHistory(moment().format('YYYY-MM-DD'));
                }));
                menu.onHide(()=>{
                    button.setAttribute('aria-expanded','false');
                    // Keep ownership through the event that dismissed the menu.
                    // 保留归属直到本次关闭事件结束，防止同一次 Escape/按下继续关闭搜索框。
                    this._later(()=>{if(this._idleMenu===menu){this._idleMenu=null;this._idleMenuEl=null;}},0);
                });
                const rect=button.getBoundingClientRect();button.setAttribute('aria-expanded','true');
                menu.showAtPosition({x:rect.left,y:rect.bottom+4},document);
                // Only raise this newly-created menu above our floating results.
                // 仅提升本次创建的菜单，避免被插件自己的搜索浮层遮挡。
                const menuEl=Array.from(document.querySelectorAll<HTMLElement>('.menu')).find(element=>!existingMenus.has(element));
                if(menuEl){
                    this._idleMenuEl=menuEl;menuEl.addClass('primecore-idle-menu');this._raiseFloat(menuEl);
                    // Right-side radio: hollow = not default, circle-dot = default (accent).
                    // 右侧单选圆：空心为非默认，圆点且强调色为默认。
                    const radios:Array<{id:'recent'|'history';el:HTMLButtonElement}>=[];
                    const refresh=()=>{
                        const active=this._effectiveDefaultRecordView();
                        for(const {id,el} of radios){
                            const selected=id===active;
                            el.classList.toggle('is-default',selected);
                            el.setAttribute('aria-checked',String(selected));
                            const label=`${selected?'当前默认':'设为默认'}：${id==='recent'?'最近打开':'搜索历史'}`;
                            el.title=label;el.setAttribute('aria-label',label);
                            this._setIcon(el,selected?'circle-dot':'circle',14);
                        }
                    };
                    const rows=[...menuEl.querySelectorAll<HTMLElement>('.menu-item')];
                    for(const choice of choices){
                        const row=rows.find(item=>item.querySelector('.menu-item-title')?.textContent?.trim()===choice.label);
                        if(!row)continue;
                        const radio=row.createEl('button',{cls:'primecore-default-radio',attr:{type:'button',role:'radio','aria-checked':'false'}});
                        if(choice.id==='recent'&&!this.plugin.settings.recentFilesEnabled){radio.disabled=true;radio.setAttribute('aria-disabled','true');}
                        radio.addEventListener('pointerdown',event=>event.stopPropagation());
                        radio.addEventListener('mousedown',event=>event.stopPropagation());
                        radio.addEventListener('click',event=>{
                            event.preventDefault();event.stopPropagation();
                            if(radio.disabled)return;
                            this._setDefaultRecordView(choice.id);
                            refresh();
                        });
                        radios.push({id:choice.id,el:radio});
                    }
                    refresh();
                }
                else {menu.hide();this._log('error','记录类型菜单未能显示');}
            };
            this._listen(button,'mousedown',event=>{event.stopPropagation();event.preventDefault();});
            this._listen(button,'click',event=>{event.stopPropagation();open();});
            this._listen(button,'keydown',event=>{if(event.key==='ArrowDown'){event.preventDefault();event.stopPropagation();open();}});
        }

/** Effective default record view, clamped by capture availability.
 *  实际生效的默认记录视图；未开启最近打开时只能是搜索历史。 */
_effectiveDefaultRecordView():'recent'|'history' {
            return this.plugin.settings.recentFilesEnabled&&this.cfg.defaultRecordView!=='history'?'recent':'history';
        }

/** Make a record view the default; the menu radio reflects it immediately. / 把指定记录视图设为默认。 */
_setDefaultRecordView(view:'recent'|'history'):void {
            if(view==='recent'&&!this.plugin.settings.recentFilesEnabled)return;
            if(this.cfg.defaultRecordView===view)return;
            this.cfg.defaultRecordView=view;
            for(const {component} of this.plugin.components.values()) component.cfg.defaultRecordView=view;
            void this._saveCfgKey('defaultRecordView',view);
        }

/** Shared date navigation for both record views. / 两种记录视图共用日期导航。 */
_mkRecordDateNav(opts:RecordDateNavOptions):HTMLElement {
            const dateNavEl=createDiv();
            dateNavEl.setCssStyles({display:'flex',alignItems:'center',gap:'2px',flexShrink:'0'});
            const prevDateBtn=this._mkNavBtn('chevron-left');
            const nextDateBtn=this._mkNavBtn('chevron-right');
            prevDateBtn.setAttribute('aria-label','前一天');
            nextDateBtn.setAttribute('aria-label','后一天');
            let onlyTodayEl:HTMLElement|null=null;
            if(opts.onlyToday){
                onlyTodayEl=dateNavEl.createSpan({cls:'primecore-date-only-today'});
                this._setIcon(onlyTodayEl.createSpan({cls:'primecore-date-only-today-icon',attr:{'aria-hidden':'true'}}),'clock-3',12);
                onlyTodayEl.createSpan({text:'仅今天'});
            }
            const dateInput=createEl('input',{type:'date'});
            dateInput.setCssStyles({
                fontSize:'12px',border:'1px solid var(--background-modifier-border)',borderRadius:'5px',
                padding:'2px 4px',background:'var(--background-secondary)',color:'var(--text-normal)',
                outline:'none',width:'120px',textAlign:'center',cursor:'pointer'
            });
            dateInput.value=opts.date;
            dateInput.max=opts.today;
            if(opts.minDate)dateInput.min=opts.minDate;
            let showAll=opts.showAll;
            const locked=()=>opts.onlyToday===true||showAll;

            const showAllWrapper=createDiv();
            showAllWrapper.setCssStyles({display:'flex',alignItems:'center',gap:'4px',marginLeft:'8px',flexShrink:'0'});
            const showAllLabel=showAllWrapper.createSpan({text:'显示所有'});
            showAllLabel.setCssStyles({fontSize:'11px',color:'var(--text-muted)',userSelect:'none',whiteSpace:'nowrap'});
            const showAllToggle=showAllWrapper.createEl('label',{cls:locked()?'checkbox-container is-enabled':'checkbox-container'});
            showAllToggle.setCssStyles({cursor:opts.onlyToday?'default':'pointer',flexShrink:'0',margin:'0',...(opts.onlyToday?{opacity:'0.5'}:{})});
            const showAllCheckbox=showAllToggle.createEl('input',{type:'checkbox'});
            showAllCheckbox.checked=locked();
            showAllCheckbox.disabled=opts.onlyToday===true;

            const _toggleShowAll=()=>{
                if(locked()&&opts.onlyToday)return;
                showAll=!showAll;
                showAllCheckbox.checked=showAll;
                showAllToggle.classList.toggle('is-enabled',showAll);
                _updateDateNavState(dateInput.value);
                opts.onToggleShowAll();
            };
            this._listen(showAllCheckbox,'change',_toggleShowAll);
            const showAllToggleHandler=this._makeTouchHandler(_toggleShowAll);
            this._listen(showAllToggle,'touchstart',showAllToggleHandler.onTouchStart,{passive:true});
            this._listen(showAllToggle,'touchend',showAllToggleHandler.onTouchEnd);
            showAllLabel.setCssStyles({cursor:opts.onlyToday?'default':'pointer'});
            const showAllLabelHandler=this._makeTouchHandler(_toggleShowAll);
            this._listen(showAllLabel,'touchstart',showAllLabelHandler.onTouchStart,{passive:true});
            this._listen(showAllLabel,'touchend',showAllLabelHandler.onTouchEnd);
            this._listen(showAllLabel,'click',_toggleShowAll);

            const _updateDateNavState=(d:string)=>{
                if(locked()){
                    prevDateBtn.disabled=true;nextDateBtn.disabled=true;
                    prevDateBtn.setCssStyles({opacity:'0.3',cursor:'default'});
                    nextDateBtn.setCssStyles({opacity:'0.3',cursor:'default'});
                    dateInput.readOnly=true;dateInput.setCssStyles({cursor:'default',opacity:'0.5'});
                } else {
                    prevDateBtn.disabled=opts.minDate?d<=opts.minDate:false;
                    nextDateBtn.disabled=d>=opts.today;
                    prevDateBtn.setCssStyles({opacity:prevDateBtn.disabled?'0.3':'1',cursor:prevDateBtn.disabled?'default':'pointer'});
                    nextDateBtn.setCssStyles({opacity:nextDateBtn.disabled?'0.3':'1',cursor:nextDateBtn.disabled?'default':'pointer'});
                    dateInput.readOnly=false;dateInput.setCssStyles({cursor:'pointer',opacity:'1'});
                }
            };
            _updateDateNavState(opts.date);

            const _stepDate=(d:string,delta:number)=>moment(d).add(delta,'days').format('YYYY-MM-DD');
            const _goToDate=(newDate:string)=>{
                if(locked())return;
                dateInput.value=newDate;_updateDateNavState(newDate);opts.onSelectDate(newDate);
            };
            const prevDateHandler=this._makeTouchHandler((e)=>{e.preventDefault();if(!prevDateBtn.disabled)_goToDate(_stepDate(dateInput.value,-1));});
            this._listen(prevDateBtn,'touchstart',prevDateHandler.onTouchStart,{passive:true});
            this._listen(prevDateBtn,'touchend',prevDateHandler.onTouchEnd);
            this._listen(prevDateBtn,'click',(e)=>{e.preventDefault();if(!prevDateBtn.disabled)_goToDate(_stepDate(dateInput.value,-1));});
            const nextDateHandler=this._makeTouchHandler((e)=>{e.preventDefault();if(!nextDateBtn.disabled)_goToDate(_stepDate(dateInput.value,1));});
            this._listen(nextDateBtn,'touchstart',nextDateHandler.onTouchStart,{passive:true});
            this._listen(nextDateBtn,'touchend',nextDateHandler.onTouchEnd);
            this._listen(nextDateBtn,'click',(e)=>{e.preventDefault();if(!nextDateBtn.disabled)_goToDate(_stepDate(dateInput.value,1));});
            this._listen(dateInput,'change',()=>{if(locked())return;_updateDateNavState(dateInput.value);opts.onSelectDate(dateInput.value);});

            dateNavEl.appendChild(prevDateBtn);
            if(onlyTodayEl)dateNavEl.appendChild(onlyTodayEl);
            dateNavEl.appendChild(dateInput);
            dateNavEl.appendChild(nextDateBtn);
            dateNavEl.appendChild(showAllWrapper);
            return dateNavEl;
        }

/** Rebind the shared clear button so each record view owns its action.
 *  重新绑定共用的清除按钮，使两种记录视图各自持有动作。 */
_bindClearRecordBtn(visible:boolean,label:string,action:()=>void|Promise<void>):void {
            const button=this._clearHistoryBtn;
            if(!button)return;
            button.setCssStyles({display:visible?'flex':'none'});
            button.title=label;
            button.setAttribute('aria-label',label);
            // Cloning drops every listener from the previous view. / 克隆节点会移除上一个视图的监听器。
            const clone=button.cloneNode(true) as HTMLButtonElement;
            button.parentNode.replaceChild(clone,button);
            this._clearHistoryBtn=clone;
            const handler=this._makeTouchHandler((event)=>{event.stopPropagation();void action();});
            this._listen(clone,'touchstart',handler.onTouchStart,{passive:true});
            this._listen(clone,'touchend',(event)=>{event.stopPropagation();handler.onTouchEnd(event);});
            this._listen(clone,'click',(event)=>{event.stopPropagation();void action();});
            this._listen(clone,'mouseenter',()=>clone.setCssStyles({background:'var(--background-modifier-hover)'}));
            this._listen(clone,'mouseleave',()=>clone.setCssStyles({background:'transparent'}));
        }

_showRecentFiles(page=1, date=moment().format('YYYY-MM-DD')):void {
            // Backfill missing quick-switcher paths once per session, then refresh if it added rows.
            // 每个会话补录一次快速切换中缺失的路径，新增时才重绘。
            void this.plugin.recentFiles.syncQuickSwitcher().then(added=>{
                if(added>0&&!this._disposed&&!this._cleanedUp&&this._idleView==='recent'&&this._resultKind==='history')this._showRecentFiles(page,date);
            }).catch(error=>this._log('warn','[SearchBar] 同步快速切换失败:',error));
            ++this._historyVer;++this._vaultSearchVer;++this._webSearchVer;
            this._activeIdx=-1;this._itemEls=[];this._lastGroups=null;
            this._dropdownInner.empty();this._prepBar('history');
            this._appendIdleSwitch();
            const today=moment().format('YYYY-MM-DD');
            const all=this.plugin.recentFiles.list();
            // Oldest retained day bounds the date picker; when every record is from today,
            // the input is locked and "显示所有" is forced on (read-only).
            // 最早记录日作为日期下界；记录全在今天时锁定输入并强制只读地开启「显示所有」。
            const {oldest,onlyToday,selected,showAll,records}=recentDateView(all,date,today,this._showAllRecent);
            if(this._barLeft)this._barLeft.appendChild(this._mkRecordDateNav({
                date:selected,minDate:oldest,today,showAll,onlyToday,
                onToggleShowAll:()=>{this._showAllRecent=!this._showAllRecent;this._showRecentFiles(1,selected);},
                onSelectDate:nextDate=>this._showRecentFiles(1,nextDate)
            }));
            this._bindClearRecordBtn(records.length>0,showAll?'清除所有最近打开记录':'清除当前页最近打开记录',async()=>{
                if(showAll)await this.plugin.recentFiles.clear();
                else await this.plugin.recentFiles.clearRange(selected,selected);
                this._showRecentFiles(1,selected);
            });
            const totalPages=Math.max(1,Math.ceil(records.length/this._historyPageSize));
            const safePage=Math.max(1,Math.min(page,totalPages));
            const visible=records.slice((safePage-1)*this._historyPageSize,safePage*this._historyPageSize);
            if(!records.length)this._dropdownInner.createDiv({cls:'primecore-results-empty',text:showAll?'暂无最近打开记录':'这一天没有最近打开记录'});
            let lastDay='';
            for(const record of visible) {
                // Day headings only in the all-days view; a single-day view needs none.
                // 仅「显示所有」视图按天分组，单日视图不再重复标题。
                if(showAll){
                    const day=moment(record.ts).format('YYYY-MM-DD');
                    if(day!==lastDay){
                        const label=day===today?'今天':day===moment().subtract(1,'day').format('YYYY-MM-DD')?'昨天':day;
                        this._dropdownInner.createEl('h3',{cls:'primecore-recent-day',text:label});lastDay=day;
                    }
                }
                const command=(record.kind??'file')==='command';
                const file=command?null:this.app.vault.getFileByPath(record.path);
                const name=command?(record.label||record.path):(file?this._fileLabel(file):record.path);
                const button=this._dropdownInner.createEl('button',{cls:'primecore-recent-file',attr:{'aria-label':command?`执行命令 ${name}`:`打开 ${record.path}`}});
                const iconEl=button.createSpan({cls:'primecore-recent-icon',attr:{'aria-hidden':'true'}});
                this._setIcon(iconEl,command?'command':file?this._fileIconName(file):'file',14);
                const bodyEl=button.createDiv({cls:'primecore-recent-body'});
                const nameEl=bodyEl.createDiv({cls:'primecore-recent-name-row'});
                if(!command&&file){const type=fileTypeLabel(file.path);if(type)nameEl.createSpan({cls:'primecore-file-type',text:type});}
                nameEl.createSpan({cls:'primecore-recent-name',text:name});
                bodyEl.createSpan({cls:'primecore-recent-path',text:record.path});
                const idx=this._itemEls.length;
                this._listen(button,'mouseenter',()=>this._setActive(idx));
                this._listen(button,'mouseleave',()=>this._clearActive(idx));
                this._listen(button,'mousedown',event=>{event.stopPropagation();event.preventDefault();});
                this._listen(button,'click',event=>{
                    event.stopPropagation();
                    if(command)this._runCommand(record.path,name);
                    else if(file)this._openVaultResult(record.path,name,false);
                    else {this._notify('文档已移动或删除');this._showRecentFiles(1,selected);}
                });
                this._itemEls.push(button);
            }
            if(totalPages>1)this._mkPagerBar(this._dropdownInner,{
                page:safePage,totalPages,pageSize:this._historyPageSize,
                onSize:n=>{this._historyPageSize=n;this._showRecentFiles(1,selected);},
                onPrev:()=>this._showRecentFiles(safePage-1,selected),onNext:()=>this._showRecentFiles(safePage+1,selected)
            });
            this._showDropdown();
        }

_openUrl(url: string) {
            const document = this.container.ownerDocument;
            const window = document.defaultView;

            const target = this.cfg.browserTarget || "external";
            try {
                if (target === "internal" || target === "internal-window") {
                    const wv = this.internalApp.internalPlugins?.plugins?.["webviewer"]?.instance;
                    if (wv && typeof wv.openUrl === "function") {
                        const leafType = target === "internal-window" ? "window" : "tab";
                        wv.openUrl(url, leafType, true);
                        return;
                    }
                    this._log("warn", "[SearchBar] webviewer 插件未启用，降级为外部浏览器");
                }
                // external 或 fallback
                if (this.internalApp.openUrl) {
                    this.internalApp.openUrl(url);
                } else {
                    window.open(url, "_blank");
                }
            } catch (e) {
                this._log("error", "[SearchBar] _openUrl 失败:", e);
                try { window.open(url, "_blank"); } catch { /* best-effort fallback */ }
            }
        }

_onInput(value: string) {
            this._historySavedSig='';
            this._historySavedKeys.clear();
            this._historyQuery=value.trim();
            this._lastInputValue=value;
            ++this._historyVer;++this._vaultSearchVer;++this._webSearchVer;
            this._activeIdx=-1;
            clearTimer(this._debounceTimer);
            const q = value.trim();
            if (!q) {
                // 输入清空时显示历史而非直接关闭
                this._debounceTimer = this._later(() => {
                    this._debounceTimer = null;
                    void this._showHistory(moment().format("YYYY-MM-DD"));
                }, 100);
                return;
            }
            ++this._historyVer;       // 取消所有进行中的 _showHistory
            this._groupPages.clear(); // 新查询时重置所有分组页码
            this._debounceTimer = this._later(() => { this._debounceTimer = null; void this._doSearch(q); }, 200);
        }

_doSearch(q: string): Promise<void> {
            ++this._historyVer;
            if(this._lastQuery!==q)this._contentAllExpanded=false;
            this._lastQuery=q;
            this._historyQuery=q;
            this._lastInputValue=this._input.value;
            if (this._mode === "vault")  return this._searchVault(q);
            if (this._mode === "web")    return this._searchWeb(q);
            return this._searchGlobal(q);
        }

_getHistoryFilePath(date: string): string { return this.plugin.history.path(date); }

_getRetainDays(): number | null {
            if (this.cfg.historyRetentionMode === "custom") {
                return Number(this.cfg.historyRetentionDays) || 30;
            }
            return null;
        }

async _loadHistoryForDate(date: string): Promise<import("../types.ts").SearchHistoryRecord[]> {
            try {
                const path = this._getHistoryFilePath(date);
                const exists = await this.app.vault.adapter.exists(path);
                if (!exists) return [];
                const raw = await this.app.vault.adapter.read(path);
                const parsed: unknown = JSON.parse(raw);
                return parseHistoryRecords(parsed);
            } catch (e) {
                this._log("error", `[SearchBar] _loadHistoryForDate(${date}) 失败:`, e);
                return [];
            }
        }

/** Save the current search once per query/mode, even across result clicks and closing the UI. */
_recordHistory(file?: string, query?: string, target?: HistoryTarget): void {
            if(this.plugin.settings?.historyRetentionMode==='disabled')return;
            try {
                const inputQuery=this._input?.value?.trim()??'';
                const q=(query??(inputQuery||this._historyQuery)??'').trim();
                if(!q)return;
                const base=`${this._mode}\u0000${q}`;
                if(this._historySavedSig!==base) {this._historySavedSig=base;this._historySavedKeys.clear();}
                const key=JSON.stringify(target)??file??'';
                // 关闭浮层时没有具体目标：本次查询已有任意记录就不再补一条；
                // 同一目标（包括同一命令）只记一次，不同结果仍各留一条。
                if(file===undefined) {if(this._historySavedKeys.size>0)return;}
                else if(this._historySavedKeys.has(key))return;
                this._historySavedKeys.add(key);
                void this._saveToHistory(q,this._mode,file,target);
            } catch(error) {this._log('error','[SearchBar] 记录搜索历史失败:',error);}
        }

async _saveToHistory(q: string, mode: import("../types.ts").SearchMode, file?: string, target?:HistoryTarget): Promise<void> {
            if(this.plugin.settings?.historyRetentionMode==='disabled')return;
            try {
                const today = moment().format("YYYY-MM-DD");
                const records = await this._loadHistoryForDate(today);
                // 去重：与最新记录完全相同则跳过（比较 file，使同一搜索词下的不同跳转目标各留一条）
                if (records.length > 0 && records[0].q === q && records[0].mode === mode && records[0].file === file && JSON.stringify(records[0].target)===JSON.stringify(target)) return;
                const rec: import("../types.ts").SearchHistoryRecord = { q, mode, ts: Date.now() };
                if (file) rec.file = file;
                if(target)rec.target=target;
                records.unshift(rec);
                if(!['disabled'].includes(this.plugin.settings?.historyRetentionMode))await this.plugin.history.prepend(today, rec);
            } catch (e) {
                this._log("error", "[SearchBar] _saveToHistory 写入失败:", e);
            }
        }

_openVaultResult(path: string, label?: string, recordHistory=true) {
            try {
                if (!path) return;
                const name = label || String(path).split("/").pop().replace(/\.md$/, "");
                // 不 await：跳转优先，历史写入异步完成（_saveToHistory 自带 try/catch）
                if(recordHistory)this._recordHistory(name,undefined,{kind:'file',path});
            } catch (e) {
                this._log("error", "[SearchBar] 结果点击记录失败:", e);
            }
            // Mobile's openLinkText can resolve without switching the active note; open the
            // resolved TFile directly, with openLinkText only for non-file targets.
            // 移动端 openLinkText 有时解析成功但不切换笔记；文件目标直接 openFile。
            const file = this.app.vault.getAbstractFileByPath(path);
            if (file instanceof Obsidian.TFile) {
                // Mobile reading-mode views throw in getEphemeralState when reused; open
                // results in a fresh tab there. / 移动端阅读视图复用会抛错，改为新标签打开。
                const newLeaf = this.presentation === 'page' || Obsidian.Platform.isMobile;
                const leaf = this.app.workspace.getLeaf(newLeaf ? 'tab' : false);
                this.plugin.floatingSearch?.close();
                leaf.openFile(file).catch(error => this._log('error', '打开搜索结果失败', error));
                return;
            }
            this.plugin.floatingSearch?.close();
            this.app.workspace.openLinkText(path, "", this.presentation==='page').catch(error=>this._log('error','打开搜索结果失败',error));
        }

async _openMatchResult(path:string,label:string,hit:ContentMatch) {
            try {
                const file=this.app.vault.getAbstractFileByPath(path);
                if(!(file instanceof Obsidian.TFile))return;
                this._recordHistory(label,undefined,{kind:'file',path,hit});
                const leaf=this.app.workspace.getLeaf(this.presentation==='page'||Obsidian.Platform.isMobile?'tab':false);
                const touch=this._isTouchDevice();
                const resolve=(text:string)=>hit.tag?resolveTagMatch(text,hit,Obsidian.getFrontMatterInfo(text)):resolveContentMatch(text,hit);
                const initialText=await this.app.vault.cachedRead(file);
                const initial=resolve(initialText);
                const initialFrom=initial?offsetToPosition(initialText,initial.start):null;
                const initialTo=initial?offsetToPosition(initialText,initial.end):null;
                this.plugin.floatingSearch?.close();
                // 打开时即传递位置；属性标签使用源码模式，确保 YAML 目标可见。
                // Pass the location while opening; YAML tags use source mode so the target stays visible.
                await leaf.openFile(file,{active:true,state:{mode:'source',...(hit.tag?.field?{source:true}:{})},
                    eState:initialFrom?{line:initialFrom.line,startLoc:initialFrom,endLoc:initialTo,focus:false}:undefined});
                if(!(leaf.view instanceof Obsidian.MarkdownView)||leaf.view.file?.path!==path)return;
                if(leaf.view.getMode()!=='source')await leaf.setViewState({type:'markdown',state:{file:path,mode:'source',...(hit.tag?.field?{source:true}:{})},active:true});
                if(!(leaf.view instanceof Obsidian.MarkdownView)||leaf.view.file?.path!==path)return;
                const editor=leaf.view.editor;
                const text=editor.getValue();
                const range=resolve(text);
                if(!range) {new Obsidian.Notice('匹配内容已更改，请重新搜索');return;}
                const from=offsetToPosition(text,range.start),to=offsetToPosition(text,range.end);
                editor.setSelection(from,to);
                editor.scrollIntoView({from,to},true);
                // Do not summon the soft keyboard on touch devices right after navigating.
                // 触屏设备上不要刚跳转就弹出软键盘。
                if (!touch) editor.focus();
            } catch(error) {this._log('error','定位匹配内容失败',error);}
        }

async _showHistory(date: string): Promise<void> {
            if(this._idleView==='recent'&&this.plugin.settings.recentFilesEnabled){this._showRecentFiles(1,date);return;}
            const ver = ++this._historyVer;
            try {
                // 如果显示所有模式开启，直接加载所有历史
                if (this._showAllHistory) {
                    return this._loadAllHistory();
                }

                this._historyPage = 1;  // 切换日期时始终重置到第 1 页
                let records = await this._loadHistoryForDate(date);
                // 用户已开始输入（_onInput 递增了 _historyVer），结果已过期，丢弃
                if (ver !== this._historyVer) return;
                // 按当前搜索模式过滤历史条目
                if (this._mode === "vault") {
                    records = records.filter(r => r.mode === "vault" || r.mode === "global");
                } else if (this._mode === "web") {
                    records = records.filter(r => r.mode === "web");
                }
                // 历史始终按时间从新到旧显示，不依赖文件里的写入顺序。
                records.sort((a,b)=>(b.ts||0)-(a.ts||0));
                // global 模式不过滤，展示所有类型的混合记录
                this._renderHistoryDropdown(date, records, 1);
                this._showDropdown();
            } catch (e) {
                this._log("error", "[SearchBar] _showHistory 失败:", e);
            }
        }

async _loadAllHistory(): Promise<void> {
            const ver = ++this._historyVer;
            try {
                this._historyPage = 1;
                const today = moment().format("YYYY-MM-DD");
                const retainDays = this._getRetainDays();
                const minDate = retainDays
                    ? moment().subtract(retainDays - 1, "days").format("YYYY-MM-DD")
                    : null; // 默认最多加载1年

                const allRecords: SearchHistoryRecord[] = [];
                const historyDir = this.plugin.history.directory;

                try {
                    const files = await this.app.vault.adapter.list(historyDir);
                    const jsonFiles = (files.files || []).filter(f => f.endsWith(".json"));

                    for (const filePath of jsonFiles) {
                        const fileName = filePath.split("/").pop().replace(".json", "");
                        if (minDate && fileName < minDate) continue;
                        if (fileName > today) continue;

                        try {
                            const records = await this._loadHistoryForDate(fileName);
                            // 为每条记录添加日期信息
                            records.forEach(r => { r.date = fileName; });
                            allRecords.push(...records);
                        } catch (e) {
                            this._log("warn", `[SearchBar] 读取历史文件 ${filePath} 失败:`, e);
                        }
                    }
                } catch (e) {
                    this._log("warn", "[SearchBar] 读取历史目录失败:", e);
                }

                if (ver !== this._historyVer) return;

                // 按时间戳倒序排序
                allRecords.sort((a, b) => (b.ts || 0) - (a.ts || 0));

                // 按当前搜索模式过滤
                let filteredRecords = allRecords;
                if (this._mode === "vault") {
                    filteredRecords = allRecords.filter(r => r.mode === "vault" || r.mode === "global");
                } else if (this._mode === "web") {
                    filteredRecords = allRecords.filter(r => r.mode === "web");
                }

                this._renderHistoryDropdown(today, filteredRecords, 1);
                this._showDropdown();
            } catch (e) {
                this._log("error", "[SearchBar] _loadAllHistory 失败:", e);
            }
        }

async _clearCurrentPageHistory(date: string, records: import("../types.ts").SearchHistoryRecord[]): Promise<void> {
            try {
                if (this._showAllHistory) {
                    // 显示所有模式：清除所有日期的历史记录
                    await this.plugin.history.clear();

                    this._renderHistoryDropdown(date, [], 1);
                } else {
                    // 日期模式：只清除当前日期的历史记录
                    const path = this._getHistoryFilePath(date);
                    await this.plugin.history.write(path, []);
                    this._renderHistoryDropdown(date, [], 1);
                }
            } catch (e) {
                this._log("error", "[SearchBar] _clearCurrentPageHistory 失败:", e);
            }
        }

_renderHistoryDropdown(date: string, records: import("../types.ts").SearchHistoryRecord[], page = 1) {
            records.sort((a,b)=>(b.ts||0)-(a.ts||0));
            // 修复：不使用 innerHTML，安全清空容器
            if (this._dropdownInner.empty) {
                this._dropdownInner.empty();
            } else {
                while (this._dropdownInner.firstChild) this._dropdownInner.removeChild(this._dropdownInner.firstChild);
            }
            this._itemEls = [];
            // 历史视图没有专项分组：收起「全部展开/收起」按钮并清掉上次的分组引用
            this._syncResultTools(true);
            this._lastGroups = null;

            const today      = moment().format("YYYY-MM-DD");
            const retainDays = this._getRetainDays();
            const minDate    = retainDays
                ? moment().subtract(retainDays - 1, "days").format("YYYY-MM-DD")
                : null;

            // ── header：日期导航（与最近打开共用 _mkRecordDateNav）──────────────
            // 顶栏切到「历史」上下文，并把历史控件填进顶栏左区（原先在滚动容器内的 sticky header）
            this._prepBar("history");
            this._appendIdleSwitch();
            if (this._barLeft) {
                this._barLeft.appendChild(this._mkRecordDateNav({
                    date, minDate, today, showAll: this._showAllHistory,
                    onToggleShowAll: () => {
                        this._showAllHistory = !this._showAllHistory;
                        if (this._showAllHistory) void this._loadAllHistory();
                        else void this._showHistory(date);
                    },
                    onSelectDate: (nextDate) => { void this._showHistory(nextDate); }
                }));
            }

            // 显示清除历史按钮并绑定事件
            this._bindClearRecordBtn(records.length > 0, '清除当前页历史记录', () => this._clearCurrentPageHistory(date, records));

            // ── 分页切片 ──────────────────────────────────────────────────────
            const totalPages = Math.max(1, Math.ceil(records.length / this._historyPageSize));
            const safePage   = Math.min(Math.max(1, page), totalPages);
            const sliced     = records.slice(
                (safePage - 1) * this._historyPageSize,
                safePage * this._historyPageSize
            );

            // ── 历史条目 ───────────────────────────────────────────────────
            if (records.length === 0) {
                const emptyEl = this._dropdownInner.createDiv();
                emptyEl.setCssStyles({
                    padding: "16px 14px",
                    fontSize: "13px",
                    color: "var(--text-faint)",
                    textAlign: "center"
                });
                emptyEl.textContent = "暂无搜索记录";
            } else {
                const modeLabel = { global: "全局", vault: "Vault", web: "Web" };
                // vault/global → vault 图标；web → globe 图标
                const modeIcon  = { vault: "vault", global: "vault", web: "globe" };
                for (const rec of sliced) {
                    const idx = this._itemEls.length;
                    const itemEl = this._dropdownInner.createDiv();
                    itemEl.setCssStyles({
                        display: "flex",
                        flexDirection: "row",
                        alignItems: "center",
                        gap: "8px",
                        padding: "7px 14px",
                        cursor: "pointer",
                        transition: "background 0.1s",
                        minHeight: "36px"
                    });

                    // 类型图标
                    const iconWrapEl = itemEl.createSpan();
                    iconWrapEl.setCssStyles({
                        display: "inline-flex",
                        alignItems: "center",
                        flexShrink: "0",
                        color: "var(--text-muted)",
                        width: "16px"
                    });
                    this._setIcon(iconWrapEl, modeIcon[rec.mode] || "search", 13);

                    // 文本列（label + sub）
                    const contentEl = itemEl.createDiv();
                    contentEl.setCssStyles({
                        display: "flex",
                        flexDirection: "column",
                        flex: "1",
                        minWidth: "0"
                    });

                    const labelEl = contentEl.createSpan({ text: rec.q });
                    labelEl.setCssStyles({
                        fontSize: "13px",
                        color: "var(--text-normal)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap"
                    });

                    const timeStr = rec.ts ? moment(rec.ts).format("HH:mm") : "";
                    const dateStr = this._showAllHistory && rec.date ? rec.date : "";
                    // rec.file：点击结果时记录的跳转目标文件名
                    const subText = [modeLabel[rec.mode] || rec.mode, dateStr, timeStr].filter(Boolean).join(" · ");
                    if (subText) {
                        const subEl = contentEl.createSpan({ text: subText });
                        subEl.setCssStyles({ fontSize: "11px", color: "var(--text-faint)", marginTop: "1px" });
                    }

                    if(rec.file) {
                        const target=contentEl.createEl('button',{cls:'primecore-history-target',attr:{'aria-label':`跳转到 ${rec.file}`}});
                        // Keep the icon decorative and the label shrinkable. / 图标仅作装饰，长标题可截断。
                        this._setIcon(target.createSpan({cls:'primecore-history-target-icon',attr:{'aria-hidden':'true'}}),'arrow-up-right',12);
                        target.createSpan({cls:'primecore-history-target-label',text:rec.file});
                        target.title=rec.target?.kind==='file'?rec.target.path:rec.file;
                        this._listen(target,'mousedown',event=>{event.stopPropagation();event.preventDefault();});
                        this._listen(target,'touchend',event=>event.stopPropagation());
                        this._listen(target,'click',event=>{event.stopPropagation();this._openHistoryTarget(rec);});
                    }

                    // 删除按钮
                    const delBtn = itemEl.createEl("button");
                    delBtn.setCssStyles({
                        flexShrink: "0",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: "24px",
                        height: "24px",
                        borderRadius: "5px",
                        border: "none",
                        background: "transparent",
                        color: "var(--text-muted)",
                        cursor: "pointer",
                        padding: "0"
                    });
                    this._setIcon(delBtn, "x", 13);
                    delBtn.setAttribute("aria-label",`删除搜索记录 ${rec.q}`);

                    const _deleteThisRecord = async () => {
                        try {
                            const recordDate = this._showAllHistory ? rec.date : date;
                            if (!recordDate) {
                                this._log("error", "[SearchBar] 删除失败：记录缺少日期信息");
                                return;
                            }
                            const path     = this._getHistoryFilePath(recordDate);
                            await this.plugin.history.removeRecord(path, rec);

                            if (this._showAllHistory) {
                                void this._loadAllHistory();
                            } else {
                                const newVisible = records.filter(r => r.ts !== rec.ts);
                                const newTotal   = Math.max(1, Math.ceil(newVisible.length / this._historyPageSize));
                                const newPage    = Math.min(safePage, newTotal);
                                this._renderHistoryDropdown(date, newVisible, newPage);
                            }
                        } catch (e) {
                            this._log("error", "[SearchBar] 删除历史记录失败:", e);
                        }
                    };
                    this._listen(delBtn, "mousedown",  (e) => { e.stopPropagation(); e.preventDefault(); });
                    const delBtnHandler = this._makeTouchHandler((e) => { e.stopPropagation(); void _deleteThisRecord(); });
                    this._listen(delBtn, "touchstart", delBtnHandler.onTouchStart, { passive: true });
                    this._listen(delBtn, "touchend", (e) => { e.stopPropagation(); delBtnHandler.onTouchEnd(e); });
                    this._listen(delBtn, "click", (e) => { e.stopPropagation(); void _deleteThisRecord(); });

                    const action = () => {
                        this._input.value = rec.q;
                        this._syncClearBtn();
                        if (rec.mode && rec.mode !== this._mode) {
                            // 切模式：_selectMode 内部会按新模式的查询词重跑搜索
                            this._selectMode(rec.mode);
                        } else {
                            // 同模式：原先只 focus 而不跑搜索，且输入框已聚焦时 focus 事件不会再触发，
                            // 表现为「填进去了内容但不弹结果」—— 这里直接重跑搜索并展示结果
                            // Same mode: run the search outright. Previously it only focused the input,
                            // which fired nothing when it was already focused (query filled, no results).
                            void this._doSearch(rec.q);
                            this._focusInput(false);
                        }
                    };
                    this._listen(itemEl, "mouseenter", () => this._setActive(idx));
                    this._listen(itemEl, "mouseleave", () => this._clearActive(idx));
                    this._listen(itemEl, "mousedown",  (e) => e.preventDefault());
                    const historyItemHandler = this._makeTouchHandler(action);
                    this._listen(itemEl, "touchstart", historyItemHandler.onTouchStart, { passive: true });
                    this._listen(itemEl, "touchend", historyItemHandler.onTouchEnd);
                    this._listen(itemEl, "click", () => { action(); });
                    this._itemEls.push(itemEl);
                }

                // ── footer：分页栏（与结果分组共用 _mkPagerBar）─────────────────
                this._mkPagerBar(this._dropdownInner, {
                    page: safePage,
                    totalPages,
                    pageSize: this._historyPageSize,
                    onSize: (n) => { this._historyPageSize = n; this._renderHistoryDropdown(date, records, 1); },
                    onPrev: () => this._renderHistoryDropdown(date, records, safePage - 1),
                    onNext: () => this._renderHistoryDropdown(date, records, safePage + 1)
                });
            }
        }
};
