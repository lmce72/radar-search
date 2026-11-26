import type {SearchItem} from '../types.ts';

/** Shared second line: metadata and the original file path, both start-aligned.
 * 共用次行模板：元信息与原文件路径均靠左。 */
export function renderResultDetails(parent: HTMLElement, item: SearchItem): void {
  if (!item.sub && !item.tagList?.length && !item.path) return;
  const row = parent.createDiv({cls: 'primecore-result-details'});
  const directory = item.path?.includes('/') ? item.path.slice(0, item.path.lastIndexOf('/')) : '/';
  const summary = item.sub !== item.path && item.sub !== directory ? item.sub : '';
  if (summary || item.tagList?.length) {
    const meta = row.createDiv({cls: 'primecore-result-summary'});
    if (summary) meta.createSpan({cls: 'primecore-result-summary-text', text: summary, attr: {title: summary}});
    for (const tag of item.tagList || []) meta.createEl('a', {cls: 'tag', text: tag});
  }
  if (item.path) row.createSpan({cls: 'primecore-result-path', text: item.path, attr: {title: item.path}});
}
