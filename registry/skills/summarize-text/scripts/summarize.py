#!/usr/bin/env python3
"""
Simple extractive text summarizer.
Scores sentences by word frequency and returns the top ones.
No external dependencies required.
"""

import sys
import re
from collections import Counter


def summarize(text: str, num_sentences: int = 3) -> str:
    sentences = re.split(r'(?<=[.!?])\s+', text.strip())

    if len(sentences) <= num_sentences:
        return text.strip()

    words = re.findall(r'\b[a-z]+\b', text.lower())
    stop_words = {
        'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
        'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
        'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for',
        'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
        'before', 'after', 'above', 'below', 'between', 'and', 'but', 'or',
        'not', 'no', 'nor', 'so', 'yet', 'both', 'either', 'neither', 'each',
        'every', 'all', 'any', 'few', 'more', 'most', 'other', 'some', 'such',
        'than', 'too', 'very', 'just', 'because', 'if', 'when', 'while',
        'where', 'how', 'what', 'which', 'who', 'whom', 'this', 'that',
        'these', 'those', 'it', 'its', 'i', 'me', 'my', 'we', 'our', 'you',
        'your', 'he', 'him', 'his', 'she', 'her', 'they', 'them', 'their',
    }

    word_freq = Counter(w for w in words if w not in stop_words)

    scored = []
    for i, sentence in enumerate(sentences):
        sentence_words = re.findall(r'\b[a-z]+\b', sentence.lower())
        score = sum(word_freq.get(w, 0) for w in sentence_words)
        scored.append((score, i, sentence))

    scored.sort(key=lambda x: x[0], reverse=True)
    top = sorted(scored[:num_sentences], key=lambda x: x[1])

    return " ".join(s[2] for s in top)


def main():
    if len(sys.argv) > 1:
        input_text = " ".join(sys.argv[1:])
    else:
        input_text = sys.stdin.read()

    print(summarize(input_text))


if __name__ == "__main__":
    main()
