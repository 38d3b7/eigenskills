#!/usr/bin/env python3
"""
Translate text using the OpenAI API.
Requires OPENAI_API_KEY environment variable.
"""

import os
import sys
import json
from urllib.request import Request, urlopen


def translate(text: str) -> str:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        print("Error: OPENAI_API_KEY not set", file=sys.stderr)
        sys.exit(1)

    request_body = json.dumps({
        "model": "gpt-4o-mini",
        "messages": [
            {
                "role": "system",
                "content": "You are a translator. Translate the user's text as requested. Return only the translated text, nothing else."
            },
            {"role": "user", "content": text}
        ],
        "max_tokens": 2000
    }).encode("utf-8")

    req = Request(
        "https://api.openai.com/v1/chat/completions",
        data=request_body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
    )

    with urlopen(req) as response:
        result = json.loads(response.read())
        return result["choices"][0]["message"]["content"]


def main():
    if len(sys.argv) > 1:
        input_text = " ".join(sys.argv[1:])
    else:
        input_text = sys.stdin.read()

    print(translate(input_text))


if __name__ == "__main__":
    main()
