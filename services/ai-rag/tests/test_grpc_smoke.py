from __future__ import annotations

import grpc
from shelfops.v1 import rag_pb2, rag_pb2_grpc

from app.config import Settings
from app.providers.hash_embedder import HashEmbedder
from app.providers.replay import ReplayLLM
from app.retrieval import RetrievedChunk
from app.service_grpc import RagServicer, create_grpc_server


class FakeRetriever:
    def __init__(self, hits: list[RetrievedChunk]) -> None:
        self.hits = hits

    def search(self, **_: object) -> list[RetrievedChunk]:
        return list(self.hits)


def _settings() -> Settings:
    return Settings(
        database_url="postgresql://invalid:invalid@127.0.0.1:1/none",
        embedding_dim=32,
        top_n_final=2,
    )


def _hit() -> RetrievedChunk:
    return RetrievedChunk(
        chunk_id="11111111-1111-7111-8111-111111111111",
        document_id="22222222-2222-7222-8222-222222222222",
        document_title="Kebijakan Stok",
        page=2,
        heading_path="Operasional > Stok",
        content="Stok minimum untuk produk sembako adalah lima unit per SKU.",
        score=1.0,
        rank_vector=1,
        rank_lexical=1,
    )


def test_grpc_health_over_real_server():
    settings = _settings()
    llm = ReplayLLM()
    embedder = HashEmbedder(dim=settings.embedding_dim)
    servicer = RagServicer(settings, llm, embedder, FakeRetriever([]), None)

    server = grpc.server(__import__("concurrent").futures.ThreadPoolExecutor(max_workers=2))
    rag_pb2_grpc.add_RagServiceServicer_to_server(servicer, server)
    port = server.add_insecure_port("127.0.0.1:0")
    server.start()
    try:
        with grpc.insecure_channel(f"127.0.0.1:{port}") as channel:
            stub = rag_pb2_grpc.RagServiceStub(channel)
            response = stub.Health(rag_pb2.RagServiceHealthRequest(), timeout=5)
    finally:
        server.stop(0).wait(timeout=5)

    assert response.ready is True
    assert response.version == settings.version
    assert response.llm_provider == "replay"
    assert response.embedding_provider == "hash"
    assert response.embedding_dim == settings.embedding_dim
    assert response.degradation == "L1"


def test_create_grpc_server_binds_ephemeral_port():
    settings = _settings()
    server, port = create_grpc_server(
        settings,
        ReplayLLM(),
        HashEmbedder(dim=settings.embedding_dim),
        FakeRetriever([]),
        None,
        host="127.0.0.1",
        port=0,
    )
    assert port > 0
    server.stop(0)


def test_chat_streams_citations_tokens_and_done():
    settings = _settings()
    servicer = RagServicer(
        settings,
        ReplayLLM(),
        HashEmbedder(dim=settings.embedding_dim),
        FakeRetriever([_hit()]),
        None,
    )
    request = rag_pb2.ChatRequest(
        request_id="req-1",
        workspace_id="33333333-3333-7333-8333-333333333333",
        message="Berapa stok minimum sembako?",
        top_n_final=2,
    )

    events = list(servicer.Chat(request, None))
    types = [event.type for event in events]

    assert types[0] == rag_pb2.ChatResponse.TYPE_STEP
    assert rag_pb2.ChatResponse.TYPE_CITATION in types
    assert rag_pb2.ChatResponse.TYPE_TOKEN in types
    assert types[-1] == rag_pb2.ChatResponse.TYPE_DONE

    citation = next(
        event.citation for event in events if event.type == rag_pb2.ChatResponse.TYPE_CITATION
    )
    assert citation.ordinal == 1
    assert citation.document_title == "Kebijakan Stok"

    answer = "".join(
        event.text for event in events if event.type == rag_pb2.ChatResponse.TYPE_TOKEN
    )
    assert "[S1]" in answer
    assert events[-1].replay is True
    assert events[-1].refused is False


def test_chat_refuses_without_hits():
    settings = _settings()
    servicer = RagServicer(
        settings,
        ReplayLLM(),
        HashEmbedder(dim=settings.embedding_dim),
        FakeRetriever([]),
        None,
    )
    request = rag_pb2.ChatRequest(
        request_id="req-2",
        workspace_id="33333333-3333-7333-8333-333333333333",
        message="Berapa stok minimum?",
    )

    events = list(servicer.Chat(request, None))
    assert events[-1].type == rag_pb2.ChatResponse.TYPE_DONE
    assert events[-1].refused is True
    assert any(event.type == rag_pb2.ChatResponse.TYPE_TOKEN for event in events)


def test_search_rejects_missing_workspace():
    settings = _settings()
    servicer = RagServicer(
        settings,
        ReplayLLM(),
        HashEmbedder(dim=settings.embedding_dim),
        FakeRetriever([_hit()]),
        None,
    )
    response = servicer.Search(rag_pb2.SearchRequest(query="stok"), None)
    assert response.empty is True
    assert "workspace_id" in response.error
