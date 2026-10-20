#!/usr/bin/env python3
"""Build Play X-Ray's data from the Moby Shakespeare text at shakespeare.mit.edu.

    python3 -I tools/build_data.py [--cache DIR] [--out app/data] [--quiet]

Downloads each play's full.html once into the cache dir (default: a folder in the
system temp dir), parses it and writes:

    app/data/index.json      every play: title, genre, year, lines, parts, sparkline, biggest role,
                             plus the longest roles across all plays
    app/data/<play>.json     acts -> scenes -> the text, speech by speech, with stage directions

A play file is {"id", "title", "short", "genre", "year", "source", "lines", "chars": [{"n": name,
"g": 1 if a group like "All"}], "acts": [{"a": 3, "t": "Act 3", "scenes": [...]}]}, and a scene is
(see docs/DEVELOPING.md):
    {"k": "3.1", "s": 1, "t": "3.1", "loc": "A room in the castle.", "n": 202,
     "b": [ "Enter KING CLAUDIUS ...",                 a string is a stage direction
            [4, 2, "line one\\nline two"],              a speech: character index, line count, the lines
            [[2, 7], 1, "Well met, Master Ford."],      several characters speaking together
            [4, 1, "more of the same speech", 1] ],     a speech carried on after a direction
     "on": [9, 12]}                                     silent on stage (named in an entrance)

Prints what it had to guess (joined label pieces, dropped page headers, unknown speakers).
"""
import argparse
import html
import json
import re
import sys
import tempfile
import time
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path

SOURCE = "https://shakespeare.mit.edu/{}/full.html"

# (folder on the MIT site, our id, title, short title, genre, approximate year written)
# Genres follow the MIT site's three columns, except the four late plays, which are Romances.
# Years are the usual modern estimates (roughly the Oxford chronology), so treat them as "about".
PLAYS = [
    ("allswell", "alls-well", "All's Well That Ends Well", "All's Well", "Comedy", 1605),
    ("asyoulikeit", "as-you-like-it", "As You Like It", "As You Like It", "Comedy", 1599),
    ("comedy_errors", "comedy-of-errors", "The Comedy of Errors", "Comedy of Errors", "Comedy", 1594),
    ("lll", "loves-labours-lost", "Love's Labour's Lost", "Love's Labour's Lost", "Comedy", 1595),
    ("measure", "measure-for-measure", "Measure for Measure", "Measure for Measure", "Comedy", 1603),
    ("merry_wives", "merry-wives", "The Merry Wives of Windsor", "Merry Wives", "Comedy", 1597),
    ("merchant", "merchant-of-venice", "The Merchant of Venice", "Merchant of Venice", "Comedy", 1596),
    ("midsummer", "midsummer", "A Midsummer Night's Dream", "Midsummer", "Comedy", 1595),
    ("much_ado", "much-ado", "Much Ado About Nothing", "Much Ado", "Comedy", 1598),
    ("taming_shrew", "taming-of-the-shrew", "The Taming of the Shrew", "Taming of the Shrew", "Comedy", 1591),
    ("troilus_cressida", "troilus-and-cressida", "Troilus and Cressida", "Troilus & Cressida", "Comedy", 1602),
    ("twelfth_night", "twelfth-night", "Twelfth Night", "Twelfth Night", "Comedy", 1601),
    ("two_gentlemen", "two-gentlemen", "The Two Gentlemen of Verona", "Two Gentlemen", "Comedy", 1590),
    ("1henryiv", "henry-iv-1", "Henry IV, Part 1", "1 Henry IV", "History", 1597),
    ("2henryiv", "henry-iv-2", "Henry IV, Part 2", "2 Henry IV", "History", 1598),
    ("henryv", "henry-v", "Henry V", "Henry V", "History", 1599),
    ("1henryvi", "henry-vi-1", "Henry VI, Part 1", "1 Henry VI", "History", 1592),
    ("2henryvi", "henry-vi-2", "Henry VI, Part 2", "2 Henry VI", "History", 1591),
    ("3henryvi", "henry-vi-3", "Henry VI, Part 3", "3 Henry VI", "History", 1591),
    ("henryviii", "henry-viii", "Henry VIII", "Henry VIII", "History", 1613),
    ("john", "king-john", "King John", "King John", "History", 1596),
    ("richardii", "richard-ii", "Richard II", "Richard II", "History", 1595),
    ("richardiii", "richard-iii", "Richard III", "Richard III", "History", 1593),
    ("cleopatra", "antony-and-cleopatra", "Antony and Cleopatra", "Antony & Cleopatra", "Tragedy", 1606),
    ("coriolanus", "coriolanus", "Coriolanus", "Coriolanus", "Tragedy", 1608),
    ("hamlet", "hamlet", "Hamlet", "Hamlet", "Tragedy", 1600),
    ("julius_caesar", "julius-caesar", "Julius Caesar", "Julius Caesar", "Tragedy", 1599),
    ("lear", "king-lear", "King Lear", "King Lear", "Tragedy", 1606),
    ("macbeth", "macbeth", "Macbeth", "Macbeth", "Tragedy", 1606),
    ("othello", "othello", "Othello", "Othello", "Tragedy", 1604),
    ("romeo_juliet", "romeo-and-juliet", "Romeo and Juliet", "Romeo & Juliet", "Tragedy", 1595),
    ("timon", "timon-of-athens", "Timon of Athens", "Timon of Athens", "Tragedy", 1605),
    ("titus", "titus-andronicus", "Titus Andronicus", "Titus Andronicus", "Tragedy", 1592),
    ("cymbeline", "cymbeline", "Cymbeline", "Cymbeline", "Romance", 1610),
    ("pericles", "pericles", "Pericles, Prince of Tyre", "Pericles", "Romance", 1607),
    ("tempest", "the-tempest", "The Tempest", "The Tempest", "Romance", 1611),
    ("winters_tale", "winters-tale", "The Winter's Tale", "The Winter's Tale", "Romance", 1610),
]

# Speaker labels that are the same person within one play (upper-case label -> upper-case label).
# Applied after case and spacing are evened out, so "Nurse" and "NURSE" already match.
ALIASES = {
    "1henryiv": {"WORCESTER": "EARL OF WORCESTER", "CARRIER": "FIRST CARRIER"},
    "2henryiv": {"KING HENRY V": "PRINCE HENRY"},
    "1henryvi": {"SU FFOLK": "SUFFOLK", "RICHARD PLANTAGENET": "YORK", "PLANTAGENET": "YORK",
                 "BISHOP OF WINCHESTER": "WINCHESTER", "CARDINAL OF WINCHESTER": "WINCHESTER",
                 "OF WINCHESTER": "WINCHESTER", "OF AUVERGNE": "COUNTESS OF AUVERGNE",
                 "FIRST SERVING-MAN": "FIRST SERVINGMAN", "SECOND SERVING-MAN": "SECOND SERVINGMAN",
                 "THIRD SERVING-MAN": "THIRD SERVINGMAN"},
    "2henryvi": {"FIRST MURDER": "FIRST MURDERER"},
    "3henryvi": {"RICHARD": "GLOUCESTER", "EDWARD": "KING EDWARD IV", "GEORGE": "CLARENCE",
                 "PRINCE": "PRINCE EDWARD"},
    "comedy_errors": {"OF EPHESUS": "ANTIPHOLUS OF EPHESUS", "OF SYRACUSE": "ANTIPHOLUS OF SYRACUSE"},
    "coriolanus": {"MARCIUS": "CORIOLANUS", "TITUS": "LARTIUS"},
    "henryv": {"FRENCH KING": "KING OF FRANCE"},
    "henryviii": {"KATHARINE": "QUEEN KATHARINE"},
    "julius_caesar": {"GHOST": "CAESAR"},
    "john": {"ELINOR": "QUEEN ELINOR"},
    "lear": {"LEAR": "KING LEAR"},
    "lll": {"ARMADO": "DON ADRIANO DE ARMADO", "ADRIANO DE ARMADO": "DON ADRIANO DE ARMADO"},
    "measure": {"DUKE": "DUKE VINCENTIO", "POMPHEY": "POMPEY"},
    # The mechanicals' play: count the parts as the actors who play them.
    "midsummer": {"HERNIA": "HERMIA", "PYRAMUS": "BOTTOM", "THISBE": "FLUTE", "WALL": "SNOUT",
                  "MOONSHINE": "STARVELING", "LION": "SNUG", "PROLOGUE": "QUINCE"},
    "othello": {"SECOND GENTLEMEN": "SECOND GENTLEMAN"},
    "richardiii": {"KING RICHARD III": "GLOUCESTER", "LORD STANLEY": "STANLEY", "DERBY": "STANLEY",
                   "GHOST OF CLARENCE": "CLARENCE", "GHOST OF RIVERS": "RIVERS", "GHOST OF GREY": "GREY",
                   "GHOST OF VAUGHAN": "VAUGHAN", "GHOST OF HASTINGS": "HASTINGS",
                   "GHOST OF LADY ANNE": "LADY ANNE", "GHOST OF BUCKINGHAM": "BUCKINGHAM"},
    "taming_shrew": {"KATARINA": "KATHARINA", "HORTENSIA": "HORTENSIO"},
    "titus": {"MARCUS": "MARCUS ANDRONICUS"},
    "winters_tale": {"SHEPARD": "SHEPHERD"},
}

# Short, familiar names for the chart (upper-case label -> display). Anything else is title-cased.
DISPLAY = {
    "*": {"KING CLAUDIUS": "Claudius", "QUEEN GERTRUDE": "Gertrude", "LORD POLONIUS": "Polonius",
          "PRINCE FORTINBRAS": "Fortinbras", "KING LEAR": "Lear", "MARK ANTONY": "Antony",
          "DOMITIUS ENOBARBUS": "Enobarbus", "HENRY BOLINGBROKE": "Bolingbroke",
          "KING RICHARD II": "Richard II", "DON ADRIANO DE ARMADO": "Armado", "TITUS ANDRONICUS": "Titus",
          "MARCUS ANDRONICUS": "Marcus", "DUKE ORSINO": "Orsino", "POSTHUMUS LEONATUS": "Posthumus",
          "CARDINAL WOLSEY": "Wolsey", "CARDINAL CAMPEIUS": "Campeius", "KING HENRY VIII": "Henry VIII",
          "KING HENRY V": "Henry V", "KING HENRY IV": "Henry IV", "KING HENRY VI": "Henry VI",
          "KING EDWARD IV": "Edward IV", "PRINCE HENRY": "Prince Hal", "SIR TOBY BELCH": "Sir Toby",
          "SIR ANDREW": "Sir Andrew", "DUKE VINCENTIO": "Duke Vincentio", "DUKE SOLINUS": "Duke Solinus",
          "SIR HUGH EVANS": "Sir Hugh Evans", "JOHN OF GAUNT": "John of Gaunt", "LORD CHIEF-JUSTICE":
          "Lord Chief Justice", "OCTAVIUS CAESAR": "Octavius", "FERDINAND": "Ferdinand",
          "EARL OF WORCESTER": "Worcester", "EARL OF DOUGLAS": "Douglas", "DUKE OF YORK": "York",
          "DUKE OF AUMERLE": "Aumerle", "THOMAS MOWBRAY": "Mowbray", "HENRY PERCY": "Percy",
          "CARDINAL PANDULPH": "Pandulph", "QUEEN ELINOR": "Elinor", "QUEEN KATHARINE": "Katharine",
          "QUEEN MARGARET": "Margaret", "QUEEN ELIZABETH": "Queen Elizabeth", "CAIUS LUCIUS": "Lucius",
          "PRINCESS": "Princess of France", "AEDILE": "Aedile"},
    "2henryiv": {"PRINCE HENRY": "Prince Hal (Henry V)"},
    "1henryvi": {"YORK": "Plantagenet (York)", "WINCHESTER": "Winchester", "CHARLES": "Charles the Dauphin"},
    "2henryvi": {"YORK": "York"},
    "3henryvi": {"GLOUCESTER": "Richard (Gloucester)", "CLARENCE": "George (Clarence)", "YORK": "York"},
    "richardiii": {"GLOUCESTER": "Richard III", "GHOST OF KING HENRY VI": "Ghost of Henry VI",
                   "GHOST OF PRINCE EDWARD": "Ghost of Henry VI's son",
                   "GHOSTS OF YOUNG PRINCES": "Ghosts of the princes"},
    "julius_caesar": {"CAESAR": "Caesar", "ANTONY": "Antony"},
    "lll": {"FERDINAND": "King Ferdinand"},
    "tempest": {"FERDINAND": "Ferdinand"},
    "comedy_errors": {"ANTIPHOLUS OF EPHESUS": "Antipholus of Ephesus"},
    "taming_shrew": {"LORD": "Lord (Induction)"},
}

# Bits of verse that the Moby text tagged as a speaker: glue them back onto the speech before.
CONTINUES = {
    "julius_caesar": {"THIS WAY WILL I"},
    "lll": {"HERE STAND I"},
    "measure": {"AS LONG AS YOU OR I"},
}

# Lines with no speaker at the top of a prologue: who says them.
ORPHANS = {"romeo_juliet": "CHORUS", "pericles": "GOWER", "henryviii": "PROLOGUE",
           "troilus_cressida": "PROLOGUE"}

# Lines in the text that are really stage directions.
AS_DIRECTION = {"Two Sentinels on guard."}

# A bare "ANTIPHOLUS" (the label lost its second half): which twin, by scene.
# Also the one place the Moby text names the wrong king (2 Henry IV 5.5 is Henry V, not Henry IV).
BARE = {"comedy_errors": {"ANTIPHOLUS": {"3.2": "ANTIPHOLUS OF SYRACUSE", "*": "ANTIPHOLUS OF EPHESUS"}},
        "2henryiv": {"KING HENRY IV": {"5.5": "PRINCE HENRY"}}}

GROUP = re.compile(
    r"^(ALL|BOTH|SEVERAL|SOME|ANOTHER)\b|^(CITIZENS|LORDS|SERVANTS|DANES|MARINERS|SOLDIERS|KNIGHTS|BANDITTI|"
    r"PLAYERS|COMMONS|SENATORS|TRIBUNES|CHILDREN|ATTENDANTS|SENTINELS|THIEVES|TRAVELLERS|OUTLAWS|MYRMIDONS|"
    r"PRINCES|GENTLEMEN|CONSPIRATORS|WATCH|SERVING-MEN|LADIES|PEOPLE|VARRO'S SERVANTS|"
    r"GHOSTS OF YOUNG PRINCES)$")

ROMAN = {"I": 1, "II": 2, "III": 3, "IV": 4, "V": 5, "VI": 6, "VII": 7, "VIII": 8, "IX": 9, "X": 10,
         "XI": 11, "XII": 12, "XIII": 13, "XIV": 14, "XV": 15}

TOKEN = re.compile(
    r"<h3>(?P<h>.*?)</h3>"
    r"|<A NAME=speech\d+><b>(?P<sp>.*?)</b></a>"
    r"|<A NAME=(?P<anc>\d+\.\d+\.\d+)>(?P<ln>.*?)</A>"
    r"|<i>(?P<d>.*?)</i>"
    r"|(?P<end></blockquote>)", re.I | re.S)

FRAGMENT = re.compile(r"^(?:[A-Z][A-Z' ]*[A-Z]|Ghosts?|[A-Z][a-z]+'s)$")   # a label cut in two, or a page header
TAB_LABEL = re.compile(r"^[A-Z][A-Za-z]*(?:[ '-]+[A-Za-z']+){0,3}:?$")
SMALL = {"of", "de", "la", "le", "the", "and", "to"}

log = []


def note(play, msg):
    log.append(f"{play}: {msg}")


def clean(s):
    s = re.sub(r"<[^>]+>", "", s)
    s = html.unescape(s).replace("\t", " ")
    return re.sub(r"\s+", " ", s).strip()


def title_case(label):
    out = []
    for i, w in enumerate(label.split(" ")):
        if w in ROMAN or w == "VIII":
            out.append(w)
        elif i and w.lower() in SMALL:
            out.append(w.lower())
        else:
            out.append("-".join(re.sub(r"[A-Za-z]", lambda m: m.group(0).upper(), p.lower(), count=1)
                                for p in w.split("-")))
    return " ".join(out).replace("'S ", "'s ")


def fetch(folder, cache):
    path = cache / f"{folder}.html"
    if not path.exists() or path.stat().st_size < 20000:
        for attempt in range(3):
            try:
                req = urllib.request.Request(SOURCE.format(folder), headers={"User-Agent": "play-xray-build"})
                with urllib.request.urlopen(req, timeout=90) as r:
                    data = r.read()
                if len(data) < 20000:
                    raise RuntimeError(f"short download ({len(data)} bytes)")
                path.write_bytes(data)
                break
            except Exception as e:  # network hiccups: try again
                if attempt == 2:
                    raise
                print(f"  retry {folder}: {e}", file=sys.stderr)
                time.sleep(3)
    return path.read_text(encoding="latin-1")


class Play:
    def __init__(self, folder, known):
        self.folder = folder
        self.known = {k.upper() for k in known}   # every label in the raw file, upper-cased
        self.known_raw = known
        self.aliases = ALIASES.get(folder, {})
        self.scenes = []
        self.labels = defaultdict(Counter)   # canonical key -> raw labels seen
        self.act = None
        self.scene = None
        self.speech = None                   # the open speech: dict(spk=[keys], lines=[...]) inside scene["b"]
        self.orphans = []                    # lines with no speaker yet in this scene

    # ---- structure
    def new_act(self, n):
        self.close_speech(drop_fragment=True)
        self.flush_orphans()
        self.close_speech(drop_fragment=True)
        self.act = n

    def new_scene(self, num, label, loc):
        self.close_speech(drop_fragment=True)
        self.flush_orphans()
        self.close_speech(drop_fragment=True)
        self.scene = {"a": self.act or 0, "s": num, "t": label, "loc": loc, "b": [], "_act": self.act}
        self.scenes.append(self.scene)

    def ensure_scene(self):
        if self.scene is None or self.scene["_act"] != self.act:
            # Something after an act heading but before its first scene heading: a chorus.
            self.new_scene(0, "Prologue", "")

    # ---- speakers
    def key(self, raw):
        k = re.sub(r"\s+", " ", raw).strip().rstrip(":.").strip().upper()
        k = k.replace(", & C", "")
        bare = BARE.get(self.folder, {}).get(k)
        if bare:
            k = bare.get(f"{self.scene['a']}.{self.scene['s']}", bare.get("*", k))
        k = self.aliases.get(k, k)
        self.labels[k][re.sub(r"\s+", " ", raw).strip().rstrip(":.").replace(", & C", "")] += 1
        return k

    def open_speech(self, keys, **extra):
        self.close_speech()
        self.ensure_scene()
        self.speech = {"spk": keys, "lines": [], **extra}
        self.scene["b"].append(self.speech)

    def close_speech(self, drop_fragment=False):
        sp = self.speech
        if sp and drop_fragment and sp["lines"] and isinstance(sp["lines"][-1], str) \
                and FRAGMENT.match(sp["lines"][-1]):
            note(self.folder, f"dropped page header line {sp['lines'][-1]!r}")
            sp["lines"].pop()
        if sp and sp.get("epi") and not sp["lines"]:
            self.scene["b"].remove(sp)
        self.speech = None

    def flush_orphans(self):
        if not self.orphans:
            return
        texts = [o for o in self.orphans if isinstance(o, str)]
        who = ORPHANS.get(self.folder)
        if not texts:
            items, self.orphans = self.orphans, []
            for o in items:
                self.scene["b"].append(o[1])
            return
        if who is None:
            if all(FRAGMENT.match(t) for t in texts):
                for t in texts:
                    note(self.folder, f"dropped stray line {t!r}")
                items, self.orphans = self.orphans, []
                for o in items:
                    if isinstance(o, tuple):
                        self.scene["b"].append(o[1])
                return
            who = self.entering()
            if who:
                note(self.folder, f"lines with no speaker, given to {who} who just came on: {texts[:1]}")
            else:
                note(self.folder, f"lines with no speaker, given to Prologue: {texts[:1]}")
                who = "PROLOGUE"
        items, self.orphans = self.orphans, []
        self.ensure_scene()
        self.speech = {"spk": [self.key(who)], "lines": []}
        self.scene["b"].append(self.speech)
        for o in items:
            self.speech["lines"].append(o)

    def entering(self):
        """The one named character in the latest direction of this scene, if there is exactly one."""
        if self.scene is None:
            return None
        for item in reversed(self.scene["b"]):
            if isinstance(item, str):
                m = re.match(r"^([A-Z][a-z]+) sings\b", item)
                if m:
                    return m.group(1)
                names = [n for n in self.known_raw if re.search(r"\b" + re.escape(n) + r"\b", item)]
                names = [n for n in names if not any(n != o and n in o for o in names)]
                return names[0] if len(names) == 1 else None
            return None
        return None

    def add_line(self, text):
        if self.speech is None:
            self.orphans.append(text)
        else:
            self.speech["lines"].append(text)

    def add_direction(self, text):
        self.ensure_scene()
        if self.speech is not None and not self.speech.get("loc"):
            self.speech["lines"].append(("d", text))
        elif self.orphans:
            self.orphans.append(("d", text))
        else:
            sc = self.scene
            if sc["t"] == "Induction" and not sc["loc"] and not sc["b"] \
                    and not re.search(r"\b(enter|exit|exeunt)\b", text, re.I):
                sc["loc"] = text
            else:
                sc["b"].append(text)

    # ---- main loop
    def parse(self, src):
        start = src.find("</table>")
        for m in TOKEN.finditer(src, start):
            if m.group("h") is not None:
                self.heading(clean(m.group("h")))
            elif m.group("sp") is not None:
                self.label(clean(m.group("sp")))
            elif m.group("ln") is not None:
                self.line(clean(m.group("ln")))
            elif m.group("d") is not None:
                d = clean(m.group("d"))
                if d:
                    self.add_direction(d)
        self.close_speech(drop_fragment=True)
        self.flush_orphans()

    def heading(self, h):
        m = re.match(r"ACT ([IVX]+)$", h, re.I)
        if m:
            self.new_act(ROMAN[m.group(1).upper()])
            return
        m = re.match(r"SCENE ([IVXL]+)\.?\s*(.*)$", h, re.I)
        if m:
            self.new_scene(ROMAN[m.group(1).upper()], None, m.group(2).strip())
            return
        if h.upper() == "PROLOGUE":
            self.new_scene(0, "Prologue", "")
            return
        if h.upper() == "NONE":           # 2 Henry IV opens with Rumour, the Induction
            self.act = 0
            self.new_scene(1, "Induction", "")
            return
        note(self.folder, f"unknown heading {h!r}")

    def label(self, raw):
        up = re.sub(r"\s+", " ", raw).strip().upper()
        m = re.match(r"SCENE ([IVXL]+)$", up)
        if m:                              # a scene heading the Moby text tagged as a speaker
            note(self.folder, f"scene heading tagged as a speaker: {raw!r}")
            self.new_scene(ROMAN[m.group(1)], None, "")
            self.speech = {"spk": None, "lines": [], "loc": True}
            return
        if up in CONTINUES.get(self.folder, set()):
            prev = self.speech or self.last_speech()
            note(self.folder, f"glued {raw!r} back onto the speech before")
            self.open_speech(prev["spk"], cont=True, glue=raw)
            return
        # The second half of a split label: "ANTIPHOLUS" ... "OF EPHESUS", "Ghost" ... "of Clarence".
        holder = self.speech["lines"] if self.speech is not None else self.orphans
        if holder and isinstance(holder[-1], str) and FRAGMENT.match(holder[-1]):
            frag = holder.pop()
            if up.startswith("OF ") or (len(frag.split()) == 1 and not frag.startswith("OF")):
                note(self.folder, f"joined {frag!r} + {raw!r}")
                raw = f"{frag} {raw}"
                up = raw.upper()
            else:
                note(self.folder, f"dropped stray line {frag!r} before {raw!r}")
        if self.orphans:
            self.flush_orphans()
        if up in ("& C", "&C"):
            return
        k = self.key(raw)
        sp = self.speech
        # Labels in a row with nothing between them speak the next lines together.
        if sp is not None and sp.get("spk") and not sp["lines"] and not (sp.get("cont") or sp.get("loc")
                                                                          or sp.get("epi")):
            keys = sp["spk"] + [k]
            self.scene["b"].remove(sp)
            self.speech = None
            self.open_speech(keys)
            note(self.folder, f"spoken together: {keys}")
            return
        self.open_speech([k])

    def last_speech(self):
        for item in reversed(self.scene["b"]):
            if isinstance(item, dict):
                return item
        raise RuntimeError("no speech to continue")

    def line(self, text):
        if not text:
            return
        if self.speech is not None and self.speech.get("loc"):
            self.scene["loc"] = (self.scene["loc"] + " " + text).strip()
            return
        sc = self.scene
        if self.speech is None and not self.orphans and sc is not None and not sc["b"] and sc["loc"] \
                and not re.search(r"[.!?)]$", sc["loc"]):
            sc["loc"] += " " + text                   # the scene heading ran on to the next line
            return
        m = re.match(r"^SCENE ([IVXL]+)[:.]?\s*(.*)$", text)
        if m:
            note(self.folder, f"scene heading inside the text: {text!r}")
            self.new_scene(ROMAN[m.group(1)], None, m.group(2).strip())
            return
        if text == "EPILOGUE":
            self.new_scene(0, "Epilogue", "")
            self.scene["a"] = 99
            self.speech = {"spk": [self.key("EPILOGUE")], "lines": [], "epi": True}
            self.scene["b"].append(self.speech)
            return
        m = re.match(r"^SPOKEN BY (.+)$", text)
        if m and self.speech is not None and self.speech.get("epi"):
            self.labels[self.speech["spk"][0]]["EPILOGUE"] -= 1
            self.speech["spk"] = [self.key(m.group(1))]
            return
        if re.match(r"^(THE )?SONG\.?$", text):
            self.add_direction("Song")
            return
        if re.match(r"^\[[^\]]*\]$", text):          # a whole line that is only a stage direction
            self.add_direction(text[1:-1])
            return
        if text in AS_DIRECTION:
            self.add_direction(text)
            return
        self.add_line(text)

    def tabbed(self, raw_line):
        """'Lucilius' Servant<TAB>Ay, and I think' -> ("Lucilius' Servant", "Ay, and I think"), else None."""
        head, _, rest = raw_line.partition("\t")
        head = head.strip()
        if head.startswith("Senators,"):
            head = "Senators"
        if not TAB_LABEL.match(head):
            return None
        bare = head.rstrip(":").upper()
        if not (bare in self.known or "-" in head or "'" in head or head.endswith(":") or head.isupper()):
            return None
        return head.rstrip(":"), rest.strip()


def parse_play(folder, src):
    known = {re.sub(r"\s+", " ", html.unescape(x)).strip()
             for x in re.findall(r"<A NAME=speech\d+><b>(.*?)</b>", src, re.I | re.S)}
    p = Play(folder, known)

    # A speaker label stuck to the front of a line with a tab ("Lord Chief-Justice<TAB>What's he that
    # goes there?") starts a new speech: rewrite those lines into a proper label before parsing.
    def fix(m):
        got = p.tabbed(html.unescape(m.group(2)))
        if not got:
            return m.group(0)
        head, rest = got
        note(folder, f"speaker inside a line: {head!r}")
        return (f"<A NAME=speech0><b>{html.escape(head)}</b></a>\n"
                f"<A NAME={m.group(1)}>{html.escape(rest)}</A>")
    src = re.sub(r"<A NAME=(\d+\.\d+\.\d+)>([^<]*\t[^<]*)</A>", fix, src)
    p.parse(src)
    return p


def finish(meta, p):
    folder, pid, title, short, genre, year = meta
    scenes = []
    for s in p.scenes:
        if any(isinstance(x, dict) and any(isinstance(ln, str) for ln in x["lines"]) for x in s["b"]):
            scenes.append(s)
        else:
            note(folder, f"left out a scene with nobody speaking: {s['a']}.{s['s']} {s['b'][:2]}")

    # Characters in order of their first speech.
    order = []
    for s in scenes:
        for x in s["b"]:
            if isinstance(x, dict) and any(isinstance(ln, str) for ln in x["lines"]):
                for k in x["spk"]:
                    if k not in order:
                        order.append(k)
    index = {k: i for i, k in enumerate(order)}
    disp = {**DISPLAY["*"], **DISPLAY.get(folder, {})}
    chars = []
    for k in order:
        c = {"n": disp.get(k) or title_case(k), "k": k, "forms": {r for r, n in p.labels[k].items() if n > 0} | {k}}
        if GROUP.search(k):
            c["g"] = 1
        chars.append(c)

    out, total = [], 0
    inductions = sum(1 for s in scenes if s["a"] == 0)
    last_act = max(s["a"] for s in scenes if s["a"] not in (0, 99))
    for s in scenes:
        a = s["a"]
        if a == 99:
            key, label = "ep", "Epilogue"
        elif a == 0:
            key, label = f"0.{s['s']}", "Induction" if inductions == 1 else f"Induction {s['s']}"
        elif s["s"] == 0:
            key, label = f"{a}.0", "Chorus" if folder == "pericles" and a > 1 else "Prologue"
        else:
            key, label = f"{a}.{s['s']}", f"{a}.{s['s']}"
        while key in {x["k"] for x in out}:
            note(folder, f"two scenes keyed {key}")
            key += "b"
            label += "b"
        body = []
        for x in s["b"]:
            if isinstance(x, str):
                body.append(x)
                continue
            if not x["lines"]:
                continue
            if not any(isinstance(ln, str) for ln in x["lines"]):      # only a direction: keep that
                body.extend(ln[1] for ln in x["lines"])
                continue
            spk = [index[k] for k in x["spk"]]
            who = spk[0] if len(spk) == 1 else spk
            lines = list(x["lines"])
            if x.get("glue"):
                lines[0] = f"{x['glue']} {lines[0]}"
            chunk, cont = [], bool(x.get("cont"))
            for ln in lines:
                if isinstance(ln, tuple):
                    if chunk:
                        body.append([who, len(chunk), "\n".join(chunk)] + ([1] if cont else []))
                        cont, chunk = True, []
                    body.append(ln[1])
                else:
                    chunk.append(ln)
            if chunk:
                body.append([who, len(chunk), "\n".join(chunk)] + ([1] if cont else []))
        n = sum(item[1] for item in body if isinstance(item, list))
        total += n
        out.append({"k": key, "a": a, "s": s["s"], "t": label, "loc": s["loc"], "n": n, "b": body})

    silent_presence(out, chars)

    acts = []
    for s in out:
        if not acts or acts[-1]["a"] != s["a"]:
            acts.append({"a": s["a"], "t": "Induction" if s["a"] == 0 else "Epilogue" if s["a"] == 99
                         else f"Act {s['a']}", "scenes": []})
        acts[-1]["scenes"].append({k: v for k, v in s.items() if k != "a"})
    for c in chars:
        del c["k"], c["forms"]
    return {"id": pid, "title": title, "short": short, "genre": genre, "year": year,
            "source": SOURCE.format(folder), "lines": total, "chars": chars, "acts": acts}


def scenes_of(play):
    return [s for act in play["acts"] for s in act["scenes"]]


TITLES = {"KING", "QUEEN", "LORD", "LADY", "PRINCE", "PRINCESS", "DUKE", "DUCHESS", "SIR", "EARL", "CARDINAL",
          "FRIAR", "MISTRESS", "DOCTOR", "YOUNG", "MASTER", "BISHOP", "ARCHBISHOP", "COUNTESS", "DON"}


def silent_presence(scenes, chars):
    """Mark characters named in an entrance (or the opening direction) who don't speak in that scene.

    Named characters are in capitals in the Moby directions ("Enter KING CLAUDIUS"), so those match
    exactly; generic ones written in mixed case ("Ghost", "First Player") match in any case.
    """
    titled = Counter()
    for c in chars:
        for raw in c["forms"]:
            w = raw.upper().split()
            if len(w) > 1 and w[0] in TITLES:
                titled[" ".join(w[1:])] += 1
    every = {f.upper() for c in chars for f in c["forms"]}
    owners = Counter(f.upper() for c in chars for f in {x.upper() for x in c["forms"]})
    pats = []
    for i, c in enumerate(chars):
        if c.get("g"):
            continue
        for raw in c["forms"]:
            if owners[raw.upper()] > 1:          # e.g. a bare "ANTIPHOLUS": could be either twin
                continue
            forms = [raw]
            w = raw.split()
            if raw.isupper() and len(w) > 1 and w[0] in TITLES:
                rest = " ".join(w[1:])
                if titled[rest] == 1 and rest not in every and not rest.startswith("OF "):
                    forms.append(rest)
            for f in forms:
                # "ANTIPHOLUS OF EPHESUS" is written "ANTIPHOLUS of Ephesus" in the directions.
                flags = 0 if f.isupper() and " OF " not in f else re.I
                pats.append((len(f), i, re.compile(r"(?<![\w-])" + re.escape(f) + r"(?![\w'-])", flags)))
    pats.sort(key=lambda t: -t[0])
    skip = re.compile(r"\b(?:of|from|to|for|by|with the body of) (?:the |his |her |young )?"
                      r"[A-Z][\w']*(?: [A-Z][\w']*)*")
    for s in scenes:
        speakers = set()
        for item in s["b"]:
            if isinstance(item, list):
                speakers.update(item[0] if isinstance(item[0], list) else [item[0]])
        named, opening = set(), True
        for item in s["b"]:
            if isinstance(item, list):
                opening = False
                continue
            m = re.search(r"\b(?:Re-enter|Re-Enter|Enter|enter)\b(.*)$", item)
            if m:
                text = m.group(1)
            elif opening:
                text = item
            else:
                continue
            skipped = False
            for size, i, rx in pats:
                if not skipped and " " not in rx.pattern.replace("\\ ", "_"):
                    text, skipped = skip.sub(" ", text), True     # "the body of POLONIUS" isn't Polonius
                if rx.search(text):
                    named.add(i)
                    text = rx.sub(" ", text)
        silent = sorted(named - speakers)
        if silent:
            s["on"] = silent


def summarize(play):
    lines, speeches = Counter(), Counter()
    for s in scenes_of(play):
        for item in s["b"]:
            if isinstance(item, list):
                for c in (item[0] if isinstance(item[0], list) else [item[0]]):
                    lines[c] += item[1]
                    if len(item) < 4:
                        speeches[c] += 1
    return lines, speeches


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", default=str(Path(tempfile.gettempdir()) / "play-xray-src"))
    ap.add_argument("--out", default=str(Path(__file__).resolve().parent.parent / "app" / "data"))
    ap.add_argument("--quiet", action="store_true")
    ap.add_argument("--only", help="one MIT folder name, for checking (writes only that play)")
    args = ap.parse_args()
    cache, out = Path(args.cache), Path(args.out)
    cache.mkdir(parents=True, exist_ok=True)
    out.mkdir(parents=True, exist_ok=True)

    index, roles = [], []
    for meta in PLAYS:
        folder, pid = meta[0], meta[1]
        if args.only and folder != args.only:
            continue
        p = parse_play(folder, fetch(folder, cache))
        play = finish(meta, p)
        per, _ = summarize(play)
        chars = play["chars"]
        named = [i for i, c in enumerate(chars) if not c.get("g")]
        top = max(named, key=lambda i: per[i])
        index.append({
            "id": pid, "title": play["title"], "short": play["short"], "genre": play["genre"],
            "year": play["year"], "lines": play["lines"], "parts": len(named), "scenes": len(scenes_of(play)),
            "spark": [s["n"] for s in scenes_of(play)],
            "top": {"n": chars[top]["n"], "l": per[top]},
            "cast": [chars[i]["n"] for i in sorted(named, key=lambda i: -per[i])[:10]],
        })
        for i in named:
            roles.append({"play": pid, "n": chars[i]["n"], "l": per[i]})
        (out / f"{pid}.json").write_text(json.dumps(play, ensure_ascii=False, separators=(",", ":")))
        if not args.quiet:
            print(f"{pid:22} {play['lines']:5} lines {len(scenes_of(play)):3} scenes {len(named):3} parts"
                  f"  top {chars[top]['n']} {per[top]}")
    roles.sort(key=lambda r: -r["l"])
    if not args.only:
        (out / "index.json").write_text(json.dumps({"plays": index, "roles": roles[:40]}, ensure_ascii=False,
                                                   separators=(",", ":")))
    if not args.quiet:
        print("\n".join(log))
        size = sum(f.stat().st_size for f in out.glob("*.json"))
        print(f"\n{len(index)} plays, {size / 1e6:.2f} MB of JSON in {out}")


if __name__ == "__main__":
    main()
