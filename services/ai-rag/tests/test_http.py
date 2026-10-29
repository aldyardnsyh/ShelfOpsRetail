from __future__ import annotations

from fastapi.testclient import TestClient

from app.api_http import create_app
from app.config import Settings
from app.providers.hash_embedder import HashEmbedder
from app.providers.replay import ReplayLLM
from app.retrieval import RetrievedChunk
from app.store import StoreError


class FakeStore:
    def __init__(self, available: bool = False, error: StoreError | None = None) -> None:
        self.available = available
        self.error = error

    def ping(self) -> bool:
        return self.available

    def close(self) -> None:
        return None


class FakeRetriever:
    def __init__(self, hits: list[RetrievedChunk] | None = None, error: StoreError | None = None):
        self.hits = hits or []
        self.error = error

    def search(self, **_: object) -> list[RetrievedChunk]:
        if self.error:
            raise self.error
        return list(self.hits)


def _client(retriever: FakeRetriever, store: FakeStore | None = None) -> TestClient:
    settings = Settings(embedding_dim=16)
    app = create_app(
        settings,
        store=store or FakeStore(),
        retriever=retriever,  # type: ignore[arg-type]
        llm=ReplayLLM(),
        embedder=HashEmbedder(dim=16),
    )
    return TestClient(app)


def test_healthz_is_liveness_only():
    response = _client(FakeRetriever()).get("/healthz")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_readyz_reports_database_down():
    response = _client(FakeRetriever(), FakeStore(available=False)).get("/readyz")
    assert response.status_code == 503
    assert response.json()["database"] == "down"


def test_readyz_reports_database_up():
    response = _client(FakeRetriever(), FakeStore(available=True)).get("/readyz")
    assert response.status_code == 200
    assert response.json()["database"] == "up"


def test_debug_search_returns_hits():
    hit = RetrievedChunk(
        chunk_id="c1",
        document_id="d1",
        document_title="Kebijakan",
        page=1,
        heading_path="Stok",
        content="Stok minimum lima unit.",
        score=0.75,
        rank_vector=1,
        rank_lexical=2,
    )
    response = _client(FakeRetriever([hit])).post(
        "/debug/search",
        json={"workspace_id": "ws-1", "query": "stok minimum"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["empty"] is False
    assert body["hits"][0]["chunk_id"] == "c1"
    assert body["hits"][0]["score"] == 0.75


def test_debug_search_maps_store_errors_to_503():
    response = _client(FakeRetriever(error=StoreError("db exploded"))).post(
        "/debug/search",
        json={"workspace_id": "ws-1", "query": "stok"},
    )
    assert response.status_code == 503
    assert "db exploded" in response.json()["detail"]
