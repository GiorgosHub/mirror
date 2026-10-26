import { browserKV, Store } from "./data/store.ts";
import { App } from "./ui/app.ts";
import { setLang } from "./i18n.ts";
import { EMBED, h } from "./ui/dom.ts";
import { createView } from "./ui/views/create.ts";
import { homeView, introView } from "./ui/views/home.ts";
import { labView } from "./ui/views/lab.ts";
import { briefView, historyView, settingsView } from "./ui/views/other.ts";
import { siteView } from "./site/index.ts";

const store = new Store(browserKV());
/* English is the default; a saved choice wins */
setLang(store.settings.language);
const app = new App(store);
app.register("site", (a) => siteView(a));
app.register("home", (a) => homeView(a));
app.register("intro", (a) => introView(a));
app.register("new", (a, r) => createView(a, r as { id: string }));
app.register("lab", (a, r) => labView(a, r as Parameters<typeof labView>[1]));
app.register("brief", (a, r) => briefView(a, r as { id: string }));
app.register("history", (a) => historyView(a));
app.register("settings", (a) => settingsView(a));
app.register("missing", () => h("div", { class: "wrap" }, h("h1", { class: "h1" }, "Nothing here."), h("a", { class: "btn", href: "#/", style: "margin-top:24px" }, "Back to decisions")));
app.mount(document.getElementById("app")!);

/* close any open "more" menu on outside click */
document.addEventListener("click", (e) => {
  for (const d of document.querySelectorAll<HTMLDetailsElement>("details.more[open], details.site-menu[open]")) if (!d.contains(e.target as Node)) d.open = false;
});

/* installable + offline: only on real http(s) origins */
if (!EMBED && "serviceWorker" in navigator && location.protocol.startsWith("http") && !/^(localhost|127\.)/.test(location.hostname)) {
  addEventListener("load", () => { navigator.serviceWorker.register("/sw.js").catch(() => {}); });
}

declare global { interface Window { __mirror?: App } }
window.__mirror = app;
