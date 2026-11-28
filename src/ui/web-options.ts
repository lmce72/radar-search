
import {Component} from 'obsidian';
import type {SearchBarCtor,SearchBarHost} from './search-bar-host.ts';
import type {WebSource} from '../types.ts';
import {positionFloatingElement} from './floating-geometry.ts';
import {clearTimer} from '../shared/timers.ts';
import {applyEngineFavicon} from '../shared/engine-icon.ts';
import {AiSearchModal} from './ai-search-modal.ts';
import {AI_PROVIDERS} from '../search/ai-search.ts';

// Tokenize only outside quoted/escaped text; literal operator names remain literal.
// 仅在引号和转义之外分词，避免修改被引用的字面操作符。
function webTokens(query:string):string[] {
    const tokens:string[]=[];let token='',quoted=false,escaped=false;
    for(const char of query){
        if(/\s/.test(char)&&!quoted&&!escaped){if(token){tokens.push(token);token='';}continue;}
        token+=char;if(escaped){escaped=false;continue;}if(char==='\\'){escaped=true;continue;}if(char==='"')quoted=!quoted;
    }
    if(token)tokens.push(token);return tokens;
}
const sourceEditors=new WeakMap<object,()=>void>();
const sourceWrites=new WeakMap<object,Promise<void>>();
const engineVersions=new WeakMap<object,number>();
function composingEnter(owner:Component,input:HTMLInputElement):(event:KeyboardEvent)=>boolean {
    let endedAt:number|null=null;
    owner.registerDomEvent(input,'compositionend',event=>{endedAt=event.timeStamp;});
    // Safari can deliver compositionend before its confirming Enter keydown.
    // Safari 可能先投递组合结束事件；按事件时间戳保护确认键，不依赖处理时的时钟。
    return event=>event.isComposing||endedAt!==null&&Math.abs(event.timeStamp-endedAt)<50;
}
function saveSources(bar:SearchBarHost,change:(sources:WebSource[])=>WebSource[]):Promise<void>{
    const previous=sourceWrites.get(bar.plugin)??Promise.resolve();
    const task=previous.catch(()=>{}).then(async()=>{
        const sources=change(structuredClone(bar.plugin.settings.webSources||[]));
        await bar.plugin.updateSetting('webSources',sources,false);
        for(const {component} of bar.plugin.components.values()){
            component.cfg.webSources=structuredClone(sources);
            if(!component._disposed&&component._webSourceRowEl?.isConnected&&!component._sourceEditor?.isConnected)component._renderSourceChips(component._webSourceRowEl);
        }
        if(!bar._disposed)bar.cfg.webSources=structuredClone(sources);
    });
    sourceWrites.set(bar.plugin,task);return task;
}

/** Active web engine (configured or first enabled). / 当前或首个启用的搜索引擎。 */
export function activeWebEngine(bar:{_activeEngineId:string|null;cfg:{engines?:Array<{id:string;enabled:boolean;url?:unknown}>}}):{id:string;enabled:boolean;url?:unknown}|null {
  const enabled=(bar.cfg.engines||[]).filter(engine=>engine.enabled);
  return (bar._activeEngineId?enabled.find(engine=>engine.id===bar._activeEngineId):null)||enabled[0]||null;
}

// One cohesive behavior; shared state belongs to SearchBarComponent.
export const withWebOptions = <T extends SearchBarCtor>(Base: T) => class extends Base {
_activeWebEngine(){return activeWebEngine(this);}
/** Select the web result category in global mode; existing handlers trigger the search. */
_activateWebCategory():void {
            if(this._mode!=='global')return;
            this._resultCategory='web';this._preferredResultCategory='web';this._resultCategoryChosen=true;
            if(this._resultKind==='results'&&this._lastGroups)this._renderDropdown(this._lastGroups);
            else if(this._barLeft)this._renderResultCategories();
        }
_buildWebOptionsSection(container: HTMLElement): void {
            const _mkGrid = (parent: HTMLElement) => {
                const g = parent.createDiv();
                g.setCssStyles({
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: "8px 14px",
                    alignItems: "center",
                    padding: "10px 14px"
                });
                return g;
            };
            // 行：可选图标 + 标签 + 控件（图标沿用面板既有的 13px 尺度）
            // Row: optional icon + label + control (icon follows the panel's existing 13px scale).
            const _row = (grid: HTMLElement, labelText: string, controlEl: HTMLElement, iconName: string | undefined = undefined) => {
                const wrap = grid.createSpan();
                wrap.setCssStyles({ display: "inline-flex", alignItems: "center", gap: "7px", minWidth: "0" });
                if (iconName) {
                    const ic = wrap.createSpan();
                    ic.setCssStyles({ display: "inline-flex", alignItems: "center", flexShrink: "0", color: "var(--text-muted)" });
                    this._setIcon(ic, iconName, 13);
                }
                const lbl = wrap.createSpan({ text: labelText });
                lbl.setCssStyles({
                    fontSize: "13px", color: "var(--text-normal)", userSelect: "none",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
                });
                grid.appendChild(controlEl);
            };

            // ── AI search preview: top of the web section so it stays visible ──
            // AI 搜索预览：放在 Web 区顶部，无需滚动即可看到。
            this._mkSectionLabel(container, "AI 搜索 · preview");
            const aiRow=container.createDiv({cls:'primecore-ai-section'});
            const providerKey=this.plugin.settings.aiProvider;
            const provider=AI_PROVIDERS[providerKey];
            const key=this.plugin.settings.aiApiKey.trim();
            const configured=providerKey==='jina'||!!key||(providerKey==='custom'&&!!this.plugin.settings.aiEndpoint.trim());
            const aiHead=aiRow.createDiv({cls:'primecore-ai-head'});
            const aiBtn=aiHead.createEl('button',{cls:'primecore-ai-search-btn',attr:{type:'button'}});
            const aiIcon=aiBtn.createSpan({cls:'primecore-engine-icon',attr:{'aria-hidden':'true'}});
            this._setIcon(aiIcon,'sparkles',14);
            aiBtn.createSpan({cls:'primecore-ai-search-label',text:configured?`向 ${provider.label} 提问`:'配置 AI API Key'});
            const aiSettings=aiHead.createEl('button',{cls:'primecore-ai-settings',attr:{type:'button','aria-label':'打开 AI 搜索设置','title':'打开 AI 搜索设置'}});
            this._setIcon(aiSettings,'settings-2',14);
            this._listen(aiSettings,'click',event=>{event.stopPropagation();this.plugin.openSettings();});
            this._listen(aiBtn,'click',event=>{
                event.stopPropagation();
                if(!configured){this.plugin.openSettings();return;}
                new AiSearchModal(this.plugin,this._input.value.trim()).open();
            });
            aiRow.createDiv({cls:'setting-item-description',text:`当前平台：${provider.label}${key?' · 已配置 API Key':' · 未配置 API Key'}`});
            aiRow.createDiv({cls:'setting-item-description',text:'Tavily / Exa / Jina 提供免费额度；Brave、Serper、Perplexity 可通过自定义接入。点击提问会打开可编辑问题与回答的窗口。'});

            // ── Section 0：搜索引擎选择器（需求3）──────────────────────────
            this._mkSectionLabel(container, "搜索引擎");
            const engineRow = container.createDiv();
            engineRow.setCssStyles({
                display: "flex", flexWrap: "wrap", gap: "6px", padding: "10px 14px"
            });
            this._engineRowEl = engineRow;
            this._engineChipEls.clear();

            const enabledEngines = (this.cfg.engines || []).filter(e => e.enabled);
            enabledEngines.forEach(eng => {
                const chip = engineRow.createEl("button");
                chip.addClass('primecore-engine');
                chip.setCssStyles({
                    display: "inline-flex", alignItems: "center", gap: "5px",
                    fontSize: "12px", padding: "3px 10px", borderRadius: "100px",
                    border: "1px solid color-mix(in srgb, var(--primecore-accent) 35%, transparent)",
                    background: "transparent", color: "var(--text-muted)",
                    cursor: "pointer", touchAction: "manipulation",
                    transition: "background 0.15s, color 0.15s, border-color 0.15s"
                });
                const engineIcon=chip.createSpan({cls:'primecore-engine-icon',attr:{'aria-hidden':'true'}});
                applyEngineFavicon(engineIcon,eng,14,()=>this._setIcon(engineIcon,'globe',13));
                chip.createSpan({cls:'primecore-engine-name',text:eng.name});
                this._engineChipEls.set(eng.id, chip);

                const _toggleEngine = () => {
                    if(this._disposed||!chip.isConnected)return;
                    const version=(engineVersions.get(this)||0)+1;engineVersions.set(this,version);
                        const isNowActive = this._activeEngineId === eng.id;
                        this._activeEngineId = isNowActive ? null : eng.id;
                        this._refreshEngineChips();
                        const next=this._activeEngineId;
                        void this.plugin.updateSetting('activeEngineId',next,false).then(()=>{
                            if(version!==engineVersions.get(this)||this._disposed)return;
                            this.cfg.activeEngineId=next;
                            const query=this._input.value.trim();
                            if(query&&(this._mode==='web'||this._mode==='global'&&this._resultCategory==='web'))void this._doSearch(query,true);
                        }).catch(error=>{
                            if(version===engineVersions.get(this)&&!this._disposed)this._activeEngineId=this.plugin.settings.activeEngineId;
                            this._log('error','引擎切换失败',error);
                        }).finally(()=>{if(!this._disposed)this._refreshEngineChips();});
                };
                const engineChipHandler = this._makeTouchHandler(_toggleEngine);
                this._listen(chip, "touchstart", engineChipHandler.onTouchStart, { passive: true });
                this._listen(chip, "touchend", engineChipHandler.onTouchEnd);
                this._listen(chip, "click", _toggleEngine);
                this._listen(chip, "mouseenter", () => {
                    if (this._activeEngineId !== eng.id) chip.setCssStyles({background: "color-mix(in srgb, var(--primecore-accent) 8%, transparent)"});
                });
                this._listen(chip, "mouseleave", () => {
                    if (this._activeEngineId !== eng.id) chip.setCssStyles({background: "transparent"});
                });
            });
            this._refreshEngineChips();

            // 搜索语法快捷操作
            this._mkSectionLabel(container, "搜索语法");            const grid1 = _mkGrid(container);

            // 精确匹配 chip
            const _chipBtn = (label: string, applyFn: () => void) => {
                const btn = createEl("button");
                btn.setCssStyles({
                    fontSize: "12px", padding: "3px 10px", borderRadius: "100px",
                    border: "1px solid color-mix(in srgb, var(--primecore-accent) 40%, transparent)",
                    background: "transparent", color: "color-mix(in srgb, var(--primecore-accent) 70%, transparent)",
                    cursor: "pointer", touchAction: "manipulation",
                    transition: "background 0.15s, color 0.15s"
                });
                btn.textContent = label;
                const chipBtnHandler = this._makeTouchHandler(applyFn);
                this._listen(btn, "touchstart", chipBtnHandler.onTouchStart, { passive: true });
                this._listen(btn, "touchend", chipBtnHandler.onTouchEnd);
                this._listen(btn, "click", applyFn);
                return btn;
            };

            _row(grid1, "精确匹配", _chipBtn('"..."', () => this._applyWebOperator("exact", null)));
            _row(grid1, "仅标题", _chipBtn("intitle:", () => this._applyWebOperator("intitle", null)));

            // site: 带输入框
            const siteCtrl = createDiv();
            siteCtrl.setCssStyles({ display: "flex", alignItems: "center", gap: "4px" });
            const siteInput = siteCtrl.createEl("input", { type: "text" });
            siteInput.setCssStyles({
                width: "110px", fontSize: "12px", padding: "2px 6px",
                borderRadius: "5px", border: "1px solid var(--background-modifier-border)",
                background: "var(--background-primary)", color: "var(--text-normal)"
            });
            siteInput.placeholder = "example.com";
            this._listen(siteInput, "mousedown",  (e) => e.stopPropagation());
            this._listen(siteInput, "touchstart", (e) => e.stopPropagation(), { passive: true });
            const siteApplyBtn = _chipBtn("site:", () => {
                const domain = siteInput.value.trim();
                this._applyWebOperator("site", domain);
            });
            siteCtrl.appendChild(siteApplyBtn);
            _row(grid1, "指定网站", siteCtrl);

            // filetype: select + 自定义输入框
            const ftWrap = createDiv();
            ftWrap.setCssStyles({ display: "flex", alignItems: "center", gap: "4px" });
            const ftSelect = ftWrap.createEl("select",{cls:'dropdown'});
            ftSelect.setCssStyles({
                fontSize: "12px", paddingInlineStart: "var(--dropdown-padding-start, 8px)",paddingInlineEnd:"var(--dropdown-padding-end, 28px)", borderRadius: "5px",
                border: "1px solid var(--background-modifier-border)",
                backgroundColor: "var(--background-primary)", color: "var(--text-normal)", cursor: "pointer"
            });
            [["", "无"], ["pdf", "PDF"], ["doc", "DOC"], ["xls", "XLS"], ["ppt", "PPT"], ["txt", "TXT"], ["custom", "自定义"]].forEach(([v, t]) => {
                ftSelect.createEl("option", { value: v, text: t });
            });
            // 自定义输入框（初始隐藏）
            const ftCustomInput = ftWrap.createEl("input", { type: "text" });
            ftCustomInput.setCssStyles({
                display: "none", width: "80px", fontSize: "12px", padding: "2px 6px",
                borderRadius: "5px", border: "1px solid var(--background-modifier-border)",
                background: "var(--background-primary)", color: "var(--text-normal)"
            });
            ftCustomInput.placeholder = "Filetype";
            this._listen(ftCustomInput, "mousedown",  e => e.stopPropagation());
            this._listen(ftCustomInput, "touchstart", e => e.stopPropagation(), { passive: true });
            this._listen(ftSelect, "mousedown", e => e.stopPropagation());
            this._listen(ftSelect, "change", () => {
                const isCustom = ftSelect.value === "custom";
                ftCustomInput.setCssStyles({display: isCustom ? "inline-block" : "none"});
                if (!isCustom) this._applyWebOperator("filetype", ftSelect.value);
            });
            const _applyFtCustom = () => {
                const val = ftCustomInput.value.trim();
                if (val) this._applyWebOperator("filetype", val);
            };
            this._listen(ftCustomInput, "blur", _applyFtCustom);
            const ftComposing=composingEnter(this,ftCustomInput);
            this._listen(ftCustomInput, "keydown", e => {
                if (e.key === "Enter"&&!ftComposing(e)) { e.preventDefault(); _applyFtCustom(); }
            });
            _row(grid1, "文件类型", ftWrap);

            // ── 信息源（配置驱动 + 编辑模式）──────────────────────────────
            const sourceSectionLabel = this._mkSectionLabel(container, "信息源");
            // section label 行右侧加编辑开关按钮
            sourceSectionLabel.setCssStyles({ display: "flex", alignItems: "center", justifyContent: "space-between" });
            this._sourceEditBtnEl = this._mkNavBtn("pencil", 13);
            this._sourceEditBtnEl.title = "编辑信息源";
            const sourceEditHandler = this._makeTouchHandler(() => this._toggleSourceEditMode());
            this._listen(this._sourceEditBtnEl, "touchstart", sourceEditHandler.onTouchStart, { passive: true });
            this._listen(this._sourceEditBtnEl, "touchend", sourceEditHandler.onTouchEnd);
            this._listen(this._sourceEditBtnEl, "click", () => this._toggleSourceEditMode());
            sourceSectionLabel.appendChild(this._sourceEditBtnEl);

            const sourceRow = container.createDiv();
            sourceRow.setCssStyles({
                display: "flex", flexWrap: "wrap", gap: "6px", padding: "10px 14px"
            });
            this._webSourceRowEl = sourceRow;
            this._renderSourceChips(sourceRow);
            // Interacting with any web option switches the result bar to the web category.
            // 操作 Web 选项时，结果顶栏自动切到“互联网”分类。
            this._listen(container,'click',event=>{
                const target=event.target as Element|null;
                if(target?.closest('button,select,input'))this._activateWebCategory();
            },{capture:true});

        }

_refreshEngineChips() {
            this._engineChipEls.forEach((chip, id) => {
                const isActive = this._activeEngineId === id;
                chip.setAttribute('aria-pressed',String(isActive));
                chip.setCssStyles({background: isActive ? "color-mix(in srgb, var(--primecore-accent) 15%, transparent)" : "transparent"});
                chip.setCssStyles({color: isActive ? "var(--primecore-accent)"        : "var(--text-muted)"});
                chip.setCssStyles({borderColor: isActive ? "color-mix(in srgb, var(--primecore-accent) 70%, transparent)"  : "color-mix(in srgb, var(--primecore-accent) 35%, transparent)"});
            });
            if(this._mode==='web'&&this._contentToggleLabelEl)this._contentToggleLabelEl.setText(this.cfg.engines.find(engine=>engine.id===this._activeEngineId)?.name||'搜索选项');
            this._applyOptionsIcon();
            if(this._barLeft)this._renderResultCategories();
            if(this._mode==='web'){
                const iconWrap=this._scopeBtn?.querySelector('span');
                const engine=this._activeWebEngine();
                if(iconWrap){
                    if(engine)applyEngineFavicon(iconWrap,engine,16,()=>this._setIcon(iconWrap,'globe',16));
                    else this._setIcon(iconWrap,'globe',16);
                }
            }
        }

_toggleSourceEditMode() {
            this._webEditMode = !this._webEditMode;
            if (this._sourceEditBtnEl) {
                const iconSpan = this._sourceEditBtnEl.querySelector("span");
                if (iconSpan) this._setIcon(iconSpan, this._webEditMode ? "check" : "pencil", 13);
            }
            if (this._webSourceRowEl) this._renderSourceChips(this._webSourceRowEl);
        }

_renderSourceChips(row: HTMLElement): void {
            this.cfg.webSources??=[];
            row.empty();

            this.cfg.webSources.forEach((src, idx) => {
                const chip = row.createEl("button");
                chip.setCssStyles({
                    fontSize: "12px", padding: "3px 10px", borderRadius: "100px",
                    border: "1px solid color-mix(in srgb, var(--primecore-accent) 35%, transparent)",
                    background: "transparent", color: "var(--text-muted)",
                    cursor: "pointer", touchAction: "manipulation",
                    display: "inline-flex", alignItems: "center", gap: "4px",
                    transition: "background 0.15s, color 0.15s, border-color 0.15s"
                });

                const labelSpan = chip.createSpan({ text: src.label });
                labelSpan.setCssStyles({ pointerEvents: "none" });

                if (this._webEditMode) {
                    const editIconSpan = chip.createSpan();
                    editIconSpan.setCssStyles({
                        display: "inline-flex", alignItems: "center",
                        marginLeft: "2px", color: "color-mix(in srgb, var(--primecore-accent) 70%, transparent)", cursor: "pointer"
                    });
                    this._setIcon(editIconSpan, "pencil", 11);
                    const editHandler = this._makeTouchHandler((e) => {
                        e.stopPropagation();
                        this._openSourceEditor(src, idx, chip, row);
                    });
                    this._listen(editIconSpan, "touchstart", editHandler.onTouchStart, { passive: true });
                    this._listen(editIconSpan, "touchend", (e) => { e.stopPropagation(); editHandler.onTouchEnd(e); });
                    this._listen(editIconSpan, "click", e => {
                        e.stopPropagation();
                        this._openSourceEditor(src, idx, chip, row);
                    });

                    const delIconSpan = chip.createSpan();
                    delIconSpan.setCssStyles({
                        display: "inline-flex", alignItems: "center",
                        marginLeft: "2px", color: "var(--text-error)", cursor: "pointer"
                    });
                    this._setIcon(delIconSpan, "x", 11);
                    const delHandler = this._makeTouchHandler((e) => {
                        e.stopPropagation();
                        this._deleteSource(idx, row);
                    });
                    this._listen(delIconSpan, "touchstart", delHandler.onTouchStart, { passive: true });
                    this._listen(delIconSpan, "touchend", (e) => { e.stopPropagation(); delHandler.onTouchEnd(e); });
                    this._listen(delIconSpan, "click", e => {
                        e.stopPropagation();
                        this._deleteSource(idx, row);
                    });
                } else {
                    const _applySource = () => {
                        this._applyWebOperator("site", src.domain);
                        const isActive = this._input.value.includes(`site:${src.domain}`);
                        chip.setCssStyles({background: isActive ? "color-mix(in srgb, var(--primecore-accent) 15%, transparent)" : "transparent"});
                        chip.setCssStyles({color: isActive ? "var(--primecore-accent)"        : "var(--text-muted)"});
                        chip.setCssStyles({borderColor: isActive ? "color-mix(in srgb, var(--primecore-accent) 70%, transparent)"  : "color-mix(in srgb, var(--primecore-accent) 35%, transparent)"});
                    };
                    const applyHandler = this._makeTouchHandler(_applySource);
                    this._listen(chip, "touchstart", applyHandler.onTouchStart, { passive: true });
                    this._listen(chip, "touchend", applyHandler.onTouchEnd);
                    this._listen(chip, "click", _applySource);
                }
            });

            if (this._webEditMode) {
                const addBtn = row.createEl("button");
                addBtn.setCssStyles({
                    fontSize: "12px", padding: "3px 10px", borderRadius: "100px",
                    border: "1.5px dashed color-mix(in srgb, var(--primecore-accent) 40%, transparent)",
                    background: "transparent", color: "color-mix(in srgb, var(--primecore-accent) 70%, transparent)",
                    cursor: "pointer", touchAction: "manipulation",
                    display: "inline-flex", alignItems: "center", gap: "4px",
                    transition: "background 0.15s"
                });
                const addIconSpan = addBtn.createSpan();
                addIconSpan.setCssStyles({ display: "inline-flex", alignItems: "center", pointerEvents: "none" });
                this._setIcon(addIconSpan, "plus", 12);
                addBtn.addClass('primecore-hover-action');addBtn.setAttribute('aria-label','添加信息源');
                addBtn.createSpan({cls:'primecore-action-label',text:'添加'});
                const addBtnHandler = this._makeTouchHandler(() => this._openSourceEditor(null, -1, addBtn, row));
                this._listen(addBtn, "touchstart", addBtnHandler.onTouchStart, { passive: true });
                this._listen(addBtn, "touchend", addBtnHandler.onTouchEnd);
                this._listen(addBtn, "click", () => this._openSourceEditor(null, -1, addBtn, row));
            }
        }

_positionSourceEditor() {
            const editor = this._sourceEditor;
            const anchor = this._sourceEditorAnchor;
            if (!editor?.isConnected || !anchor?.isConnected) {sourceEditors.get(this)?.();return;}
            positionFloatingElement(editor,anchor.getBoundingClientRect(),Math.max(editor.offsetWidth||220,220),editor.scrollHeight||120);
            editor.setCssStyles({overflowY:'auto'});
        }

_closeSourceEditor():void {sourceEditors.get(this)?.();}

_openSourceEditor(src: WebSource | null, idx: number, anchorEl: HTMLElement, row: HTMLElement): void {
            const document = this.container.ownerDocument;
            sourceEditors.get(this)?.();
            if(this._disposed||!anchorEl.isConnected)return;
            const owner=this.addChild(new Component());

            const editorEl = document.body.createDiv({cls:'primecore-source-editor'});
            this._sourceEditor = editorEl;
            editorEl.setAttribute("data-sb-source-editor", "1");
            editorEl.setAttribute("data-sb-float", "1");
            editorEl.setCssStyles({
                position: "fixed",
                zIndex: String(9200 + (++this._zCounter)),
                background: "var(--background-primary)",
                border: "1px solid var(--background-modifier-border)",
                borderRadius: "10px",
                boxShadow: "0 6px 20px rgba(0,0,0,0.2)",
                padding: "12px 14px",
                minWidth: "200px",
                display: "flex",
                flexDirection: "column",
                gap: "8px"
            });

            this._sourceEditorAnchor = anchorEl;
            const close=()=>this.removeChild(owner);
            sourceEditors.set(this,close);
            owner.register(()=>{
                editorEl.remove();
                if(this._sourceEditor===editorEl){
                    this._sourceEditor=null;this._sourceEditorAnchor=null;sourceEditors.delete(this);
                    // Refresh saved chips only after another editor has had a chance to take over.
                    // 等待接替编辑器打开后再同步胶囊，防止旧保存操作断开新草稿的锚点。
                    this._frame(()=>{if(!this._sourceEditor?.isConnected&&row.isConnected)this._renderSourceChips(row);});
                }
            });
            this._frame(() => this._positionSourceEditor());

            const _mkInput = (placeholder: string, value: string) => {
                const inp = editorEl.createEl("input", { type: "text" });
                inp.setCssStyles({
                    fontSize: "12px", padding: "4px 8px",
                    borderRadius: "5px", border: "1px solid var(--background-modifier-border)",
                    background: "var(--background-secondary)", color: "var(--text-normal)", outline: "none"
                });
                inp.placeholder = placeholder;
                inp.setAttribute('aria-label',placeholder);
                inp.value = value || "";
                owner.registerDomEvent(inp, "mousedown", e => e.stopPropagation());
                owner.registerDomEvent(inp, "touchstart", e => e.stopPropagation(), { passive: true });
                return inp;
            };

            const nameInput   = _mkInput("名称（如 GitHub）",     src?.label  || "");
            const domainInput = _mkInput("域名（如 github.com）", src?.domain || "");
            domainInput.setAttribute('autocorrect','off');domainInput.setAttribute('autocapitalize','none');domainInput.spellcheck=false;
            const status=editorEl.createDiv({cls:'setting-item-description',attr:{role:'status','aria-live':'polite'}});

            const btnRow = editorEl.createDiv();
            btnRow.setCssStyles({ display: "flex", gap: "6px", justifyContent: "flex-end" });

            const cancelBtn = this._mkNavBtn("x", 13);
            cancelBtn.title = "取消";
            cancelBtn.setAttribute('aria-label','取消');
            owner.registerDomEvent(cancelBtn, "click", close);

            const confirmBtn = this._mkNavBtn("check", 13);
            confirmBtn.title = "确认";
            confirmBtn.setAttribute('aria-label','确认');
            confirmBtn.setCssStyles({color: "var(--primecore-accent)"});
            let saving=false;
            const _confirm = async() => {
                if(saving||this._disposed||!editorEl.isConnected)return;
                try {
                    const newLabel  = nameInput.value.trim();
                    const newDomain = domainInput.value.trim().replace(/^https?:\/\//i, "");
                    if(!newLabel||!newDomain)throw Error('请填写信息源名称和域名');
                    if(!/^[a-z0-9.-]+(?::\d+)?(?:\/[^\s]*)?$/i.test(newDomain))throw Error('请输入不含空格的有效域名');
                    saving=true;confirmBtn.disabled=true;nameInput.disabled=true;domainInput.disabled=true;status.setText('正在保存…');
                    await saveSources(this,sources=>{
                        if(src&&idx>=0){
                            const at=sources.findIndex(source=>source.label===src.label&&source.domain===src.domain);
                            if(at<0)throw Error('此信息源已修改或删除，请重新打开编辑');
                            sources[at]={label:newLabel,domain:newDomain};
                        }else sources.push({label:newLabel,domain:newDomain});
                        return sources;
                    });
                    if(!this._disposed&&editorEl.isConnected){close();this._renderSourceChips(row);}
                } catch (e) {
                    this._log("error", "[SearchBar] _openSourceEditor 确认失败:", e);
                    if(editorEl.isConnected)status.setText(e instanceof Error?e.message:'信息源未能保存，请重试');
                }finally{saving=false;if(editorEl.isConnected){confirmBtn.disabled=false;nameInput.disabled=false;domainInput.disabled=false;}}
            };
            owner.registerDomEvent(confirmBtn, "click", ()=>{void _confirm();});

            [nameInput, domainInput].forEach(inp => {
                const composing=composingEnter(owner,inp);
                owner.registerDomEvent(inp, "keydown", e => { if (e.key === "Enter"&&!composing(e)) { e.preventDefault();void _confirm(); } });
            });

            btnRow.appendChild(cancelBtn);
            btnRow.appendChild(confirmBtn);

            const _outsideClose = (e: MouseEvent) => {
                const target = e.target instanceof document.defaultView.Node ? e.target : null;
                if (!target || !editorEl.contains(target)&&!anchorEl.contains(target)) close();
            };
            owner.registerDomEvent(document,'click',_outsideClose);
            owner.registerDomEvent(editorEl,'keydown',event=>{if(event.key==='Escape'&&!event.isComposing){event.preventDefault();event.stopPropagation();close();if(anchorEl.isConnected)anchorEl.focus();}});
        }

_deleteSource(idx: number, row: HTMLElement): void {
            const source=this.cfg.webSources?.[idx];if(!source||this._disposed)return;
            void saveSources(this,sources=>{
                const at=sources.findIndex(item=>item.label===source.label&&item.domain===source.domain);
                if(at>=0)sources.splice(at,1);return sources;
            }).then(()=>{if(!this._disposed&&!this._sourceEditor?.isConnected)this._renderSourceChips(row);}).catch(error=>{
                this._notify('信息源未能删除，请重试');this._log('error','[SearchBar] _deleteSource 失败:',error);
            });
        }

_applyWebOperator(op: 'exact' | 'intitle' | 'site' | 'filetype', value: string | null): void {
            if(this._disposed)return;
            try {
                const tokens=webTokens(this._input.value.trim());let q:string;
                let caret=0;
                if(op==='site'||op==='filetype'){
                    const wanted=value?.trim();
                    q=[...tokens.filter(token=>!new RegExp('^'+op+':','i').test(token)),...(wanted?[op+':'+wanted]:[])].join(' ');
                    caret=q.length;
                }else{
                    const qualifiers=tokens.filter(token=>/^(?:site|filetype):/i.test(token));
                    const words=tokens.filter(token=>!/^(?:site|filetype):/i.test(token));
                    const hadTitle=words.some(word=>/^intitle:/i.test(word));
                    const joined=words.map(word=>word.replace(/^intitle:/i,'')).filter(Boolean).join(' ');
                    const hadExact=/^"(?:\\.|[^"\\])*"$/.test(joined);
                    let title=hadTitle;
                    let base=joined;
                    if(op==='intitle')title=!hadTitle;
                    else if(hadExact)base=base.slice(1,-1).replace(/\\(["\\])/g,'$1');
                    else if(base)base='"'+base.replace(/["\\]/g,'\\$&')+'"';
                    if(!base){
                        // Empty query: first click inserts an operator skeleton, the next removes it.
                        // 空查询首次点击插入语法骨架，再次点击移除。
                        if(op==='intitle'&&!hadTitle){q=[...qualifiers,'intitle:'].join(' ');caret=q.length;}
                        else if(op==='exact'&&!hadExact){q=[...qualifiers,'""'].join(' ');caret=q.length-1;}
                        else q=qualifiers.join(' ');
                    } else q=[...(base?[(title?'intitle:':'')+base]:[]),...qualifiers].join(' ');
                }
                this._input.value = q;
                this._syncClearBtn();
                clearTimer(this._debounceTimer);this._debounceTimer=null;
                this._focusInput(false);
                try{this._input.setSelectionRange(caret,caret);}catch{/* selection is best-effort */}
                if(q.trim())void this._doSearch(q,true);
            } catch (e) {
                this._log("error", "[SearchBar] _applyWebOperator 失败:", e);
            }
        }
};
