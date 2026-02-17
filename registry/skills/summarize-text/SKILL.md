---
name: summarize-text
description: >
  Summarizes long text into concise bullet points or a short paragraph.
  Works with articles, documents, meeting notes, or any lengthy content.
  No external API required — uses simple extractive summarization.
version: 1.0.0
author: eigenskills
requires_env: []
execution:
  - run: python3 scripts/summarize.py {{input}}
dependencies:
  - python3
---

# Summarize Text

This skill takes long text and produces a concise summary.

## Usage

Provide text as input. The skill will extract the most important sentences
and return a condensed version.

## Examples

Input: A 500-word article about climate change.

Output: 3-5 key sentences capturing the main points.
