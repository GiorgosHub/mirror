import assert from "node:assert/strict";
import { test } from "node:test";
import analyze from "../functions/analyze.ts";
import health from "../functions/health.ts";
import { demoAnalysis } from "../src/domain/engine.ts";

function res() {
  const r = { code: 0, body: undefined as unknown, headers: {} as Record<string, string>,
    status(c: number) { r.code = c; return r; }, json(b: unknown) { r.body = b; }, setHeader(k: string, v: string) { r.headers[k] = v; } };
  return r;
}
const input = { title: "Should I move to Lisbon?", context: "", constraints: [], alternatives: [{ id: "a", title: "Move", note: "" }, { id: "b", title: "Stay", note: "" }], horizon: "1y", priorities: ["money"], unknowns: [] };

test("without a key the server says so honestly", async () => {
  delete process.env.ANTHROPIC_API_KEY;
  const h = res(); health({}, h); assert.deepEqual(h.body, { ai: false });
  const r = res(); await analyze({ method: "POST", body: { input } }, r); assert.equal(r.code, 501);
});

test("bad input is rejected before any model call", async () => {
  process.env.ANTHROPIC_API_KEY = "test-key";
  let called = false;
  const real = globalThis.fetch;
  globalThis.fetch = (async () => { called = true; return new Response("{}"); }) as typeof fetch;
  const r = res(); await analyze({ method: "POST", body: { input: { ...input, alternatives: [] } } }, r);
  assert.equal(r.code, 400); assert.equal(called, false);
  globalThis.fetch = real; delete process.env.ANTHROPIC_API_KEY;
});

test("a valid model response is validated and labelled as AI; an invalid one is refused", async () => {
  process.env.ANTHROPIC_API_KEY = "test-key";
  const real = globalThis.fetch;
  const good = demoAnalysis(input as never);
  let sentKey = "";
  globalThis.fetch = (async (_u: unknown, init?: RequestInit) => {
    sentKey = (init?.headers as Record<string, string>)["x-api-key"]!;
    return new Response(JSON.stringify({ content: [{ type: "text", text: "Here you go:\n" + JSON.stringify(good) }] }), { status: 200 });
  }) as typeof fetch;
  const r = res(); await analyze({ method: "POST", body: { input } }, r);
  assert.equal(r.code, 200);
  assert.equal((r.body as { source: { kind: string } }).source.kind, "ai");
  assert.equal(sentKey, "test-key");
  assert.ok(!JSON.stringify(r.body).includes("test-key"));

  globalThis.fetch = (async () => new Response(JSON.stringify({ content: [{ type: "text", text: "{\"branches\": 3}" }] }))) as typeof fetch;
  const bad = res(); await analyze({ method: "POST", body: { input } }, bad);
  assert.equal(bad.code, 502);
  globalThis.fetch = real; delete process.env.ANTHROPIC_API_KEY;
});
