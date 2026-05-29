# app/routes/ingest.py
import logging
import os
import uuid
from pathlib import Path

from flask import Blueprint, request, jsonify # type: ignore
from werkzeug.utils import secure_filename

from app.config import config
from app.core.ingestion import ingest_file, ingest_url
from app.core.vectorstore import add_documents, collection_stats

logger = logging.getLogger(__name__)

ingest_bp = Blueprint("ingest", __name__)


def _allowed_file(filename: str) -> bool:
    """
    Checks both that an extension exists and that it's in the allowlist.
    Rejects files like '.pdf' (no name) or 'malicious' (no extension).
    """
    if "." not in filename:
        return False
    ext = filename.rsplit(".", 1)[1].lower()
    return ext in config.allowed_extensions


@ingest_bp.route("/upload-file", methods=["POST"])
def upload_file():
    """
    Accepts a multipart/form-data file upload.
    Saves it to the uploads/ directory, ingests and chunks it,
    stores vectors in ChromaDB, then returns metadata.

    Why save to disk first instead of processing from memory?
    PyPDFLoader and Docx2txtLoader both require a file path —
    they don't accept file-like objects. Saving to disk with a
    UUID prefix prevents filename collisions across concurrent uploads.
    """
    if "file" not in request.files:
        return jsonify({"error": "No file field in request"}), 400

    file = request.files["file"]

    if not file.filename:
        return jsonify({"error": "Empty filename"}), 400

    if not _allowed_file(file.filename):
        return jsonify({
            "error": f"Unsupported file type. Allowed: {', '.join(config.allowed_extensions)}"
        }), 415

    # Secure the filename and prepend UUID to avoid collisions
    safe_name = secure_filename(file.filename)
    unique_name = f"{uuid.uuid4().hex}_{safe_name}"
    save_path = os.path.join(config.upload_folder_resolved_path, unique_name)

    try:
        file.save(save_path)
        logger.info(
            "File saved",
            extra={"original": safe_name, "saved_as": unique_name},
        )
    except Exception as exc:
        logger.error("File save failed", extra={"error": str(exc)}, exc_info=True)
        return jsonify({"error": "Failed to save file"}), 500

    # Ingest → chunk → embed → store
    try:
        chunks = ingest_file(save_path)
        ids = add_documents(chunks)
    except ValueError as exc:
        # Unsupported type or empty content — client error
        return jsonify({"error": str(exc)}), 422
    except Exception as exc:
        logger.error("Ingestion failed", extra={"error": str(exc)}, exc_info=True)
        return jsonify({"error": "Ingestion pipeline failed"}), 500
    finally:
        # Always clean up the temp file — we don't need it after embedding
        if os.path.exists(save_path):
            os.remove(save_path)
            logger.debug("Temp file cleaned up", extra={"path": save_path})

    return jsonify({
        "status": "success",
        "original_filename": safe_name,
        "chunks_created": len(chunks),
        "document_ids": ids[:5],        # sample only — full list can be huge
        "collection_stats": collection_stats(),
    }), 201


@ingest_bp.route("/scrape-url", methods=["POST"])
def scrape_url():
    """
    Accepts a JSON body: {"url": "https://..."}
    Scrapes the URL, chunks its content, stores in ChromaDB.

    Why POST and not GET?
    GET requests should be idempotent and have no side effects.
    Scraping a URL and writing to a vector DB is a side effect —
    POST is semantically correct here.
    """
    body = request.get_json(silent=True)
    if not body or "url" not in body:
        return jsonify({"error": "Request body must be JSON with a 'url' field"}), 400

    url: str = body["url"].strip()
    if not url:
        return jsonify({"error": "URL cannot be empty"}), 400

    try:
        chunks = ingest_url(url)
        ids = add_documents(chunks)
    except ValueError as exc:
        # SSRF block or no content found — client error
        return jsonify({"error": str(exc)}), 422
    except RuntimeError as exc:
        # Network error, timeout, etc.
        return jsonify({"error": str(exc)}), 502
    except Exception as exc:
        logger.error("URL ingestion failed", extra={"error": str(exc)}, exc_info=True)
        return jsonify({"error": "URL ingestion pipeline failed"}), 500

    return jsonify({
        "status": "success",
        "url": url,
        "chunks_created": len(chunks),
        "document_ids": ids[:5],
        "collection_stats": collection_stats(),
    }), 201