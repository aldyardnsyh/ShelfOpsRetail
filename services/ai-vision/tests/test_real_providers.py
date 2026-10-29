"""Test lane provider nyata (detektor ONNX, OCR rapidocr/cloud, VLM).

Fokus: pemilihan provider dari env, error jujur saat konfigurasi/bobot kurang,
dan tidak ada fallback diam-diam ke provider tiruan.
"""

from __future__ import annotations

import io

import pytest
from PIL import Image

from app.config import Settings
from app.detector import DetectorError, build_detector
from app.ocr import OcrError, build_ocr_engine
from app.vlm import VlmClient, VlmError, _parse_price_payload


def _png_bytes(width: int = 32, height: int = 24) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (width, height), (10, 20, 30)).save(buffer, format="PNG")
    return buffer.getvalue()


# ---------------------------------------------------------------------------
# Detektor
# ---------------------------------------------------------------------------


def test_detector_replay_is_still_available():
    detector = build_detector(Settings(detector="replay"))
    assert detector.name == "replay"


def test_detector_onnx_selected_from_env():
    detector = build_detector(Settings(detector="onnx", model_dir="/models", model_version="v1"))
    assert detector.name == "onnx"


def test_detector_unknown_is_honest_error():
    with pytest.raises(DetectorError):
        build_detector(Settings(detector="yolo-khodam"))


def test_onnx_detector_without_weights_reports_honestly():
    detector = build_detector(Settings(detector="onnx", model_dir="/models/does-not-exist"))
    with pytest.raises(DetectorError) as excinfo:
        detector.detect(_png_bytes(), imgsz=640, conf_threshold=0.25)
    message = str(excinfo.value)
    assert "bobot ONNX belum ada" in message or "belum dikonfigurasi" in message


def test_model_path_resolution():
    settings = Settings(detector="onnx", model_dir="/models", model_version="yolo-v2")
    assert settings.resolved_model_path() == "/models/yolo-v2.onnx"

    explicit = Settings(detector="onnx", model_path="/models/custom.onnx")
    assert explicit.resolved_model_path() == "/models/custom.onnx"


# ---------------------------------------------------------------------------
# OCR
# ---------------------------------------------------------------------------


def test_stub_ocr_still_available():
    engine = build_ocr_engine(Settings(ocr_engine="stub"))
    assert engine.name == "stub"


def test_rapidocr_engine_selected():
    engine = build_ocr_engine(Settings(ocr_engine="rapidocr"))
    assert engine.name == "rapidocr"


def test_cloud_ocr_requires_vlm_provider():
    with pytest.raises(OcrError) as excinfo:
        build_ocr_engine(Settings(ocr_engine="cloud", vlm_provider="off"))
    assert "VLM_PROVIDER" in str(excinfo.value)


def test_cloud_ocr_requires_vlm_credentials():
    with pytest.raises(OcrError):
        build_ocr_engine(
            Settings(
                ocr_engine="cloud",
                vlm_provider="openai-compatible",
                vlm_base_url="",
                vlm_api_key="",
                vlm_model="",
            )
        )


def test_unknown_ocr_engine_is_honest_error():
    with pytest.raises(OcrError):
        build_ocr_engine(Settings(ocr_engine="patani"))


def test_rapidocr_without_dependency_reports_honestly():
    engine = build_ocr_engine(Settings(ocr_engine="rapidocr"))
    from app.detector import Detection

    box = Detection(x1=0, y1=0, x2=10, y2=10, confidence=0.9, label="SKU-001")
    try:
        import rapidocr_onnxruntime  # noqa: F401
    except ImportError:
        with pytest.raises(OcrError) as excinfo:
            engine.read(box, image_digest=b"digest", image=_png_bytes())
        assert "rapidocr" in str(excinfo.value)


# ---------------------------------------------------------------------------
# VLM
# ---------------------------------------------------------------------------


def test_vlm_requires_base_url_and_model():
    with pytest.raises(VlmError):
        VlmClient(base_url="", api_key="k", model="m")
    with pytest.raises(VlmError):
        VlmClient(base_url="https://x/v1", api_key="k", model="")


def test_vlm_parses_json_payload():
    read = _parse_price_payload('{"raw_text": "Rp 12.500", "price_idr": 12500, "confidence": 0.9}')
    assert read is not None
    assert read.price_idr == 12500
    assert read.raw_text == "Rp 12.500"


def test_vlm_parses_plain_text_price():
    read = _parse_price_payload("harga Rp 25.000 saja")
    assert read is not None
    assert read.price_idr == 25000


def test_vlm_without_price_is_honest_error():
    assert _parse_price_payload("tidak ada harga") is None


def test_vlm_client_calls_chat_completions(monkeypatch):
    from app import vlm as module

    calls: list[tuple[str, dict]] = []

    def fake_post(url, payload, *, headers=None, timeout=30.0):
        calls.append((url, payload))
        return {
            "choices": [
                {"message": {"content": '{"raw_text": "Rp 9.000", "price_idr": 9000, "confidence": 0.8}'}}
            ]
        }

    monkeypatch.setattr(module, "post_json", fake_post)
    client = VlmClient(base_url="https://vlm.example.com/v1", api_key="k", model="vision-model")
    read = client.read_price(_png_bytes())
    assert read.price_idr == 9000
    assert calls[0][0] == "https://vlm.example.com/v1/chat/completions"
    assert calls[0][1]["model"] == "vision-model"


def test_vlm_client_reports_transport_failure(monkeypatch):
    from app import vlm as module
    from app.http_client import HttpError

    def fake_post(url, payload, *, headers=None, timeout=30.0):
        raise HttpError("VLM down")

    monkeypatch.setattr(module, "post_json", fake_post)
    client = VlmClient(base_url="https://vlm.example.com/v1", api_key="k", model="vision-model")
    with pytest.raises(VlmError) as excinfo:
        client.read_price(_png_bytes())
    assert "VLM down" in str(excinfo.value)
