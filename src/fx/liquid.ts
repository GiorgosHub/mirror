/* The liquid mirror.
   A pool of liquid metal under a line of real text. The text is reflected in it; the pointer disturbs the surface,
   and the reflection drifts apart into three ghosts the further it falls: one choice, several futures.

   - The DOM text stays the real, accessible text. Its words are measured and drawn once into a texture.
   - The surface is a small wave simulation on the CPU (two height fields, ~18k cells), uploaded each frame as an
     R16F texture; a WebGL2 fragment shader turns it into normals, reflection, specular light and the split.
   - Runs only while on screen and the tab is visible. Without WebGL2, or with reduced motion, the caller keeps its
     static CSS reflection instead (mount() returns false). */
import { frame, reducedMotion } from "./loop.ts";
import { onDispose } from "../ui/core/island.ts";

export interface LiquidOptions {
  /** the element whose text is reflected (its words are wrapped in .lw spans by the caller) */
  source: HTMLElement;
  /** distance in CSS px between the bottom of the source and the waterline */
  gap?: number;
  /** how far the reflection splits into futures, 0..1 */
  split?: number;
  /** gentle drops when idle */
  rain?: boolean;
  /** how far down the reflection reaches, as a share of the pool depth */
  fade?: number;
}

const VERT = `#version 300 es
in vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
uniform sampler2D uText; uniform sampler2D uH;
uniform vec2 uRes; uniform float uWater; uniform float uSplit; uniform float uTime; uniform float uDpr; uniform vec3 uBase; uniform vec3 uInk; uniform float uLight; uniform float uFade;
out vec4 o;
float ink(vec2 px) {
  if (px.x < 0.0 || px.y < 0.0 || px.x > uRes.x || px.y > uRes.y) return 0.0;
  return texture(uText, px / uRes).a;
}
void main() {
  float x = gl_FragCoord.x;
  float y = uRes.y - gl_FragCoord.y;               // from the top, device px
  float d = y - uWater;                              // depth below the waterline
  if (d < 0.0) { o = vec4(0.0); return; }
  float depth = uRes.y - uWater;
  vec2 uv = vec2(x / uRes.x, d / depth);
  vec2 e = vec2(1.0 / 192.0, 1.0 / 96.0);
  float hl = texture(uH, uv - vec2(e.x, 0.0)).r, hr = texture(uH, uv + vec2(e.x, 0.0)).r;
  float hu = texture(uH, uv - vec2(0.0, e.y)).r, hd = texture(uH, uv + vec2(0.0, e.y)).r;
  vec3 n = normalize(vec3(hl - hr, hu - hd, 0.22));
  // reflection: mirrored about the waterline, foreshortened, displaced by the surface
  float k = 26.0 * uDpr;
  vec2 src = vec2(x + n.x * k, uWater - d * 0.86 + n.y * k);
  // the futures: the reflection drifts apart with depth
  float s = uSplit * d * 0.42;
  float t = 0.0;
  t = max(t, ink(src));
  t = max(t, ink(src + vec2(s, d * 0.06)) * 0.6);
  t = max(t, ink(src - vec2(s, -d * 0.06)) * 0.6);
  float fade = exp(-d / (depth * uFade));
  // the liquid itself: darker with depth, a horizon sheen, light from the upper left
  float sheen = exp(-d / (6.0 * uDpr)) * 0.55;
  vec3 l = normalize(vec3(-0.35, -0.55, 0.75));
  float spec = pow(max(dot(n, l), 0.0), 60.0) * uLight;
  float rim = pow(1.0 - abs(n.z), 2.0) * 0.6;
  vec3 col = uBase * (1.0 - 0.18 * (1.0 - fade));
  col += vec3(0.06, 0.065, 0.075) * (1.0 - uv.y) * 0.6;
  col = mix(col, uInk, clamp(t * fade * 0.46, 0.0, 1.0));
  col += vec3(spec + rim * 0.25 + sheen) * vec3(0.92, 0.94, 0.97);
  o = vec4(col, smoothstep(0.0, 90.0 * uDpr, uRes.y - y));   // the pool fades into the page at its lower edge
}`;

const GW = 192, GH = 96;

function hexToRgb(v: string): [number, number, number] {
  const m = v.trim().match(/^#?([0-9a-f]{6})$/i);
  if (m) { const n = parseInt(m[1]!, 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; }
  const r = v.match(/\d+(\.\d+)?/g)?.map(Number) ?? [28, 31, 36];
  return [r[0]! / 255, r[1]! / 255, r[2]! / 255];
}

/** draw the source's words into a canvas at their on-screen positions, relative to the host */
function paintText(c: HTMLCanvasElement, host: HTMLElement, source: HTMLElement, dpr: number) {
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, c.width, c.height);
  const hr = host.getBoundingClientRect();
  const cs = getComputedStyle(source);
  const size = parseFloat(cs.fontSize);
  g.font = `${cs.fontWeight} ${size * dpr}px ${cs.fontFamily}`;
  const ls = parseFloat(cs.letterSpacing);
  if ("letterSpacing" in g && !isNaN(ls)) (g as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${ls * dpr}px`;
  g.fillStyle = "#fff";
  g.textBaseline = "alphabetic";
  const words = source.querySelectorAll<HTMLElement>(".lw");
  for (const w of words) {
    const r = w.getBoundingClientRect();
    const m = g.measureText(w.textContent ?? "");
    const asc = m.fontBoundingBoxAscent ?? size * dpr * 0.8;
    const desc = m.fontBoundingBoxDescent ?? size * dpr * 0.2;
    const boxH = (asc + desc) / dpr;
    const top = r.top - hr.top + (r.height - boxH) / 2;
    g.fillText(w.textContent ?? "", (r.left - hr.left) * dpr, top * dpr + asc);
  }
  return source.getBoundingClientRect().bottom - hr.top;
}

/** mounts the pool into host (position: relative). Returns false when it can't run (no WebGL2, reduced motion). */
export function mountLiquid(host: HTMLElement, o: LiquidOptions): boolean {
  if (reducedMotion()) return false;
  const canvas = document.createElement("canvas");
  canvas.className = "liquid";
  canvas.setAttribute("aria-hidden", "true");
  const gl = canvas.getContext("webgl2", { antialias: false, alpha: true, premultipliedAlpha: false, powerPreference: "low-power" });
  if (!gl) return false;

  const sh = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader"); return s; };
  let prog: WebGLProgram;
  try {
    prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
  } catch { return false; }
  gl.useProgram(prog);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "p"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = (n: string) => gl.getUniformLocation(prog, n);
  const uRes = U("uRes"), uWater = U("uWater"), uSplit = U("uSplit"), uTime = U("uTime"), uDpr = U("uDpr"), uBase = U("uBase"), uInk = U("uInk"), uLight = U("uLight"), uFade = U("uFade");

  const tex = (unit: number) => { const t = gl.createTexture()!; gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t; };
  const textTex = tex(0), hTex = tex(1);
  gl.uniform1i(U("uText"), 0); gl.uniform1i(U("uH"), 1);

  /* the surface */
  let a = new Float32Array(GW * GH), b = new Float32Array(GW * GH);
  const poke = (gx: number, gy: number, amp: number, rad = 2.2) => {
    const r = Math.ceil(rad);
    for (let y = Math.max(1, Math.floor(gy - r)); y < Math.min(GH - 1, gy + r + 1); y++)
      for (let x = Math.max(1, Math.floor(gx - r)); x < Math.min(GW - 1, gx + r + 1); x++) {
        const dd = Math.hypot(x - gx, y - gy) / rad;
        if (dd < 1) a[y * GW + x]! += amp * (Math.cos(dd * Math.PI) * 0.5 + 0.5);
      }
  };
  const step = () => {
    for (let y = 1; y < GH - 1; y++) for (let x = 1; x < GW - 1; x++) {
      const i = y * GW + x;
      b[i] = ((a[i - 1]! + a[i + 1]! + a[i - GW]! + a[i + GW]!) * 0.5 - b[i]!) * 0.982;
    }
    const t = a; a = b; b = t;
  };

  const textCanvas = document.createElement("canvas");
  let W = 0, H = 0, dpr = 1, water = 0, split = o.split ?? 0.22, energy = 0, light = 0.9;
  const colors = () => {
    const cs = getComputedStyle(host);
    gl.uniform3fv(uBase, hexToRgb(cs.getPropertyValue("--pool") || "#202329"));
    gl.uniform3fv(uInk, hexToRgb(cs.getPropertyValue("--pool-ink") || "#F2F4F7"));
    light = parseFloat(cs.getPropertyValue("--pool-light")) || 0.9;
  };
  const layout = () => {
    const r = host.getBoundingClientRect();
    dpr = Math.min(devicePixelRatio || 1, 1.6);
    W = Math.max(1, Math.round(r.width * dpr)); H = Math.max(1, Math.round(r.height * dpr));
    canvas.width = W; canvas.height = H; textCanvas.width = W; textCanvas.height = H;
    const bottom = paintText(textCanvas, host, o.source, dpr);
    water = (bottom + (o.gap ?? 14)) * dpr;
    gl.viewport(0, 0, W, H);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, textTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, textCanvas);
    host.style.setProperty("--water", `${water / dpr}px`);
    colors();
  };

  /* the pointer disturbs the surface; above the waterline it still nudges the water beneath it */
  let px = -1, py = -1;
  const toGrid = (cx: number, cy: number) => {
    const r = host.getBoundingClientRect();
    const x = cx - r.left, y = cy - r.top, wl = water / dpr, depth = Math.max(1, r.height - wl);
    return { gx: (x / r.width) * GW, gy: y > wl ? ((y - wl) / depth) * GH : 1.5, above: y <= wl };
  };
  const onMove = (e: PointerEvent) => {
    const { gx, gy, above } = toGrid(e.clientX, e.clientY);
    if (px >= 0) {
      const steps = Math.min(8, Math.ceil(Math.hypot(gx - px, gy - py)));
      for (let i = 1; i <= steps; i++) poke(px + ((gx - px) * i) / steps, py + ((gy - py) * i) / steps, above ? 0.35 : 0.9, above ? 3 : 2.4);
      energy = Math.min(1, energy + Math.hypot(gx - px, gy - py) * 0.012);
    }
    px = gx; py = gy;
  };
  const onLeave = () => { px = py = -1; };
  const onDown = (e: PointerEvent) => { const { gx, gy } = toGrid(e.clientX, e.clientY); poke(gx, Math.max(2, gy), 6, 4); energy = 1; };
  host.addEventListener("pointermove", onMove, { passive: true });
  host.addEventListener("pointerleave", onLeave);
  host.addEventListener("pointerdown", onDown, { passive: true });

  let visible = true, stop: (() => void) | null = null, nextDrop = 0;
  const tick = (t: number) => {
    if (o.rain !== false && t > nextDrop) { poke(10 + Math.random() * (GW - 20), 6 + Math.random() * (GH * 0.6), 1.2 + Math.random() * 1.0, 2.5); nextDrop = t + 1600 + Math.random() * 2600; }
    step(); step();
    energy *= 0.97;
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, hTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, GW, GH, 0, gl.RED, gl.FLOAT, a);
    gl.uniform2f(uRes, W, H); gl.uniform1f(uWater, water); gl.uniform1f(uDpr, dpr); gl.uniform1f(uTime, t / 1000);
    gl.uniform1f(uSplit, split + energy * 0.25); gl.uniform1f(uLight, light); gl.uniform1f(uFade, o.fade ?? 0.5);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };
  const io = new IntersectionObserver(([en]) => {
    visible = !!en?.isIntersecting;
    if (visible && !stop) stop = frame(tick);
    if (!visible && stop) { stop(); stop = null; }
  });

  host.prepend(canvas);
  host.classList.add("has-liquid");
  const ro = new ResizeObserver(() => layout());
  const start = () => { if (!host.isConnected) return; layout(); ro.observe(host); io.observe(host); };
  /* measure the words only once the fonts are in and any entrance animation on them has finished */
  const settled = () => Promise.all((o.source.getAnimations?.({ subtree: true }) ?? []).map((an) => an.finished.catch(() => {})));
  void (document.fonts?.ready ?? Promise.resolve()).then(settled).then(() => requestAnimationFrame(start));
  const themeMo = new MutationObserver(colors);
  themeMo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  onDispose(host, () => {
    stop?.(); io.disconnect(); ro.disconnect(); themeMo.disconnect();
    host.removeEventListener("pointermove", onMove); host.removeEventListener("pointerleave", onLeave); host.removeEventListener("pointerdown", onDown);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  });
  return true;
}

/** wraps each word of an element in a .lw span (for measuring); the element's text is unchanged for assistive tech */
export function wrapWords(el: HTMLElement) {
  const text = el.textContent ?? "";
  el.textContent = "";
  text.split(/(\s+)/).forEach((part) => {
    if (!part) return;
    if (/^\s+$/.test(part)) { el.append(" "); return; }
    const s = document.createElement("span"); s.className = "lw"; s.textContent = part; el.append(s);
  });
}
