import json
import os
import sys
import time
from typing import Any, Dict, Optional, Tuple

import torch
import torch.nn as nn
from torch import amp

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from src.dataset import get_dataloader
from src.model import build_model
from src.preprocess import preprocess
from src.utils import count_parameters

# Default hyperparameters (used when models/train_config.json is missing or keys omitted).
DEFAULT_TRAIN_CONFIG: Dict[str, Any] = {
    "embed_dim": 256,
    "hidden_dim": 512,
    "num_layers": 2,
    "dropout": 0.3,
    "batch_size": 64,
    "num_epochs": 15,
    "learning_rate": 5e-4,
    "lr_min": 1e-6,
    "clip": 1.0,
    "max_pairs": 65000,
    "weight_decay": 1e-4,
    "label_smooth": 0.05,
    "teacher_forcing": 0.5,
    "use_decaying_teacher_forcing": False,
    "teacher_forcing_start": 0.78,
    "teacher_forcing_end": 0.52,
    "plateau_patience": 2,
    "plateau_factor": 0.5,
}

_INT_KEYS = frozenset(
    {
        "embed_dim",
        "hidden_dim",
        "num_layers",
        "batch_size",
        "num_epochs",
        "max_pairs",
        "plateau_patience",
    }
)

BEST_METRICS_PATH = os.path.join("models", "best_metrics.json")


def _config_path() -> str:
    env = os.environ.get("TRAIN_CONFIG", "").strip()
    if env:
        return os.path.normpath(env)
    return os.path.normpath(
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "models", "train_config.json")
    )


def load_train_config() -> Dict[str, Any]:
    cfg = dict(DEFAULT_TRAIN_CONFIG)
    p = _config_path()
    if not os.path.isfile(p):
        return cfg
    try:
        with open(p, "r", encoding="utf-8") as f:
            raw = json.load(f)
        if not isinstance(raw, dict):
            return cfg
        for k in cfg:
            if k not in raw:
                continue
            v = raw[k]
            if k == "use_decaying_teacher_forcing":
                cfg[k] = bool(v)
            elif k in _INT_KEYS:
                cfg[k] = int(v)
            else:
                cfg[k] = float(v)
    except (OSError, json.JSONDecodeError, TypeError, ValueError) as e:
        print(f"Warning: could not load train config {p}: {e}")
    return cfg


def _load_best_tracker() -> Tuple[float, int]:
    if not os.path.isfile(BEST_METRICS_PATH):
        return float("inf"), 0
    try:
        with open(BEST_METRICS_PATH, "r", encoding="utf-8") as f:
            d = json.load(f)
        return float(d["best_loss"]), int(d.get("best_epoch", 0))
    except (OSError, ValueError, KeyError, TypeError):
        return float("inf"), 0


def _save_best_model(model: nn.Module, avg_loss: float, epoch: int, path: str) -> None:
    torch.save(model.state_dict(), path)
    with open(BEST_METRICS_PATH, "w", encoding="utf-8") as f:
        json.dump(
            {"best_loss": avg_loss, "best_epoch": epoch},
            f,
            indent=2,
        )


def _dataloader_workers(device: torch.device) -> int:
    if device.type != "cuda":
        return 0
    n = os.cpu_count() or 4
    return min(4, max(1, n - 1))


def _teacher_forcing_ratio(epoch: int, total_epochs: int, hp: Dict[str, Any]) -> float:
    if not hp["use_decaying_teacher_forcing"]:
        return float(hp["teacher_forcing"])
    if total_epochs <= 1:
        return float(hp["teacher_forcing_end"])
    t = (epoch - 1) / (total_epochs - 1)
    s = float(hp["teacher_forcing_start"])
    e = float(hp["teacher_forcing_end"])
    return e + (s - e) * (1.0 - t)


def train_epoch(
    model,
    dataloader,
    optimizer,
    criterion,
    device,
    vocab_size,
    scaler: Optional[amp.GradScaler],
    teacher_forcing_ratio: float,
    grad_clip: float,
):
    model.train()
    total_loss = 0.0
    use_amp = scaler is not None

    for batch_idx, (src, trg) in enumerate(dataloader):
        src = src.to(device, non_blocking=True)
        trg = trg.to(device, non_blocking=True)

        optimizer.zero_grad(set_to_none=True)

        if use_amp:
            with amp.autocast("cuda"):
                output = model(src, trg, teacher_forcing_ratio=teacher_forcing_ratio)
                output_flat = output[:, 1:].reshape(-1, vocab_size)
                trg_flat = trg[:, 1:].reshape(-1)
                loss = criterion(output_flat, trg_flat)
            scaler.scale(loss).backward()
            scaler.unscale_(optimizer)
            torch.nn.utils.clip_grad_norm_(model.parameters(), grad_clip)
            scaler.step(optimizer)
            scaler.update()
        else:
            output = model(src, trg, teacher_forcing_ratio=teacher_forcing_ratio)
            output_flat = output[:, 1:].reshape(-1, vocab_size)
            trg_flat = trg[:, 1:].reshape(-1)
            loss = criterion(output_flat, trg_flat)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), grad_clip)
            optimizer.step()

        total_loss += loss.item()

        if (batch_idx + 1) % 100 == 0:
            print(
                f"    Batch {batch_idx + 1:4d}/{len(dataloader)} "
                f"| Loss: {loss.item():.4f}"
            )

    return total_loss / len(dataloader)


def train():
    hp = load_train_config()
    cfg_p = _config_path()
    print(f"\nTrain config file: {os.path.abspath(cfg_p)} (exists: {os.path.isfile(cfg_p)})")

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"\nDevice: {device}")
    scaler = None
    if device.type == "cuda":
        print(f"GPU: {torch.cuda.get_device_name(0)}")
        torch.backends.cudnn.benchmark = True
        torch.backends.cuda.matmul.allow_tf32 = True
        torch.backends.cudnn.allow_tf32 = True
        scaler = amp.GradScaler("cuda")
        print("CUDA: AMP (mixed precision), cuDNN benchmark, TF32 enabled")

    print("\nPreprocessing data...")
    encoded_data, vocab = preprocess(max_pairs=int(hp["max_pairs"]))
    vocab_size = len(vocab)
    print(f"Vocab size: {vocab_size:,} | Training pairs: {len(encoded_data):,}")

    nw = _dataloader_workers(device)
    dataloader = get_dataloader(
        batch_size=int(hp["batch_size"]),
        shuffle=True,
        encoded_data=encoded_data,
        num_workers=nw,
    )
    if nw:
        print(f"DataLoader: num_workers={nw}")

    model = build_model(
        vocab_size=vocab_size,
        embed_dim=int(hp["embed_dim"]),
        hidden_dim=int(hp["hidden_dim"]),
        num_layers=int(hp["num_layers"]),
        dropout=float(hp["dropout"]),
        device=str(device),
    )
    print(f"Model parameters: {count_parameters(model):,}")

    optimizer = torch.optim.AdamW(
        model.parameters(),
        lr=float(hp["learning_rate"]),
        weight_decay=float(hp["weight_decay"]),
    )
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(
        optimizer,
        mode="min",
        factor=float(hp["plateau_factor"]),
        patience=int(hp["plateau_patience"]),
        min_lr=float(hp["lr_min"]),
        threshold=1e-3,
    )

    os.makedirs("models", exist_ok=True)

    checkpoint_path = os.path.join("models", "model.pth")
    if os.path.exists(checkpoint_path):
        model.load_state_dict(torch.load(checkpoint_path, map_location=device))
        print(f"Loaded weights from: {checkpoint_path}")

    criterion = nn.CrossEntropyLoss(ignore_index=0, label_smoothing=float(hp["label_smooth"]))

    best_loss, best_epoch = _load_best_tracker()
    if best_loss < float("inf"):
        print(
            f"Tracking best from {BEST_METRICS_PATH}: "
            f"loss={best_loss:.4f} (epoch {best_epoch}) - will not save unless beaten"
        )
    elif os.path.exists(checkpoint_path):
        print(
            "No best_metrics.json yet - first epoch that improves on inf will define "
            "the baseline (backup model.pth if it is already a good run)."
        )

    num_epochs = int(hp["num_epochs"])
    print(f"\nTraining for {num_epochs} epochs...\n{'-' * 50}")
    tf_desc = (
        f"decay {hp['teacher_forcing_start']}->{hp['teacher_forcing_end']}"
        if hp["use_decaying_teacher_forcing"]
        else f"fixed {hp['teacher_forcing']}"
    )
    print(
        f"Optim: AdamW (wd={hp['weight_decay']}) | LR: ReduceLROnPlateau "
        f"(x{hp['plateau_factor']} after {hp['plateau_patience']} epochs flat, min={hp['lr_min']}) | "
        f"label_smoothing={hp['label_smooth']} | teacher_forcing {tf_desc}"
    )

    grad_clip = float(hp["clip"])
    for epoch in range(1, num_epochs + 1):
        tf_ratio = _teacher_forcing_ratio(epoch, num_epochs, hp)
        t0 = time.time()
        avg_loss = train_epoch(
            model,
            dataloader,
            optimizer,
            criterion,
            device,
            vocab_size,
            scaler,
            tf_ratio,
            grad_clip,
        )
        elapsed = time.time() - t0
        scheduler.step(avg_loss)
        lr_now = optimizer.param_groups[0]["lr"]

        print(
            f"Epoch {epoch:2d}/{num_epochs} "
            f"| Avg Loss: {avg_loss:.4f} "
            f"| lr: {lr_now:.2e} "
            f"| tf: {tf_ratio:.2f} "
            f"| Time: {elapsed:.1f}s"
        )

        if avg_loss < best_loss - 1e-12:
            best_loss = avg_loss
            best_epoch = epoch
            _save_best_model(model, avg_loss, epoch, checkpoint_path)
            print(
                f"  [ok] New best -> models/model.pth | loss={best_loss:.4f} | epoch {best_epoch}"
            )

    print(f"\nTraining complete.")
    print(f"  Best epoch: {best_epoch} | best avg loss: {best_loss:.4f}")
    print(f"  Weights: {checkpoint_path} | tracker: {BEST_METRICS_PATH}")
    print("  Vocab: models/vocab.json")


if __name__ == "__main__":
    train()
