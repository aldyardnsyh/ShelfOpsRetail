"""Postgres/pgvector access for chunks.

Schema source of truth: ``services/gateway/migrations/000001_init.up.sql``.
The table is ``chunks`` (the request mentioned ``kb_chunks``; the migration
uses ``chunks``) with ``embedding vector(1024)``. Provider vectors can be
smaller, so ``format_vector`` zero-pads them; cosine similarity is unchanged.
"""

from __future__ import annotations

import math
import threading
import time
from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Any, cast

import psycopg
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool, PoolTimeout

from app.chunking import Chunk

ALLOWED_FILTERS = frozenset({"document_id", "language", "mime"})


class StoreError(RuntimeError):
    """Database failure with a transport-safe message."""


@dataclass(frozen=True)
class StoreHit:
    chunk_id: str
    document_id: str
    document_title: str
    page: int | None
    heading_path: str
    content: str
    score: float
    embedding: list[float] = field(default_factory=list, repr=False)


class ChunkStore:
    """Thread-safe sync pool; gRPC handlers run on worker threads."""

    def __init__(
        self,
        dsn: str,
        *,
        table: str = "chunks",
        vector_dim: int = 1024,
        min_size: int = 1,
        max_size: int = 5,
        connect_timeout: float = 2.0,
    ) -> None:
        self._dsn = dsn
        self._table = table
        self._vector_dim = vector_dim
        self._min_size = min_size
        self._max_size = max_size
        self._connect_timeout = connect_timeout
        self._pool: ConnectionPool | None = None
        self._lock = threading.Lock()
        self._unaccent: bool | None = None
        self._available_at = 0.0
        self._available_value = False

    @property
    def vector_dim(self) -> int:
        return self._vector_dim

    def open(self) -> None:
        with self._lock:
            if self._pool is not None:
                return
            pool = ConnectionPool(
                self._dsn,
                min_size=self._min_size,
                max_size=self._max_size,
                open=False,
                kwargs={
                    "autocommit": True,
                    "row_factory": dict_row,
                    "connect_timeout": int(max(1, self._connect_timeout)),
                },
            )
            pool.open()
            self._pool = pool

    def close(self) -> None:
        with self._lock:
            if self._pool is not None:
                self._pool.close()
                self._pool = None

    def ping(self) -> bool:
        try:
            self.open()
            assert self._pool is not None
            with self._pool.connection(timeout=self._connect_timeout) as conn:
                conn.execute("SELECT 1")
            return True
        except (PoolTimeout, psycopg.Error, OSError):
            return False

    def available(self, ttl: float = 5.0) -> bool:
        """Ping with a short cache so health checks stay cheap."""
        now = time.monotonic()
        if now - self._available_at < ttl:
            return self._available_value
        value = self.ping()
        self._available_at = time.monotonic()
        self._available_value = value
        return value

    def replace_document_chunks(
        self,
        *,
        workspace_id: str,
        document_id: str,
        version: int,
        language: str,
        chunks: Sequence[Chunk],
        embeddings: Sequence[Sequence[float]],
    ) -> int:
        if len(chunks) != len(embeddings):
            raise StoreError("chunks and embeddings length mismatch")
        if not chunks:
            return 0

        self.open()
        assert self._pool is not None
        rows = [
            (
                workspace_id,
                document_id,
                version,
                chunk.ordinal,
                chunk.content,
                chunk.heading_path,
                chunk.page,
                chunk.token_count,
                language,
                format_vector(embedding, self._vector_dim),
            )
            for chunk, embedding in zip(chunks, embeddings)
        ]
        try:
            with self._pool.connection(timeout=self._connect_timeout) as conn, conn.transaction():
                conn.execute(
                    f"DELETE FROM {self._table} WHERE document_id = %s AND version = %s",
                    (document_id, version),
                )
                with conn.cursor() as cur:
                    cur.executemany(
                        f"""
                            INSERT INTO {self._table} (
                              workspace_id, document_id, version, ordinal, content,
                              heading_path, page, token_count, lang, embedding
                            ) VALUES (
                              %s, %s, %s, %s, %s, %s, %s, %s, %s::regconfig, %s::vector
                            )
                            """,
                        rows,
                    )
            return len(rows)
        except psycopg.Error as exc:
            raise StoreError(f"failed to store chunks: {_safe_pg_message(exc)}") from exc

    def vector_search(
        self,
        *,
        workspace_id: str,
        query_vector: Sequence[float],
        limit: int,
        filters: dict[str, str] | None = None,
    ) -> list[StoreHit]:
        if limit <= 0:
            return []
        where, params = _build_filters(filters)
        sql = f"""
            SELECT c.id::text AS chunk_id,
                   c.document_id::text AS document_id,
                   d.title AS document_title,
                   c.page,
                   c.heading_path,
                   c.content,
                   1 - (c.embedding <=> %(qvec)s::vector) AS score,
                   c.embedding::text AS embedding_text
            FROM {self._table} c
            JOIN documents d ON d.id = c.document_id
            WHERE c.workspace_id = %(workspace_id)s::uuid
              AND d.deleted_at IS NULL
              AND d.status = 'ready'
              AND c.embedding IS NOT NULL
              {where}
            ORDER BY c.embedding <=> %(qvec)s::vector
            LIMIT %(limit)s
        """
        params.update(
            {
                "workspace_id": workspace_id,
                "qvec": format_vector(query_vector, self._vector_dim),
                "limit": limit,
            }
        )
        return self._fetch(sql, params)

    def lexical_search(
        self,
        *,
        workspace_id: str,
        query: str,
        limit: int,
        filters: dict[str, str] | None = None,
    ) -> list[StoreHit]:
        if limit <= 0 or not query.strip():
            return []
        where, params = _build_filters(filters)
        params.update({"workspace_id": workspace_id, "query": query, "limit": limit})

        attempts = (
            "websearch_to_tsquery(c.lang, %(qterm)s)",
            "plainto_tsquery(c.lang, %(qterm)s)",
        )
        last_error: psycopg.Error | None = None
        for tsquery in attempts:
            qterm = "unaccent(%(query)s)" if self._has_unaccent() else "%(query)s"
            sql = f"""
                SELECT c.id::text AS chunk_id,
                       c.document_id::text AS document_id,
                       d.title AS document_title,
                       c.page,
                       c.heading_path,
                       c.content,
                       ts_rank_cd(c.tsv, {tsquery}) AS score,
                       c.embedding::text AS embedding_text
                FROM {self._table} c
                JOIN documents d ON d.id = c.document_id
                WHERE c.workspace_id = %(workspace_id)s::uuid
                  AND d.deleted_at IS NULL
                  AND d.status = 'ready'
                  {where}
                  AND c.tsv @@ {tsquery}
                ORDER BY score DESC
                LIMIT %(limit)s
            """
            try:
                return self._fetch(sql, params, extra={"qterm": qterm})
            except psycopg.Error as exc:
                last_error = exc
                continue
        raise StoreError(f"lexical search failed: {_safe_pg_message(last_error)}")

    def _has_unaccent(self) -> bool:
        if self._unaccent is not None:
            return self._unaccent
        try:
            self.open()
            assert self._pool is not None
            with self._pool.connection(timeout=self._connect_timeout) as conn:
                row = conn.execute(
                    "SELECT 1 AS present FROM pg_extension WHERE extname = 'unaccent'"
                ).fetchone()
            self._unaccent = row is not None
        except (psycopg.Error, OSError, PoolTimeout):
            self._unaccent = False
        return self._unaccent

    def _fetch(
        self,
        sql: str,
        params: dict[str, Any],
        *,
        extra: dict[str, Any] | None = None,
    ) -> list[StoreHit]:
        if extra:
            params = {**params, **extra}
        try:
            self.open()
            assert self._pool is not None
            with self._pool.connection(timeout=self._connect_timeout) as conn:
                rows = cast(list[dict[str, Any]], conn.execute(sql, params).fetchall())
        except (psycopg.Error, PoolTimeout, OSError) as exc:
            raise StoreError(f"query failed: {_safe_pg_message(exc)}") from exc
        return [_row_to_hit(row) for row in rows]


def _build_filters(filters: dict[str, str] | None) -> tuple[str, dict[str, Any]]:
    if not filters:
        return "", {}
    clauses: list[str] = []
    params: dict[str, Any] = {}
    for key, value in filters.items():
        if key not in ALLOWED_FILTERS:
            raise StoreError(f"unsupported filter: {key}")
        if not value:
            continue
        column = {
            "document_id": "c.document_id",
            "language": "d.language",
            "mime": "d.mime",
        }[key]
        cast = "::uuid" if key == "document_id" else ""
        name = f"filter_{key}"
        clauses.append(f"AND {column} = %({name})s{cast}")
        params[name] = value
    return "\n              ".join(clauses), params


def _row_to_hit(row: dict[str, Any]) -> StoreHit:
    page = row.get("page")
    return StoreHit(
        chunk_id=str(row["chunk_id"]),
        document_id=str(row["document_id"]),
        document_title=str(row.get("document_title") or ""),
        page=int(page) if page is not None else None,
        heading_path=str(row.get("heading_path") or ""),
        content=str(row.get("content") or ""),
        score=float(row.get("score") or 0.0),
        embedding=parse_vector(row.get("embedding_text") or ""),
    )


def format_vector(values: Sequence[float], dim: int) -> str:
    """Format a pgvector literal, zero-padding/truncating to the column dim."""
    if dim <= 0:
        raise StoreError("vector_dim must be positive")
    cleaned = [float(value) for value in values]
    if len(cleaned) > dim:
        cleaned = cleaned[:dim]
    if any(not math.isfinite(value) for value in cleaned):
        raise StoreError("embedding contains non-finite values")
    if len(cleaned) < dim:
        cleaned.extend([0.0] * (dim - len(cleaned)))
    return "[" + ",".join(f"{value:.7g}" for value in cleaned) + "]"


def parse_vector(text: str) -> list[float]:
    body = text.strip().strip("[]")
    if not body:
        return []
    try:
        return [float(part) for part in body.split(",") if part.strip()]
    except ValueError:
        return []


def _safe_pg_message(exc: Exception | None) -> str:
    if exc is None:
        return "unknown database error"
    message = str(exc).strip().splitlines()
    return message[0] if message else exc.__class__.__name__
