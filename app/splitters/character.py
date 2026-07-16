from langchain_text_splitters import CharacterTextSplitter
from app.core.base import BaseSplitter
from app.core.registry import ComponentRegistry


@ComponentRegistry.register_splitter("character")
class CharacterSplitter(BaseSplitter):
    name = "character"

    def __init__(self, separator: str = "\n\n", chunk_size: int = 500, chunk_overlap: int = 50):
        self.separator = separator
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap

    def split(self, documents: list) -> list:
        splitter = CharacterTextSplitter(
            separator=self.separator,
            chunk_size=self.chunk_size,
            chunk_overlap=self.chunk_overlap,
        )
        return splitter.split_documents(documents)

    @classmethod
    def params_schema(cls) -> list[dict]:
        return [
            {"name": "separator", "type": "str", "default": "\n\n", "description": "Separator string"},
            {"name": "chunk_size", "type": "int", "default": 500, "description": "Maximum chunk size"},
            {"name": "chunk_overlap", "type": "int", "default": 50, "description": "Overlap between chunks"},
        ]
