"""
GPT-2 Medium inference for Modulon.

Loads the fine-tuned model from models/gpt2/ and generates responses.
"""

import os

import torch
from transformers import AutoTokenizer, AutoModelForCausalLM

MODEL_DIR = "models/gpt2-de"

# Generation settings — Modulon M0.1 (single deployed model)
MAX_NEW_TOKENS     = 60
TEMPERATURE        = 0.6     # lower = more focused and on-topic
TOP_K              = 40
TOP_P              = 0.90
REPETITION_PENALTY = 1.4     # stronger penalty against repeating itself


class GPT2Chatbot:
    """
    Loads the fine-tuned GPT-2 Medium model once and exposes a
    simple respond() method, matching the interface of the LSTM Chatbot.
    """

    def __init__(self, model_dir: str = MODEL_DIR):
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

        if not os.path.isdir(model_dir):
            raise FileNotFoundError(
                f"No fine-tuned model found at '{model_dir}'.\n"
                "Run  python gpt2/train.py  first."
            )

        print(f"Loading GPT-2 Medium from {model_dir} ...")
        self.tokenizer = AutoTokenizer.from_pretrained(model_dir)
        self.model     = AutoModelForCausalLM.from_pretrained(model_dir)
        self.model     = self.model.to(self.device)
        self.model.eval()
        print(f"Ready on {self.device}.\n")

    def respond(self, user_input: str) -> str:
        """Generate a response to user_input (Modulon M0.1)."""
        prompt     = f"Nutzer: {user_input.strip()}\nBot:"
        input_ids  = self.tokenizer.encode(prompt, return_tensors="pt").to(self.device)

        with torch.no_grad():
            output_ids = self.model.generate(
                input_ids,
                max_new_tokens=MAX_NEW_TOKENS,
                do_sample=True,
                temperature=TEMPERATURE,
                top_k=TOP_K,
                top_p=TOP_P,
                repetition_penalty=REPETITION_PENALTY,
                pad_token_id=self.tokenizer.eos_token_id,
                eos_token_id=self.tokenizer.eos_token_id,
            )

        # Decode only the new tokens (skip the prompt)
        new_tokens = output_ids[0][input_ids.shape[1]:]
        response   = self.tokenizer.decode(new_tokens, skip_special_tokens=True)

        # Stop at the next turn marker so it doesn't hallucinate extra turns
        for stop in ["\nHuman:", "\nBot:", "<|endoftext|>"]:
            if stop in response:
                response = response.split(stop)[0]

        return response.strip() or "..."
