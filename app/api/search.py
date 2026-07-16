import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.services.search_service import SearchService, SEARCH_TYPE_LABELS
from app.dependencies import get_search_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/search", tags=["search"])


class SearchRequest(BaseModel):
    pipeline_ids: list[str]
    query: str
    k: int = 5
    search_type: str = "cosine"
    reranker: str = "none"


class StrategyCompareRequest(BaseModel):
    pipeline_id: str
    query: str
    k: int = 5
    search_types: list[str] = list(SEARCH_TYPE_LABELS.keys())
    reranker: str = "none"


@router.get("/types")
def list_search_types():
    return [{"id": k, "label": v} for k, v in SEARCH_TYPE_LABELS.items()]


@router.get("/rerankers")
def list_rerankers():
    from app.rerankers.cross_encoder import list_rerankers as _list
    return _list()


@router.post("/query")
def query_pipeline(
    request: SearchRequest,
    search_service: SearchService = Depends(get_search_service),
):
    if len(request.pipeline_ids) != 1:
        raise HTTPException(status_code=400, detail="Provide exactly one pipeline_id for /query")
    try:
        return search_service.query(
            request.pipeline_ids[0], request.query, request.k,
            request.search_type, request.reranker,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Search query failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/compare")
def compare_pipelines(
    request: SearchRequest,
    search_service: SearchService = Depends(get_search_service),
):
    if not request.pipeline_ids:
        raise HTTPException(status_code=400, detail="Provide at least one pipeline_id")
    if len(request.pipeline_ids) > 4:
        raise HTTPException(status_code=400, detail="Maximum 4 pipelines for comparison")
    try:
        return search_service.compare(
            request.pipeline_ids, request.query, request.k,
            request.search_type, request.reranker,
        )
    except Exception as e:
        logger.exception("Compare failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/strategy_compare")
def strategy_compare(
    request: StrategyCompareRequest,
    search_service: SearchService = Depends(get_search_service),
):
    if not request.pipeline_id:
        raise HTTPException(status_code=400, detail="Provide a pipeline_id")
    try:
        return search_service.strategy_compare(
            request.pipeline_id, request.query, request.k,
            request.search_types, request.reranker,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Strategy compare failed")
        raise HTTPException(status_code=500, detail=str(e))
