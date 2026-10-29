"""VLM openai-compatible: baca label harga dari potongan gambar.

Env: ``VLM_PROVIDER`` (off | openai-compatible), ``VLM_BASE_URL``,
``VLM_API_KEY``, ``VLM_MODEL``. Kalau env tak lengkap, fungsi ini melempar
error jujur — tidak pernah memakai stub diam-diam.
"""

from __future__ import annotations

import base64
import json
import re
from dataclasses import dataclass

from app.http_client import HttpError, post_json

PROVIDER_NAME = "openai-compatible"

_PRICE_PATTERN = re.compile(r"(?:rp\.?\s*)?([0-9][0-9.\s]{1,12}(?:[,.]\d{3})?)", re.IGNORECASE)


class VlmError(RuntimeError):
    """Raised when the VLM provider is unavailable or returns unusable output."""


@dataclass(frozen=True)
class VlmPriceRead:
    raw_text: str
    price_idr: int
    confidence: float


class VlmClient:
    """Klien chat/completions openai-compatible dengan vision."""

    name = PROVIDER_NAME

    def __init__(
        self,
        *,
        base_url: str,
        api_key: str,
        model: str,
        timeout: float = 45.0,
    ) -> None:
        if not base_url.strip():
            raise VlmError("VLM_BASE_URL wajib diisi untuk VLM_PROVIDER=openai-compatible")
        if not model.strip():
            raise VlmError("VLM_MODEL wajib diisi untuk VLM_PROVIDER=openai-compatible")
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model = model
        self.timeout = timeout

    def read_price(self, image_bytes: bytes, *, hint: str = "") -> VlmPriceRead:
        """Kirim potongan gambar dan terima harga dalam rupiah."""
        if not image_bytes:
            raise VlmError("gambar kosong tidak bisa dibaca VLM")
        encoded = base64.b64encode(image_bytes).decode("ascii")
        payload = {
            "model": self.model,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "Anda membaca label harga retail. Jawab HANYA JSON "
                        '{"raw_text": "<teks label>", "price_idr": <angka rupiah>, '
                        '"confidence": <0..1>}.'
                    ),
                },
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:image/jpeg;base64,{encoded}"},
                        },
                        {
                            "type": "text",
                            "text": hint or "Berapa harga pada label ini? Jawab JSON saja.",
                        },
                    ],
                },
            ],
            "temperature": 0.0,
            "max_tokens": 120,
        }
        headers = {"Authorization": f"Bearer {self.api_key}"} if self.api_key else {}
        try:
            data = post_json(
                f"{self.base_url}/chat/completions",
                payload,
                headers=headers,
                timeout=self.timeout,
            )
        except HttpError as exc:
            raise VlmError(f"VLM {self.model} gagal: {exc}") from exc

        try:
            content = data["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise VlmError(f"respons VLM dari {self.base_url} tidak lengkap: {exc}") from exc

        parsed = _parse_price_payload(str(content or ""))
        if parsed is None:
            raise VlmError(f"VLM {self.model} tidak mengembalikan harga yang bisa dibaca")
        return parsed


def _parse_price_payload(content: str) -> VlmPriceRead | None:
    """Ambil JSON dari respons VLM; tolerate teks yang dibungkus markdown."""
    text = content.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:]
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end < start:
        return _price_from_text(text)
    try:
        payload = json.loads(text[start : end + 1])
    except json.JSONDecodeError:
        return _price_from_text(text)
    if not isinstance(payload, dict):
        return _price_from_text(text)

    raw_text = str(payload.get("raw_text") or "")
    price = payload.get("price_idr")
    confidence = payload.get("confidence")
    try:
        price_value = int(float(price))
    except (TypeError, ValueError):
        price_value = 0
    if price_value <= 0:
        return _price_from_text(raw_text or text)
    try:
        confidence_value = float(confidence)
    except (TypeError, ValueError):
        confidence_value = 0.0
    return VlmPriceRead(
        raw_text=raw_text,
        price_idr=price_value,
        confidence=max(0.0, min(1.0, confidence_value)),
    )


def _price_from_text(text: str) -> VlmPriceRead | None:
    """Cadangan: ambil angka terbesar dari teks label (format Rp)."""
    candidates: list[int] = []
    for match in _PRICE_PATTERN.finditer(text or ""):
        digits = re.sub(r"[^\d]", "", match.group(1))
        if not digits:
            continue
        value = int(digits)
        if value >= 100:
            candidates.append(value)
    if not candidates:
        return None
    return VlmPriceRead(raw_text=(text or "").strip()[:120], price_idr=max(candidates), confidence=0.6)
