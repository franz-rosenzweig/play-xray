<sub>[Play X-Ray docs](README.md) › Under the hood</sub>

# Developing

These are the working notes for changing Play X-Ray itself: what each file does, how the data is built from the
Moby text and what had to be fixed along the way, the JSON format, the checks and deploying. Everything a reader
needs is in the other pages.

## How it runs

Plain HTML, CSS and ES modules, no framework and no build step for the page. The only thing that's built is the
data, once, by a Python script, and the JSON is committed.

| File | What |
|---|---|
| `app/index.html`, `app/style.css` | The page. Colours are custom properties, switched by `prefers-color-scheme` or `data-theme` on `<html>` (the Film/Paper button). Phone layout under 640 px. |
| `app/js/main.js` | The hash router (`#/`, `#/all`, `#/<play>`, `#/<play>/cast`, `#/<play>/3.1/s12` and so on), the play header and tabs, the theme button. `window.__xray` is there for the checks. |
| `app/js/data.js` | Loads `index.json` and the play files, and works out per scene and per character: lines, speeches, longest speech, first and last scene, who is on (speaking or silent), the line-by-line order for the ribbons, and the ten colours. |
| `app/js/util.js` | Element helpers, number formats, scene names, saved settings (every storage access in try/catch) and the tooltip. |
| `app/js/shelf.js` | The shelf and its search (titles and the ten biggest parts of each play). |
| `app/js/chart.js` | The scene chart, in SVG. Column widths are a minimum plus a share of the rest by length. Also the `seg` and `selectBox` controls the other screens use. |
| `app/js/cast.js`, `ribbons.js`, `stage.js`, `reader.js`, `across.js` | One screen each. The ribbons are a Gaussian-smoothed share of the lines at 360 points along the play. |
| `app/fonts/` | EB Garamond, Courier Prime and Caveat, latin and latin-ext, with their OFL licences. `tools/fetch_fonts.sh` downloads them again. |
| `app/icon.svg` | The icon. `tools/render_icon.py` renders `icon-512.png`, `icon-192.png` and the full-bleed `icon-180.png` for the Home Screen. |

Settings saved in local storage (under `play-xray:prefs`): chart order, minimum lines, width, ribbons detail, grid
size, the comparison sort, the theme if it was picked by hand, and the last scene read in each play. Nothing else
is stored and nothing is sent anywhere.

## Building the data

```
python3 -I tools/build_data.py [--cache DIR] [--only hamlet]
python3 -I tools/check_data.py
```

`build_data.py` downloads each play's `full.html` from shakespeare.mit.edu once into the cache folder (a folder in
the system temp dir unless you pass `--cache`), parses it and writes `app/data/<play>.json` and `app/data/index.json`.
Fetch the `https://` address directly, because the site's `http://` redirect sends every play to its front page.
The script prints every guess it made, so read its output after any change.

The markup is simple (scene headings in `<h3>`, `<A NAME=speechN><b>SPEAKER</b></a>`, a `<blockquote>` of
`<A NAME=act.scene.line>` lines, stage directions in `<i>`), but the Moby text has its share of slips. The parser
deals with these:

- **Speaker labels cut in two.** "ANTIPHOLUS" ends one speech as if it were a line and "OF EPHESUS" is the next
  label, and the same with "Ghost" / "of Clarence" (Richard III), "LADY" / "NORTHUMBERLAND" (2 Henry IV), "DON" /
  "ADRIANO DE ARMADO" (Love's Labour's Lost), "RICHARD" / "PLANTAGENET" and "BISHOP" / "OF WINCHESTER" (1 Henry VI)
  and "Varro's" / "First Servant" (Timon). A trailing line that is only a capitalised word or two is glued onto the
  next label; a longer one is a stray page header ("LOVE'S LABOURS LOST", "CYMBELINE") and is dropped.
- **Speakers inside a line.** Labels with a hyphen or an apostrophe lost their tag and sit at the start of a line
  before a tab ("Lord Chief-Justice<TAB>What's he that goes there?", "Lucilius' Servant<TAB>…"). Those start a new speech.
- **Scene headings in the wrong place.** 1 Henry IV 3.3 and Cymbeline 2.3 are tagged as speakers ("Scene III"),
  and Merchant of Venice 1.2, Winter's Tale 4.1 and three scenes of Pericles are lines of text ("SCENE II: …").
  Headings that run onto the next line ("…between Towton and Saxton, in" / "Yorkshire.") are joined.
- **Prologues, choruses, inductions, epilogues.** "PROLOGUE" headings become scene `N.0`; a chorus between an act
  heading and its first scene (Pericles' Gower) becomes `N.0` too; scenes before Act I, and 2 Henry IV's "None"
  heading, are the Induction (act 0); a line reading "EPILOGUE" starts an Epilogue scene (`ep`), spoken by the next
  speaker, by "SPOKEN BY …", or by "Epilogue".
- **Lines with no speaker** (the prologue of Romeo and Juliet, Gower in Pericles, a song in Measure for Measure)
  go to the one character the last direction brings on, or to a set speaker for the play.
- **Bits of verse tagged as speakers** ("This way will I", "Here stand I", "As long as you or I") are glued back
  onto the speech before. Labels in a row with no lines between them speak the next lines together.
- **Lines that are only a direction** ("[To KING RICHARD III]", "SONG.") become directions and don't count.

Speaker names are then evened out per play with the `ALIASES` table (one person, one row: "LEAR" is "KING LEAR",
Marcius becomes Coriolanus, in Richard III Gloucester is King Richard and the ghosts count as the people they were,
and in A Midsummer Night's Dream the play-within-the-play parts count as the actors who play them). `BARE` handles a
label that depends on the scene, including 2 Henry IV 5.5, where the Moby text calls the new King Henry V "KING
HENRY IV". `DISPLAY` gives the short names used on screen ("Claudius" for "KING CLAUDIUS"). Labels for groups
("All", "Both", "Citizens") are marked `g` and don't count as speaking parts.

**Silent presence.** For each scene, the names in every direction that contains "Enter", and in the directions
before the first speech, are matched against the speakers of the play (the capitalised forms exactly, generic
mixed-case labels like "Ghost" in any case, and a name without its title, CLAUDIUS for KING CLAUDIUS, when only one
character has it). Anyone matched who
doesn't speak in that scene goes in the scene's `on` list. Names after "of", "from", "to" or "by" don't count, so
"the body of POLONIUS" isn't Polonius. Exits aren't followed, because "in the scene at all" is what the chart shows.

The genres follow the MIT site's columns except the four late plays, which are Romances. The years are the usual
modern estimates, in the `PLAYS` table.

## The JSON

`index.json` is `{"plays": [...], "roles": [...]}`: per play the id, title, short title, genre, year, lines,
speaking parts, scene count, `spark` (lines per scene), `top` (biggest part and lines) and `cast` (the ten biggest
names, for search); and the 40 longest roles.

A play file is `{"id", "title", "short", "genre", "year", "source", "lines", "chars", "acts"}`. `chars` is a list of
`{"n": name}` (plus `"g": 1` for a group) in order of first speech; everything else refers to characters by their
index in it. `acts` is a list of `{"a": 3, "t": "Act 3", "scenes": [...]}` (act 0 is the Induction and 99 the
Epilogue), and a scene is:

```
{"k": "3.1", "s": 1, "t": "3.1", "loc": "A room in the castle.", "n": 202,
 "b": [ "Enter KING CLAUDIUS, QUEEN GERTRUDE, ...",     a string is a stage direction
        [4, 4, "And can you, by no drift...\n..."],     a speech: character, line count, the lines
        [[5, 6], 1, "In that and all things..."],       several speaking together (Hamlet 1.2)
        [12, 3, "...", 1] ],                            the same speech carried on after a direction
 "on": [7] }                                            on stage but silent
```

`k` is the address of the scene (`3.1`, `1.0` for a prologue, `0.1` for an induction, `ep` for an epilogue), and
`n` is the sum of the speeches' line counts. All the files come to 4.9 MB, about 2 MB compressed.

## Checks

```
python3 -I tools/check_data.py
tools/deploy.sh
python3 tools/walk.py ADDRESS SHOTS_FOLDER
python3 tools/walk.py ADDRESS --quick --no-shots
```

`check_data.py` checks that every speech's line count matches its text, scenes and plays add up, every character
speaks somewhere, scene keys are unique and `index.json` matches the play files.

ADDRESS is wherever your copy is served, ending in `/play-xray/` or wherever `app/` lives. `walk.py` starts its own headless Chrome (Chrome for Testing by default, or whatever `CHROME` points to; it needs the
Python `websocket-client` package) and checks the shelf and its search, the scene chart and its three controls and
tooltip, clicking through to the reader, the cast and its longest-speech link, the ribbons, the shared stage, the
reader and its arrow keys, the comparison page and its sort, the theme switch and that it's remembered, a browser
with storage turned off, that no screen scrolls sideways on a 390 px phone, and every view of all 37 plays. It
shoots every screen at 1440x900 and phone size, light and dark, prints a line per check and any page errors, and
exits 1 if anything failed. `--quick` skips the 37-play run and `--no-shots` the screenshots.

`docs_shots.py` takes the pictures in `docs/images/` and, with `--cover PATH`, the 1280x800 cover.

## Deploying

```
tools/deploy.sh
```

It copies `app/` with rsync to the folder my web server serves Play X-Ray from. For your own copy, change the
destination in the script, or serve `app/` with anything that serves static files (`python3 -m http.server -d app`
is enough to try it). If you change a play file, send it with a short cache time or a no-cache header, so readers
don't keep the old one.
