import {test, expect} from 'bun:test';
import {buildAliasItems, matchingAliases} from '../src/search/alias-items.ts';
import type {SearchBarHost} from '../src/ui/search-bar-host.ts';

test('alias values are narrowed, trimmed, deduplicated and matched independently', () => {
    expect(matchingAliases([' Work Plan ', 'work plan', 'Other', 42, {label:'work'}, ''], ['work', 'plan'], null)).toEqual(['Work Plan']);
    expect(matchingAliases('中文别名', ['别名'], null)).toEqual(['中文别名']);
    expect(matchingAliases(['work', 'plan'], ['work', 'plan'], null)).toEqual([]);
    expect(matchingAliases(null, ['work'], null)).toEqual([]);
    expect(matchingAliases(['Sparse alias', 'Other'], ['sa'], text => text === 'Sparse alias' ? {score:1,matches:[]} : null)).toEqual(['Sparse alias']);
});

test('alias rows preserve identical titles from distinct files, exclusions and original navigation', () => {
    const opened: string[][] = [];
    const files = ['Notes/Original.md', 'Notes/Second.md', 'Private/Secret.md'].map(path => ({path}));
    const host = {
        _getSearchableFiles: () => files,
        _vaultSortMode: 'relevance',
        app: {metadataCache: {getFileCache: () => ({frontmatter:{aliases:['Alias', 'Alias']}})}},
        _fileIconName: () => 'file',
        _openVaultResult: (path: string, label: string) => {opened.push([path,label]);}
    } as unknown as SearchBarHost;
    const rows = buildAliasItems(host, ['alias'], null, path => path.startsWith('Private/'));
    expect(rows).toHaveLength(2);
    expect(rows.map(row => [row.label,row.alias,row.path,row.sub])).toEqual([
        ['Alias',true,'Notes/Original.md','Notes/Original.md'],
        ['Alias',true,'Notes/Second.md','Notes/Second.md']
    ]);
    rows[1].action();
    expect(opened).toEqual([['Notes/Second.md','Alias']]);
});
