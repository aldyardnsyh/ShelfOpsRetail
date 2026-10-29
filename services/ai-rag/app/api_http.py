"""FastAPI HTTP surface: health probes and debug search."""

from __future__ import annotations

import logging

from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.config import Settings, get_settings
from app.providers import build_embedding_provider, build_llm_provider
from app.providers.base import EmbeddingProvider, LLMProvider
from app.retrieval import HybridRetriever
from app.store import ChunkStore, StoreError

logger = logging.getLogger(__name__)


class SearchBody(BaseModel):
    workspace_id: str = Field(min_length=1)
    query: str = Field(min_length=1)
    top_k: int = Field(default=0, ge=0, le=50)
    filters: dict[str, str] = Field(default_factory=dict)


def create_app(
    settings: Settings | None = None,
    *,
    store: ChunkStore | None = None,
    retriever: HybridRetriever | None = None,
    llm: LLMProvider | None = None,
    embedder: EmbeddingProvider | None = None,
) -> FastAPI:
    settings = settings or get_settings()
    embedder = embedder or build_embedding_provider(settings)
    llm = llm or build_llm_provider(settings)
    store = store or ChunkStore(
        settings.database_url,
        table=settings.chunks_table,
        vector_dim=settings.vector_dim,
        min_size=settings.db_pool_min,
        max_size=settings.db_pool_max,
        connect_timeout=settings.db_connect_timeout,
    )
    retriever = retriever or HybridRetriever(store, embedder, settings)

    app = FastAPI(
        title="ShelfOps ai-rag",
        version=settings.version,
        docs_url="/docs",
        openapi_url="/openapi.json",
    )
    app.state.settings = settings
    app.state.store = store
    app.state.retriever = retriever
    app.state.llm = llm
    app.state.embedder = embedder

    @app.get("/healthz")
    def healthz() -> dict[str, str]:
        return {
            "status": "ok",
            "service": settings.service_name,
            "version": settings.version,
        }

    @app.get("/readyz")
    def readyz():
        ready = store.ping()
        body = {
            "status": "ready" if ready else "degraded",
            "database": "up" if ready else "down",
            "llm_provider": llm.name,
            "embedding_provider": embedder.name,
            "embedding_dim": embedder.dim,
            "version": settings.version,
        }
        return JSONResponse(status_code=200 if ready else 503, content=body)

    @app.post("/debug/search")
    def debug_search(body: SearchBody) -> dict[str, object]:
        try:
            hits = retriever.search(
                workspace_id=body.workspace_id,
                query=body.query,
                top_k=body.top_k or settings.top_n_final,
                filters=body.filters,
            )
        except StoreError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        except Exception as exc:  # provider failures should surface as 503, not 500
            logger.warning("debug_search_failed", extra={"error": str(exc)})
            raise HTTPException(status_code=503, detail=str(exc)) from exc

        return {
            "query": body.query,
            "hits": [
                {
                    "chunk_id": hit.chunk_id,
                    "document_id": hit.document_id,
                    "document_title": hit.document_title,
                    "page": hit.page,
                    "heading_path": hit.heading_path,
                    "score": round(hit.score, 6),
                    "rank_vector": hit.rank_vector,
                    "rank_lexical": hit.rank_lexical,
                    "content": hit.content,
                }
                for hit in hits
            ],
            "empty": not hits,
        }

    return app
