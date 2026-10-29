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
