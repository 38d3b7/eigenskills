---
name: translate-text
description: >
  Translates text between languages using the OpenAI API. Supports any language
  pair that GPT models can handle. Provide the target language and text as input.
version: 1.0.0
author: eigenskills
requires_env:
  - OPENAI_API_KEY
execution:
  - run: python3 scripts/translate.py {{input}}
dependencies:
  - python3
  - pip:openai
---

# Translate Text

This skill translates text between languages using the OpenAI API.

## Usage

Provide text with a target language instruction, e.g.:
- "Translate to Spanish: Hello, how are you?"
- "Convert this to Japanese: The weather is nice today."

## Requirements

Requires `OPENAI_API_KEY` environment variable to be configured.
