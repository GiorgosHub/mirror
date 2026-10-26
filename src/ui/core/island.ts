/* Two small conventions that keep effects safe in a framework-free UI (see docs/adr-001-ui-architecture.md).

   onDispose(node, fn): run fn once the node has left the document. Effects (WebGL contexts, listeners, frame
   subscriptions) register here, so re-rendering a screen can never leak them.

   island(render): a region that re-renders itself, morphing with a View Transition when motion is allowed, instead of
   asking the app to rebuild the whole screen. Focus and caret inside it survive the update. */
import { clear, withFocus } from "../dom.ts";

const registry = new Map<Node, (() => void)[]>();
let mo: MutationObserver | null = null;
let pending = false;

function sweep() {
  pending = false;
  for (const [node, fns] of registry) if (!node.isConnected) { registry.delete(node); for (const f of fns) try { f(); } catch { /* keep going */ } }
  if (!registry.size && mo) { mo.disconnect(); mo = null; }
}

export function onDispose(node: Node, fn: () => void) {
  const list = registry.get(node);
  if (list) list.push(fn); else registry.set(node, [fn]);
  if (!mo && typeof MutationObserver !== "undefined") {
    mo = new MutationObserver(() => { if (!pending) { pending = true; queueMicrotask(sweep); } });
    mo.observe(document.body, { childList: true, subtree: true });
  }
}

const reduced = () => document.documentElement.dataset.motion === "reduce";

export interface Island { el: HTMLElement; update(): void }
export function island(render: () => Node, cls = "island"): Island {
  const el = document.createElement("div");
  el.className = cls;
  el.append(render());
  const swap = () => withFocus(el, () => { clear(el); el.append(render()); });
  return {
    el,
    update() {
      const doc = document as Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void>; ready?: Promise<void>; updateCallbackDone?: Promise<void> } };
      if (reduced() || !doc.startViewTransition || document.hidden || !el.isConnected) { swap(); return; }
      document.documentElement.dataset.vt = "state";
      const t = doc.startViewTransition(swap);
      t.ready?.catch(() => {}); t.updateCallbackDone?.catch(() => {});
      void t.finished.catch(() => {}).finally(() => { delete document.documentElement.dataset.vt; });
    },
  };
}
