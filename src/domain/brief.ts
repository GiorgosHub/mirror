/* The Decision Brief: a summary the user can keep, print or share. It states what MIRROR knows and doesn't,
   and it never tells the user what to choose. */
import { type BranchView, deriveView, describeTradeOff, nextStep, tradeOffs } from "./engine.ts";
import { type Decision, HORIZON_LABEL, PRIORITY_LABEL } from "./types.ts";
import { L as T, locale } from "../i18n.ts";

const LEVEL = () => ({ strong: T("strong", "ισχυρή"), mixed: T("mixed", "μικτή"), weak: T("weak", "αδύναμη"), unclear: T("unclear", "ασαφής") } as Record<string, string>);
const STATUS = () => ({ unknown: T("unknown", "άγνωστο"), doubtful: T("doubtful", "αμφίβολο"), holds: T("holds", "ισχύει"), false: T("not true", "δεν ισχύει") } as Record<string, string>);
const XSTATUS = () => ({ idea: T("idea", "ιδέα"), planned: T("planned", "προγραμματισμένο"), done: T("done", "έγινε") } as Record<string, string>);

export interface Brief {
  title: string;
  context: string;
  horizon: string;
  priorities: string[];
  source: string;
  alternatives: { title: string; summary: string; benefits: string[]; drawbacks: string[]; risks: { text: string; mitigation: string }[]; fit: { priority: string; level: string; why: string }[] }[];
  tradeOffs: string[];
  uncertainties: string[];
  missing: string[];
  experiments: { title: string; for: string; how: string; status: string }[];
  next: string;
  choice?: { title: string; rationale: string; reviewAt?: string };
  reviewAt?: string;
  boundary?: string;
  generatedAt: string;
}

export function buildBrief(d: Decision, now = new Date()): Brief {
  const views: BranchView[] = deriveView(d);
  const step = nextStep(views);
  const src = d.analysis?.source;
  const chosen = d.choice ? d.alternatives.find((a) => a.id === d.choice!.alternativeId) : undefined;
  return {
    title: d.title || T("Untitled decision", "Απόφαση χωρίς τίτλο"),
    context: d.context,
    horizon: HORIZON_LABEL[d.horizon],
    priorities: d.priorities.map((p) => PRIORITY_LABEL[p]),
    source: src ? (src.kind === "ai" ? T(`AI analysis (${src.model ?? "model"}), reviewed by you`, `Ανάλυση AI (${src.model ?? "μοντέλο"}), ελεγμένη από σένα`) : T("Demonstration rules on this device (not AI)", "Κανόνες επίδειξης σε αυτή τη συσκευή (όχι AI)")) : T("No analysis yet", "Δεν υπάρχει ακόμη ανάλυση"),
    alternatives: views.map((v) => ({
      title: v.title,
      summary: v.branch.summary,
      benefits: v.branch.benefits.map((b) => b.text),
      drawbacks: v.branch.drawbacks.map((b) => b.text),
      risks: v.risks.filter((r) => r.active).map((r) => ({ text: r.text, mitigation: r.mitigation })),
      fit: v.fit.map((f) => ({ priority: PRIORITY_LABEL[f.priority], level: LEVEL()[f.effective] ?? f.effective, why: f.changedBy ?? f.reasons[0]!.text })),
    })),
    tradeOffs: tradeOffs(views).map(describeTradeOff),
    uncertainties: views.flatMap((v) => v.assumptions.filter((a) => a.status === "unknown" || a.status === "doubtful").map((a) => `${v.title}: ${a.text} (${STATUS()[a.status] ?? a.status})`)),
    missing: d.analysis?.missingInfo ?? [],
    experiments: views.flatMap((v) => v.experiments.map((x) => ({ title: x.title, for: v.title, how: x.how, status: (XSTATUS()[x.state.status] ?? x.state.status) + (x.state.due ? ` · ${x.state.due}` : "") }))),
    next: d.choice?.nextAction || (step ? `${step.experiment.title} (${T("tests", "ελέγχει")}: ${step.assumption.text.toLowerCase()})` : T("Record what you've learned, then revisit the comparison.", "Κατάγραψε τι έμαθες και ξαναδές τη σύγκριση.")),
    ...(chosen ? { choice: { title: chosen.title, rationale: d.choice!.rationale, ...(d.choice!.reviewAt ? { reviewAt: d.choice!.reviewAt } : {}) } } : {}),
    ...(d.choice?.reviewAt ? { reviewAt: d.choice.reviewAt } : {}),
    ...(d.analysis?.boundary ? { boundary: d.analysis.boundary } : {}),
    generatedAt: now.toISOString(),
  };
}

export function briefMarkdown(b: Brief): string {
  const L: string[] = [];
  const list = (xs: string[]) => xs.forEach((x) => L.push(`- ${x}`));
  L.push(`# ${b.title}`, "", T(`*Decision brief from MIRROR · ${new Date(b.generatedAt).toLocaleDateString(locale())} · Analysis: ${b.source}*`, `*Σύνοψη απόφασης από το MIRROR · ${new Date(b.generatedAt).toLocaleDateString(locale())} · Ανάλυση: ${b.source}*`), "");
  if (b.boundary) L.push(`> ${b.boundary}`, "");
  if (b.context) L.push(b.context, "");
  L.push(`**${T("Time horizon", "Χρονικός ορίζοντας")}:** ${b.horizon}  `, `**${T("What matters most", "Τι μετράει περισσότερο")}:** ${b.priorities.join(", ") || T("not set", "δεν ορίστηκε")}`, "");
  if (b.choice) L.push(`## ${T("Your choice", "Η επιλογή σου")}`, `**${b.choice.title}**${b.choice.rationale ? `: ${b.choice.rationale}` : ""}`, b.choice.reviewAt ? T(`Review on ${b.choice.reviewAt}.`, `Επανεξέταση στις ${b.choice.reviewAt}.`) : "", "");
  L.push(`## ${T("Alternatives", "Εναλλακτικές")}`);
  for (const a of b.alternatives) {
    L.push("", `### ${a.title}`, a.summary, "", `**${T("Benefits", "Οφέλη")}**`); list(a.benefits);
    L.push("", `**${T("Drawbacks", "Μειονεκτήματα")}**`); list(a.drawbacks);
    if (a.risks.length) { L.push("", `**${T("Downsides and how to soften them", "Κίνδυνοι και πώς να τους μετριάσεις")}**`); list(a.risks.map((r) => `${r.text}. ${r.mitigation}`)); }
    L.push("", `**${T("Fit with your priorities", "Ταίριασμα με τις προτεραιότητές σου")}**`); list(a.fit.map((f) => `${f.priority}: ${f.level} (${f.why})`));
  }
  L.push("", `## ${T("Trade-offs", "Αντισταθμίσεις")}`); list(b.tradeOffs);
  L.push("", `## ${T("Still uncertain", "Ακόμη αβέβαιο")}`); list(b.uncertainties.length ? b.uncertainties : [T("Nothing marked uncertain.", "Τίποτα δεν έχει σημειωθεί ως αβέβαιο.")]);
  L.push("", `## ${T("Missing information", "Πληροφορίες που λείπουν")}`); list(b.missing.length ? b.missing : [T("None recorded.", "Δεν καταγράφηκε κάτι.")]);
  L.push("", `## ${T("Experiments", "Πειράματα")}`); list(b.experiments.map((x) => `${x.title} (${T("for", "για")} "${x.for}", ${x.status}): ${x.how}`));
  L.push("", `## ${T("Next action", "Επόμενη ενέργεια")}`, b.next);
  if (b.reviewAt) L.push("", `${T("Review date", "Ημερομηνία επανεξέτασης")}: ${b.reviewAt}`);
  L.push("", "---", T("MIRROR explores possibilities; it does not predict outcomes. The choice is yours.", "Το MIRROR εξερευνά δυνατότητες· δεν προβλέπει αποτελέσματα. Η επιλογή είναι δική σου."));
  return L.join("\n");
}
