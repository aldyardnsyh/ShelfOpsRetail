"""Slot for the trained YOLO/ONNX detector (not implemented yet).

E6 will add: EXIF-aware decode, letterbox to ``settings.model_imgsz``,
normalisation, ONNX Runtime session (CPU, intra_op threads = 1), NMS, and
dynamic batching 8/25 ms. Weights are produced by the human training step
(E5) and registered in ``model_registry`` with status ``active``.

Until then this raises instead of pretending to run a model.
"""

from __future__ import annotations

from app.detector import DetectionResult, Detector, DetectorError

_MESSAGE = (
    "ONNX detector is not available: train/export weights first, then set "
    "VISION_DETECTOR=onnx (see docs/PLAN.md E5). Use VISION_DETECTOR=replay for dev."
)


class OnnxDetector(Detector):
    name = "onnx"
    degradation = "L0"

    def __init__(self, model_version: str = "unconfigured", model_path: str | None = None) -> None:
        self.model_version = model_version
        self.model_path = model_path
        raise DetectorError(_MESSAGE)

    def detect(
        self,
        image: bytes,
        *,
        imgsz: int,
        conf_threshold: float,
        candidate_labels: tuple[str, ...] = (),
    ) -> DetectionResult:
        raise DetectorError(_MESSAGE)
