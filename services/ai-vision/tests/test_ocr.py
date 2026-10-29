from __future__ import annotations

from app.detector import Detection
from app.ocr import StubOcrEngine, parse_reference_prices


def _box(label: str = "SKU-001") -> Detection:
    return Detection(x1=10, y1=20, x2=110, y2=60, confidence=0.9, label=label)


def test_stub_ocr_is_deterministic():
    engine = StubOcrEngine()
    first = engine.read(_box(), image_digest=b"digest")
    second = engine.read(_box(), image_digest=b"digest")
    assert first == second


def test_stub_ocr_moves_with_box_or_label():
    engine = StubOcrEngine()
    first = engine.read(_box("A"), image_digest=b"digest")
    second = engine.read(_box("B"), image_digest=b"digest")
    assert (first.price_idr, first.raw_text) != (second.price_idr, second.raw_text)


def test_stub_ocr_output_shape():
    engine = StubOcrEngine()
    result = engine.read(_box(), image_digest=b"digest")
    if result.price_idr:
        assert result.price_idr % 500 == 0
        assert 10 <= result.price_idr // 500 <= 150
        assert result.raw_text.startswith("Rp ")
        assert 0.72 <= result.confidence <= 0.98


def test_reference_prices_parser_is_lenient():
    assert parse_reference_prices('{"SKU-001": 12500, "SKU-002": "x"}') == {"SKU-001": 12500}
    assert parse_reference_prices("not json") == {}
    assert parse_reference_prices("") == {}
