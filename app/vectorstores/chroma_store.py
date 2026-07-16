import logging
from app.core.base import BaseVectorStore

logger = logging.getLogger(__name__)


class ChromaVectorStore(BaseVectorStore):
    def __init__(self, persist_directory: str):
        self.persist_directory = persist_directory
        self._client = None

    def _get_client(self):
        if self._client is None:
            import chromadb
            self._client = chromadb.PersistentClient(path=self.persist_directory)
        return self._client

    def add_documents(self, docs: list, collection_name: str, embeddings) -> int:
        if not docs:
            raise ValueError("Cannot add documents: empty list provided to ChromaDB.")
        from langchain_chroma import Chroma
        vectorstore = Chroma(
            collection_name=collection_name,
            embedding_function=embeddings,
            persist_directory=self.persist_directory,
        )
        vectorstore.add_documents(docs)
        return len(docs)

    def similarity_search_with_score(
        self, query: str, collection_name: str, embeddings, k: int = 5
    ) -> list[tuple]:
        from langchain_chroma import Chroma
        vectorstore = Chroma(
            collection_name=collection_name,
            embedding_function=embeddings,
            persist_directory=self.persist_directory,
        )
        return vectorstore.similarity_search_with_score(query, k=k)

    def query_with_metric(
        self,
        collection_name: str,
        query_embedding: list[float],
        k: int,
        metric: str = "cosine",
    ) -> list[tuple]:
        """Query using a manually chosen distance metric computed from stored vectors."""
        import numpy as np
        from langchain_core.documents import Document

        try:
            client = self._get_client()
            col = client.get_collection(collection_name)
            total = col.count()
            if total == 0:
                return []
            result = col.get(
                limit=total,
                include=["embeddings", "documents", "metadatas"],
            )
            docs_raw = result.get("documents") or []
            metas_raw = result.get("metadatas") or []
            embs_raw = result.get("embeddings") or []
            if not embs_raw:
                return []

            embs = np.array(embs_raw, dtype=float)
            q = np.array(query_embedding, dtype=float)

            if metric == "cosine":
                qn = q / (np.linalg.norm(q) + 1e-10)
                en = embs / (np.linalg.norm(embs, axis=1, keepdims=True) + 1e-10)
                scores = en @ qn
            elif metric == "l2":
                dists = np.linalg.norm(embs - q, axis=1)
                scores = 1.0 / (1.0 + dists)
            elif metric == "dot_product":
                scores = embs @ q
                max_abs = np.max(np.abs(scores)) if np.any(scores) else 1.0
                scores = scores / (max_abs + 1e-10)
            else:
                raise ValueError(f"Unknown metric: {metric}")

            top_k_idx = np.argsort(scores)[::-1][:k]
            out = []
            for i in top_k_idx:
                doc = Document(
                    page_content=docs_raw[i] if i < len(docs_raw) else "",
                    metadata=metas_raw[i] if i < len(metas_raw) else {},
                )
                out.append((doc, float(scores[i])))
            return out
        except Exception as e:
            logger.warning("query_with_metric failed for %s: %s", collection_name, e)
            return []

    def collection_exists(self, collection_name: str) -> bool:
        try:
            client = self._get_client()
            collections = [c.name for c in client.list_collections()]
            if collection_name not in collections:
                return False
            col = client.get_collection(collection_name)
            return col.count() > 0
        except Exception:
            return False

    def delete_collection(self, collection_name: str) -> None:
        try:
            client = self._get_client()
            client.delete_collection(collection_name)
            logger.info("Deleted collection: %s", collection_name)
        except Exception as e:
            logger.warning("Could not delete collection %s: %s", collection_name, e)

    def get_chunk_embeddings(self, collection_name: str, limit: int = 20) -> list[dict]:
        try:
            client = self._get_client()
            col = client.get_collection(collection_name)
            result = col.get(limit=limit, include=["embeddings", "documents", "metadatas"])
            embeddings = result.get("embeddings") or []
            documents = result.get("documents") or []
            metadatas = result.get("metadatas") or []
            output = []
            for i, (emb, doc, meta) in enumerate(zip(embeddings, documents, metadatas)):
                if emb:
                    emb_list = list(emb)
                    output.append({
                        "index": i,
                        "content_preview": (doc or "")[:300],
                        "metadata": meta or {},
                        "vector": emb_list,
                        "stats": {
                            "dim": len(emb_list),
                            "min": round(min(emb_list), 6),
                            "max": round(max(emb_list), 6),
                            "mean": round(sum(emb_list) / len(emb_list), 6),
                            "norm": round(sum(x * x for x in emb_list) ** 0.5, 6),
                        },
                    })
            return output
        except Exception as e:
            logger.warning("Could not retrieve chunk embeddings from %s: %s", collection_name, e)
            return []
