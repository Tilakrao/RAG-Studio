from app.core.base import BaseSplitter
from app.core.registry import ComponentRegistry


@ComponentRegistry.register_splitter("markdown_header")
class MarkdownHeaderSplitter(BaseSplitter):
    name = "markdown_header"

    def __init__(self, headers_to_split_on: list | None = None):
        self.headers_to_split_on = headers_to_split_on or [
            ("#", "h1"),
            ("##", "h2"),
            ("###", "h3"),
        ]

    def split(self, documents: list) -> list:
        from langchain_text_splitters import MarkdownHeaderTextSplitter
        splitter = MarkdownHeaderTextSplitter(
            headers_to_split_on=self.headers_to_split_on
        )
        result = []
        for doc in documents:
            content = doc.page_content if hasattr(doc, "page_content") else str(doc)
            try:
                splits = splitter.split_text(content)
                result.extend(splits)
            except Exception:
                result.append(doc)
        return result

    @classmethod
    def params_schema(cls) -> list[dict]:
        return []
