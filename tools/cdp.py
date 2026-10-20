"""A tiny Chrome DevTools Protocol client for the icon renderer and the test walk.

Starts headless Chrome (Chrome for Testing in ~/.local/opt by default, or $CHROME), opens one page
and lets you navigate, evaluate JavaScript and take screenshots. Collects page errors as it goes.
Needs the websocket-client package.
"""
import base64
import json
import os
import shutil
import subprocess
import tempfile
import time
import urllib.request
from pathlib import Path

import websocket

CHROME = os.environ.get("CHROME", str(Path.home() / ".local/opt/google/chrome-linux64/chrome"))


class Browser:
    def __init__(self):
        self.profile = tempfile.mkdtemp(prefix="play-xray-chrome-")
        self.proc = subprocess.Popen(
            [CHROME, "--headless=new", "--no-sandbox", "--hide-scrollbars", "--mute-audio",
             "--remote-allow-origins=*", "--remote-debugging-port=0", f"--user-data-dir={self.profile}",
             "about:blank"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        port_file = Path(self.profile) / "DevToolsActivePort"
        for _ in range(150):
            if port_file.exists() and port_file.read_text().strip():
                break
            time.sleep(0.1)
        port = port_file.read_text().split()[0]
        pages = json.load(urllib.request.urlopen(f"http://127.0.0.1:{port}/json/list"))
        page = next(p for p in pages if p["type"] == "page")
        self.ws = websocket.create_connection(page["webSocketDebuggerUrl"], timeout=60)
        self.ids = 0
        self.errors = []
        for domain in ("Page", "Runtime", "Log"):
            self.call(f"{domain}.enable")

    # -- plumbing
    def call(self, method, **params):
        self.ids += 1
        mid = self.ids
        self.ws.send(json.dumps({"id": mid, "method": method, "params": params}))
        while True:
            msg = json.loads(self.ws.recv())
            self._note(msg)
            if msg.get("id") == mid:
                if "error" in msg:
                    raise RuntimeError(f"{method}: {msg['error']}")
                return msg.get("result", {})

    def _note(self, msg):
        p = msg.get("params", {})
        m = msg.get("method")
        if m == "Runtime.exceptionThrown":
            d = p["exceptionDetails"]
            self.errors.append(d.get("exception", {}).get("description") or d.get("text"))
        elif m == "Runtime.consoleAPICalled" and p.get("type") == "error":
            self.errors.append(" ".join(str(a.get("value", a.get("description", ""))) for a in p["args"]))
        elif m == "Log.entryAdded" and p["entry"]["level"] == "error":
            self.errors.append(f'{p["entry"]["text"]} {p["entry"].get("url", "")}'.strip())

    def pump(self, seconds):
        self.ws.settimeout(0.1)
        end = time.time() + seconds
        while time.time() < end:
            try:
                self._note(json.loads(self.ws.recv()))
            except websocket.WebSocketTimeoutException:
                pass
        self.ws.settimeout(60)

    # -- helpers
    def size(self, width, height, mobile=False, scale=1, dark=False):
        self.call("Emulation.setDeviceMetricsOverride", width=width, height=height,
                  deviceScaleFactor=scale, mobile=mobile)
        self.call("Emulation.setTouchEmulationEnabled", enabled=mobile)
        self.call("Emulation.setEmulatedMedia", features=[
            {"name": "prefers-color-scheme", "value": "dark" if dark else "light"}])

    def go(self, url, wait=1.0):
        self.call("Page.navigate", url=url)
        self.pump(wait)

    def js(self, code):
        if code.lstrip().startswith(("const ", "let ")):
            code = "{" + code + "}"          # keep each snippet's names to itself
        r = self.call("Runtime.evaluate", expression=code, awaitPromise=True, returnByValue=True)
        if "exceptionDetails" in r:
            raise RuntimeError(r["exceptionDetails"].get("exception", {}).get("description", code))
        return r.get("result", {}).get("value")

    def wait_for(self, code, timeout=10):
        end = time.time() + timeout
        while time.time() < end:
            if self.js(code):
                return True
            self.pump(0.1)
        return False

    def shot(self, path, full=False, transparent=False):
        params = {"format": "png"}
        if transparent:
            self.call("Emulation.setDefaultBackgroundColorOverride", color={"r": 0, "g": 0, "b": 0, "a": 0})
        if full:
            m = self.call("Page.getLayoutMetrics")["cssContentSize"]
            params.update(captureBeyondViewport=True,
                          clip={"x": 0, "y": 0, "width": m["width"], "height": m["height"], "scale": 1})
        data = base64.b64decode(self.call("Page.captureScreenshot", **params)["data"])
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        Path(path).write_bytes(data)
        return path

    def close(self):
        try:
            self.ws.close()
        finally:
            self.proc.kill()
            self.proc.wait()
            shutil.rmtree(self.profile, ignore_errors=True)
