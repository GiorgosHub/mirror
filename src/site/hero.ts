/* The hero: the question, and its reflection in a pool of liquid metal that splits into futures under the pointer.
   The headline is real text; the reflection is drawn from it. Without WebGL or with reduced motion, a still CSS
   reflection stands in. */
import { L } from "../i18n.ts";
import type { App } from "../ui/app.ts";
import { h } from "../ui/dom.ts";
import { mountLiquid, wrapWords } from "../fx/liquid.ts";

export function hero(app: App): HTMLElement {
  const title = L("What happens if you choose it?", "Τι γίνεται αν το διαλέξεις;");
  const h1 = h("h1", { class: "hero-title", id: "hero-h" }, title);
  wrapWords(h1);
  h1.querySelectorAll<HTMLElement>(".lw").forEach((w, i) => w.style.setProperty("--i", String(i)));
  const aside = h("div", { class: "hero-aside" },
    h("p", { class: "hero-lead" }, L(
      "Write down a decision you keep circling. MIRROR shows where each option could lead, what that rests on, and the cheapest way to find out more.",
      "Γράψε μια απόφαση που σε τριβελίζει. Το MIRROR δείχνει πού θα μπορούσε να οδηγήσει κάθε επιλογή, σε τι στηρίζεται αυτό, και τον φθηνότερο τρόπο να μάθεις περισσότερα.")),
    h("div", { class: "hero-actions" },
      h("button", { class: "btn btn-primary btn-lg", type: "button", onclick: () => app.newDecision() }, L("Explore a decision", "Εξερεύνησε μια απόφαση")),
      h("a", { class: "link-quiet", href: "#demo", onclick: (e: Event) => app.toSection(e, "demo") }, L("Try the example", "Δες το παράδειγμα"))),
    h("p", { class: "hero-note" }, L(
      "It doesn't predict, and it won't choose for you. Free, and nothing you write leaves this device.",
      "Δεν προβλέπει και δεν διαλέγει για σένα. Δωρεάν, και ό,τι γράφεις μένει σε αυτή τη συσκευή.")));
  const section = h("section", { class: "hero", "aria-labelledby": "hero-h" },
    h("div", { class: "wrap hero-in" }, h1, aside, h("p", { class: "hero-reflect", "aria-hidden": "true" }, title)));
  /* mount once the section is in the document */
  requestAnimationFrame(() => { if (section.isConnected) mountLiquid(section, { source: h1, gap: 18, split: 0.2, fade: 0.5 }); });
  return section;
}
