"""Detector contract and provider selection."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.config import Settings


class DetectorError(RuntimeError):
    """Raised when a detector is unavailable or misconfigured."""


@dataclass(frozen=True)
class Detection:
    x1: float
    y1: float
    x2: float
    y2: float
    confidence: float
    label: str = ""
    label_score: float = 0.0
    class_id: int = 0

    @property
    def width(self) -> float:
        return self.x2 - self.x1

    @property
    def height(self) -> float:
        return self.y2 - self.y1

    @property
    def cx(self) -> float:
        return (self.x1 + self.x2) / 2.0

    @property
    def cy(self) -> float:
        return (self.y1 + self.y2) / 2.0


@dataclass(frozen=True)
class DetectionResult:
    width: int
    height: int
    boxes: list[Detection] = field(default_factory=list)
    model_version: str = "unknown"


class Detector(ABC):
    name: str = "unknown"
    model_version: str = "unknown"
    degradation: str = "L0"

    @abstractmethod
    def detect(
        self,
        image: bytes,
        *,
        imgsz: int,
        conf_threshold: float,
        candidate_labels: tuple[str, ...] = (),
    ) -> DetectionResult:
        """Run inference on encoded image bytes."""


def build_detector(settings: Settings) -> Detector:
    kind = settings.detector.lower()
    if kind == "replay":
        from app.replay_detector import ReplayDetector

        return ReplayDetector(model_version=settings.model_version)
    if kind == "onnx":
        from app.onnx_detector import OnnxDetector

        return OnnxDetector(
            model_version=settings.model_version,
            model_path=settings.resolved_model_path(),
        )
    raise DetectorError(f"unknown detector: {settings.detector}")
