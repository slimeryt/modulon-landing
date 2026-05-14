#!/usr/bin/env python3
"""
Unattended training: wait until a wall time (optional), run src/train.py, optional daily repeat.

Examples:
  python scripts/overnight_train.py --at 23:45
  python scripts/overnight_train.py --delay-minutes 10 --log logs/overnight.log
  python scripts/overnight_train.py --at 02:00 --repeat-daily --log logs/nightly.log
  python scripts/overnight_train.py --loop
  python scripts/overnight_train.py --loop --log logs/loop.log

Requires the machine to stay awake (disable sleep) if you want GPU training overnight.
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
TRAIN_SCRIPT = ROOT / "src" / "train.py"


def parse_hhmm(s: str) -> tuple[int, int]:
    parts = s.strip().split(":")
    if len(parts) != 2:
        raise ValueError("expected HH:MM")
    h, m = int(parts[0]), int(parts[1])
    if not (0 <= h <= 23 and 0 <= m <= 59):
        raise ValueError("invalid time")
    return h, m


def seconds_until(hour: int, minute: int) -> float:
    now = datetime.now().replace(second=0, microsecond=0)
    target = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
    if target <= now:
        target += timedelta(days=1)
    return max(0.0, (target - now).total_seconds())


def run_train(root: Path, log_path: Path | None) -> int:
    cmd = [sys.executable, "-u", str(TRAIN_SCRIPT)]
    env = {**os.environ, "PYTHONUNBUFFERED": "1"}
    if log_path is None:
        return subprocess.call(cmd, cwd=root, env=env)

    log_path.parent.mkdir(parents=True, exist_ok=True)
    with log_path.open("a", encoding="utf-8", errors="replace") as logf:
        logf.write(f"\n{'=' * 60}\n[{datetime.now().isoformat()}] overnight_train start\n")
        logf.flush()
        proc = subprocess.Popen(
            cmd,
            cwd=root,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )
        assert proc.stdout is not None
        for line in proc.stdout:
            sys.stdout.write(line)
            sys.stdout.flush()
            logf.write(line)
            logf.flush()
        proc.wait()
        logf.write(f"[{datetime.now().isoformat()}] overnight_train exit {proc.returncode}\n")
        return proc.returncode


def main() -> None:
    p = argparse.ArgumentParser(description="Run train.py after a delay or at local HH:MM.")
    p.add_argument("--at", dest="at", metavar="HH:MM", help="Start at this local time (24h).")
    p.add_argument("--delay-minutes", type=float, default=0, help="Sleep this many minutes first.")
    p.add_argument("--log", type=Path, help="Append full output to this file (UTF-8).")
    p.add_argument(
        "--repeat-daily",
        action="store_true",
        help="After each run, wait until the next --at and run again (requires --at).",
    )
    p.add_argument(
        "--loop",
        action="store_true",
        help="After each train.py run exits, start again after a short pause (Ctrl+C to stop).",
    )
    args = p.parse_args()

    if not TRAIN_SCRIPT.is_file():
        print(f"Missing {TRAIN_SCRIPT}", file=sys.stderr)
        sys.exit(2)

    if args.loop and (args.at or args.repeat_daily or args.delay_minutes):
        p.error("--loop runs back-to-back only; omit --at, --repeat-daily, and --delay-minutes")

    if args.repeat_daily and not args.at:
        p.error("--repeat-daily requires --at HH:MM")

    log_path = args.log
    if log_path is not None and not log_path.is_absolute():
        log_path = ROOT / log_path

    at_h: int | None = None
    at_m: int | None = None
    if args.at:
        at_h, at_m = parse_hhmm(args.at)

    while True:
        if args.delay_minutes and args.delay_minutes > 0:
            sec = args.delay_minutes * 60.0
            print(f"[overnight_train] sleeping {args.delay_minutes} min...", flush=True)
            time.sleep(sec)
            args.delay_minutes = 0

        if not args.loop and at_h is not None and at_m is not None:
            sec = seconds_until(at_h, at_m)
            print(
                f"[overnight_train] next start at {at_h:02d}:{at_m:02d} local "
                f"in {sec / 3600:.2f} h ({int(sec)} s)",
                flush=True,
            )
            time.sleep(sec)

        rc = run_train(ROOT, log_path)
        print(f"[overnight_train] train.py finished with exit {rc}", flush=True)

        if args.loop:
            print("[overnight_train] --loop: restarting in 3s (Ctrl+C to stop)...", flush=True)
            time.sleep(3)
            continue

        if not args.repeat_daily:
            sys.exit(rc)

        if at_h is None or at_m is None:
            sys.exit(rc)


if __name__ == "__main__":
    main()
