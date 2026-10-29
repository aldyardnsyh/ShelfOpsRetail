# ai-rag

Python service for ShelfOps ingestion, hybrid retrieval, and grounded chat.
Serves gRPC (`shelfops.v1.RagService`) and HTTP (health + debug) from one process.

## Run

```powershell
uv venv
uv pip install -e ".[dev]"
uv run python -m app.main --help

# both transports (gRPC :50051, HTTP :8081)
uv run python -m app.main --transport all

# only one
uv run python -m app.main --transport grpc
uv run python -m app.main --transport http
```

## Configuration

All settings use the `RAG_` prefix (`RAG_DATABASE_URL`, `RAG_GRPC_PORT`, ...).
Defaults target local development: Postgres on `localhost:55433`, replay LLM, hash embeddings.

## Endpoints

- gRPC: `Ingest` (server stream), `Chat` (server stream), `Search`, `Health`.
- HTTP: `GET /healthz`, `GET /readyz`, `POST /debug/search`.

## Tests

```powershell
uv run pytest
uv run ruff check .
uv run mypy app
```

Retrieval and ingest tests talk to the dev Postgres and are skipped when it is
unreachable. The dev container is `shelfops-pg-dev` on port `55433`.

## Implementation notes

- Storage uses the migration's `chunks` table (`chunks.embedding vector(1024)`),
  joining `documents` for titles. The request mentioned `kb_chunks`; the schema
  has no such table.
- The deterministic `hash` embedder produces 256-dim vectors. They are
  zero-padded to `RAG_VECTOR_DIM` (1024) before insert, which leaves cosine
  similarity unchanged.
- `RAG_REFUSE_THRESHOLD` is compared against the normalised RRF score of the top
  hit (the best hit is 1.0). `0` disables threshold-based refusal; "no hits"
  always refuses.
- `Ingest` always replaces the chunks of the requested document version
  (`force_reindex` is accepted but not needed in dev).
- Default ports are gRPC `50051` and HTTP `8081`. On Windows/Hyper-V, `50051`
  may fall inside a reserved port range; pass `--grpc-port`/`RAG_GRPC_PORT`.
