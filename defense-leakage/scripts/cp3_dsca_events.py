"""CP3: append 3 DSCA sample events to events_sample.csv.
Picked = largest notices (Federal Register text, 2018+) whose principal-contractor line names exactly one
of the 4 firms (RTX after Apr 2020); one per firm where available (GD had none naming GD alone).
announce_date = 'Date Report Delivered to Congress' from the Federal Register text. dsca.mil could not be
read in this session to confirm the press-release date/time, so status = PARTLY VERIFIED.
day0 = next trading day (assumes release after the close; DSCA release time NOT verified)."""
import pandas as pd, sys
FR = "https://www.federalregister.gov/documents/"
new = pd.DataFrame([
 ("LMT","23-07","","","2024-01-26",23.0e9,FR+"2025/01/06/2024-31697/arms-sales-notification","DSCA: Turkiye, 40 new F-16 Block 70 + 79 upgrades"),
 ("RTX","22-26","","","2022-08-02",3.05e9,FR+"2024/06/13/2024-12941/arms-sales-notification","DSCA: Saudi Arabia (item text not parsed; see link)"),
 ("NOC","18-38","","","2018-09-07",3.135e9,FR+"2018/09/21/2018-20573/arms-sales-notification","DSCA: Japan, 9 E-2D Advanced Hawkeye"),
], columns=["ticker","award_id","mod","usaspending_action_date","announce_date","announced_value_usd","source_url","description"])
new["status"] = "PARTLY VERIFIED: date = delivered to Congress (Federal Register); dsca.mil post date/time not confirmed"
new["event_type"] = "DSCA notification"
ev = pd.read_csv(sys.argv[2])
ev = ev[ev.event_type != "DSCA notification"]
px = pd.read_csv(sys.argv[1], parse_dates=["date"])
days = sorted(px.loc[px.ticker == "SPY", "date"].unique())
new["day0"] = [str(next(d for d in days if d > pd.Timestamp(a)).date()) for a in new.announce_date]
out = pd.concat([ev, new], ignore_index=True)
out.to_csv(sys.argv[2], index=False)
print(out[["event_type","ticker","announce_date","day0","announced_value_usd"]].to_string())
