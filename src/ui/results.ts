import {sortSearchItems} from '../search/sort.ts';
import type {SearchItem} from '../types.ts';
import * as Obsidian from 'obsidian';
import { moment } from '../shared/moment.ts';
import { SHEET_BREAKPOINT, MIN_PANEL_H, PILL_ICON_SIZE, EXT_ICON } from '../shared/constants.ts';
import { IconRenderer } from '../shared/icons.ts';
import { makeTouchHandler } from '../shared/touch.ts';

// One cohesive behavior; shared state belongs to SearchBarComponent.
export const withResults = Base => class extends Base {
  declare _itemEls;
  declare _lastGroups;
  declare _dropdownPageSize;
  declare _activeIdx;

_mkPagerBar(parent, opts) {
            try {
                const o = opts || {};
                const bar = parent.createDiv({cls:'primecore-pagination',attr:{role:'navigation','aria-label':'结果分页'}});
                bar.setCssStyles({
                    position: o.sticky === false ? "static" : "sticky",
                    bottom: "0",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "6px 12px",
                    // 窄屏（移动端）放不下时水平滚动，而不是把右侧的翻页按钮裁掉
                    flexWrap: "nowrap",
                    overflowX: "auto",
                    background: "var(--background-primary)",
                    borderTop: "1px solid var(--background-modifier-border)"
                });

                // 每页条数（数字框 + 确认）
                const sizeInput = createEl("input", { type: "number" });
                sizeInput.setCssStyles({
                    width: "52px", height: "26px", borderRadius: "100px",
                    border: "1px solid var(--background-modifier-border)",
                    background: "var(--background-secondary)", color: "var(--text-normal)",
                    fontSize: "12px", textAlign: "center", outline: "none",
                    padding: "0 6px", boxSizing: "border-box"
                });
                sizeInput.value = String(o.pageSize);
                sizeInput.min = "1";
                sizeInput.setAttribute('aria-label','每页条数');
                // 阻止 mousedown/touchstart 冒泡，防止下拉被关闭
                this._listen(sizeInput, "mousedown", (e) => e.stopPropagation());
                this._listen(sizeInput, "touchstart", (e) => e.stopPropagation(), { passive: true });

                const checkBtn = createEl("button");
                checkBtn.setCssStyles({
                    width: "26px", height: "26px", borderRadius: "100px", border: "none",
                    background: "var(--interactive-accent)", color: "var(--text-on-accent)",
                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                    padding: "0", flexShrink: "0", transition: "opacity 0.12s", touchAction: "manipulation"
                });
                const checkIconSpan = checkBtn.createSpan();
                checkIconSpan.setCssStyles({ display: "inline-flex", alignItems: "center", pointerEvents: "none" });
                this._setIcon(checkIconSpan, "check", 13);
                checkBtn.setAttribute('aria-label','应用每页条数');
                this._listen(checkBtn, "mouseenter", () => { checkBtn.setCssStyles({opacity: "0.85"}); });
                this._listen(checkBtn, "mouseleave", () => { checkBtn.setCssStyles({opacity: "1"}); });
                const _applySize = (e) => {
                    const n = Math.max(1, parseInt(sizeInput.value, 10) || o.pageSize || 8);
                    sizeInput.value = String(n);
                    if (o.onSize) o.onSize(n);
                };
                this._listen(checkBtn, "mousedown", (e) => { e.stopPropagation(); e.preventDefault(); });
                const checkHandler = this._makeTouchHandler((e) => { e.stopPropagation(); e.preventDefault(); _applySize(e); });
                this._listen(checkBtn, "touchstart", checkHandler.onTouchStart, { passive: true });
                this._listen(checkBtn, "touchend", (e) => { e.stopPropagation(); checkHandler.onTouchEnd(e); });
                this._listen(checkBtn, "click", (e) => { e.stopPropagation(); e.preventDefault(); _applySize(e); });

                // 页码信息
                const infoEl = bar.createSpan({ text: `第 ${o.page} / ${o.totalPages} 页` });
                infoEl.setCssStyles({
                    fontSize: "11px", color: "var(--text-muted)",
                    flexGrow: "1", textAlign: "center", whiteSpace: "nowrap"
                });

                // 上一页 / 下一页（复用 _mkNavBtn 圆形按钮）
                const prevBtn = this._mkNavBtn("chevron-left");
                const nextBtn = this._mkNavBtn("chevron-right");
                prevBtn.setAttribute('aria-label','上一页');nextBtn.setAttribute('aria-label','下一页');
                prevBtn.disabled = o.page <= 1;
                nextBtn.disabled = o.page >= o.totalPages;
                prevBtn.setCssStyles({opacity: prevBtn.disabled ? "0.3" : "1"});
                nextBtn.setCssStyles({opacity: nextBtn.disabled ? "0.3" : "1"});
                prevBtn.setCssStyles({cursor: prevBtn.disabled ? "default" : "pointer"});
                nextBtn.setCssStyles({cursor: nextBtn.disabled ? "default" : "pointer"});
                // stopPropagation 必不可少：翻页会重建下拉内容，节点在处理中脱离文档时，
                // 文档级「点击外部关闭」会误判为外部点击而收起下拉
                const prevHandler = this._makeTouchHandler((e) => { e.stopPropagation(); e.preventDefault(); if (!prevBtn.disabled && o.onPrev) o.onPrev(); });
                this._listen(prevBtn, "touchstart", prevHandler.onTouchStart, { passive: true });
                this._listen(prevBtn, "touchend", (e) => { e.stopPropagation(); prevHandler.onTouchEnd(e); });
                this._listen(prevBtn, "click", (e) => { e.stopPropagation(); e.preventDefault(); if (!prevBtn.disabled && o.onPrev) o.onPrev(); });
                const nextHandler = this._makeTouchHandler((e) => { e.stopPropagation(); e.preventDefault(); if (!nextBtn.disabled && o.onNext) o.onNext(); });
                this._listen(nextBtn, "touchstart", nextHandler.onTouchStart, { passive: true });
                this._listen(nextBtn, "touchend", (e) => { e.stopPropagation(); nextHandler.onTouchEnd(e); });
                this._listen(nextBtn, "click", (e) => { e.stopPropagation(); e.preventDefault(); if (!nextBtn.disabled && o.onNext) o.onNext(); });

                bar.appendChild(sizeInput);
                bar.appendChild(checkBtn);
                bar.appendChild(infoEl);
                bar.appendChild(prevBtn);
                bar.appendChild(nextBtn);
                // Single-row pager inside a phone-height floating sheet. Keep the page-size
                // input visible; the row scrolls horizontally when it does not fit.
                // 手机浮层内改为单行分页，保留「每页条数」控件，放不下时水平滚动。
                if (this._isSheetLayout() && this.presentation !== 'page') {
                    bar.addClass('is-compact');
                }
                return bar;
            } catch (e) {
                this._log("error", "[SearchBar] 构建分页栏失败:", e);
                return null;
            }
        }

_renderDropdown(groups) {
            this._lastGroups=groups;
            if(this._resultToolView!=='results')return;
            this._dropdownInner.empty();
            this._itemEls = [];

            this._lastGroups = groups;
            this._activeIdx=-1;
            this._prepBar('results');
            const visibleGroups=this._visibleResultGroups(groups);
            const allGroups=groups;
            groups=visibleGroups;
            if(!groups.some(group=>group.items.length)) {
                const empty=this._dropdownInner.createDiv({cls:'primecore-results-empty',attr:{role:'status'}});
                this._setIcon(empty.createSpan({cls:'primecore-results-empty-icon',attr:{'aria-hidden':'true'}}),'inbox',64);
                empty.createDiv({text:'什么都木有'});
                this._showDropdown();return;
            }
            for (let gi = 0; gi < groups.length; gi++) {
                const group    = groups[gi];
                const groupKey = group.title || String(gi);
                const pageSize = this._dropdownPageSize;
                const totalGroupPages = Math.max(1, Math.ceil(group.items.length / pageSize));
                if (!this._groupPages.has(groupKey)) this._groupPages.set(groupKey, 1);
                const groupPage   = Math.min(this._groupPages.get(groupKey), totalGroupPages);
                this._groupPages.set(groupKey, groupPage);
                const sortedItems=sortSearchItems<SearchItem>(group.items,this._vaultSortMode,path=>this.app.vault.getAbstractFileByPath(path));
                const slicedItems = sortedItems.slice((groupPage - 1) * pageSize, groupPage * pageSize);

                if(groups.length>1&&group.title)this._dropdownInner.createDiv({cls:'primecore-result-source',text:group.title});

                for (const item of slicedItems) {
                    const idx    = this._itemEls.length;
                    const itemEl = this._dropdownInner.createDiv();

                    if (item.hits) {
                        // ── 可折叠内容命中组 ───────────────────────────────────
                        const headerRow = itemEl.createDiv();
                        headerRow.setCssStyles({
                            display: "flex", alignItems: "center", gap: "6px",
                            padding: "7px 14px", minHeight: "36px", userSelect: "none", cursor: "pointer"
                        });
                        // 文件类型图标（内容匹配组：两行标题 + 下方可展开的内容块）
                        if (item.icon) {
                            const fileIconEl = headerRow.createSpan();
                            fileIconEl.setCssStyles({
                                display: "inline-flex", alignItems: "center", flexShrink: "0",
                                color: "var(--text-muted)", width: "16px"
                            });
                            this._setIcon(fileIconEl, item.icon, 13);
                        }
                        const chevronEl = headerRow.createSpan();
                        this._setIcon(chevronEl, "chevron-right", 12);
                        chevronEl.setCssStyles({
                            flexShrink: "0", color: "var(--text-muted)",
                            transition: "transform 0.15s", display: "flex", alignItems: "center"
                        });
                        // 与其它条目一致：上行文件名、下行路径；下方仍保留可展开的内容块
                        const contentColEl = headerRow.createDiv();
                        contentColEl.setCssStyles({
                            display: "flex", flexDirection: "column", flex: "1 1 0%", minWidth: "0"
                        });
                        const labelEl = contentColEl.createSpan();
                        labelEl.setCssStyles({
                            fontSize: "13px", color: "var(--text-normal)",
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
                        });
                        this._highlightText(labelEl, item.label, item.terms);
                        if (item.sub) {
                            const dirEl = contentColEl.createSpan({ text: item.sub });
                            dirEl.setCssStyles({
                                fontSize: "11px", color: "var(--text-faint)", marginTop: "1px",
                                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
                            });
                            dirEl.title = item.sub;
                        }
                        const badgeEl = headerRow.createSpan({ text: `${item.hits.length}` });
                        badgeEl.setCssStyles({
                            flexShrink: "0", fontSize: "10px", padding: "1px 5px",
                            borderRadius: "8px", background: "var(--background-modifier-border)", color: "var(--text-muted)"
                        });
                        const hitsContainer = itemEl.createDiv();
                        hitsContainer.setCssStyles({
                            // 左内边距对齐标题列起点：header 左 14 + 图标 16 + 间距 6 + chevron 12 + 间距 6
                            display: "none", flexDirection: "column", gap: "2px", padding: "0 14px 6px 54px"
                        });
                        // Build snippet rows only on first expand; collapsed groups stay cheap.
                        // 首次展开时才创建摘要行；折叠状态不生成 DOM。
                        let _expanded = false;
                        let _built = false;
                        const _buildHits = () => {
                            if (_built) return;
                            _built = true;
                            for (const snippet of item.hits) {
                                const snippetEl = hitsContainer.createDiv();
                                snippetEl.setCssStyles({
                                    fontSize: "11px", color: "var(--text-faint)", padding: "3px 6px",
                                    borderRadius: "4px", lineHeight: "1.4", cursor: "pointer", transition: "background 0.1s"
                                });
                                this._listen(snippetEl, "mouseenter", () => { snippetEl.setCssStyles({background: "var(--background-modifier-hover)"}); });
                                this._listen(snippetEl, "mouseleave", () => { snippetEl.setCssStyles({background: "transparent"}); });
                                this._highlightText(snippetEl, snippet.text, item.terms);
                                snippetEl.setAttribute("role","button");snippetEl.tabIndex=0;
                                const openMatch=()=>{if(item.onMatch)item.onMatch(snippet);else item.action();this._hideDropdown();};
                                this._listen(snippetEl,"keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();e.stopPropagation();openMatch();}});
                                this._listen(snippetEl, "mousedown", e => e.preventDefault());
                                const snippetHandler = this._makeTouchHandler((e) => { e.stopPropagation(); openMatch(); });
                                this._listen(snippetEl, "touchstart", snippetHandler.onTouchStart, { passive: true });
                                this._listen(snippetEl, "touchend", (e) => { e.stopPropagation(); snippetHandler.onTouchEnd(e); });
                                this._listen(snippetEl, "click", e => { e.stopPropagation(); openMatch(); });
                            }
                        };
                        const _toggle = e => { e.stopPropagation(); _expanded = !_expanded; if (_expanded) _buildHits(); hitsContainer.setCssStyles({display: _expanded ? "flex" : "none"}); chevronEl.setCssStyles({transform: _expanded ? "rotate(90deg)" : ""}); };
                        this._listen(headerRow, "mouseenter", () => this._setActive(idx));
                        this._listen(headerRow, "mouseleave", () => this._clearActive(idx));
                        this._listen(headerRow, "mousedown", e => e.preventDefault());
                        const headerToggleHandler = this._makeTouchHandler(_toggle);
                        this._listen(headerRow, "touchstart", headerToggleHandler.onTouchStart, { passive: true });
                        this._listen(headerRow, "touchend", headerToggleHandler.onTouchEnd);
                        this._listen(headerRow, "click", _toggle);
                        this._listen(itemEl, "mousedown", e => e.preventDefault());
                        const itemHandler = this._makeTouchHandler(() => { item.action(); this._hideDropdown(); });
                        this._listen(itemEl, "touchstart", itemHandler.onTouchStart, { passive: true });
                        this._listen(itemEl, "touchend", itemHandler.onTouchEnd);
                        this._listen(itemEl, "click", () => { item.action(); this._hideDropdown(); });
                    } else if (item.twoLine) {
                        // ── 双行条目（命令面板等）：前置图标 + 主标题 + 副标题 + 可选行尾按钮 ──
                        itemEl.setCssStyles({
                            display: "flex", flexDirection: "row", alignItems: "center", gap: "8px",
                            padding: "7px 14px", cursor: "pointer",
                            transition: "background 0.1s", minHeight: "36px", background: "transparent"
                        });
                        if (item.icon) {
                            const iconWrapEl = itemEl.createSpan();
                            iconWrapEl.setCssStyles({
                                display: "inline-flex", alignItems: "center", flexShrink: "0",
                                color: "var(--text-muted)", width: "16px"
                            });
                            this._setIcon(iconWrapEl, item.icon, 13);
                        }
                        const contentEl = itemEl.createDiv();
                        contentEl.setCssStyles({
                            display: "flex", flexDirection: "column", flex: "1 1 0%", minWidth: "0"
                        });
                        const labelEl = contentEl.createSpan();
                        labelEl.setCssStyles({
                            fontSize: "13px", color: "var(--text-normal)",
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
                        });
                        if (item.terms) { this._highlightText(labelEl, item.label, item.terms); } else { labelEl.appendText(item.label); }
                        if (item.sub) {
                            const subEl = contentEl.createSpan();
                            subEl.setCssStyles({
                                fontSize: "11px", color: "var(--text-faint)", marginTop: "1px",
                                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
                            });
                            subEl.appendText(item.sub);
                            subEl.title = item.sub;
                        }
                        if (item.trailing && item.trailing.onClick) this._mkTrailingBtn(itemEl, item);
                        this._listen(itemEl, "mouseenter", () => this._setActive(idx));
                        this._listen(itemEl, "mouseleave", () => this._clearActive(idx));
                        this._listen(itemEl, "mousedown", e => e.preventDefault());
                        const twoLineHandler = this._makeTouchHandler(() => { item.action(); this._hideDropdown(); });
                        this._listen(itemEl, "touchstart", twoLineHandler.onTouchStart, { passive: true });
                        this._listen(itemEl, "touchend", twoLineHandler.onTouchEnd);
                        this._listen(itemEl, "click", () => { item.action(); this._hideDropdown(); });
                    } else {
                        // ── 普通 item ──────────────────────────────────────────
                        itemEl.setCssStyles({
                            display: "flex", alignItems: "center",
                            justifyContent: "space-between",
                            padding: "7px 14px", minHeight: "36px"
                        });
                        const labelEl = itemEl.createSpan();
                        labelEl.setCssStyles({
                            fontSize: "13px", color: "var(--text-normal)",
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            flex: "1", minWidth: "0"
                        });
                        if (item.terms) { this._highlightText(labelEl, item.label, item.terms); } else { labelEl.appendText(item.label); }
                        if (item.sub) {
                            const subEl = itemEl.createSpan();
                            subEl.setCssStyles({
                                fontSize: "11px", color: "var(--text-faint)",
                                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                flexShrink: "0", marginLeft: "8px", maxWidth: "45%", textAlign: "right"
                            });
                            subEl.appendText(item.sub);
                            subEl.title = item.sub;   // 截断时悬停可看全文
                        }
                        if (item.trailing && item.trailing.onClick) this._mkTrailingBtn(itemEl, item);
                        this._listen(itemEl, "mouseenter", () => this._setActive(idx));
                        this._listen(itemEl, "mouseleave", () => this._clearActive(idx));
                        this._listen(itemEl, "mousedown", e => e.preventDefault());
                        const normalItemHandler = this._makeTouchHandler(() => { item.action(); this._hideDropdown(); });
                        this._listen(itemEl, "touchstart", normalItemHandler.onTouchStart, { passive: true });
                        this._listen(itemEl, "touchend", normalItemHandler.onTouchEnd);
                        this._listen(itemEl, "click", () => { item.action(); this._hideDropdown(); });
                    }

                    if(item.path) {
                        const filter=this._addQuickFilterButton(item.hits?itemEl.firstElementChild:itemEl,item.path);filter.buttonEl.addClass('primecore-result-exclusion-button');
                    }
                    this._itemEls.push(itemEl);
                }

                // ── 分组分页栏（与历史视图共用 _mkPagerBar）────────────────────
                // 注意：多个分组各有分页栏时不能都 sticky，否则会在同一滚动容器底部互相叠压，
                // 故分组内联展示（样式与历史分页栏一致），仅历史视图用 sticky。
                if (totalGroupPages > 1) {
                    const _goGroupPage = (newPage) => { this._groupPages.set(groupKey, newPage); this._renderDropdown(allGroups); };
                    this._mkPagerBar(this._dropdownInner, {
                        page: groupPage,
                        totalPages: totalGroupPages,
                        pageSize,
                        sticky: groups.length===1,
                        onSize: (n) => { this._dropdownPageSize = n; this._groupPages.clear();this._renderDropdown(allGroups); },
                        onPrev: () => _goGroupPage(groupPage - 1),
                        onNext: () => _goGroupPage(groupPage + 1)
                    });
                }
            }

            this._showDropdown();
        }

_setActive(idx) {
            this._clearActiveAll();
            this._activeIdx = idx;
            if (this._itemEls[idx]) {
                this._itemEls[idx].setCssStyles({background: "var(--background-modifier-hover)"});
            }
        }

_clearActive(idx) {
            if (this._activeIdx === idx) this._activeIdx = -1;
            if (this._itemEls[idx]) this._itemEls[idx].setCssStyles({background: "transparent"});
        }

_clearActiveAll() {
            this._itemEls.forEach(el => { el.setCssStyles({background: "transparent"}); });
            this._activeIdx = -1;
        }

_handleKey(e) {
            if(e.isComposing || e.keyCode===229)return;
            if(this.presentation==='page'&&e.key==='Enter') {e.preventDefault();this._executeSearch();return;}
            if (this._dropdown.style.display === "none") {
                if (e.key === "Enter") { e.preventDefault(); this._executeSearch(); }
                return;
            }
            if (e.key === "ArrowDown") {
                e.preventDefault();
                const next = (this._activeIdx + 1) % this._itemEls.length;
                this._setActive(next);
                this._itemEls[next]?.scrollIntoView({ block: "nearest" });
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                const prev = this._activeIdx <= 0 ? this._itemEls.length - 1 : this._activeIdx - 1;
                this._setActive(prev);
                this._itemEls[prev]?.scrollIntoView({ block: "nearest" });
            } else if (e.key === "Enter") {
                e.preventDefault();
                if (this._activeIdx >= 0 && this._itemEls[this._activeIdx]) {
                    this._itemEls[this._activeIdx].click();
                } else {
                    this._executeSearch();
                }
            } else if (e.key === "Escape") {
                this._hideDropdown();
            }
        }
};
