/* Server-side AI providers. Secrets stay here; the browser never sees them.
   Swap providers by setting MIRROR_AI_PROVIDER; add a new one by implementing ModelProvider. */
import { Analysis, type DecisionInput, HORIZON_SLOTS, PRIORITY_LABEL } from "../../src/domain/types.ts";

export interface ModelProvider { name: string; model: string; complete(system: string, user: string, signal: AbortSignal): Promise<string> }

function anthropic(): ModelProvider | null {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const model = process.env.MIRROR_MODEL || "claude-sonnet-5-5";
  return {
    name: "anthropic",
    model,
    async complete(system, user, signal) {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal,
        headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model, max_tokens: 6000, system, messages: [{ role: "user", content: user }] }),
      });
      if (!r.ok) throw new Error(`provider ${r.status}`);
      const j = (await r.json()) as { content?: { type: string; text?: string }[] };
      return (j.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
    },
  };
}

const REGISTRY: Record<string, () => ModelProvider | null> = { anthropic };

export function provider(): ModelProvider | null {
  const want = process.env.MIRROR_AI_PROVIDER || "anthropic";
  return REGISTRY[want]?.() ?? null;
}

export const SYSTEM = `You are the analysis engine inside MIRROR, an app that helps a person explore a decision.
You do not predict the future and you never decide for the person. You map plausible consequences under explicit assumptions.
Rules:
- Return ONLY a JSON object, no prose, matching the schema given.
- Never use percentages, probabilities, scores or false precision.
- Separate what the person stated (source "stated") from assumptions ("assumption") and your own inferences ("inference").
- Every outcome must list the assumption ids it depends on, and an "ifBroken" text describing what happens if those assumptions are false.
- Outcome kind: "fact" only for direct consequences of the person's own statements; "assumed" when it rests on assumptions; "speculative" for long-range or weakly supported.
- Be specific to this person's situation and wording. Prefer small, reversible, cheap experiments.
- For medical, legal, financial or mental-health decisions, set "boundary" to a short note recommending qualified human advice.`;

export function userPrompt(input: DecisionInput): string {
  const slots = HORIZON_SLOTS[input.horizon];
  return `Decision: ${input.title}
Context: ${input.context || "(none)"}
Constraints: ${input.constraints.join("; ") || "(none)"}
Priorities in order: ${input.priorities.map((p) => `${p} (${PRIORITY_LABEL[p]})`).join(", ") || "(none given; use money, growth, meaning)"}
Unknowns the person named: ${input.unknowns.join("; ") || "(none)"}
Alternatives (use these exact ids):
${input.alternatives.map((a) => `- id "${a.id}": ${a.title}${a.note ? ` (note: ${a.note})` : ""}`).join("\n")}
Time slots for outcomes: slot 0 = ${slots[0]}, slot 1 = ${slots[1]}, slot 2 = ${slots[2]}.

JSON schema (TypeScript notation):
{ "source": {"kind":"ai","generatedAt": ISO string}, "domain": string, "boundary"?: string,
  "branches": [{ "alternativeId": string, "summary": string,
    "assumptions": [{"id": string unique, "text": string, "basis": "stated"|"inferred", "initial": "holds"|"unknown"|"doubtful"}] (2-6),
    "outcomes": [{"slot":0|1|2, "text": string, "kind":"fact"|"assumed"|"speculative", "dependsOn": assumption ids, "ifBroken": string}] (exactly 3, one per slot),
    "benefits": [{"text","source","dependsOn"}], "drawbacks": [{"text","source","dependsOn"}],
    "risks": [{"text","mitigation","dependsOn"}],
    "fit": [{"priority": one of the priority keys, "level":"strong"|"mixed"|"weak"|"unclear", "reasons":[{"text","source"}], "sensitive":[{"assumptionId","level"}]}] (one per priority),
    "experiments": [{"id": string unique, "title", "how", "cost":"hours"|"days"|"weeks", "reduces": assumption ids}] (1-4) }],
  "missingInfo": string[], "notes": string[] }
Keep every string under 220 characters.${input.lang === "el" ? "\nWrite every human-readable string (summary, assumptions, outcomes, benefits, drawbacks, risks, reasons, experiments, missingInfo, notes, boundary) in Greek (modern, natural, informal second person singular). Keep the JSON keys, ids and enum values in English." : ""}`;
}

export function extractJSON(text: string): unknown {
  const start = text.indexOf("{"), end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no json");
  return JSON.parse(text.slice(start, end + 1));
}

export async function analyzeWithModel(p: ModelProvider, input: DecisionInput, signal: AbortSignal) {
  const raw = await p.complete(SYSTEM, userPrompt(input), signal);
  const j = extractJSON(raw) as Record<string, unknown>;
  j.source = { kind: "ai", model: p.model, generatedAt: new Date().toISOString() };
  if (input.lang) j.lang = input.lang;
  return Analysis.parse(j);
}
