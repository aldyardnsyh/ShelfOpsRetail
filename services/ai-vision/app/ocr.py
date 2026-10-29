"""Price-tag OCR.

The stub returns deterministic placeholder prices derived from the image hash
and the box geometry, so the audit pipeline and price-accuracy metric can be
exercised without PaddleOCR, weights, or a GPU. The real engine slot is
documented and fails loudly instead of returning fake output.
"""

from __future__ import annotations

import hashlib
import random
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import TYPE_CHECKING

from app.detector import Detection

if TYPE_CHECKING:
    from app.config import Settings


class OcrError(RuntimeError):
    """Raised when an OCR engine is unavailable."""


@dataclass(frozen=True)
class PriceRead:
    raw_text: str
    price_idr: int
    confidence: float


class OcrEngine(ABC):
    name: str = "unknown"

    @abstractmethod
    def read(
        self,
        box: Detection,
        *,
        image_digest: bytes,
        reference_price_idr: int | None = None,
        image: bytes | None = None,
    ) -> PriceRead:
        """Read a price tag inside ``box``.

        ``image`` berisi byte gambar asli (bukan hanya digest) supaya engine
        sungguhan bisa memotong region label. Engine tiruan boleh
        mengabaikannya.
        """


class StubOcrEngine(OcrEngine):
    name = "stub"

    def read(
        self,
        box: Detection,
        *,
        image_digest: bytes,
        reference_price_idr: int | None = None,
        image: bytes | None = None,
    ) -> PriceRead:
        payload = (
            image_digest
            + box.label.encode("utf-8")
            + f"{box.x1:.0f}:{box.y1:.0f}:{box.x2:.0f}:{box.y2:.0f}".encode("ascii")
        )
        digest = hashlib.blake2b(payload, digest_size=16).digest()
        rng = random.Random(int.from_bytes(digest[:8], "big"))

        if rng.random() < 0.08:
            return PriceRead(raw_text="", price_idr=0, confidence=0.0)

        price = rng.randrange(10, 151) * 500
        return PriceRead(
            raw_text=f"Rp {price:,.0f}".replace(",", "."),
            price_idr=price,
            confidence=round(rng.uniform(0.72, 0.98), 4),
        )


class PaddleOcrEngine(OcrEngine):
    name = "paddle"

    def __init__(self) -> None:
        raise OcrError("PaddleOCR engine is not installed; set VISION_OCR_ENGINE=stub for dev")

    def read(
        self,
        box: Detection,
        *,
        image_digest: bytes,
        reference_price_idr: int | None = None,
        image: bytes | None = None,
    ) -> PriceRead:
        raise OcrError("PaddleOCR engine is not installed")


class RapidOcrEngine(OcrEngine):
    """OCR lokal dengan RapidOCR (ONNX, tanpa GPU).

    Import ``rapidocr_onnxruntime`` dilakukan saat runtime supaya image tanpa
    dependency itu tetap bisa start dan test tetap hijau.
    """

    name = "rapidocr"

    def __init__(self) -> None:
        self._engine: object | None = None

    def _get_engine(self) -> object:
        if self._engine is None:
            try:
                from rapidocr_onnxruntime import RapidOCR
            except ImportError as exc:
                raise OcrError(
                    "rapidocr-onnxruntime belum terpasang di image ai-vision; "
                    "pasang dependency itu atau set VISION_OCR_ENGINE=stub"
                ) from exc
            self._engine = RapidOCR()
        return self._engine

    def read(
        self,
        box: Detection,
        *,
        image_digest: bytes,
        reference_price_idr: int | None = None,
        image: bytes | None = None,
    ) -> PriceRead:
        if not image:
            raise OcrError("gambar asli tidak tersedia untuk OCR rapidocr")
        engine = self._get_engine()
        crop = _crop(image, box)
        try:
            result = engine(crop)  # type: ignore[operator]
        except Exception as exc:  # noqa: BLE001 - engine pihak ketiga
            raise OcrError(f"rapidocr gagal: {exc}") from exc

        text, confidence = _first_text(result)
        if not text:
            return PriceRead(raw_text="", price_idr=0, confidence=0.0)
        price = _parse_price_idr(text)
        return PriceRead(raw_text=text, price_idr=price, confidence=confidence)


class CloudOcrEngine(OcrEngine):
    """Baca label harga lewat VLM openai-compatible."""

    name = "cloud"

    def __init__(self, client: object) -> None:
        self._client = client

    def read(
        self,
        box: Detection,
        *,
        image_digest: bytes,
        reference_price_idr: int | None = None,
        image: bytes | None = None,
    ) -> PriceRead:
        if not image:
            raise OcrError("gambar asli tidak tersedia untuk OCR cloud")
        crop = _crop(image, box)
        read = self._client.read_price(crop, hint="Baca harga pada label rak ini.")  # type: ignore[attr-defined]
        return PriceRead(raw_text=read.raw_text, price_idr=read.price_idr, confidence=read.confidence)


def _crop(image: bytes, box: Detection) -> bytes:
    """Potong region label dari gambar asli (Pillow, lazy import)."""
    try:
        from PIL import Image
    except ImportError as exc:
        raise OcrError("Pillow belum terpasang di image ai-vision") from exc
    import io

    try:
        opened = Image.open(io.BytesIO(image)).convert("RGB")
    except Exception as exc:  # noqa: BLE001
        raise OcrError(f"gambar tidak bisa didekode: {exc}") from exc
    width, height = opened.width, opened.height
    left = max(0, min(width - 1, int(box.x1)))
    top = max(0, min(height - 1, int(box.y1)))
    right = max(left + 1, min(width, int(box.x2)))
    bottom = max(top + 1, min(height, int(box.y2)))
    cropped = opened.crop((left, top, right, bottom))
    buffer = io.BytesIO()
    cropped.save(buffer, format="JPEG")
    return buffer.getvalue()


def _first_text(result: object) -> tuple[str, float]:
    """Ambil baris teks pertama dari keluaran RapidOCR."""
    lines = None
    if isinstance(result, tuple):
        lines = result[0]
    elif isinstance(result, list):
        lines = result
    if not lines:
        return "", 0.0
    first = lines[0]
    if isinstance(first, (list, tuple)) and len(first) >= 2:
        return str(first[1]), float(first[2]) if isinstance(first[2], (int, float)) else 0.0
    return "", 0.0


def _parse_price_idr(text: str) -> int:
    """Ambil angka rupiah dari teks label (Rp 12.500 / 12500)."""
    import re

    best = 0
    for match in re.finditer(r"[0-9][0-9.\s]{1,12}", text or ""):
        digits = re.sub(r"[^\d]", "", match.group(0))
        if not digits:
            continue
        value = int(digits)
        if value >= 100:
            best = max(best, value)
    return best


def build_ocr_engine(settings: Settings) -> OcrEngine:
    engine = settings.ocr_engine.lower()
    if engine == "stub":
        return StubOcrEngine()
    if engine in ("paddle", "paddleocr"):
        return PaddleOcrEngine()
    if engine in ("rapidocr", "rapid"):
        return RapidOcrEngine()
    if engine in ("cloud", "vlm"):
        from app.vlm import VlmClient, VlmError

        provider = (settings.vlm_provider or "").lower()
        if provider not in ("openai-compatible", "openai_compatible"):
            raise OcrError(
                "VISION_OCR_ENGINE=cloud butuh VLM_PROVIDER=openai-compatible "
                f"(sekarang: {settings.vlm_provider or 'kosong'})"
            )
        try:
            client = VlmClient(
                base_url=settings.vlm_base_url,
                api_key=settings.vlm_api_key,
                model=settings.vlm_model,
                timeout=settings.vlm_timeout,
            )
        except VlmError as exc:
            raise OcrError(str(exc)) from exc
        return CloudOcrEngine(client)
    raise OcrError(f"unknown OCR engine: {settings.ocr_engine}")


def parse_reference_prices(raw_json: str) -> dict[str, int]:
    """Parse ``{"SKU-001": 12500}`` leniently; invalid entries are ignored."""
    import json

    if not raw_json.strip():
        return {}
    try:
        payload = json.loads(raw_json)
    except json.JSONDecodeError:
        return {}
    if not isinstance(payload, dict):
        return {}
    prices: dict[str, int] = {}
    for key, value in payload.items():
        if not isinstance(key, str):
            continue
        if isinstance(value, bool):
            continue
        if isinstance(value, (int, float)) and value >= 0:
            prices[key] = int(value)
    return prices
