"""
Deutsche Dialogdaten für Modulon herunterladen und extrahieren.

Quellen (automatisch heruntergeladen von OPUS):
  1. OpenSubtitles DE   — Film-/TV-Untertitel        → ~1.5 M Paare
  2. Tatoeba DE         — natürliche deutsche Sätze  → ~90 K  Paare
  3. OPUS Books DE      — deutsche Literatur          → ~100 K Paare
  4. OPUS EUbookshop DE — EU-Dokumente (formal DE)   → ~150 K Paare

Gesamt-Ziel: ~1.8–2 Millionen Paare

Ausgabe: data/processed/pairs.json

Ausführen vom Projektverzeichnis:
    python src/data_extraction_de.py
    python src/data_extraction_de.py --opensubs-lines 5000000   (noch mehr)
    python src/data_extraction_de.py --no-eubookshop            (schneller)
"""

from __future__ import annotations

import argparse
import gzip
import json
import os
import re
import urllib.request

# ── OPUS-Quellen ──────────────────────────────────────────────────────────────
SOURCES = {
    "opensubs": {
        "url":  "https://object.pouta.csc.fi/OPUS-OpenSubtitles/v2018/mono/de.txt.gz",
        "name": "OpenSubtitles DE (Film-/TV-Dialoge)",
        "default_lines": 3_000_000,   # ~1.5 M Paare
    },
    "tatoeba": {
        "url":  "https://object.pouta.csc.fi/OPUS-Tatoeba/v2023-04-12/mono/de.txt.gz",
        "name": "Tatoeba DE (kurze natürliche Sätze)",
        "default_lines": 200_000,     # ~90 K Paare
    },
    "books": {
        "url":  "https://object.pouta.csc.fi/OPUS-Books/v1/mono/de.txt.gz",
        "name": "OPUS Books DE (deutsche Literatur)",
        "default_lines": 400_000,     # ~100 K Paare
    },
    "eubookshop": {
        "url":  "https://object.pouta.csc.fi/OPUS-EUbookshop/v3/mono/de.txt.gz",
        "name": "OPUS EUbookshop DE (formales Deutsch)",
        "default_lines": 500_000,     # ~150 K Paare
    },
}

# ── Filterparameter ───────────────────────────────────────────────────────────
MIN_WORDS = 2
MAX_WORDS = 20
MIN_CHARS = 4

_ALLOWED   = re.compile(r"^[a-zA-ZäöüÄÖÜß0-9\s\.,!?\'\"\-:;\(\)]+$")
_SKIP      = re.compile(
    r"(www\.|http|\.com|@|#|<[^>]+>|\{|\}|\[|\]|©|♪|♫|\d{2}:\d{2})",
    re.IGNORECASE,
)


def _is_good(text: str) -> bool:
    if len(text) < MIN_CHARS:
        return False
    if _SKIP.search(text):
        return False
    words = text.split()
    if not (MIN_WORDS <= len(words) <= MAX_WORDS):
        return False
    if not _ALLOWED.match(text):
        return False
    return True


def _clean(text: str) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    text = re.sub(r"^[-–—]\s*", "", text)
    return text.strip()


def stream_pairs(url: str, name: str, max_lines: int) -> list[dict]:
    """
    Streamt eine gzip-Datei von OPUS, liest bis zu max_lines Zeilen
    und gibt aufeinanderfolgende gute Zeilen als Dialogpaare zurück.
    """
    print(f"\n{'=' * 60}")
    print(f"  {name}")
    print(f"  Lese bis zu {max_lines:,} Zeilen ...")
    print("=" * 60)

    pairs: list[dict] = []
    lines_read = 0
    prev: str | None = None

    req = urllib.request.Request(url, headers={"User-Agent": "modulon-data/2.0"})
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            with gzip.GzipFile(fileobj=resp) as gz:
                for raw in gz:
                    if lines_read >= max_lines:
                        break
                    lines_read += 1

                    try:
                        line = _clean(raw.decode("utf-8", errors="ignore"))
                    except Exception:
                        prev = None
                        continue

                    if not _is_good(line):
                        prev = None
                        continue

                    if prev is not None:
                        pairs.append({"input": prev, "response": line})
                    prev = line

                    if lines_read % 500_000 == 0:
                        print(f"  ... {lines_read:,} Zeilen | {len(pairs):,} Paare")

    except KeyboardInterrupt:
        print("\n  Abgebrochen — bisherige Daten werden gespeichert.")
    except Exception as exc:
        print(f"\n  Fehler: {exc} — bisherige Daten werden gespeichert.")

    print(f"  ✓ {lines_read:,} Zeilen → {len(pairs):,} Paare")
    return pairs


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--opensubs-lines",  type=int, default=SOURCES["opensubs"]["default_lines"])
    parser.add_argument("--tatoeba-lines",   type=int, default=SOURCES["tatoeba"]["default_lines"])
    parser.add_argument("--books-lines",     type=int, default=SOURCES["books"]["default_lines"])
    parser.add_argument("--eubookshop-lines",type=int, default=SOURCES["eubookshop"]["default_lines"])
    parser.add_argument("--no-tatoeba",      action="store_true")
    parser.add_argument("--no-books",        action="store_true")
    parser.add_argument("--no-eubookshop",   action="store_true")
    args = parser.parse_args()

    print("\n" + "=" * 60)
    print("  Modulon — Deutsche Trainingsdaten (Erweitert)")
    print("=" * 60)

    all_pairs: list[dict] = []

    # 1. OpenSubtitles (Hauptquelle)
    all_pairs += stream_pairs(
        SOURCES["opensubs"]["url"],
        SOURCES["opensubs"]["name"],
        args.opensubs_lines,
    )

    # 2. Tatoeba
    if not args.no_tatoeba:
        all_pairs += stream_pairs(
            SOURCES["tatoeba"]["url"],
            SOURCES["tatoeba"]["name"],
            args.tatoeba_lines,
        )

    # 3. Books
    if not args.no_books:
        all_pairs += stream_pairs(
            SOURCES["books"]["url"],
            SOURCES["books"]["name"],
            args.books_lines,
        )

    # 4. EUbookshop
    if not args.no_eubookshop:
        all_pairs += stream_pairs(
            SOURCES["eubookshop"]["url"],
            SOURCES["eubookshop"]["name"],
            args.eubookshop_lines,
        )

    # Speichern
    os.makedirs(os.path.join("data", "processed"), exist_ok=True)
    out = os.path.join("data", "processed", "pairs.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(all_pairs, f, ensure_ascii=False, indent=2)

    print("\n" + "=" * 60)
    print(f"  GESAMT: {len(all_pairs):,} deutsche Dialogpaare")
    print(f"  Gespeichert: {out}")
    print("=" * 60)
    print("\nNächste Schritte:")
    print("  del models\\model.pth models\\best_metrics.json data\\processed\\encoded.json")
    print("  python src/train.py")


if __name__ == "__main__":
    main()
