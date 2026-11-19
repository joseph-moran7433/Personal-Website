"""Full-study arms-sale events from the Federal Register (official 36(b) notification text).
Searches every "Arms Sales Notification" since 2009-06 naming a study firm, then parses:
transmittal number, estimated total value, principal contractor line, purchaser, and the
"Date Report Delivered to Congress" (used as the announcement date; DSCA posts its press
release the same day, not verified per event because dsca.mil blocks scripts).
Writes data/full/dsca_notices.csv (one row per firm x transmittal)."""
import json
import re
import time
import urllib.parse
import urllib.error
import urllib.request
from pathlib import Path

import pandas as pd

OUT = Path(__file__).resolve().parents[1] / "data" / "full" / "dsca_notices.csv"
API = "https://www.federalregister.gov/api/v1/documents.json"
FIRMS = {"LMT": ["Lockheed Martin"], "RTX": ["Raytheon", "RTX", "Pratt & Whitney", "Collins Aerospace"],
         "NOC": ["Northrop Grumman"], "GD": ["General Dynamics"], "HII": ["Huntington Ingalls"],
         "LHX": ["L3Harris", "L3 Technologies", "Harris Corporation"], "LDOS": ["Leidos", "Science Applications International"],
         "BA": ["Boeing"], "TXT": ["Textron", "Bell Helicopter", "Bell Textron"], "BAH": ["Booz Allen"],
         "KTOS": ["Kratos"]}
SEARCH = sorted({n for v in FIRMS.values() for n in v})


CACHE = OUT.parent / "fr_cache"
CACHE.mkdir(exist_ok=True)


def get(url, cache=None):
    """GET with backoff on 429 (Federal Register rate limit); notice texts are cached on disk."""
    if cache and (CACHE / cache).exists():
        return (CACHE / cache).read_text(encoding="utf-8")
    for k in range(8):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "MA491-research-script"})
            txt = urllib.request.urlopen(req, timeout=60).read().decode("utf-8", "ignore")
            if cache:
                (CACHE / cache).write_text(txt, encoding="utf-8")
            time.sleep(0.8)
            return txt
        except urllib.error.HTTPError as e:
            if e.code != 429:
                raise
            time.sleep(20 * (k + 1))
    raise RuntimeError("rate limited: " + url)


docs = {}
for name in SEARCH:
    page = 1
    while True:
        q = urllib.parse.urlencode([("conditions[term]", f'"Arms Sales Notification" "{name}"'),
                                    ("conditions[publication_date][gte]", "2009-06-01"), ("per_page", "100"), ("page", str(page)),
                                    ("fields[]", "document_number"), ("fields[]", "publication_date"), ("fields[]", "raw_text_url"),
                                    ("fields[]", "html_url"), ("fields[]", "title")])
        d = json.loads(get(API + "?" + q))
        for r in d.get("results", []):
            # before 2017 the title reads "36(b)(1) Arms Sales Notification"; 36(b)(5)(C) notices are
            # upgrades to an earlier sale, not a new sale, and are left out
            ttl = r["title"].strip().lower()
            if "arms sales notification" in ttl and "(5)(c)" not in ttl:
                docs[r["document_number"]] = r
        if page >= d.get("total_pages", 1):
            break
        page += 1
        time.sleep(0.4)
print("notices to parse:", len(docs))
# older notices write "25 July 2013" or "11 Apr 14"
DMY = r"\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?,?\s+(?:20)?\d\d\b"
MON = r"(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+20\d\d"


def parse_day(txt):
    txt = re.sub(r"\bSept\b", "Sep", txt).replace(".", "").replace(",", "")
    m = re.match(r"(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{2,4})$", txt.strip())
    if m:
        y = int(m.group(3))
        return pd.Timestamp(f"{m.group(1)} {m.group(2)} {y + 2000 if y < 100 else y}").date()
    return pd.Timestamp(txt).date()


rows = []
for i, (num, r) in enumerate(docs.items()):
    try:
        t = re.sub(r"\s+", " ", get(r["raw_text_url"], cache=num + ".txt"))
    except Exception as e:
        print("skip", num, e)
        continue
    time.sleep(0.25)
    # one FR document can hold several transmittals; split on "Transmittal No."
    # older notices repeat the number on each block (notice, policy justification), so blocks with the
    # same transmittal number are joined before parsing
    blocks = {}
    for p in re.split(r"(?=Transmittal No\.?\s*[0-9]{2}-[0-9A-Z]+)", t):
        m = re.match(r"Transmittal No\.?\s*([0-9]{2}-[0-9A-Z]+)", p)
        if m:
            blocks[m.group(1)] = blocks.get(m.group(1), "") + " " + p
    for tnum, p in blocks.items():
        tn = re.match(r"\s*Transmittal No\.?\s*([0-9]{2}-[0-9A-Z]+)", p)
        tot = re.search(r"TOTAL\s*\.*\s*\$\s*([\d.,]+)\s*(billion|million)", p, re.I)
        pc = re.search(r"[Pp]rincipal (?:U\.S\. )?contractors? (?:will be|is|are)\s*(.{0,220})", p)
        country = re.search(r"Prospective Purchaser:\s*(.{0,60}?)(?:\(ii\)|$)", p)
        dl = re.search(r"Date Report Delivered to Congress:?\s*(" + MON + "|" + DMY + ")", p, re.I)
        val = float(tot.group(1).replace(",", "")) * (1e9 if tot.group(2).lower() == "billion" else 1e6) if tot else None
        pct = pc.group(1) if pc else ""
        named = [tk for tk, ns in FIRMS.items() if any(n.lower() in pct.lower() for n in ns)]
        for tk in named:
            rows.append(dict(ticker=tk, transmittal=tn.group(1), country=country.group(1).strip() if country else None,
                             est_total_usd=val, n_firms_named=len(named), principal_contractor_text=pct[:220],
                             delivered_to_congress=parse_day(dl.group(1)) if dl else None,
                             fr_publication_date=r["publication_date"], fr_url=r["html_url"]))
    if i % 50 == 0:
        print(i, len(rows))
df = pd.DataFrame(rows).drop_duplicates(["ticker", "transmittal"])
df.to_csv(OUT, index=False)
print(len(df), "firm-notice rows;", df.delivered_to_congress.notna().mean().round(3), "with a delivered date")
print(df.groupby("ticker").size().to_dict())
