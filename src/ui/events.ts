import {isDirectorySuggestion} from './directory-suggest.ts';
import {bindButtonActivation} from '../shared/button-activation.ts';
import * as Obsidian from 'obsidian';
import { moment } from '../shared/moment.ts';
import { SHEET_BREAKPOINT, MIN_PANEL_H, PILL_ICON_SIZE, EXT_ICON } from '../shared/constants.ts';
import { IconRenderer } from '../shared/icons.ts';
import { makeTouchHandler } from '../shared/touch.ts';

// One cohesive behavior; shared state belongs to SearchBarComponent.
export const withEvents = Base => class extends Base {
  declare _onFirstTouch;
  declare _sawTouchInput;
  declare _vaultPanelOpen;
  declare _bottomSheet;
  declare _cleanedUp;
  declare _engineRetained;
  declare _cleanup;

_clearSearchInput() {
            this._input.value='';
            this._onInput('');
            clearTimeout(this._debounceTimer);this._debounceTimer=null;
            this._syncClearBtn();this._hideDropdown();
            this._showHistory(moment().format('YYYY-MM-DD'));
            this._focusInput();
        }

_executeSearch() {
            const q = this._input.value.trim();
            if (!q) return;
            clearTimeout(this._debounceTimer);this._debounceTimer=null;
            if (this._mode !== 'web') {
                ++this._historyVer;
                this._groupPages.clear();
                this._doSearch(q);
            } else {
                this._hideDropdown();
                // web 模式：使用选中引擎（或第一个启用引擎）直接搜索
                const _allEnabledExec = (this.cfg.engines || []).filter(e => e.enabled);
                const eng = this._activeEngineId
                    ? (_allEnabledExec.find(e => e.id === this._activeEngineId) || _allEnabledExec[0])
                    : _allEnabledExec[0];
                if (eng) this._openUrl(eng.url.replace("{q}", encodeURIComponent(q)));
            }

            // Explicit submissions retain their actual mode; live searches do not write history.
            this._saveToHistory(q, this._mode);
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
            const getComputedStyle = window.getComputedStyle.bind(window);
            const requestAnimationFrame = window.requestAnimationFrame.bind(window);
            const cancelAnimationFrame = window.cancelAnimationFrame.bind(window);

            // 首次真实触摸即锁定触摸设备判定：捕获阶段 + once，保证先于本次触摸的任何处理器生效。
            // 输入法守卫全部以 _isTouchDevice 为前提，粘性标志让判定不再依赖主指针的上报。
            // Latch touch-device detection on the first real touch (capture + once, so it is set
            // before any handler of that very touch runs). Every keyboard guard hinges on
            // _isTouchDevice, and the sticky flag frees that decision from the pointer media query.
            this._onFirstTouch = () => { this._sawTouchInput = true; };
            this._listen(document, "touchstart", this._onFirstTouch, { capture: true, passive: true, once: true });

            // 输入事件（keyup 作 input 备份，应对部分 Android IME 不触发 input 的情况）
            this._listen(this._input, "input",  () => { this._onInput(this._input.value); this._syncClearBtn(); });
            this._listen(this._input, "keyup", event => { if(event.key.length===1||event.key==='Backspace'||event.key==='Delete') {if(this._input.value!==this._lastInputValue)this._onInput(this._input.value);this._syncClearBtn();} });
            this._listen(this._input, "keydown", (e) => this._handleKey(e));

            // 清除按钮事件
            if (this._clearBtn) {
                this._listen(this._clearBtn, "mousedown",  (e) => e.preventDefault());
                this.register(bindButtonActivation(this._clearBtn,()=>this._clearSearchInput()));
                this._listen(this._clearBtn, "mouseenter", () => this._setSearchButtonBackground(this._clearBtn, true));
                this._listen(this._clearBtn, "mouseleave", () => this._setSearchButtonBackground(this._clearBtn));
            }

            // 聚焦时：有内容则重跑搜索，无内容则展示历史
            this._listen(this._input, "focus", () => {
                const q = this._input.value.trim();
                if (q) {
                    if(this._lastQuery!==q || this._resultKind!=='results' || this._dropdown.style.display==='none')this._doSearch(q);
                } else {
                    this._showHistory(moment().format("YYYY-MM-DD"));
                }
            });

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
            const _onScrollResize = () => {
                this._syncPageViewport();
                this._applyFloatingSearchShell();
                // 窗口跨过断点时实时切换形态（这是「动态判定」的落地处）
                const wasSheet = this._bottomSheet;
                const isSheet  = this._isSheetLayout();
                if (wasSheet !== isSheet) {
                    this._bottomSheet = isSheet;
                    if (isSheet) {
                        // 转为底部卡片：收起锚定下拉，重施卡片样式与遮罩
                        if(this.presentation!=='page')this._hideDropdown();
                        if (this._vaultPanelOpen) { this._applyPanelPresentation(); this._syncMask(true); }
                        if (this._isScopeMenuOpen()) { this._applyScopeMenuPresentation(); this._syncMask(true); }
                        this._stopReposition();
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
            };
            // 监听 cm-scroller（最近的滚动容器）和 window resize
            const scroller = this._wrap.closest(".cm-scroller") || window;
            this._listen(scroller, "scroll", _onScrollResize, { passive: true });
            this._listen(window, "resize", _onScrollResize, { passive: true });
            if(this.presentation==='page') {
                const observer=new window.ResizeObserver(_onScrollResize);
                observer.observe(this.container);
                this.register(()=>observer.disconnect());
                this.registerEvent(this.app.workspace.on('layout-change',_onScrollResize));
            }
            if(window.visualViewport) {
                const viewport=window.visualViewport;
                viewport.addEventListener('resize',_onScrollResize);viewport.addEventListener('scroll',_onScrollResize);
                this.register(()=>{viewport.removeEventListener('resize',_onScrollResize);viewport.removeEventListener('scroll',_onScrollResize);});
            }

            // Capture the press before editor widgets / buttons stop bubbling their click.
            // All floating layers are owned by this component, not by the enclosing note.
            this._listen(document, "pointerdown", (e) => {
                if(isDirectorySuggestion(e.target)||this._quickFilterMenu?.el.contains(e.target))return;
                const inWrap  = this._wrap.contains(e.target);
                const inDrop  = this._dropdown.contains(e.target);
                const inMenu  = this._scopeMenu.contains(e.target);
                const inPanel = this._vaultSearchPanel?.contains(e.target);
                const inMask  = this._panelMask?.contains(e.target);
                const inEditor = this._sourceEditor?.contains(e.target);
                if (!inWrap && !inDrop && !inMenu && !inPanel && !inMask && !inEditor) {
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

            // 组件卸载时清理 body 上的浮层 DOM
            // 只观察 wrap 的父节点（不含 subtree），避免 _renderDropdown 写 body 时反复触发
            let _unloadTimer = null;
            const _scheduleUnload = () => {
                if (this._wrap.isConnected || _unloadTimer) return;
                // Live Preview may detach and reattach the block; wait before unmounting.
                // Live Preview 可能先摘除再挂回代码块，稍等再决定是否卸载。
                _unloadTimer = window.setTimeout(() => {
                    _unloadTimer = null;
                    if (!this._wrap.isConnected) this.unload();
                }, 150);
            };
            const _cleanup = () => {
                if (this._cleanedUp) return;      // 两个观察器都可能触发，重复清理必须是空操作
                this._cleanedUp = true;
                this._quickFilterMenu?.close();
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
                if (_unloadTimer) { clearTimeout(_unloadTimer); _unloadTimer = null; }
                _observer.disconnect();
                if (_bodyObserver) _bodyObserver.disconnect();
            };
            const _wrapParent = this._wrap.parentNode || document.body;
            const _observer = new MutationObserver(_scheduleUnload);
            _observer.observe(_wrapParent, { childList: true });
            // 再盯一层 document.body：块被**整体摘除**（宿主容器连同上层的父节点一起移除）时，只盯
            // _wrap 的父节点是看不见的 —— 变化发生在上层，父节点自身没被动过。实测「移除宿主容器后
            // 浮层与索引引用计数都不回收」，故必须多这一只观察器。
            // Also watch document.body: when the whole container is removed, the mutation happens
            // above _wrap's parent, so watching only that parent never fires. Measured: neither the
            // floating layers nor the engine refcount were released after removing the host.
            const _bodyObserver = new MutationObserver(_scheduleUnload);
            _bodyObserver.observe(document.body, { childList: true });
            // 暴露到全局，供下次渲染时主动清理
            this._cleanup = _cleanup;
            this.register(_cleanup);
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
