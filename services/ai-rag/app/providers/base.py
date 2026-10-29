"""Provider interfaces. Implementations must be deterministic in dev mode."""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Iterator, Sequence


class ProviderError(RuntimeError):
    """Raised when a provider is unavailable or misconfigured."""


class LLMProvider(ABC):
    """Text generation provider.

    Streaming is the primary interface: the gRPC ``Chat`` method forwards each
    yielded string as a ``TYPE_TOKEN`` event.
    """

    name: str = "unknown"
    model: str = "unknown"
    replay: bool = False

    @abstractmethod
    def stream(
        self,
        prompt: str,
        *,
        language: str = "id",
        max_tokens: int = 512,
    ) -> Iterator[str]:
        """Yield answer fragments in order."""

    def complete(
        self,
        prompt: str,
        *,
        language: str = "id",
        max_tokens: int = 512,
    ) -> str:
        return "".join(self.stream(prompt, language=language, max_tokens=max_tokens))


class EmbeddingProvider(ABC):
    """Embedding provider returning one L2-normalised vector per input."""

    name: str = "unknown"

    @property
    @abstractmethod
    def dim(self) -> int:
        """Vector dimension produced by this provider."""

    @abstractmethod
    def embed(self, texts: Sequence[str]) -> list[list[float]]:
        """Embed a batch of texts."""

    def embed_one(self, text: str) -> list[float]:
        return self.embed([text])[0]
