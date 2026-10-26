/* The line language. A bead of mercury travels one line as you scroll; the line changes texture as it passes from
   what you said, to what's assumed, to a guess, to an assumption that broke. */
import { L } from "../i18n.ts";
import { h, s } from "../ui/dom.ts";
import { pinned } from "../fx/scroll.ts";
import { reducedMotion } from "../fx/loop.ts";

export function language(): HTMLElement {
  const zones = [
    ["fact", L("Known", "Γνωστό"), L("Follows from what you said.", "Προκύπτει από όσα είπες.")],
    ["assumed", L("Assumed", "Υπόθεση"), L("Rests on something you can check.", "Στηρίζεται σε κάτι που μπορείς να ελέγξεις.")],
    ["speculative", L("A guess", "Εικασία"), L("Far out, or weakly supported.", "Μακρινό ή με αδύναμη στήριξη.")],
    ["broken", L("Broken", "Σπασμένο"), L("Something it rested on turned out false.", "Κάτι στο οποίο στηριζόταν αποδείχτηκε λάθος.")],
  ] as const;
  const W = 1000;
  const segs = zones.map(([k], i) => s("path", { d: `M${i * 250 + 8} 40 H${i * 250 + 242}`, class: `lz lz-${k}` }));
  const crack = s("path", { d: "M760 40 l20 -9 l14 12 l18 -14 l16 13 l22 -11 l18 10 l24 -8 l26 7 l32 -2", class: "lz-crack" });
  const bead = s("circle", { cx: 8, cy: 40, r: 9, class: "bead" });
  const svg = s("svg", { viewBox: `0 0 ${W} 80`, class: "lang-svg", "aria-hidden": "true", preserveAspectRatio: "none" }, ...segs, crack, bead);
  const caps = zones.map(([k, t, p]) => h("li", { "data-k": k }, h("h3", null, h("span", { class: `swatch sw-${k}`, "aria-hidden": "true" }), t), h("p", null, p)));
  const section = h("section", { class: "lang-sec", id: "language", "aria-labelledby": "lang-h" },
    h("div", { class: "lang-stage" },
      h("div", { class: "wrap" },
        h("header", { class: "sec-head" },
          h("h2", { class: "sec-title", id: "lang-h" }, L("Every future says how sure it is", "Κάθε μέλλον λέει πόσο σίγουρο είναι")),
          h("p", { class: "sec-lead" }, L("No percentages and no scores. The line itself tells you what you're looking at.", "Χωρίς ποσοστά και βαθμολογίες. Η ίδια η γραμμή σου λέει τι βλέπεις."))),
        h("div", { class: "lang-line" }, svg),
        h("ul", { class: "lang-caps" }, ...caps))));
  const draw = (p: number) => {
    const x = 8 + p * (W - 16);
    bead.setAttribute("cx", x.toFixed(1));
    const zone = Math.min(3, Math.floor((x / W) * 4));
    section.dataset.zone = String(zone);
    caps.forEach((c, i) => c.toggleAttribute("data-on", i <= zone));
    segs.forEach((sg, i) => sg.classList.toggle("lit", i <= zone));
  };
  if (reducedMotion()) { section.classList.add("static"); requestAnimationFrame(() => draw(1)); }
  else requestAnimationFrame(() => { if (section.isConnected) pinned(section, draw); });
  return section;
}
