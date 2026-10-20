
import type {SearchBarCtor} from './search-bar-host.ts';
import type {SearchItem} from '../types.ts';
import {PILL_ICON_SIZE} from '../shared/constants.ts';

// One cohesive behavior; shared state belongs to SearchBarComponent.
export const withInteractions = <T extends SearchBarCtor>(Base: T) => class extends Base {
_mkTrailingBtn(itemEl: HTMLElement, item: SearchItem): HTMLButtonElement {
            const btn = itemEl.createEl("button");
            btn.setCssStyles({
                flexShrink: "0", display: "inline-flex", alignItems: "center", justifyContent: "center",
                width: "24px", height: "24px", borderRadius: "5px",
                border: "none", background: "transparent", color: "var(--text-muted)",
                cursor: "pointer", padding: "0", transition: "background 0.12s, color 0.12s"
            });
            if (item.trailing.icon) this._setIcon(btn, item.trailing.icon, 13);
            if (item.trailing.title) btn.setAttribute("aria-label", item.trailing.title);
            this._listen(btn, "mouseenter", () => { btn.setCssStyles({background: "var(--background-modifier-hover)"}); btn.setCssStyles({color: "var(--text-normal)"}); });
            this._listen(btn, "mouseleave", () => { btn.setCssStyles({background: "transparent"}); btn.setCssStyles({color: "var(--text-muted)"}); });
            this._listen(btn, "mousedown", (e) => { e.stopPropagation(); e.preventDefault(); });
            const handler = this._makeTouchHandler((e) => { e.stopPropagation(); item.trailing.onClick(); });
            this._listen(btn, "touchstart", handler.onTouchStart, { passive: true });
            this._listen(btn, "touchend", (e) => { e.stopPropagation(); handler.onTouchEnd(e); });
            this._listen(btn, "click", (e) => { e.stopPropagation(); item.trailing.onClick(); });
            return btn;
        }

_refreshContentToggleStatus() {
            try {
                if (!this._contentStatusEl) return;
                const el = this._contentStatusEl;
                if (el.empty) el.empty(); else while (el.firstChild) el.removeChild(el.firstChild);
                const sep = this._contentStatusSep;
                const hideSep = () => { if (sep) sep.setCssStyles({display: "none"}); };
                // web 模式下按钮表示所选搜索引擎，不显示 vault 专项搜索状态
                if (this._mode === "web") { hideSep(); return; }
                // 顺序与选项面板「专项搜索」组一致
                const items: Array<[boolean, string]> = [
                    [this._contentSearch,     "file-search"],
                    [this._searchWikiLinks,   "brackets"],
                    [this._searchMdLinks,     "external-link"],
                    [this._searchBookmarks,   "bookmark"],
                    [this._searchTags,        "tag"],
                    [this._searchProperties,  "braces"],
                    [this._searchCommands,    "command"],
                    [this._searchNonMarkdown, "files"]
                ];
                let shown = 0;
                for (const [on, icon] of items) {
                    if (!on) continue;
                    const s = el.createSpan();
                    s.setCssStyles({ display: "inline-flex", alignItems: "center" });
                    this._setIcon(s, icon, PILL_ICON_SIZE);   // 与 pill 三个按钮同尺寸
                    shown++;
                }
                // 仅在右侧确有状态图标时才显示分隔符（全关时不留下悬空的竖线）
                if (sep) sep.setCssStyles({display: shown > 0 ? "inline-block" : "none"});
            } catch (e) {
                this._log("error", "[SearchBar] 刷新按钮状态图标失败:", e);
            }
        }

_isTouchDevice() {
            const document = this.container.ownerDocument;
            const window = document.defaultView;

            try {
                if (this._sawTouchInput) return true;
                if (typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches) return true;
                return ("ontouchstart" in window);
            } catch (e) {
                this._log("warn", "[SearchBar] 触摸设备判定失败:", e);
                return false;
            }
        }

_focusInput() {
            try {
                if (this._isTouchDevice()) return;
                this._input.focus();
            } catch (e) {
                this._log("error", "[SearchBar] 聚焦输入框失败:", e);
            }
        }

_dismissKeyboard() {
            const document = this.container.ownerDocument;

            try {
                if (!this._isTouchDevice()) return;
                if (document.activeElement === this._input) this._input.blur();
            } catch (e) {
                this._log("error", "[SearchBar] 收起输入法失败:", e);
            }
        }

_guardLayerKeyboard(el: HTMLElement | null): void {
            if (!el) return;
            this._listen(el, "touchstart", () => this._dismissKeyboard(), { capture: true, passive: true });
        }
};
