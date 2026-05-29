# app/__init__.py
import logging
import os
from flask import Flask # type: ignore
from flask_cors import CORS # type: ignore

from app.config import config
from app.core.logging_config import configure_logging


def create_app() -> Flask:
    """
    Application factory.
    """
    # ── Logging first ─────────────────────────────────────────────────────
    configure_logging(log_level=config.log_level, log_dir=config.log_dir)
    logger = logging.getLogger(__name__)

    app = Flask(__name__)

    # ── Flask config ──────────────────────────────────────────────────────
    app.secret_key = config.secret_key
    app.config["MAX_CONTENT_LENGTH"] = config.max_upload_bytes
    app.config["UPLOAD_FOLDER"] = config.upload_folder_resolved_path

    # ── CORS ──────────────────────────────────────────────────────────────
    CORS(app, resources={r"/api/*": {"origins": "*"}})

    # ── Runtime directories ───────────────────────────────────────────────
    os.makedirs(config.upload_folder_resolved_path, exist_ok=True)
    os.makedirs(config.chroma_db_resolved_path, exist_ok=True)
    os.makedirs(config.log_dir, exist_ok=True)

    # ── Blueprints ────────────────────────────────────────────────────────
    from app.routes.ingest import ingest_bp
    from app.routes.chat import chat_bp
    app.register_blueprint(ingest_bp, url_prefix="/api")
    app.register_blueprint(chat_bp, url_prefix="/api")

    logger.info(
        "NexusRetrieval app started",
        extra={
            "env": config.flask_env,
            "chroma_path": config.chroma_db_resolved_path,
            "embedding_model": config.embedding_model_name,
            "groq_model": config.groq_model_name,
        },
    )

    return app