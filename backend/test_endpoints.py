# test_endpoints.py  (project root)
import requests
import json

BASE = "http://localhost:5000/api"

# ── Test 3: Scrape URL ────────────────────────────────────────────────────────
print("\n── Scrape URL Test ──")
resp = requests.post(
    f"{BASE}/scrape-url",
    json={"url": "https://en.wikipedia.org/wiki/LangChain"},
    timeout=30,
)
print(f"  Status : {resp.status_code}")
print(f"  Body   : {json.dumps(resp.json(), indent=2)}")

# ── Test 4: Chat stream ───────────────────────────────────────────────────────
print("\n── Chat Stream Test ──")
with requests.post(
    f"{BASE}/chat",
    json={"question": "What are the key skills and experience?"},
    stream=True,
    timeout=60,
) as resp:
    print(f"  Status : {resp.status_code}")
    print(f"  Headers: {dict(resp.headers)}\n")

    full_answer = []
    sources = []

    for raw_line in resp.iter_lines(decode_unicode=True):
        if not raw_line:
            continue

        if raw_line.startswith("event:"):
            event_type = raw_line.split(":", 1)[1].strip()

        elif raw_line.startswith("data:"):
            payload = json.loads(raw_line.split(":", 1)[1].strip())

            if event_type == "sources":
                sources = payload["sources"]
                print(f"  [sources] {len(sources)} source(s) received:")
                for s in sources:
                    print(f"    └─ {s['source_type']} | {s['source_name']}")

            elif event_type == "token":
                token = payload["token"]
                full_answer.append(token)
                print(token, end="", flush=True)

            elif event_type == "done":
                print(f"\n\n  [done] Total tokens: {payload['token_count']}")

            elif event_type == "error":
                print(f"\n  [error] {payload['error']}")

    print(f"\n\n── Full Answer ──\n{''.join(full_answer)}")