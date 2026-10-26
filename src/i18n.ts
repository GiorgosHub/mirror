/* Languages. English is the source and the default; Greek is complete.
   - L(en, el): bilingual inline text, used wherever a sentence carries live values (counts, names, dates).
   - translateTree(): translates the static UI text of a freshly rendered screen (text nodes and labels) before it is
     shown, using the dictionary in i18n-el.ts. User content is never touched: it is marked data-i18n="no" or is
     typed into inputs, which this never reads.
   The domain layer uses L() too, so analyses are written in the language that was active when they were mapped. */
import { EL, EL_PATTERNS } from "./i18n-el.ts";

export type Lang = "en" | "el";
export const LANGS: Lang[] = ["en", "el"];
let current: Lang = "en";

export const getLang = () => current;
export function setLang(l: Lang) {
  current = l;
  if (typeof document !== "undefined") document.documentElement.lang = l;
}
export const L = (en: string, el: string) => (current === "el" ? el : en);
export const locale = () => (current === "el" ? "el-GR" : "en-US");

/* exact text, then patterns; returns null when there's no translation */
export function lookup(text: string): string | null {
  const hit = EL[text];
  if (hit !== undefined) return hit;
  for (const [re, fn] of EL_PATTERNS) { const m = text.match(re); if (m) return fn(m); }
  return null;
}
export const tr = (text: string) => (current === "el" ? lookup(text) ?? text : text);

const ATTRS = ["aria-label", "placeholder", "title", "alt"];
export function translateTree(root: Node) {
  if (current === "en") return;
  const skip = (n: Node | null): boolean => { for (let e = n instanceof Element ? n : n?.parentElement; e; e = e.parentElement) if (e.getAttribute("data-i18n") === "no") return true; return false; };
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text);
  for (const t of nodes) {
    const raw = t.nodeValue ?? "";
    const key = raw.trim();
    if (!key || !/[A-Za-z]/.test(key) || skip(t)) continue;
    const out = lookup(key);
    if (out !== null) t.nodeValue = raw.replace(key, out);
  }
  const els = root instanceof Element ? [root, ...root.querySelectorAll("*")] : root instanceof DocumentFragment ? [...root.querySelectorAll("*")] : [];
  for (const el of els) for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (v && /[A-Za-z]/.test(v) && !skip(el)) { const out = lookup(v.trim()); if (out !== null) el.setAttribute(a, out); }
  }
}

/* run fn with a language active, without touching the page (used to write an analysis in a chosen language) */
export function withLang<T>(l: Lang, fn: () => T): T {
  const prev = current;
  current = l;
  try { return fn(); } finally { current = prev; }
}
