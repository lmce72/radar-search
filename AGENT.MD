# Radar Search development rules

- Source, build scripts and tests use TypeScript. Keep the Obsidian runtime external to the bundle.
- Before publishing, run `bun install --frozen-lockfile`, `bun run check`, `bun test --timeout 5000`, and `bun run build`.
- `bun run check` includes the official Obsidian `no-static-styles-assignment`, `no-unsupported-api`, and `detach-leaves` rules. Keep them enabled; use CSS classes / `setCssStyles` / custom properties for styling, match `minAppVersion` to APIs used, and never detach workspace leaves in `onunload`.
- Use native Obsidian UI and icon APIs; keep the plugin independent of Iconize and external vault scripts.
- Do not commit personal settings, history, credentials, absolute local paths or generated release assets.
- The plugin ID is `radar-search` and the installation folder must match it. The fenced block language `primecore-search` and CSS class prefix stay unchanged for note compatibility.
- Limit UI changes to the controls named in the request. The search-options capsule beside the input and individual search-result items are different controls; do not apply label changes globally.

## Runtime verification

- Use an empty throwaway vault with synthetic fixtures for every UI, settings and icon-picker check; never mount test builds, resize windows or leave drafts in the personal AstroScope vault.
- Verify complete mounting, error reports, event binding, async query cancellation, and cleanup. A visible search bar alone does not demonstrate successful initialization.
- Exercise both floating and page presentations, empty results, filters and presets, plus failure recovery when those paths change.
- For embedded-search changes, test real primecore-search fenced blocks in Reading and Live Preview, multiple instances in one note, and note/mode switches; an isolated mount alone does not cover editor interaction.
- Bound page results to the view and floating layers to the visual viewport, reserving visible mobile bottom controls and safe areas. Do not rely only on window.innerHeight or a fixed bottom offset. Distinguish layout checks from real-device touch testing.
- Keep accents and match highlights in theme CSS variables. Preserve native TextComponent styling for URL templates with inputMode, and native dropdown classes/arrow padding.

## Releases

- **GitHub Release titles and Git tags must contain only the exact version from `manifest.json.version`.** For example, the manifest version, Release title and tag must all be `1.1.0`.
- Never add a `v` prefix, plugin name, descriptive text or other suffix/prefix to a Release title or tag. Use `--title "$RELEASE_VERSION"` when publishing with `gh`.
- Keep `package.json`, `manifest.json` and `versions.json` consistent.
- Run `bun run release:check <version>` before tagging. The tag must exactly equal `manifest.json.version`.
- Update `RELEASE_NOTES.md`, then publish `dist/main.js`, `dist/manifest.json` and `dist/styles.css` as GitHub Release assets.
- Never include `data.json` or search history in a release.

## Type boundaries

- Keep settings, persistence, navigation and search/index contracts explicitly typed in `src/types.ts` and `src/search/types.ts`.
- Use `unknown` at untrusted boundaries and validate input before saving. Do not bypass checking with `@ts-nocheck`, `@ts-ignore` or `as any`.
- Dynamic UI behaviors are composed through one constructor boundary in `src/ui/search-bar.ts`; retain the common `Component` lifecycle contract when editing mixins.

## Review checks and typing

- `bun run check` also runs `bun run lint:review`, which applies `eslint-plugin-obsidianmd`'s type-checked `recommended` rules from `eslint.review.mjs` with `--max-warnings 0`. Keep the source at zero warnings; do not suppress findings with `eslint-disable`. The only permitted explicit `any` is the mixin constructor alias in `types/mixin.d.ts`.
- Declare behavior mixins as `<T extends SearchBarCtor>(Base: T) => class extends Base`, and register every shared field and method in `SearchBarHost` (`src/ui/search-bar-host.ts`). Never add untyped `declare _field;` members.
- Treat `JSON.parse`, frontmatter, request payloads and other external values as `unknown`; narrow them before use. Format display text with `toText()` from `src/shared/text.ts`, never `String(value)` on an `unknown`.
- Mark intentionally ignored promises with `void`; do not return promises from DOM event handlers. Nullable DOM references that may not be built yet must exclude both `null` and `undefined`.
- `SearchSettingTab.getSettingDefinitions()` intentionally returns `[]` because the tab renders its custom nested editor in `display()`. Do not add declarative definitions without verifying that Obsidian still renders the custom UI.
