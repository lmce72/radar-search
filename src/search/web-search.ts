import * as Obsidian from 'obsidian';
import { moment } from '../shared/moment.ts';
import { SHEET_BREAKPOINT, MIN_PANEL_H, PILL_ICON_SIZE, EXT_ICON } from '../shared/constants.ts';
import { IconRenderer } from '../shared/icons.ts';
import { makeTouchHandler } from '../shared/touch.ts';

export function normalizeSuggestions(value:unknown):string[] {
  return Array.isArray(value)?value.filter((item):item is string=>typeof item==='string'&&!!item.trim()).slice(0,6):[];
}

// One cohesive behavior; shared state belongs to SearchBarComponent.
export const withWebSearch = Base => class extends Base {
  declare _webSearchVer;

_resolveWebEngines() {
            const allEnabled = (this.cfg.engines || []).filter(e => e.enabled);
            return this._activeEngineId
                ? allEnabled.filter(e => e.id === this._activeEngineId)
                : allEnabled;
        }

_buildWebGroups(q, engines, isStale, onGroups) {
            let _requestUrl;
            try { _requestUrl = Obsidian.requestUrl; } catch (_) { /* unavailable in test hosts */ }

            // 按引擎顺序预占槽位（null = 尚未返回），保证渲染顺序稳定
            const slots = new Array(engines.length).fill(null);

            const _flush = () => {
                if (isStale()) return;
                // 只回调已就绪的槽（过滤掉还在 pending 的 null）
                const ready = slots.filter(Boolean);
                if (ready.length > 0) onGroups(ready);
            };

            engines.forEach((eng, i) => {
                // web 历史只记关键词，不记跳转目标
                const directAction = () => {
                    this._saveToHistory(q, "web");
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
                        const data = res.json ?? JSON.parse(res.text ?? "null");
                        let suggestions = [];
                        if (eng.id === "google" || eng.id === "duckduckgo") {
                            suggestions = Array.isArray(data) && Array.isArray(data[1]) ? data[1].slice(0, 6) : [];
                        } else if (eng.id === "bing") {
                            try { suggestions = data.AS.Results[0].Suggests.map(s => s?.Txt).slice(0, 6); } catch (_) { /* malformed payload */ }
                        } else {
                            if (Array.isArray(data) && Array.isArray(data[1])) suggestions = data[1].slice(0, 6);
                        }
                        suggestions=normalizeSuggestions(suggestions);
                        slots[i] = {
                            title: eng.name,
                            items: suggestions.length > 0
                                ? suggestions.map(s => ({
                                    label: s,
                                    action: () => {
                                        this._saveToHistory(s, "web");
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

async _searchWeb(q) {
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
