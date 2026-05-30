# app/core/vectorstore.py
import logging
from typing import Optional

from langchain_chroma import Chroma
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_core.documents import Document

from app.config import config

logger = logging.getLogger(__name__)

# ── Module-level singletons ───────────────────────────────────────────────────
# These are initialized once on first use (lazy initialization).
# Embedding models take ~2-3s to load — we do it once, not per request.
_embeddings: Optional[HuggingFaceEmbeddings] = None
_vectorstore: Optional[Chroma] = None


def get_embeddings() -> HuggingFaceEmbeddings:
    """
    Returns a cached HuggingFace embedding model.

    Why all-MiniLM-L6-v2?
    - 22M parameters — fast on CPU, no GPU required
    - 384-dimension vectors — good quality/speed trade-off
    - Apache 2.0 license — production safe
    - Completely free, runs locally, no API calls
    """
    global _embeddings
    if _embeddings is None:
        logger.info(
            "Initializing embedding model",
            extra={"model": config.embedding_model_name},
        )
        _embeddings = HuggingFaceEmbeddings(
            model_name=config.embedding_model_name,
            model_kwargs={"device": "cpu"},
            encode_kwargs={
                "normalize_embeddings": True,   # cosine similarity works best normalized
                "batch_size": 32,
            },
        )
        logger.info("Embedding model loaded successfully")
    return _embeddings


def get_vectorstore() -> Chroma:
    """
    Returns a persistent ChromaDB instance, creating it if it doesn't exist.

    Why persistent ChromaDB?
    - Data survives server restarts — critical for production
    - The chroma_db/ directory is your entire knowledge base
    - Backup strategy = just copy that directory
    """
    global _vectorstore
    if _vectorstore is None:
        logger.info(
            "Connecting to ChromaDB",
            extra={"path": config.chroma_db_resolved_path},
        )
        _vectorstore = Chroma(
            collection_name=config.chroma_collection_name,
            embedding_function=get_embeddings(),
            persist_directory=config.chroma_db_resolved_path,
        )
        count = _vectorstore._collection.count()
        logger.info(
            "ChromaDB ready",
            extra={
                "collection": config.chroma_collection_name,
                "existing_documents": count,
            },
        )
    return _vectorstore


def add_documents(documents: list[Document]) -> list[str]:
    """
    Embeds and stores a list of LangChain Documents in ChromaDB.
    Returns the list of generated IDs.
    """
    if not documents:
        logger.warning("add_documents called with empty list — skipping")
        return []

    try:
        vs = get_vectorstore()
        ids = vs.add_documents(documents)
        logger.info(
            "Documents added to vectorstore",
            extra={"count": len(documents), "ids_sample": ids[:3]},
        )
        return ids
    except Exception as exc:
        logger.error(
            "Failed to add documents to vectorstore",
            extra={"error": str(exc)},
            exc_info=True,
        )
        raise


def get_retriever(k: Optional[int] = None):
    """
    Returns a base ChromaDB retriever.
    This is consumed by the MultiQueryRetriever in rag_chain.py.
    Keeping it separate lets us tune retrieval params in one place.
    """
    vs = get_vectorstore()
    return vs.as_retriever(
        search_type="similarity",
        search_kwargs={"k": k or config.retriever_k},
    )


def collection_stats() -> dict:
    """Returns basic stats — useful for a /health endpoint later."""
    try:
        vs = get_vectorstore()
        return {
            "collection_name": config.chroma_collection_name,
            "document_count": vs._collection.count(),
            "persist_directory": config.chroma_db_resolved_path,
        }
    except Exception as exc:
        logger.error("Failed to fetch collection stats", extra={"error": str(exc)})
        return {"error": str(exc)}


def delete_documents_by_doc_id(doc_id: str) -> int:
    """
    Deletes all chunks that belong to a single ingested source doc_id.
    Returns the number of deleted chunks.
    """
    if not doc_id:
        return 0

    vs = get_vectorstore()
    before = vs._collection.count()

    vs.delete(where={"doc_id": doc_id})

    after = vs._collection.count()
    deleted = max(0, before - after)
    logger.info(
        "Deleted source from vectorstore",
        extra={"doc_id": doc_id, "deleted_chunks": deleted},
    )
    return deleted


def clear_collection() -> int:
    """
    Deletes every vector in the current collection.
    Returns the number of deleted vectors.
    """
    vs = get_vectorstore()
    existing_ids = vs._collection.get(include=[]).get("ids", [])

    if not existing_ids:
        return 0

    vs.delete(ids=existing_ids)
    logger.info("Knowledge base collection cleared", extra={"deleted_chunks": len(existing_ids)})
    return len(existing_ids)