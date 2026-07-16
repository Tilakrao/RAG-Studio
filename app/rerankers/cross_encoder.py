import os
import logging

logger = logging.getLogger(__name__)

_CACHE: dict = {}

CATALOG = {
    "none": {
        "id": "none",
        "label": "No Reranking",
        "model_id": None,
        "description": "Return retrieval results as-is",
        "speed": "instant",
    },
    "tiny_bert": {
        "id": "tiny_bert",
        "label": "TinyBERT-L2 (Fastest)",
        "model_id": "cross-encoder/ms-marco-TinyBERT-L-2-v2",
        "description": "2-layer TinyBERT — extremely fast, good for demos",
        "speed": "fast",
    },
    "minilm_l6": {
        "id": "minilm_l6",
        "label": "MiniLM-L6 (Balanced)",
        "model_id": "cross-encoder/ms-marco-MiniLM-L-6-v2",
        "description": "6-layer MiniLM — best speed/quality tradeoff",
        "speed": "medium",
    },
    "minilm_l12": {
        "id": "minilm_l12",
        "label": "MiniLM-L12 (Better)",
        "model_id": "cross-encoder/ms-marco-MiniLM-L-12-v2",
        "description": "12-layer MiniLM — higher quality, 2× slower than L6",
        "speed": "medium",
    },
    "bge_base": {
        "id": "bge_base",
        "label": "BGE Reranker Base",
        "model_id": "BAAI/bge-reranker-base",
        "description": "BAAI cross-encoder — strong multilingual quality",
        "speed": "medium",
    },
}


def list_rerankers() -> list[dict]:
    return list(CATALOG.values())


def rerank(query: str, results: list[dict], k: int, reranker_id: str) -> list[dict]:
    """Score (query, passage) pairs with a cross-encoder and return top-k re-sorted."""
    if not results or reranker_id == "none":
        return results[:k]

    info = CATALOG.get(reranker_id)
    if not info or not info["model_id"]:
        raise ValueError(f"Unknown reranker: {reranker_id!r}")

    model = _load(info["model_id"])
    pairs = [(query, r["chunk"]) for r in results]
    raw_scores = model.predict(pairs, show_progress_bar=False).tolist()

    scored = sorted(zip(results, raw_scores), key=lambda x: x[1], reverse=True)[:k]
    if not scored:
        return []

    max_s = scored[0][1]
    min_s = scored[-1][1]
    span = max_s - min_s if max_s != min_s else 1.0

    return [
        {
            **r,
            "rank": i + 1,
            "original_rank": r.get("rank", i + 1),
            "score": float((s - min_s) / span),
            "reranker_score_raw": float(s),
        }
        for i, (r, s) in enumerate(scored)
    ]


def _load(model_id: str):
    if model_id not in _CACHE:
        logger.info("Loading reranker '%s' — first use, subsequent calls are instant", model_id)
        hf_home = os.environ.get("HF_HOME", "./data/models")
        cache_dir = os.path.join(hf_home, "hub")
        os.environ.setdefault("TRANSFORMERS_CACHE", cache_dir)
        from sentence_transformers import CrossEncoder
        _CACHE[model_id] = CrossEncoder(model_id, max_length=512)
        logger.info("Reranker '%s' loaded and cached", model_id)
    return _CACHE[model_id]
