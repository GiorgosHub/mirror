# Renders scripts/field/render.html frame by frame and encodes web-friendly loops + posters with ffmpeg.
# usage: python3 scripts/field/render.py [--preview]
import base64, os, subprocess, sys, tempfile, pathlib
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / "public" / "media"
W, H, FPS = 1280, 720, 24
html = (ROOT / "scripts/field/render.html").as_uri()
preview = "--preview" in sys.argv
scene = next((a.split("=")[1] for a in sys.argv if a.startswith("--scene=")), "field")
NAME = {"field": "possibility-field", "branch": "branching-light", "threshold": "threshold", "horizon": "horizon", "converge": "convergence"}[scene]
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": W, "height": H})
    pg.goto(f"{html}?w={W}&h={H}&scene={scene}")
    T = pg.evaluate("window.T")
    n = 1 if preview else int(T * FPS)
    tmp = tempfile.mkdtemp()
    for i in range(n):
        url = pg.evaluate(f"window.renderFrame({i if not preview else 60}, {FPS})")
        open(f"{tmp}/f{i:04d}.png", "wb").write(base64.b64decode(url.split(",")[1]))
    b.close()
if preview:
    os.replace(f"{tmp}/f0000.png", f"/tmp/claude-0/-home-claude/f3c91a0b-7f98-5c5a-ba4b-2c72bcf66c9e/scratchpad/prev-{scene}.png"); sys.exit()
OUT.mkdir(parents=True, exist_ok=True)
run = lambda *a: subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *a], check=True)
src = ["-framerate", str(FPS), "-i", f"{tmp}/f%04d.png"]
run(*src, "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "40", "-row-mt", "1", "-pix_fmt", "yuv420p", "-an", str(OUT / f"{NAME}.webm"))
run(*src, "-c:v", "libx264", "-preset", "slow", "-crf", "27", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", str(OUT / f"{NAME}.mp4"))
run("-i", f"{tmp}/f0000.png", "-q:v", "4", str(OUT / f"{NAME}.jpg"))
run("-i", f"{tmp}/f0000.png", "-c:v", "libwebp", "-quality", "78", str(OUT / f"{NAME}.webp"))
print("done", n, "frames")
