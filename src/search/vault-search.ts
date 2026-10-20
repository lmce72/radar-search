import * as Obsidian from 'obsidian';
import { moment } from '../shared/moment.ts';
import { SHEET_BREAKPOINT, MIN_PANEL_H, PILL_ICON_SIZE, EXT_ICON } from '../shared/constants.ts';
import { IconRenderer } from '../shared/icons.ts';
import { makeTouchHandler } from '../shared/touch.ts';

// One cohesive behavior; shared state belongs to SearchBarComponent.
export const withVaultSearch = Base => class extends Base {
async _searchVault(q) {
            const document = this.container.ownerDocument;
            const window = document.defaultView;
            const getComputedStyle = window.getComputedStyle.bind(window);
            const requestAnimationFrame = window.requestAnimationFrame.bind(window);
            const cancelAnimationFrame = window.cancelAnimationFrame.bind(window);

            const ver = ++this._vaultSearchVer;
            try {
                // 预设覆盖 excludePaths（判定抽到 _excludedPredicate，索引过滤共用同一份）
                const isExcluded = this._excludedPredicate();

                const lq    = q.toLowerCase();
                const terms = lq.split(/\s+/).filter(Boolean);

                // 尝试使用 Obsidian prepareFuzzySearch（字符级模糊匹配）
                let _fuzzyFn = null;
                try {
                    const { prepareFuzzySearch } = Obsidian;
                    _fuzzyFn = prepareFuzzySearch(q);
                } catch (_) { /* fuzzy search is optional */ }

                // fuzzy 同时检查 basename 和完整路径，避免仅查 basename 遗漏深层路径命中
                const nameMatch = f => {
                    if (_fuzzyFn) return !!_fuzzyFn(f.basename) || !!_fuzzyFn(f.path);
                    return terms.every(t => f.basename.toLowerCase().includes(t) || f.path.toLowerCase().includes(t));
                };
                const tagMatch = (t) => {
                    if (_fuzzyFn) return !!_fuzzyFn(String(t));
                    return terms.every(t2 => String(t).toLowerCase().includes(t2));
                };

                // ── 阶段 1：文件名/路径匹配 ──
                // 引擎就绪时由它打分排序（BM25 + 字段权重）；未就绪/未启用时原样走 fuzzy 扫描，
                // 于是索引构建期间与关闭索引时的行为与旧版逐字一致（可随时回退）。
                // With the engine ready this phase is scored and ranked by BM25; otherwise the
                // original fuzzy scan runs unchanged, so the build window and a disabled index
                // behave exactly like the previous version.
                const engRes  = this._indexQuery(q);
                const engRows = engRes ? engRes.results : null;
                let nameRows  = engRows ? engRows.filter(r => r.isNameMatch).slice(0, 30) : null;
                // 用户显式选了非「相关度」的排序时，仍按该排序重排引擎给出的候选集 —— 候选由引擎
                // 决定（这是速度与精度的来源），但排序控件的 6 种语义不能被引擎路径悄悄吃掉。
                // When the user picked one of the six legacy sort modes, re-sort the engine's
                // candidates by it: the engine picks the candidates, but the sort control must not
                // silently stop working just because the index is ready.
                if (nameRows && this._vaultSortMode && this._vaultSortMode !== "relevance") {
                    const rowFiles = nameRows.map(r => this.app.vault.getAbstractFileByPath(r.path)).filter(Boolean);
                    const byPath = new Map(nameRows.map(r => [r.path, r]));
                    nameRows = this._sortFiles(rowFiles, this._vaultSortMode).map(f => byPath.get(f.path)).filter(Boolean);
                }

                let files = [];
                if (!engRows) {
                    files = this._getSearchableFiles()
                        .filter(f => !isExcluded(f))
                        .filter(nameMatch)
                        .slice(0, 20);

                    files = this._sortFiles(files, this._vaultSortMode);
                }

                // 标签匹配（metadataCache，比 dv.page 更快）
                const tagMatches = [];
                // 检测用户是否输入 #tag 格式（专项标签搜索）
                const isHashTagQuery = q.trim().startsWith("#");
                const shouldSearchTags = this._searchTags || isHashTagQuery;

                if (shouldSearchTags) {
                    try {
                        // 提取标签关键词：#tag 格式去掉 #，普通查询保留原样
                        const tagQuery = isHashTagQuery ? q.trim().slice(1) : q;
                        const tagTerms = tagQuery.toLowerCase().split(/\s+/).filter(Boolean);

                        const allFiles = this.app.vault.getMarkdownFiles().filter(f => !isExcluded(f));
                        for (const f of allFiles) {
                            const cache = this.app.metadataCache.getFileCache(f);

                            // Tags are independent of filename and property matches.
                            const tags  = [
                                ...(Array.isArray(cache?.frontmatter?.tags) ? cache.frontmatter.tags : cache?.frontmatter?.tags ? [cache.frontmatter.tags] : []),
                                ...(Array.isArray(cache?.frontmatter?.tag)  ? cache.frontmatter.tag  : cache?.frontmatter?.tag  ? [cache.frontmatter.tag]  : []),
                                ...(cache?.tags?.map(t => t.tag) || [])
                            ];

                            // 标签匹配逻辑
                            const hasTagMatch = tags.some(t => {
                                const tagStr = String(t).toLowerCase().replace(/^#/, "");
                                return tagTerms.every(term => tagStr.includes(term));
                            });

                            if (hasTagMatch) {
                                tagMatches.push(f);
                                if (tagMatches.length >= 8) break;
                            }
                        }
                    } catch (e) {
                        this._log("warn", "[SearchBar] 标签搜索失败:", e);
                    }
                }


                // 将标签匹配单独分组（仅在专项搜索开启或 #tag 格式时）
                const nameItems = engRows ? this._itemsFromEngineHits(nameRows, terms) : files.map(f => ({
                    path:f.path,label: this._fileLabel(f),
                    sub: f.parent?.path || "/",
                    terms,
                    twoLine: true,
                    icon: this._fileIconName(f),
                    action: () => this._openVaultResult(f.path, this._fileLabel(f))
                }));

                if (this._isVaultStale(ver)) return;

                this._renderDropdown([{ title: "Vault 文件", items: nameItems }]);

                // ── 阶段 1.5：专项搜索（metadataCache，同步）──
                const specialGroups = [];

                // 标签匹配分组（独立展示）
                if (shouldSearchTags && tagMatches.length > 0) {
                    const tagItems = tagMatches.map(f => ({
                        path:f.path,label: f.basename,
                        sub: f.parent?.path || "/",
                        terms,
                        twoLine: true,
                        icon: this._fileIconName(f),
                        action: () => this._openVaultResult(f.path, f.basename)
                    }));
                    specialGroups.push({ title: "标签匹配", items: tagItems });
                }

                // 内部链接匹配
                if (this._searchWikiLinks) {
                    const wikiItems = [];
                    for (const f of this.app.vault.getMarkdownFiles().filter(f => !isExcluded(f))) {
                        const links = this.app.metadataCache.getFileCache(f)?.links || [];
                        const hit   = links.find(l => _fuzzyFn ? !!_fuzzyFn(l.link) : terms.every(t => l.link.toLowerCase().includes(t)));
                        if (hit) {
                            wikiItems.push({ path:f.path,label: f.basename, sub: `链接: ${hit.link}`, twoLine: true, icon: this._fileIconName(f), action: () => this._openVaultResult(f.path, f.basename) });
                            if (wikiItems.length >= 5) break;
                        }
                    }
                    if (wikiItems.length > 0) specialGroups.push({ title: "内链匹配", items: wikiItems });
                }

                // 外部链接匹配
                if (this._searchMdLinks) {
                    const mdItems = await this._buildExternalLinkItems(terms, _fuzzyFn, isExcluded, () => this._isVaultStale(ver));
                    if (mdItems.length > 0) specialGroups.push({ title: "外链匹配", items: mdItems });
                }

                // 书签匹配（共享实现，按书签类型打开）
                if (this._searchBookmarks) {
                    const bmItems = await this._buildBookmarkItems(terms, _fuzzyFn, isExcluded);
                    if (bmItems.length > 0) specialGroups.push({ title: "书签匹配", items: bmItems });
                }

                // 属性匹配（YAML frontmatter）：副标题显示命中的「键: 值」
                if (this._searchProperties) {
                    const propItems = this._buildPropertyItems(q, terms, _fuzzyFn);
                    if (propItems.length > 0) specialGroups.push({ title: "属性匹配", items: propItems });
                }

                // 命令匹配（命令面板搜索）：行=执行，行尾按钮=复制命令 id
                // 同时搜「隐藏命令」（当前不可用、只存在于注册表里的命令，如编辑模式专属的 editor:*）
                if (this._searchCommands) {
                    const cand = this._commandCandidates();
                    const cmdItems = this._buildCommandItems(q, terms, _fuzzyFn, 8, cand.visible);
                    if (cmdItems.length > 0) specialGroups.push({ title: "命令匹配", items: cmdItems });
                    const hiddenItems = this._buildCommandItems(q, terms, _fuzzyFn, 8, cand.hidden);
                    if (hiddenItems.length > 0) specialGroups.push({ title: "隐藏命令", items: hiddenItems });
                }

                if (specialGroups.length > 0) {
                    if (this._isVaultStale(ver)) return;

                    this._renderDropdown([{ title: "Vault 文件", items: nameItems }, ...specialGroups]);
                }

                if (!this._contentSearch) return;

                // ── 阶段 2：内容搜索（异步追加）──
                const maxResults = this._limitContentResults
                    ? (Number(this.cfg.vaultContentSearchMaxResults) || 30)
                    : undefined;
                const ctxLen = this._extendedContext ? 80 : 35;

                let contentItems;
                // When content indexing is off the engine has no content scores; fall back
                // to the live scan instead of returning an empty 内容匹配 group.
                if (engRows && this.cfg.searchIndex?.content !== false) {
                    // 引擎已按相关度给出内容命中：只对将展示的少数几篇读正文取摘要
                    // Engine ranks the content hits; full text is read only for those displayed.
                    const contentRows = engRows.filter(r => r.isContentMatch);
                    const cap = maxResults !== undefined ? maxResults : 60;
                    contentItems = await this._contentItemsFromEngine(contentRows.slice(0, cap), terms, ctxLen, ver);
                } else {
                    const candidates = this.app.vault.getMarkdownFiles()
                        .filter(f => !isExcluded(f));

                    const reads = candidates.map(async (f) => {
                        try {
                            const text    = await this.app.vault.cachedRead(f);
                            if (this._isVaultStale(ver)) return null;
                            const textLow = text.toLowerCase();
                            if (terms.every(t => textLow.includes(t))) {
                                return {
                                    path:f.path,label: f.basename,
                                    sub: f.parent?.path || "/",
                                    terms,
                                    hits: this._extractAllSnippets(text, terms, ctxLen),
                                    onMatch: hit => this._openContentResult(f.path, f.basename, hit),
                                    icon: this._fileIconName(f),
                                    action: () => this._openVaultResult(f.path, f.basename)
                                };
                            }
                        } catch (e) {
                            this._log("warn", `[SearchBar] _searchVault 内容读取失败 (${f.path}):`, e);
                        }
                        return null;
                    });

                    const allContentItems = (await Promise.all(reads)).filter(Boolean);
                    contentItems = maxResults !== undefined ? allContentItems.slice(0, maxResults) : allContentItems;
                }
                if (this._isVaultStale(ver)) return;

                const allGroups = [{ title: "Vault 文件", items: nameItems }, ...specialGroups];
                if (contentItems.length > 0) allGroups.push({ title: "内容匹配", items: contentItems });
                this._renderDropdown(allGroups);

            } catch (e) {
                this._log("error", "[SearchBar] _searchVault 失败:", e);
            }
        }
};
