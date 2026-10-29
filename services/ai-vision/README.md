# ai-vision

Python service for shelf detection and audit geometry. Serves gRPC
(`shelfops.v1.VisionService`) and HTTP (health + debug upload) from one process.

## Run

```powershell
uv venv
uv pip install -e ".[dev]"
uv run python -m app.main --help

# both transports (gRPC :50052, HTTP :8082)
uv run python -m app.main --transport all

# only one
uv run python -m app.main --transport grpc
uv run python -m app.main --transport http
```

## Configuration

All settings use the `VISION_` prefix (`VISION_GRPC_PORT`, `VISION_OBJECT_STORE_ROOT`, ...).
The bundled detector is deterministic replay (`VISION_DETECTOR=replay`); the ONNX
slot is documented but not implemented until trained weights exist (D-014).

## Endpoints

- gRPC: `Detect`, `DetectBatch` (bidirectional stream), `Health`.
- HTTP: `GET /healthz`, `GET /readyz`, `POST /debug/detect` (multipart file upload).

## Tests

```powershell
uv run pytest
uv run ruff check .
uv run mypy app
```

## Implementation notes

- `ReplayDetector` derives a synthetic shelf layout from a BLAKE2b hash of the
  image bytes: 3-5 rows, 5-7 slots per row, occasional 3-slot gaps. It is
  deterministic but decorative — it is not a trained model and reports
  degradation `L2`.
- Geometry follows the plan: rows cluster on y-center (tolerance `0.6 x`
  median height), gaps wider than `1.5 x` median width are missing facings
  (`round(gap / width)`), and the score is
  `100 x (0.5 availability + 0.3 share_adherence + 0.2 price_accuracy)`.
- `VISION_OCR_ENGINE=stub` returns deterministic placeholder prices. PaddleOCR
  and ONNX detectors raise instead of pretending to run.
- Default ports are gRPC `50052` and HTTP `8082`. On Windows/Hyper-V, `50052`
  may fall inside a reserved port range; pass `--grpc-port`/`VISION_GRPC_PORT`.
