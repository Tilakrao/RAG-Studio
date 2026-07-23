from app.core.base import BaseSplitter
from app.core.registry import ComponentRegistry


@ComponentRegistry.register_splitter("token")
class TokenSplitter(BaseSplitter):
    name = "token"

    def __init__(self, chunk_size: int = 200, chunk_overlap: int = 20, encoding_name: str = "cl100k_base"):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.encoding_name = encoding_name

    def split(self, documents: list) -> list:
        from langchain_text_splitters import TokenTextSplitter
        splitter = TokenTextSplitter(
            chunk_size=self.chunk_size,
            chunk_overlap=self.chunk_overlap,
            encoding_name=self.encoding_name,
        )
        return splitter.split_documents(documents)

    @classmethod
    def params_schema(cls) -> list[dict]:
        return [
            {"name": "chunk_size", "type": "int", "default": 200, "description": "Chunk size in tokens"},
            {"name": "chunk_overlap", "type": "int", "default": 20, "description": "Overlap in tokens"},
            {
                "name": "encoding_name",
                "type": "enum",
                "default": "cl100k_base",
                "options": ["cl100k_base", "p50k_base", "r50k_base"],
                "description": "Tiktoken encoding",
            },
        ]
