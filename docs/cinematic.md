# MIRROR — cinematic assets

## Film slots

| Slot (file name in `public/media/`) | Where | Placeholder scene |
|---|---|---|
| `possibility-field` | Introduction (full screen) | `--scene=field` |
| `branching-light` | Home, "Now exploring" | `--scene=branch` |
| `threshold` | Decision steps | `--scene=threshold` |
| `horizon` | Future Lab title band | `--scene=horizon` |
| `convergence` | Future Lab and Home after a choice is recorded | `--scene=converge` |

Each slot needs `<name>.webm`, `<name>.mp4`, `<name>.jpg`, `<name>.webp`. Replace by name; no code changes.
Placeholders: `python3 scripts/field/render.py --scene=<scene>`.

## What ships now

`public/media/possibility-field.{webm,mp4,jpg,webp}` is an **original loop rendered for MIRROR in code**
(`scripts/field/render.html`, driven by `scripts/field/render.py`). It is not a Higgsfield generation.

- 10 s, 1280×720, 24 fps, seamless (every motion is periodic over the loop; first/last frame differ by < 1/255).
- WebM/VP9 240 KB, MP4/H.264 397 KB (faststart), poster JPG 31 KB / WebP 13 KB. No audio track.
- One point of light right of centre, hairline paths diverging, smoked-glass planes with edge light, slow camera drift.
  The left half is kept near-black for text.
- Re-render: `python3 scripts/field/render.py` (needs Playwright + ffmpeg).

### How it is used
- **Only** on the first-visit introduction (video) and the empty dashboard (still). Never behind the Future Lab.
- Video only on screens wider than 760px, without reduced motion and without data-saver; otherwise the still.
- Muted, looping, `playsinline`, `aria-hidden`, paused off-screen and in hidden tabs, with a visible Pause control.
- If the files fail, the page is unchanged apart from the image (tested in e2e).
- Settings → Cinematic background: Auto / Still image / Off.

## Why Higgsfield wasn't used for this build

Checked on 25 Oct 2026: the connected Higgsfield tools are read-only in this session (model catalog, balance,
history). The connector states it cannot generate media; the workspace is on the free plan with 10 credits.
No generation was started and nothing was bought.

## Ready-to-run Higgsfield brief

When generation is available, run these and drop the results in `public/media/` with the **same file names**
(the app needs no code change). Keep the left ~40% of the frame dark.

**Model:** Cinema Studio Video 3.0 (`cinematic_studio_3_0`), text-to-video. Alternative: Seedance 2.0.
**Settings:** 16:9, 1080p (export to 1280×720 for the web), 8–10 s, `generate_audio: false`, genre `auto`.
**Loop:** use the first frame as `end_image` (or crossfade the last second in ffmpeg) so it loops cleanly.

### 1. Possibility Field (intro background)
> Create a breathtaking premium cinematic motion environment for MIRROR, an advanced platform for exploring possible human futures. An immense dark architectural space made from translucent smoked glass, delicate geometric structures, and subtle volumetric atmosphere. At one central point, a single elegant white light emerges. Thin, luminous paths gradually branch outward in different directions, representing alternative futures. Some paths remain close together while others slowly diverge into the distance. Restrained electric violet and pale cyan accents travel gently along the paths. Elegant reflections, physically believable light diffusion, soft atmospheric depth, extraordinary material detail, sophisticated composition, premium science-fiction production design, slow continuous camera movement, almost imperceptible floating particles, emotionally evocative but calm. Deep near-black negative space behind the foreground interface, carefully controlled contrast, visually rich details concentrated away from essential text areas. Seamless, gradual motion designed for a looping website background. No cuts, no sudden movement, no flashing lights, no aggressive camera motion, no recognizable people, no text, no letters, no logos, no interface elements, no watermarks, no distracting focal object.

Add for framing: *"The point of light sits right of centre; the left 40% of the frame stays near-black."*

### 2. Branching Light (optional)
> A premium abstract cinematic environment in a deep ink-black space. A delicate web of elegant luminous paths expands from one single point into several distinct directions. The paths contain subtle pale cyan and electric violet light, with translucent glass-like structures and soft atmospheric depth. The camera moves slowly forward through the branching pathways, revealing new possible directions without fast movement or abrupt cuts. Beautiful physically based reflections, extraordinary restraint, refined editorial art direction, soft volumetric illumination, minimal but emotionally powerful composition. The visual language suggests clarity, exploration, and multiple possible futures. Continuous calm motion suitable for an ambient background. No words, no logos, no interface, no human subjects, no flashing lights, no chaotic particles, no abrupt camera movements.

**Decision:** not placed behind the Future Lab. The Lab's own branching map is the signature visual, and a moving
background there would compete with it and hurt legibility. If generated, the best use is the empty dashboard
or a social/share image.

### Encode for the web
```
ffmpeg -i in.mp4 -an -vf scale=1280:-2 -c:v libvpx-vp9 -b:v 0 -crf 40 -row-mt 1 public/media/possibility-field.webm
ffmpeg -i in.mp4 -an -vf scale=1280:-2 -c:v libx264 -preset slow -crf 27 -pix_fmt yuv420p -movflags +faststart public/media/possibility-field.mp4
ffmpeg -i in.mp4 -frames:v 1 -q:v 4 public/media/possibility-field.jpg
ffmpeg -i public/media/possibility-field.jpg -c:v libwebp -quality 78 public/media/possibility-field.webp
```
