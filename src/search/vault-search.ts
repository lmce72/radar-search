import * as Obsidian from 'obsidian';
import type {TFile} from 'obsidian';
import type {SearchBarCtor, FuzzyFn} from '../ui/search-bar-host.ts';
import type {SearchGroup, SearchItem} from '../types.ts';
import {proximityScore} from './proximity.ts';

// One cohesive behavior; shared state belongs to SearchBarComponent.
export const withVaultSearch = <T extends SearchBarCtor>(Base: T) => class extends Base {
async _searchVault(q: string): Promise<void> {
            const ver = ++this._vaultSearchVer;
            try {
                // 预设覆盖 excludePaths（判定抽到 _excludedPredicate，索引过滤共用同一份）
                const isExcluded = this._excludedPredicate();

                const lq    = q.toLowerCase();
                const terms = lq.split(/\s+/).filter(Boolean);

                // 尝试使用 Obsidian prepareFuzzySearch（字符级模糊匹配）
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
                    const rowFiles = nameRows.map(r => this.app.vault.getAbstractFileByPath(r.path)).filter((f): f is Obsidian.TFile => f instanceof Obsidian.TFile);
                    const byPath = new Map(nameRows.map(r => [r.path, r]));
                    nameRows = this._sortFiles(rowFiles, this._vaultSortMode).map(f => byPath.get(f.path)).filter(Boolean);
                }

                let files: TFile[] = [];
                if (!engRows) {
                    files = this._getSearchableFiles().filter(f=>!isExcluded(f.path)).filter(nameMatch);
                    if(this._vaultSortMode==='relevance') {
                        const ranked=files.map(file=>({file,score:proximityScore(`${file.basename} ${file.path}`,terms)}))
                            .sort((a,b)=>b.score-a.score);
                        files=ranked.slice(0,20).map(entry=>entry.file);
                    } else {
                        files=this._sortFiles(files.slice(0,20),this._vaultSortMode);
                    }
                }

                const nameItems = engRows ? this._itemsFromEngineHits(nameRows, terms) : files.map(f => ({
                    path:f.path,label: this._fileLabel(f),
                    sub: f.parent?.path || "/",
                    terms,
                    twoLine: true,
                    score: proximityScore(`${f.basename} ${f.path}`, terms),
                    icon: this._fileIconName(f),
                    action: () => this._openVaultResult(f.path, this._fileLabel(f))
                }));

                if (this._isVaultStale(ver)) return;

                this._renderDropdown([{ title: "Vault 文件", items: nameItems }]);

                // ── 阶段 1.5：专项搜索（metadataCache，同步）──
                const specialGroups: SearchGroup[] = [];

                // 标签与内容共享结果构建、分页和位置跳转。 / Share tag/content rows, pagination and navigation.
                if (this._searchTags || q.trim().startsWith('#')) {
                    const tagItems = await this._buildTagItems(q, isExcluded, () => this._isVaultStale(ver));
                    if (this._isVaultStale(ver)) return;
                    if (tagItems.length) specialGroups.push({ title: '标签匹配', items: tagItems });
                }

                // 内部链接匹配
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

                // 可见与隐藏命令统一排序，行=执行，行尾按钮=复制 ID。
                // Rank visible and hidden commands together; rows execute, trailing buttons copy IDs.
                if (this._searchCommands) {
                    const cmdItems = this._buildCommandItems(q, terms, _fuzzyFn);
                    if (cmdItems.length > 0) specialGroups.push({ title: "命令匹配", items: cmdItems });
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

                let contentItems: SearchItem[];
                // When content indexing is off the engine has no content scores; fall back
                // to the live scan instead of returning an empty 内容匹配 group.
                if (engRows && this.cfg.searchIndex?.content !== false) {
                    // 引擎已按相关度给出内容命中：只对将展示的少数几篇读正文取摘要
                    // Engine ranks the content hits; full text is read only for those displayed.
                    const contentRows = engRows.filter(r => r.isContentMatch);
                    const cap = maxResults !== undefined ? Math.max(maxResults, 80) : 80;
                    contentItems = await this._contentItemsFromEngine(contentRows.slice(0, cap), terms, ctxLen, ver);
                    if(maxResults !== undefined) contentItems = contentItems.slice(0, maxResults);
                } else {
                    const candidates = this.app.vault.getMarkdownFiles()
                        .filter(f=>!isExcluded(f.path));

                    const reads = candidates.map(async (f) => {
                        try {
                            const text    = await this.app.vault.cachedRead(f);
                            if (this._isVaultStale(ver)) return null;
                            const textLow = text.toLowerCase();
                            if (terms.every(t => textLow.includes(t))) {
                                return this._buildMatchItem(f, terms, this._extractAllSnippets(text, terms, ctxLen), proximityScore(text, terms));
                            }
                        } catch (e) {
                            this._log("warn", `[SearchBar] _searchVault 内容读取失败 (${f.path}):`, e);
                        }
                        return null;
                    });

                    const loaded = await Promise.all(reads);
                    const allContentItems: SearchItem[] = [];
                    for (const item of loaded) if (item) allContentItems.push(item);
                    allContentItems.sort((a,b)=>(b.score??0)-(a.score??0));
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
