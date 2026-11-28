import {renderMarkdownFilters} from './markdown-filters.ts';
import {renderMarkdownHit} from './markdown-hit.ts';
import {markdownElementGroups} from '../search/markdown-result-items.ts';
import {getIcon} from 'obsidian';
import {sortSearchItems} from '../search/sort.ts';
import type {PagerOptions, SearchBarCtor} from './search-bar-host.ts';
import type {SearchItem, SearchGroup} from '../types.ts';
import {partitionFileGroups,fileTypeLabel} from '../search/file-types.ts';
import {renderResultDetails} from './result-row.ts';

// One cohesive behavior; shared state belongs to SearchBarComponent.
export const withResults = <T extends SearchBarCtor>(Base: T) => class extends Base {
_mkPagerBar(parent: HTMLElement, opts: PagerOptions): HTMLElement | null {
            try {
                const o = opts;
                const bar = parent.createDiv({cls:'primecore-pagination',attr:{role:'navigation','aria-label':'结果分页'}});
                bar.setCssStyles({
                    position: o.sticky === false ? "static" : "sticky"
                });

                // 每页条数（数字框 + 确认）
                const sizeInput = createEl("input", { type: "number",cls:"primecore-page-size" });
                sizeInput.value = String(o.pageSize);
                sizeInput.min = "1";
                sizeInput.setAttribute('aria-label','每页条数');
                // 阻止 mousedown/touchstart 冒泡，防止下拉被关闭
                this._listen(sizeInput, "mousedown", (e) => e.stopPropagation());
                this._listen(sizeInput, "touchstart", (e) => e.stopPropagation(), { passive: true });

                const checkBtn = createEl("button",{cls:"primecore-page-apply"});
                const checkIconSpan = checkBtn.createSpan();
                checkIconSpan.setCssStyles({ display: "inline-flex", alignItems: "center", pointerEvents: "none" });
                this._setIcon(checkIconSpan, "check", 13);
                checkBtn.setAttribute('aria-label','应用每页条数');
                this._listen(checkBtn, "mouseenter", () => { checkBtn.setCssStyles({opacity: "0.85"}); });
                this._listen(checkBtn, "mouseleave", () => { checkBtn.setCssStyles({opacity: "1"}); });
                const _applySize = () => {
                    const n = Math.max(1, parseInt(sizeInput.value, 10) || o.pageSize || 8);
                    sizeInput.value = String(n);
                    if (o.onSize) o.onSize(n);
                };
                this._listen(checkBtn, "mousedown", (e) => { e.stopPropagation(); e.preventDefault(); });
                const checkHandler = this._makeTouchHandler((e) => { e.stopPropagation(); e.preventDefault(); _applySize(); });
                this._listen(checkBtn, "touchstart", checkHandler.onTouchStart, { passive: true });
                this._listen(checkBtn, "touchend", (e) => { e.stopPropagation(); checkHandler.onTouchEnd(e); });
                this._listen(checkBtn, "click", (e) => { e.stopPropagation(); e.preventDefault(); _applySize(); });

                // 页码信息：当前页是可编辑的数字框，可直接跳页。
                // Page info: the current page is an editable number input.
                const infoEl = bar.createSpan({cls:'primecore-page-info'});
                infoEl.setCssStyles({
                    fontSize: "11px", color: "var(--text-muted)",
                    flexGrow: "1", textAlign: "center", whiteSpace: "nowrap"
                });
                infoEl.createSpan({text:"第"});
                const pageInput=createEl("input",{type:"number",cls:"primecore-page-number"});
                pageInput.value=String(o.page);
                pageInput.min="1";pageInput.max=String(Math.max(1,o.totalPages));pageInput.step="1";
                pageInput.setAttribute('aria-label','页码');
                pageInput.title='输入页码后按回车跳转';
                this._listen(pageInput,"mousedown",(e)=>e.stopPropagation());
                this._listen(pageInput,"touchstart",(e)=>e.stopPropagation(),{passive:true});
                const _applyPage=()=>{
                    const total=Math.max(1,o.totalPages);
                    const parsed=Number.parseInt(pageInput.value,10);
                    const next=Math.min(total,Math.max(1,Number.isFinite(parsed)?parsed:o.page));
                    pageInput.value=String(next);
                    if(next!==o.page&&o.onPage)o.onPage(next);
                };
                this._listen(pageInput,"change",_applyPage);
                this._listen(pageInput,"keydown",(e)=>{
                    if(e.key!=='Enter')return;
                    e.preventDefault();e.stopPropagation();_applyPage();pageInput.blur();
                });
                infoEl.appendChild(pageInput);
                infoEl.createSpan({text:`/ ${o.totalPages} 页`});

                // 上一页 / 下一页（复用 _mkNavBtn 圆形按钮）
                const prevBtn = this._mkNavBtn("chevron-left");prevBtn.addClass("primecore-page-nav");prevBtn.setCssStyles({width:"30px",height:"30px",borderRadius:"6px"});
                const nextBtn = this._mkNavBtn("chevron-right");nextBtn.addClass("primecore-page-nav");nextBtn.setCssStyles({width:"30px",height:"30px",borderRadius:"6px"});
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

_renderDropdown(groups: SearchGroup[]): void {
            groups=partitionFileGroups(groups);
            this._lastGroups=groups;
            if(this._resultToolView!=='results')return;
            if(this._richPreview)this.removeChild(this._richPreview);
            this._richPreview=this._createRichPreview();
            this._dropdownInner.empty();
            this._itemEls = [];
            this._contentHitControls = [];

            this._lastGroups = groups;
            this._activeIdx=-1;
            this._prepBar('results');
            if(this._resultCategory==='markdown'&&!this._markdownFilterEl){
                this._markdownFilterEl=renderMarkdownFilters(this._dropdown,this.cfg.markdownElementTypes,values=>this._setMarkdownElements(values),error=>this._log('error','Markdown 元素筛选保存失败',error),(parent,label,activate)=>this._createChoiceMenu(parent,label,undefined,{hover:!!activate,activate}),()=>this.cfg.markdownElementTypes);
                this._dropdown.insertBefore(this._markdownFilterEl,this._dropdownInner);
                const slot=this._markdownFilterEl.createDiv({cls:'primecore-markdown-view-slot'});
                this._markdownResultMenu=this._createChoiceMenu(slot,'元素结果显示模式');
            }
            this._markdownFilterEl?.toggle(this._resultCategory==='markdown');
            if(this._resultCategory==='nonMarkdown'&&!this._attachmentFilterEditor)this._buildAttachmentFilters();
            this._attachmentFilterEditor?.el.toggle(this._resultCategory==='nonMarkdown');this._attachmentFilterEditor?.sync();
            this._syncMarkdownResultMenu();
            this._markdownFilterEl?.dispatchEvent(new CustomEvent('primecore-filter-sync',{detail:this.cfg.markdownElementTypes}));
            if(this._resultCategory==='tags'){
                const modes=this._dropdownInner.createDiv({cls:'primecore-tag-modes'});
                modes.createSpan({text:'显示方式'});
                const select=modes.createEl('select',{attr:{'aria-label':'标签结果显示方式'}});
                select.createEl('option',{value:'tags',text:'标签 → 关联文档'});select.createEl('option',{value:'documents',text:'直接列出文档'});select.value=this.cfg.tagResultMode;
                select.addEventListener('change',()=>{this.cfg.tagResultMode=select.value==='documents'?'documents':'tags';void this.plugin.updateSetting('tagResultMode',this.cfg.tagResultMode,false).then(()=>this._doSearch(this._input.value.trim())).catch(error=>{this.cfg.tagResultMode=this.plugin.settings.tagResultMode;select.value=this.cfg.tagResultMode;this._log('error','标签显示方式保存失败',error);});});
            }
            const visibleGroups=this._visibleResultGroups(groups);
            const allGroups=groups;
            groups=this._resultCategory==='markdown'&&this._markdownResultMode==='elements'?markdownElementGroups(visibleGroups):visibleGroups;
            if(!groups.some(group=>group.items.length)) {
                const empty=this._dropdownInner.createDiv({cls:'primecore-results-empty',attr:{role:'status'}});
                this._setIcon(empty.createSpan({cls:'primecore-results-empty-icon',attr:{'aria-hidden':'true'}}),'inbox',64);
                empty.createDiv({text:this._resultCategory==='markdown'&&!this.cfg.markdownElementTypes.length?'请选择要显示的 Markdown 元素':'什么都木有'});
                this._syncContentExpandButton();
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
                const sortedItems=sortSearchItems<SearchItem>(group.items,this._vaultSortMode,path=>{const f=this.app.vault.getAbstractFileByPath(path);return f && 'stat' in f ? f : null;});
                const slicedItems = sortedItems.slice((groupPage - 1) * pageSize, groupPage * pageSize);

                if(groups.length>1&&group.title)this._dropdownInner.createDiv({cls:'primecore-result-source',text:group.title});

                for (const item of slicedItems) {
                    const idx    = this._itemEls.length;
                    const itemEl = this._dropdownInner.createDiv();

                    if(item.elementHit){
                        const hit=item.elementHit,path=item.path||'';
                        itemEl.addClass('primecore-element-result');
                        const open=()=>{item.action();this._hideDropdown();};
                        renderMarkdownHit(itemEl,hit,item.terms||[],this._richPreview,path,open,(target,external)=>this._openElementLink(target,external,path));
                        const sourceRow=itemEl.createDiv({cls:'primecore-element-source-row'});
                        const source=sourceRow.createEl('button',{cls:'primecore-element-source',attr:{type:'button','aria-label':'打开来源 '+path}});
                        this._setIcon(source.createSpan({attr:{'aria-hidden':'true'}}),'file-text',12);
                        source.createSpan({text:path||item.label});
                        this._listen(source,'click',event=>{event.stopPropagation();open();});
                        this._listen(itemEl,'click',event=>{if(event.target===itemEl)open();});
                        this._listen(itemEl,'mouseenter',()=>this._setActive(idx));
                        this._listen(itemEl,'mouseleave',()=>this._clearActive(idx));
                    }else if(item.children){
                        const details=itemEl.createEl('details',{cls:'primecore-tag-group'});
                        details.open=this._contentAllExpanded;
                        this._contentHitControls.push({setExpanded:value=>{details.open=value;},isExpanded:()=>details.open});
                        details.addEventListener('toggle',()=>this._syncContentExpandButton());
                        const summary=details.createEl('summary');
                        this._setIcon(summary.createSpan(),'tag',14);summary.createSpan({text:item.label});summary.createSpan({cls:'primecore-markdown-line',text:item.children.length+' 篇文档'});
                        for(const child of item.children){
                            const document=details.createEl('button',{cls:'primecore-tag-document',attr:{type:'button'}});
                            this._setIcon(document.createSpan(),'file-text',14);document.createSpan({text:child.label});
                            document.createSpan({cls:'primecore-result-path',text:child.path||''});
                            this._listen(document,'click',event=>{event.stopPropagation();child.action();this._hideDropdown();});
                        }
                        this._listen(itemEl,'click',event=>{if(event.target===itemEl)details.open=!details.open;});
                    } else if (item.hits) {
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
                        const labelEl = contentColEl.createSpan({cls:'primecore-result-title-text'});
                        labelEl.setCssStyles({
                            fontSize: "13px", color: "var(--text-normal)",
                        });
                        this._highlightText(labelEl, item.label, item.terms);
                        renderResultDetails(contentColEl, item);
                        const badgeEl = headerRow.createSpan({ text: `${item.hits.length}` });
                        badgeEl.setCssStyles({
                            flexShrink: "0", fontSize: "10px", padding: "1px 5px",
                            borderRadius: "8px", background: "var(--background-modifier-border)", color: "var(--text-muted)"
                        });
                        const hitsContainer = itemEl.createDiv();
                        hitsContainer.setCssStyles({
                            // 左内边距对齐标题列起点：header 左 14 + 图标 16 + 间距 6 + chevron 12 + 间距 6
                            display: "none", flexDirection: "column", gap: "2px", padding:"0 14px 6px 14px"
                        });
                        // Build snippet rows only on first expand; collapsed groups stay cheap.
                        // 首次展开时才创建摘要行；折叠状态不生成 DOM。
                        let _expanded = item.hits.some(hit=>hit.markdown)?this._markdownExpanded:this._contentAllExpanded;
                        let _built = false;
                        const _buildHits = () => {
                            if (_built) return;
                            _built = true;
                            let contentNumber=0;
                            for (const snippet of item.hits) {
                                const openMatch=()=>{if(item.onMatch)item.onMatch(snippet);else item.action();this._hideDropdown();};
                                if(snippet.markdown){
                                    renderMarkdownHit(hitsContainer,snippet,item.terms||[],this._richPreview,item.path||'',openMatch,(target,external)=>this._openElementLink(target,external,item.path||''));continue;
                                }
                                const snippetEl = hitsContainer.createDiv({cls:'primecore-result-title-text'});
                                snippetEl.setCssStyles({
                                    fontSize: "11px", color: "var(--text-faint)", padding: "3px 6px",
                                    borderRadius: "4px", lineHeight: "1.4", cursor: "pointer", transition: "background 0.1s"
                                });
                                this._listen(snippetEl, "mouseenter", () => { snippetEl.setCssStyles({background: "var(--background-modifier-hover)"}); });
                                this._listen(snippetEl, "mouseleave", () => { snippetEl.setCssStyles({background: "transparent"}); });
                                // Sequence number on the left of the line label; prominent accent badge.
                                // 每个内容块在行号左侧标注序号，使用醒目的强调色圆形徽标。
                                contentNumber++;
                                snippetEl.createSpan({cls:'primecore-content-seq',text:String(contentNumber),attr:{'aria-label':`第 ${contentNumber} 个匹配`}});
                                if(snippet.location)snippetEl.createSpan({cls:'primecore-markdown-line',text:snippet.location});
                                this._richPreview.render(snippetEl.createDiv(),snippet.preview||snippet.text,item.path||'',item.terms||[]);
                                snippetEl.setAttribute("role","button");snippetEl.tabIndex=0;
                                this._listen(snippetEl,"keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();e.stopPropagation();openMatch();}});
                                this._listen(snippetEl, "mousedown", e => e.preventDefault());
                                const snippetHandler = this._makeTouchHandler((e) => { e.stopPropagation(); openMatch(); });
                                this._listen(snippetEl, "touchstart", snippetHandler.onTouchStart, { passive: true });
                                this._listen(snippetEl, "touchend", (e) => { e.stopPropagation(); snippetHandler.onTouchEnd(e); });
                                this._listen(snippetEl, "click", e => { e.stopPropagation(); if(!(e.target as Element).closest('a,input,button'))openMatch(); });
                            }
                        };
                        const _setExpanded = (value: boolean) => {
                            _expanded = value;
                            if (_expanded) _buildHits();
                            hitsContainer.setCssStyles({display: _expanded ? "flex" : "none"});
                            chevronEl.setCssStyles({transform: _expanded ? "rotate(90deg)" : ""});
                        };
                        const _toggle = (e: {stopPropagation(): void}) => { e.stopPropagation(); _setExpanded(!_expanded); this._syncContentExpandButton(); };
                        this._contentHitControls.push({setExpanded:_setExpanded,isExpanded:()=>_expanded});
                        if (_expanded) _setExpanded(true);
                        this._listen(headerRow, "mouseenter", () => this._setActive(idx));
                        this._listen(headerRow, "mouseleave", () => this._clearActive(idx));
                        this._listen(headerRow, "mousedown", e => e.preventDefault());
                        const headerToggleHandler = this._makeTouchHandler(_toggle);
                        this._listen(headerRow, "touchstart", headerToggleHandler.onTouchStart, { passive: true });
                        this._listen(headerRow, "touchend", headerToggleHandler.onTouchEnd);
                        this._listen(headerRow, "click", _toggle);
                        this._listen(itemEl, "mousedown", e => e.preventDefault());
                        const itemHandler = this._makeTouchHandler(() => { item.action(); if(!item.keepOpen)this._hideDropdown(); });
                        this._listen(itemEl, "touchstart", itemHandler.onTouchStart, { passive: true });
                        this._listen(itemEl, "touchend", itemHandler.onTouchEnd);
                        this._listen(itemEl, "click", () => { item.action(); if(!item.keepOpen)this._hideDropdown(); });
                    } else if (item.twoLine) {
                        // ── 双行条目（命令面板等）：前置图标 + 主标题 + 副标题 + 可选行尾按钮 ──
                        itemEl.setCssStyles({
                            display: "flex", flexDirection: "row", alignItems: "center", gap: "8px",
                            padding: "7px 14px", cursor: "pointer",
                            transition: "background 0.1s", minHeight: "36px", background: "transparent"
                        });
                        if (item.icon) {
                            const iconWrapEl = itemEl.createSpan();
                            if (item.iconTitle) {
                                iconWrapEl.title = item.iconTitle;
                                iconWrapEl.setAttribute('role', 'img');
                                iconWrapEl.setAttribute('aria-label', item.iconTitle);
                            }
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
                        const titleRow = contentEl.createDiv({cls: 'primecore-result-title'});
                        if (item.alias) titleRow.createSpan({cls: 'tag primecore-alias-pill', text: 'Alias'});
                        const labelEl = titleRow.createSpan({cls: 'primecore-result-title-text'});
                        labelEl.setCssStyles({
                            fontSize: "13px", color: "var(--text-normal)",
                        });
                        const fileType=fileTypeLabel(item.path);
                        if(fileType)labelEl.createSpan({cls:"primecore-file-type",text:fileType});
                        if (item.terms) { this._highlightText(labelEl, item.label, item.terms); } else { labelEl.appendText(item.label); }
                        renderResultDetails(contentEl, item);
                        if (item.trailing && item.trailing.onClick) this._mkTrailingBtn(itemEl, item);
                        this._listen(itemEl, "mouseenter", () => this._setActive(idx));
                        this._listen(itemEl, "mouseleave", () => this._clearActive(idx));
                        this._listen(itemEl, "mousedown", e => e.preventDefault());
                        const twoLineHandler = this._makeTouchHandler(() => { item.action(); if(!item.keepOpen)this._hideDropdown(); });
                        this._listen(itemEl, "touchstart", twoLineHandler.onTouchStart, { passive: true });
                        this._listen(itemEl, "touchend", twoLineHandler.onTouchEnd);
                        this._listen(itemEl, "click", () => { item.action(); if(!item.keepOpen)this._hideDropdown(); });
                    } else {
                        // ── 普通 item ──────────────────────────────────────────
                        itemEl.setCssStyles({
                            display: "flex", alignItems: "center",
                            justifyContent: "space-between",
                            padding: "7px 14px", minHeight: "36px"
                        });
                        const labelEl = itemEl.createSpan({cls:'primecore-result-title-text'});
                        labelEl.setCssStyles({
                            fontSize: "13px", color: "var(--text-normal)",
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
                        const normalItemHandler = this._makeTouchHandler(() => { item.action(); if(!item.keepOpen)this._hideDropdown(); });
                        this._listen(itemEl, "touchstart", normalItemHandler.onTouchStart, { passive: true });
                        this._listen(itemEl, "touchend", normalItemHandler.onTouchEnd);
                        this._listen(itemEl, "click", () => { item.action(); if(!item.keepOpen)this._hideDropdown(); });
                    }

                    if(item.path) {
                        const target=item.elementHit?itemEl.querySelector<HTMLElement>('.primecore-element-source-row'):item.hits?itemEl.firstElementChild as HTMLElement:itemEl;
                        const filter=this._addQuickFilterButton(target,item.path);filter.buttonEl.addClass('primecore-result-exclusion-button');
                    }
                    this._itemEls.push(itemEl);
                }

                // ── 分组分页栏（与历史视图共用 _mkPagerBar）────────────────────
                // 注意：多个分组各有分页栏时不能都 sticky，否则会在同一滚动容器底部互相叠压，
                // 故分组内联展示（样式与历史分页栏一致），仅历史视图用 sticky。
                if (totalGroupPages > 1) {
                    const _goGroupPage = (newPage: number) => { this._groupPages.set(groupKey, newPage); this._renderDropdown(allGroups); };
                    this._mkPagerBar(this._dropdownInner, {
                        page: groupPage,
                        totalPages: totalGroupPages,
                        pageSize,
                        sticky: groups.length===1,
                        onSize: (n) => { this._dropdownPageSize = n; this._groupPages.clear();this._renderDropdown(allGroups); },
                        onPage: _goGroupPage,
                        onPrev: () => _goGroupPage(groupPage - 1),
                        onNext: () => _goGroupPage(groupPage + 1)
                    });
                }
            }

            this._syncContentExpandButton();
            this._showDropdown();
        }

_toggleAllContentHits(): void {
            const expand = this._contentHitControls.some(control => !control.isExpanded());
            for (const control of this._contentHitControls) control.setExpanded(expand);
            this._syncContentExpandButton();
        }

_syncContentExpandButton(): void {
            const button = this._contentExpandBtn;
            if (!button) return;
            const count = this._contentHitControls.length;
            if (!count) {
                button.setCssStyles({display: 'none'});
                return;
            }
            const allExpanded = this._contentHitControls.every(control => control.isExpanded());
            this._contentAllExpanded = allExpanded;
            if(this._resultCategory==='markdown')this._markdownExpanded=allExpanded;
            button.setCssStyles({display: 'flex'});
            const icon = allExpanded
                ? (getIcon('fold-vertical') ? 'fold-vertical' : 'chevrons-up-down')
                : (getIcon('unfold-vertical') ? 'unfold-vertical' : 'chevrons-down-up');
            this._setIcon(button, icon, 13);
            const source = this._resultCategory === 'tags' ? '标签匹配' : '内容匹配';
            const label = `${allExpanded ? '收起' : '展开'}全部${source}`;
            button.title = label;
            button.setAttribute('aria-label', label);
        }

_setActive(idx: number): void {
            this._clearActiveAll();
            this._activeIdx = idx;
            if (this._itemEls[idx]) {
                this._itemEls[idx].setCssStyles({background: "var(--background-modifier-hover)"});
            }
        }

_clearActive(idx: number): void {
            if (this._activeIdx === idx) this._activeIdx = -1;
            if (this._itemEls[idx]) this._itemEls[idx].setCssStyles({background: "transparent"});
        }

_clearActiveAll(): void {
            this._itemEls.forEach(el => { el.setCssStyles({background: "transparent"}); });
            this._activeIdx = -1;
        }

_handleKey(e: KeyboardEvent): void {
            if(e.isComposing)return;
            if(this._dispatchShortcut(e))return;
            if(e.altKey||e.ctrlKey||e.metaKey)return;
            if(this.presentation==='page'&&this._resultKind==='results'&&e.key==='Enter'&&this._activeIdx<0) {e.preventDefault();this._executeSearch();return;}
            if (this._dropdown.style.display === "none") {
                if (e.key === "Enter") { e.preventDefault(); this._executeSearch(); }
                return;
            }
            if (e.key === "ArrowDown") {
                if(e.altKey||e.ctrlKey||e.metaKey||e.shiftKey||!this._itemEls.length)return;
                e.preventDefault();
                this._moveResultSelection(1);
            } else if (e.key === "ArrowUp") {
                if(e.altKey||e.ctrlKey||e.metaKey||e.shiftKey||!this._itemEls.length)return;
                e.preventDefault();
                this._moveResultSelection(-1);
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
