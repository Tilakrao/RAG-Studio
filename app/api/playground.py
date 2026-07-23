import json
import sqlite3
import logging
from typing import Optional

import numpy as np
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.config import Settings
from app.core.registry import ComponentRegistry
from app.dependencies import get_registry, get_settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/playground", tags=["playground"])


# ── Request / Response models ─────────────────────────────────────────────────

class VisualizeRequest(BaseModel):
    texts: list[str] = []
    models: list[str]
    pipeline_id: Optional[str] = None
    query: Optional[str] = None
    max_chunks: int = 30


# ── Math helpers ──────────────────────────────────────────────────────────────

def _pca_2d(vectors: list[list[float]]) -> list[list[float]]:
    X = np.array(vectors, dtype=np.float32)
    n = X.shape[0]
    if n == 0:
        return []
    if n == 1:
        return [[0.0, 0.0]]
    X = X - X.mean(axis=0)
    _, _, Vt = np.linalg.svd(X, full_matrices=False)
    n_comp = min(2, Vt.shape[0])
    proj = X @ Vt[:n_comp].T
    if n_comp < 2:
        proj = np.hstack([proj, np.zeros((n, 1), dtype=np.float32)])
    return proj.tolist()


def _cosine_sim(a: list[float], b: list[float]) -> float:
    va = np.array(a, dtype=np.float32)
    vb = np.array(b, dtype=np.float32)
    na, nb = np.linalg.norm(va), np.linalg.norm(vb)
    if na < 1e-10 or nb < 1e-10:
        return 0.0
    return float(np.dot(va, vb) / (na * nb))


# ── Chunk retrieval with cached-pipeline fallback ─────────────────────────────

def _get_chunks(db_path: str, pipeline_id: str, max_chunks: int) -> list[dict]:
    with sqlite3.connect(db_path) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            "SELECT chunk_index, content, metadata_json FROM chunks "
            "WHERE pipeline_id=? ORDER BY chunk_index LIMIT ?",
            (pipeline_id, max_chunks),
        ).fetchall()
        if rows:
            return [
                {"index": r["chunk_index"], "content": r["content"],
                 "metadata": json.loads(r["metadata_json"])}
                for r in rows
            ]
        # Cached pipelines have no chunks stored under their own id —
        # find the original completed pipeline that shares the same collection.
        cname_row = conn.execute(
            "SELECT collection_name FROM pipelines WHERE pipeline_id=?",
            (pipeline_id,),
        ).fetchone()
        if cname_row:
            orig = conn.execute(
                "SELECT pipeline_id FROM pipelines "
                "WHERE collection_name=? AND status='completed' LIMIT 1",
                (cname_row["collection_name"],),
            ).fetchone()
            if orig:
                rows = conn.execute(
                    "SELECT chunk_index, content, metadata_json FROM chunks "
                    "WHERE pipeline_id=? ORDER BY chunk_index LIMIT ?",
                    (orig["pipeline_id"], max_chunks),
                ).fetchall()
                return [
                    {"index": r["chunk_index"], "content": r["content"],
                     "metadata": json.loads(r["metadata_json"])}
                    for r in rows
                ]
    return []


# ── Endpoint ──────────────────────────────────────────────────────────────────

@router.post("/visualize")
def visualize(
    req: VisualizeRequest,
    registry: ComponentRegistry = Depends(get_registry),
    settings: Settings = Depends(get_settings),
):
    texts = [t.strip() for t in req.texts if t.strip()]
    query = req.query.strip() if req.query else None

    if not texts and not req.pipeline_id and not query:
        raise HTTPException(400, "Provide at least one text, a pipeline_id, or a query")
    if not req.models:
        raise HTTPException(400, "Select at least one embedding model")
    max_chunks = max(1, min(req.max_chunks, 100))

    # Fetch chunks once — same for all models
    chunks: list[dict] = []
    if req.pipeline_id:
        chunks = _get_chunks(str(settings.db_path), req.pipeline_id, max_chunks)

    results: dict = {}

    for model_key in req.models:
        try:
            embedder_cls = registry.get_embedder(model_key)
            hf = embedder_cls.get_embeddings()
        except Exception as exc:
            logger.warning("Playground: embedder %s not available: %s", model_key, exc)
            results[model_key] = {"error": str(exc)}
            continue

        labels: list[str] = []
        types: list[str] = []
        full_texts: list[str] = []
        vecs: list[list[float]] = []

        # 1 — user texts
        for t in texts:
            vecs.append(hf.embed_query(t))
            labels.append(t[:80])
            types.append("user_text")
            full_texts.append(t)

        # 2 — query
        qvec: Optional[list[float]] = None
        if query:
            qvec = hf.embed_query(query)
            vecs.append(qvec)
            labels.append(query[:80])
            types.append("query")
            full_texts.append(query)

        # 3 — pipeline chunks
        chunk_meta: list[dict] = []
        chunk_offset = len(texts) + (1 if qvec else 0)
        for ch in chunks:
            v = hf.embed_query(ch["content"])
            vecs.append(v)
            preview = ch["content"][:80] + ("..." if len(ch["content"]) > 80 else "")
            labels.append(preview)
            types.append("chunk")
            full_texts.append(ch["content"])
            sim = round(_cosine_sim(qvec, v), 6) if qvec else None
            chunk_meta.append({
                "index": ch["index"],
                "preview": preview,
                "full_text": ch["content"][:300],
                "similarity": sim,
            })

        # 4 — project to 2D via PCA
        coords = _pca_2d(vecs) if vecs else []

        # 5 — build point list; compute text→query similarity alongside chunks
        points: list[dict] = []
        text_sim_items: list[dict] = []
        for i, (lbl, typ, coord, ft) in enumerate(zip(labels, types, coords, full_texts)):
            pt: dict = {
                "x": round(coord[0], 6),
                "y": round(coord[1], 6),
                "label": lbl,
                "full_text": ft[:300],
                "type": typ,
                "text_index": i if typ == "user_text" else None,
            }
            if typ == "user_text" and qvec:
                sim = round(_cosine_sim(qvec, vecs[i]), 6)
                pt["similarity"] = sim
                text_sim_items.append({
                    "preview": lbl,
                    "full_text": ft[:300],
                    "similarity": sim,
                    "source": "text",
                })
            if typ == "chunk":
                ci = i - chunk_offset
                if 0 <= ci < len(chunk_meta):
                    pt["similarity"] = chunk_meta[ci]["similarity"]
                    pt["chunk_index"] = chunk_meta[ci]["index"]
            points.append(pt)

        # 6 — unified ranking: sentences + chunks together, sorted by similarity
        sim_ranking: Optional[list[dict]] = None
        if qvec:
            all_ranked = text_sim_items + [
                {**m, "source": "chunk"} for m in chunk_meta if m["similarity"] is not None
            ]
            all_ranked.sort(key=lambda x: x["similarity"] or 0.0, reverse=True)
            sim_ranking = [{"rank": i + 1, **r} for i, r in enumerate(all_ranked[:20])]

        results[model_key] = {
            "dimension": len(vecs[0]) if vecs else 0,
            "total_points": len(points),
            "chunk_count": len(chunks),
            "points": points,
            "similarity_ranking": sim_ranking,
        }

    return results
