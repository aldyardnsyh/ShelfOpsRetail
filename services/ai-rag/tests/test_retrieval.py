from __future__ import annotations

from uuid import uuid4

import psycopg
import pytest
from psycopg.rows import dict_row

from app.chunking import chunk_document
from app.config import Settings
from app.parsing import TextBlock
from app.providers.hash_embedder import HashEmbedder
from app.retrieval import HybridRetriever, fuse_rrf, mmr
from app.store import ChunkStore, StoreError, StoreHit, format_vector

DSN = "postgresql://shelfops:shelfops_dev_password@localhost:55433/shelfops"


def _database_available() -> bool:
    try:
        with psycopg.connect(DSN, connect_timeout=2) as conn:
            conn.execute("SELECT 1 FROM chunks LIMIT 1")
        return True
    except psycopg.Error:
        return False


pytestmark = pytest.mark.integration


def test_format_vector_zero_pads_to_column_dim():
    literal = format_vector([0.5, -0.25], 4)
    assert literal == "[0.5,-0.25,0,0]"
    with pytest.raises(StoreError):
        format_vector([float("nan")], 4)


def test_rrf_prefers_documents_hit_by_both_lists():
    vector = [_hit("a", 0.9), _hit("b", 0.8)]
    lexical = [_hit("b", 0.7), _hit("c", 0.6)]
    fused = fuse_rrf(vector, lexical, k=60)

    assert fused[0].hit.chunk_id == "b"
    assert fused[0].rank_vector == 2
    assert fused[0].rank_lexical == 1
    assert fused[0].score == pytest.approx(1.0)


def test_mmr_keeps_relevance_order_without_embeddings():
    fused = fuse_rrf([_hit("a", 0.9), _hit("b", 0.8), _hit("c", 0.7)], [], k=60)
    selected = mmr(fused, limit=2, lambda_mult=0.7)
    assert [entry.hit.chunk_id for entry in selected] == ["a", "b"]


@pytest.mark.skipif(not _database_available(), reason="dev Postgres unavailable")
def test_hybrid_search_against_dev_database(settings: Settings):
    store = ChunkStore(
        settings.database_url,
        vector_dim=settings.vector_dim,
        connect_timeout=settings.db_connect_timeout,
    )
    workspace_id = str(uuid4())
    document_id = str(uuid4())
    other_document_id = str(uuid4())

    try:
        _seed(settings, workspace_id, document_id, other_document_id, store)
        retriever = HybridRetriever(store, HashEmbedder(dim=settings.embedding_dim), settings)
        hits = retriever.search(workspace_id=workspace_id, query="stok minimum sembako")

        assert hits
        assert hits[0].document_id == document_id
        assert "lima unit" in hits[0].content
        assert hits[0].rank_vector >= 1
        assert hits[0].score > 0

        filtered = retriever.search(
            workspace_id=workspace_id,
            query="stok minimum sembako",
            filters={"document_id": other_document_id},
        )
        assert [hit.document_id for hit in filtered] == [other_document_id]
    finally:
        with psycopg.connect(settings.database_url, autocommit=True) as conn:
            conn.execute("DELETE FROM workspaces WHERE id = %s", (workspace_id,))
        store.close()


def _seed(
    settings: Settings,
    workspace_id: str,
    document_id: str,
    other_document_id: str,
    store: ChunkStore,
) -> None:
    with psycopg.connect(settings.database_url, autocommit=True, row_factory=dict_row) as conn:
        conn.execute(
            "INSERT INTO workspaces (id, name) VALUES (%s, %s)",
            (workspace_id, f"test-{workspace_id[:8]}"),
        )
        for doc_id, title in ((document_id, "Kebijakan Stok"), (other_document_id, "Promo")):
            conn.execute(
                """
                INSERT INTO documents (id, workspace_id, title, mime, language, status)
                VALUES (%s, %s, %s, 'text/markdown', 'id', 'ready')
                """,
                (doc_id, workspace_id, title),
            )

    stock_text = (
        "Stok minimum untuk produk sembako adalah lima unit per SKU. "
        "Reorder dilakukan setiap hari Senin oleh supervisor toko."
    )
    promo_text = "Promo akhir tahun hanya berlaku untuk kategori elektronik dan bukan sembako."
    embedder = HashEmbedder(dim=settings.embedding_dim)

    for doc_id, text in ((document_id, stock_text), (other_document_id, promo_text)):
        chunks = chunk_document([TextBlock(text=text, heading_path="Kebijakan")])
        store.replace_document_chunks(
            workspace_id=workspace_id,
            document_id=doc_id,
            version=1,
            language="indonesian",
            chunks=chunks,
            embeddings=embedder.embed([chunk.content for chunk in chunks]),
        )


def _hit(chunk_id: str, score: float) -> StoreHit:
    return StoreHit(
        chunk_id=chunk_id,
        document_id=f"doc-{chunk_id}",
        document_title="Doc",
        page=None,
        heading_path="",
        content=f"content {chunk_id}",
        score=score,
        embedding=[1.0, 0.0] if chunk_id else [],
    )
