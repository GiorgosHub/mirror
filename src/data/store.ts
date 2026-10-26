/* Local-first persistence. Everything lives in this browser's storage, validated on the way in and out.
   No accounts, no sync, no analytics: the Settings screen says exactly this. A corrupted store is never silently
   discarded: it is kept under a backup key and the user is told. */
import { type Decision, type Settings, type StoreData, Decision as DecisionSchema, STORE_VERSION, Settings as SettingsSchema, StoreData as StoreSchema } from "../domain/types.ts";

export interface KV { get(k: string): string | null; set(k: string, v: string): void; remove(k: string): void }

export const KEY = "mirror.store.v1";
export const BACKUP_KEY = "mirror.store.corrupt";

export function browserKV(): KV {
  const mem = new Map<string, string>();
  const ls = (() => { try { const t = "__m"; localStorage.setItem(t, t); localStorage.removeItem(t); return localStorage; } catch { return null; } })();
  return {
    get: (k) => { try { return ls ? ls.getItem(k) : mem.get(k) ?? null; } catch { return mem.get(k) ?? null; } },
    set: (k, v) => { try { if (ls) ls.setItem(k, v); else mem.set(k, v); } catch { mem.set(k, v); throw new Error("storage-full"); } },
    remove: (k) => { try { ls?.removeItem(k); } catch { /* ignore */ } mem.delete(k); },
  };
}
export const persistent = () => { try { return typeof localStorage !== "undefined" && !!localStorage; } catch { return false; } };

export const uid = (p = "d") => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
export const nowIso = () => new Date().toISOString();

export type LoadResult = { data: StoreData; recovered: boolean };

export function emptyStore(): StoreData {
  return { version: STORE_VERSION, decisions: [], settings: SettingsSchema.parse({}) };
}

export function load(kv: KV): LoadResult {
  const raw = kv.get(KEY);
  if (!raw) return { data: emptyStore(), recovered: false };
  try {
    return { data: StoreSchema.parse(JSON.parse(raw)), recovered: false };
  } catch {
    /* keep the broken copy for the user, salvage what validates */
    kv.set(BACKUP_KEY, raw);
    const base = emptyStore();
    try {
      const j = JSON.parse(raw) as { decisions?: unknown[]; settings?: unknown };
      const s = SettingsSchema.safeParse(j.settings ?? {});
      if (s.success) base.settings = s.data;
      for (const d of j.decisions ?? []) { const r = DecisionSchema.safeParse(d); if (r.success) base.decisions.push(r.data); }
    } catch { /* unreadable JSON */ }
    return { data: base, recovered: true };
  }
}

export class Store {
  data: StoreData;
  recovered: boolean;
  private kv: KV;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<(why: string) => void>();
  saveState: "saved" | "saving" | "error" = "saved";

  constructor(kv: KV) {
    this.kv = kv;
    const r = load(kv);
    this.data = r.data;
    this.recovered = r.recovered;
  }

  on(fn: (why: string) => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  private emit(why: string) { for (const f of this.listeners) f(why); }

  /* immediate=true for destructive or structural changes; text edits are batched */
  commit(why: string, immediate = false) {
    this.saveState = "saving";
    if (this.timer) clearTimeout(this.timer);
    const run = () => {
      this.timer = null;
      try { this.kv.set(KEY, JSON.stringify(this.data)); this.saveState = "saved"; }
      catch { this.saveState = "error"; }
      this.emit("saved");
    };
    if (immediate) run(); else this.timer = setTimeout(run, 350);
    this.emit(why);
  }
  flush() { if (this.timer) { clearTimeout(this.timer); this.timer = null; try { this.kv.set(KEY, JSON.stringify(this.data)); this.saveState = "saved"; } catch { this.saveState = "error"; } } }

  get settings(): Settings { return this.data.settings; }
  setSettings(p: Partial<Settings>) { this.data.settings = SettingsSchema.parse({ ...this.data.settings, ...p }); this.commit("settings", true); }

  get(id: string) { return this.data.decisions.find((d) => d.id === id); }

  create(): Decision {
    const t = nowIso();
    const d = DecisionSchema.parse({ id: uid("d"), title: "", createdAt: t, updatedAt: t, horizon: this.settings.defaultHorizon, priorities: [...this.settings.defaultPriorities] });
    this.data.decisions.unshift(d);
    this.commit("create", true);
    return d;
  }

  /* mutate a decision in place, then validate before saving: invalid edits are rolled back */
  update(id: string, fn: (d: Decision) => void, immediate = false): boolean {
    const i = this.data.decisions.findIndex((d) => d.id === id);
    if (i < 0) return false;
    const before = structuredClone(this.data.decisions[i]!);
    const d = this.data.decisions[i]!;
    fn(d);
    d.updatedAt = nowIso();
    const r = DecisionSchema.safeParse(d);
    if (!r.success) { this.data.decisions[i] = before; return false; }
    this.data.decisions[i] = r.data;
    this.commit("update", immediate);
    return true;
  }

  remove(id: string) { this.data.decisions = this.data.decisions.filter((d) => d.id !== id); this.commit("remove", true); }

  exportJSON(): string { this.flush(); return JSON.stringify({ app: "MIRROR", exportedAt: nowIso(), ...this.data }, null, 2); }

  importJSON(text: string, mode: "merge" | "replace"): { added: number; skipped: number } {
    const j = JSON.parse(text) as { decisions?: unknown[]; settings?: unknown };
    if (!Array.isArray(j.decisions)) throw new Error("This file doesn't contain MIRROR decisions.");
    const valid: Decision[] = [];
    let skipped = 0;
    for (const x of j.decisions) { const r = DecisionSchema.safeParse(x); if (r.success) valid.push(r.data); else skipped++; }
    if (mode === "replace") this.data.decisions = valid;
    else for (const d of valid) { const i = this.data.decisions.findIndex((e) => e.id === d.id); if (i >= 0) this.data.decisions[i] = d; else this.data.decisions.push(d); }
    this.commit("import", true);
    return { added: valid.length, skipped };
  }

  deleteAll() {
    this.data = emptyStore();
    this.kv.remove(KEY);
    this.kv.remove(BACKUP_KEY);
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    this.saveState = "saved";
    this.emit("delete-all"); /* nothing is written back: after deletion the browser holds no MIRROR data */
  }
}
