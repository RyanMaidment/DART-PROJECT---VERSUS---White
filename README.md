# Thursday Night Dart League — TV Scoreboard

A scoreboard site built to run full-screen on a TV: tonight's matchups,
weekly MVP/SVP awards, the men's and women's top 8, and a scrolling news
ticker — sized to fit one screen with no scrolling, and now **fully live**.

## How the "live" part works

The board reads directly from your **Thursday Dart League Google Sheet**
(the one that already displays stats from your scorekeeping sheet). It
polls it every 7 seconds and only redraws the values that changed, with a
short green flash — so the moment someone updates a score in the sheet,
the TV reflects it. No exports, no git pushes, no server.

A few things worth knowing:

- **This needs the sheet to stay shared as "Anyone with the link – Viewer."**
  That's already the case today. If that's ever changed to "Restricted,"
  the board will stop updating (it'll fall back to the last snapshot it
  saw and show a "could not reach the sheet" status).
- It reads these tabs: `Sheet1` (matchups), `SheetA` (MVP/SVP), `Sheet2`/
  `Sheet3` (women's/men's rankings), `Team` (to number each roster), and
  `Chat` (news ticker). If you rename a tab or rearrange its columns, the
  matching `parse*` function in `script.js` needs a matching update.
- It loads data via a JSONP `<script>` tag rather than `fetch()`, because
  Google's sheet-reading endpoint doesn't reliably send the CORS headers
  a normal cross-origin `fetch()` needs — a script tag sidesteps that
  entirely. This is the same technique long-used by other "read a public
  Google Sheet from a static site" tools.
- If you'd rather not have the *live* spreadsheet directly reachable by
  the public page (even read-only), say so and we can add a small proxy —
  but that requires an actual server/function somewhere, which is exactly
  what this approach avoids.

## Files

| File               | Purpose                                                             |
|--------------------|----------------------------------------------------------------------|
| `index.html`       | Page structure                                                       |
| `styles.css`       | All visual styling (colors, type and layout are CSS variables)       |
| `script.js`        | Reads the live Google Sheet, renders the board, polls for changes    |
| `data.json`        | A one-time snapshot, used **only** if the live sheet can't be reached on first load |
| `xlsx_to_json.py`  | Optional: regenerates that fallback snapshot from an Excel export    |

Score updates themselves need nothing from this list — just edit the
Google Sheet as you already do.

## Deploying (GitHub Pages / Netlify / Vercel)

1. Put `index.html`, `styles.css`, `script.js`, and `data.json` in a git
   repo, commit, and push.
2. Turn on hosting for that repo:
   - **GitHub Pages** — repo Settings → Pages → Deploy from branch → `main` / root.
   - **Netlify** — "Add new site" → Import the repo → leave the build command blank, publish directory = repo root.
   - **Vercel** — "Add New Project" → import the repo → framework preset "Other" → deploy.
   No build step is needed for any of the three; it's plain HTML/CSS/JS.
3. Open the URL it gives you and confirm the status dot goes green
   ("Live — synced …"). If it instead shows "Could not reach the sheet,"
   double check the sheet's share setting is still "Anyone with the link."

Once it's live, you never need to touch the repo again for a normal
league night — only if you change the visual design or the sheet's
structure.

## Customizing

- **Colors, fonts, spacing** — CSS variables at the top of `styles.css`
  (`--wood`, `--felt`, `--brass`, `--chalk`, etc.) plus `clamp()` values
  throughout, so the whole board rescales together.
- **Poll frequency** — `POLL_MS` near the top of `script.js` (default
  7000ms). Faster feels more live; much faster risks Google rate-limiting
  the endpoint.
- **Which spreadsheet it reads** — `SPREADSHEET_ID` near the top of
  `script.js`.
- **How much of each tab it queries** — `SHEET_RANGES` in `script.js`;
  widen these if you add more than 8 top-8 rows, more than ~13 matches, etc.
