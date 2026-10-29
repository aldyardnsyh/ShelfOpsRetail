from __future__ import annotations

import pytest

from app.config import Settings


@pytest.fixture
def settings() -> Settings:
    return Settings(
        database_url="postgresql://shelfops:shelfops_dev_password@localhost:55433/shelfops",
        embedding_dim=256,
        vector_dim=1024,
        top_k_vector=10,
        top_k_lexical=10,
        top_n_final=4,
    )
