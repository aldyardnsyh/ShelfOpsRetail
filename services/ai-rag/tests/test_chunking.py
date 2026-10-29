from __future__ import annotations

import pytest

from app.chunking import ChunkingError, chunk_document, count_tokens
from app.parsing import TextBlock


def _words(count: int, prefix: str = "w") -> str:
    return " ".join(f"{prefix}{index}" for index in range(count))


def test_default_window_is_800_with_120_overlap():
    blocks = [TextBlock(text=_words(2000))]
    chunks = chunk_document(blocks)

    assert [chunk.ordinal for chunk in chunks] == list(range(len(chunks)))
    assert chunks[0].token_count == 800
    assert chunks[0].content.startswith("w0 ")
    assert chunks[0].content.endswith("w799")
    assert chunks[1].content.startswith("w680 ")
    assert chunks[1].token_count == 800
    assert chunks[-1].content.endswith("w1999")
    assert all(chunk.token_count <= 800 for chunk in chunks)


def test_short_text_is_a_single_chunk():
    blocks = [TextBlock(text="Stok minimum lima unit.", heading_path="Operasional")]
    chunks = chunk_document(blocks)
    assert len(chunks) == 1
    assert chunks[0].content == "Stok minimum lima unit."
    assert chunks[0].heading_path == "Operasional"
    assert chunks[0].token_count == 4


def test_heading_aware_chunks_do_not_mix_sections():
    blocks = [
        TextBlock(text=_words(900, "a"), heading_path="Kebijakan > Stok"),
        TextBlock(text=_words(900, "b"), heading_path="Kebijakan > Harga"),
    ]
    chunks = chunk_document(blocks, chunk_size=800, overlap=120)

    stock_chunks = [chunk for chunk in chunks if chunk.heading_path == "Kebijakan > Stok"]
    price_chunks = [chunk for chunk in chunks if chunk.heading_path == "Kebijakan > Harga"]
    assert stock_chunks and price_chunks
    assert all(chunk.content.startswith("a") for chunk in stock_chunks)
    assert all(chunk.content.startswith("b") for chunk in price_chunks)
    assert stock_chunks[0].ordinal < price_chunks[0].ordinal


def test_page_metadata_is_preserved():
    blocks = [TextBlock(text=_words(10), page=7)]
    chunks = chunk_document(blocks)
    assert chunks[0].page == 7


def test_invalid_overlap_rejected():
    with pytest.raises(ChunkingError):
        chunk_document([TextBlock(text="a b c")], chunk_size=10, overlap=10)
    with pytest.raises(ChunkingError):
        chunk_document([TextBlock(text="a b c")], chunk_size=0)


def test_empty_blocks_produce_no_chunks():
    assert chunk_document([TextBlock(text="   \n\n ")]) == []


def test_count_tokens_is_whitespace_based():
    assert count_tokens("satu dua\ttiga\nempat") == 4
    assert count_tokens("") == 0
