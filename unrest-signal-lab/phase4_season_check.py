"""
phase4_season_check.py -- how much of Phase 4's accuracy could come from
the calendar instead of the news?

Found 2026-10-06 when the GDELT backfill finished: the ACLED sample's
peaceful events are bunched in January (backfill_peaceful_2022_2024.py took
one date-ordered page of 250 rows per year, which only reaches early
January), while nearly every Feb-Dec event in the sample escalated. That
made the old within-year chronological test set ~85% escalated, and it
means event date alone predicts the label in this sample.

This script reports, on the same stratified random split the Phase 4 models
use:
  1. escalation rate by calendar month across the modeled events
  2. a no-news baseline: "not January => escalated" (ROC-AUC / PR-AUC)
  3. the tuned XGBoost model on all test events vs. non-January test events

Run with the project venv:  .venv/Scripts/python.exe phase4_season_check.py
"""
import warnings

import xgboost as xgb
from sklearn.metrics import average_precision_score, roc_auc_score

import phase4_tuning_refresh_v3 as t

warnings.filterwarnings("ignore")


def main():
    df = t.load_table()
    df = df[(df["had_gkg_match"] > 0) | (df["had_events_match"] > 0)].reset_index(drop=True)
    month = df["event_date"].dt.month
    jan = df[month == 1]
    rest = df[month != 1]
    print(f"Modeled events: {len(df)}")
    print(f"  January:  n={len(jan)}  escalated={jan['label_escalated'].mean():.1%}")
    print(f"  Feb-Dec:  n={len(rest)}  escalated={rest['label_escalated'].mean():.1%}")
    print(f"  Peaceful events dated in January: {(jan['label_escalated'] == 0).sum()}/{(df['label_escalated'] == 0).sum()}")

    train, test = t.stratified_random_split(df)
    y = test["label_escalated"]
    rule = (test["event_date"].dt.month != 1).astype(int)
    print(f"\nTest set: n={len(test)}, escalated={y.mean():.1%} (PR-AUC no-skill baseline = {y.mean():.3f})")
    print(f"No-news rule 'not January => escalated':  ROC-AUC={roc_auc_score(y, rule):.3f}  PR-AUC={average_precision_score(y, rule):.3f}")

    spw = (train["label_escalated"] == 0).sum() / (train["label_escalated"] == 1).sum()
    model = xgb.XGBClassifier(learning_rate=0.02, max_depth=3, n_estimators=100, reg_lambda=1, subsample=0.9,
                              scale_pos_weight=spw, eval_metric="logloss", random_state=42)
    model.fit(train[t.FEATURE_COLS], train["label_escalated"])
    p = model.predict_proba(test[t.FEATURE_COLS])[:, 1]
    print(f"Tuned XGBoost, all test events:          ROC-AUC={roc_auc_score(y, p):.3f}  PR-AUC={average_precision_score(y, p):.3f}")
    nj = (test["event_date"].dt.month != 1).values
    yn = y[nj]
    print(f"Tuned XGBoost, non-January test events:  n={nj.sum()} ({int((yn == 0).sum())} peaceful)  "
          f"ROC-AUC={roc_auc_score(yn, p[nj]):.3f}  PR-AUC={average_precision_score(yn, p[nj]):.3f}  base={yn.mean():.3f}")


if __name__ == "__main__":
    main()
