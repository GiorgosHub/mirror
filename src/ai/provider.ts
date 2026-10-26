/* Analysis providers. The UI only ever talks to this module.
   - "demo": rule-based engine in the browser. Always available, always labelled as not-AI.
   - "server": POSTs the user's inputs to /api/analyze, where a configured model is called with a server-side secret.
     The response is validated against the same schema as everything else and checked against the decision's own
     alternatives before it is accepted. A failed or invalid response never touches saved work. */
import { demoAnalysis } from "../domain/engine.ts";
import { type Analysis, Analysis as AnalysisSchema, type DecisionInput } from "../domain/types.ts";

export interface Provider { id: "demo" | "server"; analyze(input: DecisionInput, signal?: AbortSignal): Promise<Analysis> }

export const demoProvider: Provider = { id: "demo", analyze: async (input) => demoAnalysis(input) };

export class AnalysisError extends Error {
  constructor(message: string, readonly kind: "unavailable" | "timeout" | "invalid" | "failed") { super(message); }
}

export function checkAgainstInput(a: Analysis, input: DecisionInput): Analysis {
  const ids = new Set(input.alternatives.map((x) => x.id));
  const branches = a.branches.filter((b) => ids.has(b.alternativeId));
  if (branches.length < Math.min(2, ids.size)) throw new AnalysisError("The analysis didn't cover your alternatives.", "invalid");
  for (const b of branches) {
    const own = new Set(b.assumptions.map((x) => x.id));
    /* dependencies may only point at this branch's own assumptions */
    for (const o of b.outcomes) o.dependsOn = o.dependsOn.filter((x) => own.has(x));
    for (const f of b.fit) f.sensitive = f.sensitive.filter((s) => own.has(s.assumptionId));
    for (const r of b.risks) r.dependsOn = r.dependsOn.filter((x) => own.has(x));
    for (const x of b.experiments) x.reduces = x.reduces.filter((y) => own.has(y));
  }
  return { ...a, branches };
}

export const serverProvider: Provider = {
  id: "server",
  async analyze(input, signal) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 60_000);
    signal?.addEventListener("abort", () => ctl.abort());
    let res: Response;
    try {
      res = await fetch("/api/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ input }), signal: ctl.signal });
    } catch {
      throw new AnalysisError(ctl.signal.aborted ? "The analysis took too long and was stopped." : "Couldn't reach the analysis service.", ctl.signal.aborted ? "timeout" : "unavailable");
    } finally { clearTimeout(timer); }
    if (res.status === 501) throw new AnalysisError("No AI provider is configured on this server.", "unavailable");
    if (!res.ok) throw new AnalysisError(`The analysis service returned an error (${res.status}).`, "failed");
    const parsed = AnalysisSchema.safeParse(await res.json().catch(() => null));
    if (!parsed.success) throw new AnalysisError("The AI response didn't match MIRROR's structure, so it was discarded.", "invalid");
    return checkAgainstInput(parsed.data, input);
  },
};

export interface ServerStatus { reachable: boolean; ai: boolean; model?: string }
export async function serverStatus(): Promise<ServerStatus> {
  try {
    const r = await fetch("/api/health", { cache: "no-store" });
    if (!r.ok) return { reachable: false, ai: false };
    const j = (await r.json()) as { ai?: boolean; model?: string };
    return { reachable: true, ai: !!j.ai, ...(j.model ? { model: j.model } : {}) };
  } catch { return { reachable: false, ai: false }; }
}
