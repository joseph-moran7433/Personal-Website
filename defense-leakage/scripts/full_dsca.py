"""Full-study arms-sale events from the Federal Register (official 36(b) notification text).
Searches every "Arms Sales Notification" since 2017-06 naming a study firm, then parses:
transmittal number, estimated total value, principal contractor line, purchaser, and the
"Date Report Delivered to Congress" (used as the announcement date; DSCA posts its press
release the same day, not verified per event because dsca.mil blocks scripts).
Writes data/full/dsca_notices.csv (one row per firm x transmittal)."""
import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

import pandas as pd

OUT = Path(__file__).resolve().parents[1] / "data" / "full" / "dsca_notices.csv"
API = "https://www.federalregister.gov/api/v1/documents.json"
FIRMS = {"LMT": ["Lockheed Martin"], "RTX": ["Raytheon", "RTX", "Pratt & Whitney", "Collins Aerospace"],
         "NOC": ["Northrop Grumman"], "GD": ["General Dynamics"], "HII": ["Huntington Ingalls"],
         "LHX": ["L3Harris", "L3 Technologies", "Harris Corporation"], "LDOS": ["Leidos"],
         "BA": ["Boeing"], "TXT": ["Textron", "Bell Helicopter", "Bell Textron"], "BAH": ["Booz Allen"],
         "KTOS": ["Kratos"]}
SEARCH = sorted({n for v in FIRMS.values() for n in v})


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "MA491-research-script"})
    return urllib.request.urlopen(req, timeout=60).read().decode("utf-8", "ignore")


docs = {}
for name in SEARCH:
    page = 1
    while True:
        q = urllib.parse.urlencode([("conditions[term]", f'"Arms Sales Notification" "{name}"'),
                                    ("conditions[publication_date][gte]", "2017-06-01"), ("per_page", "100"), ("page", str(page)),
                                    ("fields[]", "document_number"), ("fields[]", "publication_date"), ("fields[]", "raw_text_url"),
                                    ("fields[]", "html_url"), ("fields[]", "title")])
        d = json.loads(get(API + "?" + q))
        for r in d.get("results", []):
            if r["title"].strip().lower().startswith("arms sales notification"):
                docs[r["document_number"]] = r
        if page >= d.get("total_pages", 1):
            break
        page += 1
        time.sleep(0.4)
print("notices to parse:", len(docs))
MON = r"(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+20\d\d"
rows = []
for i, (num, r) in enumerate(docs.items()):
    try:
        t = re.sub(r"\s+", " ", get(r["raw_text_url"]))
    except Exception as e:
        print("skip", num, e)
        continue
    time.sleep(0.25)
    # one FR document can hold several transmittals; split on "Transmittal No."
    parts = re.split(r"(?=Transmittal No\.?\s*[0-9]{2}-[0-9A-Z]+)", t)
    for p in parts:
        tn = re.match(r"Transmittal No\.?\s*([0-9]{2}-[0-9A-Z]+)", p)
        if not tn:
            continue
        tot = re.search(r"TOTAL\s*\.*\s*\$\s*([\d.,]+)\s*(billion|million)", p, re.I)
        pc = re.search(r"[Pp]rincipal (?:U\.S\. )?contractors? (?:will be|is|are)\s*(.{0,220})", p)
        country = re.search(r"Prospective Purchaser:\s*(.{0,60}?)(?:\(ii\)|$)", p)
        dl = re.search(r"Date Report Delivered to Congress:?\s*(" + MON + ")", p)
        val = float(tot.group(1).replace(",", "")) * (1e9 if tot.group(2).lower() == "billion" else 1e6) if tot else None
        pct = pc.group(1) if pc else ""
        named = [tk for tk, ns in FIRMS.items() if any(n.lower() in pct.lower() for n in ns)]
        for tk in named:
            rows.append(dict(ticker=tk, transmittal=tn.group(1), country=country.group(1).strip() if country else None,
                             est_total_usd=val, n_firms_named=len(named), principal_contractor_text=pct[:220],
                             delivered_to_congress=pd.Timestamp(dl.group(1)).date() if dl else None,
                             fr_publication_date=r["publication_date"], fr_url=r["html_url"]))
    if i % 50 == 0:
        print(i, len(rows))
df = pd.DataFrame(rows).drop_duplicates(["ticker", "transmittal"])
df.to_csv(OUT, index=False)
print(len(df), "firm-notice rows;", df.delivered_to_congress.notna().mean().round(3), "with a delivered date")
print(df.groupby("ticker").size().to_dict())
