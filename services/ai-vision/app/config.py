"""Runtime configuration for ai-vision (env prefix ``VISION_``).

Nama env publik mengikuti ``.env.example``: ``VISION_DETECTOR``,
``VISION_OCR_ENGINE``, ``MODEL_DIR``, ``VLM_*``. Alias ``RAG_*``/``VISION_*``
tetap diterima supaya konfigurasi lama tidak rusak.
"""

from __future__ import annotations

from functools import lru_cache

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

SERVICE_VERSION = "0.1.0"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="VISION_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )

    service_name: str = "ai-vision"
    version: str = SERVICE_VERSION
    log_level: str = "INFO"

    grpc_host: str = "0.0.0.0"
    grpc_port: int = 50052
    grpc_workers: int = 4
    http_host: str = "0.0.0.0"
    http_port: int = 8082

    detector: str = Field(
        default="replay",
        validation_alias=AliasChoices("VISION_DETECTOR", "DETECTOR"),
    )
    model_version: str = "replay-yolo-placeholder-v1"
    model_imgsz: int = 960
    conf_threshold: float = 0.25
    low_conf_threshold: float = 0.6
    concurrency: int = 1
    batch_size: int = 8
    batch_wait_ms: int = 25

    # Direktori berisi bobot ONNX (volume ``models`` di compose produksi).
    model_dir: str = Field(
        default="/models",
        validation_alias=AliasChoices("MODEL_DIR", "VISION_MODEL_DIR"),
    )
    # Path absolut opsional; bila kosong, path diturunkan dari model_dir +
    # model_version.
    model_path: str = Field(
        default="",
        validation_alias=AliasChoices("MODEL_PATH", "VISION_MODEL_PATH"),
    )

    ocr_engine: str = Field(
        default="stub",
        validation_alias=AliasChoices("VISION_OCR_ENGINE", "OCR_ENGINE"),
    )

    vlm_provider: str = Field(
        default="off",
        validation_alias=AliasChoices("VLM_PROVIDER", "VISION_VLM_PROVIDER"),
    )
    vlm_base_url: str = Field(
        default="",
        validation_alias=AliasChoices("VLM_BASE_URL", "VISION_VLM_BASE_URL"),
    )
    vlm_api_key: str = Field(
        default="",
        validation_alias=AliasChoices("VLM_API_KEY", "VISION_VLM_API_KEY"),
    )
    vlm_model: str = Field(
        default="",
        validation_alias=AliasChoices("VLM_MODEL", "VISION_VLM_MODEL"),
    )
    vlm_timeout: float = 45.0

    object_store_root: str = "./data/uploads"
    max_image_bytes: int = 10 * 1024 * 1024

    def resolved_model_path(self) -> str:
        """Path bobot ONNX; kosong bila konfigurasi belum diisi."""
        if self.model_path.strip():
            return self.model_path.strip()
        version = self.model_version.strip()
        if not version:
            return ""
        if version.endswith(".onnx"):
            return f"{self.model_dir.rstrip('/')}/{version}"
        return f"{self.model_dir.rstrip('/')}/{version}.onnx"


@lru_cache
def get_settings() -> Settings:
    return Settings()
