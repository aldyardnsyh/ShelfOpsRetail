"""Process entry point: uvicorn + grpc in one process.

Usage:
    python -m app.main --transport all
    python -m app.main --transport grpc --grpc-port 50051
    python -m app.main --transport http --http-port 8081
"""

from __future__ import annotations

import argparse
import logging

import uvicorn

from app.api_http import create_app
from app.config import Settings, get_settings
from app.logging_setup import configure_logging
from app.providers import build_embedding_provider, build_llm_provider
from app.providers.base import ProviderError
from app.retrieval import HybridRetriever
from app.service_grpc import create_grpc_server
from app.store import ChunkStore

logger = logging.getLogger("app.main")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="ai-rag",
        description="ShelfOps RAG service (gRPC + HTTP health/debug).",
    )
    parser.add_argument(
        "--transport",
        choices=("grpc", "http", "all"),
        default="all",
        help="which server(s) to run (default: all)",
    )
    parser.add_argument("--grpc-host", default=None, help="gRPC bind host")
    parser.add_argument("--grpc-port", type=int, default=None, help="gRPC port (default 50051)")
    parser.add_argument("--http-host", default=None, help="HTTP bind host")
    parser.add_argument("--http-port", type=int, default=None, help="HTTP port (default 8081)")
    parser.add_argument("--log-level", default=None, help="DEBUG/INFO/WARNING/ERROR")
    parser.add_argument("--version", action="version", version="ai-rag 0.1.0")
    return parser


def _resolve_settings(args: argparse.Namespace) -> Settings:
    settings = get_settings()
    updates = {}
    if args.grpc_host:
        updates["grpc_host"] = args.grpc_host
    if args.grpc_port is not None:
        updates["grpc_port"] = args.grpc_port
    if args.http_host:
        updates["http_host"] = args.http_host
    if args.http_port is not None:
        updates["http_port"] = args.http_port
    if args.log_level:
        updates["log_level"] = args.log_level
    return settings.model_copy(update=updates) if updates else settings


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    settings = _resolve_settings(args)
    configure_logging(settings.log_level)

    try:
        llm = build_llm_provider(settings)
        embedder = build_embedding_provider(settings)
    except ProviderError as exc:
        logger.error("provider_unavailable", extra={"error": str(exc)})
        return 2

    store = ChunkStore(
        settings.database_url,
        table=settings.chunks_table,
        vector_dim=settings.vector_dim,
        min_size=settings.db_pool_min,
        max_size=settings.db_pool_max,
        connect_timeout=settings.db_connect_timeout,
    )
    retriever = HybridRetriever(store, embedder, settings)

    grpc_server = None
    try:
        if args.transport in ("grpc", "all"):
            grpc_server, bound_port = create_grpc_server(settings, llm, embedder, retriever, store)
            grpc_server.start()
            logger.info(
                "grpc_listening",
                extra={"host": settings.grpc_host, "port": bound_port},
            )

        if args.transport == "grpc":
            assert grpc_server is not None
            try:
                grpc_server.wait_for_termination()
            except KeyboardInterrupt:
                logger.info("shutdown_requested")
            return 0

        app = create_app(
            settings,
            store=store,
            retriever=retriever,
            llm=llm,
            embedder=embedder,
        )
        logger.info(
            "http_listening",
            extra={"host": settings.http_host, "port": settings.http_port},
        )
        uvicorn.run(
            app,
            host=settings.http_host,
            port=settings.http_port,
            log_config=None,
            access_log=settings.log_level.upper() == "DEBUG",
        )
        return 0
    except (OSError, RuntimeError) as exc:
        logger.error("startup_failed", extra={"error": str(exc)})
        return 1
    finally:
        if grpc_server is not None:
            grpc_server.stop(grace=3).wait(timeout=5)
        store.close()
        logger.info("stopped")


if __name__ == "__main__":
    raise SystemExit(main())
