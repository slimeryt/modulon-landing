"""
Terminal chatbot interface — main entry point.

Usage:
    python chat.py

Commands while chatting:
    quit / exit / q  →  exit the program
"""

import os
import sys


BANNER = """
╔══════════════════════════════════════════════════╗
║        Cornell Movie Chatbot  (Seq2Seq)          ║
║        Self-learning from every conversation     ║
╠══════════════════════════════════════════════════╣
║  Type a message and press Enter to chat.         ║
║  Type  quit / exit / q  to stop.                 ║
╚══════════════════════════════════════════════════╝
"""

EXIT_COMMANDS = {"quit", "exit", "q"}


def check_models():
    """Abort early with a helpful message if the model hasn't been trained yet."""
    missing = []
    for path in ["models/model.pth", "models/vocab.json"]:
        if not os.path.exists(path):
            missing.append(path)

    if missing:
        print("\nERROR: The following model files are missing:")
        for p in missing:
            print(f"  - {p}")
        print(
            "\nPlease train the model first:\n"
            "  Step 1:  python src/data_extraction.py\n"
            "  Step 2:  python src/train.py\n"
        )
        sys.exit(1)


def main():
    print(BANNER)
    check_models()

    print("Loading model (this may take a few seconds)...")
    from src.inference import Chatbot
    bot = Chatbot()

    print("=" * 52)
    print("Chat started! The bot learns from every exchange.\n")

    exchange_count = 0

    while True:
        try:
            user_input = input("You: ").strip()
        except (KeyboardInterrupt, EOFError):
            print("\n\nSaving and exiting...")
            bot.save()
            print("Model saved. Goodbye!")
            break

        if not user_input:
            continue

        if user_input.lower() in EXIT_COMMANDS:
            print("Saving model before exit...")
            bot.save()
            print("Model saved. Goodbye!")
            break

        # Generate response
        response = bot.respond(user_input)
        print(f"Bot: {response}\n")

        # Self-learning: update model on this (input → response) pair
        loss = bot.learn(user_input, response)
        exchange_count += 1

        # Show a subtle learning indicator every 10 exchanges
        if exchange_count % 10 == 0:
            print(f"  [Self-learned from {exchange_count} exchanges | last loss: {loss:.4f}]\n")


if __name__ == "__main__":
    main()
