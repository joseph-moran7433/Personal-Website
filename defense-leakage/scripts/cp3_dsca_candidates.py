"""CP3: DSCA candidates from the Federal Register (official text of 36(b) arms sales notifications).
Finds notices naming one of the 4 firms as principal contractor, parses Transmittal No., letter date,
and estimated total value. Candidates only: public press-release date must be confirmed on dsca.mil."""
import json, re, sys, time, urllib.request, urllib.parse
import pandas as pd
API = "https://www.federalregister.gov/api/v1/documents.json"
FIRMS = {"LMT": "Lockheed Martin", "RTX": "Raytheon", "NOC": "Northrop Grumman", "GD": "General Dynamics"}
def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "MA491-research-script"}), timeout=60).read().decode("utf-8", "ignore")
docs = {}
for tic, name in FIRMS.items():
    page = 1
    while True:
        q = urllib.parse.urlencode([("conditions[term]", f'"Arms Sales Notification" "{name}"'),
             ("conditions[publication_date][gte]", "2018-01-01"), ("per_page", "100"), ("page", str(page)),
             ("fields[]", "document_number"), ("fields[]", "publication_date"), ("fields[]", "raw_text_url"), ("fields[]", "html_url"), ("fields[]", "title")])
        d = json.loads(get(API + "?" + q))
        for r in d.get("results", []):
            if r["title"].strip().lower().startswith("arms sales notification"):
                docs[r["document_number"]] = r
        if page >= d.get("total_pages", 1): break
        page += 1; time.sleep(0.5)
print("notices to parse:", len(docs))
rows = []
for i, (num, r) in enumerate(docs.items()):
    try: t = re.sub(r"\s+", " ", get(r["raw_text_url"]))
    except Exception as e: print("skip", num, e); continue
    time.sleep(0.3)
    tn = re.search(r"Transmittal No\.?\s*([0-9]{2}-[0-9A-Z]+)", t)
    tot = re.search(r"TOTAL\s*\.*\s*\$\s*([\d.,]+)\s*(billion|million)", t, re.I)
    pc = re.search(r"[Pp]rincipal (?:U\.S\. )?contractors? (?:will be|is|are)\s*(.{0,160})", t)
    country = re.search(r"Prospective Purchaser:\s*(.{0,60}?)(?:\(ii\)|$)", t)
    val = None
    if tot: val = float(tot.group(1).replace(",", "")) * (1e9 if tot.group(2).lower() == "billion" else 1e6)
    pct = pc.group(1) if pc else ""
    for tic, name in FIRMS.items():
        if name.lower() in pct.lower():
            rows.append(dict(ticker=tic, transmittal=tn.group(1) if tn else None, country=country.group(1).strip() if country else None,
                             est_total_usd=val, principal_contractor_text=pct[:160], fr_publication_date=r["publication_date"], fr_url=r["html_url"]))
df = pd.DataFrame(rows).drop_duplicates(["ticker", "transmittal"])
df.to_csv(sys.argv[1], index=False)
print(len(df), "firm-notice rows")
print(df.sort_values("est_total_usd", ascending=False).head(12)[["ticker","transmittal","country","est_total_usd","fr_publication_date"]].to_string())
