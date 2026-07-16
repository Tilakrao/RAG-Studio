import re
import time
import logging
from app.core.registry import ComponentRegistry

logger = logging.getLogger(__name__)

SEARCH_TYPE_LABELS = {
    "cosine":            "Cosine Similarity",
    "l2":                "L2 / Euclidean",
    "dot_product":       "Dot Product",
    "bm25":              "BM25 (Keyword)",
    "cosine+bm25":       "Cosine + BM25",
    "l2+bm25":           "L2 + BM25",
    "dot_product+bm25":  "Dot Product + BM25",
}


class SearchService:
    def __init__(self, pipeline_service, vector_store, registry: ComponentRegistry):
        self.pipeline_service = pipeline_service
        self.vector_store = vector_store
        self.registry = registry

    # ── public ────────────────────────────────────────────────────────────────

    def query(
        self,
        pipeline_id: str,
        query: str,
        k: int = 5,
        search_type: str = "cosine",
        reranker: str = "none",
    ) -> dict:
        pipeline = self._get_ready_pipeline(pipeline_id)
        results, timing = self._search_with_timing(pipeline, query, k, search_type, reranker)
        return {
            "pipeline_id": pipeline_id,
            "config_summary": pipeline.get("config_summary", ""),
            "search_type": search_type,
            "search_type_label": SEARCH_TYPE_LABELS.get(search_type, search_type),
            "reranker": reranker,
            "timing": timing,
            "results": results,
        }

    def compare(
        self,
        pipeline_ids: list[str],
        query: str,
        k: int = 5,
        search_type: str = "cosine",
        reranker: str = "none",
    ) -> dict:
        pipelines_results = []
        for pid in pipeline_ids:
            try:
                result = self.query(pid, query, k, search_type, reranker)
                pipelines_results.append(result)
            except Exception as e:
                logger.warning("Error querying pipeline %s: %s", pid, e)
                pipelines_results.append({
                    "pipeline_id": pid,
                    "config_summary": "",
                    "search_type": search_type,
                    "search_type_label": SEARCH_TYPE_LABELS.get(search_type, search_type),
                    "reranker": reranker,
                    "timing": {"retrieval_ms": 0, "reranking_ms": 0, "total_ms": 0},
                    "results": [],
                    "error": str(e),
                })
        return {"query": query, "k": k, "search_type": search_type, "reranker": reranker, "pipelines": pipelines_results}

    def strategy_compare(
        self,
        pipeline_id: str,
        query: str,
        k: int = 5,
        search_types: list[str] | None = None,
        reranker: str = "none",
    ) -> dict:
        """Run multiple search strategies on the same pipeline for side-by-side comparison."""
        if not search_types:
            search_types = list(SEARCH_TYPE_LABELS.keys())
        pipeline = self._get_ready_pipeline(pipeline_id)
        strategies = []
        for st in search_types:
            try:
                results, timing = self._search_with_timing(pipeline, query, k, st, reranker)
                strategies.append({
                    "search_type": st,
                    "label": SEARCH_TYPE_LABELS.get(st, st),
                    "reranker": reranker,
                    "timing": timing,
                    "results": results,
                })
            except Exception as e:
                logger.warning("Strategy %s failed for pipeline %s: %s", st, pipeline_id, e)
                strategies.append({
                    "search_type": st,
                    "label": SEARCH_TYPE_LABELS.get(st, st),
                    "reranker": reranker,
                    "timing": {"retrieval_ms": 0, "reranking_ms": 0, "total_ms": 0},
                    "results": [],
                    "error": str(e),
                })
        return {
            "query": query,
            "k": k,
            "pipeline_id": pipeline_id,
            "config_summary": pipeline.get("config_summary", ""),
            "reranker": reranker,
            "strategies": strategies,
        }

    # ── timing + reranking orchestration ─────────────────────────────────────

    def _search_with_timing(
        self,
        pipeline: dict,
        query: str,
        k: int,
        search_type: str,
        reranker: str = "none",
    ) -> tuple[list[dict], dict]:
        timing: dict = {"retrieval_ms": 0, "reranking_ms": 0, "total_ms": 0}
        t_total = time.perf_counter()

        # Oversample for reranking so the cross-encoder sees more candidates
        fetch_k = k if reranker == "none" else max(k * 4, 20)

        t0 = time.perf_counter()
        results = self._search(pipeline, query, fetch_k, search_type)
        timing["retrieval_ms"] = round((time.perf_counter() - t0) * 1000)

        if reranker and reranker != "none":
            from app.rerankers.cross_encoder import rerank
            t1 = time.perf_counter()
            results = rerank(query, results, k, reranker)
            timing["reranking_ms"] = round((time.perf_counter() - t1) * 1000)
        else:
            results = results[:k]

        timing["total_ms"] = round((time.perf_counter() - t_total) * 1000)
        return results, timing

    # ── retrieval ─────────────────────────────────────────────────────────────

    def _get_ready_pipeline(self, pipeline_id: str) -> dict:
        pipeline = self.pipeline_service.get_pipeline(pipeline_id)
        if not pipeline:
            raise ValueError(f"Pipeline {pipeline_id} not found")
        if pipeline["status"] not in ("completed", "cached"):
            raise ValueError(f"Pipeline {pipeline_id} is not ready (status: {pipeline['status']})")
        return pipeline

    def _get_embedder(self, pipeline: dict):
        config = pipeline["config"]
        embedder = self.registry.get_embedder(
            config["embedder"]["name"], config["embedder"].get("params", {})
        )
        return embedder.get_embeddings()

    def _search(self, pipeline: dict, query: str, k: int, search_type: str) -> list[dict]:
        if search_type == "bm25":
            return self._bm25_search(pipeline["pipeline_id"], query, k)

        use_bm25 = False
        dense_metric = search_type
        if "+" in search_type:
            parts = search_type.split("+", 1)
            dense_metric = parts[0]
            use_bm25 = parts[1] == "bm25"

        embeddings = self._get_embedder(pipeline)
        dense_results = self._dense_search(pipeline, query, k * 2 if use_bm25 else k, dense_metric, embeddings)

        if not use_bm25:
            return dense_results[:k]

        bm25_results = self._bm25_search(pipeline["pipeline_id"], query, k * 2)
        return self._rrf_merge(dense_results, bm25_results, k)

    def _dense_search(self, pipeline: dict, query: str, k: int, metric: str, embeddings) -> list[dict]:
        collection_name = pipeline["collection_name"]

        if metric == "cosine":
            raw = self.vector_store.similarity_search_with_score(query, collection_name, embeddings, k=k)
            return [
                {
                    "rank": i + 1,
                    "chunk": doc.page_content,
                    "score": float(max(0.0, min(1.0, 1.0 - score / 2.0))),
                    "score_type": "cosine",
                    "metadata": doc.metadata,
                }
                for i, (doc, score) in enumerate(raw)
            ]

        query_emb = embeddings.embed_query(query)
        raw = self.vector_store.query_with_metric(collection_name, query_emb, k, metric)
        return [
            {
                "rank": i + 1,
                "chunk": doc.page_content,
                "score": float(max(0.0, min(1.0, score))),
                "score_type": metric,
                "metadata": doc.metadata,
            }
            for i, (doc, score) in enumerate(raw)
        ]

    def _bm25_search(self, pipeline_id: str, query: str, k: int) -> list[dict]:
        try:
            from rank_bm25 import BM25Okapi
        except ImportError:
            raise RuntimeError("rank_bm25 not installed. Run: pip install rank-bm25")

        chunks = self.pipeline_service.get_chunks(pipeline_id)
        if not chunks:
            return []

        def tokenize(text: str) -> list[str]:
            return re.findall(r"\b\w+\b", text.lower())

        corpus = [c["content"] for c in chunks]
        tokenized = [tokenize(c) for c in corpus]
        tokenized_query = tokenize(query)

        bm25 = BM25Okapi(tokenized)
        raw_scores = bm25.get_scores(tokenized_query)

        max_score = float(max(raw_scores)) if float(max(raw_scores)) > 0 else 1.0
        top_k_idx = sorted(range(len(raw_scores)), key=lambda i: raw_scores[i], reverse=True)[:k]

        return [
            {
                "rank": rank + 1,
                "chunk": chunks[idx]["content"],
                "score": float(raw_scores[idx] / max_score),
                "score_raw": float(raw_scores[idx]),
                "score_type": "bm25",
                "metadata": chunks[idx].get("metadata", {}),
            }
            for rank, idx in enumerate(top_k_idx)
            if raw_scores[idx] > 0
        ]

    def _rrf_merge(self, dense_results: list[dict], bm25_results: list[dict], k: int, rrf_k: int = 60) -> list[dict]:
        rrf: dict[str, dict] = {}

        for rank, r in enumerate(dense_results):
            key = r["chunk"][:120]
            if key not in rrf:
                rrf[key] = {"chunk": r["chunk"], "metadata": r["metadata"], "rrf": 0.0,
                            "dense_score": r["score"], "bm25_score": 0.0}
            rrf[key]["rrf"] += 1.0 / (rank + 1 + rrf_k)

        for rank, r in enumerate(bm25_results):
            key = r["chunk"][:120]
            if key not in rrf:
                rrf[key] = {"chunk": r["chunk"], "metadata": r["metadata"], "rrf": 0.0,
                            "dense_score": 0.0, "bm25_score": r["score"]}
            rrf[key]["rrf"] += 1.0 / (rank + 1 + rrf_k)
            rrf[key]["bm25_score"] = r["score"]

        sorted_items = sorted(rrf.values(), key=lambda x: x["rrf"], reverse=True)[:k]
        max_rrf = sorted_items[0]["rrf"] if sorted_items else 1.0

        return [
            {
                "rank": i + 1,
                "chunk": item["chunk"],
                "score": float(item["rrf"] / max_rrf),
                "score_type": "hybrid_rrf",
                "dense_score": float(item["dense_score"]),
                "bm25_score": float(item["bm25_score"]),
                "metadata": item["metadata"],
            }
            for i, item in enumerate(sorted_items)
        ]
