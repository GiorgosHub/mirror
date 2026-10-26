/* The application shell: routing, header + mobile tab bar, toasts, dialogs, theme and motion preferences,
   and the analysis runner. Views are plain functions that return DOM. */
import { getLang, L, type Lang, setLang, tr } from "../i18n.ts";
import { AnalysisError, demoProvider, serverProvider, serverStatus, type ServerStatus } from "../ai/provider.ts";
import { Store } from "../data/store.ts";
import { type Decision, toInput } from "../domain/types.ts";
import { clear, h, icon, withFocus } from "./dom.ts";
import { installPointerFx } from "../fx/pointer.ts";

export type Route =
  | { name: "site" } | { name: "home" } | { name: "intro" } | { name: "new"; id: string } | { name: "lab"; id: string; tab: LabTab }
  | { name: "brief"; id: string } | { name: "history"; id?: string } | { name: "settings" } | { name: "missing" };
export type LabTab = "futures" | "compare" | "assumptions" | "experiments" | "journal";
const TABS: LabTab[] = ["futures", "compare", "assumptions", "experiments", "journal"];

export function parse(hash: string): Route {
  const [path = "", q = ""] = hash.replace(/^#/, "").split("?");
  const parts = path.split("/").filter(Boolean);
  const params = new URLSearchParams(q);
  switch (parts[0]) {
    case undefined: return { name: "site" };
    case "intro": return { name: "site" };
    case "app": return { name: "home" };
    case "new": return parts[1] ? { name: "new", id: parts[1] } : { name: "home" };
    case "lab": { const t = params.get("tab") as LabTab; return parts[1] ? { name: "lab", id: parts[1], tab: TABS.includes(t) ? t : "futures" } : { name: "home" }; }
    case "brief": return parts[1] ? { name: "brief", id: parts[1] } : { name: "home" };
    case "history": return parts[1] ? { name: "history", id: parts[1] } : { name: "history" };
    case "settings": return { name: "settings" };
    default: return { name: "missing" };
  }
}

export interface LabUI { alt?: string; outcome?: string; flash?: string[]; drawn?: boolean }

export type View = (app: App, route: Route) => Node;

export const SITE_LINKS = (): [string, string][] => [["story", L("How it works", "Πώς δουλεύει")], ["demo", L("Example", "Παράδειγμα")], ["faq", L("Questions", "Ερωτήσεις")]];

export class App {
  store: Store;
  route: Route = { name: "home" };
  server: ServerStatus | null = null;
  lab = new Map<string, LabUI>();
  analyzing = new Set<string>();
  private views: Partial<Record<Route["name"], View>> = {};
  private viewEl!: HTMLElement;
  private toastsEl!: HTMLElement;
  private savedEl!: HTMLElement;
  private liveEl!: HTMLElement;
  private menuEl!: HTMLDetailsElement;
  /* website section links scroll smoothly instead of changing the route */
  toSection(e: Event, id: string) {
    e.preventDefault();
    const go = () => document.getElementById(id)?.scrollIntoView({ behavior: this.reducedMotion ? "auto" : "smooth", block: "start" });
    if (this.route.name !== "site") { this.nav("#/"); setTimeout(go, 80); } else go();
  }
  /* screen-reader announcement that survives re-renders */
  announce(msg: string) { this.liveEl.textContent = ""; setTimeout(() => (this.liveEl.textContent = tr(msg)), 60); }
  private navEls: HTMLAnchorElement[] = [];
  private lastRouteKey = "";
  private rendered = false;

  constructor(store: Store) { this.store = store; }

  register(name: Route["name"], v: View) { this.views[name] = v; }

  private root!: HTMLElement;
  private tabbarEl!: HTMLElement;
  private langListeners: (() => void)[] = [];
  onLang(fn: () => void) { this.langListeners.push(fn); }

  /* switches the interface language: the shell is rebuilt (its text is translated as it's created), the view re-renders,
     and the choice is saved. Analyses keep the language they were written in; Map again rewrites them. */
  setLanguage(l: Lang) {
    if (l === getLang()) return;
    setLang(l);
    this.store.setSettings({ language: l });
    for (const fn of this.langListeners) fn();
    const doc = document as Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } };
    const swap = () => { this.buildChrome(); this.lastRouteKey = ""; this.renderNow(); };
    if (!this.reducedMotion && doc.startViewTransition) {
      document.documentElement.dataset.vt = "lang";
      const t = doc.startViewTransition(swap) as { finished: Promise<void>; ready?: Promise<void>; updateCallbackDone?: Promise<void> };
      t.ready?.catch(() => {}); t.updateCallbackDone?.catch(() => {});
      void t.finished.catch(() => {}).finally(() => { delete document.documentElement.dataset.vt; });
    } else swap();
    this.announce(l === "el" ? "Η γλώσσα άλλαξε σε Ελληνικά" : "Language changed to English");
  }

  langSwitch(cls = "") {
    const cur = getLang();
    const b = (l: Lang, label: string, name: string) => h("button", { type: "button", class: "lang-b", lang: l, "aria-pressed": String(cur === l), "data-i18n": "no", title: name, onclick: () => this.setLanguage(l) },
      h("span", { "aria-hidden": "true" }, label), h("span", { class: "sr" }, name));
    return h("div", { class: `lang ${cls}`, role: "group", "aria-label": L("Language", "Γλώσσα"), "data-lang": cur }, h("span", { class: "lang-ind", "aria-hidden": "true" }), b("en", "EN", "English"), b("el", "ΕΛ", "Ελληνικά"));
  }

  mount(root: HTMLElement) {
    this.root = root;
    clear(root);
    this.viewEl = h("div", { id: "view", class: "view", tabindex: "-1" });
    root.append(
      h("main", null, this.viewEl),
      (this.toastsEl = h("div", { class: "toasts", "aria-live": "polite" })),
      (this.liveEl = h("div", { class: "sr", "aria-live": "polite", "aria-atomic": "true" })),
    );
    this.buildChrome();
    this.store.on((why) => { if (why === "saved" || why === "update") this.paintSaved(); });
    addEventListener("hashchange", () => this.go());
    let ticking = false;
    addEventListener("scroll", () => { if (ticking) return; ticking = true; requestAnimationFrame(() => { ticking = false; this.paintHeader(); }); }, { passive: true });
    addEventListener("beforeunload", () => this.store.flush());
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") this.store.flush(); });
    installPointerFx();
    this.applyPrefs();
    matchMedia("(prefers-color-scheme: light)").addEventListener?.("change", () => this.applyPrefs());
    matchMedia("(prefers-reduced-motion: reduce)").addEventListener?.("change", () => this.applyPrefs());
    if (this.store.recovered) setTimeout(() => this.toast("Some saved data couldn't be read. MIRROR kept what was valid and stored a backup copy.", "bad"), 400);
    void serverStatus().then((s) => { this.server = s; if (this.route.name === "settings") this.render(); });
    this.go();
  }

  /* header, skip link and phone tab bar; rebuilt when the language changes */
  private buildChrome() {
    const root = this.root;
    this.skipEl?.remove(); this.hdrEl?.remove(); this.tabbarEl?.remove();
    this.navEls = [];
    const nav = (href: string, label: string, ic: Parameters<typeof icon>[0], match: Route["name"][], cls = "") => {
      const a = h("a", { href, class: cls, "data-match": match.join(" ") }, icon(ic), h("span", null, label));
      this.navEls.push(a);
      return a;
    };
    this.savedEl = h("span", { class: "saved", role: "status", "aria-live": "polite" }, "Saved on this device");
    root.prepend(
      (this.skipEl = h("a", { class: "skip", href: "#view", onclick: (e: Event) => { e.preventDefault(); this.viewEl.focus(); } }, "Skip to content")),
      (this.hdrEl = h("header", { class: "hdr" },
        h("div", { class: "wrap" },
          h("a", { class: "brand", href: "#/", "aria-label": "MIRROR, home" }, brandMark(), h("b", { "aria-hidden": "true" }, "mirror")),
          /* the website's navigation */
          h("nav", { class: "nav site-only", "aria-label": "Site" },
            ...SITE_LINKS().map(([id, label]) => h("a", { href: `#${id}`, "data-section": id, onclick: (e: Event) => this.toSection(e, id) }, h("span", null, label)))),
          /* the app's navigation */
          h("nav", { class: "nav app-only", "aria-label": "App" },
            nav("#/app", "Decisions", "home", ["home", "lab", "brief", "new"]),
            nav("#/history", "History", "history", ["history"]),
            nav("#/settings", "Settings", "settings", ["settings"])),
          h("div", { class: "hdr-end" },
            h("span", { class: "app-only" }, this.savedEl),
            this.langSwitch("hdr-lang"),
            h("a", { class: "btn btn-primary btn-sm hdr-cta site-only", href: "#/app" }, "Open MIRROR"),
            h("button", { class: "btn btn-primary btn-sm hdr-cta app-only", type: "button", onclick: () => this.newDecision() }, icon("plus"), "Explore a decision"),
            (this.menuEl = h("details", { class: "site-menu site-only" },
              h("summary", { class: "btn icon-btn", "aria-label": "Menu" }, icon("menu")),
              h("div", { class: "menu" },
                ...SITE_LINKS().map(([id, label]) => h("a", { class: "btn btn-quiet", href: `#${id}`, onclick: (e: Event) => { this.menuEl.open = false; this.toSection(e, id); } }, label)),
                h("a", { class: "btn btn-primary", href: "#/app", onclick: () => { this.menuEl.open = false; } }, L("Explore a decision", "Εξερεύνησε μια απόφαση"))))))))));
    root.append(
      (this.tabbarEl = h("nav", { class: "tabbar", "aria-label": "Main" },
        nav("#/app", "Decisions", "home", ["home", "lab", "brief"]),
        h("a", { href: "#/new", class: "new", onclick: (e: Event) => { e.preventDefault(); this.newDecision(); } }, icon("plus"), h("span", null, "New")),
        nav("#/history", "History", "history", ["history"]),
        nav("#/settings", "Settings", "settings", ["settings"]))));
    /* keep the current route highlighted after a rebuild */
    for (const a of this.navEls) { const on = (a.dataset.match ?? "").split(" ").includes(this.route.name); if (on) a.setAttribute("aria-current", "page"); }
    this.paintSaved();
  }
  private skipEl?: HTMLElement;

  /* the header floats over title scenes and firms up once the page scrolls */
  private hdrEl?: HTMLElement;
  private lastY = 0;
  paintHeader() {
    const y = scrollY;
    this.hdrEl?.classList.toggle("solid", y > 24 || !this.viewEl.classList.contains("has-scene"));
    /* on the website the header steps aside while you read down and comes back as soon as you scroll up */
    const away = document.body.dataset.area === "site" && y > 480 && y > this.lastY + 2 && !this.menuEl?.open;
    if (away || y < this.lastY - 2 || y < 480) this.hdrEl?.classList.toggle("away", away);
    this.lastY = y;
  }

  paintSaved() {
    const s = this.store.saveState;
    this.savedEl.dataset.state = s;
    this.savedEl.textContent = tr(s === "saving" ? "Saving…" : s === "error" ? "Not saved: storage full" : "Saved on this device");
  }

  applyPrefs() {
    const st = this.store.settings, r = document.documentElement;
    const light = st.theme === "light" || (st.theme === "system" && matchMedia("(prefers-color-scheme: light)").matches);
    r.dataset.theme = light ? "light" : "dark";
    const reduce = st.motion === "reduce" || (st.motion === "system" && matchMedia("(prefers-reduced-motion: reduce)").matches);
    r.dataset.motion = reduce ? "reduce" : "full";
    r.style.setProperty("--scale", String(st.textScale));
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", light ? "#E7EAEE" : "#1C1F24");
  }
  get reducedMotion() { return document.documentElement.dataset.motion === "reduce"; }

  go() {
    this.route = parse(location.hash);
    const r = this.route;
    this.render();
  }
  nav(hash: string) { if (location.hash === hash) this.go(); else location.hash = hash; }

  /* Every render is a View Transition when motion is allowed: the old and new states morph instead of swapping.
     Elements that should travel (path points, judgement pills, tab and path underlines) carry a view-transition-name.
     Reduced motion, a hidden tab, or a browser without the API render synchronously. */
  render() {
    const r = this.route;
    const key = r.name + ("id" in r ? r.id ?? "" : "") + ("tab" in r ? r.tab : "");
    const doc = document as Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } };
    if (this.rendered && !this.reducedMotion && doc.startViewTransition && !document.hidden) {
      document.documentElement.dataset.vt = key !== this.lastRouteKey ? "route" : "state";
      const t = doc.startViewTransition(() => this.renderNow()) as { finished: Promise<void>; ready?: Promise<void>; updateCallbackDone?: Promise<void> };
      /* a newer transition may interrupt this one; that's expected, not an error */
      t.ready?.catch(() => {}); t.updateCallbackDone?.catch(() => {});
      void t.finished.catch(() => {}).finally(() => { delete document.documentElement.dataset.vt; });
    } else this.renderNow();
  }

  private renderNow() {
    const r = this.route;
    const key = r.name + ("id" in r ? r.id ?? "" : "") + ("tab" in r ? r.tab : "");
    const changed = key !== this.lastRouteKey;
    this.lastRouteKey = key;
    if (changed) this.viewEl.dataset.enter = ""; else delete this.viewEl.dataset.enter;
    const view = this.views[r.name] ?? this.views.missing!;
    withFocus(this.viewEl, () => { clear(this.viewEl); this.viewEl.append(view(this, r)); });
    for (const a of this.navEls) {
      const on = (a.dataset.match ?? "").split(" ").includes(r.name);
      if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    }
    document.title = tr(titleFor(this, r));
    document.body.dataset.area = r.name === "site" ? "site" : "app";
    const hasScene = !!this.viewEl.querySelector(":scope > .scene, :scope > div > .scene:first-child");
    this.viewEl.classList.toggle("has-scene", hasScene);
    this.paintHeader();
    /* move focus to the new content on in-app navigation, never on first load (keeps the skip link first) */
    if (changed) { scrollTo({ top: 0, behavior: "instant" as ScrollBehavior }); if (this.rendered) this.viewEl.focus({ preventScroll: true }); }
    this.rendered = true;
    this.paintSaved();
  }

  newDecision() {
    const d = this.store.create();
    this.nav(`#/new/${d.id}`);
  }

  toast(msg: string, kind: "ok" | "bad" = "ok", action?: { label: string; run: () => void }) {
    const t = h("div", { class: `toast ${kind === "bad" ? "bad" : ""}`, role: kind === "bad" ? "alert" : "status" }, h("span", null, msg),
      action ? h("button", { type: "button", onclick: () => { action.run(); } }, action.label) : null);
    this.toastsEl.append(t);
    const out = () => { if (!t.isConnected || t.classList.contains("out")) return; t.classList.add("out"); setTimeout(() => t.remove(), this.reducedMotion ? 0 : 320); };
    t.addEventListener("click", (e) => { if ((e.target as HTMLElement).closest("button")) out(); });
    setTimeout(out, action ? 7000 : 4200);
  }

  /* a native <dialog>: focus is trapped and restored by the browser, Esc closes */
  dialog(title: string, body: Node, actions: { label: string; kind?: "primary" | "danger" | "quiet"; run?: () => boolean | void }[]): HTMLDialogElement {
    const opener = document.activeElement as HTMLElement | null;
    const dlg = h("dialog", { "aria-labelledby": "dlg-title" },
      h("form", { class: "dlg", method: "dialog", onsubmit: (e: Event) => e.preventDefault() },
        h("div", { class: "dlg-head" }, h("h2", { class: "h2 grow", id: "dlg-title" }, title),
          h("button", { class: "btn btn-quiet icon-btn", type: "button", "aria-label": "Close", onclick: () => dlg.close() }, icon("x"))),
        h("div", { class: "dlg-body" }, body),
        h("div", { class: "dlg-foot" }, ...actions.map((a, i) =>
          h("button", { class: `btn ${a.kind === "primary" ? "btn-primary" : a.kind === "danger" ? "btn-danger" : a.kind === "quiet" ? "btn-quiet" : ""}`, type: i === actions.length - 1 ? "submit" : "button",
            onclick: () => { const keep = a.run?.(); if (keep !== false) dlg.close(); } }, a.label)))));
    dlg.addEventListener("close", () => { setTimeout(() => dlg.remove(), this.reducedMotion ? 0 : 300); opener?.isConnected && opener.focus(); });
    document.body.append(dlg);
    dlg.showModal();
    (dlg.querySelector<HTMLElement>("[autofocus]") ?? dlg.querySelector<HTMLElement>(".dlg-body input, .dlg-body textarea, .dlg-body select"))?.focus();
    return dlg;
  }

  confirm(title: string, message: string, ok: string, danger = false): Promise<boolean> {
    return new Promise((resolve) => {
      let done = false;
      const d = this.dialog(title, h("p", { class: "muted" }, message), [
        { label: "Cancel", kind: "quiet", run: () => { done = true; resolve(false); } },
        { label: ok, kind: danger ? "danger" : "primary", run: () => { done = true; resolve(true); } },
      ]);
      d.addEventListener("close", () => { if (!done) resolve(false); });
    });
  }

  /* Runs the configured provider. On failure, the previous analysis and every user judgement stay untouched. */
  async analyze(d: Decision): Promise<boolean> {
    if (this.analyzing.has(d.id)) return false;
    this.analyzing.add(d.id);
    this.render();
    const useServer = this.store.settings.analysis === "server";
    try {
      const input = toInput(d);
      let result;
      if (useServer) {
        try { result = await serverProvider.analyze(input); }
        catch (e) {
          const msg = e instanceof AnalysisError ? e.message : "The AI analysis failed.";
          this.toast(`${tr(msg)} ${L("Your saved work is unchanged.", "Η αποθηκευμένη δουλειά σου δεν άλλαξε.")}`, "bad", { label: "Use demo rules", run: () => { void this.runDemo(d.id); } });
          return false;
        }
      } else {
        await new Promise((r) => setTimeout(r, this.reducedMotion ? 0 : 650)); /* lets the "mapping" state be perceived */
        result = await demoProvider.analyze(input);
      }
      const keep = new Set(result.branches.flatMap((b) => b.assumptions.map((a) => a.id)));
      this.store.update(d.id, (x) => {
        x.analysis = result;
        if (x.status === "draft") x.status = "exploring";
        /* keep judgements for assumptions that still exist */
        x.assumptionState = Object.fromEntries(Object.entries(x.assumptionState).filter(([k]) => keep.has(k)));
      }, true);
      return true;
    } finally {
      this.analyzing.delete(d.id);
      this.render();
    }
  }
  private async runDemo(id: string) {
    const prev = this.store.settings.analysis;
    this.store.data.settings.analysis = "demo";
    const d = this.store.get(id);
    if (d) await this.analyze(d);
    this.store.data.settings.analysis = prev;
  }
}

function titleFor(app: App, r: Route): string {
  const d = "id" in r && r.id ? app.store.get(r.id) : undefined;
  const t = d?.title ? ` · ${d.title}` : "";
  switch (r.name) {
    case "lab": return L(`Future Lab${t} — MIRROR`, `Εργαστήριο Μελλόντων${t} — MIRROR`);
    case "new": return `Explore a decision — MIRROR`;
    case "brief": return L(`Decision brief${t} — MIRROR`, `Σύνοψη απόφασης${t} — MIRROR`);
    case "history": return "History — MIRROR";
    case "settings": return "Settings — MIRROR";
    case "home": return "Your decisions — MIRROR";
    default: return "MIRROR — Meet the futures you could make";
  }
}

/* The mark: a lens. A point of light on the horizon line, two futures branching up from it, and their reflection below,
   fainter, inside one ring. Animated in CSS: the ring and paths draw in, the light breathes, hover re-branches. */
let markN = 0;
export function brandMark(cls = ""): SVGSVGElement {
  const NS = "http://www.w3.org/2000/svg";
  const n = ++markN, g = `mg${n}`, r = `mr${n}`;
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 64 64"); svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", `bm ${cls}`.trim());
  svg.innerHTML = `<defs><linearGradient id="${g}" gradientUnits="userSpaceOnUse" x1="6" y1="0" x2="58" y2="0"><stop offset="0" stop-color="#F2F4F7"/><stop offset=".55" stop-color="#C9CED6"/><stop offset="1" stop-color="#8C939E"/></linearGradient><radialGradient id="${r}"><stop offset="0" stop-color="#fff"/><stop offset=".35" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#C9CED6" stop-opacity="0"/></radialGradient></defs>
  <circle class="bm-ring" cx="32" cy="32" r="27" fill="none" stroke="url(#${g})" stroke-width="2.4" pathLength="1"/>
  <path class="bm-axis" d="M13 32H51" stroke-width="1.6" pathLength="1"/>
  <path class="bm-up" d="M16 32C26 32 30 20 45 15" fill="none" stroke="url(#${g})" stroke-width="2.6" stroke-linecap="round" pathLength="1"/>
  <path class="bm-up bm-up2" d="M16 32C27 32 33 27 49 25" fill="none" stroke="url(#${g})" stroke-width="2.6" stroke-linecap="round" pathLength="1"/>
  <path class="bm-down" d="M16 32C26 32 30 44 45 49M16 32C27 32 33 37 49 39" fill="none" stroke="url(#${g})" stroke-width="2.6" stroke-linecap="round"/>
  <circle class="bm-glow" cx="16" cy="32" r="7" fill="url(#${r})"/><circle class="bm-pt" cx="16" cy="32" r="3.2"/>`;
  return svg;
}
