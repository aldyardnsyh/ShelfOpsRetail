"""Provider selection helpers.

Aturan: mode ``openai-compatible`` harus punya kredensial lengkap; bila tidak,
fakta ini harus muncul sebagai ``ProviderError`` (error jujur), bukan diam-diam
memakai provider tiruan.
"""

from __future__ import annotations

from app.config import Settings
from app.providers.base import EmbeddingProvider, LLMProvider, ProviderError
from app.providers.hash_embedder import HashEmbedder
from app.providers.openai_compatible import (
    ChatEndpoint,
    DailyBudget,
    normalize_provider,
)
from app.providers.openai_compatible import OpenAICompatibleEmbedder
from app.providers.openai_compatible import OpenAICompatibleLLM
from app.providers.replay import ReplayLLM

__all__ = [
    "EmbeddingProvider",
    "LLMProvider",
    "ProviderError",
    "build_embedding_provider",
    "build_llm_provider",
]

_OPENAI = "openai-compatible"


def build_llm_provider(settings: Settings) -> LLMProvider:
    provider = normalize_provider(settings.llm_provider)
    if provider == "replay":
        return ReplayLLM()
    if provider == _OPENAI:
        return _build_openai_llm(settings)
    raise ProviderError(
        f"LLM provider tidak dikenal: {settings.llm_provider!r} "
        f"(replay|{_OPENAI})"
    )


def build_embedding_provider(settings: Settings) -> EmbeddingProvider:
    provider = normalize_provider(settings.embedding_provider)
    if provider == "hash":
        return HashEmbedder(dim=settings.embedding_dim)
    if provider == _OPENAI:
        return _build_openai_embedder(settings)
    raise ProviderError(
        f"embedding provider tidak dikenal: {settings.embedding_provider!r} (hash|{_OPENAI})"
    )


def _build_openai_llm(settings: Settings) -> LLMProvider:
    missing = _missing(
        {
            "LLM_PRIMARY_BASE_URL": settings.llm_primary_base_url,
            "LLM_PRIMARY_API_KEY": settings.llm_primary_api_key,
            "LLM_PRIMARY_MODEL": settings.llm_primary_model,
        }
    )
    if missing:
        raise ProviderError(
            "LLM provider openai-compatible butuh env berikut: " + ", ".join(missing)
        )

    primary = ChatEndpoint(
        base_url=settings.llm_primary_base_url,
        api_key=settings.llm_primary_api_key,
        model=settings.llm_primary_model,
        timeout=settings.llm_request_timeout,
    )

    fallback: ChatEndpoint | None = None
    fallback_values = {
        "LLM_FALLBACK_BASE_URL": settings.llm_fallback_base_url,
        "LLM_FALLBACK_API_KEY": settings.llm_fallback_api_key,
        "LLM_FALLBACK_MODEL": settings.llm_fallback_model,
    }
    if any(value.strip() for value in fallback_values.values()):
        missing_fallback = _missing(fallback_values)
        if missing_fallback:
            raise ProviderError(
                "fallback LLM tidak lengkap, isi semua env berikut atau kosongkan semuanya: "
                + ", ".join(missing_fallback)
            )
        fallback = ChatEndpoint(
            base_url=settings.llm_fallback_base_url,
            api_key=settings.llm_fallback_api_key,
            model=settings.llm_fallback_model,
            timeout=settings.llm_request_timeout,
        )

    budget = DailyBudget(
        settings.llm_daily_budget_usd,
        price_in=settings.llm_input_price_per_mtok or None,
        price_out=settings.llm_output_price_per_mtok or None,
    )
    return OpenAICompatibleLLM(primary=primary, fallback=fallback, budget=budget)


def _build_openai_embedder(settings: Settings) -> EmbeddingProvider:
    missing = _missing(
        {
            "EMBEDDING_BASE_URL": settings.embedding_base_url,
            "EMBEDDING_API_KEY": settings.embedding_api_key,
            "EMBEDDING_MODEL": settings.embedding_model,
        }
    )
    if missing:
        raise ProviderError(
            "embedding provider openai-compatible butuh env berikut: " + ", ".join(missing)
        )
    return OpenAICompatibleEmbedder(
        base_url=settings.embedding_base_url,
        api_key=settings.embedding_api_key,
        model=settings.embedding_model,
        dim=settings.embedding_dim,
        batch=settings.embedding_batch,
        timeout=settings.llm_request_timeout,
    )


def _missing(values: dict[str, str]) -> list[str]:
    return [name for name, value in values.items() if not value.strip()]
