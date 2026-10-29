from __future__ import annotations

import binascii
import struct
import zlib

import pytest

from app.config import Settings


@pytest.fixture
def settings() -> Settings:
    return Settings(
        model_imgsz=640,
        conf_threshold=0.25,
        low_conf_threshold=0.6,
        concurrency=2,
    )


def make_png(width: int = 64, height: int = 48) -> bytes:
    raw = b"".join(b"\x00" + bytes([40, 90, 140]) * width for _ in range(height))

    def chunk(kind: bytes, data: bytes) -> bytes:
        checksum = binascii.crc32(kind + data) & 0xFFFFFFFF
        return len(data).to_bytes(4, "big") + kind + data + checksum.to_bytes(4, "big")

    header = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(raw))
        + chunk(b"IEND", b"")
    )
