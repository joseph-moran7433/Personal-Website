"""
phase6_data_limits.py -- three fundamental questions about the data
itself, not the models, answered directly against the current 505-event
table (data/training_table_v3.csv) and the raw ACLED pull
(data/acled_sample_full.json):

1. Does an event being part of a multi-day/multi-event unrest sequence
   predict faster or more likely escalation? (Tests sequence membership,
   span in days, and sequence size against the escalation label.)
2. Is violence structurally overrepresented in what this pipeline can
   even see -- do escalated events get matched by GDELT (or covered more
   heavily) more often than peaceful ones, on top of the already-
   documented national-press bias (Phase 2)?
3. Given 1 and 2, is the whole project's premise broken? Argued from the
   evidence above, not asserted.

Run standalone; prints everything needed for the site write-up.
"""
import json
import warnings
from collections import defaultdict
from datetime import datetime

import pandas as pd
from scipy import stats

import build_training_table_v2 as btt

warnings.filterwarnings("ignore")


def q1_sequence_and_escalation():
    print("\n===== Q1: does a multi-day/multi-event sequence predict escalation? =====")
    acled = json.loads(open("data/acled_sample_full.json", encoding="utf-8").read())
    seq_start, _, _ = btt.assign_sequences(acled)

    by_seq = defaultdict(list)
    for e in acled:
        key = (e.get("admin1", "UNKNOWN"), seq_start[e["event_id_cnty"]])
        by_seq[key].append(e)

    rows = []
    for e in acled:
        key = (e.get("admin1", "UNKNOWN"), seq_start[e["event_id_cnty"]])
        members = by_seq[key]
        dates = [datetime.strptime(m["event_date"], "%Y-%m-%d") for m in members]
        rows.append({
            "escalated": 0 if e["sub_event_type"] == "Peaceful protest" else 1,
            "in_sequence": len(members) > 1,
            "seq_size": len(members),
            "seq_span_days": (max(dates) - min(dates)).days + 1,
        })
    df = pd.DataFrame(rows)

    ct = pd.crosstab(df["in_sequence"], df["escalated"])
    chi2, p, _, _ = stats.chi2_contingency(ct)
    rate_seq = df[df.in_sequence]["escalated"].mean()
    rate_single = df[~df.in_sequence]["escalated"].mean()
    print(f"In a sequence: {rate_seq:.1%} escalate (n={df.in_sequence.sum()}). "
          f"Standalone: {rate_single:.1%} escalate (n={(~df.in_sequence).sum()}). chi2 p={p:.4f}")

    esc_span, peace_span = df[df.escalated == 1]["seq_span_days"], df[df.escalated == 0]["seq_span_days"]
    t, p2 = stats.ttest_ind(esc_span, peace_span, equal_var=False)
    print(f"Mean sequence span: escalated {esc_span.mean():.2f} days vs peaceful {peace_span.mean():.2f} days. t={t:.2f} p={p2:.5f}")

    esc_size, peace_size = df[df.escalated == 1]["seq_size"], df[df.escalated == 0]["seq_size"]
    t3, p3 = stats.ttest_ind(esc_size, peace_size, equal_var=False)
    print(f"Mean sequence size: escalated {esc_size.mean():.2f} events vs peaceful {peace_size.mean():.2f} events. t={t3:.2f} p={p3:.5f}")

    df["bucket"] = pd.cut(df.seq_size, [0, 1, 2, 4, 100], labels=["1 (standalone)", "2", "3-4", "5+"])
    print("Escalation rate by sequence size:")
    print(df.groupby("bucket")["escalated"].agg(["mean", "count"]).to_string())


def q2_coverage_bias():
    print("\n===== Q2: is violence overrepresented in what this pipeline can see? =====")
    df = pd.read_csv("data/training_table_v3.csv")

    ct = pd.crosstab(df["had_gkg_match"], df["label_escalated"])
    chi2, p, _, _ = stats.chi2_contingency(ct)
    rate_match = df[df.had_gkg_match]["label_escalated"].mean()
    rate_nomatch = df[~df.had_gkg_match]["label_escalated"].mean()
    print(f"Escalation rate among GDELT-matched events: {rate_match:.1%} (n={df.had_gkg_match.sum()})")
    print(f"Escalation rate among UNMATCHED events: {rate_nomatch:.1%} (n={(~df.had_gkg_match).sum()})")
    print(f"chi2 p={p:.5f} -- {'significant' if p < 0.05 else 'not significant'} difference in who gets matched at all")

    matched = df[df.had_gkg_match]
    esc_vol = matched[matched.label_escalated == 1]["volume_mention_spike"]
    peace_vol = matched[matched.label_escalated == 0]["volume_mention_spike"]
    t, p2 = stats.ttest_ind(esc_vol, peace_vol, equal_var=False)
    print(f"Among matched events, coverage volume: escalated {esc_vol.mean():.1f} vs peaceful {peace_vol.mean():.1f}. t={t:.2f} p={p2:.5f}")
    print("Separately established (Phase 2, ACLED's own source_scale field): escalated events get "
          "national-scale press pickup 4.7x more often than peaceful ones -- a real, different bias "
          "from whether GDELT matches an event at all.")


def main():
    q1_sequence_and_escalation()
    q2_coverage_bias()
    print("\n===== Q3: does this make the project impossible? =====")
    print("Argued from Q1+Q2, not computed: no, but it narrows the honest claim to 'rank relative risk "
          "among events that generate real news signal' rather than 'estimate true violence probability' "
          "-- see the dashboard and report §8 for the full argument.")


if __name__ == "__main__":
    main()
