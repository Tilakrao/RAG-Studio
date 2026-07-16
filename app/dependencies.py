from functools import lru_cache
from fastapi import Depends
from app.config import Settings
from app.core.registry import ComponentRegistry
from app.vectorstores.chroma_store import ChromaVectorStore
from app.services.document_service import DocumentService
from app.services.pipeline_service import PipelineService
from app.services.search_service import SearchService


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


@lru_cache(maxsize=1)
def get_registry() -> ComponentRegistry:
    import app.loaders  # noqa: F401 - triggers registration
    import app.splitters  # noqa: F401 - triggers registration
    import app.embedders  # noqa: F401 - triggers registration
    return ComponentRegistry()


def get_vector_store(settings: Settings = Depends(get_settings)) -> ChromaVectorStore:
    # Not cached via lru_cache because Depends + lru_cache don't compose safely.
    # ChromaVectorStore lazily initializes its client, so construction is cheap.
    return ChromaVectorStore(str(settings.chroma_dir))


def get_document_service(settings: Settings = Depends(get_settings)) -> DocumentService:
    return DocumentService(str(settings.db_path), str(settings.uploads_dir))


def get_pipeline_service(
    settings: Settings = Depends(get_settings),
    registry: ComponentRegistry = Depends(get_registry),
    vector_store: ChromaVectorStore = Depends(get_vector_store),
) -> PipelineService:
    return PipelineService(str(settings.db_path), registry, vector_store)


def get_search_service(
    pipeline_service: PipelineService = Depends(get_pipeline_service),
    vector_store: ChromaVectorStore = Depends(get_vector_store),
    registry: ComponentRegistry = Depends(get_registry),
) -> SearchService:
    return SearchService(pipeline_service, vector_store, registry)
