import logging
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from app.services.document_service import DocumentService
from app.services.pipeline_service import PipelineService
from app.vectorstores.chroma_store import ChromaVectorStore
from app.dependencies import get_document_service, get_pipeline_service, get_vector_store
from pydantic import BaseModel
from typing import Any

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/pipelines", tags=["pipelines"])


class RunPipelinesRequest(BaseModel):
    doc_id: str
    configs: list[dict[str, Any]]


@router.post("/run")
def run_pipelines(
    request: RunPipelinesRequest,
    background_tasks: BackgroundTasks,
    doc_service: DocumentService = Depends(get_document_service),
    pipeline_service: PipelineService = Depends(get_pipeline_service),
):
    doc = doc_service.get_document(request.doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    file_path = doc_service.get_file_path(request.doc_id)
    if not file_path:
        raise HTTPException(status_code=404, detail="Document file not found on disk")

    pipeline_ids = []
    for config in request.configs:
        record = pipeline_service.create_pipeline(request.doc_id, config)
        pipeline_id = record["pipeline_id"]
        pipeline_ids.append(pipeline_id)
        background_tasks.add_task(
            pipeline_service.run_pipeline_task, pipeline_id, file_path
        )
        logger.info("Queued pipeline %s for doc %s", pipeline_id, request.doc_id)

    return {"pipeline_ids": pipeline_ids}


@router.get("")
def list_pipelines(
    doc_id: str | None = None,
    pipeline_service: PipelineService = Depends(get_pipeline_service),
):
    return pipeline_service.list_pipelines(doc_id=doc_id)


@router.get("/{pipeline_id}")
def get_pipeline(
    pipeline_id: str,
    pipeline_service: PipelineService = Depends(get_pipeline_service),
):
    pipeline = pipeline_service.get_pipeline(pipeline_id)
    if not pipeline:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    return pipeline


@router.get("/{pipeline_id}/chunks")
def get_pipeline_chunks(
    pipeline_id: str,
    pipeline_service: PipelineService = Depends(get_pipeline_service),
):
    pipeline = pipeline_service.get_pipeline(pipeline_id)
    if not pipeline:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    return pipeline_service.get_chunks(pipeline_id)


@router.get("/{pipeline_id}/embeddings")
def get_pipeline_embeddings(
    pipeline_id: str,
    limit: int = 20,
    pipeline_service: PipelineService = Depends(get_pipeline_service),
    vector_store: ChromaVectorStore = Depends(get_vector_store),
):
    pipeline = pipeline_service.get_pipeline(pipeline_id)
    if not pipeline:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    if pipeline["status"] not in ("completed", "cached"):
        raise HTTPException(status_code=400, detail="Pipeline not ready yet")
    return vector_store.get_chunk_embeddings(pipeline["collection_name"], limit=limit)


@router.delete("/{pipeline_id}")
def delete_pipeline(
    pipeline_id: str,
    pipeline_service: PipelineService = Depends(get_pipeline_service),
):
    pipeline = pipeline_service.get_pipeline(pipeline_id)
    if not pipeline:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    pipeline_service.delete_pipeline(pipeline_id)
    return {"status": "deleted", "pipeline_id": pipeline_id}
