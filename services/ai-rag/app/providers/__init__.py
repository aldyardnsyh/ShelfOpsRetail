"""Provider selection helpers."""

from __future__ import annotations

from app.config import Settings
from app.providers.base import EmbeddingProvider, LLMProvider, ProviderError
from app.providers.hash_embedder import HashEmbedder
from app.providers.replay import ReplayLLM

__all__ = [
    "EmbeddingProvider",
    "LLMProvider",
    "ProviderError",
    "build_embedding_provider",
    "build_llm_provider",
]


def build_llm_provider(settings: Settings) -> LLMProvider:
    provider = settings.llm_provider.lower()
    if provider == "replay":
        return ReplayLLM()
    if provider == "openai_compatible":
        raise ProviderError("openai_compatible LLM is not configured; set RAG_LLM_PROVIDER=replay")
    raise ProviderError(f"unknown LLM provider: {settings.llm_provider}")


def build_embedding_provider(settings: Settings) -> EmbeddingProvider:
    provider = settings.embedding_provider.lower()
    if provider == "hash":
        return HashEmbedder(dim=settings.embedding_dim)
    if provider == "openai_compatible":
        raise ProviderError(
            "openai_compatible embedding is not configured; set RAG_EMBEDDING_PROVIDER=hash"
        )
    raise ProviderError(f"unknown embedding provider: {settings.embedding_provider}")
