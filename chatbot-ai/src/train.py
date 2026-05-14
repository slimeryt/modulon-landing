import json
import os
import sys
import time
from typing import Any, Dict, Optional, Tuple

import torch
import torch._compile as _torch_compile
import torch.nn as nn
from torch import amp


def _eager_optimizer_disable_dynamo() -> None:
    def _disable_dynamo(fn=None, recursive=True):
        if fn is not None:
            return fn
        return lambda f: f

    _torch_compile._disable_dynamo = _disable_dynamo
    torch._disable_dynamo = _disable_dynamo


_eager_optimizer_disable_dynamo()

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from src.dataset import get_dataloader
from src.model import build_model
from src.preprocess import preprocess
from src.utils import count_parameters

# Wider / deeper LSTM (~4–6× more params than 256/512/2 for typical vocabs).
# If CUDA OOM: set TRAIN_BATCH_SIZE lower or shrink these dims.
EMBED_DIM = 256
HIDDEN_DIM = 512
NUM_LAYERS = 2
DROPOUT = 0.3
BATCH_SIZE = 128   # fp16 + 512 hidden gives VRAM headroom — 2x fewer steps per epoch
NUM_EPOCHS = 8     # LSTM converges well within 8 epochs with good data
LEARNING_RATE = 5e-4
LR_MIN = 1e-6
CLIP = 1.0
MAX_PAIRS = 300_000  # 300k quality pairs is plenty — was 2M (overkill for LSTM)
WEIGHT_DECAY = 1e-4
LABEL_SMOOTH = 0.05
TEACHER_FORCING = 0.5
USE_DECAYING_TEACHER_FORCING = True   # decay from 1.0 → 0.5 across epochs
TEACHER_FORCING_START = 1.0           # full teacher forcing early = stronger signal
TEACHER_FORCING_END = 0.5
PLATEAU_PATIENCE = 3                  # more patience before halving LR
PLATEAU_FACTOR = 0.5


def _default_train_config_dict() -> Dict[str, Any]:
    return {
        "embed_dim": EMBED_DIM,
        "hidden_dim": HIDDEN_DIM,
        "num_layers": NUM_LAYERS,
        "dropout": DROPOUT,
        "batch_size": BATCH_SIZE,
        "num_epochs": NUM_EPOCHS,
        "learning_rate": LEARNING_RATE,
        "lr_min": LR_MIN,
        "clip": CLIP,
        "max_pairs": MAX_PAIRS,
        "weight_decay": WEIGHT_DECAY,
        "label_smooth": LABEL_SMOOTH,
        "teacher_forcing": TEACHER_FORCING,
        "use_decaying_teacher_forcing": USE_DECAYING_TEACHER_FORCING,
        "teacher_forcing_start": TEACHER_FORCING_START,
        "teacher_forcing_end": TEACHER_FORCING_END,
        "plateau_patience": PLATEAU_PATIENCE,
        "plateau_factor": PLATEAU_FACTOR,
    }


BEST_METRICS_PATH = os.path.join("models", "best_metrics.json")


def load_train_config() -> Dict[str, Any]:
    """Module constants above, then `TRAIN_TARGET_RAM_GB`, then `TRAIN_*` env overrides."""
    cfg = _default_train_config_dict()
    _apply_ram_budget(cfg)
    _apply_env_overrides(cfg)
    return cfg


def _apply_env_overrides(cfg: Dict[str, Any]) -> None:
    """TRAIN_BATCH_SIZE, TRAIN_MAX_PAIRS (optional explicit ints)."""
    bs = os.environ.get("TRAIN_BATCH_SIZE", "").strip()
    if bs.isdigit():
        cfg["batch_size"] = max(1, min(4096, int(bs)))
    mp = os.environ.get("TRAIN_MAX_PAIRS", "").strip()
    if mp.isdigit():
        cfg["max_pairs"] = max(1000, min(5_000_000, int(mp)))


def _apply_ram_budget(cfg: Dict[str, Any]) -> None:
    """
    TRAIN_TARGET_RAM_GB — scale batch_size + max_pairs for a RAM budget (system RAM).
    8 GB ≈ baseline (batch 128, 100k pairs); 25 GB ≈ ~400 batch, ~310k pairs (capped).
    GPU VRAM is separate: lower TRAIN_BATCH_SIZE if CUDA OOM.
    """
    raw = os.environ.get("TRAIN_TARGET_RAM_GB", "").strip()
    if not raw:
        return
    try:
        gb = float(raw)
    except ValueError:
        return
    gb = max(4.0, min(gb, 128.0))
    ratio = gb / 8.0
    base_b, base_p = 128, 100_000
    cfg["batch_size"] = int(min(1024, max(32, round(base_b * ratio))))
    cfg["max_pairs"] = int(min(2_000_000, max(50_000, round(base_p * ratio))))
    print(
        f"TRAIN_TARGET_RAM_GB={raw!r} -> batch_size={cfg['batch_size']}, "
        f"max_pairs={cfg['max_pairs']:,}"
    )


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


def _checkpoint_vocab_size(state: Dict[str, Any]) -> Optional[int]:
    w = state.get("encoder.embedding.weight")
    if w is not None:
        return int(w.shape[0])
    return None


def _checkpoint_arch_mismatch_reason(
    model: nn.Module, state: Dict[str, Any]
) -> Optional[str]:
    """
    If checkpoint state_dict does not match the built model, return a one-line reason.
    Otherwise return None (safe to load).
    """
    expected = model.state_dict()
    ek, sk = set(expected.keys()), set(state.keys())
    if ek != sk:
        if ek - sk:
            return f"param keys differ (e.g. missing {next(iter(ek - sk))!r}) — architecture changed"
        return f"param keys differ (unexpected key {next(iter(sk - ek))!r}) — architecture changed"
    for name, exp in expected.items():
        got = state[name]
        if exp.shape != got.shape:
            return (
                f"{name}: checkpoint {tuple(got.shape)} vs model {tuple(exp.shape)} "
                "(embed/hidden/layers or vocab changed)"
            )
    return None


def _try_load_compatible_checkpoint(
    model: nn.Module,
    checkpoint_path: str,
    device: torch.device,
    vocab_size: int,
) -> bool:
    """
    Load model.pth only if vocab and tensor shapes match the current model.
    """
    try:
        state = torch.load(checkpoint_path, map_location=device)
    except Exception as exc:
        print(f"Could not read checkpoint {checkpoint_path}: {exc}\n  Training from scratch.")
        return False
    ckpt_vocab = _checkpoint_vocab_size(state)
    if ckpt_vocab is None:
        print(
            f"Checkpoint has no encoder.embedding.weight; skipping: {checkpoint_path}"
        )
        return False
    if ckpt_vocab != vocab_size:
        print(
            f"Skipping checkpoint: saved vocab {ckpt_vocab:,} != current {vocab_size:,}.\n"
            f"  File: {checkpoint_path}\n"
            "  (Different preprocessing or corpus.) Training from scratch."
        )
        return False
    mismatch = _checkpoint_arch_mismatch_reason(model, state)
    if mismatch is not None:
        print(
            f"Skipping checkpoint: {mismatch}\n"
            f"  File: {checkpoint_path}\n"
            "  Training from scratch (delete or rename model.pth to hide this)."
        )
        return False
    try:
        model.load_state_dict(state)
    except RuntimeError as exc:
        print(f"Could not load checkpoint: {exc}\n  Training from scratch.")
        return False
    print(f"Loaded weights from: {checkpoint_path}")
    return True


def _dataloader_workers(device: torch.device) -> int:
    env = os.environ.get("TRAIN_NUM_WORKERS", "").strip()
    if env.isdigit():
        return min(16, max(0, int(env)))
    # Windows uses "spawn": worker processes re-import the training script and often break
    # (hanging, double startup, KeyboardInterrupt during torch import). Default 0 is reliable.
    if sys.platform == "win32":
        return 0
    ncpu = os.cpu_count() or 8
    if device.type == "cuda":
        return min(8, max(1, ncpu - 1))
    return min(8, max(2, ncpu // 2))


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
    n_batches = len(dataloader)

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

        step = batch_idx + 1
        if step % 100 == 0:
            print(
                f"    Batch {step:4d}/{n_batches} "
                f"| Loss: {loss.item():.4f}"
            )

    if n_batches > 0:
        print(f"    Batch {n_batches:4d}/{n_batches} (last) | Loss: {loss.item():.4f}")

    return total_loss / n_batches


def train():
    hp = load_train_config()
    print("\nHyperparameters: defaults in train.py + TRAIN_TARGET_RAM_GB / TRAIN_BATCH_SIZE / TRAIN_MAX_PAIRS")

    nthread = int(os.environ.get("TRAIN_CPU_THREADS", os.cpu_count() or 8))
    nthread = max(1, min(64, nthread))
    ninter = max(1, min(16, nthread // 2))
    torch.set_num_interop_threads(ninter)
    torch.set_num_threads(nthread)
    print(f"PyTorch CPU threads: inter={ninter}, intra={nthread}")

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
        props = torch.cuda.get_device_properties(0)
        print(
            f"GPU memory: {props.total_memory / (1024**3):.1f} GiB — if CUDA OOM, lower "
            "batch_size or set TRAIN_BATCH_SIZE (system RAM target does not cap VRAM)."
        )

    print("\nPreprocessing data...")
    encoded_data, vocab = preprocess(max_pairs=int(hp["max_pairs"]))
    vocab_size = len(vocab)
    print(f"Vocab size: {vocab_size:,} | Training pairs: {len(encoded_data):,}")

    nw = _dataloader_workers(device)
    prefetch = int(os.environ.get("TRAIN_PREFETCH_FACTOR", "8"))
    dataloader = get_dataloader(
        batch_size=int(hp["batch_size"]),
        shuffle=True,
        encoded_data=encoded_data,
        num_workers=nw,
        prefetch_factor=prefetch,
    )
    if nw:
        print(f"DataLoader: num_workers={nw}")

    n_steps = len(dataloader)
    bs = int(hp["batch_size"])
    print(
        f"Steps per epoch: {n_steps:,} (= ceil({len(encoded_data):,} pairs / batch_size {bs})) — "
        "progress prints every 100 steps, so the last line may look like Batch 100/153."
    )

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
    checkpoint_present = os.path.isfile(checkpoint_path)
    loaded_ckpt = False
    if checkpoint_present:
        loaded_ckpt = _try_load_compatible_checkpoint(
            model, checkpoint_path, device, vocab_size
        )

    criterion = nn.CrossEntropyLoss(ignore_index=0, label_smoothing=float(hp["label_smooth"]))

    best_loss, best_epoch = _load_best_tracker()
    if checkpoint_present and not loaded_ckpt:
        best_loss, best_epoch = float("inf"), 0
        try:
            os.remove(BEST_METRICS_PATH)
        except OSError:
            pass
        print(
            "Reset best-metrics tracker (checkpoint not loaded — old loss would block saving)."
        )
    if best_loss < float("inf"):
        print(
            f"Tracking best from {BEST_METRICS_PATH}: "
            f"loss={best_loss:.4f} (epoch {best_epoch}) - will not save unless beaten"
        )
    elif loaded_ckpt or checkpoint_present:
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
