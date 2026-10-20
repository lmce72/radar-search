import * as Obsidian from 'obsidian';
import type {SearchBarCtor} from '../ui/search-bar-host.ts';
import { moment } from '../shared/moment.ts';
import { clearTimer } from '../shared/timers.ts';
import {resolveContentMatch,offsetToPosition} from '../search/content-matches.ts';
import type {ContentMatch, SearchHistoryRecord} from '../types.ts';

// One cohesive behavior; shared state belongs to SearchBarComponent.
export const withHistory = <T extends SearchBarCtor>(Base: T) => class extends Base {
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
            this._lastQuery=q;
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
                return Array.isArray(parsed) ? parsed as SearchHistoryRecord[] : [];
            } catch (e) {
                this._log("error", `[SearchBar] _loadHistoryForDate(${date}) 失败:`, e);
                return [];
            }
        }

async _saveToHistory(q: string, mode: import("../types.ts").SearchMode, file?: string): Promise<void> {
            try {
                const today = moment().format("YYYY-MM-DD");
                const records = await this._loadHistoryForDate(today);
                // 去重：与最新记录完全相同则跳过（比较 file，使同一搜索词下的不同跳转目标各留一条）
                if (records.length > 0 && records[0].q === q && records[0].mode === mode && records[0].file === file) return;
                const rec: import("../types.ts").SearchHistoryRecord = { q, mode, ts: Date.now() };
                if (file) rec.file = file;
                records.unshift(rec);
                await this.plugin.history.prepend(today, rec);
            } catch (e) {
                this._log("error", "[SearchBar] _saveToHistory 写入失败:", e);
            }
        }

_openVaultResult(path: string, label?: string) {
            try {
                if (!path) return;
                const q = this._input ? this._input.value.trim() : "";
                if (q) {
                    const name = label || String(path).split("/").pop().replace(/\.md$/, "");
                    // 不 await：跳转优先，历史写入异步完成（_saveToHistory 自带 try/catch）
                    void this._saveToHistory(q, this._mode, name);
                }
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

async _openContentResult(path:string,label:string,hit:ContentMatch) {
            try {
                const file=this.app.vault.getAbstractFileByPath(path);
                if(!(file instanceof Obsidian.TFile))return;
                const q=this._input.value.trim();
                if(q)void this._saveToHistory(q,this._mode,label);
                const leaf=this.app.workspace.getLeaf(this.presentation==='page'||Obsidian.Platform.isMobile?'tab':false);
                this.plugin.floatingSearch?.close();
                await leaf.openFile(file,{state:{mode:'source'}});
                if(!(leaf.view instanceof Obsidian.MarkdownView))return;
                const editor=leaf.view.editor;
                const text=editor.getValue();
                const range=resolveContentMatch(text,hit);
                if(!range) {new Obsidian.Notice('匹配内容已更改，请重新搜索');return;}
                const from=offsetToPosition(text,range.start),to=offsetToPosition(text,range.end);
                editor.setSelection(from,to);
                editor.scrollIntoView({from,to},true);
                // Do not summon the soft keyboard on touch devices right after navigating.
                // 触屏设备上不要刚跳转就弹出软键盘。
                if (!this._isTouchDevice()) editor.focus();
            } catch(error) {this._log('error','定位匹配内容失败',error);}
        }

async _showHistory(date: string): Promise<void> {
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

            // ── header：日期导航（复用 _mkFloatHeader / _mkNavBtn）────────────
            const dateNavEl = createDiv();
            dateNavEl.setCssStyles({
                display: "flex",
                alignItems: "center",
                gap: "2px",
                flexShrink: "0"
            });

            const hintSpan = createSpan();
            hintSpan.setCssStyles({
                fontSize: "11px",
                color: "var(--text-muted)",
                flexShrink: "1",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                display: "flex",
                alignItems: "center",
                gap: "4px"
            });
            const historyIconSpan = hintSpan.createSpan();
            historyIconSpan.setCssStyles({ display: "inline-flex", alignItems: "center", flexShrink: "0" });
            this._setIcon(historyIconSpan, "history", 13);
            hintSpan.createSpan({ text: "历史记录" });

            // 顶栏切到「历史」上下文，并把历史控件填进顶栏左区（原先在滚动容器内的 sticky header）
            this._prepBar("history");
            if (this._barLeft) {
                this._barLeft.appendChild(hintSpan);
                this._barLeft.appendChild(dateNavEl);
            }

            const prevDateBtn = this._mkNavBtn("chevron-left");
            const nextDateBtn = this._mkNavBtn("chevron-right");
            const dateInput   = createEl("input", { type: "date" });
            dateInput.setCssStyles({
                fontSize: "12px",
                border: "1px solid var(--background-modifier-border)",
                borderRadius: "5px",
                padding: "2px 4px",
                background: "var(--background-secondary)",
                color: "var(--text-normal)",
                outline: "none",
                width: "120px",
                textAlign: "center",
                cursor: "pointer"
            });
            dateInput.value = date;
            dateInput.max   = today;
            if (minDate) dateInput.min = minDate;
            // 显示所有模式时设置为只读
            if (this._showAllHistory) {
                dateInput.readOnly = true;
                dateInput.setCssStyles({cursor: "default"});
                dateInput.setCssStyles({opacity: "0.5"});
            }

            // 显示所有历史记录开关
            const showAllWrapper = createDiv();
            showAllWrapper.setCssStyles({
                display: "flex",
                alignItems: "center",
                gap: "4px",
                marginLeft: "8px",
                flexShrink: "0"
            });

            const showAllLabel = showAllWrapper.createSpan({ text: "显示所有" });
            showAllLabel.setCssStyles({
                fontSize: "11px",
                color: "var(--text-muted)",
                userSelect: "none",
                whiteSpace: "nowrap"
            });

            const showAllToggle = showAllWrapper.createEl("label", { cls: this._showAllHistory ? "checkbox-container is-enabled" : "checkbox-container" });
            showAllToggle.setCssStyles({
                cursor: "pointer",
                flexShrink: "0",
                margin: "0"
            });
            const showAllCheckbox = showAllToggle.createEl("input", { type: "checkbox" });
            showAllCheckbox.checked = this._showAllHistory;

            const _toggleShowAll = () => {
                this._showAllHistory = !this._showAllHistory;
                showAllCheckbox.checked = this._showAllHistory;
                showAllToggle.classList.toggle("is-enabled", this._showAllHistory);
                _updateDateNavState(dateInput.value);
                if (this._showAllHistory) {
                    void this._loadAllHistory();
                } else {
                    void this._showHistory(dateInput.value);
                }
            };
            this._listen(showAllCheckbox, "change", _toggleShowAll);
            const showAllToggleHandler = this._makeTouchHandler(_toggleShowAll);
            this._listen(showAllToggle, "touchstart", showAllToggleHandler.onTouchStart, { passive: true });
            this._listen(showAllToggle, "touchend", showAllToggleHandler.onTouchEnd);

            // 也允许点击文字标签来切换
            const showAllLabelHandler = this._makeTouchHandler(_toggleShowAll);
            showAllLabel.setCssStyles({cursor: "pointer"});
            this._listen(showAllLabel, "touchstart", showAllLabelHandler.onTouchStart, { passive: true });
            this._listen(showAllLabel, "touchend", showAllLabelHandler.onTouchEnd);
            this._listen(showAllLabel, "click", _toggleShowAll);

            const _updateDateNavState = (d: string) => {
                const showAllActive = this._showAllHistory;

                // 显示所有模式：禁用导航按钮和日期输入框
                if (showAllActive) {
                    prevDateBtn.disabled = true;
                    nextDateBtn.disabled = true;
                    prevDateBtn.setCssStyles({opacity: "0.3"});
                    nextDateBtn.setCssStyles({opacity: "0.3"});
                    prevDateBtn.setCssStyles({cursor: "default"});
                    nextDateBtn.setCssStyles({cursor: "default"});
                    dateInput.readOnly = true;
                    dateInput.setCssStyles({cursor: "default"});
                    dateInput.setCssStyles({opacity: "0.5"});
                } else {
                    // 正常日期模式：根据日期范围控制按钮状态
                    prevDateBtn.disabled = minDate ? d <= minDate : false;
                    nextDateBtn.disabled = d >= today;
                    prevDateBtn.setCssStyles({opacity: prevDateBtn.disabled ? "0.3" : "1"});
                    nextDateBtn.setCssStyles({opacity: nextDateBtn.disabled ? "0.3" : "1"});
                    prevDateBtn.setCssStyles({cursor: prevDateBtn.disabled ? "default" : "pointer"});
                    nextDateBtn.setCssStyles({cursor: nextDateBtn.disabled ? "default" : "pointer"});
                    dateInput.readOnly = false;
                    dateInput.setCssStyles({cursor: "pointer"});
                    dateInput.setCssStyles({opacity: "1"});
                }
            };
            _updateDateNavState(date);

            const _stepDate = (d: string, delta: number) => moment(d).add(delta, "days").format("YYYY-MM-DD");
            const _goToDate = (newDate: string) => {
                dateInput.value = newDate;
                _updateDateNavState(newDate);
                void this._showHistory(newDate);
            };

            const prevDateHandler = this._makeTouchHandler((e) => { e.preventDefault(); if (!prevDateBtn.disabled) _goToDate(_stepDate(dateInput.value, -1)); });
            this._listen(prevDateBtn, "touchstart", prevDateHandler.onTouchStart, { passive: true });
            this._listen(prevDateBtn, "touchend", prevDateHandler.onTouchEnd);
            this._listen(prevDateBtn, "click", (e) => { e.preventDefault(); if (!prevDateBtn.disabled) _goToDate(_stepDate(dateInput.value, -1)); });
            const nextDateHandler = this._makeTouchHandler((e) => { e.preventDefault(); if (!nextDateBtn.disabled) _goToDate(_stepDate(dateInput.value,  1)); });
            this._listen(nextDateBtn, "touchstart", nextDateHandler.onTouchStart, { passive: true });
            this._listen(nextDateBtn, "touchend", nextDateHandler.onTouchEnd);
            this._listen(nextDateBtn, "click", (e) => { e.preventDefault(); if (!nextDateBtn.disabled) _goToDate(_stepDate(dateInput.value,  1)); });
            this._listen(dateInput, "change", () => { _updateDateNavState(dateInput.value); void this._showHistory(dateInput.value); });

            dateNavEl.appendChild(prevDateBtn);
            dateNavEl.appendChild(dateInput);
            dateNavEl.appendChild(nextDateBtn);
            dateNavEl.appendChild(showAllWrapper);
            // hintSpan 与 dateNavEl 已挂进通用顶栏左区（见上方 _prepBar("history")）

            // 显示清除历史按钮并绑定事件
            if (this._clearHistoryBtn) {
                this._clearHistoryBtn.setCssStyles({display: records.length > 0 ? "flex" : "none"});
                // 移除旧事件监听器（通过克隆节点）
                const newClearBtn = this._clearHistoryBtn.cloneNode(true) as HTMLButtonElement;
                this._clearHistoryBtn.parentNode.replaceChild(newClearBtn, this._clearHistoryBtn);
                this._clearHistoryBtn = newClearBtn;

                const clearHistoryHandler = this._makeTouchHandler((e) => {
                    e.stopPropagation();
                    void this._clearCurrentPageHistory(date, records);
                });
                this._listen(this._clearHistoryBtn, "touchstart", clearHistoryHandler.onTouchStart, { passive: true });
                this._listen(this._clearHistoryBtn, "touchend", (e) => { e.stopPropagation(); clearHistoryHandler.onTouchEnd(e); });
                this._listen(this._clearHistoryBtn, "click", (e) => { e.stopPropagation(); void this._clearCurrentPageHistory(date, records); });
                this._listen(this._clearHistoryBtn, "mouseenter", () => { this._clearHistoryBtn.setCssStyles({background: "var(--background-modifier-hover)"}); });
                this._listen(this._clearHistoryBtn, "mouseleave", () => { this._clearHistoryBtn.setCssStyles({background: "transparent"}); });
            }

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
                    const subText = [modeLabel[rec.mode] || rec.mode, rec.file, dateStr, timeStr].filter(Boolean).join(" · ");
                    if (subText) {
                        const subEl = contentEl.createSpan({ text: subText });
                        subEl.setCssStyles({ fontSize: "11px", color: "var(--text-faint)", marginTop: "1px" });
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
                            this._focusInput();
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
                    onSize: (n) => { this._historyPageSize = n; this._renderHistoryDropdown(dateInput.value, records, 1); },
                    onPrev: () => this._renderHistoryDropdown(dateInput.value, records, safePage - 1),
                    onNext: () => this._renderHistoryDropdown(dateInput.value, records, safePage + 1)
                });
            }
        }
};
