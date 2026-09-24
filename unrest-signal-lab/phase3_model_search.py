"""
phase3_model_search.py -- Phase 3 revisited: re-run the FULL model
exploration on the within-year split (the actual fix, not the broken
global-chronological split every earlier chart was built on), and
empirically test several model families neither Phase 1 nor Phase 2
ever tried, instead of assuming the original two were good enough.

Tested, all on the identical within-year split / identical 13 features:
  - Logistic Regression        (Phase 1-3 baseline)
  - HistGradientBoostingClassifier (Phase 1-3 baseline)
  - Random Forest              (bagging -- should overfit less than
                                 boosting on 190 training rows)
  - Extra Trees                (more randomized than RF, often more
                                 robust on small/noisy tabular data)
  - XGBoost                    (the plan doc's own original ask,
                                 never actually implemented before now
                                 -- real L1/L2 regularization knobs
                                 sklearn's HistGBM doesn't expose)
  - SVM (RBF kernel)           (margin-based, no tree-overfitting risk,
                                 well-suited to small-n continuous data)
  - Gaussian Naive Bayes       (probabilistic by construction, cheap
                                 sanity-check on whether tree/margin
                                 complexity is even buying anything)
  - Balanced Random Forest     (imbalanced-learn; resamples each tree's
                                 bootstrap to be class-balanced, direct
                                 answer to the plan doc's "handles
                                 rare-event imbalance" requirement)

All results are on the honest within-year time-based split, all with
class weighting (not synthetic duplication, per the original plan
doc), and reported without cherry-picking -- worse results get printed
too.
"""
import warnings
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier, ExtraTreesClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.svm import SVC
from sklearn.naive_bayes import GaussianNB
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import (
    precision_score, recall_score, f1_score, average_precision_score,
    roc_auc_score, brier_score_loss, confusion_matrix, roc_curve, precision_recall_curve,
)
from imblearn.ensemble import BalancedRandomForestClassifier
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


def imputed_pipeline(clf):
    return Pipeline([("impute", SimpleImputer(strategy="median")), ("scale", StandardScaler()), ("clf", clf)])


def main():
    df = load_table()
    n_before = len(df)
    df = df[(df["had_gkg_match"] > 0) | (df["had_events_match"] > 0)].reset_index(drop=True)
    print(f"Dropped {n_before - len(df)}/{n_before} events with zero GDELT signal (neither table matched) "
          f"before modeling -- kept in training_table_v2.csv, but not trained or tested on since there is "
          f"no real pre-event news content behind them, only imputed feature values.\n")
    train, test = within_year_split(df)
    X_train, y_train = train[FEATURE_COLS], train["label_escalated"]
    X_test, y_test = test[FEATURE_COLS], test["label_escalated"]
    scale_pos_weight = (y_train == 0).sum() / (y_train == 1).sum()

    models = {
        "Logistic Regression": imputed_pipeline(LogisticRegression(class_weight="balanced", max_iter=2000, random_state=42)),
        "HistGBM (sklearn)": HistGradientBoostingClassifier(max_iter=100, max_depth=3, learning_rate=0.1, class_weight="balanced", random_state=42),
        "Random Forest": imputed_pipeline(RandomForestClassifier(n_estimators=300, max_depth=5, min_samples_leaf=4, class_weight="balanced", random_state=42)),
        "Extra Trees": imputed_pipeline(ExtraTreesClassifier(n_estimators=300, max_depth=5, min_samples_leaf=4, class_weight="balanced", random_state=42)),
        "SVM (RBF)": imputed_pipeline(SVC(kernel="rbf", C=1.0, gamma="scale", class_weight="balanced", probability=True, random_state=42)),
        "Gaussian Naive Bayes": imputed_pipeline(GaussianNB()),
        "XGBoost": xgb.XGBClassifier(
            n_estimators=200, max_depth=3, learning_rate=0.05, subsample=0.8, colsample_bytree=0.8,
            reg_alpha=0.5, reg_lambda=2.0, scale_pos_weight=scale_pos_weight,
            eval_metric="logloss", random_state=42,
        ),
        "Balanced Random Forest": BalancedRandomForestClassifier(n_estimators=300, max_depth=5, min_samples_leaf=4, random_state=42, sampling_strategy="all", replacement=True),
    }

    print(f"Within-year split -- train n={len(train)}, test n={len(test)}, "
          f"train escalated rate={y_train.mean():.1%}, test escalated rate={y_test.mean():.1%}\n")

    results = {}
    curves = {}
    for name, model in models.items():
        model.fit(X_train, y_train)
        prob = model.predict_proba(X_test)[:, 1]
        pred = (prob >= 0.5).astype(int)
        results[name] = evaluate(name, y_test, prob, pred)
        fpr, tpr, _ = roc_curve(y_test, prob)
        prec, rec, _ = precision_recall_curve(y_test, prob)
        curves[name] = {"roc": list(zip(np.round(fpr, 3).tolist(), np.round(tpr, 3).tolist())),
                         "pr": list(zip(np.round(rec, 3).tolist(), np.round(prec, 3).tolist()))}

    print("\n=== Ranked by PR-AUC ===")
    ranked = sorted(results.items(), key=lambda kv: -kv[1]["pr_auc"])
    for name, m in ranked:
        print(f"{name:32s} PR-AUC={m['pr_auc']:.3f}  ROC-AUC={m['roc_auc']:.3f}  F1={m['f1']:.3f}")

    best_name = ranked[0][0]
    print(f"\nBest by PR-AUC: {best_name}")
    print(f"\nROC curve points for {best_name}: {curves[best_name]['roc']}")
    print(f"PR curve points for {best_name}: {curves[best_name]['pr']}")

    second_name = ranked[1][0]
    print(f"\nROC curve points for {second_name}: {curves[second_name]['roc']}")
    print(f"PR curve points for {second_name}: {curves[second_name]['pr']}")

    if hasattr(models["Random Forest"].named_steps["clf"], "feature_importances_"):
        imp = pd.Series(models["Random Forest"].named_steps["clf"].feature_importances_, index=FEATURE_COLS).sort_values(ascending=False)
        print("\nRandom Forest feature importances:")
        print(imp.round(3).to_string())

    if hasattr(models["XGBoost"], "feature_importances_"):
        imp = pd.Series(models["XGBoost"].feature_importances_, index=FEATURE_COLS).sort_values(ascending=False)
        print("\nXGBoost feature importances:")
        print(imp.round(3).to_string())


if __name__ == "__main__":
    main()
