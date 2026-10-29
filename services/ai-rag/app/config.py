"""Runtime configuration for ai-rag (env prefix ``RAG_``)."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

SERVICE_VERSION = "0.1.0"
DEFAULT_PROMPT_DIR = Path(__file__).resolve().parent / "prompts"


class Settings(BaseSettings):
    """All values have deterministic dev-safe defaults."""

    model_config = SettingsConfigDict(
        env_prefix="RAG_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    service_name: str = "ai-rag"
    version: str = SERVICE_VERSION
    log_level: str = "INFO"

    grpc_host: str = "0.0.0.0"
    grpc_port: int = 50051
    grpc_workers: int = 8
    http_host: str = "0.0.0.0"
    http_port: int = 8081

    llm_provider: str = "replay"
    embedding_provider: str = "hash"
    # The service ships a deterministic 256-dim hash embedder. The storage
    # column is vector(1024), so vectors are zero-padded before insert.
    embedding_dim: int = 256
    vector_dim: int = 1024

    chunk_size: int = 800
    chunk_overlap: int = 120

    top_k_vector: int = 20
    top_k_lexical: int = 20
    rrf_k: int = 60
    top_n_final: int = 6
    mmr_lambda: float = 0.7
    refuse_threshold: float = 0.0
    max_answer_tokens: int = 512

    database_url: str = "postgresql://shelfops:shelfops_dev_password@localhost:55433/shelfops"
    db_pool_min: int = 1
    db_pool_max: int = 5
    db_connect_timeout: float = 2.0
    chunks_table: str = Field(default="chunks", pattern=r"^[a-z_][a-z0-9_]*$")

    object_store_root: str = "./data/uploads"
    max_document_bytes: int = 25 * 1024 * 1024
    prompt_dir: Path = DEFAULT_PROMPT_DIR


@lru_cache
def get_settings() -> Settings:
    return Settings()
