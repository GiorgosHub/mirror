/* Pointer effects that answer the person, installed once for the whole app.
   - Magnetic: large primary buttons lean a few pixels toward the pointer.
   - Liquid fill: buttons fill from the exact point the pointer entered (CSS reads --fx/--fy).
   - Drop: navigation remembers where you clicked, so the next screen spreads out from there (CSS reads --dx/--dy). */
import { reducedMotion } from "./loop.ts";

export function installPointerFx() {
  const root = document.documentElement;
  document.addEventListener("pointerdown", (e) => {
    root.style.setProperty("--dx", `${e.clientX}px`);
    root.style.setProperty("--dy", `${e.clientY}px`);
  }, { capture: true, passive: true });

  document.addEventListener("pointerover", (e) => {
    if (e.pointerType === "touch") return;
    const b = (e.target as Element | null)?.closest?.(".btn") as HTMLElement | null;
    if (!b || b.contains(e.relatedTarget as Node | null)) return;
    const r = b.getBoundingClientRect();
    b.style.setProperty("--fx", `${((e.clientX - r.left) / r.width) * 100}%`);
    b.style.setProperty("--fy", `${((e.clientY - r.top) / r.height) * 100}%`);
  }, { passive: true });

  let raf = 0, last: PointerEvent | null = null, held: HTMLElement | null = null;
  const release = () => { if (held) { held.style.translate = ""; held = null; } };
  document.addEventListener("pointermove", (e) => {
    if (e.pointerType === "touch" || reducedMotion()) return;
    last = e;
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const ev = last!;
      const b = (ev.target as Element | null)?.closest?.(".btn-lg, .hdr-cta") as HTMLElement | null;
      if (b !== held) release();
      if (!b) return;
      held = b;
      const r = b.getBoundingClientRect();
      const x = (ev.clientX - (r.left + r.width / 2)) * 0.18, y = (ev.clientY - (r.top + r.height / 2)) * 0.3;
      b.style.translate = `${Math.max(-8, Math.min(8, x)).toFixed(1)}px ${Math.max(-6, Math.min(6, y)).toFixed(1)}px`;
    });
  }, { passive: true });
  document.addEventListener("pointerleave", release);
}
