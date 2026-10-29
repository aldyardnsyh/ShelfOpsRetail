"""Deterministic, extractive replay LLM (no network, no API keys).

This is the dev/CI provider from ADR-007. It answers *only* with sentences
found in the supplied sources, appending the matching ``[S1]`` citation. When
no source sentence overlaps the question it refuses instead of inventing text.
"""

from __future__ import annotations

import re
from collections.abc import Iterator
from dataclasses import dataclass

from app.providers.base import LLMProvider

_SOURCE_RE = re.compile(
    r"^\[S(?P<ordinal>\d+)\][ \t]*(?P<header>[^\n]*)\n"
    r"(?P<body>.*?)(?=^\[S\d+\]|^## Question|\Z)",
    re.MULTILINE | re.DOTALL,
)
_QUESTION_RE = re.compile(r"^## Question\s*\n(?P<question>.*)\Z", re.MULTILINE | re.DOTALL)
_SENTENCE_RE = re.compile(r"(?<=[.!?])\s+|\n+")
_TERM_RE = re.compile(r"[0-9a-z\u00c0-\u024f]+", re.IGNORECASE)
_STREAM_RE = re.compile(r"\S+\s*")

_QUERY_STOPWORDS = frozenset(
    {
        "apa",
        "apakah",
        "berapa",
        "bagaimana",
        "dimana",
        "mana",
        "yang",
        "dan",
        "atau",
        "untuk",
        "dari",
        "dengan",
        "pada",
        "itu",
        "ini",
        "adalah",
        "tolong",
        "sebutkan",
        "jelaskan",
        "what",
        "which",
        "how",
        "many",
        "much",
        "when",
        "where",
        "why",
        "the",
        "and",
        "or",
        "for",
        "from",
        "with",
        "about",
        "please",
        "tell",
        "explain",
    }
)

_REFUSAL = {
    "id": (
        "Saya tidak menemukan informasi yang cukup pada konteks yang tersedia "
        "untuk menjawab pertanyaan ini. Saya tidak akan mengarang jawaban."
    ),
    "en": (
        "I could not find enough information in the available context to answer "
        "this question. I will not make up an answer."
    ),
}

_PREFIX = {
    "id": "Berdasarkan konteks yang tersedia: ",
    "en": "Based on the available context: ",
}


@dataclass(frozen=True)
class _Source:
    ordinal: int
    header: str
    sentences: tuple[str, ...]


class ReplayLLM(LLMProvider):
    name = "replay"
    model = "replay-extractive-v1"
    replay = True

    def stream(
        self,
        prompt: str,
        *,
        language: str = "id",
        max_tokens: int = 512,
    ) -> Iterator[str]:
        answer = self.build_answer(prompt, language=language)
        tokens = _STREAM_RE.findall(answer)[: max(max_tokens, 1)]
        yield from tokens

    def build_answer(self, prompt: str, *, language: str = "id") -> str:
        lang = language if language in ("id", "en") else "id"
        sources = _parse_sources(prompt)
        if not sources:
            return _REFUSAL[lang]

        question = _parse_question(prompt)
        terms = {
            term.lower()
            for term in _TERM_RE.findall(question)
            if len(term) >= 3 and term.lower() not in _QUERY_STOPWORDS
        }

        candidates: list[tuple[int, int, int, str, int]] = []
        for source in sources:
            for index, sentence in enumerate(source.sentences):
                score = _overlap(terms, sentence)
                candidates.append((score, source.ordinal, index, sentence, source.ordinal))

        if terms:
            matched = [item for item in candidates if item[0] > 0]
        else:
            matched = [item for item in candidates[:1] if item[0] == 0]

        if not matched:
            return _REFUSAL[lang]

        ranked = sorted(matched, key=lambda item: (-item[0], item[1], item[2]))
        chosen = sorted(ranked[:2], key=lambda item: (item[1], item[2]))

        parts = []
        seen: set[str] = set()
        for _, _, _, sentence, ordinal in chosen:
            key = f"{ordinal}:{sentence}"
            if key in seen:
                continue
            seen.add(key)
            parts.append(f"{sentence.rstrip()} [S{ordinal}]")

        if not parts:
            return _REFUSAL[lang]
        return _PREFIX[lang] + " ".join(parts)


def refusal_message(language: str) -> str:
    lang = language if language in _REFUSAL else "id"
    return _REFUSAL[lang]


def _parse_sources(prompt: str) -> list[_Source]:
    sources: list[_Source] = []
    for match in _SOURCE_RE.finditer(prompt):
        body = match.group("body").strip()
        sentences = tuple(
            sentence.strip() for sentence in _SENTENCE_RE.split(body) if sentence.strip()
        )
        sources.append(
            _Source(
                ordinal=int(match.group("ordinal")),
                header=match.group("header").strip(),
                sentences=sentences,
            )
        )
    return sources


def _parse_question(prompt: str) -> str:
    match = _QUESTION_RE.search(prompt)
    return match.group("question").strip() if match else ""


def _overlap(terms: set[str], sentence: str) -> int:
    text = sentence.lower()
    return sum(1 for term in terms if term in text)
