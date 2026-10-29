import * as Obsidian from 'obsidian';
import type {SearchBarCtor} from '../ui/search-bar-host.ts';
import type {SearchEngine, SearchGroup} from '../types.ts';

export function normalizeSuggestions(value:unknown):string[] {
  return Array.isArray(value)?value.filter((item):item is string=>typeof item==='string'&&!!item.trim()).slice(0,6):[];
}

// One cohesive behavior; shared state belongs to SearchBarComponent.
export const withWebSearch = <T extends SearchBarCtor>(Base: T) => class extends Base {
_resolveWebEngines(): SearchEngine[] {
            const allEnabled = (this.cfg.engines || []).filter(e => e.enabled);
            return this._activeEngineId
                ? allEnabled.filter(e => e.id === this._activeEngineId)
                : allEnabled;
        }

_buildWebGroups(q: string, engines: SearchEngine[], isStale: () => boolean, onGroups: (groups: SearchGroup[]) => void): void {
            let _requestUrl: typeof Obsidian.requestUrl | undefined;
            try { _requestUrl = Obsidian.requestUrl; } catch { /* unavailable in test hosts */ }

            // 按引擎顺序预占槽位（null = 尚未返回），保证渲染顺序稳定
            const slots: Array<SearchGroup | null> = new Array<SearchGroup | null>(engines.length).fill(null);

            const _flush = () => {
                if (isStale()) return;
                // 只回调已就绪的槽（过滤掉还在 pending 的 null）
                const ready = slots.filter(Boolean);
                if (ready.length > 0) onGroups(ready);
            };

            engines.forEach((eng, i) => {
                // web 历史只记关键词，不记跳转目标
                const directAction = () => {
                    this._recordHistory(undefined, q);
                    this._openUrl(eng.url.replace("{q}", encodeURIComponent(q)));
                };
                const fallback = () => {
                    if (isStale()) return;
                    slots[i] = {
                        title: eng.name,
                        items: [{ label: `在 ${eng.name} 中搜索 "${q}"`, action: directAction }]
                    };
                    _flush();
                };

                if (!eng.suggest || !_requestUrl) { fallback(); return; }

                const suggestUrl = eng.suggest.replace("{q}", encodeURIComponent(q));
                _requestUrl({ url: suggestUrl, method: "GET" })
                    .then(res => {
                        if (isStale()) return;
                        const data: unknown = res.json ?? JSON.parse(res.text ?? "null");
                        let rawSuggestions: unknown = [];
                        if (eng.id === "google" || eng.id === "duckduckgo") {
                            rawSuggestions = Array.isArray(data) && Array.isArray(data[1]) ? data[1].slice(0, 6) : [];
                        } else if (eng.id === "bing") {
                            try { const bing = data as {AS?: {Results?: Array<{Suggests?: Array<{Txt?: string}>}>}}; rawSuggestions = bing.AS?.Results?.[0]?.Suggests?.map(s => s?.Txt) ?? []; } catch { /* malformed payload */ }
                        } else {
                            if (Array.isArray(data) && Array.isArray(data[1])) rawSuggestions = data[1].slice(0, 6);
                        }
                        const suggestions=normalizeSuggestions(rawSuggestions);
                        slots[i] = {
                            title: eng.name,
                            items: suggestions.length > 0
                                ? suggestions.map(s => ({
                                    label: s,
                                    action: () => {
                                        this._input.value = s;
                                        this._syncClearBtn();
                                        this._recordHistory(undefined, s);
                                        this._openUrl(eng.url.replace("{q}", encodeURIComponent(s)));
                                    }
                                  }))
                                : [{ label: `在 ${eng.name} 中搜索 "${q}"`, action: directAction }]
                        };
                        _flush();
                    })
                    .catch(err => {
                        this._log("warn", `[SearchBar] ${eng.name} suggest 请求失败:`, err);
                        fallback();
                    });
            });
        }

async _searchWeb(q: string): Promise<void> {
            if (!this._webSearchVer) this._webSearchVer = 0;
            const ver = ++this._webSearchVer;

            const engines = this._resolveWebEngines();
            if (engines.length === 0) { this._renderDropdown([]); return; }

            this._buildWebGroups(
                q,
                engines,
                () => this._isWebStale(ver),
                (ready) => this._renderDropdown(ready)
            );
        }
};
