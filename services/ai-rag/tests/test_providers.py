from __future__ import annotations

import math

import pytest

from app.config import Settings
from app.providers import build_embedding_provider, build_llm_provider
from app.providers.base import ProviderError
from app.providers.hash_embedder import HashEmbedder
from app.providers.replay import ReplayLLM, refusal_message

PROMPT = """## Sources
[S1] Kebijakan Stok | Operasional | page 2
Stok minimum untuk produk sembako adalah lima unit per SKU. Reorder dilakukan setiap Senin.

## Question
Berapa stok minimum sembako?
"""


def test_hash_embedder_is_deterministic_and_normalised():
    embedder = HashEmbedder(dim=256)
    first = embedder.embed_one("stok minimum lima unit")
    second = embedder.embed_one("stok minimum lima unit")
    other = embedder.embed_one("harga promo diskon")

    assert first == second
    assert len(first) == 256
    assert math.isclose(math.sqrt(sum(value**2 for value in first)), 1.0, rel_tol=1e-9)
    assert first != other


def test_hash_embedder_batch_matches_single():
    embedder = HashEmbedder(dim=64)
    texts = ["stok minimum", "harga promo", ""]
    batch = embedder.embed(texts)
    assert batch == [embedder.embed_one(text) for text in texts]
    assert batch[2] == [0.0] * 64


def test_hash_embedder_rejects_bad_dim():
    with pytest.raises(ValueError):
        HashEmbedder(dim=0)


def test_replay_llm_answers_with_citation():
    llm = ReplayLLM()
    first = llm.complete(PROMPT, language="id")
    second = llm.complete(PROMPT, language="id")

    assert first == second
    assert "[S1]" in first
    assert "lima unit" in first
    assert llm.replay is True


def test_replay_llm_refuses_without_sources():
    llm = ReplayLLM()
    answer = llm.complete("## Sources\n\n## Question\nBerapa stok?\n", language="id")
    assert answer == refusal_message("id")


def test_replay_llm_refuses_when_context_has_no_overlap():
    llm = ReplayLLM()
    prompt = "## Sources\n[S1] Dokumen\nPromo akhir tahun untuk kategori elektronik.\n\n## Question\nBerapa stok sembako?\n"
    assert llm.complete(prompt, language="id") == refusal_message("id")


def test_replay_stream_respects_max_tokens():
    llm = ReplayLLM()
    pieces = list(llm.stream(PROMPT, language="id", max_tokens=5))
    assert len(pieces) == 5
    assert "".join(pieces).strip()


def test_factories_select_deterministic_dev_providers():
    settings = Settings(llm_provider="replay", embedding_provider="hash", embedding_dim=32)
    assert build_llm_provider(settings).name == "replay"
    assert build_embedding_provider(settings).dim == 32


def test_factory_rejects_unimplemented_provider():
    with pytest.raises(ProviderError):
        build_llm_provider(Settings(llm_provider="openai_compatible"))
    with pytest.raises(ProviderError):
        build_embedding_provider(Settings(embedding_provider="openai_compatible"))
