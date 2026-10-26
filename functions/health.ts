/* GET /api/health -> { ai: boolean, model?: string }. Never reveals keys. */
import { provider } from "./_lib/ai.ts";
import type { Req, Res } from "./analyze.ts";

export default function handler(_req: Req, res: Res) {
  res.setHeader("cache-control", "no-store");
  const p = provider();
  res.status(200).json(p ? { ai: true, model: p.model, provider: p.name } : { ai: false });
}
