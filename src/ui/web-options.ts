
import type {SearchBarCtor} from './search-bar-host.ts';
import type {WebSource} from '../types.ts';
import {positionFloatingElement} from './floating-geometry.ts';

// One cohesive behavior; shared state belongs to SearchBarComponent.
export const withWebOptions = <T extends SearchBarCtor>(Base: T) => class extends Base {
_buildWebOptionsSection(container: HTMLElement): void {
            const _mkGrid = (parent: HTMLElement) => {
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
            const _row = (grid: HTMLElement, labelText: string, controlEl: HTMLElement, iconName: string | undefined = undefined) => {
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

            // ── Section 0：搜索引擎选择器（需求3）──────────────────────────
            this._mkSectionLabel(container, "搜索引擎");
            const engineRow = container.createDiv();
            engineRow.setCssStyles({
                display: "flex", flexWrap: "wrap", gap: "6px", padding: "10px 14px"
            });
            this._engineRowEl = engineRow;
            this._engineChipEls.clear();

            const enabledEngines = (this.cfg.engines || []).filter(e => e.enabled);
            enabledEngines.forEach(eng => {
                const chip = engineRow.createEl("button");
                chip.setCssStyles({
                    fontSize: "12px", padding: "3px 10px", borderRadius: "100px",
                    border: "1px solid color-mix(in srgb, var(--primecore-accent) 35%, transparent)",
                    background: "transparent", color: "var(--text-muted)",
                    cursor: "pointer", touchAction: "manipulation",
                    transition: "background 0.15s, color 0.15s, border-color 0.15s"
                });
                chip.textContent = eng.name;
                this._engineChipEls.set(eng.id, chip);

                const _toggleEngine = () => {
                    try {
                        const isNowActive = this._activeEngineId === eng.id;
                        this._activeEngineId = isNowActive ? null : eng.id;
                        void this._saveCfgKey("activeEngineId", this._activeEngineId);
                        this._refreshEngineChips();
                        // 同步 pill 按钮标签
                        if (this._mode === "web" && this._contentToggleLabelEl) {
                            const activeEng = enabledEngines.find(e => e.id === this._activeEngineId);
                            this._contentToggleLabelEl.textContent = activeEng ? activeEng.name : "搜索选项";
                        }
                    } catch (e) {
                        this._log("error", "[SearchBar] 引擎切换失败:", e);
                    }
                };
                const engineChipHandler = this._makeTouchHandler(_toggleEngine);
                this._listen(chip, "touchstart", engineChipHandler.onTouchStart, { passive: true });
                this._listen(chip, "touchend", engineChipHandler.onTouchEnd);
                this._listen(chip, "click", _toggleEngine);
                this._listen(chip, "mouseenter", () => {
                    if (this._activeEngineId !== eng.id) chip.setCssStyles({background: "color-mix(in srgb, var(--primecore-accent) 8%, transparent)"});
                });
                this._listen(chip, "mouseleave", () => {
                    if (this._activeEngineId !== eng.id) chip.setCssStyles({background: "transparent"});
                });
            });
            this._refreshEngineChips();

            // 搜索语法快捷操作
            this._mkSectionLabel(container, "搜索语法");            const grid1 = _mkGrid(container);

            // 精确匹配 chip
            const _chipBtn = (label: string, applyFn: () => void) => {
                const btn = createEl("button");
                btn.setCssStyles({
                    fontSize: "12px", padding: "3px 10px", borderRadius: "100px",
                    border: "1px solid color-mix(in srgb, var(--primecore-accent) 40%, transparent)",
                    background: "transparent", color: "color-mix(in srgb, var(--primecore-accent) 70%, transparent)",
                    cursor: "pointer", touchAction: "manipulation",
                    transition: "background 0.15s, color 0.15s"
                });
                btn.textContent = label;
                const chipBtnHandler = this._makeTouchHandler(applyFn);
                this._listen(btn, "touchstart", chipBtnHandler.onTouchStart, { passive: true });
                this._listen(btn, "touchend", chipBtnHandler.onTouchEnd);
                this._listen(btn, "click", applyFn);
                return btn;
            };

            _row(grid1, "精确匹配", _chipBtn('"..."', () => this._applyWebOperator("exact", null)));
            _row(grid1, "仅标题", _chipBtn("intitle:", () => this._applyWebOperator("intitle", null)));

            // site: 带输入框
            const siteCtrl = createDiv();
            siteCtrl.setCssStyles({ display: "flex", alignItems: "center", gap: "4px" });
            const siteInput = siteCtrl.createEl("input", { type: "text" });
            siteInput.setCssStyles({
                width: "110px", fontSize: "12px", padding: "2px 6px",
                borderRadius: "5px", border: "1px solid var(--background-modifier-border)",
                background: "var(--background-primary)", color: "var(--text-normal)"
            });
            siteInput.placeholder = "example.com";
            this._listen(siteInput, "mousedown",  (e) => e.stopPropagation());
            this._listen(siteInput, "touchstart", (e) => e.stopPropagation(), { passive: true });
            const siteApplyBtn = _chipBtn("site:", () => {
                const domain = siteInput.value.trim();
                this._applyWebOperator("site", domain);
            });
            siteCtrl.appendChild(siteApplyBtn);
            _row(grid1, "指定网站", siteCtrl);

            // filetype: select + 自定义输入框
            const ftWrap = createDiv();
            ftWrap.setCssStyles({ display: "flex", alignItems: "center", gap: "4px" });
            const ftSelect = ftWrap.createEl("select",{cls:'dropdown'});
            ftSelect.setCssStyles({
                fontSize: "12px", paddingInlineStart: "var(--dropdown-padding-start, 8px)",paddingInlineEnd:"var(--dropdown-padding-end, 28px)", borderRadius: "5px",
                border: "1px solid var(--background-modifier-border)",
                backgroundColor: "var(--background-primary)", color: "var(--text-normal)", cursor: "pointer"
            });
            [["", "无"], ["pdf", "PDF"], ["doc", "DOC"], ["xls", "XLS"], ["ppt", "PPT"], ["txt", "TXT"], ["custom", "自定义"]].forEach(([v, t]) => {
                ftSelect.createEl("option", { value: v, text: t });
            });
            // 自定义输入框（初始隐藏）
            const ftCustomInput = ftWrap.createEl("input", { type: "text" });
            ftCustomInput.setCssStyles({
                display: "none", width: "80px", fontSize: "12px", padding: "2px 6px",
                borderRadius: "5px", border: "1px solid var(--background-modifier-border)",
                background: "var(--background-primary)", color: "var(--text-normal)"
            });
            ftCustomInput.placeholder = "Filetype";
            this._listen(ftCustomInput, "mousedown",  e => e.stopPropagation());
            this._listen(ftCustomInput, "touchstart", e => e.stopPropagation(), { passive: true });
            this._listen(ftSelect, "mousedown", e => e.stopPropagation());
            this._listen(ftSelect, "change", () => {
                const isCustom = ftSelect.value === "custom";
                ftCustomInput.setCssStyles({display: isCustom ? "inline-block" : "none"});
                if (!isCustom) this._applyWebOperator("filetype", ftSelect.value);
            });
            const _applyFtCustom = () => {
                const val = ftCustomInput.value.trim();
                if (val) this._applyWebOperator("filetype", val);
            };
            this._listen(ftCustomInput, "blur", _applyFtCustom);
            this._listen(ftCustomInput, "keydown", e => {
                if (e.key === "Enter") { e.preventDefault(); _applyFtCustom(); }
            });
            _row(grid1, "文件类型", ftWrap);

            // ── 信息源（配置驱动 + 编辑模式）──────────────────────────────
            const sourceSectionLabel = this._mkSectionLabel(container, "信息源");
            // section label 行右侧加编辑开关按钮
            sourceSectionLabel.setCssStyles({ display: "flex", alignItems: "center", justifyContent: "space-between" });
            this._sourceEditBtnEl = this._mkNavBtn("pencil", 13);
            this._sourceEditBtnEl.title = "编辑信息源";
            const sourceEditHandler = this._makeTouchHandler(() => this._toggleSourceEditMode());
            this._listen(this._sourceEditBtnEl, "touchstart", sourceEditHandler.onTouchStart, { passive: true });
            this._listen(this._sourceEditBtnEl, "touchend", sourceEditHandler.onTouchEnd);
            this._listen(this._sourceEditBtnEl, "click", () => this._toggleSourceEditMode());
            sourceSectionLabel.appendChild(this._sourceEditBtnEl);

            const sourceRow = container.createDiv();
            sourceRow.setCssStyles({
                display: "flex", flexWrap: "wrap", gap: "6px", padding: "10px 14px"
            });
            this._webSourceRowEl = sourceRow;
            this._renderSourceChips(sourceRow);
        }

_refreshEngineChips() {
            this._engineChipEls.forEach((chip, id) => {
                const isActive = this._activeEngineId === id;
                chip.setCssStyles({background: isActive ? "color-mix(in srgb, var(--primecore-accent) 15%, transparent)" : "transparent"});
                chip.setCssStyles({color: isActive ? "var(--primecore-accent)"        : "var(--text-muted)"});
                chip.setCssStyles({borderColor: isActive ? "color-mix(in srgb, var(--primecore-accent) 70%, transparent)"  : "color-mix(in srgb, var(--primecore-accent) 35%, transparent)"});
            });
        }

_toggleSourceEditMode() {
            this._webEditMode = !this._webEditMode;
            if (this._sourceEditBtnEl) {
                const iconSpan = this._sourceEditBtnEl.querySelector("span");
                if (iconSpan) this._setIcon(iconSpan, this._webEditMode ? "check" : "pencil", 13);
            }
            if (this._webSourceRowEl) this._renderSourceChips(this._webSourceRowEl);
        }

_renderSourceChips(row: HTMLElement): void {
            const DEFAULT_SOURCES = [
                { label: "GitHub",        domain: "github.com" },
                { label: "Reddit",        domain: "reddit.com" },
                { label: "StackOverflow", domain: "stackoverflow.com" },
                { label: "Scholar",       domain: "scholar.google.com" },
                { label: "YouTube",       domain: "youtube.com" },
                { label: "Hacker News",   domain: "news.ycombinator.com" }
            ];
            if (!this.cfg.webSources || this.cfg.webSources.length === 0) {
                this.cfg.webSources = DEFAULT_SOURCES.map(s => ({ ...s }));
            }
            row.empty();

            this.cfg.webSources.forEach((src, idx) => {
                const chip = row.createEl("button");
                chip.setCssStyles({
                    fontSize: "12px", padding: "3px 10px", borderRadius: "100px",
                    border: "1px solid color-mix(in srgb, var(--primecore-accent) 35%, transparent)",
                    background: "transparent", color: "var(--text-muted)",
                    cursor: "pointer", touchAction: "manipulation",
                    display: "inline-flex", alignItems: "center", gap: "4px",
                    transition: "background 0.15s, color 0.15s, border-color 0.15s"
                });

                const labelSpan = chip.createSpan({ text: src.label });
                labelSpan.setCssStyles({ pointerEvents: "none" });

                if (this._webEditMode) {
                    const editIconSpan = chip.createSpan();
                    editIconSpan.setCssStyles({
                        display: "inline-flex", alignItems: "center",
                        marginLeft: "2px", color: "color-mix(in srgb, var(--primecore-accent) 70%, transparent)", cursor: "pointer"
                    });
                    this._setIcon(editIconSpan, "pencil", 11);
                    const editHandler = this._makeTouchHandler((e) => {
                        e.stopPropagation();
                        this._openSourceEditor(src, idx, chip, row);
                    });
                    this._listen(editIconSpan, "touchstart", editHandler.onTouchStart, { passive: true });
                    this._listen(editIconSpan, "touchend", (e) => { e.stopPropagation(); editHandler.onTouchEnd(e); });
                    this._listen(editIconSpan, "click", e => {
                        e.stopPropagation();
                        this._openSourceEditor(src, idx, chip, row);
                    });

                    const delIconSpan = chip.createSpan();
                    delIconSpan.setCssStyles({
                        display: "inline-flex", alignItems: "center",
                        marginLeft: "2px", color: "var(--text-error)", cursor: "pointer"
                    });
                    this._setIcon(delIconSpan, "x", 11);
                    const delHandler = this._makeTouchHandler((e) => {
                        e.stopPropagation();
                        this._deleteSource(idx, row);
                    });
                    this._listen(delIconSpan, "touchstart", delHandler.onTouchStart, { passive: true });
                    this._listen(delIconSpan, "touchend", (e) => { e.stopPropagation(); delHandler.onTouchEnd(e); });
                    this._listen(delIconSpan, "click", e => {
                        e.stopPropagation();
                        this._deleteSource(idx, row);
                    });
                } else {
                    const _applySource = () => {
                        this._applyWebOperator("site", src.domain);
                        const isActive = this._input.value.includes(`site:${src.domain}`);
                        chip.setCssStyles({background: isActive ? "color-mix(in srgb, var(--primecore-accent) 15%, transparent)" : "transparent"});
                        chip.setCssStyles({color: isActive ? "var(--primecore-accent)"        : "var(--text-muted)"});
                        chip.setCssStyles({borderColor: isActive ? "color-mix(in srgb, var(--primecore-accent) 70%, transparent)"  : "color-mix(in srgb, var(--primecore-accent) 35%, transparent)"});
                    };
                    const applyHandler = this._makeTouchHandler(_applySource);
                    this._listen(chip, "touchstart", applyHandler.onTouchStart, { passive: true });
                    this._listen(chip, "touchend", applyHandler.onTouchEnd);
                    this._listen(chip, "click", _applySource);
                }
            });

            if (this._webEditMode) {
                const addBtn = row.createEl("button");
                addBtn.setCssStyles({
                    fontSize: "12px", padding: "3px 10px", borderRadius: "100px",
                    border: "1.5px dashed color-mix(in srgb, var(--primecore-accent) 40%, transparent)",
                    background: "transparent", color: "color-mix(in srgb, var(--primecore-accent) 70%, transparent)",
                    cursor: "pointer", touchAction: "manipulation",
                    display: "inline-flex", alignItems: "center", gap: "4px",
                    transition: "background 0.15s"
                });
                const addIconSpan = addBtn.createSpan();
                addIconSpan.setCssStyles({ display: "inline-flex", alignItems: "center", pointerEvents: "none" });
                this._setIcon(addIconSpan, "plus", 12);
                addBtn.addClass('primecore-hover-action');addBtn.setAttribute('aria-label','添加信息源');
                addBtn.createSpan({cls:'primecore-action-label',text:'添加'});
                const addBtnHandler = this._makeTouchHandler(() => this._openSourceEditor(null, -1, addBtn, row));
                this._listen(addBtn, "touchstart", addBtnHandler.onTouchStart, { passive: true });
                this._listen(addBtn, "touchend", addBtnHandler.onTouchEnd);
                this._listen(addBtn, "click", () => this._openSourceEditor(null, -1, addBtn, row));
            }
        }

_positionSourceEditor() {
            const editor = this._sourceEditor;
            const anchor = this._sourceEditorAnchor;
            if (!editor?.isConnected || !anchor?.isConnected) return;
            positionFloatingElement(editor,anchor.getBoundingClientRect(),Math.max(editor.offsetWidth||220,220),editor.scrollHeight||120);
            editor.setCssStyles({overflowY:'auto'});
        }

_openSourceEditor(src: WebSource | null, idx: number, anchorEl: HTMLElement, row: HTMLElement): void {
            const document = this.container.ownerDocument;

            this._sourceEditor?.remove();

            const editorEl = document.body.createDiv({cls:'primecore-source-editor'});
            this._sourceEditor = editorEl;
            editorEl.setAttribute("data-sb-source-editor", "1");
            editorEl.setAttribute("data-sb-float", "1");
            editorEl.setCssStyles({
                position: "fixed",
                zIndex: String(9200 + (++this._zCounter)),
                background: "var(--background-primary)",
                border: "1px solid var(--background-modifier-border)",
                borderRadius: "10px",
                boxShadow: "0 6px 20px rgba(0,0,0,0.2)",
                padding: "12px 14px",
                minWidth: "200px",
                display: "flex",
                flexDirection: "column",
                gap: "8px"
            });

            this._sourceEditorAnchor = anchorEl;
            this._frame(() => this._positionSourceEditor());

            const _mkInput = (placeholder: string, value: string) => {
                const inp = editorEl.createEl("input", { type: "text" });
                inp.setCssStyles({
                    fontSize: "12px", padding: "4px 8px",
                    borderRadius: "5px", border: "1px solid var(--background-modifier-border)",
                    background: "var(--background-secondary)", color: "var(--text-normal)", outline: "none"
                });
                inp.placeholder = placeholder;
                inp.value = value || "";
                this._listen(inp, "mousedown",  e => e.stopPropagation());
                this._listen(inp, "touchstart", e => e.stopPropagation(), { passive: true });
                return inp;
            };

            const nameInput   = _mkInput("名称（如 GitHub）",     src?.label  || "");
            const domainInput = _mkInput("域名（如 github.com）", src?.domain || "");

            const btnRow = editorEl.createDiv();
            btnRow.setCssStyles({ display: "flex", gap: "6px", justifyContent: "flex-end" });

            const cancelBtn = this._mkNavBtn("x", 13);
            cancelBtn.title = "取消";
            const cancelHandler = this._makeTouchHandler(() => editorEl.remove());
            this._listen(cancelBtn, "touchstart", cancelHandler.onTouchStart, { passive: true });
            this._listen(cancelBtn, "touchend", cancelHandler.onTouchEnd);
            this._listen(cancelBtn, "click", () => editorEl.remove());

            const confirmBtn = this._mkNavBtn("check", 13);
            confirmBtn.title = "确认";
            confirmBtn.setCssStyles({color: "var(--primecore-accent)"});
            const _confirm = () => {
                try {
                    const newLabel  = nameInput.value.trim();
                    const newDomain = domainInput.value.trim().replace(/^https?:\/\//, "");
                    if (!newLabel || !newDomain) return;
                    if (!this.cfg.webSources) this.cfg.webSources = [];
                    if (idx >= 0) {
                        this.cfg.webSources[idx] = { label: newLabel, domain: newDomain };
                    } else {
                        this.cfg.webSources.push({ label: newLabel, domain: newDomain });
                    }
                    void this._saveCfgKey("webSources", this.cfg.webSources);
                    this._renderSourceChips(row);
                    editorEl.remove();
                } catch (e) {
                    this._log("error", "[SearchBar] _openSourceEditor 确认失败:", e);
                }
            };
            const confirmHandler = this._makeTouchHandler(_confirm);
            this._listen(confirmBtn, "touchstart", confirmHandler.onTouchStart, { passive: true });
            this._listen(confirmBtn, "touchend", confirmHandler.onTouchEnd);
            this._listen(confirmBtn, "click", _confirm);

            [nameInput, domainInput].forEach(inp => {
                this._listen(inp, "keydown", e => { if (e.key === "Enter") { e.preventDefault(); _confirm(); } });
            });

            btnRow.appendChild(cancelBtn);
            btnRow.appendChild(confirmBtn);

            const _outsideClose = (e: MouseEvent) => {
                const target = e.target instanceof Node ? e.target : null;
                if (!target || !editorEl.contains(target)) { editorEl.remove(); document.removeEventListener("click", _outsideClose); }
            };
            this._later(() => this._listen(document, "click", _outsideClose), 0);
        }

_deleteSource(idx: number, row: HTMLElement): void {
            try {
                if (!this.cfg.webSources) return;
                this.cfg.webSources.splice(idx, 1);
                void this._saveCfgKey("webSources", this.cfg.webSources);
                this._renderSourceChips(row);
            } catch (e) {
                this._log("error", "[SearchBar] _deleteSource 失败:", e);
            }
        }

_applyWebOperator(op: 'exact' | 'intitle' | 'site' | 'filetype', value: string | null): void {
            let q = this._input.value.trim();
            try {
                if (op === "exact") {
                    // 切换精确匹配引号
                    if (q.startsWith('"') && q.endsWith('"')) {
                        q = q.slice(1, -1);
                    } else {
                        // 仅包裹非操作符部分（保留已有 site:/filetype: 等）
                        const opPart  = q.match(/\s+(site:|filetype:|intitle:)\S+/g) || [];
                        const basePart = q.replace(/\s+(site:|filetype:|intitle:)\S+/g, "").trim();
                        q = `"${basePart}"${opPart.join("")}`;
                    }
                } else if (op === "intitle") {
                    if (q.includes("intitle:")) {
                        q = q.replace(/\s*intitle:[^\s]*/g, "").trim();
                    } else {
                        q = q.replace(/^("?)([^"]+)("?)/, (_, a: string, base: string, c: string) => {
                            const baseClean = base.trim();
                            return `${a}intitle:${baseClean}${c}`;
                        });
                        // 简单情况：直接 prepend
                        if (!q.startsWith("intitle:")) q = `intitle:${q}`.trim();
                    }
                } else {
                    const tag = `${op}:${value}`;
                    if (q.includes(`${op}:`)) {
                        // 移除已有同类操作符
                        q = q.replace(new RegExp(`\\s*${op}:[^\\s]*`, "g"), "").trim();
                    }
                    if (value) q = `${q} ${tag}`.trim();
                }
                this._input.value = q;
                this._syncClearBtn();
                if (q) void this._doSearch(q);
            } catch (e) {
                this._log("error", "[SearchBar] _applyWebOperator 失败:", e);
            }
        }
};
