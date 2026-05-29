# test_chain.py  (project root — delete after testing)
import os
from dotenv import load_dotenv
load_dotenv()

from app.core.logging_config import configure_logging
configure_logging()

from app.core.rag_chain import build_rag_chain, retrieve_sources

print("\n── Source Retrieval Test ──")
question = "What are the key skills and experience?"
sources = retrieve_sources(question)
print(f"  Sources found: {len(sources)}")
for s in sources:
    print(f"  └─ [{s['source_type']}] {s['source_name']} | snippet: {s['snippet'][:80]}...")

print("\n── Streaming Chain Test ──")
print("  Answer: ", end="", flush=True)

chain = build_rag_chain()
for token in chain.stream({"question": question}):
    print(token, end="", flush=True)

print("\n\n── Done ──")