import assert from "node:assert/strict";
import { test } from "node:test";
import { BACKUP_KEY, KEY, type KV, Store } from "../src/data/store.ts";
import { demoAnalysis } from "../src/domain/engine.ts";
import { toInput } from "../src/domain/types.ts";

const memKV = (): KV & { m: Map<string, string> } => { const m = new Map<string, string>(); return { m, get: (k) => m.get(k) ?? null, set: (k, v) => void m.set(k, v), remove: (k) => void m.delete(k) }; };

test("decisions survive a reload", () => {
  const kv = memKV();
  const s = new Store(kv);
  const d = s.create();
  s.update(d.id, (x) => { x.title = "Should I move?"; x.alternatives = [{ id: "a", title: "Move", note: "" }, { id: "b", title: "Stay", note: "" }]; }, true);
  const again = new Store(kv);
  assert.equal(again.get(d.id)?.title, "Should I move?");
  assert.equal(again.get(d.id)?.alternatives.length, 2);
});

test("an invalid edit is rolled back instead of saved", () => {
  const s = new Store(memKV());
  const d = s.create();
  const ok = s.update(d.id, (x) => { x.alternatives = Array.from({ length: 6 }, (_, i) => ({ id: `a${i}`, title: `A${i}`, note: "" })); }, true);
  assert.equal(ok, false);
  assert.equal(s.get(d.id)?.alternatives.length, 0);
});

test("a corrupted store is backed up and valid decisions are salvaged", () => {
  const kv = memKV();
  const s = new Store(kv);
  const d = s.create();
  s.update(d.id, (x) => { x.title = "Keep me"; }, true);
  const raw = JSON.parse(kv.m.get(KEY)!);
  raw.decisions.push({ id: "", broken: true });
  raw.version = 99;
  kv.set(KEY, JSON.stringify(raw));
  const r = new Store(kv);
  assert.equal(r.recovered, true);
  assert.equal(r.data.decisions.length, 1);
  assert.equal(r.data.decisions[0]!.title, "Keep me");
  assert.ok(kv.m.get(BACKUP_KEY));
});

test("export and import round-trip; invalid entries are skipped", () => {
  const a = new Store(memKV());
  const d = a.create();
  a.update(d.id, (x) => { x.title = "Should I start a business?"; x.alternatives = [{ id: "a", title: "Launch now", note: "" }, { id: "b", title: "Keep it a side project", note: "" }]; }, true);
  a.update(d.id, (x) => { x.analysis = demoAnalysis(toInput(x)); x.status = "exploring"; }, true);
  const json = JSON.parse(a.exportJSON());
  json.decisions.push({ nonsense: true });
  const b = new Store(memKV());
  const r = b.importJSON(JSON.stringify(json), "merge");
  assert.deepEqual(r, { added: 1, skipped: 1 });
  assert.equal(b.get(d.id)?.analysis?.branches.length, 2);
  assert.throws(() => b.importJSON("{\"hello\":1}", "merge"));
});

test("delete everything leaves nothing behind", () => {
  const kv = memKV();
  const s = new Store(kv);
  s.create(); s.create();
  s.deleteAll();
  assert.equal(s.data.decisions.length, 0);
  assert.equal(kv.m.get(KEY), undefined);
  assert.equal(new Store(kv).data.decisions.length, 0);
});
