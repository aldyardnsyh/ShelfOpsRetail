"""Detect -> OCR -> shelf geometry pipeline shared by gRPC and HTTP."""

from __future__ import annotations

import threading
import time
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field

from app.config import Settings
from app.detector import Detection, DetectionResult, Detector
from app.ocr import OcrEngine, PriceRead
from app.shelves import PriceObservation, ShelfAnalysis, analyze_shelves


@dataclass(frozen=True)
class PriceTagResult:
    detection: Detection
    read: PriceRead
    matched_label: str
    reference_price_idr: int | None

    @property
    def mismatch(self) -> bool:
        return PriceObservation(
            price_idr=self.read.price_idr,
            reference_price_idr=self.reference_price_idr,
        ).mismatch


@dataclass(frozen=True)
class DetectionOutcome:
    result: DetectionResult
    shelves: ShelfAnalysis
    price_tags: list[PriceTagResult] = field(default_factory=list)
    low_confidence: bool = False
    latency_ms: int = 0


class DetectionPipeline:
    def __init__(self, settings: Settings, detector: Detector, ocr: OcrEngine) -> None:
        self._settings = settings
        self._detector = detector
        self._ocr = ocr
        self._semaphore = threading.Semaphore(max(1, settings.concurrency))

    def run(
        self,
        image: bytes,
        *,
        imgsz: int = 0,
        conf_threshold: float = 0.0,
        candidate_labels: Sequence[str] = (),
        run_ocr: bool = False,
        reference_prices: Mapping[str, int] | None = None,
    ) -> DetectionOutcome:
        started = time.perf_counter()
        with self._semaphore:
            result = self._detector.detect(
                image,
                imgsz=imgsz or self._settings.model_imgsz,
                conf_threshold=conf_threshold or self._settings.conf_threshold,
                candidate_labels=tuple(candidate_labels),
            )

            price_tags: list[PriceTagResult] = []
            observations: list[PriceObservation] = []
            if run_ocr and result.boxes:
                digest = _digest(image)
                references = reference_prices or {}
                for box in result.boxes:
                    reference = references.get(box.label)
                    read = self._ocr.read(
                        box,
                        image_digest=digest,
                        reference_price_idr=reference,
                        image=image,
                    )
                    tag = PriceTagResult(
                        detection=box,
                        read=read,
                        matched_label=box.label,
                        reference_price_idr=reference,
                    )
                    price_tags.append(tag)
                    if reference is not None:
                        observations.append(
                            PriceObservation(
                                price_idr=read.price_idr,
                                reference_price_idr=reference,
                            )
                        )

            shelves = analyze_shelves(
                result.boxes,
                image_width=result.width,
                image_height=result.height,
                price_observations=observations,
            )
            low_confidence = (
                not result.boxes
                or min(box.confidence for box in result.boxes) < self._settings.low_conf_threshold
            )
            latency_ms = max(0, round((time.perf_counter() - started) * 1000))
            return DetectionOutcome(
                result=result,
                shelves=shelves,
                price_tags=price_tags,
                low_confidence=low_confidence,
                latency_ms=latency_ms,
            )


def _digest(image: bytes) -> bytes:
    import hashlib

    return hashlib.blake2b(image, digest_size=32).digest()
