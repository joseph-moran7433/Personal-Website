"""
train_models.py -- Phase 1, Step 2: preliminary models on the cleaned
training table (data/training_table.csv), built entirely from data
already pulled in Phase 0 -- no new ACLED or BigQuery calls.

Trains and compares two models per the plan doc (civil-unrest-risk-
classifier-plan.pdf): a gradient-boosted tree classifier and a logistic
regression "interpretability sanity check", both with class weighting
(not synthetic row duplication) and a time-based train/test split so the
model is validated on events it never saw, not a random split.

Honest caveats, stated up front rather than buried:
  - n=100 events (76 with any post-geo-filter GDELT signal) is far too
    small to trust these numbers as real-world performance -- this is a
    feasibility/preliminary check, not a validated model.
  - The ACLED pull was deliberately stratified 250 Protests + 250 Riots,
    not a natural random sample, so the ~60% escalated rate here is a
    sampling artifact, not the true real-world base rate. These metrics
    measure whether the features can SEPARATE the two classes, not
    calibrated real-world risk.
"""
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
    confusion_matrix, roc_auc_score,
)
from sklearn.inspection import permutation_importance

warnings.filterwarnings("ignore")

FEATURE_COLS = [
    "avg_tone", "tone_positive_score", "tone_negative_score", "tone_polarity",
    "tone_activity_density", "tone_self_group_density", "tone_word_count",
    "goldstein_trend", "quad_class_ratio", "log_volume",
    "had_gkg_match", "had_events_match",
]
TEST_FRACTION = 0.25


def load_table():
    df = pd.read_csv("data/training_table.csv", parse_dates=["event_date"])
    df["log_volume"] = np.log1p(df["volume_mention_spike"])
    df["had_gkg_match"] = df["had_gkg_match"].astype(int)
    df["had_events_match"] = df["had_events_match"].astype(int)
    return df.sort_values("event_date").reset_index(drop=True)


def time_split(df):
    cutoff = int(len(df) * (1 - TEST_FRACTION))
    train, test = df.iloc[:cutoff], df.iloc[cutoff:]
    return train, test


def evaluate(name, y_true, y_pred, y_prob):
    print(f"\n--- {name} ---")
    print(f"Precision: {precision_score(y_true, y_pred, zero_division=0):.3f}  "
          f"Recall: {recall_score(y_true, y_pred, zero_division=0):.3f}  "
          f"F1: {f1_score(y_true, y_pred, zero_division=0):.3f}")
    print(f"PR-AUC (average precision): {average_precision_score(y_true, y_prob):.3f}  "
          f"ROC-AUC: {roc_auc_score(y_true, y_prob):.3f}")
    tn, fp, fn, tp = confusion_matrix(y_true, y_pred, labels=[0, 1]).ravel()
    print(f"Confusion matrix -- TN:{tn} FP:{fp} FN:{fn} TP:{tp}")
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

    print(f"[train_models] {len(df)} total events -- train {len(train)} "
          f"({train['event_date'].min().date()}..{train['event_date'].max().date()}), "
          f"test {len(test)} ({test['event_date'].min().date()}..{test['event_date'].max().date()})")
    print(f"[train_models] escalated rate -- train {train['label_escalated'].mean():.1%}, "
          f"test {test['label_escalated'].mean():.1%}")

    X_train, y_train = train[FEATURE_COLS], train["label_escalated"]
    X_test, y_test = test[FEATURE_COLS], test["label_escalated"]

    # Model 1: gradient-boosted trees. Handles NaN (missing GDELT match) natively,
    # so no imputation needed here -- missingness itself can carry signal.
    gbm = HistGradientBoostingClassifier(
        max_iter=100, max_depth=3, learning_rate=0.1,
        class_weight="balanced", random_state=42,
    )
    gbm.fit(X_train, y_train)
    gbm_prob = gbm.predict_proba(X_test)[:, 1]
    gbm_pred = (gbm_prob >= 0.5).astype(int)
    gbm_metrics = evaluate("Gradient-Boosted Trees (HistGradientBoostingClassifier)", y_test, gbm_pred, gbm_prob)

    # Model 2: logistic regression, the plan doc's "interpretability sanity check".
    # Needs imputation + scaling since it can't handle NaN directly.
    logit_pipeline = Pipeline([
        ("impute", SimpleImputer(strategy="median")),
        ("scale", StandardScaler()),
        ("clf", LogisticRegression(class_weight="balanced", max_iter=1000, random_state=42)),
    ])
    logit_pipeline.fit(X_train, y_train)
    logit_prob = logit_pipeline.predict_proba(X_test)[:, 1]
    logit_pred = (logit_prob >= 0.5).astype(int)
    logit_metrics = evaluate("Logistic Regression (median-imputed, scaled)", y_test, logit_pred, logit_prob)

    print("\n--- Feature importance / coefficients ---")
    perm = permutation_importance(gbm, X_test, y_test, n_repeats=30, random_state=42, scoring="average_precision")
    gbm_importance = pd.Series(perm.importances_mean, index=FEATURE_COLS).sort_values(ascending=False)
    print("GBM permutation importance (drop in test PR-AUC when a feature is shuffled):")
    print(gbm_importance.round(3).to_string())

    logit_coefs = pd.Series(logit_pipeline.named_steps["clf"].coef_[0], index=FEATURE_COLS).sort_values(key=abs, ascending=False)
    print("\nLogistic regression standardized coefficients (sign = direction, magnitude = strength):")
    print(logit_coefs.round(3).to_string())

    print("\n--- Model comparison ---")
    comparison = pd.DataFrame({"GBM": gbm_metrics, "LogisticRegression": logit_metrics}).round(3)
    print(comparison.to_string())

    better = "GBM" if gbm_metrics["pr_auc"] >= logit_metrics["pr_auc"] else "LogisticRegression"
    print(f"\n[train_models] Higher PR-AUC on this test split: {better}. "
          f"With only {len(test)} test events, treat this as directional, not conclusive.")


if __name__ == "__main__":
    main()
