# app/config.py
import os
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict # type: ignore
from pydantic import Field # type: ignore


class Config(BaseSettings):
    """
    Central configuration loaded from environment variables.
    Pydantic validates types at startup — the app will refuse to start
    if a required variable is missing or the wrong type.
    """
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",  # silently ignore unknown env vars
    )

    # ── Flask ────────────────────────────────────────────────────────────────
    flask_env: str = Field(default="development", alias="FLASK_ENV")
    secret_key: str = Field(default="dev-secret-change-in-prod", alias="FLASK_SECRET_KEY")
    user_agent: str = Field(default="NexusRetrieval/1.0", alias="USER_AGENT")

    # ── Groq ─────────────────────────────────────────────────────────────────
    groq_api_key: str = Field(..., alias="GROQ_API_KEY")        # required
    groq_model_name: str = Field(
        default="llama3-8b-8192", alias="GROQ_MODEL_NAME"
    )

    # ── Embeddings ────────────────────────────────────────────────────────────
    embedding_model_name: str = Field(
        default="sentence-transformers/all-MiniLM-L6-v2",
        alias="EMBEDDING_MODEL_NAME",
    )

    # ── ChromaDB ──────────────────────────────────────────────────────────────
    chroma_db_path: str = Field(default="./chroma_db", alias="CHROMA_DB_PATH")
    chroma_collection_name: str = Field(
        default="nexus_documents", alias="CHROMA_COLLECTION_NAME"
    )

    # ── File Handling ─────────────────────────────────────────────────────────
    upload_folder: str = Field(default="./uploads", alias="UPLOAD_FOLDER")
    max_upload_mb: int = Field(default=50, alias="MAX_UPLOAD_MB")
    allowed_extensions: set[str] = {"pdf", "docx", "txt"}

    # ── Chunking ──────────────────────────────────────────────────────────────
    chunk_size: int = Field(default=1000, alias="CHUNK_SIZE")
    chunk_overlap: int = Field(default=200, alias="CHUNK_OVERLAP")

    # ── Retrieval ─────────────────────────────────────────────────────────────
    retriever_k: int = Field(default=5, alias="RETRIEVER_K")       # docs per query variant
    multi_query_variants: int = Field(default=3, alias="MULTI_QUERY_VARIANTS")

    # ── Logging ───────────────────────────────────────────────────────────────
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")
    log_dir: str = Field(default="./logs", alias="LOG_DIR")

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024

    @property
    def chroma_db_resolved_path(self) -> str:
        """Resolve relative paths to absolute so ChromaDB never gets confused."""
        return str(Path(self.chroma_db_path).resolve())

    @property
    def upload_folder_resolved_path(self) -> str:
        return str(Path(self.upload_folder).resolve())


# ── Module-level singleton ────────────────────────────────────────────────────
# Import this instance everywhere — never instantiate Config() again.
config = Config()