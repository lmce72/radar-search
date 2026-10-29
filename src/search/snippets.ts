import {extractContentMatches} from './content-matches.ts';
import type {SearchBarCtor} from '../ui/search-bar-host.ts';
import type {ContentMatch,SearchItem} from '../types.ts';
import type {TFile} from 'obsidian';

// One cohesive behavior; shared state belongs to SearchBarComponent.
export const withSnippets = <T extends SearchBarCtor>(Base: T) => class extends Base {
_buildMatchItem(file:TFile,terms:string[],hits:ContentMatch[],score?:number):SearchItem {
            // 内容和标签共用列表、分页与定位入口。 / Content and tags share rows, pagination and navigation.
            const open=(hit:ContentMatch)=>{void this._openMatchResult(file.path,file.basename,hit);};
            return {path:file.path,label:this._fileLabel(file),sub:file.parent?.path||'/',terms,hits,score,
                icon:this._fileIconName(file),onMatch:open,
                action:()=>{if(hits[0])open(hits[0]);else this._openVaultResult(file.path,file.basename);}};
        }
_buildTagItem(file:TFile,hits:ContentMatch[]):SearchItem {
            // 标签结果沿用内容搜索的折叠行：首行文件名，次行来源摘要，展开后可定位。
            // Tag rows follow the content-search prototype: file name, source summary, locatable hits.
            const propertyHits=hits.filter(hit=>hit.tag?.field).length;
            const bodyHits=hits.length-propertyHits;
            const tags=[...new Set(hits.map(hit=>(hit.tag?.value||hit.match).replace(/^#/,'')).filter(Boolean))];
            const sources:string[]=[];
            if(propertyHits)sources.push(`笔记属性 ${propertyHits}`);
            if(bodyHits)sources.push(`正文 ${bodyHits}`);
            const open=(hit:ContentMatch)=>{void this._openMatchResult(file.path,file.basename,hit);};
            return {path:file.path,label:this._fileLabel(file),sub:sources.join(' · '),
                // 标签单独交给结果行渲染成胶囊，来源摘要保持纯文本。
                // Tags render as pills on the result row; the source summary stays plain text.
                tagList:tags.map(tag=>`#${tag}`),
                // 只带 # 的标签参与高亮，正文里无 # 的同名文本保持原样。
                // Only the #-prefixed tag is highlighted; plain text without # stays untouched.
                terms:tags.map(tag=>`#${tag.toLowerCase()}`),hits,
                icon:this._fileIconName(file),onMatch:open,
                action:()=>{if(hits[0])open(hits[0]);else this._openVaultResult(file.path,file.basename);}};
        }

_extractAllSnippets(content: string, terms: string[], ctxLen = 35): ContentMatch[] {
            return extractContentMatches(content,terms,ctxLen);
        }

_highlightText(container: HTMLElement, text: string, terms?: string[]): void {
            if (!terms || terms.length === 0) { container.appendText(text); return; }
            const positions: Array<{start: number; end: number}> = [];
            const lower = text.toLowerCase();
            for (const term of terms) {
                let i = 0;
                while ((i = lower.indexOf(term, i)) !== -1) {
                    positions.push({ start: i, end: i + term.length });
                    i += term.length || 1;
                }
            }
            if (positions.length === 0) { container.appendText(text); return; }
            positions.sort((a, b) => a.start - b.start);
            const merged: Array<{start: number; end: number}> = [{ ...positions[0] }];
            for (let i = 1; i < positions.length; i++) {
                const last = merged[merged.length - 1];
                if (positions[i].start <= last.end) last.end = Math.max(last.end, positions[i].end);
                else merged.push({ ...positions[i] });
            }
            let cursor = 0;
            for (const { start, end } of merged) {
                if (start > cursor) container.appendText(text.slice(cursor, start));
                const mark = container.createSpan({ text: text.slice(start, end) });
                mark.setCssStyles({
                    background: "var(--primecore-match-background)",
                    color: "var(--primecore-match-color)",
                    borderRadius: "2px",
                    padding: "0 1px",
                    fontWeight: "600"
                });
                cursor = end;
            }
            if (cursor < text.length) container.appendText(text.slice(cursor));
        }

_extractSnippet(content: string, query: string, contextLen = 35): string {
            const normalized = content.replace(/\s+/g, " ");
            const terms  = query.toLowerCase().split(/\s+/).filter(Boolean);
            const anchor = terms[0] || query.toLowerCase();
            const pos    = normalized.toLowerCase().indexOf(anchor);
            if (pos === -1) return normalized.slice(0, contextLen * 2);
            const start  = Math.max(0, pos - contextLen);
            const end    = Math.min(normalized.length, pos + anchor.length + contextLen);
            const prefix = start > 0 ? "…" : "";
            const suffix = end < normalized.length ? "…" : "";
            return prefix + normalized.slice(start, end) + suffix;
        }
};
