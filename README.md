# Thursday Night Dart League — TV Scoreboard

A self-contained scoreboard site designed to run full-screen on a TV: tonight's
matchups, weekly MVP/SVP awards, the men's and women's top 8, and a scrolling
news ticker — all sized to fit one screen with no scrolling, and all pulled
from your league spreadsheet.

## What changed from the old version

The previous site polled the Google Sheets API directly from the browser,
with an API key visible in `script.js`. That's been replaced with a plain
`data.json` file that sits next to the page. The page polls that file every
8 seconds and redraws only the values that changed (with a short green
flash), so it still feels live — it just no longer depends on Google's API,
an exposed key, or an internet connection. You keep using the same Excel
workbook; you just re-export it to `data.json` when scores change.

## Files

| File               | Purpose                                                        |
|--------------------|-----------------------------------------------------------------|
| `index.html`       | Page structure                                                  |
| `styles.css`       | All visual styling (colors, type and layout are CSS variables)  |
| `script.js`        | Loads `data.json`, renders the board, polls for updates          |
| `data.json`        | The current league data — this is what you update                |
| `xlsx_to_json.py`  | Converts your Excel workbook into `data.json`                    |

## Updating scores during the night

1. Update `Thursday_Dart_League.xlsx` as usual.
2. Regenerate the data file:
   ```
   python3 xlsx_to_json.py Thursday_Dart_League.xlsx -o data.json
   ```
3. Overwrite `data.json` on whatever machine is serving the site. The TV
   picks up the change automatically within 8 seconds — no reload needed.

The script reads the same sheets your workbook already has: `Team`,
`Sheet1` (matchups), `SheetA` (MVP/SVP), `Sheet2`/`Sheet3` (women's/men's
rankings) and `Chat` (news). If you rename a sheet or add a column, open
`xlsx_to_json.py` and adjust the matching `parse_*` function — it's plain
Python, no build step.

If you'd rather skip the spreadsheet on league night, you can also hand-edit
`data.json` directly — it's plain, readable JSON.

## Displaying it on a TV

Browsers block a page from `fetch()`-ing a local file when it's opened
directly (`file://`), so serve the folder over HTTP rather than
double-clicking `index.html`. The simplest option, from inside this folder:

```
python3 -m http.server 8080
```

Then on the TV (or whatever's driving it), open `http://<that-machine's-ip>:8080`
in a browser and go full-screen — click the ⛶ icon in the bottom-right corner,
or press **F**. Any static host works too (GitHub Pages, Netlify, a router's
USB share, etc.) if you'd rather not run a local server.

For a dedicated TV box, most browsers support a kiosk flag that opens
straight into full-screen with no address bar, e.g. in Chrome:

```
chrome --kiosk http://localhost:8080
```

## Customizing

- **Colors, fonts, spacing** — all defined as CSS variables at the top of
  `styles.css` (`--wood`, `--felt`, `--brass`, `--chalk`, etc.) and as
  `clamp()` values throughout, so the whole board rescales together.
- **Poll frequency** — `POLL_MS` at the top of `script.js` (default 8000ms).
- **League name** — set via `meta.leagueName` in `data.json`, or just edit
  `--league-name` when running the conversion script.
