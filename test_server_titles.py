#!/usr/bin/env python3
"""Test the Oxygen server's title handling."""

import requests
import json

test_text = """Introduction to Machine Learning

Machine learning has fundamentally transformed modern technology. Furthermore, the implications extend far beyond the technical realm.

Key Concepts

The key concept is that algorithms can learn from data."""

response = requests.post(
    "http://127.0.0.1:5001/humanize",
    json={"text": test_text, "strength": "medium"},
    headers={"Content-Type": "application/json"}
)

if response.status_code == 200:
    result = response.json()
    print("="  * 80)
    print("ORIGINAL:")
    print("=" * 80)
    print(test_text)
    print("\n" + "=" * 80)
    print("HUMANIZED:")
    print("=" * 80)
    print(result['humanized'])
    print("\n" + "=" * 80)
    print("STATS:")
    print("=" * 80)
    print(json.dumps(result.get('stats', {}), indent=2))
else:
    print(f"Error: {response.status_code}")
    print(response.text)
