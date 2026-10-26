/* The live example: MIRROR's real engine on a decision held in memory. Nothing here is saved.
   It is an island: judging an assumption re-renders only this section (the hero's liquid keeps running), and a future
   that loses its footing visibly cracks. */
import { getLang, L, tr } from "../i18n.ts";
import { ARCHETYPE_LABEL, deriveView, demoAnalysis, type EffectiveKind } from "../domain/engine.ts";
import { type AssumptionStatus, Decision, type DecisionInput, HORIZON_SLOTS, PRIORITY_LABEL } from "../domain/types.ts";
import type { App } from "../ui/app.ts";
import { h } from "../ui/dom.ts";
import { island } from "../ui/core/island.ts";

const KIND = (): Record<EffectiveKind, string> => ({ fact: L("Known", "Γνωστό"), assumed: L("Assumed", "Υπόθεση"), speculative: L("A guess", "Εικασία"), broken: L("Broken", "Σπασμένο") });
const STATUS = (): Record<AssumptionStatus, string> => ({ holds: L("Holds", "Ισχύει"), unknown: L("Unknown", "Άγνωστο"), doubtful: L("Doubtful", "Αμφίβολο"), false: L("Not true", "Δεν ισχύει") });
const LEVEL = (): Record<string, string> => ({ strong: L("strong", "ισχυρή"), mixed: L("mixed", "μικτή"), weak: L("weak", "αδύναμη"), unclear: L("unclear", "ασαφής") });

const EXAMPLE: DecisionInput = {
  title: "Should I leave my job to study design full-time?",
  context: "",
  constraints: ["Savings for about 6 months"],
  alternatives: [
    { id: "x1", title: "Stay and study at night", note: "" },
    { id: "x2", title: "Quit and study full-time", note: "" },
    { id: "x3", title: "Take a 3-month sabbatical to test it", note: "" },
  ],
  horizon: "3y", priorities: ["money", "growth", "meaning"], unknowns: [],
};
let demo: Decision | null = null;
let demoLang = "";
let demoAlt = "x2";
let seen = new Map<string, EffectiveKind>();
function demoDecision(): Decision {
  if (!demo || demoLang !== getLang()) {
    const t = new Date().toISOString();
    const input: DecisionInput = { ...EXAMPLE, title: tr(EXAMPLE.title), constraints: EXAMPLE.constraints.map(tr), alternatives: EXAMPLE.alternatives.map((a) => ({ ...a, title: tr(a.title) })), lang: getLang() };
    demo = Decision.parse({ id: "demo", createdAt: t, updatedAt: t, ...input, status: "exploring", analysis: demoAnalysis(input) });
    demoLang = getLang();
    seen = new Map();
  }
  return demo;
}

export function demoSection(app: App): HTMLElement {
  const isl = island(() => body(app, () => isl.update()), "demo-island");
  return h("section", { class: "demo-sec", id: "demo", "aria-labelledby": "demo-h" },
    h("div", { class: "wrap" },
      h("header", { class: "sec-head" },
        h("h2", { class: "sec-title", id: "demo-h" }, L("Try it on a real example", "Δοκίμασέ το σε ένα πραγματικό παράδειγμα")),
        h("p", { class: "sec-lead" }, L(
          "This is MIRROR's real engine on an example decision. Mark an assumption as not true and see which futures break. Nothing here is saved.",
          "Αυτή είναι η πραγματική μηχανή του MIRROR σε μια παραδειγματική απόφαση. Σημείωσε μια υπόθεση ως λάθος και δες ποια μέλλοντα σπάνε. Τίποτα εδώ δεν αποθηκεύεται."))),
      isl.el));
}

function body(app: App, update: () => void): Node {
  const d = demoDecision();
  const views = deriveView(d);
  const v = views.find((x) => x.branch.alternativeId === demoAlt) ?? views[0]!;
  const slots = HORIZON_SLOTS[d.horizon];
  const kinds = KIND(), status = STATUS();
  const judge = (id: string, st: AssumptionStatus) => {
    const before = v.outcomes.map((o) => o.effective).join();
    d.assumptionState[id] = st;
    update();
    const after = deriveView(d).find((x) => x.branch.alternativeId === v.branch.alternativeId)!;
    app.announce(after.outcomes.map((o) => o.effective).join() !== before ? L("The futures on this path changed.", "Τα μέλλοντα σε αυτόν τον δρόμο άλλαξαν.") : L("Nothing on this path depended on that alone.", "Τίποτα σε αυτόν τον δρόμο δεν εξαρτιόταν μόνο από αυτό."));
  };
  const futures = v.outcomes.map((o, i) => {
    const key = `${v.branch.alternativeId}:${i}`;
    const newlyBroken = o.effective === "broken" && seen.get(key) !== "broken" && seen.has(key);
    seen.set(key, o.effective);
    return h("li", { class: `demo-fut${newlyBroken ? " cracking" : ""}`, "data-kind": o.effective, style: `view-transition-name:demo-f${i}` },
      h("span", { class: "conn", "aria-hidden": "true" }),
      h("p", { class: "fut-head" }, h("span", { class: "dot", "aria-hidden": "true" }), h("span", { class: "k" }, kinds[o.effective]), h("span", { class: "when" }, slots[i])),
      h("p", { class: "fut-text" }, o.shown),
      o.because ? h("p", { class: "because" }, o.because) : null,
      o.effective === "broken" ? h("span", { class: "crack-svg", "aria-hidden": "true", html: CRACK }) : null);
  });
  return h("div", { class: "demo-board" },
    h("p", { class: "demo-q" }, d.title),
    h("div", { class: "demo-tabs", role: "group", "aria-label": L("Options", "Επιλογές") }, ...views.map((x) =>
      h("button", { type: "button", class: "demo-tab", "aria-pressed": String(x === v), k: `demo-${x.branch.alternativeId}`, onclick: () => { demoAlt = x.branch.alternativeId; update(); } },
        h("span", null, x.title),
        x === v ? h("span", { class: "underline", "aria-hidden": "true", style: "view-transition-name:demo-line" }) : null))),
    h("ol", { class: "demo-path", "aria-label": L(`Possible futures for "${v.title}"`, `Πιθανά μέλλοντα για το «${v.title}»`) },
      h("li", { class: "demo-now", "aria-hidden": "true" }, h("span", { class: "pt" }), h("small", null, L("Now", "Τώρα"))),
      ...futures),
    h("div", { class: "demo-grid" },
      h("div", null,
        h("h3", { class: "demo-sub" }, L(`What "${v.title}" rests on`, `Σε τι στηρίζεται το «${v.title}»`)),
        ...v.assumptions.map((a) => h("div", { class: "asm" },
          h("p", null, a.text),
          h("fieldset", { class: "judge", style: "margin:0;min-width:0" },
            h("legend", { class: "sr" }, L(`Does this hold? ${a.text}`, `Ισχύει αυτό; ${a.text}`)),
            ...(["holds", "unknown", "doubtful", "false"] as AssumptionStatus[]).map((st) => h("label", { "data-v": st },
              h("input", { type: "radio", name: `demo-${a.id}`, value: st, k: `demo-${a.id}-${st}`, checked: a.status === st, onchange: () => judge(a.id, st) }),
              a.status === st ? h("span", { class: "pill", "aria-hidden": "true", style: `view-transition-name:demo-p-${a.id.replace(/[^a-zA-Z0-9-]/g, "-")}` }) : null,
              h("span", { class: "lbl" }, status[st]))))))),
      h("div", null,
        h("h3", { class: "demo-sub" }, L("Against what matters", "Απέναντι σε ό,τι μετράει")),
        h("div", { class: "fits" }, ...v.fit.map((f) => h("div", { class: "fit" },
          h("b", { class: "small" }, PRIORITY_LABEL[f.priority]),
          h("span", { class: "fit-l" }, h("span", { class: "fitmark", "data-l": f.effective, "aria-hidden": "true" }, h("i"), h("i"), h("i")), h("span", null, LEVEL()[f.effective] ?? f.effective)),
          h("p", { class: `r${f.changedBy ? " changed" : ""}` }, f.changedBy ?? f.reasons[0]!.text)))),
        h("p", { class: "demo-note" }, L(`Path type: ${ARCHETYPE_LABEL[v.archetype]}. Demonstration rules, not AI.`, `Τύπος δρόμου: ${ARCHETYPE_LABEL[v.archetype]}. Κανόνες επίδειξης, όχι AI.`)))),
    h("div", { class: "demo-cta" },
      h("button", { class: "btn btn-primary btn-lg", type: "button", onclick: () => app.newDecision() }, L("Try it with your own decision", "Δοκίμασέ το με τη δική σου απόφαση")),
      h("button", { class: "btn btn-quiet", type: "button", onclick: () => { demo = null; update(); } }, L("Reset the example", "Επαναφορά παραδείγματος"))));
}

const CRACK = `<svg viewBox="0 0 120 60" preserveAspectRatio="none"><path pathLength="1" d="M2 30 L22 26 L30 34 L46 22 L58 30 L72 18 L80 28 L98 20 L118 26 M46 22 L50 8 M72 18 L70 44 L84 52 M30 34 L26 52"/></svg>`;
