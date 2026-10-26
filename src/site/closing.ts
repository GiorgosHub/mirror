/* The way in, and the footer: a second pool reflecting the word "mirror". */
import { L } from "../i18n.ts";
import { type App, brandMark } from "../ui/app.ts";
import { h } from "../ui/dom.ts";
import { mountLiquid, wrapWords } from "../fx/liquid.ts";

export function closing(app: App): HTMLElement {
  const word = h("p", { class: "foot-word", "aria-hidden": "true" }, "mirror");
  wrapWords(word);
  const foot = h("footer", { class: "site-foot" },
    h("div", { class: "wrap foot-cta" },
      h("h2", { class: "sec-title" }, L("Your next decision deserves more than a list of pros and cons.", "Η επόμενη απόφασή σου αξίζει κάτι παραπάνω από μια λίστα με υπέρ και κατά.")),
      h("button", { class: "btn btn-primary btn-lg", type: "button", onclick: () => app.newDecision() }, L("Explore a decision", "Εξερεύνησε μια απόφαση"))),
    h("div", { class: "foot-pool" },
      h("div", { class: "wrap" }, word, h("p", { class: "foot-reflect", "aria-hidden": "true" }, "mirror"))),
    h("div", { class: "wrap foot-in" },
        h("div", { class: "foot-brand" }, brandMark("bm-foot"), h("p", null, L("Explores possibilities. Doesn't predict them.", "Εξερευνά δυνατότητες. Δεν τις προβλέπει."))),
        h("nav", { "aria-label": L("Website links", "Σύνδεσμοι ιστότοπου") },
          ...[["story", L("How it works", "Πώς δουλεύει")], ["demo", L("Example", "Παράδειγμα")], ["principles", L("What it won't do", "Τι δεν θα κάνει")], ["faq", L("Questions", "Ερωτήσεις")]]
            .map(([id, l]) => h("a", { href: `#${id}`, onclick: (e: Event) => app.toSection(e, id!) }, l!))),
        h("nav", { "aria-label": L("App links", "Σύνδεσμοι εφαρμογής") },
          h("a", { href: "#/app" }, L("Your decisions", "Οι αποφάσεις σου")),
          h("a", { href: "#/history" }, L("History", "Ιστορικό")),
          h("a", { href: "#/settings" }, L("Settings", "Ρυθμίσεις"))),
        h("p", { class: "foot-small" }, L("© 2026 MIRROR. Your decisions are stored only in your browser.", "© 2026 MIRROR. Οι αποφάσεις σου αποθηκεύονται μόνο στον browser σου."))));
  const pool = foot.querySelector<HTMLElement>(".foot-pool")!;
  requestAnimationFrame(() => { if (pool.isConnected) mountLiquid(pool, { source: word, gap: 6, split: 0.3, rain: true, fade: 0.45 }); });
  return foot;
}
