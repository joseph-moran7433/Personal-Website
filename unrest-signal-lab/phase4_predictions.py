"""
phase4_predictions.py -- Phase 4: generate real per-event predictions
from four models (Logistic Regression, Random Forest, XGBoost, HistGBM)
on the within-year split's TEST SET ONLY, tagged by year, for the
Phase 4 interactive tool -- pick a model, pick a year, see real
predictions. No train-set numbers are generated here on purpose: this
project has already shown train-set accuracy is systematically
misleading (Phase 1's overfitting demo, Phase 2's picker), so the
Phase 4 tool only ever shows held-out performance.
"""
import json
import warnings
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler
import xgboost as xgb

warnings.filterwarnings("ignore")

FEATURE_COLS = [
    "avg_tone", "tone_positive_score", "tone_negative_score", "tone_polarity",
    "tone_activity_density", "tone_self_group_density", "tone_word_count",
    "goldstein_trend", "quad_class_ratio", "log_volume",
    "had_gkg_match", "had_events_match", "year_numeric",
]


def load_table():
    df = pd.read_csv("data/training_table_v2.csv", parse_dates=["event_date"])
    df["log_volume"] = np.log1p(df["volume_mention_spike"])
    df["had_gkg_match"] = df["had_gkg_match"].astype(int)
    df["had_events_match"] = df["had_events_match"].astype(int)
    df["year_numeric"] = df["year"] - 2020
    return df


def within_year_split(df):
    train_parts, test_parts = [], []
    for year, sub in df.groupby("year"):
        sub = sub.sort_values("event_date")
        cut = max(1, int(len(sub) * 0.75))
        train_parts.append(sub.iloc[:cut])
        test_parts.append(sub.iloc[cut:])
    train = pd.concat(train_parts).sort_values("event_date").reset_index(drop=True)
    test = pd.concat(test_parts).sort_values("event_date").reset_index(drop=True)
    return train, test


def main():
    df = load_table()
    train, test = within_year_split(df)
    X_train, y_train = train[FEATURE_COLS], train["label_escalated"]
    X_test = test[FEATURE_COLS]

    models = {
        "logreg": Pipeline([("impute", SimpleImputer(strategy="median")), ("scale", StandardScaler()),
                             ("clf", LogisticRegression(class_weight="balanced", max_iter=2000, random_state=42))]),
        "rf": Pipeline([("impute", SimpleImputer(strategy="median")),
                        ("clf", RandomForestClassifier(n_estimators=300, max_depth=5, min_samples_leaf=4, class_weight="balanced", random_state=42))]),
        "xgb": xgb.XGBClassifier(n_estimators=100, max_depth=2, learning_rate=0.05, subsample=0.9, reg_lambda=5,
                                  scale_pos_weight=(y_train == 0).sum() / (y_train == 1).sum(), eval_metric="logloss", random_state=42),
        "histgbm": HistGradientBoostingClassifier(max_iter=100, max_depth=3, learning_rate=0.1, class_weight="balanced", random_state=42),
    }

    preds = {}
    for name, model in models.items():
        model.fit(X_train, y_train)
        preds[name] = model.predict_proba(X_test)[:, 1]

    records = []
    for i, row in test.reset_index(drop=True).iterrows():
        rec = {"event_id": row["event_id"], "date": row["event_date"].date().isoformat(),
               "year": int(row["year"]), "true": int(row["label_escalated"])}
        for name in models:
            rec[name] = round(float(preds[name][i]), 4)
        records.append(rec)

    with open("data/phase4_test_predictions.json", "w", encoding="utf-8") as f:
        json.dump(records, f, indent=2)
    print(f"Wrote data/phase4_test_predictions.json ({len(records)} test events, 4 models)")

    by_year = {}
    for r in records:
        by_year.setdefault(r["year"], 0)
        by_year[r["year"]] += 1
    print("Test events by year:", by_year)


if __name__ == "__main__":
    main()
