"""gRPC implementation of ``shelfops.v1.VisionService``."""

from __future__ import annotations

import logging
import time
from collections.abc import Iterator
from concurrent import futures

import grpc
from shelfops.v1 import vision_pb2, vision_pb2_grpc

from app.config import Settings
from app.detector import Detector, DetectorError
from app.object_store import ObjectNotFound, load_object
from app.ocr import OcrError, parse_reference_prices
from app.pipeline import DetectionOutcome, DetectionPipeline

logger = logging.getLogger(__name__)


class VisionServicer(vision_pb2_grpc.VisionServiceServicer):
    def __init__(
        self,
        settings: Settings,
        detector: Detector,
        pipeline: DetectionPipeline,
    ) -> None:
        self._settings = settings
        self._detector = detector
        self._pipeline = pipeline

    def Health(self, request, context) -> vision_pb2.VisionServiceHealthResponse:
        return vision_pb2.VisionServiceHealthResponse(
            ready=True,
            version=self._settings.version,
            model_version=self._detector.model_version,
            queue_depth=0,
            concurrency=self._settings.concurrency,
            degradation=self._detector.degradation,
        )

    def Detect(self, request, context) -> vision_pb2.DetectResponse:
        return self._detect(request)

    def DetectBatch(self, request_iterator, context) -> Iterator[vision_pb2.DetectBatchResponse]:
        for batch in request_iterator:
            started = time.perf_counter()
            responses = [self._detect(request) for request in batch.requests]
            latency_ms = max(0, round((time.perf_counter() - started) * 1000))
            logger.info(
                "detect_batch_done",
                extra={
                    "batch_id": batch.batch_id,
                    "images": len(responses),
                    "latency_ms": latency_ms,
                },
            )
            yield vision_pb2.DetectBatchResponse(
                responses=responses,
                batch_id=batch.batch_id,
                batch_latency_ms=latency_ms,
            )

    def _detect(self, request) -> vision_pb2.DetectResponse:
        started = time.perf_counter()
        request_id = request.request_id
        try:
            image = load_object(self._settings, request.image_uri)
        except (ObjectNotFound, ValueError) as exc:
            logger.warning(
                "detect_failed",
                extra={"request_id": request_id, "error": str(exc)},
            )
            return vision_pb2.DetectResponse(
                request_id=request_id,
                model_version=self._detector.model_version,
                latency_ms=_elapsed_ms(started),
                error=str(exc),
            )

        try:
            outcome = self._pipeline.run(
                image,
                imgsz=request.imgsz,
                conf_threshold=request.conf_threshold,
                candidate_labels=request.candidate_labels,
                run_ocr=request.run_ocr,
                reference_prices=parse_reference_prices(request.reference_prices_json),
            )
        except (DetectorError, OcrError, ValueError, OSError) as exc:
            logger.warning(
                "detect_failed",
                extra={"request_id": request_id, "error": str(exc)},
            )
            return vision_pb2.DetectResponse(
                request_id=request_id,
                model_version=self._detector.model_version,
                latency_ms=_elapsed_ms(started),
                error=str(exc),
            )

        response = outcome_to_proto(outcome, request_id=request_id)
        logger.info(
            "detect_done",
            extra={
                "request_id": request_id,
                "workspace_id": request.workspace_id,
                "boxes": len(outcome.result.boxes),
                "oos": outcome.shelves.oos_count,
                "score": outcome.shelves.compliance_score,
                "low_confidence": outcome.low_confidence,
                "latency_ms": response.latency_ms,
            },
        )
        return response


def outcome_to_proto(
    outcome: DetectionOutcome,
    *,
    request_id: str,
) -> vision_pb2.DetectResponse:
    result = outcome.result
    return vision_pb2.DetectResponse(
        request_id=request_id,
        boxes=[_box_to_proto(box) for box in result.boxes],
        price_tags=[
            vision_pb2.PriceTag(
                box=_box_to_proto(tag.detection),
                raw_text=tag.read.raw_text,
                price_idr=tag.read.price_idr,
                ocr_confidence=tag.read.confidence,
                matched_label=tag.matched_label,
                reference_price_idr=tag.reference_price_idr or 0,
                mismatch=tag.mismatch,
            )
            for tag in outcome.price_tags
        ],
        width=result.width,
        height=result.height,
        model_version=result.model_version,
        latency_ms=outcome.latency_ms,
        low_confidence=outcome.low_confidence,
    )


def _box_to_proto(box) -> vision_pb2.Box:
    return vision_pb2.Box(
        x1=box.x1,
        y1=box.y1,
        x2=box.x2,
        y2=box.y2,
        confidence=box.confidence,
        label=box.label,
        label_score=box.label_score,
        class_id=box.class_id,
    )


def _elapsed_ms(started: float) -> int:
    return max(0, round((time.perf_counter() - started) * 1000))


def create_grpc_server(
    settings: Settings,
    detector: Detector,
    pipeline: DetectionPipeline,
    *,
    host: str | None = None,
    port: int | None = None,
) -> tuple[grpc.Server, int]:
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=settings.grpc_workers))
    vision_pb2_grpc.add_VisionServiceServicer_to_server(
        VisionServicer(settings, detector, pipeline), server
    )
    bound_port = server.add_insecure_port(
        f"{host or settings.grpc_host}:{port if port is not None else settings.grpc_port}"
    )
    if bound_port == 0:
        raise RuntimeError("failed to bind gRPC port")
    return server, bound_port
