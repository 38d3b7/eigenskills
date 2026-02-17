---
name: humanize-ai-text
description: >
  Detects AI-generated text patterns and rewrites content to sound more natural
  and human-written. Useful for editing drafts, improving readability, and
  reducing robotic tone in AI-assisted writing.
version: 1.0.0
author: eigenskills
requires_env: []
execution:
  - run: python3 scripts/transform.py {{input}}
dependencies:
  - python3
---

# Humanize AI Text

This skill takes AI-generated text and rewrites it to sound more natural.

## Usage

Provide text as input. The skill will:
1. Analyze the text for common AI-generated patterns (repetitive structure, hedging language, etc.)
2. Rewrite the text to sound more natural while preserving meaning

## Examples

Input: "It is important to note that the implementation of sustainable practices is crucial for the long-term viability of organizations."

Output: "Sustainable practices matter for any organization that wants to last."
