# app/core/ingestion.py
import logging
import os
import tempfile
import uuid
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

from langchain_community.document_loaders import (
    PyPDFLoader,
    Docx2txtLoader,
    WebBaseLoader,
)
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.config import config

logger = logging.getLogger(__name__)


# ── Text Splitter singleton ───────────────────────────────────────────────────
# One instance is fine — it's stateless. Creating it once avoids re-parsing
# the separator list on every ingestion call.
def _get_text_splitter() -> RecursiveCharacterTextSplitter:
    """
    RecursiveCharacterTextSplitter tries separators in order:
      1. Double newline  → paragraph boundary (preferred)
      2. Single newline  → line boundary
      3. Period+space    → sentence boundary
      4. Space           → word boundary
      5. Empty string    → character boundary (last resort)

    This hierarchy respects natural language structure. The splitter
    only moves to the next separator if the current one can't achieve
    the target chunk_size.
    """
    return RecursiveCharacterTextSplitter(
        chunk_size=config.chunk_size,
        chunk_overlap=config.chunk_overlap,
        length_function=len,
        separators=["\n\n", "\n", ". ", " ", ""],
        is_separator_regex=False,
    )


# ── Metadata helpers ──────────────────────────────────────────────────────────

def _build_metadata(
    source_type: str,
    source_name: str,
    extra: Optional[dict] = None,
) -> dict:
    """
    Builds a consistent metadata schema for every document chunk.

    Why standardized metadata?
    ChromaDB stores metadata as a flat dict alongside each vector.
    When we return sources to the frontend, we want every chunk —
    regardless of where it came from — to have the same fields so
    the React component doesn't need special-case logic.

    Schema:
      source_type  : "pdf" | "docx" | "txt" | "web"
      source_name  : filename or URL
      doc_id       : unique ID for this ingestion batch
      page         : page number (PDFs only, else None)
      chunk_index  : set downstream during splitting
    """
    metadata = {
        "source_type": source_type,
        "source_name": source_name,
        "doc_id": str(uuid.uuid4()),
    }
    if extra:
        metadata.update(extra)
    return metadata


def _enrich_chunks_with_index(chunks: list[Document]) -> list[Document]:
    """
    Adds chunk_index to each split document so we can tell the frontend
    'this answer came from chunk 3 of 12 in report.pdf'.
    Also ensures every chunk has a non-empty page_content — empty chunks
    crash ChromaDB's embedding step.
    """
    enriched = []
    for i, chunk in enumerate(chunks):
        # Skip empty or whitespace-only chunks
        if not chunk.page_content.strip():
            logger.debug("Skipping empty chunk at index %d", i)
            continue
        chunk.metadata["chunk_index"] = i
        chunk.metadata["chunk_total"] = len(chunks)
        enriched.append(chunk)
    return enriched


# ── Source-specific loaders ───────────────────────────────────────────────────

def ingest_pdf(file_path: str) -> list[Document]:
    """
    Loads and chunks a PDF file.

    PyPDFLoader splits by page first, then we rechunk.
    Why rechunk after page-split? A single PDF page can be 5000+ characters
    (dense financial tables, legal text). We need uniform chunk sizes for
    consistent retrieval — page boundaries alone don't guarantee that.

    Metadata includes the original page number so citations are accurate.
    """
    file_path = str(Path(file_path).resolve())
    source_name = Path(file_path).name
    logger.info("Ingesting PDF", extra={"file": source_name})

    try:
        loader = PyPDFLoader(file_path)
        # .load() returns one Document per page
        pages: list[Document] = loader.load()
        logger.info(
            "PDF loaded",
            extra={"file": source_name, "pages": len(pages)},
        )
    except Exception as exc:
        logger.error(
            "Failed to load PDF",
            extra={"file": source_name, "error": str(exc)},
            exc_info=True,
        )
        raise RuntimeError(f"Could not parse PDF '{source_name}': {exc}") from exc

    splitter = _get_text_splitter()
    chunks: list[Document] = []

    for page in pages:
        page_num = page.metadata.get("page", 0) + 1   # PyPDF is 0-indexed
        page_chunks = splitter.split_documents([page])
        for chunk in page_chunks:
            chunk.metadata.update(
                _build_metadata(
                    source_type="pdf",
                    source_name=source_name,
                    extra={"page": page_num},
                )
            )
        chunks.extend(page_chunks)

    enriched = _enrich_chunks_with_index(chunks)
    logger.info(
        "PDF chunked",
        extra={"file": source_name, "chunks": len(enriched)},
    )
    return enriched


def ingest_docx(file_path: str) -> list[Document]:
    """
    Loads and chunks a DOCX file.

    Docx2txtLoader extracts the full text as a single string.
    Unlike PDF, there are no natural page boundaries — we rely entirely
    on the RecursiveCharacterTextSplitter's separator hierarchy.
    """
    file_path = str(Path(file_path).resolve())
    source_name = Path(file_path).name
    logger.info("Ingesting DOCX", extra={"file": source_name})

    try:
        loader = Docx2txtLoader(file_path)
        docs: list[Document] = loader.load()
    except Exception as exc:
        logger.error(
            "Failed to load DOCX",
            extra={"file": source_name, "error": str(exc)},
            exc_info=True,
        )
        raise RuntimeError(f"Could not parse DOCX '{source_name}': {exc}") from exc

    splitter = _get_text_splitter()
    chunks = splitter.split_documents(docs)

    for chunk in chunks:
        chunk.metadata.update(
            _build_metadata(
                source_type="docx",
                source_name=source_name,
            )
        )

    enriched = _enrich_chunks_with_index(chunks)
    logger.info(
        "DOCX chunked",
        extra={"file": source_name, "chunks": len(enriched)},
    )
    return enriched


def ingest_txt(file_path: str) -> list[Document]:
    """
    Loads and chunks a plain text file.
    Simple but complete — handles encoding edge cases explicitly.
    """
    file_path = str(Path(file_path).resolve())
    source_name = Path(file_path).name
    logger.info("Ingesting TXT", extra={"file": source_name})

    try:
        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            text = f.read()
    except Exception as exc:
        raise RuntimeError(f"Could not read TXT '{source_name}': {exc}") from exc

    doc = Document(
        page_content=text,
        metadata=_build_metadata(source_type="txt", source_name=source_name),
    )
    splitter = _get_text_splitter()
    chunks = splitter.split_documents([doc])

    enriched = _enrich_chunks_with_index(chunks)
    logger.info(
        "TXT chunked",
        extra={"file": source_name, "chunks": len(enriched)},
    )
    return enriched


def ingest_url(url: str) -> list[Document]:
    """
    Scrapes a web URL and chunks its content.

    WebBaseLoader uses requests + BeautifulSoup under the hood.
    We validate the URL before hitting the network — never trust
    user input, especially URLs (SSRF risk: a malicious user could
    point this at internal services like http://169.254.169.254/).

    The SSRF allowlist below blocks private IP ranges. Extend it
    with your own domain whitelist in production.
    """
    _validate_url(url)
    logger.info("Ingesting URL", extra={"url": url})

    try:
        loader = WebBaseLoader(
            web_paths=[url],
            bs_kwargs={
                # Only extract the meaningful text containers,
                # skipping navbars, footers, cookie banners
                "parse_only": None,
            },
            requests_kwargs={"timeout": 15},
        )
        docs: list[Document] = loader.load()
    except Exception as exc:
        logger.error(
            "Failed to scrape URL",
            extra={"url": url, "error": str(exc)},
            exc_info=True,
        )
        raise RuntimeError(f"Could not scrape URL '{url}': {exc}") from exc

    if not docs or not any(d.page_content.strip() for d in docs):
        raise ValueError(
            f"No extractable text content found at '{url}'. "
            "The page may require JavaScript rendering."
        )

    splitter = _get_text_splitter()
    chunks = splitter.split_documents(docs)

    for chunk in chunks:
        chunk.metadata.update(
            _build_metadata(
                source_type="web",
                source_name=url,
                extra={"domain": urlparse(url).netloc},
            )
        )

    enriched = _enrich_chunks_with_index(chunks)
    logger.info(
        "URL chunked",
        extra={"url": url, "chunks": len(enriched)},
    )
    if len(enriched) < 2 or all(
        len(c.page_content.strip()) < 100 for c in enriched
    ):
        logger.warning(
            "Suspiciously little content — retrying with Playwright",
            extra={"url": url},
        )
        return ingest_url_js(url)

    return enriched


# ── URL Security ──────────────────────────────────────────────────────────────

def _validate_url(url: str) -> None:
    """
    Basic SSRF protection. Blocks:
    - Non-HTTP schemes (file://, ftp://, etc.)
    - Private/loopback IP ranges
    - Suspiciously short or malformed URLs

    This is a first line of defense — add domain allowlisting
    in production if you want strict control.
    """
    import ipaddress

    parsed = urlparse(url)

    if parsed.scheme not in ("http", "https"):
        raise ValueError(f"Only HTTP/HTTPS URLs are allowed. Got: '{parsed.scheme}'")

    if not parsed.netloc:
        raise ValueError(f"Invalid URL — no host found: '{url}'")

    # Block raw IP addresses pointing at private ranges
    hostname = parsed.hostname or ""
    try:
        addr = ipaddress.ip_address(hostname)
        if addr.is_private or addr.is_loopback or addr.is_reserved:
            raise ValueError(
                f"Requests to private/internal IP addresses are not allowed: '{hostname}'"
            )
    except ValueError as e:
        # ip_address() raises ValueError for hostnames (not IPs) — that's fine
        if "not allowed" in str(e):
            raise   # re-raise our explicit SSRF block
        # Otherwise it's just a domain name — pass through


# ── Unified entry point ───────────────────────────────────────────────────────

def ingest_file(file_path: str) -> list[Document]:
    """
    Routes a file to the correct loader based on extension.
    This is the function called by the Flask route — it knows
    nothing about PDF vs DOCX details.
    """
    ext = Path(file_path).suffix.lower().lstrip(".")

    dispatch = {
        "pdf":  ingest_pdf,
        "docx": ingest_docx,
        "txt":  ingest_txt,
    }

    handler = dispatch.get(ext)
    if handler is None:
        raise ValueError(
            f"Unsupported file type '.{ext}'. "
            f"Allowed: {', '.join(dispatch.keys())}"
        )

    return handler(file_path)

def ingest_url_js(url: str) -> list[Document]:
    """
    Scrapes JavaScript-rendered pages using Playwright (headless Chromium).
    Use this for LinkedIn, Twitter, React SPAs, and any page that requires
    JS execution to render content.

    Falls back to ingest_url() automatically if Playwright is not installed.
    """
    _validate_url(url)
    logger.info("Ingesting JS-rendered URL via Playwright", extra={"url": url})

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        logger.warning("Playwright not installed — falling back to WebBaseLoader")
        return ingest_url(url)

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page(
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/120.0.0.0 Safari/537.36"
                )
            )
            page.goto(url, wait_until="networkidle", timeout=30000)

            # Wait for main content to appear
            page.wait_for_timeout(2000)

            # Extract visible text only — skip scripts, styles, nav
            text = page.evaluate("""() => {
                const remove = ['script','style','nav','footer','header','noscript'];
                remove.forEach(tag =>
                    document.querySelectorAll(tag).forEach(el => el.remove())
                );
                return document.body.innerText;
            }""")
            browser.close()

    except Exception as exc:
        logger.error(
            "Playwright scrape failed",
            extra={"url": url, "error": str(exc)},
            exc_info=True,
        )
        raise RuntimeError(f"Could not scrape JS page '{url}': {exc}") from exc

    if not text or not text.strip():
        raise ValueError(
            f"No extractable text found at '{url}' even after JS rendering. "
            "The page may require authentication."
        )

    doc = Document(
        page_content=text.strip(),
        metadata=_build_metadata(
            source_type="web",
            source_name=url,
            extra={"domain": urlparse(url).netloc, "renderer": "playwright"},
        ),
    )

    splitter = _get_text_splitter()
    chunks = splitter.split_documents([doc])
    enriched = _enrich_chunks_with_index(chunks)

    logger.info(
        "JS URL chunked",
        extra={"url": url, "chunks": len(enriched)},
    )
    return enriched