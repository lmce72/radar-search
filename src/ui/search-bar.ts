import { Component } from 'obsidian';
import type RadarSearchPlugin from '../main.ts';
import type {SearchSettings,SearchMode,SearchMountOptions,SearchSession,ResultCategory} from '../types.ts';
import { setTimer, clearTimer, type TimerId } from '../shared/timers.ts';
import { withLayout } from '../ui/layout.ts';
import { withPanel } from '../ui/options-panel.ts';
import { withWebOptions } from '../ui/web-options.ts';
import { withNavigation } from '../ui/navigation.ts';
import { withResults } from '../ui/results.ts';
import { withSnippets } from '../search/snippets.ts';
import { withIndexIntegration } from '../search/index-integration.ts';
import { withVaultSearch } from '../search/vault-search.ts';
import { withGlobalSearch } from '../search/global-search.ts';
import { withWebSearch } from '../search/web-search.ts';
import { withInteractions } from '../ui/interactions.ts';
import { withMetadataSearch } from '../search/metadata-search.ts';
import { withHistory } from '../history/history-behavior.ts';
import { withEvents } from '../ui/events.ts';
import {withQuickFiltering} from './quick-filtering.ts';
import type {QuickExclusionMenu} from './quick-exclusion-menu.ts';
import {withResultTools} from './result-tools.ts';
import {withResultPresentation} from './result-presentation.ts';
type SearchBarBehavior = Component & {render():Promise<void>;_focusInput():void;_teardownIndexFlush():void;_returnToResults():void;getSearchSession():SearchSession;applySearchSession(session:SearchSession):Promise<void>};
const Behavior = [withQuickFiltering,withResultTools, withResultPresentation, withLayout, withPanel, withWebOptions, withNavigation, withResults, withSnippets, withIndexIntegration, withVaultSearch, withGlobalSearch, withWebSearch, withInteractions, withMetadataSearch, withHistory, withEvents].reduce<unknown>((Base, mixin) => mixin(Base), Component) as new () => SearchBarBehavior;
export class SearchBarComponent extends Behavior {
  declare presentation:'floating'|'page';
  declare _resultCategory:ResultCategory;
  declare _preferredResultCategory:ResultCategory;
  declare _resultCategoryChosen:boolean;
  declare _quickExcludedPaths:string[];
  declare _quickFilterMenu:QuickExclusionMenu|null;
  declare _resultToolView:'results'|'sort'|'filter'|'presetName';
  declare _temporaryFilter:import('../types.ts').PathFilter|null;
  declare _resultKind:'results'|'history';
  declare _webSearchVer:number;
  declare _sourceEditor:HTMLElement;
  declare plugin:RadarSearchPlugin;
  declare _disposed:boolean;
  declare _timers:Set<TimerId>;
  declare _frames:Set<number>;
  declare container:HTMLElement;
  declare app:import('obsidian').App;
  declare cfg:SearchSettings;
  declare _mode:SearchMode;
  declare _activeIdx;
  declare _itemEls;
  declare _abortCtrls;
  declare _debounceTimer;
  declare _historyVer;
  declare _vaultSearchVer;
  declare _contentSearch;
  declare _contentToggleBtn;
  declare _vaultSearchPanel;
  declare _panelMask;
  declare _sawTouchInput;
  declare _engineRetained;
  declare _cleanedUp;
  declare _indexFlushBound;
  declare _indexFlushTimer;
  declare _indexBlurHandler;
  declare _indexVisHandler;
  declare _bottomSheet;
  declare _vaultPanelOpen;
  declare _vaultSortMode;
  declare _searchWikiLinks;
  declare _searchMdLinks;
  declare _searchBookmarks;
  declare _searchTags;
  declare _searchCommands;
  declare _searchNonMarkdown;
  declare _searchProperties;
  declare _extendedContext;
  declare _selectedPreset;
  declare _limitContentResults;
  declare _zCounter;
  declare _historyPage;
  declare _historyPageSize;
  declare _showAllHistory;
  declare _groupPages;
  declare _lastGroups;
  declare _dropdownPageSize;
  declare _wrap;
  declare _pill;
  declare _scopeBtn;
  declare _input;
  declare _goBtn;
  declare _dropdown;
  declare _dropdownInner;
  declare _scopeMenu;
  declare _clearBtn;
  declare _rafId;
  declare _activeEngineId;
  declare _webEditMode;
  declare _webSourceRowEl;
  declare _sourceEditBtnEl;
  declare _engineChipEls;
  declare _engineRowEl;

constructor(plugin:RadarSearchPlugin, container:HTMLElement, options:SearchMountOptions={}) {
            super();
            const appInst = plugin.app;
            const cfg = structuredClone(plugin.settings);
            this.plugin = plugin;
            this.presentation=options.presentation||'floating';
            this._resultCategory='files';
            this._preferredResultCategory='files';
            this._resultCategoryChosen=false;this._quickExcludedPaths=[];this._quickFilterMenu=null;
            this._disposed = false;
            this._timers = new Set();
            this._frames = new Set();
            
            this.container = container;
            this.app = appInst;
            this.cfg = cfg;

            // 搜索模式：global | vault | web，从配置读取默认值
            this._mode = cfg.defaultMode || "global";
            // 当前高亮项索引
            this._activeIdx = -1;
            // 下拉中的所有 item 元素引用
            this._itemEls = [];
            // web 搜索 AbortController 列表（每次输入前 abort 上一批）
            this._abortCtrls = [];
            this._webSearchVer=0;
            // 防抖计时器
            this._debounceTimer = null;
            // 历史下拉版本计数器（取消竞态：focus 触发的 _showHistory 被输入打断时丢弃结果）
            this._historyVer = 0;
            // vault/global 内容搜索版本计数器（与 _webSearchVer 模式相同）
            this._vaultSearchVer = 0;
            // 内容搜索内存开关（初始从 cfg 读取，面板内 toggle 实时翻转）
            this._contentSearch = !!cfg.vaultContentSearch;
            // pill 上搜索选项按钮 DOM 引用
            this._contentToggleBtn = null;
            // 搜索选项气泡面板 DOM 引用
            this._vaultSearchPanel = null;
            // 底部卡片遮罩 DOM 引用（面板与模式菜单共用）
            this._panelMask = null;
            // 是否收到过真实触摸事件（粘性标志，见 _isTouchDevice）
            this._sawTouchInput = false;
            // 索引引擎引用计数与增量刷新监听（见 _setupIndexEngine / _teardownIndexFlush）
            this._engineRetained = false;
            this._cleanedUp = false;
            this._indexFlushBound = false;
            this._indexFlushTimer = null;
            this._indexBlurHandler = null;
            this._indexVisHandler = null;
            // 当前是否处于底部卡片布局（每次呈现前由 _isSheetLayout 重算）
            this._bottomSheet = false;
            // 面板开关状态
            this._vaultPanelOpen = false;
            // 排序模式
            this._vaultSortMode = cfg.vaultSortMode || "mtime-desc";
            // 专项搜索开关（命令为默认开启：配置缺省视为 true，可用面板开关关闭）
            this._searchWikiLinks = !!cfg.searchWikiLinks;
            this._searchMdLinks   = !!cfg.searchMdLinks;
            this._searchBookmarks = !!cfg.searchBookmarks;
            this._searchTags      = !!cfg.searchTags;
            this._searchCommands  = cfg.searchCommands !== false;
            // 非 markdown 文件搜索：默认关闭（配置缺省视为 false）
            this._searchNonMarkdown = !!cfg.searchNonMarkdown;
            // YAML 属性（frontmatter）搜索：默认关闭（新增匹配源不改变既有结果集）
            this._searchProperties = !!cfg.searchProperties;
            this._extendedContext = !!cfg.extendedContext;
            // 当前选中预设名
            this._selectedPreset  = cfg.defaultPreset || "";
            // 是否限制内容匹配结果数量（false=不限制，依赖分页；true=按数字框截断）
            this._limitContentResults = typeof cfg.limitContentResults === "boolean" ? cfg.limitContentResults : false;
            // 浮层窗口焦点计数器：每次激活浮层时递增，模拟窗口管理器 z-index 优先级
            this._zCounter = 0;

            // 历史记录分页状态
            this._historyPage     = 1;
            this._historyPageSize = Number(cfg.historyPageSize) || 8;
            // 显示所有历史记录开关（不分日期）
            this._showAllHistory  = false;

            // 下拉分组分页状态（Map: groupKey → currentPage）
            this._groupPages      = new Map();
            // 分组展开状态（标题 → 是否展开）与最近一次分组快照（供展开/收起后重渲染）
            this._lastGroups = null;
            this._dropdownPageSize = Number(cfg.dropdownPageSize) || 10;

            // DOM 引用
            this._wrap = null;
            this._pill = null;
            this._scopeBtn = null;
            this._input = null;
            this._goBtn = null;
            this._dropdown = null;
            this._dropdownInner = null;
            this._scopeMenu = null;
            // 清除按钮（输入框右侧，有内容时显示）
            this._clearBtn = null;
            // 连续坐标跟踪 rAF id
            this._rafId = null;

            // ── 互联网搜索扩展状态 ────────────────────────────────────────────
            // 当前选中引擎 id（null = 使用所有已启用引擎）
            this._activeEngineId  = cfg.activeEngineId || null;
            // 信息源编辑模式开关
            this._webEditMode     = false;
            // 信息源 chip 行 DOM 引用（编辑模式重渲染用）
            this._webSourceRowEl  = null;
            // 信息源编辑按钮 DOM 引用
            this._sourceEditBtnEl = null;
            // engineId → chipEl（用于刷新引擎高亮）
            this._engineChipEls   = new Map();
            // 搜索引擎选择器 chip 容器 DOM 引用（供 _refreshEngineChips 使用）
            this._engineRowEl     = null;
        }
  _log(level, ...args) { this.plugin.report(level, ...args); }
  _setSearchButtonBackground(button, hovering = false) {
    button.setCssStyles({background: hovering ? 'var(--background-secondary)' : 'var(--background-primary)'});
  }
  _syncInputBorder() {
    const focused = this.container.ownerDocument.activeElement === this._input;
    this._input.setCssStyles({borderColor: focused ? 'var(--interactive-accent)' : 'var(--background-modifier-border)'});
  }
  _listen(target, event, handler, options) {
            const document = this.container.ownerDocument;
            const window = document.defaultView;
            const getComputedStyle = window.getComputedStyle.bind(window);
            const requestAnimationFrame = window.requestAnimationFrame.bind(window);
            const cancelAnimationFrame = window.cancelAnimationFrame.bind(window);

    target.addEventListener(event, handler, options);
    if (target === window || target === document || event === 'scroll') this.register(() => target.removeEventListener(event, handler, options));
  }
  _later(callback, delay = 0) {
    const id = setTimer(() => { this._timers.delete(id); if (!this._disposed) callback(); }, delay);
    this._timers.add(id); return id;
  }
  _frame(callback) {
            const document = this.container.ownerDocument;
            const window = document.defaultView;
            const getComputedStyle = window.getComputedStyle.bind(window);
            const requestAnimationFrame = window.requestAnimationFrame.bind(window);
            const cancelAnimationFrame = window.cancelAnimationFrame.bind(window);

    const id = requestAnimationFrame(time => { this._frames.delete(id); if (!this._disposed) callback(time); });
    this._frames.add(id); return id;
  }
  onload() {
            const document = this.container.ownerDocument;
            const window = document.defaultView;
            const getComputedStyle = window.getComputedStyle.bind(window);
            const requestAnimationFrame = window.requestAnimationFrame.bind(window);
            const cancelAnimationFrame = window.cancelAnimationFrame.bind(window);

    this.register(() => {
      this._disposed = true; ++this._historyVer; ++this._vaultSearchVer; ++this._webSearchVer;
      clearTimer(this._debounceTimer);
      this._timers.forEach(id => clearTimer(id)); this._timers.clear();
      this._frames.forEach(cancelAnimationFrame); this._frames.clear();
      this._abortCtrls.forEach(controller => controller.abort());
      this._sourceEditor?.remove();
      [this._dropdown, this._scopeMenu, this._vaultSearchPanel, this._panelMask].forEach(element => element?.remove());
      this._teardownIndexFlush();
      this._wrap?.remove();
    });
  }
}
