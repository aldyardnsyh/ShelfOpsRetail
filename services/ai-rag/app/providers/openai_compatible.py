"""Slot for a real OpenAI-compatible provider (not implemented in E3 skeleton).

Intentionally empty except for the contract. When a provider is configured
(``RAG_LLM_PROVIDER=openai_compatible`` / ``RAG_EMBEDDING_PROVIDER=openai_compatible``)
the factory raises ``ProviderError`` until this module is implemented, so the
service never silently falls back to replay output and labels it as real.
"""

from __future__ import annotations

from collections.abc import Iterator, Sequence

from app.providers.base import EmbeddingProvider, LLMProvider, ProviderError

_NOT_IMPLEMENTED = (
    "openai_compatible provider is not implemented yet; "
    "set RAG_LLM_PROVIDER=replay and RAG_EMBEDDING_PROVIDER=hash for dev/CI"
)


class OpenAICompatibleLLM(LLMProvider):
    name = "openai_compatible"
    model = "unconfigured"
    replay = False

    def __init__(self, *, base_url: str, api_key: str, model: str) -> None:
        raise ProviderError(_NOT_IMPLEMENTED)

    def stream(
        self,
        prompt: str,
        *,
        language: str = "id",
        max_tokens: int = 512,
    ) -> Iterator[str]:
        raise ProviderError(_NOT_IMPLEMENTED)


class OpenAICompatibleEmbedder(EmbeddingProvider):
    name = "openai_compatible"

    def __init__(self, *, base_url: str, api_key: str, model: str, dim: int) -> None:
        raise ProviderError(_NOT_IMPLEMENTED)

    @property
    def dim(self) -> int:
        raise ProviderError(_NOT_IMPLEMENTED)

    def embed(self, texts: Sequence[str]) -> list[list[float]]:
        raise ProviderError(_NOT_IMPLEMENTED)
