from __future__ import annotations

from conftest import make_png

from app.replay_detector import ReplayDetector, image_dimensions


def test_same_image_produces_identical_detections():
    detector = ReplayDetector()
    image = make_png(80, 60)
    first = detector.detect(image, imgsz=640, conf_threshold=0.0)
    second = detector.detect(image, imgsz=640, conf_threshold=0.0)

    assert first == second
    assert first.width == 80
    assert first.height == 60
    assert first.boxes
    assert first.model_version == "replay-yolo-placeholder-v1"


def test_different_images_produce_different_layouts():
    detector = ReplayDetector()
    first = detector.detect(make_png(80, 60), imgsz=640, conf_threshold=0.0)
    second = detector.detect(b"not-an-image-but-deterministic", imgsz=640, conf_threshold=0.0)
    assert first.boxes != second.boxes


def test_boxes_stay_inside_image_bounds():
    detector = ReplayDetector()
    result = detector.detect(make_png(64, 48), imgsz=640, conf_threshold=0.0)
    for box in result.boxes:
        assert 0 <= box.x1 < box.x2 <= result.width
        assert 0 <= box.y1 < box.y2 <= result.height


def test_candidate_labels_are_used():
    detector = ReplayDetector()
    result = detector.detect(
        make_png(64, 48),
        imgsz=640,
        conf_threshold=0.0,
        candidate_labels=("INDOMILK", "AQUA"),
    )
    assert {box.label for box in result.boxes} <= {"INDOMILK", "AQUA"}


def test_confidence_threshold_filters_boxes():
    detector = ReplayDetector()
    image = make_png(64, 48)
    all_boxes = detector.detect(image, imgsz=640, conf_threshold=0.0).boxes
    high = detector.detect(image, imgsz=640, conf_threshold=0.8).boxes
    assert len(high) <= len(all_boxes)
    assert all(box.confidence >= 0.8 for box in high)


def test_png_dimensions_are_parsed():
    assert image_dimensions(make_png(123, 45)) == (123, 45)
    assert image_dimensions(b"garbage") is None
