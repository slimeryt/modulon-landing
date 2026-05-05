"""
Sequence-to-Sequence model built with PyTorch.

Architecture
────────────
Encoder
  ├─ Embedding  (vocab_size → embed_dim)
  └─ LSTM       (embed_dim → hidden_dim, num_layers deep)

Decoder
  ├─ Embedding  (vocab_size → embed_dim)
  ├─ LSTM       (embed_dim → hidden_dim, num_layers deep)
  └─ Linear     (hidden_dim → vocab_size)  ← output logits

Seq2Seq
  Wires encoder → decoder and applies teacher forcing during training.
  At inference time teacher_forcing_ratio=0.0 so the decoder uses its own
  previous prediction at every step.
"""

import torch
import torch.nn as nn


class Encoder(nn.Module):
    """
    Encodes the input sentence into a context vector (hidden, cell).

    The final hidden and cell states of the LSTM are passed directly to
    the Decoder as its initial state, acting as the compressed
    representation of the source sentence.
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
            # Dropout is applied between LSTM layers, not after the last one
            dropout=dropout if num_layers > 1 else 0.0,
        )
        self.dropout = nn.Dropout(dropout)

    def forward(self, src: torch.Tensor):
        """
        Args:
            src: (batch, src_seq_len) – padded token indices

        Returns:
            hidden: (num_layers, batch, hidden_dim)
            cell:   (num_layers, batch, hidden_dim)
        """
        embedded = self.dropout(self.embedding(src))          # (batch, seq, embed)
        _, (hidden, cell) = self.lstm(embedded)
        return hidden, cell


class Decoder(nn.Module):
    """
    Generates one output token per call given the previous token and
    the encoder's context state.
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
        self.fc_out = nn.Linear(hidden_dim, vocab_size)
        self.dropout = nn.Dropout(dropout)

    def forward(self, token: torch.Tensor, hidden: torch.Tensor, cell: torch.Tensor):
        """
        Args:
            token:  (batch,)                 – current input token index
            hidden: (num_layers, batch, hidden_dim)
            cell:   (num_layers, batch, hidden_dim)

        Returns:
            logits: (batch, vocab_size)      – un-normalised scores for next token
            hidden: updated hidden state
            cell:   updated cell state
        """
        token = token.unsqueeze(1)                            # (batch, 1)
        embedded = self.dropout(self.embedding(token))        # (batch, 1, embed)
        output, (hidden, cell) = self.lstm(embedded, (hidden, cell))
        logits = self.fc_out(output.squeeze(1))               # (batch, vocab_size)
        return logits, hidden, cell


class Seq2Seq(nn.Module):
    """
    Combines Encoder + Decoder into one trainable module.

    Teacher Forcing
    ───────────────
    During training (teacher_forcing_ratio > 0), at each decoder step there
    is a `teacher_forcing_ratio` probability of feeding the *ground-truth*
    next token instead of the decoder's own prediction. This stabilises
    early training by preventing error accumulation.
    """

    def __init__(self, encoder: Encoder, decoder: Decoder, device: torch.device):
        super().__init__()
        self.encoder = encoder
        self.decoder = decoder
        self.device = device

    def forward(
        self,
        src: torch.Tensor,
        trg: torch.Tensor,
        teacher_forcing_ratio: float = 0.5,
    ) -> torch.Tensor:
        """
        Args:
            src: (batch, src_len)  – encoder input
            trg: (batch, trg_len)  – decoder target (incl. <SOS> at index 0)
            teacher_forcing_ratio: probability of using ground-truth token

        Returns:
            outputs: (batch, trg_len, vocab_size) – logits at each decoder step
        """
        batch_size = src.size(0)
        trg_len = trg.size(1)
        vocab_size = self.decoder.fc_out.out_features

        outputs = torch.zeros(batch_size, trg_len, vocab_size, device=self.device)

        hidden, cell = self.encoder(src)

        # Seed the decoder with the <SOS> token (index 1) from the target
        dec_input = trg[:, 0]  # (batch,)

        for t in range(1, trg_len):
            logits, hidden, cell = self.decoder(dec_input, hidden, cell)
            outputs[:, t] = logits

            # Decide whether to use ground-truth or predicted token next
            if torch.rand(1).item() < teacher_forcing_ratio:
                dec_input = trg[:, t]           # teacher forcing: ground truth
            else:
                dec_input = logits.argmax(dim=1)  # free running: model prediction

        return outputs


def build_model(
    vocab_size: int,
    embed_dim: int = 256,
    hidden_dim: int = 512,
    num_layers: int = 2,
    dropout: float = 0.3,
    device: str = "cpu",
) -> Seq2Seq:
    """
    Convenience factory: build and return a fully initialised Seq2Seq model.

    Args:
        vocab_size: total number of tokens including special tokens
        embed_dim:  word embedding dimensionality
        hidden_dim: LSTM hidden state size
        num_layers: number of stacked LSTM layers
        dropout:    dropout probability (applied to embeddings and between LSTM layers)
        device:     'cpu' or 'cuda'
    """
    _device = torch.device(device)
    encoder = Encoder(vocab_size, embed_dim, hidden_dim, num_layers, dropout)
    decoder = Decoder(vocab_size, embed_dim, hidden_dim, num_layers, dropout)
    model = Seq2Seq(encoder, decoder, _device).to(_device)
    return model
