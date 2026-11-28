import {webSearchUrl} from '../search/web-search.ts';
import {ownsSearchTarget} from './search-layers.ts';
import { MarkdownView, View } from 'obsidian';
import {isDirectorySuggestion} from './directory-suggest.ts';
import type {SearchBarCtor} from './search-bar-host.ts';
import {bindButtonActivation} from '../shared/button-activation.ts';
import { moment } from '../shared/moment.ts';
import { clearTimer, setTimer } from '../shared/timers.ts';
import {bindTouchLabels} from './touch-labels.ts';

// One cohesive behavior; shared state belongs to SearchBarComponent.
export const withEvents = <T extends SearchBarCtor>(Base: T) => class extends Base {
_clearSearchInput() {
            this._input.value='';
            this._onInput('');
            clearTimer(this._debounceTimer);this._debounceTimer=null;
            this._syncClearBtn();this._hideDropdown();
            void this._showHistory(moment().format('YYYY-MM-DD'));
            this._focusInput();
        }

_executeSearch() {
            const q = this._input.value.trim();
            if (!q) return;
            clearTimer(this._debounceTimer);this._debounceTimer=null;
            if (this._mode !== 'web') {
                ++this._historyVer;
                this._groupPages.clear();
                void this._doSearch(q);
            } else {
                this._hideDropdown();
                // web 模式：使用选中引擎（或第一个启用引擎）直接搜索
                const _allEnabledExec = (this.cfg.engines || []).filter(e => e.enabled);
                const eng = this._activeEngineId
                    ? (_allEnabledExec.find(e => e.id === this._activeEngineId) || _allEnabledExec[0])
                    : _allEnabledExec[0];
                if (eng) {
                    const url=webSearchUrl(eng.url,q);
                    this._recordHistory(eng.name,q,{kind:'url',url});this._openUrl(url);
                }
            }

            // Explicit submissions retain their actual mode; live searches do not write history.
            this._recordHistory();
        }

_themeUpdate() {
            if (this._input) {
                this._syncInputBorder();
                this._input.setCssStyles({color: "var(--text-normal)"});
            }
            [this._scopeBtn, this._goBtn].forEach(btn => {
                if (btn) {
                    btn.setCssStyles({color: "var(--primecore-accent)"});
                    btn.setCssStyles({borderColor: "color-mix(in srgb, var(--primecore-accent) 40%, transparent)"});
                }
            });
            // 搜索选项按钮跟随主题色
            if (this._contentToggleBtn) this._applyPanelBtnStyle(this._vaultPanelOpen);
        }

_bindEvents() {
            const document = this.container.ownerDocument;
            const window = document.defaultView;

            // 首次真实触摸即锁定触摸设备判定：捕获阶段 + once，保证先于本次触摸的任何处理器生效。
            // 输入法守卫全部以 _isTouchDevice 为前提，粘性标志让判定不再依赖主指针的上报。
            // Latch touch-device detection on the first real touch (capture + once, so it is set
            // before any handler of that very touch runs). Every keyboard guard hinges on
            // _isTouchDevice, and the sticky flag frees that decision from the pointer media query.
            this._onFirstTouch = () => { this._sawTouchInput = true; };
            this._listen(document, "touchstart", this._onFirstTouch, { capture: true, passive: true, once: true });

            // 输入事件（keyup 作 input 备份，应对部分 Android IME 不触发 input 的情况）
            let composing = false;
            let compositionEndedAt=Number.NEGATIVE_INFINITY;
            const isCompositionCommit=(event:KeyboardEvent)=>event.isComposing||event.key==='Enter'&&event.timeStamp-compositionEndedAt>=0&&event.timeStamp-compositionEndedAt<50;
            this._listen(this._input, 'compositionstart', () => {
                composing = true;
                clearTimer(this._debounceTimer); this._debounceTimer = null;
                ++this._historyVer; ++this._vaultSearchVer; ++this._webSearchVer;
            });
            this._listen(this._input, 'compositionend', event => {
                compositionEndedAt=event.timeStamp;
                composing = false; this._onInput(this._input.value); this._syncClearBtn();
            });
            this._listen(this._input, "input", event => { if (!composing && !(event as InputEvent).isComposing) this._onInput(this._input.value); this._syncClearBtn(); });
            this._listen(this._input, "keyup", event => { if(!composing&&!event.isComposing&&(event.key.length===1||event.key==='Backspace'||event.key==='Delete')) {if(this._input.value!==this._lastInputValue)this._onInput(this._input.value);this._syncClearBtn();} });
            this._listen(this._input, "keydown", e => { if (!composing&&!isCompositionCommit(e)) this._handleKey(e); });
            this._listen(document,'keydown',event=>{if(event.target!==this._input&&!isCompositionCommit(event))this._dispatchShortcut(event);});
            this.register(bindTouchLabels(document, element => [this._wrap,this._dropdown,this._scopeMenu,this._vaultSearchPanel].some(root => root?.contains(element))));

            // 清除按钮事件
            if (this._clearBtn) {
                this._listen(this._clearBtn, "mousedown",  (e) => e.preventDefault());
                this.register(bindButtonActivation(this._clearBtn,()=>this._clearSearchInput()));
                this._listen(this._clearBtn, "mouseenter", () => this._setSearchButtonBackground(this._clearBtn, true));
                this._listen(this._clearBtn, "mouseleave", () => this._setSearchButtonBackground(this._clearBtn));
            }

            // 聚焦时始终展示历史记录；只有程序化聚焦（切模式、点历史项等）才抑制一次。
            // Focus always opens history; programmatic focus can suppress it once.
            this._listen(this._input, "focus", () => {
                // 死栏（已卸载或结果层被清理）留在 DOM 里时，focus 只会落到空壳上；
                // 交给插件自愈重建，恢复查询/历史记录。
                // A dead bar's focus lands on an empty shell; ask the plugin to rebuild it.
                if (this._disposed || this._cleanedUp || !this._dropdown?.isConnected) {
                    this.plugin.recoverSearchBars(this.container);
                    return;
                }
                // Focusing the input leaves the options panel/scope menu and returns to
                // results or the idle view. / 聚焦输入框时收起搜索选项与模式菜单。
                if (this._vaultPanelOpen) this._closePanel({restoreDropdown: false});
                if (this._isScopeMenuOpen()) this._closeScopeMenu();
                const showHistory = !this._suppressHistoryFocus;
                this._suppressHistoryFocus = false;
                if (showHistory) {
                    if(!this._input.value.trim())this._restoreFocusedIdleView(true);
                    else if(this._lastQuery!==this._input.value.trim()||this._resultKind!=='results'||this._dropdown.style.display==='none')void this._doSearch(this._input.value.trim());
                    return;
                }
                const q = this._input.value.trim();
                if (q && (this._lastQuery!==q || this._resultKind!=='results' || this._dropdown.style.display==='none')) void this._doSearch(q);
            });
            // A click must also revive a dead bar or a view hidden by layout jitter.
            // 点击同样要能救活死栏或被布局抖动隐藏的记录视图。
            this._listen(this._input,'click',()=>this._restoreFocusedIdleView(true));

            // 搜索按钮
            this.register(bindButtonActivation(this._goBtn,()=>this._executeSearch()));

            // scopeBtn：切换模式选择菜单
            const _openScopeMenu = () => {
                // 触摸设备：先收起输入法，否则软键盘会盖住浮层
                this._dismissKeyboard();
                // 与搜索选项面板、结果下拉互斥：任何布局下都不叠在一起
                this._closePanel({ restoreDropdown: false });
                this._hideDropdown();
                this._applyScopeMenuPresentation();
                if (this._bottomSheet) {
                    this._scopeMenu.setCssStyles({ display: "flex", flexDirection: "column" });
                    this._syncMask(true);
                    this._raiseFloat(this._scopeMenu);
                    return;
                }
                const inputRect = this._input.getBoundingClientRect();
                this._scopeMenu.setCssStyles({
                    top: (inputRect.bottom + 6) + "px",
                    left: inputRect.left + "px",
                    display: "flex",
                    flexDirection: "column"
                });
                this._raiseFloat(this._scopeMenu);
                this._startReposition();
            };
            const _toggleScopeMenu = () => {
                this._isScopeMenuOpen() ? this._closeScopeMenu() : _openScopeMenu();
            };
            this.register(bindButtonActivation(this._scopeBtn,_toggleScopeMenu));

            // contentToggleBtn：点击打开/关闭搜索选项面板
            const _openPanel = () => {
                // 触摸设备：先收起输入法，否则软键盘会盖住底部卡片
                this._dismissKeyboard();
                this._vaultPanelOpen = true;
                this._applyPanelBtnStyle(true);
                this._applyPanelPresentation();
                // 与模式切换菜单、结果下拉互斥：任何布局下都不叠在一起
                this._closeScopeMenu();
                this._hideDropdown();
                if (this._bottomSheet) {
                    this._refreshPanelForMode(this._mode);
                    this._syncMask(true);
                    this._raiseFloat(this._vaultSearchPanel);
                    this._vaultSearchPanel.setCssStyles({display: "block"});
                    return;
                }
                const btnRect = this._contentToggleBtn.getBoundingClientRect();
                // 与 _repositionFloats 保持一致：左缘对齐按钮左缘（避免出现一帧的右对齐闪烁）
                this._vaultSearchPanel.setCssStyles({
                    top:   (btnRect.bottom + 6) + "px",
                    left:  btnRect.left + "px",
                    right: "auto",
                    display: "block"
                });
                this._refreshPanelForMode(this._mode);
                this._raiseFloat(this._vaultSearchPanel);
                this._startReposition();
            };
            const _togglePanel = () => {
                this._vaultPanelOpen ? this._closePanel() : _openPanel();
            };
            this.register(bindButtonActivation(this._contentToggleBtn,_togglePanel));
            this._listen(this._contentToggleBtn, "mouseenter", () => {
                // 悬停要比静息态(0.12)更亮，否则会越悬停越暗
                this._setSearchButtonBackground(this._contentToggleBtn, true);
            });
            this._listen(this._contentToggleBtn, "mouseleave", () => {
                this._applyPanelBtnStyle(this._vaultPanelOpen);
            });
            this._applyPanelBtnStyle(false);

            // scroll / resize：下拉和浮层跟随 pill 移动
            const _updateLayout = () => {
                if(this._disposed||this._cleanedUp)return;
                this._syncPageViewport();
                this._applyFloatingSearchShell();
                // 窗口跨过断点时实时切换形态（这是「动态判定」的落地处）
                const wasSheet = this._bottomSheet;
                const isSheet  = this._isSheetLayout();
                if (wasSheet !== isSheet) {
                    this._bottomSheet = isSheet;
                    if (isSheet) {
                        // Preserve the open records/results when changing presentation.
                        // 切换布局时只重新定位，保留记录与结果以及当前滚动位置。
                        if (this._vaultPanelOpen) { this._applyPanelPresentation(); this._syncMask(true); }
                        if (this._isScopeMenuOpen()) { this._applyScopeMenuPresentation(); this._syncMask(true); }
                        if(this._dropdown.style.display==='none')this._stopReposition();
                    } else {
                        // 转回锚定气泡：复位卡片样式并交回锚定跟踪（紧随其后的 _repositionFloats 重新锚定）
                        if (this._vaultPanelOpen || this._isScopeMenuOpen()) this._syncMask(false);
                        this._applyPanelPresentation();
                        this._applyScopeMenuPresentation();
                        this._startReposition();
                    }
                }
                if (this._dropdown.style.display !== "none" ||
                    this._isScopeMenuOpen() ||
                    this._isPanelVisible()) {
                    this._repositionFloats();
                }
                this._restoreFocusedIdleView();
            };
            let layoutPending=false;
            const _onScrollResize=()=>{
                if(layoutPending||this._disposed||this._cleanedUp)return;
                layoutPending=true;
                this._frame(()=>{layoutPending=false;_updateLayout();});
            };
            // 监听 cm-scroller（最近的滚动容器）和 window resize
            const scroller = this._wrap.closest(".cm-scroller") || window;
            this._listen(scroller, "scroll", _onScrollResize, { passive: true });
            this._listen(window, "resize", _onScrollResize, { passive: true });
            const observer=new window.ResizeObserver(_onScrollResize);
            observer.observe(this.presentation==='page'?this.container:this._wrap);
            this.register(()=>observer.disconnect());
            this.registerEvent(this.app.workspace.on('layout-change',_onScrollResize));
            if(window.visualViewport) {
                const viewport=window.visualViewport;
                viewport.addEventListener('resize',_onScrollResize);viewport.addEventListener('scroll',_onScrollResize);
                this.register(()=>{viewport.removeEventListener('resize',_onScrollResize);viewport.removeEventListener('scroll',_onScrollResize);});
            }

            // Capture the press before editor widgets / buttons stop bubbling their click.
            // All floating layers are owned by this component, not by the enclosing note.
            this._listen(document, "pointerdown", (e) => {
                if(isDirectorySuggestion(e.target))return;
                const target = e.target instanceof window.Node ? e.target : null;
                if (!target)return;
                if (!ownsSearchTarget(this,target)) {
                    this._recordHistory();
                    this._hideDropdown();
                    this._closeScopeMenu();
                    this._closePanel({restoreDropdown:false});
                }
            },{capture:true,passive:true});

            // 主题热更新
            this._listen(window, "theme:apply", () => {
                if (!this._wrap || !this._wrap.isConnected) return;
                this._themeUpdate();
            });

            // 切回本标签页时恢复结果：点击标签会触发外部 pointerdown 把下拉收起，而输入框
            // 可能仍保持焦点，focus 事件不会再触发，结果于是“消失”到下次输入为止。
            // Restore results when this leaf becomes active again: clicking another tab hides the
            // dropdown via the outside-pointerdown handler, and a still-focused input fires no new
            // focus event, so the results would stay hidden until the next keystroke.
            this.registerEvent(this.app.workspace.on('active-leaf-change', () => {
                this._restoreAfterActivate();
            }));

            // 组件卸载时清理 body 上的浮层 DOM。
            // Observe ancestors directly; result descendants do not need subtree observation.
            // 直接观察各层祖先，不对结果子树作全局观察。
            let _unloadTimer: import("../shared/timers.ts").TimerId | null = null;
            const _scheduleUnload = () => {
                if (this._wrap.isConnected || _unloadTimer) return;
                // Live Preview may detach and reattach the block; wait before unmounting.
                // Live Preview 可能先摘除再挂回代码块，稍等再决定是否卸载。
                _unloadTimer = setTimer(() => {
                    _unloadTimer = null;
                    if (this._wrap.isConnected) return;
                    // 标签页被隐藏时宿主可能把整个视图 DOM 暂时摘掉；块仍属于某个 Markdown 视图，
                    // 此时卸载组件会让返回后的搜索栏变成“活着但没结果”的死栏。只有块真的从宿主视图
                    // 里移除时才卸载。
                    // A hidden tab can be detached from the document while its block is still owned
                    // by a Markdown view. Unloading then leaves a dead bar on return; only unload once
                    // the block is gone from every hosted view.
                    const housed = this.app.workspace.getLeavesOfType('markdown').some(leaf => leaf.view.containerEl?.contains(this.container));
                    if (housed) {
                        this._hideDropdown();
                        this._closeScopeMenu();
                        this._closePanel({restoreDropdown:false});
                        return;
                    }
                    this.unload();
                }, 150);
            };
            const _cleanup = () => {
                if (this._cleanedUp) return;      // 重复清理必须是空操作 / Repeated cleanup is harmless.
                this._cleanedUp = true;
                this._idleMenu?.hide();this._idleMenuEl=null;
                this._stopReposition();
                this._dropdown.remove();
                this._scopeMenu.remove();
                if (this._vaultSearchPanel) this._vaultSearchPanel.remove();
                if (this._panelMask) this._panelMask.remove();
                scroller.removeEventListener("scroll", _onScrollResize);
                window.removeEventListener("resize", _onScrollResize);
                if (this._onFirstTouch) document.removeEventListener("touchstart", this._onFirstTouch, true);
                // 索引引擎：摘掉增量刷新监听并释放引用；引用计数归零才真正销毁索引
                // Index engine: drop the flush listeners and release the refcount; the index is
                // only disposed once the last mounted component releases it.
                this._teardownIndexFlush();
                if (this._engineRetained) {
                    this._engineRetained = false;
                    try {
                        const eng = this.plugin.indexEngine;
                        if (eng && typeof eng.release === "function") eng.release();
                    } catch (e) {
                        this._log("warn", "[SearchBar] 索引引擎释放失败:", e);
                    }
                }
                if (_unloadTimer) { clearTimer(_unloadTimer); _unloadTimer = null; }
                _observer.disconnect();
            };
            let observedParents:Node[]=[];
            const _observer = new window.MutationObserver(() => {
                if(this._wrap.isConnected)observeParents();
                _scheduleUnload();
            });
            const observeParents=()=>{
                const parents:Node[]=[];
                for(let parent=this._wrap.parentNode;parent;parent=parent.parentNode)parents.push(parent);
                if(parents.length===observedParents.length&&parents.every((parent,index)=>parent===observedParents[index]))return;
                _observer.disconnect();observedParents=parents;
                for(const parent of parents)_observer.observe(parent,{childList:true});
            };
            observeParents();
            // 暴露到全局，供下次渲染时主动清理
            this._cleanup = _cleanup;
            this.register(_cleanup);
        }

_restoreFocusedIdleView(force=false):void {
            const input=this._input;
            if(this._disposed||this._cleanedUp){if(force)this.plugin.recoverSearchBars(this.container);return;}
            // A dead bar's input keeps focus, so focus never fires again; recover on click.
            // 死栏的输入框仍持有焦点，不会再触发 focus；点击时必须主动恢复。
            if(!this._dropdown?.isConnected){
                if(force)this.plugin.recoverSearchBars(this.container);
                return;
            }
            if(input.ownerDocument.activeElement!==input||this._resultToolView!=='results')return;
            // A click on an already-focused query emits no new focus event.
            // 已聚焦的查询框再次点击不会触发 focus，显式点击仍须恢复结果。
            const query=input.value.trim();
            if(query){
                if(force&&(this._lastQuery!==query||this._resultKind!=='results'||this._dropdown.style.display==='none'))void this._doSearch(query);
                return;
            }
            if(this._vaultPanelOpen||this._isScopeMenuOpen()){
                if(!force)return;
                if(this._vaultPanelOpen)this._closePanel({restoreDropdown:false});
                if(this._isScopeMenuOpen())this._closeScopeMenu();
            }
            if(!this._wrap?.getClientRects().length){
                // Live Preview may reattach the block a frame later. / 块可能下一帧才挂回。
                // ResizeObserver/layout-change retries when the block becomes visible.
                // 由布局观察器在重新可见时恢复，避免隐藏视图里不断排入零延时任务。
                return;
            }
            if(this._dropdown.style.display!=='none'){
                // Already visible: re-anchor after a width change instead of bailing out.
                // 已显示时宽度变动只需重新锚定，不能因为“已打开”而不作为。
                if(this.presentation!=='page')this._repositionFloats();
                this._raiseFloat(this._dropdown);
                return;
            }
            // Multiple resize/focus events share one load; typing still cancels via _historyVer.
            // An explicit click may retry even while a load is pending.
            // 聚焦、点击与布局事件共用一次加载；输入仍通过历史版本号取消异步结果，显式点击可重试。
            if(this._idleRestorePending!==null&&!force)return;
            const date=this._recordHeader?.querySelector<HTMLInputElement>('input[type=date]')?.value;
            const pending=this._showHistory(date||moment().format('YYYY-MM-DD'));
            this._idleRestorePending=pending;
            void pending.catch(error=>this._log('warn','[SearchBar] 恢复记录视图失败:',error)).finally(()=>{
                if(this._idleRestorePending===pending)this._idleRestorePending=null;
            });
        }

_restoreAfterActivate() {
            try {
                if (this._disposed || this._cleanedUp) return;
                if (!this._wrap?.isConnected) return;
                if(!this._input?.value.trim()){this._restoreFocusedIdleView();return;}
                if (this._resultToolView !== 'results') return;
                if (this._dropdown?.style.display !== 'none') return;
                // A tab switch can hide results without blurring its input. The non-empty
                // query above means there is no idle history view to replace here.
                // 切标签可能仅隐藏结果却未使输入框失焦；此处已有查询词，无空闲历史会被覆盖。
                const activeView = this.app.workspace.getActiveViewOfType(View);
                const activeFile = this.app.workspace.getActiveFile();
                const noteLeaf = this.app.workspace.getLeavesOfType('markdown')
                    .find(leaf => leaf.view instanceof MarkdownView && leaf.view.containerEl?.contains(this.container));
                const inActiveView = activeView?.containerEl?.contains(this.container) ?? false;
                // getActiveViewOfType is null while focus sits in a sidebar or tab header, so the
                // active file + owning note leaf is the reliable signal for an embedded bar.
                const inActiveNote = !!activeFile && noteLeaf?.view instanceof MarkdownView && noteLeaf.view.file === activeFile;
                if (!inActiveView && !inActiveNote) return;
                void this._doSearch(this._input.value.trim());
            } catch (error) {
                this._log('warn', '[SearchBar] 恢复搜索结果失败:', error);
            }
        }

async render() {
            // mount owns rollback and reporting, including layers created before events bind.
            this._buildShell();
            this._applyFloatingSearchShell();
            this._syncSearchAction();
            this._buildDropdown();
            this._buildScopeMenu();
            this._buildVaultSearchPanel();
            this._buildPanelMask();
            this._bindEvents();
            this._setupIndexEngine();
        }
};
