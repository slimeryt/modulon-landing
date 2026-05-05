# Cornell Movie Chatbot — Seq2Seq (PyTorch)

A terminal chatbot trained from scratch on real movie dialogue using a
Sequence-to-Sequence LSTM neural network and the Cornell Movie Dialogs Corpus.

---

## Project Structure

```
chatbot-ai/
├── data/
│   ├── raw/                  # Cornell corpus (downloaded automatically)
│   └── processed/            # pairs.json, encoded.json
├── src/
│   ├── __init__.py
│   ├── data_extraction.py    # ConvoKit download + pair extraction
│   ├── preprocess.py         # Cleaning, vocab building, encoding
│   ├── dataset.py            # PyTorch Dataset + DataLoader
│   ├── model.py              # Encoder, Decoder, Seq2Seq
│   ├── train.py              # Training loop
│   ├── inference.py          # Response generation + Chatbot class
│   └── utils.py              # Shared helpers
├── models/
│   ├── model.pth             # Saved model weights (after training)
│   └── vocab.json            # Word → index mapping (after training)
├── chat.py                   # Terminal chat interface (main entry)
├── requirements.txt
└── README.md
```

---

## Setup

### 1. Create a virtual environment (recommended)

```bash
python -m venv venv

# Windows
venv\Scripts\activate

# macOS / Linux
source venv/bin/activate
```

### 2. Install dependencies

```bash
pip install -r requirements.txt
```

> **GPU users:** Install a CUDA-enabled PyTorch build from https://pytorch.org
> before running `pip install -r requirements.txt`.

### 3. (SpaCy model — required by ConvoKit)

```bash
python -m spacy download en_core_web_sm
```

---

## Running the Pipeline

All commands are run from inside the `chatbot-ai/` directory.

### Step 1 — Download & extract dialogue pairs

```bash
python src/data_extraction.py
```

Downloads the Cornell corpus (~35 MB) and saves up to 50,000 dialogue
pairs to `data/processed/pairs.json`.

### Step 2 — Train the model

```bash
python src/train.py
```

- Preprocesses the pairs (cleaning, vocab, encoding)
- Trains the Seq2Seq model for 10 epochs
- Saves best weights → `models/model.pth`
- Saves vocabulary → `models/vocab.json`

Training time (CPU): ~20–40 min for 40k pairs, 10 epochs.  
Training time (GPU): ~3–8 min.

### Step 3 — Chat!

```bash
python chat.py
```

Type any message and press **Enter**. Type `quit` to exit.

---

## Key Hyperparameters (edit in `src/train.py`)

| Parameter      | Default | Description                        |
|----------------|---------|------------------------------------|
| `EMBED_DIM`    | 256     | Word embedding size                |
| `HIDDEN_DIM`   | 512     | LSTM hidden state size             |
| `NUM_LAYERS`   | 2       | Stacked LSTM layers                |
| `BATCH_SIZE`   | 64      | Samples per gradient update        |
| `NUM_EPOCHS`   | 10      | Training epochs                    |
| `LEARNING_RATE`| 0.001   | Adam optimizer learning rate       |
| `MAX_PAIRS`    | 40000   | Training set size (subset)         |
| `MAX_LENGTH`   | 20      | Max tokens per sentence            |

---

## Architecture

```
Input sentence
     │
  [Encoder]
  Embedding → LSTM × 2
     │
  (hidden, cell)   ← context vector
     │
  [Decoder]
  <SOS> → Embedding → LSTM × 2 → Linear → token₁
           token₁  → Embedding → LSTM × 2 → Linear → token₂
           ...                                       → <EOS>
     │
  Response sentence
```

Teacher forcing (ratio 0.5) is used during training to stabilise learning.
At inference time the decoder always uses its own previous prediction.

---

## Notes

- The chatbot is trained from scratch — no pretrained weights or external APIs.
- Responses improve significantly after epoch 5+.
- For better quality, increase `MAX_PAIRS` to 50000 and `NUM_EPOCHS` to 15–20.
