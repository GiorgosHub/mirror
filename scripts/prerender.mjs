// Optional: snapshot the website's markup into dist/index.html so search engines and link previews see real content.
// The app replaces it on load. Skipped quietly if Playwright or a browser isn't available (e.g. on a minimal CI).
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";

let chromium;
try { ({ chromium } = await import("playwright")); } catch { console.log("prerender: playwright not installed, skipped"); process.exit(0); }
const PORT = 4900 + Math.floor(Math.random() * 90);
const srv = spawn(process.execPath, ["--import", "tsx", "server/dev.mjs"], { env: { ...process.env, PORT: String(PORT) }, stdio: "ignore" });
try {
  await new Promise((r) => setTimeout(r, 900));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle" });
  const html = await page.evaluate(() => {
    const app = document.getElementById("app").cloneNode(true);
    app.querySelectorAll("video, .toasts, dialog").forEach((n) => n.remove());
    return app.innerHTML;
  });
  await browser.close();
  const file = await readFile("dist/index.html", "utf8");
  await writeFile("dist/index.html", file.replace(/<div id="app">[\s\S]*?<\/div>\n<script/, `<div id="app">${html}</div>\n<script`));
  console.log(`prerender: ${Math.round(html.length / 1024)} KB of website markup`);
} catch (e) {
  console.log("prerender: skipped (" + String(e.message).split("\n")[0] + ")");
} finally { srv.kill(); }
