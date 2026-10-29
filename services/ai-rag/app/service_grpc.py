"""gRPC implementation of ``shelfops.v1.RagService``."""

from __future__ import annotations

import logging
import time
from collections.abc import Iterator, Sequence
from concurrent import futures
from pathlib import Path
from uuid import uuid4

import grpc
from shelfops.v1 import rag_pb2, rag_pb2_grpc

from app.chunking import chunk_document, count_tokens
from app.config import Settings
from app.parsing import ParseError, parse_document
from app.providers.base import EmbeddingProvider, LLMProvider, ProviderError
from app.providers.replay import refusal_message
from app.retrieval import HybridRetriever, RetrievedChunk
from app.store import ChunkStore, StoreError

logger = logging.getLogger(__name__)

_INGEST_STATE = rag_pb2.IngestResponse
_CHAT_TYPE = rag_pb2.ChatResponse

_LANGUAGE_BY_CODE = {"id": "indonesian", "en": "english"}
_MAX_HISTORY_TURNS = 6


class RagServicer(rag_pb2_grpc.RagServiceServicer):
    def __init__(
        self,
        settings: Settings,
        llm: LLMProvider,
        embedder: EmbeddingProvider,
        retriever: HybridRetriever,
        store: ChunkStore | None = None,
    ) -> None:
        self._settings = settings
        self._llm = llm
        self._embedder = embedder
        self._retriever = retriever
        self._store = store

    # -- Health ------------------------------------------------------------
    def Health(self, request, context) -> rag_pb2.RagServiceHealthResponse:
        degradation = "L0" if self._store is not None and self._store.available() else "L1"
        return rag_pb2.RagServiceHealthResponse(
            ready=True,
            version=self._settings.version,
            llm_provider=self._llm.name,
            embedding_provider=self._embedder.name,
            embedding_dim=self._embedder.dim,
            degradation=degradation,
        )

    # -- Search ------------------------------------------------------------
    def Search(self, request, context) -> rag_pb2.SearchResponse:
        started = time.perf_counter()
        request_id = request.request_id or uuid4().hex
        if not request.workspace_id:
            return rag_pb2.SearchResponse(
                empty=True, error="workspace_id is required", latency_ms=_elapsed_ms(started)
            )
        if not request.query.strip():
            return rag_pb2.SearchResponse(
                empty=True, error="query is required", latency_ms=_elapsed_ms(started)
            )

        try:
            hits = self._retriever.search(
                workspace_id=request.workspace_id,
                query=request.query,
                top_k=request.top_k or self._settings.top_n_final,
                filters=dict(request.filters),
            )
        except (StoreError, ProviderError) as exc:
            logger.warning(
                "search_failed",
                extra={"request_id": request_id, "error": str(exc)},
            )
            return rag_pb2.SearchResponse(
                empty=True, error=str(exc), latency_ms=_elapsed_ms(started)
            )

        response = rag_pb2.SearchResponse(
            hits=[_search_hit(hit) for hit in hits],
            latency_ms=_elapsed_ms(started),
            empty=not hits,
        )
        logger.info(
            "search_done",
            extra={
                "request_id": request_id,
                "workspace_id": request.workspace_id,
                "hits": len(hits),
                "latency_ms": response.latency_ms,
            },
        )
        return response

    # -- Ingest ------------------------------------------------------------
    def Ingest(self, request, context) -> Iterator[rag_pb2.IngestResponse]:
        request_id = request.request_id or uuid4().hex
        yield self._event(
            _INGEST_STATE.STATE_PARSING,
            message="reading object",
            request_id=request_id,
        )
        try:
            if not request.workspace_id or not request.document_id:
                raise ValueError("workspace_id and document_id are required")

            data = self._load_object(request.object_key)
            parsed = parse_document(
                data,
                request.mime,
                filename=Path(request.object_key.replace("\\", "/")).name,
            )
            yield self._event(
                _INGEST_STATE.STATE_PARSING,
                progress=0.1,
                message=f"parsed {parsed.page_count or 1} page(s)",
                request_id=request_id,
            )

            language = request.language if request.language in _LANGUAGE_BY_CODE else "id"
            chunk_size = request.chunk_size or self._settings.chunk_size
            overlap = request.chunk_overlap or self._settings.chunk_overlap
            chunks = chunk_document(parsed.blocks, chunk_size=chunk_size, overlap=overlap)
            if not chunks:
                raise ValueError("document produced no chunks")

            total = len(chunks)
            yield self._event(
                _INGEST_STATE.STATE_CHUNKING,
                progress=0.25,
                chunks_total=total,
                message=f"created {total} chunk(s)",
                request_id=request_id,
            )

            embeddings: list[list[float]] = []
            batch_size = max(1, int(getattr(self._embedder, "batch_size", 16)))
            for start in range(0, total, batch_size):
                batch = chunks[start : start + batch_size]
                embeddings.extend(self._embedder.embed([chunk.content for chunk in batch]))
                done = min(start + batch_size, total)
                yield self._event(
                    _INGEST_STATE.STATE_EMBEDDING,
                    progress=0.25 + 0.65 * (done / total),
                    chunks_done=done,
                    chunks_total=total,
                    message=f"embedded {done}/{total}",
                    request_id=request_id,
                )

            if self._store is None:
                raise StoreError("database is not configured")
            stored = self._store.replace_document_chunks(
                workspace_id=request.workspace_id,
                document_id=request.document_id,
                version=request.version or 1,
                language=_LANGUAGE_BY_CODE[language],
                chunks=chunks,
                embeddings=embeddings,
            )
            yield self._event(
                _INGEST_STATE.STATE_READY,
                progress=1.0,
                chunks_done=stored,
                chunks_total=total,
                message="ready",
                request_id=request_id,
            )
            logger.info(
                "ingest_done",
                extra={
                    "request_id": request_id,
                    "workspace_id": request.workspace_id,
                    "document_id": request.document_id,
                    "chunks": stored,
                },
            )
        except (ParseError, StoreError, ProviderError, OSError, ValueError) as exc:
            logger.warning(
                "ingest_failed",
                extra={"request_id": request_id, "error": str(exc)},
            )
            yield self._event(
                _INGEST_STATE.STATE_FAILED,
                progress=1.0,
                error=str(exc),
                message="failed",
                request_id=request_id,
            )

    # -- Chat --------------------------------------------------------------
    def Chat(self, request, context) -> Iterator[rag_pb2.ChatResponse]:
        started = time.perf_counter()
        request_id = request.request_id or uuid4().hex
        filters = dict(request.filters)
        language = filters.get("language", "id")
        if language not in _LANGUAGE_BY_CODE:
            language = "id"

        try:
            if not request.workspace_id or not request.message.strip():
                raise ValueError("workspace_id and message are required")

            hits = self._retriever.search(
                workspace_id=request.workspace_id,
                query=request.message,
                top_k=request.top_n_final or self._settings.top_n_final,
                filters=filters,
            )
            yield self._chat_event(
                _CHAT_TYPE.TYPE_STEP,
                request_id=request_id,
                step=1,
                text=f"retrieved {len(hits)} chunk(s)",
            )

            threshold = request.refuse_threshold or self._settings.refuse_threshold
            if not hits or (threshold > 0 and hits[0].score < threshold):
                answer = refusal_message(language)
                yield self._chat_event(
                    _CHAT_TYPE.TYPE_TOKEN,
                    request_id=request_id,
                    text=answer,
                )
                yield self._chat_event(
                    _CHAT_TYPE.TYPE_DONE,
                    request_id=request_id,
                    refused=True,
                    replay=self._llm.replay,
                    provider=self._llm.name,
                    model=self._llm.model,
                    tokens_out=count_tokens(answer),
                    latency_ms=_elapsed_ms(started),
                )
                return

            for ordinal, hit in enumerate(hits, start=1):
                yield self._chat_event(
                    _CHAT_TYPE.TYPE_CITATION,
                    request_id=request_id,
                    citation=_citation(ordinal, hit),
                )

            prompt = build_prompt(hits, request.message, request.history)
            system = self._system_prompt(language)
            full_prompt = f"{system}\n\n{prompt}"
            tokens_in = count_tokens(full_prompt)
            answer_parts: list[str] = []
            for piece in self._llm.stream(
                full_prompt,
                language=language,
                max_tokens=self._settings.max_answer_tokens,
            ):
                answer_parts.append(piece)
                yield self._chat_event(
                    _CHAT_TYPE.TYPE_TOKEN,
                    request_id=request_id,
                    text=piece,
                )

            answer = "".join(answer_parts)
            yield self._chat_event(
                _CHAT_TYPE.TYPE_DONE,
                request_id=request_id,
                tokens_in=tokens_in,
                tokens_out=count_tokens(answer),
                replay=self._llm.replay,
                provider=self._llm.name,
                model=self._llm.model,
                latency_ms=_elapsed_ms(started),
            )
            logger.info(
                "chat_done",
                extra={
                    "request_id": request_id,
                    "workspace_id": request.workspace_id,
                    "citations": len(hits),
                    "refused": False,
                    "latency_ms": _elapsed_ms(started),
                },
            )
        except (StoreError, ProviderError, ValueError) as exc:
            logger.warning(
                "chat_failed",
                extra={"request_id": request_id, "error": str(exc)},
            )
            yield self._chat_event(
                _CHAT_TYPE.TYPE_ERROR,
                request_id=request_id,
                error=str(exc),
                replay=self._llm.replay,
                provider=self._llm.name,
                model=self._llm.model,
                latency_ms=_elapsed_ms(started),
            )

    # -- helpers -----------------------------------------------------------
    def _load_object(self, object_key: str) -> bytes:
        key = (object_key or "").strip()
        if not key:
            raise ValueError("object_key is required")
        root = Path(self._settings.object_store_root).resolve()
        candidate = (root / key.replace("\\", "/")).resolve()
        try:
            candidate.relative_to(root)
        except ValueError as exc:
            raise ValueError("object_key escapes the object store root") from exc
        if not candidate.is_file():
            raise FileNotFoundError(f"object not found: {key}")
        size = candidate.stat().st_size
        if size > self._settings.max_document_bytes:
            raise ValueError(f"object exceeds {self._settings.max_document_bytes} bytes")
        return candidate.read_bytes()

    def _system_prompt(self, language: str) -> str:
        path = self._settings.prompt_dir / f"answer_{language}.md"
        return path.read_text(encoding="utf-8").strip()

    @staticmethod
    def _event(
        state: int,
        *,
        request_id: str,
        progress: float = 0.0,
        chunks_done: int = 0,
        chunks_total: int = 0,
        message: str = "",
        error: str = "",
    ) -> rag_pb2.IngestResponse:
        logger.debug(
            "ingest_event",
            extra={
                "request_id": request_id,
                "state": state,
                "progress": progress,
                "chunks_done": chunks_done,
                "chunks_total": chunks_total,
            },
        )
        return rag_pb2.IngestResponse(
            state=state,
            progress=progress,
            chunks_done=chunks_done,
            chunks_total=chunks_total,
            message=message,
            error=error,
        )

    @staticmethod
    def _chat_event(
        event_type: int,
        *,
        request_id: str,
        **fields,
    ) -> rag_pb2.ChatResponse:
        return rag_pb2.ChatResponse(type=event_type, request_id=request_id, **fields)


def build_prompt(
    hits: Sequence[RetrievedChunk],
    question: str,
    history: Sequence = (),
) -> str:
    lines: list[str] = []
    turns = list(history)[-_MAX_HISTORY_TURNS:]
    if turns:
        lines.append("## Conversation")
        for turn in turns:
            content = (turn.content or "").strip()
            if content:
                lines.append(f"{turn.role}: {content}")
        lines.append("")

    lines.append("## Sources")
    for ordinal, hit in enumerate(hits, start=1):
        location = " | ".join(
            part
            for part in (
                hit.document_title,
                hit.heading_path,
                f"page {hit.page}" if hit.page else "",
            )
            if part
        )
        lines.append(f"[S{ordinal}] {location}")
        lines.append(hit.content.strip())
        lines.append("")

    lines.append("## Question")
    lines.append(question.strip())
    return "\n".join(lines)


def _search_hit(hit: RetrievedChunk) -> rag_pb2.SearchHit:
    return rag_pb2.SearchHit(
        chunk_id=hit.chunk_id,
        document_id=hit.document_id,
        document_title=hit.document_title,
        page=hit.page or 0,
        heading_path=hit.heading_path,
        score=float(hit.score),
        content=hit.content,
        rank_vector=hit.rank_vector,
        rank_lexical=hit.rank_lexical,
    )


def _citation(ordinal: int, hit: RetrievedChunk) -> rag_pb2.Citation:
    return rag_pb2.Citation(
        ordinal=ordinal,
        chunk_id=hit.chunk_id,
        document_id=hit.document_id,
        document_title=hit.document_title,
        page=hit.page or 0,
        heading_path=hit.heading_path,
        score=float(hit.score),
        snippet=hit.content[:280],
    )


def _elapsed_ms(started: float) -> int:
    return max(0, round((time.perf_counter() - started) * 1000))


def create_grpc_server(
    settings: Settings,
    llm: LLMProvider,
    embedder: EmbeddingProvider,
    retriever: HybridRetriever,
    store: ChunkStore | None = None,
    *,
    host: str | None = None,
    port: int | None = None,
) -> tuple[grpc.Server, int]:
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=settings.grpc_workers))
    rag_pb2_grpc.add_RagServiceServicer_to_server(
        RagServicer(settings, llm, embedder, retriever, store), server
    )
    bound_port = server.add_insecure_port(
        f"{host or settings.grpc_host}:{port if port is not None else settings.grpc_port}"
    )
    if bound_port == 0:
        raise RuntimeError("failed to bind gRPC port")
    return server, bound_port
