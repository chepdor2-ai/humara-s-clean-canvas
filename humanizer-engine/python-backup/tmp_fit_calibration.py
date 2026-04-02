import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score

from benchmark import BENCHMARK_CORPUS
from multi_detector import MultiDetector


def main():
    # Fit calibrators on raw detector outputs (pre-calibration).
    detector = MultiDetector(calibration={})
    y = np.array([label for label, _ in BENCHMARK_CORPUS], dtype=int)

    names = [p.name for p in detector.profiles]
    display = {p.name: p.display_name for p in detector.profiles}

    raw = {n: [] for n in names}
    for _, text in BENCHMARK_CORPUS:
        result = detector.analyze(text)
        for profile, det in zip(detector.profiles, result["detectors"]):
            raw[profile.name].append(det["ai_score"])

    print("DETECTOR_CALIBRATION = {")
    for n in names:
        X = np.array(raw[n], dtype=float).reshape(-1, 1)
        clf = LogisticRegression(C=0.35, solver="liblinear", random_state=42)
        clf.fit(X, y)

        a = float(clf.coef_[0][0])
        b = float(clf.intercept_[0])
        auc = roc_auc_score(y, X[:, 0] / 100.0)

        print(
            f'    "{n}": {{"a": {a:.5f}, "b": {b:.5f}, "auc": {auc:.4f}}}, '
            f'# {display[n]}'
        )
    print("}")


if __name__ == "__main__":
    main()
