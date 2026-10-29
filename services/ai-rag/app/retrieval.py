"""Hybrid retrieval: pgvector + lexical, Reciprocal Rank Fusion, small MMR."""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass, field

from app.config import Settings
from app.providers.base import EmbeddingProvider
from app.store import ChunkStore, StoreError, StoreHit


@dataclass(frozen=True)
class RetrievedChunk:
    chunk_id: str
    document_id: str
    document_title: str
    page: int | None
    heading_path: str
    content: str
    score: float
    rank_vector: int
    rank_lexical: int
    embedding: list[float] = field(default_factory=list, repr=False)


class HybridRetriever:
    def __init__(self, store: ChunkStore, embedder: EmbeddingProvider, settings: Settings):
        self._store = store
        self._embedder = embedder
        self._settings = settings

    def search(
        self,
        *,
        workspace_id: str,
        query: str,
        top_k: int | None = None,
        filters: dict[str, str] | None = None,
    ) -> list[RetrievedChunk]:
        if not query.strip():
            return []
        settings = self._settings
        final_k = top_k or settings.top_n_final
        if final_k <= 0:
            return []

        query_vector = self._embedder.embed_one(query)
        vector_hits, vector_error = self._safe_vector_search(
            workspace_id=workspace_id,
            query_vector=query_vector,
            limit=settings.top_k_vector,
            filters=filters,
        )
        lexical_hits, lexical_error = self._safe_lexical_search(
            workspace_id=workspace_id,
            query=query,
            limit=settings.top_k_lexical,
            filters=filters,
        )
        if vector_error is not None and lexical_error is not None:
            raise StoreError(f"retrieval unavailable: {vector_error}; {lexical_error}")
        fused = fuse_rrf(
            vector_hits,
            lexical_hits,
            k=settings.rrf_k,
            pool_size=max(settings.top_k_vector, settings.top_k_lexical, final_k),
        )
        selected = mmr(
            fused,
            limit=final_k,
            lambda_mult=settings.mmr_lambda,
        )
        return [
            RetrievedChunk(
                chunk_id=entry.hit.chunk_id,
                document_id=entry.hit.document_id,
                document_title=entry.hit.document_title,
                page=entry.hit.page,
                heading_path=entry.hit.heading_path,
                content=entry.hit.content,
                score=entry.score,
                rank_vector=entry.rank_vector,
                rank_lexical=entry.rank_lexical,
                embedding=entry.hit.embedding,
            )
            for entry in selected
        ]

    def _safe_vector_search(
        self,
        *,
        workspace_id: str,
        query_vector: Sequence[float],
        limit: int,
        filters: dict[str, str] | None,
    ) -> tuple[list[StoreHit], str | None]:
        try:
            return (
                self._store.vector_search(
                    workspace_id=workspace_id,
                    query_vector=query_vector,
                    limit=limit,
                    filters=filters,
                ),
                None,
            )
        except StoreError as exc:
            return [], str(exc)

    def _safe_lexical_search(
        self,
        *,
        workspace_id: str,
        query: str,
        limit: int,
        filters: dict[str, str] | None,
    ) -> tuple[list[StoreHit], str | None]:
        try:
            return (
                self._store.lexical_search(
                    workspace_id=workspace_id,
                    query=query,
                    limit=limit,
                    filters=filters,
                ),
                None,
            )
        except StoreError as exc:
            return [], str(exc)


@dataclass
class _Fused:
    hit: StoreHit
    score: float = 0.0
    rank_vector: int = 0
    rank_lexical: int = 0
    order: int = 0


def fuse_rrf(
    vector_hits: Sequence[StoreHit],
    lexical_hits: Sequence[StoreHit],
    *,
    k: int = 60,
    pool_size: int | None = None,
) -> list[_Fused]:
    """Reciprocal Rank Fusion, scores normalised to (0, 1] for consumers."""
    if k <= 0:
        raise ValueError("rrf k must be positive")

    fused: dict[str, _Fused] = {}
    for rank, hit in enumerate(vector_hits, start=1):
        entry = fused.get(hit.chunk_id)
        if entry is None:
            entry = fused[hit.chunk_id] = _Fused(hit=hit, order=len(fused))
        entry.score += 1.0 / (k + rank)
        entry.rank_vector = rank

    for rank, hit in enumerate(lexical_hits, start=1):
        entry = fused.get(hit.chunk_id)
        if entry is None:
            entry = fused[hit.chunk_id] = _Fused(hit=hit, order=len(fused))
        entry.score += 1.0 / (k + rank)
        entry.rank_lexical = rank
        if not entry.hit.embedding and hit.embedding:
            entry.hit = StoreHit(
                chunk_id=entry.hit.chunk_id,
                document_id=entry.hit.document_id,
                document_title=entry.hit.document_title,
                page=entry.hit.page,
                heading_path=entry.hit.heading_path,
                content=entry.hit.content,
                score=entry.hit.score,
                embedding=hit.embedding,
            )

    ranked = sorted(fused.values(), key=lambda item: (-item.score, item.order))
    if pool_size is not None:
        ranked = ranked[:pool_size]
    if not ranked:
        return []

    best = ranked[0].score
    if best > 0:
        for entry in ranked:
            entry.score = entry.score / best
    return ranked


def mmr(
    candidates: Sequence[_Fused],
    *,
    limit: int,
    lambda_mult: float = 0.7,
) -> list[_Fused]:
    """Small maximal-marginal-relevance pass over fused candidates."""
    if limit <= 0 or not candidates:
        return []
    if len(candidates) <= limit:
        return list(candidates)

    relevance = [max(0.0, entry.score) for entry in candidates]
    max_relevance = max(relevance) or 1.0
    remaining = list(range(len(candidates)))
    selected: list[int] = []

    while remaining and len(selected) < limit:
        best_index = remaining[0]
        best_value = -math.inf
        for index in remaining:
            if selected:
                redundancy = max(
                    _cosine(candidates[index].hit.embedding, candidates[other].hit.embedding)
                    for other in selected
                )
            else:
                redundancy = 0.0
            value = (
                lambda_mult * (relevance[index] / max_relevance) - (1.0 - lambda_mult) * redundancy
            )
            if value > best_value:
                best_value = value
                best_index = index
        selected.append(best_index)
        remaining.remove(best_index)

    return [candidates[index] for index in selected]


def _cosine(left: Sequence[float], right: Sequence[float]) -> float:
    if not left or not right:
        return 0.0
    size = min(len(left), len(right))
    dot = sum(left[i] * right[i] for i in range(size))
    left_norm = math.sqrt(sum(value * value for value in left[:size]))
    right_norm = math.sqrt(sum(value * value for value in right[:size]))
    if left_norm == 0.0 or right_norm == 0.0:
        return 0.0
    return max(-1.0, min(1.0, dot / (left_norm * right_norm)))
