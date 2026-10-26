/* Decision creation: seven small steps instead of one big form. Every step saves as you type, so a decision can be
   left half-finished and picked up later. Suggestions are always labelled and always editable. */
import { L, tr } from "../../i18n.ts";
import { suggestAlternatives } from "../../domain/engine.ts";
import { type Decision, HORIZON_LABEL, HORIZONS, type Horizon, PRIORITY_KEYS, PRIORITY_LABEL, type PriorityKey } from "../../domain/types.ts";
import { uid } from "../../data/store.ts";
import type { App } from "../app.ts";
import { scene } from "../cinema.ts";
import { h, icon } from "../dom.ts";

const STEPS = ["Decision", "Constraints", "Alternatives", "Time horizon", "Priorities", "Unknowns", "Review"] as const;
const suggested = new Set<string>();

/* each step is a question, set as the title of a short scene */
const COPY: { q: string; lead: string }[] = [
  { q: "What are you deciding?", lead: "In your own words. A question works well: \"Should I…?\"" },
  { q: "What are your hard limits?", lead: "Money, time, place, people. MIRROR checks every option against these and treats them as facts you stated. Skip this step if there are none." },
  { q: "What are the real options?", lead: "Two to four. Keeping things as they are is an option too, and often the one to beat." },
  { q: "How far ahead should we look?", lead: "The Future Lab maps each option at three points in time. The further out, the less anyone can know." },
  { q: "What matters most here?", lead: "Choose up to three, most important first. Every option is compared against these, and only these." },
  { q: "What don't you know yet?", lead: "The things that, if you knew them, might change your mind. MIRROR turns these into experiments. Optional." },
  { q: "Ready to map the futures.", lead: "Check the essentials. You can change any of this later from the Future Lab." }
];
const FILM_LINE = "threshold" as const;

type Example = Pick<Decision, "title" | "context" | "constraints" | "unknowns" | "priorities" | "horizon"> & { alts: [string, string][] };
const EXAMPLES: Record<string, Example> = {
  career: {
    title: "Should I leave my job to study design full-time?",
    context: "I've worked in accounting for four years. Design is what I do in the evenings, and I keep wondering if it could be more.",
    constraints: ["Savings for about 6 months", "Can't move cities before next summer"],
    alts: [["Stay and study design at night", "Keeps income; slower"], ["Quit and study full-time", "A one-year programme starts in September"], ["Take a 3-month sabbatical to test it", "My employer has allowed this before"]],
    unknowns: ["Whether design studios hire career-changers without a degree"], priorities: ["money", "growth", "meaning"], horizon: "3y",
  },
  move: {
    title: "Should I move to Lisbon or stay in Athens?",
    context: "I work remotely. Most of my friends are here, but I feel stuck.",
    constraints: ["My lease ends in March", "Budget around €1,400 a month for rent"],
    alts: [["Move to Lisbon in March", ""], ["Stay in Athens and renew the lease", ""], ["Spend two months in Lisbon first", "Short-term rental"]],
    unknowns: ["How lonely the first months would actually feel"], priorities: ["relationships", "freedom", "money"], horizon: "1y",
  },
  business: {
    title: "Should I turn my side project into a business?",
    context: "A small tool I built has 40 people using it every week. Two asked if they could pay.",
    constraints: ["About 10 hours a week to spare", "No outside investment"],
    alts: [["Launch a paid version this month", ""], ["Keep it free and grow it slowly", ""], ["Pre-sell to the first 20 users", "Only build further if 10 pay"]],
    unknowns: ["What people would actually pay"], priorities: ["growth", "money", "health"], horizon: "1y",
  },
};

export function createView(app: App, route: { id: string }): Node {
  const d = app.store.get(route.id);
  if (!d) return missing();
  const step = d.step;
  const set = (fn: (x: Decision) => void, rerender = false) => { app.store.update(d.id, fn, rerender); if (rerender) app.render(); };
  const errEl = h("p", { class: "err", role: "alert" });
  const go = (n: number) => { set((x) => { x.step = Math.max(0, Math.min(6, n)); }, true); };

  const validate = (): string | null => {
    const x = app.store.get(d.id)!;
    if (step === 0 && x.title.trim().length < 3) return "Write the decision in a few words first.";
    if (step === 2) {
      if (x.alternatives.some((a) => !a.title.trim())) return "Every alternative needs a name, or delete the empty one.";
      const t = x.alternatives.map((a) => a.title.trim().toLowerCase()).filter(Boolean);
      if (t.length < 2) return "Add at least two alternatives. Doing nothing counts as one.";
      if (new Set(t).size !== t.length) return "Two alternatives have the same name. Make each one distinct.";
    }
    return null;
  };
  const next = () => { const e = validate(); if (e) { errEl.textContent = tr(e); return; } go(step + 1); };

  /* the first time we reach alternatives, offer labelled suggestions */
  if (step === 2 && d.alternatives.length === 0) {
    const s = suggestAlternatives(d.title);
    app.store.update(d.id, (x) => { x.alternatives = s.slice(0, 3).map((t) => { const id = uid("a"); suggested.add(id); return { id, title: t, note: "" }; }); });
  }

  const body = [stepDecision, stepConstraints, stepAlternatives, stepHorizon, stepPriorities, stepUnknowns, stepReview][step]!(app, app.store.get(d.id)!, set);
  const maxReached = Math.max(step, d.title.trim().length >= 3 ? (d.alternatives.length >= 2 ? 6 : 2) : 0);
  const pct = (step / (STEPS.length - 1)) * 100;

  const c = COPY[step]!;
  return h("div", null,
    scene(app, {
      film: FILM_LINE, size: "band", titleId: "step-title",
      eyebrow: L(`Step ${step + 1} of 7 · ${STEPS[step]}`, `Βήμα ${step + 1} από 7 · ${tr(STEPS[step]!)}`), title: c.q, lead: c.lead,
      after: h("nav", { class: "steps", "aria-label": "Steps", style: `--pct:${pct}%` },
        h("span", { class: "lit", "aria-hidden": "true" }),
        ...STEPS.map((label, i) => h("button", { type: "button", "aria-current": i === step ? "step" : undefined, "data-done": i < step ? "" : undefined, disabled: i > maxReached, onclick: () => { if (i <= step || !validate()) go(i); } }, h("span", null, label)))),
    }),
    h("div", { class: "wrap wiz" }, h("div", { class: "wiz-body" },
      body,
      errEl,
      h("div", { class: "wiz-foot" },
        step > 0 ? h("button", { class: "btn", type: "button", onclick: () => go(step - 1) }, icon("back"), "Back") : null,
        h("button", { class: "btn btn-quiet", type: "button", onclick: () => { app.store.flush(); app.toast("Draft saved. Find it under Drafts."); app.nav("#/app"); } }, "Save draft & exit"),
        step < 6 ? h("button", { class: "btn btn-primary", type: "button", onclick: next }, step === 5 ? (d.unknowns.length ? "Review" : "Skip to review") : step === 1 && !d.constraints.length ? "Skip" : "Continue")
          : h("button", { class: "btn btn-primary", type: "button", disabled: app.analyzing.has(d.id), onclick: async () => {
              const x = app.store.get(d.id)!;
              const t = x.alternatives.filter((a) => a.title.trim());
              if (x.title.trim().length < 3 || t.length < 2) { errEl.textContent = tr("A decision needs a title and at least two alternatives."); return; }
              app.store.update(d.id, (y) => { y.alternatives = y.alternatives.filter((a) => a.title.trim()); }, true);
              const ok = await app.analyze(app.store.get(d.id)!);
              if (ok) app.nav(`#/lab/${d.id}`);
            } }, app.analyzing.has(d.id) ? "Mapping futures…" : "Map the futures", icon("branch"))),
      app.analyzing.has(d.id) ? h("div", { class: "scan", style: "margin-top:16px", role: "progressbar", "aria-label": "Mapping futures" }) : null)));
}

type Upd = (fn: (x: Decision) => void, rerender?: boolean) => void;

function stepDecision(app: App, d: Decision, set: Upd): Node {
  const fill = (k: string) => {
    const e = EXAMPLES[k]!;
    set((x) => {
      x.title = tr(e.title); x.context = tr(e.context); x.constraints = e.constraints.map(tr); x.unknowns = e.unknowns.map(tr);
      x.priorities = [...e.priorities]; x.horizon = e.horizon;
      x.alternatives = e.alts.map(([t, n]) => ({ id: uid("a"), title: tr(t), note: n ? tr(n) : "" }));
    }, true);
    app.toast("Example filled into every step. Change anything you like.");
  };
  return h("div", null,
    h("div", { class: "field" },
      h("label", { for: "f-title", class: "sr" }, "Your decision"),
      h("textarea", { id: "f-title", k: "title", class: "textarea big", rows: 2, maxlength: 200, placeholder: "Should I…", value: d.title,
        oninput: (e: Event) => set((x) => { x.title = (e.target as HTMLTextAreaElement).value; }) }),
      h("div", { class: "examples" }, h("span", { class: "hint" }, "Or try:"),
        ...Object.entries({ career: "Changing careers", move: "Moving cities", business: "Starting a business" }).map(([k, l]) =>
          h("button", { class: "ex", type: "button", onclick: () => fill(k) }, h("em", null, "Example"), l)))),
    h("div", { class: "field", style: "margin-top:var(--s6)" },
      h("label", { for: "f-ctx" }, "What makes it hard? ", h("span", { class: "faint" }, "(optional)")),
      h("textarea", { id: "f-ctx", k: "ctx", class: "textarea", rows: 4, maxlength: 2000, placeholder: "The background someone would need to understand your situation.", value: d.context,
        oninput: (e: Event) => set((x) => { x.context = (e.target as HTMLTextAreaElement).value; }) })));
}

function chipEditor(app: App, items: string[], add: (v: string) => void, remove: (i: number) => void, opts: { id: string; label: string; placeholder: string; max: number; examples: string[] }): Node {
  const input = h("input", { id: opts.id, k: opts.id, class: "input", maxlength: 160, placeholder: opts.placeholder, autocomplete: "off" });
  const submit = () => {
    const v = input.value.trim();
    if (!v) return;
    if (items.length >= opts.max) { app.toast(L(`Up to ${opts.max}. Remove one first.`, `Έως ${opts.max}. Αφαίρεσε πρώτα ένα.`), "bad"); return; }
    if (items.some((x) => x.toLowerCase() === v.toLowerCase())) { input.value = ""; return; }
    add(v);
  };
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } });
  return h("div", { class: "stack" },
    h("div", { class: "field" },
      h("label", { for: opts.id }, opts.label),
      h("div", { class: "row", style: "flex-wrap:nowrap" }, input, h("button", { class: "btn", type: "button", onclick: submit }, icon("plus"), "Add"))),
    items.length ? h("ul", { class: "row", "aria-label": "Added" }, ...items.map((c, i) => h("li", { class: "chip" }, c, h("button", { type: "button", "aria-label": L(`Remove "${c}"`, `Αφαίρεση «${c}»`), onclick: () => remove(i) }, icon("x"))))) : null,
    h("div", { class: "examples" }, h("span", { class: "hint" }, "Tap to add:"), ...opts.examples.map(tr).filter((x) => !items.includes(x)).map((x) => h("button", { class: "ex", type: "button", "aria-label": L(`Add "${x}"`, `Προσθήκη «${x}»`), onclick: () => { if (items.length < opts.max) add(x); } }, icon("plus"), x))));
}

function stepConstraints(app: App, d: Decision, set: Upd): Node {
  return h("div", null,
    chipEditor(app, d.constraints, (v) => set((x) => { x.constraints.push(v); }, true), (i) => set((x) => { x.constraints.splice(i, 1); }, true),
      { id: "f-con", label: "Add a constraint", placeholder: "e.g. Savings for 6 months", max: 10, examples: ["Savings for 6 months", "Can't relocate before June", "Need to decide by the end of the month"] }));
}

function stepAlternatives(app: App, d: Decision, set: Upd): Node {
  const alts = d.alternatives;
  const move = (i: number, dir: -1 | 1) => set((x) => { const j = i + dir; if (j < 0 || j >= x.alternatives.length) return; [x.alternatives[i], x.alternatives[j]] = [x.alternatives[j]!, x.alternatives[i]!]; }, true);
  const remove = (i: number) => {
    const gone = alts[i]!;
    set((x) => { x.alternatives.splice(i, 1); }, true);
    app.toast(L(`Removed "${gone.title || "alternative"}"`, `Αφαιρέθηκε το «${gone.title || "εναλλακτική"}»`), "ok", { label: "Undo", run: () => { set((x) => { x.alternatives.splice(i, 0, gone); }, true); } });
  };
  return h("div", null,
    h("ol", { class: "alts" }, ...alts.map((a, i) =>
      h("li", { class: "alt" },
        h("span", { class: "n", "aria-hidden": "true" }, String.fromCharCode(65 + i)),
        h("div", { style: "display:grid;gap:4px;min-width:0" },
          suggested.has(a.id) ? h("span", { class: "tag amber sugg" }, "Suggested — edit freely") : null,
          h("label", { class: "sr", for: `alt-${a.id}` }, L(`Alternative ${String.fromCharCode(65 + i)}`, `Εναλλακτική ${String.fromCharCode(65 + i)}`)),
          h("input", { id: `alt-${a.id}`, k: `alt-${a.id}`, class: "input", value: a.title, maxlength: 120, placeholder: "Name this option",
            oninput: (e: Event) => { suggested.delete(a.id); set((x) => { const t = x.alternatives.find((y) => y.id === a.id); if (t) t.title = (e.target as HTMLInputElement).value; }); } }),
          h("label", { class: "sr", for: `altn-${a.id}` }, "Note"),
          h("input", { id: `altn-${a.id}`, k: `altn-${a.id}`, class: "input note", value: a.note, maxlength: 400, placeholder: "Anything specific about it? (optional)",
            oninput: (e: Event) => set((x) => { const t = x.alternatives.find((y) => y.id === a.id); if (t) t.note = (e.target as HTMLInputElement).value; }) })),
        h("div", { class: "row", style: "gap:2px;flex-wrap:nowrap" },
          h("button", { class: "btn btn-quiet icon-btn", type: "button", "aria-label": L(`Move alternative ${String.fromCharCode(65 + i)} up`, `Μετακίνηση εναλλακτικής ${String.fromCharCode(65 + i)} πάνω`), disabled: i === 0, onclick: () => move(i, -1) }, icon("up")),
          h("button", { class: "btn btn-quiet icon-btn", type: "button", "aria-label": L(`Move alternative ${String.fromCharCode(65 + i)} down`, `Μετακίνηση εναλλακτικής ${String.fromCharCode(65 + i)} κάτω`), disabled: i === alts.length - 1, onclick: () => move(i, 1) }, icon("down")),
          h("button", { class: "btn btn-quiet icon-btn", type: "button", "aria-label": L(`Remove alternative ${String.fromCharCode(65 + i)}`, `Αφαίρεση εναλλακτικής ${String.fromCharCode(65 + i)}`), onclick: () => remove(i) }, icon("trash")))))),
    alts.length < 4 ? h("button", { class: "btn", type: "button", style: "margin-top:var(--s4)", onclick: () => { const id = uid("a"); set((x) => { x.alternatives.push({ id, title: "", note: "" }); }, true); setTimeout(() => document.getElementById(`alt-${id}`)?.focus(), 0); } }, icon("plus"), "Add an alternative")
      : h("p", { class: "hint", style: "margin-top:var(--s4)" }, "Four is the limit: more options usually means the decision needs splitting."));
}

function stepHorizon(_app: App, d: Decision, set: Upd): Node {
  const desc: Record<Horizon, string> = { "3m": "A near-term call: futures at 2 weeks, 6 weeks and 3 months.", "1y": "Futures at 1 month, 6 months and 1 year.", "3y": "Futures at 3 months, 1 year and 3 years.", "5y": "A long arc: 1 year, 3 years and 5+ years. The far end is mostly speculative." };
  return h("div", null,
    h("fieldset", { style: "border:0;padding:0;margin:0" },
      h("legend", { class: "sr" }, "Time horizon"),
      h("div", { class: "prio" }, ...HORIZONS.map((k) =>
        h("div", { class: "prio-opt", "data-on": d.horizon === k ? "" : undefined, style: "grid-template-columns:auto 1fr" },
          h("input", { type: "radio", name: "hz", id: `hz-${k}`, k: `hz-${k}`, value: k, checked: d.horizon === k, onchange: () => set((x) => { x.horizon = k; }, true) }),
          h("label", { for: `hz-${k}` }, h("b", null, HORIZON_LABEL[k]), h("span", { class: "muted small", style: "display:block;font-weight:400" }, desc[k])))))));
}

function stepPriorities(app: App, d: Decision, set: Upd): Node {
  const sel = d.priorities;
  const toggle = (k: PriorityKey) => set((x) => {
    const i = x.priorities.indexOf(k);
    if (i >= 0) x.priorities.splice(i, 1);
    else if (x.priorities.length < 3) x.priorities.push(k);
    else app.toast("Pick up to three. Remove one to add another.", "bad");
  }, true);
  const move = (k: PriorityKey, dir: -1 | 1) => set((x) => { const i = x.priorities.indexOf(k), j = i + dir; if (i < 0 || j < 0 || j >= x.priorities.length) return; [x.priorities[i], x.priorities[j]] = [x.priorities[j]!, x.priorities[i]!]; }, true);
  const ordered = [...sel, ...PRIORITY_KEYS.filter((k) => !sel.includes(k))];
  return h("div", null,
    h("fieldset", { style: "border:0;padding:0;margin:0" },
      h("legend", { class: "sr" }, "Priorities, up to three"),
      h("ul", { class: "prio" }, ...ordered.map((k) => {
        const i = sel.indexOf(k);
        return h("li", { class: "prio-opt", "data-on": i >= 0 ? "" : undefined },
          h("input", { type: "checkbox", id: `p-${k}`, k: `p-${k}`, checked: i >= 0, onchange: () => toggle(k) }),
          h("label", { for: `p-${k}` }, PRIORITY_LABEL[k]),
          i >= 0 ? h("div", { class: "row", style: "gap:2px;flex-wrap:nowrap" },
            h("span", { class: "rank", "aria-label": L(`Rank ${i + 1}`, `Σειρά ${i + 1}`) }, `#${i + 1}`),
            h("button", { class: "btn btn-quiet icon-btn", type: "button", "aria-label": L(`Move ${PRIORITY_LABEL[k]} up`, `Μετακίνηση: ${PRIORITY_LABEL[k]} πάνω`), disabled: i === 0, onclick: () => move(k, -1) }, icon("up")),
            h("button", { class: "btn btn-quiet icon-btn", type: "button", "aria-label": L(`Move ${PRIORITY_LABEL[k]} down`, `Μετακίνηση: ${PRIORITY_LABEL[k]} κάτω`), disabled: i === sel.length - 1, onclick: () => move(k, 1) }, icon("down"))) : h("span"));
      }))));
}

function stepUnknowns(app: App, d: Decision, set: Upd): Node {
  return h("div", null,
    chipEditor(app, d.unknowns, (v) => set((x) => { x.unknowns.push(v); }, true), (i) => set((x) => { x.unknowns.splice(i, 1); }, true),
      { id: "f-unk", label: "Add an unknown", placeholder: "e.g. Whether I'd enjoy it day to day", max: 8, examples: ["Whether I'd enjoy it day to day", "What it really costs", "How my partner feels about it"] }));
}

function stepReview(app: App, d: Decision, set: Upd): Node {
  const edit = (n: number, label: string) => h("button", { class: "btn btn-quiet btn-sm", type: "button", "aria-label": L(`Edit ${label}`, `Επεξεργασία: ${tr(label)}`), onclick: () => set((x) => { x.step = n; }, true) }, icon("edit"), "Edit");
  const row = (label: string, n: number, v: Node | string) => [h("dt", null, label), h("dd", { class: "row between", style: "align-items:start;flex-wrap:nowrap" }, h("div", { class: "grow" }, v), edit(n, label))];
  const none = h("span", { class: "faint" }, "None");
  void app;
  return h("div", { class: "review" },
    h("dl", { class: "panel pad" },
      ...row("Decision", 0, h("b", null, d.title)),
      ...row("Constraints", 1, d.constraints.length ? d.constraints.join(" · ") : none),
      ...row("Alternatives", 2, h("ol", null, ...d.alternatives.filter((a) => a.title.trim()).map((a, i) => h("li", null, `${String.fromCharCode(65 + i)}. ${a.title}`)))),
      ...row("Horizon", 3, HORIZON_LABEL[d.horizon]),
      ...row("Priorities", 4, d.priorities.length ? d.priorities.map((p, i) => `${i + 1}. ${PRIORITY_LABEL[p]}`).join("  ") : h("span", { class: "faint" }, "None: placeholders will be used")),
      ...row("Unknowns", 5, d.unknowns.length ? d.unknowns.join(" · ") : none)),
    h("p", { class: "hint", style: "margin-top:var(--s4)" }, app.store.settings.analysis === "server" ? "The analysis will be produced by the AI model configured on the server." : "The analysis will be produced by MIRROR's transparent demonstration rules on this device, not by AI. You can switch in Settings."));
}

function missing(): Node {
  return h("div", { class: "wrap" }, h("h1", { class: "h1" }, "This decision doesn't exist."), h("p", { class: "lead", style: "margin-top:12px" }, "It may have been deleted."), h("a", { class: "btn", href: "#/app", style: "margin-top:24px" }, "Back to decisions"));
}
