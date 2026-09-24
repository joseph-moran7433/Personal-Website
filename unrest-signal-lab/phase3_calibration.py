"""
phase3_calibration.py -- Phase 3, Part 1: fix "so 72% really means 72%",
the calibration promise deferred since Phase 1's plan-doc summary and
made urgent by Phase 2's finding that logistic regression's raw 0.5-cutoff
predictions collapsed to all-zero on the 2021-2024 test set.

Wraps both Phase 2 models in sklearn's CalibratedClassifierCV (isotonic
regression, 5-fold CV on the training set only -- the test set stays
untouched until final evaluation, same time-based split as Phase 2).
Reports reliability (predicted probability vs. actual observed
frequency) and Brier score before/after, on the real 64-event test set.
"""
import warnings
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler
from sklearn.calibration import CalibratedClassifierCV, calibration_curve
from sklearn.metrics import brier_score_loss, precision_score, recall_score

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
    return df.sort_values("event_date").reset_index(drop=True)


def main():
    df = load_table()
    cutoff = int(len(df) * 0.75)
    train, test = df.iloc[:cutoff], df.iloc[cutoff:]
    X_train, y_train = train[FEATURE_COLS], train["label_escalated"]
    X_test, y_test = test[FEATURE_COLS], test["label_escalated"]

    results = {}
    for name, base_model in [
        ("GBM", HistGradientBoostingClassifier(max_iter=100, max_depth=3, learning_rate=0.1, class_weight="balanced", random_state=42)),
        ("LogReg", Pipeline([
            ("impute", SimpleImputer(strategy="median")),
            ("scale", StandardScaler()),
            ("clf", LogisticRegression(class_weight="balanced", max_iter=1000, random_state=42)),
        ])),
    ]:
        base_model.fit(X_train, y_train)
        raw_prob = base_model.predict_proba(X_test)[:, 1]

        calibrated = CalibratedClassifierCV(base_model, method="isotonic", cv=5)
        calibrated.fit(X_train, y_train)
        cal_prob = calibrated.predict_proba(X_test)[:, 1]

        raw_brier = brier_score_loss(y_test, raw_prob)
        cal_brier = brier_score_loss(y_test, cal_prob)

        raw_pred = (raw_prob >= 0.5).astype(int)
        cal_pred = (cal_prob >= 0.5).astype(int)

        print(f"\n=== {name} ===")
        print(f"Raw:        Brier={raw_brier:.3f}  Precision={precision_score(y_test, raw_pred, zero_division=0):.3f}  Recall={recall_score(y_test, raw_pred, zero_division=0):.3f}")
        print(f"Calibrated: Brier={cal_brier:.3f}  Precision={precision_score(y_test, cal_pred, zero_division=0):.3f}  Recall={recall_score(y_test, cal_pred, zero_division=0):.3f}")

        frac_pos_raw, mean_pred_raw = calibration_curve(y_test, raw_prob, n_bins=5, strategy="quantile")
        frac_pos_cal, mean_pred_cal = calibration_curve(y_test, cal_prob, n_bins=5, strategy="quantile")
        print(f"Reliability (raw)  -- predicted bins: {np.round(mean_pred_raw,3).tolist()}, observed freq: {np.round(frac_pos_raw,3).tolist()}")
        print(f"Reliability (cal)  -- predicted bins: {np.round(mean_pred_cal,3).tolist()}, observed freq: {np.round(frac_pos_cal,3).tolist()}")
        print(f"Raw prob range on test: [{raw_prob.min():.3f}, {raw_prob.max():.3f}]  |  Calibrated range: [{cal_prob.min():.3f}, {cal_prob.max():.3f}]")

        results[name] = {
            "raw_prob": raw_prob, "cal_prob": cal_prob, "y_test": y_test.values,
            "raw_brier": raw_brier, "cal_brier": cal_brier,
        }

    return results


if __name__ == "__main__":
    main()
