from pydantic import BaseModel
from typing import Any


class LoaderConfig(BaseModel):
    name: str
    params: dict[str, Any] = {}


class SplitterConfig(BaseModel):
    name: str
    params: dict[str, Any] = {}


class EmbedderConfig(BaseModel):
    name: str
    params: dict[str, Any] = {}


class RunPipelinesRequest(BaseModel):
    doc_id: str
    configs: list[dict[str, Any]]


class ChunkPreview(BaseModel):
    index: int
    content: str
    metadata: dict[str, Any] = {}


class PipelineResponse(BaseModel):
    pipeline_id: str
    doc_id: str
    config: dict[str, Any]
    collection_name: str
    status: str
    chunk_count: int = 0
    error: str | None = None
    chunks_preview: list[ChunkPreview] = []
    config_summary: str = ""
    created_at: str
    completed_at: str | None = None
    duration_seconds: float | None = None
