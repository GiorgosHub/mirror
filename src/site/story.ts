/* How it works, as one decision followed through four moments while you scroll. The stage is pinned; the drawing
   advances with the scroll: the choice is written, it splits into three paths, one future loses its footing, one
   path is chosen and loops back for review. It is a real sequence, so the moments are ordered in time. */
import { L } from "../i18n.ts";
import { h, s } from "../ui/dom.ts";
import { pinned } from "../fx/scroll.ts";
import { clamp, reducedMotion } from "../fx/loop.ts";

const STEPS = () => [
  [L("Now", "Τώρα"), L("You write it down.", "Το γράφεις."), L("The decision in your words, your hard limits, and two to four real options. Staying put counts as one.", "Την απόφαση με δικά σου λόγια, τα αυστηρά σου όρια και δύο έως τέσσερις πραγματικές επιλογές. Το να μείνεις όπως είσαι μετράει ως μία.")],
  [L("A minute later", "Ένα λεπτό μετά"), L("It splits into futures.", "Χωρίζεται σε μέλλοντα."), L("Each option becomes a path through three moments: soon, a while from now, and far out. Every future says whether it's known, assumed or a guess.", "Κάθε επιλογή γίνεται δρόμος μέσα από τρεις στιγμές: σύντομα, σε λίγο καιρό, και πολύ αργότερα. Κάθε μέλλον λέει αν είναι γνωστό, υπόθεση ή εικασία.")],
  [L("This week", "Αυτή την εβδομάδα"), L("You test what it rests on.", "Ελέγχεις σε τι στηρίζεται."), L("Mark an assumption as doubtful or not true and watch which futures lose their footing. MIRROR suggests the cheapest way to check what's still open.", "Σημείωσε μια υπόθεση ως αμφίβολη ή λάθος και δες ποια μέλλοντα χάνουν το έδαφος κάτω από τα πόδια τους. Το MIRROR προτείνει τον φθηνότερο τρόπο να ελέγξεις ό,τι μένει ανοιχτό.")],
  [L("Months later", "Μήνες μετά"), L("You choose, then look back.", "Διαλέγεις, και μετά κοιτάς πίσω."), L("Record the choice with a date to review it. When it comes, compare what you assumed with what actually happened.", "Κατάγραψε την επιλογή με μια ημερομηνία επανεξέτασης. Όταν έρθει, σύγκρινε αυτό που υπέθεσες με όσα έγιναν.")],
];

/* three paths from one point; the top one is chosen in the end, the bottom one loses its footing */
const PATHS = ["M70 210 C 170 210, 210 92, 320 92 S 470 74, 560 64", "M70 210 C 170 210, 230 206, 320 206 S 470 210, 560 214", "M70 210 C 170 210, 210 328, 320 328 S 470 350, 560 362"];
const AT = [0.34, 0.6, 1];
export function story(): HTMLElement {
  const steps = STEPS();
  const paths = PATHS.map((d, i) => s("path", { d, class: `sp sp${i}`, pathLength: 1 }));
  const nodes = PATHS.flatMap((_, i) => AT.map((_a, j) => s("circle", { cx: 0, cy: 0, r: 6, class: `sn sn${i} k${j}` })));
  const opts = [L("Take a sabbatical to test it", "Τρίμηνη άδεια για δοκιμή"), L("Stay and study at night", "Μένω και σπουδάζω τα βράδια"), L("Quit and study full-time", "Παραιτούμαι και σπουδάζω")];
  const ends = [64, 214, 362];
  const labels = opts.map((t, i) => { const el = s("text", { x: 578, y: ends[i]! + 5, class: `sl sl${i}` }); el.textContent = t; return el; });
  const times = [L("3 months", "3 μήνες"), L("1 year", "1 χρόνος"), L("3 years", "3 χρόνια")].map((t, j) => { const el = s("text", { x: 0, y: -14, class: "st-t", "text-anchor": "middle" }); el.textContent = t; return el; });
  const crack = s("path", { d: "M560 362 l-10 -12 l6 -6 l-12 -10 M560 362 l12 -6 l-2 -10 l10 -8 M560 362 l2 14 l10 4", class: "crack", pathLength: 1 });
  const loop = s("path", { d: "M560 64 C 620 40, 600 -22, 420 -26 S 110 0, 76 196", class: "review", pathLength: 1 });
  const origin = s("circle", { cx: 70, cy: 210, r: 9, class: "so" });
  const art = s("svg", { viewBox: "0 -44 860 440", class: "story-svg", "aria-hidden": "true" }, ...times, ...paths, loop, crack, ...nodes, origin, ...labels);
  /* nodes sit exactly on their paths, at the same three moments */
  const place = () => paths.forEach((pth, i) => {
    const P = pth as SVGPathElement, len = P.getTotalLength();
    AT.forEach((f, j) => { const pt = P.getPointAtLength(len * f); const n = nodes[i * 3 + j]!; n.setAttribute("cx", pt.x.toFixed(1)); n.setAttribute("cy", pt.y.toFixed(1)); if (i === 1) times[j]!.setAttribute("x", pt.x.toFixed(1)); });
  });
  const question = h("p", { class: "story-q", "aria-hidden": "true" }, L("Should I leave my job to study design?", "Να αφήσω τη δουλειά μου για να σπουδάσω design;"));
  const items = steps.map(([when, t, p], i) => h("li", { class: "story-step", "data-i": String(i) }, h("p", { class: "when" }, when), h("h3", null, t), h("p", null, p)));
  const section = h("section", { class: "story", id: "story", "aria-labelledby": "story-h" },
    h("div", { class: "story-stage" },
      h("div", { class: "wrap story-grid" },
        h("div", { class: "story-copy" },
          h("h2", { class: "sec-title", id: "story-h" }, L("One decision, followed all the way through", "Μία απόφαση, από την αρχή ως το τέλος")),
          h("ol", { class: "story-steps" }, ...items)),
        h("div", { class: "story-art" }, question, art))));

  const draw = (p: number) => {
    const step = Math.min(3, Math.floor(p * 4.0001));
    section.dataset.step = String(step);
    items.forEach((li, i) => li.toggleAttribute("data-on", i === step));
    const seg = (a: number, b: number) => clamp((p - a) / (b - a));
    question.style.setProperty("--t", String(seg(0.02, 0.18)));
    paths.forEach((el, i) => { el.style.strokeDashoffset = String(1 - seg(0.25 + i * 0.04, 0.45 + i * 0.04)); });
    nodes.forEach((el, k) => { const j = k % 3, i = Math.floor(k / 3); el.classList.toggle("on", seg(0.27 + i * 0.04 + j * 0.05, 0.3 + i * 0.04 + j * 0.05) >= 1); });
    labels.forEach((el, i) => el.classList.toggle("on", seg(0.38 + i * 0.04, 0.42 + i * 0.04) >= 1));
    times.forEach((el, j) => el.classList.toggle("on", seg(0.26 + j * 0.05, 0.3 + j * 0.05) >= 1));
    const doubt = seg(0.55, 0.68);
    section.style.setProperty("--doubt", String(doubt));
    crack.style.strokeDashoffset = String(1 - doubt);
    const choose = seg(0.78, 0.92);
    section.style.setProperty("--choose", String(choose));
    loop.style.strokeDashoffset = String(1 - seg(0.86, 1));
  };
  requestAnimationFrame(() => {
    if (!section.isConnected) return;
    place();
    if (reducedMotion()) { section.classList.add("static"); draw(1); } else pinned(section, draw);
  });
  return section;
}
