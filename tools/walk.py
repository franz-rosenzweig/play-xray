#!/usr/bin/env python3
"""Walk through Play X-Ray in headless Chrome: check every screen, shoot every screen.

    python3 tools/walk.py [BASE_URL] [OUT_DIR] [--quick] [--no-shots]

BASE_URL defaults to the local stuffs server (http://127.0.0.1:8450/play-xray/), OUT_DIR to
/tmp/play-xray-walk. It checks the shelf, search, the scene chart and its controls and tooltip,
the cast, ribbons, shared stage, the reader, the comparison page, the theme switch, a browser with
storage turned off, no sideways scrolling on a phone, and every one of the 37 plays. Screenshots
are taken at 1440x900 and phone size (390 wide), light and dark. Prints one line per check and any
page errors, and exits 1 if anything failed.
"""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from cdp import Browser  # noqa: E402

args = [a for a in sys.argv[1:] if not a.startswith("--")]
BASE = args[0] if args else "http://127.0.0.1:8450/play-xray/"
OUT = Path(args[1] if len(args) > 1 else "/tmp/play-xray-walk")
QUICK = "--quick" in sys.argv
SHOTS = "--no-shots" not in sys.argv
BASE = BASE if BASE.endswith("/") else BASE + "/"

failed = []
passed = 0


def check(name, ok, detail=""):
    global passed
    if ok:
        passed += 1
        print(f"  ok   {name}")
    else:
        failed.append(name)
        print(f"  FAIL {name} {detail}")


def ready(b):
    return b.wait_for("window.__xray && window.__xray.ready() && document.fonts.status === 'loaded'", 15)


def visit(b, route, settle=0.4):
    b.js(f"location.hash = {route!r}") if b.js("location.href.startsWith(%r)" % BASE) else b.go(BASE + route, 1)
    ready(b)
    b.pump(settle)


def mouse(b, selector, dx=0.5, dy=0.5, event="pointermove"):
    """Fire a mouse pointer event at a point inside the first element matching selector."""
    return b.js(f"""(() => {{
      const el = document.querySelector({selector!r}); if (!el) return false;
      const r = el.getBoundingClientRect();
      const x = r.left + r.width * {dx}, y = r.top + r.height * {dy};
      const target = document.elementFromPoint(x, y) || el;
      target.dispatchEvent(new PointerEvent({event!r}, {{bubbles: true, clientX: x, clientY: y, pointerType: 'mouse'}}));
      return true; }})()""")


def functional(b):
    print("Shelf")
    b.size(1440, 900)
    b.go(BASE, 1)
    ready(b)
    check("37 plays on the shelf", b.js("document.querySelectorAll('.card').length") == 37)
    check("four genre shelves", b.js("document.querySelectorAll('.shelf').length") == 4)
    b.js("const s = document.querySelector('.search'); s.value = 'falstaff'; s.dispatchEvent(new Event('input'))")
    shown = b.js("[...document.querySelectorAll('.card:not([hidden])')].map(c => c.getAttribute('href'))")
    check("search finds a character", set(shown) >= {"#/merry-wives", "#/henry-iv-1", "#/henry-iv-2"}, shown)
    b.js("const s = document.querySelector('.search'); s.value = 'zzzz'; s.dispatchEvent(new Event('input'))")
    check("search with no match says so", "Nothing" in b.js("document.querySelector('.count').textContent"))

    print("Scene chart")
    visit(b, "#/hamlet")
    n_chars = b.js("document.querySelectorAll('.rowname').length")
    check("a row for every speaking part", n_chars == 35, n_chars)
    check("a link for every scene", b.js("document.querySelectorAll('.scenelink').length") == 20)
    check("marks drawn", b.js("document.querySelectorAll('.chart .mark').length") > 100)
    check("silent presence hatched", b.js("document.querySelectorAll('.chart rect.silent').length") >= 5)
    b.js("[...document.querySelectorAll('.segbtn')].find(x => x.textContent === 'Most lines').click()")
    b.pump(0.2)
    check("order by most lines puts Hamlet first", b.js("document.querySelector('.rowname .nm').textContent") == "Hamlet")
    b.js("const s = document.querySelector('.selwrap select'); s.value = '50'; s.dispatchEvent(new Event('change'))")
    b.pump(0.2)
    check("hide parts under 50 lines", b.js("document.querySelectorAll('.rowname').length") == 13,
          b.js("document.querySelectorAll('.rowname').length"))
    fit_w = b.js("document.querySelector('.chart').getAttribute('width')")
    b.js("[...document.querySelectorAll('.segbtn')].find(x => x.textContent === 'Wide').click()")
    b.pump(0.2)
    wide_w = b.js("document.querySelector('.chart').getAttribute('width')")
    check("wide makes the chart wider", float(wide_w) > float(fit_w), (fit_w, wide_w))
    b.js("[...document.querySelectorAll('.segbtn')].find(x => x.textContent === 'Fit').click()")
    mouse(b, ".chart .mark.k0")
    tip = b.js("document.querySelector('.tip')?.style.display === 'block' && document.querySelector('.tip').textContent")
    check("hovering a mark shows the lines", bool(tip) and "Hamlet" in tip and "lines" in tip, tip)
    mouse(b, ".chart .mark.k0", event="pointerdown")
    mouse(b, ".chart .mark.k0", event="click")
    b.pump(0.6)
    check("clicking a column opens the reader", b.js("location.hash").startswith("#/hamlet/"))
    # Leave the settings as they were for the screenshots.
    b.js("localStorage.removeItem('play-xray:prefs')")

    print("Cast")
    visit(b, "#/hamlet/cast")
    first = b.js("document.querySelector('.cast tbody tr .partname').textContent")
    check("Hamlet heads the cast", first == "Hamlet", first)
    check("Hamlet has 1,495 lines", b.js("document.querySelector('.cast tbody tr .linescol .n').textContent") == "1,495")
    b.js("document.querySelector('.cast .smallparts') && [...document.querySelectorAll('.btn')].find(x => x.textContent.startsWith('Show the')).click()")
    check("small parts open up", b.js("!document.querySelector('.smallparts').hidden"))
    href = b.js("document.querySelector('.cast tbody tr .pill').getAttribute('href')")
    visit(b, href)
    check("longest speech opens marked in the reader", b.js("!!document.querySelector('.speech.marked')"), href)

    print("Ribbons")
    visit(b, "#/hamlet/ribbons")
    check("nine ribbons", b.js("document.querySelectorAll('path.ribbon').length") == 9)
    check("ribbons are named", b.js("document.querySelectorAll('.rlabel').length") >= 4)
    mouse(b, ".ribbons", 0.42, 0.5)
    check("hovering the ribbons shows a scene", "Act" in (b.js("document.querySelector('.tip').textContent") or ""))

    print("Shared stage")
    visit(b, "#/hamlet/stage")
    check("grid of the top 12", b.js("document.querySelectorAll('.matrix .mrow').length") == 12)
    check("partners list for Hamlet", b.js("document.querySelector('.sidehead').textContent") == "Hamlet")
    visit(b, "#/hamlet/stage/2")
    check("picking Horatio", b.js("document.querySelector('.sidehead').textContent") == "Horatio")
    check("Horatio's partners listed", b.js("document.querySelectorAll('.plist li').length") >= 5)

    print("Reader")
    visit(b, "#/hamlet/3.1")
    check("To be, or not to be", "To be, or not to be" in b.js("document.querySelector('.script').textContent"))
    check("speaker names coloured", b.js("document.querySelectorAll('.speaker span[class^=t]').length") > 10)
    check("stage directions shown", b.js("document.querySelectorAll('.script .sd').length") >= 3)
    check("strip of who speaks when", b.js("document.querySelectorAll('.stripsvg rect').length") > 20)
    b.js("document.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight'}))")
    b.pump(0.6)
    check("right arrow goes to the next scene", b.js("location.hash") == "#/hamlet/3.2")
    visit(b, "#/henry-iv-2/ep")
    check("epilogue opens", "Epilogue" in b.js("document.querySelector('.scenekicker').textContent"))
    visit(b, "#/nonsense")
    check("unknown play says so", "no play" in b.js("document.querySelector('.empty').textContent"))

    print("All 37")
    visit(b, "#/all")
    check("37 rows compared", b.js("document.querySelectorAll('a.crow').length") == 37)
    check("20 longest roles", b.js("document.querySelectorAll('.roles li').length") == 20)
    b.js("[...document.querySelectorAll('.segbtn')].find(x => x.textContent === 'Length').click()")
    b.pump(0.2)
    check("sort by length puts Hamlet first", b.js("document.querySelector('a.crow .ct').textContent") == "Hamlet")
    b.js("localStorage.removeItem('play-xray:prefs')")

    print("Theme")
    visit(b, "#/")
    b.js("document.getElementById('theme').click()")
    check("film switch sets dark", b.js("document.documentElement.dataset.theme") == "dark")
    b.go(BASE, 1)
    ready(b)
    check("film is remembered", b.js("document.documentElement.dataset.theme") == "dark")
    b.js("document.getElementById('theme').click()")
    check("back to following the system", b.js("document.documentElement.dataset.theme") in (None, ""))

    if not QUICK:
        print("Every play")
        ids = b.js("fetch('data/index.json').then(r => r.json()).then(d => d.plays.map(p => p.id))")
        bad = []
        for pid in ids:
            for view in ("", "/cast", "/ribbons", "/stage", "/read"):
                visit(b, f"#/{pid}{view}", 0.05)
                if not b.js("!!document.querySelector('.sheet') && !document.querySelector('.empty')"):
                    bad.append(pid + view)
        check(f"all {len(ids)} plays draw every view", not bad, bad)


def touch(b):
    print("Touch")
    b.size(390, 844, mobile=True, scale=2)
    b.go(BASE + "#/macbeth", 1)
    ready(b)
    b.pump(0.4)
    for ev in ("pointerdown", "click"):
        b.js(f"""(() => {{ const el = document.querySelector('.chart .mark.k0'); const r = el.getBoundingClientRect();
          const x = r.left + r.width / 2, y = r.top + r.height / 2;
          (document.elementFromPoint(x, y) || el).dispatchEvent(new PointerEvent({ev!r}, {{bubbles: true, clientX: x, clientY: y, pointerType: 'touch'}})); }})()""")
    b.pump(0.3)
    check("tapping a mark pins a slip with Read", b.js("!!document.querySelector('.tip.pinned .tiplink')") and
          b.js("location.hash") == "#/macbeth")
    b.js("document.querySelector('.tip .tiplink').click()")
    b.pump(0.6)
    check("Read on the slip opens the scene", b.js("!!document.querySelector('.script')"))
    visit(b, "#/macbeth")
    b.js("[...document.querySelectorAll('.segbtn')].find(x => x.textContent === 'Wide').click()")
    b.pump(0.3)
    check("wide chart scrolls inside, not the page", b.js(
        "document.querySelector('.scroller').scrollWidth > document.querySelector('.scroller').clientWidth"
        " && document.documentElement.scrollWidth <= 390"))
    b.js("localStorage.clear()")


def no_storage(b):
    print("Storage turned off")
    b.call("Page.addScriptToEvaluateOnNewDocument", source="""
      Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } });""")
    b.size(1440, 900)
    b.go(BASE + "#/macbeth", 1)
    ready(b)
    check("still draws the chart", b.js("document.querySelectorAll('.chart .mark').length") > 50)
    b.js("[...document.querySelectorAll('.segbtn')].find(x => x.textContent === 'Most lines').click()")
    check("controls still work", b.js("document.querySelector('.rowname .nm').textContent") == "Macbeth")


SCREENS = [
    ("shelf", "#/"),
    ("chart", "#/hamlet"),
    ("cast", "#/hamlet/cast"),
    ("ribbons", "#/hamlet/ribbons"),
    ("stage", "#/hamlet/stage"),
    ("reader", "#/hamlet/3.1"),
    ("across", "#/all"),
]


def shots(b):
    print("Screenshots and phone width")
    b.go(BASE, 1)
    b.js("localStorage.clear()")       # shoot the screens with their first-visit settings
    b.call("Page.reload", ignoreCache=True)
    ready(b)
    for mode in ("desktop", "phone"):
        for dark in (False, True):
            b.size(390, 844, mobile=True, scale=2, dark=dark) if mode == "phone" else b.size(1440, 900, dark=dark)
            b.go(BASE + "#/", 1.0)
            for name, route in SCREENS:
                visit(b, route, 0.6)
                b.js("window.scrollTo(0, 0)")
                b.pump(0.2)
                if mode == "phone":
                    sw = b.js("document.documentElement.scrollWidth")
                    check(f"{name} fits a phone ({'dark' if dark else 'light'})", sw <= 390, sw)
                if SHOTS:
                    b.shot(OUT / f"{name}-{mode}-{'dark' if dark else 'light'}.png")


def main():
    t = time.time()
    b = Browser()
    try:
        functional(b)
        touch(b)
        shots(b)
    finally:
        errors = list(b.errors)
        b.close()
    b2 = Browser()
    try:
        no_storage(b2)
    finally:
        errors += b2.errors
        b2.close()
    errors = [e for e in errors if "blocked" not in e]
    check("no page errors", not errors, "\n    " + "\n    ".join(errors[:10]))
    print(f"\n{passed} passed, {len(failed)} failed in {time.time() - t:.0f}s" + (f"; shots in {OUT}" if SHOTS else ""))
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
