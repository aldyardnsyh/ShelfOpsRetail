"""Klien HTTP minimal (stdlib) untuk memanggil endpoint openai-compatible.

 Sengaja tanpa dependensi tambahan: ai-rag tidak menarik httpx/requests ke
 runtime image. Test menyuntik transport sendiri lewat ``post_json``.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any


class HttpError(RuntimeError):
    """Kegagalan HTTP yang bisa dibaca operator (status + potongan body)."""

    def __init__(self, message: str, *, status: int | None = None, body: str = "") -> None:
        super().__init__(message)
        self.status = status
        self.body = body


def post_json(
    url: str,
    payload: dict[str, Any],
    *,
    headers: dict[str, str] | None = None,
    timeout: float = 30.0,
) -> dict[str, Any]:
    """POST JSON dan kembalikan body JSON sebagai dict.

    Kegagalan apa pun (DNS, TLS, timeout, HTTP non-2xx, body non-JSON)
    dilempar sebagai ``HttpError`` supaya lapisan atas bisa melaporkannya
    sebagai error jujur, bukan diam-diam memakai provider tiruan.
    """
    data = json.dumps(payload).encode("utf-8")
    request_headers = {"Content-Type": "application/json", "Accept": "application/json"}
    request_headers.update(headers or {})
    request = urllib.request.Request(url, data=data, method="POST", headers=request_headers)

    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310
            body = response.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as exc:  # status non-2xx
        detail = exc.read().decode("utf-8", "replace")[:500]
        raise HttpError(f"HTTP {exc.code} dari {url}: {detail}", status=exc.code, body=detail) from exc
    except urllib.error.URLError as exc:
        raise HttpError(f"gagal menghubungi {url}: {exc.reason}") from exc
    except TimeoutError as exc:
        raise HttpError(f"timeout {timeout}s saat memanggil {url}") from exc
    except OSError as exc:  # pragma: no cover - bergantung pada OS
        raise HttpError(f"kegagalan jaringan saat memanggil {url}: {exc}") from exc

    try:
        parsed = json.loads(body)
    except json.JSONDecodeError as exc:
        raise HttpError(f"respons non-JSON dari {url}: {body[:200]}") from exc
    if not isinstance(parsed, dict):
        raise HttpError(f"respons JSON dari {url} bukan objek")
    return parsed
