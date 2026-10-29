"""Shelf geometry: row clustering, gap/OOS detection, compliance score.

Pure functions over detections — no I/O, no model, fully unit-testable.
Rules follow the implementation plan: rows are clustered on y-center with a
tolerance of 0.6 x median box height; a horizontal gap wider than 1.5 x median
box width is missing facings = round(gap / width).
"""

from __future__ import annotations

from collections import Counter
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from itertools import pairwise
from statistics import median

from app.detector import Detection

ROW_TOLERANCE_FACTOR = 0.6
GAP_FACTOR = 1.5
WEIGHT_AVAILABILITY = 0.5
WEIGHT_SHARE = 0.3
WEIGHT_PRICE = 0.2


@dataclass(frozen=True)
class PriceObservation:
    price_idr: int
    reference_price_idr: int | None = None

    @property
    def readable(self) -> bool:
        return self.price_idr > 0

    @property
    def mismatch(self) -> bool:
        if not self.readable or not self.reference_price_idr:
            return False
        tolerance = max(500, self.reference_price_idr * 0.05)
        return abs(self.price_idr - self.reference_price_idr) > tolerance


@dataclass(frozen=True)
class ShelfGap:
    row_index: int
    x1: float
    x2: float
    width: float
    estimated_missing: int


@dataclass(frozen=True)
class ShelfRow:
    index: int
    y1: float
    y2: float
    boxes: tuple[Detection, ...]
    median_width: float
    gaps: tuple[ShelfGap, ...]
    oos_count: int


@dataclass(frozen=True)
class ShelfAnalysis:
    rows: tuple[ShelfRow, ...]
    facing_total: int
    oos_count: int
    gap_count: int
    availability: float
    share_adherence: float
    price_accuracy: float
    compliance_score: int
    breakdown: Mapping[str, float] = field(default_factory=dict)


def analyze_shelves(
    boxes: Sequence[Detection],
    *,
    image_width: int,
    image_height: int,
    expected_share: Mapping[str, float] | None = None,
    price_observations: Sequence[PriceObservation] = (),
) -> ShelfAnalysis:
    if image_width <= 0 or image_height <= 0:
        raise ValueError("image dimensions must be positive")

    groups = cluster_rows(boxes)
    rows: list[ShelfRow] = []
    total_oos = 0
    for index, group in enumerate(groups):
        ordered = tuple(sorted(group, key=lambda box: (box.x1, box.y1)))
        widths = [box.width for box in ordered if box.width > 0]
        median_width = float(median(widths)) if widths else 0.0
        gaps, oos = detect_gaps(ordered, row_index=index, median_width=median_width)
        total_oos += oos
        rows.append(
            ShelfRow(
                index=index,
                y1=min(box.y1 for box in ordered),
                y2=max(box.y2 for box in ordered),
                boxes=ordered,
                median_width=median_width,
                gaps=tuple(gaps),
                oos_count=oos,
            )
        )

    facing_total = sum(len(row.boxes) for row in rows)
    if facing_total == 0:
        return ShelfAnalysis(
            rows=(),
            facing_total=0,
            oos_count=0,
            gap_count=0,
            availability=0.0,
            share_adherence=0.0,
            price_accuracy=0.0,
            compliance_score=0,
            breakdown={
                "availability": 0.0,
                "share_adherence": 0.0,
                "price_accuracy": 0.0,
            },
        )

    availability = facing_total / (facing_total + total_oos) if total_oos else 1.0
    share_adherence = _share_adherence(list(boxes), expected_share)
    readable = [observation for observation in price_observations if observation.readable]
    if readable:
        mismatches = sum(1 for observation in readable if observation.mismatch)
        price_accuracy = (len(readable) - mismatches) / len(readable)
    else:
        mismatches = 0
        price_accuracy = 1.0

    score = round(
        100
        * (
            WEIGHT_AVAILABILITY * availability
            + WEIGHT_SHARE * share_adherence
            + WEIGHT_PRICE * price_accuracy
        )
    )
    score = max(0, min(100, score))
    gaps_total = sum(len(row.gaps) for row in rows)

    return ShelfAnalysis(
        rows=tuple(rows),
        facing_total=facing_total,
        oos_count=total_oos,
        gap_count=gaps_total,
        availability=round(availability, 4),
        share_adherence=round(share_adherence, 4),
        price_accuracy=round(price_accuracy, 4),
        compliance_score=score,
        breakdown={
            "availability": round(availability, 4),
            "share_adherence": round(share_adherence, 4),
            "price_accuracy": round(price_accuracy, 4),
            "facing_total": facing_total,
            "oos_count": total_oos,
            "gap_count": gaps_total,
            "price_tags_read": len(readable),
            "price_tags_mismatch": mismatches,
        },
    )


def cluster_rows(boxes: Sequence[Detection]) -> list[list[Detection]]:
    if not boxes:
        return []
    heights = [box.height for box in boxes if box.height > 0]
    median_height = float(median(heights)) if heights else 1.0
    tolerance = ROW_TOLERANCE_FACTOR * median_height

    ordered = sorted(boxes, key=lambda box: (box.cy, box.cx))
    rows: list[list[Detection]] = []
    current: list[Detection] = []
    center = 0.0

    for box in ordered:
        if not current or abs(box.cy - center) <= tolerance:
            current.append(box)
            center = sum(item.cy for item in current) / len(current)
        else:
            rows.append(current)
            current = [box]
            center = box.cy
    if current:
        rows.append(current)
    return rows


def detect_gaps(
    ordered_boxes: Sequence[Detection],
    *,
    row_index: int,
    median_width: float,
) -> tuple[list[ShelfGap], int]:
    if median_width <= 0 or len(ordered_boxes) < 2:
        return [], 0
    gaps: list[ShelfGap] = []
    oos = 0
    for left, right in pairwise(ordered_boxes):
        width = right.x1 - left.x2
        if width > GAP_FACTOR * median_width:
            missing = max(1, round(width / median_width))
            gaps.append(
                ShelfGap(
                    row_index=row_index,
                    x1=left.x2,
                    x2=right.x1,
                    width=round(width, 2),
                    estimated_missing=missing,
                )
            )
            oos += missing
    return gaps, oos


def _share_adherence(
    boxes: Sequence[Detection],
    expected_share: Mapping[str, float] | None,
) -> float:
    if not expected_share:
        return 1.0
    total_weight = sum(max(0.0, weight) for weight in expected_share.values())
    if total_weight <= 0:
        return 1.0

    counts = Counter(box.label for box in boxes if box.label)
    total = sum(counts.values())
    if total == 0:
        return 0.0

    labels = set(expected_share) | set(counts)
    distance = 0.0
    for label in labels:
        expected = max(0.0, expected_share.get(label, 0.0)) / total_weight
        observed = counts.get(label, 0) / total
        distance += abs(observed - expected)
    return max(0.0, min(1.0, 1.0 - 0.5 * distance))
