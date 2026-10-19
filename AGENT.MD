# Radar Search development rules

- Source, build scripts and tests use TypeScript. Keep the Obsidian runtime external to the bundle.
- Before publishing, run `bun install --frozen-lockfile`, `bun run check`, `bun test --timeout 5000`, and `bun run build`.
- `bun run check` includes the official Obsidian `no-static-styles-assignment`, `no-unsupported-api`, and `detach-leaves` rules. Keep them enabled; use CSS classes / `setCssStyles` / custom properties for styling, match `minAppVersion` to APIs used, and never detach workspace leaves in `onunload`.
- Use native Obsidian UI and icon APIs; keep the plugin independent of Iconize and external vault scripts.
- Do not commit personal settings, history, credentials, absolute local paths or generated release assets.
- Preserve the existing `primecore-search` plugin ID so installed settings and command shortcuts continue working; the public brand is **Radar Search**.
- Limit UI changes to the controls named in the request. The search-options capsule beside the input and individual search-result items are different controls; do not apply label changes globally.

## Runtime verification

- Use a dedicated clean vault with synthetic fixtures for integration tests; never leave test queries, notes or mock result rows in a personal vault.
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
