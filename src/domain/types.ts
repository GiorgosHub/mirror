/* MIRROR domain model.
   Decisions are structured data, never chat transcripts. Every piece of analysis carries its provenance:
   what the user stated, what is assumed, and what is inferred (by demo rules or by an AI model).
   The zod schemas are the single source of truth: storage, imports and AI responses are all validated
   against them before they can touch application state. */
import { z } from "zod";
import { getLang } from "../i18n.ts";

/* a label table that follows the active language */
const byLang = <K extends string, V>(en: Record<K, V>, el: Record<K, V>): Record<K, V> =>
  new Proxy(en, { get: (_t, k) => (getLang() === "el" ? el : en)[k as K] });

export const HORIZONS = ["3m", "1y", "3y", "5y"] as const;
export const Horizon = z.enum(HORIZONS);
export type Horizon = z.infer<typeof Horizon>;

export const HORIZON_LABEL = byLang<Horizon, string>({ "3m": "3 months", "1y": "1 year", "3y": "3 years", "5y": "5+ years" }, { "3m": "3 μήνες", "1y": "1 χρόνος", "3y": "3 χρόνια", "5y": "5+ χρόνια" });
/* The three columns of the Future Lab for each horizon: near, middle, far. */
export const HORIZON_SLOTS = byLang<Horizon, [string, string, string]>({
  "3m": ["2 weeks", "6 weeks", "3 months"],
  "1y": ["1 month", "6 months", "1 year"],
  "3y": ["3 months", "1 year", "3 years"],
  "5y": ["1 year", "3 years", "5+ years"],
}, {
  "3m": ["2 εβδομάδες", "6 εβδομάδες", "3 μήνες"],
  "1y": ["1 μήνας", "6 μήνες", "1 χρόνος"],
  "3y": ["3 μήνες", "1 χρόνος", "3 χρόνια"],
  "5y": ["1 χρόνος", "3 χρόνια", "5+ χρόνια"],
});

export const PRIORITY_KEYS = ["money", "growth", "freedom", "relationships", "health", "meaning", "stability"] as const;
export const PriorityKey = z.enum(PRIORITY_KEYS);
export type PriorityKey = z.infer<typeof PriorityKey>;
export const PRIORITY_LABEL = byLang<PriorityKey, string>({
  money: "Financial safety", growth: "Growth", freedom: "Freedom", relationships: "Relationships",
  health: "Health & energy", meaning: "Meaning", stability: "Stability",
}, {
  money: "Οικονομική ασφάλεια", growth: "Εξέλιξη", freedom: "Ελευθερία", relationships: "Σχέσεις",
  health: "Υγεία & ενέργεια", meaning: "Νόημα", stability: "Σταθερότητα",
});

const id = z.string().min(1).max(64);
const text = (max = 600) => z.string().trim().min(1).max(max);
const iso = z.string().min(10).max(40);

/* ---------- analysis (generated) ---------- */
export const Provenance = z.enum(["stated", "assumption", "inference"]);
export type Provenance = z.infer<typeof Provenance>;

export const AssumptionStatus = z.enum(["holds", "unknown", "doubtful", "false"]);
export type AssumptionStatus = z.infer<typeof AssumptionStatus>;

export const Assumption = z.object({
  id,
  text: text(240),
  basis: z.enum(["stated", "inferred"]),
  initial: AssumptionStatus.default("unknown"),
});
export type Assumption = z.infer<typeof Assumption>;

export const OutcomeKind = z.enum(["fact", "assumed", "speculative"]);
export type OutcomeKind = z.infer<typeof OutcomeKind>;

export const Outcome = z.object({
  slot: z.number().int().min(0).max(2),
  text: text(240),
  kind: OutcomeKind,
  dependsOn: z.array(id).max(6).default([]),
  ifBroken: text(240),
});
export type Outcome = z.infer<typeof Outcome>;

export const Point = z.object({ text: text(240), source: Provenance, dependsOn: z.array(id).max(6).default([]) });
export type Point = z.infer<typeof Point>;

export const Risk = z.object({ text: text(240), mitigation: text(240), dependsOn: z.array(id).max(6).default([]) });
export type Risk = z.infer<typeof Risk>;

export const FitLevel = z.enum(["strong", "mixed", "weak", "unclear"]);
export type FitLevel = z.infer<typeof FitLevel>;

export const Fit = z.object({
  priority: PriorityKey,
  level: FitLevel,
  reasons: z.array(z.object({ text: text(240), source: Provenance })).min(1).max(5),
  /* if this assumption turns out false, the fit becomes this level */
  sensitive: z.array(z.object({ assumptionId: id, level: FitLevel })).max(4).default([]),
});
export type Fit = z.infer<typeof Fit>;

export const Experiment = z.object({
  id,
  title: text(160),
  how: text(400),
  cost: z.enum(["hours", "days", "weeks"]),
  reduces: z.array(id).max(6).default([]),
});
export type Experiment = z.infer<typeof Experiment>;

export const Branch = z.object({
  alternativeId: id,
  summary: text(300),
  assumptions: z.array(Assumption).min(1).max(8),
  outcomes: z.array(Outcome).length(3),
  benefits: z.array(Point).max(6),
  drawbacks: z.array(Point).max(6),
  risks: z.array(Risk).max(5),
  fit: z.array(Fit).max(7),
  experiments: z.array(Experiment).min(1).max(5),
});
export type Branch = z.infer<typeof Branch>;

export const Analysis = z.object({
  source: z.object({ kind: z.enum(["demo", "ai"]), model: z.string().max(80).optional(), generatedAt: iso }),
  lang: z.enum(["en", "el"]).optional(),
  domain: z.string().max(40),
  boundary: z.string().max(400).optional(),
  branches: z.array(Branch).min(2).max(4),
  missingInfo: z.array(text(240)).max(8),
  notes: z.array(text(300)).max(6).default([]),
});
export type Analysis = z.infer<typeof Analysis>;

/* ---------- user-owned decision state ---------- */
export const Alternative = z.object({ id, title: z.string().trim().max(120), note: z.string().max(400).default("") });
export type Alternative = z.infer<typeof Alternative>;

export const ExperimentState = z.object({
  status: z.enum(["idea", "planned", "done"]),
  due: z.string().max(20).optional(),
  learned: z.string().max(800).optional(),
});
export type ExperimentState = z.infer<typeof ExperimentState>;

export const Observation = z.object({
  id,
  at: iso,
  text: text(800),
  kind: z.enum(["evidence", "outcome", "note"]),
  assumptionId: id.optional(),
  alternativeId: id.optional(),
});
export type Observation = z.infer<typeof Observation>;

export const Snapshot = z.object({
  id,
  at: iso,
  label: text(120),
  assumptionState: z.record(AssumptionStatus),
  fit: z.record(z.record(FitLevel)),
});
export type Snapshot = z.infer<typeof Snapshot>;

export const Choice = z.object({
  alternativeId: id,
  at: iso,
  rationale: z.string().max(800).default(""),
  nextAction: z.string().max(300).default(""),
  reviewAt: z.string().max(20).optional(),
});
export type Choice = z.infer<typeof Choice>;

export const Reflection = z.object({ at: iso, text: text(1200), surprised: z.boolean().default(false) });
export type Reflection = z.infer<typeof Reflection>;

export const DecisionStatus = z.enum(["draft", "exploring", "decided", "resolved", "archived"]);
export type DecisionStatus = z.infer<typeof DecisionStatus>;

export const Decision = z.object({
  id,
  title: z.string().trim().max(200),
  context: z.string().max(2000).default(""),
  constraints: z.array(z.string().trim().min(1).max(160)).max(10).default([]),
  alternatives: z.array(Alternative).max(4).default([]),
  horizon: Horizon.default("1y"),
  priorities: z.array(PriorityKey).max(3).default([]),
  unknowns: z.array(z.string().trim().min(1).max(200)).max(8).default([]),
  status: DecisionStatus.default("draft"),
  step: z.number().int().min(0).max(7).default(0),
  createdAt: iso,
  updatedAt: iso,
  openedAt: iso.optional(),
  analysis: Analysis.optional(),
  assumptionState: z.record(AssumptionStatus).default({}),
  experimentState: z.record(ExperimentState).default({}),
  observations: z.array(Observation).max(200).default([]),
  snapshots: z.array(Snapshot).max(50).default([]),
  choice: Choice.optional(),
  reflections: z.array(Reflection).max(50).default([]),
});
export type Decision = z.infer<typeof Decision>;

export const Settings = z.object({
  language: z.enum(["en", "el"]).default("en"),
  theme: z.enum(["dark", "light", "system"]).default("dark"),
  motion: z.enum(["system", "reduce", "full"]).default("system"),
  cinema: z.enum(["auto", "still", "off"]).default("auto"),
  textScale: z.union([z.literal(1), z.literal(1.125), z.literal(1.25)]).default(1),
  defaultHorizon: Horizon.default("1y"),
  defaultPriorities: z.array(PriorityKey).max(3).default([]),
  analysis: z.enum(["demo", "server"]).default("demo"),
  introSeen: z.boolean().default(false),
});
export type Settings = z.infer<typeof Settings>;

export const STORE_VERSION = 1;
export const StoreData = z.object({
  version: z.literal(STORE_VERSION),
  decisions: z.array(Decision).max(500),
  settings: Settings,
});
export type StoreData = z.infer<typeof StoreData>;

/* what the analysis engines receive: only the user's inputs, never the derived state */
export type DecisionInput = Pick<Decision, "title" | "context" | "constraints" | "alternatives" | "horizon" | "priorities" | "unknowns"> & { lang?: "en" | "el" };
export const toInput = (d: Decision): DecisionInput => ({
  title: d.title, context: d.context, constraints: d.constraints, alternatives: d.alternatives,
  horizon: d.horizon, priorities: d.priorities, unknowns: d.unknowns, lang: getLang(),
});
