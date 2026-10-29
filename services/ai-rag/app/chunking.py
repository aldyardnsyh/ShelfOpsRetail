"""Heading-aware token chunking (default 800 tokens, 120 overlap)."""

from __future__ import annotations

import re
from collections.abc import Sequence
from dataclasses import dataclass

from app.parsing import TextBlock

TOKEN_RE = re.compile(r"\S+")
_WS_RE = re.compile(r"[ \t]+")
_BLANK_LINES_RE = re.compile(r"\n{3,}")


class ChunkingError(ValueError):
    """Raised for invalid chunking parameters or empty input."""


@dataclass(frozen=True)
class Chunk:
    ordinal: int
    content: str
    heading_path: str = ""
    page: int | None = None
    token_count: int = 0


def count_tokens(text: str) -> int:
    """Whitespace token count (deterministic, model-agnostic approximation)."""
    return len(TOKEN_RE.findall(text))


def chunk_document(
    blocks: Sequence[TextBlock],
    *,
    chunk_size: int = 800,
    overlap: int = 120,
) -> list[Chunk]:
    if chunk_size <= 0:
        raise ChunkingError("chunk_size must be positive")
    if overlap < 0 or overlap >= chunk_size:
        raise ChunkingError("overlap must satisfy 0 <= overlap < chunk_size")

    chunks: list[Chunk] = []
    ordinal = 0
    for block in blocks:
        text = _normalise(block.text)
        if not text:
            continue
        spans = [match.span() for match in TOKEN_RE.finditer(text)]
        if not spans:
            continue
        for start, end in _windows(len(spans), chunk_size, overlap):
            content = text[spans[start][0] : spans[end - 1][1]].strip()
            if not content:
                continue
            chunks.append(
                Chunk(
                    ordinal=ordinal,
                    content=content,
                    heading_path=block.heading_path,
                    page=block.page,
                    token_count=count_tokens(content),
                )
            )
            ordinal += 1
    return chunks


def _windows(token_count: int, chunk_size: int, overlap: int) -> list[tuple[int, int]]:
    windows: list[tuple[int, int]] = []
    start = 0
    while start < token_count:
        end = min(start + chunk_size, token_count)
        windows.append((start, end))
        if end == token_count:
            break
        start = end - overlap
    return windows


def _normalise(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = _WS_RE.sub(" ", text)
    text = _BLANK_LINES_RE.sub("\n\n", text)
    return text.strip()
