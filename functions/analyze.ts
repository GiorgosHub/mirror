/* POST /api/analyze  { input: DecisionInput } -> Analysis
   Runs on the server (Vercel function or the local dev server). Returns 501 when no AI key is configured,
   so the app can stay honest and fall back to its labelled demonstration mode. */
import { z } from "zod";
import { Alternative, Horizon, PriorityKey } from "../src/domain/types.ts";
import { analyzeWithModel, provider } from "./_lib/ai.ts";

export interface Req { method?: string; body?: unknown }
export interface Res { status(code: number): Res; json(body: unknown): void; setHeader(k: string, v: string): void }

const Input = z.object({
  title: z.string().trim().min(3).max(200),
  context: z.string().max(2000),
  constraints: z.array(z.string().max(160)).max(10),
  alternatives: z.array(Alternative).min(2).max(4),
  horizon: Horizon,
  priorities: z.array(PriorityKey).max(3),
  unknowns: z.array(z.string().max(200)).max(8),
  lang: z.enum(["en", "el"]).optional(),
});

export default async function handler(req: Req, res: Res) {
  res.setHeader("cache-control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const p = provider();
  if (!p) return res.status(501).json({ error: "No AI provider configured" });
  const body = typeof req.body === "string" ? safe(req.body) : req.body;
  const parsed = Input.safeParse((body as { input?: unknown } | null)?.input);
  if (!parsed.success) return res.status(400).json({ error: "Invalid decision input" });
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 55_000);
  try {
    const analysis = await analyzeWithModel(p, parsed.data, ctl.signal);
    return res.status(200).json(analysis);
  } catch (e) {
    return res.status(502).json({ error: ctl.signal.aborted ? "Model timed out" : "Model response could not be used", detail: String((e as Error).message).slice(0, 120) });
  } finally { clearTimeout(t); }
}

function safe(s: string): unknown { try { return JSON.parse(s); } catch { return null; } }
