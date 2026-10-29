"""Deterministic detector: hash(image bytes) -> synthetic shelf layout.

No network, no model weights. The same image always yields the same boxes,
which keeps audit UI, geometry, and integration tests reproducible. This is
a development placeholder, not a quality claim (D-014).
"""

from __future__ import annotations

import hashlib
import random

from app.detector import Detection, DetectionResult, Detector

_SKU_LABELS = (
    "SKU-001",
    "SKU-002",
    "SKU-003",
    "SKU-004",
    "SKU-005",
    "SKU-006",
    "SKU-007",
    "SKU-008",
)

_SOF_MARKERS = frozenset(
    {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF}
)

_PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


class ReplayDetector(Detector):
    name = "replay"
    degradation = "L2"

    def __init__(self, model_version: str = "replay-yolo-placeholder-v1") -> None:
        self.model_version = model_version

    def detect(
        self,
        image: bytes,
        *,
        imgsz: int,
        conf_threshold: float,
        candidate_labels: tuple[str, ...] = (),
    ) -> DetectionResult:
        seed = int.from_bytes(hashlib.blake2b(image, digest_size=16).digest()[:8], "big")
        rng = random.Random(seed)
        width, height = image_dimensions(image) or _fallback_dimensions(seed, imgsz)
        labels = tuple(candidate_labels) or _SKU_LABELS

        boxes = _layout(rng, width, height, labels)
        if conf_threshold > 0:
            boxes = [box for box in boxes if box.confidence >= conf_threshold]
        return DetectionResult(
            width=width,
            height=height,
            boxes=boxes,
            model_version=self.model_version,
        )


def _layout(
    rng: random.Random,
    width: int,
    height: int,
    labels: tuple[str, ...],
) -> list[Detection]:
    rows = rng.randint(3, 5)
    left = width * 0.04
    right = width * 0.96
    top = height * 0.12
    bottom = height * 0.88
    band = (bottom - top) / rows
    boxes: list[Detection] = []

    for row in range(rows):
        slots = rng.randint(5, 7)
        slot_width = (right - left) / slots
        gap_len = 3
        has_gap = slots > gap_len + 1 and rng.random() < 0.6
        gap_start = rng.randrange(1, slots - gap_len) if has_gap else -1

        row_top = top + row * band + band * 0.14
        row_bottom = top + (row + 1) * band - band * 0.14

        for slot in range(slots):
            if gap_start >= 0 and gap_start <= slot < gap_start + gap_len:
                continue
            box_width = slot_width * rng.uniform(0.70, 0.92)
            x1 = left + slot * slot_width + slot_width * rng.uniform(0.02, 0.10)
            x2 = min(x1 + box_width, right)
            if x2 <= x1:
                continue
            y1 = row_top + band * rng.uniform(0.0, 0.06)
            y2 = row_bottom - band * rng.uniform(0.0, 0.06)
            confidence = round(rng.uniform(0.55, 0.97), 4)
            label = labels[(row * slots + slot) % len(labels)]
            boxes.append(
                Detection(
                    x1=round(x1, 2),
                    y1=round(y1, 2),
                    x2=round(x2, 2),
                    y2=round(y2, 2),
                    confidence=confidence,
                    label=label,
                    label_score=round(min(0.99, confidence + 0.02), 4),
                    class_id=(row * slots + slot) % len(labels),
                )
            )
    return boxes


def _fallback_dimensions(seed: int, imgsz: int) -> tuple[int, int]:
    base = max(320, imgsz or 960)
    width = base + (seed % 5) * 32
    height = int(base * 0.75) + ((seed >> 8) % 4) * 24
    return width, height


def image_dimensions(data: bytes) -> tuple[int, int] | None:
    """Best-effort PNG/JPEG/GIF/BMP dimensions without Pillow."""
    if len(data) >= 24 and data.startswith(_PNG_SIGNATURE):
        return int.from_bytes(data[16:20], "big"), int.from_bytes(data[20:24], "big")
    if len(data) >= 10 and data[:6] in (b"GIF87a", b"GIF89a"):
        return int.from_bytes(data[6:8], "little"), int.from_bytes(data[8:10], "little")
    if len(data) >= 26 and data[:2] == b"BM":
        width = int.from_bytes(data[18:22], "little", signed=True)
        height = abs(int.from_bytes(data[22:26], "little", signed=True))
        return width, height
    if len(data) >= 4 and data[:2] == b"\xff\xd8":
        return _jpeg_dimensions(data)
    return None


def _jpeg_dimensions(data: bytes) -> tuple[int, int] | None:
    index = 2
    size = len(data)
    while index + 3 < size:
        if data[index] != 0xFF:
            index += 1
            continue
        marker = data[index + 1]
        if marker == 0xFF:
            index += 1
            continue
        if marker in (0xD8, 0xD9, 0x01) or 0xD0 <= marker <= 0xD7:
            index += 2
            continue
        segment_length = int.from_bytes(data[index + 2 : index + 4], "big")
        if segment_length < 2:
            return None
        if marker in _SOF_MARKERS and index + 9 <= size:
            height = int.from_bytes(data[index + 5 : index + 7], "big")
            width = int.from_bytes(data[index + 7 : index + 9], "big")
            if width and height:
                return width, height
            return None
        index += 2 + segment_length
    return None
