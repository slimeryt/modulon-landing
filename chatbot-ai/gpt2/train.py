"""
Fine-tune German GPT-2 on German dialogue pairs for Modulon.

Base model  : dbmdz/german-gpt2   (pretrained on German text — proper German tokenizer)
Data source : data/processed/pairs.json  (548K German dialogue pairs)
Output      : models/gpt2-de/

Run from project root:
    python gpt2/train.py

Install deps first if needed:
    pip install transformers accelerate
"""

import json
import os
import sys
import time

import torch
from torch.utils.data import Dataset, DataLoader
from transformers import (
    AutoTokenizer,
    AutoModelForCausalLM,
    get_linear_schedule_with_warmup,
)

# ── Config ────────────────────────────────────────────────────────────────────
MODEL_NAME   = "benjamin/gerpt2-large"
OUTPUT_DIR   = os.path.join("models", "gpt2-de")
PAIRS_PATH   = os.path.join("data", "processed", "pairs.json")

MAX_LENGTH   = 128
BATCH_SIZE   = 8        # doubled — fp16 gives headroom; if OOM drop back to 4
GRAD_ACCUM   = 4        # effective batch = 32 → better gradients, fewer optimizer steps
NUM_EPOCHS   = 3        # 3 is plenty with 200k quality pairs
LR           = 5e-5
WARMUP_RATIO = 0.05
GRAD_CLIP    = 1.0
MAX_PAIRS    = 200_000  # 200k diverse pairs is more than enough for fine-tuning


# ── Dataset ───────────────────────────────────────────────────────────────────
class DialogueDataset(Dataset):
    """
    Formats each pair as:
        Human: {input}\\nBot: {response}<|endoftext|>

    Loss is computed ONLY on the Bot response tokens (prompt tokens → -100),
    so the model learns to generate responses, not memorise prompts.
    """

    def __init__(self, pairs: list, tokenizer, max_length: int):
        self.samples = []
        skipped = 0

        for p in pairs:
            inp  = p.get("input",  "").strip()
            resp = p.get("response", "").strip()

            # Basic quality filter
            if len(inp.split()) < 2 or len(resp.split()) < 2:
                skipped += 1
                continue
            if len(inp.split()) > 60 or len(resp.split()) > 60:
                skipped += 1
                continue

            prompt  = f"Nutzer: {inp}\nBot:"
            answer  = f" {resp}{tokenizer.eos_token}"

            prompt_ids = tokenizer.encode(prompt, add_special_tokens=False)
            answer_ids = tokenizer.encode(answer, add_special_tokens=False)

            input_ids = prompt_ids + answer_ids

            # Truncate if over limit
            if len(input_ids) > max_length:
                skipped += 1
                continue

            # Pad to max_length
            labels  = [-100] * len(prompt_ids) + answer_ids
            pad_len = max_length - len(input_ids)
            input_ids += [tokenizer.pad_token_id] * pad_len
            labels    += [-100] * pad_len

            self.samples.append((
                torch.tensor(input_ids, dtype=torch.long),
                torch.tensor(labels,    dtype=torch.long),
            ))

        print(f"  {len(self.samples):,} samples ready | {skipped:,} skipped")

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        return self.samples[idx]


# ── Training ──────────────────────────────────────────────────────────────────
def train():
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"\nDevice: {device}")
    if device.type == "cuda":
        print(f"GPU   : {torch.cuda.get_device_name(0)}")
        vram = torch.cuda.get_device_properties(0).total_memory / 1024 ** 3
        print(f"VRAM  : {vram:.1f} GB")

    # ── Load pairs ────────────────────────────────────────────────────────────
    print(f"\nLoading pairs from {PAIRS_PATH} ...")
    with open(PAIRS_PATH, "r", encoding="utf-8") as f:
        raw = json.load(f)
    pairs = raw[:MAX_PAIRS]
    print(f"Raw pairs loaded: {len(pairs):,}")

    # ── Tokenizer + model ─────────────────────────────────────────────────────
    print(f"\nDownloading / loading {MODEL_NAME} ...")
    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
    tokenizer.pad_token = tokenizer.eos_token   # GPT-2 has no pad token by default

    model = AutoModelForCausalLM.from_pretrained(MODEL_NAME)
    model.resize_token_embeddings(len(tokenizer))
    model = model.to(device)
    n_params = sum(p.numel() for p in model.parameters())
    print(f"Parameters: {n_params:,}")

    # torch.compile gives ~15-25% speedup on PyTorch 2.x (skip silently if unavailable)
    if hasattr(torch, "compile"):
        try:
            model = torch.compile(model)
            print("torch.compile: enabled")
        except Exception:
            print("torch.compile: skipped")

    # ── Dataset ───────────────────────────────────────────────────────────────
    print("\nBuilding dataset ...")
    dataset    = DialogueDataset(pairs, tokenizer, MAX_LENGTH)
    dataloader = DataLoader(
        dataset,
        batch_size=BATCH_SIZE,
        shuffle=True,
        pin_memory=(device.type == "cuda"),
        num_workers=0,   # Windows-safe
    )
    print(f"Batches per epoch: {len(dataloader):,}")

    # ── Optimiser + scheduler ─────────────────────────────────────────────────
    optimizer    = torch.optim.AdamW(model.parameters(), lr=LR, weight_decay=0.01)
    # Optimizer steps happen every GRAD_ACCUM batches
    total_steps  = (len(dataloader) // GRAD_ACCUM) * NUM_EPOCHS
    warmup_steps = int(total_steps * WARMUP_RATIO)
    scheduler    = get_linear_schedule_with_warmup(
        optimizer,
        num_warmup_steps=warmup_steps,
        num_training_steps=total_steps,
    )

    scaler = torch.amp.GradScaler("cuda") if device.type == "cuda" else None

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    best_loss = float("inf")

    print(f"\nFine-tuning {MODEL_NAME} for {NUM_EPOCHS} epochs ...\n" + "-" * 55)

    for epoch in range(1, NUM_EPOCHS + 1):
        model.train()
        total_loss = 0.0
        t0 = time.time()

        optimizer.zero_grad(set_to_none=True)

        for step, (input_ids, labels) in enumerate(dataloader, 1):
            input_ids = input_ids.to(device, non_blocking=True)
            labels    = labels.to(device, non_blocking=True)

            if scaler:
                with torch.amp.autocast("cuda"):
                    loss = model(input_ids=input_ids, labels=labels).loss / GRAD_ACCUM
                scaler.scale(loss).backward()
            else:
                loss = model(input_ids=input_ids, labels=labels).loss / GRAD_ACCUM
                loss.backward()

            total_loss += loss.item() * GRAD_ACCUM  # log unscaled loss

            # Optimizer step every GRAD_ACCUM batches (or at end of epoch)
            if step % GRAD_ACCUM == 0 or step == len(dataloader):
                if scaler:
                    scaler.unscale_(optimizer)
                    torch.nn.utils.clip_grad_norm_(model.parameters(), GRAD_CLIP)
                    scaler.step(optimizer)
                    scaler.update()
                else:
                    torch.nn.utils.clip_grad_norm_(model.parameters(), GRAD_CLIP)
                    optimizer.step()
                scheduler.step()
                optimizer.zero_grad(set_to_none=True)

            if step % 200 == 0 or step == len(dataloader):
                lr_now = scheduler.get_last_lr()[0]
                print(
                    f"  Epoch {epoch} | Batch {step:5d}/{len(dataloader)} "
                    f"| Loss: {(total_loss/step):.4f} | lr: {lr_now:.2e}"
                )

        avg_loss = total_loss / len(dataloader)
        elapsed  = time.time() - t0
        print(f"\nEpoch {epoch}/{NUM_EPOCHS} | Avg Loss: {avg_loss:.4f} | Time: {elapsed:.0f}s\n")

        if avg_loss < best_loss:
            best_loss = avg_loss
            model.save_pretrained(OUTPUT_DIR)
            tokenizer.save_pretrained(OUTPUT_DIR)
            print(f"  [✓] New best → {OUTPUT_DIR}  (loss={best_loss:.4f})\n")

    print(f"Training complete. Best loss: {best_loss:.4f}")
    print(f"Model saved to: {OUTPUT_DIR}/")
    print("\nTo chat:  python gpt2/chat.py")


if __name__ == "__main__":
    train()
