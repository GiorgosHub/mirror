/* First visit: a full-screen title scene that says what MIRROR is and isn't.
   Returning: the decision you were exploring, as its own title scene, then a quiet editorial index of everything else. */
import { L, tr } from "../../i18n.ts";
import { deriveView, nextStep } from "../../domain/engine.ts";
import { type Decision, HORIZON_LABEL } from "../../domain/types.ts";
import type { App } from "../app.ts";
import { scene } from "../cinema.ts";
import { fmtDate, h, icon, s, today } from "../dom.ts";

const STATUS_LABEL: Record<Decision["status"], string> = { draft: "Draft", exploring: "Exploring", decided: "Decided", resolved: "Resolved", archived: "Archived" };

export function introView(app: App): Node {
  const start = () => { app.store.setSettings({ introSeen: true }); app.newDecision(); };
  const skip = () => { app.store.setSettings({ introSeen: true }); app.nav("#/"); };
  const flow: [string, string][] = [
    ["Decision", "Say it in your own words"],
    ["Alternatives", "Two to four real options"],
    ["Possible futures", "Near, middle and far"],
    ["Trade-offs", "Against what matters to you"],
    ["Experiments", "Cheap ways to learn more"],
    ["Action", "One next step, a review date"],
    ["Reflection", "What actually happened"],
  ];
  return h("div", null,
    scene(app, {
      film: "possibility-field", size: "full", titleId: "intro-h",
      eyebrow: "A decision instrument",
      title: "Meet the futures you could make.",
      lead: "Lay out a decision, see where each path could lead and what that depends on, and find the smallest step that would tell you more. MIRROR doesn't predict, and it won't choose for you.",
      actions: [
        h("button", { class: "btn btn-primary btn-lg", type: "button", onclick: start }, "Explore a decision"),
        app.store.data.decisions.length ? h("button", { class: "btn btn-ghost btn-lg", type: "button", onclick: skip }, "Go to my decisions")
          : h("a", { class: "btn btn-ghost btn-lg", href: "#how", onclick: (e: Event) => { e.preventDefault(); document.getElementById("how")?.scrollIntoView({ behavior: app.reducedMotion ? "auto" : "smooth" }); } }, "How it works"),
      ],
    }),
    h("section", { class: "wrap chapter-band", id: "how", "aria-labelledby": "how-h" },
      h("div", { class: "band-head" }, h("p", { class: "eyebrow" }, "How it works"), h("h2", { class: "title-2", id: "how-h" }, "One decision, followed all the way through.")),
      h("ol", { class: "flow" }, ...flow.map(([b, t]) => h("li", null, h("b", null, b), h("span", null, t)))),
      h("div", { class: "principles" },
        principle("Not an oracle", "Every future is marked as known, assumed or speculative. No invented probabilities, no false precision."),
        principle("Your reasoning, visible", "Change an assumption and watch which futures and trade-offs move. Every conclusion shows where it comes from."),
        principle("Yours, on this device", "Decisions are stored in this browser only. No account, no tracking. Export or delete everything at any time.")),
      h("div", { class: "row", style: "margin-top:var(--s7)" },
        h("button", { class: "btn btn-primary", type: "button", onclick: start }, "Start with a real decision"),
        !app.store.data.decisions.length ? h("button", { class: "btn btn-quiet", type: "button", onclick: skip }, "Skip the introduction") : null)));
}

const principle = (t: string, p: string) => h("div", { class: "principle" }, h("h3", { class: "h3" }, t), h("p", { class: "muted" }, p));

export function homeView(app: App): Node {
  const all = app.store.data.decisions;
  if (!all.length) return emptyHome(app);
  const live = all.filter((d) => d.status === "exploring" || d.status === "decided");
  const drafts = all.filter((d) => d.status === "draft");
  const done = all.filter((d) => d.status === "resolved" || d.status === "archived");
  const focus = [...live].sort((a, b) => (b.openedAt ?? b.updatedAt).localeCompare(a.openedAt ?? a.updatedAt))[0] ?? drafts[0];

  const actions = live.flatMap((d) => {
    const views = deriveView(d);
    const planned = views.flatMap((v) => v.experiments.filter((x) => x.state.status === "planned").map((x) => ({ d, title: x.title, due: x.state.due, kind: "Experiment" })));
    const choice = d.choice?.nextAction ? [{ d, title: d.choice.nextAction, due: undefined as string | undefined, kind: "Next action" }] : [];
    return [...choice, ...planned];
  }).sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999"));
  const reviews = live.filter((d) => d.choice?.reviewAt).sort((a, b) => a.choice!.reviewAt!.localeCompare(b.choice!.reviewAt!));
  const others = live.filter((d) => d !== focus);

  return h("div", null,
    focus ? nowScene(app, focus) : quietScene(app, done.length),
    h("div", { class: "wrap index" },
      column("Next actions", actions.length, actions.length ? h("ul", { class: "list" }, ...actions.slice(0, 6).map((a) =>
        h("li", null, h("a", { class: "item", href: `#/lab/${a.d.id}?tab=experiments` }, h("b", null, a.title), a.due ? h("span", { class: `tag ${a.due < today() ? "rose" : "violet"} num` }, fmtDate(a.due)) : h("span", { class: "tag" }, a.kind), h("small", null, a.d.title))))) :
        empty("No planned steps yet", "In the Future Lab, plan an experiment. It will show up here with its date.")),
      column("Reviews", reviews.length, reviews.length ? h("ul", { class: "list" }, ...reviews.map((d) =>
        h("li", null, h("a", { class: "item", href: `#/lab/${d.id}?tab=journal` }, h("b", null, d.title), h("span", { class: `tag ${d.choice!.reviewAt! <= today() ? "amber" : ""} num` }, fmtDate(d.choice!.reviewAt)), h("small", null, "Compare what happened with what you assumed"))))) :
        empty("No reviews scheduled", "When you record a choice, set a review date to check your assumptions against reality.")),
      column("Also exploring", others.length, others.length ? h("ul", { class: "list" }, ...others.map((d) => itemLink(d))) :
        empty("Just this one", "Explore another decision whenever you're ready.")),
      drafts.length ? column("Drafts", drafts.length, h("ul", { class: "list" }, ...drafts.map((d) => itemLink(d)))) : null,
      done.length ? column("Resolved & archived", done.length, h("ul", { class: "list" }, ...done.slice(0, 5).map((d) => itemLink(d)), done.length > 5 ? h("li", null, h("a", { class: "btn btn-quiet btn-sm", href: "#/history" }, "See all in History")) : null)) : null));
}

function emptyHome(app: App): Node {
  return scene(app, {
    film: "branching-light", size: "tall", still: true,
    eyebrow: "Your decisions",
    title: "Nothing on the table yet.",
    lead: "Start with something you've been going back and forth on. It can be big or small, and you can save it half-finished.",
    actions: [
      h("button", { class: "btn btn-primary btn-lg", type: "button", onclick: () => app.newDecision() }, "Explore a decision"),
      h("a", { class: "btn btn-ghost btn-lg", href: "#/" }, "How MIRROR works"),
    ],
  });
}

/* nothing in progress: still a proper title scene, never a headless page */
function quietScene(app: App, resolved: number): Node {
  return scene(app, {
    film: "convergence", size: "band", still: true,
    eyebrow: "Your decisions",
    title: "Nothing in progress.",
    lead: resolved ? L(`${resolved} decision${resolved === 1 ? " is" : "s are"} resolved or archived. Explore the next one when you're ready.`, `${resolved} ${resolved === 1 ? "απόφαση έχει" : "αποφάσεις έχουν"} ολοκληρωθεί ή αρχειοθετηθεί. Εξερεύνησε την επόμενη όποτε είσαι έτοιμος/η.`) : "Explore a decision when you're ready.",
    actions: [h("button", { class: "btn btn-primary btn-lg", type: "button", onclick: () => app.newDecision() }, "Explore a decision"), h("a", { class: "btn btn-ghost btn-lg", href: "#/history" }, "History")],
  });
}

function nowScene(app: App, d: Decision): Node {
  const views = deriveView(d);
  const step = nextStep(views);
  const href = d.status === "draft" ? `#/new/${d.id}` : `#/lab/${d.id}`;
  const open = views.reduce((n, v) => n + v.open, 0);
  const chosen = d.choice ? d.alternatives.find((a) => a.id === d.choice!.alternativeId)?.title : undefined;
  return scene(app, {
    film: d.status === "decided" ? "convergence" : "branching-light", size: "tall", titleId: "now-h",
    eyebrow: h("span", null, "Now exploring", h("span", { class: "eyebrow-tag" }, STATUS_LABEL[d.status])),
    title: d.title || "Untitled decision",
    credits: d.analysis ? [
      ["Options", String(d.alternatives.length)],
      ["Horizon", HORIZON_LABEL[d.horizon]],
      ["Still open", L(`${open} assumption${open === 1 ? "" : "s"}`, `${open} ${open === 1 ? "υπόθεση" : "υποθέσεις"}`)],
      ...(chosen ? [["Chose", chosen] as [string, string]] : []),
    ] : [["Draft", L(`Step ${d.step + 1} of 7`, `Βήμα ${d.step + 1} από 7`)]],
    actions: [
      h("a", { class: "btn btn-primary btn-lg", href }, d.status === "draft" ? "Continue" : "Open the Future Lab"),
      d.analysis ? h("a", { class: "btn btn-ghost btn-lg", href: `#/brief/${d.id}` }, icon("doc"), "Brief") : null,
    ],
    after: !chosen && step ? h("p", { class: "scene-note" }, icon("flask"), h("span", null, h("span", { class: "faint" }, "Most useful next step  "), h("b", null, step.experiment.title), h("span", { class: "faint" }, L(` · tests: ${step.assumption.text.toLowerCase()}`, ` · ελέγχει: ${step.assumption.text.toLowerCase()}`)))) : null,
  });
}

/* a decision's shape at a glance (kept for History and small contexts) */
export function glyph(d: Decision): SVGElement {
  const views = deriveView(d);
  const n = Math.max(views.length, d.alternatives.length, 2);
  const svg = s("svg", { viewBox: "0 0 400 260", preserveAspectRatio: "xMidYMid meet", role: "img", "aria-label": L(`Shape of the decision: ${n} paths`, `Το σχήμα της απόφασης: ${n} δρόμοι`) });
  const col: Record<string, string> = { fact: "var(--known)", assumed: "var(--assumed)", speculative: "var(--speculative)", broken: "var(--broken)" };
  const ox = 56, oy = 130;
  for (let i = 0; i < n; i++) {
    const y = 40 + (180 / Math.max(1, n - 1)) * i;
    const v = views[i];
    const far = v?.outcomes[2]?.effective ?? "speculative";
    const c = v ? col[far]! : "var(--line-3)";
    const pts = [0, 1, 2].map((k) => [170 + k * 80, y + (oy - y) * (0.18 - k * 0.06)] as const);
    svg.append(s("path", { d: `M${ox},${oy} C${ox + 60},${oy} ${110},${y} ${pts[0]![0]},${pts[0]![1]} L${pts[1]![0]},${pts[1]![1]} L${pts[2]![0]},${pts[2]![1]}`, fill: "none", stroke: c, "stroke-width": 1.5, "stroke-linecap": "round", opacity: 0.85, "stroke-dasharray": far === "speculative" ? "3 5" : undefined }));
  }
  svg.append(s("circle", { cx: ox, cy: oy, r: 6, fill: "var(--text)" }));
  return svg;
}

const column = (title: string, n: number, body: Node) =>
  h("section", { class: "col", "aria-label": title }, h("div", { class: "col-head" }, h("h2", { class: "eyebrow" }, title), h("span", { class: "faint xs num" }, String(n))), body);
const empty = (b: string, t: string) => h("div", { class: "empty" }, h("b", null, b), t);
const itemLink = (d: Decision) =>
  h("li", null, h("a", { class: "item", href: d.status === "draft" ? `#/new/${d.id}` : `#/lab/${d.id}` }, h("b", null, d.title || "Untitled decision"), h("span", { class: "tag" }, STATUS_LABEL[d.status]),
    h("small", null, L(`Updated ${fmtDate(d.updatedAt)}`, `Ενημερώθηκε ${fmtDate(d.updatedAt)}`))));
