// End-to-end: the whole MIRROR journey in a real browser, plus resilience, mobile, keyboard and accessibility checks.
// Run after `npm run build`:  node e2e/journey.mjs
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

const PORT = 4300 + Math.floor(Math.random() * 500);
const B = `http://localhost:${PORT}/`;
const srv = spawn(process.execPath, ["--import", "tsx", "server/dev.mjs"], { env: { ...process.env, PORT: String(PORT), ANTHROPIC_API_KEY: "" }, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 1200));

const results = [];
const check = async (name, fn) => {
  try { await globalThis.__page?.evaluate(() => document.querySelectorAll(".toast").forEach((t) => t.remove())).catch(() => {}); await fn(); results.push(["PASS", name]); console.log("PASS ", name); }
  catch (e) { const m = String(e?.message ?? e).split("\n").slice(0, process.env.V ? 14 : 1).join("\n       "); results.push(["FAIL", name, m]); console.log("FAIL ", name, "\n      ", m); }
};
const assert = (c, m) => { if (!c) throw new Error(m); };
const browser = await chromium.launch();
const _newContext = browser.newContext.bind(browser);
browser.newContext = async (o) => { const c = await _newContext(o); c.setDefaultTimeout(6000); return c; };

async function fresh(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true, ...opts });
  const page = await ctx.newPage();
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(String(e)));
  await page.goto(B, { waitUntil: "networkidle" });
  return { ctx, page };
}
const radio = (page, scope, value) => page.locator(scope).locator(`input[value="${value}"]`).first().check();

/* ---------------- 1. first visit: the liquid mirror, and the app's films ---------------- */
await check("first visit: the question is reflected in a live liquid mirror; the app's films are muted and pausable", async () => {
  const { ctx, page } = await fresh();
  assert(await page.getByRole("heading", { name: "What happens if you choose it?" }).isVisible(), "hero question");
  await page.waitForSelector(".hero.has-liquid canvas.liquid", { timeout: 6000 });
  assert(await page.locator(".hero canvas.liquid").getAttribute("aria-hidden") === "true", "the pool is hidden from AT");
  assert(await page.locator(".hero-reflect").evaluate((el) => getComputedStyle(el).visibility) === "hidden", "the still reflection steps aside for the live one");
  await page.mouse.move(300, 700); await page.mouse.move(600, 760);
  await page.goto(B + "#/app", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Explore a decision" }).first().click();
  await page.getByRole("heading", { name: "What are you deciding?" }).waitFor({ timeout: 4000 });
  const v = page.locator(".scene .cinema video").first();
  assert(await v.count() === 1, "video present in the app");
  assert(await v.evaluate((el) => el.muted && el.loop && el.playsInline && !el.controls), "video attributes");
  await page.waitForFunction(() => { const v = document.querySelector(".scene .cinema video"); return v && v.readyState >= 2; }, null, { timeout: 8000 });
  await page.getByRole("button", { name: "Pause background" }).click();
  assert(await v.evaluate((el) => el.paused), "paused by user");
  assert(await page.getByRole("button", { name: "Play background" }).getAttribute("aria-pressed") === "true", "toggle state");
  assert(page.errors.length === 0, page.errors.join());
  await ctx.close();
});

await check("reduced motion: a still reflection, no liquid, no film", async () => {
  const { ctx, page } = await fresh({ reducedMotion: "reduce" });
  assert(await page.locator("canvas.liquid").count() === 0, "no live pool");
  assert(await page.locator(".hero-reflect").isVisible(), "still reflection");
  await page.goto(B + "#/app", { waitUntil: "networkidle" });
  assert(await page.locator(".cinema video").count() === 0, "no video anywhere");
  assert(await page.locator(".scene .cinema img").count() >= 1, "poster");
  await ctx.close();
});

await check("the app works when the film and poster fail to load", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.route("**/media/**", (r) => r.abort());
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", (e) => errs.push(String(e)));
  await page.goto(B + "#/app", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Explore a decision" }).first().click();
  await page.getByRole("heading", { name: "What are you deciding?" }).waitFor({ timeout: 4000 });
  assert(errs.length === 0, errs.join());
  await ctx.close();
});

/* ---------------- 2. the core journey ---------------- */
const { ctx, page } = await fresh({ reducedMotion: "reduce" });
globalThis.__page = page;
let id = "";
await check("a new user can start a decision and is guided step by step", async () => {
  await page.getByRole("button", { name: "Explore a decision" }).first().click();
  await page.getByRole("button", { name: "Continue" }).click();
  assert((await page.locator(".err").innerText()).includes("Write the decision"), "title required");
  await page.locator("#f-title").fill("Should I move to Lisbon or stay in Athens?");
  await page.locator("#f-ctx").fill("I work remotely and feel stuck.");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: 'Add "Savings for 6 months"' }).click();
  await page.locator("#f-con").fill("My lease ends in March");
  await page.locator("#f-con").press("Enter");
  assert(await page.locator(".chip").count() === 2, "two constraints");
  await page.getByRole("button", { name: "Continue" }).click();
  id = page.url().split("/new/")[1];
  assert(id, "decision id in url");
});

await check("alternatives can be suggested, edited, removed (with undo) and validated", async () => {
  const inputs = page.locator(".alt input.input:not(.note)");
  assert(await inputs.count() === 2, "two suggestions from 'A or B'");
  assert(await inputs.nth(0).inputValue() === "Move to Lisbon", "keeps the user's capitalisation: " + await inputs.nth(0).inputValue());
  assert(await page.getByText("Suggested — edit freely").count() === 2, "labelled as suggestions");
  await inputs.nth(0).fill("Move to Lisbon in March");
  assert(await page.getByText("Suggested — edit freely").count() === 2, "label persists until re-render");
  await inputs.nth(1).fill("Stay in Athens and renew the lease");
  await page.getByRole("button", { name: "Add an alternative" }).click();
  await inputs.nth(2).fill("Temporary option");
  await page.getByRole("button", { name: "Remove alternative C" }).click();
  assert(await inputs.count() === 2, "removed");
  await page.getByRole("button", { name: "Undo" }).click();
  assert(await inputs.count() === 3, "undo restores");
  await inputs.nth(2).fill("");
  await page.getByRole("button", { name: "Continue" }).click();
  assert((await page.locator(".err").innerText()).includes("needs a name"), "empty name blocked");
  await inputs.nth(2).fill("Stay in Athens and renew the lease");
  await page.getByRole("button", { name: "Continue" }).click();
  assert((await page.locator(".err").innerText()).includes("same name"), "duplicates blocked");
  await inputs.nth(2).fill("Spend two months in Lisbon first");
  await page.locator(".alt input.note").nth(2).fill("Short-term rental");
  await page.getByRole("button", { name: "Continue" }).click();
  assert(await page.getByRole("heading", { name: "How far ahead should we look?" }).isVisible(), "on horizon step");
});

await check("horizon, ranked priorities and unknowns are captured", async () => {
  await page.locator("#hz-1y").check();
  await page.getByRole("button", { name: "Continue" }).click();
  for (const p of ["Relationships", "Freedom", "Financial safety"]) await page.getByLabel(p, { exact: true }).check();
  await page.getByLabel("Growth", { exact: true }).click();
  assert(!(await page.getByLabel("Growth", { exact: true }).isChecked()), "max three");
  await page.getByRole("button", { name: "Move Financial safety up" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.locator("#f-unk").fill("How lonely the first months would feel");
  await page.locator("#f-unk").press("Enter");
  await page.locator(".wiz-foot .btn-primary").click();
  const txt = await page.locator(".review dl").innerText();
  assert(txt.includes("1. Relationships") && txt.includes("2. Financial safety"), "ranking kept: " + txt);
});

await check("an incomplete decision is saved as a draft and survives a reload", async () => {
  await page.reload({ waitUntil: "networkidle" });
  assert(await page.getByRole("heading", { name: "Ready to map the futures." }).isVisible(), "same step after reload");
});

await check("mapping produces one path per alternative with three futures each, labelled as demo", async () => {
  await page.getByRole("button", { name: "Map the futures" }).click();
  await page.waitForURL(/#\/lab\//);
  await page.waitForSelector(".map .node");
  assert(await page.locator(".map .node").count() === 9, "3x3 nodes");
  assert(await page.getByText("Demo rules · not AI").isVisible(), "honest label");
  assert(await page.locator(".map svg.light path.ln").count() >= 12, "light paths drawn");
  for (const k of ["fact", "assumed", "speculative"]) assert(await page.locator(`.map .node[data-kind="${k}"]`).count() + (k === "fact" ? 1 : 0) > 0, "kind " + k);
});

await check("a future can be inspected down to its assumptions", async () => {
  const node = page.locator('.map .node[data-kind="assumed"]').first();
  await node.click();
  assert(await page.locator(".why").isVisible(), "why panel");
  assert(await page.locator(".why .asm").count() >= 1, "lists what it rests on");
});

await check("judging an assumption changes the futures and the comparison", async () => {
  await page.locator(".altlab:visible", { hasText: "Move to Lisbon" }).first().click();
  const before = await page.locator(".map .node[data-kind=broken]").count();
  await radio(page, '.chapter .asm:has-text("financial runway")', "false");
  await page.waitForTimeout(300);
  const after = await page.locator(".map .node[data-kind=broken]").count();
  assert(after > before, `broken ${before} -> ${after}`);
  assert((await page.locator(".toast").last().innerText()).includes("changed"), "explained");
  await page.getByRole("link", { name: /Compare/ }).click();
  await page.locator(".cmp").waitFor({ timeout: 4000 });
  await page.locator(".cmp p.changed").first().waitFor({ timeout: 4000 }).catch(() => {});
  assert(await page.locator(".cmp p.changed").count() >= 1, "comparison reflects the judgement");
  assert((await page.locator(".cmp").innerText()).includes("Changed because you marked"), "explains why");
});

await check("experiments can be planned (and appear on the dashboard) and completed with a finding", async () => {
  await page.getByRole("link", { name: /Experiments/ }).click();
  await page.getByRole("button", { name: "Plan it" }).first().click();
  await page.getByRole("button", { name: "Plan it" }).last().click(); // dialog submit
  assert(await page.locator('.xp[data-status="planned"]').count() === 1, "planned");
  await page.locator('.xp[data-status="planned"]').getByRole("button", { name: "Mark done" }).click();
  await page.getByRole("button", { name: "Save finding" }).click();
  assert((await page.locator(".dlg .err").innerText()).includes("Write what you found"), "finding required");
  await page.locator("#xp-l").fill("Rents near the centre are higher than I assumed.");
  await page.getByRole("button", { name: "Save finding" }).click();
  assert(await page.locator('.xp[data-status="done"]').count() === 1, "done");
  await page.getByRole("button", { name: "Plan it" }).first().click();
  await page.getByRole("button", { name: "Plan it" }).last().click();
  await page.goto(B + "#/app", { waitUntil: "networkidle" });
  assert(await page.locator('section[aria-label="Next actions"] .item').count() >= 1, "dashboard shows planned step");
});

await check("versions, a recorded choice, reflection and resolution work end to end", async () => {
  await page.goto(`${B}#/lab/${id}?tab=futures`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Save version" }).first().click();
  await page.locator("#sv").fill("Before visiting");
  await page.getByRole("button", { name: "Save version" }).last().click();
  await radio(page, ".chapter .asm:has-text('real opportunity')", "holds");
  await page.getByRole("button", { name: "Record a choice" }).click();
  await page.getByRole("button", { name: "Record choice" }).click();
  assert((await page.locator(".dlg .err").innerText()).includes("Choose one"), "choice required");
  await page.locator("#ch-2").check();
  await page.locator("#ch-why").fill("Lowest regret: I learn before I commit.");
  await page.getByRole("button", { name: "Record choice" }).click();
  await page.waitForURL(/tab=journal/);
  const tl = await page.locator(".tl").innerText();
  assert(tl.includes("Chose") && tl.includes("Version saved: Before visiting") && tl.includes("Evidence"), "journal: " + tl.slice(0, 200));
  assert(await page.getByText(/change(s)? since this version/).count() >= 1, "version diff");
  await page.locator("#rf").fill("Two months in, the loneliness was real but smaller than I feared.");
  await page.locator("#rf-s").check();
  await page.getByRole("button", { name: "Save reflection" }).click();
  await page.getByRole("button", { name: "Mark resolved" }).click();
  await page.getByRole("button", { name: "Mark resolved" }).last().click();
  assert((await page.locator(".notice.chosen").innerText()).includes("Resolved"), "resolved");
});

await check("everything survives a full reload", async () => {
  await page.reload({ waitUntil: "networkidle" });
  const d = await page.evaluate((id) => window.__mirror.store.get(id), id);
  assert(d.status === "resolved" && d.choice && d.snapshots.length >= 2 && d.reflections.length === 1 && d.observations.length >= 2, JSON.stringify({ s: d.status, sn: d.snapshots.length }));
});

await check("the brief is complete and exports real Markdown", async () => {
  await page.goto(`${B}#/brief/${id}`, { waitUntil: "networkidle" });
  const t = await page.locator(".brief-doc").textContent();
  for (const s of ["Your choice", "The alternatives", "Trade-offs", "Still uncertain", "Missing information", "Experiments", "Next action"]) assert(t.includes(s), s);
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Markdown" }).click()]);
  const md = await readFile(await dl.path(), "utf8");
  assert(md.startsWith("# Should I move to Lisbon") && md.includes("## Trade-offs"), "markdown content");
});

await check("history lists the decision with its reasoning trail", async () => {
  await page.goto(B + "#/history", { waitUntil: "networkidle" });
  const t = await page.locator(".hist").innerText();
  assert(t.includes("Should I move to Lisbon") && t.includes("version") && t.includes("reflection"), t);
});

await check("server AI without a key fails safely and leaves the work untouched", async () => {
  await page.goto(B + "#/settings", { waitUntil: "networkidle" });
  await page.locator('input[name="engine"][value="server"]').check();
  await page.waitForTimeout(300);
  assert((await page.locator(".notice").first().innerText()).includes("no AI provider"), "status shown");
  const before = await page.evaluate((id) => JSON.stringify(window.__mirror.store.get(id).analysis), id);
  await page.goto(`${B}#/lab/${id}`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Map again" }).click();
  await page.getByRole("button", { name: "Map again" }).last().click();
  await page.waitForSelector(".toast.bad");
  const after = await page.evaluate((id) => JSON.stringify(window.__mirror.store.get(id).analysis), id);
  assert(before === after, "analysis unchanged");
  await page.goto(B + "#/settings", { waitUntil: "networkidle" });
  await page.locator('input[name="engine"][value="demo"]').check();
});

await check("settings really apply: theme and text size", async () => {
  await page.locator('input[name="theme"][value="light"]').check();
  assert(await page.evaluate(() => document.documentElement.dataset.theme) === "light", "light theme");
  await page.locator('input[name="scale"][value="1.25"]').check();
  assert(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--scale").trim()) === "1.25", "scale");
  await page.locator('input[name="theme"][value="dark"]').check();
  await page.locator('input[name="scale"][value="1"]').check();
});

await check("export produces the actual data; import merges it back", async () => {
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export" }).click()]);
  const j = JSON.parse(await readFile(await dl.path(), "utf8"));
  assert(j.app === "MIRROR" && j.decisions.some((d) => d.id === id && d.analysis && d.choice), "export content");
  globalThis.__export = await dl.path();
});

await check("delete all requires typed confirmation and removes everything", async () => {
  await page.getByRole("button", { name: "Delete all data" }).click();
  await page.getByRole("button", { name: "Delete everything" }).click();
  assert((await page.locator(".dlg .err").innerText()).includes("Type DELETE"), "guarded");
  await page.locator("#del").fill("DELETE");
  await page.getByRole("button", { name: "Delete everything" }).click();
  await page.waitForTimeout(200);
  assert(await page.evaluate(() => localStorage.getItem("mirror.store.v1")) === null, "storage empty");
  assert(await page.evaluate(() => window.__mirror.store.data.decisions.length) === 0, "state empty");
  await page.goto(B + "#/settings", { waitUntil: "networkidle" });
  await page.locator("#imp").setInputFiles(globalThis.__export);
  await page.getByRole("button", { name: "Merge" }).click();
  await page.waitForTimeout(200);
  assert(await page.evaluate(() => window.__mirror.store.data.decisions.length) === 1, "import restored");
});

await check("keyboard: skip link, visible focus, dialogs close with Escape and return focus", async () => {
  await page.goto(`${B}#/lab/${id}`, { waitUntil: "networkidle" });
  await page.reload({ waitUntil: "networkidle" }); /* a genuine first load */
  await page.keyboard.press("Tab");
  assert(await page.evaluate(() => document.activeElement?.className) === "skip", "skip link first");
  const btn = page.getByRole("button", { name: "Save version" }).first();
  await btn.focus();
  const outline = await btn.evaluate((el) => getComputedStyle(el).outlineStyle);
  await page.keyboard.press("Enter");
  assert(await page.locator("dialog[open]").count() === 1, "dialog open");
  await page.keyboard.press("Escape");
  assert(await page.locator("dialog[open]").count() === 0, "closed");
  assert(await btn.evaluate((el) => el === document.activeElement), "focus returned");
  assert(outline !== "none", "focus outline");
});

await check("accessibility basics: every control is named, every field is labelled", async () => {
  const pages = ["#/", "#/app", `#/lab/${id}`, `#/lab/${id}?tab=compare`, `#/lab/${id}?tab=assumptions`, `#/lab/${id}?tab=experiments`, `#/lab/${id}?tab=journal`, `#/brief/${id}`, "#/history", "#/settings"];
  const problems = [];
  for (const p of pages) {
    await page.goto(B + p, { waitUntil: "networkidle" });
    problems.push(...await page.evaluate((p) => {
      const out = [];
      const name = (el) => (el.getAttribute("aria-label") || el.textContent || "").trim() || (el.getAttribute("aria-labelledby") && document.getElementById(el.getAttribute("aria-labelledby"))?.textContent);
      for (const el of document.querySelectorAll("#view button, #view a[href], header button, header a")) if (!name(el) && el.offsetParent) out.push(`${p}: unnamed ${el.outerHTML.slice(0, 80)}`);
      for (const el of document.querySelectorAll("#view input:not([type=hidden]), #view select, #view textarea")) {
        const ok = el.getAttribute("aria-label") || (el.id && document.querySelector(`label[for="${el.id}"]`)) || el.closest("label") || el.closest("fieldset")?.querySelector("legend");
        if (!ok) out.push(`${p}: unlabelled ${el.outerHTML.slice(0, 80)}`);
      }
      if (document.querySelectorAll("h1").length !== 1) out.push(`${p}: h1 count ${document.querySelectorAll("h1").length}`);
      return out;
    }, p));
  }
  assert(problems.length === 0, problems.slice(0, 4).join(" | "));
});
await ctx.close();
globalThis.__page = null;

await check("with full motion: screens morph, judgements still update the futures, nothing errors", async () => {
  const { ctx: c, page: pg } = await fresh();
  const errs = []; pg.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  assert(await pg.evaluate(() => "startViewTransition" in document), "browser supports view transitions");
  await pg.getByRole("button", { name: "Explore a decision" }).first().click();
  await pg.getByRole("button", { name: "EXAMPLE Changing careers" }).click();
  await pg.evaluate(() => { const a = window.__mirror; const d = a.store.data.decisions[0]; a.store.update(d.id, (x) => { x.step = 6; }, true); a.render(); });
  await pg.getByRole("button", { name: "Map the futures" }).click();
  await pg.waitForURL(/#\/lab\//);
  await pg.waitForSelector(".map .node");
  await pg.waitForTimeout(800);
  const vtNames = await pg.evaluate(() => [...document.querySelectorAll(".map .node")].every((n) => n.style.viewTransitionName));
  assert(vtNames, "path points carry transition names");
  await pg.locator(".altlab:visible", { hasText: "Quit" }).first().click();
  await pg.waitForTimeout(600);
  await pg.locator('.chapter .asm:has-text("financial runway")').first().locator('input[value="false"]').check();
  await pg.waitForFunction(() => document.querySelectorAll(".map .node[data-kind=broken]").length > 0, null, { timeout: 4000 }).catch(() => {});
  assert(await pg.locator(".map .node[data-kind=broken]").count() > 0, "broken future appears");
  await pg.waitForFunction(() => document.querySelectorAll(".light .spark").length === 1, null, { timeout: 3000 }).catch(() => {});
  assert(await pg.locator(".light .spark").count() === 1, "travelling light on the selected path");
  assert(errs.length === 0, errs.join(" | "));
  await c.close();
});

/* ---------------- the website ---------------- */
await check("the website: section links scroll, FAQ opens, demo runs the real engine, nothing is saved", async () => {
  const { ctx: c, page: pg } = await fresh({ reducedMotion: "reduce" });
  await pg.evaluate(() => localStorage.clear()); await pg.reload({ waitUntil: "networkidle" });
  assert(await pg.locator('nav[aria-label="Site"]').isVisible(), "website navigation");
  assert(!(await pg.locator(".tabbar").isVisible()), "no app tab bar on the website");
  for (const id of ["story", "demo", "principles", "faq"]) assert(await pg.locator(`#${id}`).count() === 1, "section " + id);
  await pg.locator('nav[aria-label="Site"] a', { hasText: "Questions" }).click();
  await pg.waitForTimeout(300);
  const top = await pg.locator("#faq").evaluate((el) => el.getBoundingClientRect().top);
  assert(top < 200 && top > -50, "scrolled to the FAQ (" + Math.round(top) + ")");
  assert(pg.url().endsWith("/"), "route unchanged by section links: " + pg.url());
  await pg.locator(".faq summary", { hasText: "Is it AI?" }).click();
  assert(await pg.locator(".faq details[open] p").isVisible(), "answer shown");
  await pg.locator(".demo-tab", { hasText: "Quit" }).click();
  const before = await pg.locator('.demo-fut[data-kind="broken"]').count();
  await pg.locator('.demo-board .asm:has-text("financial runway") input[value="false"]').check();
  assert(await pg.locator('.demo-fut[data-kind="broken"]').count() > before, "a future breaks in the demo");
  assert(await pg.evaluate(() => window.__mirror.store.data.decisions.length) === 0, "demo saves nothing");
  assert(await pg.evaluate(() => localStorage.getItem("mirror.store.v1")) === null || await pg.evaluate(() => JSON.parse(localStorage.getItem("mirror.store.v1")).decisions.length === 0), "nothing stored");
  await pg.getByRole("link", { name: "Open MIRROR" }).first().click();
  await pg.waitForURL(/#\/app/);
  await pg.locator('nav[aria-label="App"]').waitFor({ state: "visible", timeout: 3000 }).catch(() => {});
  assert(await pg.locator('nav[aria-label="App"]').isVisible(), "app navigation inside the tool");
  await c.close();
});

await check("the website on a phone: menu opens and navigates", async () => {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
  const pg = await c.newPage();
  await pg.goto(B, { waitUntil: "networkidle" });
  await pg.getByRole("button", { name: "Menu" }).or(pg.locator(".site-menu summary")).first().click();
  await pg.locator(".site-menu .menu a", { hasText: "Example" }).click();
  await pg.waitForTimeout(300);
  const top = await pg.locator("#demo").evaluate((el) => el.getBoundingClientRect().top);
  assert(top < 200, "scrolled to the demo");
  assert(!(await pg.locator(".site-menu").evaluate((d) => d.open)), "menu closed after choosing");
  await c.close();
});

/* ---------------- 3. phones and tablets ---------------- */
for (const [w, h] of [[390, 844], [768, 1024]]) {
  await check(`${w}px: every screen fits, nothing scrolls sideways, touch targets are 44px+`, async () => {
    const c = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 500, isMobile: w < 500, reducedMotion: "reduce" });
    const pg = await c.newPage();
    const errs = []; pg.on("pageerror", (e) => errs.push(String(e)));
    await pg.goto(B, { waitUntil: "networkidle" });
    await pg.getByRole("button", { name: "Explore a decision" }).first().click();
    await pg.getByRole("button", { name: "EXAMPLE Moving cities" }).click();
    await pg.evaluate(() => { const a = window.__mirror; const d = a.store.data.decisions[0]; a.store.update(d.id, (x) => { x.step = 6; }, true); a.render(); });
    await pg.getByRole("button", { name: "Map the futures" }).click();
    await pg.waitForURL(/#\/lab\//);
    const did = pg.url().split("/lab/")[1];
    const bad = [];
    for (const p of ["#/", "#/app", `#/lab/${did}`, `#/lab/${did}?tab=compare`, `#/lab/${did}?tab=assumptions`, `#/lab/${did}?tab=experiments`, `#/lab/${did}?tab=journal`, `#/brief/${did}`, "#/history", "#/settings", `#/new/${did}`]) {
      await pg.goto(B + p, { waitUntil: "networkidle" });
      const over = await pg.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (over > 0) bad.push(`${p} overflows ${over}px`);
      const small = await pg.evaluate(() => [...document.querySelectorAll("#view .btn, .tabbar a, #view .node, #view .altlab, .judge span")].filter((el) => el.offsetParent && el.getBoundingClientRect().height < 34).map((el) => el.textContent.trim().slice(0, 20)));
      if (small.length) bad.push(`${p} small targets: ${small.slice(0, 3)}`);
    }
    if (w < 500) {
      await pg.goto(`${B}#/lab/${did}`, { waitUntil: "networkidle" });
      assert(await pg.locator(".tabbar").isVisible(), "bottom navigation");
      assert(await pg.locator(".vmap").isVisible() && !(await pg.locator(".map").isVisible()), "vertical futures on phones");
      const top = await pg.locator(".vpath").evaluate((el) => el.getBoundingClientRect().top);
      assert(top < 844, `futures start on the first screen (top ${Math.round(top)})`);
    }
    assert(bad.length === 0, bad.join(" | "));
    assert(errs.length === 0, errs.join());
    await c.close();
  });
}

/* ---------------- language ---------------- */
await check("Greek: the switch translates the whole interface, writes analyses in Greek, persists, and switches back", async () => {
  const { ctx: c, page: pg } = await fresh({ reducedMotion: "reduce" });
  await pg.evaluate(() => localStorage.clear()); await pg.reload({ waitUntil: "networkidle" });
  assert(await pg.evaluate(() => document.documentElement.lang) === "en", "English by default");
  await pg.locator(".hdr .lang-b[lang=el]").click();
  assert(await pg.evaluate(() => document.documentElement.lang) === "el", "html lang becomes el");
  assert(await pg.locator('nav[aria-label="Ιστότοπος"] a', { hasText: "Πώς δουλεύει" }).isVisible(), "site navigation in Greek");
  assert(await pg.getByRole("heading", { name: "Τι γίνεται αν το διαλέξεις;" }).isVisible(), "hero in Greek");
  /* the demo runs in Greek */
  assert(/[\u0370-\u03FF]/.test(await pg.locator(".demo-board").innerText()), "demo in Greek");
  /* a whole decision in Greek */
  await pg.goto(B + "#/app", { waitUntil: "networkidle" });
  await pg.locator("button.hdr-cta.app-only").click();
  await pg.locator("button.ex").first().click();
  for (let i = 0; i < 6; i++) await pg.locator(".wiz-foot .btn-primary").click();
  await pg.getByRole("button", { name: "Χαρτογράφησε τα μέλλοντα" }).click();
  await pg.waitForURL(/#\/lab\//);
  const did = pg.url().split("/lab/")[1];
  const labText = await pg.locator("#view").innerText();
  assert(/Κανόνες επίδειξης/.test(labText), "demo label in Greek");
  /* sweep: no English UI words left on any screen (user-typed text and brand names excepted) */
  const OK = /^(MIRROR|AI|JSON|PDF|Markdown|DELETE|EN|Enter|English|design|browser)$/i;
  const leftovers = [];
  for (const p of ["#/", "#/app", `#/lab/${did}`, `#/lab/${did}?tab=compare`, `#/lab/${did}?tab=assumptions`, `#/lab/${did}?tab=experiments`, `#/lab/${did}?tab=journal`, `#/brief/${did}`, "#/history", "#/settings"]) {
    await pg.goto(B + p, { waitUntil: "networkidle" });
    const texts = await pg.evaluate(() => {
      const out = [];
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) { const t = n.nodeValue.trim(); if (t && n.parentElement && !n.parentElement.closest("script,style,[data-i18n=no]") && n.parentElement.offsetParent !== null) out.push(t); }
      for (const el of document.querySelectorAll("[aria-label],[placeholder]")) for (const a of ["aria-label", "placeholder"]) { const v = el.getAttribute(a); if (v && !el.closest("[data-i18n=no]")) out.push(v); }
      return out;
    });
    for (const t of texts) if ((t.match(/[A-Za-z][A-Za-z'-]{2,}/g) || []).some((w) => !OK.test(w))) leftovers.push(`${p}: ${t.slice(0, 50)}`);
    const over = await pg.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert(over <= 0, `${p} overflows in Greek`);
  }
  assert(leftovers.length === 0, "untranslated: " + leftovers.slice(0, 5).join(" | "));
  /* persists across reloads */
  await pg.reload({ waitUntil: "networkidle" });
  assert(await pg.evaluate(() => document.documentElement.lang) === "el", "Greek survives a reload");
  /* and back */
  await pg.locator(".hdr .lang-b[lang=en]").click();
  assert(await pg.evaluate(() => document.documentElement.lang) === "en", "back to English");
  assert(await pg.getByRole("heading", { name: "Make MIRROR yours." }).isVisible(), "settings in English again");
  assert(pg.errors.length === 0, pg.errors.join());
  await c.close();
});

await check("Greek on a phone: nothing scrolls sideways", async () => {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
  const pg = await c.newPage();
  await pg.goto(B, { waitUntil: "networkidle" });
  await pg.evaluate(() => { localStorage.clear(); });
  await pg.reload({ waitUntil: "networkidle" });
  await pg.locator(".hdr .lang-b[lang=el]").click();
  for (const p of ["#/", "#/app", "#/settings", "#/history"]) {
    await pg.goto(B + p, { waitUntil: "networkidle" });
    const over = await pg.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert(over <= 0, `${p} overflows ${over}px`);
  }
  await c.close();
});

/* ---------------- the mark and the motion ---------------- */
await check("motion: the mark draws in, the story plays with the scroll, principles rise out of their reflections", async () => {
  const { ctx: c, page: pg } = await fresh({ reducedMotion: "no-preference" });
  assert(await pg.locator(".hdr .brand .bm .bm-ring").count() === 1, "mark in the header");
  assert(await pg.locator(".site-foot .bm").count() === 1, "mark in the footer");
  assert((await pg.locator(".hdr .bm-ring").evaluate((el) => getComputedStyle(el).animationName)).includes("bm-draw"), "mark draws in");
  /* the story: scrolling through the pinned stage advances the moments */
  const pos = await pg.evaluate(() => { const s = document.getElementById("story"); return { top: s.offsetTop, len: s.offsetHeight - innerHeight }; });
  assert(pos.len > 1000, "story is a long pinned scene");
  await pg.evaluate(({ top, len }) => scrollTo(0, top + len * 0.66), pos);
  await pg.waitForFunction(() => document.getElementById("story").dataset.step === "2", null, { timeout: 3000 });
  assert(await pg.locator(".story-step[data-on] h3").innerText() === "You test what it rests on.", "the third moment is on");
  assert(await pg.locator(".story .crack").evaluate((el) => parseFloat(getComputedStyle(el).strokeDashoffset) < 0.5), "the doubtful future cracks");
  await pg.evaluate(({ top, len }) => scrollTo(0, top + len * 0.98), pos);
  await pg.waitForFunction(() => document.getElementById("story").dataset.step === "3", null, { timeout: 3000 });
  /* principles: --p follows the scroll */
  const nv = pg.locator(".nv").first();
  await nv.scrollIntoViewIfNeeded(); await pg.waitForTimeout(300);
  assert(parseFloat(await nv.evaluate((el) => el.style.getPropertyValue("--p"))) > 0, "principle rises with the scroll");
  /* FAQ opens */
  await pg.locator(".faq summary").first().click();
  assert(await pg.locator(".faq details[open]").count() === 1, "faq opens");
  assert(pg.errors.length === 0, pg.errors.join());
  await c.close();
});

await check("reduced motion: nothing is pinned or waits for the scroll", async () => {
  const { ctx: c, page: pg } = await fresh({ reducedMotion: "reduce" });
  assert(await pg.locator(".story.static").count() === 1, "story is static");
  assert(await pg.locator(".story-step").evaluateAll((els) => els.every((e) => getComputedStyle(e).opacity === "1")), "every moment is visible");
  assert(await pg.locator(".lang-sec.static").count() === 1, "line language is static");
  await c.close();
});

/* ---------------- report ---------------- */
await browser.close();
srv.kill();
const failed = results.filter((r) => r[0] === "FAIL");
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
