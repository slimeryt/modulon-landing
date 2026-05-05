"""
Inference module: loads the trained model and generates text responses.

The Chatbot class is the main entry point used by chat.py.
It can also be run directly for quick testing:

    python src/inference.py
"""

import json
import os
import sys

import torch
import torch.nn as nn
from torch.optim import Adam

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from src.model import build_model
from src.preprocess import (
    EOS_IDX, PAD_IDX, SOS_IDX, UNK_IDX,
    MAX_LENGTH, clean_text, tokenize, encode, encode_decoder_target,
)

# Must match the values used in train.py
EMBED_DIM  = 256
HIDDEN_DIM = 512
NUM_LAYERS = 2
DROPOUT    = 0.0   # disable dropout at inference time

MAX_RESPONSE_LEN = 20

DECODE_TEMPERATURE = 0.85
DECODE_TOP_K = 40
DECODE_REPEAT_LOGIT_PENALTY = 2.25
DECODE_REPEAT_WINDOW = 4

# Online learning uses a much smaller LR to avoid overwriting trained knowledge
ONLINE_LEARNING_RATE = 0.00005
# Save updated model every N exchanges
AUTOSAVE_EVERY = 10


def load_vocab(vocab_path: str = "models/vocab.json") -> tuple:
    """Load vocab dict and build a reverse idx→word mapping."""
    with open(vocab_path, "r", encoding="utf-8") as f:
        vocab = json.load(f)
    idx2word = {v: k for k, v in vocab.items()}
    return vocab, idx2word


def load_model(
    vocab_size: int,
    device: torch.device,
    model_path: str = "models/model.pth",
) -> object:
    """Instantiate the Seq2Seq architecture and load saved weights."""
    model = build_model(
        vocab_size=vocab_size,
        embed_dim=EMBED_DIM,
        hidden_dim=HIDDEN_DIM,
        num_layers=NUM_LAYERS,
        dropout=DROPOUT,
        device=str(device),
    )
    state = torch.load(model_path, map_location=device)
    model.load_state_dict(state)
    model.eval()   # disable dropout, fix BatchNorm, etc.
    return model


def _sample_token_id(
    logits: torch.Tensor,
    temperature: float,
    top_k: int,
    recent_ids: list,
    repeat_penalty: float,
) -> int:
    """Temperature + top-k sampling with extra penalty on recently chosen ids (reduces loops)."""
    logits = logits.float().squeeze(0).clone()
    if temperature > 1e-6:
        logits = logits / temperature
    for idx in recent_ids:
        if 0 <= idx < logits.numel():
            logits[idx] -= repeat_penalty
    if top_k > 0 and top_k < logits.numel():
        thresh = torch.topk(logits, top_k).values[-1]
        logits = torch.where(logits < thresh, torch.full_like(logits, float("-inf")), logits)
    probs = torch.softmax(logits, dim=-1)
    return int(torch.multinomial(probs, 1).item())


def generate_response(
    user_input: str,
    model,
    vocab: dict,
    idx2word: dict,
    device: torch.device,
    max_len: int = MAX_RESPONSE_LEN,
    temperature: float = DECODE_TEMPERATURE,
    top_k: int = DECODE_TOP_K,
) -> str:
    """
    Convert user text → token IDs → run encoder → decode token-by-token
    → convert IDs back to text.

    Decoding stops when:
      - <EOS> is predicted, OR
      - max_len tokens have been generated
    """
    cleaned = clean_text(user_input)
    tokens = tokenize(cleaned)

    if not tokens:
        return "..."

    encoded = encode(tokens, vocab, MAX_LENGTH)
    src = torch.tensor([encoded], dtype=torch.long, device=device)

    with torch.no_grad():
        # Encode the input
        hidden, cell = model.encoder(src)

        # Start decoding from <SOS>
        dec_input = torch.tensor([SOS_IDX], dtype=torch.long, device=device)

        response_tokens = []
        recent_preds: list = []
        for _ in range(max_len):
            logits, hidden, cell = model.decoder(dec_input, hidden, cell)
            pred_idx = _sample_token_id(
                logits,
                temperature=temperature,
                top_k=top_k,
                recent_ids=recent_preds[-DECODE_REPEAT_WINDOW:],
                repeat_penalty=DECODE_REPEAT_LOGIT_PENALTY,
            )

            if pred_idx == EOS_IDX:
                break

            if pred_idx not in (PAD_IDX, SOS_IDX, UNK_IDX):
                response_tokens.append(idx2word.get(pred_idx, ""))

            recent_preds.append(pred_idx)
            dec_input = torch.tensor([pred_idx], dtype=torch.long, device=device)

    return " ".join(response_tokens) if response_tokens else "i'm not sure"


class Chatbot:
    """
    High-level wrapper that loads model + vocab once and exposes a
    simple respond() method used by the terminal interface.

    Self-learning
    ─────────────
    After every exchange the bot does one gradient update on the pair
    (user_input → bot_response), reinforcing patterns it encounters in
    real conversation. A tiny learning rate (ONLINE_LEARNING_RATE) prevents
    overwriting what was learned during full training. The model is
    auto-saved to disk every AUTOSAVE_EVERY exchanges.
    """

    def __init__(
        self,
        vocab_path: str = "models/vocab.json",
        model_path: str = "models/model.pth",
    ):
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.model_path = model_path

        print("Loading vocabulary...")
        self.vocab, self.idx2word = load_vocab(vocab_path)

        print(f"Loading model ({len(self.vocab):,} vocab, device={self.device})...")
        self.model = load_model(len(self.vocab), self.device, model_path)

        # Online learning components
        self.optimizer = Adam(self.model.parameters(), lr=ONLINE_LEARNING_RATE)
        self.criterion = nn.CrossEntropyLoss(ignore_index=0)
        self._exchange_count = 0

        print("Ready.\n")

    def respond(self, user_input: str) -> str:
        return generate_response(
            user_input,
            self.model,
            self.vocab,
            self.idx2word,
            self.device,
        )

    def learn(self, user_input: str, bot_response: str) -> float:
        """
        Perform one gradient update on a single (input → response) pair.
        Called automatically by chat.py after every exchange.

        Returns the loss value (for display purposes).
        """
        inp_tokens  = tokenize(clean_text(user_input))
        resp_tokens = tokenize(clean_text(bot_response))

        # Skip if either side is empty or contains only unknown words
        if not inp_tokens or not resp_tokens:
            return 0.0

        src = torch.tensor(
            [encode(inp_tokens, self.vocab, MAX_LENGTH)],
            dtype=torch.long, device=self.device
        )
        trg = torch.tensor(
            [encode_decoder_target(resp_tokens, self.vocab, MAX_LENGTH)],
            dtype=torch.long, device=self.device
        )

        self.model.train()
        self.optimizer.zero_grad()

        # Full teacher forcing during online updates for stability
        output = self.model(src, trg, teacher_forcing_ratio=1.0)

        vocab_size   = self.model.decoder.fc_out.out_features
        output_flat  = output[:, 1:].reshape(-1, vocab_size)
        trg_flat     = trg[:, 1:].reshape(-1)

        loss = self.criterion(output_flat, trg_flat)
        loss.backward()
        torch.nn.utils.clip_grad_norm_(self.model.parameters(), 1.0)
        self.optimizer.step()

        self.model.eval()

        self._exchange_count += 1
        if self._exchange_count % AUTOSAVE_EVERY == 0:
            torch.save(self.model.state_dict(), self.model_path)

        return loss.item()

    def save(self) -> None:
        """Force-save the current model weights."""
        torch.save(self.model.state_dict(), self.model_path)


# ── Quick test when run directly ──────────────────────────────────────────────
if __name__ == "__main__":
    bot = Chatbot()
    test_inputs = [
        "hello how are you",
        "what is your name",
        "i love movies",
        "goodbye",
    ]
    for text in test_inputs:
        print(f"Input : {text}")
        print(f"Output: {bot.respond(text)}\n")
