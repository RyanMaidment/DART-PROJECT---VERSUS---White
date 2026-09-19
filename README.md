# Thursday Night Dart League — scoring system

Replaces the Google Sheets scoring workbook, the Apps Script "save" button and the
sheet-polling TV board. Everything runs from your GitHub Pages site. Data lives in a
free Firebase database. **Cost: $0** (no credit card needed for Firebase's free "Spark" plan).

| Page | Who uses it | Address (after you publish) |
|---|---|---|
| **TV board (new)** | the TV in the bar | `https://YOU.github.io/REPO/board/` |
| **Scorer** | one tablet per match | `https://YOU.github.io/REPO/score/` |
| **Admin** | you, on a laptop | `https://YOU.github.io/REPO/admin/` |

## What changed vs. the spreadsheet

* The marker types **only the score for each turn**, in throw order (Team A, Team B, Team A …).
  Remaining score, busts, finishes, **"under 100 first"**, leg points (1 + 0.5), match points out of 10.5,
  and every player stat are worked out automatically. No checkboxes, no "Dummy" name tricks to maintain.
* The TV board updates by itself within a second or two of each entry.
* End of night: **Admin → Stats & export → Save this night's stats** (replaces the "save to stats spreadsheet" script).
  **Download whole season (CSV)** gives you an "All Weeks" file with the same columns as before.

## Step 1 — Put the files in your GitHub repo

Copy everything from this folder into your existing repo. **Nothing of yours gets overwritten:** the new TV board
lives in its own `board/` folder and reuses your existing `styles.css`, so your current board keeps running
at the site root while you test. Folder layout:

```
(your existing files: index.html, styles.css, script.js, data.json …)   <- untouched
board/   score/   admin/   lib/   firestore.rules   README.md            <- new
```

**Try it right now with no Firebase at all:** open `…/score/?demo`, `…/admin/?demo` and `…/board/?demo`.
Demo mode stores data only in that browser (open the three pages in tabs of the same browser and they
talk to each other). Nothing is shared with other devices until you finish Step 2.

When you're happy with the new board, swap it in (e.g. move `board/index.html` and `board/script.js` over your
root ones, fixing the `../` paths), or just point the TV at `/board/`. After that the Apps Script,
`xlsx_to_json.py` and the Google Sheets polling are no longer needed.

> **Please check this first:** I could not re-open your original board files (`index.html`, `script.js`) while building this,
> so the new board's markup is a reconstruction that relies on the class names in your `styles.css`. Open `/board/` next to your
> current board. If any panel looks different, send me your original `index.html`, `styles.css` and `script.js` and I'll match it exactly.

## Step 2 — Create the free Firebase project (about 10 minutes)

1. Go to <https://console.firebase.google.com> → **Add project** → name it → turn Google Analytics **off**.
2. **Build → Firestore Database → Create database** → *Start in production mode* → choose a nearby location
   (e.g. `northamerica-northeast1` Montréal). The location can't be changed later.
3. Firestore → **Rules** tab → paste the contents of `firestore.rules` → **Publish**.
4. **Project settings (gear) → Your apps → Web (`</>`)** → register an app → copy the `firebaseConfig`
   values into `lib/config.js` (`apiKey`, `authDomain`, `projectId`, `appId`).
   These only tell the pages which project to talk to; they are not passwords.
5. Commit and push. Wait a minute for GitHub Pages to update.

There are **no logins or PINs** anywhere — no Firebase Authentication to set up.

## Step 3 — First-time setup in Admin

1. **Roster → Load starter roster from your spreadsheet.** Then fix anything that changed
   (names, teams, **gender** — the red-edged rows have no gender set).
2. **Nights & matchups →** pick the date, week number and the 8 pairings → **Create / update night**.
   That puts the matchups on the TV and on the tablets.

## League night routine

* **Before play:** Admin → create the night (once). Open the board on the TV (press **F** for full screen).
* **Each match:** open `/score/` on a tablet (Add to Home Screen for a full-screen app),
  tap the match, pick who is playing and who throws first, **Start**. Type each turn's score and press **Enter ✓**.
  A checkout asks "Was it a double?" once. Tap any past turn to correct it; **Undo last turn** is one tap.
  Late player? Use **Change players** (pick *Dummy* until they arrive) — it applies from the current leg on.
* **After play:** each scorer taps **Finish match**. Admin → Stats & export → **Save this night's stats**.

## How points and stats are calculated

* Leg: **1** point for finishing + **0.5** for being first under 100 (first to get *below* 100 remaining, decided by throw order —
  the bonus can go to the team that loses the leg). 7 legs = 10.5 points a match. Legs alternate who throws first.
* A finishing turn counts as a shot and its score counts as points. A bust or a miss is a shot scoring 0.
* Average = points ÷ shots. **100+ counts from 100 for men and 95 for women.** 180/171 counts every 180 or 171.
  Dummy is never included in anyone's stats.
* All of this is in `lib/engine.js` (with tests in `tests/`). Rule numbers can be changed in Admin → Settings.

## Who can change what (no logins)

Nothing is password-protected. Anyone who has the address of a page can use it: the TV board, the scorer and the
**Admin page** (which can edit the roster, matchups and settings, and delete data). The rules only stop anyone from
creating data outside the league's own collections.

Sensible habits for that:
* Don't link to `/admin/` from anywhere. To make it harder to stumble on, rename the `admin` folder to something
  only you know (e.g. `admin-x7k2`); nothing else depends on its name.
* Download a backup now and then: **Admin → Stats & export → Download whole season (CSV)** after each night.
* If anything is ever changed by mistake, scores can be fixed with **tap a turn → edit**, and the roster and matchups
  can be re-entered in Admin. If this ever becomes a problem, tell me and I'll add a PIN back.

## Free-plan limits (Firebase Spark)

At the time of writing: 20,000 writes/day and 50,000 reads/day. A league night is roughly 1,200 writes
and a few thousand reads, so you use a small fraction. Scoring keeps working through Wi-Fi drops: entries are stored on the
tablet and sync automatically when it reconnects (the header shows *Saved / Saving… / Offline*).

## Known limits

* The app checks that a finish is arithmetically possible, but it can't see the board, so it asks the marker to confirm the double.
* One tablet per match is the supported setup. (The data format would allow two, one per team, but there's no screen for it yet.)
* Reloading a tablet while it has no internet needs the page to be cached by the browser; the scores already entered are safe either way.

## Running the tests

`node --test tests/engine.test.mjs` (Node 20+). Local preview: `python3 -m http.server` in this folder, then open
`http://localhost:8000/score/?demo`.
