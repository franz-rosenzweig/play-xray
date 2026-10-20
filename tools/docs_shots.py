#!/usr/bin/env python3
"""Take the screenshots the README and docs use, and the stuffs cover.

    python3 tools/docs_shots.py [BASE_URL] [--cover PATH]

Writes PNGs to docs/images/ (desktop shots at 1440x900, phone shots at 390x844 and 2x, combined
three to a picture) and, with --cover, a 1280x800 WebP of the scene chart.
"""
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from cdp import Browser  # noqa: E402

args = [a for a in sys.argv[1:] if not a.startswith("--")]
BASE = args[0] if args else "http://127.0.0.1:8450/play-xray/"
COVER = sys.argv[sys.argv.index("--cover") + 1] if "--cover" in sys.argv else None
OUT = Path(__file__).resolve().parent.parent / "docs" / "images"
OUT.mkdir(parents=True, exist_ok=True)


def open_at(b, route, prefs=None, wait=0.8):
    b.go(BASE + "#/", 0.6)
    b.js(f"localStorage.setItem('play-xray:prefs', {repr(__import__('json').dumps(prefs or {}))})")
    b.call("Page.reload", ignoreCache=True)
    b.pump(0.8)
    b.js(f"location.hash = {route!r}")
    b.wait_for("window.__xray && window.__xray.ready() && document.fonts.status === 'loaded'", 15)
    b.pump(wait)


def hover(b, selector, index=0):
    b.js(f"""(() => {{ const el = document.querySelectorAll({selector!r})[{index}]; const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      (document.elementFromPoint(x, y) || el).dispatchEvent(new PointerEvent('pointermove', {{bubbles: true, clientX: x, clientY: y, pointerType: 'mouse'}})); }})()""")
    b.pump(0.3)


def desktop(b):
    for dark in (False, True):
        tag = "dark" if dark else "light"
        b.size(1440, 900, dark=dark)
        open_at(b, "#/")
        b.shot(OUT / f"shelf-{tag}.png")
        open_at(b, "#/hamlet", {"min": 25})
        b.shot(OUT / f"chart-{tag}.png")
        open_at(b, "#/hamlet/ribbons")
        b.shot(OUT / f"ribbons-{tag}.png")
        if not dark:
            open_at(b, "#/hamlet")
            hover(b, ".chart .mark.k0", 6)
            b.shot(OUT / "chart-tooltip.png")
            open_at(b, "#/antony-and-cleopatra", {"min": 10})
            b.shot(OUT / "chart-antony.png")
            open_at(b, "#/hamlet/cast")
            b.shot(OUT / "cast.png")
            open_at(b, "#/titus-andronicus/stage")
            b.shot(OUT / "stage.png")
            open_at(b, "#/hamlet/3.1")
            b.shot(OUT / "reader.png")
            bi = b.js("[...document.querySelectorAll('.speech')].find(s => s.textContent.includes('To be, or not to be')).dataset.bi")
            open_at(b, f"#/hamlet/3.1/s{bi}")
            b.shot(OUT / "reader-speech.png")
            open_at(b, "#/all")
            b.shot(OUT / "across.png")
            b.js("window.scrollTo(0, document.querySelector('.roles').getBoundingClientRect().top + scrollY - 120)")
            b.pump(0.3)
            b.shot(OUT / "roles.png")
            open_at(b, "#/the-tempest/ribbons", {"detail": "close"})
            b.shot(OUT / "ribbons-close.png")


def phones(b):
    for dark in (False, True):
        tag = "dark" if dark else "light"
        b.size(390, 844, mobile=True, scale=2, dark=dark)
        parts = []
        for route, prefs in (("#/macbeth", {"min": 10}), ("#/macbeth/cast", None), ("#/macbeth/1.7", None)):
            open_at(b, route, prefs)
            path = OUT / f".phone-{len(parts)}.png"
            b.shot(path)
            parts.append(path)
        combine(parts, OUT / f"phones-{tag}.png", dark)
        for p in parts:
            p.unlink()


def combine(paths, out, dark):
    ims = [Image.open(p).convert("RGB") for p in paths]
    w, h = ims[0].size
    gap, pad = 60, 60
    sheet = Image.new("RGB", (pad * 2 + w * 3 + gap * 2, pad * 2 + h), (10, 19, 23) if dark else (243, 236, 220))
    for i, im in enumerate(ims):
        sheet.paste(im, (pad + i * (w + gap), pad))
    sheet = sheet.resize((sheet.width // 2, sheet.height // 2), Image.LANCZOS)
    sheet.save(out, optimize=True)


def cover(b, path):
    b.size(1440, 900)
    open_at(b, "#/hamlet", {"min": 25})
    tmp = OUT / ".cover.png"
    b.shot(tmp)
    im = Image.open(tmp).convert("RGB").resize((1280, 800), Image.LANCZOS)
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    im.save(path, quality=85, method=6)
    tmp.unlink()
    print(path)


def main():
    b = Browser()
    try:
        desktop(b)
        phones(b)
        if COVER:
            cover(b, COVER)
    finally:
        errors = list(b.errors)
        b.close()
    for e in errors:
        print("! page:", e)
    for p in sorted(OUT.glob("*.png")):
        print(p.name, Image.open(p).size)


if __name__ == "__main__":
    main()
