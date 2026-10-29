"""Provider nyata untuk endpoint openai-compatible (chat completions + embeddings).

Kontrak kejujuran:
- Tidak ada fallback diam-diam ke ``replay``. Bila kredensial/konfigurasi
  tidak lengkap, provider melempar ``ProviderError`` yang menyebut env yang
  harus diisi.
- Fallback LLM bersifat eksplisit: hanya dipakai bila env fallback terisi
  lengkap, dan kegagalan kedua endpointReported apa adanya.
- Batas biaya harian (USD) dijaga per proses dan di-reset setiap hari UTC.
"""

from __future__ import annotations

import math
import time
from collections.abc import Iterator, Sequence

from app.http_client import HttpError, post_json
from app.providers.base import EmbeddingProvider, LLMProvider, ProviderError

PROVIDER_NAME = "openai-compatible"

# Harga default USD per 1 juta token (input, output). Nilai ini hanya
# estimasi untuk menjaga budget; operator dapat mengoverride lewat
# LLM_INPUT_PRICE_PER_MTOK / LLM_OUTPUT_PRICE_PER_MTOK (0 = pakai tabel).
PRICE_TABLE: dict[str, tuple[float, float]] = {
    "gpt-4o-mini": (0.15, 0.60),
    "gpt-4o": (2.50, 10.00),
    "gpt-4.1-mini": (0.40, 1.60),
    "gpt-4.1": (2.00, 8.00),
    "gpt-4.1-nano": (0.10, 0.40),
    "llama-3.1-8b-instruct": (0.05, 0.08),
    "llama-3.3-70b-instruct": (0.10, 0.30),
    "qwen2.5-72b-instruct": (0.10, 0.20),
    "gemma-3-27b-it": (0.10, 0.20),
}
DEFAULT_PRICE = (0.50, 1.50)

# Panjang potongan saat answer dipecah menjadi token SSE.
_STREAM_PIECE = 64


def normalize_provider(value: str) -> str:
    """Samakan ejaan env: ``openai_compatible`` == ``openai-compatible``."""
    return value.strip().lower().replace("_", "-")


class DailyBudget:
    """Batas biaya harian per proses (reset per hari UTC).

    ``limit_usd <= 0`` berarti tanpa batas (dev/CI).
    """

    def __init__(
        self,
        limit_usd: float,
        *,
        price_in: float | None = None,
        price_out: float | None = None,
    ) -> None:
        self._limit = max(0.0, float(limit_usd))
        self._price_in = price_in
        self._price_out = price_out
        self._day = _utc_day()
        self._spent = 0.0

    @property
    def limit_usd(self) -> float:
        return self._limit

    @property
    def spent_usd(self) -> float:
        self._rollover()
        return self._spent

    def _rollover(self) -> None:
        today = _utc_day()
        if today != self._day:
            self._day = today
            self._spent = 0.0

    def ensure_available(self) -> None:
        """Tolak panggilan baru bila budget hari ini sudah habis."""
        self._rollover()
        if self._limit > 0 and self._spent >= self._limit:
            raise ProviderError(
                f"budget harian LLM terlampaui (${self._spent:.4f} dari ${self._limit:.2f}). "
                "Naikkan LLM_DAILY_BUDGET_USD atau tunggu reset hari berikutnya."
            )

    def record(self, tokens_in: int, tokens_out: int, model: str) -> float:
        """Catat pemakaian token dan kembalikan estimasi biaya (USD)."""
        self._rollover()
        price_in, price_out = self._prices(model)
        cost = (max(0, tokens_in) / 1_000_000) * price_in + (max(0, tokens_out) / 1_000_000) * price_out
        self._spent += cost
        return cost

    def _prices(self, model: str) -> tuple[float, float]:
        if self._price_in is not None and self._price_out is not None:
            return self._price_in, self._price_out
        return PRICE_TABLE.get(model.strip().lower(), DEFAULT_PRICE)


def _utc_day() -> str:
    return time.strftime("%Y-%m-%d", time.gmtime())


class ChatEndpoint:
    """Satu endpoint chat/completions openai-compatible."""

    def __init__(self, *, base_url: str, api_key: str, model: str, timeout: float = 45.0) -> None:
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model = model
        self.timeout = timeout

    def complete(
        self,
        prompt: str,
        *,
        max_tokens: int = 512,
        language: str = "id",
    ) -> tuple[str, int, int]:
        """Kembalikan (teks, token_masuk, token_keluar)."""
        url = f"{self.base_url}/chat/completions"
        payload = {
            "model": self.model,
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": max(0, int(max_tokens)),
            "temperature": 0.2,
        }
        headers = {"Authorization": f"Bearer {self.api_key}"} if self.api_key else {}
        try:
            data = post_json(url, payload, headers=headers, timeout=self.timeout)
        except HttpError as exc:
            raise ProviderError(f"LLM {self.model} gagal: {exc}") from exc

        try:
            content = data["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise ProviderError(
                f"respons LLM dari {self.base_url} tidak lengkap: {exc}"
            ) from exc

        usage = data.get("usage") or {}
        tokens_in = _as_int(usage.get("prompt_tokens"))
        tokens_out = _as_int(usage.get("completion_tokens"))
        return str(content or ""), tokens_in, tokens_out


class OpenAICompatibleLLM(LLMProvider):
    """LLM openai-compatible dengan fallback eksplisit dan budget harian."""

    name = PROVIDER_NAME
    replay = False

    def __init__(
        self,
        *,
        primary: ChatEndpoint,
        fallback: ChatEndpoint | None = None,
        budget: DailyBudget | None = None,
    ) -> None:
        self._primary = primary
        self._fallback = fallback
        self._budget = budget
        self.model = primary.model

    @property
    def primary(self) -> ChatEndpoint:
        return self._primary

    @property
    def fallback(self) -> ChatEndpoint | None:
        return self._fallback

    def stream(
        self,
        prompt: str,
        *,
        language: str = "id",
        max_tokens: int = 512,
    ) -> Iterator[str]:
        text = self.complete(prompt, language=language, max_tokens=max_tokens)
        for piece in _split(text, _STREAM_PIECE):
            yield piece

    def complete(
        self,
        prompt: str,
        *,
        language: str = "id",
        max_tokens: int = 512,
    ) -> str:
        if self._budget is not None:
            self._budget.ensure_available()

        try:
            content, tokens_in, tokens_out = self._primary.complete(
                prompt, max_tokens=max_tokens, language=language
            )
        except ProviderError as primary_error:
            if self._fallback is None:
                raise
            try:
                content, tokens_in, tokens_out = self._fallback.complete(
                    prompt, max_tokens=max_tokens, language=language
                )
            except ProviderError as fallback_error:
                raise ProviderError(
                    f"LLM primary gagal ({primary_error}); fallback juga gagal ({fallback_error})"
                ) from fallback_error

        if self._budget is not None:
            self._budget.record(tokens_in, tokens_out, self._primary.model)
        return content


class OpenAICompatibleEmbedder(EmbeddingProvider):
    """Embedding openai-compatible dengan batching."""

    name = PROVIDER_NAME
    batch_size = 32

    def __init__(
        self,
        *,
        base_url: str,
        api_key: str,
        model: str,
        dim: int = 1024,
        batch: int = 32,
        timeout: float = 45.0,
    ) -> None:
        if dim <= 0:
            raise ValueError("dim must be positive")
        if batch <= 0:
            raise ValueError("batch must be positive")
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model = model
        self.timeout = timeout
        self._dim = dim
        self.batch_size = batch

    @property
    def dim(self) -> int:
        return self._dim

    def embed(self, texts: Sequence[str]) -> list[list[float]]:
        items = list(texts)
        if not items:
            return []
        vectors: list[list[float]] = []
        for start in range(0, len(items), self.batch_size):
            vectors.extend(self._embed_batch(items[start : start + self.batch_size]))
        return vectors

    def _embed_batch(self, batch: Sequence[str]) -> list[list[float]]:
        url = f"{self.base_url}/embeddings"
        payload = {"model": self.model, "input": list(batch)}
        headers = {"Authorization": f"Bearer {self.api_key}"} if self.api_key else {}
        try:
            data = post_json(url, payload, headers=headers, timeout=self.timeout)
        except HttpError as exc:
            raise ProviderError(f"embedding {self.model} gagal: {exc}") from exc

        items = data.get("data")
        if not isinstance(items, list) or not items:
            raise ProviderError(f"respons embedding dari {self.base_url} tidak berisi data")

        ordered = sorted(items, key=lambda item: _as_int(item.get("index") if isinstance(item, dict) else 0))
        vectors: list[list[float]] = []
        for item in ordered:
            if not isinstance(item, dict):
                raise ProviderError(f"respons embedding dari {self.base_url} berisi entri tak valid")
            raw = item.get("embedding")
            if not isinstance(raw, list) or not raw:
                raise ProviderError(f"respons embedding dari {self.base_url} tidak berisi vektor")
            try:
                vector = [float(value) for value in raw]
            except (TypeError, ValueError) as exc:
                raise ProviderError(f"vektor embedding bukan angka: {exc}") from exc
            # Resize dulu, normalisasi belakangan: vektor akhir harus tetap
            # panjang satu (unit) supaya konsisten dengan embedder hash.
            vectors.append(_normalize(_resize(vector, self._dim)))

        if len(vectors) != len(batch):
            raise ProviderError(
                f"jumlah vektor ({len(vectors)}) tidak sama dengan jumlah input ({len(batch)})"
            )
        return vectors


def _normalize(vector: Sequence[float]) -> list[float]:
    norm = math.sqrt(sum(value * value for value in vector))
    if norm == 0.0:
        return [0.0] * len(vector)
    return [value / norm for value in vector]


def _resize(vector: Sequence[float], dim: int) -> list[float]:
    """Potong atau zero-pad vektor agar persis ``dim`` dimensi."""
    if len(vector) == dim:
        return list(vector)
    if len(vector) > dim:
        return list(vector[:dim])
    return list(vector) + [0.0] * (dim - len(vector))


def _split(text: str, size: int) -> list[str]:
    if not text:
        return []
    return [text[index : index + size] for index in range(0, len(text), size)]


def _as_int(value: object) -> int:
    if isinstance(value, bool):
        return 0
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    if isinstance(value, str):
        try:
            return int(value)
        except ValueError:
            return 0
    return 0
