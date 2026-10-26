/* One frame loop for every animation. It runs only while something is subscribed and the tab is visible. */
export type Tick = (time: number, dt: number) => void;
const subs = new Set<Tick>();
let raf = 0, last = 0;

function run(t: number) {
  const dt = Math.min(0.05, last ? (t - last) / 1000 : 1 / 60);
  last = t;
  for (const f of [...subs]) f(t, dt);
  raf = subs.size && !document.hidden ? requestAnimationFrame(run) : 0;
}
function wake() { if (!raf && subs.size && !document.hidden) { last = 0; raf = requestAnimationFrame(run); } }
if (typeof document !== "undefined") document.addEventListener("visibilitychange", wake);

export function frame(fn: Tick): () => void {
  subs.add(fn);
  wake();
  return () => { subs.delete(fn); };
}

export const reducedMotion = () => document.documentElement.dataset.motion === "reduce";
export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
