"""
phase4_tuning_refresh.py -- reproducible tuning pass for the two model
families the Phase 4 report labels "(tuned)": Random Forest and XGBoost.

This step existed in an earlier session but was never saved as its own
script -- its numbers were typed into the report by hand. Refilling the
GDELT gaps (Sept 2026) changed the underlying training data enough that
those numbers went stale, which surfaced the gap: there was no script
to just re-run. This is that script, using the same approach documented
in Phase 3 (StratifiedKFold, not TimeSeriesSplit -- TimeSeriesSplit folds
were too small to reliably contain both classes on this dataset).

Scoring metric for CV selection is average_precision (PR-AUC), matching
the ranking metric phase3_model_search.py reports models by.
"""
import warnings
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import GridSearchCV, StratifiedKFold
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.metrics import (
    precision_score, recall_score, f1_score, average_precision_score,
    roc_auc_score, brier_score_loss, confusion_matrix, roc_curve,
)
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


def evaluate(name, y_true, prob, pred):
    tn, fp, fn, tp = confusion_matrix(y_true, pred, labels=[0, 1]).ravel()
    m = {
        "precision": precision_score(y_true, pred, zero_division=0),
        "recall": recall_score(y_true, pred, zero_division=0),
        "f1": f1_score(y_true, pred, zero_division=0),
        "pr_auc": average_precision_score(y_true, prob),
        "roc_auc": roc_auc_score(y_true, prob),
        "brier": brier_score_loss(y_true, prob),
    }
    print(f"{name:32s} P={m['precision']:.3f} R={m['recall']:.3f} F1={m['f1']:.3f} "
          f"PR-AUC={m['pr_auc']:.3f} ROC-AUC={m['roc_auc']:.3f} Brier={m['brier']:.3f}  "
          f"TN{tn}/FP{fp}/FN{fn}/TP{tp}")
    return m


def main():
    df = load_table()
    train, test = within_year_split(df)
    X_train, y_train = train[FEATURE_COLS], train["label_escalated"]
    X_test, y_test = test[FEATURE_COLS], test["label_escalated"]
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)

    # Random Forest
    rf_pipe = Pipeline([("impute", SimpleImputer(strategy="median")),
                         ("clf", RandomForestClassifier(class_weight="balanced", random_state=42))])
    rf_grid = {
        "clf__n_estimators": [200, 300, 500],
        "clf__max_depth": [3, 5, 8, None],
        "clf__min_samples_leaf": [1, 2, 4],
    }
    rf_search = GridSearchCV(rf_pipe, rf_grid, cv=cv, scoring="average_precision", n_jobs=-1)
    rf_search.fit(X_train, y_train)
    rf_best = rf_search.best_estimator_
    print("Random Forest best params:", rf_search.best_params_, "CV PR-AUC:", round(rf_search.best_score_, 3))
    rf_prob = rf_best.predict_proba(X_test)[:, 1]
    rf_pred = (rf_prob >= 0.5).astype(int)
    evaluate("Random Forest (tuned)", y_test, rf_prob, rf_pred)

    # XGBoost
    scale_pos_weight = (y_train == 0).sum() / (y_train == 1).sum()
    xgb_grid = {
        "n_estimators": [50, 100, 200],
        "max_depth": [2, 3, 4],
        "learning_rate": [0.02, 0.05, 0.1],
        "reg_lambda": [1, 5, 10],
    }
    xgb_search = GridSearchCV(
        xgb.XGBClassifier(subsample=0.9, scale_pos_weight=scale_pos_weight, eval_metric="logloss", random_state=42),
        xgb_grid, cv=cv, scoring="average_precision", n_jobs=-1,
    )
    xgb_search.fit(X_train.fillna(X_train.median()), y_train)
    xgb_best = xgb_search.best_estimator_
    print("XGBoost best params:", xgb_search.best_params_, "CV PR-AUC:", round(xgb_search.best_score_, 3))
    xgb_prob = xgb_best.predict_proba(X_test.fillna(X_train.median()))[:, 1]
    xgb_pred = (xgb_prob >= 0.5).astype(int)
    evaluate("XGBoost (tuned)", y_test, xgb_prob, xgb_pred)

    fpr_rf, tpr_rf, _ = roc_curve(y_test, rf_prob)
    fpr_xgb, tpr_xgb, _ = roc_curve(y_test, xgb_prob)
    print("RF ROC points:", list(zip(np.round(fpr_rf, 3), np.round(tpr_rf, 3))))
    print("XGB ROC points:", list(zip(np.round(fpr_xgb, 3), np.round(tpr_xgb, 3))))


if __name__ == "__main__":
    main()
