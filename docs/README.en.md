# Radar Search

**Find notes, text, tags, commands, and web results from one place in Obsidian.**

[简体中文](../README.md) · [English](README.en.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md)

Open a floating search for a quick lookup, keep a search page open while you explore, or embed a search bar in your dashboard. No Dataview or icon plugin is required. The plugin's controls are currently in Chinese; this guide explains the main labels.

## What you can do

- Search note names, full text, tags, properties, bookmarks, internal links, and external links. Chinese text search is supported. Click a text excerpt to open its matching location.
- Switch result categories in the top bar, sort results, and exclude a note or any parent folder.
- Save filters as reusable presets, with folder completion and built-in rule examples.
- Move a floating search to a search page while keeping its query, category, filters, and sorting.
- Search commands and the web. Light and dark themes are supported, and page results scroll with room for mobile bottom controls.

## Install

Requires **Obsidian 1.7.2+**.

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/lmce72/obsidian-radar-search/releases/latest).
2. Put them in your vault's configuration folder under `plugins/primecore-search/` (normally `.obsidian/plugins/primecore-search/`).
3. Enable **Radar Search** in Settings → Community plugins.

To update, replace those three files and toggle the plugin off and on. Keep `data.json` and `history/` to preserve your settings and history.

## Start searching

In the command palette, choose **打开浮动搜索框** (open floating search) or **打开搜索页** (open search page). Assign separate hotkeys if you like. The ribbon icon opens floating search; Esc or an outside click closes it. A search page is useful for longer sessions and phones.

Choose Vault, global, or internet mode on the left. Vault and global searches update as you type; Enter searches immediately. Internet mode opens a search URL using Enter or the search button. The **搜索选项** capsule opens search options; its gear opens the plugin settings.

Category icons show their names on hover or keyboard focus. Tap an icon to switch on touchscreens. Empty categories are disabled; when everything is empty, “什么都木有” means there are no results. The filter remains available so you can clear restrictions.

### Embed in a note

Paste this fenced block into a note and use Reading view or Live Preview:

````markdown
```primecore-search
```
````

Multiple bars in one note are supported. The old DataviewJS script is a separate entry point and is not upgraded by this plugin.

## Filters and presets

Use a result item's folder-exclusion icon to exclude the note or one of its parent folders. Choose **临时过滤** (temporary filter) or **写入预设** (write to preset) at the top of the menu. Temporary filters affect only this search. The result toolbar filter provides a rule editor; **保存为预设** switches to a screen where you enter a preset name before saving.

| Example | Matches |
| --- | --- |
| `Projects/Archive` | That folder and its descendants |
| `path:Projects/[notes]` | A literal path, including brackets |
| `glob:**/assets/**` | assets folders at any depth, including the root |
| `glob:**/{assets,attachments,附件}/**` | Several attachment-folder names |
| `regex:/\.(png|jpe?g|gif|webp|svg|pdf)$/i` | Images and PDFs, ignoring case |
| `exclude:path:Work/assets` | A forced exclusion, also usable with an allowlist |

Use one rule per line. `**/assets/**` is a **glob**, not a regular expression: `*` stays within a path segment; `**` crosses folders. A blocklist excludes matches; an allowlist keeps matches. Rules in a list use “match any” logic. Regular expressions require `regex:`. Arbitrary native Obsidian search expressions are not supported. Invalid rules are rejected before saving.

Settings use tables and subpages rather than JSON. Click **应用** to apply an item edit, then **保存修改** to save its parent table. Returning without applying leaves that item unchanged.

## Data and privacy

Settings are stored in `data.json`, history in `history/`, and the content index in memory. The first search of a large vault may take time; a command is available to rebuild the index. The history-day limit changes what is displayed, not what is deleted.

There is no telemetry or reading outside your vault. **Global and internet modes can send your input to enabled search engines' suggestion endpoints.** Disable those engines or clear their suggestion URLs to prevent this. Executing a web search opens the chosen search URL. In-app web viewing needs Obsidian Web viewer; otherwise the external browser is used.

## Help

For missing results, check enabled sources, the selected category, presets, and temporary filters. For visual issues, compare with the default theme. Report problems in [Issues](https://github.com/lmce72/obsidian-radar-search/issues) with your plugin/Obsidian versions, device, theme, steps, and a screenshot with private information removed.

## Development and contributions

TypeScript source, Bun 1.3+ build tools; Obsidian supplies its runtime API.

```sh
bun install --frozen-lockfile
bun run check
bun test --timeout 5000
bun run build
```

Artifacts are written to `dist/`. UI, querying/indexing, settings, and history live in `src/ui/`, `src/search/`, `src/settings/`, and `src/history/`. Test in a separate vault, including floating/page search and real Reading/Live Preview embeds. Layout checks do not replace real-device touch testing.

See [AGENT.MD](../AGENT.MD) for release rules. Tags and release titles must be the exact manifest version, such as `1.3.5`, with no `v` prefix. Run `bun run release:check <version>` and publish only the three plugin files, never personal data.
