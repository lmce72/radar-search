import {extractContentMatches} from './content-matches.ts';
import * as Obsidian from 'obsidian';
import { moment } from '../shared/moment.ts';
import { SHEET_BREAKPOINT, MIN_PANEL_H, PILL_ICON_SIZE, EXT_ICON } from '../shared/constants.ts';
import { IconRenderer } from '../shared/icons.ts';
import { makeTouchHandler } from '../shared/touch.ts';

// One cohesive behavior; shared state belongs to SearchBarComponent.
export const withSnippets = Base => class extends Base {
_extractAllSnippets(content, terms, ctxLen = 35) {
            return extractContentMatches(content,terms,ctxLen);
        }

_highlightText(container, text, terms) {
            if (!terms || terms.length === 0) { container.appendText(text); return; }
            const positions = [];
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
            const merged = [{ ...positions[0] }];
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

_extractSnippet(content, query, contextLen = 35) {
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
