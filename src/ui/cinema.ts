/* The cinematic layer: every main screen opens with a full-bleed title scene over its own film.
   Films (public/media/<name>.{webm,mp4,jpg,webp}) are slots: the Higgsfield films replace the placeholder loops by name.
   - Video only when: the setting allows it, motion isn't reduced, the screen is wider than a phone, and the
     connection isn't in data-saver mode. Otherwise the still.
   - Always muted, hidden from assistive tech, paused off-screen and in hidden tabs, faded in once it actually plays
     (no pop), with a visible pause control (moving content longer than 5 seconds must be pausable).
   - The layout never depends on it: if the files fail, the gradient and ink remain. Never behind working content. */
import type { App } from "./app.ts";
import { h } from "./dom.ts";
import { tr } from "../i18n.ts";

export type Film = "possibility-field" | "branching-light" | "threshold" | "horizon" | "convergence";
const SRC = (f: Film) => `media/${f}`; /* relative: works at a site root and inside the embedded preview */

/* one pause preference for every film on every screen */
let userPaused = false;
/* Films persist across re-renders: the same element is moved into the new view, so playback continues from where it
   was instead of restarting on every click. Bounded by the number of films. */
const live = new Map<string, HTMLElement>();

export function cinema(app: App, film: Film = "possibility-field", opts: { still?: boolean } = {}): HTMLElement | null {
  const mode = app.store.settings.cinema;
  if (mode === "off") return null;
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  const still = opts.still || mode === "still" || app.reducedMotion || !!conn?.saveData || matchMedia("(max-width: 760px)").matches;
  const key = `${film}:${still ? "s" : "v"}`;
  const cached = live.get(key);
  if (cached) { queueMicrotask(() => { const v = cached.querySelector("video"); if (v && !userPaused) void v.play().catch(() => {}); }); return cached; }

  const img = h("img", { src: `${SRC(film)}.jpg`, alt: "", decoding: "async", onerror: (e: Event) => ((e.target as HTMLElement).style.visibility = "hidden") });
  const poster = h("picture", null, h("source", { srcset: `${SRC(film)}.webp`, type: "image/webp" }), img);
  img.addEventListener("load", () => img.classList.add("in"), { once: true });
  if (img.complete) img.classList.add("in");
  const wrap = h("div", { class: "cinema", "aria-hidden": "true", "data-film": film }, poster);
  if (still) { live.set(key, wrap); return wrap; }

  const video = h("video", { muted: true, loop: true, playsInline: true, autoplay: !userPaused, preload: "metadata", disablePictureInPicture: true, tabindex: "-1" },
    h("source", { src: `${SRC(film)}.webm`, type: "video/webm" }),
    h("source", { src: `${SRC(film)}.mp4`, type: "video/mp4" }));
  video.muted = true;
  video.addEventListener("playing", () => video.classList.add("in"));
  video.addEventListener("error", () => video.remove(), true);

  const btn = h("button", { class: "cinema-toggle", type: "button", "aria-pressed": String(userPaused) }, userPaused ? "Play background" : "Pause background");
  btn.addEventListener("click", () => {
    userPaused = !userPaused;
    for (const el of live.values()) {
      const b = el.querySelector<HTMLButtonElement>(".cinema-toggle"), v = el.querySelector("video");
      b?.setAttribute("aria-pressed", String(userPaused)); if (b) b.textContent = tr(userPaused ? "Play background" : "Pause background");
      if (v) { if (userPaused) v.pause(); else if (el.isConnected) void v.play().catch(() => {}); }
    }
  });
  const holder = h("div", { class: "cinema-holder" }, wrap, btn);
  wrap.append(video);

  const io = new IntersectionObserver(([e]) => { if (!e) return; if (e.isIntersecting && !userPaused) void video.play().catch(() => {}); else video.pause(); }, { threshold: 0.05 });
  io.observe(wrap);
  document.addEventListener("visibilitychange", () => { if (document.hidden) video.pause(); else if (!userPaused && holder.isConnected) void video.play().catch(() => {}); });
  live.set(key, holder);
  return holder;
}

export const filmsPaused = () => userPaused;

/* A title scene: full-bleed film, eyebrow, film-title headline, a credits row of label/value pairs, and actions. */
export function scene(app: App, o: {
  film: Film; eyebrow: Node | string; title: string; titleId?: string; lead?: string;
  credits?: [string, Node | string][]; actions?: (Node | null)[]; size?: "full" | "tall" | "band"; still?: boolean; after?: Node | null; level?: 1 | 2;
}): HTMLElement {
  return h("section", { class: `scene scene-${o.size ?? "tall"}`, "aria-labelledby": o.titleId ?? "scene-title" },
    cinema(app, o.film, { still: !!o.still }),
    h("div", { class: "wrap scene-in" },
      h("p", { class: "eyebrow" }, o.eyebrow),
      h(o.level === 2 ? "h2" : "h1", { class: "title", id: o.titleId ?? "scene-title" }, o.title),
      o.lead ? h("p", { class: "lead" }, o.lead) : null,
      o.credits?.length ? h("dl", { class: "credits" }, ...o.credits.map(([k, v]) => h("div", null, h("dt", null, k), h("dd", null, v)))) : null,
      o.actions?.some(Boolean) ? h("div", { class: "scene-actions" }, ...o.actions) : null,
      o.after ?? null));
}
