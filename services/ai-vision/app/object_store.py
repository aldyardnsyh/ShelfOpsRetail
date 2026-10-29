"""Read objects from the LocalFS object store by key (root-confined)."""

from __future__ import annotations

from pathlib import Path

from app.config import Settings


class ObjectNotFound(FileNotFoundError):
    pass


def load_object(settings: Settings, object_key: str) -> bytes:
    key = (object_key or "").strip()
    if not key:
        raise ValueError("image_uri is required")
    root = Path(settings.object_store_root).resolve()
    candidate = (root / key.replace("\\", "/")).resolve()
    try:
        candidate.relative_to(root)
    except ValueError as exc:
        raise ValueError("image_uri escapes the object store root") from exc
    if not candidate.is_file():
        raise ObjectNotFound(f"object not found: {key}")
    if candidate.stat().st_size > settings.max_image_bytes:
        raise ValueError(f"image exceeds {settings.max_image_bytes} bytes")
    return candidate.read_bytes()
