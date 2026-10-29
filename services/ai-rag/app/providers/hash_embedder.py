"""Deterministic 256-dim embedding from token hashing (no network)."""

from __future__ import annotations

import hashlib
import math
import re
from collections.abc import Sequence
from itertools import pairwise

from app.providers.base import EmbeddingProvider

TOKEN_RE = re.compile(r"[0-9a-z\u00c0-\u024f]+", re.IGNORECASE)

# Kept tiny on purpose: the replay embedder only needs to make lexical
# neighbours rank above unrelated text. Semantic quality comes from the real
# provider later (ADR-007).
_STOPWORDS = frozenset(
    {
        "dan",
        "atau",
        "yang",
        "untuk",
        "dari",
        "dengan",
        "pada",
        "adalah",
        "ini",
        "itu",
        "the",
        "and",
        "or",
        "for",
        "with",
        "from",
        "this",
        "that",
    }
)


class HashEmbedder(EmbeddingProvider):
    """Signed hashing trick over unigrams and bigrams.

    The same text always yields the same vector, independent of process,
    Python hash randomisation, or network availability.
    """

    name = "hash"

    def __init__(self, dim: int = 256) -> None:
        if dim <= 0:
            raise ValueError("dim must be positive")
        self._dim = dim

    @property
    def dim(self) -> int:
        return self._dim

    def embed(self, texts: Sequence[str]) -> list[list[float]]:
        return [self._embed_one(text) for text in texts]

    def _embed_one(self, text: str) -> list[float]:
        tokens = [
            token.lower() for token in TOKEN_RE.findall(text) if token.lower() not in _STOPWORDS
        ]
        vector = [0.0] * self._dim
        if not tokens:
            return vector

        for token in tokens:
            self._add(vector, token, 1.0)
        for left, right in pairwise(tokens):
            self._add(vector, f"{left} {right}", 0.5)

        norm = math.sqrt(sum(value * value for value in vector))
        if norm == 0.0:
            return vector
        return [value / norm for value in vector]

    def _add(self, vector: list[float], feature: str, weight: float) -> None:
        digest = hashlib.blake2b(feature.encode("utf-8"), digest_size=16).digest()
        index = int.from_bytes(digest[:8], "big") % self._dim
        sign = 1.0 if digest[8] & 1 else -1.0
        vector[index] += sign * weight
