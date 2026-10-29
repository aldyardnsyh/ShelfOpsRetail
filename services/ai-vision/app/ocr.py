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
    ) -> PriceRead:
        """Read a price tag inside ``box``."""


class StubOcrEngine(OcrEngine):
    name = "stub"

    def read(
        self,
        box: Detection,
        *,
        image_digest: bytes,
        reference_price_idr: int | None = None,
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
    ) -> PriceRead:
        raise OcrError("PaddleOCR engine is not installed")


def build_ocr_engine(settings: Settings) -> OcrEngine:
    engine = settings.ocr_engine.lower()
    if engine == "stub":
        return StubOcrEngine()
    if engine in ("paddle", "paddleocr"):
        return PaddleOcrEngine()
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
