"""FastAPI HTTP surface: health probes and debug detect upload."""

from __future__ import annotations

from dataclasses import asdict
from typing import Annotated

from fastapi import FastAPI, File, Form, HTTPException, UploadFile

from app.config import Settings, get_settings
from app.detector import Detector, build_detector
from app.ocr import OcrError, build_ocr_engine, parse_reference_prices
from app.pipeline import DetectionOutcome, DetectionPipeline


def create_app(
    settings: Settings | None = None,
    *,
    detector: Detector | None = None,
    pipeline: DetectionPipeline | None = None,
) -> FastAPI:
    settings = settings or get_settings()
    detector = detector or build_detector(settings)
    if pipeline is None:
        try:
            ocr = build_ocr_engine(settings)
        except OcrError:
            ocr = build_ocr_engine(settings.model_copy(update={"ocr_engine": "stub"}))
        pipeline = DetectionPipeline(settings, detector, ocr)

    app = FastAPI(
        title="ShelfOps ai-vision",
        version=settings.version,
        docs_url="/docs",
        openapi_url="/openapi.json",
    )
    app.state.settings = settings
    app.state.detector = detector
    app.state.pipeline = pipeline

    @app.get("/healthz")
    def healthz() -> dict[str, str]:
        return {
            "status": "ok",
            "service": settings.service_name,
            "version": settings.version,
        }

    @app.get("/readyz")
    def readyz() -> dict[str, object]:
        return {
            "status": "ready",
            "detector": detector.name,
            "model_version": detector.model_version,
            "degradation": detector.degradation,
            "concurrency": settings.concurrency,
            "version": settings.version,
        }

    @app.post("/debug/detect")
    def debug_detect(
        file: Annotated[UploadFile, File()],
        imgsz: Annotated[int, Form()] = 0,
        conf_threshold: Annotated[float, Form()] = 0.0,
        run_ocr: Annotated[bool, Form()] = False,
        candidate_labels: Annotated[str, Form()] = "",
        reference_prices_json: Annotated[str, Form()] = "",
    ) -> dict[str, object]:
        payload = file.file.read()
        if not payload:
            raise HTTPException(status_code=400, detail="empty file")
        if len(payload) > settings.max_image_bytes:
            raise HTTPException(
                status_code=413,
                detail=f"image exceeds {settings.max_image_bytes} bytes",
            )
        if file.content_type and not file.content_type.startswith("image/"):
            raise HTTPException(status_code=415, detail="expected an image upload")

        labels = tuple(label.strip() for label in candidate_labels.split(",") if label.strip())
        try:
            outcome = pipeline.run(
                payload,
                imgsz=imgsz,
                conf_threshold=conf_threshold,
                candidate_labels=labels,
                run_ocr=run_ocr,
                reference_prices=parse_reference_prices(reference_prices_json),
            )
        except Exception as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc

        return outcome_to_json(outcome, request_id=f"debug-{file.filename or 'upload'}")

    return app


def outcome_to_json(outcome: DetectionOutcome, *, request_id: str) -> dict[str, object]:
    result = outcome.result
    shelves = outcome.shelves
    return {
        "request_id": request_id,
        "width": result.width,
        "height": result.height,
        "model_version": result.model_version,
        "latency_ms": outcome.latency_ms,
        "low_confidence": outcome.low_confidence,
        "boxes": [
            {
                "x1": box.x1,
                "y1": box.y1,
                "x2": box.x2,
                "y2": box.y2,
                "confidence": box.confidence,
                "label": box.label,
                "label_score": box.label_score,
                "class_id": box.class_id,
            }
            for box in result.boxes
        ],
        "price_tags": [
            {
                "box": {
                    "x1": tag.detection.x1,
                    "y1": tag.detection.y1,
                    "x2": tag.detection.x2,
                    "y2": tag.detection.y2,
                },
                "raw_text": tag.read.raw_text,
                "price_idr": tag.read.price_idr,
                "ocr_confidence": tag.read.confidence,
                "matched_label": tag.matched_label,
                "reference_price_idr": tag.reference_price_idr,
                "mismatch": tag.mismatch,
            }
            for tag in outcome.price_tags
        ],
        "shelves": {
            "facing_total": shelves.facing_total,
            "oos_count": shelves.oos_count,
            "gap_count": shelves.gap_count,
            "compliance_score": shelves.compliance_score,
            "availability": shelves.availability,
            "share_adherence": shelves.share_adherence,
            "price_accuracy": shelves.price_accuracy,
            "breakdown": dict(shelves.breakdown),
            "rows": [
                {
                    "index": row.index,
                    "y1": row.y1,
                    "y2": row.y2,
                    "box_count": len(row.boxes),
                    "median_width": row.median_width,
                    "oos_count": row.oos_count,
                    "gaps": [asdict(gap) for gap in row.gaps],
                }
                for row in shelves.rows
            ],
        },
    }
