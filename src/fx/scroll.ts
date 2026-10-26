/* Scroll progress, for scenes that play as you scroll.
   pinned(section, cb): the section is tall and its stage is sticky; progress runs 0 → 1 while the stage is pinned.
   through(el, cb): progress 0 → 1 while the element travels from entering the bottom of the viewport to leaving the top.
   Both also write --p on the element for CSS. Listeners are passive and throttled to one frame. */
import { clamp } from "./loop.ts";
import { onDispose } from "../ui/core/island.ts";

type Cb = (p: number) => void;
function watch(el: HTMLElement, measure: (r: DOMRect, vh: number) => number, cb: Cb) {
  let raf = 0, lastP = -1;
  const update = () => {
    raf = 0;
    if (!el.isConnected) return;
    const p = clamp(measure(el.getBoundingClientRect(), innerHeight));
    if (Math.abs(p - lastP) < 0.0005) return;
    lastP = p;
    el.style.setProperty("--p", p.toFixed(4));
    cb(p);
  };
  const on = () => { if (!raf) raf = requestAnimationFrame(update); };
  addEventListener("scroll", on, { passive: true });
  addEventListener("resize", on);
  requestAnimationFrame(update);
  onDispose(el, () => { removeEventListener("scroll", on); removeEventListener("resize", on); cancelAnimationFrame(raf); });
}

export const pinned = (el: HTMLElement, cb: Cb) => watch(el, (r, vh) => -r.top / Math.max(1, r.height - vh), cb);
export const through = (el: HTMLElement, cb: Cb) => watch(el, (r, vh) => (vh - r.top) / (vh + r.height), cb);
