// Builds a single self-contained page for the hosted preview (dist-embed/index.html): JS, CSS and fonts inlined,
// downloads replaced by copyable text, no service worker. Media files sit beside it in dist-embed/media/.
import { build } from "esbuild";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";

await rm("dist-embed", { recursive: true, force: true });
await mkdir("dist-embed/media", { recursive: true });
const js = await build({ entryPoints: ["src/main.ts"], bundle: true, format: "esm", minify: true, write: false, target: ["es2022", "safari16"], define: { __EMBED__: "true" }, legalComments: "none" });
const css = await build({ entryPoints: ["src/styles/index.css"], bundle: true, minify: true, write: false, external: ["/fonts/*"] });
let style = css.outputFiles[0].text;
for (const f of ["Inter-var.woff2", "BricolageGrotesque-Bold.woff", "BricolageGrotesque-Regular.woff", "Greek-Display-Bold.woff", "Greek-Display-Regular.woff", "Greek-Text-Regular.woff", "Greek-Text-SemiBold.woff", "Greek-Text-Bold.woff"]) {
  const b64 = (await readFile(`public/fonts/${f}`)).toString("base64");
  style = style.replaceAll(`url(/fonts/${f})`, `url(data:font/${f.endsWith("woff2") ? "woff2" : "woff"};base64,${b64})`);
}
const code = js.outputFiles[0].text.replaceAll("</script", "<\\/script");
const html = `<title>MIRROR</title>
<meta name="description" content="Meet the futures you could make: explore a decision, its possible futures and what they depend on.">
<meta name="theme-color" content="#0B0D12">
<style>${style}</style>
<div id="app"></div>
<script type="module">${code}</script>
`;
await writeFile("dist-embed/index.html", html);
for (const f of await (await import("node:fs/promises")).readdir("public/media")) await cp(`public/media/${f}`, `dist-embed/media/${f}`);
console.log("embed:", (html.length / 1024).toFixed(0) + " KB");
