import {toText} from '../shared/text.ts';
import {splitTagQuery,hasQueryTags} from './query.ts';
import {matchesAttachmentTypes} from './attachment-types.ts';
import * as Obsidian from 'obsidian';
import type {SearchBarCtor, BookmarkItem, FuzzyFn} from '../ui/search-bar-host.ts';
import type {SearchItem} from '../types.ts';
import {TFile, type Command} from 'obsidian';
import {EXT_ICON} from '../shared/constants.ts';
import {markdownQuery,extractMarkdownMatches} from './markdown-matches.ts';
import {buildWikiLinkResultItems,buildExternalLinkResultItems} from './link-items.ts';
import {rankCommandCandidates} from './command-matches.ts';
import {matchingTagEntries,tagQueryTerms,extractTagMatches,type TagEntry} from './tag-matches.ts';

// One cohesive behavior; shared state belongs to SearchBarComponent.
export const withMetadataSearch = <T extends SearchBarCtor>(Base: T) => class extends Base {
async _buildMarkdownItems(query:string,isExcluded:(path:string)=>boolean,isStale:()=>boolean):Promise<SearchItem[]> {
            const items:SearchItem[]=[];
            const parsed=splitTagQuery(query);
            for(const file of this.app.vault.getMarkdownFiles()) {
                if(isStale())return [];
                if(isExcluded(file.path)||!hasQueryTags(matchingTagEntries(this.app.metadataCache.getFileCache(file),[]).map(tag=>tag.value),parsed.tags))continue;
                try {
                    const text=await this.app.vault.cachedRead(file);
                    if(isStale())return [];
                    const hits=extractMarkdownMatches(text,parsed.text,this._extendedContext?80:35,this.cfg.markdownElementTypes);
                    if(hits.length)items.push(this._buildMatchItem(file,markdownQuery(parsed.text).terms,hits));
                } catch(error) {this._log('warn','Markdown 元素读取失败',error);}
            }
            return items;
        }
async _buildTagItems(query:string,isExcluded:(path:string)=>boolean,isStale:()=>boolean):Promise<SearchItem[]> {
            // 标签是否存在仍由元数据判定；正文只用于定位与展开后的摘要。
            // Metadata still decides tag membership; the source text only locates hits and builds excerpts.
            const terms=tagQueryTerms(query);
            const candidates:{file:TFile;entries:TagEntry[]}[]=[];
            for(const file of this.app.vault.getMarkdownFiles()) {
                if(isStale())return [];
                if(isExcluded(file.path))continue;
                const entries=matchingTagEntries(this.app.metadataCache.getFileCache(file),terms);
                if(entries.length)candidates.push({file,entries});
            }
            const ctxLen=this._extendedContext?80:35;
            // 与内容搜索一致：并行读取候选文件，保持文件顺序（可预测的分页顺序）。
            // Parallel reads like content search; Promise.all keeps the candidate order stable.
            const built=await Promise.all(candidates.map(async ({file,entries})=>{
                try {
                    const content=await this.app.vault.cachedRead(file);
                    if(isStale())return null;
                    const hits=extractTagMatches(content,entries,Obsidian.getFrontMatterInfo(content),ctxLen);
                    return hits.length?this._buildTagItem(file,hits):null;
                } catch(error) {
                    this._log('warn',`[SearchBar] 标签定位失败 (${file.path}):`,error);
                    return null;
                }
            }));
            if(isStale())return [];
            const documents=built.filter((item):item is SearchItem=>item!==null);
            if(this.cfg.tagResultMode==='documents')return documents;
            const tags=new Map<string,{label:string;files:SearchItem[]}>();
            for(const document of documents){
              for(const value of new Map(document.hits.map(hit=>hit.tag?.value.replace(/^#/,'')).filter(Boolean).map(value=>[value.toLowerCase(),value])).values()){
                const key=value.toLowerCase(),group=tags.get(key)||{label:'#'+value,files:[]};
                group.files.push({...document,hits:document.hits.filter(hit=>hit.tag?.value.replace(/^#/,'').toLowerCase()===key)});tags.set(key,group);
              }
            }
            return [...tags.values()].sort((a,b)=>a.label.localeCompare(b.label)).map(group=>({label:group.label,icon:'tag',sub:group.files.length+' 篇关联文档',children:group.files,action:()=>{}}));
        }
/** Link searches return the links themselves; content matches belong to Markdown element search.
 *  链接搜索返回链接本身；正文层面的匹配交给 Markdown 元素搜索。 */
_buildWikiLinkItems(terms: string[], fuzzy: FuzzyFn | null, isExcluded: (path: string) => boolean): SearchItem[] {
            return buildWikiLinkResultItems(this,terms,fuzzy,isExcluded);
        }
async _buildExternalLinkItems(terms: string[], fuzzy: FuzzyFn | null, isExcluded: (path: string) => boolean, isStale: () => boolean): Promise<SearchItem[]> {
            return buildExternalLinkResultItems(this,terms,fuzzy,isExcluded,isStale);
        }
_getSearchableFiles(): TFile[] {
            try {
                return this._searchNonMarkdown ? this.app.vault.getFiles().filter(file=>file.extension.toLowerCase()==='md'||matchesAttachmentTypes(file.path,this.cfg.attachmentFileTypes||[])) : this.app.vault.getMarkdownFiles();
            } catch (e) {
                this._log("error", "[SearchBar] _getSearchableFiles 失败:", e);
                return this.app.vault.getMarkdownFiles();
            }
        }

_fileLabel(f: TFile): string {
            try { return f.extension === "md" ? f.basename : f.name; } catch { return f.basename; }
        }

_bookmarkIconName(item: BookmarkItem): string {
            const TYPE_ICONS: Record<string, string> = { folder:"folder", url:"external-link", graph:"git-fork", search:"file-search", group:"folder-tree" };
            try {
                if (item && TYPE_ICONS[item.type]) return TYPE_ICONS[item.type];
                if (item && item.path) {
                    const f = this.app.vault.getAbstractFileByPath(String(item.path));
                    if (f instanceof TFile) return this._fileIconName(f);
                }
            } catch (e) {
                this._log("warn", "[SearchBar] 解析书签图标失败:", e);
            }
            return "bookmark";
        }

_bookmarkSub(item: BookmarkItem): string {
            if (!item) return "";
            if (item.type === "url") return String(item.url || "");
            if (item.type === "search") return String(item.query || "搜索");
            if (item.type === "graph") return "图谱";
            return String(item.path || "");
        }

_bookmarkTitle(item: BookmarkItem): string {
            return String(item?.title || item?.path || item?.url || item?.query || "");
        }

async _buildBookmarkItems(terms: string[], fuzzy: FuzzyFn | null, isExcluded: (path: string) => boolean, limit = 5): Promise<SearchItem[]> {
            const items: SearchItem[] = [];
            try {
                const bm = this._getBookmarksInstance();
                if (!bm) return items;
                for (const item of this._flattenBookmarks(bm.items || [])) {
                    // Groups are containers, not destinations; their children are flattened too.
                    if (item.type === "group") continue;
                    if (item.path && isExcluded(item.path)) continue;
                    const title = this._bookmarkTitle(item);
                    if (!title) continue;
                    const match = fuzzy ? !!fuzzy(title) : terms.every(term => title.toLowerCase().includes(term));
                    if (!match) continue;
                    items.push({
                        path:item.path, label:title, sub:this._bookmarkSub(item),
                        twoLine:true, icon:this._bookmarkIconName(item),
                        action: () => this._openBookmarkResult(item, title)
                    });
                    if (items.length >= limit) break;
                }
            } catch (e) {
                this._log("warn", "[SearchBar] 书签搜索失败:", e);
            }
            return items;
        }

_openBookmarkResult(item: BookmarkItem, title: string) {
            const path = String(item?.path || "");
            // Plain file bookmarks keep the same history + navigation path as file results;
            // a stale target must not create a stray note via openLinkText.
            if (item?.type === "file" || (!item?.type && path)) {
                if (!path || !(this.app.vault.getAbstractFileByPath(path) instanceof TFile)) {
                    this._log("warn", "[SearchBar] 书签目标不存在:", path);
                    return;
                }
                if(!item.subpath){this._openVaultResult(path, title);return;}
            }
            this._recordHistory(title,undefined,{kind:'bookmark',bookmark:item});
            // Let Obsidian's bookmark plugin handle folder/url/graph/search/group types;
            // openLinkText would create a stray note for folder bookmarks.
            const bm = this._getBookmarksInstance();
            if (bm && typeof bm.openBookmark === "function") {
                this.plugin.floatingSearch?.close();
                try { void Promise.resolve(bm.openBookmark(item)).catch(error=>this._log('error','打开书签失败:',error)); }
                catch (error) { this._log("error", "[SearchBar] 打开书签失败:", error); }
                return;
            }
            // Preserve heading/block navigation even if the optional bookmark API is absent.
            // 可选书签接口不可用时，仍保留标题与块位置。
            if(item.subpath&&path){
                const file=this.app.vault.getAbstractFileByPath(path);
                if(file instanceof TFile){
                    this.plugin.floatingSearch?.close();
                    void this.app.workspace.getLeaf(this.presentation==='page'?'tab':false).openFile(file,{eState:{subpath:item.subpath}})
                        .catch(error=>this._log('error','打开书签失败:',error));
                    return;
                }
            }
            if (item?.type === "url" && item.url) { this._openUrl(String(item.url)); return; }
            this._log("warn", "[SearchBar] 无法打开书签类型:", item?.type || "unknown");
        }

_fileIconName(file: TFile): string {
            try {
                if (!file || !file.path) return "files";
                if (file.extension === "md") return "files";
                return (EXT_ICON as Record<string, string>)[String(file.extension || "").toLowerCase()] || "files";
            } catch (e) {
                this._log("error", "[SearchBar] 解析文件图标失败:", e);
                return "files";
            }
        }

_buildPropertyItems(q: string, terms: string[], _fuzzyFn: FuzzyFn | null, limit = 8): SearchItem[] {
            const tagConstraints=splitTagQuery(q);q=tagConstraints.text;terms=q.toLowerCase().split(/\s+/).filter(Boolean);
            const items: SearchItem[] = [];
            try {
                const RESERVED = new Set(["position"]);
                const m = String(q).match(/^\s*([^:\s]+)\s*:\s*(.*)$/);
                const keyQ = m ? m[1].toLowerCase() : null;
                const valQ = m ? m[2].trim().toLowerCase() : null;
                const matches = (text: string) => _fuzzyFn&&!tagConstraints.tags.length ? !!_fuzzyFn(text) : terms.every(t => String(text).toLowerCase().includes(t));

                const isExcluded=this._excludedPredicate();
                for (const f of this.app.vault.getMarkdownFiles().filter(f=>!isExcluded(f.path))) {
                    const parsed=tagConstraints;
                    if(!hasQueryTags(matchingTagEntries(this.app.metadataCache.getFileCache(f),[]).map(tag=>tag.value),parsed.tags))continue;
                    const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
                    if (!fm) continue;
                    let hitText: string | null = null;
                    for (const [key, value] of Object.entries(fm)) {
                        if (RESERVED.has(key)) continue;
                        const vals = (Array.isArray(value) ? value : [value]).map(toText);
                        if (keyQ) {
                            // 键:值 形式：键名按子串匹配（不受整串查询的模糊匹配影响）
                            if (!key.toLowerCase().includes(keyQ)) continue;
                            if (!valQ) { hitText = `${key}`; break; }
                            const v = vals.find(x => x.toLowerCase().includes(valQ));
                            if (v) { hitText = `${key}: ${v}`; break; }
                        } else {
                            // 裸查询：键名或值命中
                            if (matches(key)) { hitText = `${key}: ${vals.join(", ")}`; break; }
                            const v = vals.find(x => matches(x));
                            if (v) { hitText = `${key}: ${v}`; break; }
                        }
                    }
                    if (!hitText&&parsed.tags.length&&!q)hitText=matchingTagEntries(this.app.metadataCache.getFileCache(f),[]).map(tag=>tag.value).join(' · ');
                    if (!hitText) continue;
                    items.push({
                        path:f.path,label: this._fileLabel(f),
                        sub: hitText,
                        terms,
                        twoLine: true,
                        icon: this._fileIconName(f),
                        action: () => this._openVaultResult(f.path, this._fileLabel(f))
                    });
                    if (items.length >= limit) break;
                }
            } catch (e) {
                this._log("warn", "[SearchBar] 属性搜索失败:", e);
            }
            return items;
        }

_commandCandidates(): {visible: Command[]; hidden: Command[]} {
            try {
                const reg = this.internalApp.commands.commands;
                const all = (reg instanceof Map) ? [...reg.values()] : Object.values(reg || {});
                const visible = this.internalApp.commands.listCommands() || [];
                const visibleIds = new Set(visible.map(c => c && c.id).filter(Boolean));
                return {
                    visible,
                    hidden: all.filter(c => c && c.id && !visibleIds.has(c.id))
                };
            } catch (e) {
                this._log("warn", "[SearchBar] 读取命令注册表失败:", e);
                return { visible: this.internalApp.commands.listCommands() || [], hidden: [] };
            }
        }

_buildCommandItems(q: string, terms: string[], _fuzzyFn: FuzzyFn | null): SearchItem[] {
            const items: SearchItem[] = [];
            try {
                const candidates = this._commandCandidates();
                const ranked = rankCommandCandidates(candidates.visible, candidates.hidden, q, terms, _fuzzyFn);
                // 返回全部匹配项，由共用结果视图分页。 / Return all matches for the shared result pager.
                for (const {command: c, hidden, score} of ranked) {
                    const nm = c.name;
                    const id = c.id;
                    items.push({
                        label: nm,
                        sub: id,
                        twoLine: true,
                        // 原生图标标识通常不可见的命令。 / Native icon marks normally hidden commands.
                        icon: hidden ? "eye-off" : "command",
                        iconTitle: hidden ? "隐藏命令：通常不在命令面板中显示" : undefined,
                        score,
                        terms,
                        trailing: { icon: "copy", title: "复制命令 id", onClick: () => { void this._copyCommandId(id); } },
                        action: () => this._runCommand(id, nm)
                    });
                }
            } catch (e) {
                this._log("warn", "[SearchBar] 命令搜索失败:", e);
            }
            return items;
        }

_runCommand(id: string, name: string) {
            try {
                this._recordHistory(name,undefined,{kind:'command',id});
                // Commands share the recent timeline with files. / 命令与文件共用最近打开时间线。
                this.plugin.recentFiles.recordCommand(id,name);
                // Host modals/views must not open behind the floating search backdrop.
                // 宿主弹窗/视图不能开在浮动搜索遮罩后面。
                this.plugin.floatingSearch?.close();
                if(!this.internalApp.commands.executeCommandById(id))this._notify('命令当前不可用或已移除');
            } catch (e) {
                this._log("error", "[SearchBar] 执行命令失败:", id, name, e);
            }
        }

async _copyCommandId(id: string): Promise<void> {
            try {
                if (!navigator.clipboard || typeof navigator.clipboard.writeText !== "function") {
                    throw new Error("clipboard API 不可用");
                }
                await navigator.clipboard.writeText(id);
                this._notify(`已复制命令 id：${id}`);
            } catch (e) {
                this._log("error", "[SearchBar] 复制命令 id 失败:", id, e);
                this._notify("复制失败，请检查剪贴板权限");
            }
        }

_notify(msg: string) {
            try {
                const { Notice } = Obsidian;
                if (Notice) { new Notice(msg, 2500); return; }
            } catch (e) {
                this._log("error", "[SearchBar] Notice 不可用:", e);
            }
            this._log("warn", "[SearchBar]", msg);
        }
};
