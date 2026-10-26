// Build: bundle TypeScript + CSS with esbuild, copy static files into dist/.
// `--watch` rebuilds on change. No other tooling needed.
import { build, context } from "esbuild";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";

const watch = process.argv.includes("--watch");
const opts = {
  entryPoints: { app: "src/main.ts", "app-style": "src/styles/index.css" },
  outdir: "dist",
  bundle: true,
  format: "esm",
  target: ["es2022", "safari16"],
  minify: !watch,
  sourcemap: watch ? "inline" : false,
  external: ["/fonts/*"],
  logLevel: "info",
  legalComments: "none",
  define: { __EMBED__: "false" },
};

await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
await cp("public", "dist", { recursive: true });
const stamp = Date.now().toString(36);
const sw = (await readFile("public/sw.js", "utf8")).replace("__BUILD__", stamp);
await writeFile("dist/sw.js", sw);

if (watch) {
  const ctx = await context(opts);
  await ctx.watch();
  console.log("watching…");
} else {
  await build(opts);
}
// esbuild names the css entry app-style.css; serve it as app.css
const { rename } = await import("node:fs/promises");
await rename("dist/app-style.css", "dist/app.css").catch(() => {});
await rm("dist/app-style.js", { force: true });
