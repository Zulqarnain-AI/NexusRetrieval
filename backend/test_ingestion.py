# test_ingestion.py  (project root — delete after testing)
import os
from dotenv import load_dotenv
load_dotenv()

from app.core.logging_config import configure_logging
configure_logging()

from app.core.ingestion import ingest_file, ingest_url
from app.core.vectorstore import add_documents, collection_stats

# ── Test 1: File ingestion ────────────────────────────────────────────────────
# Place any PDF in uploads/ and update the filename below
TEST_PDF = "Zulqarnain_Hassan.pdf"

if os.path.exists(TEST_PDF):
    print("\n── PDF Ingestion Test ──")
    chunks = ingest_file(TEST_PDF)
    print(f"  Chunks produced : {len(chunks)}")
    print(f"  First chunk     : {chunks[0].page_content[:120]!r}")
    print(f"  Metadata        : {chunks[0].metadata}")

    print("\n── Storing in ChromaDB ──")
    ids = add_documents(chunks)
    print(f"  Stored {len(ids)} chunks")
    print(f"  Stats: {collection_stats()}")
else:
    print(f"Skipping PDF test — place a file at {TEST_PDF}")

# ── Test 2: URL ingestion ─────────────────────────────────────────────────────
print("\n── URL Ingestion Test ──")
try:
    url_chunks = ingest_url("https://en.wikipedia.org/wiki/Retrieval-augmented_generation")
    print(f"  Chunks produced : {len(url_chunks)}")
    print(f"  First chunk     : {url_chunks[0].page_content[:120]!r}")
    print(f"  Metadata        : {url_chunks[0].metadata}")

    ids = add_documents(url_chunks)
    print(f"  Stored {len(ids)} chunks")
    print(f"  Final stats     : {collection_stats()}")
except Exception as e:
    print(f"  URL test failed : {e}")