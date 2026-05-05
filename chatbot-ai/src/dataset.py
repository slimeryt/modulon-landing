"""
PyTorch Dataset and DataLoader wrappers for encoded dialogue pairs.

Each sample is a tuple of two LongTensors (both length MAX_LENGTH + 1):
  - src : encoded input      [w1, ..., wn, <EOS>, <PAD>, ...]
  - trg : decoder target     [<SOS>, w1, ..., <EOS>, <PAD>, ...]
"""

import json
import os
import sys

import torch
from torch.utils.data import DataLoader, Dataset

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))


class DialogueDataset(Dataset):
    """
    Loads encoded pairs either from a file path or from an in-memory list.
    Passing encoded_data directly avoids re-reading the JSON during training
    when preprocess() already returned the data.
    """

    def __init__(self, encoded_path: str = None, encoded_data: list = None):
        if encoded_data is not None:
            self.pairs = encoded_data
        else:
            if encoded_path is None:
                encoded_path = os.path.join("data", "processed", "encoded.json")
            with open(encoded_path, "r") as f:
                self.pairs = json.load(f)

    def __len__(self) -> int:
        return len(self.pairs)

    def __getitem__(self, idx: int):
        pair = self.pairs[idx]
        src = torch.tensor(pair["input"], dtype=torch.long)
        trg = torch.tensor(pair["response"], dtype=torch.long)
        return src, trg


def get_dataloader(
    batch_size: int = 64,
    shuffle: bool = True,
    encoded_path: str = None,
    encoded_data: list = None,
    num_workers: int = 0,
) -> DataLoader:
    """
    Build and return a DataLoader for the dialogue dataset.

    Args:
        batch_size:    Samples per batch.
        shuffle:       Shuffle at each epoch (True for training).
        encoded_path:  Path to encoded.json (used if encoded_data is None).
        encoded_data:  In-memory encoded pairs list (takes priority).
        num_workers:   Worker processes for data loading (0 = main thread).
    """
    dataset = DialogueDataset(encoded_path=encoded_path, encoded_data=encoded_data)
    pin = torch.cuda.is_available()
    kw = dict(
        dataset=dataset,
        batch_size=batch_size,
        shuffle=shuffle,
        num_workers=num_workers,
        pin_memory=pin,
    )
    if num_workers > 0:
        kw["persistent_workers"] = True
        kw["prefetch_factor"] = 2
    return DataLoader(**kw)
