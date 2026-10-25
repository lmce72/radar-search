import {test, expect} from 'bun:test';
import {proximityScore, relevanceScore} from '../src/search/proximity.ts';
import {extractContentMatches} from '../src/search/content-matches.ts';
import {sortSearchItems} from '../src/search/sort.ts';

test('exact phrase outranks nearby terms, which outrank far-apart terms', () => {
  const exact = proximityScore('by the time we left', 'by the time'.split(' '));
  const close = proximityScore('by now the time', 'by the time'.split(' '));
  const far = proximityScore('by something else entirely and then the time', 'by the time'.split(' '));
  expect(exact).toBeGreaterThan(close);
  expect(close).toBeGreaterThan(far);
  expect(relevanceScore('by something else', 'by the time'.split(' '))).toBeGreaterThan(0);
});

test('content snippets put the closest phrase first', () => {
  const text = 'by something long and unrelated\n'.repeat(2) + 'and by the time we arrived the door was open';
  const hits = extractContentMatches(text, ['by', 'the', 'time'], 20);
  expect(hits.length).toBeGreaterThan(0);
  expect(hits[0].text).toContain('by the time');
});

test('relevance sorting is descending and stable for unscored items', () => {
  const items = [{label: 'low', score: 1}, {label: 'high', score: 9}, {label: 'mid', score: 3}];
  expect(sortSearchItems(items, 'relevance', () => null).map(item => item.label)).toEqual(['high', 'mid', 'low']);
  const plain = [{label: 'a'}, {label: 'b'}];
  expect(sortSearchItems(plain, 'relevance', () => null)).toBe(plain);
});
