/* Brief, History and Settings. */
import { L, tr } from "../../i18n.ts";
import { serverStatus } from "../../ai/provider.ts";
import { briefMarkdown, buildBrief } from "../../domain/brief.ts";
import { deriveView } from "../../domain/engine.ts";
import { type Decision, HORIZON_LABEL, HORIZONS, type Horizon, PRIORITY_KEYS, PRIORITY_LABEL, type PriorityKey, type Settings } from "../../domain/types.ts";
import { persistent } from "../../data/store.ts";
import type { App } from "../app.ts";
import { download, EMBED, fmtDate, h, icon } from "../dom.ts";

/* ---------------- brief ---------------- */
export function briefView(app: App, route: { id: string }): Node {
  const d = app.store.get(route.id);
  if (!d) return h("div", { class: "wrap" }, h("h1", { class: "h1" }, "This decision doesn't exist."));
  if (!d.analysis) return h("div", { class: "wrap" }, h("h1", { class: "h1" }, "No brief yet."), h("p", { class: "lead" }, "Map the futures first."), h("a", { class: "btn", href: `#/new/${d.id}`, style: "margin-top:20px" }, "Continue the draft"));
  const b = buildBrief(d);
  const md = briefMarkdown(b);
  const slug = (d.title || "decision").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
  const ul = (xs: string[]) => h("ul", null, ...xs.map((x) => h("li", null, x)));
  return h("div", { class: "wrap brief" },
    h("div", { class: "row between", style: "margin-bottom:var(--s4)" },
      h("a", { class: "btn btn-quiet", href: `#/lab/${d.id}` }, icon("back"), "Future Lab"),
      h("div", { class: "brief-tools" },
        EMBED ? null : h("button", { class: "btn btn-sm", type: "button", onclick: () => print() }, icon("print"), "Print / PDF"),
        h("button", { class: "btn btn-sm", type: "button", onclick: () => download(`${slug}-brief.md`, md, "text/markdown") }, icon("save"), "Markdown"),
        h("button", { class: "btn btn-sm", type: "button", onclick: async () => { try { await navigator.clipboard.writeText(md); app.toast("Brief copied as text."); } catch { app.toast("Couldn't copy. Use Markdown instead.", "bad"); } } }, icon("copy"), "Copy"))),
    h("article", { class: "panel brief-doc" },
      h("p", { class: "label" }, "Decision brief"),
      h("h1", { style: "margin-top:10px" }, b.title),
      h("p", { class: "muted small", style: "margin-top:10px" }, L(`${fmtDate(b.generatedAt)} · ${b.horizon} horizon · Analysis: ${b.source}`, `${fmtDate(b.generatedAt)} · ορίζοντας ${b.horizon} · Ανάλυση: ${b.source}`)),
      b.boundary ? h("div", { class: "notice", style: "margin-top:var(--s5)" }, icon("info"), h("p", null, b.boundary)) : null,
      b.context ? h("p", { style: "margin-top:var(--s5)" }, b.context) : null,
      h("p", { style: "margin-top:var(--s4)" }, h("b", null, "What matters most: "), b.priorities.join(", ") || L("not set", "δεν ορίστηκε")),
      b.choice ? [h("h2", null, "Your choice"), h("p", null, h("b", null, b.choice.title), b.choice.rationale ? `: ${b.choice.rationale}` : ""), b.choice.reviewAt ? h("p", { class: "muted" }, L(`Review on ${fmtDate(b.choice.reviewAt)}.`, `Επανεξέταση στις ${fmtDate(b.choice.reviewAt)}.`)) : null] : null,
      h("h2", null, "The alternatives"),
      ...b.alternatives.map((a) => h("section", null,
        h("h3", null, a.title), h("p", { class: "muted" }, a.summary),
        h("div", { class: "grid2", style: "margin-top:var(--s3)" }, h("div", null, h("p", { class: "label", style: "margin-bottom:6px" }, "Benefits"), ul(a.benefits)), h("div", null, h("p", { class: "label", style: "margin-bottom:6px" }, "Drawbacks"), ul(a.drawbacks))),
        a.risks.length ? h("div", { style: "margin-top:var(--s3)" }, h("p", { class: "label", style: "margin-bottom:6px" }, "Downsides and mitigation"), ul(a.risks.map((r) => `${r.text}. ${r.mitigation}`))) : null,
        h("div", { style: "margin-top:var(--s3)" }, h("p", { class: "label", style: "margin-bottom:6px" }, "Fit with your priorities"), ul(a.fit.map((f) => `${f.priority}: ${f.level}. ${f.why}`))))),
      h("h2", null, "Trade-offs"), ul(b.tradeOffs),
      h("h2", null, "Still uncertain"), ul(b.uncertainties.length ? b.uncertainties : ["Nothing marked uncertain."]),
      h("h2", null, "Missing information"), ul(b.missing.length ? b.missing : ["None recorded."]),
      h("h2", null, "Experiments"), ul(b.experiments.map((x) => L(`${x.title} (for "${x.for}", ${x.status}). ${x.how}`, `${x.title} (για το «${x.for}», ${x.status}). ${x.how}`))),
      h("h2", null, "Next action"), h("p", null, b.next),
      h("p", { class: "faint small", style: "margin-top:var(--s7)" }, "MIRROR explores possibilities; it does not predict outcomes. The choice is yours.")));
}

/* ---------------- history ---------------- */
const FILTERS = ["all", "exploring", "decided", "resolved", "archived", "draft"] as const;
let filter: (typeof FILTERS)[number] = "all";

export function historyView(app: App): Node {
  const all = app.store.data.decisions.filter((d) => filter === "all" || d.status === filter).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return h("div", { class: "wrap" },
    h("p", { class: "label" }, "History"),
    h("h1", { class: "h1", style: "margin:8px 0 var(--s5)" }, "Your reasoning, over time."),
    h("div", { class: "filters", role: "group", "aria-label": "Filter by status" }, ...FILTERS.map((f) =>
      h("button", { class: `btn btn-sm ${filter === f ? "btn-primary" : ""}`, type: "button", "aria-pressed": String(filter === f), onclick: () => { filter = f; app.render(); } }, f === "all" ? "All" : tr(f[0]!.toUpperCase() + f.slice(1))))),
    all.length ? h("ul", { class: "hist" }, ...all.map((d) => historyItem(app, d)))
      : h("div", { class: "panel pad empty" }, h("b", null, filter === "all" ? "No decisions yet" : L(`Nothing ${filter}`, `Τίποτα σε αυτή την κατηγορία`)), filter === "all" ? "Decisions you explore are kept here with their versions, choices and reflections." : "Try another filter."));
}

function historyItem(app: App, d: Decision): Node {
  const views = deriveView(d);
  const chosen = d.choice ? d.alternatives.find((a) => a.id === d.choice!.alternativeId)?.title : undefined;
  const facts = [
    L(`Started ${fmtDate(d.createdAt)}`, `Ξεκίνησε ${fmtDate(d.createdAt)}`),
    d.analysis ? L(`${views.length} futures mapped`, `${views.length} χαρτογραφημένα μέλλοντα`) : L("not mapped", "δεν χαρτογραφήθηκε"),
    d.snapshots.length ? L(`${d.snapshots.length} version${d.snapshots.length === 1 ? "" : "s"}`, `${d.snapshots.length} ${d.snapshots.length === 1 ? "έκδοση" : "εκδόσεις"}`) : "",
    d.observations.length ? L(`${d.observations.length} observation${d.observations.length === 1 ? "" : "s"}`, `${d.observations.length} ${d.observations.length === 1 ? "παρατήρηση" : "παρατηρήσεις"}`) : "",
    chosen ? L(`chose "${chosen}"`, `επέλεξες «${chosen}»`) : "",
    d.reflections.length ? L(`${d.reflections.length} reflection${d.reflections.length === 1 ? "" : "s"}`, `${d.reflections.length} ${d.reflections.length === 1 ? "αναστοχασμός" : "αναστοχασμοί"}`) : "",
  ].filter(Boolean);
  return h("li", { class: "panel pad hist-item" },
    h("div", null,
      h("div", { class: "row" }, h("span", { class: "tag" }, tr(d.status[0]!.toUpperCase() + d.status.slice(1))), h("span", { class: "faint xs" }, L(`Updated ${fmtDate(d.updatedAt)}`, `Ενημερώθηκε ${fmtDate(d.updatedAt)}`))),
      h("h2", { class: "h3", style: "margin-top:8px" }, d.title || "Untitled decision"),
      h("p", { class: "small muted", style: "margin-top:4px" }, facts.join(" · "))),
    h("div", { class: "row", style: "align-self:center" },
      h("a", { class: "btn btn-sm", href: d.analysis ? `#/lab/${d.id}?tab=journal` : `#/new/${d.id}` }, d.analysis ? "Open journal" : "Continue"),
      h("button", { class: "btn btn-quiet btn-sm", type: "button", "aria-label": L(`Delete ${d.title || "decision"}`, `Διαγραφή: ${d.title || "απόφαση"}`), onclick: async () => {
        if (await app.confirm("Delete this decision?", L(`"${d.title || "Untitled"}" and everything recorded about it will be permanently deleted from this device.`, `Το «${d.title || "Χωρίς τίτλο"}» και ό,τι έχει καταγραφεί γι' αυτό θα διαγραφούν οριστικά από αυτή τη συσκευή.`), "Delete permanently", true)) { app.store.remove(d.id); app.render(); app.toast("Decision deleted."); }
      } }, icon("trash"))));
}

/* ---------------- settings ---------------- */
export function settingsView(app: App): Node {
  const st = app.store.settings;
  const set = (p: Partial<Settings>) => { app.store.setSettings(p); app.applyPrefs(); app.render(); };
  const seg = <T extends string | number>(name: string, label: string, value: T, opts: [T, string][], on: (v: T) => void) =>
    h("fieldset", { class: "seg", style: "margin:0" }, h("legend", { class: "sr" }, label), ...opts.map(([v, l]) =>
      h("label", null, h("input", { type: "radio", name, value: String(v), k: `${name}-${v}`, checked: v === value, onchange: () => on(v) }), h("span", null, l))));
  const row = (title: string, desc: string, control: Node) => h("div", { class: "set-row" }, h("div", null, h("h3", { class: "h3", style: "font-size:var(--t-md)" }, title), h("p", null, desc)), control);
  const srv = app.server;
  const fileIn = h("input", { type: "file", accept: "application/json,.json", class: "sr", id: "imp" });
  fileIn.addEventListener("change", async () => {
    const f = fileIn.files?.[0]; if (!f) return;
    try {
      const text = await f.text();
      const mode = (await app.confirm("Import decisions", "Merge keeps your current decisions and adds or updates the imported ones. Choose Cancel to stop.", "Merge")) ? "merge" : null;
      if (!mode) return;
      const r = app.store.importJSON(text, "merge");
      app.toast(L(`Imported ${r.added} decision${r.added === 1 ? "" : "s"}${r.skipped ? `, skipped ${r.skipped} that didn't validate` : ""}.`, `Εισήχθησαν ${r.added} ${r.added === 1 ? "απόφαση" : "αποφάσεις"}${r.skipped ? `, παραλείφθηκαν ${r.skipped} μη έγκυρες` : ""}.`));
      app.render();
    } catch (e) { app.toast((e as Error).message || "That file couldn't be read.", "bad"); }
    fileIn.value = "";
  });

  return h("div", { class: "wrap" },
    h("p", { class: "label" }, "Settings"),
    h("h1", { class: "h1", style: "margin:8px 0 var(--s6)" }, "Make MIRROR yours."),
    h("div", { class: "settings" },
      h("section", { class: "panel pad", "aria-labelledby": "s-app" }, h("h2", { class: "h2", id: "s-app" }, "Appearance & accessibility"),
        row("Language", "Language of the app. Analyses are written in the language that's active when you map the futures.", seg("lang", "Language", st.language, [["en", "English"], ["el", "Ελληνικά"]], (v) => app.setLanguage(v))),
        row("Theme", "Dark is MIRROR's native look. Light is tuned for daylight and printing.", seg("theme", "Theme", st.theme, [["dark", "Dark"], ["light", "Light"], ["system", "System"]], (v) => set({ theme: v }))),
        row("Motion", "Reduce removes path drawing and transitions. System follows your device.", seg("motion", "Motion", st.motion, [["system", "System"], ["reduce", "Reduce"], ["full", "Full"]], (v) => set({ motion: v }))),
        row("Cinematic background", "The films behind the title of each screen. Never behind your working content.", seg("cinema", "Cinematic background", st.cinema, [["auto", "Auto"], ["still", "Still image"], ["off", "Off"]], (v) => set({ cinema: v }))),
        row("Text size", "Scales all text in the app.", seg("scale", "Text size", st.textScale, [[1, "Default"], [1.125, "Larger"], [1.25, "Largest"]], (v) => set({ textScale: v })))),
      h("section", { class: "panel pad", "aria-labelledby": "s-def" }, h("h2", { class: "h2", id: "s-def" }, "Decision defaults"),
        row("Default horizon", "Pre-selected when you start a new decision.", h("select", { class: "select", style: "width:auto", "aria-label": "Default horizon", onchange: (e: Event) => set({ defaultHorizon: (e.target as HTMLSelectElement).value as Horizon }) }, ...HORIZONS.map((k) => h("option", { value: k, selected: st.defaultHorizon === k }, HORIZON_LABEL[k])))),
        row("Default priorities", "Pre-selected (up to three). You can change them per decision.", h("div", { class: "row", style: "gap:6px;max-width:380px" }, ...PRIORITY_KEYS.map((k) => {
          const on = st.defaultPriorities.includes(k);
          return h("button", { class: `btn btn-sm ${on ? "btn-primary" : ""}`, type: "button", "aria-pressed": String(on), onclick: () => {
            const next: PriorityKey[] = on ? st.defaultPriorities.filter((x) => x !== k) : [...st.defaultPriorities, k];
            if (next.length > 3) { app.toast("Up to three.", "bad"); return; }
            set({ defaultPriorities: next });
          } }, PRIORITY_LABEL[k]);
        })))),
      h("section", { class: "panel pad", "aria-labelledby": "s-ai" }, h("h2", { class: "h2", id: "s-ai" }, "Analysis"),
        row("Analysis engine", "Demo rules run on this device and are always labelled as not AI. Server AI uses the model configured by whoever hosts this app.",
          seg("engine", "Analysis engine", st.analysis, [["demo", "Demo rules"], ["server", "Server AI"]], (v) => set({ analysis: v }))),
        h("p", { class: `notice ${srv?.ai ? "chosen" : "calm"}`, style: "margin-top:var(--s2)" }, icon(srv?.ai ? "check" : "info"),
          h("span", null, srv === null ? "Checking the server…" : srv.ai ? L(`Server AI is available (${srv.model}).`, `Το AI του διακομιστή είναι διαθέσιμο (${srv.model}).`) : srv.reachable ? "This server has no AI provider configured. Server AI requests will fail safely and your work stays unchanged." : "No MIRROR server is reachable (for example, when opened as a static page). Demo rules still work fully.")),
        h("button", { class: "btn btn-sm", type: "button", style: "margin-top:var(--s3)", onclick: async () => { app.server = await serverStatus(); app.render(); } }, "Check again")),
      h("section", { class: "panel pad", "aria-labelledby": "s-data" }, h("h2", { class: "h2", id: "s-data" }, "Privacy & data"),
        h("p", { class: "small muted", style: "margin-top:8px;max-width:64ch" }, persistent()
          ? "Everything you write is stored only in this browser, on this device. MIRROR has no accounts, no analytics and no tracking. Nothing syncs between devices: export a file to move your decisions."
          : "This browser isn't allowing storage, so decisions only last until you close the page. Export a file to keep them."),
        h("p", { class: "small muted", style: "margin-top:8px;max-width:64ch" }, "If Server AI is on, the text of a decision is sent to the server only when you press Map the futures, and is not stored there by MIRROR."),
        row("Export everything", L(`${app.store.data.decisions.length} decision${app.store.data.decisions.length === 1 ? "" : "s"} as a JSON file you can keep or import elsewhere.`, `${app.store.data.decisions.length} ${app.store.data.decisions.length === 1 ? "απόφαση" : "αποφάσεις"} σε αρχείο JSON που μπορείς να κρατήσεις ή να εισαγάγεις αλλού.`),
          h("button", { class: "btn", type: "button", onclick: () => download(`mirror-export-${new Date().toISOString().slice(0, 10)}.json`, app.store.exportJSON(), "application/json") }, icon("save"), "Export")),
        row("Import", "Add decisions from a MIRROR export file. Invalid entries are skipped, never half-imported.", h("label", { class: "btn", for: "imp", tabindex: "0", onkeydown: (e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileIn.click(); } } }, icon("up"), "Import", fileIn)),
        row("Delete everything", "Permanently removes all decisions and settings from this browser.", h("button", { class: "btn btn-danger", type: "button", onclick: () => deleteAll(app) }, icon("trash"), "Delete all data"))),
      h("section", { class: "panel pad", "aria-labelledby": "s-about" }, h("h2", { class: "h2", id: "s-about" }, "About MIRROR"),
        h("p", { class: "small muted", style: "margin-top:8px;max-width:64ch" }, "MIRROR helps you think through a decision. It can't know the future or guarantee an outcome, and it won't tell you what to choose. For medical, legal, financial or mental-health decisions, talk to a qualified person."),
        h("div", { class: "row", style: "margin-top:var(--s4)" }, h("a", { class: "btn btn-sm", href: "#/" }, "Visit the MIRROR website"), h("span", { class: "faint xs" }, "Version 0.1.0")))));
}

function deleteAll(app: App) {
  const input = h("input", { class: "input", id: "del", autocomplete: "off", placeholder: "DELETE" });
  const err = h("p", { class: "err", role: "alert" });
  app.dialog("Delete all data?", h("div", { class: "stack" },
    h("p", { class: "muted" }, L(`This permanently removes ${app.store.data.decisions.length} decision(s), every version and reflection, and your settings from this browser. It can't be undone. Export first if you might want them.`, `Αυτό διαγράφει οριστικά ${app.store.data.decisions.length} απόφαση(-εις), κάθε έκδοση και αναστοχασμό, και τις ρυθμίσεις σου από αυτό το πρόγραμμα περιήγησης. Δεν αναιρείται. Κάνε πρώτα εξαγωγή αν μπορεί να τα θέλεις.`)),
    h("div", { class: "field" }, h("label", { for: "del" }, "Type DELETE to confirm"), input), err), [
    { label: "Cancel", kind: "quiet" },
    { label: "Delete everything", kind: "danger", run: () => {
      if (input.value.trim() !== "DELETE") { err.textContent = tr("Type DELETE in capitals to confirm."); input.focus(); return false; }
      app.store.deleteAll(); app.applyPrefs(); app.nav("#/"); app.toast("All MIRROR data was deleted from this browser.");
      return true;
    } },
  ]);
}
