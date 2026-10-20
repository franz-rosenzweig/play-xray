#!/bin/bash
# Download the three fonts (latin + latin-ext woff2) and their OFL licences into app/fonts/.
# Run once; the files are committed, so the app never calls Google at runtime.
set -euo pipefail
cd "$(dirname "$0")/../app/fonts"
UA="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
CSS="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400..800;1,400..800&family=Courier+Prime:wght@400;700&family=Caveat:wght@400..700&display=swap"
tmp=$(mktemp)
curl -fsS -A "$UA" "$CSS" -o "$tmp"

# Each @font-face block: /* subset */ family, style, weight, src url. Keep latin and latin-ext only.
python3 -I - "$tmp" <<'PY'
import re, sys, urllib.request
css = open(sys.argv[1]).read()
out = []
for subset, body in re.findall(r"/\* ([\w-]+) \*/\s*@font-face \{(.*?)\}", css, re.S):
    if subset not in ("latin", "latin-ext"):
        continue
    fam = re.search(r"font-family: '([^']+)'", body).group(1)
    style = re.search(r"font-style: (\w+)", body).group(1)
    weight = re.search(r"font-weight: ([\d ]+);", body).group(1)
    url = re.search(r"url\((\S+?)\)", body).group(1)
    rng = re.search(r"unicode-range: ([^;]+);", body).group(1)
    name = f"{fam.lower().replace(' ', '')}-{style}-{weight.split()[0]}-{subset}.woff2"
    urllib.request.urlretrieve(url, name)
    out.append(f"/* {fam} {style} {weight}, {subset} */\n@font-face {{\n  font-family: '{fam}';\n"
               f"  font-style: {style};\n  font-weight: {weight};\n  font-display: swap;\n"
               f"  src: url({name}) format('woff2');\n  unicode-range: {rng};\n}}\n")
open("fonts.css", "w").write("\n".join(out))
print(len(out), "font files")
PY
rm -f "$tmp"
for f in ebgaramond courierprime caveat; do
  curl -fsS "https://raw.githubusercontent.com/google/fonts/main/ofl/$f/OFL.txt" -o "OFL-$f.txt"
done
ls -la
