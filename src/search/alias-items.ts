import type {SearchBarHost, FuzzyFn} from '../ui/search-bar-host.ts';
import type {SearchItem} from '../types.ts';
import {proximityScore} from './proximity.ts';

// 只接受有效别名，避免把外部属性对象转换成显示文本。 / Accept valid alias strings only.
export function matchingAliases(raw: unknown, terms: string[], fuzzy: FuzzyFn | null): string[] {
    const values: unknown[] = Array.isArray(raw) ? raw : [raw];
    const seen = new Set<string>();
    const aliases: string[] = [];
    for (const value of values) {
        if (typeof value !== 'string' || !value.trim()) continue;
        const label = value.trim();
        const key = label.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        if (fuzzy ? !!fuzzy(label) : terms.every(term => key.includes(term))) aliases.push(label);
    }
    return aliases;
}

// 索引及回退搜索共用实时元数据，别名独立展示并始终打开原文件。
// Indexed and fallback search share live metadata; alias rows always open the original file.
export function buildAliasItems(host: SearchBarHost, terms: string[], fuzzy: FuzzyFn | null, isExcluded: (path: string) => boolean): SearchItem[] {
    const files = host._getSearchableFiles().filter(file => !isExcluded(file.path));
    const ordered = host._vaultSortMode === 'relevance' ? files : host._sortFiles(files, host._vaultSortMode);
    const items: SearchItem[] = [];
    for (const file of ordered) {
        const raw: unknown = host.app.metadataCache.getFileCache(file)?.frontmatter?.aliases;
        for (const label of matchingAliases(raw, terms, fuzzy)) {
            items.push({
                label, alias: true, path: file.path, sub: file.path, terms, twoLine: true,
                score: proximityScore(label, terms), icon: host._fileIconName(file),
                action: () => host._openVaultResult(file.path, label)
            });
        }
    }
    if (host._vaultSortMode === 'relevance') items.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    return items;
}
