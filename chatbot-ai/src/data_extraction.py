"""
Downloads the Cornell Movie Dialogs Corpus via ConvoKit and extracts
sequential conversation pairs (input → response).

Saves output to: data/processed/pairs.json

Run from project root:
    python src/data_extraction.py
"""

import json
import os
import sys

# Allow running directly from project root
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))


def extract_pairs(max_pairs: int = 50000) -> list:
    """
    Download the Cornell corpus and extract (input, response) pairs
    from consecutive utterances within each conversation.

    Args:
        max_pairs: Maximum number of pairs to extract.

    Returns:
        List of dicts with keys 'input' and 'response'.
    """
    from convokit import Corpus, download

    raw_dir = os.path.join("data", "raw")
    processed_dir = os.path.join("data", "processed")
    os.makedirs(raw_dir, exist_ok=True)
    os.makedirs(processed_dir, exist_ok=True)

    print("=" * 55)
    print("  Downloading Cornell Movie Dialogs Corpus (ConvoKit)")
    print("=" * 55)
    corpus_path = download("movie-corpus", data_dir=raw_dir)
    corpus = Corpus(filename=corpus_path)
    print(f"Corpus loaded from: {corpus_path}\n")

    pairs = []
    print("Extracting conversation pairs...")

    for convo in corpus.iter_conversations():
        utterances = list(convo.iter_utterances())

        # Each consecutive utterance pair is one training example
        for i in range(len(utterances) - 1):
            inp_text = utterances[i].text
            resp_text = utterances[i + 1].text

            # Skip empty or None utterances
            if not inp_text or not resp_text:
                continue
            inp_text = inp_text.strip()
            resp_text = resp_text.strip()
            if not inp_text or not resp_text:
                continue

            pairs.append({"input": inp_text, "response": resp_text})

            if len(pairs) >= max_pairs:
                break

        if len(pairs) >= max_pairs:
            break

    out_path = os.path.join(processed_dir, "pairs.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(pairs, f, ensure_ascii=False, indent=2)

    print(f"Extracted {len(pairs):,} pairs -> saved to {out_path}")
    return pairs


if __name__ == "__main__":
    extract_pairs(max_pairs=50000)
