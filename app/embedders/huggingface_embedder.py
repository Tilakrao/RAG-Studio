import os
import logging
from app.core.base import BaseEmbedder
from app.core.registry import ComponentRegistry

logger = logging.getLogger(__name__)

# Cache loaded models so each model is loaded from disk only once per server lifetime.
# Key: (model_name, cache_dir) → HuggingFaceEmbeddings instance
_MODEL_CACHE: dict = {}

MODELS = [
    ("all_mpnet_base_v2",  "sentence-transformers/all-mpnet-base-v2",            768),
    ("all_minilm_l6_v2",   "sentence-transformers/all-MiniLM-L6-v2",             384),
    ("all_minilm_l12_v2",  "sentence-transformers/all-MiniLM-L12-v2",            384),
    ("multi_qa_mpnet",     "sentence-transformers/multi-qa-mpnet-base-dot-v1",   768),
    ("bge_small_en",       "BAAI/bge-small-en-v1.5",                             384),
    ("bge_base_en",        "BAAI/bge-base-en-v1.5",                              768),
]


def _make_embedder(registry_key: str, model_id: str, dims: int):
    @ComponentRegistry.register_embedder(registry_key)
    class _HFEmbedder(BaseEmbedder):
        name       = registry_key
        model_name = model_id
        dimension  = dims

        def __init__(self):
            pass

        def get_embeddings(self):
            from langchain_huggingface import HuggingFaceEmbeddings
            hf_home   = os.environ.get("HF_HOME", "./data/models")
            cache_dir = os.path.join(hf_home, "hub")
            key       = (self.model_name, cache_dir)
            if key not in _MODEL_CACHE:
                logger.info("Loading embedding model '%s' (first use — subsequent calls are instant)", self.model_name)
                _MODEL_CACHE[key] = HuggingFaceEmbeddings(
                    model_name=self.model_name,
                    cache_folder=cache_dir,
                    model_kwargs={"device": "cpu"},
                    encode_kwargs={"normalize_embeddings": True},
                )
            else:
                logger.debug("Returning cached embedding model '%s'", self.model_name)
            return _MODEL_CACHE[key]

    _HFEmbedder.__name__ = f"HFEmbedder_{registry_key}"
    return _HFEmbedder


for _key, _model_id, _dims in MODELS:
    _make_embedder(_key, _model_id, _dims)
