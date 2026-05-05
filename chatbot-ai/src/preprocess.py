"""
Text cleaning, vocabulary building, and sequence encoding pipeline.

Steps:
  1. Load raw pairs from data/processed/pairs.json
  2. Clean + filter pairs
  3. Build vocabulary (word → integer index)
  4. Encode every pair into padded integer sequences
  5. Save vocab → models/vocab.json
  6. Save encoded data → data/processed/encoded.json

Run from project root:
    python src/preprocess.py
"""

import json
import os
import re
import sys
from collections import Counter

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

# ── Special tokens ────────────────────────────────────────────────────────────
PAD_TOKEN = "<PAD>"   # index 0 – used for padding shorter sequences
SOS_TOKEN = "<SOS>"   # index 1 – start-of-sequence marker fed to the decoder
EOS_TOKEN = "<EOS>"   # index 2 – signals the end of a generated sequence
UNK_TOKEN = "<UNK>"   # index 3 – replaces words not in the vocabulary

SPECIAL_TOKENS = [PAD_TOKEN, SOS_TOKEN, EOS_TOKEN, UNK_TOKEN]

PAD_IDX = 0
SOS_IDX = 1
EOS_IDX = 2
UNK_IDX = 3

# Sentences longer than this (in tokens) are discarded
MAX_LENGTH = 20

# Words appearing fewer than this many times across all pairs are treated as <UNK>
MIN_WORD_FREQ = 3


# ── Text helpers ──────────────────────────────────────────────────────────────

def clean_text(text: str) -> str:
    """Lowercase and strip everything except letters, digits, and spaces."""
    text = text.lower()
    text = re.sub(r"[^a-z0-9\s]", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def tokenize(text: str) -> list:
    """Split on whitespace – simple but sufficient for this corpus."""
    return text.split()


def encode(tokens: list, vocab: dict, max_len: int) -> list:
    """
    Encoder input sequence (length = max_len + 1):
        [w1, w2, ..., wn, <EOS>, <PAD>, ...]
    """
    ids = [vocab.get(t, UNK_IDX) for t in tokens[:max_len]]
    ids.append(EOS_IDX)
    ids += [PAD_IDX] * (max_len + 1 - len(ids))
    return ids


def encode_decoder_target(tokens: list, vocab: dict, max_len: int) -> list:
    """
    Target sequence for the decoder (same length as encode(), i.e. max_len + 1).

    Layout:
        [<SOS>, w1, w2, ..., wk, <EOS>, <PAD>, ...]

    with k <= max_len - 1 so SOS + words + EOS fit. This matches inference, which
    starts decoding from <SOS>. (Using encode() here without SOS made training
    seed the decoder with the first real word, so the model never learned to
    predict that first word — generation collapsed to <EOS> and empty replies.)
    """
    max_words = max_len - 1
    body = [vocab.get(t, UNK_IDX) for t in tokens[:max_words]]
    ids = [SOS_IDX] + body + [EOS_IDX]
    ids += [PAD_IDX] * (max_len + 1 - len(ids))
    return ids


# ── Pipeline steps ────────────────────────────────────────────────────────────

def filter_pairs(pairs: list) -> list:
    """
    Clean text and discard pairs where either side is outside
    [1, MAX_LENGTH] tokens after cleaning.
    """
    filtered = []
    for p in pairs:
        inp = clean_text(p["input"])
        resp = clean_text(p["response"])
        inp_toks = tokenize(inp)
        resp_toks = tokenize(resp)
        if (1 <= len(inp_toks) <= MAX_LENGTH) and (1 <= len(resp_toks) <= MAX_LENGTH):
            filtered.append({"input": inp, "response": resp})
    return filtered


def build_vocab(pairs: list, min_freq: int = MIN_WORD_FREQ) -> dict:
    """
    Count every word across all pairs and keep those with freq >= min_freq.
    Special tokens are always inserted first at fixed indices 0-3.
    """
    counter: Counter = Counter()
    for p in pairs:
        counter.update(tokenize(p["input"]))
        counter.update(tokenize(p["response"]))

    vocab = {tok: idx for idx, tok in enumerate(SPECIAL_TOKENS)}
    for word, freq in counter.most_common():
        if freq >= min_freq:
            vocab[word] = len(vocab)
    return vocab


def preprocess(max_pairs: int = 50000) -> tuple:
    """
    Full preprocessing pipeline.

    Args:
        max_pairs: How many raw pairs to consider (subset for speed).

    Returns:
        (encoded_pairs, vocab) where encoded_pairs is a list of dicts
        with integer-list 'input' and 'response' fields.
    """
    pairs_path = os.path.join("data", "processed", "pairs.json")
    if not os.path.exists(pairs_path):
        raise FileNotFoundError(
            f"'{pairs_path}' not found. Run 'python src/data_extraction.py' first."
        )

    with open(pairs_path, "r", encoding="utf-8") as f:
        raw = json.load(f)
    print(f"Loaded {len(raw):,} raw pairs")

    pairs = filter_pairs(raw[:max_pairs])
    print(f"After filtering: {len(pairs):,} pairs (max {MAX_LENGTH} tokens per side)")

    vocab = build_vocab(pairs)
    print(f"Vocabulary size: {len(vocab):,} words")

    # Save vocabulary
    os.makedirs("models", exist_ok=True)
    vocab_path = os.path.join("models", "vocab.json")
    with open(vocab_path, "w", encoding="utf-8") as f:
        json.dump(vocab, f, ensure_ascii=False)
    print(f"Vocab saved -> {vocab_path}")

    # Encode every pair to integer sequences
    encoded = []
    for p in pairs:
        encoded.append({
            "input": encode(tokenize(p["input"]), vocab, MAX_LENGTH),
            "response": encode_decoder_target(
                tokenize(p["response"]), vocab, MAX_LENGTH
            ),
        })

    enc_path = os.path.join("data", "processed", "encoded.json")
    with open(enc_path, "w") as f:
        json.dump(encoded, f)
    print(f"Encoded data saved -> {enc_path}")

    return encoded, vocab


if __name__ == "__main__":
    preprocess()
