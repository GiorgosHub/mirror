// Local server: serves dist/ and the /api functions exactly as Vercel would.
// Run: node --import tsx server/dev.mjs   (PORT, ANTHROPIC_API_KEY, MIRROR_MODEL optional)
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const ROOT = join(process.cwd(), "dist");
const PORT = Number(process.env.PORT || 4173);
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2", ".mp4": "video/mp4", ".webm": "video/webm" };
const SEC = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self'; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
};

const api = {
  "/api/analyze": () => import("../functions/analyze.ts"),
  "/api/health": () => import("../functions/health.ts"),
};

createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  for (const [k, v] of Object.entries(SEC)) res.setHeader(k, v);
  if (api[url.pathname]) {
    let body = "";
    for await (const c of req) body += c;
    const mod = await api[url.pathname]();
    const r = {
      statusCode: 200,
      status(c) { this.statusCode = c; return this; },
      setHeader: (k, v) => res.setHeader(k, v),
      json(b) { res.writeHead(this.statusCode, { "content-type": "application/json" }); res.end(JSON.stringify(b)); },
    };
    try { await mod.default({ method: req.method, body: body ? JSON.parse(body) : undefined }, r); }
    catch { res.writeHead(500); res.end("{}"); }
    return;
  }
  let p = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
  if (p.endsWith("/")) p += "index.html";
  const file = join(ROOT, p);
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  try {
    const s = await stat(file);
    if (!s.isFile()) throw 0;
    const ext = extname(file);
    const range = req.headers.range;
    const data = await readFile(file);
    res.setHeader("content-type", TYPES[ext] || "application/octet-stream");
    res.setHeader("cache-control", ext === ".html" || p.endsWith("sw.js") ? "no-cache" : "public, max-age=3600");
    if (range && (ext === ".mp4" || ext === ".webm")) {
      const [a, b] = range.replace("bytes=", "").split("-");
      const start = Number(a), end = b ? Number(b) : data.length - 1;
      res.writeHead(206, { "content-range": `bytes ${start}-${end}/${data.length}`, "accept-ranges": "bytes", "content-length": end - start + 1 });
      return res.end(data.subarray(start, end + 1));
    }
    res.writeHead(200); res.end(data);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" }); res.end("Not found");
  }
}).listen(PORT, () => console.log(`MIRROR on http://localhost:${PORT}`));
