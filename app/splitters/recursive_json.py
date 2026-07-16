import json
import logging
from langchain_text_splitters import RecursiveJsonSplitter
from app.core.base import BaseSplitter
from app.core.registry import ComponentRegistry

logger = logging.getLogger(__name__)


@ComponentRegistry.register_splitter("recursive_json")
class RecursiveJsonSplitterWrapper(BaseSplitter):
    name = "recursive_json"

    def __init__(self, max_chunk_size: int = 300):
        self.max_chunk_size = max_chunk_size

    def split(self, documents: list) -> list:
        from langchain_core.documents import Document
        splitter = RecursiveJsonSplitter(max_chunk_size=self.max_chunk_size)
        result = []
        for doc in documents:
            content = doc.page_content if hasattr(doc, "page_content") else str(doc)
            try:
                data = json.loads(content)
                texts = splitter.split_text(json_data=data)
                for text in texts:
                    result.append(Document(page_content=text, metadata=getattr(doc, "metadata", {})))
            except (json.JSONDecodeError, Exception):
                # Not JSON content — wrap it and split as a simple dict
                try:
                    wrapped = {"content": content}
                    texts = splitter.split_text(json_data=wrapped)
                    for text in texts:
                        result.append(Document(page_content=text, metadata=getattr(doc, "metadata", {})))
                except Exception:
                    result.append(doc)
        return result

    @classmethod
    def params_schema(cls) -> list[dict]:
        return [
            {"name": "max_chunk_size", "type": "int", "default": 300, "description": "Maximum chunk size in characters"},
        ]
