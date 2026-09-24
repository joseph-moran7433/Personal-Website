"""
phase3_time_varying.py -- Phase 3, Part 2: an actual time-varying-
coefficient model, not just a time-varying intercept.

Phase 2's audit found two features (tone_word_count, avg_tone) flip
sign in their correlation with escalation between 2020 and 2021-2024 --
evidence a single additive `year` feature can't capture, since it can
only shift a model's baseline, not the slope of another feature's
relationship to the outcome.

The fix tried here: add year-interaction terms (year_numeric x each
GDELT feature) to the logistic regression, letting every coefficient
have its own linear drift over time, not just the intercept. Compared
directly against Phase 2's plain-year model on the same time-based
split.
"""
import warnings
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import precision_score, recall_score, average_precision_score, roc_auc_score, brier_score_loss

warnings.filterwarnings("ignore")

BASE_FEATURES = [
    "avg_tone", "tone_positive_score", "tone_negative_score", "tone_polarity",
    "tone_activity_density", "tone_self_group_density", "tone_word_count",
    "goldstein_trend", "quad_class_ratio", "log_volume",
    "had_gkg_match", "had_events_match",
]


def load_table():
    df = pd.read_csv("data/training_table_v2.csv", parse_dates=["event_date"])
    df["log_volume"] = np.log1p(df["volume_mention_spike"])
    df["had_gkg_match"] = df["had_gkg_match"].astype(int)
    df["had_events_match"] = df["had_events_match"].astype(int)
    df["year_numeric"] = df["year"] - 2020
    for f in BASE_FEATURES:
        df[f"{f}_x_year"] = df[f] * df["year_numeric"]
    return df.sort_values("event_date").reset_index(drop=True)


def fit_eval(name, feature_cols, train, test):
    X_train, y_train = train[feature_cols], train["label_escalated"]
    X_test, y_test = test[feature_cols], test["label_escalated"]
    pipe = Pipeline([
        ("impute", SimpleImputer(strategy="median")),
        ("scale", StandardScaler()),
        ("clf", LogisticRegression(class_weight="balanced", max_iter=2000, random_state=42, C=0.5)),
    ])
    pipe.fit(X_train, y_train)
    prob = pipe.predict_proba(X_test)[:, 1]
    pred = (prob >= 0.5).astype(int)
    print(f"\n=== {name} ===")
    print(f"Precision: {precision_score(y_test, pred, zero_division=0):.3f}  "
          f"Recall: {recall_score(y_test, pred, zero_division=0):.3f}  "
          f"PR-AUC: {average_precision_score(y_test, prob):.3f}  "
          f"ROC-AUC: {roc_auc_score(y_test, prob):.3f}  "
          f"Brier: {brier_score_loss(y_test, prob):.3f}")
    print(f"Test prob range: [{prob.min():.3f}, {prob.max():.3f}], mean {prob.mean():.3f} (true rate {y_test.mean():.3f})")
    coefs = pd.Series(pipe.named_steps["clf"].coef_[0], index=feature_cols).sort_values(key=abs, ascending=False)
    print("Top coefficients:")
    print(coefs.head(8).round(3).to_string())
    return prob, pred


def main():
    df = load_table()
    cutoff = int(len(df) * 0.75)
    train, test = df.iloc[:cutoff], df.iloc[cutoff:]

    plain_features = BASE_FEATURES + ["year_numeric"]
    interact_features = BASE_FEATURES + ["year_numeric"] + [f"{f}_x_year" for f in BASE_FEATURES]

    fit_eval("Plain year feature (Phase 2 baseline)", plain_features, train, test)
    fit_eval("Year-interaction (time-varying coefficients)", interact_features, train, test)


if __name__ == "__main__":
    main()
