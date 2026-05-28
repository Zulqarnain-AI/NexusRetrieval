# app/__init__.py
import logging
from flask import Flask
from flask_cors import CORS

from app.config import config
from app.core.logging_config import configure_logging


def create_app() -> Flask:
    """
    Application factory. Creates and configures the Flask app instance.
    """
    # ── Logging first — so every subsequent step is observable ───────────────
    configure_logging(log_level=config.log_level, log_dir=config.log_dir)
    logger = logging.getLogger(__name__)

    app = Flask(__name__)

    # ── Load config into Flask ────────────────────────────────────────────────
    app.secret_key = config.secret_key
    app.config["MAX_CONTENT_LENGTH"] = config.max_upload_bytes
    app.config["UPLOAD_FOLDER"] = config.upload_folder_resolved_path

    # ── CORS ──────────────────────────────────────────────────────────────────
    CORS(app, resources={r"/api/*": {"origins": "*"}})

    # ── Ensure runtime directories exist ─────────────────────────────────────
    import os
    os.makedirs(config.upload_folder_resolved_path, exist_ok=True)
    os.makedirs(config.chroma_db_resolved_path, exist_ok=True)
    os.makedirs(config.log_dir, exist_ok=True)

    # ── Blueprints (uncomment as we build each phase) ─────────────────────────
    # from app.routes.ingest import ingest_bp
    # from app.routes.chat import chat_bp
    # app.register_blueprint(ingest_bp, url_prefix="/api")
    # app.register_blueprint(chat_bp, url_prefix="/api")

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