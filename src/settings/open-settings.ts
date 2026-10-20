import type {App} from 'obsidian';

/** Obsidian's settings navigator is not part of the public App type. Validate the boundary. */
interface SettingsNavigator { open(): void; openTabById(id: string): void }
function isSettingsNavigator(value: unknown): value is SettingsNavigator {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as SettingsNavigator;
  return typeof candidate.open === 'function' && typeof candidate.openTabById === 'function';
}
export function openPluginSettings(app:App,pluginId:string) {
  const settings:unknown=Reflect.get(app,'setting');
  if(!isSettingsNavigator(settings)) {
    throw new Error('当前 Obsidian 无法打开插件设置，请从设置中的社区插件列表进入。');
  }
  settings.open();settings.openTabById(pluginId);
}
