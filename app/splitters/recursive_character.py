from langchain_text_splitters import RecursiveCharacterTextSplitter
from app.core.base import BaseSplitter
from app.core.registry import ComponentRegistry


@ComponentRegistry.register_splitter("recursive_character")
class RecursiveCharacterSplitter(BaseSplitter):
    name = "recursive_character"

    def __init__(self, chunk_size: int = 500, chunk_overlap: int = 50, separators: list[str] | None = None):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.separators = separators

    def split(self, documents: list) -> list:
        kwargs = {"chunk_size": self.chunk_size, "chunk_overlap": self.chunk_overlap}
        if self.separators:
            kwargs["separators"] = self.separators
        splitter = RecursiveCharacterTextSplitter(**kwargs)
        return splitter.split_documents(documents)

    @classmethod
    def params_schema(cls) -> list[dict]:
        return [
            {"name": "chunk_size", "type": "int", "default": 500, "description": "Maximum chunk size in characters"},
            {"name": "chunk_overlap", "type": "int", "default": 50, "description": "Overlap between chunks"},
        ]
