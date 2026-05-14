"""
Sequence-to-Sequence model with Bahdanau Attention built with PyTorch.

Architecture
────────────
Encoder
  ├─ Embedding  (vocab_size → embed_dim)
  └─ LSTM       (embed_dim → hidden_dim, num_layers deep)
       └─ returns ALL timestep outputs + final (hidden, cell)

Attention (Bahdanau / additive)
  Aligns each decoder step to relevant encoder positions instead of relying
  on a single compressed context vector.

Decoder
  ├─ Embedding  (vocab_size → embed_dim)
  ├─ Attention  (scores over encoder outputs)
  ├─ LSTM       (embed_dim + hidden_dim → hidden_dim)  ← concat embed + context
  └─ Linear     (hidden_dim*2 + embed_dim → vocab_size) ← concat out+context+embed

Seq2Seq
  Wires encoder → attention → decoder and applies teacher forcing during training.
  At inference time teacher_forcing_ratio=0.0 so the decoder uses its own
  previous prediction at every step.
"""

import torch
import torch.nn as nn


class Attention(nn.Module):
    """
    Bahdanau (additive) attention.

    Computes a soft alignment between the current decoder hidden state
    and every encoder output timestep, returning a weighted context vector.
    """

    def __init__(self, hidden_dim: int):
        super().__init__()
        self.attn = nn.Linear(hidden_dim * 2, hidden_dim)
        self.v    = nn.Linear(hidden_dim, 1, bias=False)

    def forward(
        self,
        hidden: torch.Tensor,      # (batch, hidden_dim)  — last decoder layer
        enc_out: torch.Tensor,     # (batch, src_len, hidden_dim)
    ) -> torch.Tensor:             # returns (batch, src_len) attention weights
        src_len = enc_out.shape[1]
        # Expand hidden to match encoder length
        h = hidden.unsqueeze(1).expand(-1, src_len, -1)          # (batch, src_len, H)
        energy = torch.tanh(self.attn(torch.cat([h, enc_out], dim=2)))  # (batch, src_len, H)
        scores = self.v(energy).squeeze(2)                        # (batch, src_len)
        return torch.softmax(scores, dim=1)                       # (batch, src_len)


class Encoder(nn.Module):
    """
    Encodes the input sentence.

    Returns ALL timestep hidden states (enc_out) in addition to the final
    (hidden, cell) so that the attention decoder can align to any position.
    """

    def __init__(
        self,
        vocab_size: int,
        embed_dim: int,
        hidden_dim: int,
        num_layers: int = 2,
        dropout: float = 0.3,
    ):
        super().__init__()
        self.embedding = nn.Embedding(vocab_size, embed_dim, padding_idx=0)
        self.lstm = nn.LSTM(
            embed_dim,
            hidden_dim,
            num_layers=num_layers,
            batch_first=True,
            dropout=dropout if num_layers > 1 else 0.0,
        )
        self.dropout = nn.Dropout(dropout)

    def forward(self, src: torch.Tensor):
        """
        Args:
            src: (batch, src_seq_len)

        Returns:
            enc_out: (batch, src_seq_len, hidden_dim)  — all timestep outputs
            hidden:  (num_layers, batch, hidden_dim)
            cell:    (num_layers, batch, hidden_dim)
        """
        embedded = self.dropout(self.embedding(src))        # (batch, seq, embed)
        enc_out, (hidden, cell) = self.lstm(embedded)
        return enc_out, hidden, cell


class Decoder(nn.Module):
    """
    Generates one output token per call using attention over encoder outputs.
    """

    def __init__(
        self,
        vocab_size: int,
        embed_dim: int,
        hidden_dim: int,
        num_layers: int = 2,
        dropout: float = 0.3,
    ):
        super().__init__()
        self.embedding = nn.Embedding(vocab_size, embed_dim, padding_idx=0)
        self.attention  = Attention(hidden_dim)
        # LSTM input = embedding + attention context
        self.lstm = nn.LSTM(
            embed_dim + hidden_dim,
            hidden_dim,
            num_layers=num_layers,
            batch_first=True,
            dropout=dropout if num_layers > 1 else 0.0,
        )
        # Output projection: richer input = decoder out + context + embedding
        self.fc_out = nn.Linear(hidden_dim * 2 + embed_dim, vocab_size)
        self.dropout = nn.Dropout(dropout)

    def forward(
        self,
        token: torch.Tensor,       # (batch,)
        hidden: torch.Tensor,      # (num_layers, batch, hidden_dim)
        cell: torch.Tensor,        # (num_layers, batch, hidden_dim)
        enc_out: torch.Tensor,     # (batch, src_len, hidden_dim)
    ):
        """
        Returns:
            logits: (batch, vocab_size)
            hidden: updated hidden state
            cell:   updated cell state
        """
        token = token.unsqueeze(1)                                   # (batch, 1)
        embedded = self.dropout(self.embedding(token))               # (batch, 1, embed)

        # Attend to encoder outputs using the last decoder hidden layer
        attn_w  = self.attention(hidden[-1], enc_out)                # (batch, src_len)
        context = (attn_w.unsqueeze(1) @ enc_out)                    # (batch, 1, H)

        lstm_in = torch.cat([embedded, context], dim=2)              # (batch, 1, embed+H)
        out, (hidden, cell) = self.lstm(lstm_in, (hidden, cell))     # out: (batch, 1, H)

        # Concat decoder output + context + embedding for richer prediction
        pred   = torch.cat([out, context, embedded], dim=2)          # (batch, 1, 2H+embed)
        logits = self.fc_out(pred.squeeze(1))                        # (batch, vocab_size)
        return logits, hidden, cell


class Seq2Seq(nn.Module):
    """
    Combines Encoder + Attention + Decoder into one trainable module.
    """

    def __init__(self, encoder: Encoder, decoder: Decoder, device: torch.device):
        super().__init__()
        self.encoder = encoder
        self.decoder = decoder
        self.device  = device

    def forward(
        self,
        src: torch.Tensor,
        trg: torch.Tensor,
        teacher_forcing_ratio: float = 0.5,
    ) -> torch.Tensor:
        batch_size = src.size(0)
        trg_len    = trg.size(1)
        vocab_size = self.decoder.fc_out.out_features

        outputs = torch.zeros(batch_size, trg_len, vocab_size, device=self.device)

        enc_out, hidden, cell = self.encoder(src)

        dec_input = trg[:, 0]   # <SOS>

        for t in range(1, trg_len):
            logits, hidden, cell = self.decoder(dec_input, hidden, cell, enc_out)
            outputs[:, t] = logits

            if torch.rand(1).item() < teacher_forcing_ratio:
                dec_input = trg[:, t]
            else:
                dec_input = logits.argmax(dim=1)

        return outputs


def build_model(
    vocab_size: int,
    embed_dim: int = 256,
    hidden_dim: int = 512,
    num_layers: int = 2,
    dropout: float = 0.3,
    device: str = "cpu",
) -> Seq2Seq:
    """Build and return a fully initialised Seq2Seq model with attention."""
    _device = torch.device(device)
    encoder = Encoder(vocab_size, embed_dim, hidden_dim, num_layers, dropout)
    decoder = Decoder(vocab_size, embed_dim, hidden_dim, num_layers, dropout)
    return Seq2Seq(encoder, decoder, _device).to(_device)
