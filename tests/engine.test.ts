import assert from "node:assert/strict";
import { test } from "node:test";
import { checkAgainstInput } from "../src/ai/provider.ts";
import { briefMarkdown, buildBrief } from "../src/domain/brief.ts";
import { archetypeOf, deriveView, describeTradeOff, demoAnalysis, domainOf, nextStep, suggestAlternatives, tradeOffs } from "../src/domain/engine.ts";
import { Analysis, Decision, type DecisionInput } from "../src/domain/types.ts";

const input: DecisionInput = {
  title: "Should I leave my job to study design full-time?",
  context: "Four years in accounting.",
  constraints: ["Savings for about 6 months", "Can't move cities before next summer"],
  alternatives: [
    { id: "a1", title: "Stay and study design at night", note: "" },
    { id: "a2", title: "Quit and study full-time", note: "A one-year programme starts in September" },
    { id: "a3", title: "Take a 3-month sabbatical to test it", note: "" },
  ],
  horizon: "3y",
  priorities: ["money", "growth", "meaning"],
  unknowns: ["Whether studios hire career-changers"],
};
const decision = (over: Partial<Decision> = {}) => Decision.parse({ id: "d1", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...input, status: "exploring", analysis: demoAnalysis(input), ...over });

test("options are read by weighted signals, not first match", () => {
  assert.equal(archetypeOf("Quit and study full-time"), "leap");
  assert.equal(archetypeOf("Take a 3-month sabbatical to test it"), "trial");
  assert.equal(archetypeOf("Stay in Athens and renew the lease"), "hold");
  assert.equal(archetypeOf("Enrol in a design bootcamp"), "learn");
  assert.equal(archetypeOf("Buy the flat"), "invest");
  assert.equal(archetypeOf("Something else entirely"), "open");
});

test("demo analysis is valid, complete and has no invented probabilities", () => {
  const a = demoAnalysis(input);
  assert.ok(Analysis.safeParse(a).success);
  assert.equal(a.source.kind, "demo");
  assert.deepEqual(a.branches.map((b) => b.alternativeId), ["a1", "a2", "a3"]);
  const all = JSON.stringify(a);
  assert.doesNotMatch(all, /\d+\s?%|probabilit|chance of|likelihood of \d/i);
  for (const b of a.branches) {
    assert.equal(b.outcomes.length, 3);
    assert.equal(b.fit.length, 3);
    const own = new Set(b.assumptions.map((x) => x.id));
    for (const o of b.outcomes) for (const dep of o.dependsOn) assert.ok(own.has(dep), `dangling ${dep}`);
    for (const f of b.fit) for (const s of f.sensitive) assert.ok(own.has(s.assumptionId));
  }
  assert.ok(a.notes[0]!.includes("not by an AI model"));
});

test("futures use the user's own words and time frames; similar options don't read identically", () => {
  const a = demoAnalysis(input);
  const texts = a.branches.map((b) => b.outcomes.map((o) => o.text).join("|"));
  assert.equal(new Set(texts).size, texts.length);
  assert.match(a.branches[1]!.outcomes[0]!.text, /Quit and study full-time/);
  assert.match(texts.join(" "), /3 months|1 year|3 years/);
  assert.ok(a.branches[1]!.assumptions.some((x) => x.basis === "stated" && x.text.includes("September")));
});

test("each constraint becomes at most one stated assumption per option", () => {
  const a = demoAnalysis(input);
  for (const b of a.branches) {
    const stated = b.assumptions.filter((x) => x.basis === "stated" && !x.id.endsWith("-note")).map((x) => x.text);
    for (const c of input.constraints) assert.ok(stated.filter((t) => t.includes(c)).length <= 1);
  }
});

test("judging an assumption false breaks the futures and fits that depend on it", () => {
  const d = decision();
  const leap = deriveView(d).find((v) => v.branch.alternativeId === "a2")!;
  const runway = leap.assumptions.find((x) => x.text.includes("financial runway"))!;
  const before = leap.outcomes.map((o) => o.effective);
  const after = deriveView(decision({ assumptionState: { [runway.id]: "false" } })).find((v) => v.branch.alternativeId === "a2")!;
  const broken = after.outcomes.filter((o) => o.effective === "broken");
  assert.equal(broken.length, 1);
  assert.notDeepEqual(after.outcomes.map((o) => o.effective), before);
  assert.match(broken[0]!.because!, /not true/);
  assert.notEqual(broken[0]!.shown, broken[0]!.text);
  /* the rest of the decision is untouched */
  assert.deepEqual(deriveView(decision()).find((v) => v.branch.alternativeId === "a1")!.outcomes.map((o) => o.effective),
    deriveView(decision({ assumptionState: { [runway.id]: "false" } })).find((v) => v.branch.alternativeId === "a1")!.outcomes.map((o) => o.effective));
});

test("doubt makes assumed futures speculative and explains why", () => {
  const d = decision();
  const v = deriveView(d)[2]!;
  const a = v.assumptions[0]!;
  const after = deriveView(decision({ assumptionState: { [a.id]: "doubtful" } }))[2]!;
  const changed = after.outcomes.find((o) => o.dependsOn.includes(a.id) && o.kind === "assumed");
  assert.equal(changed?.effective, "speculative");
  assert.match(changed!.because!, /doubt/);
});

test("trade-offs and the next step come from the current state", () => {
  const views = deriveView(decision());
  const t = tradeOffs(views);
  assert.equal(t.length, 3);
  /* an unclear priority is never silently counted as "at least as good" */
  for (const x of t) if (x.unclear.length) assert.doesNotMatch(describeTradeOff(x), /every priority you set/);
  const step = nextStep(views)!;
  assert.ok(step);
  assert.notEqual(step.assumption.status, "holds");
  assert.ok(step.experiment.reduces.includes(step.assumption.id));
  /* once every assumption is confirmed there is nothing left to test */
  const all = Object.fromEntries(views.flatMap((v) => v.assumptions.map((a) => [a.id, "holds" as const])));
  assert.equal(nextStep(deriveView(decision({ assumptionState: all }))), null);
});

test("high-stakes topics carry a boundary note", () => {
  assert.equal(domainOf({ title: "Should I have the surgery now or wait?", context: "" }), "health");
  const a = demoAnalysis({ ...input, title: "Should I have the surgery now or wait?", alternatives: [{ id: "x", title: "Have it now", note: "" }, { id: "y", title: "Wait six months", note: "" }] });
  assert.match(a.boundary ?? "", /clinician/);
});

test("suggestions are editable starting points", () => {
  assert.deepEqual(suggestAlternatives("Should I move to Berlin or stay in Rome?"), ["Move to Berlin", "Stay in Rome"]);
  assert.equal(suggestAlternatives("Should I change careers").length, 3);
  assert.deepEqual(suggestAlternatives("ok"), []);
});

test("AI responses are checked against the decision before they are accepted", () => {
  const a = demoAnalysis(input);
  const foreign = structuredClone(a);
  foreign.branches[0]!.outcomes[0]!.dependsOn = ["not-an-assumption"];
  const ok = checkAgainstInput(foreign, input);
  assert.deepEqual(ok.branches[0]!.outcomes[0]!.dependsOn, []);
  const wrong = structuredClone(a);
  for (const b of wrong.branches) b.alternativeId = "other";
  assert.throws(() => checkAgainstInput(wrong, input));
});

test("the brief states sources and never chooses for the user", () => {
  const b = buildBrief(decision());
  const md = briefMarkdown(b);
  assert.match(md, /Demonstration rules on this device \(not AI\)/);
  for (const s of ["## Alternatives", "## Trade-offs", "## Still uncertain", "## Missing information", "## Experiments", "## Next action"]) assert.ok(md.includes(s), s);
  assert.doesNotMatch(md, /you should choose|we recommend|best option is/i);
});

/* ---------- Greek ---------- */
const GREEK = /[Ͱ-Ͽ]/;
test("Greek analysis: every archetype and horizon produces a valid, fully Greek analysis", () => {
  const el: DecisionInput = {
    title: "Να αφήσω τη δουλειά μου για να σπουδάσω;", context: "", constraints: ["Αποταμιεύσεις για 6 μήνες", "Δεν μπορώ να μετακομίσω πριν το καλοκαίρι"],
    alternatives: [
      { id: "a1", title: "Να μείνω και να σπουδάζω τα βράδια", note: "" },
      { id: "a2", title: "Να παραιτηθώ και να ξεκινήσω", note: "" },
      { id: "a3", title: "Να κάνω μια δοκιμή τριών μηνών", note: "" },
      { id: "a4", title: "Να αγοράσω σπίτι", note: "" },
    ],
    horizon: "3y", priorities: ["money", "growth", "meaning"], unknowns: ["Αν προσλαμβάνουν χωρίς πτυχίο"], lang: "el",
  };
  for (const horizon of ["3m", "1y", "3y", "5y"] as const) {
    const an = Analysis.parse(demoAnalysis({ ...el, horizon }));
    assert.equal(an.lang, "el");
    for (const b of an.branches) {
      for (const t of [b.summary, ...b.outcomes.flatMap((o) => [o.text, o.ifBroken]), ...b.assumptions.map((a) => a.text), ...b.experiments.map((x) => x.title)]) assert.match(t, GREEK, t);
      assert.doesNotMatch(b.outcomes.map((o) => o.text).join(" "), /\b(In|By|At|Within)\b/);
    }
    assert.ok(an.notes.every((n) => GREEK.test(n)));
  }
  /* Greek wording is read for archetypes too */
  assert.equal(archetypeOf("Να κάνω μια δοκιμή τριών μηνών"), "trial");
  assert.equal(archetypeOf("Να παραιτηθώ"), "leap");
  assert.equal(archetypeOf("Να αγοράσω σπίτι"), "invest");
});

test("Greek analysis keeps English the default and never mixes languages", () => {
  const en = demoAnalysis(input);
  assert.equal(en.lang, "en");
  assert.doesNotMatch(JSON.stringify(en.branches), GREEK);
  assert.deepEqual(suggestAlternatives("Να μετακομίσω στη Λισαβόνα ή να μείνω στην Αθήνα;"), ["Να μετακομίσω στη Λισαβόνα", "Να μείνω στην Αθήνα"]);
});
