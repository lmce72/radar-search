import {test, expect} from 'bun:test';
import {withPanel} from '../src/ui/options-panel.ts';
import {DEFAULT_SETTINGS} from '../src/settings/schema.ts';
import {SPECIAL_SEARCH_OPTIONS} from '../src/search/special-search-options.ts';
import type {SearchBarCtor} from '../src/ui/search-bar-host.ts';
import type {SpecialSearchKey} from '../src/search/special-search-options.ts';

const FakeBase = class {} as unknown as SearchBarCtor;

test('saving a default synchronizes existing pins without changing active session switches', async () => {
  for (const option of SPECIAL_SEARCH_OPTIONS) {
    const settings = structuredClone(DEFAULT_SETTINGS);
    const original = settings[option.key];
    const pin = {disabled: false};
    let release: () => void = () => {};
    const pending = new Promise<void>(resolve => { release = resolve; });
    let synced = 0;
    const fixture = Object.assign(new (withPanel(FakeBase))(), {
      [option.field]: original,
      _vaultSearchPanel: {querySelector: () => pin},
      _syncSearchDefaultPins: () => { synced++; },
      _log: () => { throw new Error('Unexpected save failure'); },
      plugin: {
        settings,
        components: new Map([['other', {component: {_syncSearchDefaultPins: () => { synced++; }}}]]),
        updateSetting: async (key: SpecialSearchKey, value: boolean) => { await pending; settings[key] = value; }
      }
    });
    const saving = fixture._toggleSearchDefault(option.key);
    expect(pin.disabled).toBe(true);
    expect(settings[option.key]).toBe(original);
    release(); await saving;
    expect(settings[option.key]).toBe(!original);
    expect(fixture[option.field]).toBe(original);
    expect(synced).toBe(1);
    expect(pin.disabled).toBe(false);
  }
});

test('failed default writes keep defaults and session state and allow a retry', async () => {
  const settings = structuredClone(DEFAULT_SETTINGS);
  const pin = {disabled: false};
  const errors: unknown[][] = [];
  const fixture = Object.assign(new (withPanel(FakeBase))(), {
    _searchTags: false,
    _vaultSearchPanel: {querySelector: () => pin},
    _log: (...args: unknown[]) => { errors.push(args); },
    plugin: {settings, components: new Map(), updateSetting: () => Promise.reject(new Error('Disk unavailable'))}
  });
  await fixture._toggleSearchDefault('searchTags');
  expect(settings.searchTags).toBe(true);
  expect(fixture._searchTags).toBe(false);
  expect(pin.disabled).toBe(false);
  expect(errors).toHaveLength(1);
  expect(errors[0][1]).toBe('默认搜索选项保存失败');
});
