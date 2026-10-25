import type { App, Command, TFile } from 'obsidian';
import { Component } from 'obsidian';
import type RadarSearchPlugin from '../main.ts';
import type {
  ContentMatch, PathFilter, ResultCategory, SearchEngine, SearchGroup, SearchHistoryRecord,
  SearchItem, SearchMode, SearchSession, SearchSettings, SortMode, WebSource
} from '../types.ts';
import type { IndexSearchResponse, SearchHit } from '../search/types.ts';
import type { TimerId } from '../shared/timers.ts';
import type { makeTouchHandler, TouchEndEvent } from '../shared/touch.ts';
import type { ActionButton, ActionToolbar } from '../settings/controls.ts';
import type { StringListEditor } from '../settings/editors.ts';
import type { QuickExclusionMenu } from './quick-exclusion-menu.ts';
import type { MixinConstructor } from '../../types/mixin.d.ts';

export type Constructor<T = object> = MixinConstructor<T>;
export type FuzzyFn = (text: string) => { score: number; matches: unknown[] } | null;
export type TouchHandler = ReturnType<typeof makeTouchHandler>;

/** Bookmark records exposed by Obsidian's bundled bookmarks plugin (internal API). */
export interface BookmarkItem {
  type?: string;
  title?: string;
  path?: string;
  url?: string;
  query?: string;
  items?: BookmarkItem[];
}
export interface BookmarkInstance {
  items?: BookmarkItem[];
  openBookmark?(item: BookmarkItem): void;
}
interface InternalPluginRecord { instance?: BookmarkInstance & { openUrl?(url: string, leafType: string, active: boolean): void } }
export interface CommandsApi {
  commands: Map<string, Command> | Record<string, Command>;
  listCommands(): Command[];
  executeCommandById(id: string): boolean;
}
/** Public typings omit these host internals; keep one explicit, narrow shape. */
export interface InternalApp {
  internalPlugins?: { plugins?: Record<string, InternalPluginRecord> };
  plugins?: { plugins?: Record<string, InternalPluginRecord> };
  commands: CommandsApi;
  openUrl?(url: string): void;
}

export interface TabElement extends HTMLDivElement { _tabKey?: string; _iconSpan?: HTMLElement }

export interface PagerOptions {
  page: number;
  totalPages: number;
  pageSize: number;
  sticky?: boolean;
  onSize?: (size: number) => void;
  onPrev?: () => void;
  onNext?: () => void;
}

/** Shared state owned by SearchBarComponent and used by the behavior mixins. */
export interface SearchBarFields {
  plugin: RadarSearchPlugin;
  container: HTMLElement;
  app: App;
  readonly internalApp: InternalApp;
  cfg: SearchSettings;
  presentation: 'floating' | 'page';
  /** Stable per-block key used to restore the last query after a remount. */
  restoreKey?: string;

  _timers: Set<TimerId>;
  _frames: Set<number>;
  _abortCtrls: AbortController[];
  _disposed: boolean;
  _cleanedUp: boolean;
  _cleanup: (() => void) | null;
  _debounceTimer: TimerId | null;
  _laterTimer?: TimerId | null;

  _mode: SearchMode;
  _historyVer: number;
  _vaultSearchVer: number;
  _webSearchVer: number;
  _activeIdx: number;
  _itemEls: HTMLElement[];
  _lastInputValue: string;
  _lastQuery: string;
  _groupPages: Map<string, number>;
  _lastGroups: SearchGroup[] | null;
  _resultKind: 'results' | 'history';
  _resultCategory: ResultCategory;
  _preferredResultCategory: ResultCategory;
  _resultCategoryChosen: boolean;
  _resultToolView: 'results' | 'sort' | 'filter' | 'presetName';
  _temporaryFilter: PathFilter | null;
  _quickExcludedPaths: string[];
  _quickFilterMenu: QuickExclusionMenu | null;
  _filterDraft: PathFilter | null;

  _contentSearch: boolean;
  _vaultPanelOpen: boolean;
  _vaultSortMode: SortMode;
  _searchWikiLinks: boolean;
  _searchMdLinks: boolean;
  _searchBookmarks: boolean;
  _searchTags: boolean;
  _searchProperties: boolean;
  _searchCommands: boolean;
  _searchNonMarkdown: boolean;
  _extendedContext: boolean;
  _selectedPreset: string;
  _limitContentResults: boolean;
  _activeEngineId: string | null;
  _webEditMode: boolean;
  _zCounter: number;

  _historyPage: number;
  _historyPageSize: number;
  _showAllHistory: boolean;
  _dropdownPageSize: number;

  _panelMask: HTMLElement | null;
  _wrap: HTMLElement | null;
  _pill: HTMLElement | null;
  _scopeBtn: HTMLButtonElement | null;
  _inputRow: HTMLElement | null;
  _input: HTMLInputElement | null;
  _goBtn: HTMLButtonElement | null;
  _clearBtn: HTMLButtonElement | null;
  _dropdown: HTMLElement | null;
  _dropdownInner: HTMLElement | null;
  _scopeMenu: HTMLElement | null;
  _barLeft: HTMLElement | null;
  _clearHistoryBtn: HTMLButtonElement | null;
  _cornerBtnEl: HTMLButtonElement | null;
  _contentToggleBtn: HTMLButtonElement | null;
  _contentToggleIconEl: HTMLElement | null;
  _contentToggleLabelEl: HTMLElement | null;
  _contentStatusSep: HTMLElement | null;
  _contentStatusEl: HTMLElement | null;
  _contentExpandBtn: HTMLButtonElement | null;
  _contentHitControls: Array<{setExpanded:(value:boolean)=>void;isExpanded:()=>boolean}>;
  _contentAllExpanded: boolean;
  _vaultSearchPanel: HTMLElement | null;
  _bottomSheet: boolean;
  _sawTouchInput: boolean;
  _onFirstTouch: ((event: TouchEvent) => void) | null;
  _rafId: number | null;

  _engineRetained: boolean;
  _indexFlushBound: boolean;
  _indexFlushTimer: number | null;
  _indexBlurHandler: (() => void) | null;
  _indexVisHandler: (() => void) | null;

  _engineRowEl: HTMLElement | null;
  _engineChipEls: Map<string, HTMLElement>;
  _sourceEditBtnEl: HTMLButtonElement | null;
  _webSourceRowEl: HTMLElement | null;
  _sourceEditor: HTMLElement | null;
  _sourceEditorAnchor: HTMLElement | null;

  _rebuildPresetOptions: (() => void) | null;
  _presetSelect: HTMLSelectElement | null;
  _panelQuickFilterButton: ActionButton | null;
  _panelTabRow: HTMLElement | null;
  _panelTabVault: TabElement | null;
  _panelTabWeb: TabElement | null;
  _panelVaultSection: HTMLElement | null;
  _panelWebSection: HTMLElement | null;
  _panelActiveTab: 'vault' | 'web';

  _resultToolsEl: HTMLElement;
  _sortButton: ActionButton;
  _filterButton: ActionButton;
  _toolListEditor: StringListEditor | null;
}

/**
 * Complete contract of the composed search-bar instance. Mixin methods that are only
 * invoked for their side effects keep a permissive signature; methods whose values are
 * consumed by another mixin are typed precisely.
 */
export interface SearchBarHost extends Component, SearchBarFields {
  render(): Promise<void>;
  getSearchSession(): SearchSession;
  applySearchSession(session: SearchSession): Promise<void>;

  _log(level: 'log' | 'warn' | 'error', ...args: unknown[]): void;
  _listen(target: EventTarget, event: 'keydown' | 'keyup', handler: (event: KeyboardEvent) => void, options?: AddEventListenerOptions): void;
  _listen(target: EventTarget, event: 'click' | 'mousedown' | 'mouseenter' | 'mouseleave' | 'pointerdown' | 'focus' | 'blur', handler: (event: MouseEvent) => void, options?: AddEventListenerOptions): void;
  _listen(target: EventTarget, event: 'touchstart' | 'touchend', handler: (event: TouchEvent) => void, options?: AddEventListenerOptions): void;
  _listen(target: EventTarget, event: 'scroll' | 'resize' | 'change' | 'input' | 'visibilitychange' | 'theme:apply', handler: (event: Event) => void, options?: AddEventListenerOptions): void;
  _later(callback: () => void, delay?: number): TimerId;
  _frame(callback: (time: number) => void): number;
  _setIcon(el: HTMLElement, name: string, size?: number): void;
  _makeTouchHandler(action: (event: TouchEndEvent) => void, threshold?: number): TouchHandler;
  _setSearchButtonBackground(button: HTMLElement, hovering?: boolean): void;
  _syncInputBorder(): void;

  _openUrl(url: string): void;
  _onInput(value: string): void;
  _doSearch(q: string): Promise<void>;
  _getHistoryFilePath(date: string): string;
  _getRetainDays(): number | null;
  _loadHistoryForDate(date: string): Promise<SearchHistoryRecord[]>;
  _saveToHistory(q: string, mode: SearchMode, file?: string): Promise<void>;
  _openVaultResult(path: string, label?: string): void;
  _openContentResult(path: string, label: string, hit: ContentMatch): Promise<void>;
  _showHistory(date: string): Promise<void>;
  _loadAllHistory(): Promise<void>;
  _clearCurrentPageHistory(date: string, records: SearchHistoryRecord[]): Promise<void>;
  _renderHistoryDropdown(date: string, records: SearchHistoryRecord[], page?: number): void;

  _indexEngine(): ReturnType<typeof import('../search/index-engine.ts').createSearchIndexEngine> | null;
  _excludedPredicate(): (path: string) => boolean;
  _indexQuery(q: string): IndexSearchResponse | null;
  _itemsFromEngineHits(rows: SearchHit[], terms: string[]): SearchItem[];
  _contentItemsFromEngine(rows: SearchHit[], terms: string[], ctxLen: number, ver: number): Promise<SearchItem[]>;
  _setupIndexEngine(): void;
  _isComposingQuery(): boolean;
  _bindIndexFlush(eng: NonNullable<ReturnType<SearchBarHost['_indexEngine']>>): void;
  _teardownIndexFlush(): void;

  _buildExternalLinkItems(terms: string[], fuzzy: FuzzyFn | null, isExcluded: (path: string) => boolean, isStale: () => boolean): Promise<SearchItem[]>;
  _getSearchableFiles(): TFile[];
  _fileLabel(f: TFile): string;
  _bookmarkIconName(item: BookmarkItem): string;
  _bookmarkSub(item: BookmarkItem): string;
  _bookmarkTitle(item: BookmarkItem): string;
  _buildBookmarkItems(terms: string[], fuzzy: FuzzyFn | null, isExcluded: (path: string) => boolean, limit?: number): Promise<SearchItem[]>;
  _openBookmarkResult(item: BookmarkItem, title: string): void;
  _fileIconName(file: TFile): string;
  _buildPropertyItems(q: string, terms: string[], fuzzy: FuzzyFn | null, limit?: number): SearchItem[];
  _commandCandidates(): { visible: Command[]; hidden: Command[] };
  _buildCommandItems(q: string, terms: string[], fuzzy: FuzzyFn | null, limit?: number, list?: Command[] | null): SearchItem[];
  _runCommand(id: string, name: string): void;
  _copyCommandId(id: string): Promise<void>;
  _notify(msg: string): void;

  _searchGlobal(q: string): Promise<void>;
  _searchVault(q: string): Promise<void>;
  _searchWeb(q: string): Promise<void>;
  _resolveWebEngines(): SearchEngine[];
  _buildWebGroups(q: string, engines: SearchEngine[], isStale: () => boolean, onGroups: (groups: SearchGroup[]) => void): void;

  _extractAllSnippets(content: string, terms: string[], ctxLen?: number): ContentMatch[];
  _highlightText(container: HTMLElement, text: string, terms?: string[]): void;
  _extractSnippet(content: string, query: string, contextLen?: number): string;

  _buildScopeMenu(): void;
  _mkNavBtn(iconName: string, size?: number): HTMLButtonElement;
  _mkFloatHeader(container: HTMLElement, titleText: string, rightEl?: HTMLElement | null): HTMLElement;
  _mkSectionLabel(container: HTMLElement, text: string): HTMLElement;
  _buildVaultSearchPanel(): void;
  _applyPanelBtnStyle(panelOpen: boolean): void;
  _switchPanelTab(tab: 'vault' | 'web'): void;
  _refreshPanelForMode(mode: SearchMode): void;

  _mkTrailingBtn(itemEl: HTMLElement, item: SearchItem): HTMLButtonElement;
  _refreshContentToggleStatus(): void;
  _isTouchDevice(): boolean;
  _focusInput(showHistory?: boolean): void;
  _suppressHistoryFocus: boolean;
  _dismissKeyboard(): void;
  _guardLayerKeyboard(el: HTMLElement | null): void;

  _applyFloatingSearchShell(): void;
  _isSheetLayout(): boolean;
  _buildPanelMask(): void;
  _syncMask(visible: boolean): void;
  _applyPanelPresentation(): void;
  _applyScopeMenuPresentation(): void;
  _closePanel(opts?: { restoreDropdown?: boolean }): void;
  _closeScopeMenu(): void;
  _isScopeMenuOpen(): boolean;
  _dismissSheetLayers(): void;
  _isPanelVisible(): boolean;
  _isVaultStale(ver: number): boolean;
  _isWebStale(ver: number): boolean;
  _modeConfig(): Record<SearchMode, { icon: string; placeholder: string }>;
  _buildShell(): void;
  _buildDropdown(): void;

  _saveCfgKey<K extends keyof SearchSettings>(key: K, value: SearchSettings[K]): Promise<void>;
  _sortFiles(files: TFile[], mode: SortMode): TFile[];
  _getBookmarksInstance(): BookmarkInstance | null;
  _flattenBookmarks(items: BookmarkItem[]): BookmarkItem[];
  _selectMode(mode: SearchMode, runSearch?: boolean): void;
  _showDropdown(): void;
  _hideDropdown(): void;
  _raiseFloat(el: HTMLElement | null): void;
  _syncClearBtn(): void;
  _toggleAllContentHits(): void;
  _syncContentExpandButton(): void;
  _startReposition(): void;
  _stopReposition(): void;
  _repositionFloats(): void;
  _syncPageViewport(): void;
  _prepBar(kind: 'results' | 'history'): void;

  _addQuickFilterButton(parent: HTMLElement, path?: string): ActionButton;
  _openQuickExclusions(anchor: HTMLElement, path?: string): void;

  _syncSearchAction(): void;
  _openResultsPage(): void;
  _renderResultCategories(): void;
  _visibleResultGroups(groups: SearchGroup[]): SearchGroup[];

  _buildResultTools(parent: HTMLElement): void;
  _syncResultTools(history?: boolean): void;
  _openToolView(kind: 'sort' | 'filter' | 'presetName', title: string, onBack: () => void): { view: HTMLElement; toolbar: ActionToolbar; status: HTMLElement; body: HTMLElement };
  _returnToResults(): void;
  _rerunResults(): void;
  _openSortView(): void;
  _openFilterView(keepDraft?: boolean): void;
  _openPresetNameView(): void;

  _mkPagerBar(parent: HTMLElement, opts: PagerOptions): HTMLElement | null;
  _renderDropdown(groups: SearchGroup[]): void;
  _setActive(idx: number): void;
  _clearActive(idx: number): void;
  _clearActiveAll(): void;
  _handleKey(e: KeyboardEvent): void;

  _buildWebOptionsSection(container: HTMLElement): void;
  _refreshEngineChips(): void;
  _toggleSourceEditMode(): void;
  _renderSourceChips(row: HTMLElement): void;
  _positionSourceEditor(): void;
  _openSourceEditor(src: WebSource | null, idx: number, anchorEl: HTMLElement, row: HTMLElement): void;
  _deleteSource(idx: number, row: HTMLElement): void;
  _applyWebOperator(op: 'exact' | 'intitle' | 'site' | 'filetype', value: string | null): void;

  _clearSearchInput(): void;
  _executeSearch(): void;
  _themeUpdate(): void;
  _bindEvents(): void;
}

export type SearchBarCtor = Constructor<SearchBarHost>;
