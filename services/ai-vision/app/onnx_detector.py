"""Detektor rak berbasis ONNX Runtime (CPU).

Bobot dimuat sekali per-process dan di-cache. Bila bobot belum ada, service
menolak dengan pesan yang bisa ditindaklanjuti — tidak pernah diam-diam memakai
detektor tiruan.
"""

from __future__ import annotations

import threading
from pathlib import Path
from typing import Any

from app.detector import Detection, DetectionResult, Detector, DetectorError

_SESSION_CACHE: dict[str, Any] = {}
_SESSION_LOCK = threading.Lock()

_IOU_THRESHOLD = 0.45
_PAD_VALUE = 114


class OnnxDetector(Detector):
    name = "onnx"
    degradation = "L0"

    def __init__(
        self,
        model_version: str = "unconfigured",
        model_path: str | None = None,
        *,
        labels: dict[int, str] | None = None,
    ) -> None:
        self.model_version = model_version
        self.model_path = (model_path or "").strip()
        self._labels = labels or {}

    # -- pemuatan model ---------------------------------------------------

    def _session(self) -> Any:
        if not self.model_path:
            raise DetectorError(
                "bobot ONNX belum dikonfigurasi: set MODEL_DIR + VISION_MODEL_VERSION "
                "(atau MODEL_PATH) lalu deploy model ke volume models"
            )
        path = Path(self.model_path)
        if not path.is_file():
            raise DetectorError(
                f"bobot ONNX belum ada di {path}; latih/export bobot dulu lalu jalankan ulang "
                "(lihat docs/PRODUCTION.md G5)"
            )
        key = str(path.resolve())
        with _SESSION_LOCK:
            session = _SESSION_CACHE.get(key)
            if session is None:
                session = _create_session(key)
                _SESSION_CACHE[key] = session
            return session

    def _label_names(self) -> dict[int, str]:
        if self._labels:
            return self._labels
        try:
            session = self._session()
            metadata = session.get_modelmeta().custom_metadata_map or {}
        except DetectorError:
            return {}
        raw = metadata.get("names")
        if not raw:
            return {}
        try:
            import json

            parsed = json.loads(raw)
        except (ValueError, TypeError):
            return {}
        if isinstance(parsed, dict):
            return {int(key): str(value) for key, value in parsed.items()}
        if isinstance(parsed, list):
            return {index: str(value) for index, value in enumerate(parsed)}
        return {}

    # -- inferensi --------------------------------------------------------

    def detect(
        self,
        image: bytes,
        *,
        imgsz: int,
        conf_threshold: float,
        candidate_labels: tuple[str, ...] = (),
    ) -> DetectionResult:
        session = self._session()
        try:
            import numpy as np
        except ImportError as exc:  # pragma: no cover - dependency opsional
            raise DetectorError(
                "numpy belum terpasang di image ai-vision; pasang numpy agar detektor ONNX bisa jalan"
            ) from exc

        pil_image, original_width, original_height = _decode(image)
        size = max(1, int(imgsz or 0))
        letterboxed, scale, pad_x, pad_y = _letterbox(pil_image, size)
        rgb = np.asarray(letterboxed, dtype=np.float32) / 255.0
        tensor = np.transpose(rgb, (2, 0, 1))[None, ...]

        try:
            input_name = session.get_inputs()[0].name
            outputs = session.run(None, {input_name: tensor})
        except Exception as exc:  # noqa: BLE001 - onnxruntime bisa melempar apa saja
            raise DetectorError(f"inferensi ONNX gagal: {exc}") from exc

        if not outputs:
            raise DetectorError("inferensi ONNX tidak menghasilkan output")

        labels = self._label_names()
        boxes, scores, class_ids = _decode_output(outputs[0], float(conf_threshold))
        keep = _nms(boxes, scores, _IOU_THRESHOLD)

        detections: list[Detection] = []
        for index in keep:
            x1, y1, x2, y2 = boxes[index]
            class_id = class_ids[index]
            label = labels.get(class_id, str(class_id))
            if candidate_labels and label not in candidate_labels:
                continue
            # Kembalikan ke koordinat gambar asli (undo letterbox).
            ox1 = (x1 - pad_x) / scale
            oy1 = (y1 - pad_y) / scale
            ox2 = (x2 - pad_x) / scale
            oy2 = (y2 - pad_y) / scale
            ox1 = max(0.0, min(float(original_width), ox1))
            oy1 = max(0.0, min(float(original_height), oy1))
            ox2 = max(0.0, min(float(original_width), ox2))
            oy2 = max(0.0, min(float(original_height), oy2))
            if ox2 <= ox1 or oy2 <= oy1:
                continue
            detections.append(
                Detection(
                    x1=ox1,
                    y1=oy1,
                    x2=ox2,
                    y2=oy2,
                    confidence=float(scores[index]),
                    label=label,
                    label_score=float(scores[index]),
                    class_id=int(class_id),
                )
            )

        return DetectionResult(
            width=original_width,
            height=original_height,
            boxes=detections,
            model_version=self.model_version,
        )


def _create_session(path: str) -> Any:
    try:
        import onnxruntime
    except ImportError as exc:
        raise DetectorError(
            "onnxruntime belum terpasang di image ai-vision; pasang onnxruntime agar "
            "VISION_DETECTOR=onnx bisa jalan"
        ) from exc
    options = onnxruntime.SessionOptions()
    options.intra_op_num_threads = 1
    options.inter_op_num_threads = 1
    options.graph_optimization_level = onnxruntime.GraphOptimizationLevel.ORT_ENABLE_ALL
    try:
        return onnxruntime.InferenceSession(path, sess_options=options, providers=["CPUExecutionProvider"])
    except Exception as exc:  # noqa: BLE001
        raise DetectorError(f"gagal memuat model ONNX {path}: {exc}") from exc


def _decode(image: bytes) -> tuple[Any, int, int]:
    try:
        from PIL import Image, ImageOps
    except ImportError as exc:
        raise DetectorError(
            "Pillow belum terpasang di image ai-vision; pasang pillow agar gambar bisa didekode"
        ) from exc
    import io

    try:
        opened = Image.open(io.BytesIO(image))
        opened = ImageOps.exif_transpose(opened).convert("RGB")
    except Exception as exc:  # noqa: BLE001
        raise DetectorError(f"gambar tidak bisa didekode: {exc}") from exc
    return opened, opened.width, opened.height


def _letterbox(image: Any, size: int) -> tuple[Any, float, float, float]:
    """Pad kuadrat + resize, kembalikan (gambar, skala, pad_x, pad_y)."""
    from PIL import Image

    width, height = image.width, image.height
    scale = min(size / width, size / height)
    new_width = max(1, int(round(width * scale)))
    new_height = max(1, int(round(height * scale)))
    resized = image.resize((new_width, new_height), Image.BILINEAR)
    canvas = Image.new("RGB", (size, size), (_PAD_VALUE, _PAD_VALUE, _PAD_VALUE))
    pad_x = (size - new_width) / 2.0
    pad_y = (size - new_height) / 2.0
    canvas.paste(resized, (int(round(pad_x)), int(round(pad_y))))
    return canvas, scale, pad_x, pad_y


def _decode_output(output: Any, conf_threshold: float) -> tuple[list[list[float]], list[float], list[int]]:
    """Terjemahkan output YOLO-ish menjadi (boxes xyxy, scores, class ids)."""
    import numpy as np

    data = np.asarray(output)
    if data.ndim == 3:
        data = data[0]
    if data.ndim != 2:
        raise DetectorError(f"output ONNX tidak didukung (shape={data.shape})")
    # Bentuk umum: (4+nc, N) [YOLOv8] atau (N, 4+nc) [YOLOv5-like].
    if data.shape[0] < data.shape[1]:
        data = data.transpose(1, 0)
    if data.shape[1] < 5:
        raise DetectorError(f"output ONNX tidak punya channel bbox+class (shape={data.shape})")

    boxes: list[list[float]] = []
    scores: list[float] = []
    class_ids: list[int] = []
    for row in data:
        class_scores = row[4:]
        class_id = int(np.argmax(class_scores))
        score = float(class_scores[class_id])
        if score < conf_threshold:
            continue
        cx, cy, w, h = (float(row[0]), float(row[1]), float(row[2]), float(row[3]))
        boxes.append([cx - w / 2.0, cy - h / 2.0, cx + w / 2.0, cy + h / 2.0])
        scores.append(score)
        class_ids.append(class_id)
    return boxes, scores, class_ids


def _nms(boxes: list[list[float]], scores: list[float], iou_threshold: float) -> list[int]:
    """Greedy NMS; mengembalikan indeks yang dipertahankan (skor turun)."""
    order = sorted(range(len(boxes)), key=lambda index: scores[index], reverse=True)
    keep: list[int] = []
    for index in order:
        box = boxes[index]
        if all(_iou(box, boxes[other]) <= iou_threshold for other in keep):
            keep.append(index)
    return keep


def _iou(a: list[float], b: list[float]) -> float:
    x1 = max(a[0], b[0])
    y1 = max(a[1], b[1])
    x2 = min(a[2], b[2])
    y2 = min(a[3], b[3])
    if x2 <= x1 or y2 <= y1:
        return 0.0
    intersection = (x2 - x1) * (y2 - y1)
    area_a = max(0.0, a[2] - a[0]) * max(0.0, a[3] - a[1])
    area_b = max(0.0, b[2] - b[0]) * max(0.0, b[3] - b[1])
    union = area_a + area_b - intersection
    if union <= 0.0:
        return 0.0
    return intersection / union
