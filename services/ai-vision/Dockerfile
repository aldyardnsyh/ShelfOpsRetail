# syntax=docker/dockerfile:1.7
FROM python:3.11-slim AS builder

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never

RUN pip install --no-cache-dir "uv==0.13.1"

WORKDIR /app

COPY pyproject.toml uv.lock README.md ./
RUN uv sync --frozen --no-dev --no-install-project

COPY app ./app
COPY gen ./gen

FROM python:3.11-slim AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH=/app:/app/gen \
    PATH="/app/.venv/bin:$PATH" \
    XDG_CACHE_HOME=/tmp/.cache

RUN groupadd --gid 1001 shelfops \
    && useradd --uid 1001 --gid shelfops --no-create-home --home-dir /app \
       --shell /usr/sbin/nologin shelfops

WORKDIR /app

COPY --from=builder --chown=1001:1001 /app/.venv /app/.venv
COPY --from=builder --chown=1001:1001 /app/app /app/app
COPY --from=builder --chown=1001:1001 /app/gen /app/gen

USER 1001:1001

EXPOSE 50052 8082

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8082/healthz', timeout=3)" || exit 1

CMD ["python", "-m", "app.main", "--transport", "all"]
