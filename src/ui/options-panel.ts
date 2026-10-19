import * as Obsidian from 'obsidian';
import { moment } from '../shared/moment.ts';
import { SHEET_BREAKPOINT, MIN_PANEL_H, PILL_ICON_SIZE, EXT_ICON } from '../shared/constants.ts';
import { IconRenderer } from '../shared/icons.ts';
import { makeTouchHandler } from '../shared/touch.ts';

// One cohesive behavior; shared state belongs to SearchBarComponent.
export const withPanel = Base => class extends Base {
  declare _scopeMenu;
  declare _vaultSearchPanel;
  declare _panelTabRow;
  declare _panelTabVault;
  declare _panelTabWeb;
  declare _panelVaultSection;
  declare _limitContentResults;
  declare _rebuildPresetOptions;
  declare _selectedPreset;
  declare _presetSelect;
  declare _extendedContext;
  declare _contentSearch;
  declare _searchWikiLinks;
  declare _searchMdLinks;
  declare _searchBookmarks;
  declare _searchTags;
  declare _searchProperties;
  declare _searchCommands;
  declare _searchNonMarkdown;
  declare _panelWebSection;
  declare _panelActiveTab;

_buildScopeMenu() {
            const document = this.container.ownerDocument;
            const window = document.defaultView;
            const getComputedStyle = window.getComputedStyle.bind(window);
            const requestAnimationFrame = window.requestAnimationFrame.bind(window);
            const cancelAnimationFrame = window.cancelAnimationFrame.bind(window);

            // 同样挂到 body；data-sb-float 用于批量清除
            this._scopeMenu = document.body.createDiv({cls:'primecore-search-layer'});
            this._scopeMenu.setAttribute("data-sb-float", "1");
            this._scopeMenu.setCssStyles({
                position: "fixed",
                zIndex: "9100",
                background: "var(--background-primary)",
                border: "1px solid var(--background-modifier-border)",
                borderRadius: "10px",
                boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
                padding: "4px",
                display: "none",
                minWidth: "160px"
            });
            this._listen(this._scopeMenu, "pointerdown", () => this._raiseFloat(this._scopeMenu), { passive: true });
            // 模式菜单内的触摸手势先收起输入法（见 _guardLayerKeyboard）
            this._guardLayerKeyboard(this._scopeMenu);

            const modes = [
                { mode: "global", icon: "compass", label: "全局搜索" },
                { mode: "vault",  icon: "vault",  label: "Vault 内搜索" },
                { mode: "web",    icon: "globe",  label: "互联网搜索" }
            ];

            for (const m of modes) {
                const item = this._scopeMenu.createDiv();
                item.setCssStyles({
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "7px 10px",
                    borderRadius: "7px",
                    cursor: "pointer",
                    color: "var(--text-normal)",
                    fontSize: "13px",
                    transition: "background 0.12s"
                });

                const iconWrap = item.createSpan();
                iconWrap.setCssStyles({ display: "inline-flex", alignItems: "center", color: "var(--text-muted)" });
                this._setIcon(iconWrap, m.icon, 15);
                item.createSpan({ text: m.label });

                this._listen(item, "mouseenter", () => { item.setCssStyles({background: "var(--background-modifier-hover)"}); });
                this._listen(item, "mouseleave", () => { item.setCssStyles({background: "transparent"}); });
                this._listen(item, "mousedown", (e) => { e.preventDefault(); });
                const itemHandler = this._makeTouchHandler(() => { this._selectMode(m.mode); });
                this._listen(item, "touchstart", itemHandler.onTouchStart, { passive: true });
                this._listen(item, "touchend", itemHandler.onTouchEnd);
                this._listen(item, "click", () => { this._selectMode(m.mode); });
            }
        }

_mkNavBtn(iconName, size = 14) {
            const btn = createEl("button");
            btn.setCssStyles({
                width: "24px", height: "24px",
                borderRadius: "50%",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--text-muted)",
                padding: "0",
                transition: "background 0.12s",
                touchAction: "manipulation",
                flexShrink: "0"
            });
            const iconSpan = btn.createSpan();
            iconSpan.setCssStyles({ display: "inline-flex", alignItems: "center", pointerEvents: "none" });
            this._setIcon(iconSpan, iconName, size);
            this._listen(btn, "mouseenter", () => { btn.setCssStyles({background: "var(--background-modifier-hover)"}); });
            this._listen(btn, "mouseleave", () => { btn.setCssStyles({background: "transparent"}); });
            return btn;
        }

_mkFloatHeader(container, titleText, rightEl) {
            const h = container.createDiv();
            h.setCssStyles({
                position: "sticky",
                top: "0",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 12px 7px",
                background: "var(--background-primary)",
                borderBottom: "1px solid var(--background-modifier-border)",
                gap: "8px",
                zIndex: "1"
            });
            const titleEl = h.createSpan({ text: titleText });
            titleEl.setCssStyles({
                fontSize: "11px",
                fontWeight: "600",
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                flexShrink: "1",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap"
            });
            if (rightEl) h.appendChild(rightEl);
            return h;
        }

_mkSectionLabel(container, text) {
            const lbl = container.createDiv();
            lbl.setCssStyles({
                padding: "6px 12px 4px",
                fontSize: "10px",
                fontWeight: "600",
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                borderBottom: "1px solid var(--background-modifier-border)"
            });
            lbl.textContent = text;
            return lbl;
        }

_buildVaultSearchPanel() {
            const document = this.container.ownerDocument;
            const window = document.defaultView;
            const getComputedStyle = window.getComputedStyle.bind(window);
            const requestAnimationFrame = window.requestAnimationFrame.bind(window);
            const cancelAnimationFrame = window.cancelAnimationFrame.bind(window);

            this._vaultSearchPanel = document.body.createDiv();
            this._vaultSearchPanel.setAttribute("data-sb-float", "1");
            this._vaultSearchPanel.setCssStyles({
                position: "fixed",
                zIndex: "9100",
                background: "var(--background-primary)",
                border: "1px solid var(--background-modifier-border)",
                borderRadius: "10px",
                boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
                display: "none",
                minWidth: "240px",
                maxHeight: "480px",
                overflowY: "auto",
                padding: "0"
            });
            this._listen(this._vaultSearchPanel, "pointerdown", () => this._raiseFloat(this._vaultSearchPanel), { passive: true });
            // 搜索选项面板内的触摸手势先收起输入法（见 _guardLayerKeyboard）
            this._guardLayerKeyboard(this._vaultSearchPanel);

            // ── 顶部固定 header（复用 _mkFloatHeader）────────────────────────
            const closeBtn = this._mkNavBtn("x", 13);
            const closeBtnHandler = this._makeTouchHandler(() => this._closePanel());
            this._listen(closeBtn, "touchstart", closeBtnHandler.onTouchStart, { passive: true });
            this._listen(closeBtn, "touchend", closeBtnHandler.onTouchEnd);
            this._listen(closeBtn, "click", () => this._closePanel());
            const headerActions=this._vaultSearchPanel.createDiv({cls:'primecore-result-tools'});
            this._panelQuickFilterButton=this._addQuickFilterButton(headerActions);
            this._panelQuickFilterButton.buttonEl.setCssStyles({display: this._mode==='web'?'none':'inline-flex'});
            const settingsButton=this._mkNavBtn('settings',14);
            settingsButton.setAttribute('aria-label','插件设置');settingsButton.title='插件设置';
            this._listen(settingsButton,'click',event=>{event.stopPropagation();this._closePanel({restoreDropdown:false});this.plugin.openSettings();});
            headerActions.appendChild(settingsButton);
            headerActions.appendChild(closeBtn);
            this._mkFloatHeader(this._vaultSearchPanel, '搜索选项', headerActions);

            // ── Tab 行（仅 global 模式显示，切换 vault/web 两栏）────────────────
            this._panelTabRow = this._vaultSearchPanel.createDiv();
            this._panelTabRow.setCssStyles({
                display: "none",  // _refreshPanelForMode 控制
                gap: "8px",
                padding: "10px 12px",
                borderBottom: "1px solid var(--background-modifier-border)"
            });
            const _mkTab = (iconName, label, tabKey) => {
                const div = this._panelTabRow.createDiv();
                div.setCssStyles({
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "7px 14px",
                    borderRadius: "8px",
                    background: "var(--background-secondary)",
                    cursor: "pointer",
                    fontSize: "12px",
                    color: "var(--text-muted)",
                    touchAction: "manipulation",
                    userSelect: "none",
                    borderBottom: "2.5px solid transparent",
                    transition: "color 0.15s, border-color 0.15s, background 0.15s"
                });
                div.setAttribute("role", "button");
                div.setAttribute("tabindex", "0");
                const iconSpan = div.createSpan();
                iconSpan.setCssStyles({ display: "inline-flex", alignItems: "center", pointerEvents: "none" });
                this._setIcon(iconSpan, iconName, 13);
                div.addClass('primecore-hover-action');div.setAttribute('aria-label',label);
                div.createSpan({cls:'primecore-action-label',text:label});
                div._tabKey = tabKey;
                div._iconSpan = iconSpan;
                const tabHandler = this._makeTouchHandler(() => this._switchPanelTab(tabKey));
                this._listen(div, "touchstart", tabHandler.onTouchStart, { passive: true });
                this._listen(div, "touchend", tabHandler.onTouchEnd);
                this._listen(div, "click", () => this._switchPanelTab(tabKey));
                this._listen(div, "mouseenter", () => {
                    if (div._tabKey !== this._panelActiveTab) div.setCssStyles({background: "var(--background-modifier-hover)"});
                });
                this._listen(div, "mouseleave", () => {
                    if (div._tabKey !== this._panelActiveTab) div.setCssStyles({background: "var(--background-secondary)"});
                });
                return div;
            };
            this._panelTabVault = _mkTab("vault", "Vault", "vault");
            this._panelTabWeb   = _mkTab("globe", "Web", "web");

            // ── Vault 搜索选项区（vault/global 模式显示）────────────────────────
            const vaultSection = this._vaultSearchPanel.createDiv();
            this._panelVaultSection = vaultSection;

            // ── grid 行构建辅助 ──────────────────────────────────────────────
            const _mkGrid = (parent) => {
                const g = parent.createDiv();
                g.setCssStyles({
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: "8px 14px",
                    alignItems: "center",
                    padding: "10px 14px"
                });
                return g;
            };

            // 行：可选图标 + 标签 + 控件（图标沿用面板既有的 13px 尺度）
            // Row: optional icon + label + control (icon follows the panel's existing 13px scale).
            const _row = (grid, labelText, controlEl, iconName = undefined) => {
                const wrap = grid.createSpan();
                wrap.setCssStyles({ display: "inline-flex", alignItems: "center", gap: "7px", minWidth: "0" });
                if (iconName) {
                    const ic = wrap.createSpan();
                    ic.setCssStyles({ display: "inline-flex", alignItems: "center", flexShrink: "0", color: "var(--text-muted)" });
                    this._setIcon(ic, iconName, 13);
                }
                const lbl = wrap.createSpan({ text: labelText });
                lbl.setCssStyles({
                    fontSize: "13px", color: "var(--text-normal)", userSelect: "none",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
                });
                grid.appendChild(controlEl);
            };

            // Obsidian 原生 checkbox-container toggle
            const _toggle = (initial, onChange) => {
                const label = createEl("label", { cls: initial ? "checkbox-container is-enabled" : "checkbox-container" });
                label.setCssStyles({cssText: "cursor:pointer;flex-shrink:0;"});
                const inp = label.createEl("input", { type: "checkbox" });
                inp.checked = initial;
                // 所有专项搜索开关统一走这里，改完即刷新按钮上的状态图标
                const _fire = (v) => { onChange(v); this._refreshContentToggleStatus(); };
                this._listen(inp, "change", () => {
                    label.classList.toggle("is-enabled", inp.checked);
                    _fire(inp.checked);
                });
                const toggleHandler = this._makeTouchHandler(() => {
                    inp.checked = !inp.checked;
                    label.classList.toggle("is-enabled", inp.checked);
                    _fire(inp.checked);
                });
                this._listen(label, "touchstart", toggleHandler.onTouchStart, { passive: true });
                this._listen(label, "touchend", toggleHandler.onTouchEnd);
                return label;
            };

            // primary 跳转按钮
            const _primaryBtn = (text) => {
                const btn = createEl("button");
                btn.setCssStyles({
                    background: "var(--interactive-accent)",
                    color: "var(--text-on-accent)",
                    border: "none",
                    borderRadius: "6px",
                    padding: "4px 10px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                    fontSize: "12px",
                    touchAction: "manipulation"
                });
                const iconSpan = btn.createSpan();
                iconSpan.setCssStyles({ display: "inline-flex", alignItems: "center", pointerEvents: "none" });
                this._setIcon(iconSpan, "arrow-right", 13);
                btn.addClass('primecore-hover-action');btn.setAttribute('aria-label',text);
                btn.createSpan({cls:'primecore-action-label',text});
                return btn;
            };

            // ── Section 1：搜索设置 ──────────────────────────────────────────
            this._mkSectionLabel(vaultSection, "搜索设置");
            const grid1 = _mkGrid(vaultSection);

            // 内容搜索上限：左数字框（限制时可编辑）+ 右开关（控制是否限制）
            {
                const rightCtrl = createDiv();
                rightCtrl.setCssStyles({ display: "flex", alignItems: "center", gap: "6px", flexShrink: "0" });

                const numInput = createEl("input", { type: "number" });
                numInput.value    = String(this.cfg.vaultContentSearchMaxResults || 30);
                numInput.min      = "1";
                numInput.max      = "500";
                numInput.disabled = !this._limitContentResults;
                numInput.setCssStyles({
                    width: "54px", padding: "2px 6px", fontSize: "12px",
                    borderRadius: "5px", border: "1px solid var(--background-modifier-border)",
                    background: "var(--background-primary)", color: "var(--text-normal)",
                    opacity: this._limitContentResults ? "1" : "0.4"
                });
                this._listen(numInput, "change", () => {
                    const v = Math.max(1, Math.min(500, Number(numInput.value) || 30));
                    numInput.value = String(v);
                    this.cfg.vaultContentSearchMaxResults = v;
                    this._saveCfgKey("vaultContentSearchMaxResults", v);
                });

                const toggleLabel = createEl("label", { cls: "checkbox-container" });
                const toggleInp   = toggleLabel.createEl("input", { type: "checkbox" });
                toggleInp.checked = this._limitContentResults;
                this._listen(toggleInp, "change", () => {
                    this._limitContentResults     = toggleInp.checked;
                    numInput.disabled             = !toggleInp.checked;
                    numInput.setCssStyles({opacity: toggleInp.checked ? "1" : "0.4"});
                    this._saveCfgKey("limitContentResults", toggleInp.checked);
                });

                rightCtrl.appendChild(numInput);
                rightCtrl.appendChild(toggleLabel);
                _row(grid1, "内容搜索上限", rightCtrl);
            }

            const presetSelect = createEl("select",{cls:'dropdown'});
            presetSelect.setCssStyles({
                fontSize: "12px",
                border: "1px solid var(--background-modifier-border)",
                borderRadius: "100px",
                backgroundColor: "var(--background-secondary)",
                color: "var(--text-normal)",
                paddingInlineStart: "var(--dropdown-padding-start, 8px)",
                paddingInlineEnd: "var(--dropdown-padding-end, 28px)",
                cursor: "pointer"
            });
            const _rebuildPresetOptions = () => {
                while (presetSelect.firstChild) presetSelect.removeChild(presetSelect.firstChild);
                presetSelect.createEl("option", { value: "", text: "无预设" });
                (this.cfg.searchPresets || []).forEach(p => {
                    presetSelect.createEl("option", { value: p.name, text: p.name });
                });
                presetSelect.value = this._selectedPreset;
            };
            _rebuildPresetOptions();
            this._rebuildPresetOptions = _rebuildPresetOptions;
            this._listen(presetSelect, "change", () => {
                this._quickExcludedPaths=[];this._temporaryFilter=null;
                this._selectedPreset = presetSelect.value;
                this._saveCfgKey("defaultPreset", this._selectedPreset);
                const preset = (this.cfg.searchPresets || []).find(p => p.name === this._selectedPreset);
                if (this._contentToggleLabelEl && this._mode !== "web") {
                    this._contentToggleLabelEl.textContent = this._selectedPreset || "搜索选项";
                }
                if (this._contentToggleIconEl && this._mode !== "web") {
                    this._setIcon(this._contentToggleIconEl, preset?.icon || "sliders-horizontal", PILL_ICON_SIZE);
                }
                this._refreshContentToggleStatus();
                const q = this._input.value.trim();
                if (q) this._doSearch(q);
            });
            _row(grid1, "搜索预设", presetSelect);
            this._presetSelect = presetSelect;

            _row(grid1, "显示更多上下文", _toggle(this._extendedContext, (v) => {
                this._extendedContext = v;
                this._saveCfgKey("extendedContext", v);
                const q = this._input.value.trim();
                if (q) this._doSearch(q);
            }));

            // ── Section 2：专项搜索 ──────────────────────────────────────────
            this._mkSectionLabel(vaultSection, "专项搜索");
            const grid2 = _mkGrid(vaultSection);

            // 内容搜索：原先只能由配置文件控制，这里补开关（顺序与按钮状态图标一致）
            _row(grid2, "内容搜索", _toggle(this._contentSearch, (v) => {
                this._contentSearch = v;
                this._saveCfgKey("vaultContentSearch", v);
                const q = this._input.value.trim();
                if (q) this._doSearch(q);
            }), "file-search");

            _row(grid2, "内部链接", _toggle(this._searchWikiLinks, (v) => {
                this._searchWikiLinks = v;
                this._saveCfgKey("searchWikiLinks", v);
                const q = this._input.value.trim();
                if (q) this._doSearch(q);
            }), "brackets");
            _row(grid2, "外部链接", _toggle(this._searchMdLinks, (v) => {
                this._searchMdLinks = v;
                this._saveCfgKey("searchMdLinks", v);
                const q = this._input.value.trim();
                if (q) this._doSearch(q);
            }), "external-link");
            _row(grid2, "书签", _toggle(this._searchBookmarks, (v) => {
                this._searchBookmarks = v;
                this._saveCfgKey("searchBookmarks", v);
                const q = this._input.value.trim();
                if (q) this._doSearch(q);
            }), "bookmark");
            _row(grid2, "标签", _toggle(this._searchTags, (v) => {
                this._searchTags = v;
                this._saveCfgKey("searchTags", v);
                const q = this._input.value.trim();
                if (q) this._doSearch(q);
            }), "tag");
            // YAML 属性搜索：支持 `键:值` 精确形式，也支持只匹配键名或值
            _row(grid2, "属性", _toggle(this._searchProperties, (v) => {
                this._searchProperties = v;
                this._saveCfgKey("searchProperties", v);
                const q = this._input.value.trim();
                if (q) this._doSearch(q);
            }), "braces");
            // 命令面板搜索：条目行=执行命令，行尾按钮=复制命令 id
            _row(grid2, "命令", _toggle(this._searchCommands, (v) => {
                this._searchCommands = v;
                this._saveCfgKey("searchCommands", v);
                const q = this._input.value.trim();
                if (q) this._doSearch(q);
            }), "command");
            // 非 markdown 文件：默认关闭；开启后文件名/路径匹配涵盖 vault 内全部文件
            _row(grid2, "非 md 文件", _toggle(this._searchNonMarkdown, (v) => {
                this._searchNonMarkdown = v;
                this._saveCfgKey("searchNonMarkdown", v);
                const q = this._input.value.trim();
                if (q) this._doSearch(q);
            }), "files");

            // ── Section 3：功能 ──────────────────────────────────────────────
            this._mkSectionLabel(vaultSection, "功能");
            const grid3 = _mkGrid(vaultSection);

            const tagSearchBtn = _primaryBtn("搜索");
            this._listen(tagSearchBtn, "click", () => {
                const q = this._input.value.trim();
                try {
                    this.app.commands.executeCommandById("global-search:open");
                    this._later(() => {
                        try {
                            const searchView = this.app.workspace.getLeavesOfType("search")[0]?.view;
                            if (searchView && typeof searchView.setQuery === "function") {
                                searchView.setQuery(q ? `tag:#${q}` : "tag:");
                            }
                        } catch (e2) {
                            this._log("warn", "[SearchBar] Tag 搜索填入失败:", e2);
                        }
                    }, 100);
                } catch (e) {
                    this._log("error", "[SearchBar] global-search:open 失败:", e);
                }
            });
            _row(grid3, "Tag 搜索", tagSearchBtn, "tag");

            const tagsViewBtn = _primaryBtn("视图");
            this._listen(tagsViewBtn, "click", () => {
                try {
                    this.app.commands.executeCommandById("tag-pane:open");
                } catch (e) {
                    this._log("error", "[SearchBar] tag-pane:open 失败:", e);
                }
            });
            _row(grid3, "Tags 视图", tagsViewBtn, "tags");

            if (this._contentToggleLabelEl && this._selectedPreset && this._mode !== "web") {
                this._contentToggleLabelEl.textContent = this._selectedPreset;
                const initPreset = (this.cfg.searchPresets || []).find(p => p.name === this._selectedPreset);
                if (this._contentToggleIconEl && initPreset?.icon) {
                    this._setIcon(this._contentToggleIconEl, initPreset.icon, PILL_ICON_SIZE);
                }
            }
            // 初始状态图标（面板与按钮均建于此时，可安全刷新）
            this._refreshContentToggleStatus();

            // ── Web 搜索选项区（web 模式或 global 切 web tab 时显示）──────────
            this._panelWebSection = this._vaultSearchPanel.createDiv();
            this._panelWebSection.setCssStyles({display: "none"});
            this._buildWebOptionsSection(this._panelWebSection);
        }

_applyPanelBtnStyle(_panelOpen) {
            if (!this._contentToggleBtn) return;
            this._contentToggleBtn.setCssStyles({color: "var(--primecore-accent)"});
            this._contentToggleBtn.setCssStyles({borderColor: "color-mix(in srgb, var(--primecore-accent) 80%, transparent)"});
            this._setSearchButtonBackground(this._contentToggleBtn);
        }

_switchPanelTab(tab) {
            if (!this._panelVaultSection || !this._panelWebSection) return;
            this._panelActiveTab = tab;
            const showVault = tab === "vault";
            this._panelVaultSection.setCssStyles({display: showVault ? "block" : "none"});
            this._panelWebSection.setCssStyles({display: showVault ? "none"  : "block"});
            // 更新 tab div 高亮（卡片风格：底部指示线 + 主题色文字 + 微背景）
            [this._panelTabVault, this._panelTabWeb].forEach(div => {
                if (!div) return;
                const isActive = div._tabKey === tab;
                div.setCssStyles({color: isActive ? "var(--primecore-accent)"         : "var(--text-muted)"});
                div.setCssStyles({borderBottomColor: isActive ? "var(--primecore-accent)"         : "transparent"});
                div.setCssStyles({background: isActive ? "color-mix(in srgb, var(--primecore-accent) 8%, transparent)"  : "var(--background-secondary)"});
            });
        }

_refreshPanelForMode(mode) {
            if (!this._panelTabRow) return;
            const isGlobal = mode === "global";
            // global 模式才显示双 tab 行
            this._panelTabRow.setCssStyles({display: isGlobal ? "flex" : "none"});
            if (mode === "vault") {
                // vault 模式：只显示 vault 区
                this._panelVaultSection.setCssStyles({display: "block"});
                this._panelWebSection.setCssStyles({display: "none"});
            } else if (mode === "web") {
                // web 模式：只显示 web 区
                this._panelVaultSection.setCssStyles({display: "none"});
                this._panelWebSection.setCssStyles({display: "block"});
            } else {
                // global 模式：默认显示 vault tab
                this._switchPanelTab("vault");
            }
        }
};
