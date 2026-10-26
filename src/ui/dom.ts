/* A tiny, typed DOM helper. No framework: the app re-renders a view on discrete actions and keeps text
   inputs uncontrolled, so typing never loses focus or caret. */
import { locale, tr } from "../i18n.ts";

/* Static UI text is translated as it's created: every string child and every human-readable attribute goes through
   tr(), which is a no-op in English and a dictionary lookup in Greek (see i18n-el.ts). Values set as properties
   (input values) are never touched, so what the user typed is never translated. */
const TR_ATTRS = new Set(["aria-label", "placeholder", "title", "alt"]);
const trText = (raw: string) => { const k = raw.trim(); if (!k) return raw; const out = tr(k); return out === k ? raw : raw.replace(k, out); };

type Child = Node | string | number | false | null | undefined | Child[];
type Props = Record<string, unknown> & { class?: string; style?: string; k?: string };

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props?: Props | null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "k") el.dataset.k = String(v);
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === "class") el.className = String(v);
    else if (k === "html") el.innerHTML = String(v); /* only ever used with static, trusted markup (icons) */
    else if (k in el && typeof v !== "string" && k !== "style") (el as unknown as Record<string, unknown>)[k] = v;
    else el.setAttribute(k, v === true ? "" : TR_ATTRS.has(k) ? tr(String(v)) : String(v));
  }
  append(el, children);
  return el;
}

function append(el: Node, children: Child[]) {
  for (const c of children) {
    if (c === false || c === null || c === undefined) continue;
    if (Array.isArray(c)) append(el, c);
    else el.appendChild(typeof c === "object" ? c : document.createTextNode(typeof c === "string" ? trText(c) : String(c)));
  }
}

const SVGNS = "http://www.w3.org/2000/svg";
export function s(tag: string, attrs: Record<string, string | number | undefined> = {}, ...children: (SVGElement | null | false)[]): SVGElement {
  const el = document.createElementNS(SVGNS, tag) as SVGElement;
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined) el.setAttribute(k, String(v));
  for (const c of children) if (c) el.appendChild(c);
  return el;
}

export const icon = (name: keyof typeof ICONS, label?: string) =>
  h("span", { class: "ic", "aria-hidden": label ? undefined : "true", role: label ? "img" : undefined, "aria-label": label, html: ICONS[name] });

const P = (d: string) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
export const ICONS = {
  plus: P('<path d="M12 5v14M5 12h14"/>'),
  arrow: P('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  back: P('<path d="M19 12H5M11 6l-6 6 6 6"/>'),
  home: P('<path d="M4 11l8-6 8 6v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z"/>'),
  branch: P('<circle cx="5" cy="12" r="2"/><path d="M7 12c5 0 6-6 12-6M7 12h12M7 12c5 0 6 6 12 6"/>'),
  history: P('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>'),
  settings: P('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  doc: P('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>'),
  flask: P('<path d="M9 3h6M10 3v6L4.5 18.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3"/><path d="M7 15h10"/>'),
  check: P('<path d="M5 12l5 5 9-10"/>'),
  x: P('<path d="M6 6l12 12M18 6L6 18"/>'),
  edit: P('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/>'),
  save: P('<path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/>'),
  trash: P('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
  up: P('<path d="M12 19V5M6 11l6-6 6 6"/>'),
  down: P('<path d="M12 5v14M6 13l6 6 6-6"/>'),
  eye: P('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  spark: P('<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/>'),
  info: P('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'),
  print: P('<path d="M7 9V3h10v6M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2"/><path d="M7 14h10v7H7z"/>'),
  copy: P('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>'),
  archive: P('<path d="M3 5h18v4H3zM5 9v10h14V9M10 13h4"/>'),
  menu: P('<path d="M4 7h16M4 12h16M4 17h16"/>'),
} as const;

export function clear(el: Element) { while (el.firstChild) el.removeChild(el.firstChild); }

/* keep focus and caret across a re-render: elements opt in with data-k */
export function withFocus(root: Element, render: () => void) {
  const a = document.activeElement as HTMLElement | null;
  const key = a?.dataset?.k;
  const sel = a && "selectionStart" in a ? [(a as HTMLInputElement).selectionStart, (a as HTMLInputElement).selectionEnd] : null;
  render();
  if (!key) return;
  const n = root.querySelector<HTMLElement>(`[data-k="${CSS.escape(key)}"]`);
  if (!n) return;
  n.focus({ preventScroll: true });
  if (sel && "setSelectionRange" in n) try { (n as HTMLInputElement).setSelectionRange(sel[0] ?? null, sel[1] ?? null); } catch { /* not a text input */ }
}

export const fmtDate = (iso: string | undefined) => {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? iso + "T12:00:00" : iso);
  return isNaN(+d) ? iso : d.toLocaleDateString(locale(), { day: "numeric", month: "short", year: "numeric" });
};
export const daysFromNow = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
export const today = () => new Date().toISOString().slice(0, 10);

declare const __EMBED__: boolean;
export const EMBED = typeof __EMBED__ !== "undefined" && __EMBED__;

/* In the embedded preview the host blocks downloads, so the same button shows the file's text, ready to copy. */
export function download(name: string, text: string, type = "text/plain") {
  if (EMBED) {
    const ta = h("textarea", { class: "textarea", readonly: true, rows: 14, id: "dl-text", "aria-label": name, style: "font:12px/1.5 var(--mono)" });
    ta.value = text;
    const dlg = h("dialog", { "aria-labelledby": "dl-h" },
      h("div", { class: "dlg" },
        h("div", { class: "dlg-head" }, h("h2", { class: "h2 grow", id: "dl-h" }, name),
          h("button", { class: "btn btn-quiet icon-btn", type: "button", "aria-label": "Close", onclick: () => dlg.close() }, icon("x"))),
        h("div", { class: "dlg-body" }, h("p", { class: "small muted" }, "This preview can't save files. Copy the text below, or run MIRROR locally to download it."), ta),
        h("div", { class: "dlg-foot" }, h("button", { class: "btn btn-primary", type: "button", onclick: async (e: Event) => {
          try { await navigator.clipboard.writeText(text); (e.target as HTMLElement).textContent = tr("Copied"); } catch { ta.focus(); ta.select(); }
        } }, icon("copy"), "Copy"))));
    dlg.addEventListener("close", () => dlg.remove());
    document.body.append(dlg); dlg.showModal(); ta.focus(); ta.select();
    return;
  }
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h("a", { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
