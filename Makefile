# ShelfOps — Makefile (Linux/macOS/CI/VPS).
# Di Windows tanpa `make`, pakai `npm run <script>` di root (lihat README).

SHELL := /bin/bash
COMPOSE_DEV := docker compose -f infra/docker-compose.dev.yml
COMPOSE_PROD := docker compose --env-file .env -f infra/docker-compose.prod.yml

# Dibangun di shell agar tidak ada URL ber-kredensial literal di file ini.
DEV_DATABASE_URL = DATABASE_URL="$${DATABASE_URL:-$$(printf 'postgres://%s:%s@%s:%s/%s?sslmode=disable' shelfops shelfops_dev_password localhost 55433 shelfops)}"

.PHONY: help
help:
	@grep -E '^[a-zA-Z0-9_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2}'

.PHONY: bootstrap
bootstrap: ## Install semua dependency (node, go, python)
	npm ci
	cd services/gateway && go mod download
	cd services/ai-rag && uv sync --frozen
	cd services/ai-vision && uv sync --frozen

.PHONY: dev
dev: ## Jalankan Postgres dev (stack aplikasi dijalankan terpisah)
	$(COMPOSE_DEV) up -d
	@echo "postgres: localhost:55433 (shelfops/shelfops_dev_password)"
	@echo "api: make serve   web: npm run dev"

.PHONY: down
down: ## Hentikan stack dev
	$(COMPOSE_DEV) down

.PHONY: logs
logs: ## Tail log stack dev
	$(COMPOSE_DEV) logs -f --tail=100

.PHONY: dev-db-up
dev-db-up: ## Hanya Postgres dev (port 55433)
	$(COMPOSE_DEV) up -d postgres
	@echo "postgres dev siap di localhost:55433"

.PHONY: db-up
db-up: dev-db-up ## Alias lama untuk dev-db-up

.PHONY: migrate
migrate: ## Terapkan migrasi DB (dev)
	cd services/gateway && $(DEV_DATABASE_URL) go run ./cmd/shelfops migrate up

.PHONY: migrate-down
migrate-down: ## Rollback 1 migrasi
	cd services/gateway && $(DEV_DATABASE_URL) go run ./cmd/shelfops migrate down 1

.PHONY: seed
seed: ## Seed data fiktif
	cd services/gateway && $(DEV_DATABASE_URL) go run ./cmd/shelfops seed

.PHONY: serve
serve: ## Jalankan gateway+worker lokal (butuh Postgres dev)
	cd services/gateway && $(DEV_DATABASE_URL) go run ./cmd/shelfops serve

.PHONY: contracts
contracts: ## Generate TS client dari OpenAPI + lint proto
	npm run gen:api
	cd proto && buf lint && buf breaking --against '../.git#branch=main,subdir=proto' || true

.PHONY: test
test: test-go test-py test-web ## Semua unit test

.PHONY: check-secrets
check-secrets: ## Cek file privat / pola rahasia sebelum commit
	node scripts/check-secrets.mjs

.PHONY: test-go
test-go:
	cd services/gateway && go test ./... -race

.PHONY: test-go-integration
test-go-integration: ## Butuh Postgres (make dev-db-up)
	cd services/gateway && $(DEV_DATABASE_URL) go test ./internal/store/... -tags=integration -race

.PHONY: test-py
test-py:
	cd services/ai-rag && uv run pytest -q
	cd services/ai-vision && uv run pytest -q

.PHONY: test-web
test-web:
	npm run test --workspace apps/web

.PHONY: e2e
e2e: ## Playwright (butuh stack dev hidup)
	npm run e2e --workspace apps/web

.PHONY: lint
lint: ## Lint semua bahasa
	cd services/gateway && go vet ./...
	cd services/ai-rag && uv run ruff check . && uv run mypy app
	cd services/ai-vision && uv run ruff check . && uv run mypy app
	npm run lint --workspaces --if-present

.PHONY: verify
verify: lint test build ## Gerbang lokal: lint + test + build
	@echo "✅ verify selesai"

.PHONY: build
build: build-web build-go ## Build artefak
	cd services/gateway && go build -o bin/shelfops ./cmd/shelfops

.PHONY: build-go
build-go:
	cd services/gateway && go build -o bin/shelfops ./cmd/shelfops

.PHONY: build-web
build-web:
	npm run build --workspace apps/web

.PHONY: eval
eval: ## Eval cepat (cassette/replay)
	cd eval && uv run python run_eval.py --mode fast

.PHONY: bench
bench: ## Benchmark ONNX (lokal, hasil ke benchmarks/results)
	cd benchmarks && uv run python run_bench.py

.PHONY: images
images: ## Build keempat image produksi lokal (gateway, web, ai-rag, ai-vision)
	docker build --build-arg GIT_SHA=local -f services/gateway/Dockerfile -t shelfops/gateway:local services/gateway
	docker build -f apps/web/Dockerfile -t shelfops/web:local .
	docker build -f services/ai-rag/Dockerfile -t shelfops/ai-rag:local services/ai-rag
	docker build -f services/ai-vision/Dockerfile -t shelfops/ai-vision:local services/ai-vision

.PHONY: bootstrap-prod
bootstrap-prod: ## Buat workspace + admin pertama di stack produksi (butuh ADMIN_EMAIL/ADMIN_PASSWORD)
	@test -n "$(ADMIN_EMAIL)" || (echo "ADMIN_EMAIL wajib" && exit 1)
	@test -n "$(ADMIN_PASSWORD)" || (echo "ADMIN_PASSWORD wajib" && exit 1)
	docker compose --env-file .env -f infra/docker-compose.prod.yml run --rm --no-deps -T \
		-e BOOTSTRAP_PASSWORD="$(ADMIN_PASSWORD)" gateway bootstrap \
		--email "$(ADMIN_EMAIL)" --workspace "$(or $(ADMIN_WORKSPACE),ShelfOps)"

.PHONY: deploy
deploy: ## Deploy ke VPS (butuh .env VPS + SSH)
	bash deploy/deploy.sh

.PHONY: rollback
rollback: ## Rollback ke tag rilis sebelumnya
	bash deploy/rollback.sh

.PHONY: backup
backup: ## Backup database + uploads (retensi 7 hari)
	bash deploy/backup.sh

.PHONY: restore
restore: ## Restore backup (FILE=path.sql.gz)
	@test -n "$(FILE)" || (echo "pakai: make restore FILE=path.sql.gz" && exit 1)
	bash deploy/restore.sh $(FILE)
