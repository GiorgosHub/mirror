# MIRROR

**Meet the futures you could make.** A local-first app for exploring one decision at a time:
alternatives → possible futures → trade-offs → experiments → a choice → reflection.
MIRROR doesn't predict and won't choose for you. Every future is marked as *known*, *assumed* or *speculative*,
and every conclusion shows what it rests on.

## Run it

Needs Node 20+.

```
npm install
npm run build        # bundles into dist/
npm start            # http://localhost:4173  (serves dist/ + /api, same as Vercel)
npm run dev          # rebuild on change + server
```

Checks:

```
npm run typecheck    # strict TypeScript
npm test             # 21 unit tests: engine (English and Greek), storage, brief, API
npm run e2e          # 30 browser checks (needs a build; uses Playwright Chromium)
npm run check        # all of the above
```

`node scripts/embed.mjs` builds `dist-embed/`, a single self-contained page used for the hosted preview.

## Optional: real AI analysis

Without a key, MIRROR uses its **demonstration rules**: a transparent, rule-based engine on the device, labelled
"Demo analysis · not AI" everywhere. With a key, the server calls a model:

| Variable | Meaning |
|---|---|
| `ANTHROPIC_API_KEY` | Enables Server AI. Server-side only; never sent to the browser. |
| `MIRROR_MODEL` | Model id (default `claude-sonnet-5-5`). |
| `MIRROR_AI_PROVIDER` | Provider name (default `anthropic`). Add others in `functions/_lib/ai.ts`. |

Then choose **Settings → Analysis engine → Server AI**. Responses are schema-validated and checked against the
decision's own alternatives; a failed or invalid response never changes saved work.

## Deploy (Vercel)

`npm run build` on Vercel also writes `.vercel/output` (Build Output API, `scripts/vercel-output.mjs`): the static site,
the API handlers bundled into self-contained functions at `/api/analyze` and `/api/health`, and a strict CSP. Set the variables above in
the project if you want Server AI.

## Architecture

```
src/domain/   types.ts (zod schemas = single source of truth) · engine.ts (demo rules, deriveView, trade-offs, next step) · brief.ts
src/data/     store.ts: localStorage, validated on load/save, corrupt-data backup, export/import/delete
src/ai/       provider.ts: demo | server providers, response validation
src/site/     the website, one module per section: hero, story, demo, language, principles, faq, closing
src/fx/       loop.ts (one frame loop) · scroll.ts (pinned/through progress) · liquid.ts (WebGL2 mirror) · pointer.ts
src/ui/       app.ts (shell, router, dialogs, mark) · core/island.ts (islands + onDispose) · cinema.ts · views/ (home, create, lab, other)
src/styles/   index.css → @layer tokens, base, components, app, site, fx (one file per layer)
src/          i18n.ts (L(), tr(), language state) · i18n-el.ts (Greek dictionary)
functions/    analyze.ts, health.ts, _lib/ai.ts (provider abstraction + prompts), served at /api/*
server/       dev.mjs: local static + API server
scripts/      build.mjs, embed.mjs, field/ (renders the cinematic loop)
tests/, e2e/
```

Key decisions:
- **No framework, no runtime dependencies besides zod.** The registry was unreachable in the build environment, and the
  app doesn't need one: a ~20-line DOM helper, uncontrolled inputs (typing never loses focus), re-render on actions.
  ~172 KB JS / 47 KB CSS before compression.
- **Facts, assumptions and inferences are separate types.** Outcomes and priority fits store which assumptions they
  depend on; `deriveView()` applies the user's judgements (holds / unknown / doubtful / not true) deterministically,
  for demo and AI analyses alike. That is what makes "change an assumption, see what moves" work.
- **No numbers that pretend to be knowledge.** No scores, percentages or probabilities. Comparison uses
  strong / mixed / weak / unclear with reasons, and trade-off text names what couldn't be compared.
- **Local-first and honest about it.** No accounts, sync or analytics. Export/import JSON; delete everything with typed
  confirmation.
- **PWA.** Manifest, icons, offline app shell via service worker (video is never pre-cached).

## Website and app

- `#/` is the **product website**: hero film, why MIRROR, how it works, a **live Future Lab demo** running the real
  engine on an in-memory example (nothing saved), the language for uncertainty, principles, features, FAQ, final call,
  footer. Website navigation scrolls to sections; phones get a menu instead of the app's tab bar.
- `#/app` is the **tool** (dashboard), with the Future Lab, steps, brief, history and settings under it.
- `npm run build` also pre-renders the website's markup into `dist/index.html` (via Playwright, skipped if
  unavailable), so search engines and link previews see real content. Open Graph tags use the hero still.

## Languages

English is the source and the default; Greek is complete. Switch with **EN | ΕΛ** in the header (website and app) or in
Settings; the choice is saved on the device and sets `<html lang>`.
- Static UI text is translated as it's created: the DOM helper passes every string child and every `aria-label`,
  `placeholder`, `title` and `alt` through `tr()` (a no-op in English, a dictionary lookup in Greek, `src/i18n-el.ts`).
  What the user types (input values) is never touched.
- Sentences with live values use `L(en, el)` at the call site, with Greek plurals and cases handled there.
- **Analyses are written in a language.** The demo rules have a Greek template library (with the right article and
  case for each time slot), Greek keyword matching (accent-insensitive), Greek trade-off and next-step sentences, and a
  Greek brief. `Analysis.lang` records the language; Map again rewrites it in the current one. Server AI is told to
  write in Greek when Greek is active.
- Bricolage Grotesque has no Greek, so Greek letters come from Inter Display (titles) and Inter (text), subset and
  loaded only when Greek is on screen (`unicode-range`). Both OFL.
- An e2e check sweeps every screen in Greek for leftover English and for sideways overflow, on desktop and phone.

## The mark

A lens: a point of light on the horizon line, two futures branching up, and their fainter reflection below, inside one
ring. In the header it draws itself in (ring, horizon, then the two futures), the light breathes, and on hover the ring
turns and the futures branch again. It's in the footer too, and in `public/icons/` (favicon, app and maskable icons).

## Design (v5: liquid mirror)

Full plan in `docs/design-v5.md`, architecture in `docs/adr-001-ui-architecture.md`.
- **Identity:** monochrome metal (graphite `#1C1F24`, pewter, silver, mirror `#F2F4F7`). Colour appears only for doubt
  and broken futures (signal `#FF6A2B`), so it always means something. Bricolage Grotesque for titles, Inter for text.
  No caps labels, no arrows on buttons, no glows, no blur.
- **The signature:** the hero question is reflected in a pool of liquid metal (WebGL2: CPU wave simulation + reflection
  shader). The pointer ripples it; the reflection drifts apart into three futures. The footer has a second pool
  reflecting the word "mirror". Without WebGL2 or with reduced motion, a still CSS reflection stands in.
- **Effects throughout, each answering something:** a pinned story that draws one decision splitting as you scroll;
  futures that crack in the live example when an assumption breaks; a bead of mercury that teaches the line language;
  principles that rise out of their reflections; buttons that fill from the pointer's entry point and lean toward it;
  screens that spread out like a drop from where you clicked; a header that steps aside while you read down.
- **Line language:** known = solid mirror, assumed = silver long dash, speculative = pewter dots, broken = signal.
- **Reduced motion** (system or Settings): nothing is pinned, nothing waits for the scroll, no WebGL.

## Tools
- **Lovable:** project "Meet Your Futures": a cinematic redesign concept. Adopted: condensed film-title type, mono
  credits, futures as points of light whose line style encodes state, sliding judgement pills. Not adopted: its code
  (React/Tailwind/framer-motion; MIRROR stays dependency-free) and amber primary buttons (amber means doubt here).
  Earlier, a decision-intake prototype contributed four interaction ideas.
- **v0:** out of credits (403) both times; not used.
- **Higgsfield:** this connection can read the catalog but not generate. Films are placeholder loops rendered in code,
  in named slots the Higgsfield films replace (see `docs/cinematic.md`). In v5 they're shown in greyscale inside the
  app's title scenes; the website uses the liquid mirror instead.

## Limitations

- Demo rules know nothing about your field beyond what you type. They read the option's wording, your constraints,
  notes and unknowns, and say so.
- Data lives in one browser. Clearing site data deletes it; export to keep a copy.
- Server AI path is unit-tested with a mocked provider; not tested against a live model or on Vercel.
- The five films are placeholders rendered in code until the Higgsfield films are dropped in (`docs/cinematic.md`).
- In the hosted preview, downloads and printing are blocked by the host; Export/Markdown show copyable text instead.
