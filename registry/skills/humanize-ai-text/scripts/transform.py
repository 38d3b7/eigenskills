#!/usr/bin/env python3
"""
Humanize AI-generated text by applying simple pattern-based transformations.
This is a minimal example skill script.
"""

import sys
import re


def humanize(text: str) -> str:
    replacements = [
        (r"\bIt is important to note that\b", ""),
        (r"\bIn order to\b", "To"),
        (r"\bUtilize\b", "Use"),
        (r"\butilize\b", "use"),
        (r"\bIt is worth mentioning that\b", ""),
        (r"\bIn conclusion,?\b", ""),
        (r"\bFurthermore,?\b", "Also,"),
        (r"\bAdditionally,?\b", "Also,"),
        (r"\bNevertheless,?\b", "Still,"),
        (r"\bConsequently,?\b", "So,"),
    ]

    result = text
    for pattern, replacement in replacements:
        result = re.sub(pattern, replacement, result, flags=re.IGNORECASE)

    result = re.sub(r"\s{2,}", " ", result).strip()
    return result


def main():
    if len(sys.argv) > 1:
        input_text = " ".join(sys.argv[1:])
    else:
        input_text = sys.stdin.read()

    print(humanize(input_text))


if __name__ == "__main__":
    main()
