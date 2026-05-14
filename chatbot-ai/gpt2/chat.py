"""
Modulon GPT-2 — terminal chat interface.

Run from project root:
    python gpt2/chat.py
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from gpt2.inference import GPT2Chatbot


def main():
    print("\n" + "=" * 52)
    print("  Modulon GPT-2 DE  |  German — dbmdz/german-gpt2")
    print("=" * 52)
    print("  Type 'quit' or Ctrl+C to exit\n")

    bot = GPT2Chatbot()

    while True:
        try:
            user_input = input("You: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nGoodbye!")
            break

        if not user_input:
            continue

        if user_input.lower() in ("quit", "exit", "bye", "q"):
            print("Bot: See you later!")
            break

        response = bot.respond(user_input)
        print(f"Bot: {response}\n")


if __name__ == "__main__":
    main()
