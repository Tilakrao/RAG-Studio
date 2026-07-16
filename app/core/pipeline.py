import hashlib
import json
import logging
from typing import Callable
from pydantic import BaseModel

logger = logging.getLogger(__name__)


class LoaderConfig(BaseModel):
    name: str
    params: dict = {}


class SplitterConfig(BaseModel):
    name: str
    params: dict = {}


class EmbedderConfig(BaseModel):
    name: str
    params: dict = {}


class PipelineConfig(BaseModel):
    loader: LoaderConfig
    splitter: SplitterConfig
    embedder: EmbedderConfig

    def collection_name(self, doc_id: str) -> str:
        payload = json.dumps(
            {
                "doc_id": doc_id,
                "loader": self.loader.model_dump(),
                "splitter": self.splitter.model_dump(),
                "embedder": self.embedder.model_dump(),
            },
            sort_keys=True,
        )
        digest = hashlib.sha256(payload.encode()).hexdigest()[:16]
        return f"rag_{digest}"

    def summary(self) -> str:
        s = self.splitter
        size = s.params.get("chunk_size", "")
        overlap = s.params.get("chunk_overlap", "")
        chunk_desc = f"({size}/{overlap})" if size else ""
        return f"{self.loader.name} + {s.name}{chunk_desc} + {self.embedder.name}"


class Pipeline:
    def __init__(self, config: PipelineConfig, registry, vector_store):
        self.config = config
        self.registry = registry
        self.vector_store = vector_store

    def run(self, file_path: str, doc_id: str, step_callback: Callable[[str], None] | None = None) -> dict:
        def step(msg: str):
            logger.info(msg)
            if step_callback:
                try:
                    step_callback(msg)
                except Exception:
                    pass

        collection_name = self.config.collection_name(doc_id)

        if self.vector_store.collection_exists(collection_name):
            step("Cache hit — collection already exists, skipping re-processing")
            logger.info("Collection %s already exists, returning cached", collection_name)
            return {"status": "cached", "collection_name": collection_name}

        loader = self.registry.get_loader(self.config.loader.name, self.config.loader.params)
        splitter = self.registry.get_splitter(self.config.splitter.name, self.config.splitter.params)
        embedder = self.registry.get_embedder(self.config.embedder.name, self.config.embedder.params)

        # ── Step 1: Load ──────────────────────────────────────────────
        step(f"Loading PDF with '{self.config.loader.name}'...")
        documents = loader.load(file_path)
        step(f"PDF loaded — {len(documents)} page(s) extracted")

        # ── Auto-fallback to OCR when text-based loader returns blanks ─
        _ocr_loaders = {"unstructured_fast", "unstructured_hires", "unstructured_ocr"}
        if self.config.loader.name not in _ocr_loaders:
            all_empty = all(not (d.page_content or "").strip() for d in documents)
            if all_empty:
                step(f"No text found in {len(documents)} page(s) — PDF appears scanned. Running OCR...")
                logger.warning(
                    "Loader '%s' returned empty text — auto-retrying with unstructured_ocr",
                    self.config.loader.name,
                )
                ocr_loader = self.registry.get_loader("unstructured_ocr", {})
                documents = ocr_loader.load(file_path)
                step(f"OCR complete — {len(documents)} page(s) with text extracted")

        # ── Step 2: Split ─────────────────────────────────────────────
        size    = self.config.splitter.params.get("chunk_size", "")
        overlap = self.config.splitter.params.get("chunk_overlap", "")
        cfg_desc = f"size={size}, overlap={overlap}" if size else self.config.splitter.name
        step(f"Chunking {len(documents)} page(s) with '{self.config.splitter.name}' ({cfg_desc})...")
        chunks = splitter.split(documents)

        if not chunks:
            raise ValueError(
                "No text could be extracted even after OCR. "
                "The file may be corrupted, password-protected, or contain unrecognisable content."
            )

        step(f"{len(chunks)} chunks created — avg {int(sum(len(c.page_content) for c in chunks)/len(chunks))} chars each")

        # ── Step 3: Embed ─────────────────────────────────────────────
        step(f"Loading embedding model '{self.config.embedder.name}'...")
        embeddings = embedder.get_embeddings()
        step(f"Embedding {len(chunks)} chunks with '{self.config.embedder.name}'...")

        # ── Step 4: Store ─────────────────────────────────────────────
        count = self.vector_store.add_documents(chunks, collection_name, embeddings)
        step(f"Stored {count} vectors → ChromaDB collection '{collection_name}'")

        preview = []
        for i, chunk in enumerate(chunks[:5]):
            content  = chunk.page_content if hasattr(chunk, "page_content") else str(chunk)
            metadata = chunk.metadata     if hasattr(chunk, "metadata")     else {}
            preview.append({"index": i, "content": content[:500], "metadata": metadata})

        return {
            "status": "completed",
            "collection_name": collection_name,
            "chunk_count": count,
            "chunks_preview": preview,
            "all_chunks": [
                {
                    "index": i,
                    "content":  (c.page_content if hasattr(c, "page_content") else str(c))[:1000],
                    "metadata":  c.metadata     if hasattr(c, "metadata")     else {},
                }
                for i, c in enumerate(chunks)
            ],
        }
