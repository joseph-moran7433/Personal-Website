"""CP3 sample contract events.
Candidates: largest USAspending DoD transactions (>= $500M obligated) per firm, 2018-01 to 2026-10,
RTX from 2020-04-03, same-day duplicates removed (scripts/cp3_usaspending_candidates.py).
Each was checked on war.gov daily contract pages (window: action date -3 to +7 days, matched on
contract number with or without hyphens) on 2026-11-04/05 in the analyst's Chrome. Announce dates and
announced values were copied from the page text. Obligated amounts are looked up in the raw USAspending file.
day0 = first trading day AFTER the announcement date (assumption A2: 5 PM ET release, after the close)."""
import pandas as pd, sys
W = "https://www.war.gov/News/Contracts/Contract/Article/"
# ticker, award_id, mod, usaspending_action_date, announce_date, announced_value_usd, url, description, status
rows = [
 ("LMT","N0001917C0001","P00024","2019-11-26","2019-11-26",831008187,W+"2027618/contracts-for-nov-26-2019/","F-35 Lot 14: 15 F-35A for Australia","VERIFIED; values disagree (USAspending action also de-obligates Turkey funds)"),
 ("LMT","N0001923C0003","P00015","2025-09-29","2025-09-29",12529999033,W+"4317777/contracts-for-sep-29-2025/","F-35 Lot 18 definitization (148 aircraft) + Lot 19","VERIFIED"),
 ("LMT","N0001920C0009","P00019","2022-12-30","2022-12-30",7842191056,W+"3256832/contracts-for-dec-30-2022/","F-35 Lot 16 (127 aircraft) + definitize Lot 15","VERIFIED"),
 ("GD","N0002417C2100","PZ0009","2019-12-02","2019-12-02",22209893409,W+"2030017/contracts-for-dec-2-2019/","Virginia-class Block V, 9 submarines FY19-23","VERIFIED; announced = multiyear value, obligated = first increment"),
 ("GD","N0002417C2100","P00029","2021-03-19","2021-03-19",2417500565,W+"2544067/contracts-for-mar-19-2021/","Virginia Block V option, 1 boat","VERIFIED"),
 ("GD","N0002417C2100","P00006","2019-03-18","2019-03-18",2039763908,W+"1788196/contracts-for-mar-18-2019/","Virginia-class long-lead material","VERIFIED"),
 ("NOC","N0001918C1037","P00006","2019-04-10","2019-04-10",3169708972,W+"1811209/contracts-for-apr-10-2019/","E-2D Hawkeye Lot 7 definitization (multiyear)","VERIFIED; announced > obligated"),
 ("NOC","N0001918C1037","P00086","2024-07-19","2024-07-19",1456019386,W+"3844604/contracts-for-jul-19-2024/","E-2D: add 9 aircraft","VERIFIED; page spells firm 'Northrup'"),
 ("NOC","N0001918C1037","P00009","2019-09-26","2019-09-26",1362276582,W+"1972824/contracts-for-sep-26-2019/","E-2D: 9 aircraft for Japan (FMS)","VERIFIED"),
 ("RTX","HQ086220C0002","0","2020-06-26","2020-06-26",2271181543,W+"2234393/contracts-for-jun-26-2020/","AN/TPY-2 radar, FMS to Saudi Arabia","VERIFIED"),
 ("RTX","HQ085124C0001","0","2024-07-25","2024-07-25",1944082765,W+"3850293/contracts-for-jul-25-2024/","SM-3 Block IIA production FY23-25","VERIFIED"),
 ("RTX","N0002422C5500","P00040","2026-07-15","2026-07-20",1809613484,W+"4550330/contracts-for-july-20-2026/","AN/SPY-6 hardware production","VERIFIED; announced 5 days AFTER USAspending action date"),
]
cols = ["ticker","award_id","mod","usaspending_action_date","announce_date","announced_value_usd","source_url","description","status"]
ev = pd.DataFrame(rows, columns=cols)
raw = pd.read_csv(sys.argv[2], dtype={"Mod": str})
key = raw.set_index(["Award ID","Mod","Action Date"])["Transaction Amount"]
key = key[~key.index.duplicated()]
ev["usaspending_obligated_usd"] = [key.get((a, m, d)) for a, m, d in zip(ev.award_id, ev["mod"], ev.usaspending_action_date)]
px = pd.read_csv(sys.argv[1], parse_dates=["date"])
days = sorted(px.loc[px.ticker == "SPY", "date"].unique())
ev["day0"] = [str(next(d for d in days if d > pd.Timestamp(a)).date()) for a in ev.announce_date]
ev["event_type"] = "DoD contract"
ev.to_csv(sys.argv[3], index=False)
print(ev[["ticker","announce_date","day0","announced_value_usd","usaspending_obligated_usd"]].to_string())
