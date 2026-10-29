"""Test jalur provider nyata (openai-compatible) + error jujur saat env kurang."""

from __future__ import annotations

import pytest

from app.config import Settings, parse_duration_seconds
from app.providers import build_embedding_provider, build_llm_provider
from app.http_client import HttpError
from app.providers.base import ProviderError
from app.providers.openai_compatible import (
    ChatEndpoint,
    DailyBudget,
    normalize_provider,
)

PRIMARY = {
    "llm_provider": "openai-compatible",
    "llm_primary_base_url": "https://llm.example.com/v1",
    "llm_primary_api_key": "test-key",
    "llm_primary_model": "gpt-4o-mini",
}


# ---------------------------------------------------------------------------
# Pemilihan provider dari env
# ---------------------------------------------------------------------------


def test_provider_mode_is_selected_from_env():
    settings = Settings(llm_provider="replay", embedding_provider="hash", embedding_dim=32)
    assert build_llm_provider(settings).name == "replay"
    assert build_embedding_provider(settings).dim == 32


def test_provider_mode_accepts_underscore_and_hyphen_spelling():
    assert normalize_provider("openai_compatible") == "openai-compatible"
    settings = Settings(
        llm_provider="openai_compatible",
        embedding_provider="openai_compatible",
        llm_primary_base_url="https://llm.example.com/v1",
        llm_primary_api_key="k",
        llm_primary_model="m",
        embedding_base_url="https://embed.example.com/v1",
        embedding_api_key="k",
        embedding_model="m",
        embedding_dim=8,
    )
    assert build_llm_provider(settings).name == "openai-compatible"
    assert build_embedding_provider(settings).name == "openai-compatible"


def test_public_env_names_are_accepted(monkeypatch):
    """Nama env di .env.example (tanpa prefix RAG_) harus berlaku."""
    monkeypatch.setenv("LLM_PROVIDER", "openai-compatible")
    monkeypatch.setenv("LLM_PRIMARY_BASE_URL", "https://llm.example.com/v1")
    monkeypatch.setenv("LLM_PRIMARY_API_KEY", "test-key")
    monkeypatch.setenv("LLM_PRIMARY_MODEL", "gpt-4o-mini")
    monkeypatch.setenv("EMBEDDING_PROVIDER", "openai-compatible")
    monkeypatch.setenv("EMBEDDING_BASE_URL", "https://embed.example.com/v1")
    monkeypatch.setenv("EMBEDDING_API_KEY", "test-key")
    monkeypatch.setenv("EMBEDDING_MODEL", "text-embedding-3-small")
    monkeypatch.setenv("EMBEDDING_DIM", "12")

    settings = Settings()
    assert settings.llm_provider == "openai-compatible"
    assert settings.llm_primary_base_url == "https://llm.example.com/v1"
    assert settings.embedding_dim == 12
    assert build_llm_provider(settings).name == "openai-compatible"


def test_timeout_accepts_duration_strings():
    assert parse_duration_seconds("45s") == pytest.approx(45.0)
    assert parse_duration_seconds("500ms") == pytest.approx(0.5)
    assert parse_duration_seconds("2m") == pytest.approx(120.0)
    assert parse_duration_seconds(30) == pytest.approx(30.0)
    settings = Settings(llm_request_timeout="90s")
    assert settings.llm_request_timeout == pytest.approx(90.0)


# ---------------------------------------------------------------------------
# Error jujur saat kredensial kurang
# ---------------------------------------------------------------------------


def test_llm_provider_without_credentials_fails_honestly():
    settings = Settings(llm_provider="openai-compatible")
    with pytest.raises(ProviderError) as excinfo:
        build_llm_provider(settings)
    message = str(excinfo.value)
    assert "LLM_PRIMARY_BASE_URL" in message
    assert "LLM_PRIMARY_API_KEY" in message
    assert "LLM_PRIMARY_MODEL" in message


def test_embedding_provider_without_credentials_fails_honestly():
    settings = Settings(embedding_provider="openai-compatible")
    with pytest.raises(ProviderError) as excinfo:
        build_embedding_provider(settings)
    message = str(excinfo.value)
    assert "EMBEDDING_BASE_URL" in message
    assert "EMBEDDING_API_KEY" in message
    assert "EMBEDDING_MODEL" in message


def test_partial_fallback_config_is_rejected():
    settings = Settings(
        **PRIMARY,
        llm_fallback_base_url="https://fallback.example.com/v1",
    )
    with pytest.raises(ProviderError) as excinfo:
        build_llm_provider(settings)
    message = str(excinfo.value)
    assert "LLM_FALLBACK_API_KEY" in message
    assert "LLM_FALLBACK_MODEL" in message


def test_unknown_provider_is_rejected():
    with pytest.raises(ProviderError):
        build_llm_provider(Settings(llm_provider="magic"))
    with pytest.raises(ProviderError):
        build_embedding_provider(Settings(embedding_provider="magic"))


# ---------------------------------------------------------------------------
# LLM: chat completions, fallback, budget
# ---------------------------------------------------------------------------


class _FakeTransport:
    """Mengganti post_json dan mencatat pemanggilan."""

    def __init__(self, responses):
        self.responses = responses
        self.calls: list[tuple[str, dict]] = []

    def __call__(self, url, payload, *, headers=None, timeout=30.0):
        self.calls.append((url, dict(payload)))
        result = self.responses.pop(0)
        if isinstance(result, Exception):
            raise result
        return result


def _failure(message: str) -> Exception:
    """Kegagalan jaringan dalam bentuk HttpError (seperti post_json asli)."""
    return HttpError(message)


def _chat_response(content: str, tokens_in: int = 100, tokens_out: int = 50) -> dict:
    return {
        "choices": [{"message": {"role": "assistant", "content": content}}],
        "usage": {"prompt_tokens": tokens_in, "completion_tokens": tokens_out},
    }


def test_llm_calls_chat_completions(monkeypatch):
    from app.providers import openai_compatible as module

    transport = _FakeTransport([_chat_response("halo")])
    monkeypatch.setattr(module, "post_json", transport)

    provider = build_llm_provider(Settings(**PRIMARY))
    assert provider.complete("apa kabar?", language="id") == "halo"
    assert len(transport.calls) == 1
    url, payload = transport.calls[0]
    assert url == "https://llm.example.com/v1/chat/completions"
    assert payload["model"] == "gpt-4o-mini"
    assert payload["messages"][0]["content"] == "apa kabar?"


def test_llm_stream_yields_pieces(monkeypatch):
    from app.providers import openai_compatible as module

    transport = _FakeTransport([_chat_response("x" * 150)])
    monkeypatch.setattr(module, "post_json", transport)

    provider = build_llm_provider(Settings(**PRIMARY))
    pieces = list(provider.stream("prompt", language="id", max_tokens=512))
    assert len(pieces) >= 2
    assert "".join(pieces) == "x" * 150


def test_llm_uses_fallback_when_primary_fails(monkeypatch):
    from app.providers import openai_compatible as module

    transport = _FakeTransport(
        [
            HttpError("primary down"),
            _chat_response("dari fallback"),
        ]
    )
    monkeypatch.setattr(module, "post_json", transport)

    settings = Settings(
        **PRIMARY,
        llm_fallback_base_url="https://fallback.example.com/v1",
        llm_fallback_api_key="fallback-key",
        llm_fallback_model="fallback-model",
    )
    provider = build_llm_provider(settings)
    assert provider.complete("prompt", language="id") == "dari fallback"
    assert transport.calls[0][0].startswith("https://llm.example.com")
    assert transport.calls[1][0].startswith("https://fallback.example.com")


def test_llm_without_fallback_reports_primary_error(monkeypatch):
    from app.providers import openai_compatible as module

    transport = _FakeTransport([HttpError("primary down")])
    monkeypatch.setattr(module, "post_json", transport)

    provider = build_llm_provider(Settings(**PRIMARY))
    with pytest.raises(ProviderError) as excinfo:
        provider.complete("prompt", language="id")
    assert "primary down" in str(excinfo.value)


def test_llm_both_endpoints_fail_reports_both(monkeypatch):
    from app.providers import openai_compatible as module

    transport = _FakeTransport([HttpError("primary down"), HttpError("fallback down")])
    monkeypatch.setattr(module, "post_json", transport)

    settings = Settings(
        **PRIMARY,
        llm_fallback_base_url="https://fallback.example.com/v1",
        llm_fallback_api_key="fallback-key",
        llm_fallback_model="fallback-model",
    )
    provider = build_llm_provider(settings)
    with pytest.raises(ProviderError) as excinfo:
        provider.complete("prompt", language="id")
    message = str(excinfo.value)
    assert "primary down" in message
    assert "fallback down" in message


def test_daily_budget_blocks_after_limit(monkeypatch):
    from app.providers import openai_compatible as module

    transport = _FakeTransport([_chat_response("ok", 1_000_000, 0)])
    monkeypatch.setattr(module, "post_json", transport)

    settings = Settings(**PRIMARY, llm_daily_budget_usd=0.01)
    provider = build_llm_provider(settings)
    provider.complete("prompt", language="id")

    with pytest.raises(ProviderError) as excinfo:
        provider.complete("prompt", language="id")
    assert "budget" in str(excinfo.value).lower()


def test_daily_budget_zero_means_unlimited():
    budget = DailyBudget(0.0)
    budget.record(10_000_000, 10_000_000, "gpt-4o-mini")
    budget.ensure_available()


def test_daily_budget_uses_custom_price():
    budget = DailyBudget(1.0, price_in=1.0, price_out=2.0)
    cost = budget.record(1_000_000, 1_000_000, "apa-saja")
    assert cost == pytest.approx(3.0)
    assert budget.spent_usd == pytest.approx(3.0)


# ---------------------------------------------------------------------------
# Embedding: batching, dimensi, normalisasi
# ---------------------------------------------------------------------------


def _embedding_response(vectors: list[list[float]]) -> dict:
    return {
        "data": [
            {"index": index, "embedding": vector} for index, vector in enumerate(vectors)
        ],
        "model": "text-embedding-3-small",
    }


def test_embedding_batches_requests(monkeypatch):
    from app.providers import openai_compatible as module

    transport = _FakeTransport(
        [
            _embedding_response([[1.0, 0.0], [0.0, 1.0]]),
            _embedding_response([[0.0, 1.0]]),
        ]
    )
    monkeypatch.setattr(module, "post_json", transport)

    settings = Settings(
        embedding_provider="openai-compatible",
        embedding_base_url="https://embed.example.com/v1",
        embedding_api_key="k",
        embedding_model="text-embedding-3-small",
        embedding_dim=2,
        embedding_batch=2,
    )
    embedder = build_embedding_provider(settings)
    vectors = embedder.embed(["a", "b", "c"])

    assert len(vectors) == 3
    assert len(transport.calls) == 2
    assert transport.calls[0][1]["input"] == ["a", "b"]
    assert transport.calls[1][1]["input"] == ["c"]


def test_embedding_vectors_are_normalised_and_resized(monkeypatch):
    from app.providers import openai_compatible as module

    transport = _FakeTransport([_embedding_response([[3.0, 4.0, 5.0]])])
    monkeypatch.setattr(module, "post_json", transport)

    settings = Settings(
        embedding_provider="openai-compatible",
        embedding_base_url="https://embed.example.com/v1",
        embedding_api_key="k",
        embedding_model="text-embedding-3-small",
        embedding_dim=2,
        embedding_batch=8,
    )
    embedder = build_embedding_provider(settings)
    vector = embedder.embed_one("teks")

    assert len(vector) == 2
    assert vector == pytest.approx([0.6, 0.8])


def test_embedding_missing_data_is_honest_error(monkeypatch):
    from app.providers import openai_compatible as module

    transport = _FakeTransport([{"data": []}])
    monkeypatch.setattr(module, "post_json", transport)

    settings = Settings(
        embedding_provider="openai-compatible",
        embedding_base_url="https://embed.example.com/v1",
        embedding_api_key="k",
        embedding_model="text-embedding-3-small",
        embedding_dim=2,
    )
    embedder = build_embedding_provider(settings)
    with pytest.raises(ProviderError):
        embedder.embed(["a"])


def test_chat_endpoint_rejects_incomplete_response():
    endpoint = ChatEndpoint(
        base_url="https://llm.example.com/v1",
        api_key="k",
        model="m",
    )
    with pytest.raises(ProviderError):
        endpoint.complete("x")
