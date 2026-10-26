// Vercel: write the Build Output API (https://vercel.com/docs/build-output-api) so the deployment is exactly what we built.
// - static/: the built site (dist/)
// - functions/api/*.func: each API handler bundled into one self-contained ESM file (zod included), so no TypeScript
//   import paths are left to resolve at runtime
// - config.json: security headers and caching, then the filesystem
// Runs only on Vercel (VERCEL=1) or with --force.
import { build } from "esbuild";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";

if (!process.env.VERCEL && !process.argv.includes("--force")) process.exit(0);
const OUT = ".vercel/output";
await rm(OUT, { recursive: true, force: true });
await mkdir(`${OUT}/static`, { recursive: true });
await cp("dist", `${OUT}/static`, { recursive: true });

for (const name of ["analyze", "health"]) {
  const dir = `${OUT}/functions/api/${name}.func`;
  await mkdir(dir, { recursive: true });
  await build({ entryPoints: [`functions/${name}.ts`], outfile: `${dir}/index.mjs`, bundle: true, platform: "node", format: "esm", target: "node22", legalComments: "none", logLevel: "warning" });
  await writeFile(`${dir}/package.json`, JSON.stringify({ type: "module" }));
  await writeFile(`${dir}/.vc-config.json`, JSON.stringify({ runtime: "nodejs22.x", handler: "index.mjs", launcherType: "Nodejs", shouldAddHelpers: true, maxDuration: 60 }, null, 2));
}

const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self'; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
await writeFile(`${OUT}/config.json`, JSON.stringify({
  version: 3,
  routes: [
    { src: "/(.*)", headers: { "Content-Security-Policy": CSP, "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin", "Permissions-Policy": "camera=(), microphone=(), geolocation=()" }, continue: true },
    { src: "^/(index\\.html|sw\\.js)?$", headers: { "Cache-Control": "no-cache" }, continue: true },
    { src: "^/media/(.*)$", headers: { "Cache-Control": "public, max-age=604800" }, continue: true },
    { handle: "filesystem" },
  ],
}, null, 2));
console.log("vercel: build output written");
