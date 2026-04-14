"""Utility script: load and validate all YAML rule files."""

from pathlib import Path
import yaml
import sys


def main():
    rules_dir = Path(__file__).parent.parent / "app" / "rules"
    total = 0
    for f in sorted(rules_dir.glob("*.yaml")):
        data = yaml.safe_load(f.read_text(encoding="utf-8"))
        if not data or "rules" not in data:
            print(f"  SKIP {f.name} (no 'rules' key)")
            continue
        count = len(data["rules"])
        total += count
        print(f"  {f.name}: {count} rules")
    print(f"\nTotal: {total} rules loaded")


if __name__ == "__main__":
    main()
