from pydantic import BaseModel
from typing import Any


class SearchRequest(BaseModel):
    pipeline_ids: list[str]
    query: str
    k: int = 5


class SearchResult(BaseModel):
    rank: int
    chunk: str
    score: float
    metadata: dict[str, Any] = {}


class PipelineSearchResult(BaseModel):
    pipeline_id: str
    config_summary: str
    results: list[SearchResult]


class CompareResponse(BaseModel):
    query: str
    k: int
    pipelines: list[PipelineSearchResult]
