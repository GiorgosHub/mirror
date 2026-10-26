/* The decision engine.
   1. demoAnalysis(): a transparent, rule-based analysis used when no AI provider is configured. It is labelled as such
      everywhere it appears and never pretends to be a model. It reasons from the user's own words (constraints,
      unknowns, notes) plus a small library of option archetypes.
   2. deriveView(): applies the user's current assumption judgements to any analysis (demo or AI) so that every
      outcome and every priority fit can be traced back to what it depends on. This runs locally and deterministically. */
import {
  type Analysis, type AssumptionStatus, type Branch, type Decision, type DecisionInput, type Experiment,
  type ExperimentState, type Fit, type FitLevel, type Outcome, type Point, type PriorityKey, type Provenance,
  HORIZON_SLOTS, PRIORITY_LABEL,
} from "./types.ts";
import { getLang, L, withLang } from "../i18n.ts";

/* ---------------- reading the decision ---------------- */
export type Archetype = "hold" | "trial" | "leap" | "learn" | "invest" | "open";
const ARCH_EN: Record<Archetype, string> = { hold: "Keep course", trial: "Test small", leap: "Leap", learn: "Build skills", invest: "Commit resources", open: "Open path" };
const ARCH_EL: Record<Archetype, string> = { hold: "Παραμονή", trial: "Μικρή δοκιμή", leap: "Άλμα", learn: "Νέες δεξιότητες", invest: "Δέσμευση πόρων", open: "Ανοιχτός δρόμος" };
export const ARCHETYPE_LABEL = new Proxy(ARCH_EN, { get: (_t, k) => (getLang() === "el" ? ARCH_EL : ARCH_EN)[k as Archetype] });

/* accents don't matter when matching words (Greek: ά = α) */
const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const has = (s: string, words: string[]) => { const f = fold(s); return words.some((w) => new RegExp(`(^|[^\\p{L}])${fold(w)}`, "iu").test(f)); };

/* Weighted, not first-match: "Quit and study full-time" is a leap that involves studying, not a study plan.
   The title counts fully, the note at half weight; ties go to the more cautious reading. */
const SIGNALS: [Archetype, [string, number][]][] = [
  ["trial", [["δοκιμ", 2], ["πιλοτ", 2], ["μερικη απασχ", 2], ["βραδ", 2], ["νυχτ", 2], ["σαββατοκυριακ", 2], ["προσωριν", 2], ["αδεια", 2], ["μικρ", 1.5], ["πρωτα", 1], ["πρακτικη", 2], ["test", 2], ["try", 2], ["trial", 2], ["part[- ]time", 2], ["side", 1.5], ["sabbatical", 2], ["pilot", 2], ["experiment", 2], ["evening", 2], ["night", 2], ["weekend", 2], ["gradual", 2], ["temporar", 2], ["internship", 2], ["shadow", 1.5], ["small", 1.5], ["first", 1], ["pre-?sell", 2]]],
  ["leap", [["παραιτ", 2.5], ["φυγω", 2], ["φυγ", 1.5], ["αφησω", 2], ["πληρους", 2], ["πληρη", 1.5], ["ξεκιν", 1.5], ["μετακομ", 1.5], ["αλλαξ", 1], ["αλλαγ", 1], ["ανοιξω", 1.5], ["δεχτ", 1.5], ["λανσαρ", 2], ["quit", 2.5], ["leave", 2], ["resign", 2.5], ["full[- ]time", 2], ["go all", 2.5], ["launch", 2], ["start", 1.5], ["move", 1.5], ["relocat", 2], ["switch", 1.5], ["change", 1], ["drop", 1.5], ["sell", 1], ["join", 1.5], ["accept", 1.5], ["take the", 1.5]]],
  ["hold", [["μεινω", 1.5], ["μενω", 1.5], ["παραμειν", 1.5], ["παραμον", 1.5], ["συνεχισ", 1.5], ["κρατησ", 1.5], ["ανανεω", 1.5], ["περιμεν", 1.5], ["τιποτα", 1.5], ["ιδιο", 1], ["ως εχουν", 2], ["stay", 1.5], ["keep", 1.5], ["continue", 1.5], ["remain", 1.5], ["don'?t", 1.5], ["do not", 1.5], ["renew", 1.5], ["current", 1], ["same", 1], ["wait", 1.5], ["status quo", 2], ["nothing", 1.5]]],
  ["learn", [["σπουδ", 1], ["μαθ", 1], ["πτυχ", 1.2], ["μεταπτυχ", 1.2], ["σχολ", 1], ["πανεπιστ", 1], ["εκπαιδ", 1], ["πιστοποι", 1.2], ["σεμιναρ", 1.2], ["study", 1], ["learn", 1], ["course", 1.2], ["degree", 1.2], ["bootcamp", 1.2], ["school", 1], ["master", 1], ["universit", 1], ["train", 1], ["certific", 1.2]]],
  ["invest", [["αγορασ", 1.5], ["αγορα", 1], ["επενδ", 2], ["δανει", 1.5], ["στεγαστ", 2], ["buy", 1.5], ["invest", 2], ["mortgage", 2], ["purchase", 1.5], ["loan", 1.5]]],
];
const TIE: Archetype[] = ["trial", "hold", "learn", "invest", "leap", "open"];
export function archetypeOf(title: string, note = ""): Archetype {
  const t = title.toLowerCase(), n = note.toLowerCase();
  let best: Archetype = "open", score = 0;
  for (const [kind, words] of SIGNALS) {
    let sc = 0;
    for (const [w, wt] of words) { if (has(t, [w])) sc += wt; if (has(n, [w])) sc += wt / 2; }
    if (sc > score || (sc === score && sc > 0 && TIE.indexOf(kind) < TIE.indexOf(best))) { best = kind; score = sc; }
  }
  return best;
}

export type Domain = "career" | "education" | "relocation" | "business" | "relationships" | "finance" | "health" | "legal" | "time" | "general";
export function domainOf(d: Pick<DecisionInput, "title" | "context">): Domain {
  const s = `${d.title} ${d.context}`.toLowerCase();
  const order: [Domain, string[]][] = [
    ["health", ["υγει", "γιατρ", "χειρουργ", "θεραπ", "διαγνω", "φαρμακ", "καταθλ", "αγχος", "εγκυμ", "health", "doctor", "surgery", "treatment", "therap", "diagnos", "medic", "depress", "anxiety", "burnout", "pregnan"]],
    ["legal", ["βιζα", "δικηγορ", "νομικ", "συμβολαι", "δικαστ", "διαζυγ", "visa", "lawyer", "legal", "contract", "court", "divorce", "custody", "lawsuit"]],
    ["finance", ["επενδ", "στεγαστ", "δανει", "χρεο", "μετοχ", "κρυπτο", "συνταξ", "invest", "mortgage", "loan", "debt", "stock", "crypto", "retire", "pension", "buy a house", "buy a flat"]],
    ["business", ["επιχειρ", "εταιρ", "πελατ", "προιον", "business", "startup", "start-up", "company", "launch", "client", "customers", "product", "freelanc"]],
    ["relocation", ["μετακομ", "χωρα", "εξωτερικ", "πολη", "μεταναστ", "move to", "moving", "country", "abroad", "relocat", "city", "emigrat"]],
    ["education", ["σπουδ", "πτυχ", "πανεπιστ", "μεταπτυχ", "σχολ", "study", "degree", "universit", "course", "school", "master", "phd", "bootcamp"]],
    ["career", ["δουλει", "εργασ", "καριερ", "αφεντικ", "θεση", "μισθ", "προαγωγ", "job", "career", "work", "boss", "role", "salary", "promotion", "offer", "employer", "quit"]],
    ["relationships", ["συντροφ", "σχεση", "παντρ", "φιλ", "οικογεν", "γονει", "παιδ", "partner", "relationship", "marry", "friend", "family", "parent", "children", "kids"]],
    ["time", ["χρονο", "χομπι", "ωρες", "time", "hobby", "weekend", "hours", "habit"]],
  ];
  for (const [dom, words] of order) if (has(s, words)) return dom;
  return "general";
}

const BOUNDARY = (): Partial<Record<Domain, string>> => ({
  health: L("This touches on health. MIRROR can help you organise questions, but a qualified clinician should guide medical decisions.", "Αυτό αφορά την υγεία. Το MIRROR μπορεί να σε βοηθήσει να οργανώσεις τις ερωτήσεις σου, αλλά τις ιατρικές αποφάσεις πρέπει να τις καθοδηγεί ένας ειδικός γιατρός."),
  legal: L("This has legal dimensions. Use MIRROR to prepare, then check the specifics with a qualified lawyer or official source.", "Αυτό έχει νομικές διαστάσεις. Χρησιμοποίησε το MIRROR για να προετοιμαστείς και έλεγξε τα συγκεκριμένα με δικηγόρο ή επίσημη πηγή."),
  finance: L("This involves significant money. MIRROR does not give financial advice; consider an independent, qualified advisor before committing.", "Αυτό αφορά σημαντικά χρήματα. Το MIRROR δεν δίνει οικονομικές συμβουλές· σκέψου έναν ανεξάρτητο, ειδικό σύμβουλο πριν δεσμευτείς."),
});

const MONEY = ["αποταμιευ", "χρημα", "προυπολογ", "μισθ", "εισοδ", "χρεο", "ενοικ", "ευρω", "μην", "saving", "money", "budget", "salary", "income", "debt", "rent", "mortgage", "€", "\\$", "£", "afford", "runway", "month"];
const TIME = ["ωρ", "εβδομαδ", "χρονο", "προθεσμ", "πριν", "μεχρι", "hour", "week", "time", "evening", "weekend", "deadline", "before", "until", "by "];
const PLACE = ["μετακομ", "πολη", "χωρα", "βιζα", "σπιτι", "οικογεν", "relocat", "move", "city", "country", "visa", "home", "family"];

/* ---------------- archetype library ---------------- */
type Tpl = {
  summary: string;
  assumptions: { key: string; text: string; initial: AssumptionStatus }[];
  outcomes: { text: string; kind: Outcome["kind"]; on: string[]; broken: string }[];
  benefits: string[];
  drawbacks: string[];
  risks: { text: string; mitigation: string; on: string[] }[];
  fit: Partial<Record<PriorityKey, { level: FitLevel; why: string; sensitive?: [string, FitLevel] }>>;
  experiments: { title: string; how: string; cost: Experiment["cost"]; reduces: string[] }[];
};

const LIB = (alt: string, [s0, s1, s2]: readonly [string, string, string], p1: string): Record<Archetype, Tpl> => ({
  hold: {
    summary: `Keep things as they are and make "${alt}" an active, reviewed choice rather than a default.`,
    assumptions: [
      { key: "a1", text: "Your current situation stays roughly stable if you don't act", initial: "unknown" },
      { key: "a2", text: "The opportunities you'd pass on will still exist later", initial: "doubtful" },
    ],
    outcomes: [
      { text: `In ${s0}, nothing has changed: routine, income and commitments are where they are today.`, kind: "fact", on: [], broken: `In ${s0}, nothing has changed: routine, income and commitments are where they are today.` },
      { text: `At ${s1}, ${p1} is protected, and the question you're asking now has probably come back.`, kind: "assumed", on: ["a1"], broken: `By ${s1} your situation has shifted anyway; standing still has become its own risk.` },
      { text: `At ${s2}: a familiar path. The cost of the road not taken is harder to see, not smaller.`, kind: "speculative", on: ["a2"], broken: `By ${s2}, some of the doors you see today have closed.` },
    ],
    benefits: ["Keeps what already works, with no switching cost", "Fully reversible: you can still choose differently later"],
    drawbacks: ["The tension that started this decision stays unresolved", "Opportunity cost is invisible, which makes it easy to underestimate"],
    risks: [{ text: "Drift: months pass and you learn nothing new about the other options", mitigation: "Set a review date and run one small experiment, so staying is a choice, not a default.", on: ["a2"] }],
    fit: {
      money: { level: "strong", why: "Keeping the current setup usually protects income in the short term" },
      stability: { level: "strong", why: "Least change of any option", sensitive: ["a1", "weak"] },
      growth: { level: "weak", why: "Growth depends on what you change, and this option changes least", sensitive: ["a2", "mixed"] },
      freedom: { level: "mixed", why: "No new freedom, but no new obligations either" },
      meaning: { level: "unclear", why: "Depends on why you started asking this question in the first place" },
      relationships: { level: "mixed", why: "No disruption, and no new energy either" },
      health: { level: "mixed", why: "Depends on whether the current situation is what's draining you" },
    },
    experiments: [
      { title: "Name what would have to change for staying to feel right", how: "Write three concrete conditions. If none of them is achievable where you are, that's information.", cost: "hours", reduces: ["a1"] },
      { title: "Ask someone who stayed in a similar spot for two years", how: "One 20-minute conversation: what did staying give them, and what did it cost?", cost: "days", reduces: ["a2"] },
    ],
  },
  trial: {
    summary: `A low-cost way to learn: try "${alt}" in a small, bounded form before committing.`,
    assumptions: [
      { key: "a1", text: "You can protect a few hours a week without hurting what you already have", initial: "unknown" },
      { key: "a2", text: "A small version is a fair preview of the real thing", initial: "doubtful" },
    ],
    outcomes: [
      { text: `Within ${s0}, "${alt}" is running in a small form: low cost, quick feedback, little to undo.`, kind: "assumed", on: ["a1"], broken: `There isn't room for "${alt}" yet; it stalls before it teaches you anything.` },
      { text: `By ${s1}, you have real evidence, not guesses, about whether this suits you.`, kind: "assumed", on: ["a2"], broken: `By ${s1} the small version has misled you: the full commitment would feel different.` },
      { text: `By ${s2}, you've either scaled it up with confidence or dropped it with little regret.`, kind: "speculative", on: ["a1", "a2"], broken: "Running two things at once has worn you down, and both have suffered." },
    ],
    benefits: ["Reversible: you can stop with little lost", "Turns your biggest unknowns into evidence"],
    drawbacks: ["Slower than committing fully", "Splits your attention for a while"],
    risks: [{ text: "Carrying two things at once leads to exhaustion", mitigation: "Fix an end date and a clear continue/stop rule before you start.", on: ["a1"] }],
    fit: {
      growth: { level: "strong", why: "You learn fast while risking little" },
      money: { level: "mixed", why: "Small costs, little income change" },
      stability: { level: "mixed", why: "Your base stays intact while you test" },
      freedom: { level: "mixed", why: "More options later, less free time now", sensitive: ["a1", "weak"] },
      health: { level: "mixed", why: "Extra load for a limited period", sensitive: ["a1", "weak"] },
      meaning: { level: "mixed", why: "Gives you a taste of whether the change feels meaningful" },
      relationships: { level: "mixed", why: "Takes time from somewhere; agree with the people affected" },
    },
    experiments: [
      { title: "Run a two-week mini-version", how: "Block the hours in your calendar now. At the end, write one paragraph: what surprised you?", cost: "days", reduces: ["a1", "a2"] },
      { title: "Write your continue/stop rule today", how: "One sentence: 'If by [date] I see [signal], I continue; otherwise I stop.'", cost: "hours", reduces: ["a2"] },
    ],
  },
  leap: {
    summary: `A decisive change: "${alt}". The fastest learning, with the most at stake.`,
    assumptions: [
      { key: "a1", text: "You have enough financial runway to absorb a slow start", initial: "unknown" },
      { key: "a2", text: "There is real opportunity or demand on the other side", initial: "unknown" },
      { key: "a3", text: "You could recover if it doesn't work out", initial: "doubtful" },
    ],
    outcomes: [
      { text: `Within ${s0} of "${alt}": a new routine, new uncertainty, and the fastest learning of any option.`, kind: "fact", on: [], broken: `Within ${s0} of "${alt}": a new routine, new uncertainty, and the fastest learning of any option.` },
      { text: `By ${s1}, momentum is building and the change has started to pay back.`, kind: "assumed", on: ["a2", "a1"], broken: `Before ${s1}, money pressure arrives before momentum does; you need a fallback.` },
      { text: `At ${s2}: a different trajectory, hard to predict and hard to fully undo.`, kind: "speculative", on: ["a3"], broken: `By ${s2}, going back would cost more than you expected.` },
    ],
    benefits: ["Removes the 'what if' quickly", "Full focus on the new direction"],
    drawbacks: ["Highest financial and emotional exposure", "Hard to reverse once you're in"],
    risks: [
      { text: "Runway runs out before results arrive", mitigation: "Set your minimum monthly number and a fixed date to re-evaluate.", on: ["a1"] },
      { text: "The step turns out less reversible than it looked", mitigation: "Keep one bridge open: a reference, a part-time option, or a savings floor.", on: ["a3"] },
    ],
    fit: {
      growth: { level: "strong", why: "The steepest learning curve of any option", sensitive: ["a2", "mixed"] },
      freedom: { level: "strong", why: "You choose the new direction yourself", sensitive: ["a1", "mixed"] },
      money: { level: "weak", why: "Income becomes uncertain for a while", sensitive: ["a1", "weak"] },
      stability: { level: "weak", why: "Most things change at once" },
      meaning: { level: "mixed", why: "Strong if this is what you actually want; ask yourself honestly" },
      health: { level: "unclear", why: "Relief or strain; depends on how you handle uncertainty" },
      relationships: { level: "unclear", why: "Affects people around you; their view matters here" },
    },
    experiments: [
      { title: "Calculate your real runway", how: "Fixed monthly costs ÷ money you can actually use = months. Write the number down.", cost: "hours", reduces: ["a1"] },
      { title: "Get one committed 'yes' before you switch", how: "A client, an offer, an acceptance letter: something real from the other side.", cost: "weeks", reduces: ["a2"] },
      { title: "Ask two people who made this move what they'd do differently", how: "Look for one it worked for and one it didn't.", cost: "days", reduces: ["a3"] },
    ],
  },
  learn: {
    summary: `Invest time in "${alt}" to open options you don't have yet.`,
    assumptions: [
      { key: "a1", text: "The skill or credential is valued where you want to go", initial: "unknown" },
      { key: "a2", text: "You can sustain the effort for the whole programme", initial: "unknown" },
    ],
    outcomes: [
      { text: `In the first ${s0} of "${alt}", time and money go in; the return isn't visible yet.`, kind: "fact", on: [], broken: `In the first ${s0} of "${alt}", time and money go in; the return isn't visible yet.` },
      { text: `By ${s1}, your skills have measurably improved and opened specific new options.`, kind: "assumed", on: ["a2"], broken: `By ${s1} the effort has faded halfway, leaving sunk cost.` },
      { text: `At ${s2}, the skill pays off, if the market still values it by then.`, kind: "speculative", on: ["a1"], broken: `At ${s2} it's a good skill in the wrong place; you need to reposition.` },
    ],
    benefits: ["Builds something nobody can take from you", "Opens options instead of closing them"],
    drawbacks: ["Pays back slowly", "Costs time you could spend earning or resting"],
    risks: [{ text: "Finishing a programme the market no longer rewards", mitigation: "Check real job ads or opportunities before you enrol, and again halfway.", on: ["a1"] }],
    fit: {
      growth: { level: "strong", why: "Directly builds capability" },
      money: { level: "mixed", why: "Costs now, may pay later", sensitive: ["a1", "weak"] },
      meaning: { level: "mixed", why: "Depends on whether you enjoy the subject itself" },
      freedom: { level: "mixed", why: "Less free time now, more options later" },
      stability: { level: "mixed", why: "Your base mostly stays; your schedule doesn't" },
      health: { level: "mixed", why: "Sustained effort; watch your energy", sensitive: ["a2", "weak"] },
      relationships: { level: "unclear", why: "Time for study comes from somewhere" },
    },
    experiments: [
      { title: "Check 10 real opportunities for this skill", how: "Job ads, project briefs or programmes you'd want. Count how many actually ask for it.", cost: "hours", reduces: ["a1"] },
      { title: "Take a short or free module first", how: "One week of the real material at the real pace before you pay for the rest.", cost: "days", reduces: ["a2"] },
    ],
  },
  invest: {
    summary: `Commit resources to "${alt}" for a longer-term return.`,
    assumptions: [
      { key: "a1", text: "You can afford it without risking essentials", initial: "unknown" },
      { key: "a2", text: "Its value holds or grows over your time horizon", initial: "unknown" },
    ],
    outcomes: [
      { text: `Within ${s0}, "${alt}" is paid for: concrete, but committed.`, kind: "assumed", on: ["a1"], broken: "The cost squeezes essentials and adds stress." },
      { text: `By ${s1}, it has started returning value: practical, financial or personal.`, kind: "assumed", on: ["a2"], broken: `By ${s1} the return is slower or smaller than you expected.` },
      { text: `At ${s2}, its value depends on conditions you don't control.`, kind: "speculative", on: ["a2"], broken: `By ${s2} conditions have moved against you; exiting has a cost.` },
    ],
    benefits: ["Builds a long-term base", "Concrete, not hypothetical"],
    drawbacks: ["Ties up resources", "Exit can be slow or costly"],
    risks: [{ text: "The worst realistic case is worse than you can absorb", mitigation: "Write it down and check you could live with it before committing.", on: ["a1"] }],
    fit: {
      money: { level: "unclear", why: "Could help or hurt; it depends on price and timing", sensitive: ["a1", "weak"] },
      stability: { level: "mixed", why: "More stable later, more exposed now" },
      freedom: { level: "mixed", why: "Commitment now, options later" },
      growth: { level: "mixed", why: "Depends on what the investment unlocks" },
      meaning: { level: "unclear", why: "Ask what it's for, not only what it's worth" },
      health: { level: "unclear", why: "Financial stress affects energy" },
      relationships: { level: "unclear", why: "Shared money means shared decision" },
    },
    experiments: [
      { title: "Write the worst realistic case", how: "Not the disaster, the realistic bad case. Could you live with it for a year?", cost: "hours", reduces: ["a1"] },
      { title: "Get one independent opinion", how: "From a qualified person with nothing to sell you.", cost: "days", reduces: ["a2"] },
    ],
  },
  open: {
    summary: `"${alt}": a path MIRROR's demo rules don't recognise, so it stays open and you fill in the specifics.`,
    assumptions: [
      { key: "a1", text: "This option is available to you on the terms you expect", initial: "unknown" },
      { key: "a2", text: "You'd still want it once the novelty wears off", initial: "unknown" },
    ],
    outcomes: [
      { text: `First steps: the practical changes of choosing "${alt}".`, kind: "assumed", on: ["a1"], broken: "The option isn't really available as imagined; terms change." },
      { text: `By ${s1}, early results show whether it lives up to your reasons for choosing it.`, kind: "assumed", on: ["a2"], broken: `By ${s1} the appeal has faded as the routine set in.` },
      { text: `At ${s2}, the effects depend on things neither you nor MIRROR can see yet.`, kind: "speculative", on: ["a1", "a2"], broken: `At ${s2} you're somewhere you didn't aim for.` },
    ],
    benefits: ["Something you chose to put on the table", "May fit your situation better than any template"],
    drawbacks: ["Less known about it, so more to check"],
    risks: [{ text: "Choosing on appeal rather than evidence", mitigation: "Write down what would make this option clearly right, then check one of those things this week.", on: ["a2"] }],
    fit: {
      growth: { level: "unclear", why: "Not enough information yet" },
      money: { level: "unclear", why: "Not enough information yet" },
      stability: { level: "unclear", why: "Not enough information yet" },
      freedom: { level: "unclear", why: "Not enough information yet" },
      meaning: { level: "unclear", why: "Not enough information yet" },
      health: { level: "unclear", why: "Not enough information yet" },
      relationships: { level: "unclear", why: "Not enough information yet" },
    },
    experiments: [
      { title: "Define 'clearly right' for this option", how: "Three signs that would make you confident, then check one this week.", cost: "hours", reduces: ["a2"] },
      { title: "Talk to someone who chose this", how: "Ask what they wish they'd known first.", cost: "days", reduces: ["a1"] },
    ],
  },
});

/* Greek templates. Slot labels are nominative ("1 χρόνος"); after "σε" they need the accusative ("σε 1 χρόνο"). */
const acc = (s: string) => s.replace("μήνας", "μήνα").replace("χρόνος", "χρόνο");
const LIB_EL = (alt: string, slots: readonly [string, string, string], p1: string): Record<Archetype, Tpl> => {
  const [s0, s1, s2] = slots.map(acc) as [string, string, string];
  const first = /^1 /.test(s0) ? `Τον πρώτο ${s0.slice(2)}` : /εβδομάδες/.test(s0) ? `Τις πρώτες ${s0}` : /χρόνια/.test(s0) ? `Τα πρώτα ${s0}` : `Τους πρώτους ${s0}`;
  const learn0 = `${first} του «${alt}», μπαίνουν χρόνος και χρήματα· η απόδοση δεν φαίνεται ακόμη.`;
  return {
  hold: {
    summary: `Να μείνουν τα πράγματα ως έχουν, και το «${alt}» να γίνει συνειδητή επιλογή που επανεξετάζεις, όχι μια προεπιλογή.`,
    assumptions: [
      { key: "a1", text: "Η τωρινή σου κατάσταση μένει περίπου σταθερή αν δεν κάνεις κάτι", initial: "unknown" },
      { key: "a2", text: "Οι ευκαιρίες που αφήνεις θα υπάρχουν και αργότερα", initial: "doubtful" },
    ],
    outcomes: [
      { text: `Σε ${s0}, τίποτα δεν έχει αλλάξει: η ρουτίνα, το εισόδημα και οι υποχρεώσεις σου είναι όπου είναι και σήμερα.`, kind: "fact", on: [], broken: `Σε ${s0}, τίποτα δεν έχει αλλάξει: η ρουτίνα, το εισόδημα και οι υποχρεώσεις σου είναι όπου είναι και σήμερα.` },
      { text: `Σε ${s1}, το κριτήριο «${p1}» μένει προστατευμένο, και το ερώτημα που σε απασχολεί τώρα μάλλον έχει επιστρέψει.`, kind: "assumed", on: ["a1"], broken: `Σε ${s1}, η κατάστασή σου έχει αλλάξει ούτως ή άλλως· η ακινησία έχει γίνει κι αυτή ρίσκο.` },
      { text: `Σε ${s2}: ένας γνώριμος δρόμος. Το κόστος του δρόμου που δεν πήρες φαίνεται λιγότερο, δεν είναι μικρότερο.`, kind: "speculative", on: ["a2"], broken: `Σε ${s2}, κάποιες από τις πόρτες που βλέπεις σήμερα έχουν κλείσει.` },
    ],
    benefits: ["Κρατάς ό,τι ήδη λειτουργεί, χωρίς κόστος αλλαγής", "Πλήρως αναστρέψιμο: μπορείς ακόμη να επιλέξεις αλλιώς αργότερα"],
    drawbacks: ["Η ένταση που ξεκίνησε αυτή την απόφαση μένει άλυτη", "Το κόστος ευκαιρίας δεν φαίνεται, και γι' αυτό υποτιμάται εύκολα"],
    risks: [{ text: "Αδράνεια: περνούν μήνες και δεν μαθαίνεις τίποτα νέο για τις άλλες επιλογές", mitigation: "Όρισε ημερομηνία επανεξέτασης και κάνε ένα μικρό πείραμα, ώστε η παραμονή να είναι επιλογή, όχι προεπιλογή.", on: ["a2"] }],
    fit: {
      money: { level: "strong", why: "Η τωρινή κατάσταση συνήθως προστατεύει το εισόδημα βραχυπρόθεσμα" },
      stability: { level: "strong", why: "Η μικρότερη αλλαγή από όλες τις επιλογές", sensitive: ["a1", "weak"] },
      growth: { level: "weak", why: "Η εξέλιξη εξαρτάται από το τι αλλάζεις, κι αυτή η επιλογή αλλάζει τα λιγότερα", sensitive: ["a2", "mixed"] },
      freedom: { level: "mixed", why: "Καμία νέα ελευθερία, αλλά ούτε νέες υποχρεώσεις" },
      meaning: { level: "unclear", why: "Εξαρτάται από το γιατί άρχισες να κάνεις αυτή την ερώτηση" },
      relationships: { level: "mixed", why: "Καμία αναστάτωση, αλλά ούτε νέα ενέργεια" },
      health: { level: "mixed", why: "Εξαρτάται από το αν η τωρινή κατάσταση είναι αυτό που σε εξαντλεί" },
    },
    experiments: [
      { title: "Γράψε τι θα έπρεπε να αλλάξει για να νιώθεις σωστή την παραμονή", how: "Γράψε τρεις συγκεκριμένες προϋποθέσεις. Αν καμία δεν είναι εφικτή εκεί που είσαι, κι αυτό είναι πληροφορία.", cost: "hours", reduces: ["a1"] },
      { title: "Ρώτα κάποιον που έμεινε σε παρόμοια θέση για δύο χρόνια", how: "Μία κουβέντα 20 λεπτών: τι του έδωσε η παραμονή και τι του κόστισε;", cost: "days", reduces: ["a2"] },
    ],
  },
  trial: {
    summary: `Ένας φθηνός τρόπος να μάθεις: δοκίμασε το «${alt}» σε μικρή, οριοθετημένη μορφή πριν δεσμευτείς.`,
    assumptions: [
      { key: "a1", text: "Μπορείς να εξασφαλίσεις λίγες ώρες την εβδομάδα χωρίς να βλάψεις όσα ήδη έχεις", initial: "unknown" },
      { key: "a2", text: "Μια μικρή εκδοχή δίνει μια δίκαιη εικόνα του πραγματικού", initial: "doubtful" },
    ],
    outcomes: [
      { text: `Μέσα σε ${s0}, το «${alt}» τρέχει σε μικρή μορφή: χαμηλό κόστος, γρήγορη ανατροφοδότηση, λίγα να αναιρέσεις.`, kind: "assumed", on: ["a1"], broken: `Δεν υπάρχει ακόμη χώρος για το «${alt}»· σταματά πριν σου μάθει κάτι.` },
      { text: `Σε ${s1}, έχεις πραγματικά στοιχεία, όχι εικασίες, για το αν σου ταιριάζει.`, kind: "assumed", on: ["a2"], broken: `Σε ${s1}, η μικρή εκδοχή σε έχει παραπλανήσει: η πλήρης δέσμευση θα ήταν διαφορετική.` },
      { text: `Σε ${s2}, είτε το έχεις μεγαλώσει με σιγουριά είτε το έχεις αφήσει με λίγη μεταμέλεια.`, kind: "speculative", on: ["a1", "a2"], broken: "Τα δύο πράγματα μαζί σε έχουν εξαντλήσει, και έχουν υποφέρει και τα δύο." },
    ],
    benefits: ["Αναστρέψιμο: μπορείς να σταματήσεις χάνοντας λίγα", "Μετατρέπει τα μεγαλύτερα άγνωστά σου σε στοιχεία"],
    drawbacks: ["Πιο αργό από την πλήρη δέσμευση", "Μοιράζει την προσοχή σου για ένα διάστημα"],
    risks: [{ text: "Το να κουβαλάς δύο πράγματα μαζί οδηγεί σε εξάντληση", mitigation: "Όρισε ημερομηνία λήξης και έναν σαφή κανόνα συνέχισης/διακοπής πριν ξεκινήσεις.", on: ["a1"] }],
    fit: {
      growth: { level: "strong", why: "Μαθαίνεις γρήγορα ρισκάροντας λίγα" },
      money: { level: "mixed", why: "Μικρό κόστος, μικρή αλλαγή στο εισόδημα" },
      stability: { level: "mixed", why: "Η βάση σου μένει ανέπαφη όσο δοκιμάζεις" },
      freedom: { level: "mixed", why: "Περισσότερες επιλογές αργότερα, λιγότερος ελεύθερος χρόνος τώρα", sensitive: ["a1", "weak"] },
      health: { level: "mixed", why: "Επιπλέον φόρτος για περιορισμένο διάστημα", sensitive: ["a1", "weak"] },
      meaning: { level: "mixed", why: "Σου δίνει μια γεύση για το αν η αλλαγή έχει νόημα για σένα" },
      relationships: { level: "mixed", why: "Ο χρόνος βγαίνει από κάπου· συμφώνησε με όσους επηρεάζονται" },
    },
    experiments: [
      { title: "Κάνε μια μίνι εκδοχή δύο εβδομάδων", how: "Κλείσε τις ώρες στο ημερολόγιο τώρα. Στο τέλος, γράψε μία παράγραφο: τι σε ξάφνιασε;", cost: "days", reduces: ["a1", "a2"] },
      { title: "Γράψε σήμερα τον κανόνα συνέχισης/διακοπής", how: "Μία πρόταση: «Αν μέχρι [ημερομηνία] δω [ένδειξη], συνεχίζω· αλλιώς σταματώ.»", cost: "hours", reduces: ["a2"] },
    ],
  },
  leap: {
    summary: `Μια αποφασιστική αλλαγή: «${alt}». Η πιο γρήγορη μάθηση, με τα περισσότερα να διακυβεύονται.`,
    assumptions: [
      { key: "a1", text: "Έχεις αρκετό οικονομικό περιθώριο για να αντέξεις ένα αργό ξεκίνημα", initial: "unknown" },
      { key: "a2", text: "Υπάρχει πραγματική ευκαιρία ή ζήτηση στην άλλη πλευρά", initial: "unknown" },
      { key: "a3", text: "Θα μπορούσες να συνέλθεις αν δεν πετύχει", initial: "doubtful" },
    ],
    outcomes: [
      { text: `Μέσα σε ${s0} από το «${alt}»: νέα ρουτίνα, νέα αβεβαιότητα, και η πιο γρήγορη μάθηση από κάθε επιλογή.`, kind: "fact", on: [], broken: `Μέσα σε ${s0} από το «${alt}»: νέα ρουτίνα, νέα αβεβαιότητα, και η πιο γρήγορη μάθηση από κάθε επιλογή.` },
      { text: `Σε ${s1}, η ορμή χτίζεται και η αλλαγή έχει αρχίσει να αποδίδει.`, kind: "assumed", on: ["a2", "a1"], broken: `Πριν περάσουν ${s1}, η οικονομική πίεση φτάνει πριν από την ορμή· χρειάζεσαι εφεδρεία.` },
      { text: `Σε ${s2}: μια διαφορετική πορεία, δύσκολο να προβλεφθεί και δύσκολο να αναιρεθεί πλήρως.`, kind: "speculative", on: ["a3"], broken: `Σε ${s2}, η επιστροφή θα κόστιζε περισσότερο απ' ό,τι περίμενες.` },
    ],
    benefits: ["Ξεμπερδεύεις γρήγορα με το «τι θα γινόταν αν»", "Πλήρης εστίαση στη νέα κατεύθυνση"],
    drawbacks: ["Η μεγαλύτερη οικονομική και συναισθηματική έκθεση", "Δύσκολο να γυρίσεις πίσω μόλις μπεις"],
    risks: [
      { text: "Το περιθώριο τελειώνει πριν έρθουν αποτελέσματα", mitigation: "Όρισε το ελάχιστο μηνιαίο ποσό σου και μια σταθερή ημερομηνία επανεκτίμησης.", on: ["a1"] },
      { text: "Το βήμα αποδεικνύεται λιγότερο αναστρέψιμο απ' ό,τι φαινόταν", mitigation: "Κράτα μία γέφυρα ανοιχτή: μια σύσταση, μια επιλογή μερικής απασχόλησης ή ένα κατώτατο όριο αποταμιεύσεων.", on: ["a3"] },
    ],
    fit: {
      growth: { level: "strong", why: "Η πιο απότομη καμπύλη μάθησης από κάθε επιλογή", sensitive: ["a2", "mixed"] },
      freedom: { level: "strong", why: "Διαλέγεις μόνος/η σου τη νέα κατεύθυνση", sensitive: ["a1", "mixed"] },
      money: { level: "weak", why: "Το εισόδημα γίνεται αβέβαιο για ένα διάστημα", sensitive: ["a1", "weak"] },
      stability: { level: "weak", why: "Τα περισσότερα αλλάζουν ταυτόχρονα" },
      meaning: { level: "mixed", why: "Ισχυρό αν αυτό θέλεις πραγματικά· ρώτα τον εαυτό σου ειλικρινά" },
      health: { level: "unclear", why: "Ανακούφιση ή πίεση· εξαρτάται από το πώς διαχειρίζεσαι την αβεβαιότητα" },
      relationships: { level: "unclear", why: "Επηρεάζει τους γύρω σου· η γνώμη τους μετράει εδώ" },
    },
    experiments: [
      { title: "Υπολόγισε το πραγματικό σου περιθώριο", how: "Σταθερά μηνιαία έξοδα ÷ χρήματα που μπορείς πραγματικά να χρησιμοποιήσεις = μήνες. Γράψε τον αριθμό.", cost: "hours", reduces: ["a1"] },
      { title: "Πάρε ένα δεσμευτικό «ναι» πριν αλλάξεις", how: "Έναν πελάτη, μια προσφορά, μια αποδοχή: κάτι πραγματικό από την άλλη πλευρά.", cost: "weeks", reduces: ["a2"] },
      { title: "Ρώτα δύο ανθρώπους που έκαναν αυτό το βήμα τι θα έκαναν αλλιώς", how: "Βρες έναν για τον οποίο πέτυχε και έναν για τον οποίο δεν πέτυχε.", cost: "days", reduces: ["a3"] },
    ],
  },
  learn: {
    summary: `Επένδυσε χρόνο στο «${alt}» για να ανοίξεις επιλογές που δεν έχεις ακόμη.`,
    assumptions: [
      { key: "a1", text: "Η δεξιότητα ή ο τίτλος εκτιμάται εκεί που θέλεις να πας", initial: "unknown" },
      { key: "a2", text: "Μπορείς να διατηρήσεις την προσπάθεια σε όλο το πρόγραμμα", initial: "unknown" },
    ],
    outcomes: [
      { text: learn0, kind: "fact", on: [], broken: learn0 },
      { text: `Σε ${s1}, οι δεξιότητές σου έχουν βελτιωθεί μετρήσιμα και έχουν ανοίξει συγκεκριμένες νέες επιλογές.`, kind: "assumed", on: ["a2"], broken: `Σε ${s1}, η προσπάθεια έχει σβήσει στη μέση, αφήνοντας χαμένο κόστος.` },
      { text: `Σε ${s2}, η δεξιότητα αποδίδει, αν η αγορά την εκτιμά ακόμη τότε.`, kind: "speculative", on: ["a1"], broken: `Σε ${s2}, είναι καλή δεξιότητα στο λάθος μέρος· χρειάζεται να επανατοποθετηθείς.` },
    ],
    benefits: ["Χτίζει κάτι που κανείς δεν μπορεί να σου πάρει", "Ανοίγει επιλογές αντί να τις κλείνει"],
    drawbacks: ["Αποδίδει αργά", "Κοστίζει χρόνο που θα μπορούσες να κερδίζεις χρήματα ή να ξεκουράζεσαι"],
    risks: [{ text: "Να τελειώσεις ένα πρόγραμμα που η αγορά δεν ανταμείβει πια", mitigation: "Έλεγξε πραγματικές αγγελίες ή ευκαιρίες πριν εγγραφείς, και ξανά στη μέση.", on: ["a1"] }],
    fit: {
      growth: { level: "strong", why: "Χτίζει άμεσα ικανότητες" },
      money: { level: "mixed", why: "Κοστίζει τώρα, μπορεί να αποδώσει αργότερα", sensitive: ["a1", "weak"] },
      meaning: { level: "mixed", why: "Εξαρτάται από το αν σε ευχαριστεί το ίδιο το αντικείμενο" },
      freedom: { level: "mixed", why: "Λιγότερος ελεύθερος χρόνος τώρα, περισσότερες επιλογές αργότερα" },
      stability: { level: "mixed", why: "Η βάση σου μένει κυρίως ίδια· το πρόγραμμά σου όχι" },
      health: { level: "mixed", why: "Διαρκής προσπάθεια· πρόσεχε την ενέργειά σου", sensitive: ["a2", "weak"] },
      relationships: { level: "unclear", why: "Ο χρόνος για μελέτη βγαίνει από κάπου" },
    },
    experiments: [
      { title: "Έλεγξε 10 πραγματικές ευκαιρίες για αυτή τη δεξιότητα", how: "Αγγελίες, περιγραφές έργων ή προγράμματα που θα ήθελες. Μέτρα πόσα τη ζητούν πραγματικά.", cost: "hours", reduces: ["a1"] },
      { title: "Κάνε πρώτα μια σύντομη ή δωρεάν ενότητα", how: "Μία εβδομάδα με το πραγματικό υλικό στον πραγματικό ρυθμό πριν πληρώσεις τα υπόλοιπα.", cost: "days", reduces: ["a2"] },
    ],
  },
  invest: {
    summary: `Δέσμευσε πόρους στο «${alt}» για μια πιο μακροπρόθεσμη απόδοση.`,
    assumptions: [
      { key: "a1", text: "Μπορείς να το αντέξεις χωρίς να ρισκάρεις τα απαραίτητα", initial: "unknown" },
      { key: "a2", text: "Η αξία του διατηρείται ή αυξάνεται στον χρονικό σου ορίζοντα", initial: "unknown" },
    ],
    outcomes: [
      { text: `Μέσα σε ${s0}, το «${alt}» έχει πληρωθεί: συγκεκριμένο, αλλά δεσμευμένο.`, kind: "assumed", on: ["a1"], broken: "Το κόστος στριμώχνει τα απαραίτητα και προσθέτει άγχος." },
      { text: `Σε ${s1}, έχει αρχίσει να αποδίδει αξία: πρακτική, οικονομική ή προσωπική.`, kind: "assumed", on: ["a2"], broken: `Σε ${s1}, η απόδοση είναι πιο αργή ή μικρότερη απ' ό,τι περίμενες.` },
      { text: `Σε ${s2}, η αξία του εξαρτάται από συνθήκες που δεν ελέγχεις.`, kind: "speculative", on: ["a2"], broken: `Σε ${s2}, οι συνθήκες έχουν στραφεί εναντίον σου· η έξοδος έχει κόστος.` },
    ],
    benefits: ["Χτίζει μια μακροπρόθεσμη βάση", "Συγκεκριμένο, όχι υποθετικό"],
    drawbacks: ["Δεσμεύει πόρους", "Η έξοδος μπορεί να είναι αργή ή δαπανηρή"],
    risks: [{ text: "Το χειρότερο ρεαλιστικό σενάριο είναι χειρότερο απ' όσο μπορείς να αντέξεις", mitigation: "Γράψ' το και έλεγξε ότι θα μπορούσες να ζήσεις μ' αυτό πριν δεσμευτείς.", on: ["a1"] }],
    fit: {
      money: { level: "unclear", why: "Μπορεί να βοηθήσει ή να βλάψει· εξαρτάται από την τιμή και τον χρόνο", sensitive: ["a1", "weak"] },
      stability: { level: "mixed", why: "Πιο σταθερό αργότερα, πιο εκτεθειμένο τώρα" },
      freedom: { level: "mixed", why: "Δέσμευση τώρα, επιλογές αργότερα" },
      growth: { level: "mixed", why: "Εξαρτάται από το τι ξεκλειδώνει η επένδυση" },
      meaning: { level: "unclear", why: "Ρώτα σε τι χρησιμεύει, όχι μόνο πόσο αξίζει" },
      health: { level: "unclear", why: "Το οικονομικό άγχος επηρεάζει την ενέργεια" },
      relationships: { level: "unclear", why: "Κοινά χρήματα σημαίνει κοινή απόφαση" },
    },
    experiments: [
      { title: "Γράψε το χειρότερο ρεαλιστικό σενάριο", how: "Όχι την καταστροφή, το ρεαλιστικό κακό σενάριο. Θα μπορούσες να ζήσεις μ' αυτό για έναν χρόνο;", cost: "hours", reduces: ["a1"] },
      { title: "Πάρε μία ανεξάρτητη γνώμη", how: "Από κάποιον ειδικό που δεν έχει τίποτα να σου πουλήσει.", cost: "days", reduces: ["a2"] },
    ],
  },
  open: {
    summary: `«${alt}»: ένας δρόμος που οι κανόνες επίδειξης του MIRROR δεν αναγνωρίζουν, οπότε μένει ανοιχτός και συμπληρώνεις εσύ τα συγκεκριμένα.`,
    assumptions: [
      { key: "a1", text: "Η επιλογή είναι διαθέσιμη για σένα με τους όρους που περιμένεις", initial: "unknown" },
      { key: "a2", text: "Θα τη θέλεις ακόμη όταν περάσει ο πρώτος ενθουσιασμός", initial: "unknown" },
    ],
    outcomes: [
      { text: `Πρώτα βήματα: οι πρακτικές αλλαγές της επιλογής «${alt}».`, kind: "assumed", on: ["a1"], broken: "Η επιλογή δεν είναι πραγματικά διαθέσιμη όπως τη φανταζόσουν· οι όροι αλλάζουν." },
      { text: `Σε ${s1}, τα πρώτα αποτελέσματα δείχνουν αν ανταποκρίνεται στους λόγους που την επέλεξες.`, kind: "assumed", on: ["a2"], broken: `Σε ${s1}, η γοητεία έχει ξεθωριάσει καθώς μπήκε η ρουτίνα.` },
      { text: `Σε ${s2}, τα αποτελέσματα εξαρτώνται από πράγματα που ούτε εσύ ούτε το MIRROR βλέπετε ακόμη.`, kind: "speculative", on: ["a1", "a2"], broken: `Σε ${s2}, βρίσκεσαι κάπου που δεν στόχευες.` },
    ],
    benefits: ["Κάτι που επέλεξες εσύ να βάλεις στο τραπέζι", "Μπορεί να ταιριάζει στην κατάστασή σου καλύτερα από κάθε πρότυπο"],
    drawbacks: ["Ξέρουμε λιγότερα γι' αυτό, οπότε υπάρχουν περισσότερα να ελέγξεις"],
    risks: [{ text: "Να επιλέξεις με βάση τη γοητεία και όχι τα στοιχεία", mitigation: "Γράψε τι θα έκανε αυτή την επιλογή ξεκάθαρα σωστή και έλεγξε ένα από αυτά μέσα στην εβδομάδα.", on: ["a2"] }],
    fit: Object.fromEntries((["growth", "money", "stability", "freedom", "meaning", "health", "relationships"] as PriorityKey[]).map((k) => [k, { level: "unclear" as FitLevel, why: "Δεν υπάρχουν ακόμη αρκετές πληροφορίες" }])),
    experiments: [
      { title: "Όρισε τι σημαίνει «ξεκάθαρα σωστό» για αυτή την επιλογή", how: "Τρεις ενδείξεις που θα σε έκαναν σίγουρο/η, και έλεγξε μία μέσα στην εβδομάδα.", cost: "hours", reduces: ["a2"] },
      { title: "Μίλα με κάποιον που το επέλεξε", how: "Ρώτα τι θα ήθελε να ήξερε από την αρχή.", cost: "days", reduces: ["a1"] },
    ],
  },
  };
};

/* ---------------- demo analysis ---------------- */
export const DEFAULT_PRIORITIES: PriorityKey[] = ["money", "growth", "meaning"];

export function demoAnalysis(input: DecisionInput, now = new Date()): Analysis {
  const lang = input.lang ?? getLang();
  return withLang(lang, () => ({ ...demoAnalysisIn(input, now), lang }));
}

function demoAnalysisIn(input: DecisionInput, now: Date): Analysis {
  const domain = domainOf(input);
  const priorities = input.priorities.length ? input.priorities : DEFAULT_PRIORITIES;
  /* each constraint is used once, in the first category it fits */
  const pool = [...input.constraints];
  const take = (words: string[]) => { const i = pool.findIndex((c) => has(c.toLowerCase(), words)); return i < 0 ? undefined : pool.splice(i, 1)[0]; };
  const moneyC = take(MONEY), placeC = take(PLACE), timeC = take(TIME);
  const alts = input.alternatives.filter((a) => a.title.trim());

  const branches: Branch[] = alts.map((alt) => {
    const kind = archetypeOf(alt.title, alt.note);
    const t = (getLang() === "el" ? LIB_EL : LIB)(alt.title.trim(), HORIZON_SLOTS[input.horizon], PRIORITY_LABEL[priorities[0]!].toLowerCase())[kind];
    const pid = (k: string) => `${alt.id}-${k}`;
    const assumptions: Branch["assumptions"] = t.assumptions.map((a) => ({ id: pid(a.key), text: a.text, basis: "inferred", initial: a.initial }));

    /* the user's own constraints become stated assumptions the branch depends on */
    if (moneyC && (kind === "leap" || kind === "invest" || kind === "learn")) {
      assumptions.push({ id: pid("c-money"), text: L(`Your constraint still holds: ${moneyC}`, `Ο περιορισμός σου ισχύει ακόμη: ${moneyC}`), basis: "stated", initial: "holds" });
    }
    if (timeC && (kind === "trial" || kind === "learn" || kind === "leap")) {
      assumptions.push({ id: pid("c-time"), text: L(`Your constraint still holds: ${timeC}`, `Ο περιορισμός σου ισχύει ακόμη: ${timeC}`), basis: "stated", initial: "holds" });
    }
    if (placeC && kind !== "hold") {
      assumptions.push({ id: pid("c-place"), text: L(`This option respects your constraint: ${placeC}`, `Η επιλογή σέβεται τον περιορισμό σου: ${placeC}`), basis: "stated", initial: "unknown" });
    }

    /* what the user noted about this option is a stated assumption: it is what makes two similar options differ */
    const note = alt.note.trim();
    if (note) assumptions.unshift({ id: pid("note"), text: L(`As you noted: ${note}`, `Όπως σημείωσες: ${note}`), basis: "stated", initial: "holds" });

    const outcomes: Outcome[] = t.outcomes.map((o, i) => ({ slot: i, text: o.text, kind: o.kind, dependsOn: o.on.map(pid), ifBroken: o.broken }));
    if (note) {
      const o0 = outcomes[0]!;
      o0.dependsOn = [pid("note"), ...o0.dependsOn];
      if (o0.kind === "fact") o0.kind = "assumed";
      o0.ifBroken = L(`What you noted doesn't hold ("${note}"), so "${alt.title.trim()}" starts on worse terms than planned.`, `Αυτό που σημείωσες δεν ισχύει («${note}»), οπότε το «${alt.title.trim()}» ξεκινά με χειρότερους όρους απ' ό,τι σχεδίαζες.`);
    }
    if (moneyC && kind === "leap") {
      const o = outcomes[1]!;
      o.dependsOn = [...o.dependsOn, pid("c-money")];
    }

    const stated: Point[] = alt.note.trim() ? [{ text: L(`Your note: ${alt.note.trim()}`, `Η σημείωσή σου: ${alt.note.trim()}`), source: "stated", dependsOn: [] }] : [];
    const benefits: Point[] = [...stated, ...t.benefits.map((b) => ({ text: b, source: "inference" as Provenance, dependsOn: [] }))];
    const drawbacks: Point[] = t.drawbacks.map((b) => ({ text: b, source: "inference" as Provenance, dependsOn: [] }));
    const risks = t.risks.map((r) => ({ text: r.text, mitigation: r.mitigation, dependsOn: r.on.map(pid) }));

    const fit: Fit[] = priorities.map((p) => {
      const f = t.fit[p] ?? { level: "unclear" as FitLevel, why: L("Not enough information yet", "Δεν υπάρχουν ακόμη αρκετές πληροφορίες") };
      const reasons: Fit["reasons"] = [{ text: f.why, source: "inference" }];
      let level = f.level;
      const sensitive: Fit["sensitive"] = [];
      if (f.sensitive) {
        const a = assumptions.find((x) => x.id === pid(f.sensitive![0]));
        if (a) { reasons.push({ text: L(`Depends on: ${a.text.toLowerCase()}`, `Εξαρτάται από: ${a.text.toLowerCase()}`), source: "assumption" }); sensitive.push({ assumptionId: a.id, level: f.sensitive[1] }); }
      }
      if (p === "money" && moneyC) {
        reasons.push({ text: L(`You said: "${moneyC}"`, `Είπες: «${moneyC}»`), source: "stated" });
        if (kind === "leap" && level === "weak") level = "mixed";
        const c = assumptions.find((x) => x.id === pid("c-money"));
        if (c) sensitive.push({ assumptionId: c.id, level: "weak" });
      }
      if (p === "freedom" && placeC && kind !== "hold") {
        const c = assumptions.find((x) => x.id === pid("c-place"));
        if (c) { reasons.push({ text: L(`Has to respect: "${placeC}"`, `Πρέπει να σέβεται: «${placeC}»`), source: "stated" }); sensitive.push({ assumptionId: c.id, level: "weak" }); }
      }
      return { priority: p, level, reasons: reasons.slice(0, 5), sensitive: sensitive.slice(0, 4) };
    });

    const experiments: Experiment[] = t.experiments.map((x, i) => ({ id: pid(`x${i + 1}`), title: x.title, how: x.how, cost: x.cost, reduces: x.reduces.map(pid) }));
    if (input.unknowns[0] && (kind === "leap" || kind === "trial" || kind === "learn" || kind === "invest")) {
      experiments.push({ id: pid("xu"), title: L(`Find out: ${input.unknowns[0]}`, `Μάθε: ${input.unknowns[0]}`), how: L("Ask one person who would know, or look for one primary source. Write down what you learn as an observation.", "Ρώτα κάποιον που ξέρει ή βρες μία πρωτογενή πηγή. Κατάγραψε ό,τι μάθεις ως παρατήρηση."), cost: "days", reduces: [assumptions[0]!.id] });
    }

    return { alternativeId: alt.id, summary: t.summary, assumptions: assumptions.slice(0, 8), outcomes, benefits: benefits.slice(0, 6), drawbacks, risks, fit, experiments: experiments.slice(0, 5) };
  });

  const missingInfo = [...input.unknowns];
  if (!input.constraints.length) missingInfo.push(L("Your hard limits (money, time, place). None were given, so MIRROR can't check options against them.", "Τα αυστηρά σου όρια (χρήματα, χρόνος, τόπος). Δεν δόθηκαν, οπότε το MIRROR δεν μπορεί να ελέγξει τις επιλογές απέναντί τους."));
  if (!moneyC && branches.some((b) => ["leap", "invest"].includes(archetypeOf(alts.find((a) => a.id === b.alternativeId)?.title ?? "")))) {
    missingInfo.push(L("How many months you could cover your costs if income dropped", "Για πόσους μήνες θα κάλυπτες τα έξοδά σου αν έπεφτε το εισόδημα"));
  }
  if (!input.priorities.length) missingInfo.push(L("What matters most to you. MIRROR is using Financial safety, Growth and Meaning as placeholders.", "Τι μετράει περισσότερο για σένα. Το MIRROR χρησιμοποιεί προσωρινά την Οικονομική ασφάλεια, την Εξέλιξη και το Νόημα."));

  const boundary = BOUNDARY()[domain];
  return {
    source: { kind: "demo", generatedAt: now.toISOString() },
    domain,
    ...(boundary ? { boundary } : {}),
    branches,
    missingInfo: missingInfo.slice(0, 8),
    notes: [
      L("Demonstration analysis: produced by transparent rules on this device, not by an AI model. It knows nothing about your field beyond what you typed, so treat every line as a prompt to check, not a finding.", "Ανάλυση επίδειξης: παράγεται από διαφανείς κανόνες σε αυτή τη συσκευή, όχι από μοντέλο AI. Δεν ξέρει τίποτα για τον τομέα σου πέρα από όσα έγραψες, οπότε κάθε γραμμή είναι κάτι να ελέγξεις, όχι συμπέρασμα."),
    ],
  };
}

/* ---------------- applying the user's judgement ---------------- */
export type EffectiveKind = Outcome["kind"] | "broken";
export const RANK: Record<FitLevel, number> = { strong: 3, mixed: 2, unclear: 1.5, weak: 1 };

export interface OutcomeView extends Outcome { effective: EffectiveKind; shown: string; because?: string }
export interface FitView extends Fit { effective: FitLevel; changedBy?: string }
export interface AssumptionView { id: string; text: string; basis: "stated" | "inferred"; status: AssumptionStatus; changed: boolean; usedBy: number }
export interface BranchView {
  branch: Branch;
  title: string;
  index: number;
  archetype: Archetype;
  assumptions: AssumptionView[];
  outcomes: OutcomeView[];
  fit: FitView[];
  risks: (Branch["risks"][number] & { active: boolean })[];
  experiments: (Experiment & { state: ExperimentState })[];
  open: number; /* assumptions still unknown/doubtful */
  broken: number;
}

export function statusOf(d: Decision, a: { id: string; initial: AssumptionStatus }): AssumptionStatus {
  return d.assumptionState[a.id] ?? a.initial;
}

export function deriveView(d: Decision): BranchView[] {
  const an = d.analysis;
  if (!an) return [];
  return an.branches.flatMap((b, index) => {
    const alt = d.alternatives.find((a) => a.id === b.alternativeId);
    if (!alt) return [];
    const st = new Map(b.assumptions.map((a) => [a.id, statusOf(d, a)] as const));
    const textOf = (aid: string) => b.assumptions.find((a) => a.id === aid)?.text ?? L("an assumption", "μια υπόθεση");

    const outcomes: OutcomeView[] = b.outcomes.map((o) => {
      const deps = o.dependsOn.map((x) => [x, st.get(x)] as const);
      const broken = deps.find(([, s]) => s === "false");
      if (broken) return { ...o, effective: "broken", shown: o.ifBroken, because: L(`You marked "${textOf(broken[0])}" as not true.`, `Σημείωσες ότι το «${textOf(broken[0])}» δεν ισχύει.`) };
      const shaky = deps.find(([, s]) => s === "doubtful");
      if (shaky && o.kind !== "speculative") return { ...o, effective: "speculative", shown: o.text, because: L(`Rests on "${textOf(shaky[0])}", which you doubt.`, `Στηρίζεται στο «${textOf(shaky[0])}», για το οποίο έχεις αμφιβολίες.`) };
      const allHold = deps.length > 0 && deps.every(([, s]) => s === "holds");
      if (allHold && o.kind === "assumed") return { ...o, effective: "assumed", shown: o.text, because: L("Every assumption under this has been confirmed by you.", "Έχεις επιβεβαιώσει κάθε υπόθεση πίσω από αυτό.") };
      return { ...o, effective: o.kind, shown: o.text };
    });

    const fit: FitView[] = b.fit.map((f) => {
      for (const s of f.sensitive) {
        const status = st.get(s.assumptionId);
        if (status === "false") return { ...f, effective: s.level, changedBy: L(`Changed because you marked "${textOf(s.assumptionId)}" as not true.`, `Άλλαξε επειδή σημείωσες ότι το «${textOf(s.assumptionId)}» δεν ισχύει.`) };
        if (status === "doubtful" && s.level !== f.level) return { ...f, effective: "unclear", changedBy: L(`Less certain because you doubt "${textOf(s.assumptionId)}".`, `Λιγότερο σίγουρο, επειδή αμφιβάλλεις για το «${textOf(s.assumptionId)}».`) };
      }
      return { ...f, effective: f.level };
    });

    const usage = (aid: string) =>
      b.outcomes.filter((o) => o.dependsOn.includes(aid)).length + b.fit.filter((f) => f.sensitive.some((s) => s.assumptionId === aid)).length + b.risks.filter((r) => r.dependsOn.includes(aid)).length;

    const assumptions: AssumptionView[] = b.assumptions.map((a) => {
      const s = st.get(a.id)!;
      return { id: a.id, text: a.text, basis: a.basis, status: s, changed: s !== a.initial, usedBy: usage(a.id) };
    });

    return [{
      branch: b,
      title: alt.title,
      index,
      archetype: archetypeOf(alt.title, alt.note),
      assumptions,
      outcomes,
      fit,
      risks: b.risks.map((r) => ({ ...r, active: !r.dependsOn.length || r.dependsOn.some((x) => st.get(x) !== "holds") })),
      experiments: b.experiments.map((x) => ({ ...x, state: d.experimentState[x.id] ?? { status: "idea" } })),
      open: assumptions.filter((a) => a.status === "unknown" || a.status === "doubtful").length,
      broken: outcomes.filter((o) => o.effective === "broken").length,
    }];
  });
}

/* ---------------- comparison ---------------- */
export interface TradeOff { a: string; b: string; gains: PriorityKey[]; costs: PriorityKey[]; unclear: PriorityKey[] }
export function tradeOffs(views: BranchView[]): TradeOff[] {
  const out: TradeOff[] = [];
  for (let i = 0; i < views.length; i++) for (let j = i + 1; j < views.length; j++) {
    const A = views[i]!, B = views[j]!;
    const gains: PriorityKey[] = [], costs: PriorityKey[] = [], unclear: PriorityKey[] = [];
    for (const f of A.fit) {
      const g = B.fit.find((x) => x.priority === f.priority);
      if (!g) continue;
      if (f.effective === "unclear" || g.effective === "unclear") { unclear.push(f.priority); continue; }
      if (RANK[f.effective] > RANK[g.effective]) gains.push(f.priority);
      if (RANK[f.effective] < RANK[g.effective]) costs.push(f.priority);
    }
    out.push({ a: A.title, b: B.title, gains, costs, unclear });
  }
  return out;
}

export function describeTradeOff(t: TradeOff): string {
  const el = getLang() === "el";
  const and = el ? " και " : " and ";
  const join = (ks: PriorityKey[]) => ks.map((k) => PRIORITY_LABEL[k].toLowerCase()).join(and);
  const q = (x: string) => (el ? `«${x}»` : `"${x}"`);
  /* never claim more than was compared: priorities that are unclear for either side are named, not skipped silently */
  const scope = t.unclear.length ? L("on the priorities that can be compared", "στις προτεραιότητες που μπορούν να συγκριθούν") : L("on every priority you set", "σε κάθε προτεραιότητα που όρισες");
  const more = t.unclear.length > 1 ? L(` and ${t.unclear.length - 1} more`, ` και ${t.unclear.length - 1} ακόμη`) : "";
  const tail = t.unclear.length ? ` ${PRIORITY_LABEL[t.unclear[0]!]}${more}${L(" can't be compared yet: it's unclear for at least one of them.", ": δεν μπορεί να συγκριθεί ακόμη, γιατί είναι ασαφές για τουλάχιστον μία από τις δύο.")}` : "";
  if (!t.gains.length && !t.costs.length) return (t.unclear.length
    ? L(`${q(t.a)} and ${q(t.b)} can't be told apart yet.`, `Το ${q(t.a)} και το ${q(t.b)} δεν ξεχωρίζουν ακόμη.`)
    : L(`${q(t.a)} and ${q(t.b)} look similar on what you care about. The difference is in the assumptions, not the priorities.`, `Το ${q(t.a)} και το ${q(t.b)} μοιάζουν σε ό,τι σε νοιάζει. Η διαφορά βρίσκεται στις υποθέσεις, όχι στις προτεραιότητες.`)) + tail;
  const better = (x: string, y: string) => L(`${q(x)} looks at least as good as ${q(y)} ${scope}. Check that its assumptions really hold.`, `Το ${q(x)} φαίνεται τουλάχιστον εξίσου καλό με το ${q(y)} ${scope}. Έλεγξε ότι οι υποθέσεις του ισχύουν πραγματικά.`) + tail;
  if (!t.costs.length) return better(t.a, t.b);
  if (!t.gains.length) return better(t.b, t.a);
  return L(`Choosing ${q(t.a)} over ${q(t.b)} trades ${join(t.costs)} for ${join(t.gains)}.`, `Αν διαλέξεις το ${q(t.a)} αντί για το ${q(t.b)}, δίνεις ${join(t.costs)} για να κερδίσεις ${join(t.gains)}.`) + tail;
}

/* ---------------- the most useful next step ---------------- */
export interface NextStep { view: BranchView; experiment: BranchView["experiments"][number]; assumption: AssumptionView; why: string }
const COST: Record<Experiment["cost"], number> = { hours: 1, days: 2, weeks: 3 };

/* The assumption that the most outcomes and fits depend on, still unconfirmed, tested by the cheapest experiment.
   This is a suggestion about what to learn next, never a recommendation about what to choose. */
export function nextStep(views: BranchView[]): NextStep | null {
  let best: NextStep | null = null, bestScore = -Infinity;
  for (const v of views) for (const a of v.assumptions) {
    if (a.status === "holds" || a.status === "false") continue;
    const xs = v.experiments.filter((x) => x.reduces.includes(a.id) && x.state.status !== "done");
    for (const x of xs) {
      const score = a.usedBy * 2 + (a.status === "doubtful" ? 1 : 0) - COST[x.cost];
      if (score > bestScore) {
        bestScore = score;
        best = { view: v, experiment: x, assumption: a, why: L(`"${v.title}" leans on this in ${a.usedBy} place${a.usedBy === 1 ? "" : "s"}, and you haven't confirmed it yet. This is the cheapest way to find out.`, `Το «${v.title}» στηρίζεται σε αυτό σε ${a.usedBy} ${a.usedBy === 1 ? "σημείο" : "σημεία"} και δεν το έχεις επιβεβαιώσει ακόμη. Αυτός είναι ο φθηνότερος τρόπος να το μάθεις.`) };
      }
    }
  }
  return best;
}

export function slotLabels(d: Pick<Decision, "horizon">) { return HORIZON_SLOTS[d.horizon]; }

/* suggestions while the user types their decision: clearly labelled, always editable */
export function suggestAlternatives(title: string): string[] {
  const raw = title.replace(/[?;.!]+$/, "").trim();
  const s = fold(raw);
  /* match case-insensitively but keep the user's own capitalisation (place names, people) */
  const en = raw.match(/^should i (.+?)(?: or (.+))?$/i);
  const m = en ?? raw.match(/^(?:να|πρέπει να|θα έπρεπε να) (.+?)(?: ή (?:να )?(.+))?$/iu);
  /* Greek options read as "Να …" ("To move …"), the way the question was asked */
  const cap = en || !m ? (x: string) => x.charAt(0).toUpperCase() + x.slice(1) : (x: string) => `Να ${x}`;
  if (m) {
    const first = m[1]!.trim();
    if (m[2]) return [cap(first), cap(m[2].trim())];
    return [cap(first), L("Keep things as they are for now", "Να μείνουν τα πράγματα ως έχουν προς το παρόν"), L(`Test a small version of "${first}" first`, `Δοκίμασε πρώτα σε μικρή κλίμακα: «${cap(first)}»`)];
  }
  if (s.length <= 3) return [];
  /* topic-aware fallbacks (idea adopted from the Lovable prototype) */
  const topic: [RegExp, [string, string], [string, string]][] = [
    [/(career|job|role|quit|profession|industry|καριερ|δουλει|εργασι|θεση|παραιτ|επαγγελ)/, ["Make the career change", "Stay and grow in my current role"], ["Να αλλάξω καριέρα", "Να μείνω και να εξελιχθώ στη θέση μου"]],
    [/(move|moving|relocat|country|abroad|city|emigrat|μετακομ|εξωτερικ|χωρα|πολη|μεταναστ)/, ["Move", "Stay where I am"], ["Να μετακομίσω", "Να μείνω εκεί που είμαι"]],
    [/(business|startup|start-up|company|founder|freelanc|side project|επιχειρη|εταιρ|ελευθερ)/, ["Start the business", "Keep my current path"], ["Να ξεκινήσω την επιχείρηση", "Να συνεχίσω τον τωρινό μου δρόμο"]],
    [/(study|degree|master|school|course|phd|σπουδ|πτυχι|μεταπτυχ|σχολ|διδακτορ)/, ["Go back to study", "Keep working"], ["Να ξαναρχίσω σπουδές", "Να συνεχίσω να δουλεύω"]],
  ];
  const hit = topic.find(([re]) => re.test(s));
  const [a, b] = hit ? (getLang() === "el" ? hit[2] : hit[1]) : [L("Make the change", "Να κάνω την αλλαγή"), L("Keep things as they are for now", "Να μείνουν τα πράγματα ως έχουν προς το παρόν")];
  return [a, b, L("Test a small version first", "Δοκίμασε πρώτα μια μικρή εκδοχή")];
}
