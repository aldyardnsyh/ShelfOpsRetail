from __future__ import annotations

import json

from conftest import make_png
from fastapi.testclient import TestClient

from app.api_http import create_app
from app.ocr import StubOcrEngine
from app.pipeline import DetectionPipeline
from app.replay_detector import ReplayDetector


def _client(settings) -> TestClient:
    detector = ReplayDetector()
    pipeline = DetectionPipeline(settings, detector, StubOcrEngine())
    return TestClient(create_app(settings, detector=detector, pipeline=pipeline))


def test_health_and_ready(settings):
    client = _client(settings)
    assert client.get("/healthz").json()["status"] == "ok"
    ready = client.get("/readyz").json()
    assert ready["status"] == "ready"
    assert ready["detector"] == "replay"
    assert ready["degradation"] == "L2"


def test_debug_detect_returns_boxes_and_shelves(settings):
    client = _client(settings)
    response = client.post(
        "/debug/detect",
        files={"file": ("shelf.png", make_png(96, 72), "image/png")},
        data={"run_ocr": "true", "reference_prices_json": json.dumps({"SKU-001": 10000})},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["width"] == 96
    assert body["height"] == 72
    assert body["boxes"]
    assert body["price_tags"]
    assert "compliance_score" in body["shelves"]
    assert body["shelves"]["facing_total"] == len(body["boxes"])


def test_debug_detect_rejects_empty_upload(settings):
    client = _client(settings)
    response = client.post(
        "/debug/detect",
        files={"file": ("empty.png", b"", "image/png")},
    )
    assert response.status_code == 400


def test_debug_detect_rejects_non_image(settings):
    client = _client(settings)
    response = client.post(
        "/debug/detect",
        files={"file": ("notes.txt", b"hello", "text/plain")},
    )
    assert response.status_code == 415
