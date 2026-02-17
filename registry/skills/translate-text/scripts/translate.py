#!/usr/bin/env python3
"""
Translate text using the OpenAI API.
Requires OPENAI_API_KEY environment variable.
"""

import os
import sys
import json
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError


def translate(text: str) -> str:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        print("Error: OPENAI_API_KEY environment variable is not set.", file=sys.stderr)
        print("Please add OPENAI_API_KEY to your agent's environment variables.", file=sys.stderr)
        sys.exit(1)

    # Mask key for debug output (show first 8 chars only)
    masked_key = api_key[:8] + "..." if len(api_key) > 8 else "***"
    
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

    try:
        with urlopen(req, timeout=30) as response:
            result = json.loads(response.read())
            return result["choices"][0]["message"]["content"]
    except HTTPError as e:
        error_body = e.read().decode("utf-8", errors="replace")
        print(f"Error: OpenAI API returned HTTP {e.code}", file=sys.stderr)
        print(f"API Key used: {masked_key}", file=sys.stderr)
        try:
            error_json = json.loads(error_body)
            error_msg = error_json.get("error", {}).get("message", error_body)
            print(f"Details: {error_msg}", file=sys.stderr)
        except json.JSONDecodeError:
            print(f"Response: {error_body[:500]}", file=sys.stderr)
        sys.exit(1)
    except URLError as e:
        print(f"Error: Failed to connect to OpenAI API", file=sys.stderr)
        print(f"Reason: {e.reason}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error: Unexpected error during API call", file=sys.stderr)
        print(f"Details: {type(e).__name__}: {e}", file=sys.stderr)
        sys.exit(1)


def main():
    if len(sys.argv) > 1:
        input_text = " ".join(sys.argv[1:])
    else:
        input_text = sys.stdin.read()

    if not input_text.strip():
        print("Error: No input text provided", file=sys.stderr)
        sys.exit(1)

    print(translate(input_text))


if __name__ == "__main__":
    main()
