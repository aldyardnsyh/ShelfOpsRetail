from __future__ import annotations

from uuid import uuid4

import psycopg
import pytest
from shelfops.v1 import rag_pb2

from app.config import Settings
from app.providers.hash_embedder import HashEmbedder
from app.providers.replay import ReplayLLM
from app.retrieval import HybridRetriever
from app.service_grpc import RagServicer
from app.store import ChunkStore

DSN = "postgresql://shelfops:shelfops_dev_password@localhost:55433/shelfops"


def _database_available() -> bool:
    try:
        with psycopg.connect(DSN, connect_timeout=2) as conn:
            conn.execute("SELECT 1 FROM chunks LIMIT 1")
        return True
    except psycopg.Error:
        return False


pytestmark = pytest.mark.skipif(not _database_available(), reason="dev Postgres unavailable")


def test_ingest_chunk_store_search_and_chat(tmp_path, settings: Settings):
    settings = settings.model_copy(update={"object_store_root": str(tmp_path)})
    (tmp_path / "kebijakan.md").write_text(
        "# Operasional\n"
        "Stok minimum untuk produk sembako adalah lima unit per SKU.\n\n"
        "## Harga\n"
        "Harga promo berlaku tujuh hari dan wajib dipasang di rak.\n",
        encoding="utf-8",
    )

    workspace_id = str(uuid4())
    document_id = str(uuid4())
    store = ChunkStore(
        settings.database_url,
        vector_dim=settings.vector_dim,
        connect_timeout=settings.db_connect_timeout,
    )
    try:
        with psycopg.connect(settings.database_url, autocommit=True) as conn:
            conn.execute(
                "INSERT INTO workspaces (id, name) VALUES (%s, %s)",
                (workspace_id, f"ingest-{workspace_id[:8]}"),
            )
            conn.execute(
                """
                INSERT INTO documents (id, workspace_id, title, mime, language, status)
                VALUES (%s, %s, 'Kebijakan Toko', 'text/markdown', 'id', 'ready')
                """,
                (document_id, workspace_id),
            )

        embedder = HashEmbedder(dim=settings.embedding_dim)
        llm = ReplayLLM()
        retriever = HybridRetriever(store, embedder, settings)
        servicer = RagServicer(settings, llm, embedder, retriever, store)

        request = rag_pb2.IngestRequest(
            request_id="ingest-1",
            workspace_id=workspace_id,
            document_id=document_id,
            version=1,
            object_key="kebijakan.md",
            mime="text/markdown",
            language="id",
        )
        events = list(servicer.Ingest(request, None))
        assert events[-1].state == rag_pb2.IngestResponse.STATE_READY
        assert events[-1].chunks_total >= 2

        search = servicer.Search(
            rag_pb2.SearchRequest(
                request_id="search-1",
                workspace_id=workspace_id,
                query="stok minimum sembako",
                top_k=3,
            ),
            None,
        )
        assert search.empty is False
        assert search.hits[0].document_title == "Kebijakan Toko"
        assert "lima unit" in search.hits[0].content
        assert search.hits[0].rank_vector >= 1

        chat_events = list(
            servicer.Chat(
                rag_pb2.ChatRequest(
                    request_id="chat-1",
                    workspace_id=workspace_id,
                    message="Berapa stok minimum sembako?",
                ),
                None,
            )
        )
        tokens = "".join(
            event.text for event in chat_events if event.type == rag_pb2.ChatResponse.TYPE_TOKEN
        )
        assert "[S1]" in tokens
        assert chat_events[-1].type == rag_pb2.ChatResponse.TYPE_DONE
        assert chat_events[-1].replay is True

        with psycopg.connect(settings.database_url) as conn:
            count = conn.execute(
                "SELECT count(*) FROM chunks WHERE document_id = %s",
                (document_id,),
            ).fetchone()[0]
        assert count == events[-1].chunks_total
    finally:
        with psycopg.connect(settings.database_url, autocommit=True) as conn:
            conn.execute("DELETE FROM workspaces WHERE id = %s", (workspace_id,))
        store.close()
