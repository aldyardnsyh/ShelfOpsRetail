"""Runtime configuration for ai-rag (env prefix ``RAG_``).

Setiap field provider AI menerima dua nama env: nama prefixed (``RAG_*``) yang
dipakai container, dan nama publik dari ``.env.example`` (``LLM_*``,
``EMBEDDING_*``). prefixed wins bila keduanya diisi.
"""

from __future__ import annotations

import re
from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

SERVICE_VERSION = "0.1.0"
DEFAULT_PROMPT_DIR = Path(__file__).resolve().parent / "prompts"

_DURATION_RE = re.compile(r"^\s*([0-9]*\.?[0-9]+)\s*(ms|s|m|h)?\s*$", re.IGNORECASE)


def parse_duration_seconds(value: object) -> float:
    """Terima ``45``, ``45s``, ``1m30s``, ``500ms`` -> detik (float)."""
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    if not isinstance(value, str):
        raise ValueError(f"durasi tidak valid: {value!r}")
    match = _DURATION_RE.match(value)
    if not match:
        raise ValueError(f"durasi tidak valid: {value!r}")
    amount = float(match.group(1))
    unit = (match.group(2) or "s").lower()
    factor = {"ms": 0.001, "s": 1.0, "m": 60.0, "h": 3600.0}[unit]
    return amount * factor


class Settings(BaseSettings):
    """All values have deterministic dev-safe defaults."""

    model_config = SettingsConfigDict(
        env_prefix="RAG_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )

    service_name: str = "ai-rag"
    version: str = SERVICE_VERSION
    log_level: str = "INFO"

    grpc_host: str = "0.0.0.0"
    grpc_port: int = 50051
    grpc_workers: int = 8
    http_host: str = "0.0.0.0"
    http_port: int = 8081

    # -- LLM ---------------------------------------------------------------
    llm_provider: str = Field(
        default="replay",
        validation_alias=AliasChoices("RAG_LLM_PROVIDER", "LLM_PROVIDER"),
    )
    llm_primary_base_url: str = Field(
        default="",
        validation_alias=AliasChoices("RAG_LLM_PRIMARY_BASE_URL", "LLM_PRIMARY_BASE_URL"),
    )
    llm_primary_api_key: str = Field(
        default="",
        validation_alias=AliasChoices("RAG_LLM_PRIMARY_API_KEY", "LLM_PRIMARY_API_KEY"),
    )
    llm_primary_model: str = Field(
        default="",
        validation_alias=AliasChoices("RAG_LLM_PRIMARY_MODEL", "LLM_PRIMARY_MODEL"),
    )
    llm_fallback_base_url: str = Field(
        default="",
        validation_alias=AliasChoices("RAG_LLM_FALLBACK_BASE_URL", "LLM_FALLBACK_BASE_URL"),
    )
    llm_fallback_api_key: str = Field(
        default="",
        validation_alias=AliasChoices("RAG_LLM_FALLBACK_API_KEY", "LLM_FALLBACK_API_KEY"),
    )
    llm_fallback_model: str = Field(
        default="",
        validation_alias=AliasChoices("RAG_LLM_FALLBACK_MODEL", "LLM_FALLBACK_MODEL"),
    )
    llm_daily_budget_usd: float = Field(
        default=1.0,
        validation_alias=AliasChoices("RAG_LLM_DAILY_BUDGET_USD", "LLM_DAILY_BUDGET_USD"),
    )
    llm_request_timeout: float = Field(
        default=45.0,
        validation_alias=AliasChoices("RAG_LLM_REQUEST_TIMEOUT", "LLM_REQUEST_TIMEOUT"),
    )
    # Harga opsional untuk estimasi budget (USD per 1 juta token). 0 = pakai
    # tabel harga bawaan.
    llm_input_price_per_mtok: float = Field(
        default=0.0,
        validation_alias=AliasChoices(
            "RAG_LLM_INPUT_PRICE_PER_MTOK", "LLM_INPUT_PRICE_PER_MTOK"
        ),
    )
    llm_output_price_per_mtok: float = Field(
        default=0.0,
        validation_alias=AliasChoices(
            "RAG_LLM_OUTPUT_PRICE_PER_MTOK", "LLM_OUTPUT_PRICE_PER_MTOK"
        ),
    )

    # -- Embedding ---------------------------------------------------------
    embedding_provider: str = Field(
        default="hash",
        validation_alias=AliasChoices("RAG_EMBEDDING_PROVIDER", "EMBEDDING_PROVIDER"),
    )
    embedding_base_url: str = Field(
        default="",
        validation_alias=AliasChoices("RAG_EMBEDDING_BASE_URL", "EMBEDDING_BASE_URL"),
    )
    embedding_api_key: str = Field(
        default="",
        validation_alias=AliasChoices("RAG_EMBEDDING_API_KEY", "EMBEDDING_API_KEY"),
    )
    embedding_model: str = Field(
        default="",
        validation_alias=AliasChoices("RAG_EMBEDDING_MODEL", "EMBEDDING_MODEL"),
    )
    # The service ships a deterministic 256-dim hash embedder. The storage
    # column is vector(1024), so vectors are zero-padded before insert.
    embedding_dim: int = Field(
        default=256,
        validation_alias=AliasChoices("RAG_EMBEDDING_DIM", "EMBEDDING_DIM"),
    )
    embedding_batch: int = Field(
        default=32,
        validation_alias=AliasChoices("RAG_EMBEDDING_BATCH", "EMBEDDING_BATCH"),
    )
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

    @field_validator("llm_request_timeout", mode="before")
    @classmethod
    def _validate_timeout(cls, value: object) -> float:
        return parse_duration_seconds(value)


@lru_cache
def get_settings() -> Settings:
    return Settings()
