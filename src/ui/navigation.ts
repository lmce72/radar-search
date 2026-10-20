import {positionFloatingElement,viewportBounds} from './floating-geometry.ts';
import * as Obsidian from 'obsidian';
import { moment } from '../shared/moment.ts';
import { SHEET_BREAKPOINT, MIN_PANEL_H, PILL_ICON_SIZE, EXT_ICON } from '../shared/constants.ts';
import { IconRenderer } from '../shared/icons.ts';
import { makeTouchHandler } from '../shared/touch.ts';

// One cohesive behavior; shared state belongs to SearchBarComponent.
export const withNavigation = Base => class extends Base {
  declare _vaultSortMode;
  declare _mode;
  declare _activeIdx;
  declare _itemEls;
  declare _rafId;
  declare _bottomSheet;

async _saveCfgKey(key, value) {
    try { await this.plugin.updateSetting(key, value, false); this.cfg[key] = value; }
    catch (error) { this._log('error', '设置保存失败', error); }
}

_sortFiles(files, mode) {
            const s = [...files];
            const cmp = {
                "alpha-asc":  (a, b) => a.basename.localeCompare(b.basename),
                "alpha-desc": (a, b) => b.basename.localeCompare(a.basename),
                "mtime-desc": (a, b) => (b.stat?.mtime || 0) - (a.stat?.mtime || 0),
                "mtime-asc":  (a, b) => (a.stat?.mtime || 0) - (b.stat?.mtime || 0),
                "ctime-desc": (a, b) => (b.stat?.ctime || 0) - (a.stat?.ctime || 0),
                "ctime-asc":  (a, b) => (a.stat?.ctime || 0) - (b.stat?.ctime || 0),
            };
            // 「相关度」的排序由索引引擎给出（引擎路径根本不调用本方法）。走到这里说明引擎
            // 尚未就绪或已关闭，此时按最近编辑兜底，好过保留 vault 枚举顺序。
            // Relevance ordering comes from the index engine, which never calls this method. Reaching
            // here means the engine is not ready or is off, so fall back to recency rather than
            // leaving the vault's enumeration order.
            if (mode === "relevance") return s.sort(cmp["mtime-desc"]);
            return s.sort(cmp[mode] || cmp["mtime-desc"]);
        }

_getBookmarksInstance() {
            try {
                const viaInternal = this.app.internalPlugins?.plugins?.["bookmarks"];
                if (viaInternal && viaInternal.instance && Array.isArray(viaInternal.instance.items)) {
                    return viaInternal.instance;
                }
                const viaPlugins = this.app.plugins?.plugins?.["bookmarks"];
                if (viaPlugins && viaPlugins.instance && Array.isArray(viaPlugins.instance.items)) {
                    return viaPlugins.instance;
                }
                return null;
            } catch (e) {
                this._log("error", "[SearchBar] 获取书签实例失败:", e);
                return null;
            }
        }

_flattenBookmarks(items) {
            const result = [];
            const walk = (list) => {
                if (!Array.isArray(list)) return;
                for (const item of list) {
                    result.push(item);
                    if (item.items) walk(item.items);
                }
            };
            walk(items);
            return result;
        }

_selectMode(mode,runSearch=true) {
            if(this._mode!==mode) {this._resultCategory='files';this._preferredResultCategory='files';this._resultCategoryChosen=false;}
            this._mode = mode;
            this._syncSearchAction();
            const mcfg = this._modeConfig()[mode];
            const iconWrap = this._scopeBtn.querySelector("span");
            if (iconWrap) this._setIcon(iconWrap, mcfg.icon, PILL_ICON_SIZE);
            this._input.placeholder = mcfg.placeholder;
            this._closeScopeMenu();
            // 面板随模式刷新（vault/web/global 显示不同内容）
            if (this._vaultSearchPanel) {
                if (this._vaultPanelOpen) {
                    this._refreshPanelForMode(mode);
                }
                this._applyPanelBtnStyle(this._vaultPanelOpen);
            }
            this._hideDropdown();
            if (runSearch && this._input.value.trim()) this._doSearch(this._input.value.trim());
            // 切模式不该在触摸设备上弹出输入法（原先无条件 focus，手机上一按模式键就弹键盘）
            if(runSearch)this._focusInput();

            // ── 需求2：Pill 按钮标签随模式更新 ─────────────────────────────
            if (!this._contentToggleLabelEl) return;
            try {
                if (mode === "web") {
                    const activeEng = (this.cfg.engines || []).find(e => e.id === this._activeEngineId);
                    this._contentToggleLabelEl.textContent = activeEng ? activeEng.name : "搜索选项";
                    this._setIcon(this._contentToggleIconEl, "globe", PILL_ICON_SIZE);
                } else {
                    this._contentToggleLabelEl.textContent = this._selectedPreset || "搜索选项";
                    const preset = (this.cfg.searchPresets || []).find(p => p.name === this._selectedPreset);
                    this._setIcon(this._contentToggleIconEl, preset?.icon || "sliders-horizontal", PILL_ICON_SIZE);
                }
            } catch (e) {
                this._log("error", "[SearchBar] _selectMode 标签刷新失败:", e);
            }
            // 模式切换后按钮状态图标随之更新（web 模式不显示专项搜索状态）
            this._refreshContentToggleStatus();
        }

_showDropdown() {
            const document = this.container.ownerDocument;
            const window = document.defaultView;
            const getComputedStyle = window.getComputedStyle.bind(window);
            const requestAnimationFrame = window.requestAnimationFrame.bind(window);
            const cancelAnimationFrame = window.cancelAnimationFrame.bind(window);

            if (this._vaultPanelOpen || this._isScopeMenuOpen()) {
                // 输入框聚焦 = 用户在搜索 → 收起面板与菜单，让位给结果下拉
                // 否则（如面板内拨动开关触发的重渲染）保持面板展开，仅不显示下拉，避免面板被自己关掉
                if (document.activeElement !== this._input) return;
                this._closeScopeMenu();
                this._closePanel({ restoreDropdown: false });
            }
            this._dropdown.setCssStyles({display:'flex'});
            this._syncPageViewport();
            if(this.presentation!=='page') {this._raiseFloat(this._dropdown);this._repositionFloats();this._startReposition();}
        }

_hideDropdown() {
            if(this.presentation==='page'&&this._resultKind==='results'&&this._input.value.trim())return;
            this._dropdown.setCssStyles({display: "none"});
            this._activeIdx = -1;
            this._itemEls = [];
            // 面板和 scopeMenu 均关闭时才停止 rAF 循环
            // 底部卡片形态下面板不需要跟随重定位，不参与循环存续判定
            const panelNeedsTrack = this._isPanelVisible() && !this._bottomSheet;
            if (!this._isScopeMenuOpen() && !panelNeedsTrack) this._stopReposition();
        }

_raiseFloat(el) {
            if (!el) return;
            el.setCssStyles({zIndex: String(9100 + (++this._zCounter))});
        }

_syncClearBtn() {
            if (!this._clearBtn) return;
            const hasValue = this._input.value.length > 0;
            this._clearBtn.setCssStyles({display: hasValue ? "inline-flex" : "none"});
        }

_startReposition() {
            if (this._rafId) return;
            const loop = () => {
                // 底部卡片形态下面板与菜单不参与锚定跟踪
                const panelNeedsTrack = this._isPanelVisible() && !this._bottomSheet;
                const menuNeedsTrack  = this._isScopeMenuOpen() && !this._bottomSheet;
                if ((this.presentation!=='page' && this._dropdown.style.display !== "none") ||
                    menuNeedsTrack ||
                    panelNeedsTrack) {
                    this._repositionFloats();
                    this._rafId = this._frame(loop);
                } else {
                    this._rafId = null;
                }
            };
            this._rafId = this._frame(loop);
        }

_stopReposition() {
            const document = this.container.ownerDocument;
            const window = document.defaultView;
            const getComputedStyle = window.getComputedStyle.bind(window);
            const requestAnimationFrame = window.requestAnimationFrame.bind(window);
            const cancelAnimationFrame = window.cancelAnimationFrame.bind(window);

            if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
        }

_repositionFloats() {
            const document = this.container.ownerDocument;
            const window = document.defaultView;
            const getComputedStyle = window.getComputedStyle.bind(window);
            const requestAnimationFrame = window.requestAnimationFrame.bind(window);
            const cancelAnimationFrame = window.cancelAnimationFrame.bind(window);

            // 每次定位前重算形态：拖动窗口跨过断点时立即分流（底部卡片不参与锚定）
            this._bottomSheet = this._isSheetLayout();
            this._applyFloatingSearchShell();
            const rect   = this._input.getBoundingClientRect();
            const GAP    = 6;
            const MARGIN = 8;
            const vw     = window.innerWidth;
            const vh     = window.innerHeight;
            this._syncPageViewport();
            if(this._bottomSheet) {
                if(this._isPanelVisible())this._applyPanelPresentation();
                if(this._isScopeMenuOpen())this._applyScopeMenuPresentation();
            }

            if(this.presentation!=='page'&&this._dropdown.style.display!=='none') {
                this._dropdown.setCssStyles({display: 'flex'});this._dropdown.setCssStyles({flexDirection: 'column'});
                const header=this._dropdown.firstElementChild;
                const natural=(header?.scrollHeight||0)+this._dropdownInner.scrollHeight+2;
                // A phone floating search is a top sheet: keep results aligned with the
                // full-width input row, not with the (narrower) text input.
                // 手机浮层的搜索结果与整行输入区同宽，而不是只对齐文本框。
                const overlaySheet = this._bottomSheet && this.container?.classList?.contains('primecore-floating-search');
                const shell = overlaySheet ? this.container.getBoundingClientRect() : null;
                const anchor = overlaySheet
                    ? {left:shell.left, top:rect.top, bottom:rect.bottom, width:shell.width}
                    : rect;
                positionFloatingElement(this._dropdown,anchor,Math.max(anchor.width,240),natural);
                this._dropdownInner.setCssStyles({maxHeight: 'none'});this._dropdownInner.setCssStyles({minHeight: '0'});
                this._dropdownInner.setCssStyles({flex: '1 1 auto'});this._dropdownInner.setCssStyles({overflowY: 'auto'});
            }

            // ── 模式切换菜单（底部卡片形态下由 _applyScopeMenuPresentation 定格，不锚定）──
            if (this._isScopeMenuOpen() && !this._bottomSheet) {
                const bR    = this._scopeBtn.getBoundingClientRect();
                const mW    = this._scopeMenu.offsetWidth  || 160;
                const mH    = this._scopeMenu.offsetHeight || 100;
                const sLeft = Math.max(MARGIN, Math.min(bR.left, vw - mW - MARGIN));
                const sBelowTop = bR.bottom + GAP;
                // 下方放不下时翻转到上方
                const sTop = (sBelowTop + mH < vh - MARGIN)
                    ? sBelowTop
                    : Math.max(MARGIN, bR.top - GAP - mH);
                this._scopeMenu.setCssStyles({
                    top:  sTop + "px",
                    left: sLeft + "px"
                });
            }

            // ── 搜索选项面板（底部卡片形态下由 _applyPanelPresentation 定格，不锚定）──
            if (this._isPanelVisible() && !this._bottomSheet) {
                const bR        = this._contentToggleBtn.getBoundingClientRect();
                positionFloatingElement(this._vaultSearchPanel,bR,Math.max(this._vaultSearchPanel.offsetWidth||240,240),this._vaultSearchPanel.scrollHeight,480);
            }
            // The source editor follows visual-viewport changes (soft keyboard).
            // 信息源编辑浮层跟随可视视口变化（软键盘）。
            if (this._sourceEditor?.isConnected) this._positionSourceEditor?.();
        }

_syncPageViewport() {
            if(this.presentation!=='page')return;
            const viewport=viewportBounds(this.container.ownerDocument.defaultView);
            const rect=this.container.getBoundingClientRect();
            const overlap=Math.max(0,rect.bottom-viewport.top-viewport.height);
            this.container.setCssProps({'--primecore-bottom-obstruction':(overlap?overlap+8:0)+'px'});
        }

_prepBar(kind) {
            try {
                const el = this._barLeft;
                if (!el) return;
                const isHistory = kind === "history";
                if(isHistory)el.empty();
                this._resultKind=kind;this._syncResultTools(isHistory);
                // 右区按钮显隐：清除历史只在历史视图；在 Obsidian 打开只在结果视图（历史视图里没有查询词）
                if (this._clearHistoryBtn) this._clearHistoryBtn.setCssStyles({display: "none"});
                if (this._cornerBtnEl) this._cornerBtnEl.setCssStyles({display: isHistory || this.presentation==='page' ? "none" : "flex"});
                if(isHistory) {el.removeClass('primecore-result-tabs');el.removeAttribute('role');el.removeAttribute('aria-label');this._dropdownInner.removeAttribute('role');}
                else this._dropdownInner.setAttribute('role','tabpanel');
                if (isHistory) {
                    this._syncResultTools(true);
                    return;
                }
                this._renderResultCategories();
                return;
            } catch (e) {
                this._log("error", "[SearchBar] 顶栏上下文切换失败:", e);
            }
        }
};
