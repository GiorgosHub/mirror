/* The Future Lab: where a decision becomes a map of possible futures.
   Desktop: a horizontal field, the present as one point of light, each alternative a path through three moments.
   Mobile: one path at a time, vertical, thumb-sized. The inspector explains every future by its assumptions, and
   judging an assumption visibly changes the futures and the comparison. */
import { L, tr } from "../../i18n.ts";
import { ARCHETYPE_LABEL, type BranchView, deriveView, describeTradeOff, type EffectiveKind, nextStep, RANK, slotLabels, tradeOffs } from "../../domain/engine.ts";
import { type AssumptionStatus, type Decision, HORIZON_LABEL, PRIORITY_LABEL, type Snapshot } from "../../domain/types.ts";
import { nowIso, uid } from "../../data/store.ts";
import type { App, LabTab, LabUI } from "../app.ts";
import { scene } from "../cinema.ts";
import { daysFromNow, fmtDate, h, icon, s } from "../dom.ts";

const KIND_LABEL: Record<EffectiveKind, string> = { fact: "Follows from what you said", assumed: "Assumed", speculative: "Speculative", broken: "Assumption broken" };
const KIND_SHORT: Record<EffectiveKind, string> = { fact: "Known", assumed: "Assumed", speculative: "Speculative", broken: "Broken" };
const STATUS_LABEL: Record<AssumptionStatus, string> = { holds: "Holds", unknown: "Unknown", doubtful: "Doubtful", false: "Not true" };
const SLOT_NAME = ["Near", "Middle", "Far"];

export function labView(app: App, route: { id: string; tab: LabTab }): Node {
  const d = app.store.get(route.id);
  if (!d) return h("div", { class: "wrap" }, h("h1", { class: "h1" }, "This decision doesn't exist."), h("a", { class: "btn", href: "#/app", style: "margin-top:24px" }, "Back to decisions"));
  if (!d.analysis) return unmapped(app, d);
  app.store.data.decisions.find((x) => x.id === d.id)!.openedAt = nowIso();

  const views = deriveView(d);
  const ui: LabUI = app.lab.get(d.id) ?? {};
  if (!ui.alt || !views.some((v) => v.branch.alternativeId === ui.alt)) ui.alt = views[0]?.branch.alternativeId;
  app.lab.set(d.id, ui);
  const sel = views.find((v) => v.branch.alternativeId === ui.alt)!;
  const step = nextStep(views);
  const an = d.analysis;
  const tab = route.tab;
  const counts: Partial<Record<LabTab, number>> = {
    assumptions: views.reduce((n, v) => n + v.open, 0),
    experiments: views.reduce((n, v) => n + v.experiments.filter((x) => x.state.status === "planned").length, 0),
    journal: d.observations.length + d.snapshots.length,
  };
  const chosen = d.choice ? d.alternatives.find((a) => a.id === d.choice!.alternativeId) : undefined;

  const actions = [
    d.status === "decided" ? h("a", { class: "btn btn-primary", href: `#/lab/${d.id}?tab=journal` }, icon("history"), "Reflect")
      : d.status === "resolved" || d.status === "archived" ? null
      : h("button", { class: "btn btn-primary", type: "button", onclick: () => recordChoice(app, d, views) }, icon("check"), "Record a choice"),
    h("button", { class: "btn btn-ghost lab-sec", type: "button", "aria-label": "Save version", onclick: () => saveVersion(app, d, views) }, icon("save"), h("span", { class: "lbl" }, "Save version")),
    h("a", { class: "btn btn-ghost lab-sec", href: `#/brief/${d.id}`, "aria-label": "Brief" }, icon("doc"), h("span", { class: "lbl" }, "Brief")),
    h("button", { class: "btn btn-quiet remap", type: "button", disabled: app.analyzing.has(d.id), onclick: async () => {
      if (await app.confirm("Map the futures again?", "MIRROR rebuilds the futures from your current inputs. Your judgements on assumptions that still exist are kept, and you can save a version first.", "Map again")) await app.analyze(d);
    } }, app.analyzing.has(d.id) ? "Mapping…" : "Map again"),
    moreMenu(app, d),
  ];
  const head = h("div", null,
    scene(app, {
      film: chosen ? "convergence" : "horizon", size: "band", titleId: "lab-title",
      eyebrow: "Future Lab", title: d.title,
      credits: [
        ["Horizon", HORIZON_LABEL[d.horizon]],
        ["What matters", d.priorities.length ? d.priorities.map((p) => PRIORITY_LABEL[p]).join(" · ") : "Not set"],
        ["Analysis", an.source.kind === "demo" ? h("span", { class: "src demo", title: "Produced by transparent rules on this device" }, "Demo rules · not AI") : h("span", { class: "src ai" }, `AI · ${an.source.model ?? "model"}`)],
        ["Mapped", fmtDate(an.source.generatedAt)],
      ],
      actions,
    }),
    h("div", { class: "wrap lab-notes" },
      app.analyzing.has(d.id) ? h("div", { class: "scan", role: "progressbar", "aria-label": "Mapping futures" }) : null,
      an.boundary ? h("div", { class: "notice", role: "note" }, icon("info"), h("p", null, an.boundary)) : null,
      chosen ? h("div", { class: "notice chosen" }, icon("check"), h("p", null, L("You chose ", "Επέλεξες το "), h("b", null, chosen.title), L(` on ${fmtDate(d.choice!.at)}.`, ` στις ${fmtDate(d.choice!.at)}.`), d.choice!.reviewAt ? L(` Review on ${fmtDate(d.choice!.reviewAt)}.`, ` Επανεξέταση στις ${fmtDate(d.choice!.reviewAt)}.`) : "", d.status === "resolved" ? " Resolved." : "")) : null,
      !chosen && step ? h("div", { class: "next" }, icon("flask"),
        h("div", { class: "grow" }, h("p", { class: "eyebrow" }, "Most useful thing to learn next"), h("p", null, h("b", null, step.experiment.title), h("span", { class: "muted" }, L(` · for "${step.view.title}"`, ` · για το «${step.view.title}»`))), h("p", { class: "xs muted why-line" }, step.why)),
        step.experiment.state.status === "idea" ? h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => planExperiment(app, d, step.experiment.id, step.experiment.title) }, "Plan it") : h("span", { class: "tag violet" }, L(`Planned ${fmtDate(step.experiment.state.due)}`, `Προγραμματισμένο ${fmtDate(step.experiment.state.due)}`))) : null));

  const tabs: [LabTab, string, Parameters<typeof icon>[0]][] = [["futures", "Futures", "branch"], ["compare", "Compare", "eye"], ["assumptions", "Assumptions", "info"], ["experiments", "Experiments", "flask"], ["journal", "Journal", "history"]];
  const tabBar = h("nav", { class: "tabs", "aria-label": "Future Lab sections" }, ...tabs.map(([k, l, ic]) =>
    h("a", { href: `#/lab/${d.id}?tab=${k}`, "aria-selected": String(k === tab), "aria-current": k === tab ? "page" : undefined }, icon(ic), l, counts[k] ? h("span", { class: "count" }, String(counts[k])) : null,
      k === tab ? h("span", { class: "underline", "aria-hidden": "true", style: "view-transition-name:tab-line" }) : null)));

  const body = tab === "compare" ? compareTab(app, d, views)
    : tab === "assumptions" ? assumptionsTab(app, d, views)
    : tab === "experiments" ? experimentsTab(app, d, views)
    : tab === "journal" ? journalTab(app, d, views)
    : futuresTab(app, d, views, sel, ui);

  ui.flash = undefined;
  return h("div", null, head, h("div", { class: "wrap lab-body" }, tabBar, body));
}

/* ---------------- futures ---------------- */
function futuresTab(app: App, d: Decision, views: BranchView[], sel: BranchView, ui: LabUI): Node {
  const slots = slotLabels(d);
  const pick = (alt: string, outcome?: string) => { ui.alt = alt; ui.outcome = outcome; app.render(); };
  const flash = new Set(ui.flash ?? []);
  const nodeBtn = (v: BranchView, i: number, mobile = false) => {
    const o = v.outcomes[i]!;
    const key = `${v.branch.alternativeId}:${i}`;
    return h("button", {
      class: `node${flash.has(key) ? " flash" : ""}`, type: "button", "data-kind": o.effective, "data-node": key, "data-row-sel": v === sel ? "" : undefined,
      "aria-pressed": String(ui.outcome === key && v === sel), k: mobile ? `m-${key}` : key,
      "aria-label": `${v.title}, ${slots[i]}: ${tr(KIND_SHORT[o.effective]!)}. ${o.shown}`,
      style: `view-transition-name:${vt(mobile ? "m" : "n", key)}`,
      onclick: () => pick(v.branch.alternativeId, key),
    },
      h("span", { class: "pt-row", "aria-hidden": "true" }, h("span", { class: "dot" }), h("span", { class: "k" }, KIND_SHORT[o.effective])),
      h("span", { class: "t" }, o.shown),
      deps(v, o.dependsOn));
  };
  const altBtn = (v: BranchView, mobile = false) => h("button", {
    class: "altlab", type: "button", "aria-pressed": String(v === sel), "data-alt": v.branch.alternativeId, k: mobile ? `ma-${v.branch.alternativeId}` : `a-${v.branch.alternativeId}`,
    onclick: () => pick(v.branch.alternativeId),
  }, h("span", { class: "n" }, `0${v.index + 1}`), h("span", { class: "t" }, v.title),
    v === sel ? h("span", { class: "underline", "aria-hidden": "true", style: `view-transition-name:${mobile ? "m-" : ""}alt-line` }) : null);

  const n = views.length;
  const cols = h("div", { class: "map-cols", style: `grid-template-rows:auto repeat(${n}, auto)` },
    h("div"), h("div", { class: "colh" }, h("span", null, "Path")),
    ...slots.map((l, i) => h("div", { class: "colh" }, h("span", null, SLOT_NAME[i]!), h("b", null, l))),
    h("div", { class: "origin", style: `grid-row:2 / span ${n}` }, h("span", { class: "pt" }), h("small", null, "Now")),
    ...views.flatMap((v, r) => [
      h("div", { class: "cell", style: `grid-column:2;grid-row:${r + 2}` }, altBtn(v)),
      ...[0, 1, 2].map((i) => h("div", { class: "cell", style: `grid-column:${i + 3};grid-row:${r + 2}` }, nodeBtn(v, i)))]));
  const svg = s("svg", { class: "light", "aria-hidden": "true" }) as SVGSVGElement;
  const map = h("section", { class: "map", "data-sel": "", "aria-label": "Map of possible futures" }, svg, cols);

  const firstDraw = !ui.drawn && !app.reducedMotion;
  ui.drawn = true;
  let drawn = false;
  const draw = () => { drawLight(map, svg, views, sel, firstDraw && !drawn, !app.reducedMotion); drawn = true; };
  requestAnimationFrame(draw);
  let raf = 0;
  const ro = new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); });
  requestAnimationFrame(() => ro.observe(map));
  const mo = new MutationObserver(() => { if (!map.isConnected) { ro.disconnect(); mo.disconnect(); } });
  requestAnimationFrame(() => mo.observe(document.getElementById("view")!, { childList: true }));

  const vmap = h("section", { class: "vmap", "aria-label": "Possible futures, one path at a time" },
    h("div", { class: "alt-pick", role: "group", "aria-label": "Choose a path" }, ...views.map((v) => altBtn(v, true))),
    h("div", { class: "vpath" },
      h("p", { class: "origin-m" }, "Now"),
      ...[0, 1, 2].flatMap((i) => [h("p", { class: "slot" }, `${tr(SLOT_NAME[i]!)} · ${slots[i]}`), nodeBtn(sel, i, true)])));

  return h("div", { class: "lab" },
    h("div", { class: "stage-wrap" }, map, vmap, h("div", { class: "stage-foot" }, legend(), h("p", { class: "hint" }, "Select a future to see what it rests on."))),
    inspector(app, d, sel, ui));
}

/* a valid, unique view-transition-name for an element that should morph between states */
const vt = (prefix: string, key: string) => `${prefix}-${key.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

/* what a future rests on, visible on the map itself: one mark per assumption, in its current state */
function deps(v: BranchView, ids: string[]): Node {
  const as = ids.map((id) => v.assumptions.find((a) => a.id === id)).filter(Boolean) as BranchView["assumptions"];
  if (!as.length) return h("span", { class: "deps", "aria-hidden": "true" }, h("span", null, "rests on what you said"));
  const open = as.filter((a) => a.status === "unknown" || a.status === "doubtful").length;
  return h("span", { class: "deps", "aria-hidden": "true" }, ...as.map((a) => h("i", { class: a.status })),
    h("span", null, open ? L(`${open} of ${as.length} unconfirmed`, `${open} από ${as.length} ανεπιβεβαίωτες`) : as.some((a) => a.status === "false") ? "an assumption failed" : L("all confirmed", "όλες επιβεβαιωμένες")));
}

/* the line itself carries the state: solid = known, long dash = assumed, dots = speculative, sparse = broken */
function legend(): Node {
  return h("ul", { class: "legend", "aria-label": "Legend" },
    ...(["fact", "assumed", "speculative", "broken"] as EffectiveKind[]).map((k) => h("li", { class: `ep ${k}` },
      sample(k), KIND_LABEL[k])));
}
function sample(k: EffectiveKind): SVGElement {
  return s("svg", { width: 34, height: 8, viewBox: "0 0 34 8", "aria-hidden": "true" }, s("line", { class: `ln ${k}`, x1: 2, y1: 4, x2: 32, y2: 4 }));
}

/* Paths of light between the measured points. The selected path glows and carries a travelling light. */
function drawLight(map: HTMLElement, svg: SVGSVGElement, views: BranchView[], sel: BranchView, reveal: boolean, ambient: boolean) {
  if (!map.isConnected || getComputedStyle(map).display === "none") return;
  const box = map.getBoundingClientRect();
  const pt = map.querySelector(".origin .pt");
  if (!pt || !box.width) return;
  const C = (el: Element) => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2 - box.left, r.top + r.height / 2 - box.top] as const; };
  const L = (el: Element, side: "l" | "r") => { const r = el.getBoundingClientRect(); return [(side === "l" ? r.left - 10 : r.right + 10) - box.left, r.top + 11 - box.top] as const; };
  const o = C(pt);
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  svg.setAttribute("viewBox", `0 0 ${box.width} ${box.height}`);
  svg.innerHTML = `<defs><filter id="blur" x="-10%" y="-200%" width="120%" height="500%"><feGaussianBlur stdDeviation="5"/></filter>
    <clipPath id="reveal"><rect x="0" y="0" height="${box.height}" width="${reveal ? 0 : box.width}">${reveal ? `<animate attributeName="width" from="0" to="${box.width}" dur="1.5s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines=".16 1 .3 1"/>` : ""}</rect></clipPath></defs>`;
  const root = s("g", { "clip-path": "url(#reveal)" });
  let selPath = "";
  for (const v of views) {
    const id = v.branch.alternativeId;
    const alt = map.querySelector(`.altlab[data-alt="${CSS.escape(id)}"]`);
    const dots = [0, 1, 2].map((i) => map.querySelector(`[data-node="${CSS.escape(`${id}:${i}`)}"] .dot`));
    const rows = [0, 1, 2].map((i) => map.querySelector(`[data-node="${CSS.escape(`${id}:${i}`)}"] .pt-row`));
    if (!alt || dots.some((x) => !x) || rows.some((x) => !x)) continue;
    const a = L(alt, "l"), ar = L(alt, "r");
    const pts = dots.map((x) => C(x!));
    /* a line leaves a future after its state label, never through it */
    const exits = rows.map((r, i) => [r!.getBoundingClientRect().right - box.left + 10, pts[i]![1]] as const);
    const segs: [string, EffectiveKind | "lead"][] = [[`M${o[0]},${o[1]} C${o[0] + (a[0] - o[0]) * .55},${o[1]} ${o[0] + (a[0] - o[0]) * .45},${a[1]} ${a[0]},${a[1]}`, "lead"]];
    let prev: readonly [number, number] = ar;
    pts.forEach((p, i) => { const mid = (prev[0] + p[0]) / 2; segs.push([`M${prev[0]},${prev[1]} C${mid},${prev[1]} ${mid},${p[1]} ${p[0] - 10},${p[1]}`, v.outcomes[i]!.effective]); prev = exits[i]!; });
    const on = v === sel;
    const g = s("g", { class: `path${on ? " on" : ""}` });
    for (const [dpath, kind] of segs) {
      if (on && kind !== "broken") g.append(s("path", { d: dpath, class: `halo ${kind}`, filter: "url(#blur)" }));
      g.append(s("path", { d: dpath, class: `ln ${kind}` }));
    }
    root.append(g);
    if (on) selPath = segs.filter(([, k]) => k !== "broken").map(([d]) => d).join(" ");
  }
  svg.append(root);
  if (ambient && selPath) {
    svg.append(s("circle", { class: "spark", r: 2.6 }, s("animateMotion", { dur: "7s", repeatCount: "indefinite", path: selPath, calcMode: "linear" })));
  }
}

/* ---------------- the selected path, as a chapter ---------------- */
function inspector(app: App, d: Decision, v: BranchView, ui: LabUI): Node {
  const slots = slotLabels(d);
  const oi = ui.outcome?.startsWith(v.branch.alternativeId + ":") ? Number(ui.outcome.split(":").pop()) : -1;
  const o = oi >= 0 ? v.outcomes[oi] : undefined;
  const asm = (id: string) => v.assumptions.find((a) => a.id === id);
  return h("section", { class: "chapter", "aria-label": L(`Selected path: ${v.title}`, `Επιλεγμένος δρόμος: ${v.title}`) },
    o ? h("section", { class: "why", "aria-label": "Why this future", style: "view-transition-name:why" },
      h("div", { class: "why-head" },
        h("span", { class: `ep ${o.effective}` }, sample(o.effective), `${KIND_LABEL[o.effective]} · ${slots[oi]}`),
        h("button", { class: "btn btn-quiet btn-sm", type: "button", onclick: () => { ui.outcome = undefined; app.render(); } }, icon("x"), "Close")),
      h("p", { class: "quote" }, o.shown),
      o.because ? h("p", { class: "because" }, o.because) : null,
      o.dependsOn.length ? h("div", { class: "why-list" }, h("p", { class: "eyebrow" }, "This future rests on"),
        ...o.dependsOn.map((id) => asm(id)).filter(Boolean).map((a) => assumptionRow(app, d, v, a!, "w")))
        : h("p", { class: "muted small" }, "This follows directly from your situation or from what you said. It doesn't depend on any assumption.")) : null,
    h("header", { class: "chapter-head" },
      h("p", { class: "eyebrow" }, L(`Path 0${v.index + 1} · ${ARCHETYPE_LABEL[v.archetype]}`, `Δρόμος 0${v.index + 1} · ${ARCHETYPE_LABEL[v.archetype]}`), v.broken ? h("span", { class: "tag rose" }, L(`${v.broken} broken`, `${v.broken} ${v.broken === 1 ? "σπασμένο" : "σπασμένα"}`)) : null),
      h("h2", { class: "title-2" }, v.title),
      h("p", { class: "lead" }, v.branch.summary)),
    h("div", { class: "chapter-grid" },
      h("section", { class: "chapter-col", "aria-label": "What it rests on" },
        h("div", { class: "col-head" }, h("h3", { class: "eyebrow" }, "What it rests on"), h("span", { class: "faint xs num" }, L(`${v.open} open`, `${v.open} ανοιχτές`))),
        h("p", { class: "xs muted", style: "margin-bottom:var(--s3)" }, "Your judgement changes the futures and the comparison."),
        ...v.assumptions.map((a) => assumptionRow(app, d, v, a, "c"))),
      h("section", { class: "chapter-col", "aria-label": "Against what matters" },
        h("div", { class: "col-head" }, h("h3", { class: "eyebrow" }, "Against what matters")),
        h("div", { class: "fits" }, ...v.fit.map((f) => h("div", { class: "fit" },
          h("b", { class: "small" }, PRIORITY_LABEL[f.priority]), fitMark(f.effective),
          h("p", { class: `r${f.changedBy ? " changed" : ""}` }, f.changedBy ?? f.reasons.map((r) => r.text).join(". ")))))),
      h("section", { class: "chapter-col", "aria-label": "Upsides and downsides" },
        h("div", { class: "col-head" }, h("h3", { class: "eyebrow" }, "Upsides")), points(v.branch.benefits, "good"),
        h("div", { class: "col-head", style: "margin-top:var(--s5)" }, h("h3", { class: "eyebrow" }, "Downsides")), points(v.branch.drawbacks, "bad"),
        ...v.risks.map((r) => h("div", { class: `risk${r.active ? "" : " dormant"}` }, h("p", null, r.text, r.active ? "" : " (less likely: you confirmed what it depends on)"), h("p", null, r.mitigation))))),
    h("section", { class: "chapter-xp", "aria-label": "Experiments for this path" },
      h("div", { class: "col-head" }, h("h3", { class: "eyebrow" }, "Ways to learn more, cheaply"), h("a", { class: "btn btn-quiet btn-sm", href: `#/lab/${d.id}?tab=experiments` }, "All experiments")),
      h("div", { class: "xp-row" }, ...v.experiments.slice(0, 3).map((x) => experimentCard(app, d, v, x)))));
}

function assumptionRow(app: App, d: Decision, v: BranchView, a: BranchView["assumptions"][number], ctx = "c"): Node {
  const name = `j-${ctx}-${a.id}`;
  return h("div", { class: "asm" },
    h("p", null, a.text),
    h("div", { class: "meta" },
      h("span", { class: `tag ${a.basis === "stated" ? "cyan" : ""}` }, a.basis === "stated" ? "You stated" : "Inferred"),
      a.usedBy ? h("span", { class: "faint xs" }, L(`shapes ${a.usedBy} part${a.usedBy === 1 ? "" : "s"} of this path`, `επηρεάζει ${a.usedBy} ${a.usedBy === 1 ? "σημείο" : "σημεία"} αυτού του δρόμου`)) : null),
    h("fieldset", { class: "judge", style: "margin:0;min-width:0" },
      h("legend", { class: "sr" }, L(`Does this hold? ${a.text}`, `Ισχύει αυτό; ${a.text}`)),
      ...(["holds", "unknown", "doubtful", "false"] as AssumptionStatus[]).map((st) => h("label", { "data-v": st },
        h("input", { type: "radio", name, value: st, k: `${name}-${st}`, checked: a.status === st, onchange: () => judge(app, d, v, a.id, st) }),
        a.status === st ? h("span", { class: "pill", "aria-hidden": "true", style: `view-transition-name:${vt("p" + ctx, a.id)}` }) : null,
        h("span", { class: "lbl" }, STATUS_LABEL[st])))));
}

function judge(app: App, d: Decision, v: BranchView, id: string, st: AssumptionStatus) {
  const before = deriveView(d).find((x) => x.branch.alternativeId === v.branch.alternativeId)!;
  app.store.update(d.id, (x) => { x.assumptionState[id] = st; }, true);
  const after = deriveView(app.store.get(d.id)!).find((x) => x.branch.alternativeId === v.branch.alternativeId)!;
  const changed = after.outcomes.map((o, i) => (o.effective !== before.outcomes[i]!.effective ? `${v.branch.alternativeId}:${i}` : "")).filter(Boolean);
  const fits = after.fit.filter((f, i) => f.effective !== before.fit[i]!.effective).length;
  const ui = app.lab.get(d.id) ?? {};
  ui.flash = changed;
  app.lab.set(d.id, ui);
  app.render();
  const msg = changed.length || fits
    ? L(`${changed.length} future${changed.length === 1 ? "" : "s"} and ${fits} priorit${fits === 1 ? "y" : "ies"} changed for "${v.title}".`, `Άλλαξαν ${changed.length} ${changed.length === 1 ? "μέλλον" : "μέλλοντα"} και ${fits} ${fits === 1 ? "προτεραιότητα" : "προτεραιότητες"} για το «${v.title}».`)
    : `Noted. Nothing on this path depended on that alone.`;
  app.announce(msg);
  if (changed.length || fits) app.toast(msg);
}

const fitMark = (l: string) => h("span", { class: "row", style: "gap:8px;flex-wrap:nowrap" }, h("span", { class: "fitmark", "data-l": l, "aria-hidden": "true" }, h("i"), h("i"), h("i")), h("span", { class: "xs", style: "text-transform:capitalize;font-weight:600;min-width:52px" }, FIT_WORD()[l] ?? l));
const FIT_WORD = (): Record<string, string> => ({ strong: L("strong", "ισχυρή"), mixed: L("mixed", "μικτή"), weak: L("weak", "αδύναμη"), unclear: L("unclear", "ασαφής") });
const points = (ps: { text: string; source: string }[], kind: "good" | "bad") => h("ul", { class: `pts ${kind}` }, ...ps.map((p) => h("li", null, p.text, p.source === "stated" ? h("span", { class: "src-tag" }, L("you said", "το είπες")) : null)));

/* ---------------- compare ---------------- */
function compareTab(app: App, d: Decision, views: BranchView[]): Node {
  void app;
  const pri = views[0]?.fit.map((f) => f.priority) ?? [];
  const trades = tradeOffs(views);
  return h("div", { class: "stack" },
    h("section", { class: "panel" },
      h("div", { class: "pad", style: "padding-bottom:0" }, h("h2", { class: "h2" }, "Against what matters to you"),
        h("p", { class: "muted small", style: "margin-top:6px" }, "No scores: just how each option fits each priority, and why. Amber text means one of your judgements changed it.")),
      h("div", { class: "cmp-wrap" }, h("table", { class: "cmp" },
        h("caption", { class: "sr" }, "Fit of each alternative with each priority"),
        h("thead", null, h("tr", null, h("th", { scope: "col" }, h("span", { class: "sr" }, "Priority")), ...views.map((v) => h("th", { scope: "col" }, v.title, h("small", null, ARCHETYPE_LABEL[v.archetype]))))),
        h("tbody", null, ...pri.map((p, i) => h("tr", null,
          h("th", { scope: "row" }, h("span", { class: "rank" }, d.priorities.length ? `#${i + 1}` : "placeholder"), PRIORITY_LABEL[p]),
          ...views.map((v) => { const f = v.fit.find((x) => x.priority === p)!; return h("td", { "data-alt": v.title }, h("div", { class: "lvl" }, fitMark(f.effective)), h("p", { class: f.changedBy ? "changed" : "" }, f.changedBy ?? f.reasons[0]!.text)); }))),
          h("tr", null, h("th", { scope: "row" }, "Still open"), ...views.map((v) => h("td", { "data-alt": v.title }, h("p", { style: "margin:0;color:var(--text)" }, L(`${v.open} unconfirmed assumption${v.open === 1 ? "" : "s"}`, `${v.open} ${v.open === 1 ? "ανεπιβεβαίωτη υπόθεση" : "ανεπιβεβαίωτες υποθέσεις"}`), v.broken ? h("span", { class: "tag rose", style: "margin-left:8px" }, L(`${v.broken} broken future${v.broken === 1 ? "" : "s"}`, `${v.broken} ${v.broken === 1 ? "σπασμένο μέλλον" : "σπασμένα μέλλοντα"}`)) : null)))))))),
    h("section", { class: "grid2" },
      h("div", { class: "panel pad" }, h("h2", { class: "h2" }, "Trade-offs"), h("ul", { class: "trade", style: "margin-top:var(--s4)" }, ...trades.map((t) => h("li", null, describeTradeOff(t))))),
      h("div", { class: "panel pad" }, h("h2", { class: "h2" }, "What's still missing"),
        h("ul", { class: "pts", style: "margin-top:var(--s4)" }, ...(d.analysis!.missingInfo.length ? d.analysis!.missingInfo : ["Nothing flagged."]).map((m) => h("li", null, m))),
        h("p", { class: "xs muted", style: "margin-top:var(--s4)" }, "MIRROR doesn't rank the options for you. A strong fit that rests on unconfirmed assumptions is weaker than it looks."))));
}

/* ---------------- assumptions ---------------- */
function assumptionsTab(app: App, d: Decision, views: BranchView[]): Node {
  return h("div", { class: "stack" },
    h("p", { class: "muted", style: "max-width:70ch" }, "Everything the futures depend on, in one place. Judge each one; when you learn something, record it as evidence so you can look back at why you changed your mind."),
    h("div", { class: "grid2" }, ...views.map((v) => h("section", { class: "panel pad" },
      h("p", { class: "label" }, `${String.fromCharCode(65 + v.index)} · ${ARCHETYPE_LABEL[v.archetype]}`),
      h("h2", { class: "h2", style: "margin:6px 0 var(--s4)" }, v.title),
      ...v.assumptions.map((a) => h("div", null, assumptionRow(app, d, v, a),
        h("button", { class: "btn btn-quiet btn-sm", type: "button", style: "margin:-4px 0 8px -12px", onclick: () => addObservation(app, d, { assumptionId: a.id, alternativeId: v.branch.alternativeId, label: a.text }) }, icon("plus"), "Record evidence")))))));
}

/* ---------------- experiments ---------------- */
function experimentsTab(app: App, d: Decision, views: BranchView[]): Node {
  return h("div", { class: "stack" },
    h("p", { class: "muted", style: "max-width:70ch" }, "Small, cheap ways to turn assumptions into knowledge before you commit. Plan one with a date and it appears on your dashboard."),
    h("div", { class: "grid2" }, ...views.map((v) => h("section", { class: "panel pad" },
      h("p", { class: "label" }, `${String.fromCharCode(65 + v.index)} · ${ARCHETYPE_LABEL[v.archetype]}`),
      h("h2", { class: "h2", style: "margin:6px 0 var(--s4)" }, v.title),
      ...v.experiments.map((x) => experimentCard(app, d, v, x))))));
}

function experimentCard(app: App, d: Decision, v: BranchView, x: BranchView["experiments"][number]): Node {
  const tests = x.reduces.map((id) => v.assumptions.find((a) => a.id === id)?.text).filter(Boolean);
  const st = x.state;
  return h("div", { class: "xp", "data-status": st.status },
    h("div", { class: "row between", style: "align-items:start;flex-wrap:nowrap" }, h("b", null, x.title), h("span", { class: `tag ${st.status === "done" ? "cyan" : st.status === "planned" ? "violet" : ""}` }, st.status === "planned" ? L(`Planned · ${fmtDate(st.due)}`, `Προγραμματισμένο · ${fmtDate(st.due)}`) : st.status === "done" ? "Done" : L(`Takes ${x.cost}`, `Θέλει ${({ hours: "ώρες", days: "μέρες", weeks: "εβδομάδες" } as Record<string, string>)[x.cost]}`))),
    h("p", null, x.how),
    tests.length ? h("p", null, h("span", { class: "faint" }, "Tests: "), tests.join("; ")) : null,
    st.learned ? h("p", { style: "color:var(--text)" }, h("span", { class: "faint" }, "Learned: "), st.learned) : null,
    h("div", { class: "row", style: "gap:6px" },
      st.status === "idea" ? h("button", { class: "btn btn-sm", type: "button", onclick: () => planExperiment(app, d, x.id, x.title) }, "Plan it") : null,
      st.status !== "done" ? h("button", { class: "btn btn-sm", type: "button", onclick: () => completeExperiment(app, d, v, x) }, icon("check"), "Mark done") : null,
      st.status !== "idea" ? h("button", { class: "btn btn-quiet btn-sm", type: "button", onclick: () => { app.store.update(d.id, (y) => { delete y.experimentState[x.id]; }, true); app.render(); } }, "Reset") : null));
}

function planExperiment(app: App, d: Decision, id: string, title: string) {
  const date = h("input", { type: "date", class: "input", id: "xp-date", value: daysFromNow(7), min: daysFromNow(0) });
  app.dialog("Plan this experiment", h("div", { class: "stack" }, h("p", null, h("b", null, title)), h("div", { class: "field" }, h("label", { for: "xp-date" }, "When will you do it?"), date)), [
    { label: "Cancel", kind: "quiet" },
    { label: "Plan it", kind: "primary", run: () => { app.store.update(d.id, (x) => { x.experimentState[id] = { status: "planned", due: date.value || daysFromNow(7) }; }, true); app.render(); app.toast("Planned. It's on your dashboard."); } },
  ]);
}

function completeExperiment(app: App, d: Decision, v: BranchView, x: BranchView["experiments"][number]) {
  const learned = h("textarea", { class: "textarea", id: "xp-l", rows: 4, maxlength: 800, placeholder: "What did you find out?" });
  const targets = x.reduces.map((id) => v.assumptions.find((a) => a.id === id)).filter(Boolean) as BranchView["assumptions"];
  const selects = targets.map((a) => {
    const sel = h("select", { class: "select", id: `xs-${a.id}` }, ...(["holds", "unknown", "doubtful", "false"] as AssumptionStatus[]).map((st) => h("option", { value: st, selected: st === a.status }, STATUS_LABEL[st])));
    return { a, sel };
  });
  const err = h("p", { class: "err", role: "alert" });
  app.dialog("What did you learn?", h("div", { class: "stack" },
    h("p", null, h("b", null, x.title)),
    h("div", { class: "field" }, h("label", { for: "xp-l" }, "Your finding"), learned),
    ...selects.map(({ a, sel }) => h("div", { class: "field" }, h("label", { for: `xs-${a.id}` }, L(`Does this still hold? "${a.text}"`, `Ισχύει ακόμη; «${a.text}»`)), sel)), err), [
    { label: "Cancel", kind: "quiet" },
    { label: "Save finding", kind: "primary", run: () => {
      const t = learned.value.trim();
      if (!t) { err.textContent = tr("Write what you found, even one line."); learned.focus(); return false; }
      app.store.update(d.id, (y) => {
        y.experimentState[x.id] = { status: "done", learned: t };
        y.observations.unshift({ id: uid("o"), at: nowIso(), text: `${x.title}: ${t}`, kind: "evidence", alternativeId: v.branch.alternativeId, ...(targets[0] ? { assumptionId: targets[0].id } : {}) });
        for (const { a, sel } of selects) y.assumptionState[a.id] = sel.value as AssumptionStatus;
      }, true);
      app.render();
      app.toast("Finding saved to the journal.");
      return true;
    } },
  ]);
}

/* ---------------- journal ---------------- */
type Ev = { at: string; kind: string; title: string; text?: string; extra?: Node };
function journalTab(app: App, d: Decision, views: BranchView[]): Node {
  const alt = (id?: string) => d.alternatives.find((a) => a.id === id)?.title;
  const evs: Ev[] = [
    { at: d.createdAt, kind: "note", title: "Decision started" },
    ...(d.analysis ? [{ at: d.analysis.source.generatedAt, kind: "version", title: d.analysis.source.kind === "demo" ? "Futures mapped (demo rules)" : L(`Futures mapped (${d.analysis.source.model})`, `Τα μέλλοντα χαρτογραφήθηκαν (${d.analysis.source.model})`) }] : []),
    ...d.observations.map((o) => ({ at: o.at, kind: o.kind, title: o.kind === "outcome" ? "What happened" : o.kind === "evidence" ? "Evidence" : "Note", text: o.text + (alt(o.alternativeId) ? ` (${alt(o.alternativeId)})` : "") })),
    ...d.snapshots.map((sn) => ({ at: sn.at, kind: "version", title: L(`Version saved: ${sn.label}`, `Αποθηκεύτηκε έκδοση: ${sn.label}`), extra: diffView(d, views, sn) })),
    ...(d.choice ? [{ at: d.choice.at, kind: "choice", title: L(`Chose "${alt(d.choice.alternativeId)}"`, `Επέλεξες το «${alt(d.choice.alternativeId)}»`), text: [d.choice.rationale, d.choice.nextAction && L(`Next: ${d.choice.nextAction}`, `Επόμενο: ${d.choice.nextAction}`)].filter(Boolean).join(" · ") }] : []),
    ...d.reflections.map((r) => ({ at: r.at, kind: "reflection", title: r.surprised ? "Reflection: it surprised me" : "Reflection", text: r.text })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  const atChoice = d.choice ? d.snapshots.find((sn) => sn.label === "At the moment of choice") : undefined;
  return h("div", { class: "lab", style: "grid-template-columns:minmax(0,1fr) minmax(0,380px)" },
    h("section", { class: "panel pad" },
      h("div", { class: "row between", style: "margin-bottom:var(--s4)" }, h("h2", { class: "h2" }, "Journal"),
        h("button", { class: "btn btn-sm", type: "button", onclick: () => addObservation(app, d, {}) }, icon("plus"), "Add an observation")),
      h("ol", { class: "tl" }, ...evs.map((e) => h("li", { "data-kind": e.kind }, h("time", { datetime: e.at }, fmtDate(e.at)), h("p", null, h("b", null, e.title)), e.text ? h("p", { class: "muted" }, e.text) : null, e.extra ?? null)))),
    h("div", { class: "stack" },
      d.status === "decided" || d.status === "resolved" ? reflectPanel(app, d, views, atChoice) : h("section", { class: "panel pad" },
        h("h2", { class: "h3" }, "Versions"),
        h("p", { class: "small muted", style: "margin:6px 0 var(--s4)" }, "Save a version before you change your mind, to see later what moved."),
        h("button", { class: "btn", type: "button", onclick: () => saveVersion(app, d, views) }, icon("save"), "Save version"))));
}

function reflectPanel(app: App, d: Decision, views: BranchView[], atChoice?: Snapshot): Node {
  const ta = h("textarea", { class: "textarea", id: "rf", k: "rf", rows: 5, maxlength: 1200, placeholder: "What has actually happened since you chose? What did you expect?" });
  const cb = h("input", { type: "checkbox", id: "rf-s", style: "width:18px;height:18px;accent-color:var(--assumed)" });
  const chosen = views.find((v) => v.branch.alternativeId === d.choice?.alternativeId);
  return h("section", { class: "panel pad stack" },
    h("h2", { class: "h3" }, "Reflect"),
    h("p", { class: "small muted" }, "Compare what you assumed with what you've seen. A surprise isn't a failure: it's the most useful thing you can learn."),
    chosen && atChoice ? h("div", null, h("p", { class: "label", style: "margin-bottom:8px" }, "Assumptions then → now"),
      h("ul", { class: "diff" }, ...chosen.assumptions.map((a) => {
        const then = atChoice.assumptionState[a.id] ?? "unknown";
        return h("li", null, h("span", { class: `st ${then}` }, STATUS_LABEL[then]), "→", h("span", { class: `st ${a.status}` }, STATUS_LABEL[a.status]), h("span", { class: "muted" }, a.text));
      }))) : null,
    h("div", { class: "field" }, h("label", { for: "rf" }, "What happened"), ta),
    h("label", { class: "row small", for: "rf-s", style: "gap:10px" }, cb, "It turned out differently than I expected"),
    h("div", { class: "row" },
      h("button", { class: "btn", type: "button", onclick: () => {
        const t = ta.value.trim(); if (!t) { ta.focus(); return; }
        app.store.update(d.id, (x) => { x.reflections.unshift({ at: nowIso(), text: t, surprised: cb.checked }); x.observations.unshift({ id: uid("o"), at: nowIso(), text: t, kind: "outcome", ...(x.choice ? { alternativeId: x.choice.alternativeId } : {}) }); }, true);
        app.render(); app.toast("Reflection saved.");
      } }, "Save reflection"),
      d.status !== "resolved" ? h("button", { class: "btn btn-quiet", type: "button", onclick: async () => {
        if (await app.confirm("Mark this decision resolved?", "It moves to Resolved. Everything stays readable in History, and you can reopen it.", "Mark resolved")) { app.store.update(d.id, (x) => { x.status = "resolved"; }, true); app.render(); }
      } }, "Mark resolved") : h("button", { class: "btn btn-quiet", type: "button", onclick: () => { app.store.update(d.id, (x) => { x.status = "decided"; }, true); app.render(); } }, "Reopen")));
}

function diffView(d: Decision, views: BranchView[], sn: Snapshot): Node | undefined {
  const items: Node[] = [];
  for (const v of views) {
    for (const a of v.assumptions) {
      const then = sn.assumptionState[a.id];
      if (then && then !== a.status) items.push(h("li", null, h("span", { class: `st ${then}` }, STATUS_LABEL[then]), "→", h("span", { class: `st ${a.status}` }, STATUS_LABEL[a.status]), h("span", { class: "muted" }, a.text)));
    }
    for (const f of v.fit) {
      const then = sn.fit[v.branch.alternativeId]?.[f.priority];
      if (then && then !== f.effective) items.push(h("li", null, h("b", null, `${v.title}`), h("span", { class: "muted" }, `${PRIORITY_LABEL[f.priority]}: ${then} → ${f.effective}`)));
    }
  }
  void d;
  return items.length ? h("details", { style: "margin-top:6px" }, h("summary", { class: "xs", style: "cursor:pointer;color:var(--assumed)" }, L(`${items.length} change${items.length === 1 ? "" : "s"} since this version`, `${items.length} ${items.length === 1 ? "αλλαγή" : "αλλαγές"} από αυτή την έκδοση`)), h("ul", { class: "diff" }, ...items))
    : h("p", { class: "xs faint" }, "Nothing has changed since.");
}

/* ---------------- actions ---------------- */
function snapshotOf(views: BranchView[], label: string): Snapshot {
  return {
    id: uid("s"), at: nowIso(), label,
    assumptionState: Object.fromEntries(views.flatMap((v) => v.assumptions.map((a) => [a.id, a.status]))),
    fit: Object.fromEntries(views.map((v) => [v.branch.alternativeId, Object.fromEntries(v.fit.map((f) => [f.priority, f.effective]))])),
  };
}

function saveVersion(app: App, d: Decision, views: BranchView[]) {
  const n = d.snapshots.length + 1;
  const input = h("input", { class: "input", id: "sv", value: `Version ${n}`, maxlength: 120 });
  app.dialog("Save a version", h("div", { class: "field" }, h("label", { for: "sv" }, "Name"), input, h("p", { class: "hint" }, "Saves every assumption judgement and fit as they are now, so you can compare later.")), [
    { label: "Cancel", kind: "quiet" },
    { label: "Save version", kind: "primary", run: () => { app.store.update(d.id, (x) => { x.snapshots.unshift(snapshotOf(views, input.value.trim() || `Version ${n}`)); }, true); app.render(); app.toast("Version saved to the journal."); } },
  ]);
}

function recordChoice(app: App, d: Decision, views: BranchView[]) {
  const step = nextStep(views);
  const err = h("p", { class: "err", role: "alert" });
  const radios = views.map((v, i) => h("label", { class: "prio-opt", style: "grid-template-columns:auto 1fr", for: `ch-${i}` },
    h("input", { type: "radio", name: "choice", id: `ch-${i}`, value: v.branch.alternativeId }), h("span", null, h("b", null, v.title), h("span", { class: "xs muted", style: "display:block" }, L(`${v.open} assumption${v.open === 1 ? "" : "s"} still open`, `${v.open} ${v.open === 1 ? "υπόθεση παραμένει ανοιχτή" : "υποθέσεις παραμένουν ανοιχτές"}`)))));
  const why = h("textarea", { class: "textarea", id: "ch-why", rows: 3, maxlength: 800, placeholder: "In a sentence or two, for your future self." });
  const nextA = h("input", { class: "input", id: "ch-next", maxlength: 300, value: step?.experiment.title ?? "" });
  const review = h("input", { class: "input", type: "date", id: "ch-rev", value: daysFromNow(30), min: daysFromNow(1) });
  app.dialog("Record your choice", h("div", { class: "stack" },
    h("fieldset", { style: "border:0;padding:0;margin:0;display:grid;gap:8px" }, h("legend", { class: "label", style: "margin-bottom:8px" }, "Which option are you choosing?"), ...radios),
    h("div", { class: "field" }, h("label", { for: "ch-why" }, "Why this one?"), why),
    h("div", { class: "field" }, h("label", { for: "ch-next" }, "Your first concrete step"), nextA),
    h("div", { class: "field" }, h("label", { for: "ch-rev" }, "When should you look back at this?"), review, h("p", { class: "hint" }, "On that date, MIRROR shows your assumptions next to what actually happened.")),
    err), [
    { label: "Not yet", kind: "quiet" },
    { label: "Record choice", kind: "primary", run: () => {
      const picked = document.querySelector<HTMLInputElement>('input[name="choice"]:checked');
      if (!picked) { err.textContent = tr("Choose one option."); return false; }
      app.store.update(d.id, (x) => {
        x.snapshots.unshift(snapshotOf(views, "At the moment of choice"));
        x.choice = { alternativeId: picked.value, at: nowIso(), rationale: why.value.trim(), nextAction: nextA.value.trim(), ...(review.value ? { reviewAt: review.value } : {}) };
        x.status = "decided";
      }, true);
      app.nav(`#/lab/${d.id}?tab=journal`);
      app.toast("Choice recorded with a snapshot of your reasoning.");
      return true;
    } },
  ]);
}

function addObservation(app: App, d: Decision, o: { assumptionId?: string; alternativeId?: string; label?: string }) {
  const ta = h("textarea", { class: "textarea", id: "ob", rows: 4, maxlength: 800, placeholder: "What did you see, hear or find out?" });
  const kind = h("select", { class: "select", id: "ob-k" }, h("option", { value: "evidence" }, "Evidence: something I found out"), h("option", { value: "outcome" }, "Outcome: something that happened"), h("option", { value: "note" }, "Note: a thought"));
  const err = h("p", { class: "err", role: "alert" });
  app.dialog(o.label ? "Record evidence" : "Add an observation", h("div", { class: "stack" },
    o.label ? h("p", { class: "small muted" }, "About: ", h("b", { style: "color:var(--text)" }, o.label)) : null,
    h("div", { class: "field" }, h("label", { for: "ob" }, "Observation"), ta),
    h("div", { class: "field" }, h("label", { for: "ob-k" }, "Kind"), kind), err), [
    { label: "Cancel", kind: "quiet" },
    { label: "Save", kind: "primary", run: () => {
      const t = ta.value.trim();
      if (!t) { err.textContent = tr("Write something first."); ta.focus(); return false; }
      app.store.update(d.id, (x) => { x.observations.unshift({ id: uid("o"), at: nowIso(), text: t, kind: kind.value as "evidence" | "outcome" | "note", ...(o.assumptionId ? { assumptionId: o.assumptionId } : {}), ...(o.alternativeId ? { alternativeId: o.alternativeId } : {}) }); }, true);
      app.render(); app.toast("Saved to the journal.");
      return true;
    } },
  ]);
}

function moreMenu(app: App, d: Decision): Node {
  const det = h("details", { class: "more", style: "position:relative" },
    h("summary", { class: "btn icon-btn", "aria-label": "More actions", style: "list-style:none" }, icon("menu")),
    h("div", { class: "menu" },
      h("button", { class: "btn btn-quiet menu-remap", style: "justify-content:flex-start", type: "button", onclick: async () => {
        if (await app.confirm("Map the futures again?", "MIRROR rebuilds the futures from your current inputs. Your judgements on assumptions that still exist are kept.", "Map again")) await app.analyze(d);
      } }, icon("branch"), "Map again"),
      h("a", { class: "btn btn-quiet", style: "justify-content:flex-start", href: `#/new/${d.id}`, onclick: () => app.store.update(d.id, (x) => { x.step = 6; }, true) }, icon("edit"), "Edit inputs"),
      h("button", { class: "btn btn-quiet", style: "justify-content:flex-start", type: "button", onclick: () => { app.store.update(d.id, (x) => { x.status = x.status === "archived" ? (x.choice ? "decided" : "exploring") : "archived"; }, true); app.render(); app.toast(d.status === "archived" ? "Restored." : "Archived. Find it in History."); } }, icon("archive"), d.status === "archived" ? "Restore" : "Archive"),
      h("button", { class: "btn btn-quiet", style: "justify-content:flex-start;color:var(--broken)", type: "button", onclick: async () => {
        if (await app.confirm("Delete this decision?", L(`"${d.title}" and everything recorded about it will be permanently deleted from this device.`, `Το «${d.title}» και ό,τι έχει καταγραφεί γι' αυτό θα διαγραφούν οριστικά από αυτή τη συσκευή.`), "Delete permanently", true)) { app.store.remove(d.id); app.nav("#/app"); app.toast("Decision deleted."); }
      } }, icon("trash"), "Delete")));
  det.addEventListener("keydown", (e) => { if ((e as KeyboardEvent).key === "Escape") { det.open = false; (det.querySelector("summary") as HTMLElement).focus(); } });
  return det; /* closing on outside click is handled once, globally, in main.ts */
}

function unmapped(app: App, d: Decision): Node {
  return h("div", { class: "wrap", style: "max-width:720px" },
    h("p", { class: "label" }, "Future Lab"),
    h("h1", { class: "h1", style: "margin-top:8px" }, d.title || "Untitled decision"),
    h("p", { class: "lead", style: "margin-top:12px" }, "This decision hasn't been mapped yet. Finish the inputs: it needs a title and at least two alternatives."),
    h("div", { class: "row", style: "margin-top:24px" }, h("a", { class: "btn btn-primary", href: `#/new/${d.id}` }, "Continue the draft")));
}

export { RANK };
