from __future__ import annotations

import grpc
import pytest
from shelfops.v1 import vision_pb2, vision_pb2_grpc

from app.detector import DetectorError
from app.ocr import StubOcrEngine
from app.pipeline import DetectionPipeline
from app.replay_detector import ReplayDetector
from app.service_grpc import create_grpc_server


def _pipeline(settings) -> DetectionPipeline:
    return DetectionPipeline(settings, ReplayDetector(), StubOcrEngine())


def test_grpc_health_over_real_server(settings):
    detector = ReplayDetector()
    server, port = create_grpc_server(
        settings, detector, _pipeline(settings), host="127.0.0.1", port=0
    )
    server.start()
    try:
        with grpc.insecure_channel(f"127.0.0.1:{port}") as channel:
            stub = vision_pb2_grpc.VisionServiceStub(channel)
            response = stub.Health(vision_pb2.HealthRequest(), timeout=5)
    finally:
        server.stop(0).wait(timeout=5)

    assert response.ready is True
    assert response.version == settings.version
    assert response.model_version == detector.model_version
    assert response.concurrency == settings.concurrency
    assert response.degradation == "L2"


def test_detect_missing_object_returns_error(settings):
    server, port = create_grpc_server(
        settings, ReplayDetector(), _pipeline(settings), host="127.0.0.1", port=0
    )
    server.start()
    try:
        with grpc.insecure_channel(f"127.0.0.1:{port}") as channel:
            stub = vision_pb2_grpc.VisionServiceStub(channel)
            response = stub.Detect(
                vision_pb2.DetectRequest(request_id="req-1", image_uri="missing.png"),
                timeout=5,
            )
    finally:
        server.stop(0).wait(timeout=5)

    assert response.request_id == "req-1"
    assert response.error
    assert response.model_version


def test_detect_batch_stream(settings):
    server, port = create_grpc_server(
        settings, ReplayDetector(), _pipeline(settings), host="127.0.0.1", port=0
    )
    server.start()
    try:
        with grpc.insecure_channel(f"127.0.0.1:{port}") as channel:
            stub = vision_pb2_grpc.VisionServiceStub(channel)
            batch = vision_pb2.DetectBatchRequest(
                batch_id="batch-1",
                requests=[
                    vision_pb2.DetectRequest(request_id="r1", image_uri="missing-a.png"),
                    vision_pb2.DetectRequest(request_id="r2", image_uri="missing-b.png"),
                ],
            )
            responses = list(stub.DetectBatch(iter([batch]), timeout=5))
    finally:
        server.stop(0).wait(timeout=5)

    assert len(responses) == 1
    assert responses[0].batch_id == "batch-1"
    assert [item.request_id for item in responses[0].responses] == ["r1", "r2"]


def test_onnx_slot_fails_loudly():
    with pytest.raises(DetectorError):
        from app.onnx_detector import OnnxDetector

        OnnxDetector()
