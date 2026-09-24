"""
phase3_shap.py -- Phase 3, Part 3: the "top 2-3 indicators" output the
original plan doc always wanted, built for real for the first time.

Uses the within-year time-based split (phase3_time_varying.py's fix --
every era gets real training exposure) on LOGISTIC REGRESSION, not the
gradient-boosted model -- checked directly, GBM still only recalls 0.20
on this split and never correctly flags a single 2022+ escalation,
consistent with every prior phase's finding that small-n favors the
simpler model. Explaining the weaker model just because tree explainers
are easier to code would be dishonest, so this uses shap.LinearExplainer
on the actual best-performing model (precision 0.676, recall 0.511).
"""
import warnings
import numpy as np
import pandas as pd
import shap
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import precision_score, recall_score, average_precision_score, roc_auc_score

warnings.filterwarnings("ignore")

FEATURE_COLS = [
    "avg_tone", "tone_positive_score", "tone_negative_score", "tone_polarity",
    "tone_activity_density", "tone_self_group_density", "tone_word_count",
    "goldstein_trend", "quad_class_ratio", "log_volume",
    "had_gkg_match", "had_events_match", "year_numeric",
]

LABELS = {
    "avg_tone": "average article tone", "tone_positive_score": "positive-word density",
    "tone_negative_score": "negative-word density", "tone_polarity": "emotional intensity (polarity)",
    "tone_activity_density": "activity-word density", "tone_self_group_density": "self/group-reference density",
    "tone_word_count": "article length", "goldstein_trend": "Goldstein Scale trend",
    "quad_class_ratio": "material-vs-verbal conflict ratio", "log_volume": "coverage volume (log)",
    "had_gkg_match": "had any GDELT article match", "had_events_match": "had any GDELT Events-table match",
    "year_numeric": "year",
}


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


def explain_event(feat_names, values, base_value, row_raw, prob):
    contribs = sorted(zip(feat_names, values), key=lambda t: -abs(t[1]))[:3]
    print(f"  predicted probability: {prob:.1%} (model's average: {base_value:.1%})")
    for feat, val in contribs:
        direction = "pushes UP" if val > 0 else "pushes DOWN"
        raw = row_raw[feat]
        raw_str = "no GDELT coverage for this" if pd.isna(raw) else f"{raw:.2f}"
        print(f"    - {LABELS[feat]} ({feat}={raw_str}): {direction} risk (SHAP {val:+.3f})")


def main():
    df = load_table()
    train, test = within_year_split(df)
    X_train, y_train = train[FEATURE_COLS], train["label_escalated"]
    X_test, y_test = test[FEATURE_COLS], test["label_escalated"]

    pipe = Pipeline([
        ("impute", SimpleImputer(strategy="median")),
        ("scale", StandardScaler()),
        ("clf", LogisticRegression(class_weight="balanced", max_iter=2000, random_state=42)),
    ])
    pipe.fit(X_train, y_train)
    prob = pipe.predict_proba(X_test)[:, 1]
    pred = (prob >= 0.5).astype(int)
    print(f"Model check -- precision {precision_score(y_test, pred, zero_division=0):.3f}, "
          f"recall {recall_score(y_test, pred, zero_division=0):.3f}, "
          f"PR-AUC {average_precision_score(y_test, prob):.3f}, ROC-AUC {roc_auc_score(y_test, prob):.3f}")

    X_train_transformed = pipe.named_steps["scale"].transform(pipe.named_steps["impute"].transform(X_train))
    X_test_transformed = pipe.named_steps["scale"].transform(pipe.named_steps["impute"].transform(X_test))
    explainer = shap.LinearExplainer(pipe.named_steps["clf"], X_train_transformed, feature_names=FEATURE_COLS)
    shap_values = explainer(X_test_transformed)
    base_value = 1 / (1 + np.exp(-shap_values.base_values[0]))  # logit -> probability

    test = test.reset_index(drop=True)
    test["prob"] = prob
    test["pred"] = pred

    tp = test[(test.label_escalated == 1) & (test.pred == 1)]
    fn = test[(test.label_escalated == 1) & (test.pred == 0)]
    tn = test[(test.label_escalated == 0) & (test.pred == 0)]
    print(f"\nTest set counts -- TP:{len(tp)} FN:{len(fn)} TN:{len(tn)} FP:{len(test[(test.label_escalated==0)&(test.pred==1)])}")
    print("TP years:", tp["year"].tolist())

    def pick(subset, prefer_year=None):
        if prefer_year is not None:
            match = subset[subset.year >= prefer_year]
            if len(match):
                return match.index[0]
        return subset.index[0] if len(subset) else None

    tp_idx = pick(tp, prefer_year=2022)
    fn_idx = pick(fn, prefer_year=2022)
    tn_idx = pick(tn, prefer_year=2022)

    for label, idx in [("Correctly flagged escalation", tp_idx), ("Missed escalation (false negative)", fn_idx), ("Correctly cleared as peaceful", tn_idx)]:
        print(f"\n=== {label} ===")
        if idx is None:
            print("  (none in test set)")
            continue
        row = test.loc[idx]
        print(f"  {row['event_id']} ({row['event_date'].date()}, {row['year']})")
        explain_event(FEATURE_COLS, shap_values.values[idx], base_value, row, row["prob"])


if __name__ == "__main__":
    main()
