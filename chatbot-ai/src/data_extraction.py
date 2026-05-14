"""
Downloads dialogue corpora and extracts sequential (input → response) pairs.

Sources (merged into one file):
  - Cornell Movie Dialogs          (ConvoKit `movie-corpus`)
  - DailyDialog                    (ConvLab JSON on Hugging Face)
  - Ubuntu troubleshooting chats   (ConvoKit `ubuntu-chat-logs`)
  - Reddit threads sample          (ConvoKit `reddit-corpus-small`, ~300k utterances)

Reddit text is noisy and can be low-quality or offensive; use `--no-reddit` if you want
movie + daily (+ Ubuntu) only.

Saves merged output to: data/processed/pairs.json

Run from project root:
    python src/data_extraction.py
    python src/data_extraction.py --no-reddit
    python src/data_extraction.py --reddit-max 50000
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.request
import zipfile

# Allow running directly from project root
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

DAILY_ZIP_URL = (
    "https://huggingface.co/datasets/ConvLab/dailydialog/resolve/main/data.zip"
)
DIALOGUES_JSON_IN_ZIP = "data/dialogues.json"


def _ensure_dirs() -> tuple[str, str]:
    raw_dir = os.path.join("data", "raw")
    processed_dir = os.path.join("data", "processed")
    os.makedirs(raw_dir, exist_ok=True)
    os.makedirs(processed_dir, exist_ok=True)
    return raw_dir, processed_dir


def extract_convokit_pairs(
    corpus_name: str,
    display_name: str,
    max_pairs: int | None,
) -> list[dict]:
    """
    Download any ConvoKit corpus and extract consecutive utterance pairs
    within each conversation (same pattern as the movie corpus).
    """
    from convokit import Corpus, download

    raw_dir, _ = _ensure_dirs()

    print("=" * 55)
    print(f"  {display_name} (`{corpus_name}`)")
    print("=" * 55)
    corpus_path = download(corpus_name, data_dir=raw_dir)
    corpus = Corpus(filename=corpus_path)
    print(f"Corpus loaded from: {corpus_path}\n")

    pairs: list[dict] = []
    print("Extracting consecutive-utterance pairs...")

    for convo in corpus.iter_conversations():
        utterances = list(convo.iter_utterances())
        for i in range(len(utterances) - 1):
            inp_text = utterances[i].text
            resp_text = utterances[i + 1].text
            if not inp_text or not resp_text:
                continue
            inp_text = inp_text.strip()
            resp_text = resp_text.strip()
            if not inp_text or not resp_text:
                continue
            pairs.append({"input": inp_text, "response": resp_text})
            if max_pairs is not None and len(pairs) >= max_pairs:
                break
        if max_pairs is not None and len(pairs) >= max_pairs:
            break

    print(f"  {display_name}: {len(pairs):,} pairs")
    return pairs


def _download_daily_zip(cache_path: str) -> None:
    if os.path.isfile(cache_path) and os.path.getsize(cache_path) > 0:
        print(f"DailyDialog zip already cached: {cache_path}")
        return
    print("Downloading DailyDialog (ConvLab data.zip)...")
    req = urllib.request.Request(
        DAILY_ZIP_URL,
        headers={"User-Agent": "chatbot-ai-data-extraction/1.0"},
    )
    with urllib.request.urlopen(req, timeout=300) as resp:
        data = resp.read()
    os.makedirs(os.path.dirname(cache_path), exist_ok=True)
    with open(cache_path, "wb") as f:
        f.write(data)
    print(f"  Saved to {cache_path}")


def extract_dailydialog_pairs(
    max_pairs: int | None = None,
    *,
    include_test: bool = True,
) -> list[dict]:
    """
    Load DailyDialog from ConvLab JSON inside data.zip (no `datasets` package).
    """
    raw_dir, _ = _ensure_dirs()
    cache_path = os.path.join(raw_dir, "dailydialog_convlab_data.zip")
    _download_daily_zip(cache_path)

    allowed = {"train", "validation"}
    if include_test:
        allowed.add("test")

    print("=" * 55)
    print("  DailyDialog (ConvLab JSON)")
    print("=" * 55)
    pairs: list[dict] = []
    with zipfile.ZipFile(cache_path, "r") as zf:
        with zf.open(DIALOGUES_JSON_IN_ZIP) as fp:
            dialogues = json.load(fp)

    for row in dialogues:
        if row.get("data_split") not in allowed:
            continue
        turns = row.get("turns") or []
        utts = []
        for t in turns:
            u = (t.get("utterance") or "").strip()
            if u:
                utts.append(u)
        for i in range(len(utts) - 1):
            pairs.append({"input": utts[i], "response": utts[i + 1]})
            if max_pairs is not None and len(pairs) >= max_pairs:
                break
        if max_pairs is not None and len(pairs) >= max_pairs:
            break

    print(f"  DailyDialog: {len(pairs):,} pairs (splits: {sorted(allowed)})")
    return pairs


def extract_pairs(
    cornell_max: int | None = None,
    daily_max: int | None = None,
    ubuntu_max: int | None = None,
    reddit_max: int | None = None,
    *,
    use_cornell: bool = True,
    use_daily: bool = True,
    use_ubuntu: bool = True,
    use_reddit: bool = True,
    daily_include_test: bool = True,
) -> list[dict]:
    """
    Merge all enabled sources into one pair list (Cornell → DailyDialog → Ubuntu → Reddit).

    Reddit is large (long first-time download); use use_reddit=False or reddit_max to limit.
    """
    _, processed_dir = _ensure_dirs()
    merged: list[dict] = []

    if use_cornell:
        merged.extend(
            extract_convokit_pairs(
                "movie-corpus",
                "Cornell Movie Dialogs",
                cornell_max if cornell_max else None,
            )
        )
    if use_daily:
        merged.extend(
            extract_dailydialog_pairs(
                daily_max if daily_max else None,
                include_test=daily_include_test,
            )
        )
    if use_ubuntu:
        merged.extend(
            extract_convokit_pairs(
                "ubuntu-chat-logs",
                "Ubuntu chat logs",
                ubuntu_max if ubuntu_max else None,
            )
        )
    if use_reddit:
        merged.extend(
            extract_convokit_pairs(
                "reddit-corpus-small",
                "Reddit (100 subreddits sample)",
                reddit_max if reddit_max else None,
            )
        )

    out_path = os.path.join(processed_dir, "pairs.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(merged, f, ensure_ascii=False, indent=2)

    print("-" * 55)
    print(f"Total {len(merged):,} pairs -> {out_path}")
    return merged


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Extract dialogue pairs for training.")
    p.add_argument(
        "--cornell-max",
        type=int,
        default=0,
        help="Max Cornell pairs (default 0 = no cap).",
    )
    p.add_argument(
        "--daily-max",
        type=int,
        default=None,
        help="Max DailyDialog pairs (default: no cap).",
    )
    p.add_argument(
        "--ubuntu-max",
        type=int,
        default=None,
        help="Max Ubuntu-chat pairs (default: no cap).",
    )
    p.add_argument(
        "--reddit-max",
        type=int,
        default=None,
        help="Max Reddit sample pairs (default: no cap; full sample is large).",
    )
    p.add_argument(
        "--cornell-only",
        action="store_true",
        help="Only Cornell movie corpus (skip DailyDialog, Ubuntu, Reddit).",
    )
    p.add_argument(
        "--daily-only",
        action="store_true",
        help="Only DailyDialog.",
    )
    p.add_argument(
        "--no-reddit",
        action="store_true",
        help="Skip Reddit corpus (faster, smaller download).",
    )
    p.add_argument(
        "--no-ubuntu",
        action="store_true",
        help="Skip Ubuntu chat corpus.",
    )
    p.add_argument(
        "--daily-exclude-test",
        action="store_true",
        help="Drop DailyDialog test split (default: train + validation + test).",
    )
    return p.parse_args()


if __name__ == "__main__":
    args = _parse_args()
    if args.cornell_only and args.daily_only:
        print("Error: use at most one of --cornell-only / --daily-only")
        sys.exit(1)
    cornell_cap = None if args.cornell_max == 0 else args.cornell_max
    only_one = args.cornell_only or args.daily_only
    extract_pairs(
        cornell_max=cornell_cap,
        daily_max=args.daily_max,
        ubuntu_max=args.ubuntu_max,
        reddit_max=args.reddit_max,
        use_cornell=not args.daily_only,
        use_daily=not args.cornell_only,
        use_ubuntu=(not args.no_ubuntu) and (not only_one),
        use_reddit=(not args.no_reddit) and (not only_one),
        daily_include_test=not args.daily_exclude_test,
    )
