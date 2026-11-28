
import type {SearchBarCtor} from './search-bar-host.ts';
import type {SearchItem} from '../types.ts';
import {PILL_ICON_SIZE} from '../shared/constants.ts';
import {applyEngineFavicon} from '../shared/engine-icon.ts';

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
            if(!this._contentToggleBtn)return;
            const preset=this.cfg.searchPresets.find(value=>value.name===this._selectedPreset);
            const label=this._mode!=='web'&&preset?`搜索选项：${preset.name}`:'搜索选项';
            this._contentToggleBtn.setAttribute('aria-label',label);
            this._contentToggleBtn.title=label;
            if(this._contentToggleIconEl){
                const engine=this._mode==='web'?this._activeWebEngine():null;
                if(engine)applyEngineFavicon(this._contentToggleIconEl,engine,PILL_ICON_SIZE,()=>this._setIcon(this._contentToggleIconEl,'globe',PILL_ICON_SIZE));
                else this._setIcon(this._contentToggleIconEl,preset?.icon||'sliders-horizontal',PILL_ICON_SIZE);
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

_focusInput(showHistory = true,allowTouch=false) {
            try {
                if (this._isTouchDevice()&&!allowTouch) return;
                const alreadyFocused = this._input.ownerDocument.activeElement === this._input;
                this._suppressHistoryFocus = !showHistory && !alreadyFocused;
                this._input.focus({preventScroll:true});
                if (alreadyFocused) {
                    this._suppressHistoryFocus = false;
                    if(showHistory)this._restoreFocusedIdleView(true);
                }
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
