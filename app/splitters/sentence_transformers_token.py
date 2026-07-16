from langchain_text_splitters import SentenceTransformersTokenTextSplitter
from app.core.base import BaseSplitter
from app.core.registry import ComponentRegistry


@ComponentRegistry.register_splitter("sentence_transformers_token")
class SentenceTransformersTokenSplitter(BaseSplitter):
    name = "sentence_transformers_token"

    def __init__(self, chunk_overlap: int = 20, model_name: str = "sentence-transformers/all-MiniLM-L6-v2"):
        self.chunk_overlap = chunk_overlap
        self.model_name = model_name

    def split(self, documents: list) -> list:
        splitter = SentenceTransformersTokenTextSplitter(
            chunk_overlap=self.chunk_overlap,
            model_name=self.model_name,
        )
        return splitter.split_documents(documents)

    @classmethod
    def params_schema(cls) -> list[dict]:
        return [
            {"name": "chunk_overlap", "type": "int", "default": 20, "description": "Overlap in tokens"},
            {
                "name": "model_name",
                "type": "str",
                "default": "sentence-transformers/all-MiniLM-L6-v2",
                "description": "Sentence transformer model for tokenization",
            },
        ]
