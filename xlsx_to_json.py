#!/usr/bin/env python3
"""
Convert the Thursday Dart League Excel workbook into data.json for the
TV scoreboard.

Usage:
    python3 xlsx_to_json.py Thursday_Dart_League.xlsx
    python3 xlsx_to_json.py Thursday_Dart_League.xlsx -o data.json

Run this each week after you update the spreadsheet, then copy the
resulting data.json to wherever the TV's browser is pointed. The page
polls that file automatically, so nothing else needs to change.

Expected sheets/columns (same layout as the original workbook):
    Team    - col B "<roster> - TEAM [n]", used to number each team
    Sheet1  - col A/C team rosters, col B "score : score" for tonight's matches
    SheetA  - rows 3-6: MVP/SVP label, player name, rating %
    Sheet2  - Women's ranking: RANK, PLAYERS, AVG, FIN, HS, H FIN
    Sheet3  - Men's ranking: RANK, PLAYERS, AVG, FIN, HS, H FIN
    Chat    - col A: one news/shout-out line per row
"""

import argparse
import json
import re
import sys

try:
    import openpyxl
except ImportError:
    sys.exit("This script needs openpyxl: pip install openpyxl")

EMOJI_RE = re.compile(
    "["
    "\U0001F300-\U0001FAFF"
    "\U00002600-\U000027BF"
    "\U0001F1E6-\U0001F1FF"
    "\uFE0F\u200d"
    "]+"
)

# Manual corrections for names that naive title-casing gets wrong
# (e.g. "Ken Mclean" -> "Ken McLean"). Add more as needed.
NAME_FIXES = {"Ken Mclean": "Ken McLean", "Kim Wb": "Kim WB"}


def title_case(name):
    tc = " ".join(w.capitalize() for w in str(name).split())
    return NAME_FIXES.get(tc, tc)


def clean_roster_str(s):
    return re.sub(r"\s*-\s*TEAM\s*(\[\d+\])?\s*$", "", str(s).strip()).strip()


def split_names(s):
    out = []
    for part in s.split(","):
        part = part.strip()
        if not part:
            continue
        spaced = re.sub(r"(?<=[a-z])(?=[A-Z])", " ", part)
        out.append(title_case(spaced))
    return out


def build_team_map(wb):
    ws = wb["Team"]
    team_map = {}
    for r in range(2, ws.max_row + 1):
        name = ws.cell(row=r, column=2).value
        if not name:
            continue
        m = re.search(r"\[(\d+)\]\s*$", str(name).strip())
        if m:
            team_map[clean_roster_str(name)] = m.group(1)
    return team_map


def parse_matches(wb, team_map):
    ws = wb["Sheet1"]
    matches = []
    for r in range(1, ws.max_row + 1):
        a = ws.cell(row=r, column=1).value
        score = ws.cell(row=r, column=2).value
        b = ws.cell(row=r, column=3).value
        if not (a and b and score):
            continue
        a_clean, b_clean = clean_roster_str(a), clean_roster_str(b)
        try:
            sa, sb = [int(x.strip()) for x in str(score).split(":")]
        except ValueError:
            continue
        matches.append({
            "teamANum": team_map.get(a_clean, "?"),
            "teamAPlayers": split_names(a_clean),
            "scoreA": sa,
            "teamBNum": team_map.get(b_clean, "?"),
            "teamBPlayers": split_names(b_clean),
            "scoreB": sb,
        })
    return matches


def parse_player_row(row):
    rank, players, avg, _fin, hs, hfin = (list(row) + [None] * 6)[:6]
    if not players:
        return None
    badges = list("".join(EMOJI_RE.findall(str(players))))
    clean_name = EMOJI_RE.sub("", str(players)).strip()
    return {
        "rank": int(rank) if rank else None,
        "name": title_case(clean_name),
        "badges": badges,
        "avg": round(avg, 1) if isinstance(avg, (int, float)) else None,
        "hs": hs if isinstance(hs, (int, float)) else None,
        "hfin": hfin if isinstance(hfin, (int, float)) and hfin else None,
    }


def parse_top8(wb, sheet_name):
    ws = wb[sheet_name]
    out = []
    for r in range(2, 10):  # header + ranks 1-8
        row = [ws.cell(row=r, column=c).value for c in range(1, 7)]
        parsed = parse_player_row(row)
        if parsed:
            out.append(parsed)
    return out


def parse_awards(wb):
    # Scan the whole sheet for MVP/SVP labels rather than assuming a fixed
    # row range — robust to rows being inserted/removed above them.
    ws = wb["SheetA"]
    awards = []
    label_map = {"MVP": "MVP", "SVP": "SVP"}
    for r in range(1, ws.max_row + 1):
        raw_label = ws.cell(row=r, column=1).value
        name = ws.cell(row=r, column=2).value
        rating = ws.cell(row=r, column=3).value
        if not (raw_label and name):
            continue
        if not re.search(r"MVP|SVP", str(raw_label), re.IGNORECASE):
            continue
        gender = "women" if "\u2640" in str(raw_label) else "men"
        title = "SVP" if "SVP" in str(raw_label).upper() else "MVP"
        awards.append({
            "title": label_map.get(title, title),
            "gender": gender,
            "name": title_case(name),
            "rating": round(rating, 1) if isinstance(rating, (int, float)) else rating,
        })
    return awards


def parse_news(wb):
    ws = wb["Chat"]
    news = []
    for r in range(2, ws.max_row + 1):
        v = ws.cell(row=r, column=1).value
        if v:
            news.append(str(v).strip())
    return news


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("xlsx", help="Path to the league's .xlsx workbook")
    parser.add_argument("-o", "--output", default="data.json", help="Output JSON path (default: data.json)")
    parser.add_argument("--league-name", default="Thursday Night Dart League")
    args = parser.parse_args()

    wb = openpyxl.load_workbook(args.xlsx, data_only=True)
    team_map = build_team_map(wb)

    data = {
        "meta": {
            "leagueName": args.league_name,
            "updatedAt": __import__("datetime").datetime.now().isoformat(timespec="seconds"),
        },
        "matches": parse_matches(wb, team_map),
        "awards": parse_awards(wb),
        "menTop8": parse_top8(wb, "Sheet3"),
        "womenTop8": parse_top8(wb, "Sheet2"),
        "news": parse_news(wb),
    }

    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"Wrote {args.output}: {len(data['matches'])} matches, "
          f"{len(data['menTop8'])} men, {len(data['womenTop8'])} women, "
          f"{len(data['news'])} news items.")


if __name__ == "__main__":
    main()
