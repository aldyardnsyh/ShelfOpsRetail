from __future__ import annotations

import pytest

from app.detector import Detection
from app.shelves import PriceObservation, analyze_shelves, cluster_rows, detect_gaps


def box(
    x1: float, x2: float, y1: float = 100.0, y2: float = 150.0, label: str = "SKU-001"
) -> Detection:
    return Detection(x1=x1, y1=y1, x2=x2, y2=y2, confidence=0.9, label=label)


def test_rows_are_clustered_by_y_center():
    boxes = [
        box(0, 100, 100, 150),
        box(100, 200, 102, 152),
        box(0, 100, 300, 350),
    ]
    rows = cluster_rows(boxes)
    assert len(rows) == 2
    assert len(rows[0]) == 2
    assert len(rows[1]) == 1


def test_gap_is_detected_and_converted_to_missing_facings():
    boxes = [
        box(0, 100),
        box(100, 200),
        box(400, 500),
        box(0, 100, 300, 350),
    ]
    result = analyze_shelves(boxes, image_width=600, image_height=400)

    assert result.facing_total == 4
    assert result.gap_count >= 1
    assert result.oos_count >= 2
    first_row = result.rows[0]
    assert first_row.gaps[0].estimated_missing == 2
    assert first_row.gaps[0].x1 == 200
    assert first_row.gaps[0].x2 == 400


def test_gap_below_threshold_is_not_counted():
    boxes = [box(0, 100), box(220, 320)]
    gaps, oos = detect_gaps(boxes, row_index=0, median_width=100)
    assert gaps == []
    assert oos == 0


def test_compliance_score_uses_weighted_formula():
    boxes = [box(0, 100), box(100, 200), box(400, 500), box(0, 100, 300, 350)]
    result = analyze_shelves(boxes, image_width=600, image_height=400)

    assert result.availability == pytest.approx(4 / 6, abs=1e-4)
    assert result.share_adherence == 1.0
    assert result.price_accuracy == 1.0
    assert result.compliance_score == 83


def test_share_adherence_penalises_label_drift():
    boxes = [box(index * 100, index * 100 + 100, label="A") for index in range(7)]
    boxes += [box(700 + index * 100, 800 + index * 100, label="B") for index in range(3)]
    result = analyze_shelves(
        boxes,
        image_width=1100,
        image_height=400,
        expected_share={"A": 0.5, "B": 0.5},
    )
    assert result.share_adherence == pytest.approx(0.8)
    assert result.compliance_score == 94


def test_price_accuracy_counts_mismatches():
    boxes = [box(0, 100), box(100, 200)]
    observations = [
        PriceObservation(price_idr=10000, reference_price_idr=10000),
        PriceObservation(price_idr=20000, reference_price_idr=10000),
    ]
    result = analyze_shelves(
        boxes,
        image_width=400,
        image_height=200,
        price_observations=observations,
    )
    assert result.price_accuracy == 0.5
    assert result.breakdown["price_tags_mismatch"] == 1
    assert result.compliance_score == 90


def test_unreadable_price_is_ignored_for_accuracy():
    boxes = [box(0, 100)]
    observations = [
        PriceObservation(price_idr=0, reference_price_idr=10000),
        PriceObservation(price_idr=9800, reference_price_idr=10000),
    ]
    result = analyze_shelves(
        boxes,
        image_width=400,
        image_height=200,
        price_observations=observations,
    )
    assert result.price_accuracy == 1.0


def test_empty_detections_score_zero():
    result = analyze_shelves([], image_width=640, image_height=480)
    assert result.compliance_score == 0
    assert result.facing_total == 0
    assert result.rows == ()


def test_invalid_dimensions_rejected():
    with pytest.raises(ValueError):
        analyze_shelves([], image_width=0, image_height=480)
