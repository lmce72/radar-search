import * as Obsidian from 'obsidian';
import type {TFile} from 'obsidian';
import type {SearchBarCtor, FuzzyFn} from '../ui/search-bar-host.ts';
import type {SearchGroup, SearchItem, ContentMatch} from '../types.ts';
import {toText} from '../shared/text.ts';

// One cohesive behavior; shared state belongs to SearchBarComponent.
export const withGlobalSearch = <T extends SearchBarCtor>(Base: T) => class extends Base {
async _searchGlobal(q: string): Promise<void> {
            const ver = ++this._vaultSearchVer;
            // Vault 侧分组随阶段推进刷新；web 建议词到达时并入同一份下拉（Vault 分组在前）
            let vaultGroups: SearchGroup[] | null = null;
            const webSlots: SearchGroup[] = [];
            const _renderMerged = () => {
                if (this._isVaultStale(ver)) return;
                const groups = [...(vaultGroups || []), ...webSlots.filter(Boolean)];
                this._renderDropdown(groups);
            };
            try {
                const isExcluded=this._excludedPredicate();
                // 先发起 web 请求：全局 = vault 内外结合体，Vault 侧结果稍后到达时再合并渲染
                const _webEngines = this._resolveWebEngines();
                if (_webEngines.length > 0) {
                    this._buildWebGroups(
                        q,
                        _webEngines,
                        () => this._isVaultStale(ver),
                        (ready) => { webSlots.length = 0; webSlots.push(...ready); _renderMerged(); }
                    );
                }

                const lq    = q.toLowerCase();
                const terms = lq.split(/\s+/).filter(Boolean);

                let _fuzzyFn: FuzzyFn | null = null;
                try {
                    const { prepareFuzzySearch } = Obsidian;
                    _fuzzyFn = prepareFuzzySearch(q);
                } catch { /* fuzzy search is optional */ }

                // fuzzy 同时检查 basename 和完整路径，避免仅查 basename 遗漏深层路径命中
                const nameMatch = (f: TFile) => {
                    if (_fuzzyFn) return !!_fuzzyFn(f.basename) || !!_fuzzyFn(f.path);
                    return terms.every(t => f.basename.toLowerCase().includes(t) || f.path.toLowerCase().includes(t));
                };

                // ── 阶段 1：文件名/路径匹配 ──
                // 全局模式不套用排除目录，但同样交由引擎打分排序（未就绪则回落 fuzzy 扫描）
                // Global mode does not apply folder exclusions, but still hands ranking to the
                // engine; the fuzzy scan remains the fallback until it is ready.
                const engRes  = this._indexQuery(q);
                const engRows = engRes ? engRes.results : null;
                let nameRows  = engRows ? engRows.filter(r => r.isNameMatch).slice(0, 30) : null;
                // 用户显式选了非「相关度」的排序时，仍按该排序重排引擎给出的候选集 —— 候选由引擎
                // 决定（这是速度与精度的来源），但排序控件的 6 种语义不能被引擎路径悄悄吃掉。
                // When the user picked one of the six legacy sort modes, re-sort the engine's
                // candidates by it: the engine picks the candidates, but the sort control must not
                // silently stop working just because the index is ready.
                if (nameRows && this._vaultSortMode && this._vaultSortMode !== "relevance") {
                    const rowFiles = nameRows.map(r => this.app.vault.getAbstractFileByPath(r.path)).filter((f): f is Obsidian.TFile => f instanceof Obsidian.TFile);
                    const byPath = new Map(nameRows.map(r => [r.path, r]));
                    nameRows = this._sortFiles(rowFiles, this._vaultSortMode).map(f => byPath.get(f.path)).filter(Boolean);
                }

                let files: TFile[] = [];
                if (!engRows) {
                    files = this._getSearchableFiles().filter(f=>!isExcluded(f.path)).filter(nameMatch).slice(0, 20);
                    files = this._sortFiles(files, this._vaultSortMode);
                }

                // 标签匹配
                const tagMatches: TFile[] = [];
                // 检测用户是否输入 #tag 格式（专项标签搜索）
                const isHashTagQuery = q.trim().startsWith("#");
                const shouldSearchTags = this._searchTags || isHashTagQuery;

                if (shouldSearchTags) {
                    try {
                        // 提取标签关键词：#tag 格式去掉 #，普通查询保留原样
                        const tagQuery = isHashTagQuery ? q.trim().slice(1) : q;
                        const tagTerms = tagQuery.toLowerCase().split(/\s+/).filter(Boolean);

                        const allFiles = this.app.vault.getMarkdownFiles().filter(f=>!isExcluded(f.path));
                        for (const f of allFiles) {
                            const cache = this.app.metadataCache.getFileCache(f);

                            // Tags are independent of filename and property matches.
                            const frontmatter = (cache?.frontmatter || {}) as Record<string, unknown>;
                            const tags: unknown[] = [
                                ...(Array.isArray(frontmatter.tags) ? frontmatter.tags as unknown[] : frontmatter.tags ? [frontmatter.tags] : []),
                                ...(Array.isArray(frontmatter.tag) ? frontmatter.tag as unknown[] : frontmatter.tag ? [frontmatter.tag] : []),
                                ...(cache?.tags?.map(t => t.tag) || [])
                            ];

                            // 标签匹配逻辑
                            const hasTagMatch = tags.some(t => {
                                const tagStr = toText(t).toLowerCase().replace(/^#/, "");
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

                vaultGroups = [{ title: "Vault 文件", items: nameItems }];
                _renderMerged();

                // ── 阶段 1.5：专项搜索 ──
                const specialGroups: SearchGroup[] = [];

                // 标签匹配分组（独立展示）
                if (shouldSearchTags && tagMatches.length > 0) {
                    const tagItems: SearchItem[] = tagMatches.map(f => ({
                        path:f.path,label: f.basename,
                        sub: f.parent?.path || "/",
                        terms,
                        twoLine: true,
                        icon: this._fileIconName(f),
                        action: () => this._openVaultResult(f.path, f.basename)
                    }));
                    specialGroups.push({ title: "标签匹配", items: tagItems });
                }

                if (this._searchWikiLinks) {
                    const wikiItems: SearchItem[] = [];
                    for (const f of this.app.vault.getMarkdownFiles().filter(f=>!isExcluded(f.path))) {
                        const links = this.app.metadataCache.getFileCache(f)?.links || [];
                        const hit   = links.find(l => _fuzzyFn ? !!_fuzzyFn(l.link) : terms.every(t => l.link.toLowerCase().includes(t)));
                        if (hit) {
                            wikiItems.push({ path:f.path,label: f.basename, sub: `链接: ${hit.link}`, twoLine: true, icon: this._fileIconName(f), action: () => this._openVaultResult(f.path, f.basename) });
                            if (wikiItems.length >= 5) break;
                        }
                    }
                    if (wikiItems.length > 0) specialGroups.push({ title: "内链匹配", items: wikiItems });
                }

                if (this._searchMdLinks) {
                    const mdItems = await this._buildExternalLinkItems(terms, _fuzzyFn, isExcluded, () => this._isVaultStale(ver));
                    if (mdItems.length > 0) specialGroups.push({ title: "外链匹配", items: mdItems });
                }

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

                    vaultGroups = [{ title: "Vault 文件", items: nameItems }, ...specialGroups];
                    _renderMerged();
                }

                if (!this._contentSearch) return;

                // ── 阶段 2：内容搜索 ──
                const maxResults = this._limitContentResults
                    ? (Number(this.cfg.vaultContentSearchMaxResults) || 30)
                    : undefined;
                const ctxLen = this._extendedContext ? 80 : 35;

                let contentItems: SearchItem[];
                // See vault-search: no content index means no engine content hits.
                if (engRows && this.cfg.searchIndex?.content !== false) {
                    // 引擎已按相关度给出内容命中：只对将展示的少数几篇读正文取摘要
                    const contentRows = engRows.filter(r => r.isContentMatch);
                    const cap = maxResults !== undefined ? maxResults : 60;
                    contentItems = await this._contentItemsFromEngine(contentRows.slice(0, cap), terms, ctxLen, ver);
                } else {
                    const candidates = this.app.vault.getMarkdownFiles().filter(f=>!isExcluded(f.path));

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
                                    onMatch: (hit: ContentMatch) => this._openContentResult(f.path, f.basename, hit),
                                    icon: this._fileIconName(f),
                                    action: () => this._openVaultResult(f.path, f.basename)
                                };
                            }
                        } catch (e) {
                            this._log("warn", `[SearchBar] _searchGlobal 内容读取失败 (${f.path}):`, e);
                        }
                        return null;
                    });

                    const allContentItems = (await Promise.all(reads)).filter(Boolean);
                    contentItems = maxResults !== undefined ? allContentItems.slice(0, maxResults) : allContentItems;
                }
                if (this._isVaultStale(ver)) return;

                vaultGroups = [{ title: "Vault 文件", items: nameItems }, ...specialGroups];
                if (contentItems.length > 0) vaultGroups.push({ title: "内容匹配", items: contentItems });
                _renderMerged();

            } catch (e) {
                this._log("error", "[SearchBar] _searchGlobal 失败:", e);
            }
        }
};
