"""
Persistent GPT-2 inference server for the Modulon web API.

Reads  JSON lines from stdin : {"message": "..."}
Writes JSON lines to stdout  : {"response": "..."}

Stays alive — model is loaded once, then handles requests in a loop.
Started automatically by server/train-api.mjs.
"""

import json
import os
import sys

# Run from chatbot-ai/ directory
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
sys.path.insert(0, ".")


def main() -> None:
    # Signal that we're loading
    print(json.dumps({"status": "loading"}), flush=True)

    try:
        from gpt2.inference import GPT2Chatbot
        bot = GPT2Chatbot()
    except FileNotFoundError as exc:
        # Model not trained yet — let the API surface a friendly error
        print(json.dumps({"status": "error", "message": str(exc)}), flush=True)
        sys.exit(1)
    except Exception as exc:
        print(json.dumps({"status": "error", "message": str(exc)}), flush=True)
        sys.exit(1)

    # Signal ready to the Node bridge
    print(json.dumps({"status": "ready"}), flush=True)

    for raw_line in sys.stdin:
        raw_line = raw_line.strip()
        if not raw_line:
            continue
        try:
            data    = json.loads(raw_line)
            message = data.get("message", "").strip()
            if not message:
                print(json.dumps({"response": "…"}), flush=True)
                continue
            response = bot.respond(message)
            print(json.dumps({"response": response}), flush=True)
        except json.JSONDecodeError:
            print(json.dumps({"response": "Invalid request."}), flush=True)
        except Exception as exc:
            print(json.dumps({"response": f"Error: {exc}"}), flush=True)


if __name__ == "__main__":
    main()
