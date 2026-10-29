"""Runtime configuration for ai-vision (env prefix ``VISION_``)."""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

SERVICE_VERSION = "0.1.0"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="VISION_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    service_name: str = "ai-vision"
    version: str = SERVICE_VERSION
    log_level: str = "INFO"

    grpc_host: str = "0.0.0.0"
    grpc_port: int = 50052
    grpc_workers: int = 4
    http_host: str = "0.0.0.0"
    http_port: int = 8082

    detector: str = "replay"
    model_version: str = "replay-yolo-placeholder-v1"
    model_imgsz: int = 960
    conf_threshold: float = 0.25
    low_conf_threshold: float = 0.6
    concurrency: int = 1
    batch_size: int = 8
    batch_wait_ms: int = 25

    ocr_engine: str = "stub"

    object_store_root: str = "./data/uploads"
    max_image_bytes: int = 10 * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
    return Settings()
