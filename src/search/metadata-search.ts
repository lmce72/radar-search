import * as Obsidian from 'obsidian';
import type {SearchBarCtor, BookmarkItem, FuzzyFn} from '../ui/search-bar-host.ts';
import type {SearchItem} from '../types.ts';
import {TFile, type Command} from 'obsidian';
import {EXT_ICON} from '../shared/constants.ts';
import {externalLinks} from './external-links.ts';

// One cohesive behavior; shared state belongs to SearchBarComponent.
export const withMetadataSearch = <T extends SearchBarCtor>(Base: T) => class extends Base {
async _buildExternalLinkItems(terms: string[], fuzzy: FuzzyFn | null, isExcluded: (path: string) => boolean, isStale: () => boolean): Promise<SearchItem[]> {
            const items: SearchItem[] = [];
            for(const file of this.app.vault.getMarkdownFiles()) {
                if(isStale())return [];
                if(isExcluded(file.path))continue;
                try {
                    const text=await this.app.vault.cachedRead(file);
                    if(isStale())return [];
                    const url=externalLinks(text).find(link=>fuzzy?!!fuzzy(link):terms.every(term=>link.toLowerCase().includes(term)));
                    if(url)items.push({path:file.path,label:file.basename,sub:url,twoLine:true,icon:this._fileIconName(file),action:()=>this._openVaultResult(file.path,file.basename)});
                    if(items.length>=5)break;
                } catch(error) {this._log('warn',`[SearchBar] 外链读取失败 (${file.path}):`,error);}
            }
            return items;
        }
_getSearchableFiles(): TFile[] {
            try {
                return this._searchNonMarkdown ? this.app.vault.getFiles() : this.app.vault.getMarkdownFiles();
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
                if (!path || !this.app.vault.getAbstractFileByPath(path)) {
                    this._log("warn", "[SearchBar] 书签目标不存在:", path);
                    return;
                }
                this._openVaultResult(path, title);
                return;
            }
            const q = this._input?.value.trim();
            if (q) void this._saveToHistory(q, this._mode, title);
            // Let Obsidian's bookmark plugin handle folder/url/graph/search/group types;
            // openLinkText would create a stray note for folder bookmarks.
            const bm = this._getBookmarksInstance();
            if (bm && typeof bm.openBookmark === "function") {
                this.plugin.floatingSearch?.close();
                try { bm.openBookmark(item); }
                catch (error) { this._log("error", "[SearchBar] 打开书签失败:", error); }
                return;
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
            const items: SearchItem[] = [];
            try {
                const RESERVED = new Set(["tags", "tag", "position"]);
                const m = String(q).match(/^\s*([^:\s]+)\s*:\s*(.*)$/);
                const keyQ = m ? m[1].toLowerCase() : null;
                const valQ = m ? m[2].trim().toLowerCase() : null;
                const matches = (text: string) => _fuzzyFn ? !!_fuzzyFn(text) : terms.every(t => String(text).toLowerCase().includes(t));

                const isExcluded=this._excludedPredicate();
                for (const f of this.app.vault.getMarkdownFiles().filter(f=>!isExcluded(f.path))) {
                    const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
                    if (!fm) continue;
                    let hitText: string | null = null;
                    for (const [key, value] of Object.entries(fm)) {
                        if (RESERVED.has(key)) continue;
                        const vals = Array.isArray(value) ? value.map(v => String(v))
                                   : (value && typeof value === "object") ? [JSON.stringify(value)]
                                   : [String(value)];
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

_buildCommandItems(q: string, terms: string[], _fuzzyFn: FuzzyFn | null, limit = 8, list: Command[] | null = null): SearchItem[] {
            const items: SearchItem[] = [];
            try {
                const cmds = list || (this.internalApp.commands.listCommands() || []);
                for (const c of cmds) {
                    const nm = c.name || "";
                    const id = c.id || "";
                    if (!nm || !id) continue;
                    const hit = _fuzzyFn
                        ? (!!_fuzzyFn(nm) || !!_fuzzyFn(id))
                        : terms.every(t => nm.toLowerCase().includes(t) || id.toLowerCase().includes(t));
                    if (!hit) continue;
                    items.push({
                        label: nm,
                        sub: id,
                        twoLine: true,
                        icon: "command",   // 使用 Obsidian 原生 Lucide command 图标。
                        terms,
                        trailing: { icon: "copy", title: "复制命令 id", onClick: () => { void this._copyCommandId(id); } },
                        action: () => this._runCommand(id, nm)
                    });
                    if (items.length >= limit) break;
                }
            } catch (e) {
                this._log("warn", "[SearchBar] 命令搜索失败:", e);
            }
            return items;
        }

_runCommand(id: string, name: string) {
            try {
                // Host modals/views must not open behind the floating search backdrop.
                // 宿主弹窗/视图不能开在浮动搜索遮罩后面。
                this.plugin.floatingSearch?.close();
                this.internalApp.commands.executeCommandById(id);
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
