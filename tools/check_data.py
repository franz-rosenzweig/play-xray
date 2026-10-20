#!/usr/bin/env python3
"""Check the generated JSON in app/data adds up.

    python3 -I tools/check_data.py

For every play: speech line counts match their text, scene totals match their speeches, the play
total matches its scenes, every speaker and silent character exists, nobody is listed without a line,
scene keys are unique, and index.json agrees with the play files. Exits 1 on any problem.
"""
import json
import sys
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "app" / "data"


def main():
    problems = []
    index = json.loads((DATA / "index.json").read_text())
    if len(index["plays"]) != 37:
        problems.append(f"index has {len(index['plays'])} plays, not 37")
    total = 0
    for meta in index["plays"]:
        pid = meta["id"]
        play = json.loads((DATA / f"{pid}.json").read_text())
        n_chars = len(play["chars"])
        spoken = set()
        keys = set()
        play_lines = 0
        scenes = [s for act in play["acts"] for s in act["scenes"]]
        for s in scenes:
            if s["k"] in keys:
                problems.append(f"{pid}: scene key {s['k']} twice")
            keys.add(s["k"])
            lines = 0
            for item in s["b"]:
                if isinstance(item, str):
                    continue
                who = item[0] if isinstance(item[0], list) else [item[0]]
                if any(not 0 <= c < n_chars for c in who):
                    problems.append(f"{pid} {s['k']}: unknown speaker {who}")
                if item[1] != item[2].count("\n") + 1:
                    problems.append(f"{pid} {s['k']}: a speech says {item[1]} lines but has {item[2].count(chr(10)) + 1}")
                if not item[2].strip():
                    problems.append(f"{pid} {s['k']}: an empty speech")
                spoken.update(who)
                lines += item[1]
            if lines != s["n"]:
                problems.append(f"{pid} {s['k']}: scene says {s['n']} lines, speeches add to {lines}")
            if any(not 0 <= c < n_chars for c in s.get("on", [])):
                problems.append(f"{pid} {s['k']}: unknown silent character")
            play_lines += s["n"]
        if play_lines != play["lines"] or play_lines != meta["lines"]:
            problems.append(f"{pid}: totals disagree ({play_lines}, {play['lines']}, {meta['lines']})")
        if len(spoken) != n_chars:
            problems.append(f"{pid}: {n_chars - len(spoken)} characters never speak")
        if meta["spark"] != [s["n"] for s in scenes]:
            problems.append(f"{pid}: index sparkline is out of date")
        total += play_lines
    for p in problems:
        print("!", p)
    print(f"{len(index['plays'])} plays, {total:,} lines, {len(problems)} problems")
    sys.exit(1 if problems else 0)


if __name__ == "__main__":
    main()
