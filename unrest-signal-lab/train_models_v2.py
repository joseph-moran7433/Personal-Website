"""
train_models_v2.py -- Phase 2: retrain both Phase 1 models on the
combined 255-event table (100 from 2020 + 155 from 2021-2024), adding
an explicit `year` feature so the model can learn a time-varying
baseline instead of silently treating 2020's unusual escalation rate as
universal (mentor note on time-varying parameters).

Same two models, same class weighting, same time-based split logic as
Phase 1's train_models.py -- only the input table and the added `year`
feature are new. Numbers are compared honestly against the Phase 1
100-event run, not just reported in isolation.
"""
import json
import warnings
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import (
    precision_score, recall_score, f1_score, average_precision_score,
    confusion_matrix, roc_auc_score, roc_curve, precision_recall_curve,
)
from sklearn.inspection import permutation_importance

warnings.filterwarnings("ignore")

FEATURE_COLS = [
    "avg_tone", "tone_positive_score", "tone_negative_score", "tone_polarity",
    "tone_activity_density", "tone_self_group_density", "tone_word_count",
    "goldstein_trend", "quad_class_ratio", "log_volume",
    "had_gkg_match", "had_events_match", "year_numeric",
]
TEST_FRACTION = 0.25


def load_table():
    df = pd.read_csv("data/training_table_v2.csv", parse_dates=["event_date"])
    df["log_volume"] = np.log1p(df["volume_mention_spike"])
    df["had_gkg_match"] = df["had_gkg_match"].astype(int)
    df["had_events_match"] = df["had_events_match"].astype(int)
    df["year_numeric"] = df["year"] - 2020
    return df.sort_values("event_date").reset_index(drop=True)


def time_split(df):
    cutoff = int(len(df) * (1 - TEST_FRACTION))
    return df.iloc[:cutoff], df.iloc[cutoff:]


def evaluate(name, y_true, y_pred, y_prob):
    print(f"\n--- {name} ---")
    print(f"Precision: {precision_score(y_true, y_pred, zero_division=0):.3f}  "
          f"Recall: {recall_score(y_true, y_pred, zero_division=0):.3f}  "
          f"F1: {f1_score(y_true, y_pred, zero_division=0):.3f}")
    print(f"PR-AUC: {average_precision_score(y_true, y_prob):.3f}  "
          f"ROC-AUC: {roc_auc_score(y_true, y_prob):.3f}")
    tn, fp, fn, tp = confusion_matrix(y_true, y_pred, labels=[0, 1]).ravel()
    print(f"Confusion -- TN:{tn} FP:{fp} FN:{fn} TP:{tp}")
    return {
        "precision": precision_score(y_true, y_pred, zero_division=0),
        "recall": recall_score(y_true, y_pred, zero_division=0),
        "f1": f1_score(y_true, y_pred, zero_division=0),
        "pr_auc": average_precision_score(y_true, y_prob),
        "roc_auc": roc_auc_score(y_true, y_prob),
    }


def main():
    df = load_table()
    train, test = time_split(df)

    print(f"[v2] {len(df)} total events -- train {len(train)} "
          f"({train['event_date'].min().date()}..{train['event_date'].max().date()}), "
          f"test {len(test)} ({test['event_date'].min().date()}..{test['event_date'].max().date()})")
    print(f"[v2] escalated rate -- train {train['label_escalated'].mean():.1%}, test {test['label_escalated'].mean():.1%}")
    print(f"[v2] year distribution -- train: {train['year'].value_counts().sort_index().to_dict()}, "
          f"test: {test['year'].value_counts().sort_index().to_dict()}")

    X_train, y_train = train[FEATURE_COLS], train["label_escalated"]
    X_test, y_test = test[FEATURE_COLS], test["label_escalated"]

    gbm = HistGradientBoostingClassifier(max_iter=100, max_depth=3, learning_rate=0.1, class_weight="balanced", random_state=42)
    gbm.fit(X_train, y_train)
    gbm_prob = gbm.predict_proba(X_test)[:, 1]
    gbm_pred = (gbm_prob >= 0.5).astype(int)
    gbm_metrics = evaluate("Gradient-Boosted Trees (v2, 255 events)", y_test, gbm_pred, gbm_prob)

    logit_pipeline = Pipeline([
        ("impute", SimpleImputer(strategy="median")),
        ("scale", StandardScaler()),
        ("clf", LogisticRegression(class_weight="balanced", max_iter=1000, random_state=42)),
    ])
    logit_pipeline.fit(X_train, y_train)
    logit_prob = logit_pipeline.predict_proba(X_test)[:, 1]
    logit_pred = (logit_prob >= 0.5).astype(int)
    logit_metrics = evaluate("Logistic Regression (v2, 255 events)", y_test, logit_pred, logit_prob)

    print("\n--- Comparison: Phase 1 (100 events) vs Phase 2 (255 events) ---")
    phase1 = {
        "GBM": {"precision": 0.636, "recall": 0.467, "pr_auc": 0.638, "roc_auc": 0.500},
        "LogReg": {"precision": 0.778, "recall": 0.467, "pr_auc": 0.787, "roc_auc": 0.733},
    }
    comparison = pd.DataFrame({
        "GBM Phase1": phase1["GBM"], "GBM Phase2": {k: gbm_metrics[k] for k in phase1["GBM"]},
        "LogReg Phase1": phase1["LogReg"], "LogReg Phase2": {k: logit_metrics[k] for k in phase1["LogReg"]},
    }).round(3)
    print(comparison.to_string())

    perm = permutation_importance(gbm, X_test, y_test, n_repeats=30, random_state=42, scoring="average_precision")
    gbm_importance = pd.Series(perm.importances_mean, index=FEATURE_COLS).sort_values(ascending=False)
    print("\nGBM permutation importance (v2):")
    print(gbm_importance.round(3).to_string())

    logit_coefs = pd.Series(logit_pipeline.named_steps["clf"].coef_[0], index=FEATURE_COLS).sort_values(key=abs, ascending=False)
    print("\nLogistic regression coefficients (v2):")
    print(logit_coefs.round(3).to_string())

    # ROC / PR curve points for the page charts
    for name, prob in [("gbm", gbm_prob), ("logit", logit_prob)]:
        fpr, tpr, _ = roc_curve(y_test, prob)
        prec, rec, _ = precision_recall_curve(y_test, prob)
        print(f"\n{name} ROC points: {list(zip(np.round(fpr,3).tolist(), np.round(tpr,3).tolist()))}")
        print(f"{name} PR points: {list(zip(np.round(rec,3).tolist(), np.round(prec,3).tolist()))}")

    # Full predictions (train+test) for the interactive picker
    X_all = df[FEATURE_COLS]
    gbm_prob_all = gbm.predict_proba(X_all)[:, 1]
    logit_prob_all = logit_pipeline.predict_proba(X_all)[:, 1]
    df["dataset"] = ["train"] * len(train) + ["test"] * len(test)
    records = []
    for i, row in df.iterrows():
        records.append({
            "event_id": row["event_id"], "date": row["event_date"].date().isoformat(),
            "dataset": row["dataset"], "true": int(row["label_escalated"]),
            "gbm": round(float(gbm_prob_all[i]), 4), "logit": round(float(logit_prob_all[i]), 4),
        })
    with open("data/model_predictions_v2.json", "w", encoding="utf-8") as f:
        json.dump(records, f, indent=2)
    print(f"\n[v2] wrote data/model_predictions_v2.json ({len(records)} records)")

    train_acc_gbm = ((gbm.predict_proba(X_train)[:, 1] >= 0.5).astype(int) == y_train).mean()
    train_acc_logit = ((logit_pipeline.predict_proba(X_train)[:, 1] >= 0.5).astype(int) == y_train).mean()
    test_acc_gbm = (gbm_pred == y_test).mean()
    test_acc_logit = (logit_pred == y_test).mean()
    print(f"\n[v2] Train/test accuracy -- GBM: {train_acc_gbm:.1%} / {test_acc_gbm:.1%}, "
          f"LogReg: {train_acc_logit:.1%} / {test_acc_logit:.1%}")


if __name__ == "__main__":
    main()
