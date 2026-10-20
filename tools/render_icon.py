#!/usr/bin/env python3
"""Render app/icon.svg to the PNG icons with headless Chrome.

    python3 tools/render_icon.py

icon-512.png and icon-192.png keep the rounded corners (for the manifest and the README);
icon-180.png is full-bleed for the iPhone/iPad Home Screen, which rounds the corners itself.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from cdp import Browser  # noqa: E402

APP = Path(__file__).resolve().parent.parent / "app"


def main():
    svg = (APP / "icon.svg").read_text()
    b = Browser()
    try:
        for size, rounded, name in ((512, True, "icon-512.png"), (192, True, "icon-192.png"),
                                    (180, False, "icon-180.png")):
            art = svg if rounded else svg.replace('rx="112"', 'rx="0"')
            page = ("<!doctype html><html><head><style>html,body{margin:0;background:transparent}"
                    f"svg{{display:block;width:{size}px;height:{size}px}}</style></head><body>{art}</body></html>")
            tmp = APP.parent / "tools" / ".icon.html"
            tmp.write_text(page)
            b.size(size, size)
            b.go(tmp.as_uri(), wait=0.5)
            b.shot(APP / name, transparent=rounded)
            tmp.unlink()
            print(APP / name)
    finally:
        b.close()


if __name__ == "__main__":
    main()
