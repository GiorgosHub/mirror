# ADR-001: UI architecture for v5

**Status:** Accepted · **Date:** 2026-10-26 · **Deciders:** George (product), Claude (build)

## Context
- The domain layer (zod schemas, engine, store, brief, i18n) is solid and covered by 21 unit tests and 30 browser checks.
- The UI layer had grown by accretion: one 950-line stylesheet, colour tokens named after hues (`--cyan`, `--violet`)
  instead of meanings, motion bolted on by selector lists, and every interaction re-rendering the whole screen. That last
  one blocks real effects: clicking the website demo rebuilt the whole page, which would restart a WebGL scene.
- The package registry is unreachable from the build environment. Available offline: esbuild, TypeScript, zod,
  Playwright, React 19 *without* its type definitions.

## Decision
Stay framework-free, and give the UI layer real structure:
1. **Islands.** A region re-renders itself (`island()` in `src/ui/core/island.ts`) instead of asking the app to rebuild the
   screen. The website demo is an island; the hero never re-renders.
2. **Lifecycle.** Effects register a cleanup with the node they belong to (`onDispose`). When a node leaves the DOM the
   cleanup runs. No leaked loops, listeners or GL contexts.
3. **One frame loop** (`src/fx/loop.ts`): every animation subscribes; the loop sleeps when nothing is visible or the tab is
   hidden.
4. **Effects as modules** in `src/fx/`: `liquid/` (ripple simulation + WebGL2 renderer + text source), `scroll.ts`
   (section progress as CSS variables), `magnetic.ts`, `drop.ts` (page transition).
5. **Website as section modules** in `src/site/`, one file per section.
6. **Layered CSS**: `src/styles/index.css` declares `@layer tokens, base, components, app, site, fx;` and imports one file
   per layer. Colour tokens are semantic (`--known`, `--assumed`, `--speculative`, `--broken`, `--text`, `--surface`).

## Options considered

### A. React 19 + JSX
| Dimension | Assessment |
|---|---|
| Complexity | High: rewrite every view |
| Type safety | Lost: no `@types/react` offline, JSX would be `any` |
| Risk | High: 30 browser checks would be re-earned from scratch |
**Pros:** familiar, ecosystem. **Cons:** no types, full rewrite, no gain for effects (they're imperative anyway).

### B. Framework-free with islands, lifecycle and layered CSS (chosen)
| Dimension | Assessment |
|---|---|
| Complexity | Medium: new core (~150 lines), site rewritten, app re-skinned |
| Type safety | Full strict TypeScript |
| Risk | Low: app behaviour and tests carry over |
**Pros:** keeps tested behaviour, effects get stable DOM. **Cons:** our own conventions to document.

### C. Keep the structure, restyle only
Fast, but the whole-screen re-render keeps fighting the effects and the CSS stays one file.

## Consequences
- Easier: adding effects safely; changing the palette (tokens are meanings); testing sections in isolation.
- Harder: new contributors learn three small conventions (island, onDispose, loop).
- Revisit: if the registry becomes available, React or Preact can wrap the same islands; the WebGL module is
  framework-agnostic.
